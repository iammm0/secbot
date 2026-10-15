# ExecGo 与 execgo-runtime 的关系

本页回答一个常见问题：**ExecGo 和 `execgo-runtime` 到底是什么关系？是否必须一起部署？**

## 一句话总结

- **ExecGo（本仓库）**：面向通用 Agent 的**可靠执行层/控制面**，负责接收结构化 action 或任务图、调度、状态、取消与可观测性，并把任务交给 executor 执行。
- **execgo-runtime（独立仓库）**：面向执行的**数据面/运行时**，负责进程级执行、资源与（Linux-only）sandbox 策略、任务目录与结果持久化，对外暴露运行时 API。

二者通过 ExecGo 的 **`runtime` executor** 以 HTTP 对接：ExecGo 把 `type=runtime` 的任务提交到 `execgo-runtime`，并轮询/取消其执行结果。

典型落点是 Claude Code、Codex、Hermes Agent、OpenClaw 这类已经具备规划能力的 agent：它们继续决定“做什么”，ExecGo 与 runtime 负责让“真实执行”具备可验证、可取消、可审计、可恢复的工程语义。

## 两个项目各自负责什么

### ExecGo（控制面）

- **契约**：`TaskGraph` / `Task`（Task DSL）
- **能力**：
  - DAG 调度（依赖、并发控制、失败传播语义）
  - 统一的 `retry/timeout` 语义与状态机（pending/running/success/failed/skipped）
  - 统一的状态存储（内存 + jsonfile；可选 `contrib/sqlite`、`contrib/rediscache`）
  - 统一的可观测性（slog/traceID/metrics）
  - 多 executor：`os` / `mcp` / `cli-skills` / `runtime`（可扩展）

### execgo-runtime（数据面）

- **契约**：运行时任务提交/查询/等待/取消（以其自身的 HTTP API 为准）
- **能力**：
  - 把任务落到真实进程（child process）执行
  - 资源与隔离策略（特别是 Linux 上更强的 sandbox/cgroup 能力）
  - 运行结果持久化（任务目录、stdout/stderr/result 等）

## 什么时候需要 execgo-runtime

推荐部署 `execgo-runtime` 的典型场景：

- 你希望把“执行”从 ExecGo 进程中剥离，让 ExecGo 更聚焦于调度与 API。
- 你希望有更明确的**运行时资源/隔离**边界（例如受控的脚本/命令执行）。
- 你需要运行时侧对任务结果进行更强的持久化与复盘（task 目录结构、stdout/stderr、request/result 等）。

不需要 `execgo-runtime` 的典型场景：

- 你只使用 ExecGo 的 `os/*`、`mcp/*`、`cli-skills/*` 能力，且执行环境就是 ExecGo 所在主机。
- 你在本地开发/演示阶段，希望部署尽量简单。

## 调用链（从 Agent 到 runtime）

1. Agent 提交 `TaskGraph`（或通过 `/adapters/actions` 提交结构化 action）
2. ExecGo 调度到某个任务
3. 若任务为 `type=runtime`：
   - ExecGo 的 `runtime` executor 通过 `EXECGO_RUNTIME_URL` 指向的运行时地址
   - 调用 `execgo-runtime` 的任务提交 API（通常是 `/api/v1/tasks`）
   - 后续轮询/取消也走 runtime API
4. ExecGo 将 runtime 的结果归一化写回 `Task.result` / `Task.runtime` 等字段，并持续产出 metrics

## 边界与约束（重要）

- **不是强依赖**：ExecGo 可以独立运行；只有你使用 `type=runtime`（或 adapter 里选择 `runtime.command/runtime.script`）时才需要 `execgo-runtime`。
- **API 版本对齐**：ExecGo 的 `runtime` executor 依赖 `execgo-runtime` 的 HTTP 契约；升级任一侧时，需确认 `/api/v1/tasks` 请求/响应字段兼容。
- **平台差异**：更强的 sandbox/cgroup 能力是 Linux-only；macOS 侧能力以 runtime 实现为准。
