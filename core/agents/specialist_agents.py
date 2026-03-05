"""
专职子 Agent 定义：
- NetworkReconAgent：网络资产枚举与基础探测
- WebPentestAgent：Web 站点 / API 安全测试
- OSINTAgent：外部情报 / 资产信息收集
- TerminalOpsAgent：授权主机上的终端操作
- DefenseMonitorAgent：本机 / 网络防御与巡检

这些 Agent 统一复用 SecurityReActAgent 的 ReAct 能力，但挂载各自专属的工具集，
并通过 agent_type 字段在事件流中标记来源，便于前端按 Agent 维度渲染。
"""

from __future__ import annotations

from typing import Optional, List

from core.agents.base import BaseAgent
from core.patterns.security_react import SecurityReActAgent
from tools.base import BaseTool
from tools.pentest.security import (
    CORE_SECURITY_TOOLS,
    NETWORK_TOOLS,
    WEB_TOOLS,
    OSINT_TOOLS,
    DEFENSE_TOOLS,
)
from tools.offense.control.terminal_tool import TerminalSessionTool
from tools.web_research import WEB_RESEARCH_TOOLS
from utils.audit import AuditTrail


class _SpecializedSecurityAgent(SecurityReActAgent):
    """
    专职安全子 Agent 基类：
    - 继承 SecurityReActAgent，保留完整 ReAct 能力
    - 约定 agent_type 作为事件流中的来源标记
    """

    def __init__(
        self,
        name: str,
        agent_type: str,
        system_prompt: str,
        tools: List[BaseTool],
        audit_trail: Optional[AuditTrail] = None,
        event_bus=None,
        max_iterations: int = 8,
    ):
        super().__init__(
            name=name,
            system_prompt=system_prompt,
            tools=list(tools),
            auto_execute=True,
            max_iterations=max_iterations,
            audit_trail=audit_trail,
            event_bus=event_bus,
        )
        # 供事件流 / 上层协调器标记来源使用
        self.agent_type: str = agent_type


# ---------------------------------------------------------------------------
# NetworkReconAgent
# ---------------------------------------------------------------------------

NETWORK_RECON_SYSTEM_PROMPT = """你是 NetworkReconAgent，负责网络攻击面的发现与基础风险评估。

【职责】
- 基于授权目标执行端口扫描、服务识别、主机/子网发现等操作
- 汇总网络攻击面：开放端口、关键服务、可疑暴露面
- 为后续 Web 渗透、防御巡检提供「网络侧」情报基础

【工具集】
- CORE_SECURITY_TOOLS: 端口扫描 / 服务识别 / 基础信息收集
- NETWORK_TOOLS: 子网发现、主机存活探测、路由追踪等

输出时请聚焦：哪些主机/端口/服务值得进一步关注，以及它们可能带来的风险。"""


class NetworkReconAgent(_SpecializedSecurityAgent):
    def __init__(
        self,
        audit_trail: Optional[AuditTrail] = None,
        event_bus=None,
    ):
        tools: List[BaseTool] = list(CORE_SECURITY_TOOLS) + list(NETWORK_TOOLS)
        super().__init__(
            name="NetworkReconAgent",
            agent_type="network_recon",
            system_prompt=NETWORK_RECON_SYSTEM_PROMPT,
            tools=tools,
            audit_trail=audit_trail,
            event_bus=event_bus,
            max_iterations=8,
        )


# ---------------------------------------------------------------------------
# WebPentestAgent
# ---------------------------------------------------------------------------

WEB_PENTEST_SYSTEM_PROMPT = """你是 WebPentestAgent，专注 Web 站点与 API 的基础安全测试。

【职责】
- 针对授权的 Web 资产执行目录枚举、指纹识别、基础安全检查
- 关注常见弱点：目录暴露、弱证书、危险 HTTP 头、CORS 配置等
- 为更深入的人工渗透或高危测试提供前置信息

【工具集】
- WEB_TOOLS: 目录爆破、WAF 检测、技术栈识别、Header 分析、简单漏洞探测等

输出时请以「目标站点当前暴露面与基础风险」为核心进行描述。"""


