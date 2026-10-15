# Reliable Execution Layer for General-Purpose Agents

ExecGo now has two supported HTTP integration paths:

- Low-level path: submit a complete `TaskGraph` to `POST /tasks`.
- Mature-agent path: discover tools with `GET /adapters/tools`, then submit structured actions to `POST /adapters/actions`.

The adapter path is intended for general-purpose or mature agents such as Claude Code, Codex, Hermes Agent, and OpenClaw. It does not parse natural language or private agent protocols. It accepts explicit JSON actions and translates them into the same Task DSL used by the rest of ExecGo.

The recommended boundary is simple: the agent owns context understanding, planning, and tool selection; ExecGo owns pre-execution validation, dependency scheduling, retry/timeout/cancel semantics, state persistence, and auditability. This turns temporary shell commands, file actions, runtime jobs, or MCP/CLI calls into traceable engineering tasks.

**Shared CLI:** build `execgocli` from `cmd/execgocli` for the same HTTP flow with a stable JSON envelope — see [Mode A (CLI quick start)](mode-a-cli.md) and the [execgocli JSON contract](../reference/execgo-cli-contract.md). For a **Mode B** path (`translate` + `POST /tasks`), see [Mode B upgrade](mode-b-upgrade.md).

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/adapters/capabilities` | Return adapter schema version, supported profiles, and action kinds. |
| `GET` | `/adapters/tools` | Return an agent-friendly manifest of ExecGo tools and action kinds. |
| `POST` | `/adapters/translate` | Translate an action into a TaskGraph without submitting it. |
| `POST` | `/adapters/actions` | Translate and submit an action through the normal scheduler/executor/store path. |

`POST /tasks` remains the direct Task DSL path and is unchanged.

## Supported Action Kinds

- OS tools: `os.shell`, `os.file`, `os.http`, `os.dns`, `os.tcp`, `os.sleep`, `os.noop`
- Runtime tools: `runtime.command`, `runtime.script`
- Extension tools: `mcp.call`, `cli.run`
- Pass-through: `task_graph.submit`

Common aliases are accepted:

- `shell`, `bash`, `terminal.command` -> `os.shell`
- `file.read`, `file.write` -> `os.file`
- `http.request` -> `os.http`
- `command` -> `runtime.command`
- `script` -> `runtime.script`

## Minimal OS Action

```bash
curl -X POST http://localhost:8080/adapters/actions \
  -H "Content-Type: application/json" \
  -d '{
    "adapter": "codex",
    "agent_id": "agent-1",
    "action_id": "hello-adapter",
    "action": {
      "kind": "os.noop",
      "input": {
        "message": "hello adapter"
      }
    }
  }'
```

The response includes `accepted`, `task_ids`, the translated `task_graph`, and `translation_trace`. Poll the task through the standard API:

```bash
curl http://localhost:8080/tasks/hello-adapter
```

## Runtime Command Action

Use `runtime.command` or `runtime.script` when the agent needs ExecGo runtime scheduling, process allocation, sandbox policy, and resource limits.

```bash
curl -X POST http://localhost:8080/adapters/actions \
  -H "Content-Type: application/json" \
  -d '{
    "adapter": "codex",
    "agent_id": "agent-1",
    "session_id": "session-1",
    "action_id": "build-test",
    "action": {
      "kind": "runtime.command",
      "input": {
        "program": "go",
        "args": ["test", "./..."],
        "limits": {
          "wall_time_ms": 300000,
          "memory_bytes": 1073741824,
          "pids_max": 128
        },
        "sandbox": {
          "profile": "process"
        },
        "control_context": {
          "tenant": "default",
          "owner": "agent-1",
          "requires_resource_reservation": true
        }
      },
      "timeout": 300000,
      "retry": 1
    }
  }'
```

The adapter turns this into a `type=runtime` task. The runtime executor then submits the payload to `execgo-runtime` using its existing `/api/v1/tasks` contract.

## Translate Without Submit

Use `/adapters/translate` to inspect the companion-kernel translation before running anything:

```bash
curl -X POST http://localhost:8080/adapters/translate \
  -H "Content-Type: application/json" \
  -d '{
    "adapter": "claudecode",
    "action_id": "list-files",
    "action": {
      "kind": "shell",
      "input": {
        "command": "ls",
        "args": ["-la"]
      }
    }
  }'
```

This endpoint returns a TaskGraph but does not create task state. Submit the same payload to `/adapters/actions` when the agent is ready to execute.
