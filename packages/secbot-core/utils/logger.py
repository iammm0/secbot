"""
日志配置模块
支持初始化阶段日志折叠（控制台静默），文件日志始终记录。
并提供统一上下文注入、脱敏与截断能力。
"""
import re
import sys
from typing import Any
from loguru import logger as base_logger
from hackbot_config import settings, get_log_level
from utils.log_context import get_log_context


_LOG_CONTEXT_DEFAULTS = {
    "session_id": "-",
    "request_id": "-",
    "agent": "-",
    "todo_id": "-",
    "tool": "-",
    "event": "-",
    "duration_ms": "-",
    "attempt": 1,
}


def _sensitive_keys() -> set[str]:
    raw = getattr(settings, "log_sensitive_keys", "") or ""
    return {k.strip().lower() for k in raw.split(",") if k.strip()}


def _truncate_string(value: str, max_len: int) -> str:
    if max_len > 0 and len(value) > max_len:
        return f"{value[:max_len]}...(truncated)"
    return value


def _sanitize_value(value: Any, key: str | None = None) -> Any:
    sensitive = _sensitive_keys()
    if key and key.lower() in sensitive:
        return "***"

    if isinstance(value, dict):
        return {k: _sanitize_value(v, k) for k, v in value.items()}
    if isinstance(value, list):
        max_items = max(int(getattr(settings, "log_max_list_items", 20)), 1)
        trimmed = value[:max_items]
        output = [_sanitize_value(v) for v in trimmed]
        if len(value) > max_items:
            output.append(f"...({len(value) - max_items} items truncated)")
        return output
    if isinstance(value, str):
        masked = re.sub(r"Bearer\s+[A-Za-z0-9\-._~+/]+=*", "Bearer ***", value, flags=re.IGNORECASE)
        masked = re.sub(r"\bsk-[A-Za-z0-9]{12,}\b", "sk-***", masked)
        return _truncate_string(masked, int(getattr(settings, "log_max_field_chars", 1000)))
    return value


def _inject_default_context(record: dict) -> dict:
    extra = record.setdefault("extra", {})
    for key, value in get_log_context().items():
        extra.setdefault(key, value)
    for key, value in _LOG_CONTEXT_DEFAULTS.items():
        extra.setdefault(key, value)
    record["message"] = _truncate_string(
        _sanitize_value(str(record.get("message", ""))),
        int(getattr(settings, "log_max_message_chars", 2000)),
    )
    record["extra"] = _sanitize_value(extra)
    return record


logger = base_logger.patch(_inject_default_context)
logger.remove()

_console_handler_id = None
_file_handler_id = None

_LOG_FORMAT_CONSOLE = (
    "<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | "
    "<cyan>{name}</cyan>:<cyan>{function}</cyan> | "
    "sid={extra[session_id]} rid={extra[request_id]} agent={extra[agent]} "
    "todo={extra[todo_id]} tool={extra[tool]} event={extra[event]} attempt={extra[attempt]} "
    "cost={extra[duration_ms]}ms - <level>{message}</level>"
)

_LOG_FORMAT_FILE = (
    "{time:YYYY-MM-DD HH:mm:ss} | {level: <8} | {name}:{function} | "
    "sid={extra[session_id]} rid={extra[request_id]} agent={extra[agent]} "
    "todo={extra[todo_id]} tool={extra[tool]} event={extra[event]} attempt={extra[attempt]} "
    "cost={extra[duration_ms]}ms - {message}"
)


def _normalize_level(level: str | None) -> str:
    raw = (level or "").strip().upper()
    return raw if raw in {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"} else "INFO"


def _configure_handlers(level: str | None = None, console_verbose: bool | None = None) -> None:
    global _console_handler_id, _file_handler_id
    target_level = _normalize_level(level or get_log_level())
    verbose = settings.verbose_init if console_verbose is None else bool(console_verbose)
    console_level = target_level if verbose else "WARNING"

    if _console_handler_id is not None:
        logger.remove(_console_handler_id)
    if _file_handler_id is not None:
        logger.remove(_file_handler_id)

    _console_handler_id = logger.add(
        sys.stdout,
        format=_LOG_FORMAT_CONSOLE,
        level=console_level,
        colorize=True,
    )
    _file_handler_id = logger.add(
        settings.log_file,
        format=_LOG_FORMAT_FILE,
        level=target_level,
        rotation="10 MB",
        retention="7 days",
        compression="zip",
    )


def restore_console_log_level(level: str = None):
    """
    恢复控制台日志级别（在交互模式正式开始后调用）。
    如果传入 level 则使用该级别，否则使用 settings.log_level。
    """
    _configure_handlers(level=level, console_verbose=True)


def set_log_level(level: str, console_verbose: bool = True) -> str:
    """运行时切换日志级别并刷新日志 sinks。"""
    normalized = _normalize_level(level)
    _configure_handlers(level=normalized, console_verbose=console_verbose)
    return normalized


def get_runtime_log_level() -> str:
    """返回当前运行时日志级别（读取配置来源）。"""
    return _normalize_level(get_log_level())


def bind_log_context(**kwargs):
    """绑定结构化上下文字段，便于跨模块统一日志检索。"""
    return logger.bind(**kwargs)


_configure_handlers(level=get_log_level())


__all__ = [
    "logger",
    "restore_console_log_level",
    "set_log_level",
    "get_runtime_log_level",
    "bind_log_context",
]
