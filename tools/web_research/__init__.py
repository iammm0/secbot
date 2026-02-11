"""
Web 研究工具包
提供智能搜索、网页提取、深度爬取、API 交互等联网能力，
并通过 WebResearchTool 桥接工具让主 Agent 可委托给 WebResearchAgent 子 Agent。
"""
from tools.web_research.smart_search_tool import SmartSearchTool
from tools.web_research.page_extract_tool import PageExtractTool
from tools.web_research.deep_crawl_tool import DeepCrawlTool
from tools.web_research.api_client_tool import ApiClientTool
from tools.web_research.web_research_tool import WebResearchTool

# 所有 Web 研究工具（子工具 + 桥接工具）
WEB_RESEARCH_TOOLS = [
    SmartSearchTool(),
    PageExtractTool(),
    DeepCrawlTool(),
    ApiClientTool(),
    WebResearchTool(),
]

__all__ = [
    "SmartSearchTool",
    "PageExtractTool",
    "DeepCrawlTool",
    "ApiClientTool",
    "WebResearchTool",
    "WEB_RESEARCH_TOOLS",
]
