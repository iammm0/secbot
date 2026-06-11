# 终端界面

Secbot v2 终端 UI 基于 **Ink + React**，通过 SSE 流式渲染「块式」对话 transcript。

## 启动模式

| 模式 | 环境变量 | 说明 |
| --- | --- | --- |
| **spawn**（默认） | — | TUI 自动启动本地后端子进程 |
| **service** | `SECBOT_TUI_BACKEND=service` + `SECBOT_API_URL` | 连接已有后端 |

## 主要视图

- **SessionView** — 主会话界面（Claude-like 布局：transcript + 任务面板）
- **HomeView** — 入口 / 会话列表
- 底部：输入框、模型信息、**ctx** 上下文用量

## 内容块（Blocks）

TUI 将 SSE 事件聚合为可滚动块，常见类型：

| 类型 | 展示内容 |
| --- | --- |
| `user_message` | 用户输入 |
| `response` | 助手回复 |
| `planning` | 计划与 todo 列表 |
| `actions` | 工具调用 |
| `browser` | Explore 浏览器时间线 |
| `report` | 最终报告 |

新增块类型需改：`types.ts` · `contentBlocks.ts` · `BlockRenderer.tsx` · discriminators。

## 斜杠命令

在输入框以 `/` 开头：

- `/model` — 模型配置对话框
- `/skills` · `/skill` · `/create-skill` — Skills 管理

详见 `terminal-ui/docs/slash-commands-flow.md`。

## Markdown 渲染

`renderMarkdown.ts` 使用 **marked v9 + marked-terminal v6**：

```typescript
marked.use(markedTerminal(...))
```

请勿回退到旧版 `setOptions({ renderer: new MarkedTerminal() })` 模式。

## 会话与历史

- 支持多 session 列表与分页历史（`feat/claude-like-tui` 线）
- SSE 处理：`useChat.ts`

## Windows 注意

- 需在 **CMD / PowerShell / Windows Terminal** 中运行
- 无 TTY 时 `secbot` 会提示打开系统终端

## 开发

```bash
npm run build:terminal-ui
npm run start:tui
# 或
npm run start:stack
```

## 相关

- [[Quick-Start|快速开始]]
- [[Agent-Orchestration|SSE 事件说明]]
