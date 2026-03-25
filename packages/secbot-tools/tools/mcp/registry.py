"""
Tool registry snapshot for MCP exposure.
"""
from __future__ import annotations

from typing import Dict, Iterable, List, Sequence

from tools.base import BaseTool
from tools.cloud import CLOUD_TOOLS
from tools.defense import DEFENSE_TOOLS
from tools.osint import OSINT_TOOLS
from tools.pentest.network import NETWORK_TOOLS
from tools.pentest.security import ADVANCED_SECURITY_TOOLS, ALL_SECURITY_TOOLS, BASIC_SECURITY_TOOLS
from tools.protocol import PROTOCOL_TOOLS
from tools.reporting import REPORTING_TOOLS
from tools.utility import UTILITY_TOOLS
from tools.web import WEB_TOOLS
from tools.web_research import WEB_RESEARCH_TOOLS


def _dedupe_by_name(tools: Iterable[BaseTool]) -> List[BaseTool]:
    seen = set()
    result: List[BaseTool] = []
    for tool in tools:
        if tool.name in seen:
            continue
        seen.add(tool.name)
        result.append(tool)
    return result


def _profile_map() -> Dict[str, Sequence[BaseTool]]:
    return {
        "basic": BASIC_SECURITY_TOOLS,
        "advanced": ADVANCED_SECURITY_TOOLS,
        "all": ALL_SECURITY_TOOLS,
        "network": NETWORK_TOOLS,
        "web": WEB_TOOLS,
        "osint": OSINT_TOOLS,
        "defense": DEFENSE_TOOLS,
        "utility": UTILITY_TOOLS,
        "protocol": PROTOCOL_TOOLS,
        "reporting": REPORTING_TOOLS,
        "cloud": CLOUD_TOOLS,
        "web_research": WEB_RESEARCH_TOOLS,
    }


def get_tools_for_profile(profile: str = "all") -> List[BaseTool]:
    """
    Return tools list for a profile.
    """
    p = (profile or "all").strip().lower()
    tools = _profile_map().get(p, _profile_map()["all"])
    return _dedupe_by_name(tools)


def get_tool_map(
    profile: str = "all",
    include: Sequence[str] | None = None,
    exclude: Sequence[str] | None = None,
) -> Dict[str, BaseTool]:
    """
    Build name -> tool map with optional include/exclude filters.
    """
    tools = get_tools_for_profile(profile)
    include_set = {x.strip() for x in (include or []) if x and x.strip()}
    exclude_set = {x.strip() for x in (exclude or []) if x and x.strip()}
    result: Dict[str, BaseTool] = {}
    for tool in tools:
        if include_set and tool.name not in include_set:
            continue
        if tool.name in exclude_set:
            continue
        result[tool.name] = tool
    return result

