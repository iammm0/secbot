# 快速启动指南

本文档只保留当前仓库真实存在、可维护的启动方式：`server/` NestJS 后端和 `terminal-ui/` Ink 终端界面。仓库当前没有 `app/`、`desktop/`、Dockerfile 或 docker-compose 启动链路。

## 1. 环境要求

- Node.js `>= 24`
- npm `>= 10`（随新版 Node.js 一起安装即可）
- 真实终端 TTY（运行 Ink TUI 时需要；Windows 推荐 CMD、PowerShell 或 Windows Terminal）
- 可选：Ollama（只在使用本地模型时需要）

## 2. 配置模型

在仓库根目录创建 `.env`。当前仓库没有 `.env.example`，下面是最小示例。

使用 DeepSeek：

```env
LLM_PROVIDER=deepseek
DEEPSEEK_API_KEY=sk-your-api-key
DEEPSEEK_MODEL=deepseek-chat
```

使用 Ollama：

```env
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2
OLLAMA_EMBEDDING_MODEL=nomic-embed-text
```

说明：

- TUI 里可以通过 `/model` 修改 provider、API Key、Base URL 和模型。
- 通过 TUI 保存的配置会写入 SQLite / `config.yaml`，后续启动会优先使用已保存配置。

## 3. 从源码启动完整 TUI

```bash
git clone https://github.com/iammm0/secbot.git
cd secbot
npm install
npm run start:stack
```

`npm run start:stack` 会先构建后端，再启动 `terminal-ui`。TUI 默认使用 `spawn` 模式，也就是在本地自动拉起一个 NestJS 后端子进程，并通过 `/api/chat` 的 SSE 流展示规划、推理、工具执行和最终报告。

也可以直接运行：

```bash
npm start
```

`npm start` 只启动已经构建好的后端；如果你想进入 TUI，优先使用 `npm run start:stack` 或 `npm run start:tui`。

## 4. 只启动后端 API

适合 API 调试、自动化脚本或把 TUI 连接到已有服务。

```bash
npm run dev
```

或构建后运行：

```bash
npm run build
node server/dist/main.js
```

默认地址：

- Base URL：`http://127.0.0.1:8000`
- 健康检查：`GET /health`
- 系统信息：`GET /api/system/info`

当前后端没有注册 Swagger UI，因此不要依赖 `/docs` 页面。

## 5. 单独启动 `terminal-ui`

默认 `terminal-ui` 会自行启动本地后端子进程：

```bash
npm run build
npm run start:tui
```

如果后端已经在运行，并且你只想让 TUI 连接已有服务，请使用 service 模式：

```bash
SECBOT_TUI_BACKEND=service SECBOT_API_URL=http://127.0.0.1:8000 npm run start:tui
```

也可以在 `terminal-ui/` 目录中直接运行：

```bash
cd terminal-ui
npm install
npm run tui
```

## 6. 全局安装或 npx

发布包名是 `@opensec/secbot`：

```bash
npm install -g @opensec/secbot
secbot
```

或一次性运行：

```bash
npx @opensec/secbot
```

后端专用入口：

```bash
secbot-server
```

## 7. 常见命令

```bash
npm run build              # 构建 server/dist
npm run build:terminal-ui  # 构建 terminal-ui/dist
npm run typecheck          # TypeScript 类型检查
npm test                   # 运行 vitest
npm run start:stack        # 构建并进入 TUI
npm run start:tui          # 启动 TUI
```

## 8. 常见问题

### 8.1 TUI 没有进入全屏界面

Ink 需要真实 TTY。请在系统终端中运行，不要在没有 TTY 的 IDE 子进程里直接启动。Windows 下可以使用：

```powershell
.\scripts\start-cli.ps1
```

或双击 `scripts/start-cli.bat`。

### 8.2 TUI 提示找不到后端构建

默认 spawn 模式需要 `server/dist/main.js`。先在仓库根目录执行：

```bash
npm run build
```

### 8.3 service 模式连接失败

确认后端已启动，并检查：

```bash
curl http://127.0.0.1:8000/health
curl http://127.0.0.1:8000/api/system/info
```

如果后端不在本机或端口不是 `8000`，请同步修改 `SECBOT_API_URL`。

### 8.4 Ollama 连接失败

请确认：

- Ollama 服务已启动。
- `OLLAMA_BASE_URL` 指向正确地址。
- `OLLAMA_MODEL` 指定的模型已存在，或可由 Ollama 拉取。

更详细说明见 [OLLAMA_SETUP.md](OLLAMA_SETUP.md)。
