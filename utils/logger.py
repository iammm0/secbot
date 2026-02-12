"""
日志配置模块
支持初始化阶段日志折叠（控制台静默），文件日志始终记录。
"""
import sys
from pathlib import Path
from loguru import logger
from hackbot_config import settings

# 移除默认处理器
logger.remove()

# ---- 控制台输出 ----
# 初始化阶段：如果 verbose_init=false，控制台仅显示 WARNING 及以上
_console_level = settings.log_level if settings.verbose_init else "WARNING"
_console_handler_id = logger.add(
    sys.stdout,
    format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | <cyan>{name}</cyan>:<cyan>{function}</cyan> - <level>{message}</level>",
    level=_console_level,
    colorize=True,
)

# ---- 文件输出（始终按 LOG_LEVEL 记录）----
logger.add(
    settings.log_file,
    format="{time:YYYY-MM-DD HH:mm:ss} | {level: <8} | {name}:{function} - {message}",
    level=settings.log_level,
    rotation="10 MB",
    retention="7 days",
    compression="zip",
)


def restore_console_log_level(level: str = None):
    """
    恢复控制台日志级别（在交互模式正式开始后调用）。
    如果传入 level 则使用该级别，否则使用 settings.log_level。
    """
    global _console_handler_id
    target_level = level or settings.log_level
    logger.remove(_console_handler_id)
    _console_handler_id = logger.add(
        sys.stdout,
        format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | <cyan>{name}</cyan>:<cyan>{function}</cyan> - <level>{message}</level>",
        level=target_level,
        colorize=True,
    )


__all__ = ["logger", "restore_console_log_level"]
