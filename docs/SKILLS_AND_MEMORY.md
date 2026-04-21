# 技能与记忆系统

当前仓库里有两类“知识/上下文”相关能力：

- `skills/`：Markdown 技能资料，目前是给 Agent 或开发者引用的知识资产，不存在 `server/src/modules/skills/` 运行时模块。
- `server/src/modules/memory/`：已经接入后端的记忆 API 与本地存储。

## 1. 技能目录

当前仓库的技能文件位于：

```text
skills/
└── base/
    ├── command-execution/
    ├── nmap-usage/
    ├── system-commands/
    ├── system-control/
    └── terminal-session/
```

每个技能目录包含 `SKILL.md`。这些文件用于沉淀安全测试流程、命令用法和操作规范。当前 TypeScript 后端没有自动扫描 `skills/` 并注入 LLM 上下文的 `SkillsService`，因此不要再按旧文档去调用 `server/src/modules/skills/`。

如果后续要把技能系统接入运行时，建议新增明确模块，例如：

```text
server/src/modules/skills/
├── skills.module.ts
├── skills.service.ts
└── dto/
```

在此之前，`skills/` 只应被视为仓库内知识文档。

## 2. 记忆模块

记忆模块位于：

```text
server/src/modules/memory/
├── memory.controller.ts
├── memory.module.ts
├── memory.service.ts
├── memory.models.ts
├── database-memory.service.ts
├── vector-store.service.ts
└── dto/
```

`MemoryService` 支持三类普通记忆：

| 类型 | 存储方式 | 默认路径 |
|------|----------|----------|
| `short_term` | 内存数组，超过上限自动裁剪 | 进程内 |
| `episodic` | JSON 文件 | `data/episodic_memory.json` |
| `long_term` | JSON 文件 | `data/long_term_memory.json` |

向量记忆由 `VectorStoreManagerService` 管理，默认写入：

```text
data/vectors.db
```

可用 `VECTOR_STORE_PATH` 覆盖。

## 3. 记忆 API

### `POST /api/memory/remember`

写入普通记忆。

```json
{
  "content": "Target 192.168.1.10 has port 22 open",
  "memoryType": "episodic",
  "importance": 0.7,
  "metadata": {
    "target": "192.168.1.10"
  }
}
```

### `GET /api/memory/recall`

按 query、memoryType 和 limit 回忆。

```bash
curl "http://127.0.0.1:8000/api/memory/recall?query=192.168.1.10&memoryType=episodic&limit=5"
```

### `GET /api/memory/context`

返回供智能体使用的上下文文本。

### `GET /api/memory/list`

列出记忆。

### `POST /api/memory/distill`

从对话摘要写入情景记忆。

### `POST /api/memory/episode`

写入一次事件经验。

### `POST /api/memory/knowledge`

写入长期知识。

### `POST /api/memory/clear`

清理某类或全部记忆。

### `GET /api/memory/stats`

返回普通记忆数量。

## 4. 向量记忆 API

### `POST /api/memory/vector/add`

写入向量记忆。调用方需要提供向量数组，当前后端不负责自动生成 embedding。

```json
{
  "content": "SSH service found on target",
  "vector": [0.1, 0.2, 0.3],
  "memoryType": "episodic",
  "metadata": {
    "target": "192.168.1.10"
  }
}
```

### `POST /api/memory/vector/search`

按向量相似度检索。

### `GET /api/memory/vector/stats`

返回已打开 collection 的统计信息。

## 5. 代码使用

```typescript
import { Injectable } from '@nestjs/common';
import { MemoryService } from './memory.service';

@Injectable()
export class MyService {
  constructor(private readonly memory: MemoryService) {}

  async rememberTarget() {
    await this.memory.remember(
      'Target 192.168.1.10 has port 22 open',
      'episodic',
      0.7,
      { target: '192.168.1.10' },
    );
  }

  async buildContext(query: string) {
    return this.memory.get_context_for_agent(query);
  }
}
```

方法名以当前代码为准，例如 `get_context_for_agent`、`distill_from_conversation`、`add_episode`、`add_knowledge`。

## 6. 维护建议

- 不要在文档里宣称已有 `SkillsService`，除非代码中真正实现并注册。
- 如果修改记忆 API DTO，请同步更新本文件和 [API.md](API.md)。
- 生产备份时，除主 SQLite 数据库外，也要备份记忆 JSON 和 `vectors.db`。
