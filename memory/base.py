"""
基础记忆管理类
"""
from abc import ABC, abstractmethod
from typing import List, Dict, Any
from agents.base import AgentMessage


class BaseMemory(ABC):
    """基础记忆抽象类"""
    
    @abstractmethod
    async def add(self, message: AgentMessage):
        """添加消息到记忆"""
        pass
    
    @abstractmethod
    async def get(self, limit: int = None) -> List[AgentMessage]:
        """获取记忆"""
        pass
    
    @abstractmethod
    async def clear(self):
        """清空记忆"""
        pass
    
    @abstractmethod
    async def search(self, query: str, limit: int = 5) -> List[AgentMessage]:
        """搜索记忆"""
        pass

