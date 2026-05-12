"""
ExploreAgent：只读上下文补全（与 npm explore-agent.ts 对齐）。
"""

from __future__ import annotations

import asyncio
import json
import os
import random
import re
import string
import time
from typing import Any, Callable, Dict, List, Optional

from langchain_core.messages import HumanMessage, SystemMessage

from secbot_agent.core.agents.base import BaseAgent
from secbot_agent.core.models import (
    ContextPatch,
    ContextPatchFact,
    IntentDecision,
)
from secbot_agent.core.parse_tool_action import (
    FINAL_PATCH_REGEX,
    extract_first_json_object,
    parse_tool_action,
)
from tools.base import BaseTool
from tools.web_research.browser_session_tool import BrowserSessionTool
from utils.event_bus import Event, EventType
from utils.logger import logger

EXPLORE_SYSTEM_PROMPT = (
    "你是 secbot 的 ExploreAgent。你的唯一目标是："
    "在执行真正的安全任务前，用 **只读、低成本** 的工具调用补全上下文，"
    "把关键事实写入会话的「上下文池」。\n\n"
    "硬性原则：\n"
    "1) **绝对禁止**任何修改、写入、破坏性、需要授权确认的操作（任何高敏感工具会被自动拒绝）。\n"
    "2) 优先使用 **vuln_db_query** 与 **browser_session**；"
    "其次 page_extract / smart_search / deep_crawl / api_client 及低敏 OSINT。\n"
    "3) 不要回答用户的问题，不要执行任务，不要写报告。**你只补上下文**。\n"
    "4) 收集到关键事实就立即出 Final Patch。\n\n"
    "输出格式：Think + Action JSON 或 Final Patch JSON（见用户消息中的 schema）。"
)

DEFAULT_MAX_ITERATIONS = 12


def _resolve_max_iterations() -> int:
    raw = (os.environ.get("SECBOT_EXPLORE_MAX_ITERS") or "").strip()
    if not raw:
        return DEFAULT_MAX_ITERATIONS
    try:
        n = int(raw)
        if n <= 0:
            return DEFAULT_MAX_ITERATIONS
        return min(40, max(1, n))
    except ValueError:
        return DEFAULT_MAX_ITERATIONS


def _is_tool_sensitive(tool: BaseTool) -> bool:
    if getattr(tool, "sensitive", False):
        return True
    s = str(getattr(tool, "sensitivity", "low")).lower()
    return s in ("high", "critical")


def _format_observation(result: Any) -> str:
    if isinstance(result, str):
        return result[:2000]
    try:
        return json.dumps(result, ensure_ascii=False, default=str)[:2000]
    except Exception:
        return str(result)[:2000]


