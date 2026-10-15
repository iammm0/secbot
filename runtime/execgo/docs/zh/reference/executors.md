# 执行器与参数参考（索引）

ExecGo V2 通过 `task.type` 选择执行器大类，再通过 `task.tool_name` 选择具体工具。工具入参由 `task.params` 或 `task.input` 提供。

## 入口

- 执行器系统总览：[`执行器系统`](./执行器系统/执行器系统.md)

## 内置执行器与常用参数

- `os`：内置 `shell/file/dns/tcp/sleep/noop/http` 工具
- `mcp`：标准 MCP 工具调用（发现/调用/轮询）
- `cli-skills`：本地 CLI + Skills 执行

兼容说明：旧写法 `type=shell/file/...` 仍可提交，服务端会自动映射到 `type=os + tool_name=*`。

## 自定义执行器（开发扩展）

- [`自定义执行器开发`](./执行器系统/自定义执行器开发.md)

V2 推荐实现 `ExecutorExtension` 扩展接口：
- `ExecuteMethod`
- `BeforeExecute`
- `AfterExecute`
- `OnError`

MCP 对外端点：
- `GET /mcp/tools`
- `POST /mcp/call`
- `GET /mcp/tasks/{id}`

