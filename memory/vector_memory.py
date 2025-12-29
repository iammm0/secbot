"""
基于向量的记忆管理
"""
from typing import List, Optional
import numpy as np
from agents.base import AgentMessage
from memory.base import BaseMemory
from utils.embeddings import OllamaEmbeddings
from utils.logger import logger


class VectorMemory(BaseMemory):
    """基于向量相似度搜索的记忆管理"""
    
    def __init__(self, embedding_model: str = None):
        self.embeddings = OllamaEmbeddings(model=embedding_model)
        self.messages: List[AgentMessage] = []
        self.vectors: List[List[float]] = []
    
    async def add(self, message: AgentMessage):
        """添加消息到记忆并生成向量"""
        try:
            # 生成向量嵌入
            text = f"{message.role}: {message.content}"
            vector = await self.embeddings.embed_query(text)
            
            self.messages.append(message)
            self.vectors.append(vector)
            
            logger.debug(f"添加消息到向量记忆: {len(self.messages)} 条")
        except Exception as e:
            logger.error(f"添加向量记忆错误: {e}")
            # 即使向量化失败，也保存消息
            self.messages.append(message)
            self.vectors.append([])
    
    async def get(self, limit: int = None) -> List[AgentMessage]:
        """获取记忆"""
        if limit:
            return self.messages[-limit:]
        return self.messages
    
    async def clear(self):
        """清空记忆"""
        self.messages.clear()
        self.vectors.clear()
        logger.info("向量记忆已清空")
    
    async def search(self, query: str, limit: int = 5) -> List[AgentMessage]:
        """
        基于向量相似度搜索记忆
        
        Args:
            query: 搜索查询
            limit: 返回结果数量
            
        Returns:
            相似的消息列表
        """
        if not self.messages or not self.vectors:
            return []
        
        try:
            # 生成查询向量
            query_vector = await self.embeddings.embed_query(query)
            
            # 计算相似度（余弦相似度）
            similarities = []
            query_norm = np.linalg.norm(query_vector)
            
            for vector in self.vectors:
                if not vector:
                    similarities.append(0.0)
                    continue
                
                # 计算余弦相似度
                dot_product = np.dot(query_vector, vector)
                vector_norm = np.linalg.norm(vector)
                
                if vector_norm == 0:
                    similarity = 0.0
                else:
                    similarity = dot_product / (query_norm * vector_norm)
                
                similarities.append(similarity)
            
            # 获取最相似的消息
            indices = np.argsort(similarities)[::-1][:limit]
            results = [self.messages[i] for i in indices if similarities[i] > 0]
            
            logger.debug(f"向量搜索找到 {len(results)} 条相关消息")
            return results
            
        except Exception as e:
            logger.error(f"向量搜索错误: {e}")
            # 如果向量搜索失败，返回最近的几条消息
            return self.messages[-limit:] if limit else self.messages

