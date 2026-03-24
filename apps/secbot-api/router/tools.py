"""
安全测试工具路由 — 列出 Secbot 集成的安全测试工具（数量、种类、详情）
"""

from fastapi import APIRouter

from tools.pentest.security import (
    CORE_SECURITY_TOOLS,
    ADVANCED_SECURITY_TOOLS,
    ALL_SECURITY_TOOLS,
)
from tools.pentest.network import NETWORK_TOOLS
from tools.defense import DEFENSE_TOOLS
from tools.utility import UTILITY_TOOLS
from tools.web import WEB_TOOLS
from tools.osint import OSINT_TOOLS
from tools.protocol import PROTOCOL_TOOLS
from tools.reporting import REPORTING_TOOLS
from tools.cloud import CLOUD_TOOLS
from tools.offense.control import TerminalSessionTool
from crawler import CrawlerTool
from tools.web_research import WEB_RESEARCH_TOOLS

router = APIRouter(prefix="/api/tools", tags=["Tools"])

# 工具种类与对应列表（用于分类统计）
_CATEGORIES = [
    ("core", "核心安全", CORE_SECURITY_TOOLS),
    ("network", "网络探测", NETWORK_TOOLS),
    ("defense", "防御监控", DEFENSE_TOOLS),
    ("utility", "实用工具", UTILITY_TOOLS),
    ("web", "Web 安全", WEB_TOOLS),
    ("osint", "OSINT", OSINT_TOOLS),
    ("protocol", "协议探测", PROTOCOL_TOOLS),
    ("reporting", "报告", REPORTING_TOOLS),
    ("cloud", "云安全", CLOUD_TOOLS),
    ("control", "系统控制", [TerminalSessionTool(), CrawlerTool()]),
    ("web_research", "Web 研究", WEB_RESEARCH_TOOLS),
    ("advanced", "高级（需确认）", ADVANCED_SECURITY_TOOLS),
]


@router.get("", summary="列出安全测试工具")
async def list_tools():
    """
    列出 Secbot 中集成的全部安全测试工具。
    返回：总数、各类数量、按种类分组的工具列表。
    """
    categories_out = []
    tools_flat = []

    for cat_id, cat_name, tool_list in _CATEGORIES:
        items = [
            {"name": t.name, "description": t.description}
            for t in tool_list
        ]
        categories_out.append({
            "id": cat_id,
            "name": cat_name,
            "count": len(items),
            "tools": items,
        })
        tools_flat.extend([{**item, "category": cat_name} for item in items])

    basic_count = len(ALL_SECURITY_TOOLS) - len(ADVANCED_SECURITY_TOOLS)
    advanced_count = len(ADVANCED_SECURITY_TOOLS)

    return {
        "total": len(ALL_SECURITY_TOOLS),
        "basic_count": basic_count,
        "advanced_count": advanced_count,
        "categories": categories_out,
        "tools": tools_flat,
    }
