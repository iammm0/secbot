# Secbot (Python)

[![PyPI version](https://img.shields.io/pypi/v/secbot.svg)](https://pypi.org/project/secbot/)
[![Python versions](https://img.shields.io/pypi/pyversions/secbot.svg)](https://pypi.org/project/secbot/)
[![PyPI downloads](https://img.shields.io/pypi/dm/secbot.svg)](https://pypi.org/project/secbot/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

Languages: [中文](README_CN.md) · [English](README_EN.md)

Secbot is an AI-powered security automation CLI for authorized security testing, research, and education.

> Security notice: use this tool only in environments where you have explicit authorization. Unauthorized scanning, exploitation, and control actions may violate laws or regulations.

![Secbot main UI](https://raw.githubusercontent.com/iammm0/secbot/main-py-version/assets/secbot-main.png)

## Why This Package

- CLI-first workflow built on `Typer + Rich`, with one-shot and interactive operation.
- Optional FastAPI server mode for REST/SSE integration in automation pipelines.
- Multi-agent execution flow (`secbot-cli` and `superhackbot`) for plan, execute, and summarize loops.
- Security toolchain covering network, web, OSINT, defense scan, reporting, and system utilities.
- Multi-provider LLM backends including Ollama, DeepSeek, OpenAI-compatible APIs, and more.

## Requirements

- Python `>= 3.10`
- `pip` (or `uv`)
- Optional: Ollama for local models

## Install

### Install from PyPI (recommended)

```bash
pip install secbot
```

If you want beta/pre-release versions:

```bash
pip install --pre secbot
```

### Install with uv

```bash
uv pip install secbot
```

### Install from source

```bash
git clone https://github.com/iammm0/secbot.git
cd secbot
uv sync
uv pip install -e .
```

## Quick Start

### 1. Configure environment variables

Create a `.env` file in your working directory:

```env
# Cloud model backend (recommended)
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
secbot "扫描 192.168.1.1 的开放端口"

# Q&A mode
secbot --ask "什么是 XSS 攻击？"

# Expert agent
secbot --agent superhackbot

# Switch backend/model
secbot model
```

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
| `secbot model` | Configure provider/model/API keys |
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

This project is licensed under MIT. See [LICENSE](LICENSE) for details.
