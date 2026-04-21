"""
SQLite 向量存储 - 基于 sqlite-vec/sqlite-vss
轻量级向量搜索，无需额外数据库服务
"""

import json
import sqlite3
import numpy as np
from pathlib import Path
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass
from loguru import logger


@dataclass
class VectorItem:
    """向量项"""

    id: str
    content: str
    vector: List[float]
    metadata: Dict = None
    created_at: str = ""

    def __post_init__(self):
        if self.metadata is None:
            self.metadata = {}


class SQLiteVectorStore:
    """SQLite 向量存储"""

    def __init__(self, db_path: str = "./data/vectors.db", dimension: int = 768):
        self.db_path = db_path
        self.dimension = dimension
        self._conn: Optional[sqlite3.Connection] = None
        self._init_db()

    def _get_connection(self) -> sqlite3.Connection:
        if self._conn is None:
            self._conn = sqlite3.connect(self.db_path)
            self._conn.row_factory = sqlite3.Row
        return self._conn

    def _init_db(self):
        """初始化数据库和表"""
        Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
        conn = self._get_connection()
        cursor = conn.cursor()

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS vector_items (
                id TEXT PRIMARY KEY,
                content TEXT NOT NULL,
                vector BLOB NOT NULL,
                metadata TEXT,
                created_at TEXT
            )
        """)

        if self._has_function("vec_ann"):
            cursor.execute("""
                CREATE VIRTUAL TABLE IF NOT EXISTS vector_items_ann
                USING vec0(id, vector float[{self.dimension}])
            """)
        else:
            logger.warning("sqlite-vec 未安装，使用纯量计算")

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS collections (
                name TEXT PRIMARY KEY,
                description TEXT,
                config TEXT
            )
        """)

        conn.commit()
        logger.info(f"向量存储初始化: {self.db_path}")

    def _has_function(self, func_name: str) -> bool:
        """检查函数是否存在"""
        try:
            conn = self._get_connection()
            cursor = conn.cursor()
            cursor.execute(f"SELECT {func_name}(1)")
            return True
        except Exception:
            return False

    def _blob_to_vector(self, blob: bytes) -> List[float]:
        """BLOB 转向量"""
        return np.frombuffer(blob, dtype=np.float32).tolist()

    def _vector_to_blob(self, vector: List[float]) -> bytes:
        """向量转 BLOB"""
        return np.array(vector, dtype=np.float32).tobytes()

    def add(self, items: List[VectorItem], collection: str = "default"):
        """添加向量"""
        conn = self._get_connection()
        cursor = conn.cursor()

        cursor.execute(
            "INSERT OR REPLACE INTO collections (name, description) VALUES (?, ?)",
            (collection, f"Collection: {collection}"),
        )

        for item in items:
            cursor.execute(
                """INSERT OR REPLACE INTO vector_items
                   (id, content, vector, metadata, created_at) VALUES (?, ?, ?, ?, ?)""",
                (
                    item.id,
                    item.content,
                    self._vector_to_blob(item.vector),
                    json.dumps(item.metadata, ensure_ascii=False),
                    item.created_at or self._now(),
                ),
            )

        conn.commit()
        logger.info(f"添加 {len(items)} 个向量到 {collection}")

    def search(
        self,
        query_vector: List[float],
        limit: int = 10,
        collection: str = "default",
        threshold: float = 0.7,
    ) -> List[Tuple[VectorItem, float]]:
        """搜索向量"""
        conn = self._get_connection()
        cursor = conn.cursor()

        if self._has_function("vec_ann"):
            cursor.execute(
                """SELECT id, content, vector, metadata, created_at,
                          distance
                   FROM vector_items_ann
                   WHERE k = ?
                   ORDER BY distance""",
                (limit,),
            )
        else:
            query_vec = np.array(query_vector, dtype=np.float32)
            cursor.execute(
                "SELECT id, content, vector, metadata, created_at FROM vector_items"
            )

            results = []
            for row in cursor.fetchall():
                stored_vec = self._blob_to_vector(row["vector"])
                similarity = np.dot(query_vec, stored_vec) / (
                    np.linalg.norm(query_vec) * np.linalg.norm(stored_vec) + 1e-8
                )
                if similarity >= threshold:
                    results.append((row, similarity))

            results.sort(key=lambda x: x[1], reverse=True)
            cursor.execute("SELECT 1")  # 空操作

        results = []
        for row in cursor.fetchall():
            item = VectorItem(
                id=row["id"],
                content=row["content"],
                vector=self._blob_to_vector(row["vector"]),
                metadata=json.loads(row["metadata"] or "{}"),
                created_at=row["created_at"],
            )
            distance = row.get("distance", 0.0)
            similarity = 1.0 - distance if distance else row.get("similarity", 0.0)
            results.append((item, similarity))

        return results[:limit]

    def get(self, item_id: str) -> Optional[VectorItem]:
        """获取单个向量"""
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, content, vector, metadata, created_at FROM vector_items WHERE id = ?",
            (item_id,),
        )
        row = cursor.fetchone()
        if row:
            return VectorItem(
                id=row["id"],
                content=row["content"],
                vector=self._blob_to_vector(row["vector"]),
                metadata=json.loads(row["metadata"] or "{}"),
                created_at=row["created_at"],
            )
        return None

    def delete(self, item_id: str) -> bool:
        """删除向量"""
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM vector_items WHERE id = ?", (item_id,))
        conn.commit()
        return cursor.rowcount > 0

    def clear(self, collection: str = "default"):
        """清空集合"""
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM vector_items")
        conn.commit()
        logger.info("已清空向量存储")

    def count(self) -> int:
        """统计数量"""
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM vector_items")
        return cursor.fetchone()[0]

    def list_collections(self) -> List[str]:
        """列出所有集合"""
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM collections")
        return [row[0] for row in cursor.fetchall()]

    def _now(self) -> str:
        """当前时间"""
        from datetime import datetime, timezone

        return datetime.now(timezone.utc).isoformat()

    def close(self):
        """关闭连接"""
        if self._conn:
            self._conn.close()
            self._conn = None


