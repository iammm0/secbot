"""
记忆管理系统 - 三层记忆架构
参考 OpenAI Agents SDK 和 CrewAI 的记忆设计
"""

import json
import uuid
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field, asdict
from collections import deque
from loguru import logger


@dataclass
class MemoryItem:
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    content: str = ""
    type: str = ""  # short_term, episodic, long_term
    importance: float = 0.5  # 0-1, 越高越重要
    created_at: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    metadata: Dict = field(default_factory=dict)

    def to_dict(self) -> Dict:
        return asdict(self)


class BaseMemoryStore(ABC):
    """记忆存储基类"""

    @abstractmethod
    async def add(self, item: MemoryItem) -> None:
        pass

    @abstractmethod
    async def get(self, limit: int = None) -> List[MemoryItem]:
        pass

    @abstractmethod
    async def search(self, query: str, limit: int = 5) -> List[MemoryItem]:
        pass

    @abstractmethod
    async def clear(self) -> None:
        pass


class ShortTermMemory(BaseMemoryStore):
    """短期记忆 - 会话内的上下文管理"""

    def __init__(self, max_turns: int = 10):
        self.max_turns = max_turns
        self.buffer: deque = deque(maxlen=max_turns)

    async def add(self, item: MemoryItem) -> None:
        item.type = "short_term"
        self.buffer.append(item)
        logger.debug(f"短期记忆: {len(self.buffer)} 条")

    async def get(self, limit: int = None) -> List[MemoryItem]:
        items = list(self.buffer)
        if limit and limit > 0:
            items = items[-limit:]
        return items

    async def search(self, query: str, limit: int = 5) -> List[MemoryItem]:
        query_lower = query.lower()
        results = [item for item in self.buffer if query_lower in item.content.lower()][
            :limit
        ]
        return results

    async def clear(self) -> None:
        self.buffer.clear()
        logger.info("短期记忆已清空")

    def get_recent(self, n: int = None) -> List[MemoryItem]:
        if n:
            return list(self.buffer)[-n:]
        return list(self.buffer)


