"""
共享的交互式界面逻辑（OpenCode 风格）。
供 python main.py interactive 与 hackbot interactive 统一使用，保证两者界面一致。
"""

import asyncio
import sys
from pathlib import Path
from typing import Callable, Dict, Any, Optional

from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich.text import Text
from rich import box


def run_interactive_ui(
    agent: str,
    voice: bool,
    verbose: bool,
    *,
    console: Console,
    get_agent: Callable[[str], Any],
    agents: Dict[str, Any],
    planner_agent: Any,
    qa_agent: Any,
    audit_trail: Any,
    cli_handlers: Optional[Dict[str, Callable[[str], None]]] = None,
) -> None:
    """运行完整的 OpenCode 风格交互界面（banner、状态栏、Quick Start、EventBus、SessionManager、全部斜杠命令）。cli_handlers 为斜杠命令到 CLI 处理器的映射（如 /list-tools -> list_tools）。"""
    from utils.logger import restore_console_log_level
    from utils.loading import LoadingComponent
    from utils.event_bus import EventBus, EventType, Event
    from tui.components.planning import PlanningComponent
    from tui.components.reasoning import ReasoningComponent
    from tui.components.execution import ExecutionComponent
    from tui.components.content import ContentComponent
    from tui.components.report import ReportComponent
    from tui.components.task_status import TaskStatusComponent
    from core.session import SessionManager
    from core.models import RequestType
    from utils.hackbot_banner import print_hackbot_banner
    from utils.enhanced_input import EnhancedInput
    from utils.slash_commands import normalize_slash_input
    from utils.model_selector import (
        run_model_selector,
        check_ollama_running,
        has_deepseek_api_key,
        has_provider_api_key,
        prompt_and_save_deepseek_api_key,
        prompt_and_save_api_key,
        get_provider_config,
        SUPPORTED_PROVIDERS,
    )
    from tui.utils import smart_render_text

    if verbose:
        restore_console_log_level("DEBUG")
    else:
        restore_console_log_level()

    async def _interactive() -> None:
        nonlocal agent
        agent_instance = None  # 延迟创建：先进入界面，切换模型或发消息时再创建（届时可提示输入 API Key）

        def ensure_agent(agent_type: Optional[str] = None) -> bool:
            """需要用到 agent 时再创建；若缺少 API Key 则提示输入。返回是否已有可用 agent。"""
            nonlocal agent_instance
            at = (agent_type or agent).strip().lower()
            for attempt in range(2):
                try:
                    agent_instance = get_agent(at)
                    return True
                except ValueError as e:
                    err_msg = str(e)
                    if ("API Key" in err_msg or "api_key" in err_msg.lower() or "请先配置" in err_msg) and attempt == 0:
                        # 尝试从错误消息中提取 provider 名称
                        from hackbot_config import settings as _s
                        current_p = (_s.llm_provider or "deepseek").strip().lower()
                        if not prompt_and_save_api_key(current_p, console):
                            console.print("[yellow]未输入 API Key，已取消。使用 /model 选择后端时可再次配置。[/yellow]")
                            return False
                    else:
                        raise
            return False

        restore_console_log_level("DEBUG" if verbose else None)

        event_bus = EventBus()
        task_status_comp = TaskStatusComponent(console, event_bus)
        planning_comp = PlanningComponent(console, event_bus)
        reasoning_comp = ReasoningComponent(console, event_bus)
        execution_comp = ExecutionComponent(console, event_bus)
        content_comp = ContentComponent(console, event_bus)
        report_comp = ReportComponent(console, event_bus)

        def _on_error(evt: Event) -> None:
            error = evt.data.get("error", "")
            console.print(f"[red]错误: {error}[/red]")

        event_bus.subscribe(EventType.ERROR, _on_error)

        async def _get_root_password(command: str):
            """需要 root 权限时由执行层调用，提示用户输入密码（不写入命令行）。"""
            console.print(
                Panel(
                    f"[yellow]以下命令需要 root 权限：[/yellow]\n[dim]{command}[/dim]\n\n"
                    "请输入 root 密码（直接回车取消）：",
                    title="[bold]Root 权限确认[/bold]",
                    border_style="yellow",
                )
            )
            loop = asyncio.get_event_loop()
            try:
                pwd = await loop.run_in_executor(None, lambda: input())
                return (pwd or "").strip() or None
            except (EOFError, KeyboardInterrupt):
                return None

        session_mgr = SessionManager(
            event_bus=event_bus,
            console=console,
            agents=agents,
            planner=planner_agent,
            qa_agent=qa_agent,
            get_root_password=_get_root_password,
            resolve_agent=get_agent,
        )

        plan_mode = False
        pending_plan_result = None
        ask_mode = False

        print_hackbot_banner(console)

        model_name = ""
        if agent_instance and hasattr(agent_instance, "get_current_model"):
            model_name = agent_instance.get_current_model() or "ollama"
        else:
            model_name = "未选择（/model 选择）"
        mode_desc = "auto" if agent == "hackbot" else "expert"
        agent_badge = "default" if agent == "hackbot" else "super"
        # 工具数：有 instance 用其实例数量，否则按当前 agent 类型取工具列表长度（避免启动时延迟创建导致显示 0）
        if agent_instance:
            tool_count = len(getattr(agent_instance, "security_tools", []))
        else:
            from tools.pentest.security import BASIC_SECURITY_TOOLS, ALL_SECURITY_TOOLS
            tool_count = len(BASIC_SECURITY_TOOLS) if agent == "hackbot" else len(ALL_SECURITY_TOOLS)

        console.print(
            Text.assemble(
                (" ", ""),
                (" hackbot ", "bold white on bright_blue"),
                (" ", ""),
                (
                    f" {agent_badge} ",
                    f"bold white on {'green' if agent == 'hackbot' else 'magenta'}",
                ),
                (" ", ""),
                (f" {mode_desc} ", "bold white on bright_black"),
                (" ", ""),
                (f" {tool_count} tools ", "dim on default"),
                (" ", ""),
                (f" {model_name} ", "dim"),
            )
        )
        console.print()

        w = console.width or 80
        if w >= 70:
            qs_content = (
                "[bold cyan]不知道做什么？试试这些：[/bold cyan]\n\n"
                "  [yellow]•[/yellow] [cyan]扫描当前主机所在内网环境[/cyan]    推荐首条，发现内网主机与端口\n"
                "  [yellow]•[/yellow] [cyan]你好[/cyan] / [cyan]你能做什么[/cyan]        问候或了解能力（走问答）\n"
                "  [yellow]•[/yellow] [cyan]Scan localhost for open ports[/cyan]    扫描本机开放端口\n"
                "  [yellow]•[/yellow] [cyan]/plan[/cyan] 编写测试计划，[cyan]/start[/cyan] 执行计划 · [cyan]/ask[/cyan] 仅提问不执行\n"
                "\n"
                "  [bold]模式[/bold] default（自动）| super（专家）；当前: "
                + (
                    "[green]default[/green]"
                    if agent == "hackbot"
                    else "[magenta]super[/magenta]"
                )
                + " 。输入 [cyan]/agent[/cyan] 切换；启动时 [cyan]-a hackbot[/cyan] | [cyan]-a superhackbot[/cyan]。\n"
                "\n[dim]  输入 [cyan]/[/cyan] 后回车可列出所有命令（或输入 / 后自动弹出）· exit 退出[/dim]"
            )
        else:
            qs_content = (
                "[bold cyan]试试这些：[/bold cyan]\n"
                " [yellow]•[/yellow] [cyan]扫描当前主机所在内网环境[/cyan]\n"
                " [yellow]•[/yellow] [cyan]/plan[/cyan] 编写计划 [cyan]/start[/cyan] 执行 · [cyan]/ask[/cyan] 提问\n"
                "[dim] / 命令 · exit 退出[/dim]"
            )

        console.print(
            Panel(
                qs_content,
                title="[bold bright_blue]Quick Start[/bold bright_blue]",
                border_style="bright_blue",
                box=box.ROUNDED,
                padding=(0, 1),
            )
        )

        if agent_instance and hasattr(agent_instance, "get_current_model"):
            cur = agent_instance.get_current_model()
            p = cur.split(" / ", 1)[0].strip().lower() if cur else "deepseek"
            if p == "ollama" and not check_ollama_running():
                console.print(
                    Panel(
                        "[yellow]当前使用 Ollama，但未检测到本机 Ollama 服务。[/yellow]\n"
                        "请先启动 Ollama 或输入 [cyan]/model[/cyan] 切换到其他后端。",
                        title="[bold]LLM 不可用[/bold]",
                        border_style="yellow",
                    )
                )
            elif p != "ollama" and not has_provider_api_key(p):
                provider_cfg = get_provider_config(p)
                display_name = provider_cfg["name"] if provider_cfg else p
                console.print(
                    Panel(
                        f"[yellow]当前使用 {display_name}，但未配置 API Key。[/yellow]\n"
                        f"输入 [cyan]/model[/cyan] 选择后端并配置 API Key。",
                        title="[bold]LLM 未配置[/bold]",
                        border_style="yellow",
                    )
                )

        history_file = Path.home() / ".hackbot" / "input_history.txt"
        enhanced_input = EnhancedInput(
            history_file=history_file,
            placeholder="输入 / 快捷操作，或直接给我下达任务…",
            console=console,
            current_agent=agent,
            current_mode="默认",
            force_prompt_toolkit=True,
        )

        from utils.logger import logger

        while True:
            try:
                # 在输入框边框中清晰标记当前模式：默认 | Ask | Plan | 模拟攻击
                if ask_mode:
                    enhanced_input.current_mode = "Ask"
                elif plan_mode:
                    enhanced_input.current_mode = "Plan"
                elif agent == "superhackbot":
                    enhanced_input.current_mode = "模拟攻击"
                else:
                    enhanced_input.current_mode = "默认"
                enhanced_input.current_agent = agent

                console.print()
                if voice:
                    console.print("[yellow]请说话（按Enter结束录音）...[/yellow]")
                    user_input = await enhanced_input.prompt_input_async(
                        "或直接输入文字: "
                    )
                else:
                    user_input = await enhanced_input.prompt_input_async()

                if user_input is None or (
                    not user_input.strip() and not sys.stdin.isatty()
                ):
                    console.print("[yellow]再见！[/yellow]")
                    break
                if not user_input.strip():
                    continue

                if user_input.strip().startswith("/"):
                    normalized, hint = normalize_slash_input(user_input)
                    if hint is not None:
                        # 输入 "/" 后展示的可选命令列表用 Panel 突出显示
                        if "可用命令" in hint:
                            console.print(
                                Panel(
                                    hint,
                                    title="[bold cyan] 输入 / 后的可选命令 [/bold cyan]",
                                    border_style="cyan",
                                    padding=(0, 1),
                                )
                            )
                        else:
                            console.print(hint)
                        continue
                    user_input = normalized

                lower_input = user_input.strip().lower()

                if lower_input in ["exit", "quit"]:
                    console.print("[yellow]再见！[/yellow]")
                    break

                if lower_input == "clear":
                    agent_instance.clear_memory()
                    reasoning_comp.clear()
                    execution_comp.clear()
                    ask_mode = False
                    console.print("[green]✓ 对话历史已清空[/green]")
                    continue

                if lower_input == "/thinking":
                    visible = reasoning_comp.toggle_visibility()
                    status = "开启" if visible else "关闭"
                    console.print(f"[cyan]✓ 推理过程显示已{status}[/cyan]")
                    continue

                if lower_input == "/details":
                    detail = execution_comp.toggle_detail_mode()
                    mode = "详细" if detail else "简洁"
                    console.print(f"[cyan]✓ 执行详情已切换为{mode}模式[/cyan]")
                    continue

                if lower_input == "/compact":
                    console.print("[dim]正在压缩会话...[/dim]")
                    compact_text = await session_mgr.compact_current_session()
                    console.print(
                        Panel(
                            compact_text,
                            title="[bold cyan]Session Compact[/bold cyan]",
                            border_style="cyan",
                        )
                    )
                    continue

                if lower_input == "/sessions":
                    sessions = session_mgr.list_sessions()
                    if not sessions:
                        console.print("[yellow]暂无会话[/yellow]")
                    else:
                        table = Table(
                            title="会话列表",
                            show_header=True,
                            header_style="bold magenta",
                        )
                        table.add_column("ID", style="cyan", width=10)
                        table.add_column("名称", style="green")
                        table.add_column("Agent", style="yellow")
                        table.add_column("消息数", style="blue")
                        table.add_column("状态", style="white")
                        for s in sessions:
                            is_current = (
                                "← 当前"
                                if session_mgr.current_session
                                and s.id == session_mgr.current_session.id
                                else ""
                            )
                            table.add_row(
                                s.id,
                                s.name,
                                s.agent_type,
                                str(len(s.messages)),
                                is_current,
                            )
                        console.print(table)
                    continue

                if lower_input == "/new":
                    new_sess = session_mgr.new_session(agent_type=agent)
                    agent_instance.clear_memory()
                    reasoning_comp.clear()
                    execution_comp.clear()
                    ask_mode = False
                    plan_mode = False
                    pending_plan_result = None
                    console.print(
                        f"[green]✓ 已创建新会话: {new_sess.name} ({new_sess.id})[/green]"
                    )
                    continue

                if lower_input.startswith("/export"):
                    from datetime import datetime as dt

                    export_path = Path(
                        f"exports/session_{dt.now().strftime('%Y%m%d_%H%M%S')}.md"
                    )
                    success = await session_mgr.export_session(export_path)
                    if success:
                        console.print(f"[green]✓ 对话已导出到: {export_path}[/green]")
                    else:
                        console.print("[red]导出失败[/red]")
                    continue

                if lower_input.startswith("/model"):
                    parts = user_input.strip().split()
                    if len(parts) == 1:
                        # /model — 交互式选择
                        from hackbot_config import settings as _settings
                        cur = agent_instance.get_current_model() if (agent_instance and hasattr(agent_instance, "get_current_model")) else None
                        if cur:
                            cur_parts = cur.split(" / ", 1)
                            current_provider = cur_parts[0].strip() if len(cur_parts) > 0 else "deepseek"
                            current_model = cur_parts[1].strip() if len(cur_parts) > 1 else None
                        else:
                            current_provider = (_settings.llm_provider or "deepseek").strip().lower()
                            current_model = None
                        provider, model = run_model_selector(
                            console,
                            current_provider=current_provider,
                            current_model=current_model,
                        )
                        if provider is not None:
                            if not ensure_agent():
                                continue
                            try:
                                if model:
                                    agent_instance.switch_model(provider=provider, model=model)
                                else:
                                    agent_instance.switch_model(provider=provider)
                                console.print(
                                    f"[green]✓ 已切换: {agent_instance.get_current_model()}[/green]"
                                )
                            except Exception as e:
                                console.print(f"[red]切换失败: {e}[/red]")
                        continue

                    # /model <provider> [model] — 快速切换
                    target_provider = parts[1].strip().lower()
                    target_model = parts[2].strip() if len(parts) >= 3 else None

                    # 检查厂商是否已配置 API Key
                    provider_config = get_provider_config(target_provider)
                    if provider_config and provider_config.get("needs_api_key") and not has_provider_api_key(target_provider):
                        if not prompt_and_save_api_key(target_provider, console):
                            console.print("[yellow]未配置 API Key，已取消切换[/yellow]")
                            continue

                    if not ensure_agent():
                        continue
                    try:
                        if target_model:
                            agent_instance.switch_model(provider=target_provider, model=target_model)
                        else:
                            agent_instance.switch_model(provider=target_provider)
                        console.print(f"[green]✓ 已切换: {agent_instance.get_current_model()}[/green]")
                    except Exception as e:
                        console.print(f"[red]切换失败: {e}[/red]")
                    continue

                if lower_input.startswith("/accept"):
                    if hasattr(agent_instance, "handle_accept"):
                        parts = user_input.strip().split()
                        choice = int(parts[1]) if len(parts) > 1 else 1
                        response = await agent_instance.handle_accept(choice)
                        content_comp.display_assistant_message(response, agent)
                    else:
                        console.print(
                            "[yellow]当前智能体不支持 /accept（hackbot 自动模式无需确认）[/yellow]"
                        )
                    continue

                if lower_input == "/reject":
                    if hasattr(agent_instance, "handle_reject"):
                        response = await agent_instance.handle_reject()
                        console.print(f"[yellow]{response}[/yellow]")
                    else:
                        console.print("[yellow]当前智能体不支持 /reject[/yellow]")
                    continue

                if lower_input.startswith("/audit"):
                    if lower_input == "/audit export":
                        report = audit_trail.export_report()
                        console.print(
                            Panel(
                                smart_render_text(report, prefer_markdown=True),
                                title="[bold blue]审计报告[/bold blue]",
                                border_style="blue",
                            )
                        )
                    else:
                        records = audit_trail.get_trail(limit=20)
                        if not records:
                            console.print("[yellow]暂无操作记录[/yellow]")
                        else:
                            table = Table(
                                title="操作留痕",
                                show_header=True,
                                header_style="bold magenta",
                            )
                            table.add_column("#", style="dim", width=4)
                            table.add_column("时间", style="cyan", width=10)
                            table.add_column("类型", style="green", width=12)
                            table.add_column("内容", style="white")
                            for i, rec in enumerate(records, 1):
                                ts = (
                                    rec.timestamp.strftime("%H:%M:%S")
                                    if rec.timestamp
                                    else "?"
                                )
                                content = (
                                    rec.content[:80] + "..."
                                    if len(rec.content) > 80
                                    else rec.content
                                )
                                table.add_row(str(i), ts, rec.step_type, content)
                            console.print(table)
                    continue

                if lower_input.startswith("/agent"):
                    parts = user_input.strip().split()
                    if len(parts) == 1:
                        console.print(
                            f"当前模式: [bold]{'default (hackbot)' if agent == 'hackbot' else 'super (superhackbot)'}[/bold]。\n"
                            "切换: [cyan]/agent hackbot[/cyan] → 默认自动模式  [cyan]/agent superhackbot[/cyan] → 专家模式"
                        )
                        continue
                    choice = parts[1].strip().lower()
                    if choice in ("hackbot", "default"):
                        agent = "hackbot"
                    elif choice in ("superhackbot", "super"):
                        agent = "superhackbot"
                    else:
                        console.print(
                            f"[yellow]未知模式: {choice}[/yellow]，可用: hackbot / default / superhackbot / super"
                        )
                        continue
                    if not ensure_agent(agent):
                        continue
                    if session_mgr.current_session:
                        session_mgr.current_session.agent_type = agent
                    mode_name = (
                        "default（自动）" if agent == "hackbot" else "super（专家）"
                    )
                    console.print(f"[green]✓ 已切换为 {mode_name} 模式[/green]")
                    continue

                if lower_input == "/ask":
                    ask_mode = not ask_mode
                    if ask_mode:
                        plan_mode = False
                        pending_plan_result = None
                        console.print(
                            "[bold cyan]已进入 Ask 模式。[/bold cyan]\n"
                            "在此模式下，你的输入会基于当前对话上下文进行回答，[bold]不会执行任何推理或工具动作[/bold]。\n"
                            "想退出时再次输入 [cyan]/ask[/cyan] 即可。"
                        )
                    else:
                        console.print("[cyan]已退出 Ask 模式，恢复正常交互。[/cyan]")
                    continue

                if lower_input == "/plan":
                    if plan_mode:
                        plan_mode = False
                        pending_plan_result = None
                        console.print("[cyan]已退出计划模式，恢复正常交互。[/cyan]")
                    else:
                        ask_mode = False
                        plan_mode = True
                        pending_plan_result = None
                        console.print(
                            "[cyan]已进入计划模式。[/cyan] 请用自然语言描述你的安全测试计划（例如：对 127.0.0.1 做端口扫描再漏洞扫描）。\n"
                            "确认计划后输入 [bold]/start[/bold] 开始执行。想退出时再次输入 [cyan]/plan[/cyan] 即可。"
                        )
                    continue

                if lower_input == "/start":
                    if not plan_mode:
                        console.print(
                            "[yellow]当前不在计划模式。输入 /plan 可先编写测试计划。[/yellow]"
                        )
                        continue
                    if pending_plan_result is None or not pending_plan_result.todos:
                        console.print(
                            "[yellow]尚未生成计划。请先描述你的安全测试需求（或在 /plan 后输入描述）。[/yellow]"
                        )
                        continue
                    plan_mode = False
                    exec_plan = pending_plan_result
                    pending_plan_result = None
                    if not ensure_agent():
                        console.print("[yellow]请先使用 [cyan]/model[/cyan] 选择模型后端。[/yellow]")
                        plan_mode = True
                        pending_plan_result = exec_plan
                        continue
                    console.print("[green]开始执行既定计划...[/green]\n")
                    enhanced_input.add_to_history(user_input)
                    reasoning_comp.clear()
                    execution_comp.clear()
                    console.print(
                        Text.assemble(
                            ("  ", ""),
                            ("You: ", "bold bright_blue"),
                            ("执行既定安全测试计划", ""),
                        )
                    )
                    console.print()
                    response = await session_mgr.handle_message(
                        "执行既定安全测试计划",
                        agent_type=agent,
                        plan_override=exec_plan,
                    )
                    if response and not planning_comp.todos:
                        content_comp.display_assistant_message(response, agent)
                    continue

                # Root 权限策略配置：/root-config [ask|always]
                if lower_input.startswith("/root-config"):
                    from utils.root_policy import load_root_policy, save_root_policy

                    rest = lower_input[len("/root-config") :].strip().lower()
                    if rest in ("ask", "每次询问", "询问"):
                        save_root_policy(root_policy="ask")
                        console.print(
                            "[green]✓ 已设置为「每次询问」：执行需 root 的命令时会提示输入密码[/green]"
                        )
                    elif rest in ("always", "always_allow", "总是允许", "不询问"):
                        save_root_policy(root_policy="always_allow")
                        console.print(
                            "[green]✓ 已设置为「总是允许」：不询问密码直接执行（需系统已配置 sudo NOPASSWD 或手动处理）[/green]"
                        )
                    else:
                        cur = load_root_policy()
                        console.print(
                            Panel(
                                f"提权命令: [cyan]{cur['root_command']}[/cyan]\n"
                                f"策略: [yellow]{cur['root_policy']}[/yellow]\n\n"
                                "  [dim]ask[/dim] = 每次执行需 root 的命令时询问密码\n"
                                "  [dim]always[/dim] = 不询问，直接执行（需系统已配置 NOPASSWD）\n\n"
                                "用法: [cyan]/root-config ask[/cyan] 或 [cyan]/root-config always[/cyan]",
                                title="[bold]Root 权限策略[/bold]",
                                border_style="blue",
                            )
                        )
                    continue

                # 派发与 main.py CLI 集成的斜杠命令（/list-tools、/system-info 等）
                if cli_handlers:
                    matched_cmd = None
                    rest = ""
                    for cmd in sorted(cli_handlers.keys(), key=len, reverse=True):
                        if lower_input == cmd or lower_input.startswith(cmd + " "):
                            matched_cmd = cmd
                            rest = lower_input[len(cmd) :].strip()
                            break
                    if matched_cmd is not None:
                        handler = cli_handlers[matched_cmd]
                        try:
                            loop = asyncio.get_event_loop()
                            await loop.run_in_executor(None, lambda: handler(rest))
                        except Exception as e:
                            logger.error(f"斜杠命令 {matched_cmd} 执行错误: {e}")
                            console.print(f"[red]执行失败: {e}[/red]")
                        continue

                if plan_mode:
                    enhanced_input.add_to_history(user_input)
                    console.print(
                        Text.assemble(
                            ("  ", ""), ("You: ", "bold bright_blue"), (user_input, "")
                        )
                    )
                    console.print()
                    with console.status("[bold green]正在生成计划..."):
                        plan_result = await planner_agent.plan(user_input)
                    if (
                        plan_result.request_type == RequestType.TECHNICAL
                        and plan_result.todos
                    ):
                        pending_plan_result = plan_result
                        await event_bus.emit_simple_async(
                            EventType.PLAN_START,
                            summary=plan_result.plan_summary,
                            todos=[
                                {
                                    "id": t.id,
                                    "content": t.content,
                                    "status": t.status.value,
                                    "depends_on": t.depends_on,
                                    "tool_hint": t.tool_hint,
                                }
                                for t in plan_result.todos
                            ],
                        )
                        console.print(
                            "[green]计划已生成。输入 /start 开始执行。[/green]"
                        )
                    else:
                        reply = (
                            plan_result.direct_response
                            or "请更具体地描述要执行的安全测试步骤（如：扫描某 IP 的端口、漏洞检测等）。"
                        )
                        content_comp.display_assistant_message(reply, agent)
                    continue

                if ask_mode:
                    enhanced_input.add_to_history(user_input)
                    console.print(
                        Text.assemble(
                            ("  ", ""),
                            ("[ask] ", "bold cyan"),
                            ("You: ", "bold bright_blue"),
                            (user_input, ""),
                        )
                    )
                    console.print()
                    with console.status("[bold cyan]正在基于上下文回答..."):
                        response = await session_mgr.handle_ask_message(user_input)
                    content_comp.display_assistant_message(response, "Ask")
                    continue

                enhanced_input.add_to_history(user_input)
                reasoning_comp.clear()
                execution_comp.clear()

                if not ensure_agent():
                    console.print("[yellow]请先使用 [cyan]/model[/cyan] 选择模型后端（选择 deepseek 时可输入 API Key）。[/yellow]")
                    continue

                console.print(
                    Text.assemble(
                        ("  ", ""), ("You: ", "bold bright_blue"), (user_input, "")
                    )
                )
                console.print()

                response = await session_mgr.handle_message(
                    user_input, agent_type=agent
                )

                if response and not planning_comp.todos:
                    content_comp.display_assistant_message(response, agent)

                if voice:
                    try:
                        from utils.speech import TextToSpeech

                        tts = TextToSpeech()
                        with console.status("[bold green]生成语音中..."):
                            audio_data = await tts.synthesize(response)
                        console.print("[dim]（语音响应已生成）[/dim]")
                    except Exception:
                        pass

            except KeyboardInterrupt:
                console.print("\n[yellow]再见！[/yellow]")
                break
            except Exception as e:
                logger.error(f"交互错误: {e}")
                console.print(f"[red]错误: {e}[/red]")

    asyncio.run(_interactive())
