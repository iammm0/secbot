# execgo-runtime 文档

本目录包含 `execgo-runtime` 的设计说明、API、CLI 与运维资料。建议先把本页当成路线图，再按角色进入具体文档。

`execgo-runtime` 的定位是 ExecGo 可靠执行层的数据面：当 Claude Code、Codex、Hermes Agent、OpenClaw 等通用或成熟 Agent 通过 ExecGo 提交真实执行动作时，runtime 负责进程执行、状态持久化、取消、资源/沙箱策略与 artifact 审计。

当前 runtime 已演进为“单一版本、多能力面”的自适应数据面运行时：启动时探测宿主环境，暴露 capability manifest，并通过 execution plan 与 ResourceLedger 显式体现 requested/effective 能力与资源留出。

## 按角色阅读

| 角色 | 推荐顺序 | 你会得到什么 |
|------|----------|--------------|
| 第一次接入 runtime | 根 [README.md](../README.md) -> [cli.md](cli.md) -> [api.md](api.md) | 本地启动、提交任务、等待结果、查看 artifact |
| ExecGo/Agent adapter 作者 | [api.md](api.md) -> [architecture.md](architecture.md) | `SubmitTaskRequest`、任务状态机、事件流、owner/tenant/control context |
| 运维与部署 | [deployment.md](deployment.md) -> [cli.md](cli.md) -> [api.md](api.md) | systemd/Docker 参数、健康检查、能力清单、资源账本与租户配额 |
| runtime 开发者 | [development.md](development.md) -> [architecture.md](architecture.md) -> [api.md](api.md) | 模块边界、测试入口、兼容性要求、扩展时要同步的文档 |

## 文档目录

1. **[architecture.md](architecture.md)** — 组件划分、任务状态机、调度与 shim、持久化与恢复、能力协商、ResourceLedger、owner/tenant 治理语义。
2. **[api.md](api.md)** — REST 路径、runtime capability/info/config/resources 接口、HTTP 状态码、请求与响应 JSON 字段、完整 curl 示例。
3. **[cli.md](cli.md)** — `execgo-runtime` 各子命令与常用参数，包括 capability override、容量覆盖、租户配额和 owner-gated kill。
4. **[deployment.md](deployment.md)** — 二进制部署、Docker/systemd 示例、健康检查、资源/能力抓取建议、容量规划、CI/CD、版本与标签策略。
5. **[development.md](development.md)** — 本地构建、测试、代码风格与提交约定，以及 capability/policy/ledger 相关模块说明。

## 关键概念速查

| 概念 | 说明 | 主要文档 |
|------|------|----------|
| `TaskStatus` | `accepted` -> `running` -> `success` / `failed` / `cancelled`。终态结果会写入 `result.json`。 | [architecture.md](architecture.md#任务状态机), [api.md](api.md#get-apiv1tasksid) |
| internal shim | runtime 用当前二进制 fork 出隐藏子命令执行真实进程；主服务不直接运行用户命令。 | [architecture.md](architecture.md#调度与-shim) |
| `execution_plan` | 记录 requested/effective sandbox、资源 enforcement、是否降级和降级原因。 | [architecture.md](architecture.md#能力协商与执行计划), [api.md](api.md#get-apiv1tasksid) |
| ResourceLedger | 在调度前预留 `task_slots`、`memory_bytes`、`pids`，用于本机容量与租户软配额控制。 | [architecture.md](architecture.md#资源账本与租户配额), [api.md](api.md#get-apiv1runtimeresources) |
| `control_context` | 控制面传入的租户、owner、运行模式与约束提示；runtime 持久化并参与治理。 | [api.md](api.md#controlcontext) |
| owner-gated kill | 若任务带 `control_context.owner`，取消时必须提供匹配 owner。 | [api.md](api.md#post-apiv1tasksidkill), [cli.md](cli.md#kill) |
| capability manifest | 启动时探测宿主 OS、sandbox、cgroup、rlimit、storage 能力；控制面可据此路由。 | [api.md](api.md#get-apiv1runtimecapabilities) |

## 最短可运行链路

```bash
cargo run -- serve --listen-addr 127.0.0.1:8080 --data-dir ./data

cargo run -- run --json '{
  "execution": {
    "kind": "command",
    "program": "/bin/sh",
    "args": ["-c", "echo hello-runtime"]
  },
  "limits": {
    "wall_time_ms": 30000,
    "stdout_max_bytes": 65536,
    "stderr_max_bytes": 65536
  },
  "metadata": {
    "demo": "docs-readme"
  }
}'
```

运行结束后可以通过 `GET /api/v1/tasks/<task_id>` 查看内联 stdout/stderr，通过 `data/tasks/<task_id>/` 查看完整请求、结果和日志文件。

## 对外索引

- 仓库根目录 [README.md](../README.md) 提供项目概览与快速开始。
- 健康检查：`GET /healthz` 返回 `version` 字段，与 Cargo 包版本一致。
- runtime 自描述：`GET /api/v1/runtime/info`、`/api/v1/runtime/capabilities`、`/api/v1/runtime/config`、`/api/v1/runtime/resources`。
- ExecGo 控制面接入：设置 `EXECGO_RUNTIME_URL=http://<host>:<port>`，让控制面通过 HTTP 调用 runtime。
