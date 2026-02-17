# 数据库使用指南

## 概述

M-Bot 使用 SQLite 作为轻量级数据库，用于持久化存储以下信息：

- **对话历史**：所有智能体的对话记录
- **提示词链**：用户创建的提示词链配置
- **用户配置**：应用配置和用户偏好
- **爬虫任务**：爬虫任务的执行记录

## 数据库位置

数据库文件默认存储在：`data/m_bot.db`

可以通过环境变量或配置修改数据库路径。

## 数据表结构

### 1. conversations（对话历史表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键 |
| agent_type | TEXT | 智能体类型 |
| user_message | TEXT | 用户消息 |
| assistant_message | TEXT | 助手回复 |
| session_id | TEXT | 会话ID |
| timestamp | DATETIME | 时间戳 |
| metadata | TEXT | 元数据（JSON） |

### 2. prompt_chains（提示词链表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键 |
| name | TEXT | 链名称（唯一） |
| content | TEXT | 链内容（JSON） |
| description | TEXT | 描述 |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |
| metadata | TEXT | 元数据（JSON） |

### 3. user_configs（用户配置表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键 |
| key | TEXT | 配置键（唯一） |
| value | TEXT | 配置值（JSON） |
| category | TEXT | 分类 |
| description | TEXT | 描述 |
| updated_at | DATETIME | 更新时间 |

### 4. crawler_tasks（爬虫任务表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键 |
| url | TEXT | URL |
| task_type | TEXT | 任务类型 |
| status | TEXT | 状态 |
| result | TEXT | 结果（JSON） |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |
| metadata | TEXT | 元数据（JSON） |

## CLI 命令

### 查看数据库统计

```bash
python main.py db-stats
```

显示：
- 对话记录数
- 提示词链数
- 用户配置数
- 爬虫任务数
- 爬虫任务状态分布

### 查看对话历史

```bash
# 查看最近的10条对话
python main.py db-history

# 查看指定数量的对话
python main.py db-history --limit 20

# 查看特定智能体的对话
python main.py db-history --agent simple

# 查看特定会话的对话
python main.py db-history --session <session_id>
```

### 清空对话历史

```bash
# 清空所有对话（需要确认）
python main.py db-clear --yes

# 清空特定智能体的对话
python main.py db-clear --agent simple --yes

# 清空特定会话的对话
python main.py db-clear --session <session_id> --yes
```

## 自动保存

系统会自动保存以下信息：

1. **对话历史**：每次智能体处理用户消息后，自动保存到数据库
2. **提示词链**：使用 `prompt-create` 创建提示词链时，自动保存到数据库
3. **爬虫任务**：执行爬虫任务时，自动记录到数据库

## 编程接口

### 使用 DatabaseManager

```python
from database.manager import DatabaseManager
from database.models import Conversation

# 初始化数据库管理器
db = DatabaseManager()

# 保存对话
conversation = Conversation(
    agent_type="simple",
    user_message="你好",
    assistant_message="你好！有什么可以帮助你的吗？"
)
db.save_conversation(conversation)

# 获取对话历史
conversations = db.get_conversations(agent_type="simple", limit=10)

# 获取统计信息
stats = db.get_stats()
```

### 使用 DatabaseMemory

```python
from database.manager import DatabaseManager
from core.memory.database_memory import DatabaseMemory

# 创建数据库记忆
db = DatabaseManager()
memory = DatabaseMemory(db, agent_type="simple", session_id="session-123")

# 保存对话
await memory.save_conversation("用户消息", "助手回复")

# 获取历史
messages = await memory.get(limit=10)
```

## 数据备份

SQLite 数据库是单个文件，备份非常简单：

```bash
# 备份数据库
cp data/m_bot.db data/m_bot.db.backup

# 恢复数据库
cp data/m_bot.db.backup data/m_bot.db
```

## 数据清理

### 清理旧对话

可以通过编程方式清理指定日期之前的对话：

```python
from datetime import datetime, timedelta
from database.manager import DatabaseManager

db = DatabaseManager()

# 删除30天前的对话
cutoff_date = datetime.now() - timedelta(days=30)
count = db.delete_conversations(before_date=cutoff_date)
print(f"删除了 {count} 条对话记录")
```

### 清理特定会话

```python
# 删除特定会话的所有对话
count = db.delete_conversations(session_id="session-123")
```

## 性能优化

1. **索引**：数据库已自动创建必要的索引
2. **批量操作**：大量数据操作时，考虑使用事务
3. **定期清理**：定期清理旧数据以保持数据库性能

## 注意事项

1. SQLite 是文件数据库，不支持并发写入
2. 数据库文件会随着使用增长，建议定期备份
3. 删除操作不可恢复，请谨慎使用
4. 大量数据时，考虑使用 `limit` 参数限制查询结果

