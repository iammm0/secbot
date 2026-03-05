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

        # 基本帮助信息：说明 Hackbot 是什么、能做什么以及主要入口
        if "-h" in args or "--help" in args:
            help_text = """Hackbot / Secbot — 开源自动化安全测试助手（带终端 TUI）

用法:
  hackbot              启动后端 + 终端 TUI（推荐）
  hackbot --backend    仅启动后端 FastAPI 服务（默认端口 8000）
  hackbot --tui        仅启动终端 TUI（需后端已在运行）

核心智能体:
  hackbot        自动模式：基于 ReAct 的自动化安全巡检与基础渗透测试，使用基础安全工具，全流程自动执行，无需每步确认。
  superhackbot   专家模式：同样基于 ReAct，但可使用全部安全工具，对敏感/高风险操作会请求你确认后再执行。

你可以让 Hackbot 做什么:
  - 作为「自动化渗透测试 / 安全巡检助手」：例如端口扫描、服务指纹识别、目录爆破、基础漏洞扫描、简单 OSINT 查询等。
  - 作为「通用 AI 助手」：回答与安全无关的问题（编程、Linux 使用、架构设计等），不必每次都走完整的渗透测试流程。
  - 当你在对话中输入: help / 帮助 / 你能做什么 时，Hackbot 会用分点的方式向你介绍：
      * 自己的角色与能力范围
      * 当前可用的主要安全工具类别
      * 典型可协助完成的任务示例
      * 自己的大致工作架构（前端/TUI → FastAPI 后端 → 会话编排器 → 核心 Agent + 工具链）

后端 API 概览（默认 http://127.0.0.1:8000）:
  GET  /api/agents      列出可用智能体及说明
  GET  /api/tools       列出已集成的安全测试工具
  POST /api/chat        流式聊天接口（SSE），用于与 hackbot/superhackbot 交互
  POST /api/chat/sync   同步聊天接口

提示:
  - 若只想排查后端问题或集成到其他前端，可以先运行: hackbot --backend
  - 在任何前端里，你都可以询问「hackbot 的架构/设计是什么样的」，它会用高层次描述回答自己的设计与架构。
"""
            print(help_text)
            raise SystemExit(0)

        if "--backend" in args:
            raise SystemExit(run_backend_only())
        if "--tui" in args:
            raise SystemExit(run_tui_only())
        raise SystemExit(launch_tui())
    except SystemExit:
        raise
    except Exception as e:
        _log_error_and_exit(e)
