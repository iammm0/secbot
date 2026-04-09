# Secbot 部署指南

本文档聚焦当前仓库已存在且可维护的部署方式：**Python 后端服务**。

## 当前部署建议

- **本地交互**：使用 `python scripts/main.py` 或 `uv run secbot`
- **长期运行后端**：使用 `uv run secbot --backend`、`python -m router.main`，再由自定义客户端调用 API
- **二进制分发**：优先使用 GitHub Release 中的现成 zip 包

当前仓库**没有维护中的 Dockerfile / docker-compose 产物**。如果你需要容器化部署，请先阅读 [DOCKER_SETUP.md](DOCKER_SETUP.md)。

## 一、从源码部署后端

### 1. 安装依赖

```bash
git clone https://github.com/iammm0/secbot.git
cd secbot
uv sync
```

如果希望本地注册命令入口，也可以额外执行：

```bash
uv pip install -e .
```

### 2. 配置 `.env`

开发模板：复制根目录 `.env.backup` 为 `.env`（`env.example` 中有简短说明）。最小示例：

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

### 3. 启动后端

```bash
uv run secbot --backend
```

或：

```bash
python -m router.main
```

默认监听 `0.0.0.0:8000`。

## 二、环境变量说明

常用配置如下：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `LLM_PROVIDER` | 当前推理后端 | `deepseek` |
| `DEEPSEEK_API_KEY` | DeepSeek API Key | 无 |
| `DEEPSEEK_BASE_URL` | DeepSeek Base URL | `https://api.deepseek.com` |
| `DEEPSEEK_MODEL` | DeepSeek 默认模型 | `deepseek-reasoner` |
| `OLLAMA_BASE_URL` | Ollama 地址 | `http://localhost:11434` |
| `OLLAMA_MODEL` | Ollama 默认模型 | `gemma3:1b` |
| `OLLAMA_EMBEDDING_MODEL` | Ollama 嵌入模型 | `nomic-embed-text` |
| `DATABASE_URL` | SQLite 连接串 | `sqlite:///./data/secbot.db` |
| `LOG_LEVEL` | 日志级别 | `INFO` |
| `SECBOT_SERVER_HOST` | 覆盖监听地址 | 自动推导 |
| `SECBOT_SERVER_PORT` | 覆盖监听端口 | `8000` |
| `SECBOT_SERVER_RELOAD` | 是否启用热重载 | 桌面模式默认关，其它默认开 |

## 三、数据与日志

### SQLite 数据库

默认 `DATABASE_URL` 为：

```text
sqlite:///./data/secbot.db
```

需要注意的是，当前实现会把相对路径解析到 `hackbot_config/` 包目录下。因此生产环境更建议显式指定**绝对路径**，例如：

```env
DATABASE_URL=sqlite:////srv/secbot/data/secbot.db
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
Description=Secbot FastAPI Backend
After=network.target

[Service]
Type=simple
User=secbot
WorkingDirectory=/srv/secbot
Environment=PYTHONDONTWRITEBYTECODE=1
ExecStart=/usr/bin/env uv run secbot --backend
Restart=always
RestartSec=5

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
- `http://127.0.0.1:8000/redoc`

## 六、更新流程

```bash
cd /srv/secbot
git pull
uv sync
sudo systemctl restart secbot
```

若你使用的是安装式部署：

```bash
uv pip install -e .
sudo systemctl restart secbot
```

## 七、排障

### 1. 端口 8000 被占用

`router.main` 启动前会主动检查端口占用。若报错，请先结束占用进程，再重启服务。

### 2. 客户端能连接但接口失败

优先检查：

- 后端是否真的监听在客户端使用的地址与端口
- CORS 是否为默认配置
- 客户端是否误连到了错误的 host/port

### 3. Ollama 无法列出模型

`/api/system/ollama-models` 会先检测 Ollama 是否在线。若返回 `error` 字段，请先确认：

- `ollama serve` 或桌面应用已启动
- `OLLAMA_BASE_URL` 指向正确地址

## 八、相关文档

- [API.md](API.md)
- [DOCKER_SETUP.md](DOCKER_SETUP.md)
- [RELEASE.md](RELEASE.md)
- [OLLAMA_SETUP.md](OLLAMA_SETUP.md)
