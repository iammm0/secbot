"""
CoordinatorAgent：Hackbot 多子 Agent 协调器（A2A 架构入口）。

职责：
- 对外作为「hackbot」智能体被 SessionManager / 路由调用；
- 在分层执行模式下（TaskExecutor），根据 Todo.agent_hint / resource
  将单步执行委托给对应的专职子 Agent：
    - network_recon      -> NetworkReconAgent
    - web_pentest        -> WebPentestAgent
    - osint              -> OSINTAgent
    - terminal_ops       -> TerminalOpsAgent
    - defense_monitor    -> DefenseMonitorAgent
  其余情况回退到默认 HackbotAgent；
- 按 agent 维度聚合工具执行结果，供 SummaryAgent 做多 Agent 汇总。

注意：
- CoordinatorAgent 本身不再承担 ReAct 循环逻辑，普通对话/同步模式下
  的 process() 直接委托给内部的 HackbotAgent，以保持向后兼容。
"""

from __future__ import annotations

import asyncio
from typing import Any, Dict, List, Optional

from core.agents.base import BaseAgent
from core.agents.hackbot_agent import HackbotAgent
from core.agents.specialist_agents import (
    NetworkReconAgent,
    WebPentestAgent,
    OSINTAgent,
    TerminalOpsAgent,
    DefenseMonitorAgent,
)
from core.models import TodoItem
from utils.audit import AuditTrail
from utils.logger import logger


