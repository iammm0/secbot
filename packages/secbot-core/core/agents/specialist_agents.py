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
from tools.utility import IpGeoTool
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
        tools: List[BaseTool] = list(OSINT_TOOLS) + list(WEB_RESEARCH_TOOLS) + [IpGeoTool()]
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

TERMINAL_OPS_SYSTEM_PROMPT = """你是 TerminalOpsAgent，负责在授权主机上执行终端相关操作。你需要理解用户意图，决定要执行的命令，并交给终端工具执行。

【两种终端方式】
1. 真正打开新的系统终端窗口（用户可见的新 cmd/PowerShell/Terminal 窗口）：
   - 使用 terminal_session 的 action=open_external。
   - 传 user_intent：用自然语言描述用户想在该终端里做的事（如「检查 C 盘根目录」「ping 8.8.8.8」），工具内 LLM 会据此生成具体命令并在新窗口中执行。
   - 或直接传 initial_command：你已想好的单条命令字符串。
   - 平台由工具自动选择：Windows 用 cmd/PowerShell，macOS 用 Terminal.app，Linux 用 gnome-terminal/xterm。

2. 进程内终端（可连续发命令并读输出，供你分析）：
   - 使用 action=open 打开会话，再用 action=exec 发送 command，用 action=read 读输出。
   - 该终端由你（Agent）独占控制，用户端仅可只读查看输出，不可在终端中输入；你负责在此终端中执行命令并将结果反馈给用户。
   - 适合需要根据上一条输出再发下一条命令、或需要把输出返回给用户的场景。

【职责】
- 理解用户意图，决定用 open_external（新窗口）还是 open+exec（进程内）。
- 若用户说「打开新终端」「另开一个终端」「在新窗口执行」或希望看到真实终端窗口，用 open_external，并填 user_intent 或 initial_command。
- 所有操作遵循「只在授权范围内执行，避免破坏性动作」的原则。

【工具】terminal_session: open / open_external / exec / read / close / list。

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

