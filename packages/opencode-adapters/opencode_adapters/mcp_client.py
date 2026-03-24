"""
MCP client adapter for secbot.

Manages connections to MCP servers (local via stdio, remote via HTTP/SSE)
and converts MCP tools into secbot BaseTool instances for unified registration.
"""
from __future__ import annotations

import asyncio
import json
import subprocess
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Coroutine, Dict, List, Optional, Tuple

import httpx

from tools.base import BaseTool, ToolResult
from utils.logger import logger


class MCPServerType(str, Enum):
    LOCAL = "local"
    REMOTE = "remote"


class MCPServerStatus(str, Enum):
    CONNECTED = "connected"
    DISCONNECTED = "disconnected"
    FAILED = "failed"
    DISABLED = "disabled"


@dataclass
class MCPServerConfig:
    name: str
    type: MCPServerType
    command: Optional[List[str]] = None
    url: Optional[str] = None
    headers: Dict[str, str] = field(default_factory=dict)
    environment: Dict[str, str] = field(default_factory=dict)
    timeout: int = 30
    enabled: bool = True


@dataclass
class MCPToolDef:
    name: str
    description: str
    server_name: str
    input_schema: Dict[str, Any] = field(default_factory=dict)


class MCPConnection:
    """Manages a single MCP server connection."""

    def __init__(self, config: MCPServerConfig):
        self.config = config
        self.status = MCPServerStatus.DISCONNECTED
        self._tools: List[MCPToolDef] = []
        self._process: Optional[asyncio.subprocess.Process] = None
        self._request_id = 0
        self._pending: Dict[int, asyncio.Future] = {}
        self._read_task: Optional[asyncio.Task] = None
        self._http_client: Optional[httpx.AsyncClient] = None

    async def connect(self):
        try:
            if self.config.type == MCPServerType.LOCAL:
                await self._connect_local()
            else:
                await self._connect_remote()
            self.status = MCPServerStatus.CONNECTED
            await self._discover_tools()
        except Exception as exc:
            logger.error(f"MCP connect failed ({self.config.name}): {exc}")
            self.status = MCPServerStatus.FAILED

    async def disconnect(self):
        if self._process:
            try:
                self._process.terminate()
                await asyncio.wait_for(self._process.wait(), timeout=5)
            except Exception:
                self._process.kill()
            self._process = None
        if self._read_task:
            self._read_task.cancel()
            self._read_task = None
        if self._http_client:
            await self._http_client.aclose()
            self._http_client = None
        self.status = MCPServerStatus.DISCONNECTED

    @property
    def tools(self) -> List[MCPToolDef]:
        return list(self._tools)

    async def call_tool(self, tool_name: str, arguments: Dict[str, Any]) -> Any:
        if self.config.type == MCPServerType.LOCAL:
            return await self._call_local(tool_name, arguments)
        return await self._call_remote(tool_name, arguments)

    async def _connect_local(self):
        if not self.config.command:
            raise ValueError(f"No command for local MCP server: {self.config.name}")
        import os
        env = {**os.environ, **self.config.environment}
        self._process = await asyncio.create_subprocess_exec(
            *self.config.command,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env,
        )
        self._read_task = asyncio.create_task(self._read_local_loop())

        await self._send_local({
            "jsonrpc": "2.0",
            "id": self._next_id(),
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {"name": "secbot", "version": "1.0.0"},
            },
        })

    async def _connect_remote(self):
        if not self.config.url:
            raise ValueError(f"No URL for remote MCP server: {self.config.name}")
        self._http_client = httpx.AsyncClient(
            headers=self.config.headers,
            timeout=self.config.timeout,
        )

    async def _discover_tools(self):
        self._tools = []
        if self.config.type == MCPServerType.LOCAL:
            result = await self._send_local({
                "jsonrpc": "2.0",
                "id": self._next_id(),
                "method": "tools/list",
                "params": {},
            })
            for tool in (result or {}).get("tools", []):
                self._tools.append(MCPToolDef(
                    name=tool.get("name", ""),
                    description=tool.get("description", ""),
                    server_name=self.config.name,
                    input_schema=tool.get("inputSchema", {}),
                ))
        else:
            try:
                resp = await self._http_client.post(
                    self.config.url,
                    json={
                        "jsonrpc": "2.0",
                        "id": 1,
                        "method": "tools/list",
                        "params": {},
                    },
                )
                data = resp.json()
                for tool in data.get("result", {}).get("tools", []):
                    self._tools.append(MCPToolDef(
                        name=tool.get("name", ""),
                        description=tool.get("description", ""),
                        server_name=self.config.name,
                        input_schema=tool.get("inputSchema", {}),
                    ))
            except Exception as exc:
                logger.warning(f"MCP tool discovery failed ({self.config.name}): {exc}")

    async def _send_local(self, msg: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        if not self._process or not self._process.stdin:
            return None
        req_id = msg.get("id")
        line = json.dumps(msg) + "\n"
        self._process.stdin.write(line.encode())
        await self._process.stdin.drain()

        if req_id is not None:
            fut: asyncio.Future = asyncio.get_running_loop().create_future()
            self._pending[req_id] = fut
            try:
                return await asyncio.wait_for(fut, timeout=self.config.timeout)
            except asyncio.TimeoutError:
                self._pending.pop(req_id, None)
                raise TimeoutError(f"MCP request timed out: {msg.get('method')}")
        return None

    async def _read_local_loop(self):
        try:
            while self._process and self._process.stdout:
                line = await self._process.stdout.readline()
                if not line:
                    break
                try:
                    msg = json.loads(line.decode())
                except json.JSONDecodeError:
                    continue
                req_id = msg.get("id")
                if req_id is not None and req_id in self._pending:
                    fut = self._pending.pop(req_id)
                    if "error" in msg:
                        fut.set_exception(RuntimeError(msg["error"].get("message", "MCP error")))
                    else:
                        fut.set_result(msg.get("result"))
        except asyncio.CancelledError:
            pass
        except Exception as exc:
            logger.error(f"MCP read loop error ({self.config.name}): {exc}")

    async def _call_local(self, tool_name: str, arguments: Dict[str, Any]) -> Any:
        result = await self._send_local({
            "jsonrpc": "2.0",
            "id": self._next_id(),
            "method": "tools/call",
            "params": {"name": tool_name, "arguments": arguments},
        })
        return result

    async def _call_remote(self, tool_name: str, arguments: Dict[str, Any]) -> Any:
        if not self._http_client:
            raise RuntimeError(f"Not connected to remote MCP: {self.config.name}")
        resp = await self._http_client.post(
            self.config.url,
            json={
                "jsonrpc": "2.0",
                "id": self._next_id(),
                "method": "tools/call",
                "params": {"name": tool_name, "arguments": arguments},
            },
        )
        data = resp.json()
        if "error" in data:
            raise RuntimeError(data["error"].get("message", "MCP error"))
        return data.get("result")

    def _next_id(self) -> int:
        self._request_id += 1
        return self._request_id


class MCPToolWrapper(BaseTool):
    """Wraps an MCP tool as a secbot BaseTool for unified registration."""

    def __init__(self, tool_def: MCPToolDef, connection: MCPConnection):
        sanitized = f"{tool_def.server_name}_{tool_def.name}".replace("-", "_").replace(".", "_")
        super().__init__(
            name=sanitized,
            description=f"[MCP:{tool_def.server_name}] {tool_def.description}",
        )
        self._tool_def = tool_def
        self._connection = connection

    async def execute(self, **kwargs) -> ToolResult:
        try:
            result = await self._connection.call_tool(self._tool_def.name, kwargs)
            content = result if isinstance(result, str) else json.dumps(result, ensure_ascii=False, default=str)
            return ToolResult(success=True, result=content)
        except Exception as exc:
            logger.error(f"MCP tool {self.name} error: {exc}")
            return ToolResult(success=False, result=None, error=str(exc))

    def get_schema(self) -> dict:
        return {
            "name": self.name,
            "description": self.description,
            "parameters": self._tool_def.input_schema.get("properties", {}),
        }


class MCPManager:
    """
    Central manager for all MCP server connections.

    Handles lifecycle (connect/disconnect), tool discovery,
    and conversion of MCP tools to secbot BaseTool instances.
    """

    def __init__(self):
        self._connections: Dict[str, MCPConnection] = {}

    async def add_server(self, config: MCPServerConfig):
        if config.name in self._connections:
            await self.remove_server(config.name)
        conn = MCPConnection(config)
        self._connections[config.name] = conn
        if config.enabled:
            await conn.connect()

    async def remove_server(self, name: str):
        conn = self._connections.pop(name, None)
        if conn:
            await conn.disconnect()

    async def connect(self, name: str):
        conn = self._connections.get(name)
        if conn:
            await conn.connect()

    async def disconnect(self, name: str):
        conn = self._connections.get(name)
        if conn:
            await conn.disconnect()

    def get_status(self) -> Dict[str, str]:
        return {name: conn.status.value for name, conn in self._connections.items()}

    def get_all_tools(self) -> List[BaseTool]:
        """Returns all discovered MCP tools as secbot BaseTool instances."""
        tools: List[BaseTool] = []
        for conn in self._connections.values():
            if conn.status == MCPServerStatus.CONNECTED:
                for tool_def in conn.tools:
                    tools.append(MCPToolWrapper(tool_def, conn))
        return tools

    def get_tool_names(self) -> List[str]:
        return [t.name for t in self.get_all_tools()]

    async def shutdown(self):
        for conn in list(self._connections.values()):
            await conn.disconnect()
        self._connections.clear()
