"""
日志配置模块
"""
import sys
from pathlib import Path
from loguru import logger
from config import settings

# 移除默认处理器
logger.remove()

# 添加控制台输出
logger.add(
    sys.stdout,
    format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | <cyan>{name}</cyan>:<cyan>{function}</cyan> - <level>{message}</level>",
    level=settings.log_level,
    colorize=True
)

# 添加文件输出
logger.add(
    settings.log_file,
    format="{time:YYYY-MM-DD HH:mm:ss} | {level: <8} | {name}:{function} - {message}",
    level=settings.log_level,
    rotation="10 MB",
    retention="7 days",
    compression="zip"
)

__all__ = ["logger"]

