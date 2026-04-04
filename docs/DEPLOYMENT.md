# Secbot 部署指南

本文档聚焦当前仓库已存在且可维护的部署方式：**NestJS 后端服务**。`terminal-ui` 适合本地交互使用，移动端和桌面端可独立连接这个后端。

## 当前部署建议

- **本地交互**：使用 `npm start` 或 `npm run start:stack`
- **长期运行后端**：使用 `npm run dev` 或 `node server/dist/main.js`，再由移动端、桌面端或自定义客户端调用 API
- **二进制分发**：优先使用 GitHub Release 中的现成打包产物

当前仓库**没有维护中的 Dockerfile / docker-compose 产物**。如果你需要容器化部署，请先阅读 [DOCKER_SETUP.md](DOCKER_SETUP.md)。

## 一、从源码部署后端

### 1. 安装依赖

```bash
git clone https://github.com/iammm0/secbot.git
cd secbot
npm install
```

> 要求 Node.js 18+ 和 npm。

### 2. 构建

```bash
npm run build
```

构建产物输出到 `server/dist/`。

### 3. 配置 `.env`

仓库根目录没有 `.env.example`，请手动创建 `.env`。最小示例：

```env
LLM_PROVIDER=deepseek
DEEPSEEK_API_KEY=sk-your-api-key
DEEPSEEK_MODEL=deepseek-reasoner
LOG_LEVEL=INFO
```

使用 Ollama 时可改为：

```env
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=gemma3:1b
OLLAMA_EMBEDDING_MODEL=nomic-embed-text
```

### 4. 启动后端

开发模式（tsx watch 热重载）：

```bash
npm run dev
```

生产模式：

```bash
npm run build
node server/dist/main.js
```

或使用一键命令：

```bash
npm start
```

默认情况下：

- 普通模式监听 `0.0.0.0:8000`
- 端口可通过 `PORT` 环境变量配置
- 桌面嵌入模式可通过 `SECBOT_DESKTOP=1` 切换到 `127.0.0.1:8000`

## 二、环境变量说明

常用配置如下：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `PORT` | 监听端口 | `8000` |
| `LLM_PROVIDER` | 当前推理后端 | `deepseek` |
| `DEEPSEEK_API_KEY` | DeepSeek API Key | 无 |
| `DEEPSEEK_BASE_URL` | DeepSeek Base URL | `https://api.deepseek.com` |
| `DEEPSEEK_MODEL` | DeepSeek 默认模型 | `deepseek-reasoner` |
| `OLLAMA_BASE_URL` | Ollama 地址 | `http://localhost:11434` |
| `OLLAMA_MODEL` | Ollama 默认模型 | `gemma3:1b` |
| `OLLAMA_EMBEDDING_MODEL` | Ollama 嵌入模型 | `nomic-embed-text` |
| `LOG_LEVEL` | 日志级别 | `INFO` |
| `SECBOT_SERVER_HOST` | 覆盖监听地址 | 自动推导 |
| `SECBOT_SERVER_PORT` | 覆盖监听端口 | `8000` |

## 三、数据与日志

### SQLite 数据库

后端使用 better-sqlite3 驱动，数据库文件默认位于：

```text
data/secbot.db
```

生产环境建议显式指定**绝对路径**，例如：

```env
DATABASE_PATH=/srv/secbot/data/secbot.db
```

### 日志

默认日志文件：

```text
logs/agent.log
```

TUI / 启动器在源码模式下还可能写入：

- `logs/backend-runtime.log`
- `logs/tui-runtime.log`

## 四、systemd 示例

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

## 五、部署后验证

```bash
curl http://127.0.0.1:8000/health
curl http://127.0.0.1:8000/api/system/info
```

也可以直接打开：

- `http://127.0.0.1:8000/docs`

## 六、更新流程

```bash
cd /srv/secbot
git pull
npm install
npm run build
sudo systemctl restart secbot
```

## 七、排障

### 1. 端口 8000 被占用

后端启动前会主动检查端口占用。若报错，请先结束占用进程，再重启服务。也可通过 `PORT` 环境变量更换端口。

### 2. 前端能打开但接口失败

优先检查：

- 后端是否真的监听在前端使用的地址与端口
- CORS 是否为默认配置
- 桌面端是否误用了 `SECBOT_DESKTOP=1` 之外的 host

### 3. Ollama 无法列出模型

`/api/system/ollama-models` 会先检测 Ollama 是否在线。若返回 `error` 字段，请先确认：

- `ollama serve` 或桌面应用已启动
- `OLLAMA_BASE_URL` 指向正确地址

## 八、相关文档

- [API.md](API.md)
- [DOCKER_SETUP.md](DOCKER_SETUP.md)
- [RELEASE.md](RELEASE.md)
- [OLLAMA_SETUP.md](OLLAMA_SETUP.md)
