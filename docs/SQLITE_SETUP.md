# SQLite 数据库配置指南

Secbot 使用 SQLite 作为本地数据库，驱动为 `better-sqlite3`。当前没有 PostgreSQL、Redis 或 ChromaDB 运行依赖。

## 1. 主数据库路径

默认路径：

```text
data/opencomsagent.db
```

推荐在 `.env` 中显式设置：

```env
DATABASE_PATH=./data/secbot.db
```

绝对路径示例：

```env
# Windows
DATABASE_PATH=C:/secbot/data/secbot.db

# Linux / macOS
DATABASE_PATH=/srv/secbot/data/secbot.db
```

首次运行时，`DatabaseService` 会自动创建目录和表结构，无需手动迁移。

## 2. 验证数据库

启动后端：

```bash
npm run dev
```

查看统计：

```bash
curl http://127.0.0.1:8000/api/db/stats
```

查看对话历史：

```bash
curl "http://127.0.0.1:8000/api/db/history?limit=10"
```

## 3. 当前表

| 表 | 用途 |
|----|------|
| `conversations` | 对话历史 |
| `prompt_chains` | 提示词链 |
| `user_configs` | 用户配置和模型 provider 配置 |
| `crawler_tasks` | 爬虫任务 |
| `attack_tasks` | 攻击测试任务记录 |
| `scan_results` | 扫描结果 |
| `audit_records` | 执行审计记录 |

`GET /api/db/stats` 当前只返回部分统计字段：对话、提示词链、用户配置、爬虫任务和爬虫任务状态分布。

## 4. 代码使用

业务代码通过 NestJS 注入 `DatabaseService`，不要直接绕过服务访问 SQLite。

```typescript
constructor(private readonly db: DatabaseService) {}

this.db.saveConversation({
  agentType: 'hackbot',
  userMessage: '你好',
  assistantMessage: '你好，需要我帮你检查什么？',
  sessionId: 'default',
  timestamp: new Date().toISOString(),
  metadata: '{}',
});

const conversations = this.db.getConversations({
  agentType: 'hackbot',
  limit: 10,
});
```

## 5. 备份与恢复

默认路径备份：

```bash
mkdir -p backup
cp data/opencomsagent.db backup/opencomsagent.db
```

如果设置了 `DATABASE_PATH=./data/secbot.db`：

```bash
mkdir -p backup
cp data/secbot.db backup/secbot.db
```

恢复前建议先停止后端：

```bash
cp backup/secbot.db data/secbot.db
```

SQLite 使用 WAL 模式时可能存在 `*.db-wal` 和 `*.db-shm` 文件。生产备份建议停服务做冷备份，或使用 SQLite 在线备份方案。

## 6. 其它本地数据

除主数据库外，记忆系统会按需写入：

- `data/episodic_memory.json`
- `data/long_term_memory.json`
- `data/vectors.db`

如果你希望完整迁移运行状态，请把这些文件一起备份。

## 7. 常见问题

### database is locked

- 检查是否有多个后端进程同时使用同一数据库。
- 确认没有长时间运行的写事务。
- 停止旧进程后再重试。

### 权限错误

- 确认 `DATABASE_PATH` 所在目录存在或可创建。
- 确认运行后端的用户对该目录有写权限。

### 想换数据库类型

当前代码只实现 SQLite，不支持通过配置切换到其它数据库。
