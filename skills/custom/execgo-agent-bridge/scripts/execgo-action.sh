#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: execgo-action.sh [--file JSON] [--wait]

Submit an AgentActionRequest using execgocli and optionally wait for completion.
EOF
}

ACTION_FILE=""
WAIT=0
CLI="${EXECGO_EXECGOCLI:-execgocli}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    -f|--file)
      ACTION_FILE="$2"
      shift 2
      ;;
    --wait)
      WAIT=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ -n "$ACTION_FILE" ]]; then
  "$CLI" act -file "$ACTION_FILE"
else
  "$CLI" act
fi

if [[ "$WAIT" -eq 1 ]]; then
  echo "Use the Secbot execgo_action tool when you need built-in wait handling inside the app." >&2
fi
