"""
SecurityReActAgent：LLM 驱动的安全测试 ReAct 引擎
支持自动执行（secbot-cli）和用户确认（superhackbot）两种模式。
"""

import json
import re
import asyncio
import time
from datetime import datetime
from pathlib import Path
from typing import Optional, List, Dict, Any

from secbot_agent.core.agents.base import BaseAgent
from secbot_agent.core.agents.summary_agent import SummaryAgent
from tools.base import BaseTool, ToolResult
from utils.audit import AuditTrail
from utils.confirmation import UserConfirmation, ActionOption
from utils.context_info import get_agent_context_block
from utils.logger import logger

try:
    from langchain_ollama import ChatOllama
except ImportError:
    from langchain_community.chat_models import ChatOllama
try:
    from langchain_openai import ChatOpenAI
except ImportError:
    ChatOpenAI = None

# Anthropic（可选依赖）
try:
    from langchain_anthropic import ChatAnthropic
except ImportError:
    ChatAnthropic = None

# Google Gemini（可选依赖）
try:
    from langchain_google_genai import ChatGoogleGenerativeAI
except ImportError:
    ChatGoogleGenerativeAI = None

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import SystemMessage, HumanMessage
from pydantic import SecretStr
from hackbot_config import settings, get_provider_api_key
from utils.model_selector import get_provider_config, get_default_model_for_provider, get_base_url_for_provider


REACT_OPERATING_POLICY = (
    "【工作模式】执行优先：在具备授权前提下优先给出可落地步骤、命令和工具调用；"
    "若缺关键参数，先提出最少澄清问题再继续。\n"
    "【上下文约束】必须优先使用已提供的 RecentSession / SQLiteHistory / VectorMemory；"
    "不得忽略上下文重复询问已知信息。\n"
    "【安全边界】禁止无授权的破坏性/越权攻击；涉及高风险命令时先说明影响并给出确认建议。\n"
    "【输出要求】每轮给出：当前结论、依据证据、下一步动作。"
)


def _auto_cleanup_invalid_key(exc: Exception, provider: str) -> None:
    """
    运行时无效 Key 自清理 —— 与 npm 端 onInvalidPersistedApiKey 回调对齐。
    当 LLM 调用因 401/403/auth 失败时，自动删除 SQLite 中持久化的 API Key。
    """
    from hackbot_config import delete_provider_api_key, _get_config_from_sqlite
    err_str = str(exc).lower()
    auth_keywords = ("401", "unauthorized", "authentication", "invalid api key", "api_key", "forbidden", "403")
    if any(kw in err_str for kw in auth_keywords):
        sqlite_key = _get_config_from_sqlite(f"{provider}_api_key")
        if sqlite_key:
            logger.warning(f"检测到 {provider} API Key 无效（{type(exc).__name__}），自动清理持久化密钥")
            delete_provider_api_key(provider)


