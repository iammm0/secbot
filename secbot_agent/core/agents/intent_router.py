"""
IntentRouter：单次 LLM 调用输出 6 类意图（与 npm intent-router.ts 对齐）。
"""

from __future__ import annotations

import json
import re
from typing import Any, Dict, List, Optional

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from secbot_agent.core.models import IntentDecision
from utils.logger import logger

VALID_INTENTS = frozenset(
    {
        "small_talk",
        "meta",
        "qa",
        "clarify_needed",
        "task_simple",
        "task_complex",
    }
)

INTENT_SYSTEM_PROMPT = (
    "你是 secbot 的意图分类器。secbot 是一个授权范围内的安全自动化工作台。"
    "你只做意图分类，不直接执行任务，不要做任何安全操作。\n\n"
    "分类（共 6 类）：\n"
    "1) small_talk：闲聊、感谢、表情、确认（\"嗯\"/\"ok\"/\"😊\"）、纯礼貌。不需要工具、不需要安全知识。\n"
    "2) meta：询问 secbot 自身能力、改设置、查看历史/工具列表/会话状态。\n"
    "3) qa：安全知识、概念、原理、提问类（\"什么是 SSRF？\"/\"DNS 解析过程？\"）。通常不需要执行工具；但若用户明确在问“最新/近期/当前”的漏洞或安全动态，仍归为 qa，由问答层决定是否做只读实时检索。\n"
    "4) clarify_needed：用户想做任务，但关键参数缺失（目标缺、模糊指代、范围不清），必须先追问。\n"
    "5) task_simple：任务意图明确，且显然 1 步可解（\"再跑一遍上次的端口扫描\"/\"对 1.2.3.4 ping 一下\"），跳过复杂规划。\n"
    "6) task_complex：任务，需要规划、并行/串行多步工具调用、可能要生成报告。\n\n"
    "附加字段：\n"
    "- confidence：0-1\n"
    "- needs_explore：true 表示在执行前应先调用 ExploreAgent 做只读探索补上下文（例：用户提到了陌生目标、CVE 号、未知协议）；small_talk/meta 通常为 false。\n"
    "- needs_report：是否需要执行后产出结构化 SummaryAgent 报告。task_simple 通常 false，task_complex 通常 true。\n"
    "- focus：从输入抽出的实体（IP、域名、CVE、目标系统、协议等），不超过 8 个，小写。\n"
    "- direct_response：small_talk / meta / qa 可填一句直接回复（不要执行任何操作的描述）。\n"
    "- clarify_question：clarify_needed 必填，一个具体的追问。\n"
    "- rationale：一句话解释为什么这么分类。\n\n"
    "严格 JSON 输出（不要 Markdown 代码块、不要多余文字）：\n"
    "{\n"
    '  "intent": "small_talk|meta|qa|clarify_needed|task_simple|task_complex",\n'
    '  "confidence": 0.0,\n'
    '  "needs_explore": false,\n'
    '  "needs_report": false,\n'
    '  "focus": [],\n'
    '  "direct_response": null,\n'
    '  "clarify_question": null,\n'
    '  "rationale": ""\n'
    "}\n"
)

SMALL_TALK_HINTS = [
    "你好", "嗨", "早上好", "下午好", "晚上好", "谢谢", "感谢", "辛苦",
    "ok", "hi", "hello", "hey", "可以",
]

META_HINTS = [
    "你是谁", "你能做什么", "你能干嘛", "secbot", "怎么设置", "改设置",
    "设置模型", "切换模型", "清空记忆", "历史记录", "工具列表", "当前会话",
    "会话 id",
]

TASK_HINTS = [
    "扫描", "渗透", "攻击", "检测", "探测", "枚举", "利用", "注入", "爆破",
    "提权", "嗅探", "scan", "exploit", "attack", "detect", "pentest",
    "enumerate", "brute", "inject",
]


def _to_num(v: Any, fallback: float) -> float:
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        return float(v)
    if isinstance(v, str) and v.strip():
        try:
            return float(v)
        except ValueError:
            pass
    return fallback


def _to_bool(v: Any, fallback: bool) -> bool:
    if isinstance(v, bool):
        return v
    if isinstance(v, str):
        s = v.lower().strip()
        if s in ("true", "1", "yes"):
            return True
        if s in ("false", "0", "no"):
            return False
    return fallback


def _to_str_list(v: Any) -> List[str]:
    if not isinstance(v, list):
        return []
    out: List[str] = []
    for item in v:
        if isinstance(item, str) and item.strip():
            out.append(item.strip().lower())
    return out


def _nullable_str(v: Any) -> Optional[str]:
    if not isinstance(v, str):
        return None
    t = v.strip()
    return t if t else None


