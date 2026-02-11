"""
SecurityReActAgent：LLM 驱动的安全测试 ReAct 引擎
支持自动执行（hackbot）和用户确认（superhackbot）两种模式。
"""

import json
import re
from typing import Optional, List, Dict, Any

from agents.base import BaseAgent
from agents.summary_agent import SummaryAgent
from tools.base import BaseTool, ToolResult
from utils.audit import AuditTrail
from utils.confirmation import UserConfirmation, ActionOption
from utils.logger import logger

try:
    from langchain_ollama import ChatOllama
except ImportError:
    from langchain_community.chat_models import ChatOllama
try:
    from langchain_openai import ChatOpenAI
except ImportError:
    ChatOpenAI = None

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import SystemMessage, HumanMessage
from pydantic import SecretStr
from config import settings


def _create_llm(
    provider: Optional[str] = None,
    model: Optional[str] = None,
    temperature: Optional[float] = None,
) -> BaseChatModel:
    """创建 LLM 实例（与 tool_calling_agent 的 _create_llm 逻辑一致）。"""
    p = (provider or settings.llm_provider or "ollama").strip().lower()
    if p == "ollama":
        return ChatOllama(
            base_url=settings.ollama_base_url,
            model=model or settings.ollama_model,
            temperature=temperature
            if temperature is not None
            else settings.ollama_temperature,
        )
    if p == "deepseek":
        if ChatOpenAI is None:
            raise ImportError("需安装 langchain-openai: pip install langchain-openai")
        if not settings.deepseek_api_key:
            raise ValueError("请设置 DEEPSEEK_API_KEY")
        resolved = (model or settings.deepseek_model).strip()
        if resolved.lower() == "reasoner":
            resolved = settings.deepseek_reasoner_model

        # deepseek-reasoner 不支持 temperature 参数
        is_reasoner = "reasoner" in resolved.lower()
        kwargs = dict(
            api_key=SecretStr(settings.deepseek_api_key),
            base_url=(settings.deepseek_base_url).rstrip("/"),
            model=resolved,
        )
        if not is_reasoner:
            kwargs["temperature"] = (
                temperature
                if temperature is not None
                else settings.deepseek_temperature
            )
        return ChatOpenAI(**kwargs)
    raise ValueError(f"不支持的推理后端: {p}")


