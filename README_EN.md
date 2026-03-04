# Secbot

> Open-source automated security testing AI agent — Pure TypeScript

Secbot is a ReAct (Reasoning + Acting) AI security testing agent that integrates 12+ security tools including port scanning, service detection, vulnerability scanning, web security analysis, and more. Powered by LLM for automated penetration testing workflows.

## Requirements

- **Node.js** 18+ (20 LTS recommended)
- **LLM Backend** (choose one):
  - [Ollama](https://ollama.com) (local, no API key needed)
  - DeepSeek / OpenAI compatible API (requires API key)

## Quick Start

```bash
git clone https://github.com/iammm0/secbot.git secbot
cd secbot

cd server && npm install && cd ..
cd terminal-ui && npm install && cd ..

# Start backend (dev mode)
npm run dev

# In another terminal, start TUI
npm run tui
```

## Project Structure

```
secbot/
├── server/          # NestJS backend (Agent core + security tools + API)
├── terminal-ui/     # Terminal TUI (Ink + React)
├── app/             # Mobile app (Expo + React Native)
└── package.json     # Root-level scripts
```

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start backend (dev mode with hot reload) |
| `npm run tui` | Start terminal TUI |
| `npm run dev:all` | Start both backend + TUI |
| `npm run build` | Build for production |
| `npm start` | Start production build |

## License

MIT
