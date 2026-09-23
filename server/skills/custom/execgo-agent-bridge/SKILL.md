---
name: execgo-agent-bridge
description: |
  Route shell, runtime.command, runtime.script, mcp.call, cli.run, or task_graph.submit work through Secbot's ExecGo-backed control tools.
version: "1.0.0"
author: "Secbot"
tags: ["execgo", "runtime", "orchestration", "control"]
triggers: ["execgo", "execgo-runtime", "runtime.command", "task_graph"]
prerequisites: ["server tool execgo_action enabled", "ExecGo reachable when runtime actions are needed"]
---

# Overview

Use this skill when work should run through ExecGo instead of ad-hoc local execution. In this repository, the primary bridge is the `execgo_action` tool, and `execute_command` can also route through ExecGo when `execgo=true` or `SECBOT_EXECGO_ENABLED=1` is active.

## When To Use

- You need reliable task IDs, wait semantics, cancellation, timeout control, or runtime-backed execution.
- You want to submit `runtime.command`, `runtime.script`, `mcp.call`, `cli.run`, or `task_graph.submit` actions.
- You need a structured smoke test before attempting a side-effecting ExecGo action.

## Rules

- Prefer `execgo_action` over hand-written HTTP calls.
- Use `mode=health` or `mode=tools` first if ExecGo availability is unknown.
- Use a stable `action_id` when subsequent waits or logs need correlation.
- Start with `kind=os.noop` for connectivity checks before side-effecting actions.
- For plain shell execution, prefer `execute_command`; only force ExecGo when the job benefits from ExecGo task handling.

## Tool Mapping In This Repo

- `execgo_action`:
  - `mode=health` checks ExecGo health.
  - `mode=tools` lists adapter capabilities.
  - default `mode=act` submits an action and waits by default.
- `execute_command`:
  - pass `execgo=true` to route command execution through ExecGo `runtime.command`.
  - does not currently support `cwd` or `stdin_data` in ExecGo mode.

## Recommended Flow

1. Call `execgo_action` with `{"mode":"health"}`.
2. Call `execgo_action` with `{"mode":"tools"}` if you need capability discovery.
3. Submit `os.noop` for a smoke test.
4. Submit the real action with a stable `action_id` and structured `input`.
5. If the action is a simple shell command and fits the local bridge, use `execute_command` with `execgo=true` instead of building the JSON manually.

## Examples

Smoke test via `execgo_action`:

```json
{
  "kind": "os.noop",
  "action_id": "smoke-noop-1",
  "input": {
    "message": "hello execgo"
  }
}
```

Runtime command via `execgo_action`:

```json
{
  "kind": "runtime.command",
  "action_id": "runtime-echo-1",
  "input": {
    "program": "/bin/sh",
    "args": ["-c", "echo hello execgo-runtime"],
    "limits": {
      "wall_time_ms": 30000
    }
  }
}
```

Shell command via `execute_command`:

```json
{
  "command": "uname -a",
  "timeout": 30,
  "execgo": true
}
```

## Environment Notes

- `EXECGO_URL` defaults to `http://127.0.0.1:8080`.
- `EXECGO_RUNTIME_URL` defaults to `http://127.0.0.1:18080`.
- `EXECGO_EXECGOCLI` can point to a non-default `execgocli` binary.
- `SECBOT_EXECGO_ENABLED=1` makes `execute_command` prefer ExecGo by default.

## References

- `references/action-contract.md` for the action envelope and kinds.
- `references/runtime-operations.md` for runtime startup and readiness expectations.
- `references/agent-specific-notes.md` for notes about fitting the upstream skill into Secbot.
- `references/troubleshooting.md` for common failures.
