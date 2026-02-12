"""
使用Ollama进行向量嵌入
"""

import httpx
from typing import List
from hackbot_config import settings
from .logger import logger


class OllamaEmbeddings:
    """使用Ollama生成文本向量嵌入"""

    def __init__(self, model: str = None, base_url: str = None):
        self.base_url = base_url or settings.ollama_base_url
        self.model = model or settings.ollama_embedding_model

    async def embed_query(self, text: str) -> List[float]:
        """
        生成单个文本的向量嵌入

        Args:
            text: 要向量化的文本

        Returns:
            向量嵌入列表
        """
        return await self.embed_documents([text])[0]

    async def embed_documents(self, texts: List[str]) -> List[List[float]]:
        """
        批量生成文本的向量嵌入

        Args:
            texts: 要向量化的文本列表

        Returns:
            向量嵌入列表的列表
        """
        embeddings = []

        try:
            async with httpx.AsyncClient(timeout=300.0) as client:
                for text in texts:
                    response = await client.post(
                        f"{self.base_url}/api/embeddings",
                        json={"model": self.model, "prompt": text},
                    )
                    response.raise_for_status()
                    result = response.json()

                    embedding = result.get("embedding", [])
                    if not embedding:
                        raise ValueError(f"Ollama返回空向量: {text[:50]}")

                    embeddings.append(embedding)
                    logger.debug(
                        f"生成向量嵌入: {len(embedding)} 维，文本: {text[:50]}"
                    )

            return embeddings

        except httpx.HTTPError as e:
            logger.error(f"Ollama向量化连接错误: {e}")
            raise ConnectionError(
                f"无法连接到Ollama服务 ({self.base_url})，请确保Ollama正在运行"
            )
        except Exception as e:
            logger.error(f"向量化错误: {e}")
            raise

    def get_embedding_dimension(self) -> int:
        """
        获取向量维度（需要实际调用一次才能知道）
        对于大多数Ollama模型，通常是4096或768
        """
        # 这是一个占位值，实际维度取决于使用的模型
        # 可以通过调用一次API来获取实际维度
        return 4096
