"""
Browser tools subprocess client for secbot.

Connects to packages/secbot-browser-tools stdio JSON-RPC server and exposes
`tools/list` + `tools/call` helpers for Python tools.
"""
from __future__ import annotations

import asyncio
import json
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

from utils.logger import logger


@dataclass
class BrowserClientConfig:
    command: List[str] = field(default_factory=list)
    timeout: int = 45
    environment: Dict[str, str] = field(default_factory=dict)

    @classmethod
    def from_env(cls) -> "BrowserClientConfig":
        env_cmd = os.environ.get("SECBOT_BROWSER_TOOLS_CMD", "").strip()
        if env_cmd:
            return cls(command=env_cmd.split())
        return cls()


class BrowserRpcClient:
    def __init__(self, config: Optional[BrowserClientConfig] = None):
        self.config = config or BrowserClientConfig.from_env()
        self._process: Optional[asyncio.subprocess.Process] = None
        self._request_id = 0
        self._pending: Dict[int, asyncio.Future] = {}
        self._read_task: Optional[asyncio.Task] = None
        self._write_lock = asyncio.Lock()

    async def connect(self):
        if self._process is not None:
            return
        command = self.config.command or self._resolve_default_command()
        env = {**os.environ, **self.config.environment}
        self._process = await asyncio.create_subprocess_exec(
            *command,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env,
        )
        self._read_task = asyncio.create_task(self._read_loop())
        await self._request("initialize", {"clientInfo": {"name": "secbot", "version": "1.0.0"}})
        logger.info("BrowserRpcClient connected")

    async def disconnect(self):
        for req_id, fut in list(self._pending.items()):
            if not fut.done():
                fut.set_exception(RuntimeError("browser rpc client disconnected"))
            self._pending.pop(req_id, None)

        if self._read_task:
            self._read_task.cancel()
            self._read_task = None

        if self._process:
            try:
                self._process.terminate()
                await asyncio.wait_for(self._process.wait(), timeout=3)
            except Exception:
                self._process.kill()
            self._process = None
        logger.info("BrowserRpcClient disconnected")

    async def list_tools(self) -> List[Dict[str, Any]]:
        result = await self._request("tools/list", {})
        return (result or {}).get("tools", [])

    async def call_tool(self, name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
        result = await self._request("tools/call", {"name": name, "arguments": arguments})
        if isinstance(result, dict):
            return result
        return {"success": True, "result": result}

    async def _request(self, method: str, params: Dict[str, Any]) -> Any:
        if self._process is None:
            await self.connect()
        if self._process is None or self._process.stdin is None:
            raise RuntimeError("browser rpc process is not available")

        req_id = self._next_id()
        message = {"jsonrpc": "2.0", "id": req_id, "method": method, "params": params}
        line = json.dumps(message, ensure_ascii=False) + "\n"

        loop = asyncio.get_running_loop()
        fut: asyncio.Future = loop.create_future()
        self._pending[req_id] = fut

        async with self._write_lock:
            self._process.stdin.write(line.encode("utf-8"))
            await self._process.stdin.drain()

        try:
            return await asyncio.wait_for(fut, timeout=self.config.timeout)
        except asyncio.TimeoutError as exc:
            self._pending.pop(req_id, None)
            raise TimeoutError(f"browser rpc timeout: {method}") from exc

    async def _read_loop(self):
        try:
            while self._process and self._process.stdout:
                line = await self._process.stdout.readline()
                if not line:
                    break
                try:
                    msg = json.loads(line.decode("utf-8", errors="replace"))
                except json.JSONDecodeError:
                    continue
                req_id = msg.get("id")
                if req_id is None:
                    continue
                fut = self._pending.pop(req_id, None)
                if fut is None:
                    continue
                if "error" in msg:
                    error = msg["error"] or {}
                    fut.set_exception(RuntimeError(error.get("message", "browser rpc error")))
                else:
                    fut.set_result(msg.get("result"))
        except asyncio.CancelledError:
            pass
        except Exception as exc:
            logger.error(f"BrowserRpcClient read loop error: {exc}")
        finally:
            for req_id, fut in list(self._pending.items()):
                if not fut.done():
                    fut.set_exception(RuntimeError("browser rpc read loop stopped"))
                self._pending.pop(req_id, None)

    def _resolve_default_command(self) -> List[str]:
        root = Path(__file__).resolve().parents[3]
        dist_server = root / "packages" / "secbot-browser-tools" / "dist" / "server.js"
        src_server = root / "packages" / "secbot-browser-tools" / "src" / "server.ts"
        if dist_server.exists():
            return ["node", str(dist_server)]
        if src_server.exists():
            return ["npx", "tsx", str(src_server)]
        raise FileNotFoundError(
            "Cannot find secbot-browser-tools server. Run npm install/build in packages/secbot-browser-tools."
        )

    def _next_id(self) -> int:
        self._request_id += 1
        return self._request_id
