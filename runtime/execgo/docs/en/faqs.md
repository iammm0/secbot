# FAQ：User Questions Index (English)

This page lists the most common questions and points you to the exact documentation page to read next.

## Common questions

1. I am an orchestration/Agent developer. How do I map my workflow into ExecGo `TaskGraph`?
   - See: [Mapping：DAG -> TaskGraph](./orchestrator/mapping-dag-to-taskgraph.md)

2. What does `depends_on` mean, and why doesn't downstream automatically get upstream outputs?
   - See: [Mapping：DAG -> TaskGraph](./orchestrator/mapping-dag-to-taskgraph.md)

3. Why do downstream tasks become `skipped` after a failure?
   - See: [Failure semantics：failed vs skipped](./orchestrator/failure-semantics.md)

4. How do I get the final result after submitting? Is it synchronous or asynchronous?
   - See: [Polling & idempotency：stable submit & read results](./orchestrator/polling-and-idempotency.md)
   - Also: [`GET /tasks/{id}`](./reference/api.md)

5. Why do I get `400 Bad Request`? What does `TaskGraph.Validate()` mean?
   - See: [Task DSL Reference (Index)](./reference/task-dsl.md)

6. How should I set `retry` and `timeout`?
   - See: [Task DSL Reference (Index)](./reference/task-dsl.md)
   - Failure/retry semantics: [failed vs skipped](./orchestrator/failure-semantics.md)

7. What does `result` / `error` look like? How should I parse it?
   - See: [API Reference (Index)](./reference/api.md)
   - Multi-language clients: [integration examples](./integration/client-go.md)

8. How do I deploy ExecGo with Docker Compose?
   - See: [Docker Compose deploy example](./deploy/compose.md)

9. How do I deploy ExecGo to Kubernetes (Deployment/Service/PVC)?
   - See: [Kubernetes deploy example](./deploy/kubernetes.md)

10. Is it safe to set `replicas > 1` on Kubernetes?
   - See: [Replica safety notes](./deploy/kubernetes.md)

11. How do I call ExecGo from Go?
   - See: [Go (HTTP) integration example](./integration/client-go.md)

12. How do I call ExecGo from Java?
   - See: [Java (HTTP) integration example](./integration/client-java.md)

13. How do I call ExecGo from Python?
   - See: [Python (HTTP) integration example](./integration/client-python.md)
14. How do I call ExecGo from Node.js + TypeScript?
   - See: [Node.js + TypeScript (HTTP) integration example](./integration/client-nodejs-ts.md)

15. Is the `shell` executor safe? How do I avoid arbitrary command execution risks?
   - See: [Executors & Parameters (Index)](./reference/executors.md)
   - More detail: [`Shell 执行器参数`](./reference/任务%20DSL%20规范/执行参数规范/Shell%20执行器参数.md)

16. Where is task state stored? How is persistence/recovery handled?
   - See: [Data persistence strategy](./reference/系统架构/数据持久化策略.md)

17. How do I extend executors or implement a custom executor?
   - See: [Executors & Parameters (Index)](./reference/executors.md)

18. I have idempotency / duplicate submission problems. What should I do?
   - See: [Polling & idempotency](./orchestrator/polling-and-idempotency.md)

