# Orchestrator：上层编排层如何采用 ExecGo

ExecGo 的执行方式是“运行时接收一张任务图（`TaskGraph`）后，调度器按 DAG 并发执行”。因此，上层编排层最重要的工作是：

1. 把你的工作流（DAG）翻译成 ExecGo 的 `TaskGraph`
2. 用 ExecGo 的结果语义（`success/failed/skipped`）正确驱动后续逻辑
3. 处理异步执行与轮询（以及必要时的幂等/去重）

下面这些页面会把“怎么翻译、怎么理解失败、怎么正确轮询”讲清楚，并提供可直接复制的 JSON 示例。

## 文档入口

- [映射：DAG -> TaskGraph](./mapping-dag-to-taskgraph.md)
- [失败语义：failed 与 skipped 的区别](./failure-semantics.md)
- [轮询与幂等：如何稳定提交与读取结果](./polling-and-idempotency.md)

## 你必须先读的 Reference（跳转）

- [`Task DSL（任务模型与校验）`](../reference/task-dsl.md)
- [`API 端点：/tasks 与 /tasks/{id}`](../reference/api.md)

---

提示：ExecGo 的 `TaskGraph` 提交后会立即返回 `202 Accepted`，任务会在后台运行。上层编排层不能假设“提交即完成”，而必须通过轮询拿到最终状态。

