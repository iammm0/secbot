# 架构说明

## 定位

`execgo-runtime` 是 ExecGo 的**执行后端（数据面）**：接收任务描述、落盘、调度执行，并通过 HTTP 暴露状态与运维接口。控制面（如 ExecGo 自身）通过 HTTP 与本服务交互，**不直接** fork 用户进程。

在通用 Agent 接入方案中，上层 Agent 负责理解上下文、规划步骤和选择工具；ExecGo 控制面负责把 action 转换为任务、处理依赖/重试/取消/观测；`execgo-runtime` 负责最终的进程级执行与 artifact 留存。它刻意保持为执行后端，不解析自然语言，也不绑定任何 Agent 私有协议。

## 运行链路总览

一条任务从控制面进入 runtime 后，会经过“校验 -> 规划 -> 落盘 -> 预留资源 -> shim 执行 -> 结果回写”的链路：

```text
Agent / ExecGo control plane
  |
  | POST /api/v1/tasks
  v
Axum HTTP server
  |
  | validate SubmitTaskRequest
  | resolve ExecutionPlan
  | write request.json + SQLite row
  v
accepted queue
  |
  | ResourceLedger reservation
  | fork current binary as internal-shim
  v
internal shim
  |
  | create workspace
  | apply effective sandbox/resource plan
  | run command/script
  v
SQLite + task artifacts
  |
  | GET status / events / metrics
  v
ExecGo / Agent observes result
```

这条链路有两个重要边界：

- **HTTP 服务进程**负责 API、队列、调度、恢复和 metrics，不直接执行用户命令。
- **internal shim 子进程**负责真实命令或脚本执行，执行结束后把状态、错误、usage 和 artifact 路径写回持久化层。

## 模块划分

| 模块 | 路径 | 职责 |
|------|------|------|
| `server` | `src/server.rs` | Axum 路由：`/api/v1/*`、`/healthz`、`/readyz`、`/metrics` |
| `runtime` | `src/runtime.rs` | 运行时核心：提交、查询、kill、dispatcher、GC、shim 入口、进程执行 |
| `capabilities` | `src/capabilities.rs` | 启动时探测宿主环境，生成 capability manifest |
| `policy` | `src/policy.rs` | 将任务请求解析为 requested/effective execution plan，处理 strict/adaptive 策略 |
| `ledger` | `src/ledger.rs` | 本机 ResourceLedger 的 capacity/reservation/available 计算 |
| `repo` | `src/repo.rs` | SQLite 访问：任务表、事件表、指标聚合 |
| `types` | `src/types.rs` | 请求/响应与策略类型（执行规格、沙箱、限额） |
| `metrics` | `src/metrics.rs` | 将仓库快照渲染为 Prometheus 文本 |
| `cli` | `src/cli.rs` | 命令行解析 |
| `error` | `src/error.rs` | 错误类型与 HTTP 映射 |

## 数据模型层级

runtime 的外部 API 主要围绕以下对象组织：

| 对象 | 作用 | 落盘位置 |
|------|------|----------|
| `SubmitTaskRequest` | 控制面提交的原始执行请求，包含 `execution`、`limits`、`sandbox`、`policy`、`control_context`、`metadata`。 | `tasks/<task_id>/request.json` 与 SQLite |
| `ExecutionPlan` | runtime 解析后的 requested/effective 执行策略，用于解释降级、资源 enforcement 和 sandbox 选择。 | SQLite `execution_plan_json`，状态 API 返回 |
| `TaskResourceReservation` | 调度前预留的本机资源额度：`task_slots`、可选 `memory_bytes`、可选 `pids`。 | SQLite reservation 字段，资源 API 返回 |
| `TaskStatusResponse` | 对外查询状态时的完整快照，含 stdout/stderr 摘要、错误、usage、execution plan、artifact 路径。 | API 计算响应，终态同步写入 `result.json` |
| `EventRecord` | 任务事件流，记录 submitted/planned/degraded/resource_reserved/started/finished 等节点。 | SQLite events 表 |

## 任务状态机

任务在数据库中的 `status` 取值（JSON 中为 snake_case）：

- `accepted`：已入队，等待调度。
- `running`：已派发 shim，且（在 shim 内）进程已启动或即将启动。
- `success` / `failed` / `cancelled`：终态。

