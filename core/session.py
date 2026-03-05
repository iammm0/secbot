"""
SessionManager：会话编排管理器
编排 路由 -> Q&A / Planner -> Core Agent (hackbot/superhackbot) -> Summary 的完整流程
管理会话生命周期和事件分发
"""

import uuid
from datetime import datetime
from pathlib import Path
from typing import Awaitable, Callable, Dict, List, Optional, Any

from rich.console import Console

from core.agents.planner_agent import PlannerAgent
from core.agents.qa_agent import QAAgent
from core.agents.router import route_with_llm as message_route_with_llm
from core.agents.summary_agent import SummaryAgent
from core.executor import TaskExecutor
from core.models import (
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
    2. 路由：简单问候/项目了解 -> QAAgent；操作类 -> Planner -> Core Agent -> Summary
    3. 通过 EventBus 将流程事件分发给 UI 组件
    4. 维护消息历史
    """

    def __init__(
        self,
        event_bus: EventBus,
        console: Console,
        agents: Optional[Dict] = None,
        planner: Optional[PlannerAgent] = None,
        qa_agent: Optional[QAAgent] = None,
        summary_agent: Optional[SummaryAgent] = None,
        get_root_password: Optional[Callable[[str], Awaitable[Optional[str]]]] = None,
        resolve_agent: Optional[Callable[[str], Any]] = None,
    ):
        self.event_bus = event_bus
        self.console = console
        self.planner = planner or PlannerAgent()
        self.qa_agent = qa_agent or QAAgent()
        self.summary_agent = summary_agent or SummaryAgent()
        self.agents = agents or {}
        self.get_root_password = get_root_password
        self.resolve_agent = resolve_agent

        # 会话管理
        self.sessions: Dict[str, Session] = {}
        self.current_session: Optional[Session] = None

        # TUI 设置
        self.show_thinking: bool = True
        self.show_details: bool = True

        # 当前轮次工具执行结果（含成功/失败），供摘要阶段使用
        self._current_tool_results: List[Dict] = []

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
        """获取 agent 实例；若未在 agents 中且提供了 resolve_agent，则延迟解析并缓存。"""
        at = agent_type or self.get_current_agent_type()
        if at in self.agents:
            return self.agents[at]
        if self.resolve_agent:
            instance = self.resolve_agent(at)
            if instance is not None:
                self.agents[at] = instance
                return instance
        return None

    # ------------------------------------------------------------------
    # 核心编排流程
    # ------------------------------------------------------------------

    async def handle_message(
        self,
        user_input: str,
        agent_type: Optional[str] = None,
        plan_override: Optional[PlanResult] = None,
        force_qa: bool = False,
        plan_only: bool = False,
        force_agent_flow: bool = False,
    ) -> str:
        """
        处理单条消息的完整编排流程（Interaction）：
        1. force_qa 或 路由为简单问候 -> QAAgent 简要回复
        2. 否则：规划 -> 核心 Agent 执行 -> SummaryAgent 总结

        对外仅支持 ask（force_qa）与 agent（force_agent_flow）两种模式，无 plan 模式。
        plan_only / plan_override 为内部预留参数，API 层不再传入 plan 模式。

        Args:
            user_input: 用户输入
            agent_type: 指定 agent 类型（覆盖会话默认值）
            plan_override: 若提供则跳过规划阶段，直接使用该计划执行（预留）
            force_qa: 强制走 Q&A，不规划不执行
            plan_only: 仅规划并返回计划，不执行、不摘要（内部预留，API 不传）
            force_agent_flow: 强制走 Agent 编排链路（不走 QA 快捷路由）

        Returns:
            最终响应文本
        """
        # 统一处理斜杠命令，如 /help
        stripped = user_input.strip()
        if stripped.startswith("/"):
            cmd = stripped.split()[0].lower()
            if cmd in ("/help", "/h", "/?"):
                help_text = (
                    "我是 Hackbot / Secbot 内置的自动化安全测试助手。\n\n"
                    "【角色定位】\n"
                    "- 核心身份：自动化渗透测试与主动安全巡检系统（hackbot 自动模式 / superhackbot 专家模式）。\n"
                    "- 同时也是一个通用 AI 助手，可以回答和安全无关的各种问题。\n\n"
                    "【我能做什么】\n"
                    "- 安全/渗透测试相关：\n"
                    "  * 资产与信息收集（端口扫描、服务识别、指纹探测）。\n"
                    "  * Web 目录爆破、基础漏洞探测（如常见弱点、自检巡检）。\n"
                    "  * 简单 OSINT 查询（Shodan / VirusTotal 等，需你在 .env 或设置里配置 API Key）。\n"
                    "  * 结合多种工具，执行「信息收集 → 扫描 → 分析 → 报告」的一整套自动化流程。\n"
                    "- 通用能力：\n"
                    "  * 回答编程、系统使用、架构设计等通用问题。\n"
                    "  * 帮你规划任务步骤、解释扫描结果、生成安全巡检报告。\n\n"
                    "【内部架构（高层次理解）】\n"
                    "- 前端 / TUI / App → 调用后端 FastAPI `/api/chat` 接口。\n"
                    "- 后端由 `SessionManager` 负责会话编排，决定是走 QA 简答、还是走 Planner + 核心 Agent 的技术链路。\n"
                    "- 核心 Agent（hackbot / superhackbot）基于 ReAct 模式调用安全工具，并通过 EventBus 把思考过程/工具调用结果推送给前端。\n"
                    "- 最后由 SummaryAgent 汇总为一份可读的任务总结/安全报告。\n\n"
                    "【如何和我配合】\n"
                    "- 想做渗透测试/巡检时，可以直接告诉我目标和授权范围，比如：\n"
                    "  * “帮我对 192.168.1.10 做一次基础安全巡检，包含端口和目录扫描。”\n"
                    "  * “对 https://example.com 做一轮基础渗透测试，先信息收集再目录爆破。”\n"
                    "- 想了解具体能力/架构时，可以直接用自然语言继续问，比如：\n"
                    "  * “你现在集成了哪些安全工具？”\n"
                    "  * “详细讲讲 hackbot 的工作流程和设计思路。”\n"
                )
                if self.current_session:
                    self.current_session.add_message(MessageRole.ASSISTANT, help_text)
                return help_text

        if self.current_session:
            self.current_session.add_message(MessageRole.USER, user_input)

        self._current_tool_results = []

        # ---- 强制 Q&A 或 路由（含 LLM 分类）-> Q&A / 人格回复 / 技术流 ----
        if force_qa:
            await self.event_bus.emit_simple_async(
                EventType.TASK_PHASE, phase="done", detail=""
            )
            response = await self.qa_agent.answer(user_input)
            if self.current_session:
                self.current_session.add_message(MessageRole.ASSISTANT, response)
            return response

        if not force_agent_flow and plan_override is None:
            route_type, direct_reply = await message_route_with_llm(user_input)
            # 与安全/电脑无关的问候 → 人格化直接回复
            if route_type == "other":
                reply = direct_reply or (
                    "你好呀～有安全巡检或电脑上的事可以随时叫我。"
                )
                await self.event_bus.emit_simple_async(
                    EventType.TASK_PHASE, phase="done", detail=""
                )
                if self.current_session:
                    self.current_session.add_message(
                        MessageRole.ASSISTANT, reply
                    )
                return reply
            # 项目/能力/帮助类 → QAAgent
            if route_type == "qa":
                await self.event_bus.emit_simple_async(
                    EventType.TASK_PHASE, phase="done", detail=""
                )
                response = await self.qa_agent.answer(user_input)
                if self.current_session:
                    self.current_session.add_message(
                        MessageRole.ASSISTANT, response
                    )
                return response
            # technical：继续走规划+执行

        # 通知 UI：进入规划阶段（便于加载组件显示「规划中」）
        await self.event_bus.emit_simple_async(
            EventType.TASK_PHASE, phase="planning", detail=""
        )

        # ---- 阶段 1：规划（或使用既定计划）----
        if plan_override is not None:
            plan_result = plan_override
            self.planner._current_plan = plan_result  # 便于执行时更新 todo 状态
            # 仍需要发射 PLAN_START 以便 TUI 展示
            if plan_result.todos:
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
                            "resource": getattr(t, "resource", None),
                            "risk_level": getattr(t, "risk_level", None),
                            "agent_hint": getattr(t, "agent_hint", None),
                        }
                        for t in plan_result.todos
                    ],
                )
        else:
            at = agent_type or self.get_current_agent_type()
            plan_result = await self._run_planning(user_input, agent_type=at)

            if (
                not force_agent_flow
                and plan_result.request_type in (RequestType.GREETING, RequestType.SIMPLE)
            ):
                await self.event_bus.emit_simple_async(
                    EventType.TASK_PHASE, phase="done", detail=""
                )
                response = plan_result.direct_response or ""
                if self.current_session:
                    self.current_session.add_message(MessageRole.ASSISTANT, response)
                return response

            # 仅规划模式：返回计划文本，不执行
            if plan_only:
                await self.event_bus.emit_simple_async(
                    EventType.TASK_PHASE, phase="done", detail=""
                )
                response = plan_result.plan_summary or ""
                if plan_result.direct_response:
                    response = plan_result.direct_response + "\n\n" + response
                if plan_result.todos:
                    lines = [
                        f"- {t.content} ({t.status.value})" for t in plan_result.todos
                    ]
                    response = response + "\n\n**待办:**\n" + "\n".join(lines)
                if self.current_session:
                    self.current_session.add_message(MessageRole.ASSISTANT, response)
                return response

        # ---- 阶段 2：执行 ----
        at = agent_type or self.get_current_agent_type()
        agent_instance = self.get_agent(at)
        if not agent_instance:
            # 详细诊断信息
            available_agents = list(self.agents.keys()) if self.agents else []
            error_msg = f"未找到 agent: {at}\n可用 agents: {available_agents}\n检查是否正确初始化或传递了 agents 参数。"
            logger.error(f"Agent 获取失败: at={at}, agents_keys={available_agents}")
            await self.event_bus.emit_simple_async(EventType.ERROR, error=error_msg)
            return error_msg

        # 如 Agent 支持多子 Agent 聚合，先清空上一轮的聚合结果
        if hasattr(agent_instance, "reset_agent_results"):
            try:
                agent_instance.reset_agent_results()
            except Exception as e:
                logger.warning(f"重置子 Agent 聚合结果失败: {e}")

        # 创建事件桥接：将 agent 的 on_event 回调转发到 EventBus + 自动更新 todo
        def event_bridge(event_type: str, data: dict):
            # 若下层未标记 agent，则使用当前核心 Agent 的标识兜底
            if "agent" not in data:
                data = dict(data or {})
                data["agent"] = getattr(
                    agent_instance,
                    "agent_type",
                    getattr(agent_instance, "name", at),
                )
            self._bridge_agent_event(event_type, data, plan_result)

        # 编排流程下：规划与报告由 SessionManager 各做一次
        # 当有计划步骤且 Agent 支持 execute_todo 时，使用分层执行器（支持并行/串行）
        # 否则回退到 ReAct 循环
        todos_snapshot = [
            {
                "id": t.id,
                "content": t.content,
                "status": getattr(t.status, "value", str(t.status)),
            }
            for t in plan_result.todos
        ]
        use_layer_executor = (
            plan_result.todos
            and hasattr(agent_instance, "execute_todo")
        )

        # 若 Agent 定义了并发锁，则在锁内串行执行整个任务，避免多个请求并发打在同一个 Agent 上
        lock = getattr(agent_instance, "_concurrency_lock", None)
        if lock is not None:
            async with lock:
                if use_layer_executor:
                    executor = TaskExecutor(
                        plan_result=plan_result,
                        agent=agent_instance,
                        planner=self.planner,
                        event_bus=self.event_bus,
                        get_root_password=getattr(self, "get_root_password", None),
                    )
                    response = await executor.run(
                        user_input, on_event=event_bridge
                    )
                    # 分层执行后需记录工具结果供摘要使用（由 event_bridge 已更新 _current_tool_results）
                else:
                    response = await agent_instance.process(
                        user_input,
                        on_event=event_bridge,
                        skip_planning=True,
                        skip_report=True,
                        todos=todos_snapshot,
                        get_root_password=getattr(self, "get_root_password", None),
                    )
        else:
            if use_layer_executor:
                executor = TaskExecutor(
                    plan_result=plan_result,
                    agent=agent_instance,
                    planner=self.planner,
                    event_bus=self.event_bus,
                    get_root_password=getattr(self, "get_root_password", None),
                )
                response = await executor.run(
                    user_input, on_event=event_bridge
                )
            else:
                response = await agent_instance.process(
                    user_input,
                    on_event=event_bridge,
                    skip_planning=True,
                    skip_report=True,
                    todos=todos_snapshot,
                    get_root_password=getattr(self, "get_root_password", None),
                )

        # ---- 阶段 3：摘要 ----
        summary = await self._run_summary(
            user_input, plan_result, agent_instance, response
        )

        # 将本轮摘要式信息写入 agent 的会话上下文，供后续连续任务参考
        if hasattr(agent_instance, "append_turn_to_session_context") and summary is not None:
            try:
                agent_instance.append_turn_to_session_context(
                    user_input,
                    plan_result.plan_summary or "",
                    summary,
                )
            except Exception as e:
                logger.warning(f"更新会话上下文摘要失败: {e}")

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

    async def _run_planning(
        self, user_input: str, agent_type: Optional[str] = None
    ) -> PlanResult:
        """阶段 1：规划，预加载工具列表供 Planner 生成更准确的 tool_hint"""
        context: Dict[str, Any] = {}
        agent_instance = self.get_agent(agent_type) if agent_type else None
        if agent_instance and hasattr(agent_instance, "tools_dict"):
            tool_names = list(agent_instance.tools_dict.keys())
            context["tools"] = tool_names
        elif agent_instance and hasattr(agent_instance, "security_tools"):
            tool_names = [t.name for t in agent_instance.security_tools]
            context["tools"] = tool_names
        plan_result = await self.planner.plan(user_input, context=context)

        if plan_result.request_type == RequestType.TECHNICAL and plan_result.todos:
            # 发射规划事件（标记来源为 planner）
            await self.event_bus.emit_simple_async(
                EventType.PLAN_START,
                summary=plan_result.plan_summary,
                agent="planner",
                todos=[
                    {
                        "id": t.id,
                        "content": t.content,
                        "status": t.status.value,
                        "depends_on": t.depends_on,
                        "tool_hint": t.tool_hint,
                        "resource": getattr(t, "resource", None),
                        "risk_level": getattr(t, "risk_level", None),
                        "agent_hint": getattr(t, "agent_hint", None),
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

            agent_tool_results_by_agent = None
            if hasattr(agent_instance, "get_agent_results_by_agent"):
                try:
                    agent_tool_results_by_agent = (
                        agent_instance.get_agent_results_by_agent()
                    )
                except Exception as e:
                    logger.warning(f"获取子 Agent 结果聚合失败: {e}")

            summary = await self.summary_agent.summarize_interaction(
                user_input=user_input,
                todos=plan_result.todos,
                thoughts=thoughts,
                observations=observations,
                tool_results=self._current_tool_results,
                interaction_type="technical",
                brief=True,  # 最后报告：简要说下做了什么即可
                agent_tool_results_by_agent=agent_tool_results_by_agent,
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

        agent = data.get("agent")

        if event_type == "planning":
            self.event_bus.emit_simple(
                EventType.CONTENT,
                content=data.get("content", ""),
                type="text",
                title="[bold magenta]Planning[/bold magenta]",
                agent=agent,
            )

        elif event_type == "thought_start":
            self.event_bus.emit_simple(
                EventType.THINK_START,
                iteration=iteration,
                agent=agent,
            )

        elif event_type == "thought_chunk":
            self.event_bus.emit_simple(
                EventType.THINK_CHUNK,
                iteration=iteration,
                chunk=data.get("chunk", ""),
                agent=agent,
            )

        elif event_type == "thought_end":
            pass  # thought 事件会发送完整内容

        elif event_type == "thought":
            self.event_bus.emit_simple(
                EventType.THINK_END,
                iteration=iteration,
                thought=data.get("content", ""),
                agent=agent,
            )

        elif event_type == "action_start":
            tool = data.get("tool", "")
            params = data.get("params", {})

            # 自动更新 todo 状态
            self._auto_update_todo_on_exec(tool, plan_result, "in_progress")

            # 格式化脚本信息
            script = self._format_action_script(tool, params)

            self.event_bus.emit(
                Event(
                    type=EventType.EXEC_START,
                    data={
                        "tool": tool,
                        "params": params,
                        "script": script,
                        "agent": agent,
                    },
                    iteration=iteration,
                )
            )

        elif event_type == "action_result":
            tool = data.get("tool", "")
            success = data.get("success", False)

            # 记录本轮工具执行结果（含失败），供摘要 Agent 输出
            self._current_tool_results.append(
                {
                    "tool": tool,
                    "success": success,
                    "result": data.get("result") if success else None,
                    "error": data.get("error", "") if not success else None,
                }
            )

            # 自动更新 todo 状态
            status = "completed" if success else "pending"
            result_text = "成功" if success else f"失败: {data.get('error', '')}"
            self._auto_update_todo_on_exec(tool, plan_result, status, result_text)

            self.event_bus.emit(
                Event(
                    type=EventType.EXEC_RESULT,
                    data={
                        "tool": tool,
                        "success": success,
                        "result": data.get("result", "") if success else None,
                        "error": data.get("error", "") if not success else None,
                        "agent": agent,
                    },
                    iteration=iteration,
                )
            )

        elif event_type == "observation":
            self.event_bus.emit_simple(
                EventType.CONTENT,
                content=data.get("content", ""),
                type="text",
                title="[bold blue]观察[/bold blue]",
                agent=agent,
            )

        elif event_type == "content":
            self.event_bus.emit_simple(
                EventType.CONTENT,
                content=data.get("content", ""),
                type="text",
                agent=agent,
            )

        elif event_type == "report":
            self.event_bus.emit_simple(
                EventType.REPORT_END,
                report=data.get("content", ""),
                agent=agent,
            )

        elif event_type == "error":
            self.event_bus.emit_simple(
                EventType.ERROR,
                error=data.get("error", ""),
                agent=agent,
            )

    def _auto_update_todo_on_exec(
        self,
        tool_name: str,
        plan_result: PlanResult,
        status: str,
        result_summary: Optional[str] = None,
    ):
        """根据工具名自动更新匹配的 todo 状态；每完成一个就标记为 completed，保证总结报告正确。"""
        matched = self.planner.find_todo_for_tool(tool_name)
        if matched:
            self.planner.update_todo(matched.id, status, result_summary)
            self.event_bus.emit_simple(
                EventType.PLAN_TODO,
                todo_id=matched.id,
                status=status,
                result_summary=result_summary,
            )
            return
        # 未按 tool_hint 匹配到时：in_progress 标到“下一个 pending”，completed 标到“当前 in_progress”
        if status == "in_progress":
            next_todo = self.planner.find_next_pending_todo()
            if next_todo:
                self.planner.update_todo(next_todo.id, status, result_summary)
                self.event_bus.emit_simple(
                    EventType.PLAN_TODO,
                    todo_id=next_todo.id,
                    status=status,
                    result_summary=result_summary,
                )
        elif status == "completed":
            in_progress_todo = self.planner.find_todo_in_progress()
            if in_progress_todo:
                self.planner.update_todo(in_progress_todo.id, status, result_summary)
                self.event_bus.emit_simple(
                    EventType.PLAN_TODO,
                    todo_id=in_progress_todo.id,
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

    async def handle_ask_message(self, user_input: str) -> str:
        """
        Ask 模式：仅根据当前会话上下文回答问题，不执行任何推理/动作。

        流程：
        1. 从当前会话提取对话历史
        2. 连同用户问题一起传给 QAAgent.answer_with_context
        3. 记录消息并返回回复

        Args:
            user_input: 用户在 Ask 模式下的提问

        Returns:
            QAAgent 基于上下文的回答
        """
        # 提取当前会话的对话历史
        conversation_history: List[Dict] = []
        if self.current_session and self.current_session.messages:
            for msg in self.current_session.messages:
                conversation_history.append(
                    {
                        "role": msg.role.value,
                        "content": msg.content,
                    }
                )

        # 记录用户消息
        if self.current_session:
            self.current_session.add_message(MessageRole.USER, user_input)

        # 调用 QAAgent 的上下文问答
        response = await self.qa_agent.answer_with_context(
            user_input, conversation_history
        )

        # 记录助手回复
        if self.current_session:
            self.current_session.add_message(MessageRole.ASSISTANT, response)

        return response

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
