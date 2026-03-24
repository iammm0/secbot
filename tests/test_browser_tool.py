import pytest


class _FakeClient:
    async def call_tool(self, name, arguments):
        return {
            "success": True,
            "result": {"tool": name, "arguments": arguments},
            "error": "",
        }


@pytest.mark.asyncio
async def test_browser_tool_execute_success():
    from tools.web.browser_tool import BrowserTool

    tool = BrowserTool()
    tool._client = _FakeClient()

    result = await tool.execute(action="open", args={"url": "https://example.com"})
    assert result.success is True
    assert result.result["tool"] == "browser_open"
    assert result.result["arguments"]["url"] == "https://example.com"


@pytest.mark.asyncio
async def test_browser_tool_reject_invalid_action():
    from tools.web.browser_tool import BrowserTool

    tool = BrowserTool()
    result = await tool.execute(action="invalid", args={})
    assert result.success is False
    assert "不支持的 action" in result.error


@pytest.mark.asyncio
async def test_browser_tool_reject_invalid_args():
    from tools.web.browser_tool import BrowserTool

    tool = BrowserTool()
    result = await tool.execute(action="open", args="bad")
    assert result.success is False
    assert "args 必须是对象" in result.error
