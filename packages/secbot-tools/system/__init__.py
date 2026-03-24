"""操作系统控制模块"""

from system.detector import OSDetector, SystemInfo
from system.controller import OSController
from system.commands import SystemCommands

__all__ = [
    "OSDetector",
    "SystemInfo",
    "OSController",
    "SystemCommands"
]

