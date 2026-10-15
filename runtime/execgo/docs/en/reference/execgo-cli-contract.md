# execgocli JSON contract

`execgocli` (built from `go build -o execgocli ./cmd/execgocli`) is the **shared adapter CLI** for Claude Code, Codex, and other agents. It only uses the Go standard library and talks to ExecGo’s HTTP API.

## Environment variables

| Name | Default | Purpose |
| --- | --- | --- |
| `EXECGO_URL` | `http://127.0.0.1:8080` | ExecGo control plane base URL |
| `EXECGO_RUNTIME_URL` | `http://127.0.0.1:18080` | `execgo-runtime` base URL for probes / docs (must match the `EXECGO` process if you use `runtime.*` actions locally) |
| `EXECGO_COMPOSE_DIR` | (empty) | Directory containing `docker-compose.yml` for optional `docker compose up -d` in `ensure-running` |
| `EXECGO_RUNTIME_IMAGE` | (empty) | If set, `ensure-running` may try `docker run` to start runtime |
| `EXECGO_RUNTIME_SOURCE` | (empty) | `execgo-runtime` source root (printed in manual hints) |

## Stable envelope (stdout)

Every subcommand writes **one JSON object** to stdout.

### Success

```json
{
  "ok": true,
  "data": { }
}
```

`data` is the payload for the command (object or list). For `capabilities` / `tools` / `act` / `translate` / `submit` / `health`, `data` mirrors the JSON body from the corresponding HTTP response.

### Failure

```json
{
  "ok": false,
  "error": {
    "message": "…",
    "status_code": 400,
    "body": "…"
  }
}
```

## Subcommands and HTTP mapping

| Subcommand | Method | Path | Notes |
| --- | --- | --- | --- |
| `capabilities` | GET | `/adapters/capabilities` | `adapter.v1` contract |
| `tools` | GET | `/adapters/tools` | Tool manifest for agent tools/skills |
| `act` | POST | `/adapters/actions` | JSON from `-file` or stdin; returns `agent.v1` translation + `task_ids` |
| `translate` | POST | `/adapters/translate` | Translate only, no execution |
| `submit` | POST | `/tasks` | Mode B: direct `TaskGraph` |
| `wait` | GET | `/tasks/{id}` (poll) | See below |
| `cancel` | POST | `/tasks/{id}/cancel` | Requests cancellation; `--wait` polls until terminal |
| `health` | GET | `/health` | Liveness |
| `ensure-running` | (local) | n/a | Probes; optional `docker compose` for ExecGo, optional `docker run` for runtime |

## `wait` `data` shape

```json
{
  "tasks": [ { "id": "…", "status": "success", "…": "…" } ],
  "all_terminal": true,
  "deadline_rfc3339": "2026-04-27T12:00:00Z"
}
```

`all_terminal` is true when every task status is one of: `success`, `failed`, `cancelled`, `skipped`.

## `cancel` `data` shape

Without `--wait`, `cancel` returns the immediate `POST /tasks/{id}/cancel` responses. A running task enters `cancelling` first, then reaches terminal `cancelled` after the executor or runtime handle finishes shutting down.

```json
{
  "tasks": [
    {
      "task_id": "a1",
      "status": "cancelling",
      "runtime": { "status": "cancelling", "error": { "code": "cancelled" } },
      "event": { "type": "task_cancel_requested", "task_id": "a1" }
    }
  ]
}
```

With `--wait`, `data.wait` contains the same shape as the `wait` command and `data.all_terminal` mirrors `data.wait.all_terminal`.

Use `cancel` for execution control. `DELETE /tasks/{id}` is state cleanup and does not guarantee process/runtime termination. Runtime-backed tasks map ExecGo cancel to the executor handle cancel path, which calls `execgo-runtime` `POST /api/v1/tasks/{ref}/kill`.

**Exit codes:** `0` success; `1` I/O or HTTP error; `2` usage; `3` `wait` timeout without all terminal; `4` `ensure-running` ExecGo unreachable; `5` `ensure-running` with `--with-runtime` but runtime unreachable.

## `ensure-running` `data` shape (summary)

```json
{
  "execgo": {
    "url": "http://127.0.0.1:8080",
    "reachable": true,
    "started_by": "already-up",
    "health_status_code": 200
  },
  "runtime": {
    "url": "http://127.0.0.1:18080",
    "reachable": true,
    "started_by": "already-up",
    "ready_status_code": 200
  },
  "manual_hints": []
}
```

Runtime probe uses `GET {EXECGO_RUNTIME_URL}/readyz` (same readiness as the ExecGo `runtime` executor).

## Server-side contracts (unchanged)

- Adapter schema: `adapter.v1` (see `pkg/adapter/adapter.go`).
- `POST /adapters/actions` request: `AgentActionRequest`; response: `AgentActionResponse` with `translation_trace` for audit.

## Related

- [Mature agent adapter](../integration/agent-adapter.md)
- [Mode A quick start (CLI)](../integration/mode-a-cli.md)
- [Mode B upgrade path](../integration/mode-b-upgrade.md)
- [Promotion security defaults](promotion-security.md)
