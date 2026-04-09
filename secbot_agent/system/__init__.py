"""操作系统控制模块"""

from .detector import OSDetector, SystemInfo
from .controller import OSController
from .commands import SystemCommands

__all__ = [
    "OSDetector",
    "SystemInfo",
    "OSController",
    "SystemCommands"
]