class VectorStoreManager:
    """向量存储管理器 - 统一管理多个集合"""

    def __init__(self, db_path: str = "./data/vectors.db"):
        self.db_path = db_path
        self.stores: Dict[str, SQLiteVectorStore] = {}

    def get_store(
        self, collection: str = "default", dimension: int = 768
    ) -> SQLiteVectorStore:
        """获取或创建集合"""
        key = f"{collection}:{dimension}"
        if key not in self.stores:
            self.stores[key] = SQLiteVectorStore(self.db_path, dimension)
        return self.stores[key]

    async def add_memory(
        self,
        content: str,
        vector: List[float],
        memory_type: str = "short_term",
        metadata: Dict = None,
    ) -> str:
        """添加记忆"""
        import uuid

        item_id = f"{memory_type}:{uuid.uuid4().hex[:8]}"
        store = self.get_store(memory_type, len(vector))
        item = VectorItem(
            id=item_id, content=content, vector=vector, metadata=metadata or {}
        )
        store.add([item], memory_type)
        return item_id

    async def search_memories(
        self, query_vector: List[float], memory_type: str = None, limit: int = 10
    ) -> List[Tuple[VectorItem, float]]:
        """搜索记忆"""
        if memory_type:
            store = self.get_store(memory_type, len(query_vector))
            return store.search(query_vector, limit, memory_type)
        else:
            all_results = []
            for store_key, store in self.stores.items():
                results = store.search(query_vector, limit)
                all_results.extend(results)
            all_results.sort(key=lambda x: x[1], reverse=True)
            return all_results[:limit]

    def get_stats(self) -> Dict:
        """获取统计"""
        total = 0
        collections = {}
        for key, store in self.stores.items():
            count = store.count()
            total += count
            collections[key] = count
        return {"total": total, "collections": collections}
