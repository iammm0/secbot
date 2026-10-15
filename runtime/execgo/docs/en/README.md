# ExecGo Docs (English)

This documentation is for teams that want to give general-purpose agents a reliable execution layer. ExecGo does not replace the planning loop or UX of mature agents such as Claude Code, Codex, Hermes Agent, and OpenClaw. It turns their real-world actions into validated, cancellable, auditable, and recoverable tasks.

This documentation is intended for three audiences:

- Orchestrator / Agent developers: integrate through adapter actions or `TaskGraph`, and handle failure, retry, and cancellation semantics correctly
- Platform / Ops engineers: deploy ExecGo into your own Docker Compose or Kubernetes cluster (including persistence and health checks)
- Client developers: integrate with ExecGo via HTTP using Go/Java/Python (submit graphs, poll status, read results)

If you already read the root `README.md` quick start, continue from the sections below.

## Navigation

### 0) Positioning
- [ExecGo and execgo-runtime](./overview/execgo-and-runtime.md)

### 1) How a general-purpose agent adopts ExecGo
- [Integration：Mature agent adapter](./integration/agent-adapter.md)
- [Integration：Mode A — `execgocli` quick start](./integration/mode-a-cli.md)
- [Integration：Mode B — translate + TaskGraph upgrade](./integration/mode-b-upgrade.md)
- [Orchestrator：DAG -> TaskGraph mapping guide](./orchestrator/README.md)

### 2) Deploy to Docker Compose / Kubernetes
- [Deploy：Docker Compose](./deploy/compose.md)
- [Deploy：Kubernetes](./deploy/kubernetes.md)

### 3) Multi-language HTTP integration examples (Go/Java/Python)
- [Integration：Go example](./integration/client-go.md)
- [Integration：Java example](./integration/client-java.md)
- [Integration：Python example](./integration/client-python.md)
- [Integration：Node.js + TypeScript example](./integration/client-nodejs-ts.md)

### 4) Reference (API / Task DSL / executor parameters)
- [Reference：execgocli JSON contract](./reference/execgo-cli-contract.md)
- [Reference：Promotion security defaults](./reference/promotion-security.md)
- [Reference：API endpoints & errors](./reference/api.md)
- [Reference：Task DSL (task model & validation)](./reference/task-dsl.md)
- [Reference：executor parameters & built-ins](./reference/executors.md)

### 5) FAQ
- [FAQ：User questions index](./faqs.md)

## Versioning

Docs reflect the current repository behavior. When upgrading ExecGo, double-check `TaskGraph` submission/validation and executor parameter compatibility.
