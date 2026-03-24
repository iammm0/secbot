"""
Agent registry: defines AgentInfo and built-in agent configurations.

Each mode (build/plan/ask) maps to a primary Agent with defined permissions,
tool sets, and transition rules.  Sub-agents (explore/general) can be
delegated to by primary agents for specialised tasks.

Design reference: opencode Agent.Info (packages/opencode/src/agent/agent.ts)
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, FrozenSet, List, Literal, Optional, Set


class AgentMode(str, Enum):
    PRIMARY = "primary"
    SUBAGENT = "subagent"


@dataclass(frozen=True)
class AgentInfo:
    """Immutable descriptor for a registered agent."""

    name: str
    description: str
    mode: AgentMode
    read_only: bool = False
    allowed_tools: Optional[FrozenSet[str]] = None  # None = all tools allowed
    denied_tools: FrozenSet[str] = field(default_factory=frozenset)
    max_steps: Optional[int] = None
    can_delegate: bool = False
    hidden: bool = False
    system_prompt_key: Optional[str] = None


# ---------------------------------------------------------------------------
# Built-in agents
# ---------------------------------------------------------------------------

_READ_ONLY_TOOLS: FrozenSet[str] = frozenset({
    "smart_search",
    "deep_crawl",
    "recon",
    "cve_lookup",
    "read_file",
    "file_analysis",
    "list_directory",
})

_EXPLORE_TOOLS: FrozenSet[str] = frozenset({
    "smart_search",
    "deep_crawl",
    "recon",
    "cve_lookup",
    "read_file",
    "file_analysis",
    "list_directory",
    "webfetch",
    "websearch",
})

_GENERAL_DENIED: FrozenSet[str] = frozenset({
    "todoread",
    "todowrite",
})

BUILTIN_AGENTS: Dict[str, AgentInfo] = {
    "build": AgentInfo(
        name="build",
        description="默认主模式（任务模式）。拥有完整权限，适合执行安全测试、漏洞利用验证与报告生成。",
        mode=AgentMode.PRIMARY,
        read_only=False,
        allowed_tools=None,
        can_delegate=True,
        system_prompt_key="build",
    ),
    "plan": AgentInfo(
        name="plan",
        description="规划模式。只读，仅用于多角度探索、风险分析与策略制定，不执行任何修改操作。",
        mode=AgentMode.PRIMARY,
        read_only=True,
        allowed_tools=_READ_ONLY_TOOLS,
        can_delegate=True,
        system_prompt_key="plan",
    ),
    "ask": AgentInfo(
        name="ask",
        description="询问模式。仅回答问题，不调用工具、不执行操作。",
        mode=AgentMode.PRIMARY,
        read_only=True,
        allowed_tools=frozenset(),
        can_delegate=False,
        system_prompt_key="ask",
    ),
    "explore": AgentInfo(
        name="explore",
        description="代码/系统探索子代理。只读，快速定位文件、搜索代码、收集信息。",
        mode=AgentMode.SUBAGENT,
        read_only=True,
        allowed_tools=_EXPLORE_TOOLS,
        can_delegate=False,
        hidden=True,
        system_prompt_key="explore",
    ),
    "general": AgentInfo(
        name="general",
        description="通用研究子代理。适合复杂检索与多步分析任务，支持并行工作单元。",
        mode=AgentMode.SUBAGENT,
        read_only=True,
        denied_tools=_GENERAL_DENIED,
        can_delegate=False,
        hidden=True,
        system_prompt_key="general",
    ),
}


class AgentRegistry:
    """Registry that holds all known agents and supports lookup / filtering."""

    def __init__(self):
        self._agents: Dict[str, AgentInfo] = dict(BUILTIN_AGENTS)

    def get(self, name: str) -> Optional[AgentInfo]:
        return self._agents.get(name)

    def require(self, name: str) -> AgentInfo:
        info = self._agents.get(name)
        if info is None:
            raise ValueError(f"Unknown agent: {name}. Available: {list(self._agents)}")
        return info

    def register(self, info: AgentInfo):
        self._agents[info.name] = info

    def list_all(self) -> List[AgentInfo]:
        return list(self._agents.values())

    def list_primary(self) -> List[AgentInfo]:
        return [a for a in self._agents.values() if a.mode == AgentMode.PRIMARY]

    def list_subagents(self) -> List[AgentInfo]:
        return [a for a in self._agents.values() if a.mode == AgentMode.SUBAGENT]

    def list_visible(self) -> List[AgentInfo]:
        return [a for a in self._agents.values() if not a.hidden]

    def default_agent(self) -> AgentInfo:
        """Return the default primary agent (build)."""
        return self._agents["build"]

    def is_tool_allowed(self, agent_name: str, tool_name: str) -> bool:
        """Check whether *tool_name* is permitted for *agent_name*."""
        info = self._agents.get(agent_name)
        if info is None:
            return False
        if tool_name in info.denied_tools:
            return False
        if info.allowed_tools is not None:
            return tool_name in info.allowed_tools
        return True

    def filter_tools(self, agent_name: str, tool_names: List[str]) -> List[str]:
        """Return the subset of *tool_names* allowed for *agent_name*."""
        return [t for t in tool_names if self.is_tool_allowed(agent_name, t)]
