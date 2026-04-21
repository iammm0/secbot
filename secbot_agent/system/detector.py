"""
操作系统检测模块
"""
import os
import platform
import sys
from dataclasses import dataclass
from typing import Dict
from utils.logger import logger


@dataclass
class SystemInfo:
    """系统信息"""
    os_type: str  # windows, linux, darwin (macOS)
    os_name: str
    os_version: str
    os_release: str
    architecture: str
    processor: str
    python_version: str
    hostname: str
    username: str

    def to_dict(self) -> Dict:
        """转换为字典"""
        return {
            "os_type": self.os_type,
            "os_name": self.os_name,
            "os_version": self.os_version,
            "os_release": self.os_release,
            "architecture": self.architecture,
            "processor": self.processor,
            "python_version": self.python_version,
            "hostname": self.hostname,
            "username": self.username
        }


class OSDetector:
    """操作系统检测器"""

    @staticmethod
    def detect() -> SystemInfo:
        """检测当前操作系统信息"""
        system = platform.system().lower()

        # 确定OS类型
        if system == "windows":
            os_type = "windows"
            os_name = platform.system()
            os_version = platform.version()
        elif system == "linux":
            os_type = "linux"
            os_name = platform.system()
            # 尝试获取Linux发行版信息
            try:
                import distro
                os_name = f"{distro.name()} {distro.version()}"
            except ImportError:
                pass
            os_version = platform.release()
        elif system == "darwin":
            os_type = "darwin"  # macOS
            os_name = "macOS"
            os_version = platform.mac_ver()[0]
        else:
            os_type = "unknown"
            os_name = platform.system()
            os_version = platform.version()

        # 获取主机名和用户名
        try:
            import getpass
            username = getpass.getuser()
        except Exception:
            username = "unknown"

        try:
            hostname = platform.node()
        except Exception:
            hostname = "unknown"

        info = SystemInfo(
            os_type=os_type,
            os_name=os_name,
            os_version=os_version,
            os_release=platform.release(),
            architecture=platform.machine(),
            processor=platform.processor(),
            python_version=sys.version.split()[0],
            hostname=hostname,
            username=username
        )

        logger.info(f"检测到操作系统: {info.os_type} - {info.os_name} {info.os_version}")
        return info

    @staticmethod
    def is_windows() -> bool:
        """判断是否为Windows"""
        return platform.system().lower() == "windows"

    @staticmethod
    def is_linux() -> bool:
        """判断是否为Linux"""
        return platform.system().lower() == "linux"

    @staticmethod
    def is_macos() -> bool:
        """判断是否为macOS"""
        return platform.system().lower() == "darwin"

    @staticmethod
    def get_shell() -> str:
        """获取默认shell（Windows上优先使用cmd）"""
        if OSDetector.is_windows():
            # Windows 上优先使用 cmd，不使用 PowerShell
            return "cmd"
        elif OSDetector.is_linux() or OSDetector.is_macos():
            return os.environ.get("SHELL", "/bin/bash")
        return "sh"

