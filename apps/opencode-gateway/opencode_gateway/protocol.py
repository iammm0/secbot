"""
ND-JSON (newline-delimited JSON) transport for the ACP protocol.

Implements a JSON-RPC 2.0 style request/response/notification transport
over stdin/stdout, matching the @agentclientprotocol/sdk ndJsonStream format.
"""
from __future__ import annotations

import asyncio
import json
import sys
from typing import Any, Callable, Coroutine, Dict, Optional

from utils.logger import logger

RequestHandler = Callable[[str, Dict[str, Any]], Coroutine[Any, Any, Any]]
NotificationHandler = Callable[[str, Dict[str, Any]], Coroutine[Any, Any, None]]


class NDJsonTransport:
    """Async ND-JSON transport over stdin/stdout."""

    def __init__(self):
        self._request_handlers: Dict[str, RequestHandler] = {}
        self._notification_handlers: Dict[str, NotificationHandler] = {}
        self._writer_lock = asyncio.Lock()

    def on_request(self, method: str, handler: RequestHandler):
        self._request_handlers[method] = handler

    def on_notification(self, method: str, handler: NotificationHandler):
        self._notification_handlers[method] = handler

    async def send(self, msg: Dict[str, Any]):
        """Write a single JSON-RPC message to stdout."""
        async with self._writer_lock:
            line = json.dumps(msg, ensure_ascii=False) + "\n"
            sys.stdout.write(line)
            sys.stdout.flush()

    async def send_result(self, req_id: Any, result: Any):
        await self.send({"jsonrpc": "2.0", "id": req_id, "result": result})

    async def send_error(self, req_id: Any, code: int, message: str, data: Any = None):
        err: Dict[str, Any] = {"code": code, "message": message}
        if data is not None:
            err["data"] = data
        await self.send({"jsonrpc": "2.0", "id": req_id, "error": err})

    async def send_notification(self, method: str, params: Dict[str, Any]):
        await self.send({"jsonrpc": "2.0", "method": method, "params": params})

    async def run(self):
        """Read ND-JSON lines from stdin and dispatch."""
        while True:
            # Windows + Python 3.13 compatibility:
            # avoid connect_read_pipe(sys.stdin), which can fail under Proactor loop.
            line = await asyncio.to_thread(sys.stdin.buffer.readline)
            if not line:
                break
            text = line.decode("utf-8").strip()
            if not text:
                continue
            try:
                msg = json.loads(text)
            except json.JSONDecodeError:
                logger.warning(f"ACP: invalid JSON line: {text[:200]}")
                continue

            asyncio.create_task(self._dispatch(msg))

    async def _dispatch(self, msg: Dict[str, Any]):
        method = msg.get("method")
        params = msg.get("params", {})
        req_id = msg.get("id")

        if method is None:
            return

        if req_id is not None:
            handler = self._request_handlers.get(method)
            if handler is None:
                await self.send_error(req_id, -32601, f"Method not found: {method}")
                return
            try:
                result = await handler(method, params)
                await self.send_result(req_id, result)
            except Exception as exc:
                logger.exception(f"ACP request handler error: {method}")
                await self.send_error(req_id, -32000, str(exc))
        else:
            handler = self._notification_handlers.get(method)
            if handler:
                try:
                    await handler(method, params)
                except Exception:
                    logger.exception(f"ACP notification handler error: {method}")
