# 数据库使用指南

## 概述

Secbot 使用 SQLite 作为轻量级数据库，通过 `better-sqlite3` 驱动进行数据访问，用于持久化存储以下信息：

- **对话历史**：所有智能体的对话记录
- **提示词链**：用户创建的提示词链配置
- **用户配置**：应用配置和用户偏好
- **爬虫任务**：爬虫任务的执行记录

## 数据库位置

数据库文件默认存储在：`data/secbot.db`

可以通过环境变量 `DATABASE_PATH` 修改数据库路径。

## 技术架构

数据库模块位于 `server/src/modules/database/`，采用 NestJS 模块化设计：

```text
server/src/modules/database/
├── database.module.ts      # DatabaseModule 模块定义
├── database.service.ts     # DatabaseService 服务层
└── dto/                    # 数据传输对象
```

- **DatabaseModule**：NestJS 模块，通过依赖注入提供 `DatabaseService`
- **DatabaseService**：封装 `better-sqlite3` 操作，提供类型安全的数据库访问接口

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

## API 接口

### 查看数据库统计

```text
GET /api/db/stats
```

返回：
- 对话记录数
- 提示词链数
- 用户配置数
- 爬虫任务数
- 爬虫任务状态分布

### 查看对话历史

```text
GET /api/db/history?limit=10&agent=simple&session=<session_id>
```

参数：
- `limit`：返回条数（默认 10）
- `agent`：按智能体类型过滤
- `session`：按会话 ID 过滤

### 清空对话历史

```text
DELETE /api/db/history?agent=simple&session=<session_id>
```

参数：
- `agent`：清空特定智能体的对话（可选）
- `session`：清空特定会话的对话（可选）
- 不带参数则清空全部

## 自动保存

系统会自动保存以下信息：

1. **对话历史**：每次智能体处理用户消息后，自动保存到数据库
2. **提示词链**：使用提示词链创建功能时，自动保存到数据库
3. **爬虫任务**：执行爬虫任务时，自动记录到数据库

## 编程接口

### 使用 DatabaseService

```typescript
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class MyService {
  constructor(private readonly db: DatabaseService) {}

  async saveConversation() {
    this.db.run(
      `INSERT INTO conversations (agent_type, user_message, assistant_message, session_id, timestamp)
       VALUES (?, ?, ?, ?, datetime('now'))`,
      ['simple', '你好', '你好！有什么可以帮助你的吗？', 'session-123']
    );
  }

  getConversations(agentType: string, limit: number = 10) {
    return this.db.all(
      'SELECT * FROM conversations WHERE agent_type = ? ORDER BY timestamp DESC LIMIT ?',
      [agentType, limit]
    );
  }

  getStats() {
    const conversations = this.db.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM conversations'
    );
    return { conversations: conversations?.count ?? 0 };
  }
}
```

### 在模块中注入

```typescript
import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { MyService } from './my.service';

@Module({
  imports: [DatabaseModule],
  providers: [MyService],
})
export class MyModule {}
```

## 数据备份

SQLite 数据库是单个文件，备份非常简单：

```bash
# 备份数据库
cp data/secbot.db data/secbot.db.backup

# 恢复数据库
cp data/secbot.db.backup data/secbot.db
```

## 数据清理

### 通过 API 清理

```bash
# 清空全部对话历史
curl -X DELETE http://localhost:8000/api/db/history

# 清空特定智能体的对话
curl -X DELETE http://localhost:8000/api/db/history?agent=simple

# 清空特定会话的对话
curl -X DELETE http://localhost:8000/api/db/history?session=session-123
```

### 通过代码清理

```typescript
import { DatabaseService } from '../database/database.service';

// 在 Service 中注入 DatabaseService 后使用
this.db.run('DELETE FROM conversations WHERE timestamp < datetime("now", "-30 days")');
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
