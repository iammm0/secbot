# Secbot Terminal UI

Ink + React TUI for Secbot. Talks to the NestJS backend over HTTP + SSE. Peer client with Desktop/Web (`web/`): keep chat/SSE/HITL UX aligned (see root `CLAUDE.md` / `AGENTS.md`).

User-facing product docs: [https://secbot.site](https://secbot.site).

## Requirements

- Node.js 24+
- A real TTY (system terminal / Windows Terminal). IDE integrated terminals often lack raw mode.
- Default **spawn** mode needs `server/dist/main.js` (from repo root: `npm run build`)

## Run

From repo root (recommended):

```bash
npm run start:stack          # build backend + start TUI (spawn local backend)
npm run start:tui            # TUI only (default: spawn)
```

Service mode (connect existing backend):

```bash
SECBOT_TUI_BACKEND=service SECBOT_API_URL=http://127.0.0.1:8000 npm run start:tui
```

From this package:

```bash
npm install
npm run tui                  # pretui builds → node dist/cli.js
npm run dev                  # tsx src/cli.tsx
```

Windows TTY tip: from repo root run `scripts\start-cli.bat` or `.\scripts\start-cli.ps1` to open a new console window.

## Env / CLI

| Variable / flag | Meaning |
|-----------------|--------|
| `SECBOT_TUI_BACKEND` | `spawn` (default) / `service` / `remote` (alias of service) / `auto` |
| `SECBOT_API_URL` / `BASE_URL` | Backend URL for service mode |
| `--spawn` / `-s` | Force spawn |
| `--service` / `--remote` / `-r` | Force service mode |
| `--backend-url=<url>` | Override API URL |

## Layout (source)

```text
src/
├── cli.tsx                 # entry, backend mode, TTY checks
├── App.tsx                 # root layout
├── api/                    # REST, SSE, config, backend spawn
├── chat/                   # useChat, types, content blocks, fold helpers
├── slash/                  # slash command parsing
├── render/                 # markdown → ANSI, chrome copy strings
├── model/                  # provider UI types / offline fallback
├── lib/                    # events bus, version
├── views/                  # HomeView, SessionView
├── components/             # chrome, dialogs, MainContent, blocks/
├── blockDiscriminators/    # block type matching
├── contexts/               # theme, dialogs, keybinds, …
└── hooks/                  # mouse filter / scroll
```

Optional connectivity probe (no TUI):

```bash
node --import tsx scripts/check-connection.mts
```
