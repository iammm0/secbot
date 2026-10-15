# Polling & idempotency：stable submit & read results

ExecGo runs tasks asynchronously. After submitting a `TaskGraph`, you must poll task states and interpret final outcomes.
For reliability, implement submission retry safety (“idempotency”) and a polling strategy.

## 1) Asynchronous behavior

After `POST /tasks`:

- the API returns `202 Accepted` immediately with `task_ids`
- tasks are executed in the background (DAG scheduling + concurrency)
- you must poll `GET /tasks/{id}` until each task reaches a terminal state:
  - `success`: `result` is available
  - `failed`: `error` is available
  - `cancelled`: the task was intentionally stopped
  - `skipped`: usually means upstream dependency failure or cancellation prevented execution

## 2) Idempotency key point: task.id controls overwrite behavior

ExecGo persists task state in its store (default `pkg/store/jsonfile`).
In the default implementation:

- `Put(task)` overwrites an existing task with the same `task.ID`

So if you retry `POST /tasks` with the same `task.id` due to network timeouts, those tasks may be reset and re-executed.

Recommended strategies:

- Option A：Reuse the same task ids for the same workflow run
  - before resubmitting, call `GET /tasks/{id}` and decide based on current state
  - if a task is already terminal (`success/failed/cancelled/skipped`), do not resubmit
  - if a task exists but is still `pending/running/cancelling`, do not resubmit; just keep polling
- Option B：Generate new task ids for re-execution attempts
  - include `workflowRunId/attemptId` into `task.id`

## 3) Recommended polling algorithm (per task)

1. Submit `POST /tasks`, obtain `task_ids`
2. For each `task_id`:
   - poll `GET /tasks/{id}` with exponential backoff
   - stop when state becomes `success/failed/cancelled/skipped`
3. Drive your business workflow using those final states

Backoff example:

- start interval: `500ms`
- max interval: `5s`
- multiply interval by `1.5~2` until reaching the max

## 4) DELETE vs running tasks

`DELETE /tasks/{id}` removes the task record from the state store, but it is not a guaranteed “cancel execution”.

So treat DELETE as “state cleanup”, not as a strict cancel mechanism.

Use `POST /tasks/{id}/cancel` to stop execution. The control-plane state transition is:

```text
running -> cancelling -> cancelled
```

For runtime-backed tasks, ExecGo calls the executor handle cancel path, which maps to `execgo-runtime` `POST /api/v1/tasks/{ref}/kill`. For local cancellable executors, the scheduler cancels the task context.

## 5) Dynamic params：when downstream depends on upstream outputs

Since ExecGo doesn't do automatic variable substitution into downstream `params`, you must:

- submit upstream and poll until completion
- then submit downstream again with the resolved values injected by your orchestrator

This makes your end-to-end workflow multi-phase.
