"""
Hackbot — 无参数时启动后端 + TS 终端 TUI（全屏）。
  python main.py           # 先启动后端（若未运行），再启动 TUI
  python main.py --backend # 仅启动后端（便于排查后端问题）
  python main.py --tui     # 仅启动 TUI（需先运行后端，便于排查 UI 问题）
每次启动会加载当前最新的 .py 与 .ts/.tsx 代码（后端子进程禁用字节码缓存；TUI 通过 tsx 直接跑源码）。
"""
import os
import sys
import traceback
from pathlib import Path

# 本次进程及子进程不写入 .pyc，确保每次运行都使用最新 .py 源码
os.environ.setdefault("PYTHONDONTWRITEBYTECODE", "1")

from hackbot.launch_tui import launch_tui, run_backend_only, run_tui_only


def _log_error_and_exit(exc: BaseException) -> None:
    """将异常写入日志并退出；打包运行时错误时暂停以便查看。"""
    lines = traceback.format_exception(type(exc), exc, exc.__traceback__)
    msg = "".join(lines)
    log_name = "hackbot_error.log"
    try:
        log_path = Path.cwd() / log_name
        log_path.write_text(msg, encoding="utf-8")
        print(f"错误已写入: {log_path}", file=sys.stderr)
    except Exception:
        pass
    print(msg, file=sys.stderr)
    _pause_if_frozen()
    sys.exit(1)


def _pause_if_frozen() -> None:
    """打包后双击运行时暂停，便于用户看到控制台输出。"""
    if getattr(sys, "frozen", False):
        try:
            input("\n按回车键退出...")
        except Exception:
            pass


def main() -> None:
    if len(sys.argv) > 1 and sys.argv[1] == "--backend":
        sys.exit(run_backend_only())
    if len(sys.argv) > 1 and sys.argv[1] == "--tui":
        sys.exit(run_tui_only())
    code = launch_tui()
    if code != 0:
        _pause_if_frozen()
    sys.exit(code)


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as e:
        _log_error_and_exit(e)
