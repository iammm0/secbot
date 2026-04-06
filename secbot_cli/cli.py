"""
Secbot CLI — 基于 Typer 的命令行入口
直接在进程内调用核心逻辑，无需通过网络通信。
"""

import asyncio
import sys
import traceback
from pathlib import Path
from typing import Optional

import typer
from rich.console import Console

app = typer.Typer(
    name="secbot",
    help="Secbot — 开源自动化安全测试助手",
    add_completion=False,
    no_args_is_help=False,
)

console = Console()


def _log_error_and_exit(exc: BaseException) -> None:
    """将异常写入日志并退出。"""
    lines = traceback.format_exception(type(exc), exc, exc.__traceback__)
    msg = "".join(lines)
    try:
        log_path = Path.cwd() / "hackbot_error.log"
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
    raise SystemExit(1)


@app.callback(invoke_without_command=True)
def main(
    ctx: typer.Context,
    message: Optional[str] = typer.Argument(None, help="直接发送一条消息（省略则进入交互模式）"),
    agent: str = typer.Option("secbot-cli", "--agent", "-a", help="智能体类型: secbot-cli / superhackbot"),
    ask: bool = typer.Option(False, "--ask", help="使用 Ask 模式（仅问答，不执行工具）"),
):
    """
    Secbot CLI — 自动化安全测试助手。

    无子命令时启动交互式会话；传入 MESSAGE 参数则执行单条任务后退出。

    \b
    示例:
      secbot                              # 进入交互模式
      secbot "扫描 192.168.1.1 的开放端口"  # 单次任务
      secbot --ask "什么是 XSS 攻击？"      # 问答模式
      secbot --agent superhackbot          # 使用专家模式
    """
    if ctx.invoked_subcommand is not None:
        return

    mode = "ask" if ask else "agent"

    try:
        if message:
            from secbot_cli.runner import run_once
            asyncio.run(run_once(console, message, agent_type=agent, mode=mode))
        else:
            from secbot_cli.runner import run_interactive
            asyncio.run(run_interactive(console, agent_type=agent, mode=mode))
    except KeyboardInterrupt:
        console.print("\n[dim]再见！[/dim]")
    except SystemExit:
        raise
    except Exception as e:
        _log_error_and_exit(e)


@app.command()
def model():
    """交互式选择推理后端与模型。"""
    try:
        from hackbot_config import get_llm_provider, save_llm_provider
        from utils.model_selector import run_model_selector, get_provider_model

        current = get_llm_provider()
        current_model = get_provider_model(current)
        provider, model_name = run_model_selector(
            console, current_provider=current, current_model=current_model
        )
        if provider is not None:
            save_llm_provider(provider)
            model_info = model_name or "(默认模型)"
            console.print(f"[green]已切换推理后端: {provider}，模型: {model_info}[/green]")
            console.print("[dim]下次启动 secbot 时将使用该配置。[/dim]")
    except Exception as e:
        _log_error_and_exit(e)


@app.command()
def server(
    host: str = typer.Option("0.0.0.0", "--host", "-h", help="监听地址"),
    port: int = typer.Option(8000, "--port", "-p", help="监听端口"),
    reload: bool = typer.Option(False, "--reload", "-r", help="启用热重载"),
):
    """仅启动 FastAPI 后端服务（用于 API 集成或排查后端问题）。"""
    try:
        import uvicorn
        console.print(f"[bold]启动后端 http://{host}:{port}[/bold]")
        uvicorn.run("router.main:app", host=host, port=port, reload=reload)
    except KeyboardInterrupt:
        console.print("\n[dim]后端已停止[/dim]")
    except Exception as e:
        _log_error_and_exit(e)


@app.command()
def version():
    """显示版本信息。"""
    try:
        from importlib.metadata import version as pkg_version
        ver = pkg_version("secbot")
    except Exception:
        ver = "dev"
    console.print(f"Secbot v{ver}")
