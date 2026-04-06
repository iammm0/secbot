"""
进程内交互运行器：直接调用 SessionManager，通过 EventBus + Rich 在终端实时展示。
不再经过 HTTP/SSE 网络通信，CLI 与核心逻辑在同一进程内完成。
"""

import asyncio
import json
import sys
from typing import Any, Dict, Optional

from rich.console import Console
from rich.live import Live
from rich.markdown import Markdown
from rich.panel import Panel
from rich.prompt import Prompt
from rich.text import Text

from core.session import SessionManager
from router.dependencies import (
    get_agents,
    get_planner_agent,
    get_qa_agent,
    get_summary_agent,
    get_db_manager,
)
from utils.event_bus import EventBus, EventType, Event
from utils.logger import logger


class CliEventPrinter:
    """订阅 EventBus 事件，用 Rich 在终端打印各阶段信息。"""

    def __init__(self, console: Console):
        self.console = console
        self._current_thought: list[str] = []
        self._current_phase: str = ""

    def handle(self, event: Event) -> None:
        t = event.type
        d = event.data

        if t == EventType.PLAN_START:
            summary = d.get("summary", "")
            todos = d.get("todos", [])
            lines = []
            if summary:
                lines.append(summary)
            if todos:
                lines.append("")
                for todo in todos:
                    content = todo.get("content", "")
                    status = todo.get("status", "pending")
                    mark = {"pending": "○", "in_progress": "◉", "completed": "✓"}.get(
                        status, "○"
                    )
                    lines.append(f"  {mark} {content}")
            text = "\n".join(lines) if lines else "规划中..."
            self.console.print(
                Panel(text, title="[bold magenta]规划[/bold magenta]", border_style="magenta")
            )

        elif t == EventType.THINK_START:
            self._current_thought = []
            iteration = d.get("iteration", 1)
            self.console.print(
                f"\n[dim]── 推理 (迭代 {iteration}) ──[/dim]"
            )

        elif t == EventType.THINK_CHUNK:
            chunk = d.get("chunk", "")
            if chunk:
                self._current_thought.append(chunk)
                self.console.print(chunk, end="", highlight=False)

        elif t == EventType.THINK_END:
            thought = d.get("thought", "")
            if thought and not self._current_thought:
                self.console.print(f"[dim]{thought}[/dim]")
            elif self._current_thought:
                self.console.print()
            self._current_thought = []

        elif t == EventType.EXEC_START:
            tool = d.get("tool", "")
            params = d.get("params", {})
            script = d.get("script", "")
            display = f"[bold cyan]{tool}[/bold cyan]"
            if script:
                display += f"\n[dim]{script}[/dim]"
            elif params:
                try:
                    display += f"\n[dim]{json.dumps(params, ensure_ascii=False, indent=2)}[/dim]"
                except (TypeError, ValueError):
                    display += f"\n[dim]{params}[/dim]"
            self.console.print(
                Panel(display, title="[bold cyan]执行[/bold cyan]", border_style="cyan")
            )

        elif t == EventType.EXEC_RESULT:
            tool = d.get("tool", "")
            success = d.get("success", True)
            if success:
                result = d.get("result", "")
                if result:
                    result_str = result if isinstance(result, str) else json.dumps(result, ensure_ascii=False, indent=2)
                    if len(result_str) > 2000:
                        result_str = result_str[:2000] + "\n... (已截断)"
                    self.console.print(
                        Panel(
                            result_str,
                            title=f"[bold green]✓ {tool}[/bold green]",
                            border_style="green",
                        )
                    )
                else:
                    self.console.print(f"[green]✓ {tool} 完成[/green]")
            else:
                error = d.get("error", "未知错误")
                self.console.print(
                    Panel(
                        str(error),
                        title=f"[bold red]✗ {tool}[/bold red]",
                        border_style="red",
                    )
                )

        elif t == EventType.CONTENT:
            content = d.get("content", "")
            if content:
                try:
                    self.console.print(Markdown(content))
                except Exception:
                    self.console.print(content)

        elif t == EventType.REPORT_END:
            report = d.get("report", "")
            if report:
                self.console.print(
                    Panel(
                        Markdown(report),
                        title="[bold green]报告[/bold green]",
                        border_style="green",
                    )
                )

        elif t == EventType.TASK_PHASE:
            phase = d.get("phase", "")
            detail = d.get("detail", "")
            if phase and phase != "done":
                label = {
                    "planning": "规划中",
                    "thinking": "推理中",
                    "exec": "执行中",
                    "report": "报告生成中",
                }.get(phase, phase)
                if detail:
                    label = f"{label}: {detail}"
                if label != self._current_phase:
                    self._current_phase = label
                    self.console.print(f"[dim]⟫ {label}[/dim]")

        elif t == EventType.PLAN_TODO:
            todo_id = d.get("todo_id", "")
            status = d.get("status", "")
            result_summary = d.get("result_summary", "")
            mark = {"pending": "○", "in_progress": "◉", "completed": "✓"}.get(status, "○")
            msg = f"[dim]  {mark} [{todo_id}] {status}[/dim]"
            if result_summary:
                msg += f" — {result_summary}"
            self.console.print(msg)

        elif t == EventType.ROOT_REQUIRED:
            pass

        elif t == EventType.ERROR:
            error = d.get("error", "")
            self.console.print(f"[bold red]错误: {error}[/bold red]")


