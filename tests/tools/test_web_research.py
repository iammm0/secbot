
import unittest
import asyncio
from unittest.mock import AsyncMock, patch
from tools.web_research.web_research_tool import WebResearchTool
from tools.base import ToolResult

class TestWebResearchTool(unittest.TestCase):
    def setUp(self):
        self.tool = WebResearchTool()

    def test_missing_query_auto_mode(self):
        async def run_test():
            result = await self.tool.execute(mode="auto")
            self.assertFalse(result.success)
            self.assertIn("缺少参数: query", result.error)
        asyncio.run(run_test())

    def test_auto_mode_delegation(self):
        async def run_test():
            # Mock _auto_research method
            with patch.object(self.tool, '_auto_research', new_callable=AsyncMock) as mock_method:
                mock_method.return_value = ToolResult(success=True, result="Auto Research Result")
                
                result = await self.tool.execute(query="test query", mode="auto")
                
                mock_method.assert_called_once_with("test query")
                self.assertTrue(result.success)
                self.assertEqual(result.result, "Auto Research Result")
        asyncio.run(run_test())

    def test_search_mode_delegation(self):
        async def run_test():
            # Mock _direct_search method
            with patch.object(self.tool, '_direct_search', new_callable=AsyncMock) as mock_method:
                mock_method.return_value = ToolResult(success=True, result="Search Result")
                
                kwargs = {"query": "test query", "mode": "search", "max_results": 5}
                result = await self.tool.execute(**kwargs)
                
                mock_method.assert_called_once()
                args, _ = mock_method.call_args
                self.assertEqual(args[0], "test query")
                self.assertEqual(args[1], kwargs)
                self.assertTrue(result.success)
        asyncio.run(run_test())

    def test_extract_mode_delegation(self):
        async def run_test():
            # Mock _direct_extract method
            with patch.object(self.tool, '_direct_extract', new_callable=AsyncMock) as mock_method:
                mock_method.return_value = ToolResult(success=True, result="Extract Result")
                
                kwargs = {"url": "http://example.com", "mode": "extract"}
                result = await self.tool.execute(**kwargs)
                
                mock_method.assert_called_once()
                args, _ = mock_method.call_args
                self.assertEqual(args[0], "http://example.com")
                self.assertEqual(args[1], kwargs)
                self.assertTrue(result.success)
        asyncio.run(run_test())
    
    def test_invalid_mode(self):
        async def run_test():
            result = await self.tool.execute(query="test", mode="invalid_mode")
            self.assertFalse(result.success)
            self.assertIn("不支持的模式", result.error)
        asyncio.run(run_test())

if __name__ == "__main__":
    unittest.main()
