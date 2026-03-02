"""
Hackbot CLI 入口（包安装后通过 hackbot / secbot 命令调用）
无参数即启动后端 + TS 全屏 TUI。支持 --backend / --tui 单独启动。
"""
import sys
import traceback
from pathlib import Path

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
    if getattr(sys, "frozen", False):
        try:
            input("\n按回车键退出...")
        except Exception:
            pass
    sys.exit(1)


def app() -> None:
    try:
        args = sys.argv[1:] if len(sys.argv) > 1 else []
        if "--backend" in args:
            raise SystemExit(run_backend_only())
        if "--tui" in args:
            raise SystemExit(run_tui_only())
        raise SystemExit(launch_tui())
    except SystemExit:
        raise
    except Exception as e:
        _log_error_and_exit(e)
