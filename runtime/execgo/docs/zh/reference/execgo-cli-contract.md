# execgocli JSON 契约

`execgocli`（`go build -o execgocli ./cmd/execgocli` 构建）是面向 Claude Code、Codex 等 agent 的**通用 Adapter CLI**，仅使用标准库，通过 HTTP 调用 ExecGo。

## 环境变量

| 名称 | 默认 | 作用 |
| --- | --- | --- |
| `EXECGO_URL` | `http://127.0.0.1:8080` | ExecGo 控制面基址 |
| `EXECGO_RUNTIME_URL` | `http://127.0.0.1:18080` | `execgo-runtime` 基址；本机同时跑时与 ExecGo 进程内 `EXECGO_RUNTIME_URL` 一致 |
| `EXECGO_COMPOSE_DIR` | 空 | 含 `docker-compose.yml` 的目录，供 `ensure-running` 尝试 `docker compose up -d` |
| `EXECGO_RUNTIME_IMAGE` | 空 | 非空时 `ensure-running` 可尝试 `docker run` 拉起 runtime |
| `EXECGO_RUNTIME_SOURCE` | 空 | 仅用于在失败提示中输出 `cargo run` 类指引 |

## 稳定外壳（stdout）

每个子命令在 stdout 输出**一个 JSON 对象**。

### 成功

```json
{ "ok": true, "data": { } }
```

`data` 为该命令的负载；`capabilities` / `tools` / `act` / `translate` / `submit` / `health` 的 `data` 与对应 HTTP 响应体一致。

### 失败

```json
{
  "ok": false,
  "error": { "message": "…", "status_code": 400, "body": "…" }
}
```

## 子命令与 HTTP 对应关系

| 子命令 | 方法 | 路径 | 说明 |
| --- | --- | --- | --- |
| `capabilities` | GET | `/adapters/capabilities` | `adapter.v1` 契约 |
| `tools` | GET | `/adapters/tools` | 工具/技能 manifest |
| `act` | POST | `/adapters/actions` | 模式 A 执行；JSON 来自 `-file` 或 stdin |
| `translate` | POST | `/adapters/translate` | 仅翻译 |
| `submit` | POST | `/tasks` | 模式 B：直传 TaskGraph |
| `wait` | GET | `/tasks/{id}` 轮询 | 见下 |
| `cancel` | POST | `/tasks/{id}/cancel` | 请求取消任务；可用 `--wait` 等终态 |
| `health` | GET | `/health` | 探活 |
| `ensure-running` | （本地） | 无 | 探活/可选 docker |

## `wait` 的 `data` 形状

```json
{
  "tasks": [ { "id": "…", "status": "success" } ],
  "all_terminal": true,
  "deadline_rfc3339": "2026-04-27T12:00:00Z"
}
```

`all_terminal`：全部任务为 `success` / `failed` / `cancelled` / `skipped` 之一时为 `true`。

## `cancel` 的 `data` 形状

不加 `--wait` 时，`cancel` 返回 `POST /tasks/{id}/cancel` 的即时响应。运行中的任务会先进入 `cancelling`，等本地 executor 或 runtime handle 完成中止后，再进入终态 `cancelled`。

```json
{
  "tasks": [
    {
      "task_id": "a1",
      "status": "cancelling",
      "runtime": { "status": "cancelling", "error": { "code": "cancelled" } },
      "event": { "type": "task_cancel_requested", "task_id": "a1" }
    }
  ]
}
```

加 `--wait` 时，`data.wait` 与 `wait` 子命令结构一致，`data.all_terminal` 与 `data.wait.all_terminal` 对齐。

执行控制请使用 `cancel`。`DELETE /tasks/{id}` 只表示状态清理，不保证终止进程或 runtime 任务。runtime 类型任务会把 ExecGo cancel 映射到 executor 的 handle cancel 路径，并调用 `execgo-runtime` 的 `POST /api/v1/tasks/{ref}/kill`。

**退出码**：`0` 成功；`1` 错误；`2` 用法；`3` `wait` 未在时限内终态；`4` `ensure-running` 无法连上 ExecGo；`5` 带 `--with-runtime` 时 runtime 仍不可用。

## `ensure-running` 的 `data`（摘要）

`runtime` 段对 `{EXECGO_RUNTIME_URL}/readyz` 做就绪检查（与内置 `runtime` 执行器 HealthCheck 对齐）。

## 服务端契约（未变）

- Adapter：`adapter.v1`（见 `pkg/adapter/adapter.go`）
- 请求体：`AgentActionRequest`；响应含 `translation_trace` 供审计

## 参见

- [成熟 Agent 接入](../integration/agent-adapter.md)
- [模式 A 快速开始（CLI）](../integration/mode-a-cli.md)
- [模式 B 升级路径](../integration/mode-b-upgrade.md)
- [推广期安全默认](promotion-security.md)
