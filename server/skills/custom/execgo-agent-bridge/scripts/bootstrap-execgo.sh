#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: bootstrap-execgo.sh [--workspace DIR] [--no-runtime-build]

Clone and build the ExecGo helper binaries used by this skill.
EOF
}

WORKSPACE="${EXECGO_BOOTSTRAP_WORKSPACE:-$PWD/.execgo-adapter-workspace}"
NO_RUNTIME_BUILD=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --workspace)
      WORKSPACE="$2"
      shift 2
      ;;
    --no-runtime-build)
      NO_RUNTIME_BUILD=1
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

EXECGO_SOURCE="${EXECGO_SOURCE:-$WORKSPACE/execgo}"
EXECGO_RUNTIME_SOURCE="${EXECGO_RUNTIME_SOURCE:-$WORKSPACE/execgo-runtime}"
EXECGO_BIN_DIR="${EXECGO_BIN_DIR:-$WORKSPACE/bin}"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

clone_or_keep() {
  local repo="$1"
  local dir="$2"
  local ref="$3"
  if [[ -d "$dir/.git" ]]; then
    echo "Using existing clone: $dir"
  elif [[ -e "$dir" ]]; then
    echo "Path exists but is not a git clone: $dir" >&2
    exit 1
  else
    git clone "$repo" "$dir"
  fi
  if [[ -n "$ref" ]]; then
    git -C "$dir" fetch --all --tags
    git -C "$dir" checkout "$ref"
  fi
}

require_cmd git
require_cmd go

mkdir -p "$WORKSPACE" "$EXECGO_BIN_DIR"

clone_or_keep "https://github.com/iammm0/execgo.git" "$EXECGO_SOURCE" "${EXECGO_REF:-}"
clone_or_keep "https://github.com/iammm0/execgo-runtime.git" "$EXECGO_RUNTIME_SOURCE" "${EXECGO_RUNTIME_REF:-}"

echo "Building execgocli and execgo..."
(
  cd "$EXECGO_SOURCE"
  go build -o "$EXECGO_BIN_DIR/execgocli" ./cmd/execgocli
  go build -o "$EXECGO_BIN_DIR/execgo" ./cmd/execgo
)

if [[ "$NO_RUNTIME_BUILD" -eq 0 ]]; then
  if command -v cargo >/dev/null 2>&1; then
    echo "Building execgo-runtime..."
    (
      cd "$EXECGO_RUNTIME_SOURCE"
      cargo build --release
    )
  else
    echo "cargo not found; skipping execgo-runtime build" >&2
  fi
fi

cat <<EOF

Bootstrap complete.

Suggested environment:

  export PATH="$EXECGO_BIN_DIR:\$PATH"
  export EXECGO_EXECGOCLI="$EXECGO_BIN_DIR/execgocli"
  export EXECGO_URL="\${EXECGO_URL:-http://127.0.0.1:8080}"
  export EXECGO_RUNTIME_URL="\${EXECGO_RUNTIME_URL:-http://127.0.0.1:18080}"

EOF
