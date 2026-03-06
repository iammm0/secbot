"""
漏洞库向量存储
基于已有 SQLiteVectorStore 封装漏洞专用检索能力，
支持 embedding 写入和语义相似度搜索。
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple

from loguru import logger

from core.memory.vector_store import SQLiteVectorStore, VectorItem
from core.vuln_db.schema import UnifiedVuln


class VulnVectorStore:
    """漏洞库向量检索层 —— 对 SQLiteVectorStore 的业务封装"""

    COLLECTION = "vuln_db"

    def __init__(
        self,
        db_path: str = "./data/vuln_vectors.db",
        dimension: int = 768,
    ):
        self._store = SQLiteVectorStore(db_path=db_path, dimension=dimension)
        self._dimension = dimension

    # ------------------------------------------------------------------
    # 写入
    # ------------------------------------------------------------------

    def upsert_vulns(
        self,
        vulns: List[UnifiedVuln],
        embeddings: List[List[float]],
    ) -> int:
        """将漏洞与对应 embedding 写入向量库，返回写入数量"""
        if len(vulns) != len(embeddings):
            raise ValueError("vulns 与 embeddings 数量不一致")

        items: List[VectorItem] = []
        for vuln, vec in zip(vulns, embeddings):
            items.append(
                VectorItem(
                    id=vuln.vuln_id,
                    content=vuln.build_embedding_text(),
                    vector=vec,
                    metadata={
                        "vuln_id": vuln.vuln_id,
                        "source": vuln.source.value,
                        "severity": vuln.severity.value,
                        "cvss_score": vuln.cvss_score,
                        "title": vuln.title,
                        "description": vuln.description[:500],
                        "tags": vuln.tags[:10],
                    },
                    created_at=datetime.now(timezone.utc).isoformat(),
                )
            )

        self._store.add(items, collection=self.COLLECTION)
        logger.info(f"漏洞向量库写入 {len(items)} 条")
        return len(items)

    # ------------------------------------------------------------------
    # 检索
    # ------------------------------------------------------------------

    def search_similar(
        self,
        query_vector: List[float],
        limit: int = 10,
        threshold: float = 0.5,
    ) -> List[Tuple[Dict, float]]:
        """
        向量相似度检索，返回 [(metadata_dict, similarity_score), ...]
        """
        raw = self._store.search(
            query_vector,
            limit=limit,
            collection=self.COLLECTION,
            threshold=threshold,
        )
        results: List[Tuple[Dict, float]] = []
        for item, score in raw:
            meta = item.metadata.copy() if item.metadata else {}
            meta["_content"] = item.content
            meta["_id"] = item.id
            results.append((meta, score))
        return results

    # ------------------------------------------------------------------
    # 辅助
    # ------------------------------------------------------------------

    def count(self) -> int:
        return self._store.count()

    def clear(self) -> None:
        self._store.clear(collection=self.COLLECTION)

    def close(self) -> None:
        self._store.close()
