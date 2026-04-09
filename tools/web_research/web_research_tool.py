"""
WebResearchTool：桥接工具，让主 Agent 可以委托 Web 研究任务给 WebResearchAgent 子 Agent。
也支持直接指定模式（search / extract / crawl / api）跳过子 Agent 的 ReAct 循环。
"""

from typing import Any, Dict
from tools.base import BaseTool, ToolResult
from utils.logger import logger


def _ensure_str(val: Any, default: str = "") -> str:
    """将参数规范为字符串：若为 dict 则取 city/query/q 或首个值，避免 'dict' has no attribute 'strip'"""
    if val is None:
        return default
    if isinstance(val, str):
        return (val or default).strip()
    if isinstance(val, dict):
        s = val.get("city") or val.get("query") or val.get("q") or (next(iter(val.values()), None) if val else None)
        return _ensure_str(s, default)
    return str(val).strip() if val else default


class WebResearchTool(BaseTool):
    """
    Web 研究桥接工具：将联网研究任务委托给 WebResearchAgent 子 Agent。
    支持两种用法:
      1. 自动研究模式 (mode=auto): 创建子 Agent 自主完成 搜索→爬取→总结 全流程
      2. 直接模式 (mode=search/extract/crawl/api): 跳过子 Agent，直接调用对应工具
    """

    sensitivity = "low"

    def __init__(self):
        super().__init__(
            name="web_research",
            description=(
                "联网研究工具：委托Web研究子Agent自主完成互联网信息收集。"
                "支持模式: auto(子Agent自主研究,默认), search(智能搜索), "
                "extract(网页提取), crawl(深度爬取), api(API调用)。"
                "参数: query(研究主题/搜索词), mode(auto/search/extract/crawl/api,默认auto), "
                "url(extract/crawl模式必需的目标URL), preset(api模式的内置模板名)"
            ),
        )

    async def execute(self, **kwargs) -> ToolResult:
        query = _ensure_str(kwargs.get("query"))
        mode = _ensure_str(kwargs.get("mode"), "auto").lower()
        url = _ensure_str(kwargs.get("url"))
        preset = _ensure_str(kwargs.get("preset"))

        if not query and mode == "auto":
            return ToolResult(
                success=False, result=None, error="缺少参数: query（研究主题）"
            )

        try:
            if mode == "auto":
                return await self._auto_research(query)
            elif mode == "search":
                return await self._direct_search(query, kwargs)
            elif mode == "extract":
                return await self._direct_extract(url, kwargs)
            elif mode == "crawl":
                return await self._direct_crawl(url, kwargs)
            elif mode == "api":
                return await self._direct_api(url, preset, query, kwargs)
            else:
                return ToolResult(
                    success=False,
                    result=None,
                    error=f"不支持的模式: {mode}，请使用 auto/search/extract/crawl/api",
                )
        except Exception as e:
            logger.error(f"WebResearchTool 错误: {e}")
            return ToolResult(success=False, result=None, error=str(e))

    # ------------------------------------------------------------------
    # 自动研究模式：创建子 Agent
    # ------------------------------------------------------------------

    async def _auto_research(self, query: str) -> ToolResult:
        """创建 WebResearchAgent 子 Agent 执行自主研究"""
        from secbot_agent.core.agents.web_research_agent import WebResearchAgent

        agent = WebResearchAgent(max_iterations=8)
        logger.info(f"[WebResearch] 创建子 Agent，研究主题: {query}")

        report = await agent.research(query)

        return ToolResult(
            success=True,
            result={
                "mode": "auto",
                "query": query,
                "report": report,
            },
        )

    # ------------------------------------------------------------------
    # 直接模式：跳过子 Agent，直接调用对应工具
    # ------------------------------------------------------------------

    async def _direct_search(self, query: str, kwargs: dict) -> ToolResult:
        """直接调用 SmartSearchTool"""
        if not query:
            return ToolResult(
                success=False, result=None, error="search 模式缺少 query 参数"
            )

        from tools.web_research.smart_search_tool import SmartSearchTool

        tool = SmartSearchTool()
        return await tool.execute(
            query=query,
            max_results=kwargs.get("max_results", 3),
            summarize=kwargs.get("summarize", True),
        )

    async def _direct_extract(self, url: str, kwargs: dict) -> ToolResult:
        """直接调用 PageExtractTool"""
        if not url:
            return ToolResult(
                success=False, result=None, error="extract 模式缺少 url 参数"
            )

        from tools.web_research.page_extract_tool import PageExtractTool

        tool = PageExtractTool()
        return await tool.execute(
            url=url,
            mode=kwargs.get("extract_mode", "text"),
            schema=kwargs.get("schema"),
            css_selector=kwargs.get("css_selector", ""),
        )

    async def _direct_crawl(self, url: str, kwargs: dict) -> ToolResult:
        """直接调用 DeepCrawlTool"""
        if not url:
            return ToolResult(
                success=False, result=None, error="crawl 模式缺少 url 参数"
            )

        from tools.web_research.deep_crawl_tool import DeepCrawlTool

        tool = DeepCrawlTool()
        return await tool.execute(
            start_url=url,
            max_depth=kwargs.get("max_depth", 2),
            max_pages=kwargs.get("max_pages", 10),
            url_pattern=kwargs.get("url_pattern", ""),
            extract_info=kwargs.get("extract_info", False),
            same_domain=kwargs.get("same_domain", True),
        )

    async def _direct_api(
        self, url: str, preset: str, query: str, kwargs: dict
    ) -> ToolResult:
        """直接调用 ApiClientTool"""
        if not url and not preset:
            return ToolResult(
                success=False,
                result=None,
                error="api 模式需要提供 url 或 preset 参数",
            )

        from tools.web_research.api_client_tool import ApiClientTool

        tool = ApiClientTool()
        return await tool.execute(
            url=url,
            preset=preset,
            query=query,
            method=kwargs.get("method", "GET"),
            headers=kwargs.get("headers", {}),
            params=kwargs.get("params", {}),
            body=kwargs.get("body"),
            auth_type=kwargs.get("auth_type", "none"),
            auth_value=kwargs.get("auth_value", ""),
            timeout=kwargs.get("timeout"),
        )

    def get_schema(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "sensitivity": self.sensitivity,
            "parameters": {
                "query": {
                    "type": "string",
                    "description": "研究主题/搜索关键词",
                    "required": True,
                },
                "mode": {
                    "type": "string",
                    "description": "模式: auto(子Agent自主研究) / search(智能搜索) / extract(网页提取) / crawl(深度爬取) / api(API调用)",
                    "default": "auto",
                },
                "url": {
                    "type": "string",
                    "description": "extract/crawl 模式的目标 URL",
                    "required": False,
                },
                "preset": {
                    "type": "string",
                    "description": "api 模式的内置模板名",
                    "required": False,
                },
                "max_results": {
                    "type": "integer",
                    "description": "search 模式的结果数量",
                    "default": 3,
                },
                "max_depth": {
                    "type": "integer",
                    "description": "crawl 模式的最大深度",
                    "default": 2,
                },
                "max_pages": {
                    "type": "integer",
                    "description": "crawl 模式的最大页面数",
                    "default": 10,
                },
                "headers": {
                    "type": "object",
                    "description": "api 模式下传递给 API 的自定义请求头",
                    "required": False,
                },
                "params": {
                    "type": "object",
                    "description": "api 模式下的 URL 查询参数",
                    "required": False,
                },
                "body": {
                    "type": "string",
                    "description": "api 模式下的请求体（字符串或 JSON 字符串）",
                    "required": False,
                },
                "auth_type": {
                    "type": "string",
                    "description": "api 模式下的认证类型: none/bearer/api_key",
                    "required": False,
                },
                "auth_value": {
                    "type": "string",
                    "description": "api 模式下的认证值（token 或 API key）",
                    "required": False,
                },
                "timeout": {
                    "type": "number",
                    "description": "api 模式下 API 调用的超时时间（秒）",
                    "required": False,
                },
            },
        }
