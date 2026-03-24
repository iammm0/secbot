"""ACP session state management for the secbot gateway."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Dict, Optional

from opencode_gateway.types import ACPSessionState


class ACPSessionStore:
    """Maintains the mapping between ACP session IDs and secbot sessions."""

    def __init__(self):
        self._sessions: Dict[str, ACPSessionState] = {}

    def create(
        self,
        session_id: str,
        cwd: str,
        agent_type: str = "secbot-cli",
        model: Optional[str] = None,
    ) -> ACPSessionState:
        state = ACPSessionState(
            id=session_id,
            cwd=cwd,
            created_at=datetime.now(timezone.utc).isoformat(),
            agent_type=agent_type,
            model=model,
        )
        self._sessions[session_id] = state
        return state

    def get(self, session_id: str) -> Optional[ACPSessionState]:
        return self._sessions.get(session_id)

    def require(self, session_id: str) -> ACPSessionState:
        state = self._sessions.get(session_id)
        if state is None:
            raise ValueError(f"Session not found: {session_id}")
        return state

    def set_mode(self, session_id: str, mode: str):
        self.require(session_id).mode = mode

    def set_model(self, session_id: str, model: str):
        self.require(session_id).model = model

    def list_all(self):
        return list(self._sessions.values())
