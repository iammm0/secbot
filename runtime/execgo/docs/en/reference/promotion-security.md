# Promotion-period security defaults

During adoption of **Mode A** (`/adapters/actions` via `execgocli` or HTTP), apply the following defaults before opening agents to production data.

## Shell and OS tools

- **`os.shell`** should run with ExecGo’s **allowlist** enabled (default posture). Only use `EXECGO_SHELL_POLICY=open` (or equivalent) on trusted dev machines and **never** ship it as a silent default in shared environments.
- Prefer narrow commands and explicit working directories; treat agent-provided command strings as untrusted input.
- For path-sensitive OS file work, keep agents scoped to a designated workspace; add additional path sandbox rules in your org policy as needed.

## Audit and attribution

- Every `POST /adapters/*` request should populate `agent_id`, `session_id`, `action_id`, and `metadata` when available.
- The adapter populates `annotations` and `translation_trace` so you can correlate agent actions with scheduler outcomes and store records.

## Stronger isolation: runtime executor

- When you need **process isolation, cgroup-style limits, or stricter data-plane semantics**, use **`runtime.command` / `runtime.script`**, which route through the built-in `runtime` executor to **execgo-runtime**.
- Set `EXECGO_RUNTIME_URL` on the ExecGo process to point at a reachable `execgo-runtime` instance. Use `GET /readyz` on the runtime to verify readiness.
- `execgocli ensure-running --with-runtime` is optional; production clusters should use your normal orchestration (systemd, Kubernetes, Compose) and monitoring instead of ad-hoc `docker run`.

## What `execgocli` does *not* do

- It does not bypass ExecGo’s validation or your shell policy.
- It does not grant network access by itself; network behavior follows task types and your environment.

## Related

- [Shell executor / OS](../reference/executors.md)
- [ExecGo and execgo-runtime](../overview/execgo-and-runtime.md)
- [execgocli contract](execgo-cli-contract.md)
