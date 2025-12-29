"""
基于数据库的记忆管理
"""
from typing import List, Optional
from agents.base import AgentMessage
from memory.base import BaseMemory
from database.manager import DatabaseManager
from database.models import Conversation
from utils.logger import logger


class DatabaseMemory(BaseMemory):
    """基于数据库的记忆管理"""
    
    def __init__(self, db_manager: DatabaseManager, agent_type: str, session_id: Optional[str] = None):
        self.db = db_manager
        self.agent_type = agent_type
        self.session_id = session_id
        logger.info(f"初始化数据库记忆: agent={agent_type}, session={session_id}")
    
    async def add(self, message: AgentMessage):
        """添加消息到数据库"""
        # 数据库记忆主要用于保存完整的对话，单个消息的添加需要配对
        # 这里只记录，实际的对话保存在智能体的process方法中
        logger.debug(f"数据库记忆: 记录消息 {message.role}")
    
    async def save_conversation(self, user_message: str, assistant_message: str):
        """保存完整对话到数据库"""
        conversation = Conversation(
            agent_type=self.agent_type,
            user_message=user_message,
            assistant_message=assistant_message,
            session_id=self.session_id
        )
        self.db.save_conversation(conversation)
        logger.debug(f"已保存对话到数据库: session={self.session_id}")
    
    async def get(self, limit: Optional[int] = None) -> List[AgentMessage]:
        """从数据库获取对话历史"""
        conversations = self.db.get_conversations(
            agent_type=self.agent_type,
            session_id=self.session_id,
            limit=limit
        )
        
        messages = []
        for conv in conversations:
            messages.append(AgentMessage(role="user", content=conv.user_message))
            messages.append(AgentMessage(role="assistant", content=conv.assistant_message))
        
        return messages
    
    async def clear(self):
        """清空数据库中的对话历史"""
        count = self.db.delete_conversations(
            agent_type=self.agent_type,
            session_id=self.session_id
        )
        logger.info(f"已清空数据库记忆: {count} 条记录")
    
    async def search(self, query: str, limit: int = 5) -> List[AgentMessage]:
        """搜索对话历史（简单文本匹配）"""
        conversations = self.db.get_conversations(
            agent_type=self.agent_type,
            session_id=self.session_id,
            limit=100  # 获取更多记录用于搜索
        )
        
        # 简单的文本匹配搜索
        results = []
        query_lower = query.lower()
        
        for conv in conversations:
            if (query_lower in conv.user_message.lower() or 
                query_lower in conv.assistant_message.lower()):
                results.append(AgentMessage(role="user", content=conv.user_message))
                results.append(AgentMessage(role="assistant", content=conv.assistant_message))
                if len(results) >= limit * 2:  # 每对对话包含两条消息
                    break
        
        return results[:limit * 2]

