# Secbot Terminal UI (TypeScript)

本项目终端界面采用 **TypeScript 生态**：基于 [Ink](https://github.com/vadimdemedes/ink)（React for CLI）的终端 TUI，通过 HTTP/SSE 连接 NestJS 后端，核心逻辑在后端侧，UI 层为独立 Node 进程。

## 要求

- Node.js 18+
- 真实终端 TTY（否则 Ink 会报 raw mode 错误）
- 若使用默认子进程模式：本地可用的 `server/dist/main.js`（在仓库根执行 `npm run build` 可生成）
- 若使用服务模式：可访问的 Secbot 后端地址

## 配置

- **SECBOT_TUI_BACKEND**：`spawn` / `service` / `remote` / `auto`
  - `spawn`：本地拉起后端子进程
  - `service`：仅连接已有后端
  - `remote`：`service` 的兼容别名
  - `auto`：兼容模式（存在 `SECBOT_API_URL` 时走 `service`，否则走 `spawn`）
- **SECBOT_API_URL** 或 **BASE_URL**：后端 API 根地址（`service`/`auto` 常用）
- CLI 参数：
  - `--spawn` / `--spawn-backend` / `-s`
  - `--service` / `--remote` / `-r`
  - `--backend-url=<url>`

## 安装与运行

```bash
cd terminal-ui
npm install
npm run tui
```

或从项目根目录：

```bash
cd terminal-ui && npm install && npm run tui
```

默认 `npm run tui` 为本地子进程模式（`spawn`）。  
若要仅连接已有后端，可显式使用服务模式：

```bash
# Linux / macOS
SECBOT_TUI_BACKEND=service SECBOT_API_URL=http://127.0.0.1:8000 npm run tui

# Windows PowerShell
$env:SECBOT_TUI_BACKEND="service"; $env:SECBOT_API_URL="http://127.0.0.1:8000"; npm run tui
```

**说明**：必须在**真实终端**（系统自带的 CMD、PowerShell 或 Windows Terminal）中运行。在 VS Code/Cursor 集成终端里会因无 TTY 而提示「请在真实终端中运行」并退出。**推荐**：在项目根目录双击 `scripts\start-cli.bat`（或运行 `.\scripts\start-cli.ps1`），会在新窗口中打开带 TTY 的终端并启动 TUI。

### 启动前验证后端（可选）

不启动 TUI、仅验证后端与 SSE 是否正常（主要用于 `service` 模式）：

```bash
cd terminal-ui
node --import tsx scripts/check-connection.mts
```

若输出「连通性测试通过」则说明后端已就绪，可再在真实终端中运行 `npm run tui`。

## 启动顺序

**方式一（推荐）**：在项目根目录执行 `npm run start:stack`，会自动构建后端并打开本 TUI。TUI 默认使用子进程模式启动本地后端。

**方式二（服务模式分步启动）**：

1. **先启动 NestJS 后端**（在第一个终端）：
   ```bash
   npm run dev
   # 或
   npm start
   ```
   默认监听 `http://localhost:8000`。

2. **再启动 TS 终端 UI（service 模式）**（在第二个终端）：
   ```bash
   cd terminal-ui
   SECBOT_TUI_BACKEND=service SECBOT_API_URL=http://127.0.0.1:8000 npm run tui
   ```

若后端不在本机或端口不同，可设置环境变量：

```bash
# Windows PowerShell（service 模式）
$env:SECBOT_TUI_BACKEND="service"; $env:SECBOT_API_URL="http://192.168.1.100:8000"; npm run tui

# Linux / macOS（service 模式）
SECBOT_TUI_BACKEND=service SECBOT_API_URL=http://192.168.1.100:8000 npm run tui
```

## 功能

- **主区（可滚动）**：流式显示规划、推理、执行、内容、报告与阶段；**仅在区域内渲染可见行**，底部有**行号与滚动提示**（如 1-18/45 行、Page Up/Down 滚动 ↑↓）；支持 **Page Up / Page Down** 在区域内上下滑动，避免全量反复渲染。
- **自适应布局**：随终端窗口放大、缩小自动调整（监听 resize），列宽与行高、侧栏宽度等按当前终端尺寸计算，与浏览器窗口类似。
- **右侧栏**：当前 mode / agent
- **底部输入**：发送消息或斜杠命令

### 斜杠命令

输入 `/` 可触发命令补全，Enter 执行。

- **会话**：`/ask`、`/agent [hackbot|super]`
- **REST**：`/model`（当前模型/配置）、`/help`（集成安全工具）、`/list-agents`、`/system-info`、`/db-stats`

## 一键启动（推荐：解决「进不去 CLI」）

Ink 需要**真实 TTY**，在 IDE 终端或从子进程启动时往往没有 TTY，会进不去 CLI。请用下面任一方式：

- **Windows**：在项目根目录**双击** `scripts\start-cli.bat`，或在 CMD 中执行 `scripts\start-cli.bat`。会打开一个**新的 CMD 窗口**（带 TTY），并进入 TUI（默认子进程模式）。
- **Windows (PowerShell)**：在项目根执行 `.\scripts\start-cli.ps1`，会打开新 PowerShell 窗口并启动。
- **或**：先打开系统自带的 **CMD / PowerShell / Windows Terminal**，`cd` 到项目根，再执行 `npm run start:stack`。

其他脚本：
- `.\scripts\start-ts-tui.ps1`
- **Linux / macOS**：`./scripts/start-ts-tui.sh`

## 终端 UI 说明

- 终端界面已统一为 **TypeScript 生态**（本包）：独立 Node 进程，通过 HTTP/SSE 与 NestJS 后端通信，为推荐的终端交互方式。
- 在项目根执行 `npm run start:stack` 会先完成后端构建，再启动本 TUI（默认子进程模式）。
