# 开发指南

## 克隆与分支

```bash
git clone https://github.com/iammm0/secbot.git
cd secbot
git checkout release          # 当前产品基线
# 或 feat/claude-like-tui     # TUI 功能候选（只读冻结时可从 freeze tag 新建分支）
```

## 日常命令

```bash
npm ci
npm run dev              # 后端开发（编译 + 运行）
npm run dev:watch        # 后端 watch
npm run start:stack      # 构建 + TUI + spawn 后端
npm run start:tui        # 仅 TUI
npm run typecheck
npm run lint
npm run test
npm run build:terminal-ui
```

## 代码布局（改哪里）

| 目标 | 路径 |
| --- | --- |
| 编排逻辑 | `server/src/modules/chat/chat.service.ts` |
| Agent | `server/src/modules/agents/core/` |
| 新工具 | `server/src/modules/tools/` + `tools.module.ts` |
| TUI SSE | `terminal-ui/src/useChat.ts` |
| 新 UI 块 | `terminal-ui/src/components/blocks/` |

## 测试

```bash
npm test                 # Vitest，含 parse-tool-action 等
```

## 贡献约定

- 匹配现有风格，避免无关大范围重构  
- TUI Markdown：`marked.use(markedTerminal(...))`  
- ReAct 解析统一走 `parseToolAction`  
- 详见 [CLAUDE.md](https://github.com/iammm0/secbot/blob/release/CLAUDE.md) / [AGENTS.md](https://github.com/iammm0/secbot/blob/release/AGENTS.md)

## 分支保护

`release` 与 `feat/claude-like-tui` 可能处于 **锁定** 状态；新功能请从 freeze tag 创建分支，通过 PR 合入（解锁后）。

## 发布前

参见 [[Release-and-Versioning|发布与版本]]。

## 相关文档

- [docs/TOOL_EXTENSION.md](https://github.com/iammm0/secbot/blob/release/docs/TOOL_EXTENSION.md)
- [docs/UI-DESIGN-AND-INTERACTION.md](https://github.com/iammm0/secbot/blob/release/docs/UI-DESIGN-AND-INTERACTION.md)
- [docs/DEPLOYMENT.md](https://github.com/iammm0/secbot/blob/release/docs/DEPLOYMENT.md)
