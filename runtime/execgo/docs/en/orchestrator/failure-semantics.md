# Failure semantics：failed vs skipped

ExecGo scheduler retries and failure propagation follow deterministic rules.
Your orchestration layer should interpret:

- After a task ends in `failed`, all its downstream tasks are marked `skipped`
- `skipped` cascades to all deeper downstream tasks (dependency-failure cascade)
- `retry` applies only to the task itself (it doesn't change the dependency graph)

## 1) Retries & timeouts (per attempt)

- `task.retry` means retry count after failures
- actual attempts = `task.retry + 1` (the first run counts)
- every attempt creates its own execution context; if `task.timeout > 0`, it is enforced per attempt

## 2) Why downstream becomes skipped

When a task fails after all retries:

- scheduler sets the task state to `failed`
- it then marks all direct children as `skipped`
- `skipped` further cascades through the graph

So you should distinguish:

- `failed`: the node's execution ultimately failed
- `skipped`: downstream tasks were not executed because upstream failed

## 3) Recommended polling interpretation

When you poll a task state:

- `success`: proceed (but remember you still need orchestrator-level artifact/params handling)
- `failed`: usually stop / switch branch per your business policy
- `skipped`: the root cause is upstream; debug upstream failures rather than the skipped node itself

## 4) Handling `Task.result` / `Task.error`

ExecGo writes:

- `Task.result` on success (raw JSON)
- `Task.error` on failure (string)

Your orchestration layer typically:

- parses `result` for success tasks
- records `error` for observability and alerting