终态任务在 `limits` 与保留策略下可被 **GC** 删除（见 `serve` 的 `--result-retention-secs` 等参数）。

状态转换规则：

- 提交成功后始终先进入 `accepted`，同时写入请求文件和任务行。
- Dispatcher 预留资源并成功 fork shim 后进入 `running`。
- shim 结束后根据退出码、信号、超时、取消、OOM 或启动错误写入终态。
- `kill` 对 `accepted` 任务会直接转为 `cancelled`；对 `running` 任务先发送 SIGTERM，再按 `--termination-grace-ms` 升级 SIGKILL。
- 终态任务再次收到 `kill` 时不会重复发送信号，直接返回当前状态快照。

## 调度与 shim

1. **EnvironmentProbe** 在 `serve` 启动时生成 capability manifest，并缓存到 `RuntimeService`。
2. 提交任务时，**PolicyResolver** 基于请求、capabilities 与可选 `control_context` 生成 `execution_plan`；`adaptive` 模式会显式降级，`strict` 模式会拒绝不满足能力的任务。
3. **Dispatcher** 循环从队列中取 `accepted` 任务，先通过本机 **ResourceLedger** 做 `task_slots` / `memory_bytes` / `pids` reservation，再派发 shim。
4. 派发时以**当前可执行文件**再执行 `internal-shim` 子命令，传入 `--database`、`--data-dir`、`--task-id` 等。
5. **Shim** 读取任务记录与持久化的 `execution_plan`，构建 `Command`/`Script` 执行，在 `pre_exec` 中设置进程组、按 effective plan 应用 `rlimit`，在 Linux 上可选应用 Linux 沙箱与 cgroup。
6. shim 通过 `wait4` 等待子进程结束，并结合取消、超时、OOM 等条件写入 `CompletionUpdate`；终态写入时会释放活动 reservation。

运行时重启后，`recover` 会扫描非终态任务：`accepted` 不应持有活动 reservation，若发现会释放；`running` 若 shim 仍在则保留或重建 reservation 并标记恢复事件，否则标记为失败、释放 reservation 并落盘结果。

## 能力协商与执行计划

runtime 不假设所有机器都具备相同隔离和资源控制能力。服务启动时会生成 capability manifest，提交任务时再把“请求的能力”解析为“实际会执行的能力”：

| 输入 | 影响 |
|------|------|
| `sandbox.profile` | 请求 `process` 或 `linux_sandbox`。非 Linux 或禁用 sandbox 时，`linux_sandbox` 可能不可用。 |
| `limits.*` | 影响 rlimit/cgroup/ResourceLedger reservation。 |
| `policy.capability_mode` | `adaptive` 允许降级并记录原因；`strict` 遇到不可满足能力时拒绝提交。 |
| `control_context.requires_strict_sandbox` | 即使任务策略为 adaptive，也会把 sandbox 降级视为不可接受。 |

状态 API 中的 `execution_plan` 用于审计：

- `requested_sandbox`：控制面或用户请求的 sandbox。
- `effective_sandbox`：runtime 实际执行时使用的 sandbox。
- `resource_enforcement`：墙钟、CPU、内存、pids、cgroup、OOM 检测等是否会被实际执行。
- `degraded` / `fallback_reasons`：是否发生降级以及原因。
- `capability_warnings`：来自探测或策略解析的非致命告警。

这让上层 ExecGo 可以在不猜测宿主环境的情况下，明确知道一次真实执行是按严格要求完成，还是在可接受范围内做了降级。

## 资源账本与租户配额

ResourceLedger 是 runtime 的本机容量账本。它不替代 Linux cgroup 或 rlimit，而是在任务派发前做调度层预留：

| 资源 | 来源 | 作用 |
|------|------|------|
| `task_slots` | `--max-running-tasks` | 控制同时运行的 shim 数量。 |
| `memory_bytes` | 自动探测或 `--capacity-memory-bytes` | 当任务设置 `limits.memory_bytes` 时参与容量预留。 |
| `pids` | 自动探测或 `--capacity-pids` | 当任务设置 `limits.pids_max` 时参与容量预留。 |

