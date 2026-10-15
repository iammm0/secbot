# 推广期安全默认

在采用 **模式 A**（经 `execgocli` 或 HTTP 调 `POST /adapters/actions`）面向更大数据/生产之前，建议落实以下基线。

## Shell 与 OS 类能力

- **`os.shell` 应启用白名单/允许列表** 作为默认基线。仅在可信任的开发机显式使用 `EXECGO_SHELL_POLICY=open`（或等效项），**不要**在共享/生产环境静默默认成开放模式。
- 将 agent 填写的 shell 内容视为**不可信输入**；避免拼接含秘密的长命令。
- 需要路径边界时，为工作区做组织级策略，并在后续需要时加路径沙箱/目录约束。

## 审计与归因

- 在可行时填写 `agent_id` / `session_id` / `action_id` / `metadata`。
- 适配器会写入 `annotations` 与 `translation_trace`，便于与调度与落库结果对照。

## 更强隔离：runtime 执行器

- 当需要**进程级隔离、资源限制或数据面沙箱**时，优先使用 **`runtime.command` / `runtime.script`**，经内置 `runtime` 执行器对接 **execgo-runtime**。
- 在 ExecGo 进程中配置 `EXECGO_RUNTIME_URL` 指向可达的 `execgo-runtime`；以 `GET /readyz` 做就绪探活（与 `runtime` 执行器 HealthCheck 行为一致）。
- 推广期可试用 `execgocli ensure-running --with-runtime`；**生产环境**应使用你既有的进程编排/容器编排与可观测，而非临时 `docker run`。

## `execgocli` 不替代的事项

- 不绕过 ExecGo 校验与 shell 策略。
- 不自动授予外网/特权；外网访问行为由任务类型与环境决定。

## 参见

- [执行器与内置能力](../reference/executors.md)
- [ExecGo 与 execgo-runtime 关系](../overview/execgo-and-runtime.md)
- [execgocli 契约](execgo-cli-contract.md)
