# Secbot UI 设计与交互

当前仓库只保留一个前端实现：[terminal-ui](../terminal-ui/)。

`terminal-ui` 是基于 Ink + React 的终端 TUI，通过 HTTP 和 SSE 连接 NestJS 后端。仓库当前没有 `app/` 移动端或 `desktop/` 桌面端目录，因此本文档不再描述 Expo、React Native、Tauri 或浏览器 UI。

## 1. 技术栈

| 层级 | 技术 | 位置 |
|------|------|------|
| 终端 UI | Ink 4 + React 18 + TypeScript | `terminal-ui/src/` |
| 后端 API | NestJS 11 + Express | `server/src/` |
| 实时通信 | SSE (`POST /api/chat`) | `terminal-ui/src/sse.ts` |
| REST 调用 | `fetch` 封装 | `terminal-ui/src/api.ts` |
| 入口 | Node CLI | `terminal-ui/src/cli.tsx` |

## 2. 启动模式

TUI 支持两类后端连接模式：

| 模式 | 行为 | 使用场景 |
|------|------|----------|
| `spawn` | TUI 自动启动本地 `server/dist/main.js` 子进程 | 本地完整产品体验，默认 |
| `service` / `remote` | TUI 只连接已有后端 | 后端单独部署或调试 |

配置方式：

```bash
# 默认：自动拉起本地后端
npm run start:tui

# 连接已有后端
SECBOT_TUI_BACKEND=service SECBOT_API_URL=http://127.0.0.1:8000 npm run start:tui
```

`spawn` 模式会把后端子进程日志写入 `logs/backend-runtime.log`，避免污染终端 UI。

## 3. 入口与关键文件

| 文件 | 职责 |
|------|------|
| `terminal-ui/src/cli.tsx` | 解析 CLI 参数和后端模式，启动 Ink 渲染 |
| `terminal-ui/src/backendSpawn.ts` | 分配端口、启动本地后端、等待 `/api/system/info` 可用 |
| `terminal-ui/src/App.tsx` | TUI 根组件、全局布局和退出逻辑 |
| `terminal-ui/src/MainContent.tsx` | 主内容区渲染 |
| `terminal-ui/src/useChat.ts` | 聊天状态、SSE 事件处理、会话消息流 |
| `terminal-ui/src/sse.ts` | SSE 请求和事件解析 |
| `terminal-ui/src/api.ts` | REST API 调用 |
| `terminal-ui/src/slash.ts` | 斜杠命令解析与补全 |

## 4. 布局结构

TUI 的主界面围绕三块区域组织：

- 欢迎与状态区：展示 Logo、当前连接状态、模型与智能体等摘要。
- 主内容区：流式展示用户消息、规划、推理、工具调用、报告和错误。
- 输入区：接收普通消息和 `/` 斜杠命令。

主内容区会把后端 SSE 事件转换为统一的内容块，再交给 `ContentBlock` / `blocks/*` 渲染。这样可以把报告、代码、表格、工具结果、错误等结构化内容拆开维护。

## 5. SSE 事件渲染

`POST /api/chat` 返回 SSE。TUI 主要处理这些事件：

| 事件 | UI 行为 |
|------|---------|
| `connected` | 标记连接已建立 |
| `planning` | 展示计划或 Todo |
| `thought_start` / `thought_chunk` / `thought` | 展示推理过程 |
| `action_start` / `action_result` | 展示工具执行过程与结果 |
| `content` | 渲染结构化内容块 |
| `report` | 渲染最终或阶段性报告 |
| `phase` | 更新当前阶段 |
| `root_required` | 打开 root 权限确认对话框 |
| `error` | 展示错误块 |
| `response` | 展示最终回复 |
| `done` | 标记本轮完成 |

事件解析集中在 `useChat.ts`，渲染细节集中在 `components/blocks/`，避免把网络状态和 UI 表现耦合在一起。

## 6. 斜杠命令

输入 `/` 会触发命令补全。常用命令包括：

| 命令 | 说明 |
|------|------|
| `/model` | 打开模型与 provider 配置 |
| `/agent` | 切换智能体 |
| `/list-agents` | 查看后端返回的智能体列表 |
| `/system-info` | 查看系统信息 |
| `/db-stats` | 查看 SQLite 统计 |
| `/help` | 查看可用工具和帮助信息 |

命令实现位于 `terminal-ui/src/slash.ts`，部分命令会打开对话框，部分命令会调用 REST API。

## 7. 对话框与反馈

主要对话框位于 `terminal-ui/src/components/`：

- `ModelConfigDialog.tsx`：模型 provider、API Key、Base URL 和模型名配置。
- `AgentSelectDialog.tsx`：智能体选择。
- `ToolsDialog.tsx`：工具列表。
- `RootPermissionDialog.tsx`：敏感命令授权确认。
- `RestResultDialog.tsx`：REST API 调用结果展示。
- `Toast.tsx`：轻量状态反馈。

对话框状态通过 `contexts/DialogContext.tsx` 管理，Toast 通过 `contexts/ToastContext.tsx` 管理。

## 8. Context 分层

当前 TUI 的全局状态拆在 `terminal-ui/src/contexts/`：

| Context | 职责 |
|---------|------|
| `ExitContext` | 退出流程与退出动画 |
| `RouteContext` | 首页/会话视图路由 |
| `SDKContext` | 后端地址与 API 能力 |
| `SyncContext` | 与后端同步的配置/状态 |
| `ThemeContext` | 主题颜色 |
| `LocalContext` | 当前 mode、agent 等本地 UI 状态 |
| `DialogContext` | 对话框栈 |
| `CommandContext` | 命令注册和触发 |
| `KeybindContext` | 快捷键处理 |
| `ToastContext` | Toast 展示 |

入口处由 `AllProviders` 统一包裹应用，新增全局能力时优先放到独立 Context，而不是继续扩大 `App.tsx`。

## 9. 内容块渲染

`terminal-ui/src/components/blocks/` 保存结构化块渲染器，例如：

- `CodeBlock`
- `TableBlock`
- `ToolResultBlock`
- `PlanningBlock`
- `ReportBlock`
- `ErrorBlock`
- `WarningBlock`
- `SuccessBlock`

如果新增后端 `content` 类型，推荐流程是：

1. 在 `terminal-ui/src/types.ts` 或相关内容类型中补充字段。
2. 在 `components/blocks/` 增加专门渲染组件。
3. 在 `BlockRenderer.tsx` 或判别器中接入。
4. 用一个最小 SSE payload 或组件测试验证展示。

## 10. 真实终端要求

Ink 依赖 TTY raw mode。若在 IDE 集成终端、CI 或无 TTY 子进程中启动，TUI 可能无法进入交互状态。Windows 下仓库提供：

```powershell
.\scripts\start-cli.ps1
```

也可以双击 `scripts/start-cli.bat`，它会打开新的系统终端窗口。

## 11. 设计原则

- 保持 TUI 轻量：复杂业务放在后端 Agent / Tool / Service 中。
- 保持事件契约稳定：新增 SSE 事件要兼容旧事件，不要随意改名。
- 优先结构化渲染：后端能返回块结构时，不要只返回一整段纯文本。
- 避免阻塞终端：长任务通过 SSE 持续反馈阶段、工具和结果。
- 明确运行边界：TUI 是本地交互界面，长期部署以 NestJS 后端为主。