class SecurityReActAgent(BaseAgent):
    """
    安全测试 ReAct 智能体基类。
    ReAct 循环：Think -> Action -> Observation -> ... -> Final Answer

    子类通过设置 auto_execute 区分模式：
      - auto_execute=True (HackbotAgent): 自动执行工具
      - auto_execute=False (SuperHackbotAgent): 敏感操作需用户确认
    """

    def __init__(
        self,
        name: str,
        system_prompt: str,
        tools: Optional[List[BaseTool]] = None,
        auto_execute: bool = True,
        max_iterations: int = 10,
        audit_trail: Optional[AuditTrail] = None,
        event_bus=None,
    ):
        super().__init__(name, system_prompt)
        self.security_tools = tools or []
        self.tools_dict: Dict[str, BaseTool] = {t.name: t for t in self.security_tools}
        self.auto_execute = auto_execute
        self.max_iterations = max_iterations
        self.audit = audit_trail
        self.confirmation = UserConfirmation() if not auto_execute else None

        # EventBus（可选，用于 TUI 组件集成）
        self.event_bus = event_bus

        # LLM
        self._provider_override: Optional[str] = None
        self._model_override: Optional[str] = None
        self.llm = _create_llm()
        self.model = (
            settings.ollama_model
            if (settings.llm_provider or "ollama").strip().lower() == "ollama"
            else settings.deepseek_model
        )

        # ReAct 状态
        self._react_history: List[Dict[str, str]] = []  # 当前任务的 think/act/obs 历史
        self._waiting_for_confirm = False
        self._skip_report = (
            False  # 由 process(skip_report=True) 设置，供 handle_accept 使用
        )

    def _emit_event(self, event_type: str, data: dict, on_event=None):
        """触发事件回调，同时发射到 EventBus（如果已配置）"""
        # 传统回调方式（向后兼容）
        if on_event and callable(on_event):
            try:
                on_event(event_type, data)
            except Exception as e:
                logger.error(f"事件回调错误: {e}")

        # EventBus 方式（新 TUI 组件集成）
        if self.event_bus:
            try:
                from utils.event_bus import EventType as ET, Event

                _type_map = {
                    "planning": ET.CONTENT,
                    "thought_start": ET.THINK_START,
                    "thought_chunk": ET.THINK_CHUNK,
                    "thought_end": ET.THINK_END,
                    "thought": ET.THINK_END,
                    "action_start": ET.EXEC_START,
                    "action_result": ET.EXEC_RESULT,
                    "observation": ET.CONTENT,
                    "content": ET.CONTENT,
                    "report": ET.REPORT_END,
                    "error": ET.ERROR,
                }
                mapped = _type_map.get(event_type)
                if mapped:
                    iteration = data.get("iteration", 0)
                    self.event_bus.emit(
                        Event(
                            type=mapped,
                            data=data,
                            iteration=iteration,
                        )
                    )
            except Exception as e:
                logger.error(f"EventBus 发射错误: {e}")

    # ---- 模型切换 ----

    def switch_model(
        self, provider: Optional[str] = None, model: Optional[str] = None
    ) -> str:
        if provider is not None:
            self._provider_override = provider.strip().lower()
            if model is None:
                self._model_override = None
        if model is not None:
            self._model_override = model.strip()
        p = self._provider_override or settings.llm_provider or "ollama"
        m = self._model_override
        self.llm = _create_llm(provider=p, model=m)
        self.model = m or (
            settings.ollama_model if p == "ollama" else settings.deepseek_model
        )
        logger.info(f"已切换推理模型: {self.get_current_model()}")
        return self.get_current_model()

    def get_current_model(self) -> str:
        p = (
            (self._provider_override or settings.llm_provider or "ollama")
            .strip()
            .lower()
        )
        m = self._model_override or (
            settings.ollama_model if p == "ollama" else settings.deepseek_model
        )
        return f"{p} / {m}"

    # ---- 工具描述 ----

    def _get_tools_description(self) -> str:
        """生成工具列表描述，供 LLM 参考。"""
        lines = ["可用工具："]
        for t in self.security_tools:
            sens = getattr(t, "sensitivity", "low")
            sens_tag = " [敏感-需确认]" if sens == "high" else ""
            lines.append(f"- {t.name}: {t.description}{sens_tag}")
        return "\n".join(lines)

    # ---- LLM 调用 ----

    async def _call_llm(self, messages: List) -> str:
        """调用 LLM 并提取文本内容。"""
        import asyncio
        from utils.model_selector import get_llm_connection_hint

        try:
            response = await asyncio.wait_for(self.llm.ainvoke(messages), timeout=30.0)
        except Exception as e:
            logger.error(f"LLM 调用失败: {e}")
            provider = (
                self._provider_override
                or getattr(settings, "llm_provider", None)
                or "ollama"
            )
            hint = get_llm_connection_hint(e, provider=provider)
            return f"[LLM 调用失败: {hint}]"

        if hasattr(response, "content") and response.content:
            return str(response.content)
        return str(response)

    async def _call_llm_stream(self, messages: List, on_event=None) -> str:
        """流式调用 LLM，触发事件。"""
        import asyncio

        try:
            full_response = ""
            if hasattr(self.llm, "astream"):
                async for chunk in self.llm.astream(messages):
                    content_chunk = None
                    # 提取内容
                    if hasattr(chunk, "content") and chunk.content is not None:
                        content_chunk = str(chunk.content)
                    elif hasattr(chunk, "text") and chunk.text is not None:
                        content_chunk = str(chunk.text)
                    elif hasattr(chunk, "message") and hasattr(
                        chunk.message, "content"
                    ):
                        content_chunk = str(chunk.message.content)

                    if content_chunk and content_chunk.strip():
                        full_response += content_chunk
                        self._emit_event(
                            "thought_chunk", {"chunk": content_chunk}, on_event
                        )
                    # 忽略空的或纯元数据的 chunk
            else:
                # 回退到非流式
                response = await asyncio.wait_for(
                    self.llm.ainvoke(messages), timeout=10.0
                )
                if hasattr(response, "content") and response.content:
                    full_response = str(response.content)
                else:
                    full_response = str(response)
                self._emit_event("thought_chunk", {"chunk": full_response}, on_event)

            return full_response
        except Exception as e:
            from utils.model_selector import get_llm_connection_hint

            logger.error(f"LLM 流式调用失败: {e}")
            provider = (
                self._provider_override
                or getattr(settings, "llm_provider", None)
                or "ollama"
            )
            hint = get_llm_connection_hint(e, provider=provider)
            error_msg = f"[LLM 调用失败: {hint}]"
            self._emit_event("error", {"error": hint}, on_event)
            return error_msg

    # ---- ReAct 核心 ----

    async def process(self, user_input: str, on_event=None, **kwargs) -> str:
        """
        ReAct 主处理流程。
        如果有待确认的操作（superhackbot），返回方案列表等待 /accept。

        kwargs:
            skip_planning: 若为 True（由 SessionManager 编排时），不再在内部做规划与发射 planning 事件。
            skip_report: 若为 True，不在内部生成/发射 report，由上层统一做一次报告。
        """
        skip_planning = kwargs.get("skip_planning", False)
        skip_report = kwargs.get("skip_report", False)
        self._skip_report = skip_report  # 供 handle_accept 使用
        # 当前计划步骤（由 SessionManager 传入），用于 prompt 中提示“未完成不输出 Final Answer”
        self._current_todos = kwargs.get("todos") or []
        # 需要 root 时询问密码的回调（由交互层传入）
        self._get_root_password = kwargs.get("get_root_password")

        # 如果在等待确认且用户输入不是 /accept 或 /reject，提醒用户
        if self._waiting_for_confirm and self.confirmation:
            return (
                self.confirmation.get_pending_text()
                + "\n\n请先输入 `/accept N` 确认方案或 `/reject` 拒绝。"
            )

        self.add_message("user", user_input)
        self._react_history = []

        if self.audit:
            self.audit.record(self.name, "result", f"用户输入: {user_input}")

        response_parts = []
        # ---- 规划阶段（仅在不跳过时执行：非编排场景下 agent 自己规划）----
        if not skip_planning:
            needs_planning = self._needs_planning(user_input)
            if needs_planning:
                planning = await self._plan(user_input, on_event)
                self._emit_event("planning", {"content": planning}, on_event)
                response_parts.append(f"📋 **规划**: {planning}\n")
            else:
                response_parts.append(f"💬 **对话**: {user_input}\n")

        iteration = 0

        while iteration < self.max_iterations:
            iteration += 1

            # ---- THINK (推理) ----
            thought = await self._think(user_input, on_event)
            self._react_history.append({"type": "thought", "content": thought})
            if self.audit:
                self.audit.record(self.name, "thought", thought)
            response_parts.append(f"💭 **Thought {iteration}**: {thought}\n")
            self._emit_event(
                "thought", {"iteration": iteration, "content": thought}, on_event
            )

            # ---- 解析 ACTION ----
            action_info = self._parse_action(thought, iteration)

            if action_info is None:
                # LLM 认为任务完成（Final Answer）
                if not skip_report:
                    thoughts = [
                        item["content"]
                        for item in self._react_history
                        if item["type"] == "thought"
                    ]
                    observations = [
                        item["content"]
                        for item in self._react_history
                        if item["type"] == "observation"
                    ]
                    summary_agent = SummaryAgent()
                    conclusion = await summary_agent.process(
                        user_input=user_input,
                        thoughts=thoughts,
                        observations=observations,
                    )
                    if self.audit:
                        self.audit.record(self.name, "result", conclusion)
                    response_parts.append(f"\n{conclusion}")
                    self._emit_event("report", {"content": conclusion}, on_event)
                break

            tool_name = action_info.get("tool", "")
            tool_params = action_info.get("params", {})

            # ---- 检查工具是否存在 ----
            tool = self.tools_dict.get(tool_name)
            if not tool:
                obs = f"工具 '{tool_name}' 不存在。可用工具: {', '.join(self.tools_dict.keys())}"
                self._react_history.append({"type": "observation", "content": obs})
                if self.audit:
                    self.audit.record(self.name, "observation", obs)
                response_parts.append(
                    f"⚡ **Action {iteration}**: {tool_name}({tool_params})\n"
                )
                response_parts.append(f"👁️ **Observation {iteration}**: {obs}\n")
                continue

            # ---- 若有计划步骤则严格按顺序执行：仅允许执行“下一步”对应工具 ----
            next_todo = self._get_next_pending_todo()
            if next_todo and next_todo.get("tool_hint"):
                hint = (next_todo.get("tool_hint") or "").strip()
                if hint and tool_name != hint:
                    content = next_todo.get("content", next_todo.get("id", ""))
                    obs = f"必须按计划顺序执行。当前应执行: {content}，建议工具: {hint}。请使用该工具后再继续。"
                    self._react_history.append({"type": "observation", "content": obs})
                    if self.audit:
                        self.audit.record(self.name, "observation", obs)
                    response_parts.append(
                        f"⚡ **Action {iteration}**: {tool_name}({tool_params})\n"
                    )
                    response_parts.append(f"👁️ **Observation {iteration}**: {obs}\n")
                    continue

            # ---- 敏感操作确认（superhackbot）----
            sensitivity = getattr(tool, "sensitivity", "low")
            if not self.auto_execute and sensitivity == "high" and self.confirmation:
                option = ActionOption(
                    index=1,
                    tool_name=tool_name,
                    description=f"执行 {tool_name}: {tool.description}",
                    params=tool_params,
                    sensitivity=sensitivity,
                )
                proposal = self.confirmation.propose(thought, [option])
                self._waiting_for_confirm = True
                # 缓存当前迭代状态
                self._pending_iteration = iteration
                self._pending_response_parts = response_parts
                self._pending_user_input = user_input
                if self.audit:
                    self.audit.record(
                        self.name,
                        "action",
                        f"提出方案待确认: {tool_name}",
                        {"params": tool_params},
                    )
                return proposal

            # ---- 执行工具 ----
            response_parts.append(
                f"⚡ **Action {iteration}**: {tool_name}({tool_params})\n"
            )
            if self.audit:
                self.audit.record(
                    self.name, "action", f"执行: {tool_name}", {"params": tool_params}
                )

            # 触发工具开始事件
            self._emit_event(
                "action_start",
                {"iteration": iteration, "tool": tool_name, "params": tool_params},
                on_event,
            )

            logger.debug(f"process: 准备执行工具 {tool_name}, 参数 {tool_params}")
            result = await self._execute_tool(tool, tool_params)
            logger.debug(f"process: 工具执行结果 success={result.success}")

            # 触发工具结果事件
            self._emit_event(
                "action_result",
                {
                    "iteration": iteration,
                    "tool": tool_name,
                    "success": result.success,
                    "result": result.result if result.success else None,
                    "error": result.error if not result.success else None,
                },
                on_event,
            )

            obs = self._format_observation(result)
            self._react_history.append({"type": "observation", "content": obs})
            if self.audit:
                self.audit.record(
                    self.name,
                    "observation",
                    obs,
                    {"tool": tool_name, "success": result.success},
                )

            # 明确显示工具执行结果
            if result.success:
                response_parts.append(f"✅ **执行结果**:\n{obs}\n")
                # 按计划执行时，将当前步骤标记为已完成，以便下一步解锁
                self._mark_current_todo_completed(tool_name)
            else:
                response_parts.append(f"❌ **执行失败**: {result.error}\n")
            # 触发观察事件
            self._emit_event(
                "observation",
                {"iteration": iteration, "content": obs, "tool": tool_name},
                on_event,
            )

        else:
            response_parts.append(
                f"\n⚠️ 达到最大迭代次数 ({self.max_iterations})，停止执行。"
            )
            if self.audit:
                self.audit.record(self.name, "result", "达到最大迭代次数")

        # 如果没有明确的 Final Answer 且未跳过报告，自动生成结论和报告
        if not skip_report:
            has_final_answer = any(
                "Final Answer" in part
                or "final answer" in part.lower()
                or "📋 **最终结论和报告**" in part
                for part in response_parts
            )
            if not has_final_answer:
                thoughts = [
                    item["content"]
                    for item in self._react_history
                    if item["type"] == "thought"
                ]
                observations = [
                    item["content"]
                    for item in self._react_history
                    if item["type"] == "observation"
                ]
                summary_agent = SummaryAgent()
                conclusion = await summary_agent.process(
                    user_input=user_input, thoughts=thoughts, observations=observations
                )
                if conclusion:
                    response_parts.append(f"\n{conclusion}")
                    if self.audit:
                        self.audit.record(self.name, "result", conclusion)

        full_response = "\n".join(response_parts)
        self.add_message("assistant", full_response)
        return full_response

    async def handle_accept(self, choice: int = 1, on_event=None) -> str:
        """
        处理用户 /accept 确认。
        """
        if not self.confirmation or not self.confirmation.is_pending():
            return "当前没有待确认的操作。"

        selected = self.confirmation.accept(choice)
        if not selected:
            return f"无效的方案编号: {choice}"

        self._waiting_for_confirm = False
        if self.audit:
            self.audit.record(
                self.name,
                "confirm",
                f"用户确认方案 [{choice}]: {selected.tool_name}",
                {"params": selected.params},
            )

        tool = self.tools_dict.get(selected.tool_name)
        if not tool:
            return f"工具 '{selected.tool_name}' 不存在。"

        # 恢复执行
        iteration = getattr(self, "_pending_iteration", 0)
        response_parts = getattr(self, "_pending_response_parts", [])
        user_input = getattr(self, "_pending_user_input", "")

        response_parts.append(f"✅ 用户确认执行方案 [{choice}]\n")
        response_parts.append(
            f"⚡ **Action {iteration}**: {selected.tool_name}({selected.params})\n"
        )

        if self.audit:
            self.audit.record(
                self.name,
                "action",
                f"执行已确认: {selected.tool_name}",
                {"params": selected.params},
            )

        # 触发工具开始事件
        self._emit_event(
            "action_start",
            {
                "iteration": iteration,
                "tool": selected.tool_name,
                "params": selected.params,
            },
            on_event,
        )

        result = await self._execute_tool(tool, selected.params)

        # 触发工具结果事件
        self._emit_event(
            "action_result",
            {
                "iteration": iteration,
                "tool": selected.tool_name,
                "success": result.success,
                "result": result.result if result.success else None,
                "error": result.error if not result.success else None,
            },
            on_event,
        )

        obs = self._format_observation(result)
        self._react_history.append({"type": "observation", "content": obs})
        if self.audit:
            self.audit.record(
                self.name,
                "observation",
                obs,
                {"tool": selected.tool_name, "success": result.success},
            )
        response_parts.append(f"👁️ **Observation {iteration}**: {obs}\n")

        # 继续 ReAct 循环
        iteration += 1
        while iteration <= self.max_iterations:
            thought = await self._think(user_input, on_event)
            self._react_history.append({"type": "thought", "content": thought})
            if self.audit:
                self.audit.record(self.name, "thought", thought)
            response_parts.append(f"💭 **Thought {iteration}**: {thought}\n")

            action_info = self._parse_action(thought)
            if action_info is None:
                if not getattr(self, "_skip_report", False):
                    thoughts = [
                        item["content"]
                        for item in self._react_history
                        if item["type"] == "thought"
                    ]
                    observations = [
                        item["content"]
                        for item in self._react_history
                        if item["type"] == "observation"
                    ]
                    summary_agent = SummaryAgent()
                    conclusion = await summary_agent.process(
                        user_input=user_input,
                        thoughts=thoughts,
                        observations=observations,
                    )
                    if self.audit:
                        self.audit.record(self.name, "result", conclusion)
                    response_parts.append(f"\n{conclusion}")
                    self._emit_event("report", {"content": conclusion}, on_event)
                break

            t_name = action_info.get("tool", "")
            t_params = action_info.get("params", {})
            t = self.tools_dict.get(t_name)

            if not t:
                obs = f"工具 '{t_name}' 不存在。"
                self._react_history.append({"type": "observation", "content": obs})
                response_parts.append(
                    f"⚡ **Action {iteration}**: {t_name}({t_params})\n"
                )
                response_parts.append(f"👁️ **Observation {iteration}**: {obs}\n")
                iteration += 1
                continue

            sens = getattr(t, "sensitivity", "low")
            if not self.auto_execute and sens == "high" and self.confirmation:
                option = ActionOption(
                    index=1,
                    tool_name=t_name,
                    description=f"执行 {t_name}: {t.description}",
                    params=t_params,
                    sensitivity=sens,
                )
                proposal = self.confirmation.propose(thought, [option])
                self._waiting_for_confirm = True
                self._pending_iteration = iteration
                self._pending_response_parts = response_parts
                self._pending_user_input = user_input
                if self.audit:
                    self.audit.record(
                        self.name,
                        "action",
                        f"提出方案待确认: {t_name}",
                        {"params": t_params},
                    )
                return "\n".join(response_parts) + "\n\n" + proposal

            response_parts.append(f"⚡ **Action {iteration}**: {t_name}({t_params})\n")
            if self.audit:
                self.audit.record(
                    self.name, "action", f"执行: {t_name}", {"params": t_params}
                )

            # 触发工具开始事件
            self._emit_event(
                "action_start",
                {"iteration": iteration, "tool": t_name, "params": t_params},
                on_event,
            )

            result = await self._execute_tool(t, t_params)

            # 触发工具结果事件
            self._emit_event(
                "action_result",
                {
                    "iteration": iteration,
                    "tool": t_name,
                    "success": result.success,
                    "result": result.result if result.success else None,
                    "error": result.error if not result.success else None,
                },
                on_event,
            )

            obs = self._format_observation(result)
            self._react_history.append({"type": "observation", "content": obs})
            if self.audit:
                self.audit.record(
                    self.name,
                    "observation",
                    obs,
                    {"tool": t_name, "success": result.success},
                )
            response_parts.append(f"👁️ **Observation {iteration}**: {obs}\n")
            iteration += 1

        full_response = "\n".join(response_parts)
        self.add_message("assistant", full_response)
        return full_response

    async def handle_reject(self) -> str:
        """处理用户 /reject 拒绝。"""
        if not self.confirmation:
            return "当前模式不需要确认操作。"
        if not self.confirmation.is_pending():
            return "当前没有待确认的操作。"

        self.confirmation.reject()
        self._waiting_for_confirm = False
        if self.audit:
            self.audit.record(self.name, "reject", "用户拒绝了方案")
        return "已拒绝当前方案。请重新描述需求，我会为您重新分析。"

    # ---- 内部方法 ----

    def _needs_planning(self, user_input: str) -> bool:
        """
        判断是否需要制定计划。
        简单问候、闲聊等不需要制定计划，只有明确的指令才需要。
        """
        user_input_lower = user_input.strip().lower()

        # 简单问候语
        greetings = [
            "你好",
            "hello",
            "hi",
            "hey",
            "早上好",
            "下午好",
            "晚上好",
            "谢谢",
            "thanks",
            "thank you",
            "再见",
            "bye",
            "拜拜",
        ]

        # 如果只是问候，不需要制定计划
        if any(
            user_input_lower.startswith(g) or user_input_lower == g for g in greetings
        ):
            return False

        # 如果输入很短（少于10个字符）且不包含明确的动作词，可能是简单对话
        if len(user_input.strip()) < 10:
            action_keywords = [
                "扫描",
                "测试",
                "检查",
                "执行",
                "运行",
                "分析",
                "检测",
                "scan",
                "test",
                "check",
                "execute",
                "run",
                "analyze",
                "detect",
                "攻击",
                "exploit",
                "explore",
                "find",
                "search",
                "list",
                "show",
            ]
            if not any(keyword in user_input_lower for keyword in action_keywords):
                return False

        # 其他情况需要制定计划
        return True

    async def _plan(self, user_input: str, on_event=None) -> str:
        """规划阶段：分析任务，制定执行计划"""
        tools_desc = self._get_tools_description()

        planning_prompt = f"""你是一个安全测试专家。请分析用户请求，制定详细的执行计划。

## 用户请求
{user_input}

## 可用工具
{tools_desc}

## 规划要求
请制定一个详细的执行计划，包括：
1. 任务目标分析
2. 需要执行的步骤
3. 使用的工具和顺序
4. 预期结果

请输出规划："""

        messages = [
            SystemMessage(content=self.system_prompt),
            HumanMessage(content=planning_prompt),
        ]

        try:
            plan = await self._call_llm(messages)
            return plan
        except Exception as e:
            logger.error(f"规划阶段出错: {e}")
            return f"分析任务: {user_input}，准备执行安全测试。"

    async def _think(self, user_input: str, on_event=None) -> str:
        """调用 LLM 进行推理，输出 Thought（含可能的 Action JSON）。"""
        history_text = ""
        for item in self._react_history:
            t = item["type"].upper()
            history_text += f"\n[{t}] {item['content']}"

        tools_desc = self._get_tools_description()

        # 若有当前计划步骤，生成完成情况说明，并强调“未完成不输出 Final Answer”
        todos_section = ""
        if getattr(self, "_current_todos", None):
            lines = []
            for td in self._current_todos:
                c = td.get("content", td.get("id", ""))
                s = td.get("status", "pending")
                icon = {
                    "completed": "[x]",
                    "in_progress": "[~]",
                    "cancelled": "[-]",
                }.get(s, "[ ]")
                lines.append(f"  {icon} {c}")
            todos_section = (
                "\n## 当前计划步骤（完成前勿输出 Final Answer）\n"
                + "\n".join(lines)
                + """

**重要**：在未完成上述所有计划步骤、或已明确说明某步无法完成（如工具失败）的原因前，不要输出 Final Answer。若某步失败导致无法继续，可在 Final Answer 中说明并列出未完成项。
"""
            )

        prompt = f"""你是一个安全测试专家，使用 ReAct 模式工作。

{tools_desc}

## 输出格式

每次推理请严格按以下格式之一输出：

### 需要调用工具时：
Thought: <你的分析和推理>
Action: {{"tool": "<工具名>", "params": {{<参数JSON>}}}}

### 任务完成时（不再需要工具）：
Thought: <你的分析>
Final Answer: <最终结论和报告>

## 重要指导原则

1. **持续执行**：除非你已经收集到足够的信息来完成用户的请求，否则不要输出 Final Answer。保持 ReAct 循环继续。

2. **信息收集**：只有当以下条件满足时才输出 Final Answer：
   - 你已经执行了必要的扫描和测试
   - 你已经分析了所有相关的结果
   - 你可以提供完整的安全评估报告

3. **报告要求**：Final Answer 必须包含：
   - **任务总结**：简要总结完成的工作
   - **发现的问题**：列出发现的所有安全问题和漏洞
   - **风险评估**：对每个问题给出风险等级（高/中/低）
   - **修复建议**：针对每个问题提供具体的修复建议
   - **综合结论**：整体安全状况评估和总结

4. **不要过早结束**：如果你只进行了一两次工具调用，很可能还没有收集到足够信息。继续思考下一步需要做什么。
{todos_section}
## 当前任务

用户请求: {user_input}

## 历史记录
{history_text if history_text else "(无)"}

请继续推理："""

        messages = [
            SystemMessage(content=self.system_prompt),
            HumanMessage(content=prompt),
        ]

        self._emit_event(
            "thought_start", {"iteration": len(self._react_history) + 1}, on_event
        )
        if on_event:
            # 使用流式LLM调用
            thought = await self._call_llm_stream(messages, on_event)
        else:
            # 非流式调用
            thought = await self._call_llm(messages)
        self._emit_event("thought_end", {"thought": thought}, on_event)

        return thought

    def _parse_action(
        self, thought: str, iteration: int = 0
    ) -> Optional[Dict[str, Any]]:
        """
        从 LLM 输出中解析 Action JSON。
        如果输出包含 Final Answer 则返回 None。
        支持嵌套花括号（如 "params": {"category": "process"}）。
        """
        if "Final Answer:" in thought or "final answer:" in thought.lower():
            return None

        # 1) 定位 Action: 后的第一个 {
        action_label = re.search(r"Action:\s*\{", thought, re.IGNORECASE)
        if action_label:
            start = action_label.end() - 1  # 从 { 开始
            depth = 0
            for i in range(start, len(thought)):
                if thought[i] == "{":
                    depth += 1
                elif thought[i] == "}":
                    depth -= 1
                    if depth == 0:
                        try:
                            return json.loads(thought[start : i + 1])
                        except json.JSONDecodeError:
                            break
            # 若括号匹配失败，继续尝试其他方式
        # 2) 任意位置匹配包含 "tool" 的平衡花括号 JSON
        for match in re.finditer(r"\{", thought):
            start = match.start()
            depth = 0
            for i in range(start, len(thought)):
                if thought[i] == "{":
                    depth += 1
                elif thought[i] == "}":
                    depth -= 1
                    if depth == 0:
                        snippet = thought[start : i + 1]
                        if '"tool"' in snippet or "'tool'" in snippet:
                            try:
                                obj = json.loads(snippet)
                                if isinstance(obj, dict) and "tool" in obj:
                                    return obj
                            except json.JSONDecodeError:
                                pass
                        break
        return None

    async def _execute_tool(self, tool: BaseTool, params: Dict[str, Any]) -> ToolResult:
        """执行工具调用。对 execute_command 且含 sudo 时按 root 策略处理密码。"""
        import sys
        from utils.root_policy import load_root_policy, needs_root_password

        if tool.name == "execute_command" and sys.platform != "win32":
            command = (params.get("command") or "").strip()
            policy_data = load_root_policy()
            root_cmd = policy_data.get("root_command", "sudo")
            policy = policy_data.get("root_policy", "ask")

            if needs_root_password(command, root_cmd):
                if policy == "ask" and getattr(self, "_get_root_password", None):
                    get_pwd = self._get_root_password
                    try:
                        password = await get_pwd(command) if callable(get_pwd) else None
                    except Exception as e:
                        logger.warning(f"获取 root 密码时出错: {e}")
                        password = None
                    if not password:
                        return ToolResult(
                            success=False,
                            result=None,
                            error="需要 root 权限但未提供密码（已取消或未输入）。可使用 /root-config always 配置为不询问。",
                        )
                    # 使用 sudo -S 从 stdin 读密码，避免密码出现在命令行
                    rest = command[len(root_cmd) :].strip()
                    params = dict(params)
                    params["command"] = f"{root_cmd} -S -p '' -- {rest}" if rest else f"{root_cmd} -S -p '' -- true"
                    params["stdin_data"] = password + "\n"
                # policy == "always_allow" 时直接执行原命令，不注入密码

        log_params = {k: v for k, v in params.items() if k != "stdin_data"}
        logger.info(f"执行工具: {tool.name}, 参数: {log_params}")
        try:
            result = await tool.execute(**params)
            logger.info(f"工具 {tool.name} 执行成功: {result.success}")
            if not result.success:
                logger.error(f"工具 {tool.name} 执行失败: {result.error}")
                # 检测权限相关错误并提供更好的提示
                error_msg = result.error or ""
                if any(
                    keyword in error_msg
                    for keyword in [
                        "Permission denied",
                        "could not open /dev",
                        "running Scapy as root",
                        "sudo",
                        "Operation not permitted",
                        "Need root privileges",
                        "must be run as root",
                    ]
                ):
                    # 构建增强的错误信息
                    hint_msg = self._get_permission_hint(tool.name, error_msg)
                    result.error = f"{error_msg}\n\n{hint_msg}"
            return result
        except Exception as e:
            logger.error(f"工具 {tool.name} 执行失败: {e}")
            error_msg = str(e)
            hint = self._get_permission_hint(tool.name, error_msg)
            enhanced_error = f"{error_msg}\n\n{hint}" if hint else error_msg
            return ToolResult(success=False, result=None, error=enhanced_error)

    def _get_permission_hint(self, tool_name: str, error_msg: str) -> str:
        """根据工具和错误信息生成权限相关的提示"""
        hints = {
            "arp_scan": [
                "💡 提示: 此工具需要网络接口的直接访问权限。",
                "请尝试以下解决方案之一:",
                "  1. 使用 sudo 运行: sudo python -m ...",
                "  2. 或者使用系统命令方式（无需 root）: pip install scapy 时未安装依赖",
                "  3. 检查是否有其他网络工具占用了接口",
            ],
            "nmap_scan": [
                "💡 提示: Nmap 需要 root 权限进行原始数据包扫描。",
                "请尝试: sudo nmap ...",
            ],
            "packet_capture": [
                "💡 提示: 数据包捕获需要 root 权限或适当的能力。",
                "请尝试: sudo python ...",
            ],
        }

        tool_hints = hints.get(tool_name, [])
        if not tool_hints:
            # 通用权限提示
            tool_hints = [
                "💡 提示: 此操作可能需要管理员权限。",
                "如需继续，请使用 sudo 重新运行命令。",
            ]

        return "\n".join(tool_hints)

    def _get_next_pending_todo(self) -> Optional[Dict[str, Any]]:
        """返回当前计划中下一个应执行的步骤：status 为 pending 且依赖项均已完成。"""
        todos = getattr(self, "_current_todos", None) or []
        completed_ids = set()
        for td in todos:
            s = (
                td.get("status")
                if isinstance(td, dict)
                else getattr(td, "status", None)
            )
            if s == "completed":
                completed_ids.add(
                    td.get("id") if isinstance(td, dict) else getattr(td, "id", "")
                )
        for td in todos:
            if isinstance(td, dict):
                if td.get("status") != "pending":
                    continue
                deps = td.get("depends_on") or []
                if not all(d in completed_ids for d in deps):
                    continue
                return td
            if hasattr(td, "status") and getattr(td, "status", None) == "pending":
                deps = getattr(td, "depends_on", None) or []
                if not all(d in completed_ids for d in deps):
                    continue
                return {
                    "id": getattr(td, "id", ""),
                    "content": getattr(td, "content", ""),
                    "status": "pending",
                    "tool_hint": getattr(td, "tool_hint", None),
                    "depends_on": deps,
                }
        return None

    def _mark_current_todo_completed(self, tool_name: str):
        """将“当前应执行”的那一步（与 tool_name 匹配或为首个 pending）标记为已完成。"""
        todos = getattr(self, "_current_todos", None)
        if not todos or not isinstance(todos, list):
            return
        for i, td in enumerate(todos):
            if not isinstance(td, dict):
                continue
            if td.get("status") != "pending":
                continue
            hint = (td.get("tool_hint") or "").strip()
            if hint and hint != tool_name:
                continue
            todos[i] = {**td, "status": "completed"}
            logger.debug(f"计划步骤已标记完成: {td.get('id')} (工具 {tool_name})")
            return
        # 若无 tool_hint 匹配，将第一个 pending 标为完成
        for i, td in enumerate(todos):
            if isinstance(td, dict) and td.get("status") == "pending":
                todos[i] = {**td, "status": "completed"}
                logger.debug(f"计划步骤已标记完成: {td.get('id')}")
                return

    def _format_observation(self, result: "ToolResult") -> str:
        """格式化工具执行结果。"""
        if result.success:
            tool_output = result.result
            if isinstance(tool_output, dict):
                lines = []
                for key, value in tool_output.items():
                    if isinstance(value, list):
                        lines.append(f"  {key}: {len(value)} 项")
                        for item in value[:5]:
                            lines.append(f"    - {item}")
                        if len(value) > 5:
                            lines.append(f"    ... (共 {len(value)} 项)")
                    elif isinstance(value, dict):
                        lines.append(f"  {key}:")
                        for k, v in value.items():
                            lines.append(f"    {k}: {v}")
                    else:
                        lines.append(f"  {key}: {value}")
                return "\n".join(lines)
            elif isinstance(tool_output, list):
                if len(tool_output) <= 10:
                    return "结果:\n" + "\n".join(f"  • {item}" for item in tool_output)
                else:
                    return (
                        f"结果: {len(tool_output)} 项\n"
                        + "\n".join(f"  • {item}" for item in tool_output[:10])
                        + f"\n  ... (共 {len(tool_output)} 项)"
                    )
            else:
                return f"结果: {tool_output}"
        return f"❌ 执行失败: {result.error}"
