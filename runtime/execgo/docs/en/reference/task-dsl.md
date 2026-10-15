# Task DSL Reference (Index)

ExecGo's core contract between an orchestration layer (AI agent) and the execution runtime is:

- `TaskGraph` (a DAG submission)
- `Task` (a single executable node)

The runtime validates your submission. If validation fails, it rejects the whole graph.

## Full details (Chinese)

- [`任务 DSL 规范` (Chinese full text)](../../zh/reference/任务%20DSL%20规范/任务%20DSL%20规范.md)
- [`任务模型定义`](../../zh/reference/任务%20DSL%20规范/任务模型定义.md)
- [`任务图验证机制`](../../zh/reference/任务%20DSL%20规范/任务图验证机制.md)

## Task fields (what you must provide)

Each task object includes:

- `id` (string, required): unique within the graph
- `type` (string, required): selects an executor
- `params` (object, optional): executor-specific parameters
- `depends_on` (string array, optional): upstream task IDs
- `retry` (int, optional): retry count for failures (`attempts = retry + 1`)
- `timeout` (int64, optional): per-attempt timeout in milliseconds (`<= 0` means no timeout)

## Validation rules (high level)

- The graph must not be empty.
- `id` must be non-empty and unique.
- `type` must be non-empty (and must match a registered executor).
- `depends_on` must reference existing task IDs, and a task cannot depend on itself.
- The graph must be a DAG (no cycles).

## Practical mapping hint

If your orchestrator has its own node/edge schema, translate each node into an ExecGo `Task`, and each edge into `depends_on`. Then ensure your graph stays acyclic before submission.

