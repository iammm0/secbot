# Secbot — Codex / AI assistant guide

This file helps AI coding agents work effectively in this repository. It summarizes architecture, entry points, and conventions.

## What this project is

**Secbot** is an AI-powered security automation workspace (authorized testing only):

- **Backend**: NestJS (`server/`), SQLite, optional vector memory, unified vuln DB (NVD / CVE.org / Exploit-DB / MITRE).
- **Terminal UI**: Ink + React (`terminal-ui/`), talks to the backend over HTTP + **SSE** (`POST /api/chat`).
- **No LangChain / LangGraph**: agent loops are hand-written TypeScript (`SecurityReActAgent`, `ExploreAgent`, `TaskExecutor`, etc.).

Binaries (npm package): `secbot` (TUI + optional spawned backend), `secbot-server` (API only).

## Repository layout

| Path | Role |
|------|------|
| `server/src/main.ts` | NestJS bootstrap |
| `server/src/modules/chat/` | `ChatController`, `ChatService`, `ContextAssemblerService`, `ContextStoreService`, DTOs |
| `server/src/modules/agents/core/` | `IntentRouter`, `ExploreAgent`, `SecurityReActAgent`, `PlannerAgent`, `TaskExecutor`, `parse-tool-action.ts`, `qa-agent`, `summary-agent` |
| `server/src/modules/tools/` | `ToolsService`, `BaseTool`, categories (security, web-research, vuln-db, …) |
| `server/src/modules/vuln-db/` | `VulnDbService` (adapters + vector store) |
| `terminal-ui/src/` | Ink app: `cli.tsx`, `App.tsx`, `useChat.ts` (SSE), `SessionView`, blocks under `components/blocks/` |
| `npm-bin/` | Published CLI entry scripts |

## Chat request flow (high level)

1. **TUI** → `POST /api/chat` with `{ message, session_id, mode: 'agent', agent, client_shell?, model? }`.
2. **`ChatService.handleMessage`**:
   - **`IntentRouter.classify`** (6 intents: `small_talk`, `meta`, `qa`, `clarify_needed`, `task_simple`, `task_complex`) → early exits for chit-chat / QA / clarify.
   - If **`needsExplore`**: `ExploreAgent.explore` (ReAct micro-loop, `sensitive` tools rejected) → `ContextAssemblerService.applyPatch` → optional SSE `explore_*`, `context_patch`.
   - **`ContextAssemblerService.build`**: merges pinned facts, recent session, SQLite history, vector hits under a **model-context budget** (`model-context-window.ts`). Emits SSE **`context_usage`** for the TUI footer.
   - **`task_simple`**: single `SecurityReActAgent.process` (skip `PlannerAgent`).
   - **`task_complex`**: `PlannerAgent` → `TaskExecutor` (parallel layers) → optional adaptive replan → **`SummaryAgent`** only if `needsReport` from intent.
3. **ReAct parsing**: use **`parseToolAction`** (`parse-tool-action.ts`) — supports markdown-wrapped `Action:`, ` ```json ` blocks, nested `{}`. **`SecurityReActAgent`** asks the model to fix format if parse fails without `Final Answer`.

## SSE events the TUI cares about

Besides `thought_*`, `action_*`, `planning`, `report`, `response`, `done`, `error`, `phase`:

- `intent_decision` — intent + `needs_explore` / `needs_report` / `focus`.
- `explore_start` / `explore_step` / `explore_end` — aggregated into a **browser timeline** block in the TUI.
- `context_usage` — `{ model, context_window, prompt_budget, used_tokens, ratio, … }` for the bottom-right **ctx** widget.
- `context_patch` — explore summary counts (optional).

## Important environment variables

| Variable | Purpose |
|----------|---------|
| `LLM_PROVIDER`, `*_API_KEY`, `*_MODEL` | LLM routing (`server/src/common/llm/llm.factory.ts`) |
| `NVD_API_KEY` | Higher NVD rate limits for `VulnDbService` |
| `SECBOT_EXPLORE_MAX_ITERS` | Max ReAct iterations for `ExploreAgent` (default 12) |
| `SECBOT_CONTEXT_DEBUG` | `1` / `true` → emit `context_debug` SSE |
| `SECBOT_ADAPTIVE_REPLAN` | `0` / `false` → disable adaptive replan after cancelled todos |
| `SECBOT_TUI_BACKEND`, `SECBOT_API_URL` | TUI connects to spawned vs remote backend |

## Commands (from repo root)

```bash
npm ci
npm run dev              # NestJS watch (server)
npm run start:tui        # TUI (builds terminal-ui if needed)
npm run start:stack      # Typical local full stack (see package.json)
npm run typecheck        # Server TS
npm run build:terminal-ui
npm test                 # Vitest (includes parse-tool-action tests)
npm run lint
```

## Conventions for edits

- **Scope**: Match existing style; avoid drive-by refactors unrelated to the task.
- **Agents**: New orchestration logic usually touches `chat.service.ts` + `agents/core/`; tool wiring touches `tools.service.ts` + `tools.module.ts`.
- **TUI**: SSE handling in `useChat.ts`; new block types need `types.ts`, `contentBlocks.ts`, `BlockRenderer.tsx`, and often `blockDiscriminators/discriminators.ts`.
- **Markdown in TUI**: `terminal-ui/src/renderMarkdown.ts` uses **marked v9 + marked-terminal v6** via `marked.use(markedTerminal(...))` — do not revert to the old `setOptions({ renderer: new MarkedTerminal() })` pattern.
- **Stdin**: Mouse / escape filtering in `terminal-ui/src/hooks/mouseFilter.ts`; input sanitization `sanitizeInputValue` for `TextInput`.

## Security & compliance

- Only use against systems you own or have **explicit written authorization** to test.
- `ExploreAgent` and `browser_session` are designed for read-oriented recon; `sensitive` tools are blocked in explore mode.

## Where to read more

- `README.md` / `README_CN.md` / `README_EN.md` — user-facing overview and quick start.
- `docs/SECURITY_WARNING.md` — legal / ethical notice.
