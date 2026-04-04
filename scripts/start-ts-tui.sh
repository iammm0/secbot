#!/usr/bin/env bash
# Start pure TypeScript stack (TS backend + TS TUI)
# Usage: ./scripts/start-ts-tui.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
npm run start:stack
