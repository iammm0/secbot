# 斜杠命令触发逻辑（当前）

## SessionView 中的分支逻辑

1. **是否走 trigger（App 里注册的 onSelect）**
   - 仅非聊天命令才走 trigger；聊天命令统一走 `parseSlash`。
   - 当前 `chatOnlySlash = ['/ask', '/plan', '/task', '/agent', '/accept', '/reject']`。
   - 当前 `restSlashUseParseSlash` 覆盖 `/help`、`/help-opencode`、`/list-agents`、`/tools`、`/mode`、`/opencode`、`/acp-status`、`/mcp-status`、`/mcp-add`、`/skills`、`/permissions`。

2. **parseSlash 之后**
   - 若有 `result.chat` → 发消息或切模式。
   - 若有 `result.fetchThen`：
     - **若 cmd === '/model'** → 直接 `dialog.replace(<ModelConfigDialog />)`，不调 fetch。
     - **否则** → 弹窗 `RestResultDialog`，`fetchContent` 由 parseSlash 提供（/help 为静态文案，/list-agents 为请求 API）。

## 关键命令对比

| 命令 | 是否调 API | 处理路径 | 实际效果 |
|---|---|---|---|
| **/plan `<task>`** | ❌ 否 | parseSlash(chat) | 仅规划，不执行 |
| **/accept** | ❌ 否 | SessionView 特判 | 采纳上一份计划并转 agent 执行 |
| **/reject** | ❌ 否 | SessionView 特判 | 丢弃上一份计划 |
| **/model** | ❌ 否 | trigger | 打开 `ModelConfigDialog` |
| **/help** | ❌ 否（静态） | parseSlash(fetchThen) | 展示安全工具帮助 |
| **/list-agents** | ✅ `GET /api/agents` | parseSlash(fetchThen) | 展示智能体列表 |

- **/help**：不请求后端，仅展示前端静态文案（集成安全工具概览）。
- **当前模式模型**：`ask / plan / agent`；`/agent` 为统一执行模式入口，不再用于切换双角色。

## /model 与 Ollama 配置

- **触发**：输入 `/model` 或从命令面板选「当前模型/配置」→ 打开 `ModelConfigDialog`（不依赖 parseSlash 的 fetchThen）。
- **弹窗内**：
  1. 先请求 `GET /api/system/config` 得到 `llm_provider`、`ollama_model`、`ollama_base_url`。
  2. 当进入「Ollama」详情（或当前提供商为 Ollama）时，请求 `GET /api/system/ollama-models`。
- **后端 `/api/system/ollama-models`**：
  - 使用 `OLLAMA_BASE_URL`（缺省 `http://localhost:11434`）。
  - 先调用 `check_ollama_running(url)`：GET `{url}/api/tags`，3 秒超时，200 即视为服务可用。
  - 不可达则返回 `error`（如「无法连接 Ollama 服务…」），前端显示为「本地模型列表: …」。
  - 可达则拉取模型列表；若默认模型不在列表中则后台拉取并返回 `pulling_model`。
- **修改方式**：Ollama 的默认模型和地址需在项目根目录 `.env` 中设置 `OLLAMA_MODEL`、`OLLAMA_BASE_URL` 后重启后端生效；TUI 内仅展示与只读。
