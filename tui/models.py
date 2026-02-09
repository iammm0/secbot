"""
TUI 数据模型：定义贯穿整个 TUI 层和 Agent 层的核心数据结构
"""

from dataclasses import dataclass, field
from typing import List, Optional, Dict, Any
from datetime import datetime
from enum import Enum


# ---------------------------------------------------------------------------
# Todo 相关
# ---------------------------------------------------------------------------

class TodoStatus(str, Enum):
    """Todo 状态枚举"""
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


@dataclass
class TodoItem:
    """单条 Todo 项"""
    id: str
    content: str
    status: TodoStatus = TodoStatus.PENDING
    depends_on: List[str] = field(default_factory=list)
    tool_hint: Optional[str] = None
    result_summary: Optional[str] = None
    created_at: datetime = field(default_factory=datetime.now)
    updated_at: datetime = field(default_factory=datetime.now)

    def mark_in_progress(self):
        self.status = TodoStatus.IN_PROGRESS
        self.updated_at = datetime.now()

    def mark_completed(self, result_summary: Optional[str] = None):
        self.status = TodoStatus.COMPLETED
        if result_summary:
            self.result_summary = result_summary
        self.updated_at = datetime.now()

    def mark_cancelled(self):
        self.status = TodoStatus.CANCELLED
        self.updated_at = datetime.now()


# ---------------------------------------------------------------------------
# Plan 结果
# ---------------------------------------------------------------------------

class RequestType(str, Enum):
    """请求类型枚举"""
    GREETING = "greeting"
    SIMPLE = "simple"
    TECHNICAL = "technical"


@dataclass
class PlanResult:
    """规划结果"""
    request_type: RequestType
    todos: List[TodoItem] = field(default_factory=list)
    direct_response: Optional[str] = None
    plan_summary: str = ""


# ---------------------------------------------------------------------------
# 交互摘要
# ---------------------------------------------------------------------------

@dataclass
class InteractionSummary:
    """单次交互的结构化摘要"""
    task_summary: str = ""
    todo_completion: Dict[str, int] = field(default_factory=lambda: {
        "total": 0,
        "completed": 0,
        "failed": 0,
        "cancelled": 0,
    })
    key_findings: List[str] = field(default_factory=list)
    action_summary: List[str] = field(default_factory=list)
    risk_assessment: Optional[Dict[str, Any]] = None
    recommendations: List[str] = field(default_factory=list)
    overall_conclusion: str = ""
    raw_report: str = ""


# ---------------------------------------------------------------------------
# 会话消息
# ---------------------------------------------------------------------------

class MessageRole(str, Enum):
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"


@dataclass
class SessionMessage:
    """会话中的单条消息"""
    role: MessageRole
    content: str
    timestamp: datetime = field(default_factory=datetime.now)
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class Session:
    """单个会话"""
    id: str
    name: str = ""
    messages: List[SessionMessage] = field(default_factory=list)
    agent_type: str = "hackbot"
    created_at: datetime = field(default_factory=datetime.now)
    updated_at: datetime = field(default_factory=datetime.now)

    def add_message(self, role: MessageRole, content: str, **metadata):
        msg = SessionMessage(role=role, content=content, metadata=metadata)
        self.messages.append(msg)
        self.updated_at = datetime.now()
        return msg
