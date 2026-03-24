"""
网络搜索工具：通过 DuckDuckGo 进行真实网络搜索
基于 ddgs / duckduckgo-search 库，失败时回退到 HTML 抓取
"""
from typing import Any, Dict
from tools.base import BaseTool, ToolResult
from tools.web_search_ddgs import search


class WebSearchTool(BaseTool):
    """网络搜索工具（DuckDuckGo）"""

    sensitivity = "low"

    def __init__(self):
        super().__init__(
            name="web_search",
            description=(
                "在互联网上搜索信息，返回相关网页标题、摘要和链接。"
                "参数: query(搜索关键词), max_results(返回数量,默认5)"
            ),
        )

    async def execute(self, **kwargs) -> ToolResult:
        query = kwargs.get("query", "").strip()
        if not query:
            return ToolResult(success=False, result=None, error="缺少参数: query")

        max_results = int(kwargs.get("max_results", 5))

        try:
            results, engine = await search(query, max_results)
            return ToolResult(
                success=True,
                result={
                    "query": query,
                    "engine": engine,
                    "total": len(results),
                    "results": results,
                },
            )
        except Exception as e:
            return ToolResult(success=False, result=None, error=str(e))

    def get_schema(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "sensitivity": self.sensitivity,
            "parameters": {
                "query": {"type": "string", "description": "搜索关键词", "required": True},
                "max_results": {"type": "integer", "description": "返回结果数量（默认 5）", "required": False},
            },
        }
