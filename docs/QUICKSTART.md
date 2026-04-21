# 快速启动指南（Python 版）

本文档只覆盖当前维护的 Python 路线：`Typer + Rich` 交互 CLI 与可选 FastAPI 后端。

## 1. 从源码启动交互 CLI

### 1.1 安装依赖

```bash
git clone https://github.com/iammm0/secbot.git
cd secbot
uv sync
```

### 1.2 配置模型

可以先不创建 `.env`。首次启动后，在交互界面输入 `/model`，或直接运行 `uv run secbot model` / `secbot model`，选择厂商、填写 API Key、Base URL 与默认模型。配置会写入 SQLite，下次启动优先使用。

`.env` 只用于 CI、无人值守启动或临时覆盖默认值。需要时可参考根目录 `env.example` 与 `.env.backup`。

DeepSeek 环境变量示例：

```env
LLM_PROVIDER=deepseek
DEEPSEEK_API_KEY=sk-your-api-key
DEEPSEEK_MODEL=deepseek-reasoner
```

Ollama 环境变量示例：

```env
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=gemma3:1b
OLLAMA_EMBEDDING_MODEL=nomic-embed-text
```

### 1.3 启动

```bash
python scripts/main.py
# 或
uv run secbot
```

## 2. 只启动后端 API

适合对接外部客户端或做接口调试。

```bash
secbot server
# 或源码仓中
uv run secbot server
# 或
python -m router.main
```

默认地址：

- API：`http://127.0.0.1:8000`
- Swagger UI：`http://127.0.0.1:8000/docs`
- ReDoc：`http://127.0.0.1:8000/redoc`

## 3. 常用命令

```bash
# 显示命令帮助
uv run secbot --help

# 单次任务
uv run secbot "扫描 192.168.1.1 的开放端口"

# 问答模式
uv run secbot --ask "什么是 XSS 攻击？"

# 专家模式
uv run secbot --agent superhackbot

# 切换推理后端/模型
uv run secbot model
```

## 4. 常见问题

### 4.1 命令可执行但报模型配置错误

优先检查：

- 是否已经通过 `/model` 或 `secbot model` 保存过模型配置
- API Key 是否有效
- 如使用 `.env`，变量名是否正确，`LLM_PROVIDER` 是否与对应厂商变量匹配

### 4.2 Ollama 连接失败

请确认：

- `ollama serve` 或 Ollama 应用已启动
- `OLLAMA_BASE_URL` 配置正确
- 已拉取 `OLLAMA_MODEL` 指定模型

更多见 [OLLAMA_SETUP.md](OLLAMA_SETUP.md)。

### 4.3 API 能启动但调用失败

优先检查：

- 端口 `8000` 是否被占用
- 防火墙或代理是否拦截请求
- 是否使用了正确的 `host:port`
