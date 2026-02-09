"""系统信息收集工具：收集本机系统和网络信息"""
from typing import Any, Dict
from tools.base import BaseTool, ToolResult


class SystemInfoTool(BaseTool):
    """系统信息收集工具：收集本机系统、网络、进程、用户等详细信息"""

    sensitivity = "low"

    def __init__(self):
        super().__init__(
            name="system_info",
            description="收集本机系统信息（主机名、OS、CPU、内存、磁盘、网络接口、进程列表、用户列表等）。参数: category(system/network/process/user/all, 默认all)",
        )

    async def execute(self, **kwargs) -> ToolResult:
        category = kwargs.get("category", "all").lower()

        try:
            from defense.info_collector import InfoCollector

            collector = InfoCollector()
            result = {}
            errors = []

            if category in ("system", "all"):
                try:
                    result["system"] = collector.collect_system_info()
                except Exception as e:
                    errors.append(f"system: {e}")
            if category in ("network", "all"):
                try:
                    result["network"] = collector.collect_network_info()
                except Exception as e:
                    errors.append(f"network: {e}")
            if category in ("process", "all"):
                try:
                    result["processes"] = collector.collect_process_info()
                except Exception as e:
                    errors.append(f"processes: {e}")
            if category in ("user", "all"):
                try:
                    result["users"] = collector.collect_user_info()
                except Exception as e:
                    errors.append(f"users: {e}")

            if errors:
                result["_partial_errors"] = errors
            return ToolResult(success=True, result=result)
        except Exception as e:
            return ToolResult(success=False, result=None, error=str(e))

    def get_schema(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "sensitivity": self.sensitivity,
            "parameters": {
                "category": {
                    "type": "string",
                    "description": "信息类别: system/network/process/user/all",
                    "default": "all",
                },
            },
        }
