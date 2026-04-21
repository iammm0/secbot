#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

usage() {
  cat <<'EOF'
用法：
  bash scripts/dev_server.sh                # 启动 FastAPI（默认：0.0.0.0:8000，不热重载）
  SECBOT_SERVER_RELOAD=true bash scripts/dev_server.sh   # 热重载
  bash scripts/dev_server.sh --bootstrap-only            # 仅初始化依赖，不启动
  bash scripts/dev_server.sh --cli                       # 启动源码仓 CLI（进入交互）

环境变量（可选）：
  SECBOT_SERVER_HOST / SECBOT_SERVER_PORT / SECBOT_SERVER_RELOAD
EOF
}

MODE="server"
BOOTSTRAP_ONLY="0"

for arg in "${@:-}"; do
  case "$arg" in
    --bootstrap-only) BOOTSTRAP_ONLY="1" ;;
    --cli) MODE="cli" ;;
    -h|--help) usage; exit 0 ;;
    *) echo "未知参数: $arg"; usage; exit 2 ;;
  esac
done

have_uv() {
  command -v uv >/dev/null 2>&1
}

bootstrap_with_uv() {
  uv sync
}

bootstrap_with_venv() {
  PY="${PYTHON:-python3}"
  if ! command -v "$PY" >/dev/null 2>&1; then
    PY="python"
  fi

  if [ ! -d ".venv" ]; then
    "$PY" -m venv .venv
  fi
  # shellcheck disable=SC1091
  source .venv/bin/activate
  python -m pip install -U pip
  python -m pip install -e ".[dev]"
}

run_server_uv() {
  uv run python -m router.main
}

run_cli_uv() {
  uv run python scripts/main.py
}

run_server_venv() {
  # shellcheck disable=SC1091
  source .venv/bin/activate
  python -m router.main
}

run_cli_venv() {
  # shellcheck disable=SC1091
  source .venv/bin/activate
  python scripts/main.py
}

if have_uv; then
  bootstrap_with_uv
  if [ "$BOOTSTRAP_ONLY" = "1" ]; then
    exit 0
  fi
  if [ "$MODE" = "cli" ]; then
    run_cli_uv
  else
    run_server_uv
  fi
else
  echo "未检测到 uv，改用 .venv + pip 初始化（建议安装 uv 以获得更快的依赖解析）。"
  bootstrap_with_venv
  if [ "$BOOTSTRAP_ONLY" = "1" ]; then
    exit 0
  fi
  if [ "$MODE" = "cli" ]; then
    run_cli_venv
  else
    run_server_venv
  fi
fi