class EpisodicMemory(BaseMemoryStore):
    """情节记忆 - 跨会话的事件和经验"""

    def __init__(self, storage_path: str = "./data/episodic_memory.json"):
        self.storage_path = storage_path
        self.episodes: List[MemoryItem] = []
        self._load()

    def _load(self) -> None:
        try:
            import os

            if os.path.exists(self.storage_path):
                with open(self.storage_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    self.episodes = [MemoryItem(**item) for item in data]
                logger.info(f"加载情节记忆: {len(self.episodes)} 条")
        except Exception as e:
            logger.warning(f"加载情节记忆失败: {e}")

    def _save(self) -> None:
        try:
            import os

            os.makedirs(os.path.dirname(self.storage_path), exist_ok=True)
            with open(self.storage_path, "w", encoding="utf-8") as f:
                json.dump(
                    [item.to_dict() for item in self.episodes],
                    f,
                    ensure_ascii=False,
                    indent=2,
                )
        except Exception as e:
            logger.error(f"保存情节记忆失败: {e}")

    async def add(self, item: MemoryItem) -> None:
        item.type = "episodic"
        self.episodes.append(item)
        self._save()
        logger.debug(f"情节记忆: {len(self.episodes)} 条")

    async def get(self, limit: int = None) -> List[MemoryItem]:
        results = self.episodes[-limit:] if limit else self.episodes
        return results

    async def search(self, query: str, limit: int = 5) -> List[MemoryItem]:
        query_lower = query.lower()
        results = [
            item for item in self.episodes if query_lower in item.content.lower()
        ][-limit:]
        return results

    async def clear(self) -> None:
        self.episodes.clear()
        self._save()
        logger.info("情节记忆已清空")

    async def add_episode(self, event: str, outcome: str, target: str = "") -> None:
        """添加一个事件片段"""
        item = MemoryItem(
            content=event,
            type="episodic",
            importance=0.7,
            metadata={"outcome": outcome, "target": target},
        )
        await self.add(item)


class LongTermMemory(BaseMemoryStore):
    """长期记忆 - 持久化的知识和模式"""

    def __init__(self, storage_path: str = "./data/long_term_memory.json"):
        self.storage_path = storage_path
        self.knowledge: List[MemoryItem] = []
        self._load()

    def _load(self) -> None:
        try:
            import os

            if os.path.exists(self.storage_path):
                with open(self.storage_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    self.knowledge = [MemoryItem(**item) for item in data]
                logger.info(f"加载长期记忆: {len(self.knowledge)} 条")
        except Exception as e:
            logger.warning(f"加载长期记忆失败: {e}")

    def _save(self) -> None:
        try:
            import os

            os.makedirs(os.path.dirname(self.storage_path), exist_ok=True)
            with open(self.storage_path, "w", encoding="utf-8") as f:
                json.dump(
                    [item.to_dict() for item in self.knowledge],
                    f,
                    ensure_ascii=False,
                    indent=2,
                )
        except Exception as e:
            logger.error(f"保存长期记忆失败: {e}")

    async def add(self, item: MemoryItem) -> None:
        item.type = "long_term"
        self.knowledge.append(item)
        self._save()

    async def get(self, limit: int = None) -> List[MemoryItem]:
        results = self.knowledge[-limit:] if limit else self.knowledge
        return results

    async def search(self, query: str, limit: int = 5) -> List[MemoryItem]:
        query_lower = query.lower()
        results = [
            item for item in self.knowledge if query_lower in item.content.lower()
        ][-limit:]
        return results

    async def clear(self) -> None:
        self.knowledge.clear()
        self._save()
        logger.info("长期记忆已清空")

    async def add_knowledge(
        self, fact: str, category: str = "general", importance: float = 0.5
    ) -> None:
        """添加知识"""
        item = MemoryItem(
            content=fact,
            type="long_term",
            importance=importance,
            metadata={"category": category},
        )
        await self.add(item)


class MemoryManager:
    """统一记忆管理器"""

    def __init__(self):
        self.short_term = ShortTermMemory(max_turns=10)
        self.episodic = EpisodicMemory()
        self.long_term = LongTermMemory()

    async def remember(
        self,
        content: str,
        memory_type: str = "short_term",
        importance: float = 0.5,
        **kwargs,
    ) -> None:
        """添加记忆"""
        item = MemoryItem(
            content=content, type=memory_type, importance=importance, metadata=kwargs
        )

        if memory_type == "short_term":
            await self.short_term.add(item)
        elif memory_type == "episodic":
            await self.episodic.add(item)
        elif memory_type == "long_term":
            await self.long_term.add(item)

    async def recall(
        self, query: str = "", memory_type: str = None, limit: int = 5
    ) -> List[MemoryItem]:
        """召回记忆"""
        if memory_type:
            if memory_type == "short_term":
                return await self.short_term.search(query, limit)
            elif memory_type == "episodic":
                return await self.episodic.search(query, limit)
            elif memory_type == "long_term":
                return await self.long_term.search(query, limit)

        all_memories = []

        short = await self.short_term.search(query, limit)
        episodic = await self.episodic.search(query, limit)
        long = await self.long_term.search(query, limit)

        return short + episodic + long

    async def get_context_for_agent(self, query: str = "") -> str:
        """获取适合注入 agent 上下文的记忆"""
        memories = await self.recall(query, limit=10)

        if not memories:
            return ""

        parts = ["=== Agent Memory Context ==="]

        short_memories = [m for m in memories if m.type == "short_term"]
        if short_memories:
            parts.append("\n[Recent Context]")
            for m in short_memories[-5:]:
                parts.append(f"- {m.content}")

        episodic_memories = [m for m in memories if m.type == "episodic"]
        if episodic_memories:
            parts.append("\n[Past Experiences]")
            for m in episodic_memories[-3:]:
                parts.append(f"- {m.content}")

        long_memories = [m for m in memories if m.type == "long_term"]
        if long_memories:
            parts.append("\n[Knowledge]")
            for m in long_memories[-3:]:
                parts.append(f"- {m.content}")

        return "\n".join(parts)

    async def distill_from_conversation(
        self, conversation: List[Dict], summary: str
    ) -> None:
        """从对话中蒸馏记忆"""
        item = MemoryItem(
            content=summary,
            type="episodic",
            importance=0.6,
            metadata={"conversation_length": len(conversation)},
        )
        await self.episodic.add(item)

    async def clear_all(self) -> None:
        """清空所有记忆"""
        await self.short_term.clear()
        await self.episodic.clear()
        await self.long_term.clear()
        logger.info("所有记忆已清空")

    def get_stats(self) -> Dict:
        """获取记忆统计"""
        return {
            "short_term_count": len(list(self.short_term.buffer)),
            "episodic_count": len(self.episodic.episodes),
            "long_term_count": len(self.long_term.knowledge),
        }