class IntentRouter:
    def __init__(self, llm=None):
        self._llm = llm

    def _ensure_llm(self):
        if self._llm is None:
            from secbot_agent.core.patterns.security_react import _create_llm

            self._llm = _create_llm()

    @staticmethod
    def heuristic(text: str) -> Dict[str, Any]:
        lower = text.lower().strip()
        is_small_talk = (
            len(lower) <= 6
            and any(k.lower() in lower for k in SMALL_TALK_HINTS)
        )
        is_meta = any(k.lower() in lower for k in META_HINTS)
        is_task = any(k.lower() in lower for k in TASK_HINTS)

        focus_set: set[str] = set()
        patterns = [
            r"\b\d{1,3}(?:\.\d{1,3}){3}\b",
            r"\bcve-\d{4}-\d{4,7}\b",
            r"\b[a-z0-9-]+(?:\.[a-z0-9-]+)+\.[a-z]{2,}\b",
            r"https?:\/\/[^\s)>'\"]+",
        ]
        for pat in patterns:
            for m in re.finditer(pat, text, re.IGNORECASE):
                focus_set.add(m.group(0).lower())

        return {
            "is_small_talk": is_small_talk,
            "is_meta": is_meta,
            "is_task": is_task,
            "has_unknown_entity": len(focus_set) > 0,
            "focus": list(focus_set)[:8],
        }

    def _parse_raw(self, raw: str) -> Optional[IntentDecision]:
        m = re.search(r"\{[\s\S]*\}", raw)
        if not m:
            return None
        try:
            obj = json.loads(m.group(0))
        except json.JSONDecodeError:
            return None
        intent = str(obj.get("intent", "qa"))
        if intent not in VALID_INTENTS:
            return None
        conf = _to_num(obj.get("confidence"), 0.5)
        needs_explore = _to_bool(obj.get("needs_explore"), False)
        needs_report = _to_bool(
            obj.get("needs_report"), intent == "task_complex"
        )
        focus = _to_str_list(obj.get("focus"))[:8]
        return IntentDecision(
            intent=intent,
            confidence=conf,
            needs_explore=needs_explore,
            needs_report=needs_report,
            focus=focus,
            direct_response=_nullable_str(obj.get("direct_response")),
            clarify_question=_nullable_str(obj.get("clarify_question")),
            rationale=str(obj.get("rationale") or ""),
        )

    def _merge_heuristic(
        self,
        decision: IntentDecision,
        h: Dict[str, Any],
        session_focus: Optional[List[str]],
    ) -> IntentDecision:
        merged = list(dict.fromkeys([*decision.focus, *h["focus"]]))[:12]
        sess = session_focus or []
        needs_explore = decision.needs_explore or (
            decision.intent in ("task_simple", "task_complex")
            and h["has_unknown_entity"]
            and len(sess) == 0
        )
        return IntentDecision(
            intent=decision.intent,
            confidence=decision.confidence,
            needs_explore=needs_explore,
            needs_report=decision.needs_report,
            focus=merged,
            direct_response=decision.direct_response,
            clarify_question=decision.clarify_question,
            rationale=decision.rationale,
        )

    def _fallback(
        self,
        h: Dict[str, Any],
        force_agent: bool,
    ) -> IntentDecision:
        if h["is_small_talk"]:
            intent = "small_talk"
        elif h["is_meta"]:
            intent = "meta"
        elif h["is_task"]:
            intent = "task_complex"
        else:
            intent = "qa"
        if force_agent and intent == "small_talk":
            intent = "qa"
        return IntentDecision(
            intent=intent,
            confidence=0.4,
            needs_explore=(intent == "task_complex" and h["has_unknown_entity"]),
            needs_report=(intent == "task_complex"),
            focus=h["focus"],
            direct_response=None,
            clarify_question=None,
            rationale="fallback (heuristic)",
        )

    async def classify(
        self,
        user_input: str,
        recent_messages: Optional[List[Dict[str, str]]] = None,
        force_qa: bool = False,
        force_agent: bool = False,
        session_focus: Optional[List[str]] = None,
        unresolved: Optional[List[str]] = None,
    ) -> IntentDecision:
        h = self.heuristic(user_input)
        if force_qa:
            return IntentDecision(
                intent="qa",
                confidence=1.0,
                needs_explore=False,
                needs_report=False,
                focus=h["focus"],
                direct_response=None,
                clarify_question=None,
                rationale="forceQA mode",
            )

        parts = [f"本轮用户输入：\n{user_input}\n"]
        if session_focus:
            parts.append(f"当前会话 focus（仅供参考）：{', '.join(session_focus)}\n")
        if unresolved:
            parts.append(f"当前会话未解决问题：{'; '.join(unresolved)}\n")
        parts.append("\n请严格按 JSON 输出。")
        user_prompt = "".join(parts)

        recent_sliced = (recent_messages or [])[-4:]
        lc_messages: List[Any] = [SystemMessage(content=INTENT_SYSTEM_PROMPT)]
        for m in recent_sliced:
            role = (m.get("role") or "user").lower()
            content = m.get("content") or ""
            if role == "assistant":
                lc_messages.append(AIMessage(content=content))
            elif role == "system":
                lc_messages.append(SystemMessage(content=content))
            else:
                lc_messages.append(HumanMessage(content=content))
        lc_messages.append(HumanMessage(content=user_prompt))

        try:
            self._ensure_llm()
            import asyncio

            resp = await asyncio.wait_for(
                self._llm.ainvoke(lc_messages), timeout=60.0
            )
            raw = (getattr(resp, "content", None) or str(resp)) or ""
            parsed = self._parse_raw(raw)
            if parsed:
                decision = self._merge_heuristic(
                    parsed, h, session_focus
                )
                if force_agent and decision.intent == "small_talk":
                    new_intent = (
                        "qa" if decision.direct_response else "task_complex"
                    )
                    decision = IntentDecision(
                        intent=new_intent,
                        confidence=decision.confidence,
                        needs_explore=decision.needs_explore
                        or (
                            new_intent == "task_complex"
                            and h["has_unknown_entity"]
                        ),
                        needs_report=(new_intent == "task_complex"),
                        focus=decision.focus,
                        direct_response=decision.direct_response,
                        clarify_question=decision.clarify_question,
                        rationale=(decision.rationale or "") + " (forceAgent)",
                    )
                return decision
        except Exception as e:
            logger.warning(f"IntentRouter LLM 失败，启发式回退: {e}")

        return self._fallback(h, force_agent)
