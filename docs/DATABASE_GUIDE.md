# 数据库使用指南

Secbot 当前使用 SQLite 与 `better-sqlite3`，数据库逻辑位于 `server/src/modules/database/`。

默认主数据库路径来自 `DATABASE_PATH`，未设置时为：

```text
data/opencomsagent.db
```

如果你希望使用更明确的文件名，可以在 `.env` 中设置：

```env
DATABASE_PATH=./data/secbot.db
```

## 1. DatabaseModule

```text
server/src/modules/database/
├── database.controller.ts
├── database.module.ts
├── database.service.ts
├── dto/
└── entities/
```

`DatabaseService` 在模块初始化时会：

1. 创建数据库目录。
2. 打开 SQLite 文件。
3. 设置 `journal_mode = WAL`。
4. 初始化表结构。
5. 将 `config.yaml` 中的部分配置同步到 `user_configs`。

## 2. 表结构

当前代码会创建这些表：

| 表 | 用途 |
|----|------|
| `conversations` | 对话历史 |
| `prompt_chains` | 提示词链 |
| `user_configs` | 用户配置与 provider 配置 |
| `crawler_tasks` | 爬虫任务 |
| `attack_tasks` | 攻击测试任务记录 |
| `scan_results` | 扫描结果 |
| `audit_records` | Agent / 工具执行审计记录 |

### `conversations`

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | INTEGER | 主键 |
| `agent_type` | TEXT | 智能体类型 |
| `user_message` | TEXT | 用户消息 |
| `assistant_message` | TEXT | 助手回复 |
| `session_id` | TEXT | 会话 ID |
| `timestamp` | TEXT | 时间戳 |
| `metadata` | TEXT | JSON 字符串 |

### `user_configs`

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | INTEGER | 主键 |
| `key` | TEXT | 配置键，唯一 |
| `value` | TEXT | 配置值 |
| `category` | TEXT | 分类 |
| `description` | TEXT | 描述 |
| `updated_at` | TEXT | 更新时间 |

## 3. API

### `GET /api/db/stats`

返回：

- `conversations`
- `promptChains`
- `userConfigs`
- `crawlerTasks`
- `crawlerTasksByStatus`

### `GET /api/db/history`

查询对话历史。

```bash
curl "http://127.0.0.1:8000/api/db/history?limit=10&agent=hackbot"
```

支持 query 参数：

| 参数 | 说明 |
|------|------|
| `agent` | 按 `agent_type` 过滤 |
| `sessionId` | 按会话 ID 过滤 |
| `limit` | 1 到 100，默认 10 |

### `DELETE /api/db/history`

删除对话历史。

```bash
curl -X DELETE "http://127.0.0.1:8000/api/db/history?agent=hackbot"
```

不带过滤参数会删除全部对话历史，请谨慎使用。

## 4. 在代码中使用

`DatabaseService` 不暴露通用 `run/all/get` 方法，业务代码应使用已经封装好的方法。

```typescript
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class MyService {
  constructor(private readonly db: DatabaseService) {}

  saveExampleConversation() {
    this.db.saveConversation({
      agentType: 'hackbot',
      userMessage: '你好',
      assistantMessage: '你好，需要我帮你检查什么？',
      sessionId: 'default',
      timestamp: new Date().toISOString(),
      metadata: '{}',
    });
  }

  listRecentConversations() {
    return this.db.getConversations({
      agentType: 'hackbot',
      limit: 10,
    });
  }
}
```

常用方法包括：

- `saveConversation`
- `getConversations`
- `deleteConversations`
- `saveConfig`
- `getConfig`
- `listConfigs`
- `deleteConfig`
- `savePromptChain`
- `getPromptChain`
- `listPromptChains`
- `saveCrawlerTask`
- `getCrawlerTasks`
- `saveAuditRecord`
- `getAuditTrail`
- `saveScanResult`
- `getStats`

## 5. 备份与恢复

如果使用默认路径：

```bash
cp data/opencomsagent.db data/opencomsagent.db.backup
cp data/opencomsagent.db.backup data/opencomsagent.db
```

如果你设置了 `DATABASE_PATH`，请备份对应文件。

SQLite WAL 模式可能同时产生 `-wal` 和 `-shm` 文件。做冷备份时建议先停止后端，或同时备份这些伴随文件。

## 6. 相关存储

记忆与向量系统还会使用：

- `data/episodic_memory.json`
- `data/long_term_memory.json`
- `data/vectors.db`

这些不属于 `DatabaseService` 的主库，但同样需要纳入生产备份策略。
