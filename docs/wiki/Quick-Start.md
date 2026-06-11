# 快速开始

## 1. 配置 LLM

在运行目录创建 `.env`：

**DeepSeek（推荐）：**

```env
LLM_PROVIDER=deepseek
DEEPSEEK_API_KEY=sk-your-api-key
DEEPSEEK_MODEL=deepseek-chat
```

**Ollama（本地）：**

```env
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2
```

## 2. 启动完整栈（TUI + 后端）

**已安装 Release 包：**

```bash
secbot
```

**从源码：**

```bash
npm run start:stack
```

TUI 默认 **spawn 模式**：自动拉起本地 NestJS 子进程，通过 `POST /api/chat` SSE 流式展示推理、工具执行与报告。

## 3. 连接已有后端

```bash
SECBOT_TUI_BACKEND=service SECBOT_API_URL=http://127.0.0.1:8000 secbot
```

`remote` 为 `service` 的兼容别名。

## 4. 常用 TUI 斜杠命令

| 命令 | 作用 |
| --- | --- |
| `/model` | 模型与 provider 配置 |
| `/skills` | 列出 Skills |
| `/skill <name>` | 查看 Skill |
| `/create-skill ...` | 创建自定义 Skill |

## 5. CLI Skills 子命令

```bash
secbot skills list
secbot skills view <name>
secbot skills create <name> --description "..." --trigger recon
```

## 6. 开发常用命令

```bash
npm run dev              # 后端 watch
npm run start:tui        # 仅 TUI
npm run typecheck
npm test
npm run release:pack     # 本地打 .tgz
```

## 7. API 端点（无 Swagger）

| 端点 | 说明 |
| --- | --- |
| `GET /health` | 健康检查 |
| `GET /api/system/info` | 系统信息 |
| `POST /api/chat` | 主聊天（SSE） |
| `GET/POST /api/skills` | Skills 管理 |

详见仓库 [docs/API.md](https://github.com/iammm0/secbot/blob/release/docs/API.md)。

## 下一步

- [[Terminal-UI|终端界面详解]]
- [[Agent-Orchestration|智能体如何路由你的请求]]
- [[Tools|内置工具有哪些]]
