# Secbot 部署指南

本文档只描述当前仓库可维护的部署方式：`server/` NestJS 后端服务，以及可选的本地 `terminal-ui/` 终端界面。仓库当前没有官方 Dockerfile、docker-compose、移动端或桌面端部署产物。

## 当前建议

- 本地完整使用：`npm run start:stack`，进入 TUI，并由 TUI 自动拉起本地后端。
- 长期运行 API：构建后执行 `node server/dist/main.js`，用 systemd、pm2、supervisor 或平台进程管理器托管。
- npm 分发：使用 `@opensec/secbot` 的 `secbot` 和 `secbot-server` 二进制入口。

## 1. 从源码部署后端

### 1.1 安装依赖

```bash
git clone https://github.com/iammm0/secbot.git
cd secbot
npm install
```

要求 Node.js `>= 24`。

### 1.2 配置 `.env`

仓库根目录没有 `.env.example`，请手动创建 `.env`。

DeepSeek 示例：

```env
LLM_PROVIDER=deepseek
DEEPSEEK_API_KEY=sk-your-api-key
DEEPSEEK_MODEL=deepseek-chat
```

Ollama 示例：

```env
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2
OLLAMA_EMBEDDING_MODEL=nomic-embed-text
```

### 1.3 构建

```bash
npm run build
```

构建产物输出到 `server/dist/`。

### 1.4 启动

开发模式：

```bash
npm run dev
```

生产模式：

```bash
node server/dist/main.js
```

或使用 npm 脚本：

```bash
npm start
```

默认端口为 `8000`，可通过 `PORT` 覆盖：

```bash
PORT=9000 node server/dist/main.js
```

## 2. TUI 与后端的部署边界

`terminal-ui` 是本地交互界面，不建议作为守护服务部署。它有两种连接模式：

| 模式 | 用途 | 配置 |
|------|------|------|
| `spawn` | 本地使用，TUI 自动启动后端子进程 | 默认模式 |
| `service` / `remote` | 连接已经运行的后端 | `SECBOT_TUI_BACKEND=service` + `SECBOT_API_URL` |

连接已有后端示例：

```bash
SECBOT_TUI_BACKEND=service SECBOT_API_URL=http://127.0.0.1:8000 npm run start:tui
```

## 3. npm 包入口

```bash
npm install -g @opensec/secbot
```

完整 TUI：

```bash
secbot
```

仅后端 API：

```bash
secbot-server
```

一次性运行：

```bash
npx @opensec/secbot
```

## 4. 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `PORT` | 后端监听端口 | `8000` |
| `DATABASE_PATH` | 主 SQLite 数据库路径 | `data/opencomsagent.db` |
| `LLM_PROVIDER` | 当前推理后端 | `ollama` |
| `LLM_MODEL` | 通用模型名回退 | 无 |
| `LLM_API_KEY` | OpenAI 兼容通用 API Key 回退 | 无 |
| `LLM_BASE_URL` | OpenAI 兼容通用 Base URL 回退 | 无 |
| `OLLAMA_BASE_URL` | Ollama 地址 | `http://localhost:11434` |
| `OLLAMA_MODEL` | Ollama 默认模型 | `llama3.2` |
| `DEEPSEEK_API_KEY` | DeepSeek API Key | 无 |
| `DEEPSEEK_BASE_URL` | DeepSeek Base URL | `https://api.deepseek.com` |
| `DEEPSEEK_MODEL` | DeepSeek 默认模型 | `deepseek-chat` |
| `SECBOT_TUI_BACKEND` | TUI 后端模式：`spawn` / `service` / `remote` / `auto` | `spawn` |
| `SECBOT_API_URL` | TUI service 模式连接的后端地址 | `http://localhost:8000` |

## 5. 数据与日志

### SQLite

主数据库默认位于：

```text
data/opencomsagent.db
```

生产环境建议显式设置绝对路径：

```env
DATABASE_PATH=/srv/secbot/data/secbot.db
```

记忆与向量存储还会按需写入：

- `data/episodic_memory.json`
- `data/long_term_memory.json`
- `data/vectors.db`

### 日志

NestJS 后端默认输出到 stdout/stderr，交给进程管理器收集即可。TUI 的 spawn 模式会把后端子进程日志写入：

```text
logs/backend-runtime.log
```

## 6. systemd 示例

适合把后端作为 Linux 服务长期运行。

示例文件：`/etc/systemd/system/secbot.service`

```ini
[Unit]
Description=Secbot NestJS Backend
After=network.target

[Service]
Type=simple
User=secbot
WorkingDirectory=/srv/secbot
ExecStart=/usr/bin/node /srv/secbot/server/dist/main.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=8000
Environment=DATABASE_PATH=/srv/secbot/data/secbot.db

[Install]
WantedBy=multi-user.target
```

启用与查看状态：

```bash
sudo systemctl daemon-reload
sudo systemctl enable secbot
sudo systemctl start secbot
sudo systemctl status secbot
```

查看日志：

```bash
journalctl -u secbot -f
```

## 7. 部署后验证

```bash
curl http://127.0.0.1:8000/health
curl http://127.0.0.1:8000/api/system/info
curl http://127.0.0.1:8000/api/agents
```

当前后端没有注册 Swagger UI，不要用 `/docs` 作为验证入口。

## 8. 更新流程

```bash
cd /srv/secbot
git pull
npm install
npm run build
sudo systemctl restart secbot
```

## 9. 排障

### 9.1 端口被占用

修改 `PORT`，或结束占用端口的进程。

### 9.2 TUI 无法连接后端

先验证后端：

```bash
curl http://127.0.0.1:8000/api/system/info
```

如果使用 service 模式，请确认 `SECBOT_API_URL` 与实际地址一致。

### 9.3 浏览器前端跨域失败

当前 `server/src/main.ts` 没有显式启用 CORS。若你自建浏览器前端，需要在反向代理或应用层补充 CORS 与认证策略。

### 9.4 Ollama 模型列表为空

当前 `/api/system/ollama-models` 是兼容占位实现，会返回空模型列表和说明文本；真正的模型调用由 `OllamaProvider` 走 Ollama `/api/chat` 完成。请用 `ollama list` 和一次实际对话来验证本地模型是否可用。

## 10. 相关文档

- [API.md](API.md)
- [QUICKSTART.md](QUICKSTART.md)
- [LLM_PROVIDERS.md](LLM_PROVIDERS.md)
- [OLLAMA_SETUP.md](OLLAMA_SETUP.md)
- [RELEASE.md](RELEASE.md)
