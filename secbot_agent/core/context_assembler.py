"""
ContextAssembler：上下文管理器（与 npm ContextAssemblerService 对齐）。
"""

from __future__ import annotations

import re
import unicodedata
import math
from datetime import datetime
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple, TYPE_CHECKING

from secbot_agent.core.context_store import ContextStore, get_focus_keywords
from secbot_agent.core.model_context_window import (
    approx_tokens,
    compute_prompt_budget,
    get_model_window,
)
from secbot_agent.core.models import ContextItem, ContextPatch
from utils.logger import logger

if TYPE_CHECKING:
    from secbot_agent.core.memory.manager import MemoryManager
    from secbot_agent.core.memory.vector_store import VectorStoreManager
    from secbot_agent.core.models import Session
    from secbot_agent.database.manager import DatabaseManager

VECTOR_DIMENSION = 128


@dataclass
class ContextDebugMeta:
    session_messages: int = 0
    sqlite_turns: int = 0
    vector_hits: int = 0
    pinned: int = 0
    focus: List[str] = field(default_factory=list)
    prompt_budget: int = 0
    used_tokens: int = 0
    dropped_sections: List[str] = field(default_factory=list)
    model_name: Optional[str] = None
    context_window: int = 0
    reserved_tokens: int = 0


@dataclass
class AssembledContext:
    context_block: str = ""
    debug: ContextDebugMeta = None

    def __post_init__(self):
        if self.debug is None:
            self.debug = ContextDebugMeta()


class ContextAssembler:
    def __init__(
        self,
        db_manager: "DatabaseManager",
        memory_manager: Optional["MemoryManager"] = None,
        vector_store_manager: Optional["VectorStoreManager"] = None,
        context_store: Optional[ContextStore] = None,
    ):
        self.db_manager = db_manager
        self.memory_manager = memory_manager
        self.vector_store_manager = vector_store_manager
        self.context_store = context_store or ContextStore()

    def apply_patch(self, session_id: str, patch: ContextPatch) -> None:
        self.context_store.apply_patch(session_id, patch)

    def update_focus_from_input(self, session_id: str, user_input: str) -> List[str]:
        keywords = self.extract_focus_keywords(user_input)
        if keywords:
            self.context_store.update_focus(session_id, keywords, 1.0)
        else:
            self.context_store.update_focus(session_id, [], 0)
        return keywords

    def get_store_snapshot(self, session_id: str):
        return self.context_store.get(session_id)

    def merge_intent_focus(self, session_id: str, keywords: List[str]) -> None:
        self.context_store.merge_intent_focus(session_id, keywords, boost=1.5)

    def extract_focus_keywords(self, text: str) -> List[str]:
        if not text:
            return []
        matches: set[str] = set()
        patterns = [
            r"\b\d{1,3}(?:\.\d{1,3}){3}\b",
            r"\bcve-\d{4}-\d{4,7}\b",
            r"\b[a-z0-9-]+(?:\.[a-z0-9-]+)+\.[a-z]{2,}\b",
            r"https?:\/\/[^\s)>'\"]+",
            r"\bport\s*\d{1,5}\b",
            r"\b(?:http|https|ftp|ssh|smb|smtp|imap|pop3|ldap|rdp|mysql|redis|mongo|mssql|postgres)\b",
        ]
        for pat in patterns:
            for m in re.finditer(pat, text, re.IGNORECASE):
                matches.add(m.group(0).lower())
        return list(matches)[:12]

    async def build(
        self,
        query: str,
        session: "Session",
        session_id: str,
        agent_type: str = "hackbot",
        model_name: Optional[str] = None,
    ) -> AssembledContext:
        self.context_store.set_model_name(session_id, model_name)
        state = self.context_store.get(session_id)
        window = get_model_window(model_name or state.model_name)
        budget = compute_prompt_budget(window)

        candidates: List[ContextItem] = []
        for item in state.pinned:
            candidates.append(item)

        recent_session = session.messages[-24:]
        for i, m in enumerate(recent_session):
            content = f"{m.role.value}: {m.content}"
            n = max(1, len(recent_session) - 1)
            prio = 0.5 + (i / n) * 0.3 if n else 0.5
            candidates.append(
                ContextItem(
                    id=f"recent-{i}-{m.timestamp.timestamp()}",
                    content=content,
                    source="recent",
                    priority=prio,
                    tokens_estimate=approx_tokens(content),
                    tags=[m.role.value],
                    ttl="session",
                    created_at=m.timestamp,
                )
            )

        sqlite_history = self.db_manager.get_conversations(
            session_id=session_id, limit=8
        )
        sqlite_list = list(reversed(sqlite_history))
        for idx, turn in enumerate(sqlite_list):
            content = f"用户: {turn.user_message}\n助手: {turn.assistant_message}"
            candidates.append(
                ContextItem(
                    id=f"sqlite-{idx}",
                    content=content,
                    source="sqlite",
                    priority=0.45,
                    tokens_estimate=approx_tokens(content),
                    tags=["history"],
                    ttl="session",
                    created_at=datetime.now(),
                )
            )

        focus_keywords = get_focus_keywords(state)
        vector_query = (
            f"{query} {' '.join(focus_keywords)}" if focus_keywords else query
        )
        query_vec = text_to_vector(vector_query)
        vector_hits = 0
        if self.vector_store_manager is not None:
            try:
                store = self.vector_store_manager.get_store(
                    "episodic", VECTOR_DIMENSION
                )
                hits = store.search(
                    query_vec, limit=8, collection="episodic", threshold=0.3
                )
                for item, similarity in hits:
                    content = (item.content or "").strip()
                    if not content:
                        continue
                    boost = _focus_boost(content, focus_keywords)
                    sid = (item.metadata or {}).get("sessionId", "unknown")
                    line = f"{content}\n来源: {sid} / 相似度: {similarity:.3f}"
                    candidates.append(
                        ContextItem(
                            id=f"vec-{getattr(item, 'id', None) or vector_hits}",
                            content=line,
                            source="vector",
                            priority=min(0.85, 0.35 + similarity * 0.4 + boost),
                            tokens_estimate=approx_tokens(content),
                            tags=["vector"],
                            ttl="turn",
                            created_at=datetime.now(),
                        )
                    )
                    vector_hits += 1
            except Exception as e:
                logger.warning(f"ContextAssembler 向量检索失败: {e}")

        selected, dropped, used_tokens = pack_by_budget(candidates, budget)
        sections = render_sections(selected)
        block = "\n\n".join(sections) if sections else ""

        focus_line = ", ".join(focus_keywords) if focus_keywords else "(无)"
        unresolved_line = (
            "; ".join(state.unresolved) if state.unresolved else "(无)"
        )
        mn = model_name or state.model_name
        meta_lines = [
            f"session_id: {session_id}",
            f"agent: {agent_type}",
            f"model: {mn or '(default)'}",
            f"context_window: {window.context}",
            f"prompt_budget: {budget}",
            f"used_tokens(approx): {used_tokens}",
            f"focus: {focus_line}",
            f"unresolved: {unresolved_line}",
        ]
        request_meta = "【RequestMeta】\n" + "\n".join(meta_lines)
        context_block = f"{block}\n\n{request_meta}" if block else request_meta

        reserved = window.reserve_for_output + window.reserve_for_system
        return AssembledContext(
            context_block=context_block,
            debug=ContextDebugMeta(
                session_messages=len(recent_session),
                sqlite_turns=len(sqlite_list),
                vector_hits=vector_hits,
                pinned=len(state.pinned),
                focus=focus_keywords,
                prompt_budget=budget,
                used_tokens=used_tokens,
                dropped_sections=[d.source for d in dropped],
                model_name=mn,
                context_window=window.context,
                reserved_tokens=reserved,
            ),
        )

    async def remember_turn(
        self,
        session_id: str,
        agent_type: str,
        user_message: str,
        assistant_message: str,
    ) -> None:
        merged = f"用户: {user_message}\n助手: {assistant_message}"
        try:
            if self.memory_manager is not None:
                await self.memory_manager.remember(
                    merged, "short_term", 0.6, sessionId=session_id, agentType=agent_type
                )
                await self.memory_manager.remember(
                    merged, "episodic", 0.75, sessionId=session_id, agentType=agent_type
                )
            if self.vector_store_manager is not None:
                from datetime import datetime, timezone

                vec = text_to_vector(merged)
                await self.vector_store_manager.add_memory(
                    content=merged,
                    vector=vec,
                    memory_type="episodic",
                    metadata={
                        "sessionId": session_id,
                        "agentType": agent_type,
                        "createdAt": datetime.now(timezone.utc).isoformat(),
                    },
                )
        except Exception as e:
            logger.warning(f"ContextAssembler.remember_turn 失败: {e}")
        self.context_store.end_turn(session_id)


