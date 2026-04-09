"""
数据库管理器
"""

import sqlite3
import json
import re
from datetime import datetime
from pathlib import Path
from typing import List, Optional, Dict, Any
from contextlib import contextmanager

from secbot_agent.database.models import (
    Conversation,
    PromptChainModel,
    UserConfig,
    CrawlerTask,
    AttackTask,
    ScanResult,
    AuditRecord,
)
from hackbot_config import settings
from utils.logger import logger


class DatabaseManager:
    """SQLite数据库管理器"""

    def __init__(self, db_path: Optional[Path] = None):
        """
        初始化数据库管理器

        Args:
            db_path: 数据库文件路径。如果为None，则从配置中读取：
                - 优先使用 DATABASE_URL 环境变量（格式：sqlite:///path/to/db.db）
                - 否则使用默认路径：data/secbot-cli.db
        """
        if db_path:
            self.db_path = Path(db_path)
        else:
            # 从 DATABASE_URL 解析路径
            db_url = settings.database_url
            if db_url and db_url.startswith("sqlite:///"):
                # 解析 sqlite:///path/to/db.db 格式
                path_str = db_url.replace("sqlite:///", "")
                # 处理相对路径（以 ./ 开头）
                if path_str.startswith("./"):
                    self.db_path = Path(settings.project_root) / path_str[2:]
                else:
                    self.db_path = Path(path_str)
            else:
                # 默认路径（与 hackbot_config 默认一致）
                self.db_path = Path(settings.project_root) / "data" / "secbot.db"

        # 确保目录存在
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_database()
        logger.info(f"数据库管理器初始化: {self.db_path}")

    @contextmanager
    def _get_connection(self):
        """获取数据库连接（上下文管理器）"""
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        except Exception as e:
            conn.rollback()
            logger.error(f"数据库操作错误: {e}")
            raise
        finally:
            conn.close()

    def _init_database(self):
        """初始化数据库表"""
        with self._get_connection() as conn:
            cursor = conn.cursor()

            # 对话历史表
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS conversations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    agent_type TEXT NOT NULL,
                    user_message TEXT NOT NULL,
                    assistant_message TEXT NOT NULL,
                    session_id TEXT,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                    metadata TEXT
                )
            """)

            # 提示词链表
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS prompt_chains (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT UNIQUE NOT NULL,
                    content TEXT NOT NULL,
                    description TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    metadata TEXT
                )
            """)

            # 用户配置表
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS user_configs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    key TEXT UNIQUE NOT NULL,
                    value TEXT NOT NULL,
                    category TEXT,
                    description TEXT,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            """)

            # 爬虫任务表
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS crawler_tasks (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    url TEXT NOT NULL,
                    task_type TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'pending',
                    result TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    metadata TEXT
                )
            """)

            # 攻击任务表
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS attack_tasks (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    task_id TEXT UNIQUE NOT NULL,
                    target TEXT NOT NULL,
                    attack_type TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'pending',
                    result TEXT,
                    schedule TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    last_run DATETIME,
                    run_count INTEGER DEFAULT 0,
                    metadata TEXT
                )
            """)

            # 扫描结果表
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS scan_results (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    target TEXT NOT NULL,
                    scan_type TEXT NOT NULL,
                    result TEXT,
                    vulnerabilities TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    metadata TEXT
                )
            """)

            # 操作审计留痕表
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS audit_trail (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id TEXT NOT NULL,
                    agent TEXT NOT NULL,
                    step_type TEXT NOT NULL,
                    content TEXT NOT NULL,
                    metadata TEXT,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            """)

            # 创建索引
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_conversations_session ON conversations(session_id)"
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_conversations_timestamp ON conversations(timestamp)"
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_crawler_tasks_status ON crawler_tasks(status)"
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_user_configs_key ON user_configs(key)"
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_attack_tasks_status ON attack_tasks(status)"
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_scan_results_target ON scan_results(target)"
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_audit_trail_session ON audit_trail(session_id)"
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_audit_trail_timestamp ON audit_trail(timestamp)"
            )

            conn.commit()
            logger.info("数据库表初始化完成")

    # ========== 对话历史操作 ==========

    def save_conversation(self, conversation: Conversation) -> int:
        """保存对话记录"""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO conversations 
                (agent_type, user_message, assistant_message, session_id, timestamp, metadata)
                VALUES (?, ?, ?, ?, ?, ?)
            """,
                (
                    conversation.agent_type,
                    conversation.user_message,
                    conversation.assistant_message,
                    conversation.session_id,
                    conversation.timestamp or datetime.now(),
                    json.dumps(conversation.metadata or {})
                    if conversation.metadata
                    else None,
                ),
            )
            return cursor.lastrowid

    def get_conversations(
        self,
        agent_type: Optional[str] = None,
        session_id: Optional[str] = None,
        limit: Optional[int] = None,
        offset: int = 0,
    ) -> List[Conversation]:
        """获取对话记录"""
        with self._get_connection() as conn:
            cursor = conn.cursor()

            query = "SELECT * FROM conversations WHERE 1=1"
            params = []

            if agent_type:
                query += " AND agent_type = ?"
                params.append(agent_type)

            if session_id:
                query += " AND session_id = ?"
                params.append(session_id)

            query += " ORDER BY timestamp DESC"

            if limit:
                query += " LIMIT ? OFFSET ?"
                params.extend([limit, offset])

            cursor.execute(query, params)
            rows = cursor.fetchall()

            conversations = []
            for row in rows:
                metadata = json.loads(row["metadata"]) if row["metadata"] else {}
                conversations.append(
                    Conversation(
                        id=row["id"],
                        agent_type=row["agent_type"],
                        user_message=row["user_message"],
                        assistant_message=row["assistant_message"],
                        session_id=row["session_id"],
                        timestamp=datetime.fromisoformat(row["timestamp"])
                        if row["timestamp"]
                        else None,
                        metadata=metadata,
                    )
                )

            return conversations

    def delete_conversations(
        self,
        agent_type: Optional[str] = None,
        session_id: Optional[str] = None,
        before_date: Optional[datetime] = None,
    ) -> int:
        """删除对话记录"""
        with self._get_connection() as conn:
            cursor = conn.cursor()

            query = "DELETE FROM conversations WHERE 1=1"
            params = []

            if agent_type:
                query += " AND agent_type = ?"
                params.append(agent_type)

            if session_id:
                query += " AND session_id = ?"
                params.append(session_id)

            if before_date:
                query += " AND timestamp < ?"
                params.append(before_date.isoformat())

            cursor.execute(query, params)
            return cursor.rowcount

    # ========== 提示词链操作 ==========

    def save_prompt_chain(self, chain: PromptChainModel) -> int:
        """保存提示词链"""
        with self._get_connection() as conn:
            cursor = conn.cursor()

            # 检查是否存在
            cursor.execute("SELECT id FROM prompt_chains WHERE name = ?", (chain.name,))
            existing = cursor.fetchone()

            if existing:
                # 更新
                cursor.execute(
                    """
                    UPDATE prompt_chains 
                    SET content = ?, description = ?, updated_at = ?, metadata = ?
                    WHERE name = ?
                """,
                    (
                        chain.content,
                        chain.description,
                        datetime.now(),
                        json.dumps(chain.metadata or {}) if chain.metadata else None,
                        chain.name,
                    ),
                )
                return existing["id"]
            else:
                # 插入
                cursor.execute(
                    """
                    INSERT INTO prompt_chains (name, content, description, created_at, updated_at, metadata)
                    VALUES (?, ?, ?, ?, ?, ?)
                """,
                    (
                        chain.name,
                        chain.content,
                        chain.description,
                        datetime.now(),
                        datetime.now(),
                        json.dumps(chain.metadata or {}) if chain.metadata else None,
                    ),
                )
                return cursor.lastrowid

    def get_prompt_chain(self, name: str) -> Optional[PromptChainModel]:
        """获取提示词链"""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM prompt_chains WHERE name = ?", (name,))
            row = cursor.fetchone()

            if row:
                metadata = json.loads(row["metadata"]) if row["metadata"] else {}
                return PromptChainModel(
                    id=row["id"],
                    name=row["name"],
                    content=row["content"],
                    description=row["description"],
                    created_at=datetime.fromisoformat(row["created_at"])
                    if row["created_at"]
                    else None,
                    updated_at=datetime.fromisoformat(row["updated_at"])
                    if row["updated_at"]
                    else None,
                    metadata=metadata,
                )
            return None

    def list_prompt_chains(self) -> List[PromptChainModel]:
        """列出所有提示词链"""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM prompt_chains ORDER BY updated_at DESC")
            rows = cursor.fetchall()

            chains = []
            for row in rows:
                metadata = json.loads(row["metadata"]) if row["metadata"] else {}
                chains.append(
                    PromptChainModel(
                        id=row["id"],
                        name=row["name"],
                        content=row["content"],
                        description=row["description"],
                        created_at=datetime.fromisoformat(row["created_at"])
                        if row["created_at"]
                        else None,
                        updated_at=datetime.fromisoformat(row["updated_at"])
                        if row["updated_at"]
                        else None,
                        metadata=metadata,
                    )
                )
            return chains

    def delete_prompt_chain(self, name: str) -> bool:
        """删除提示词链"""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM prompt_chains WHERE name = ?", (name,))
            return cursor.rowcount > 0

    # ========== 用户配置操作 ==========

    def save_config(self, config: UserConfig) -> int:
        """保存用户配置"""
        with self._get_connection() as conn:
            cursor = conn.cursor()

            # 检查是否存在
            cursor.execute("SELECT id FROM user_configs WHERE key = ?", (config.key,))
            existing = cursor.fetchone()

            if existing:
                # 更新
                cursor.execute(
                    """
                    UPDATE user_configs 
                    SET value = ?, category = ?, description = ?, updated_at = ?
                    WHERE key = ?
                """,
                    (
                        config.value,
                        config.category,
                        config.description,
                        datetime.now(),
                        config.key,
                    ),
                )
                return existing["id"]
            else:
                # 插入
                cursor.execute(
                    """
                    INSERT INTO user_configs (key, value, category, description, updated_at)
                    VALUES (?, ?, ?, ?, ?)
                """,
                    (
                        config.key,
                        config.value,
                        config.category,
                        config.description,
                        datetime.now(),
                    ),
                )
                return cursor.lastrowid

    def get_config(self, key: str) -> Optional[UserConfig]:
        """获取用户配置"""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM user_configs WHERE key = ?", (key,))
            row = cursor.fetchone()

            if row:
                return UserConfig(
                    id=row["id"],
                    key=row["key"],
                    value=row["value"],
                    category=row["category"],
                    description=row["description"],
                    updated_at=datetime.fromisoformat(row["updated_at"])
                    if row["updated_at"]
                    else None,
                )
            return None

    def list_configs(self, category: Optional[str] = None) -> List[UserConfig]:
        """列出用户配置"""
        with self._get_connection() as conn:
            cursor = conn.cursor()

            if category:
                cursor.execute(
                    "SELECT * FROM user_configs WHERE category = ? ORDER BY key",
                    (category,),
                )
            else:
                cursor.execute("SELECT * FROM user_configs ORDER BY category, key")

            rows = cursor.fetchall()

            configs = []
            for row in rows:
                configs.append(
                    UserConfig(
                        id=row["id"],
                        key=row["key"],
                        value=row["value"],
                        category=row["category"],
                        description=row["description"],
                        updated_at=datetime.fromisoformat(row["updated_at"])
                        if row["updated_at"]
                        else None,
                    )
                )
            return configs

    def delete_config(self, key: str) -> bool:
        """删除用户配置"""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM user_configs WHERE key = ?", (key,))
            return cursor.rowcount > 0

    # ========== 爬虫任务操作 ==========

    def save_crawler_task(self, task: CrawlerTask) -> int:
        """保存爬虫任务"""
        with self._get_connection() as conn:
            cursor = conn.cursor()

            cursor.execute(
                """
                INSERT INTO crawler_tasks 
                (url, task_type, status, result, created_at, updated_at, metadata)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
                (
                    task.url,
                    task.task_type,
                    task.status,
                    json.dumps(task.result) if task.result else None,
                    datetime.now(),
                    datetime.now(),
                    json.dumps(task.metadata or {}) if task.metadata else None,
                ),
            )
            return cursor.lastrowid

    def update_crawler_task(
        self, task_id: int, status: Optional[str] = None, result: Optional[Any] = None
    ):
        """更新爬虫任务"""
        with self._get_connection() as conn:
            cursor = conn.cursor()

            updates = []
            params = []

            if status:
                updates.append("status = ?")
                params.append(status)

            if result is not None:
                updates.append("result = ?")
                params.append(json.dumps(result))

            if updates:
                updates.append("updated_at = ?")
                params.append(datetime.now())
                params.append(task_id)

                query = f"UPDATE crawler_tasks SET {', '.join(updates)} WHERE id = ?"
                cursor.execute(query, params)

    def get_crawler_tasks(
        self,
        status: Optional[str] = None,
        task_type: Optional[str] = None,
        limit: Optional[int] = None,
    ) -> List[CrawlerTask]:
        """获取爬虫任务"""
        with self._get_connection() as conn:
            cursor = conn.cursor()

            query = "SELECT * FROM crawler_tasks WHERE 1=1"
            params = []

            if status:
                query += " AND status = ?"
                params.append(status)

            if task_type:
                query += " AND task_type = ?"
                params.append(task_type)

            query += " ORDER BY created_at DESC"

            if limit:
                query += " LIMIT ?"
                params.append(limit)

            cursor.execute(query, params)
            rows = cursor.fetchall()

            tasks = []
            for row in rows:
                result = json.loads(row["result"]) if row["result"] else None
                metadata = json.loads(row["metadata"]) if row["metadata"] else {}
                tasks.append(
                    CrawlerTask(
                        id=row["id"],
                        url=row["url"],
                        task_type=row["task_type"],
                        status=row["status"],
                        result=result,
                        created_at=datetime.fromisoformat(row["created_at"])
                        if row["created_at"]
                        else None,
                        updated_at=datetime.fromisoformat(row["updated_at"])
                        if row["updated_at"]
                        else None,
                        metadata=metadata,
                    )
                )
            return tasks

    # ========== 操作审计留痕 ==========

    def save_audit_record(self, record: AuditRecord) -> int:
        """保存审计记录"""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO audit_trail
                (session_id, agent, step_type, content, metadata, timestamp)
                VALUES (?, ?, ?, ?, ?, ?)
            """,
                (
                    record.session_id,
                    record.agent,
                    record.step_type,
                    record.content,
                    json.dumps(record.metadata or {}) if record.metadata else None,
                    record.timestamp or datetime.now(),
                ),
            )
            return cursor.lastrowid

    def get_audit_trail(
        self,
        session_id: str,
        limit: Optional[int] = None,
    ) -> List[AuditRecord]:
        """获取指定会话的审计留痕"""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            query = (
                "SELECT * FROM audit_trail WHERE session_id = ? ORDER BY timestamp ASC"
            )
            params: list = [session_id]
            if limit:
                query += " LIMIT ?"
                params.append(limit)
            cursor.execute(query, params)
            rows = cursor.fetchall()
            records = []
            for row in rows:
                metadata = json.loads(row["metadata"]) if row["metadata"] else {}
                records.append(
                    AuditRecord(
                        id=row["id"],
                        session_id=row["session_id"],
                        agent=row["agent"],
                        step_type=row["step_type"],
                        content=row["content"],
                        metadata=metadata,
                        timestamp=datetime.fromisoformat(row["timestamp"])
                        if row["timestamp"]
                        else None,
                    )
                )
            return records

    def delete_audit_trail(self, session_id: str) -> int:
        """删除指定会话的审计留痕"""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "DELETE FROM audit_trail WHERE session_id = ?", (session_id,)
            )
            return cursor.rowcount

    # ========== 统计信息 ==========

    def get_stats(self) -> Dict[str, Any]:
        """获取数据库统计信息"""
        with self._get_connection() as conn:
            cursor = conn.cursor()

            stats = {}

            # 对话记录数
            cursor.execute("SELECT COUNT(*) as count FROM conversations")
            stats["conversations"] = cursor.fetchone()["count"]

            # 提示词链数
            cursor.execute("SELECT COUNT(*) as count FROM prompt_chains")
            stats["prompt_chains"] = cursor.fetchone()["count"]

            # 用户配置数
            cursor.execute("SELECT COUNT(*) as count FROM user_configs")
            stats["user_configs"] = cursor.fetchone()["count"]

            # 爬虫任务数
            cursor.execute("SELECT COUNT(*) as count FROM crawler_tasks")
            stats["crawler_tasks"] = cursor.fetchone()["count"]

            # 按状态统计爬虫任务
            cursor.execute(
                "SELECT status, COUNT(*) as count FROM crawler_tasks GROUP BY status"
            )
            stats["crawler_tasks_by_status"] = {
                row["status"]: row["count"] for row in cursor.fetchall()
            }

            return stats
