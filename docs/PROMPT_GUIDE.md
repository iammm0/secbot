# 提示词与模板说明

当前 TypeScript 版本没有实现可通过 TUI 使用的 `/prompt-list`、`prompt_file`、`prompt_template` 或 `prompt_chain` 运行时命令。旧文档中关于交互式提示词链管理的内容已经移除。

## 当前存在的内容

仓库保留了静态提示词模板目录：

```text
prompts/
└── templates/
    └── hackbot_security.yaml
```

该 YAML 文件用于保存 Hackbot 角色、能力边界和行为准则等提示词内容。当前后端 Agent 的系统提示词主要写在 TypeScript 类中，例如：

- `server/src/modules/agents/core/base-agent.ts`
- `server/src/modules/agents/core/hackbot-agent.ts`
- `server/src/modules/agents/core/superhackbot-agent.ts`
- `server/src/modules/agents/core/planner-agent.ts`
- `server/src/modules/agents/core/qa-agent.ts`
- `server/src/modules/agents/core/summary-agent.ts`

如果需要修改当前运行时提示词，请优先查看这些文件，而不是只修改 `prompts/templates/`。

## `prompt_chains` 数据表

SQLite 中仍有 `prompt_chains` 表，`DatabaseService` 也保留了这些方法：

- `savePromptChain`
- `getPromptChain`
- `listPromptChains`
- `deletePromptChain`

但当前没有公开的 PromptController，也没有 TUI 命令直接管理这些记录。因此它是可复用的底层存储能力，不是完整产品功能。

## 聊天请求中的 `prompt` 字段

`POST /api/chat` 的 DTO 保留了可选 `prompt` 字段：

```json
{
  "message": "扫描本机系统信息",
  "mode": "agent",
  "agent": "hackbot",
  "prompt": "optional custom prompt"
}
```

当前主执行路径没有完整接入这个字段来覆盖 Agent 系统提示词。请不要把它当成稳定的提示词注入 API。

## 如果要重新接入提示词链

建议按下面顺序实现，避免文档先行造成误导：

1. 新增 `PromptModule` 或在现有模块中暴露明确 controller。
2. 为 `prompt_chains` 提供 CRUD API。
3. 在 `ChatService` 或 Agent 构造流程中定义清晰的提示词优先级。
4. 在 TUI 中新增 `/prompt-list`、选择、预览和启用逻辑。
5. 为提示词链格式补测试。
6. 最后再更新本文档。

建议的优先级可以是：

```text
请求显式 prompt > 已启用 prompt_chain > Agent 默认 systemPrompt
```

在代码未实现前，本文档只记录当前状态，不提供不存在的使用命令。
