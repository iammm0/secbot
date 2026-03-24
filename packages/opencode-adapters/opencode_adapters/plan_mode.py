"""
Plan mode controller for the secbot ACP gateway.

Manages the plan/agent/ask mode lifecycle, controlling which tools
are available in each mode and handling mode transitions.

Design reference: opencode PlanExitTool / plan-enter / plan-exit
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Coroutine, Dict, List, Optional, Set


class SessionMode(str, Enum):
    AGENT = "agent"
    PLAN = "plan"
    ASK = "ask"


@dataclass
class PlanTransitionResult:
    """Outcome of a plan_enter or plan_exit attempt."""
    success: bool
    previous_mode: SessionMode
    new_mode: SessionMode
    message: str = ""
    plan_text: Optional[str] = None


PLAN_MODE_ALLOWED_TOOLS: Set[str] = frozenset({
    "smart_search",
    "deep_crawl",
    "recon",
    "cve_lookup",
    "read_file",
    "file_analysis",
    "list_directory",
})

ASK_MODE_ALLOWED_TOOLS: Set[str] = frozenset()

PlanApprovalCallback = Callable[[str, str], Coroutine[Any, Any, bool]]


class PlanModeController:
    """
    Controls mode transitions and tool availability per mode.

    In 'plan' mode:
      - Only read/search tools are available (no execution, no edits).
      - The planner generates a plan, which the user can accept or reject.
      - On accept, mode switches to 'agent' and execution begins.

    In 'ask' mode:
      - No tools are available; the agent answers questions only.

    In 'agent' mode:
      - All tools are available with permission checks.
    """

    def __init__(self):
        self._session_modes: Dict[str, SessionMode] = {}
        self._pending_plans: Dict[str, str] = {}
        self._approval_callback: Optional[PlanApprovalCallback] = None

    def set_approval_callback(self, callback: PlanApprovalCallback):
        """Register a callback invoked when plan_exit needs user approval."""
        self._approval_callback = callback

    # ------------------------------------------------------------------
    # Mode read / write
    # ------------------------------------------------------------------

    def get_mode(self, session_id: str) -> SessionMode:
        return self._session_modes.get(session_id, SessionMode.AGENT)

    def set_mode(self, session_id: str, mode: SessionMode):
        self._session_modes[session_id] = mode

    # ------------------------------------------------------------------
    # Transition helpers (plan_enter / plan_exit)
    # ------------------------------------------------------------------

    def enter_plan(self, session_id: str) -> PlanTransitionResult:
        """
        Switch from agent mode to plan mode (plan_enter).

        Only valid when the current mode is AGENT.  Returns a result
        indicating success/failure plus the before/after modes.
        """
        prev = self.get_mode(session_id)
        if prev == SessionMode.PLAN:
            return PlanTransitionResult(
                success=False, previous_mode=prev, new_mode=prev,
                message="Already in plan mode.",
            )
        self._session_modes[session_id] = SessionMode.PLAN
        return PlanTransitionResult(
            success=True, previous_mode=prev, new_mode=SessionMode.PLAN,
            message="Switched to plan mode.  Only read/search tools are available.",
        )

    async def exit_plan(
        self, session_id: str, plan_text: str = "",
    ) -> PlanTransitionResult:
        """
        Switch from plan mode to agent mode (plan_exit).

        The plan text is stored as the pending plan.  If an approval
        callback is registered the user is asked to confirm; on rejection
        the mode stays as PLAN.
        """
        prev = self.get_mode(session_id)
        if prev != SessionMode.PLAN:
            return PlanTransitionResult(
                success=False, previous_mode=prev, new_mode=prev,
                message="Not in plan mode; cannot exit plan.",
            )

        self._pending_plans[session_id] = plan_text

        approved = True
        if self._approval_callback:
            approved = await self._approval_callback(session_id, plan_text)

        if not approved:
            return PlanTransitionResult(
                success=False, previous_mode=prev, new_mode=SessionMode.PLAN,
                message="Plan not approved; staying in plan mode.",
                plan_text=plan_text,
            )

        self._session_modes[session_id] = SessionMode.AGENT
        return PlanTransitionResult(
            success=True, previous_mode=prev, new_mode=SessionMode.AGENT,
            message="Plan approved.  Switched to agent mode for execution.",
            plan_text=plan_text,
        )

    def get_pending_plan(self, session_id: str) -> Optional[str]:
        return self._pending_plans.get(session_id)

    def clear_pending_plan(self, session_id: str):
        self._pending_plans.pop(session_id, None)

    # ------------------------------------------------------------------
    # Tool filtering
    # ------------------------------------------------------------------

    def is_tool_allowed(self, session_id: str, tool_name: str) -> bool:
        mode = self.get_mode(session_id)
        if mode == SessionMode.AGENT:
            return True
        if mode == SessionMode.PLAN:
            return tool_name in PLAN_MODE_ALLOWED_TOOLS
        if mode == SessionMode.ASK:
            return tool_name in ASK_MODE_ALLOWED_TOOLS
        return False

    def filter_tools(self, session_id: str, tool_names: List[str]) -> List[str]:
        return [t for t in tool_names if self.is_tool_allowed(session_id, t)]

    # ------------------------------------------------------------------
    # Metadata
    # ------------------------------------------------------------------

    def available_modes(self) -> List[Dict[str, str]]:
        return [
            {"id": "agent", "name": "Agent", "description": "Full agent mode with planning and execution"},
            {"id": "plan", "name": "Plan", "description": "Plan-only mode: generates plans without executing"},
            {"id": "ask", "name": "Ask", "description": "Question-answering only, no tool execution"},
        ]