def _focus_boost(content: str, focus_keywords: List[str]) -> float:
    if not focus_keywords:
        return 0.0
    lower = content.lower()
    hits = sum(1 for kw in focus_keywords if kw and kw in lower)
    return min(0.2, hits * 0.05)


def pack_by_budget(
    candidates: List[ContextItem], budget: int
) -> Tuple[List[ContextItem], List[ContextItem], int]:
    dedupe: Dict[str, ContextItem] = {}
    for item in candidates:
        key = item.content.strip()
        if not key:
            continue
        existing = dedupe.get(key)
        if not existing or existing.priority < item.priority:
            dedupe[key] = item
    unique = sorted(
        dedupe.values(),
        key=lambda x: (x.priority, x.created_at.timestamp()),
        reverse=True,
    )
    selected: List[ContextItem] = []
    dropped: List[ContextItem] = []
    used = 0
    for item in unique:
        if used + item.tokens_estimate > budget:
            dropped.append(item)
            continue
        selected.append(item)
        used += item.tokens_estimate
    return selected, dropped, used


def render_sections(items: List[ContextItem]) -> List[str]:
    groups: Dict[str, List[str]] = {
        "Pinned": [],
        "RecentSession": [],
        "SQLiteHistory": [],
        "VectorMemory": [],
    }
    for item in items:
        if item.source in ("explore", "user_pinned"):
            groups["Pinned"].append(item.content)
        elif item.source == "recent":
            groups["RecentSession"].append(item.content)
        elif item.source == "sqlite":
            groups["SQLiteHistory"].append(item.content)
        else:
            groups["VectorMemory"].append(item.content)
    sections: List[str] = []
    for name in ("Pinned", "RecentSession", "SQLiteHistory", "VectorMemory"):
        block = groups[name]
        if block:
            sections.append(f"【{name}】\n" + "\n\n".join(block))
    return sections


def text_to_vector(text: str) -> List[float]:
    vector = [0.0] * VECTOR_DIMENSION
    normalized = unicodedata.normalize("NFKC", text).lower()
    if not normalized:
        return vector
    for i, ch in enumerate(normalized):
        code = ord(ch)
        index = (code + i * 31) % VECTOR_DIMENSION
        vector[index] += 1 + (code % 7) * 0.05
    norm = math.sqrt(sum(v * v for v in vector))
    if norm <= 1e-8:
        return vector
    return [v / norm for v in vector]
