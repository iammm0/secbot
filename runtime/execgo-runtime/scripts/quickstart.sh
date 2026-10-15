#!/usr/bin/env bash
# 快速原型：临时数据目录启动 execgo-runtime，提交示例任务并打印结果。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PORT="${PORT:-18080}"
DATA_DIR="$(mktemp -d "${TMPDIR:-/tmp}/execgo-runtime-quickstart.XXXXXX")"
cleanup() {
  if [[ -n "${SERVER_PID:-}" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  sleep 0.1
  rm -rf "$DATA_DIR" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "[quickstart] 数据目录: $DATA_DIR"
echo "[quickstart] 监听端口: $PORT"

cargo build -q --release
BIN="$ROOT/target/release/execgo-runtime"

"$BIN" serve \
  --listen-addr "127.0.0.1:${PORT}" \
  --data-dir "$DATA_DIR" \
  --termination-grace-ms 200 \
  --dispatch-poll-interval-ms 100 \
  --gc-interval-ms 10000 \
  &
SERVER_PID=$!

BASE="http://127.0.0.1:${PORT}"
echo "[quickstart] 等待就绪: ${BASE}/readyz"
for _ in $(seq 1 100); do
  if curl -fsS "${BASE}/readyz" >/dev/null 2>&1; then
    break
  fi
  sleep 0.05
done

echo "[quickstart] 提交任务..."
RESP="$("$BIN" submit --server "$BASE" --json '{"execution":{"kind":"command","program":"/bin/sh","args":["-c","echo quickstart-ok"]}}')"
TASK_ID="$(printf '%s' "$RESP" | sed -n 's/.*"task_id" *: *"\([^"]*\)".*/\1/p' | head -n1)"
if [[ -z "$TASK_ID" ]]; then
  echo "[quickstart] 无法解析 task_id，原始响应:" >&2
  echo "$RESP" >&2
  exit 1
fi

echo "[quickstart] task_id=$TASK_ID"
echo "[quickstart] 等待完成..."
"$BIN" wait --server "$BASE" --poll-interval-ms 100 "$TASK_ID"

echo "[quickstart] 完成。"
