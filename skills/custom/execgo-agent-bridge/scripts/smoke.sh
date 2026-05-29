#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CLI="${EXECGO_EXECGOCLI:-execgocli}"

"$CLI" health >/dev/null
"$CLI" tools >/dev/null
"$SCRIPT_DIR/execgo-action.sh" --file "$SKILL_DIR/examples/os-noop.json" >/dev/null

echo "execgo-agent-bridge smoke checks submitted"
