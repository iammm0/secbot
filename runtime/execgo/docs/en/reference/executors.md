# Executors & Parameters (Index)

ExecGo V2 chooses an executor category based on `task.type`, then a tool by `task.tool_name`.

Built-in executor categories registered by `executor.RegisterBuiltins()`:

- `os` (tools: `shell`, `file`, `dns`, `tcp`, `sleep`, `noop`, `http`)
- `mcp`
- `cli-skills`

## Full details (Chinese)

- Executor system overview: [`执行器系统`](../../zh/reference/执行器系统/执行器系统.md)
- Parameters specification: [`执行参数规范`](../../zh/reference/任务%20DSL%20规范/执行参数规范/执行参数规范.md)

## Quick mapping (how to think)

- Create a `Task` with:
  - `type`: one of `os | mcp | cli-skills`
  - `tool_name`: tool name inside that category
  - `params`/`input`: tool-specific JSON object
- Dependency edges in your DAG become `depends_on: [...]`
- Retry/timeout are handled by the scheduler per task (not by executors)

## Custom executors (optional)

ExecGo supports extending executors via the V2 registry + `ExecutorExtension` hooks (`ExecuteMethod`, `BeforeExecute`, `AfterExecute`, `OnError`).

MCP HTTP endpoints:
- `GET /mcp/tools`
- `POST /mcp/call`
- `GET /mcp/tasks/{id}`

