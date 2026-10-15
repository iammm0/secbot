# Mapping：DAG -> TaskGraph

This page explains how an orchestration layer should map its own workflow nodes/edges into ExecGo's runtime-expected `TaskGraph`.

> Key takeaway: ExecGo doesn't care about your internal workflow model; it only cares that the submitted `TaskGraph` passes validation, and that each task's `type/params` can be handled by a registered executor.

## 1) Workflow nodes (node) -> `Task`

For each executable node in your workflow (HTTP fetch, shell command, file operation, DNS query, TCP probe, etc.), create one ExecGo `Task`:

- `task.id`: must be unique within the graph
- `task.type`: map your node kind to an executor type (`http/shell/file/sleep/dns/tcp/noop`)
- `task.params`: generate an executor-specific JSON object
- `task.depends_on`: derived from workflow incoming edges (see next section)
- `task.retry` / `task.timeout`: derived from your node-level retry/timeout strategy

## 2) Workflow edges (edge) -> `depends_on`

For an edge `A -> B` in your workflow, map it as:

- `B.depends_on: ["A"]`

> Note: ExecGo uses `depends_on` only for execution order/concurrency. It does not automatically inject `A`'s result into `B.params`.

## 3) Dynamic parameters & “artifact passing”

ExecGo stores execution outputs into `Task.result` (or `Task.error` on failure), but it does not provide variable substitution to downstream `params`.

So you typically choose one of these strategies:

- Pre-staticization: if params can be fully determined before submission (fixed URL, command, file path), submit the whole DAG once.
- Multi-phase submission: if downstream params depend on upstream outputs, wait for upstream tasks to reach a terminal state, then submit the next DAG again with the resolved params injected by your orchestrator.

The failure/polling pages describe the multi-phase pattern in practice.

## 4) A complete example (3 tasks)

Workflow:

- `fetch-data`: HTTP fetch
- `save-result`: write data to a file
- `verify`: read the file and verify it

Possible ExecGo `TaskGraph`:

```json
{
  "tasks": [
    {
      "id": "fetch-data",
      "type": "http",
      "params": { "url": "https://httpbin.org/json", "method": "GET" },
      "retry": 1,
      "timeout": 10000
    },
    {
      "id": "save-result",
      "type": "file",
      "params": { "action": "write", "path": "output.txt", "content": "fetched!" },
      "depends_on": ["fetch-data"],
      "retry": 0,
      "timeout": 5000
    },
    {
      "id": "verify",
      "type": "file",
      "params": { "action": "read", "path": "output.txt" },
      "depends_on": ["save-result"],
      "retry": 2,
      "timeout": 5000
    }
  ]
}
```

> Reminder: in this example, `save-result.params.content` is static. In production, you must perform multi-phase submission if you want to write the real HTTP response.

## 5) Pre-submission validation checklist (recommended)

To reduce `400` rejections, validate before submit:

- task `id` uniqueness and non-empty values
- `type` maps to a registered executor
- `depends_on` references only task ids inside the same graph (and no self-dependency)
- the graph is acyclic (DAG)

