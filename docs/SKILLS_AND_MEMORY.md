# 技能与记忆系统

Secbot 提供两套知识管理与上下文保留机制：

## 技能系统

基于 Markdown 的技能体系，遵循 OpenAI Agent Skills 标准。

### 目录结构

```
skills/
├── base/                      # 基础技能
│   └── nmap-usage/
│       ├── SKILL.md          # 技能清单 + 说明
│       ├── scripts/          # 可选脚本
│       ├── references/       # 可选参考资料
│       └── assets/           # 可选资源文件
├── penetration/              # 渗透测试技能
├── enumeration/              # 枚举技能
├── exploitation/             # 漏洞利用技能
└── reporting/                # 报告技能
```

### SKILL.md 格式

```markdown
---
name: skill-name
description: 说明该技能的触发时机
version: "1.0.0"
author: "作者名"
tags: ["tag1", "tag2"]
triggers: ["keyword1", "keyword2"]
prerequisites: ["requirement1"]
---

# 技能说明

技能内容……
```

### 使用方式

技能系统由 `server/src/modules/skills/` 中的 SkillsService 管理：

```typescript
import { SkillsService } from './skills/skills.service';

// 通过 NestJS 依赖注入获取实例
constructor(private readonly skills: SkillsService) {}

// 获取指定技能
const skill = this.skills.getSkill('nmap-usage');

// 根据触发词匹配技能
const matched = this.skills.getSkillsByTriggers('scan ports');

// 列出所有技能
const allSkills = this.skills.listSkills();
```

---

## 记忆系统

三层记忆架构，灵感来自 OpenAI Agents SDK 与 CrewAI。

### 架构

```
MemoryManager
├── ShortTermMemory    # 会话上下文（内存队列，自动裁剪）
├── EpisodicMemory     # 跨会话事件（JSON 文件）
└── LongTermMemory     # 持久化知识（JSON 文件）
```

### 使用方式

记忆系统由 `server/src/modules/memory/` 中的 MemoryService 管理：

```typescript
import { MemoryService } from './memory/memory.service';

// 通过 NestJS 依赖注入获取实例
constructor(private readonly memory: MemoryService) {}

// 记住内容
await this.memory.remember({
  content: 'Target 192.168.1.10 has port 22 open',
  memoryType: 'episodic',
  importance: 0.7,
  target: '192.168.1.10',
});

// 回忆
const memories = await this.memory.recall('192.168.1.10');

// 获取智能体上下文
const context = await this.memory.getContextForAgent('target information');

// 从对话中提炼
await this.memory.distillFromConversation({
  conversation: history,
  summary: 'Scanned target, found SSH service',
});
```

### 记忆类型

| 类型 | 存储方式 | 用途 |
|------|---------|------|
| `short_term` | 内存队列 | 当前会话上下文 |
| `episodic` | JSON 文件 | 历史事件与经验 |
| `long_term` | JSON 文件 | 持久化知识 |

---

## 集成示例

```typescript
import { SkillsService } from './skills/skills.service';
import { MemoryService } from './memory/memory.service';

export class AgentService {
  constructor(
    private readonly skills: SkillsService,
    private readonly memory: MemoryService,
  ) {}

  async process(message: string) {
    // 获取相关技能
    const relevantSkills = this.skills.getSkillsByTriggers(message);

    // 获取记忆上下文
    const context = await this.memory.getContextForAgent(message);

    // 组合提示词
    const prompt = this.buildPrompt(message, relevantSkills, context);

    // 处理并记忆
    await this.memory.remember({
      content: message,
      memoryType: 'short_term',
    });

    return response;
  }
}
```
