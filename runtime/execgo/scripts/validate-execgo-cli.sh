#!/usr/bin/env bash
# 端到端验收：单元测试 + 可选对已启动的 ExecGo 做 CLI 探活 / E2E validation: unit + optional smoke.
# 用法 / Usage:
#   ./scripts/validate-execgo-cli.sh
#   EXECGO_URL=http://127.0.0.1:8080 ./scripts/validate-execgo-cli.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "[validate-execgo-cli] go test (execgocli unit)"
go test ./tests/unit -run Execgocli -count=1

BIN="$(mktemp /tmp/execgocli-validate.XXXXXX)"
cleanup() { rm -f "$BIN"; }
trap cleanup EXIT

go build -o "$BIN" ./cmd/execgocli

if [[ -n "${EXECGO_URL:-}" ]]; then
  echo "[validate-execgo-cli] smoke: tools + health against ${EXECGO_URL}"
  export EXECGO_URL
  "$BIN" tools | go run "${ROOT}/scripts/validate_execgocli_check.go"
  "$BIN" health | go run "${ROOT}/scripts/validate_execgocli_check.go"
  echo "live smoke ok"
else
  echo "[validate-execgo-cli] skip live smoke (set EXECGO_URL to probe a running ExecGo)"
fi

echo "[validate-execgo-cli] done"
