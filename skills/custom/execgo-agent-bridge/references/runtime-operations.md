# Runtime Operations

ExecGo is the control plane. `execgo-runtime` is the optional execution plane for process-backed actions.

## Local Defaults

- `EXECGO_URL=http://127.0.0.1:8080`
- `EXECGO_RUNTIME_URL=http://127.0.0.1:18080`

## In This Repo

- `execgo_action` health checks use the local `ExecGoClient`.
- `execute_command` can submit `runtime.command` requests through the same client.
- The client binary path defaults to `execgocli` and can be overridden with `EXECGO_EXECGOCLI`.

## Readiness Sequence

1. Ensure ExecGo control plane is reachable.
2. If runtime-backed actions are needed, ensure `execgo-runtime` is reachable.
3. Confirm the ExecGo process sees the same `EXECGO_RUNTIME_URL` as the caller.
4. Run an `os.noop` smoke test before the first side-effecting runtime action.

## When To Choose Runtime Actions

Prefer `runtime.command` or `runtime.script` when you need:

- explicit process lifecycle control
- better timeout and cancellation semantics
- task IDs that survive beyond a single shell command
- runtime-managed auditing or artifact handling

Use plain `execute_command` without ExecGo when none of those benefits matter.
