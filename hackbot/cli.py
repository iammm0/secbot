"""
Hackbot CLI 入口（包安装后通过 hackbot / secbot 命令调用）
无参数即启动后端 + TS 全屏 TUI。支持 --backend / --tui 单独启动。
"""

import sys

from hackbot.launch_tui import launch_tui, run_backend_only, run_tui_only


def app() -> None:
    args = sys.argv[1:] if len(sys.argv) > 1 else []
    if "--backend" in args:
        raise SystemExit(run_backend_only())
    if "--tui" in args:
        raise SystemExit(run_tui_only())
    raise SystemExit(launch_tui())
