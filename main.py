"""
Hackbot — 无参数时启动后端 + TS 终端 TUI（全屏）。
  python main.py           # 先启动后端（若未运行），再启动 TUI
  python main.py --backend # 仅启动后端（便于排查后端问题）
  python main.py --tui     # 仅启动 TUI（需先运行后端，便于排查 UI 问题）
"""
import sys

from hackbot.launch_tui import launch_tui, run_backend_only, run_tui_only


def main() -> None:
    if len(sys.argv) > 1 and sys.argv[1] == "--backend":
        sys.exit(run_backend_only())
    if len(sys.argv) > 1 and sys.argv[1] == "--tui":
        sys.exit(run_tui_only())
    sys.exit(launch_tui())


if __name__ == "__main__":
    main()
