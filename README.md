# Secbot

<div align="center">

![Secbot main interface](assets/secbot-main.png)

**AI-native security automation platform** — multi-agent orchestration with **ACP**, **MCP**, and **Skills**, plus plan/edit workflows inspired by opencode-style semantics.

[![Python 3.11+](https://img.shields.io/badge/python-3.11%2B-blue.svg)](https://www.python.org/downloads/)
[![Version](https://img.shields.io/badge/version-1.6.0-brightgreen.svg)](pyproject.toml)
[![License: MIT](https://img.shields.io/badge/license-MIT-orange.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux%20%7C%20macOS-lightgrey.svg)]()

[中文说明](README_CN.md)

</div>

---

> **Security & legal notice**  
> This software is intended **only for authorized security testing, red-team exercises, and defensive research**. Using it against systems without explicit permission may violate law. Read [docs/SECURITY_WARNING.md](docs/SECURITY_WARNING.md) before use.

---

## Table of contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Requirements](#requirements)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [Optional extras](#optional-extras)
- [Testing](#testing)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

Secbot is an **AI agent platform for security automation**, shipped as a **Python monorepo**. It combines:

- **ACP (Agent Client Protocol)** — session lifecycle and streaming events for external clients; see `apps/opencode-gateway/`.
- **MCP (Model Context Protocol)** — discover and call local or remote MCP tool servers.
- **Skills** — unified discovery and injection for native Secbot skills and opencode-style skill directories.
- **Planner + executors** — multi-agent flows with modes such as full agent, plan-only, and ask.

The default experience is a **terminal UI (TUI)** backed by a **FastAPI** server; you can also run the API or the ACP gateway on their own.

---

## Features

- **Multi-agent orchestration** — planner plus layered executors (`agent` / `plan` / `ask`).
- **ACP gateway** — ND-JSON over stdio for compatible clients (`secbot-acp`).
- **MCP integration** — `local` and `remote` servers, dynamic tool wrapping (via `opencode.json`).
- **Unified skills** — Secbot-native skills plus external/opencode-style paths under feature flags.
- **Permission model** — `allow` / `ask` / `deny` for high-risk operations when enabled.
- **Gradual rollout** — feature toggles via environment variables (ACP, MCP, skills, edit tools, plan mode, permissions).
- **Broad LLM support** — Ollama locally and many cloud providers; see [docs/LLM_PROVIDERS.md](docs/LLM_PROVIDERS.md).

---

## Architecture

```text
apps/
  secbot-api/          # FastAPI routes and HTTP/SSE surface
  secbot-cli/          # CLI / TUI launcher and interactive entry
  opencode-gateway/    # ACP gateway (stdio ND-JSON)

packages/
  secbot-core/         # Sessions, planning, execution graph
  secbot-tools/        # Built-in tools and system actions
  secbot-skills/       # Native skill implementations
  shared-config/       # Shared settings, feature flags, MCP config loader
  opencode-adapters/   # MCP, skills, edit, and permission adapters

terminal-ui/           # TypeScript + Ink TUI (Node.js 22+)
desktop/               # Tauri + Vite desktop shell (optional)
mobile/                # Mobile client workspace (optional)
```

For migration history and deeper design notes, see [docs/MONOREPO_MIGRATION.md](docs/MONOREPO_MIGRATION.md).

---

## Requirements

| Component | Notes |
|-----------|--------|
| **Python** | 3.11+ (`requires-python` in [pyproject.toml](pyproject.toml)) |
| **OS** | Windows, Linux, macOS (some optional deps, e.g. certain SQLite vector extensions, are **not** installed on Windows per `pyproject.toml` markers) |
| **Node.js** | **22+** if you run the Ink TUI from `terminal-ui/` (see [docs/NODE_SETUP.md](docs/NODE_SETUP.md)) |
| **LLM backend** | e.g. [Ollama](https://ollama.ai) locally, or API keys for cloud providers ([docs/LLM_PROVIDERS.md](docs/LLM_PROVIDERS.md)) |

Playwright/Selenium and other automation dependencies are pulled in as Python packages; follow vendor docs for browser drivers where applicable.

---

## Installation

### Editable install (recommended for development)

From the repository root:

```bash
python -m pip install -e .
```

### Using uv

```bash
uv pip install -e .
```

### Optional dependency groups

```bash
# development tooling
python -m pip install -e ".[dev]"

# extra LLM providers (see pyproject.toml)
python -m pip install -e ".[anthropic]"
python -m pip install -e ".[google]"
python -m pip install -e ".[all-providers]"

# optional exploit-related integrations
python -m pip install -e ".[exploit-tools]"
```

Console entry points (from [pyproject.toml](pyproject.toml)) include **`secbot`**, **`secbot-cli`**, **`hackbot`** (CLI), **`secbot-server`** / **`hackbot-server`** (API), and **`secbot-acp`** (ACP gateway).

---

## Configuration

### Environment variables

- Copy or create a **`.env`** file in the project root as needed. Project docs refer to an `env.example` template when present; see [docs/QUICKSTART.md](docs/QUICKSTART.md) and [docs/design-paradigms/config-and-env.md](docs/design-paradigms/config-and-env.md) for conventions.
- **LLM**: set `LLM_PROVIDER` and provider-specific keys (details in [docs/LLM_PROVIDERS.md](docs/LLM_PROVIDERS.md)). Ollama defaults are documented in [docs/OLLAMA_SETUP.md](docs/OLLAMA_SETUP.md).

### Feature flags (gradual rollout)

| Variable | Purpose |
|----------|---------|
| `SECBOT_ACP_ENABLED` | ACP-related behavior |
| `SECBOT_MCP_ENABLED` | MCP integration |
| `SECBOT_UNIFIED_SKILLS` | Unified skill loading |
| `SECBOT_EDIT_TOOLS` | File edit–style tools |
| `SECBOT_PLAN_MODE` | Plan mode |
| `SECBOT_PERMISSIONS` | Permission prompts / policy |

Example (Unix-like shells):

```bash
export SECBOT_ACP_ENABLED=true
export SECBOT_MCP_ENABLED=true
export SECBOT_UNIFIED_SKILLS=true
export SECBOT_EDIT_TOOLS=true
export SECBOT_PLAN_MODE=true
export SECBOT_PERMISSIONS=true
```

On Windows PowerShell, use `$env:SECBOT_MCP_ENABLED = "true"` (and similarly for other variables).

### MCP: `opencode.json`

Place **`opencode.json`** in the project root to register MCP servers:

```json
{
  "mcp": {
    "my-local": {
      "type": "local",
      "command": ["node", "./path/to/server.js"]
    },
    "my-remote": {
      "type": "remote",
      "url": "https://example.com/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_TOKEN"
      }
    }
  }
}
```

---

## Usage

### Root launcher (`main.py`)

The repository root [main.py](main.py) starts the **backend** and the **TypeScript TUI** by default:

```bash
python main.py              # backend + TUI (full-screen terminal UI)
python main.py --backend    # API server only
python main.py --tui        # TUI only (backend must already be running)
```

### Installed commands

```bash
secbot-server               # or: python main.py --backend
secbot-cli                  # default: backend + full-screen TUI (same as secbot / hackbot)
secbot-cli --backend        # API only (default http://127.0.0.1:8000)
secbot-cli --tui            # TUI only (start backend separately first)
secbot-cli model            # interactive LLM provider + model selection (persisted to SQLite)
secbot-cli --help
secbot / hackbot            # same entry module as secbot-cli

python -m opencode_gateway.main   # ACP gateway
secbot-acp                  # same, after install
```

### TUI (Ink)

From `terminal-ui/`:

```bash
cd terminal-ui
npm install
npm run tui
```

See [terminal-ui/README.md](terminal-ui/README.md) and [docs/UI-DESIGN-AND-INTERACTION.md](docs/UI-DESIGN-AND-INTERACTION.md).

### Docker & deployment

See [docs/DOCKER_SETUP.md](docs/DOCKER_SETUP.md) and [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

---

## Optional extras

- **Tool extensions**: third-party packages can register tools via setuptools entry points — [docs/TOOL_EXTENSION.md](docs/TOOL_EXTENSION.md).
- **Desktop app**: `desktop/` (Tauri + Vite) — see package scripts in `desktop/package.json`.
- **Database / SQLite**: [docs/DATABASE_GUIDE.md](docs/DATABASE_GUIDE.md), [docs/SQLITE_SETUP.md](docs/SQLITE_SETUP.md).

---

## Testing

```bash
python -m pytest tests/ -v
```

Focused smoke test for monorepo wiring:

```bash
python -m pytest tests/test_monorepo_integration.py -v
```

---

## Documentation

| Document | Description |
|----------|-------------|
| [docs/QUICKSTART.md](docs/QUICKSTART.md) | Step-by-step getting started |
| [docs/API.md](docs/API.md) | HTTP API overview |
| [docs/LLM_PROVIDERS.md](docs/LLM_PROVIDERS.md) | Supported LLM backends |
| [docs/SKILLS_AND_MEMORY.md](docs/SKILLS_AND_MEMORY.md) | Skills and memory |
| [docs/MONOREPO_MIGRATION.md](docs/MONOREPO_MIGRATION.md) | Monorepo layout and migration |
| [docs/SECURITY_WARNING.md](docs/SECURITY_WARNING.md) | Legal and safe-use notice |
| [docs/CHANGELOG.md](docs/CHANGELOG.md) | Release notes |

Design deep-dives live under [docs/design-paradigms/](docs/design-paradigms/).

---

## Contributing

Contributions are welcome via **issues** and **pull requests**.

1. Use the project only in **authorized** contexts; do not submit changes aimed at bypassing safety or policy without discussion.
2. Match existing code style ([Black](https://github.com/psf/black) line length 120 per `pyproject.toml`).
3. Run tests for areas you touch (`pytest`).
4. Describe **motivation** and **impact** in your PR.

For commit message conventions, see [docs/design-paradigms/commit-conventions.md](docs/design-paradigms/commit-conventions.md).

**Links** (from package metadata): [Repository](https://github.com/iammm0/hackbot) · [Issues](https://github.com/iammm0/hackbot/issues)

---

## License

This project is licensed under the [MIT License](LICENSE).

---

## Acknowledgments

Built with [LangChain](https://github.com/langchain-ai/langchain), [LangGraph](https://github.com/langchain-ai/langgraph), [FastAPI](https://fastapi.tiangolo.com/), and other libraries listed in [pyproject.toml](pyproject.toml).
