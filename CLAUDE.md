# CLAUDE.md

本文件给基于 Claude / Cursor 的 coding agent 的**速查入口**，细节以仓库内代码与 [`AGENT.md`](AGENT.md) 为准。

## 聊天编排（与 npm 对齐）

- **入口**：`router/chat.py`（SSE）、`secbot_cli/runner.py`（CLI 同进程）。
- **顺序**：`IntentRouter.classify` → 会话类早退 → 可选 `ExploreAgent` + `ContextStore.apply_patch` → `ContextAssembler.build(..., model_name=...)` → `task_simple` 直跑 ReAct / 否则 Planner+Executor → 仅 `needs_report && intent != task_simple` 时 `SummaryAgent`。
- **依赖单例**：`router/dependencies.py` 中的 `ContextStore` 与 `ContextAssembler` 必须共享同一 `ContextStore` 实例。
- **SSE 契约**：`intent_decision`、`explore_start` / `explore_step` / `explore_end`、`context_patch`、`context_usage`、`clarify`（见 `utils/event_bus.py` 与 `router/chat.py` 的 `_event_to_sse`）。
- **ReAct 工具 JSON**：`secbot_agent/core/parse_tool_action.py`；`security_react._parse_action` 优先使用它再回退旧括号扫描。

## 环境变量（编排相关）

- `SECBOT_EXPLORE_MAX_ITERS`、`SECBOT_CONTEXT_DEBUG`、`SECBOT_ADAPTIVE_REPLAN`