class CoordinatorAgent(BaseAgent):
    """
    Hackbot 主协调 Agent。

    对外暴露：
    - process(user_input): 兼容旧有 hackbot 行为（直接委托给 HackbotAgent）
    - execute_todo(...):   由 TaskExecutor 在分层执行时调用，用于将单个 Todo
                           路由到合适的子 Agent 执行。
    """

    def __init__(
        self,
        name: str = "Hackbot",
        audit_trail: Optional[AuditTrail] = None,
        event_bus=None,
    ):
        # 作为「hackbot」对外暴露
        super().__init__(name=name)
        self.agent_type: str = "hackbot"

        # 全局并发锁：保持与原 HackbotAgent 一致的串行执行语义
        self._concurrency_lock: asyncio.Lock = asyncio.Lock()

        # 默认 Hackbot，用于普通对话 / 同步模式 / 非分层执行场景
        self._default_agent = HackbotAgent(
            name=name,
            system_prompt=None,
            audit_trail=audit_trail,
        )
        # 为默认 Agent 透传 event_bus（用于 ReAct 事件流）
        self._default_agent.event_bus = event_bus

        # 专职子 Agent：复用同一审计与事件总线
        self._network_agent = NetworkReconAgent(
            audit_trail=audit_trail,
            event_bus=event_bus,
        )
        self._web_agent = WebPentestAgent(
            audit_trail=audit_trail,
            event_bus=event_bus,
        )
        self._osint_agent = OSINTAgent(
            audit_trail=audit_trail,
            event_bus=event_bus,
        )
        self._terminal_agent = TerminalOpsAgent(
            audit_trail=audit_trail,
            event_bus=event_bus,
        )
        self._defense_agent = DefenseMonitorAgent(
            audit_trail=audit_trail,
            event_bus=event_bus,
        )

        # 按 agent 维度聚合的工具执行结果（供 SummaryAgent 使用）
        self._agent_results: Dict[str, List[Dict[str, Any]]] = {}

        logger.info("初始化 CoordinatorAgent（hackbot 多子 Agent 协调器）")

    @property
    def tools_dict(self):
        """
        聚合所有子 Agent 的工具，供 SessionManager 规划阶段注入 Planner 的 context。
        若无 tools_dict，Planner 收不到工具列表，会输出 tool_hint: null 导致无法执行。
        """
        if hasattr(self._default_agent, "tools_dict") and self._default_agent.tools_dict:
            return self._default_agent.tools_dict
        # 兜底：从各子 Agent 聚合
        merged = {}
        for agent in self.get_all_sub_agents():
            if hasattr(agent, "tools_dict") and agent.tools_dict:
                merged.update(agent.tools_dict)
        return merged

    # ------------------------------------------------------------------
    # BaseAgent 接口：普通对话 / 同步模式仍走默认 Hackbot
    # ------------------------------------------------------------------

    async def process(self, user_input: str, **kwargs) -> str:  # type: ignore[override]
        """
        普通对话 / 同步接口：
        - 保持与历史 hackbot 行为一致
        - 直接委托给内部 HackbotAgent
        """
        return await self._default_agent.process(user_input, **kwargs)

    # ------------------------------------------------------------------
    # 分层执行入口：TaskExecutor.run() 使用
    # ------------------------------------------------------------------

    async def execute_todo(
        self,
        todo: TodoItem | Dict[str, Any],
        user_input: str,
        context: Optional[Dict[str, Any]] = None,
        on_event=None,
        iteration: int = 1,
        get_root_password=None,
        emit_events: bool = True,
    ) -> Dict[str, Any]:
        """
        单步执行入口：根据 Todo.agent_hint / resource 路由到专职子 Agent。
        返回结构与 SecurityReActAgent.execute_todo 保持一致，并增加 agent 字段。
        """
        # 清理本轮聚合缓存（由 TaskExecutor 负责整体生命周期）
        agent_hint = getattr(todo, "agent_hint", None) or (
            todo.get("agent_hint") if isinstance(todo, dict) else None
        )
        resource = getattr(todo, "resource", None) or (
            todo.get("resource") if isinstance(todo, dict) else None
        )

        sub_agent, resolved_hint = self._select_sub_agent(agent_hint, resource, todo)

        # 安全兜底：若无法选择专职 Agent，则回退到默认 Hackbot
        if sub_agent is None:
            sub_agent = self._default_agent
            resolved_hint = getattr(sub_agent, "agent_type", None) or "hackbot"

        # 将 get_root_password 透传给底层 SecurityReActAgent
        result = await sub_agent.execute_todo(  # type: ignore[attr-defined]
            todo=todo,
            user_input=user_input,
            context=context,
            on_event=on_event,
            iteration=iteration,
            get_root_password=get_root_password,
            emit_events=emit_events,
        )

        # 为结果打上 agent 标签，便于 Summary / 前端区分
        result_with_agent = dict(result)
        result_with_agent.setdefault(
            "agent",
            getattr(sub_agent, "agent_type", None) or getattr(sub_agent, "name", ""),
        )

        # 按 agent 维度聚合，供 SummaryAgent 做「多 Agent 汇总」
        key = result_with_agent["agent"] or resolved_hint or "unknown"
        self._agent_results.setdefault(key, []).append(result_with_agent)

        return result_with_agent

    # ------------------------------------------------------------------
    # 协调器的辅助接口：供 SessionManager / SummaryAgent 查询
    # ------------------------------------------------------------------

    def get_agent_results_by_agent(self) -> Dict[str, List[Dict[str, Any]]]:
        """
        返回按 agent 维度聚合的工具执行结果：
        {
          "network_recon": [ {...}, {...} ],
          "web_pentest":   [ {...} ],
          ...
        }
        """
        return self._agent_results

    def reset_agent_results(self) -> None:
        """在一次完整交互开始前清空上一次的聚合结果。"""
        self._agent_results.clear()

    def get_all_sub_agents(self) -> List[BaseAgent]:
        """
        返回所有子 Agent（含默认 Hackbot），用于会话摘要写入等场景。
        """
        return [
            self._default_agent,
            self._network_agent,
            self._web_agent,
            self._osint_agent,
            self._terminal_agent,
            self._defense_agent,
        ]

    def append_turn_to_session_context(
        self,
        user_input: str,
        plan_summary: str,
        summary: Optional[Any] = None,
    ) -> None:
        """
        为所有子 Agent 追加本轮任务的摘要式上下文。
        这样在下一轮任务中，每个子 Agent 都能参考当前整体任务的关键结论。
        """
        for agent in self.get_all_sub_agents():
            if hasattr(agent, "append_turn_to_session_context"):
                try:
                    agent.append_turn_to_session_context(
                        user_input,
                        plan_summary,
                        summary,
                    )
                except Exception as e:  # 防御性：单个 Agent 出错不影响整体
                    logger.warning(
                        f"子 Agent 更新会话摘要失败: {getattr(agent, 'name', agent)} - {e}"
                    )

    # ------------------------------------------------------------------
    # 内部：基于 agent_hint / resource 选择子 Agent
    # ------------------------------------------------------------------

    def _select_sub_agent(
        self,
        agent_hint: Optional[str],
        resource: Optional[str],
        todo: TodoItem | Dict[str, Any],
    ):
        """
        根据 agent_hint / resource / tool_hint 选择合适的子 Agent。
        返回 (agent_instance, resolved_agent_hint)。
        """
        hint = (agent_hint or "").strip().lower()
        res = (resource or "").strip().lower()

        # 1) 优先使用 Planner 预填的 agent_hint
        if hint == "network_recon":
            return self._network_agent, hint
        if hint == "web_pentest":
            return self._web_agent, hint
        if hint == "osint":
            return self._osint_agent, hint
        if hint == "terminal_ops":
            return self._terminal_agent, hint
        if hint == "defense_monitor":
            return self._defense_agent, hint

        # 2) 根据 resource 前缀兜底
        if res.startswith(("host:", "subnet:", "ip:")):
            return self._network_agent, "network_recon"
        if res.startswith("web:"):
            return self._web_agent, "web_pentest"
        if res.startswith(("domain:", "osint:")):
            return self._osint_agent, "osint"

        # 3) 根据 tool_hint 再做一轮兜底
        tool_hint = getattr(todo, "tool_hint", None) or (
            todo.get("tool_hint") if isinstance(todo, dict) else None
        )
        tool_hint_lower = (tool_hint or "").lower()
        if tool_hint_lower:
            if any(k in tool_hint_lower for k in ["port_scan", "service_detect", "recon", "subnet", "ping", "traceroute"]):
                return self._network_agent, "network_recon"
            if any(
                k in tool_hint_lower
                for k in [
                    "dir",
                    "waf",
                    "tech_detect",
                    "header",
                    "cors",
                    "jwt",
                    "param",
                    "xss",
                    "sql",
                    "ssrf",
                    "web_",
                    "http_",
                ]
            ):
                return self._web_agent, "web_pentest"
            if any(
                k in tool_hint_lower
                for k in [
                    "shodan",
                    "virustotal",
                    "osint",
                    "smart_search",
                    "deep_crawl",
                    "api_client",
                    "web_research",
                    "ip_geolocation",
                ]
            ):
                return self._osint_agent, "osint"
            if tool_hint_lower in {"terminal_session", "execute_command"}:
                return self._terminal_agent, "terminal_ops"
            if any(
                k in tool_hint_lower
                for k in [
                    "defense",
                    "intrusion",
                    "self_vuln",
                    "network_analyze",
                    "system_info",
                    "system_status",
                ]
            ):
                return self._defense_agent, "defense_monitor"

        # 未能匹配到专职 Agent
        return None, None


__all__ = ["CoordinatorAgent"]

