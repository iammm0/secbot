# execgo-runtime

[![CI](https://github.com/iammm0/execgo-runtime/actions/workflows/ci.yml/badge.svg)](https://github.com/iammm0/execgo-runtime/actions/workflows/ci.yml)
[![Rust](https://img.shields.io/badge/rust-1.74%2B-orange.svg)](https://www.rust-lang.org/)
[![Crates.io](https://img.shields.io/crates/v/execgo-runtime.svg)](https://crates.io/crates/execgo-runtime)

**Adaptive data-plane runtime** for the ExecGo ecosystem: a Rust service for asynchronous task submission, scheduling, execution, and persistence, with an **HTTP API**, **CLI**, capability negotiation, and a local resource ledger. It acts as the execution backend behind the ExecGo control plane.

The primary use case is a reliable execution substrate for general-purpose or mature agents. Upper-layer agents such as Claude Code, Codex, Hermes Agent, and OpenClaw keep planning and tool selection; the ExecGo control plane handles task governance; `execgo-runtime` handles process-level execution with persistence, isolation, cancellation, audit trails, and recovery.

**Current version**: `1.1.0` (see [Versioning & tags](docs/deployment.md)).

---

## Table of contents

- [Overview](#overview)
- [Features](#features)
- [Requirements](#requirements)
- [Installation](#installation)
- [Quick start](#quick-start)
- [Configuration & environment variables](#configuration--environment-variables)
- [HTTP API overview](#http-api-overview)
- [ExecGo integration](#execgo-integration)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [Security](#security)
- [License](#license)

---

## Overview

`execgo-runtime` hosts an HTTP server in a single process and persists state via SQLite (WAL) and per-task directories. The scheduler dispatches queued work to **internal shim** child processes that run user commands or scripts. The runtime follows a single-binary, multi-capability design: it probes the host at startup, exposes a capability manifest, and resolves a requested/effective execution plan on each submit. It supports health/readiness probes, Prometheus metrics, task cancellation and timeouts, a local resource ledger, and optional `linux_sandbox` plus cgroup capabilities on Linux (see [Architecture](docs/architecture.md)).

In an agent integration path, the runtime does not understand natural language and does not replace an agent's decision loop. It accepts explicit execution requests and returns stable task IDs, a state machine, stdout/stderr, results, events, and resource/sandbox audit data so upstream agents can continue reasoning or replay.

A typical task lifecycle:

```text
POST /api/v1/tasks
  -> validate request
  -> resolve execution_plan
  -> write SQLite + tasks/<id>/request.json
  -> ResourceLedger reservation
  -> fork internal-shim
  -> run command/script
  -> write result.json + stdout.log + stderr.log
  -> GET status/events/metrics
```

The boundary is explicit: the HTTP service receives, schedules, recovers, and observes; the internal shim performs real process execution; upstream ExecGo/agents own planning, retry policy, and business semantics.

## Features

| Capability | Description |
|------------|-------------|
| HTTP API | Submit tasks, query status, cancel, event streams, health checks, Prometheus metrics |
| CLI | `serve` / `submit` / `status` / `wait` / `kill` / `run` |
| Persistence | SQLite metadata; `request.json`, `result.json`, stdout/stderr under `tasks/<id>/` |
| Scheduling & recovery | Shim child-process execution; non-terminal tasks can be recovered after restart |
| Adaptive capabilities | Host probing, capability API, explicit degradation, requested/effective execution plan |
| Resources & sandbox | Process-level by default; optional `linux_sandbox` on Linux (namespaces, cgroups, etc.); local ResourceLedger for reservation/release |
| Governance | `control_context.tenant` for soft tenant quotas; `control_context.owner` for owner-gated kill |

## Requirements

| Item | Notes |
|------|-------|
| Rust | **1.74+** (MSRV; current stable recommended, aligned with CI. `edition = "2021"` is the language edition, not the toolchain version.) |
| OS | Development and CI cover **Linux and macOS**; **full sandbox/cgroup capabilities are Linux-only** |
| Platform | Relies on Unix process groups, signals, `wait4`, etc.; **Windows is not a target platform** |

## Installation

### From crates.io

```bash
cargo install execgo-runtime --version 1.1.0
```

### From source (recommended)

```bash
git clone https://github.com/iammm0/execgo-runtime.git
cd execgo-runtime
cargo build --release
# Binary: target/release/execgo-runtime
```

### Container image (optional)

Pull from GitHub Container Registry (available after successful `main` builds):

```bash
docker pull ghcr.io/iammm0/execgo-runtime:latest
docker run --rm -p 8080:8080 -v execgo-data:/data ghcr.io/iammm0/execgo-runtime:latest
```

Or build locally from source:

```bash
docker build -t execgo-runtime:local .
docker run --rm -p 8080:8080 -v execgo-data:/data execgo-runtime:local
```

Defaults: listen on `0.0.0.0:8080`, data directory `/data`. See [Deployment](docs/deployment.md).

## Quick start

### Build & test

```bash
cargo build --release
cargo test
```

### Start the server

```bash
cargo run -- serve --listen-addr 127.0.0.1:8080 --data-dir ./data
```

This creates `runtime.db` and `tasks/<task_id>/` under the data directory.

### Submit a sample task

```bash
cargo run -- submit --json '{"execution":{"kind":"command","program":"/bin/sh","args":["-c","echo hello"]}}'
```

### Submit a task with governance metadata

```bash
cargo run -- run --json '{
  "execution": {
    "kind": "command",
    "program": "/bin/sh",
    "args": ["-c", "echo $GREETING && sleep 1"],
    "env": {
      "GREETING": "hello from execgo-runtime"
    }
  },
  "limits": {
    "wall_time_ms": 30000,
    "memory_bytes": 536870912,
    "pids_max": 32,
    "stdout_max_bytes": 65536,
    "stderr_max_bytes": 65536
  },
  "sandbox": {
    "profile": "process",
    "workspace_subdir": "quickstart"
  },
  "control_context": {
    "tenant": "demo",
    "owner": "local-user",
    "control_plane_mode": "manual"
  },
  "metadata": {
    "purpose": "quickstart"
  }
}'
```

After the run completes:

```bash
curl -sS http://127.0.0.1:8080/api/v1/runtime/resources
curl -sS http://127.0.0.1:8080/api/v1/tasks/<task_id>/events
ls -la ./data/tasks/<task_id>
```

If the task sets `control_context.owner`, cancellation requires a matching owner:

```bash
cargo run -- kill --owner local-user <task_id>
```

### One-shot demo

```bash
chmod +x scripts/quickstart.sh
./scripts/quickstart.sh
```

Starts a server in a temp directory, submits a task, waits for completion, and cleans up on exit.

### CLI cheat sheet

| Subcommand | Purpose |
|------------|---------|
| `serve` | Start the HTTP server (`serve --help` for all flags) |
| `submit` | Submit a task (`--json` or `--file`) |
| `status <task_id>` | Query status |
| `wait <task_id>` | Poll until terminal state (optional `--timeout-ms`) |
| `kill <task_id>` | Request cancellation |
| `run` | Submit and wait (`submit` + `wait`) |

Default `--server http://127.0.0.1:8080`.

## Configuration & environment variables

| Variable | Description |
|----------|-------------|
| `RUST_LOG` | Log level, e.g. `info`, `debug`; if unset, the default `tracing` configuration applies |
| `EXECGO_RUNTIME_URL` | **On the ExecGo control plane**: root URL of this service (trailing slash optional) |
| `EXECGO_RUNTIME_ID` | Optional: override runtime node ID |
| `EXECGO_RUNTIME_DEFAULT_CAPABILITY_MODE` | Optional: default capability policy, `adaptive` or `strict` |
| `EXECGO_RUNTIME_DISABLE_LINUX_SANDBOX` | Optional: disable Linux sandbox probing |
| `EXECGO_RUNTIME_DISABLE_CGROUP` | Optional: disable cgroup capabilities |
| `EXECGO_RUNTIME_CAPACITY_MEMORY_BYTES` / `EXECGO_RUNTIME_CAPACITY_PIDS` | Optional: override ResourceLedger capacity probing |
| `EXECGO_RUNTIME_OWNER` | Optional: default owner header for CLI `kill` |

Common server flags are documented in [CLI reference](docs/cli.md) (concurrency limits, queue length, GC, grace periods, etc.).

Configure soft tenant quotas via `serve --tenant-quota`, for example:

```bash
cargo run -- serve \
  --listen-addr 127.0.0.1:8080 \
  --data-dir ./data \
  --tenant-quota demo=slots:2,memory:1073741824,pids:128
```

Quotas apply only when tasks set a matching `control_context.tenant`.

## HTTP API overview

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/tasks` | Submit a task |
| `GET` | `/api/v1/tasks/:id` | Task status (includes output snippets) |
| `POST` | `/api/v1/tasks/:id/kill` | Cancel |
| `GET` | `/api/v1/tasks/:id/events` | Event list |
| `GET` | `/api/v1/runtime/info` | Runtime ID, version, start time, platform summary |
| `GET` | `/api/v1/runtime/capabilities` | Host probe results, base semantics, enhanced capabilities, degradation warnings |
| `GET` | `/api/v1/runtime/config` | Non-sensitive runtime config summary |
| `GET` | `/api/v1/runtime/resources` | Local capacity/reserved/available and active reservations |
| `GET` | `/healthz` | Liveness (response includes `version`) |
| `GET` | `/readyz` | Readiness (validates storage) |
| `GET` | `/metrics` | Prometheus text |

Full JSON models and examples: [API reference](docs/api.md).

## ExecGo integration

Set on the ExecGo control plane:

```text
EXECGO_RUNTIME_URL=http://127.0.0.1:8080
```

Point this at the root URL of a running `execgo-runtime` instance; the control plane calls the APIs above through that URL.

Recommended flow:

1. A general-purpose agent submits structured actions through an ExecGo adapter.
2. ExecGo translates actions that need process execution, resource limits, or sandbox policy into `type=runtime` tasks.
3. `execgo-runtime` executes the work and persists request/result/stdout/stderr.
4. ExecGo normalizes status and results back to the agent for further reasoning, retry, cancellation, or audit.

## Documentation

| Doc | Contents |
|-----|----------|
| [docs/README.md](docs/README.md) | Documentation index |
| [docs/architecture.md](docs/architecture.md) | Architecture and execution flow |
| [docs/api.md](docs/api.md) | HTTP API and JSON models |
| [docs/cli.md](docs/cli.md) | CLI flags |
| [docs/deployment.md](docs/deployment.md) | Deployment, Docker, CI/CD, tags |
| [docs/development.md](docs/development.md) | Local development, testing, style |

## Contributing

Issues and feature requests are welcome via [GitHub Issues](https://github.com/iammm0/execgo-runtime/issues). Code changes via pull requests.

Suggested workflow:

1. Fork the repo and branch from `main`.
2. Run `cargo fmt`, `cargo clippy --all-targets --all-features -- -D warnings`, and `cargo test` locally.
3. Write commit messages that explain **motivation and behavior changes** (aligned with [development.md](docs/development.md)).
4. Open a PR and wait for CI to pass before merge.

## Security

If you believe you have found a security vulnerability, **do not** discuss it in a public issue. Report it through a private channel provided by the maintainers (contact details may appear on the GitHub user or organization profile). Until a `SECURITY.md` is published, reach out via a **private** communication channel.

## License

This project is released under the MIT License. See the `LICENSE` file in the repository root.

---

**Repository**: <https://github.com/iammm0/execgo-runtime>
