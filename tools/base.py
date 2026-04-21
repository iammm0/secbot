"""
基础工具类
"""
from abc import ABC, abstractmethod
from typing import Any, Dict
from pydantic import BaseModel


class ToolResult(BaseModel):
    """工具执行结果"""
    success: bool
    result: Any
    error: str = ""


class BaseTool(ABC):
    """基础工具抽象类"""

    def __init__(self, name: str, description: str):
        self.name = name
        self.description = description

    @abstractmethod
    async def execute(self, **kwargs) -> ToolResult:
        """执行工具"""
        pass

    def get_schema(self) -> Dict[str, Any]:
        """获取工具模式"""
        return {
            "name": self.name,
            "description": self.description,
            "parameters": {}
        }

