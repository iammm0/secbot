"""
系统操作工具：供智能体使用
"""
from tools.base import BaseTool, ToolResult
from secbot_agent.system.controller import OSController
from utils.logger import logger


class SystemTool(BaseTool):
    """系统操作工具"""

    def __init__(self):
        super().__init__(
            name="system_control",
            description="操作系统控制工具，可以执行文件操作、进程管理、系统信息查询等"
        )
        self.controller = OSController()

    async def execute(self, action: str, **kwargs) -> ToolResult:
        """
        执行系统操作

        Args:
            action: 操作类型
            **kwargs: 操作参数
        """
        try:
            logger.info(f"执行系统操作: {action}, 参数: {kwargs}")

            # 如果 kwargs 中包含一个 'kwargs' 键（嵌套的 kwargs），展开它
            # 这是因为工具调用格式可能是 {"action": "list_files", "kwargs": {"path": "."}}
            if "kwargs" in kwargs and isinstance(kwargs["kwargs"], dict):
                # 展开嵌套的 kwargs
                actual_kwargs = {k: v for k, v in kwargs["kwargs"].items()}
                # 移除 'kwargs' 键，使用展开后的参数
                kwargs = {k: v for k, v in kwargs.items() if k != "kwargs"}
                kwargs.update(actual_kwargs)

            # 执行操作
            result = self.controller.execute(action, **kwargs)

            if result["success"]:
                return ToolResult(
                    success=True,
                    result=result["result"]
                )
            else:
                return ToolResult(
                    success=False,
                    result=None,
                    error=result.get("error", "操作失败")
                )

        except Exception as e:
            logger.error(f"系统工具错误: {e}")
            return ToolResult(success=False, result=None, error=str(e))

    def get_schema(self) -> dict:
        """获取工具模式"""
        return {
            "name": self.name,
            "description": self.description,
            "parameters": {
                "action": {
                    "type": "string",
                    "description": "操作类型",
                    "enum": self.controller.get_available_actions()
                },
                "kwargs": {
                    "type": "object",
                    "description": "操作参数（根据action不同而不同）"
                }
            }
        }
