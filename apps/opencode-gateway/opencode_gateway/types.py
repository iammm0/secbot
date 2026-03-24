"""ACP protocol type definitions for the secbot gateway."""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional


class ToolKind(str, Enum):
    EXECUTE = "execute"
    EDIT = "edit"
    SEARCH = "search"
    READ = "read"
    FETCH = "fetch"
    OTHER = "other"


class ToolCallStatus(str, Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"


class PlanEntryStatus(str, Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"


@dataclass
class ACPSessionState:
    id: str
    cwd: str
    created_at: str
    mode: str = "agent"
    model: Optional[str] = None
    agent_type: str = "secbot-cli"


@dataclass
class PlanEntry:
    content: str
    status: PlanEntryStatus = PlanEntryStatus.PENDING
    priority: str = "medium"


@dataclass
class ToolCallContent:
    type: str
    content: Optional[Dict[str, Any]] = None
    path: Optional[str] = None
    old_text: Optional[str] = None
    new_text: Optional[str] = None


TOOL_KIND_MAP: Dict[str, ToolKind] = {
    "execute_command": ToolKind.EXECUTE,
    "terminal_session": ToolKind.EXECUTE,
    "system_control": ToolKind.EDIT,
    "write_file": ToolKind.EDIT,
    "port_scan": ToolKind.OTHER,
    "service_detect": ToolKind.OTHER,
    "vuln_scan": ToolKind.OTHER,
    "recon": ToolKind.SEARCH,
    "smart_search": ToolKind.SEARCH,
    "deep_crawl": ToolKind.FETCH,
    "cve_lookup": ToolKind.SEARCH,
}


def tool_to_kind(tool_name: str) -> ToolKind:
    return TOOL_KIND_MAP.get(tool_name, ToolKind.OTHER)
