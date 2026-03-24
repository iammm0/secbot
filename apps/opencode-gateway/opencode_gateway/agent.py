"""
ACP Agent implementation for secbot.

Bridges ACP protocol methods (initialize, newSession, prompt, cancel, etc.)
to secbot's SessionManager, translating between the two models.
"""
from __future__ import annotations

import asyncio
from typing import Any, Dict, List, Optional

from rich.console import Console

from core.session import SessionManager
from utils.event_bus import EventBus
from opencode_gateway.protocol import NDJsonTransport
from opencode_gateway.session import ACPSessionStore
from opencode_gateway.event_mapper import EventMapper
from opencode_adapters.plan_mode import PlanModeController, SessionMode
from opencode_adapters.permissions import (
    PermissionManager,
    PermissionCategory,
    PermissionDecision,
    PermissionRequest,
    categorize_tool,
)
from opencode_adapters.mcp_client import MCPManager, MCPServerConfig
from hackbot_config.mcp_config import load_mcp_configs, configs_to_server_list
from utils.logger import logger


class ACPAgent:
    """Secbot-side ACP agent that handles JSON-RPC requests from ACP clients."""

    VERSION = "0.1.0"

    def __init__(self, transport: NDJsonTransport, resolve_agent=None):
        self._transport = transport
        self._event_bus = EventBus()
        self._console = Console(force_terminal=False)
        self._store = ACPSessionStore()
        self._current_session_id: Optional[str] = None
        self._cancel_event: Optional[asyncio.Event] = None

        self._plan_mode = PlanModeController()
        self._permissions = PermissionManager()
        self._mcp = MCPManager()

        self._session_manager = SessionManager(
            event_bus=self._event_bus,
            console=self._console,
            resolve_agent=resolve_agent,
        )

        self._mapper = EventMapper(
            event_bus=self._event_bus,
            transport=self._transport,
            session_id_resolver=lambda: self._current_session_id,
        )

        self._register_handlers()

    def _register_handlers(self):
        self._transport.on_request("initialize", self._handle_initialize)
        self._transport.on_request("session/new", self._handle_new_session)
        self._transport.on_request("session/load", self._handle_load_session)
        self._transport.on_request("session/prompt", self._handle_prompt)
        self._transport.on_request("session/setMode", self._handle_set_mode)
        self._transport.on_request("session/list", self._handle_list_sessions)
        self._transport.on_request("session/planExit", self._handle_plan_exit)
        self._transport.on_request("mcp/status", self._handle_mcp_status)
        self._transport.on_request("mcp/add", self._handle_mcp_add)
        self._transport.on_notification("session/cancel", self._handle_cancel)

    async def _init_mcp_from_config(self, cwd: Optional[str] = None):
        """Load and connect MCP servers from config files."""
        try:
            raw = load_mcp_configs(cwd)
            configs = configs_to_server_list(raw)
            for cfg in configs:
                await self._mcp.add_server(cfg)
            names = self._mcp.get_tool_names()
            if names:
                logger.info(f"MCP tools loaded: {names}")
        except Exception as exc:
            logger.warning(f"MCP init error: {exc}")

    async def _init_mcp_from_params(self, mcp_servers: List[Dict[str, Any]]):
        """Load MCP servers from ACP session params (client-provided)."""
        for srv in mcp_servers:
            try:
                name = srv.get("name", "")
                if "url" in srv:
                    cfg = MCPServerConfig(
                        name=name,
                        type="remote",
                        url=srv["url"],
                        headers={h["name"]: h["value"] for h in srv.get("headers", [])},
                    )
                else:
                    cfg = MCPServerConfig(
                        name=name,
                        type="local",
                        command=[srv.get("command", "")] + srv.get("args", []),
                        environment={e["name"]: e["value"] for e in srv.get("env", [])},
                    )
                await self._mcp.add_server(cfg)
            except Exception as exc:
                logger.warning(f"MCP server add failed ({srv.get('name')}): {exc}")

    async def _handle_initialize(self, _method: str, params: Dict[str, Any]) -> Dict[str, Any]:
        logger.info(f"ACP initialize: protocolVersion={params.get('protocolVersion')}")
        return {
            "protocolVersion": 1,
            "agentCapabilities": {
                "loadSession": True,
                "promptCapabilities": {
                    "embeddedContext": False,
                    "image": False,
                },
                "sessionCapabilities": {
                    "list": {},
                },
            },
            "authMethods": [],
            "agentInfo": {
                "name": "secbot",
                "version": self.VERSION,
            },
        }

    async def _handle_new_session(self, _method: str, params: Dict[str, Any]) -> Dict[str, Any]:
        cwd = params.get("cwd", ".")
        agent_type = "secbot-cli"

        session = self._session_manager.new_session(agent_type=agent_type)
        self._store.create(session.id, cwd, agent_type=agent_type)
        self._current_session_id = session.id
        self._plan_mode.set_mode(session.id, SessionMode.AGENT)

        await self._init_mcp_from_config(cwd)
        mcp_servers = params.get("mcpServers", [])
        if mcp_servers:
            await self._init_mcp_from_params(mcp_servers)

        return {
            "sessionId": session.id,
            "models": {
                "currentModelId": "secbot/default",
                "availableModels": [{"modelId": "secbot/default", "name": "SecBot Default"}],
            },
            "modes": {
                "currentModeId": "agent",
                "availableModes": self._plan_mode.available_modes(),
            },
        }

    async def _handle_load_session(self, _method: str, params: Dict[str, Any]) -> Dict[str, Any]:
        session_id = params.get("sessionId", "")
        cwd = params.get("cwd", ".")

        existing = self._session_manager.sessions.get(session_id)
        if existing:
            self._session_manager.switch_session(session_id)
        else:
            existing = self._session_manager.new_session()

        state = self._store.get(session_id)
        if state is None:
            self._store.create(existing.id, cwd)

        self._current_session_id = existing.id

        current_mode = "agent"
        if state := self._store.get(existing.id):
            current_mode = state.mode

        return {
            "sessionId": existing.id,
            "models": {
                "currentModelId": "secbot/default",
                "availableModels": [{"modelId": "secbot/default", "name": "SecBot Default"}],
            },
            "modes": {
                "currentModeId": current_mode,
                "availableModes": self._plan_mode.available_modes(),
            },
        }

    async def _handle_prompt(self, _method: str, params: Dict[str, Any]) -> Dict[str, Any]:
        session_id = params.get("sessionId", "")
        prompt_parts = params.get("prompt", [])

        text_parts = [p.get("text", "") for p in prompt_parts if p.get("type") == "text"]
        user_input = "\n".join(text_parts).strip()

        if not user_input:
            return {"stopReason": "end_turn"}

        self._current_session_id = session_id
        self._cancel_event = asyncio.Event()

        mode = self._plan_mode.get_mode(session_id)
        mode_tools = None
        if mode == SessionMode.PLAN:
            mode_tools = list(self._plan_mode.filter_tools(
                session_id,
                self._get_all_tool_names(),
            ))
        elif mode == SessionMode.ASK:
            mode_tools = []

        try:
            if mode == SessionMode.ASK:
                await self._session_manager.handle_ask_message(user_input)
            elif mode == SessionMode.PLAN:
                await self._session_manager.handle_message(
                    user_input,
                    plan_only=True,
                    allowed_tools=mode_tools,
                )
            else:
                await self._session_manager.handle_message(
                    user_input,
                    force_agent_flow=True,
                )
        except asyncio.CancelledError:
            return {"stopReason": "cancelled"}
        except Exception as exc:
            logger.exception("ACP prompt error")
            await self._transport.send_notification(
                "sessionUpdate",
                {
                    "sessionId": session_id,
                    "update": {
                        "sessionUpdate": "agent_message_chunk",
                        "content": {"type": "text", "text": f"[Error] {exc}"},
                    },
                },
            )

        return {"stopReason": "end_turn"}

    async def _handle_set_mode(self, _method: str, params: Dict[str, Any]) -> Dict[str, Any]:
        session_id = params.get("sessionId", "")
        mode_id = params.get("modeId", "agent")

        try:
            mode = SessionMode(mode_id)
        except ValueError:
            raise ValueError(f"Unknown mode: {mode_id}")

        self._plan_mode.set_mode(session_id, mode)
        self._store.set_mode(session_id, mode_id)
        return {}

    async def _handle_plan_exit(self, _method: str, params: Dict[str, Any]) -> Dict[str, Any]:
        """Handle plan_exit: approve the pending plan and switch to agent mode."""
        session_id = params.get("sessionId", "")
        plan_text = params.get("planText", "")

        result = await self._plan_mode.exit_plan(session_id, plan_text)
        if result.success:
            self._store.set_mode(session_id, "agent")
            await self._session_manager.transition_plan_to_agent(plan_text)

        return {
            "success": result.success,
            "message": result.message,
            "newMode": result.new_mode.value,
        }

    async def _handle_list_sessions(self, _method: str, params: Dict[str, Any]) -> Dict[str, Any]:
        sessions = self._session_manager.list_sessions()
        entries = []
        for s in sessions:
            entries.append({
                "sessionId": s.id,
                "cwd": ".",
                "title": s.name,
                "updatedAt": s.created_at.isoformat() if hasattr(s, "created_at") else "",
            })
        return {"sessions": entries}

    async def _handle_mcp_status(self, _method: str, params: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "servers": self._mcp.get_status(),
            "tools": self._mcp.get_tool_names(),
        }

    async def _handle_mcp_add(self, _method: str, params: Dict[str, Any]) -> Dict[str, Any]:
        name = params.get("name", "")
        config = params.get("config", {})
        server_type = config.get("type", "local")
        if server_type == "local":
            command = config.get("command", [])
            if isinstance(command, str):
                command = command.split()
            cfg = MCPServerConfig(
                name=name,
                type="local",
                command=command,
                environment=config.get("environment", {}),
            )
        else:
            cfg = MCPServerConfig(
                name=name,
                type="remote",
                url=config.get("url", ""),
                headers=config.get("headers", {}),
            )
        await self._mcp.add_server(cfg)
        return {"status": self._mcp.get_status().get(name, "unknown")}

    async def _handle_cancel(self, _method: str, params: Dict[str, Any]):
        if self._cancel_event:
            self._cancel_event.set()
        logger.info(f"ACP cancel: session={params.get('sessionId')}")

    def _get_all_tool_names(self) -> List[str]:
        """Collect all known tool names from agent instances + MCP."""
        names: List[str] = []
        for agent in self._session_manager.agents.values():
            if hasattr(agent, "tools"):
                for t in agent.tools:
                    n = getattr(t, "name", None)
                    if n:
                        names.append(n)
        names.extend(self._mcp.get_tool_names())
        return list(set(names))
