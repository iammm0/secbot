
import unittest
import asyncio
from tools.base import BaseTool, ToolResult

class ConcreteTool(BaseTool):
    """用于测试的具体工具实现"""
    async def execute(self, **kwargs) -> ToolResult:
        return ToolResult(success=True, result=f"Executed with {kwargs}")

class TestBaseTool(unittest.TestCase):
    def setUp(self):
        self.tool = ConcreteTool(name="TestTool", description="A tool for testing.")

    def test_initialization(self):
        self.assertEqual(self.tool.name, "TestTool")
        self.assertEqual(self.tool.description, "A tool for testing.")

    def test_get_schema(self):
        schema = self.tool.get_schema()
        self.assertEqual(schema["name"], "TestTool")
        self.assertEqual(schema["description"], "A tool for testing.")
        self.assertIn("parameters", schema)

    def test_execute_async(self):
        async def run_test():
            result = await self.tool.execute(param="value")
            self.assertTrue(result.success)
            self.assertEqual(result.result, "Executed with {'param': 'value'}")
        
        asyncio.run(run_test())

if __name__ == "__main__":
    unittest.main()
