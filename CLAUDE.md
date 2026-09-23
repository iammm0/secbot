# Secbot — Claude / AI assistant guide

This file helps AI coding agents work effectively in this repository. It summarizes architecture, entry points, and conventions.

## What this project is

**Secbot** is an AI-powered security automation workspace (authorized testing only):

- **Maintained branch**: only **`release`**. `pypi-release` (Python) and `pure-go` are frozen archives.
- **Backend**: NestJS (`server/`), SQLite, optional vector memory, unified vuln DB (NVD / CVE.org / Exploit-DB / MITRE).
- **Two peer clients** (same NestJS API + SSE; keep product UX aligned):
  - **TUI**: Ink + React (`terminal-ui/`) — `secbot` / `npm run start:stack`.
  - **Desktop**: Tauri shell (`desktop/`) loads **`web/`** (backend serves `web/dist`).
- **No LangChain / LangGraph**: agent loops are hand-written TypeScript (`SecurityReActAgent`, `ExploreAgent`, `TaskExecutor`, etc.).

Binaries (npm package): `secbot` (TUI + optional spawned backend), `secbot-server` (API only). GitHub Release tags `desktop-app-v*` ship **Desktop installers and self-contained TUI archives** for macOS Apple Silicon, Windows x64, and Ubuntu x64 (no macOS Intel).

## Repository layout

| Path | Role |
|------|------|
| `server/src/main.ts` | NestJS bootstrap |
| `server/src/modules/chat/` | `ChatController`, `ChatService`, `ContextAssemblerService`, `ContextStoreService`, DTOs |
| `server/src/modules/agents/core/` | `IntentRouter`, `ExploreAgent`, `SecurityReActAgent`, `PlannerAgent`, `TaskExecutor`, `parse-tool-action.ts`, `qa-agent`, `summary-agent` |
| `server/src/modules/tools/` | `ToolsService`, `BaseTool`, categories (security, web-research, vuln-db, …) |
| `server/src/modules/vuln-db/` | `VulnDbService` (adapters + vector store) |
| `server/skills/` | Agent skill markdown packs (`base/` + `custom/`) |
| `terminal-ui/src/` | Ink TUI: `cli.tsx` / `App.tsx`; domains under `api/`, `chat/`, `slash/`, `render/`, `components/`, `views/` |
| `terminal-ui/README.md` | TUI develop / run notes (peer with Desktop/Web) |
| `web/` | Desktop/Web UI (React); **the real UI for the Tauri app** |
| `desktop/` | Tauri shell: spawn backend, splash, navigate to `http://localhost:8000` |
| `bin/` | Published CLI entry scripts (`secbot`, `secbot-server`, `secbot-mcp`) |

## Chat request flow (high level)

1. **Client (TUI or Desktop/Web)** → `POST /api/chat` with `{ message, session_id, mode: 'agent', agent, client_shell?, model? }`.
2. **`ChatService.handleMessage`**:
   - **`IntentRouter.classify`** (6 intents: `small_talk`, `meta`, `qa`, `clarify_needed`, `task_simple`, `task_complex`) → early exits for chit-chat / QA / clarify.
   - If **`needsExplore`**: `ExploreAgent.explore` (ReAct micro-loop, `sensitive` tools rejected) → `ContextAssemblerService.applyPatch` → optional SSE `explore_*`, `context_patch`.
   - **`ContextAssemblerService.build`**: merges pinned facts, recent session, SQLite history, vector hits under a **model-context budget** (`model-context-window.ts`). Emits SSE **`context_usage`** for client ctx meters.
   - **`task_simple`**: single `SecurityReActAgent.process` (skip `PlannerAgent`).
   - **`task_complex`**: `PlannerAgent` → `TaskExecutor` (parallel layers) → optional adaptive replan → **`SummaryAgent`** only if `needsReport` from intent.
