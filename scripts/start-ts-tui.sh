#!/usr/bin/env bash
# 启动后端（后台）并运行 TS 终端 TUI
# 用法: ./scripts/start-ts-tui.sh
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
python -m router.main &
BACKEND_PID=$!
echo "后端已启动 (PID $BACKEND_PID)，3 秒后启动 TUI..."
sleep 3
trap "kill $BACKEND_PID 2>/dev/null || true" EXIT
cd terminal-ui && npm run tui
