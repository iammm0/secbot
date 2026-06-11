# 环境变量

## LLM 路由

| 变量 | 说明 |
| --- | --- |
| `LLM_PROVIDER` | 当前 provider（如 `deepseek`、`ollama`、`openai`） |
| `LLM_MODEL` | 通用模型名回退 |
| `LLM_API_KEY` | OpenAI 兼容 API Key 回退 |
| `LLM_BASE_URL` | OpenAI 兼容 Base URL 回退 |
| `DEEPSEEK_API_KEY` | DeepSeek |
| `DEEPSEEK_MODEL` | DeepSeek 模型 |
| `DEEPSEEK_BASE_URL` | 默认 `https://api.deepseek.com` |
| `OLLAMA_BASE_URL` | 默认 `http://localhost:11434` |
| `OLLAMA_MODEL` | 如 `llama3.2` |
| `OLLAMA_EMBEDDING_MODEL` | 嵌入模型 |

路由实现：`server/src/common/llm/llm.factory.ts`

## 服务与数据

| 变量 | 说明 | 默认 |
| --- | --- | --- |
| `PORT` | API 端口 | `8000` |
| `DATABASE_PATH` | SQLite 路径 | `data/opencomsagent.db` |

## Secbot 行为

| 变量 | 说明 | 默认 |
| --- | --- | --- |
| `SECBOT_EXPLORE_MAX_ITERS` | ExploreAgent 最大 ReAct 步数 | `12` |
| `SECBOT_CONTEXT_DEBUG` | `1`/`true` 输出 context_debug SSE | 关 |
| `SECBOT_ADAPTIVE_REPLAN` | `0`/`false` 关闭取消 todo 后的自适应重规划 | 开 |
| `SECBOT_TUI_BACKEND` | `spawn` / `service` / `remote` | `spawn` |
| `SECBOT_API_URL` | service 模式后端 URL | — |
| `SECBOT_MCP_ALLOW_SENSITIVE` | MCP 暴露敏感工具 | 关 |
| `SECBOT_PACKAGE_ROOT` | 包根目录（CLI 内部） | 自动 |
| `SECBOT_WORKSPACE_ROOT` | 工作区根 | `cwd` |

## 漏洞库

| 变量 | 说明 |
| --- | --- |
| `NVD_API_KEY` | NVD API 限速提升 |

## TUI 持久化配置

除 `.env` 外，TUI `/model` 保存的配置写入 SQLite / `config.yaml`，**优先级高于**部分环境变量。

## 延伸阅读

- [docs/LLM_PROVIDERS.md](https://github.com/iammm0/secbot/blob/release/docs/LLM_PROVIDERS.md)
- [docs/OLLAMA_SETUP.md](https://github.com/iammm0/secbot/blob/release/docs/OLLAMA_SETUP.md)
