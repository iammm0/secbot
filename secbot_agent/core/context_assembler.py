"""
ContextAssembler：三层上下文组装器
与 npm-release 的 ContextAssemblerService 对齐，组合：
1. 当前会话最近消息（RecentSession）
2. SQLite 历史轮次（SQLiteHistory）
3. 向量 episodic 记忆检索（VectorMemory）
"""

import math
import unicodedata
from dataclasses import dataclass
from typing import List, Optional, TYPE_CHECKING

from utils.logger import logger

if TYPE_CHECKING:
    from secbot_agent.core.memory.manager import MemoryManager
    from secbot_agent.core.memory.vector_store import VectorStoreManager
    from secbot_agent.core.models import Session
    from secbot_agent.database.manager import DatabaseManager

VECTOR_DIMENSION = 128


@dataclass
class ContextDebugMeta:
    session_messages: int = 0
    sqlite_turns: int = 0
    vector_hits: int = 0


@dataclass
class AssembledContext:
    context_block: str = ""
    debug: ContextDebugMeta = None

    def __post_init__(self):
        if self.debug is None:
            self.debug = ContextDebugMeta()


class ContextAssembler:
    """
    三层上下文组装器 —— 合并会话消息、SQLite 对话历史和向量 episodic 记忆，
    为 QA / Agent 提供统一的 contextBlock。
    """

    def __init__(
        self,
        db_manager: "DatabaseManager",
        memory_manager: Optional["MemoryManager"] = None,
        vector_store_manager: Optional["VectorStoreManager"] = None,
    ):
        self.db_manager = db_manager
        self.memory_manager = memory_manager
        self.vector_store_manager = vector_store_manager

    async def build(
        self,
        query: str,
        session: "Session",
        session_id: str,
        agent_type: str = "hackbot",
    ) -> AssembledContext:
        recent_session = [
            f"{m.role.value}: {m.content}" for m in session.messages[-24:]
        ]

        sqlite_history = self.db_manager.get_conversations(
            session_id=session_id, limit=8
        )

        dedupe = set()
        sqlite_lines: List[str] = []
        for turn in reversed(sqlite_history):
            pair = f"用户: {turn.user_message}\n助手: {turn.assistant_message}"
            if pair in dedupe:
                continue
            dedupe.add(pair)
            sqlite_lines.append(pair)

        vector_lines: List[str] = []
        if self.vector_store_manager is not None:
            try:
                query_vec = text_to_vector(query)
                store = self.vector_store_manager.get_store("episodic", VECTOR_DIMENSION)
                hits = store.search(query_vec, limit=6, collection="episodic", threshold=0.3)
                for item, similarity in hits:
                    content = item.content.strip()
                    if not content or content in dedupe:
                        continue
                    dedupe.add(content)
                    sid = (item.metadata or {}).get("sessionId", "unknown")
                    vector_lines.append(
                        f"{content}\n来源: {sid} / 相似度: {similarity:.3f}"
                    )
            except Exception as e:
                logger.warning(f"ContextAssembler 向量检索失败: {e}")

        parts: List[str] = []
        if recent_session:
            parts.append("【RecentSession】\n" + "\n".join(recent_session))
        if sqlite_lines:
            parts.append("【SQLiteHistory】\n" + "\n\n".join(sqlite_lines))
        if vector_lines:
            parts.append("【VectorMemory】\n" + "\n\n".join(vector_lines))
        parts.append(f"【RequestMeta】\nsession_id: {session_id}\nagent: {agent_type}")

        return AssembledContext(
            context_block="\n\n".join(parts),
            debug=ContextDebugMeta(
                session_messages=len(recent_session),
                sqlite_turns=len(sqlite_lines),
                vector_hits=len(vector_lines),
            ),
        )

    async def remember_turn(
        self,
        session_id: str,
        agent_type: str,
        user_message: str,
        assistant_message: str,
    ) -> None:
        merged = f"用户: {user_message}\n助手: {assistant_message}"
        try:
            if self.memory_manager is not None:
                await self.memory_manager.remember(
                    merged, "short_term", 0.6, sessionId=session_id, agentType=agent_type
                )
                await self.memory_manager.remember(
                    merged, "episodic", 0.75, sessionId=session_id, agentType=agent_type
                )
            if self.vector_store_manager is not None:
                from datetime import datetime, timezone

                vec = text_to_vector(merged)
                await self.vector_store_manager.add_memory(
                    content=merged,
                    vector=vec,
                    memory_type="episodic",
                    metadata={
                        "sessionId": session_id,
                        "agentType": agent_type,
                        "createdAt": datetime.now(timezone.utc).isoformat(),
                    },
                )
        except Exception as e:
            logger.warning(f"ContextAssembler.remember_turn 失败: {e}")


def text_to_vector(text: str) -> List[float]:
    """确定性字符哈希式向量（128 维），与 npm 端 textToVector 对齐。"""
    vector = [0.0] * VECTOR_DIMENSION
    normalized = unicodedata.normalize("NFKC", text).lower()
    if not normalized:
        return vector
    for i, ch in enumerate(normalized):
        code = ord(ch)
        index = (code + i * 31) % VECTOR_DIMENSION
        vector[index] += 1 + (code % 7) * 0.05
    norm = math.sqrt(sum(v * v for v in vector))
    if norm <= 1e-8:
        return vector
    return [v / norm for v in vector]
