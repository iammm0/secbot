"""
Permission model for secbot ACP gateway.

Implements allow/ask/deny permission policies for tool execution,
aligned with opencode's permission.asked -> requestPermission flow.
"""
from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Coroutine, Dict, List, Optional, Set


class PermissionDecision(str, Enum):
    ALLOW = "allow"
    DENY = "deny"
    ASK = "ask"


class PermissionCategory(str, Enum):
    EDIT = "edit"
    EXECUTE = "execute"
    READ = "read"
    NETWORK = "network"
    SKILL = "skill"


@dataclass
class PermissionRequest:
    id: str
    session_id: str
    category: PermissionCategory
    tool_name: str
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class PermissionPolicy:
    """Configurable permission policy per category."""
    default: PermissionDecision = PermissionDecision.ASK
    always_allow: Set[str] = field(default_factory=set)
    always_deny: Set[str] = field(default_factory=set)


PermissionCallback = Callable[[PermissionRequest], Coroutine[Any, Any, PermissionDecision]]


class PermissionManager:
    """Manages permission policies and tracks granted permissions."""

    def __init__(self):
        self._policies: Dict[PermissionCategory, PermissionPolicy] = {
            PermissionCategory.READ: PermissionPolicy(default=PermissionDecision.ALLOW),
            PermissionCategory.EDIT: PermissionPolicy(default=PermissionDecision.ASK),
            PermissionCategory.EXECUTE: PermissionPolicy(default=PermissionDecision.ASK),
            PermissionCategory.NETWORK: PermissionPolicy(default=PermissionDecision.ALLOW),
            PermissionCategory.SKILL: PermissionPolicy(default=PermissionDecision.ALLOW),
        }
        self._session_grants: Dict[str, Set[str]] = {}
        self._ask_callback: Optional[PermissionCallback] = None

    def set_callback(self, callback: PermissionCallback):
        self._ask_callback = callback

    def set_policy(self, category: PermissionCategory, policy: PermissionPolicy):
        self._policies[category] = policy

    async def check(self, request: PermissionRequest) -> PermissionDecision:
        policy = self._policies.get(request.category, PermissionPolicy())

        if request.tool_name in policy.always_deny:
            return PermissionDecision.DENY
        if request.tool_name in policy.always_allow:
            return PermissionDecision.ALLOW

        grant_key = f"{request.session_id}:{request.category.value}:{request.tool_name}"
        if grant_key in self._session_grants.get(request.session_id, set()):
            return PermissionDecision.ALLOW

        if policy.default == PermissionDecision.ASK and self._ask_callback:
            decision = await self._ask_callback(request)
            if decision == PermissionDecision.ALLOW:
                self._session_grants.setdefault(request.session_id, set()).add(grant_key)
            return decision

        return policy.default

    def grant_always(self, session_id: str, category: PermissionCategory, tool_name: str):
        grant_key = f"{session_id}:{category.value}:{tool_name}"
        self._session_grants.setdefault(session_id, set()).add(grant_key)

    def revoke_session(self, session_id: str):
        self._session_grants.pop(session_id, None)


def categorize_tool(tool_name: str) -> PermissionCategory:
    _EDIT_TOOLS = {"system_control", "write_file", "edit_file", "delete_file", "move_file"}
    _EXEC_TOOLS = {"execute_command", "terminal_session"}
    _SEARCH_TOOLS = {"smart_search", "deep_crawl", "recon"}

    if tool_name in _EDIT_TOOLS:
        return PermissionCategory.EDIT
    if tool_name in _EXEC_TOOLS:
        return PermissionCategory.EXECUTE
    if tool_name in _SEARCH_TOOLS:
        return PermissionCategory.NETWORK
    return PermissionCategory.READ
