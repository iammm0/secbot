"""
Secbot 入口 — 直接调用 Typer CLI。
  python main.py              # 进入交互式会话
  python main.py "扫描目标"    # 单次任务
  python main.py model        # 切换推理后端
  python main.py server       # 仅启动后端 API
"""

import os
import sys

os.environ.setdefault("PYTHONDONTWRITEBYTECODE", "1")

from secbot_cli.cli import app

if __name__ == "__main__":
    app()