3. **ReAct parsing**: use **`parseToolAction`** (`parse-tool-action.ts`) — supports markdown-wrapped `Action:`, ` ```json ` blocks, nested `{}`. **`SecurityReActAgent`** asks the model to fix format if parse fails without `Final Answer`.

## SSE events clients care about

Besides `thought_*`, `action_*`, `planning`, `report`, `response`, `done`, `error`, `phase`:

- `intent_decision` — intent + `needs_explore` / `needs_report` / `focus`.
- `explore_start` / `explore_step` / `explore_end` — browser / explore timeline in both clients.
- `context_usage` — `{ model, context_window, prompt_budget, used_tokens, ratio, … }` for ctx widgets.
- `context_patch` — explore summary counts (optional).

## Important environment variables

| Variable | Purpose |
|----------|---------|
| `LLM_PROVIDER`, `*_API_KEY`, `*_MODEL` | LLM routing (`server/src/common/llm/llm.factory.ts`) |
| `NVD_API_KEY` | Higher NVD rate limits for `VulnDbService` |
| `SECBOT_REACT_MAX_ITERS` | Max ReAct iterations for Hackbot / SuperHackbot (default 20) |
| `SECBOT_EXPLORE_MAX_ITERS` | Max ReAct iterations for `ExploreAgent` (default 6) |
| `SECBOT_CONTEXT_DEBUG` | `1` / `true` → emit `context_debug` SSE |
| `SECBOT_ADAPTIVE_REPLAN` | `1` / `true` → enable adaptive replan after cancelled todos |
| `SECBOT_JEV_ENABLED`, `SECBOT_JEV_INTENT` / `QA_LIVE` / `ADAPTIVE` / `REACT_STOP` / `CONTEXT`, `TYPESAFE_API_KEY` | Optional Jev System One gates (`server/src/common/jev/`). All off by default; high-confidence accept, fail-open. Thresholds are starting points, not calibrated on Secbot data. |
| `SECBOT_TUI_BACKEND`, `SECBOT_API_URL` | TUI connects to spawned vs remote backend |

## Commands (from repo root)

```bash
npm ci
npm run dev              # NestJS watch (server)
npm run start:tui        # TUI (builds terminal-ui if needed)
npm run start:stack      # Typical local full stack (see package.json)
cd desktop && npm run dev  # Desktop: Vite HMR + Nest watch + Tauri
npm run typecheck        # Server TS
npm run build:terminal-ui
npm run build:web
npm test                 # Vitest (includes parse-tool-action tests)
npm run lint
```

## Conventions for edits

- **Scope**: Match existing style; avoid drive-by refactors unrelated to the task.
- **Agents**: New orchestration logic usually touches `chat.service.ts` + `agents/core/`; tool wiring touches `tools.service.ts` + `tools.module.ts`.
- **TUI ↔ Desktop/Web co-update (required)**: `terminal-ui/` and `web/` (+ `desktop/` shell when packaging/dev launch changes) are **peer products**. For any user-visible chat/product change — new/changed SSE events, conversation blocks, HITL/approval/`ask_user`, model/settings UX, agent switchers, context/usage meters, explore timelines, audit surfaces, etc. — **update both clients in the same change** (or the same PR). Do not ship a backend/SSE feature that only one client understands unless the PR explicitly documents a one-client scope and a follow-up. Desktop UI work lives in `web/`; only touch `desktop/` for Tauri lifecycle, icons, bundling, or splash.
- **TUI mechanics**: SSE handling in `chat/useChat.ts`; new block types need `chat/types.ts`, `chat/contentBlocks.ts`, `components/blocks/BlockRenderer.tsx`, and often `blockDiscriminators/discriminators.ts`.
- **Markdown in TUI**: `render/renderMarkdown.ts` uses **marked v9 + marked-terminal v6** via `marked.use(markedTerminal(...))` — do not revert to the old `setOptions({ renderer: new MarkedTerminal() })` pattern.
- **Stdin**: Mouse / escape filtering in `terminal-ui/src/hooks/mouseFilter.ts`; input sanitization `sanitizeInputValue` for `TextInput`.

## Security & compliance

- Only use against systems you own or have **explicit written authorization** to test.
- `ExploreAgent` and `browser_session` are designed for read-oriented recon; `sensitive` tools are blocked in explore mode.

## Where to read more

- `README.md` / `README_CN.md` / `README_EN.md` — short product overview; user docs live on **https://secbot.site**
- `terminal-ui/README.md` / `desktop/README.md` — client develop / package (code-adjacent)
- `SECURITY_WARNING.md` — legal / ethical notice (shipped with the npm package)
- `CLAUDE.md` / `AGENTS.md` — this guide (keep both in sync)
