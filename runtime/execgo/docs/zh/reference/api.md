# API 参考（索引）

以下页面是 ExecGo 的 HTTP API 参考索引。你可以把它当作“目录页”，对应的完整内容在更细分页面中。

## 入口

- 推荐先读：[`HTTP API 入门使用文档`](../integration/http-api-getting-started.md)
- 成熟 agent 接入：[`成熟 Agent Adapter 接入`](../integration/agent-adapter.md)
- `POST /tasks`、`GET /adapters/capabilities`、`GET /adapters/tools`、`POST /adapters/translate`、`POST /adapters/actions`、`GET /tasks/{id}`、`GET /tasks`、`DELETE /tasks/{id}`、`GET /health`、`GET /metrics`
  - 详细总览：[`API 参考`](./API%20参考/API%20参考.md)

## 你最可能关心的几类问题

- 提交任务图：[`任务管理端点`](./API%20参考/任务管理端点.md)
- 健康检查：[`系统健康端点`](./API%20参考/系统健康端点.md)
- 错误处理与状态码：[`错误处理和状态码`](./API%20参考/错误处理和状态码.md)
- 执行运行时语义：[`执行运行时语义`](./runtime-semantics.md)
