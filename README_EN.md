# Secbot (Python CLI)

[![PyPI version](https://img.shields.io/pypi/v/secbot.svg)](https://pypi.org/project/secbot/)
[![Python versions](https://img.shields.io/pypi/pyversions/secbot.svg)](https://pypi.org/project/secbot/)
[![PyPI downloads](https://img.shields.io/pypi/dm/secbot.svg)](https://pypi.org/project/secbot/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

Secbot is an **AI-powered security automation CLI** (Typer + Rich) for **authorized** security testing, research, and education.

> **Security notice**: use this tool only where you have explicit authorization. Unauthorized scanning, exploitation, or control actions may violate laws or regulations.

English | [中文](README_CN.md)

![Secbot main UI](https://raw.githubusercontent.com/iammm0/secbot/main-py-version/assets/secbot-main.png)

## Why This Package

- **CLI-first** interactive and one-shot workflows in the terminal.
- **Optional API**: `secbot server` runs FastAPI (REST / SSE) for automation pipelines.
- **Multi-agent** modes such as `secbot-cli` and `superhackbot` for plan, execute, and summarize loops.
- **Security toolchain** across network, web, OSINT, defense checks, reporting, and system utilities.
- **Multiple LLM backends**: Ollama, DeepSeek, OpenAI-compatible APIs, and more.

## Requirements

- Python `>= 3.10`
- `pip` or `uv`
- Optional: Ollama for local models

## Install

### From PyPI (recommended)

```bash
pip install secbot
```

Beta / pre-releases:

```bash
pip install --pre secbot
```

### With uv

```bash
uv pip install secbot
```

### From source (development)

```bash
git clone https://github.com/iammm0/secbot.git
cd secbot
uv sync
uv pip install -e .
```

After install, the console command is **`secbot`** (a `hackbot` alias may also be registered depending on how you install).

## Quick Start

### 1. Configure model backend (persistent)

You can start **without** a `.env`: run `secbot`, then use `/model` in interactive mode or `secbot model` to set provider, API keys, and defaults—they are **stored in SQLite** and picked up on the next launch. Use `.env` only for CI, containers, or unattended defaults.

Optional `.env` example:

```env
# Cloud backend (example: DeepSeek)
LLM_PROVIDER=deepseek
DEEPSEEK_API_KEY=sk-your-api-key
DEEPSEEK_MODEL=deepseek-reasoner

# Optional local backend (Ollama)
# LLM_PROVIDER=ollama
# OLLAMA_BASE_URL=http://localhost:11434
# OLLAMA_MODEL=gemma3:1b
# OLLAMA_EMBEDDING_MODEL=nomic-embed-text
```

### 2. Run the CLI

```bash
# Interactive mode
secbot

# One-shot task
secbot "Scan open ports on 192.168.1.1"

# Q&A only (no tools)
secbot --ask "What is XSS?"

# Expert agent
secbot --agent superhackbot

# Switch backend / model
secbot model
```

When working from a git checkout, you can also run `python scripts/main.py` from the repository root.

### 3. Start API server (optional)

```bash
secbot server
```

## CLI Commands

| Command | Description |
| --- | --- |
| `secbot` | Start interactive mode |
| `secbot "<task>"` | Run a single task |
| `secbot --ask "<question>"` | Ask security questions |
| `secbot --agent superhackbot` | Use expert agent mode |
| `secbot model` | Configure provider / model / API keys |
| `secbot server` | Run FastAPI backend |
| `secbot version` | Show installed version |

## Common Environment Variables

| Variable | Purpose | Default |
| --- | --- | --- |
| `LLM_PROVIDER` | Active model provider | `deepseek` |
| `DEEPSEEK_API_KEY` | DeepSeek API key | None |
| `DEEPSEEK_MODEL` | DeepSeek model | `deepseek-reasoner` |
| `OLLAMA_BASE_URL` | Ollama endpoint | `http://localhost:11434` |
| `OLLAMA_MODEL` | Ollama generation model | `gemma3:1b` |
| `OLLAMA_EMBEDDING_MODEL` | Ollama embedding model | `nomic-embed-text` |
| `DATABASE_URL` | SQLite database URL | `sqlite:///./data/secbot.db` |
| `LOG_LEVEL` | Log level | `INFO` |

## Documentation

- [Quickstart](https://github.com/iammm0/secbot/blob/main-py-version/docs/QUICKSTART.md)
- [API Reference](https://github.com/iammm0/secbot/blob/main-py-version/docs/API.md)
- [LLM Providers](https://github.com/iammm0/secbot/blob/main-py-version/docs/LLM_PROVIDERS.md)
- [Ollama Setup](https://github.com/iammm0/secbot/blob/main-py-version/docs/OLLAMA_SETUP.md)
- [Deployment](https://github.com/iammm0/secbot/blob/main-py-version/docs/DEPLOYMENT.md)
- [Release Guide](https://github.com/iammm0/secbot/blob/main-py-version/docs/RELEASE.md)
- [Database Guide](https://github.com/iammm0/secbot/blob/main-py-version/docs/DATABASE_GUIDE.md)
- [Security Warning](https://github.com/iammm0/secbot/blob/main-py-version/docs/SECURITY_WARNING.md)

## Project Links

- Homepage: [https://github.com/iammm0/secbot](https://github.com/iammm0/secbot)
- Issue Tracker: [https://github.com/iammm0/secbot/issues](https://github.com/iammm0/secbot/issues)
- Releases: [https://github.com/iammm0/secbot/releases](https://github.com/iammm0/secbot/releases)
- PyPI: [https://pypi.org/project/secbot/](https://pypi.org/project/secbot/)

## License

This project is licensed under **MIT**. See [LICENSE](LICENSE) for details.
