"""
网络搜索工具：通过 DuckDuckGo 进行真实网络搜索
"""
import asyncio
from typing import Any, Dict
from tools.base import BaseTool, ToolResult
from utils.logger import logger


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
            # 优先使用 duckduckgo-search 库
            try:
                return await self._search_duckduckgo(query, max_results)
            except ImportError:
                logger.warning("duckduckgo-search 未安装，尝试 HTML 抓取方式")

            # Fallback: 通过 DuckDuckGo HTML 页面抓取
            return await self._search_html_fallback(query, max_results)

        except Exception as e:
            logger.error(f"搜索工具错误: {e}")
            return ToolResult(success=False, result=None, error=str(e))

    async def _search_duckduckgo(self, query: str, max_results: int) -> ToolResult:
        """使用 duckduckgo-search 库搜索"""
        from duckduckgo_search import DDGS

        loop = asyncio.get_event_loop()

        def _search():
            with DDGS() as ddgs:
                results = list(ddgs.text(query, max_results=max_results))
            return results

        raw_results = await loop.run_in_executor(None, _search)

        results = []
        for r in raw_results:
            results.append({
                "title": r.get("title", ""),
                "url": r.get("href", r.get("link", "")),
                "snippet": r.get("body", r.get("snippet", "")),
            })

        return ToolResult(
            success=True,
            result={
                "query": query,
                "engine": "duckduckgo",
                "total": len(results),
                "results": results,
            },
        )

    async def _search_html_fallback(self, query: str, max_results: int) -> ToolResult:
        """通过 DuckDuckGo Lite HTML 页面抓取搜索结果"""
        import re
        from urllib.request import Request, urlopen
        from urllib.parse import quote_plus

        loop = asyncio.get_event_loop()

        def _fetch():
            url = f"https://lite.duckduckgo.com/lite/?q={quote_plus(query)}"
            req = Request(url)
            req.add_header("User-Agent", "Mozilla/5.0 (compatible; HackBot/1.0)")
            with urlopen(req, timeout=15) as resp:
                return resp.read().decode(errors="ignore")

        html = await loop.run_in_executor(None, _fetch)

        # 简单解析 DuckDuckGo Lite 结果
        results = []
        # 查找链接和摘要
        link_pattern = re.compile(
            r'<a[^>]+rel="nofollow"[^>]+href="([^"]+)"[^>]*>(.+?)</a>',
            re.DOTALL,
        )
        snippet_pattern = re.compile(
            r'<td[^>]*class="result-snippet"[^>]*>(.+?)</td>',
            re.DOTALL,
        )

        links = link_pattern.findall(html)
        snippets = snippet_pattern.findall(html)

        for i, (url, title) in enumerate(links[:max_results]):
            title_clean = re.sub(r"<[^>]+>", "", title).strip()
            snippet = ""
            if i < len(snippets):
                snippet = re.sub(r"<[^>]+>", "", snippets[i]).strip()
            if url.startswith("http"):
                results.append({
                    "title": title_clean,
                    "url": url,
                    "snippet": snippet,
                })

        return ToolResult(
            success=True,
            result={
                "query": query,
                "engine": "duckduckgo_lite",
                "total": len(results),
                "results": results,
            },
        )

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
