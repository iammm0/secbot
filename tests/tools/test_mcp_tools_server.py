import asyncio

from tools.base import BaseTool, ToolResult
from tools.mcp.adapter import call_tool, to_mcp_tool_def
from tools.mcp.registry import get_tool_map, get_tools_for_profile
from tools.mcp.server import MCPToolServer, ServerOptions


class _DummyTool(BaseTool):
    async def execute(self, **kwargs) -> ToolResult:
        if kwargs.get("fail"):
            return ToolResult(success=False, result=None, error="dummy failed")
        return ToolResult(success=True, result={"echo": kwargs})

    def get_schema(self):
        return {
            "name": self.name,
            "description": self.description,
            "parameters": {
                "q": {"type": "string", "description": "query", "required": True},
                "limit": {"type": "integer", "description": "max items", "default": 10},
            },
        }


def test_registry_profiles_have_tools():
    basic = get_tools_for_profile("basic")
    all_tools = get_tools_for_profile("all")
    assert basic, "basic profile should not be empty"
    assert all_tools, "all profile should not be empty"
    assert "port_scan" in [t.name for t in all_tools]

    tool_map = get_tool_map(profile="all", include=["port_scan", "hash_tool"])
    assert "port_scan" in tool_map
    assert "hash_tool" in tool_map


def test_adapter_schema_and_call():
    tool = _DummyTool(name="dummy_tool", description="dummy")
    mcp_def = to_mcp_tool_def(tool)
    assert mcp_def["name"] == "dummy_tool"
    assert "inputSchema" in mcp_def
    assert "q" in mcp_def["inputSchema"]["properties"]

    ok = asyncio.run(call_tool(tool, {"q": "abc"}))
    assert ok["isError"] is False
    assert ok["content"][0]["type"] == "text"

    failed = asyncio.run(call_tool(tool, {"fail": True}))
    assert failed["isError"] is True


def test_server_methods():
    server = MCPToolServer(ServerOptions(profile="basic"))

    init_res = asyncio.run(server.handle({"jsonrpc": "2.0", "id": 1, "method": "initialize"}))
    assert "result" in init_res
    assert init_res["result"]["capabilities"]["tools"] is True

    list_res = asyncio.run(server.handle({"jsonrpc": "2.0", "id": 2, "method": "tools/list"}))
    tools = list_res["result"]["tools"]
    assert isinstance(tools, list)
    assert len(tools) > 0

    call_res = asyncio.run(
        server.handle(
            {
                "jsonrpc": "2.0",
                "id": 3,
                "method": "tools/call",
                "params": {"name": "hash_tool", "arguments": {"action": "hash", "text": "hello"}},
            }
        )
    )
    assert "result" in call_res
    assert call_res["result"]["isError"] is False
