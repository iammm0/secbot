# Secbot 部署指南

本文档只覆盖当前 `pypi-release` 分支实际维护的 Python 形态：`secbot` 命令行工具与可选 FastAPI 后端。

## 当前部署建议

- **本地交互**：安装后直接运行 `secbot`，或在源码仓运行 `uv run secbot` / `python scripts/main.py`。
- **长期运行 API**：使用 `secbot server`、`uv run secbot server` 或 `python -m router.main` 启动 FastAPI。
- **模型配置**：优先在程序内通过 `/model` 或 `secbot model` 配置，配置会写入 SQLite；`.env` 仅用于 CI、无人值守启动或显式覆盖默认值。

需要进程守护时，建议使用 systemd、supervisor、launchd 或你自己的平台编排方式。

## 一、从 PyPI 部署

```bash
python -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install secbot
```

启动交互 CLI：

```bash
secbot
```

启动 FastAPI：

```bash
secbot server
```

默认监听 `0.0.0.0:8000`，可通过 `--host` / `--port` 覆盖：

```bash
secbot server --host 127.0.0.1 --port 8000
```

## 二、从源码部署

```bash
git clone https://github.com/iammm0/secbot.git
cd secbot
uv sync
```

交互 CLI：

```bash
uv run secbot
# 或
python scripts/main.py
```

FastAPI：

```bash
uv run secbot server
# 或
python -m router.main
```

如果希望在当前环境注册可执行入口：

```bash
uv pip install -e .
```

## 三、配置模型与密钥

推荐方式：

```bash
secbot model
```

或进入交互 CLI 后输入：

```text
/model
```

程序会把当前推理后端、API Key、Base URL、模型名等写入 SQLite，下次启动优先读取这些持久化配置。

只在需要环境注入时创建 `.env`。仓库提供：

- `env.example`：极简说明，强调 `.env` 可选。
- `.env.backup`：完整变量参考，可复制为 `.env` 后按需取消注释。

DeepSeek 示例：

```env
LLM_PROVIDER=deepseek
DEEPSEEK_API_KEY=sk-your-api-key
DEEPSEEK_MODEL=deepseek-reasoner
LOG_LEVEL=INFO
```

Ollama 示例：

```env
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=gemma3:1b
OLLAMA_EMBEDDING_MODEL=nomic-embed-text
```

## 四、环境变量说明

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
| `SECBOT_SERVER_HOST` | `python -m router.main` 的监听地址 | `0.0.0.0` |
| `SECBOT_SERVER_PORT` | `python -m router.main` 的监听端口 | `8000` |
| `SECBOT_SERVER_RELOAD` | `python -m router.main` 是否启用热重载 | `false` |

说明：

- `secbot server` 子命令也支持 `--host`、`--port`、`--reload`。
- `SECBOT_SERVER_RELOAD` 只有设置为 `1`、`true` 或 `yes` 时才会开启热重载。

## 五、数据与日志

### SQLite 数据库

默认 `DATABASE_URL`：

```text
sqlite:///./data/secbot.db
```

当前实现会把相对数据库路径解析到 `hackbot_config/` 包目录下。源码运行时通常会落在：

```text
hackbot_config/data/secbot.db
```

长期运行或系统服务场景建议显式指定绝对路径，避免工作目录、安装路径变化造成数据分散：

```env
DATABASE_URL=sqlite:////srv/secbot/data/secbot.db
```

### 日志

默认日志文件：

```text
logs/agent.log
```

如果你使用仓库里的开发脚本，脚本自身还可能写入：

- `logs/backend-runtime.log`
- `logs/tui-runtime.log`

## 六、systemd 示例

适合把 FastAPI 后端作为 Linux 服务长期运行。

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
Environment=DATABASE_URL=sqlite:////srv/secbot/data/secbot.db
ExecStart=/srv/secbot/.venv/bin/secbot server --host 0.0.0.0 --port 8000
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

如果从源码目录用 `uv` 运行，也可以把 `ExecStart` 改为：

```ini
ExecStart=/usr/bin/env uv run secbot server --host 0.0.0.0 --port 8000
```

## 七、部署后验证

```bash
curl http://127.0.0.1:8000/health
curl http://127.0.0.1:8000/api/system/info
```

也可以直接打开：

- `http://127.0.0.1:8000/docs`
- `http://127.0.0.1:8000/redoc`

## 八、更新流程

PyPI 安装：

```bash
source /srv/secbot/.venv/bin/activate
pip install --upgrade secbot
sudo systemctl restart secbot
```

源码部署：

```bash
cd /srv/secbot
git pull
uv sync
sudo systemctl restart secbot
```

## 九、排障

### 1. 端口 8000 被占用

`python -m router.main` 启动前会主动检查端口占用。`secbot server` 由 Uvicorn 直接启动，也会在端口不可用时报错。请先结束占用进程，再重启服务。

### 2. 能连接但接口失败

优先检查：

- 服务是否监听在客户端使用的地址与端口。
- `.env`、SQLite 中的模型配置是否有效。
- 反向代理、防火墙或本机代理是否改写了请求。
- 生产环境是否需要在反向代理或应用层补充鉴权。

### 3. Ollama 无法列出模型

`/api/system/ollama-models` 会先检测 Ollama 是否在线。若返回 `error` 字段，请确认：

- `ollama serve` 或 Ollama 应用已启动。
- `OLLAMA_BASE_URL` 指向正确地址。
- 默认模型 `gemma3:1b` 或你配置的模型已拉取。

## 十、相关文档

- [API.md](API.md)
- [QUICKSTART.md](QUICKSTART.md)
- [OLLAMA_SETUP.md](OLLAMA_SETUP.md)
- [DATABASE_GUIDE.md](DATABASE_GUIDE.md)
- [RELEASE.md](RELEASE.md)
