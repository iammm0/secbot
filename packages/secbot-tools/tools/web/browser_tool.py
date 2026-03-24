"""Browser automation tool powered by secbot-browser-tools subprocess."""
from __future__ import annotations

import asyncio
from typing import Any, Dict

from opencode_adapters.browser_client import BrowserRpcClient
from tools.base import BaseTool, ToolResult


ACTION_TO_RPC = {
    "open": "browser_open",
    "snapshot": "browser_snapshot",
    "click": "browser_click",
    "fill": "browser_fill",
    "get": "browser_get",
    "screenshot": "browser_screenshot",
}


class BrowserTool(BaseTool):
    """Browser automation via agent-browser subprocess bridge."""

    sensitivity = "low"
    _client: BrowserRpcClient | None = None
    _client_lock = asyncio.Lock()

    def __init__(self):
        super().__init__(
            name="browser_tool",
            description=(
                "浏览器自动化工具（agent-browser）。"
                "参数: action(open/snapshot/click/fill/get/screenshot), args(对象)"
            ),
        )

    async def execute(self, **kwargs) -> ToolResult:
        action = kwargs.get("action", "")
        if action not in ACTION_TO_RPC:
            return ToolResult(success=False, result=None, error=f"不支持的 action: {action}")

        raw_args = kwargs.get("args", {})
        if raw_args is None:
            raw_args = {}
        if not isinstance(raw_args, dict):
            return ToolResult(success=False, result=None, error="args 必须是对象")

        try:
            client = await self._get_client()
            rpc_name = ACTION_TO_RPC[action]
            payload = await client.call_tool(rpc_name, raw_args)
            ok = bool(payload.get("success", True))
            return ToolResult(
                success=ok,
                result=payload.get("result"),
                error=payload.get("error", ""),
            )
        except Exception as exc:
            return ToolResult(success=False, result=None, error=str(exc))

    async def _get_client(self) -> BrowserRpcClient:
        async with self._client_lock:
            if self._client is None:
                self._client = BrowserRpcClient()
                await self._client.connect()
            return self._client

    def get_schema(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "sensitivity": self.sensitivity,
            "parameters": {
                "action": {
                    "type": "string",
                    "description": "浏览器动作",
                    "enum": list(ACTION_TO_RPC.keys()),
                    "required": True,
                },
                "args": {
                    "type": "object",
                    "description": "动作参数，按 action 不同而不同",
                    "required": False,
                },
            },
        }
