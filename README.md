# @opensec/secbot (TypeScript)

[![npm version](https://img.shields.io/npm/v/@opensec/secbot.svg)](https://www.npmjs.com/package/@opensec/secbot)
[![npm downloads](https://img.shields.io/npm/dm/@opensec/secbot.svg)](https://www.npmjs.com/package/@opensec/secbot)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-339933.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

Secbot is an AI-powered TypeScript security automation workspace with a NestJS backend and an Ink-based terminal UI.

> Security notice: this package is for authorized security testing, research, and education only. Do not run scans or exploitation tasks against targets without explicit permission.

![Secbot main UI](https://raw.githubusercontent.com/iammm0/secbot/main-ts-version/assets/secbot-main.png)

## Why This Package

- End-to-end TypeScript architecture (`NestJS + Ink + SQLite`).
- `secbot` binary that starts backend + terminal UI as one product workflow.
- `secbot-server` binary for backend-only API scenarios.
- Multi-agent orchestration with planning, tool execution, and summarization.
- Built-in security tool modules for web, network, OSINT, defense, and reporting workflows.

## Requirements

- Node.js `>= 20`
- npm `>= 10` (recommended)
- Optional: Ollama for local model serving

## Install

### Global install (recommended)

```bash
npm install -g @opensec/secbot
```

### One-off run with npx

```bash
npx @opensec/secbot
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
```

### 2. Start full product mode (backend + TUI)

```bash
secbot
```

### 3. Start backend only (optional)

```bash
secbot-server
```

### 4. Attach to an existing backend (optional)

```bash
SECBOT_API_URL=http://127.0.0.1:8000 secbot
```

## Package Binaries

| Binary | Description |
| --- | --- |
| `secbot` | Start backend and open terminal UI |
| `secbot-server` | Start NestJS backend only |

## Source Development

```bash
git clone https://github.com/iammm0/secbot.git
cd secbot
npm ci

# Backend dev (watch mode)
npm run dev

# TUI (in another terminal)
npm run start:tui
```

### Common npm scripts

| Script | Description |
| --- | --- |
| `npm run build` | Build backend and package artifacts |
| `npm run typecheck` | Type-check server code |
| `npm run lint` | Run ESLint |
| `npm run format:check` | Check Prettier formatting |
| `npm test` | Run tests |
| `npm run release:pack` | Build and create npm package tarball |

## Documentation

- [Quickstart](https://github.com/iammm0/secbot/blob/main-ts-version/docs/QUICKSTART.md)
- [API Reference](https://github.com/iammm0/secbot/blob/main-ts-version/docs/API.md)
- [LLM Providers](https://github.com/iammm0/secbot/blob/main-ts-version/docs/LLM_PROVIDERS.md)
- [Ollama Setup](https://github.com/iammm0/secbot/blob/main-ts-version/docs/OLLAMA_SETUP.md)
- [UI Interaction Design](https://github.com/iammm0/secbot/blob/main-ts-version/docs/UI-DESIGN-AND-INTERACTION.md)
- [Tool Extension](https://github.com/iammm0/secbot/blob/main-ts-version/docs/TOOL_EXTENSION.md)
- [Release Guide](https://github.com/iammm0/secbot/blob/main-ts-version/docs/RELEASE.md)
- [Security Warning](https://github.com/iammm0/secbot/blob/main-ts-version/docs/SECURITY_WARNING.md)

## Registry Links

- npm: [https://www.npmjs.com/package/@opensec/secbot](https://www.npmjs.com/package/@opensec/secbot)
- GitHub Packages: [https://github.com/iammm0/secbot/packages](https://github.com/iammm0/secbot/packages)
- Repository: [https://github.com/iammm0/secbot](https://github.com/iammm0/secbot)
- Issues: [https://github.com/iammm0/secbot/issues](https://github.com/iammm0/secbot/issues)

## License

This project is licensed under MIT. See [LICENSE](LICENSE) for details.
