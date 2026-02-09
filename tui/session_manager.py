"""
SessionManager：会话编排管理器
编排 Planner -> Core Agent (hackbot/superhackbot) -> Summary 的完整流程
管理会话生命周期和事件分发
"""

import uuid
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

from rich.console import Console

from agents.planner_agent import PlannerAgent
from agents.summary_agent import SummaryAgent
from tui.models import (
    InteractionSummary,
    MessageRole,
    PlanResult,
    RequestType,
    Session,
    TodoItem,
    TodoStatus,
)
from utils.event_bus import EventBus, EventType, Event
from utils.logger import logger


class SessionManager:
    """
    会话编排管理器。

    职责：
    1. 管理会话的创建、切换、恢复
    2. 编排 Planner -> Core Agent -> Summary 的完整流程
    3. 通过 EventBus 将流程事件分发给 UI 组件
    4. 维护消息历史
    """

    def __init__(
        self,
        event_bus: EventBus,
        console: Console,
        agents: Optional[Dict] = None,
        planner: Optional[PlannerAgent] = None,
        summary_agent: Optional[SummaryAgent] = None,
    ):
        self.event_bus = event_bus
        self.console = console
        self.planner = planner or PlannerAgent()
        self.summary_agent = summary_agent or SummaryAgent()
        self.agents = agents or {}

        # 会话管理
        self.sessions: Dict[str, Session] = {}
        self.current_session: Optional[Session] = None

        # TUI 设置
        self.show_thinking: bool = True
        self.show_details: bool = True

        # 创建默认会话
        self.new_session()

    # ------------------------------------------------------------------
    # 会话管理
    # ------------------------------------------------------------------

    def new_session(self, agent_type: str = "hackbot", name: str = "") -> Session:
        """创建新会话"""
        session_id = str(uuid.uuid4())[:8]
        if not name:
            name = f"Session {len(self.sessions) + 1}"
        session = Session(
            id=session_id,
            name=name,
            agent_type=agent_type,
        )
        self.sessions[session_id] = session
        self.current_session = session
        self.event_bus.emit_simple(
            EventType.SESSION_UPDATE,
            action="new",
            session_id=session_id,
            name=name,
        )
        return session

    def switch_session(self, session_id: str) -> Optional[Session]:
        """切换到指定会话"""
        session = self.sessions.get(session_id)
        if session:
            self.current_session = session
            self.event_bus.emit_simple(
                EventType.SESSION_UPDATE,
                action="switch",
                session_id=session_id,
            )
        return session

    def list_sessions(self) -> List[Session]:
        """列出所有会话"""
        return list(self.sessions.values())

    def get_current_agent_type(self) -> str:
        """获取当前会话使用的 agent 类型"""
        if self.current_session:
            return self.current_session.agent_type
        return "hackbot"

    def get_agent(self, agent_type: Optional[str] = None):
        """获取 agent 实例"""
        at = agent_type or self.get_current_agent_type()
        return self.agents.get(at)

    # ------------------------------------------------------------------
    # 核心编排流程
    # ------------------------------------------------------------------

    async def handle_message(
        self,
        user_input: str,
        agent_type: Optional[str] = None,
    ) -> str:
        """
        处理单条消息的完整编排流程：
        1. PlannerAgent 分析请求 -> 生成 todos（或直接回复）
        2. 核心 Agent (hackbot/superhackbot) 执行 ReAct 循环
        3. 执行过程中实时更新 todo 状态
        4. SummaryAgent 总结交互结果

        Args:
            user_input: 用户输入
            agent_type: 指定 agent 类型（覆盖会话默认值）

        Returns:
            最终响应文本
        """
        # 记录用户消息
        if self.current_session:
            self.current_session.add_message(MessageRole.USER, user_input)

        # 通知 UI：进入规划阶段（便于加载组件显示「规划中」）
        await self.event_bus.emit_simple_async(
            EventType.TASK_PHASE, phase="planning", detail=""
        )

        # ---- 阶段 1：规划 ----
        plan_result = await self._run_planning(user_input)

        # 如果是简单请求，直接返回
        if plan_result.request_type in (RequestType.GREETING, RequestType.SIMPLE):
            await self.event_bus.emit_simple_async(
                EventType.TASK_PHASE, phase="done", detail=""
            )
            response = plan_result.direct_response or ""
            if self.current_session:
                self.current_session.add_message(MessageRole.ASSISTANT, response)
            return response

        # ---- 阶段 2：执行 ----
        at = agent_type or self.get_current_agent_type()
        agent_instance = self.get_agent(at)
        if not agent_instance:
            error_msg = f"未找到 agent: {at}"
            await self.event_bus.emit_simple_async(EventType.ERROR, error=error_msg)
            return error_msg

        # 创建事件桥接：将 agent 的 on_event 回调转发到 EventBus + 自动更新 todo
        def event_bridge(event_type: str, data: dict):
            self._bridge_agent_event(event_type, data, plan_result)

        # 编排流程下：规划与报告由 SessionManager 各做一次，agent 只做 reasoning + action
        # 传入当前计划步骤，便于 agent 在未完成所有步骤前不提前输出 Final Answer
        todos_snapshot = [
            {"id": t.id, "content": t.content, "status": getattr(t.status, "value", str(t.status))}
            for t in plan_result.todos
        ]
        response = await agent_instance.process(
            user_input,
            on_event=event_bridge,
            skip_planning=True,
            skip_report=True,
            todos=todos_snapshot,
        )

        # ---- 阶段 3：摘要 ----
        summary = await self._run_summary(
            user_input, plan_result, agent_instance, response
        )

        # 记录助手消息
        if self.current_session:
            self.current_session.add_message(
                MessageRole.ASSISTANT,
                response,
                summary=summary.task_summary if summary else None,
            )

        return response

    # ------------------------------------------------------------------
    # 阶段实现
    # ------------------------------------------------------------------

    async def _run_planning(self, user_input: str) -> PlanResult:
        """阶段 1：规划"""
        plan_result = await self.planner.plan(user_input)

        if plan_result.request_type == RequestType.TECHNICAL and plan_result.todos:
            # 发射规划事件
            await self.event_bus.emit_simple_async(
                EventType.PLAN_START,
                summary=plan_result.plan_summary,
                todos=[
                    {
                        "id": t.id,
                        "content": t.content,
                        "status": t.status.value,
                        "depends_on": t.depends_on,
                        "tool_hint": t.tool_hint,
                    }
                    for t in plan_result.todos
                ],
            )

        return plan_result

    async def _run_summary(
        self,
        user_input: str,
        plan_result: PlanResult,
        agent_instance,
        response: str,
    ) -> Optional[InteractionSummary]:
        """阶段 3：摘要"""
        try:
            # 从 agent 中提取 ReAct 历史
            thoughts = []
            observations = []
            if hasattr(agent_instance, "_react_history"):
                for item in agent_instance._react_history:
                    if item["type"] == "thought":
                        thoughts.append(item["content"])
                    elif item["type"] == "observation":
                        observations.append(item["content"])

            summary = await self.summary_agent.summarize_interaction(
                user_input=user_input,
                todos=plan_result.todos,
                thoughts=thoughts,
                observations=observations,
                interaction_type="technical",
                brief=True,  # 最后报告：简要说下做了什么即可
            )

            # 发射报告事件
            await self.event_bus.emit_simple_async(
                EventType.REPORT_END,
                report=summary.raw_report,
                summary={
                    "task_summary": summary.task_summary,
                    "todo_completion": summary.todo_completion,
                    "key_findings": summary.key_findings,
                    "recommendations": summary.recommendations,
                    "overall_conclusion": summary.overall_conclusion,
                },
            )

            return summary
        except Exception as e:
            logger.error(f"摘要阶段错误: {e}")
            return None

    # ------------------------------------------------------------------
    # 事件桥接
    # ------------------------------------------------------------------

    def _bridge_agent_event(
        self,
        event_type: str,
        data: dict,
        plan_result: PlanResult,
    ):
        """
        将 SecurityReActAgent 的 on_event 回调转发到 EventBus，
        同时自动根据工具名更新 todo 状态。
        """
        iteration = data.get("iteration", 0)

        if event_type == "planning":
            self.event_bus.emit_simple(
                EventType.CONTENT,
                content=data.get("content", ""),
                type="text",
                title="[bold magenta]Planning[/bold magenta]",
            )

        elif event_type == "thought_start":
            self.event_bus.emit_simple(
                EventType.THINK_START, iteration=iteration
            )

        elif event_type == "thought_chunk":
            self.event_bus.emit_simple(
                EventType.THINK_CHUNK,
                iteration=iteration,
                chunk=data.get("chunk", ""),
            )

        elif event_type == "thought_end":
            pass  # thought 事件会发送完整内容

        elif event_type == "thought":
            self.event_bus.emit_simple(
                EventType.THINK_END,
                iteration=iteration,
                thought=data.get("content", ""),
            )

        elif event_type == "action_start":
            tool = data.get("tool", "")
            params = data.get("params", {})

            # 自动更新 todo 状态
            self._auto_update_todo_on_exec(tool, plan_result, "in_progress")

            # 格式化脚本信息
            script = self._format_action_script(tool, params)

            self.event_bus.emit(Event(
                type=EventType.EXEC_START,
                data={"tool": tool, "params": params, "script": script},
                iteration=iteration,
            ))

        elif event_type == "action_result":
            tool = data.get("tool", "")
            success = data.get("success", False)

            # 自动更新 todo 状态
            status = "completed" if success else "pending"
            result_text = "成功" if success else f"失败: {data.get('error', '')}"
            self._auto_update_todo_on_exec(tool, plan_result, status, result_text)

            self.event_bus.emit(Event(
                type=EventType.EXEC_RESULT,
                data={
                    "tool": tool,
                    "success": success,
                    "result": data.get("result", "") if success else None,
                    "error": data.get("error", "") if not success else None,
                },
                iteration=iteration,
            ))

        elif event_type == "observation":
            self.event_bus.emit_simple(
                EventType.CONTENT,
                content=data.get("content", ""),
                type="text",
                title=f"[bold blue]Observation #{iteration}[/bold blue]",
            )

        elif event_type == "content":
            self.event_bus.emit_simple(
                EventType.CONTENT,
                content=data.get("content", ""),
                type="text",
            )

        elif event_type == "report":
            self.event_bus.emit_simple(
                EventType.REPORT_END,
                report=data.get("content", ""),
            )

        elif event_type == "error":
            self.event_bus.emit_simple(
                EventType.ERROR,
                error=data.get("error", ""),
            )

    def _auto_update_todo_on_exec(
        self,
        tool_name: str,
        plan_result: PlanResult,
        status: str,
        result_summary: Optional[str] = None,
    ):
        """根据工具名自动更新匹配的 todo 状态"""
        matched = self.planner.find_todo_for_tool(tool_name)
        if matched:
            self.planner.update_todo(matched.id, status, result_summary)
            self.event_bus.emit_simple(
                EventType.PLAN_TODO,
                todo_id=matched.id,
                status=status,
                result_summary=result_summary,
            )
        else:
            # 尝试找下一个 pending todo
            next_todo = self.planner.find_next_pending_todo()
            if next_todo and status == "in_progress":
                self.planner.update_todo(next_todo.id, status, result_summary)
                self.event_bus.emit_simple(
                    EventType.PLAN_TODO,
                    todo_id=next_todo.id,
                    status=status,
                    result_summary=result_summary,
                )

    def _format_action_script(self, tool: str, params: dict) -> Optional[str]:
        """格式化工具执行的脚本信息"""
        import sys
        import json

        if tool == "execute_command":
            command = params.get("command", "")
            cwd = params.get("cwd")
            timeout = params.get("timeout", 30)
            lines = []
            if cwd:
                lines.append(f"# 工作目录: {cwd}")
            lines.append(f"# 超时: {timeout}秒")
            lines.append("")
            if sys.platform == "win32":
                lines.append(f'cmd /c "{command}"')
            else:
                lines.append(command)
            return "\n".join(lines)

        elif tool == "system_control":
            action = params.get("action", "")
            kwargs = params.get("kwargs", {})
            lines = [f"操作: {action}"]
            if kwargs:
                lines.append("参数:")
                for k, v in kwargs.items():
                    lines.append(f"  {k}: {v}")
            return "\n".join(lines)

        elif params:
            lines = ["参数:"]
            for k, v in params.items():
                if isinstance(v, (dict, list)):
                    lines.append(f"  {k}: {json.dumps(v, ensure_ascii=False)}")
                else:
                    lines.append(f"  {k}: {v}")
            return "\n".join(lines)

        return None

    # ------------------------------------------------------------------
    # 便捷方法
    # ------------------------------------------------------------------

    async def compact_current_session(self) -> str:
        """压缩当前会话"""
        if not self.current_session or not self.current_session.messages:
            return "当前会话为空，无需压缩。"

        messages = [
            {"role": m.role.value, "content": m.content}
            for m in self.current_session.messages
        ]
        compact = await self.summary_agent.compact_session(messages)
        return compact

    async def export_session(self, path: Path) -> bool:
        """导出当前会话为 Markdown"""
        if not self.current_session:
            return False

        lines = [f"# {self.current_session.name}\n"]
        lines.append(f"Agent: {self.current_session.agent_type}")
        lines.append(f"Created: {self.current_session.created_at.isoformat()}\n")
        lines.append("---\n")

        for msg in self.current_session.messages:
            role_label = {
                MessageRole.USER: "**You**",
                MessageRole.ASSISTANT: "**Assistant**",
                MessageRole.SYSTEM: "**System**",
            }.get(msg.role, str(msg.role))
            lines.append(f"### {role_label}\n")
            lines.append(f"{msg.content}\n")
            lines.append("---\n")

        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("\n".join(lines), encoding="utf-8")
            return True
        except Exception as e:
            logger.error(f"导出会话失败: {e}")
            return False