def _create_llm(
    provider: Optional[str] = None,
    model: Optional[str] = None,
    temperature: Optional[float] = None,
) -> BaseChatModel:
    """
    创建 LLM 实例，支持多厂商：
    - ollama: 本地 Ollama
    - groq / openrouter: 免费档云端（OpenAI 兼容）
    - openai 兼容: deepseek/openai/zhipu/qwen/moonshot/baichuan/yi/scnet/hunyuan/doubao/spark/wenxin/stepfun/minimax/langboat/mianbi/together/fireworks/mistral/cohere/xai/azure_openai/custom
    - anthropic: Anthropic Claude
    - google: Google Gemini
    """
    p = (provider or settings.llm_provider or "deepseek").strip().lower()

    # --- Ollama ---
    if p == "ollama":
        return ChatOllama(
            base_url=settings.ollama_base_url,
            model=model or settings.ollama_model,
            temperature=temperature if temperature is not None else settings.ollama_temperature,
        )

    # --- 查找厂商配置 ---
    config = get_provider_config(p)
    if config is None:
        raise ValueError(
            f"不支持的推理后端: {p}，可用: ollama/groq/openrouter/deepseek/openai/anthropic/google/zhipu/qwen/moonshot/baichuan/yi/scnet/hunyuan/doubao/spark/wenxin/stepfun/minimax/langboat/mianbi/together/fireworks/mistral/cohere/xai/azure_openai/custom"
        )

    provider_type = config.get("type", "openai_compatible")

    # --- Anthropic (Claude) ---
    if provider_type == "anthropic":
        if ChatAnthropic is None:
            raise ImportError(
                "需安装 langchain-anthropic: pip install langchain-anthropic")
        api_key = get_provider_api_key(p)
        if not api_key:
            raise ValueError(f"请先配置 {config['name']} API Key（使用 /model 命令）")
        resolved_model = (model or get_default_model_for_provider(p)).strip()
        kwargs = dict(
            api_key=SecretStr(api_key),
            model=resolved_model,
        )
        if temperature is not None:
            kwargs["temperature"] = temperature
        return ChatAnthropic(**kwargs)

    # --- Google (Gemini) ---
    if provider_type == "google":
        if ChatGoogleGenerativeAI is None:
            raise ImportError(
                "需安装 langchain-google-genai: pip install langchain-google-genai")
        api_key = get_provider_api_key(p)
        if not api_key:
            raise ValueError(f"请先配置 {config['name']} API Key（使用 /model 命令）")
        resolved_model = (model or get_default_model_for_provider(p)).strip()
        kwargs = dict(
            google_api_key=api_key,
            model=resolved_model,
        )
        if temperature is not None:
            kwargs["temperature"] = temperature
        return ChatGoogleGenerativeAI(**kwargs)

    # --- OpenAI API 兼容（deepseek / openai / zhipu / qwen / moonshot / baichuan / yi / custom）---
    if ChatOpenAI is None:
        raise ImportError("需安装 langchain-openai: pip install langchain-openai")

    api_key = get_provider_api_key(p)
    if not api_key:
        raise ValueError(f"请先配置 {config['name']} API Key（使用 /model 命令）")

    base_url = get_base_url_for_provider(p)
    if not base_url:
        raise ValueError(f"请先配置 {config['name']} Base URL（使用 /model 命令）")

    resolved_model = (model or get_default_model_for_provider(p)).strip()

    # DeepSeek reasoner 特殊处理
    if p == "deepseek" and resolved_model.lower() == "reasoner":
        resolved_model = settings.deepseek_reasoner_model

    # deepseek-reasoner / o1 / o3 等推理模型不支持 temperature
    is_reasoning_model = any(kw in resolved_model.lower()
                             for kw in ("reasoner", "o1", "o3"))

    kwargs = dict(
        api_key=SecretStr(api_key),
        base_url=base_url,
        model=resolved_model,
    )
    if not is_reasoning_model:
        kwargs["temperature"] = temperature if temperature is not None else 0.7
    return ChatOpenAI(**kwargs)


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
        self.tools_dict: Dict[str, BaseTool] = {
            t.name: t for t in self.security_tools}
        self.auto_execute = auto_execute
        self.max_iterations = max_iterations
        self.audit = audit_trail
        self.confirmation = UserConfirmation() if not auto_execute else None

        # EventBus（可选，用于 UI 集成）
        self.event_bus = event_bus

        # LLM
        self._provider_override: Optional[str] = None
        self._model_override: Optional[str] = None
        self.llm = _create_llm()

        # ReAct 状态
        # 当前任务的 think/act/obs 历史
        self._react_history: List[Dict[str, str]] = []
        self._waiting_for_confirm = False
        self._skip_report = (
            False  # 由 process(skip_report=True) 设置，供 handle_accept 使用
        )
        # 当前会话的摘要式上下文（每轮推理后提取，供后续轮参考）
        self._session_context_summary: str = ""
        self._session_context_max_chars: int = 4500

        # 并发控制：同一智能体同一时间只处理一个核心任务，请求自动排队
        self._concurrency_lock: asyncio.Lock = asyncio.Lock()

    def append_turn_to_session_context(
        self,
        user_input: str,
        plan_summary: str,
        summary: Optional[Any] = None,
    ) -> None:
        """
        将本轮对话的摘要式信息追加到当前会话上下文中，供后续推理参考。
        每轮任务（规划→执行→摘要）结束后由 SessionManager 调用。
        """
        parts = [f"【本轮】请求: {user_input.strip()[:200]}"]
        if plan_summary and plan_summary.strip():
            parts.append(f"计划: {plan_summary.strip()[:300]}")
        if summary is not None:
            task_summary = getattr(summary, "task_summary", None) or ""
            if task_summary:
                parts.append(f"摘要: {task_summary.strip()[:400]}")
            key_findings = getattr(summary, "key_findings", None) or []
            if key_findings:
                findings_str = "; ".join(str(f)[:80] for f in key_findings[:3])
                parts.append(f"关键发现: {findings_str}")
            conclusion = getattr(summary, "overall_conclusion", None) or ""
            if conclusion:
                parts.append(f"结论: {conclusion.strip()[:200]}")
        block = " | ".join(parts)
        self._session_context_summary = (
            (self._session_context_summary + "\n\n" + block).strip()
        )
        if len(self._session_context_summary) > self._session_context_max_chars:
            self._session_context_summary = self._session_context_summary[
                -self._session_context_max_chars:
            ].strip()
            first_nl = self._session_context_summary.find("\n\n")
            if first_nl > 0:
                self._session_context_summary = self._session_context_summary[first_nl + 2:]

    def _emit_event(self, event_type: str, data: dict, on_event=None):
        """触发事件回调，同时发射到 EventBus（如果已配置）

        为所有事件自动附加 agent 字段，标记事件来源的智能体：
        - 优先使用 self.agent_type（子 Agent 可自定义）
        - 其次回退到 self.name
        """
        # 确保不会就地修改上层传入的 data
        payload = dict(data or {})
        if "agent" not in payload:
            agent_label = getattr(self, "agent_type",
                                  None) or getattr(self, "name", "")
            if agent_label:
                payload["agent"] = agent_label

        # 传统回调方式（向后兼容）
        if on_event and callable(on_event):
            try:
                on_event(event_type, payload)
            except Exception as e:
                logger.error(f"事件回调错误: {e}")

        # EventBus 方式（UI 集成）
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
                    iteration = payload.get("iteration", 0)
                    self.event_bus.emit(
                        Event(
                            type=mapped,
                            data=payload,
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
        p = self._provider_override or settings.llm_provider or "deepseek"
        m = self._model_override
        self.llm = _create_llm(provider=p, model=m)
        self.model = m or get_default_model_for_provider(p)
        logger.info(f"已切换推理模型: {self.get_current_model()}")
        return self.get_current_model()

    def get_current_model(self) -> str:
        p = (
            (self._provider_override or settings.llm_provider or "deepseek")
            .strip()
            .lower()
        )
        m = self._model_override or get_default_model_for_provider(p)
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

        llm_logger = logger.bind(
            agent=getattr(self, "agent_type", getattr(self, "name", "-")),
            event="llm_call_start",
            attempt=1,
        )
        started = time.perf_counter()
        llm_logger.info("llm non-stream invoke started")
        try:
            response = await asyncio.wait_for(self.llm.ainvoke(messages), timeout=30.0)
        except Exception as e:
            duration_ms = int((time.perf_counter() - started) * 1000)
            logger.bind(
                agent=getattr(self, "agent_type", getattr(self, "name", "-")),
                event="llm_error",
                duration_ms=duration_ms,
                attempt=1,
            ).error(f"LLM 调用失败: {e}")
            provider = (
                self._provider_override
                or getattr(settings, "llm_provider", None)
                or "ollama"
            )
            # 无效 Key 自清理：与 npm onInvalidPersistedApiKey 对齐
            _auto_cleanup_invalid_key(e, provider)
            hint = get_llm_connection_hint(e, provider=provider)
            return f"[LLM 调用失败: {hint}]"

        duration_ms = int((time.perf_counter() - started) * 1000)
        logger.bind(
            agent=getattr(self, "agent_type", getattr(self, "name", "-")),
            event="llm_call_end",
            duration_ms=duration_ms,
            attempt=1,
        ).info("llm non-stream invoke finished")
        if hasattr(response, "content") and response.content:
            return str(response.content)
        return str(response)

    def _emit_full_response_as_chunk(
        self,
        full_response: str,
        on_event,
        iteration: Optional[int] = None,
    ) -> None:
        """将完整回复作为单次 thought_chunk 发送，兼容非流式 API 的交互逻辑。"""
        if full_response and full_response.strip():
            payload = {"chunk": full_response}
            if iteration is not None:
                payload["iteration"] = iteration
            self._emit_event("thought_chunk", payload, on_event)

    async def _call_llm_non_stream(self, messages: List, timeout: float = 60.0) -> str:
        """非流式调用 LLM，返回完整文本。用于流式不可用或 API 仅返回整段内容时的回退。"""
        import asyncio

        response = await asyncio.wait_for(
            self.llm.ainvoke(messages), timeout=timeout
        )
        if isinstance(response, str):
            return response.strip()
        if hasattr(response, "content") and response.content is not None:
            return str(response.content).strip()
        return str(response).strip()

    async def _call_llm_stream(
        self,
        messages: List,
        on_event=None,
        iteration: Optional[int] = None,
    ) -> str:
        """流式调用 LLM，触发事件；若 API 不返回流式 chunk 则自动回退到非流式。"""
        import asyncio

        try:
            full_response = ""
            chunk_count = 0
            emit_buffer = ""
            stream_started = time.perf_counter()
            if hasattr(self.llm, "astream"):
                try:
                    async for chunk in self.llm.astream(messages):
                        content_chunk = None
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
                            chunk_count += 1
                            emit_buffer += content_chunk

                            # 将 token/小块聚合成可读语义段后再发送，避免前端看到碎片化推理文本
                            min_chars = max(int(getattr(settings, "thought_chunk_min_chars", 80)), 20)
                            end_punctuations = (".", "!", "?", "。", "！", "？", "\n")
                            should_emit = (
                                len(emit_buffer) >= min_chars
                                and (
                                    emit_buffer.rstrip().endswith(end_punctuations)
                                    or len(emit_buffer) >= min_chars * 2
                                )
                            )
                            if should_emit and emit_buffer.strip():
                                payload = {"chunk": emit_buffer}
                                if iteration is not None:
                                    payload["iteration"] = iteration
                                self._emit_event("thought_chunk", payload, on_event)
                                emit_buffer = ""
                except Exception as stream_err:
                    err_str = str(stream_err).lower()
                    if "generation chunks" in err_str or "no generation chunks" in err_str:
                        logger.bind(
                            event="llm_fallback",
                            agent=getattr(self, "agent_type", getattr(self, "name", "-")),
                            attempt=1,
                        ).info(
                            f"流式未返回 chunk，回退到非流式: {stream_err}"
                        )
                        full_response = await self._call_llm_non_stream(
                            messages, timeout=60.0
                        )
                        self._emit_full_response_as_chunk(
                            full_response,
                            on_event,
                            iteration=iteration,
                        )
                        return full_response
                    raise stream_err

                # 流结束时把尾部缓冲区补发，确保不丢最后一段语义
                if emit_buffer.strip():
                    payload = {"chunk": emit_buffer}
                    if iteration is not None:
                        payload["iteration"] = iteration
                    self._emit_event("thought_chunk", payload, on_event)
                    emit_buffer = ""

                # 流式迭代结束但没有任何 chunk（部分 API 直接返回整段内容而不走 stream）
                if not full_response.strip():
                    full_response = await self._call_llm_non_stream(
                        messages, timeout=60.0
                    )
                    self._emit_full_response_as_chunk(
                        full_response,
                        on_event,
                        iteration=iteration,
                    )
            else:
                full_response = await self._call_llm_non_stream(
                    messages, timeout=10.0
                )
                self._emit_full_response_as_chunk(
                    full_response,
                    on_event,
                    iteration=iteration,
                )
            logger.bind(
                event="llm_call_end",
                agent=getattr(self, "agent_type", getattr(self, "name", "-")),
                duration_ms=int((time.perf_counter() - stream_started) * 1000),
                attempt=1,
            ).info("llm stream invoke finished")
            return full_response
        except Exception as e:
            err_str = str(e).lower()
            if "generation chunks" in err_str or "no generation chunks" in err_str:
                try:
                    logger.bind(event="llm_fallback", attempt=1).info(f"流式报错「无 generation chunks」，回退到非流式: {e}")
                    full_response = await self._call_llm_non_stream(
                        messages, timeout=60.0
                    )
                    self._emit_full_response_as_chunk(
                        full_response,
                        on_event,
                        iteration=iteration,
                    )
                    return full_response
                except Exception as fallback_err:
                    logger.bind(event="llm_error", attempt=1).error(f"非流式回退也失败: {fallback_err}")
                    e = fallback_err

            if "model_dump" in str(e).lower():
                try:
                    from utils.llm_http_fallback import (
                        chat_completions_request,
                        langchain_messages_to_dicts,
                    )
                    logger.bind(event="llm_fallback", attempt=1).info("LLM 调用触发 model_dump，改用 HTTP 直连回退")
                    payload = langchain_messages_to_dicts(messages)
                    full_response = await chat_completions_request(
                        payload, max_tokens=4096, timeout=60.0
                    )
                    self._emit_full_response_as_chunk(
                        full_response,
                        on_event,
                        iteration=iteration,
                    )
                    return full_response
                except Exception as http_err:
                    logger.bind(event="llm_error", attempt=1).error(f"HTTP 回退失败: {http_err}")
                    e = http_err

            from utils.model_selector import get_llm_connection_hint

            logger.bind(event="llm_error", attempt=1).error(f"LLM 流式调用失败: {e}")
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
                    self._emit_event(
                        "report", {"content": conclusion}, on_event)
                break

            tool_name = action_info.get("tool", "")
            tool_params = action_info.get("params", {})

            # ---- 检查工具是否存在 ----
            tool = self.tools_dict.get(tool_name)
            if not tool:
                obs = f"工具 '{tool_name}' 不存在。可用工具: {', '.join(self.tools_dict.keys())}"
                self._react_history.append(
                    {"type": "observation", "content": obs})
                if self.audit:
                    self.audit.record(self.name, "observation", obs)
                response_parts.append(
                    f"⚡ **Action {iteration}**: {tool_name}({tool_params})\n"
                )
                response_parts.append(
                    f"👁️ **Observation {iteration}**: {obs}\n")
                continue

            # ---- 若有计划步骤则严格按顺序执行：仅允许执行“下一步”对应工具 ----
            next_todo = self._get_next_pending_todo()
            if next_todo and next_todo.get("tool_hint"):
                hint = (next_todo.get("tool_hint") or "").strip()
                if hint and tool_name != hint:
                    content = next_todo.get("content", next_todo.get("id", ""))
                    obs = f"必须按计划顺序执行。当前应执行: {content}，建议工具: {hint}。请使用该工具后再继续。"
                    self._react_history.append(
                        {"type": "observation", "content": obs})
                    if self.audit:
                        self.audit.record(self.name, "observation", obs)
                    response_parts.append(
                        f"⚡ **Action {iteration}**: {tool_name}({tool_params})\n"
                    )
                    response_parts.append(
                        f"👁️ **Observation {iteration}**: {obs}\n")
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
                    self.name, "action", f"执行: {tool_name}", {
                        "params": tool_params}
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
                    "view_type": "raw",
                },
                on_event,
            )

            summary_text = await self._summarize_tool_result_for_user(
                user_input=user_input,
                tool_name=tool_name,
                tool_params=tool_params,
                result=result,
                iteration=iteration,
            )
            self._emit_event(
                "content",
                {
                    "iteration": iteration,
                    "content": summary_text,
                    "tool": tool_name,
                    "view_type": "summary",
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
        if hasattr(self, "db_memory") and self.db_memory:
            await self.db_memory.save_conversation(user_input, full_response)
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
                    self._emit_event(
                        "report", {"content": conclusion}, on_event)
                break

            t_name = action_info.get("tool", "")
            t_params = action_info.get("params", {})
            t = self.tools_dict.get(t_name)

            if not t:
                obs = f"工具 '{t_name}' 不存在。"
                self._react_history.append(
                    {"type": "observation", "content": obs})
                response_parts.append(
                    f"⚡ **Action {iteration}**: {t_name}({t_params})\n"
                )
                response_parts.append(
                    f"👁️ **Observation {iteration}**: {obs}\n")
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

            response_parts.append(
                f"⚡ **Action {iteration}**: {t_name}({t_params})\n")
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
        if hasattr(self, "db_memory") and self.db_memory:
            await self.db_memory.save_conversation(user_input, full_response)
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
        context_block = get_agent_context_block()

        planning_prompt = f"""你是一个安全测试专家。请分析用户请求，制定详细的执行计划。

{context_block}
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

        # 本轮之前的对话历史（供模型理解上下文，避免多轮不连贯）
        conv_lines: List[str] = []
        try:
            past = self.get_conversation_history(limit=20)
            # 若最后一条是当前本轮用户输入，则不重复放入「先前对话」
            if past and past[-1].role == "user" and (past[-1].content or "").strip() == (user_input or "").strip():
                past = past[:-1]
            for msg in past:
                role_label = "用户" if msg.role == "user" else "助手"
                conv_lines.append(f"{role_label}: {msg.content}")
        except Exception:
            pass
        conversation_section = ""
        if conv_lines:
            conversation_section = "\n## 本轮之前的对话（供理解上下文）\n" + \
                "\n\n".join(conv_lines[-10:]) + "\n"

        # 当前会话的摘要式上下文（每轮任务后提取的要点，供连续任务参考）
        session_context_section = ""
        if getattr(self, "_session_context_summary", "").strip():
            session_context_section = "\n## 当前会话上下文（摘要）\n" + \
                self._session_context_summary.strip() + "\n"

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

        context_block = get_agent_context_block()

        prompt = f"""你是一个安全测试专家，使用 ReAct 模式工作。

{REACT_OPERATING_POLICY}

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
{context_block}
{conversation_section}
{session_context_section}
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
            "thought_start", {"iteration": len(
                self._react_history) + 1}, on_event
        )
        iteration = len(self._react_history) + 1
        if on_event:
            # 使用流式LLM调用
            thought = await self._call_llm_stream(
                messages,
                on_event,
                iteration=iteration,
            )
        else:
            # 非流式调用
            thought = await self._call_llm(messages)
        self._emit_event(
            "thought_end",
            {"thought": thought, "iteration": iteration},
            on_event,
        )

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
                            return json.loads(thought[start: i + 1])
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
                        snippet = thought[start: i + 1]
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
                        raw = await get_pwd(command) if callable(get_pwd) else None
                    except Exception as e:
                        logger.warning(f"获取 root 密码时出错: {e}")
                        raw = None
                    # 支持返回 str（密码）或 dict（action: run_once/always_allow/deny, password?）
                    password: Optional[str] = None
                    if isinstance(raw, str):
                        password = raw
                    elif isinstance(raw, dict):
                        action = raw.get("action")
                        if action == "deny":
                            return ToolResult(
                                success=False,
                                result=None,
                                error="用户拒绝授权 root 权限。",
                            )
                        if action == "always_allow":
                            pass  # 不注入密码，直接执行原命令
                        elif action == "run_once":
                            password = raw.get("password") or ""
                    if raw is None or (
                        isinstance(raw, dict)
                        and raw.get("action") == "run_once"
                        and not raw.get("password")
                    ):
                        return ToolResult(
                            success=False,
                            result=None,
                            error="需要 root 权限但未提供密码（已取消或未输入）。可使用「总是允许」或 /root-config always 配置为不询问。",
                        )
                    if password:
                        # 使用 sudo -S 从 stdin 读密码，避免密码出现在命令行
                        rest = command[len(root_cmd):].strip()
                        params = dict(params)
                        params["command"] = (
                            f"{root_cmd} -S -p '' -- {rest}"
                            if rest
                            else f"{root_cmd} -S -p '' -- true"
                        )
                        params["stdin_data"] = password + "\n"
                # policy == "always_allow" 时直接执行原命令，不注入密码

        log_params = {k: v for k, v in params.items() if k != "stdin_data"}
        started = time.perf_counter()
        tool_logger = logger.bind(
            agent=getattr(self, "agent_type", getattr(self, "name", "-")),
            tool=tool.name,
            event="tool_call_start",
            attempt=1,
        )
        tool_logger.info(f"执行工具: {tool.name}, 参数: {log_params}")
        try:
            result = await tool.execute(**params)
            duration_ms = int((time.perf_counter() - started) * 1000)
            tool_logger.bind(event="tool_call_end", duration_ms=duration_ms).info(f"工具 {tool.name} 执行完成: {result.success}")
            if not result.success:
                tool_logger.bind(event="tool_error", duration_ms=duration_ms).error(f"工具 {tool.name} 执行失败: {result.error}")
                # 失败时写入专用 debug 日志，便于后续精确排查与优化
                self._write_tool_debug_log(
                    tool_name=tool.name,
                    params=log_params,
                    success=False,
                    error_msg=result.error or "",
                    result_obj=result.result,
                )
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
            duration_ms = int((time.perf_counter() - started) * 1000)
            tool_logger.bind(event="tool_error", duration_ms=duration_ms).exception(f"工具 {tool.name} 执行异常")
            error_msg = str(e)
            # 异常时同样写入 debug 日志
            self._write_tool_debug_log(
                tool_name=tool.name,
                params=log_params,
                success=False,
                error_msg=error_msg,
                result_obj=None,
            )
            hint = self._get_permission_hint(tool.name, error_msg)
            enhanced_error = f"{error_msg}\n\n{hint}" if hint else error_msg
            return ToolResult(success=False, result=None, error=enhanced_error)

    def _write_tool_debug_log(
        self,
        tool_name: str,
        params: Dict[str, Any],
        success: bool,
        error_msg: str,
        result_obj: Any = None,
    ) -> None:
        """
        将工具执行失败的详细信息写入专用 debug 日志文件夹。
        日志路径示例: logs/tool_debug/20260305_153045_123456_api_client.json
        """
        try:
            # 日志根目录与主日志同级，例如 logs/tool_debug
            from hackbot_config import settings

            base_dir = Path(settings.log_file).parent
            debug_dir = base_dir / "tool_debug"
            debug_dir.mkdir(parents=True, exist_ok=True)

            ts = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
            safe_tool = "".join(
                c if c.isalnum() or c in ("-", "_") else "_" for c in (tool_name or "")
            ) or "unknown_tool"
            file_path = debug_dir / f"{ts}_{safe_tool}.json"

            agent_label = getattr(self, "agent_type",
                                  None) or getattr(self, "name", "")

            payload: Dict[str, Any] = {
                "timestamp": ts,
                "agent": agent_label,
                "tool": tool_name,
                "params": params,
                "success": success,
                "error": error_msg,
            }
            if result_obj is not None:
                payload["result_preview"] = (
                    str(result_obj)[:2000] if not isinstance(
                        result_obj, (dict, list)) else result_obj
                )

            file_path.write_text(json.dumps(
                payload, ensure_ascii=False, indent=2), encoding="utf-8")
        except Exception as log_err:
            # 不能影响主流程，只做告警
            logger.warning(f"写入工具 debug 日志失败: {log_err}")

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
                    td.get("id") if isinstance(
                        td, dict) else getattr(td, "id", "")
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

    async def _summarize_tool_result_for_user(
        self,
        user_input: str,
        tool_name: str,
        tool_params: Dict[str, Any],
        result: "ToolResult",
        iteration: int,
    ) -> str:
        """
        将工具执行结果转换为面向用户的可读摘要。
        优先使用 LLM，总结失败时回退到模板化摘要。
        """
        raw_result = result.result if result.success else result.error
        raw_text = str(raw_result) if raw_result is not None else ""
        if len(raw_text) > 2000:
            raw_text = raw_text[:2000] + "...(截断)"

        prompt = f"""你是安全测试结果解读助手。请将一次工具执行结果总结为用户可读内容，使用简洁中文，严格按以下 4 行格式输出：
进展: <本次做了什么>
发现: <关键发现，没有则写“暂无关键发现”>
风险: <高/中/低 + 理由，没有风险写“低（未发现明显风险）”>
下一步: <建议下一步动作>

任务: {user_input}
轮次: {iteration}
工具: {tool_name}
参数: {json.dumps(tool_params, ensure_ascii=False)}
是否成功: {result.success}
原始结果:
{raw_text or "(空)"}
"""
        try:
            messages = [
                SystemMessage(
                    content="你负责把工具输出转换成面向用户的可读安全分析摘要。"
                ),
                HumanMessage(content=prompt),
            ]
            summary = await self._call_llm_non_stream(messages, timeout=20.0)
            if summary and summary.strip():
                return summary.strip()
        except Exception as e:
            logger.warning(f"工具结果总结失败，回退模板摘要: {e}")

        if result.success:
            return (
                f"进展: 已执行工具 `{tool_name}` 并获得结果。\n"
                f"发现: {self._format_observation(result)[:240]}\n"
                "风险: 低（仅工具原始输出，需结合后续证据判断）\n"
                "下一步: 继续执行后续检测并汇总最终结论。"
            )
        return (
            f"进展: 已尝试执行工具 `{tool_name}`，执行失败。\n"
            f"发现: {result.error or '工具返回失败但未提供详细错误'}\n"
            "风险: 中（关键步骤失败可能影响结论完整性）\n"
            "下一步: 修复错误后重试该步骤，或切换替代工具验证。"
        )

    async def execute_todo(
        self,
        todo,
        user_input: str,
        context: Optional[Dict[str, Any]] = None,
        on_event=None,
        iteration: int = 1,
        get_root_password=None,
        emit_events: bool = True,
    ) -> Dict[str, Any]:
        """
        单步执行：根据 todo 的 tool_hint 执行对应工具，供 TaskExecutor 分层调度使用。
        返回 {success, obs, result}。
        """
        from secbot_agent.core.models import TodoItem

        tool_hint = getattr(todo, "tool_hint", None) or (
            todo.get("tool_hint") if isinstance(todo, dict) else None
        )
        # LLM 可能输出 JSON null 或字符串 "null"，均视为未指定工具
        if tool_hint is not None and (
            (isinstance(tool_hint, str) and tool_hint.strip().lower() == "null")
        ):
            tool_hint = None
        content = getattr(todo, "content", None) or (
            todo.get("content", "") if isinstance(todo, dict) else ""
        )

        tool = None
        if tool_hint:
            tool = self.tools_dict.get(tool_hint)
            if not tool:
                for name, t in self.tools_dict.items():
                    if tool_hint.lower() in name.lower():
                        tool = t
                        break

        if not tool:
            if not tool_hint or (isinstance(tool_hint, str) and not tool_hint.strip()):
                # 未指定工具的步骤视为可执行：无需调用工具即视为完成
                obs = "该步骤无需工具，已视为完成。"
                return {"success": True, "obs": obs, "result": None}
            obs = f"无法找到工具 '{tool_hint}'，跳过步骤: {content}"
            return {"success": False, "obs": obs, "result": None}

        # 使用 LLM 提取参数
        context_str = ""
        if context:
            for k, v in context.items():
                if v is not None:
                    preview = str(v)[:200] + \
                        "..." if len(str(v)) > 200 else str(v)
                    context_str += f"\n- {k}: {preview}"

        schema = tool.get_schema()
        params_desc = schema.get("parameters", {})
        if isinstance(params_desc, dict):
            params_help = "\n".join(
                f"  - {k}: {v.get('description', '')}" if isinstance(v,
                                                                     dict) else f"  - {k}"
                for k, v in params_desc.items()
            )
        else:
            params_help = str(params_desc)

        prompt = f"""用户请求: {user_input}
执行步骤: {content}
工具: {tool.name}
工具参数说明:
{params_help}
上下文（上一步结果）:\n{context_str or "无"}

请输出 JSON 格式的工具调用，例如: {{"tool": "{tool.name}", "params": {{"host": "localhost"}}}}
只输出 JSON，不要其他文字。"""

        messages = [
            SystemMessage(
                content="你是一个安全测试助手。根据用户请求和上下文，提取工具调用参数。只输出有效的 JSON。"),
            HumanMessage(content=prompt),
        ]
        try:
            # 发送推理事件（与 _think 方法一致）
            if emit_events and on_event:
                self._emit_event("thought_start", {
                                 "iteration": iteration}, on_event)

            # 使用流式 LLM 调用，发送 thought_chunk 事件
            if emit_events and on_event:
                response = await self._call_llm_stream(
                    messages,
                    on_event,
                    iteration=iteration,
                )
            else:
                response = await self._call_llm(messages)

            # 发送推理结束事件
            if emit_events and on_event:
                self._emit_event(
                    "thought_end",
                    {"thought": response, "iteration": iteration},
                    on_event,
                )

            action_info = self._parse_action(response, iteration)
            if not action_info or action_info.get("tool") != tool.name:
                action_info = {"tool": tool.name, "params": {}}
            tool_params = action_info.get("params", {})
        except Exception as e:
            logger.warning(f"参数提取失败，使用空参数: {e}")
            tool_params = {}

        if emit_events and on_event:
            self._emit_event(
                "action_start",
                {"iteration": iteration, "tool": tool.name, "params": tool_params},
                on_event,
            )

        self._get_root_password = get_root_password
        result = await self._execute_tool(tool, tool_params)
        obs = self._format_observation(result)

        if emit_events and on_event:
            self._emit_event(
                "action_result",
                {
                    "iteration": iteration,
                    "tool": tool.name,
                    "success": result.success,
                    "result": result.result if result.success else None,
                    "error": result.error if not result.success else None,
                    "view_type": "raw",
                },
                on_event,
            )
            summary_text = await self._summarize_tool_result_for_user(
                user_input=user_input,
                tool_name=tool.name,
                tool_params=tool_params,
                result=result,
                iteration=iteration,
            )
            self._emit_event(
                "content",
                {
                    "iteration": iteration,
                    "content": summary_text,
                    "tool": tool.name,
                    "view_type": "summary",
                },
                on_event,
            )

        return {
            "success": result.success,
            "obs": obs,
            "result": result.result if result.success else None,
            "error": result.error if not result.success else "",
            "tool": tool.name,
            "params": tool_params,
        }
