"""
日志上下文传播工具：基于 contextvars 贯穿 request/session/agent/todo/tool/event/attempt。
"""
from __future__ import annotations

from contextlib import contextmanager
from contextvars import ContextVar, Token
from typing import Any, Dict, Iterator

_LOG_CONTEXT_KEYS = (
    "session_id",
    "request_id",
    "agent",
    "todo_id",
    "tool",
    "event",
    "duration_ms",
    "attempt",
)

_CTX_VARS: Dict[str, ContextVar[Any]] = {
    key: ContextVar(f"secbot_log_{key}", default=None) for key in _LOG_CONTEXT_KEYS
}


def get_log_context() -> Dict[str, Any]:
    """获取当前协程上下文中的日志字段。"""
    data: Dict[str, Any] = {}
    for key, var in _CTX_VARS.items():
        value = var.get()
        if value is not None:
            data[key] = value
    return data


def set_log_context(**kwargs: Any) -> Dict[str, Token]:
    """设置日志上下文字段并返回 token，供 reset_log_context 使用。"""
    tokens: Dict[str, Token] = {}
    for key, value in kwargs.items():
        if key in _CTX_VARS:
            tokens[key] = _CTX_VARS[key].set(value)
    return tokens


def reset_log_context(tokens: Dict[str, Token]) -> None:
    """恢复 set_log_context 前的上下文。"""
    for key, token in tokens.items():
        var = _CTX_VARS.get(key)
        if var is not None:
            var.reset(token)


@contextmanager
def log_context(**kwargs: Any) -> Iterator[None]:
    """上下文管理器：在 with 块内临时注入日志字段。"""
    tokens = set_log_context(**kwargs)
    try:
        yield
    finally:
        reset_log_context(tokens)

