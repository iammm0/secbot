"""
Secbot built-in tools MCP server.

Supports:
- stdio JSON-RPC
- HTTP JSON-RPC (POST)
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Dict, Optional

from tools.base import BaseTool
from tools.mcp.adapter import call_tool, to_mcp_tool_def
from tools.mcp.registry import get_tool_map


@dataclass
class ServerOptions:
    profile: str = "all"
    include: tuple[str, ...] = ()
    exclude: tuple[str, ...] = ()


class MCPToolServer:
    def __init__(self, options: ServerOptions):
        self.options = options
        self.tools: Dict[str, BaseTool] = get_tool_map(
            profile=options.profile,
            include=options.include,
            exclude=options.exclude,
        )

    async def handle(self, req: Dict[str, Any]) -> Dict[str, Any]:
        req_id = req.get("id")
        method = req.get("method", "")
        params = req.get("params") or {}
        try:
            if method == "initialize":
                result = {
                    "serverInfo": {"name": "secbot-tools-mcp", "version": "0.1.0"},
                    "capabilities": {"tools": True},
                }
                return self._result(req_id, result)
            if method == "tools/list":
                result = {"tools": [to_mcp_tool_def(t) for t in self.tools.values()]}
                return self._result(req_id, result)
            if method == "tools/call":
                return await self._handle_call(req_id, params)
            return self._error(req_id, f"unsupported method: {method}")
        except Exception as exc:
            return self._error(req_id, str(exc))

    async def _handle_call(self, req_id: Any, params: Dict[str, Any]) -> Dict[str, Any]:
        name = params.get("name")
        arguments = params.get("arguments") or {}
        if not isinstance(name, str) or not name.strip():
            return self._error(req_id, "invalid tool name")
        tool = self.tools.get(name)
        if tool is None:
            return self._error(req_id, f"tool not found: {name}")
        result = await call_tool(tool, arguments if isinstance(arguments, dict) else {})
        return self._result(req_id, result)

    @staticmethod
    def _result(req_id: Any, result: Any) -> Dict[str, Any]:
        return {"jsonrpc": "2.0", "id": req_id, "result": result}

    @staticmethod
    def _error(req_id: Any, message: str) -> Dict[str, Any]:
        return {"jsonrpc": "2.0", "id": req_id, "error": {"code": -32000, "message": message}}


def _parse_csv_env(name: str) -> tuple[str, ...]:
    raw = os.getenv(name, "").strip()
    if not raw:
        return ()
    return tuple([x.strip() for x in raw.split(",") if x.strip()])


def _build_options(args: argparse.Namespace) -> ServerOptions:
    return ServerOptions(
        profile=(args.profile or os.getenv("SECBOT_TOOLS_MCP_PROFILE", "all")).strip(),
        include=_parse_csv_env("SECBOT_TOOLS_MCP_INCLUDE"),
        exclude=_parse_csv_env("SECBOT_TOOLS_MCP_EXCLUDE"),
    )


def run_stdio(server: MCPToolServer) -> None:
    for line in sys.stdin:
        text = line.strip()
        if not text:
            continue
        try:
            req = json.loads(text)
        except Exception:
            resp = {"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": "invalid json"}}
            sys.stdout.write(json.dumps(resp, ensure_ascii=False) + "\n")
            sys.stdout.flush()
            continue
        resp = asyncio.run(server.handle(req))
        sys.stdout.write(json.dumps(resp, ensure_ascii=False) + "\n")
        sys.stdout.flush()


def run_http(server: MCPToolServer, host: str, port: int) -> None:
    class _Handler(BaseHTTPRequestHandler):
        def do_POST(self):  # noqa: N802
            length = int(self.headers.get("Content-Length", "0"))
            body = self.rfile.read(length) if length > 0 else b"{}"
            try:
                req = json.loads(body.decode("utf-8"))
            except Exception:
                resp = {"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": "invalid json"}}
                data = json.dumps(resp, ensure_ascii=False).encode("utf-8")
                self.send_response(400)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
                return

            resp = asyncio.run(server.handle(req))
            data = json.dumps(resp, ensure_ascii=False).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self):  # noqa: N802
            data = b"secbot-tools-mcp\n"
            self.send_response(200)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def log_message(self, format: str, *args):  # noqa: A003
            return

    httpd = ThreadingHTTPServer((host, port), _Handler)
    httpd.serve_forever()


def main() -> None:
    parser = argparse.ArgumentParser(description="Secbot tools MCP server")
    parser.add_argument("--transport", choices=["stdio", "http"], default="stdio")
    parser.add_argument("--host", default=os.getenv("SECBOT_TOOLS_MCP_HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.getenv("SECBOT_TOOLS_MCP_PORT", "8765")))
    parser.add_argument("--profile", default=None)
    args = parser.parse_args()

    options = _build_options(args)
    server = MCPToolServer(options)
    if args.transport == "http":
        run_http(server, args.host, args.port)
    else:
        run_stdio(server)


if __name__ == "__main__":
    main()