async def _get_root_password_interactive(
    command: str, console: Console
) -> Optional[Dict[str, Any]]:
    """终端内交互式 root 权限请求。"""
    console.print(
        Panel(
            f"以下命令需要 root/管理员权限:\n[bold]{command}[/bold]",
            title="[bold yellow]权限请求[/bold yellow]",
            border_style="yellow",
        )
    )
    console.print("[1] 执行一次  [2] 总是允许  [3] 拒绝")
    choice = Prompt.ask("选择", choices=["1", "2", "3"], default="3", console=console)
    if choice == "3":
        return {"action": "deny"}
    if choice == "2":
        from utils.root_policy import save_root_policy
        save_root_policy(root_policy="always_allow")

    password = Prompt.ask("请输入密码", password=True, console=console)
    action = "run_once" if choice == "1" else "always_allow"
    return {"action": action, "password": password}


def _create_session_manager(console: Console) -> SessionManager:
    """实例化 SessionManager 及其依赖，与 router 中的初始化逻辑对齐。"""
    get_db_manager()

    event_bus = EventBus()
    printer = CliEventPrinter(console)
    event_bus.subscribe_all(printer.handle)

    async def root_callback(command: str) -> Optional[Dict[str, Any]]:
        return await _get_root_password_interactive(command, console)

    session_manager = SessionManager(
        event_bus=event_bus,
        console=console,
        agents=get_agents(),
        planner=get_planner_agent(),
        qa_agent=get_qa_agent(),
        summary_agent=get_summary_agent(),
        get_root_password=root_callback,
    )
    return session_manager


async def _run_single_message(
    session_manager: SessionManager,
    message: str,
    agent_type: Optional[str] = None,
    mode: str = "agent",
) -> str:
    """处理单条消息并返回响应。"""
    force_qa = mode == "ask"
    force_agent_flow = mode == "agent"
    return await session_manager.handle_message(
        message,
        agent_type=agent_type,
        force_qa=force_qa,
        force_agent_flow=force_agent_flow,
    )


async def run_interactive(
    console: Console,
    agent_type: Optional[str] = None,
    mode: str = "agent",
) -> None:
    """交互式 REPL：循环读取用户输入并处理。"""
    session_manager = _create_session_manager(console)

    console.print(
        Panel(
            "Secbot — 自动化安全测试助手\n"
            "输入你的问题或任务，输入 exit/quit 退出，输入 /help 查看帮助。",
            title="[bold bright_blue]Secbot CLI[/bold bright_blue]",
            border_style="bright_blue",
        )
    )

    while True:
        try:
            user_input = console.input("[bold green]>>> [/bold green]").strip()
        except (EOFError, KeyboardInterrupt):
            console.print("\n[dim]再见！[/dim]")
            break

        if not user_input:
            continue
        if user_input.lower() in ("exit", "quit", "/exit", "/quit"):
            console.print("[dim]再见！[/dim]")
            break
        if user_input.lower() in ("/model", "model"):
            _run_model_selector_inline(console)
            continue

        try:
            await _run_single_message(
                session_manager, user_input, agent_type=agent_type, mode=mode
            )
        except KeyboardInterrupt:
            console.print("\n[yellow]已中断当前任务[/yellow]")
        except Exception as e:
            console.print(f"[bold red]处理出错: {e}[/bold red]")
            logger.exception("CLI 交互错误")

        console.print()


async def run_once(
    console: Console,
    message: str,
    agent_type: Optional[str] = None,
    mode: str = "agent",
) -> None:
    """单条消息模式：处理一条消息后退出。"""
    session_manager = _create_session_manager(console)
    try:
        await _run_single_message(
            session_manager, message, agent_type=agent_type, mode=mode
        )
    except KeyboardInterrupt:
        console.print("\n[yellow]已中断[/yellow]")
    except Exception as e:
        console.print(f"[bold red]处理出错: {e}[/bold red]")
        logger.exception("CLI 单次执行错误")


def _run_model_selector_inline(console: Console) -> None:
    """在交互式 REPL 中执行模型切换。"""
    try:
        from hackbot_config import get_llm_provider, save_llm_provider
        from utils.model_selector import run_model_selector, get_provider_model

        current = get_llm_provider()
        current_model = get_provider_model(current)
        provider, model = run_model_selector(
            console, current_provider=current, current_model=current_model
        )
        if provider is not None:
            save_llm_provider(provider)
            model_info = model or "(默认模型)"
            console.print(
                f"[green]已切换推理后端: {provider}，模型: {model_info}[/green]"
            )
            console.print("[dim]新配置将在下次创建 Agent 时生效。[/dim]")
    except Exception as e:
        console.print(f"[red]模型切换失败: {e}[/red]")
