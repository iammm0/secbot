"""
按 session_id 保存上下文池状态（与 npm ContextStoreService 对齐）。
"""

from __future__ import annotations

from datetime import datetime
from typing import Dict, List, Optional

from secbot_agent.core.model_context_window import approx_tokens
from secbot_agent.core.models import (
    ContextItem,
    ContextPatch,
    ContextPatchFact,
    FocusEntry,
    SessionContextState,
)

FOCUS_DECAY = 0.85
FOCUS_MIN_WEIGHT = 0.05
FOCUS_MAX_ITEMS = 12
PINNED_MAX_ITEMS = 32


def _clamp(value: float, lo: float, hi: float) -> float:
    if value != value:  # NaN
        return lo
    return min(hi, max(lo, value))


def _hash_short(text: str) -> str:
    h = 0
    for ch in text:
        h = (h * 31 + ord(ch)) & 0xFFFFFFFF
    return format(h, "x")[:8]


class ContextStore:
    def __init__(self) -> None:
        self._stores: Dict[str, SessionContextState] = {}

    def get(self, session_id: str) -> SessionContextState:
        if session_id not in self._stores:
            self._stores[session_id] = SessionContextState()
        return self._stores[session_id]

    def set_model_name(self, session_id: str, model_name: Optional[str]) -> None:
        if not model_name:
            return
        self.get(session_id).model_name = model_name

    def apply_patch(self, session_id: str, patch: ContextPatch) -> None:
        state = self.get(session_id)
        now = datetime.now()

        for fact in patch.facts or []:
            self._upsert_fact(state, fact, now)

        for raw in patch.pinned or []:
            t = (raw or "").strip()
            if not t:
                continue
            self._upsert_fact(
                state,
                ContextPatchFact(
                    key=f"pin-{_hash_short(t)}",
                    value=t,
                    priority=0.95,
                    ttl="session",
                ),
                now,
            )

        if patch.unresolved:
            merged = set(state.unresolved)
            merged.update(s.strip() for s in patch.unresolved if s and str(s).strip())
            state.unresolved = [x for x in merged if x][:16]

        if patch.suggested_focus:
            self._bump_focus(state, patch.suggested_focus, 1.0)

        self._prune_pinned(state)

    def update_focus(self, session_id: str, keywords: List[str], boost: float = 1.0) -> None:
        state = self.get(session_id)
        for entry in state.focus:
            entry.weight *= FOCUS_DECAY
        self._bump_focus(state, keywords, boost)

    def end_turn(self, session_id: str) -> None:
        state = self._stores.get(session_id)
        if not state:
            return
        state.pinned = [p for p in state.pinned if p.ttl != "turn"]
        state.focus = [f for f in state.focus if f.weight >= FOCUS_MIN_WEIGHT]

    def merge_intent_focus(self, session_id: str, keywords: List[str], boost: float = 1.5) -> None:
        """合并 IntentRouter 给出的 focus；仅对尚未在 focus 列表中的词加权。"""
        state = self.get(session_id)
        existing = {f.keyword for f in state.focus}
        fresh = [
            k.strip().lower()
            for k in keywords
            if k and k.strip() and k.strip().lower() not in existing and len(k.strip()) <= 80
        ]
        if fresh:
            self._bump_focus(state, fresh, boost)

    def _upsert_fact(
        self, state: SessionContextState, fact: ContextPatchFact, now: datetime
    ) -> None:
        value = (fact.value or "").strip()
        key = (fact.key or "").strip()
        if not value or not key:
            return
        tokens_estimate = approx_tokens(f"{key}: {value}")
        ttl = fact.ttl if fact.ttl in ("turn", "session", "persistent") else "session"
        priority = _clamp(float(fact.priority), 0.0, 1.0)
        tags = (fact.tags or [])[:8]

        existing_idx = next((i for i, p in enumerate(state.pinned) if p.id == key), -1)
        item = ContextItem(
            id=key,
            content=f"{key}: {value}",
            source="explore",
            priority=priority,
            tokens_estimate=tokens_estimate,
            tags=tags,
            ttl=ttl,
            created_at=(
                state.pinned[existing_idx].created_at
                if existing_idx >= 0
                else now
            ),
        )
        if existing_idx >= 0:
            state.pinned[existing_idx] = item
        else:
            state.pinned.append(item)

    def _bump_focus(
        self, state: SessionContextState, keywords: List[str], boost: float
    ) -> None:
        now = datetime.now()
        for raw in keywords:
            kw = (raw or "").strip().lower()
            if not kw or len(kw) > 80:
                continue
            existing = next((f for f in state.focus if f.keyword == kw), None)
            if existing:
                existing.weight = min(5.0, existing.weight + boost)
                existing.last_seen_at = now
            else:
                state.focus.append(
                    FocusEntry(keyword=kw, weight=min(5.0, boost), last_seen_at=now)
                )
        state.focus.sort(key=lambda x: x.weight, reverse=True)
        if len(state.focus) > FOCUS_MAX_ITEMS:
            state.focus = state.focus[:FOCUS_MAX_ITEMS]

    def _prune_pinned(self, state: SessionContextState) -> None:
        if len(state.pinned) <= PINNED_MAX_ITEMS:
            return
        state.pinned.sort(
            key=lambda p: (p.priority, p.created_at.timestamp()), reverse=True
        )
        state.pinned = state.pinned[:PINNED_MAX_ITEMS]


def get_focus_keywords(state: SessionContextState) -> List[str]:
    return [f.keyword for f in state.focus]


def get_active_focus(state: SessionContextState, min_weight: float = 0.2) -> List[FocusEntry]:
    return [f for f in state.focus if f.weight >= min_weight]