class WebPentestAgent(_SpecializedSecurityAgent):
    def __init__(
        self,
        audit_trail: Optional[AuditTrail] = None,
        event_bus=None,
    ):
        tools: List[BaseTool] = list(WEB_TOOLS)
        super().__init__(
            name="WebPentestAgent",
            agent_type="web_pentest",
            system_prompt=WEB_PENTEST_SYSTEM_PROMPT,
            tools=tools,
            audit_trail=audit_trail,
            event_bus=event_bus,
            max_iterations=8,
        )


# ---------------------------------------------------------------------------
# OSINTAgent
# ---------------------------------------------------------------------------

OSINT_SYSTEM_PROMPT = """你是 OSINTAgent，负责外部情报与资产信息收集。

【职责】
- 结合 OSINT 与 WebResearch 工具，对域名、IP、组织名等进行公开情报查询
- 关注暴露资产、历史泄露、恶意情报等
- 为 NetworkRecon / WebPentest 提供「外部视角」的补充信息

【工具集】
- OSINT_TOOLS: Shodan / VirusTotal 等外部情报数据源（需预先配置 API Key）
- WEB_RESEARCH_TOOLS: smart_search / page_extract / deep_crawl / api_client 等通用联网工具

输出时请注意标注信息来源，区分「已验证」与「可能性」结论。"""


class OSINTAgent(_SpecializedSecurityAgent):
    def __init__(
        self,
        audit_trail: Optional[AuditTrail] = None,
        event_bus=None,
    ):
        tools: List[BaseTool] = list(OSINT_TOOLS) + list(WEB_RESEARCH_TOOLS)
        super().__init__(
            name="OSINTAgent",
            agent_type="osint",
            system_prompt=OSINT_SYSTEM_PROMPT,
            tools=tools,
            audit_trail=audit_trail,
            event_bus=event_bus,
            max_iterations=8,
        )


# ---------------------------------------------------------------------------
# TerminalOpsAgent
# ---------------------------------------------------------------------------

TERMINAL_OPS_SYSTEM_PROMPT = """你是 TerminalOpsAgent，负责在授权主机上通过持久化终端会话执行命令。

【职责】
- 打开 / 维护 / 关闭终端会话
- 根据上层任务在授权目录内执行命令、收集日志、运行小脚本
- 所有操作必须遵循「只在授权范围内执行，避免破坏性动作」的原则

【工具集】
- terminal_session: 持久化终端会话工具 (open / exec / read / close / list)

输出时请简要说明执行了哪些命令、产生了哪些关键输出。"""


class TerminalOpsAgent(_SpecializedSecurityAgent):
    def __init__(
        self,
        audit_trail: Optional[AuditTrail] = None,
        event_bus=None,
    ):
        tools: List[BaseTool] = [TerminalSessionTool()]
        super().__init__(
            name="TerminalOpsAgent",
            agent_type="terminal_ops",
            system_prompt=TERMINAL_OPS_SYSTEM_PROMPT,
            tools=tools,
            audit_trail=audit_trail,
            event_bus=event_bus,
            max_iterations=4,
        )


# ---------------------------------------------------------------------------
# DefenseMonitorAgent
# ---------------------------------------------------------------------------

DEFENSE_MONITOR_SYSTEM_PROMPT = """你是 DefenseMonitorAgent，负责本机/网络侧的安全防御与巡检。

【职责】
- 调用防御类工具检查系统安全状态（自检漏洞、入侵检测、网络流量分析等）
- 汇总当前防御面的薄弱点与告警信息
- 提出清晰、可执行的加固建议

【工具集】
- DEFENSE_TOOLS: 防御扫描、自检扫描、入侵检测、网络分析等

输出时请按「发现的问题 → 风险评估 → 建议」的顺序组织内容。"""


class DefenseMonitorAgent(_SpecializedSecurityAgent):
    def __init__(
        self,
        audit_trail: Optional[AuditTrail] = None,
        event_bus=None,
    ):
        tools: List[BaseTool] = list(DEFENSE_TOOLS)
        super().__init__(
            name="DefenseMonitorAgent",
            agent_type="defense_monitor",
            system_prompt=DEFENSE_MONITOR_SYSTEM_PROMPT,
            tools=tools,
            audit_trail=audit_trail,
            event_bus=event_bus,
            max_iterations=6,
        )


__all__ = [
    "NetworkReconAgent",
    "WebPentestAgent",
    "OSINTAgent",
    "TerminalOpsAgent",
    "DefenseMonitorAgent",
]

