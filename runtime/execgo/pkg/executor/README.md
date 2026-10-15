# pkg/executor 目录分类 / Directory layout

该目录统一为 `package executor`，通过“文件命名分组”来表达结构，避免拆分子目录后引入新的 import path。  
All files share `package executor`; we express structure via grouped filenames to avoid introducing new import paths by splitting subdirectories.

## 1) 核心接口与注册表（Core）

- `core.go`：`Executor` 接口、可选能力接口（handle/events/introspector）、`Result/Tool` 结构体、全局注册表与 `RegisterBuiltins`。
- `extension.go`：`ExecutorExtension` 扩展点与默认实现 `NopExtension`。
- `normalize_task.go`：对 legacy `task.Type` 做兼容归一（将 OS 工具映射到 `Type=os` + `ToolName`）。

English:

- `core.go`: `Executor` interface, optional capability interfaces (handle/events/introspector), `Result/Tool` types, global registry, and `RegisterBuiltins`.
- `extension.go`: `ExecutorExtension` hooks and the default `NopExtension`.
- `normalize_task.go`: legacy `task.Type` normalization (maps OS tools to `Type=os` + `ToolName`).

## 2) 集成执行器（Integrations）

- `mcp_executor.go`：`MCPExecutor`（异步 handle 管理 + 扩展委托，默认回显实现用于 smoke 测试）。
- `cli_skills_executor.go`：`CLISkillsExecutor`（本地子进程方式执行 CLI skill）。
- `runtime_executor.go`：`RuntimeExecutor`（通过 `execgo-runtime` HTTP API 提交/轮询/取消，并支持 runtime introspection）。

English:

- `mcp_executor.go`: `MCPExecutor` (async handle management + extension delegation; default echo impl for smoke tests).
- `cli_skills_executor.go`: `CLISkillsExecutor` (runs local CLI skills via subprocess).
- `runtime_executor.go`: `RuntimeExecutor` (submit/poll/cancel via `execgo-runtime` HTTP API; supports runtime introspection).

## 3) OS 内置工具（OS Builtins）

### 聚合器

- `os_executor.go`：`OSExecutor` 聚合本地 OS 能力，将 tool name 映射到具体实现。

English:

- `os_executor.go`: `OSExecutor` aggregates local OS tools and routes tool names to implementations.

### 具体工具实现

以下文件提供 `OSExecutor` 的内置工具：

- `os_shell.go`：Shell 命令执行
- `os_file.go`：文件读写
- `os_dns.go`：DNS 查询
- `os_tcp.go`：TCP 探测
- `os_sleep.go`：延时
- `os_noop.go`：空操作
- `os_http.go`：HTTP 请求

English:

The following files implement built-in tools for `OSExecutor`:

- `os_shell.go`: run shell commands/scripts
- `os_file.go`: filesystem read/write
- `os_dns.go`: DNS lookup
- `os_tcp.go`: TCP probe
- `os_sleep.go`: delay execution
- `os_noop.go`: no-op
- `os_http.go`: HTTP request

## 4) 测试（Tests）

- `os_builtins_test.go`：OS 内置工具相关测试
- `runtime_executor_test.go`：runtime executor 相关测试

English:

- `os_builtins_test.go`: OS builtin tool tests
- `runtime_executor_test.go`: runtime executor tests

## 5) RuntimeExecutor 环境变量（Environment Variables）

`RuntimeExecutor` 支持以下环境变量，由 `NewRuntimeExecutorFromEnv` 读取：

| 变量 / Variable | 说明（中）| Description (EN) |
|---|---|---|
| `EXECGO_RUNTIME_URL` | execgo-runtime HTTP 基础地址（默认 `http://127.0.0.1:8080`） | Base URL for the execgo-runtime HTTP API (default `http://127.0.0.1:8080`) |
| `EXECGO_RUNTIME_TENANT` | 租户标识；非空时注入提交 payload 的 `control_context.tenant`（不覆盖任务已提供的值） | Tenant identifier; when non-empty it is injected into `control_context.tenant` of submit payloads without overwriting a task-supplied value |
| `EXECGO_RUNTIME_OWNER` | 所有者标识；非空时注入 `control_context.owner`，且 kill 请求会携带 `X-Execgo-Owner` 头 | Owner identifier; when non-empty it is injected into `control_context.owner` and kill requests carry the `X-Execgo-Owner` header |

`NewRuntimeExecutor(baseURL, client, tenant, owner)` 也接受显式的 `tenant`/`owner` 参数，测试时可直接传入而无需设置环境变量。  
`NewRuntimeExecutor(baseURL, client, tenant, owner)` also accepts explicit `tenant`/`owner` parameters so tests can pass values directly without setting environment variables.