提交阶段会校验单个任务是否超过 runtime 总容量；调度阶段会校验当前已预留量加上该任务后是否仍在容量内。若资源暂时不足，任务保持 `accepted` 等待下一轮调度；若单任务请求超过总容量，提交会返回 `insufficient_resources`。

租户软配额通过 `serve --tenant-quota <name>=slots:N[,memory:BYTES][,pids:N]` 配置，并依赖任务的 `control_context.tenant` 生效：

- 无 `tenant` 或未配置该租户配额时，仅受 runtime 总容量限制。
- 有租户配额时，提交阶段会拒绝单任务超过租户额度的请求。
- 调度阶段会按租户聚合当前 reservation，超出租户剩余额度的任务继续等待。
- `GET /api/v1/runtime/resources` 会返回 `tenants` 视图，包含每个租户的 quota、reserved 和 available。

## 取消与 owner 治理

runtime 支持轻量 owner 保护：提交任务时可在 `control_context.owner` 写入调用者或会话所有者。之后取消该任务时：

- HTTP 取消请求需要带 `x-execgo-owner: <owner>`。
- CLI 可用 `execgo-runtime kill --owner <owner> <task_id>`，或设置 `EXECGO_RUNTIME_OWNER`。
- 如果任务没有 `owner`，保持兼容：任意调用者可取消。
- 如果任务有 `owner` 且调用者缺失或不匹配，返回 `permission_denied` / HTTP 403。

这不是完整认证系统，只是 runtime 层的任务所有权防误杀机制。生产环境仍应在网关、内网或反向代理层加认证和授权。

## 持久化布局

在 `--data-dir` 下：

- `runtime.db`：SQLite 数据库（WAL 模式）。
- `tasks/<task_id>/` 目录：
  - `request.json`：提交时的完整请求。
  - `result.json`：终态快照（与 API 状态结构一致）。
  - `stdout.log` / `stderr.log`：输出日志。
  - `workspace/` 或 `workspace/<subdir>/`：工作目录（由 `sandbox.workspace_subdir` 决定）。

数据库中任务行还持久化 `execution_plan_json`、`control_context_json`、`reservation_json`、`reserved_at_ms`、`released_at_ms`，用于能力审计、恢复对账与资源释放。

## 恢复与 GC

服务启动时会在对外监听前执行恢复流程：

- `accepted` 且未派发的任务继续留在队列中等待调度。
- `accepted` 但带有异常活动 reservation 的任务会释放 reservation 并记录恢复事件。
- `running` 任务若 shim 仍存在，runtime 会保留或重建 reservation；若 shim 不存在，会标记失败并写入结果。
- 已终态任务不重新执行，只参与保留期后的 GC。

GC 按 `--result-retention-secs` 和 `--gc-interval-ms` 周期清理终态任务。需要长期保留审计材料时，应在 GC 之前导出 `tasks/<task_id>/`，或调大保留时间。

## 沙箱与平台差异

- **`sandbox.profile = process`**（默认）：在普通进程环境中执行，依赖 `rlimit` 等限制。
- **`sandbox.profile = linux_sandbox`**：作为 requested capability 提交；runtime 会按 capability mode 决定 strict 拒绝或 adaptive fallback，并在 `execution_plan` 中暴露 effective sandbox。

平台差异需要特别注意：

| 能力 | macOS | Linux |
|------|-------|-------|
| command/script 执行 | 支持 | 支持 |
| 进程组与信号取消 | 支持 | 支持 |
| `rlimit` CPU/内存 | 支持但语义随系统不同 | 支持 |
| cgroup v2 / pids / OOM 检测 | 不支持 | 需要 cgroup 可写与未禁用 |
| `linux_sandbox` namespace/chroot | 不支持 | 需要宿主能力与权限 |

详见 [api.md](api.md) 中的沙箱字段说明。

## 指标

`GET /metrics` 输出 Prometheus 文本指标，包括按状态任务数、错误码分布、以及基于历史 `duration_ms` 的直方图近似（实现见 `metrics.rs`）。

建议同时抓取 `/api/v1/runtime/resources` 作为容量面板数据，因为 Prometheus 指标偏聚合，而 resources API 能看到活动 reservation 与租户视图。
