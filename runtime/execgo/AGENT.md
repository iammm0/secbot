# AGENT.md

This file is for coding agents working in this repository. Read it before making code changes.

## Project Summary

`execgo` is an agent-first execution kernel and action harness.

Core responsibilities:

- Accept task DAGs over HTTP, and optionally gRPC when built with the `grpc` build tag.
- Validate and schedule tasks with dependency ordering, retries, timeouts, and bounded concurrency.
- Execute tasks through the V2 executor model: category + tool.
- Persist task state to disk through the default JSON file store.
- Provide an optional “mature agent adapter” layer that translates structured actions into TaskGraph submissions (`/adapters/*`).

The repository is not just a demo. The main execution path is real and tested.

Design bias:

- Build for AI agent workloads first.
- Keep the core runtime disciplined and modular.
- Do not drift into a generic workflow engine unless the user explicitly wants that tradeoff.

## Repo Conventions (Docs & Tests)

- GitHub renders `README.md` by default, so this repo keeps:
  - `README.md` (English)
  - `README.zh-CN.md` (Chinese)
- All test code should live under `tests/` (blackbox style), not under `pkg/*`.

## Current Architecture

Important directories:

- `cmd/execgo`: binary entrypoint, runtime wiring, graceful shutdown, optional gRPC startup.
- `cmd/execgocli`: stdlib-only helper for `GET/POST /adapters/*`, `POST /tasks`, and task polling (`internal/execgocli`).
- `.skill/`: repo-local SOP for Codex / Claude Code / agents (start at `.skill/README.md`); optional Cursor pointer at `.cursor/skills/execgocli-adapter/SKILL.md`.
- `pkg/models`: core task and API response models.
- `pkg/httpserver`: HTTP routing and handlers.
- `pkg/scheduler`: DAG scheduling, retries, timeout handling, dependency propagation.
- `pkg/executor`: executor registry and built-in executors.
- `pkg/store`: storage interfaces.
- `pkg/store/jsonfile`: default persistent store implementation.
- `pkg/observability`: structured logging, trace ID middleware, metrics counters.
- `tests/unit`: small isolated blackbox tests (import public packages, use `package unit_test`).
- `tests/module`: scheduler-level behavioral tests.
- `tests/integration`: HTTP and MCP flow tests.
- `contrib/*`: optional modules such as gRPC API server, SQLite store, Redis cache wrapper.

## Execution Model

The executor system is in the V2 category-tool shape.

Built-in categories:

- `os`
- `mcp`
- `cli-skills`
- `runtime` (delegates to the external `execgo-runtime` project via HTTP)

Implementation layout note:

- In `pkg/executor/`, keep one file per built-in category:
  - `os.go`
  - `mcp.go`
  - `cli.go`
  - `runtime.go`

Built-in `os` tools currently include:

- `shell`
- `file`
- `dns`
- `tcp`
- `sleep`
- `noop`
- `http`

Compatibility note:

- Legacy task types like `shell` and `http` are normalized into the `os` category by `pkg/executor/normalize_task.go`.
- Do not remove that compatibility path unless the whole API contract is intentionally being changed.

## What To Read First

Before changing behavior, read these files first:

- `README.md`
- `README.zh-CN.md`
- `cmd/execgo/main.go`
- `pkg/models/task.go`
- `pkg/httpserver/engine.go`
- `pkg/scheduler/scheduler.go`
- `pkg/executor/core.go`
- `pkg/executor/normalize_task.go`

If touching tests or runtime wiring, also read:

- `tests/testutil/runtime.go`

If touching gRPC, also read:

- `cmd/execgo/grpc_start.go`
- `cmd/execgo/grpc_start_stub.go`
- `contrib/grpcapi/pkg/grpcserver/server.go`

If touching the mature agent adapter, also read:

- `pkg/adapter/adapter.go`
- `docs/zh/integration/agent-adapter.md`
- `docs/en/integration/agent-adapter.md`

If touching runtime integration, also read:

- `docs/en/overview/execgo-and-runtime.md`
- `docs/zh/overview/execgo-and-runtime.md`

## Development Rules

- Preserve the core module's lightweight design. Avoid adding unnecessary third-party dependencies to the root module.
- Keep optional integrations isolated under `contrib/*` when they are not essential to the core execution kernel.
- Prefer extending existing abstractions over bypassing them.
- When changing task execution behavior, keep `HTTP -> scheduler -> executor -> store` flow coherent.
- If you change task fields or API contracts, update tests and relevant docs in `README.md` and `docs/`.
- Do not silently break legacy task type compatibility.
- Do not revert unrelated user changes in the worktree.

## Testing Expectations

Run the full suite after meaningful changes:

```bash
go test ./...
```

In sandboxed environments, Go's default build cache may be blocked. Use local cache directories when needed:

```bash
mkdir -p .cache/go-build .cache/gomod
GOCACHE=$(pwd)/.cache/go-build GOMODCACHE=$(pwd)/.cache/gomod go test ./...
```

Notes:

- `tests/integration` starts a local HTTP test server and may need permission in restricted sandboxes.
- Scheduler or executor changes should be verified beyond unit tests. Run module and integration tests if behavior changes.

## gRPC Notes

- gRPC startup is optional and guarded by build tags.
- The normal build path uses `cmd/execgo/grpc_start_stub.go`.
- Do not assume gRPC is always enabled in the default binary.

## Persistence Notes

- The default runtime store is `pkg/store/jsonfile`.
- It periodically persists to `state.json` under the configured data directory.
- On recovery, tasks left in `running` are reset to `pending`.

Any change to persistence semantics should be treated as a compatibility-sensitive change.

## Common Safe Workflows

For HTTP API changes:

1. Update handlers in `pkg/httpserver`.
2. Check model compatibility in `pkg/models`.
3. Verify scheduler/store interaction.
4. Add or update integration tests.

For scheduler changes:

1. Read current dependency and retry behavior in `pkg/scheduler/scheduler.go`.
2. Preserve skip propagation semantics for downstream tasks.
3. Add or update module tests in `tests/module`.
4. Re-run full tests.

For executor changes:

1. Update the registry or built-ins in `pkg/executor`.
2. Preserve normalization behavior unless intentionally changing contracts.
3. Add focused unit tests and at least one higher-level behavioral test if externally visible.

## Worktree Hygiene

This repository may contain local-only directories and generated artifacts during development, for example:

- `.idea/`
- `.cache/`
- local state files under `data/`

Do not include incidental local artifacts in commits unless the user explicitly asks for that.

Before committing, inspect `git status` and stage only the files relevant to the current task.

## Commit Guidance

- Use short conventional-style commit messages when possible.
- Keep commits scoped to one behavioral change or one fix.
- If a change affects public behavior, mention the affected subsystem in the commit prefix, such as `fix(scheduler): ...` or `feat(executor): ...`.

## When Unsure

- Prefer a small, localized fix over a broad refactor.
- Prefer preserving existing behavior over speculative cleanup.
- If behavior is ambiguous, check tests first, then README and docs, then adjust code.
