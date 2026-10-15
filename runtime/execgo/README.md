# ExecGo — Agent Action Harness

> An agent-first execution kernel and action harness (control plane)

[![Go](https://img.shields.io/badge/Go-1.22+-00ADD8?logo=go)](https://go.dev)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Core deps](https://img.shields.io/badge/Core%20module-stdlib%20only-blue.svg)]()

中文 README：[`README.zh-CN.md`](README.zh-CN.md)

---

## Overview

**ExecGo**’s core module (`github.com/iammm0/execgo`) uses only the Go standard library. Optional features (SQLite persistence, Redis read-through cache) live in separate `contrib/*` submodules so consumers can opt in without pulling drivers they do not need.

**Positioning**

ExecGo is best understood as a reliable execution layer for general-purpose and mature agents, not as another full agent framework or a generic workflow engine. Agents such as Claude Code, Codex, Hermes Agent, and OpenClaw can keep their own planning loop, context handling, and tool-selection UX while ExecGo turns the chosen actions into validated, cancellable, observable, and recoverable tasks.

In practice, ExecGo sits between an agent and the real world:

- the agent decides what should happen;
- ExecGo validates the action contract, schedules dependencies, applies retry/timeout/cancel semantics, and stores state;
- optional `execgo-runtime` runs process-heavy work behind a dedicated data-plane runtime with artifacts and resource policy.

## Key Features

| Feature | Description |
|---|---|
| **Task DSL** | Strict task contract: id, type, params, depends_on, retry, timeout |
| **DAG scheduling** | Dependency graph orchestration with Kahn cycle detection |
| **Concurrent execution** | goroutines + channels with a concurrency semaphore |
| **Pluggable executors (V2)** | Built-in `os` / `mcp` / `cli-skills` / `runtime` executors |
| **Retry & timeout** | Exponential backoff retries + context timeouts |
| **State persistence** | In-memory + JSON file persistence; optional SQLite/Redis (contrib) |
| **Observability** | Structured slog logs + traceID + `/metrics` |
| **Graceful shutdown** | Signal → HTTP shutdown → scheduler stop → state flush |

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    AI Agent (client)                 │
│              POST /tasks  ←→  GET /tasks/{id}       │
└─────────────────────┬───────────────────────────────┘
                      │ HTTP/JSON
┌─────────────────────▼───────────────────────────────┐
│                   API Layer (net/http)               │
│  POST /tasks │ GET /tasks/{id} │ DELETE │ /health   │
├─────────────────────┬───────────────────────────────┤
│               Scheduler (DAG)                       │
│  readyQueue(chan) │ semaphore │ dependency counter   │
├──────────┬──────────┬──────────┬────────────────────┤
│ OS       │ MCP      │ CLI+Skill│ ... (extensible)   │
│ Category │ Category │ Category │                    │
├──────────┴──────────┴──────────┴────────────────────┤
│ Optional: Runtime Executor (HTTP)                   │
│  submit/poll/cancel → execgo-runtime (/api/v1/tasks) │
├─────────────────────────────────────────────────────┤
│              Store (store.Store)                    │
│   jsonfile (default) │ sqlite │ + Redis (contrib)  │
├─────────────────────────────────────────────────────┤
│            Observability                            │
│    slog/JSON │ traceID │ /metrics                   │
└─────────────────────────────────────────────────────┘
```

### ExecGo vs execgo-runtime

- ExecGo is the **control plane / execution layer** for agent actions: it accepts `TaskGraph` or structured adapter actions, schedules DAG execution, applies `retry/timeout/cancel` semantics, stores task state, and provides observability.
- `execgo-runtime` is the **data plane / execution runtime** (separate project): it executes processes with resource/sandbox policy and persists artifacts/results.  
  ExecGo integrates with it via the built-in `runtime` executor over HTTP (submit/poll/kill) for `type=runtime` tasks. If you don’t use runtime tasks, you don’t need to deploy `execgo-runtime`.

More details:
- English: [`docs/en/overview/execgo-and-runtime.md`](docs/en/overview/execgo-and-runtime.md)
- 中文：[`docs/zh/overview/execgo-and-runtime.md`](docs/zh/overview/execgo-and-runtime.md)

---

## Quick Start

### Build & Run

```bash
go build -o execgo ./cmd/execgo
./execgo

# Custom config
./execgo -addr :9090 -max-concurrency 20 -data-dir ./mydata

# Env vars
EXECGO_ADDR=:9090 EXECGO_MAX_CONCURRENCY=20 ./execgo
```

### Adapter CLI (`execgocli`)

For **Claude Code / Codex / Hermes Agent / OpenClaw**-style adoption, build the shared adapter helper (stdlib-only HTTP client):

```bash
go build -o execgocli ./cmd/execgocli
export EXECGO_URL=http://127.0.0.1:8080
./execgocli tools
```

- English: [Mode A (CLI)](docs/en/integration/mode-a-cli.md) · [JSON contract](docs/en/reference/execgo-cli-contract.md)
- 中文：[模式 A（CLI）](docs/zh/integration/mode-a-cli.md) · [JSON 契约](docs/zh/reference/execgo-cli-contract.md)
- **For Codex / Claude Code / agents:** bundled onboarding is under **[`.skill/`](.skill/README.md)** (SOP, JSON, integrations). Cursor 也可读 **[`.cursor/skills/execgocli-adapter/SKILL.md`](.cursor/skills/execgocli-adapter/SKILL.md)**（指向同一套说明）。

### Submit tasks

Single task:

```bash
curl -X POST http://localhost:8080/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "tasks": [
      {
        "id": "check-host",
        "type": "shell",
        "params": {"command": "hostname"},
        "retry": 2,
        "timeout": 5000
      }
    ]
  }'
```

DAG workflow:

```bash
curl -X POST http://localhost:8080/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "tasks": [
      {
        "id": "fetch-data",
        "type": "http",
        "params": {"url": "https://httpbin.org/json", "method": "GET"},
        "timeout": 10000
      },
      {
        "id": "save-result",
        "type": "file",
        "params": {"action": "write", "path": "output.txt", "content": "fetched!"},
        "depends_on": ["fetch-data"]
      }
    ]
  }'
```

Mature agent adapter (structured actions):

```bash
curl http://localhost:8080/adapters/tools

curl -X POST http://localhost:8080/adapters/actions \
  -H "Content-Type: application/json" \
  -d '{
    "adapter": "codex",
    "agent_id": "agent-1",
    "action_id": "hello-adapter",
    "action": {
      "kind": "os.noop",
      "input": {"message": "hello adapter"}
    }
  }'
```

---

## Documentation

- English entry: [`docs/en/README.md`](docs/en/README.md)
- 中文入口：[`docs/zh/README.md`](docs/zh/README.md)
- Mature agent adapter: [`docs/en/integration/agent-adapter.md`](docs/en/integration/agent-adapter.md)

---

## License

MIT
