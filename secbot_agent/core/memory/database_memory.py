"""
数据库记忆封装 — 将对话保存到 DatabaseManager，供智能体使用。
"""

from datetime import datetime
from typing import TYPE_CHECKING

from secbot_agent.database.models import Conversation

if TYPE_CHECKING:
    from secbot_agent.database.manager import DatabaseManager


class DatabaseMemory:
    """基于 DatabaseManager 的对话记忆，供 HackbotAgent/SuperHackbotAgent 保存对话。"""

    def __init__(
        self,
        db_manager: "DatabaseManager",
        *,
        agent_type: str,
        session_id: str,
    ):
        self.db_manager = db_manager
        self.agent_type = agent_type
        self.session_id = session_id

    async def save_conversation(self, user_message: str, assistant_message: str) -> None:
        """保存一轮对话到数据库。"""
        conv = Conversation(
            agent_type=self.agent_type,
            user_message=user_message,
            assistant_message=assistant_message,
            session_id=self.session_id,
            timestamp=datetime.now(),
        )
        self.db_manager.save_conversation(conv)
