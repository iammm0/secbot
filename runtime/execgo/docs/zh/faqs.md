# FAQ：使用者疑惑导览（中文）

下面把最常见的疑惑按“问题 -> 对应文档”方式导览，避免你在仓库里反复搜索。

## 常见疑惑

1. 我是上层编排层，应该怎么把我的工作流映射成 ExecGo 的 `TaskGraph`？
   - 见：[映射：DAG -> TaskGraph](./orchestrator/mapping-dag-to-taskgraph.md)

2. `depends_on` 到底表达什么？为什么下游不会自动拿到上游结果？
   - 见：[映射：DAG -> TaskGraph](./orchestrator/mapping-dag-to-taskgraph.md)

3. 任务失败后为什么下游会变成 `skipped`？
   - 见：[失败语义：failed vs skipped](./orchestrator/failure-semantics.md)

4. 提交后如何拿到最终结果？是同步还是异步？
   - 见：[轮询与幂等：稳定提交与读取结果](./orchestrator/polling-and-idempotency.md)
   - 以及参考：[`GET /tasks/{id}`](./reference/api.md)

5. 为什么会收到 `400 Bad Request`？`TaskGraph.Validate()` 校验失败是什么意思？
   - 见：[Task DSL 参考（索引）](./reference/task-dsl.md)

6. 如何确定要设置多少 `retry` 和 `timeout`？
   - 见：[任务 DSL 参考（索引）](./reference/task-dsl.md)
   - 失败/重试语义：[`failed vs skipped`](./orchestrator/failure-semantics.md)

7. `result`/`error` 的字段长什么样？我应该怎么解析？
   - 见：[HTTP API 参考（索引）](./reference/api.md)
   - 以及多语言客户端：[`integration` 示例](./integration/client-go.md)

8. 我想把 ExecGo 部署到自己的集群，Docker Compose 怎么做？
   - 见：[Docker Compose 部署示范](./deploy/compose.md)

9. 我想把 ExecGo 部署到 Kubernetes，怎么写 Deployment/Service/PVC？
   - 见：[Kubernetes 部署示范](./deploy/kubernetes.md)

10. Kubernetes 多副本能不能直接设 `replicas > 1`？
   - 见：[Kubernetes 多副本注意事项](./deploy/kubernetes.md)

11. 我想用 Go 调用 ExecGo，怎么写？
   - 见：[Go（HTTP）接入示例](./integration/client-go.md)

12. 我想用 Java 调用 ExecGo，怎么写？
   - 见：[Java（HTTP）接入示例](./integration/client-java.md)

13. 我想用 Python 调用 ExecGo，怎么写？
   - 见：[Python（HTTP）接入示例](./integration/client-python.md)
14. 我想用 Node.js + TypeScript 调用 ExecGo，怎么写？
   - 见：[Node.js + TypeScript（HTTP）接入示例](./integration/client-nodejs-ts.md)

15. shell 执行器是否安全？怎么避免任意命令执行风险？
   - 见：[执行器与参数参考（索引）](./reference/executors.md)
   - 以及更细：[`Shell 执行器参数`](./reference/任务%20DSL%20规范/执行参数规范/Shell%20执行器参数.md)

16. 任务状态存储在哪里？如何持久化/恢复？
   - 见：[数据持久化策略](./reference/系统架构/数据持久化策略.md)

17. 我怎么扩展执行器或实现自定义执行器？
   - 见：[执行器与参数参考（索引）](./reference/executors.md)

18. 我遇到“幂等/重复提交”问题，怎么处理？
   - 见：[轮询与幂等：稳定提交与读取结果](./orchestrator/polling-and-idempotency.md)

如果你希望我把这些 FAQ 再细化到“每条都包含更完整示例”，告诉我你最关心的 3-5 条。

