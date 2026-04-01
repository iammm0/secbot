# 快速启动指南

本文档按“最快跑起来”的顺序整理当前仓库可用的启动方式。内容已对齐当前代码与目录结构，不再依赖不存在的 `requirements.txt`、`env.example` 或旧项目路径。

## 1. 从源码拉起完整终端版本

### 1.1 安装 Python 依赖

```bash
git clone https://github.com/iammm0/secbot.git
cd secbot
uv sync
```

### 1.2 安装 `terminal-ui` 依赖

```bash
cd terminal-ui
npm install
cd ..
```

### 1.3 新建 `.env`

仓库根目录当前没有 `.env.example`，请手动创建 `.env`。下面给出两个最常见的最小配置。

使用 DeepSeek：

```env
LLM_PROVIDER=deepseek
DEEPSEEK_API_KEY=sk-your-api-key
DEEPSEEK_MODEL=deepseek-reasoner
```

使用 Ollama：

```env
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=gemma3:1b
OLLAMA_EMBEDDING_MODEL=nomic-embed-text
```

### 1.4 启动

```bash
python main.py
# 或
uv run secbot
```

这两种方式都会：

- 在本地自动检查并启动后端
- 进入 `terminal-ui` 的全屏交互界面
- 通过 `/api/chat` 使用 SSE 实时展示规划、推理、执行、报告过程

## 2. 只启动后端 API

适合对接移动端、桌面端，或单独调试接口。

```bash
uv run secbot --backend
# 或
python -m router.main
```

默认地址：

- API：`http://127.0.0.1:8000`
- Swagger UI：`http://127.0.0.1:8000/docs`
- ReDoc：`http://127.0.0.1:8000/redoc`

## 3. 单独启动 `terminal-ui`

在后端已运行的前提下：

```bash
cd terminal-ui
npm run tui
```

仓库也保留了一键脚本：

```bash
# Linux / macOS
./scripts/start-ts-tui.sh

# Windows PowerShell
./scripts/start-ts-tui.ps1
```

## 4. 启动移动端与桌面端

### 4.1 Expo / React Native 移动端

```bash
uv run secbot --backend

# 新开一个终端
cd app
npm install
npm start
```

常用命令：

```bash
npm run ios
npm run android
npm run web
```

`app/src/api/config.ts` 已内置常见开发地址：

- Android 模拟器：`http://10.0.2.2:8000`
- iOS 模拟器 / Web：`http://localhost:8000`
- 真机：改为你的局域网 IP

### 4.2 Tauri 桌面端

```bash
cd desktop
npm install
npm run tauri dev
```

桌面端默认连接本机 `http://127.0.0.1:8000`，并可通过 `SECBOT_DESKTOP=1` 模式拉起内嵌后端。

## 5. 常见命令

```bash
# 显示命令帮助
uv run secbot --help

# 交互式切换推理后端 / 模型
uv run secbot model

# 仅启动 TUI（假定后端已运行）
uv run secbot --tui
```

## 6. 常见问题

### 6.1 运行 `secbot` 但没有进入 TUI

若你是通过 wheel / pip 安装，而不是从源码运行，包内可能不包含 `terminal-ui` 的 Node 前端资源。此时程序会优先确保后端可启动，但不会提供完整全屏 TUI。

建议：

- 使用当前仓库源码运行
- 或下载 GitHub Release 提供的完整打包产物

### 6.2 `terminal-ui` 无法启动

优先检查：

- `terminal-ui/node_modules` 是否已生成
- `node -v` 是否满足 `18+`
- 后端是否已在 `8000` 端口启动

### 6.3 Ollama 连接失败

请确认：

- `ollama serve` 或 Ollama 桌面应用已启动
- `OLLAMA_BASE_URL` 配置正确
- 已拉取 `OLLAMA_MODEL` 指定的模型

更详细说明见 [OLLAMA_SETUP.md](OLLAMA_SETUP.md)。