class ExploreAgent(BaseAgent):
    def __init__(
        self,
        tools: List[BaseTool],
        browser_tool: Optional[BrowserSessionTool] = None,
    ):
        super().__init__(name="Explore", system_prompt=EXPLORE_SYSTEM_PROMPT)
        self.tools = tools
        self.tools_dict: Dict[str, BaseTool] = {t.name: t for t in tools}
        if browser_tool:
            self.browser_tool = browser_tool
        else:
            bt = self.tools_dict.get("browser_session")
            self.browser_tool = bt if isinstance(bt, BrowserSessionTool) else None
        self._llm = None

    async def process(self, user_input: str, **kwargs) -> str:
        """
        满足 BaseAgent 抽象约定。主路径由 SessionManager 调用 explore() 并消费 ContextPatch；
        若外部直接调用 process，则等价于一次只读探索并返回摘要文本。
        """
        intent = kwargs.get("intent")
        context_block = kwargs.get("context_block") or ""
        on_event = kwargs.get("on_event")
        max_iterations = kwargs.get("max_iterations")
        intent_decision = (
            intent if isinstance(intent, IntentDecision) else None
        )
        patch = await self.explore(
            user_input,
            intent=intent_decision,
            context_block=str(context_block),
            on_event=on_event,
            max_iterations=max_iterations,
        )
        parts: List[str] = []
        if patch.explore_summary:
            parts.append(patch.explore_summary)
        for f in patch.facts[:12]:
            parts.append(f"- {f.key}: {f.value}")
        if patch.unresolved:
            parts.append("未解决: " + "; ".join(patch.unresolved[:8]))
        return "\n".join(parts) if parts else "（Explore 完成，无额外事实。）"

    def _ensure_llm(self):
        if self._llm is None:
            from secbot_agent.core.patterns.security_react import _create_llm

            self._llm = _create_llm()

    def get_tools_description(self) -> str:
        return "\n".join(f"- {t.name}: {t.description}" for t in self.tools)

    def _parse_action(self, thought: str):
        if FINAL_PATCH_REGEX.search(thought):
            return None
        return parse_tool_action(thought)

    def _normalize_patch(self, obj: Dict[str, Any]) -> ContextPatch:
        facts_raw = obj.get("facts") if isinstance(obj.get("facts"), list) else []
        facts: List[ContextPatchFact] = []
        for item in facts_raw:
            if not isinstance(item, dict):
                continue
            key = str(item.get("key", "")).strip()
            value = str(item.get("value", "")).strip()
            if not key or not value:
                continue
            pr = item.get("priority")
            priority = (
                float(pr)
                if isinstance(pr, (int, float)) and 0 <= float(pr) <= 1
                else 0.7
            )
            ttl = str(item.get("ttl") or "session").lower()
            if ttl not in ("turn", "session", "persistent"):
                ttl = "session"
            tags = [
                str(t).strip()
                for t in (item.get("tags") or [])
                if isinstance(t, str)
            ][:8]
            facts.append(
                ContextPatchFact(
                    key=key, value=value, priority=priority, ttl=ttl, tags=tags
                )
            )

        def _strings(v: Any) -> List[str]:
            if not isinstance(v, list):
                return []
            return [
                str(x).strip()
                for x in v
                if isinstance(x, str) and str(x).strip()
            ]

        return ContextPatch(
            facts=facts,
            pinned=_strings(obj.get("pinned"))[:16],
            unresolved=_strings(obj.get("unresolved"))[:16],
            suggested_focus=[
                s.lower() for s in _strings(obj.get("suggested_focus"))
            ][:12],
            explore_summary=str(obj.get("explore_summary") or "").strip(),
        )

    def extract_patch(self, text: str) -> Optional[ContextPatch]:
        m = re.search(r"Final\s*Patch\s*:\s*", text, re.I)
        if not m:
            return None
        rest = text[m.end() :]
        cb = re.match(
            r"^\s*```(?:json)?\s*([\s\S]*?)```", rest, re.IGNORECASE
        )
        if cb:
            try:
                obj = json.loads(cb.group(1).strip())
                if isinstance(obj, dict):
                    return self._normalize_patch(obj)
            except json.JSONDecodeError:
                pass
        jo = extract_first_json_object(rest)
        if jo:
            try:
                obj = json.loads(jo)
                if isinstance(obj, dict):
                    return self._normalize_patch(obj)
            except json.JSONDecodeError:
                pass
        return None

    def _emit(
        self,
        on_event: Optional[Callable[[Event], Any]],
        et: EventType,
        data: Dict[str, Any],
        iteration: int = 0,
    ) -> None:
        if not on_event:
            return
        try:
            on_event(Event(type=et, data=data, iteration=iteration))
        except Exception as e:
            logger.warning(f"ExploreAgent on_event 失败: {e}")

    async def explore(
        self,
        user_input: str,
        intent: Optional[IntentDecision] = None,
        context_block: str = "",
        on_event: Optional[Callable[[Event], Any]] = None,
        max_iterations: Optional[int] = None,
    ) -> ContextPatch:
        default_max = _resolve_max_iterations()
        n_iter = max(
            1, min(max_iterations or default_max, 40)
        )
        browser_sid = (
            f"expl-{int(time.time() * 1000):x}-"
            f"{''.join(random.choices(string.ascii_lowercase, k=6))}"
        )

        self._emit(
            on_event,
            EventType.EXPLORE_START,
            {
                "agent": self.name,
                "userInput": user_input,
                "focus": intent.focus if intent else [],
                "browser_session_id": browser_sid,
            },
            0,
        )

        focus_hint = (
            f"\n【路由层 focus】{', '.join(intent.focus)}"
            if intent and intent.focus
            else ""
        )
        intent_hint = (
            f"\n【路由层意图】{intent.intent}（{intent.rationale or ''}）"
            if intent
            else ""
        )
        ctx_hint = f"\n【已注入上下文】\n{context_block}" if context_block else ""
        browser_hint = (
            f'\n【BrowserSessionContext】调用 browser_session 时务必带 '
            f'session_id="{browser_sid}"。'
        )

        user_prompt = (
            f"用户原始请求：{user_input}"
            f"{intent_hint}{focus_hint}{ctx_hint}{browser_hint}"
            f"\n\n可用工具:\n{self.get_tools_description()}"
            f"\n\n请按 ReAct 循环工作，最多 {n_iter} 轮。"
            "完成后必须输出 Final Patch JSON：\n"
            "{\n"
            '  "facts": [{"key":"...", "value":"...", "priority":0.7, '
            '"ttl":"session", "tags":[]}],\n'
            '  "pinned": [], "unresolved": [], "suggested_focus": [],\n'
            '  "explore_summary": "..."\n}'
        )

        lc_messages: List[Any] = [
            SystemMessage(content=EXPLORE_SYSTEM_PROMPT),
            HumanMessage(content=user_prompt),
        ]

        self._ensure_llm()
        patch: Optional[ContextPatch] = None
        last_thought = ""

        try:
            for iteration in range(1, n_iter + 1):
                resp = await asyncio.wait_for(
                    self._llm.ainvoke(lc_messages), timeout=120.0
                )
                thought = (getattr(resp, "content", None) or str(resp)) or ""
                last_thought = thought

                self._emit(
                    on_event,
                    EventType.EXPLORE_STEP,
                    {
                        "agent": self.name,
                        "iteration": iteration,
                        "kind": "thought",
                        "thought": thought,
                    },
                    iteration,
                )

                inline = self.extract_patch(thought)
                if inline:
                    patch = inline
                    break

                action = self._parse_action(thought)
                if not action:
                    lc_messages.append(resp)
                    lc_messages.append(
                        HumanMessage(
                            content=(
                                "上一步既没有调用工具，也没有输出 Final Patch。"
                                "请立即输出 Final Patch JSON。"
                                "若没有可补的事实，输出 facts:[]、unresolved 列出仍然缺的信息。"
                            )
                        )
                    )
                    continue

                tool = self.tools_dict.get(action.tool)
                if not tool:
                    obs = f"[错误] 未知工具: {action.tool}"
                    lc_messages.append(
                        HumanMessage(content=f"Observation: {obs}")
                    )
                    continue

                if _is_tool_sensitive(tool):
                    obs = (
                        f"[拒绝] 工具 {action.tool} 为高敏感，ExploreAgent 仅允许低敏只读工具。"
                    )
                    self._emit(
                        on_event,
                        EventType.EXPLORE_STEP,
                        {
                            "agent": self.name,
                            "iteration": iteration,
                            "kind": "sensitive_denied",
                            "tool": action.tool,
                        },
                        iteration,
                    )
                    lc_messages.append(resp)
                    lc_messages.append(
                        HumanMessage(content=f"Observation: {obs}")
                    )
                    continue

                merged = dict(action.params or {})
                if action.tool == "browser_session" and browser_sid:
                    merged.setdefault("session_id", browser_sid)

                self._emit(
                    on_event,
                    EventType.EXPLORE_STEP,
                    {
                        "agent": self.name,
                        "iteration": iteration,
                        "kind": "action_start",
                        "tool": action.tool,
                        "params": merged,
                    },
                    iteration,
                )

                try:
                    tr = await tool.execute(**merged)
                    observation = (
                        _format_observation(tr.result)
                        if tr.success
                        else f"[错误] {tr.error or '未知错误'}"
                    )
                except Exception as e:
                    observation = f"[异常] {e}"

                self._emit(
                    on_event,
                    EventType.EXPLORE_STEP,
                    {
                        "agent": self.name,
                        "iteration": iteration,
                        "kind": "action_result",
                        "tool": action.tool,
                        "observation": observation,
                    },
                    iteration,
                )

                lc_messages.append(resp)
                lc_messages.append(
                    HumanMessage(content=f"Observation: {observation}")
                )

            if not patch:
                lc_messages.append(
                    HumanMessage(
                        content=(
                            "已达到最大迭代次数。请立刻输出 Final Patch JSON；"
                            "如果没有补充事实，facts:[] 并在 unresolved 中说明缺什么。"
                        )
                    )
                )
                try:
                    resp2 = await asyncio.wait_for(
                        self._llm.ainvoke(lc_messages), timeout=120.0
                    )
                    t2 = (getattr(resp2, "content", None) or str(resp2)) or ""
                    patch = self.extract_patch(t2) or self.extract_patch(
                        last_thought
                    )
                except Exception:
                    patch = patch or self.extract_patch(last_thought)

        finally:
            if self.browser_tool:
                try:
                    self.browser_tool.close_session(browser_sid)
                except Exception:
                    pass

        final_patch = patch or ContextPatch(
            facts=[],
            unresolved=["ExploreAgent 未能给出有效的 Patch"],
            explore_summary="explore failed",
        )

        self._emit(
            on_event,
            EventType.EXPLORE_END,
            {
                "agent": self.name,
                "factsCount": len(final_patch.facts),
                "unresolved": final_patch.unresolved,
                "summary": final_patch.explore_summary,
            },
            0,
        )
        return final_patch