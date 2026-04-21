# 数据库使用指南

Secbot 当前使用 SQLite 作为本地持久化数据库，主要由 `secbot_agent.database.manager.DatabaseManager` 管理。

## 一、数据库用途

数据库用于保存：

- **对话历史**：智能体与用户的对话记录。
- **提示词链**：由 `PromptManager` 注册或加载的提示词链。
- **用户配置**：通过 `/model`、`secbot model` 等入口保存的模型厂商、API Key、Base URL、日志级别等配置。
- **爬虫任务**：爬虫任务执行记录。
- **攻击任务与扫描结果**：安全测试相关任务与结果。
- **审计留痕**：工具执行、确认、拒绝、结果等过程记录。

## 二、数据库位置

默认连接串：

```text
sqlite:///./data/secbot.db
```

相对路径会按当前实现解析到 `hackbot_config/` 包目录下。例如源码运行时通常是：

```text
hackbot_config/data/secbot.db
```

长期运行、系统服务或安装包场景建议使用绝对路径：

```env
DATABASE_URL=sqlite:////srv/secbot/data/secbot.db
```

Windows 示例：

```env
DATABASE_URL=sqlite:///C:/Users/you/secbot/secbot.db
```

首次创建 `DatabaseManager` 时会自动创建目录、数据库文件、表和索引。

## 三、主要数据表

### `conversations`

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | INTEGER | 主键 |
| `agent_type` | TEXT | 智能体类型，如 `secbot-cli` / `superhackbot` |
| `user_message` | TEXT | 用户消息 |
| `assistant_message` | TEXT | 助手回复 |
| `session_id` | TEXT | 会话 ID |
| `timestamp` | DATETIME | 时间戳 |
| `metadata` | TEXT | JSON 元数据 |

### `prompt_chains`

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | INTEGER | 主键 |
| `name` | TEXT | 链名称，唯一 |
| `content` | TEXT | 链内容，JSON |
| `description` | TEXT | 描述 |
| `created_at` | DATETIME | 创建时间 |
| `updated_at` | DATETIME | 更新时间 |
| `metadata` | TEXT | JSON 元数据 |

### `user_configs`

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | INTEGER | 主键 |
| `key` | TEXT | 配置键，唯一 |
| `value` | TEXT | 配置值 |
| `category` | TEXT | 分类 |
| `description` | TEXT | 描述 |
| `updated_at` | DATETIME | 更新时间 |

### `crawler_tasks`

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | INTEGER | 主键 |
| `url` | TEXT | URL |
| `task_type` | TEXT | 任务类型 |
| `status` | TEXT | 状态 |
| `result` | TEXT | JSON 结果 |
| `created_at` | DATETIME | 创建时间 |
| `updated_at` | DATETIME | 更新时间 |
| `metadata` | TEXT | JSON 元数据 |

### 其他表

- `attack_tasks`：攻击测试任务。
- `scan_results`：扫描结果。
- `audit_trail`：操作审计留痕。

## 四、API 操作

当前 CLI 没有 `db-stats`、`db-history`、`db-clear` 子命令。需要查看或清理数据库时，请启动 FastAPI 后端：

```bash
secbot server
```

查看统计：

```bash
curl http://127.0.0.1:8000/api/db/stats
```

查看最近 10 条对话：

```bash
curl "http://127.0.0.1:8000/api/db/history?limit=10"
```

按智能体筛选：

```bash
curl "http://127.0.0.1:8000/api/db/history?agent=secbot-cli&limit=20"
```

按会话筛选：

```bash
curl "http://127.0.0.1:8000/api/db/history?session_id=<session_id>"
```

删除对话历史：

```bash
curl -X DELETE "http://127.0.0.1:8000/api/db/history"
```

按智能体或会话删除：

```bash
curl -X DELETE "http://127.0.0.1:8000/api/db/history?agent=secbot-cli"
curl -X DELETE "http://127.0.0.1:8000/api/db/history?session_id=<session_id>"
```

## 五、编程接口

### 使用 `DatabaseManager`

```python
from secbot_agent.database.manager import DatabaseManager
from secbot_agent.database.models import Conversation

db = DatabaseManager()

conversation = Conversation(
    agent_type="secbot-cli",
    user_message="你好",
    assistant_message="你好！有什么可以帮助你的吗？",
    session_id="session-123",
)
db.save_conversation(conversation)

conversations = db.get_conversations(agent_type="secbot-cli", limit=10)
stats = db.get_stats()
```

### 使用 `DatabaseMemory`

```python
from secbot_agent.database.manager import DatabaseManager
from secbot_agent.core.memory.database_memory import DatabaseMemory

db = DatabaseManager()
memory = DatabaseMemory(db, agent_type="secbot-cli", session_id="session-123")

await memory.save_conversation("用户消息", "助手回复")
messages = await memory.get(limit=10)
```

### 清理旧对话

```python
from datetime import datetime, timedelta

from secbot_agent.database.manager import DatabaseManager

db = DatabaseManager()
cutoff_date = datetime.now() - timedelta(days=30)
count = db.delete_conversations(before_date=cutoff_date)
print(f"删除了 {count} 条对话记录")
```

### 清理特定会话

```python
count = db.delete_conversations(session_id="session-123")
```

## 六、备份与恢复

SQLite 数据库是单个文件。先确认实际路径：

```python
from secbot_agent.database.manager import DatabaseManager

db = DatabaseManager()
print(db.db_path)
```

备份：

```bash
cp /srv/secbot/data/secbot.db /srv/secbot/data/secbot.db.backup
```

恢复：

```bash
cp /srv/secbot/data/secbot.db.backup /srv/secbot/data/secbot.db
```

如果你使用默认相对路径，请把示例中的 `/srv/secbot/data/secbot.db` 替换为实际打印出来的路径。

## 七、注意事项

1. SQLite 适合单机本地使用，支持多读单写；大量并发写入时需要额外评估。
2. API 的 `DELETE /api/db/history` 会删除匹配条件的对话记录，操作不可恢复，请先备份。
3. 长期运行建议使用绝对 `DATABASE_URL`，避免安装路径或工作目录变化导致多个数据库文件并存。
4. 数据库文件、`data/` 和 `logs/` 不应提交到版本控制。

