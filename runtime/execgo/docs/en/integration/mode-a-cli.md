# Mode A quick start: `execgocli`

**Mode A** = discover tools via `GET /adapters/tools`, submit actions via `POST /adapters/actions`, poll `GET /tasks/{id}`. The `execgocli` command wraps the same flow with a stable JSON envelope on stdout.

## 1) Build and run ExecGo

```bash
go build -o execgo ./cmd/execgo
./execgo
```

By default the HTTP server listens on `:8080` (see `EXECGO_ADDR`).

## 2) Build `execgocli`

```bash
go build -o execgocli ./cmd/execgocli
export EXECGO_URL=http://127.0.0.1:8080
```

## 3) List tools (manifest)

```bash
./execgocli tools
```

## 4) Run an action and capture task id

```bash
./execgocli act <<'EOF'
{
  "adapter": "codex",
  "agent_id": "agent-1",
  "action_id": "demo-1",
  "action": { "kind": "os.noop", "input": {} }
}
EOF
```

Read `data.task_ids[0]`.

## 5) Wait for terminal state

```bash
./execgocli wait -task-ids demo-1 -timeout 2m
```

## 6) Optional: `ensure-running`

If you keep a `docker-compose.yml` in an ExecGo checkout:

```bash
export EXECGO_COMPOSE_DIR=/path/to/execgo
./execgocli ensure-running
```

To also check **execgo-runtime** (readiness at `{EXECGO_RUNTIME_URL}/readyz`):

```bash
export EXECGO_RUNTIME_URL=http://127.0.0.1:18080
# Start ExecGo with the same URL in EXECGO_RUNTIME_URL when using runtime actions.
./execgocli ensure-running -with-runtime
```

If you set `EXECGO_RUNTIME_IMAGE` to a pre-built tag, `ensure-running` may try `docker run` for a one-box demo. For production, use your normal deploy path.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| `ok: false` on `act` | Body in `error.body`; often validation (`action.kind`, `action_id` missing, etc.) |
| `wait` exit `3` | Task still `pending`/`running` after timeout; increase `-timeout` or check scheduler load |
| Runtime tasks hang | `EXECGO_RUNTIME_URL` on ExecGo must match a live runtime; `curl $EXECGO_RUNTIME_URL/readyz` |
| `ensure-running` still fails | Install Docker/Compose, or start ExecGo manually; read `manual_hints` in JSON output |

## Contract

- [execgocli JSON contract](../reference/execgo-cli-contract.md)

## Related

- [Mature agent adapter](agent-adapter.md)
- [Mode B upgrade](mode-b-upgrade.md)
