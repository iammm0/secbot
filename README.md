# @opensec/secbot (TypeScript) — v2.0.0-b2

[![GitHub Release](https://img.shields.io/github/v/release/iammm0/secbot?include_prereleases&label=release)](https://github.com/iammm0/secbot/releases)
[![Node.js](https://img.shields.io/badge/node-%3E%3D24-339933.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

Secbot is an AI-powered TypeScript security automation workspace with a NestJS backend, an Ink terminal UI, and a Web / Desktop app.

> Security notice: this package is for authorized security testing, research, and education only. Do not run scans or exploitation tasks against targets without explicit permission.

![Secbot desktop](assets/secbot-demo.gif)

Desktop app on the maintained `release` branch (Chinese UI):

| Home | Tools |
| --- | --- |
| ![Desktop home](assets/demos/web-home.gif) | ![Built-in tools](assets/demos/web-tools.gif) |
| Settings | Model & theme |
| ![Settings](assets/demos/web-settings.gif) | ![Model config](assets/demos/web-model.gif) |

## Branch policy

**Only [`release`](https://github.com/iammm0/secbot/tree/release) is maintained.** Features, docs, CI, and GitHub Releases all land on this branch (NestJS + Ink TUI + Web / Desktop).

| Branch | Status |
| --- | --- |
| **[`release`](https://github.com/iammm0/secbot/tree/release)** | Current product — the only active line |
| [`pypi-release`](https://github.com/iammm0/secbot/tree/pypi-release) | **Frozen** Python v1 archive (read-only; no new features) |
| [`pure-go`](https://github.com/iammm0/secbot/tree/pure-go) | **Frozen** Go experiment (read-only; no new features) |

## Why This Package

- End-to-end TypeScript architecture (`NestJS + Ink TUI + Web / Desktop + SQLite`).
- Tauri desktop app with versioned installers (`desktop-app-v*`) and in-app update checks.
- Optional **ExecGo** execution runtime: enable in Settings to start/stop local control-plane + runtime processes.
- **Action audit trail**: every conversation stage / LLM / tool call is persisted and browsable in Settings → Audit.
- **Host probe + attack-chain preview**: workspace nodes show IP / username / open ports and a simulated entry-surface path (preview only).
- Hackbot / SuperHackbot HITL: sensitive-tool approval and mid-task `ask_user` prompts over SSE.
- `secbot` binary that starts terminal UI with local spawned backend by default.
- `secbot-server` binary for backend-only API scenarios.
- `secbot-mcp` binary that exposes Secbot tools as a stdio MCP server.
- Shared skills management across REST, TUI slash commands, CLI subcommands, and internal tools.
- Multi-agent orchestration with planning, tool execution, MCP bridging, and summarization.
- Built-in security tool modules for web, network, OSINT, defense, and reporting workflows.

### Source-tree orchestration (contributors)

From the repository checkout, `ChatService` routes each turn through **`IntentRouter`** (single LLM classify), optionally **`ExploreAgent`** (ReAct with `vuln_db_query` / `browser_session`, no sensitive tools), then **`ContextAssemblerService`** + **`ContextStore`** under a per-model context budget. SSE events include `intent_decision`, `explore_*`, and **`context_usage`** for the TUI token meter. **`task_simple`** skips the planner; **`SummaryAgent`** runs only when `needs_report` is true. Contributor-oriented details live in **[`CLAUDE.md`](CLAUDE.md)**; longer user docs: [`README_CN.md`](README_CN.md) / [`README_EN.md`](README_EN.md).

## Requirements

- Node.js `>= 24`
- npm `>= 10` (recommended)
- Optional: Ollama for local model serving

## Install

### Desktop app (recommended UI)

Download the latest **Secbot Desktop** installer from [GitHub Releases](https://github.com/iammm0/secbot/releases) (tags like `desktop-app-v0.0.3-beta`), install for your OS, then open Secbot. Settings → About shows the current version and can check for updates.

More detail: [`desktop/README.md`](desktop/README.md).

### npm CLI / TUI package

Download the latest `.tgz` from [GitHub Releases](https://github.com/iammm0/secbot/releases) (currently **v2.0.0-b2**), then:

### Global install (recommended)

```bash
npm install -g ./opensec-secbot-2.0.0-b2.tgz
secbot
```

### One-off run

```bash
npx ./opensec-secbot-2.0.0-b2.tgz
```

## Quick Start

### 1. Configure environment variables

Create a `.env` file in your working directory:

```env
# Cloud model backend (recommended)
LLM_PROVIDER=deepseek
DEEPSEEK_API_KEY=sk-your-api-key
DEEPSEEK_MODEL=deepseek-chat

# Optional local backend (Ollama)
# LLM_PROVIDER=ollama
# OLLAMA_BASE_URL=http://localhost:11434
# OLLAMA_MODEL=llama3.2

# Optional: explore iterations, context debug SSE, adaptive replan, NVD rate limits
# SECBOT_REACT_MAX_ITERS=20
# SECBOT_EXPLORE_MAX_ITERS=6
# SECBOT_CONTEXT_DEBUG=1
# SECBOT_ADAPTIVE_REPLAN=1
# NVD_API_KEY=your-nvd-key
```

### 2. Start full product mode (backend + TUI)

```bash
secbot
```

### 2b. Start desktop app from source (optional)

```bash
cd desktop
npm ci
npm run dev          # Vite HMR + Nest watch + Tauri window
```

### 3. Start backend only (optional)

```bash
secbot-server
```

### 4. Start MCP server mode (optional)

```bash
secbot-mcp
```

Set `SECBOT_MCP_ALLOW_SENSITIVE=true` only when you intentionally want MCP clients to see sensitive tools.

### 5. Attach to an existing backend (optional)

```bash
# Recommended explicit service mode
SECBOT_TUI_BACKEND=service SECBOT_API_URL=http://127.0.0.1:8000 secbot

# Backward-compatible alias
SECBOT_TUI_BACKEND=remote SECBOT_API_URL=http://127.0.0.1:8000 secbot
```

## Package Binaries

| Binary | Description |
| --- | --- |
| `secbot` | Start terminal UI (default: spawn local backend; optional service mode) |
| `secbot-server` | Start NestJS backend only |
| `secbot-mcp` | Expose Secbot tools through stdio MCP |

## Skills Management

Secbot now exposes one shared skills layer for product and automation surfaces.

### TUI slash commands

```text
/skills
/skill <name>
/create-skill <name> [--description ...] [--trigger ...] [--tag ...] [--prerequisite ...] [--author ...]
```

### CLI subcommands

```bash
secbot skills list
secbot skills view <name>
secbot skills create <name> --description "..." --trigger recon --tag web
```

### REST endpoints

```text
GET  /api/skills
GET  /api/skills/:name
POST /api/skills
```

Created skills are scaffolded under `skills/custom/<slug>/SKILL.md` and can also be reached through the internal `list_skills`, `get_skill`, and `create_skill` tools.

## MCP Integration

Secbot supports MCP in both directions.

### Use Secbot as an MCP server

```bash
secbot-mcp
```

This exposes the current `ToolsService` catalog over stdio MCP. Sensitive tools stay hidden by default unless `SECBOT_MCP_ALLOW_SENSITIVE=true` is set.

### Call external MCP servers from Secbot

Use the built-in `mcp_call` tool to connect to another stdio MCP server, list its tools, or invoke one of them from Secbot workflows.

## Source Development

```bash
git clone https://github.com/iammm0/secbot.git
cd secbot
# default branch is `release` — the only maintained line
npm ci

# Backend dev
npm run dev

# Backend dev with file watching
npm run dev:watch

# TUI (in another terminal, default: spawn local backend)
npm run start:tui

# Desktop hot-dev (Vite :5173 + backend :8000 + Tauri)
cd desktop && npm run dev

# TUI service mode (connect existing backend only)
SECBOT_TUI_BACKEND=service SECBOT_API_URL=http://127.0.0.1:8000 npm run start:tui
```

### Common npm scripts

| Script | Description |
| --- | --- |
| `npm run build` | Build the NestJS backend |
| `npm run build:terminal-ui` | Build the Ink terminal UI |
| `npm run build:web` | Build the web frontend bundle |
| `npm run typecheck` | Type-check server code |
| `npm --prefix desktop run build` | Build the macOS/Windows/Linux desktop app locally |
| `npm run lint` | Run ESLint |
| `npm run format:check` | Check Prettier formatting |
| `npm test` | Run tests |
| `npm run release:pack` | Build and create npm package tarball |
| `npm run release:verify` | Verify packaged npm release contents |

## Documentation

- **Wiki**: [GitHub Wiki](https://github.com/iammm0/secbot/wiki) · [源文件 `docs/wiki/`](docs/wiki/)
- **[CLAUDE.md](CLAUDE.md)** — contributor / AI coding agent guide (orchestration, SSE, env vars)
- [Quickstart](docs/QUICKSTART.md)
- [API Reference](docs/API.md)
- [LLM Providers](docs/LLM_PROVIDERS.md)
- [Ollama Setup](docs/OLLAMA_SETUP.md)
- [UI Interaction Design](docs/UI-DESIGN-AND-INTERACTION.md)
- [Tool Extension](docs/TOOL_EXTENSION.md)
- [Release Guide](docs/RELEASE.md)
- [Security Warning](docs/SECURITY_WARNING.md)

## Links

- Releases: [https://github.com/iammm0/secbot/releases](https://github.com/iammm0/secbot/releases)
- Website: [https://secbot.site](https://secbot.site)
- Frozen archives: [`pypi-release`](https://github.com/iammm0/secbot/tree/pypi-release) (Python v1), [`pure-go`](https://github.com/iammm0/secbot/tree/pure-go) (Go demo)
- Repository: [https://github.com/iammm0/secbot](https://github.com/iammm0/secbot)
- Issues: [https://github.com/iammm0/secbot/issues](https://github.com/iammm0/secbot/issues)

## License

This project is licensed under MIT. See [LICENSE](LICENSE) for details.
