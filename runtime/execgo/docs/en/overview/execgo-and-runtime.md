# ExecGo and execgo-runtime

This page clarifies a common question: **what is the relationship between ExecGo and `execgo-runtime`? Do you need to deploy both?**

## TL;DR

- **ExecGo (this repository)** is the **reliable execution layer / control plane** for general-purpose agent actions: it accepts structured actions or `TaskGraph`, schedules DAG execution, manages state, cancellation, and observability.
- **execgo-runtime (separate repository)** is the **data plane / execution runtime**: it runs tasks as child processes with resource/sandbox policy (stronger on Linux), and persists execution artifacts and results.

They integrate via ExecGo’s **`runtime` executor** over HTTP: ExecGo submits `type=runtime` tasks to `execgo-runtime`, then polls/cancels them through the runtime API.

The target adoption path is mature agents such as Claude Code, Codex, Hermes Agent, and OpenClaw: the agent keeps deciding what to do, while ExecGo and runtime make the real execution validated, cancellable, auditable, and recoverable.

## Responsibilities

### ExecGo (control plane)

- **Contract**: `TaskGraph` / `Task` (Task DSL)
- **What it does**:
  - DAG scheduling (dependencies, concurrency, failure semantics)
  - Unified `retry/timeout` semantics and task state lifecycle
  - Unified state store (in-memory + jsonfile; optional `contrib/sqlite`, `contrib/rediscache`)
  - Unified observability (slog/traceID/metrics)
  - Multiple executors: `os` / `mcp` / `cli-skills` / `runtime` (extensible)

### execgo-runtime (data plane)

- **Contract**: runtime task submit/query/wait/kill (see runtime docs for exact API)
- **What it does**:
  - Executes real processes (internal shim / child processes)
  - Applies resource & sandbox policy (Linux-only sandbox/cgroup capabilities)
  - Persists artifacts (task directories, stdout/stderr, request/result)

## When you need execgo-runtime

Typical reasons to deploy `execgo-runtime`:

- You want a clear separation between orchestration and execution.
- You need stronger runtime-side resource isolation / sandbox policy.
- You want durable, replayable execution artifacts (stdout/stderr, task directories).

Typical reasons you **don’t** need it:

- You only use ExecGo `os/*`, `mcp/*`, or `cli-skills/*` on the same host.
- You’re in a local dev/demo setup and want minimal moving parts.

## Call path (Agent → ExecGo → runtime)

1. The agent submits a `TaskGraph` (or a structured action via `/adapters/actions`)
2. ExecGo schedules tasks
3. For `type=runtime` tasks:
   - ExecGo’s `runtime` executor uses `EXECGO_RUNTIME_URL`
   - Submits to `execgo-runtime` (commonly `/api/v1/tasks`)
   - Poll/kill also go through the runtime HTTP API
4. ExecGo normalizes runtime results into `Task.result` / `Task.runtime` and emits metrics

## Important boundaries

- **Optional dependency**: ExecGo runs standalone; `execgo-runtime` is only required when you submit `type=runtime` tasks (or use `runtime.command/runtime.script` via the adapter).
- **API compatibility**: the runtime executor depends on the runtime HTTP contract; verify `/api/v1/tasks` compatibility when upgrading either side.
- **Platform differences**: stronger sandbox/cgroup capabilities are Linux-only.
