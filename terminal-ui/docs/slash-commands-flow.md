# 斜杠命令触发逻辑对比

## SessionView 中的分支逻辑

1. **是否走 trigger（App 里注册的 onSelect）**
   - 条件：`exact` 匹配到注册命令，且不在 `chatOnlySlash`，且（不是 `/agent` 或仅无参），且**不在** `restSlashUseParseSlash`。
   - `restSlashUseParseSlash = ['/help', '/list-agents']`，所以这两个**不会**走 trigger，会继续往下走 `parseSlash`。

2. **parseSlash 之后**
   - 若有 `result.chat` → 发消息或切模式。
   - 若有 `result.fetchThen`：
     - **若 cmd === '/model'** → 直接 `dialog.replace(<ModelConfigDialog />)`，不调 fetch。
     - **否则** → 弹窗 `RestResultDialog`，`fetchContent` 由 parseSlash 提供（/help 为静态文案，/list-agents 为请求 API）。

## 命令对比

| 命令          | 是否调 API | 是否 trigger | 实际效果 |
|---------------|------------|-------------|----------|
| **/model**    | ❌ 否      | ✅ 是       | 打开 ModelConfigDialog 弹窗 |
| **/help**     | ❌ 否（静态） | ❌ 否     | 弹窗展示 Secbot 集成的安全工具说明 |
| **/list-agents** | ✅ GET /api/agents | ❌ 否 | 弹窗展示智能体列表 |

- **/help**：不请求后端，仅展示前端静态文案（集成安全工具概览）。

**说明**：会话类斜杠命令保留 `/ask`（问答模式）、`/task`（任务模式）与 `/agent`（切换智能体）；已移除 `/plan`、`/start`，多步任务请直接输入任务描述。

## /model 与 Ollama 配置

- **触发**：输入 `/model` 或从命令面板选「当前模型/配置」→ 打开 `ModelConfigDialog`（不依赖 parseSlash 的 fetchThen）。
- **弹窗内**：
  1. 先请求 `GET /api/system/config` 得到 `llm_provider`、`ollama_model`、`ollama_base_url`。
  2. 当进入「Ollama」详情（或当前提供商为 Ollama）时，请求 `GET /api/system/ollama-models`。
- **后端 `/api/system/ollama-models`**（NestJS `SystemModule`）：
  - 使用 `OLLAMA_BASE_URL`（缺省 `http://localhost:11434`）。
  - 由 `SystemService.getOllamaModels()` 处理：GET `{url}/api/tags`，3 秒超时，200 即视为服务可用。
  - 不可达则返回 `error`（如「无法连接 Ollama 服务…」），前端显示为「本地模型列表: …」。
  - 可达则拉取模型列表；若默认模型不在列表中则后台拉取并返回 `pulling_model`。
- **修改方式**：Ollama 的默认模型和地址需在项目根目录 `.env` 中设置 `OLLAMA_MODEL`、`OLLAMA_BASE_URL` 后重启后端生效；TUI 内仅展示与只读。
