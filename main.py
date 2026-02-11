"""
Hackbot CLI 应用入口
"""

import asyncio
import sys
import typer
from pathlib import Path
from typing import Optional
from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich.text import Text
from rich import box

from core.agents.planner_agent import PlannerAgent
from core.agents.qa_agent import QAAgent
from core.agents.hackbot_agent import HackbotAgent
from core.agents.superhackbot_agent import SuperHackbotAgent
from utils.logger import logger, restore_console_log_level
from utils.audit import AuditTrail
from utils.slash_commands import normalize_slash_input
from utils.speech import SpeechToText, TextToSpeech
from utils.enhanced_input import EnhancedInput
from utils.model_selector import (
    run_model_selector,
    check_ollama_running,
    has_deepseek_api_key,
)
from utils.output_components import OutputComponentManager
from utils.loading import LoadingComponent
from tui.utils import smart_render_text
from crawler.scheduler import CrawlerScheduler
from crawler.realtime import RealtimeCrawler
from crawler.extractor import AIExtractor
from system.controller import OSController
from system.detector import OSDetector
from prompts.manager import PromptManager
from database.manager import DatabaseManager
from core.memory import MemoryManager
from defense.defense_manager import DefenseManager
from controller.controller import MainController
from datetime import datetime
import uuid
import json

app = typer.Typer(
    name="hackbot",
    add_completion=False,
    no_args_is_help=False,  # 无参数时直接进入 interactive，不显示 help
)
console = Console()


def check_llm_configured() -> tuple[bool, str]:
    """检查 LLM 是否已正确配置"""
    from config import settings

    provider = (settings.llm_provider or "deepseek").strip().lower()

    if provider == "ollama":
        return True, ""

    if not settings.deepseek_api_key:
        return False, "DEEPSEEK_API_KEY"
    return True, ""


def show_config_prompt_and_exit():
    """显示配置提示并退出"""
    from config import settings

    provider = (settings.llm_provider or "deepseek").strip().lower()

    if provider == "ollama":
        config_msg = """[bold yellow]⚠️  检测到 Ollama 服务未运行或未配置[/bold yellow]

请确保 Ollama 已启动并运行：
1. 安装 Ollama: https://ollama.com
2. 启动服务: ollama serve
3. 下载模型: ollama pull deepseek-r1:14b
4. 运行配置命令：
   hackbot config set ollama
"""
    else:
        config_msg = """[bold yellow]⚠️  检测到 DeepSeek API Key 未配置[/bold yellow]

请先配置 API Key：
运行以下命令：
   hackbot config set deepseek

获取 API Key: https://platform.deepseek.com
"""

    console.print(
        Panel(
            config_msg
            + "\n详细文档：https://github.com/iammm0/hackbot/blob/main/docs/OLLAMA_SETUP.md",
            title="🔑 配置 LLM 服务",
            expand=False,
        )
    )
    raise typer.Exit(1)


def require_llm_configured():
    """检查 LLM 配置，未配置则显示提示并退出"""
    configured, missing_key = check_llm_configured()
    if not configured:
        show_config_prompt_and_exit()


# 全局数据库管理器
db_manager = DatabaseManager()

# 全局提示词管理器（集成数据库）
prompt_manager = PromptManager(db_manager=db_manager)

# 全局会话 ID
_session_id = str(uuid.uuid4())

# 全局审计留痕
audit_trail = AuditTrail(db_manager, _session_id)

# 全局智能体实例（ReAct 模式）
agents = {
    "hackbot": HackbotAgent(name="Hackbot", audit_trail=audit_trail),
    "superhackbot": SuperHackbotAgent(name="SuperHackbot", audit_trail=audit_trail),
}

# 全局规划器与问答智能体
planner_agent = PlannerAgent()
qa_agent = QAAgent()

# 为智能体添加记忆
for agent_name, agent_instance in agents.items():
    memory_manager = MemoryManager()
    agent_instance.memory = memory_manager

# 全局语音处理实例
stt = SpeechToText()
tts = TextToSpeech()

# 全局防御管理器
defense_manager = DefenseManager(auto_response=True)

# 全局主控制器
main_controller = MainController()


def get_agent(agent_type: str):
    """获取智能体实例"""
    if agent_type not in agents:
        console.print(f"[red]错误: 未知的智能体类型 '{agent_type}'[/red]")
        console.print(f"[yellow]可用类型: {', '.join(agents.keys())}[/yellow]")
        raise typer.Exit(1)
    return agents[agent_type]


def _format_action_script(tool: str, params: dict) -> Optional[str]:
    """
    格式化action执行的脚本/代码信息

    Args:
        tool: 工具名称
        params: 工具参数

    Returns:
        格式化的脚本信息字符串，如果没有则返回None
    """
    import sys

    if tool == "execute_command":
        # 命令执行工具：显示具体命令
        command = params.get("command", "")
        shell = params.get("shell", True)
        cwd = params.get("cwd")
        timeout = params.get("timeout", 30)

        script_lines = []
        if cwd:
            script_lines.append(f"# 工作目录: {cwd}")
        script_lines.append(f"# Shell模式: {shell}")
        script_lines.append(f"# 超时时间: {timeout}秒")
        script_lines.append("")

        # 根据操作系统显示实际执行的命令
        if sys.platform == "win32" and shell:
            script_lines.append(f'cmd /c "{command}"')
        else:
            script_lines.append(command)

        return "\n".join(script_lines)

    elif tool == "system_control":
        # 系统控制工具：显示action和参数
        action = params.get("action", "")
        kwargs = params.get("kwargs", {})
        if not kwargs and "kwargs" in params:
            kwargs = params["kwargs"]

        script_lines = []
        script_lines.append(f"操作类型: {action}")
        if kwargs:
            script_lines.append("参数:")
            for key, value in kwargs.items():
                if isinstance(value, (dict, list)):
                    script_lines.append(
                        f"  {key}: {json.dumps(value, ensure_ascii=False, indent=4)}"
                    )
                else:
                    script_lines.append(f"  {key}: {value}")
        else:
            script_lines.append("参数: 无")

        return "\n".join(script_lines)

    else:
        # 其他工具：显示参数
        if params:
            script_lines = []
            script_lines.append("参数:")
            for key, value in params.items():
                if isinstance(value, (dict, list)):
                    script_lines.append(
                        f"  {key}: {json.dumps(value, ensure_ascii=False, indent=4)}"
                    )
                else:
                    script_lines.append(f"  {key}: {value}")
            return "\n".join(script_lines)

    return None


@app.command()
def chat(
    message: str = typer.Argument(..., help="要发送的消息"),
    agent: str = typer.Option(
        "hackbot", "--agent", "-a", help="智能体类型 (hackbot/superhackbot)"
    ),
    prompt: Optional[str] = typer.Option(
        None, "--prompt", "-p", help="自定义系统提示词"
    ),
    prompt_file: Optional[Path] = typer.Option(
        None, "--prompt-file", "-f", help="从文件加载提示词"
    ),
    prompt_chain: Optional[str] = typer.Option(
        None, "--prompt-chain", "-c", help="使用提示词链（用逗号分隔多个提示词名）"
    ),
    prompt_template: Optional[str] = typer.Option(
        None, "--template", "-t", help="使用预定义模板"
    ),
    output: Optional[Path] = typer.Option(
        None, "--output", "-o", help="保存响应到文件"
    ),
    stream: bool = typer.Option(False, "--stream", "-s", help="启用流式输出"),
):
    """文本聊天"""
    require_llm_configured()

    async def _chat():
        try:
            agent_instance = get_agent(agent)

            # 处理提示词配置
            if prompt_file:
                # 从文件加载
                chain = prompt_manager.load_chain_from_file(prompt_file)
                if chain:
                    combined_prompt = chain.get_combined()
                    agent_instance.update_system_prompt(combined_prompt)
                    console.print(f"[cyan]✓ 已加载提示词文件: {prompt_file}[/cyan]")
            elif prompt_chain:
                # 使用提示词链
                chain_names = [name.strip() for name in prompt_chain.split(",")]
                combined_parts = []
                for name in chain_names:
                    chain = prompt_manager.get_chain(name)
                    if chain:
                        combined_parts.append(chain.get_combined())
                    else:
                        template = prompt_manager.get_template(name)
                        if template:
                            combined_parts.append(template)
                if combined_parts:
                    combined_prompt = "\n\n".join(combined_parts)
                    agent_instance.update_system_prompt(combined_prompt)
                    console.print(f"[cyan]✓ 已应用提示词链: {prompt_chain}[/cyan]")
            elif prompt_template:
                # 使用模板
                template_content = prompt_manager.get_template(prompt_template)
                if template_content:
                    agent_instance.update_system_prompt(template_content)
                    console.print(f"[cyan]✓ 已应用模板: {prompt_template}[/cyan]")
                else:
                    console.print(
                        f"[yellow]警告: 模板 '{prompt_template}' 不存在[/yellow]"
                    )
            elif prompt:
                # 直接使用自定义提示词
                agent_instance.update_system_prompt(prompt)
                console.print(f"[cyan]✓ 已应用自定义提示词[/cyan]")

            console.print(f"[cyan]🤖 使用智能体: {agent}[/cyan]")
            console.print(f"[yellow]💬 你的消息: {message}[/yellow]\n")

            if stream:
                # 创建输出组件管理器
                output_manager = OutputComponentManager(console)

                # 流式事件处理函数
                def handle_event(event_type: str, data: dict):
                    """处理流式事件，使用组件管理器显示"""
                    if event_type == "planning":
                        content = data.get("content", "")
                        output_manager.add_planning(content)
                    elif event_type == "thought_start":
                        iteration = data.get("iteration", 1)
                        output_manager.current_iteration = iteration
                    elif event_type == "thought_chunk":
                        # 推理内容会通过thought事件统一显示
                        pass
                    elif event_type == "thought_end":
                        pass
                    elif event_type == "thought":
                        iteration = data.get("iteration", 1)
                        content = data.get("content", "")
                        output_manager.add_reasoning(content, iteration)
                    elif event_type == "action_start":
                        iteration = data.get("iteration", 1)
                        tool = data.get("tool", "")
                        params = data.get("params", {})
                        script_info = _format_action_script(tool, params)
                        output_manager.add_execution(
                            tool=tool,
                            params=params,
                            script=script_info,
                            iteration=iteration,
                        )
                    elif event_type == "action_result":
                        iteration = data.get("iteration", 1)
                        tool = data.get("tool", "")
                        success = data.get("success", False)
                        result_data = {
                            "success": success,
                            "result": data.get("result", "") if success else None,
                            "error": data.get("error", "未知错误")
                            if not success
                            else None,
                        }
                        # 更新最后一次执行的执行结果
                        if output_manager.components["execution"]:
                            output_manager.components["execution"][-1]["result"] = (
                                result_data
                            )
                            # 重新显示执行结果
                            output_manager._display_execution(
                                output_manager.components["execution"][-1]
                            )
                    elif event_type == "observation":
                        iteration = data.get("iteration", 1)
                        content = data.get("content", "")
                        tool = data.get("tool", "")
                        # 观察结果作为正文内容
                        obs_text = f"观察 {iteration}"
                        if tool:
                            obs_text += f" ({tool})"
                        obs_text += f": {content}"
                        output_manager.add_content(obs_text)
                    elif event_type == "content":
                        content = data.get("content", "")
                        output_manager.add_content(content)
                    elif event_type == "report":
                        content = data.get("content", "")
                        output_manager.add_report(content)
                    elif event_type == "error":
                        error = data.get("error", "")
                        console.print(f"[red]错误: {error}[/red]")

                response = await agent_instance.process(message, on_event=handle_event)
                # 流式模式下不显示面板，因为已经实时输出
                console.print(f"\n[bold green]智能体响应完成[/bold green]")
            else:
                with console.status("[bold green]思考中..."):
                    response = await agent_instance.process(message)

                # 显示响应
                console.print(
                    Panel(
                        smart_render_text(response, prefer_markdown=True),
                        title="[bold green]智能体响应[/bold green]",
                        border_style="green",
                    )
                )

            # 保存到文件
            if output:
                output.write_text(response, encoding="utf-8")
                console.print(f"[green]✓ 响应已保存到: {output}[/green]")

        except Exception as e:
            logger.error(f"聊天错误: {e}")
            console.print(f"[red]错误: {e}[/red]")
            raise typer.Exit(1)

    asyncio.run(_chat())


@app.command()
def voice(
    audio_file: Path = typer.Argument(..., help="音频文件路径"),
    agent: str = typer.Option(
        "hackbot", "--agent", "-a", help="智能体类型 (hackbot/superhackbot)"
    ),
    output: Optional[Path] = typer.Option(
        None, "--output", "-o", help="保存音频响应到文件"
    ),
    text_only: bool = typer.Option(False, "--text-only", help="只返回文字，不生成语音"),
):
    """语音聊天"""

    async def _voice():
        try:
            if not audio_file.exists():
                console.print(f"[red]错误: 文件不存在: {audio_file}[/red]")
                raise typer.Exit(1)

            agent_instance = get_agent(agent)

            console.print(f"[cyan]🤖 使用智能体: {agent}[/cyan]")
            console.print(f"[yellow]🎤 处理音频: {audio_file}[/yellow]\n")

            # 1. 语音转文字
            with console.status("[bold green]转录音频中..."):
                audio_data = audio_file.read_bytes()
                audio_format = audio_file.suffix[1:] if audio_file.suffix else "wav"
                user_text = await stt.transcribe(audio_data, audio_format)

            console.print(f"[green]✓ 转录: {user_text}[/green]\n")

            # 2. 处理消息
            with console.status("[bold green]思考中..."):
                response_text = await agent_instance.process(user_text)

            # 3. 显示响应
            console.print(
                Panel(
                    smart_render_text(response_text, prefer_markdown=True),
                    title="[bold green]智能体响应[/bold green]",
                    border_style="green",
                )
            )

            # 4. 生成语音响应
            if not text_only:
                with console.status("[bold green]生成语音中..."):
                    audio_response = await tts.synthesize(response_text)

                output_path = output or Path("response.wav")
                output_path.write_bytes(audio_response)
                console.print(f"[green]✓ 语音响应已保存到: {output_path}[/green]")

        except Exception as e:
            logger.error(f"语音聊天错误: {e}")
            console.print(f"[red]错误: {e}[/red]")
            raise typer.Exit(1)

    asyncio.run(_voice())


@app.command()
def transcribe(
    audio_file: Path = typer.Argument(..., help="音频文件路径"),
    output: Optional[Path] = typer.Option(
        None, "--output", "-o", help="保存转录结果到文件"
    ),
):
    """语音转文字"""

    async def _transcribe():
        try:
            if not audio_file.exists():
                console.print(f"[red]错误: 文件不存在: {audio_file}[/red]")
                raise typer.Exit(1)

            console.print(f"[yellow]🎤 处理音频: {audio_file}[/yellow]\n")

            with console.status("[bold green]转录音频中..."):
                audio_data = audio_file.read_bytes()
                audio_format = audio_file.suffix[1:] if audio_file.suffix else "wav"
                text = await stt.transcribe(audio_data, audio_format)

            console.print(
                Panel(
                    text,
                    title="[bold green]转录结果[/bold green]",
                    border_style="green",
                )
            )

            if output:
                output.write_text(text, encoding="utf-8")
                console.print(f"[green]✓ 转录结果已保存到: {output}[/green]")

        except Exception as e:
            logger.error(f"语音转文字错误: {e}")
            console.print(f"[red]错误: {e}[/red]")
            raise typer.Exit(1)

    asyncio.run(_transcribe())


@app.command()
def synthesize(
    text: str = typer.Argument(..., help="要转换的文字"),
    output: Path = typer.Option(
        Path("speech.wav"), "--output", "-o", help="输出音频文件路径"
    ),
    language: str = typer.Option("zh", "--language", "-l", help="语言代码 (zh/en等)"),
):
    """文字转语音"""

    async def _synthesize():
        try:
            console.print(f"[yellow]📝 文字: {text}[/yellow]\n")

            with console.status("[bold green]生成语音中..."):
                audio_data = await tts.synthesize(text, language)

            output.write_bytes(audio_data)
            console.print(f"[green]✓ 语音已保存到: {output}[/green]")

        except Exception as e:
            logger.error(f"文字转语音错误: {e}")
            console.print(f"[red]错误: {e}[/red]")
            raise typer.Exit(1)

    asyncio.run(_synthesize())


@app.command()
def list_agents():
    """列出所有可用的智能体"""
    table = Table(title="可用智能体", show_header=True, header_style="bold magenta")
    table.add_column("类型", style="cyan")
    table.add_column("名称", style="green")
    table.add_column("描述", style="yellow")

    table.add_row("hackbot", "Hackbot", "自动模式（ReAct，基础扫描，全自动）")
    table.add_row(
        "superhackbot", "SuperHackbot", "专家模式（ReAct，全工具，敏感操作需确认）"
    )

    console.print(table)


@app.command()
def list_tools(
    agent: str = typer.Option(
        "all",
        "--agent",
        "-a",
        help="按智能体筛选: hackbot(仅基础工具) / superhackbot(含高级工具) / all",
    ),
    category: str = typer.Option(
        "all",
        "--category",
        "-c",
        help="按分类筛选: core / basic / advanced / all",
    ),
    verbose: bool = typer.Option(False, "--verbose", "-v", help="显示完整描述"),
):
    """列出已集成的工具（按智能体或分类展示）"""
    from tools.pentest.security import (
        CORE_SECURITY_TOOLS,
        BASIC_SECURITY_TOOLS,
        ADVANCED_SECURITY_TOOLS,
        ALL_SECURITY_TOOLS,
    )

    # 按分类选择工具列表
    if category == "core":
        tools_by_cat = [("核心安全", CORE_SECURITY_TOOLS)]
    elif category == "basic":
        tools_by_cat = [("基础工具", BASIC_SECURITY_TOOLS)]
    elif category == "advanced":
        tools_by_cat = [("高级工具", ADVANCED_SECURITY_TOOLS)]
    else:
        tools_by_cat = [
            ("核心安全", CORE_SECURITY_TOOLS),
            ("基础工具(含网络/防御/Web/OSINT等)", BASIC_SECURITY_TOOLS),
            ("高级工具(需确认)", ADVANCED_SECURITY_TOOLS),
        ]

    # 按智能体过滤：hackbot 只有 BASIC，superhackbot 有 ALL
    if agent == "hackbot":
        allowed = set(t.name for t in BASIC_SECURITY_TOOLS)
    elif agent == "superhackbot":
        allowed = set(t.name for t in ALL_SECURITY_TOOLS)
    else:
        allowed = None  # all：不过滤

    table = Table(
        title="已集成工具",
        show_header=True,
        header_style="bold magenta",
    )
    table.add_column("名称", style="cyan")
    table.add_column("描述", style="yellow", max_width=60 if not verbose else None)
    table.add_column("分类", style="green")
    table.add_column("敏感度", style="blue")
    table.add_column("可用智能体", style="magenta")

    basic_set = set(id(t) for t in BASIC_SECURITY_TOOLS)
    advanced_set = set(id(t) for t in ADVANCED_SECURITY_TOOLS)
    seen = set()
    for cat_label, tool_list in tools_by_cat:
        for t in tool_list:
            if t.name in seen:
                continue
            if allowed is not None and t.name not in allowed:
                continue
            seen.add(t.name)
            sens = getattr(t, "sensitivity", "low")
            if agent != "all":
                agents_str = agent
            else:
                agents_str = (
                    "superhackbot" if id(t) in advanced_set else "hackbot, superhackbot"
                )
            desc = (
                t.description
                if verbose
                else (
                    t.description[:57] + "..."
                    if len(t.description) > 60
                    else t.description
                )
            )
            table.add_row(t.name, desc, cat_label, sens, agents_str)

    console.print(table)
    console.print(
        "\n[dim]使用 --agent hackbot|superhackbot|all 按智能体筛选，"
        "--category core|basic|advanced|all 按分类筛选，--verbose 显示完整描述[/dim]"
    )


@app.command()
def clear(
    agent: Optional[str] = typer.Option(
        None, "--agent", "-a", help="清空指定智能体的记忆（默认清空所有）"
    ),
):
    """清空对话历史"""
    if agent:
        if agent not in agents:
            console.print(f"[red]错误: 未知的智能体类型 '{agent}'[/red]")
            raise typer.Exit(1)
        agents[agent].clear_memory()
        console.print(f"[green]✓ 已清空智能体 '{agent}' 的记忆[/green]")
    else:
        for agent_instance in agents.values():
            agent_instance.clear_memory()
        console.print("[green]✓ 已清空所有智能体的记忆[/green]")


def _slash_parse_list_tools(rest: str):
    """解析 /list-tools 后的可选参数：agent、category、verbose"""
    agent, category, verbose = "all", "all", False
    if rest:
        parts = rest.lower().split()
        for p in parts:
            if p in ("hackbot", "superhackbot", "all"):
                agent = p
            elif p in ("core", "basic", "advanced"):
                category = p
            elif p in ("-v", "--verbose", "v", "verbose"):
                verbose = True
    return {"agent": agent, "category": category, "verbose": verbose}


def _slash_parse_filter(rest: str):
    """解析 /list-processes 后的可选过滤名"""
    parts = (rest or "").strip().split(maxsplit=1)
    return {"filter_name": parts[0] if parts else None}


def _slash_parse_path(rest: str, default: str = "."):
    """解析 /file-list 后的可选路径"""
    path = (rest or "").strip() or default
    return {"path": path, "recursive": False}


def _slash_parse_limit(rest: str, default: int = 10):
    """解析 /db-history 后的可选 --limit"""
    try:
        n = int((rest or "").strip().split()[-1]) if rest else default
        return {"limit": max(1, min(n, 100))}
    except (ValueError, IndexError):
        return {"limit": default}


def _build_slash_cli_handlers():
    """构建斜杠命令 -> CLI 处理器的映射（供交互式 / 命令调用）"""
    return {
        "/list-agents": lambda rest: list_agents(),
        "/list-tools": lambda rest: list_tools(**_slash_parse_list_tools(rest or "")),
        "/clear": lambda rest: clear(),
        "/system-info": lambda rest: system_info(),
        "/system-status": lambda rest: system_status(),
        "/list-processes": lambda rest: list_processes(**_slash_parse_filter(rest)),
        "/file-list": lambda rest: file_list(**_slash_parse_path(rest)),
        "/prompt-list": lambda rest: prompt_list(),
        "/db-stats": lambda rest: db_stats(),
        "/db-history": lambda rest: db_history(**_slash_parse_limit(rest)),
        "/defense-scan": lambda rest: defense_scan(),
        "/defense-status": lambda rest: defense_monitor(status=True),
        "/defense-blocked": lambda rest: defense_blocked(list_ips=True),
        "/defense-report": lambda rest: defense_report(),
        "/list-targets": lambda rest: list_targets(),
        "/list-authorizations": lambda rest: list_authorizations(),
    }


@app.command()
def interactive(
    agent: str = typer.Option(
        "hackbot", "--agent", "-a", help="智能体类型 (hackbot/superhackbot)"
    ),
    voice: bool = typer.Option(False, "--voice", "-v", help="启用语音交互模式"),
    verbose: bool = typer.Option(False, "--verbose", "-V", help="显示详细日志"),
):
    """交互式聊天模式（OpenCode 风格 ReAct 安全测试）"""
    require_llm_configured()
    from hackbot.run_interactive import run_interactive_ui

    run_interactive_ui(
        agent=agent,
        voice=voice,
        verbose=verbose,
        console=console,
        get_agent=get_agent,
        agents=agents,
        planner_agent=planner_agent,
        qa_agent=qa_agent,
        audit_trail=audit_trail,
        cli_handlers=_build_slash_cli_handlers(),
    )


@app.command()
def crawl(
    url: str = typer.Argument(..., help="要爬取的URL"),
    crawler_type: str = typer.Option(
        "simple", "--type", "-t", help="爬虫类型 (simple/selenium/playwright)"
    ),
    extract: bool = typer.Option(False, "--extract", "-e", help="使用AI提取信息"),
    output: Optional[Path] = typer.Option(
        None, "--output", "-o", help="保存结果到文件"
    ),
):
    """爬取网页内容"""

    async def _crawl():
        try:
            scheduler = CrawlerScheduler()

            console.print(f"[cyan]🕷️ 爬取URL: {url}[/cyan]")
            console.print(f"[yellow]爬虫类型: {crawler_type}[/yellow]\n")

            with console.status("[bold green]爬取中..."):
                task_id = scheduler.create_task(url, crawler_type=crawler_type)
                result = await scheduler.execute_task(task_id)

            # 显示结果
            console.print(
                Panel(
                    f"[bold]标题:[/bold] {result.title}\n\n"
                    f"[bold]内容预览:[/bold]\n{result.content[:500]}...\n\n"
                    f"[bold]元数据:[/bold] {result.metadata}",
                    title="[bold green]爬取结果[/bold green]",
                    border_style="green",
                )
            )

            # AI提取（如果需要）
            if extract:
                with console.status("[bold green]AI提取信息中..."):
                    extractor = AIExtractor()
                    summary = await extractor.extract_summary(result.content)
                    keywords = await extractor.extract_keywords(result.content)

                    console.print(
                        Panel(
                            f"[bold]摘要:[/bold] {summary}\n\n"
                            f"[bold]关键词:[/bold] {', '.join(keywords)}",
                            title="[bold blue]AI提取信息[/bold blue]",
                            border_style="blue",
                        )
                    )

            # 保存到文件
            if output:
                import json

                output.write_text(
                    json.dumps(result.to_dict(), ensure_ascii=False, indent=2),
                    encoding="utf-8",
                )
                console.print(f"[green]✓ 结果已保存到: {output}[/green]")

        except Exception as e:
            logger.error(f"爬取错误: {e}")
            console.print(f"[red]错误: {e}[/red]")
            raise typer.Exit(1)

    asyncio.run(_crawl())


@app.command()
def monitor(
    url: str = typer.Argument(..., help="要监控的URL"),
    interval: int = typer.Option(300, "--interval", "-i", help="检查间隔（秒）"),
    extract: bool = typer.Option(False, "--extract", "-e", help="使用AI提取信息"),
):
    """实时监控网站变化"""

    async def _monitor():
        try:
            realtime = RealtimeCrawler()

            # 定义变化回调
            async def on_change(result, extracted_info):
                console.print(f"\n[bold yellow]检测到变化: {result.url}[/bold yellow]")
                console.print(
                    Panel(
                        f"[bold]标题:[/bold] {result.title}\n\n"
                        f"[bold]内容预览:[/bold]\n{result.content[:300]}...",
                        title="[bold green]新内容[/bold green]",
                        border_style="green",
                    )
                )

                if extracted_info:
                    console.print(f"[blue]提取信息: {extracted_info}[/blue]")

            # 添加监控任务
            task_id = realtime.add_monitor(
                url=url,
                interval=interval,
                callback=on_change,
                extractor_config={"schema": {}} if extract else None,
            )

            console.print(
                Panel(
                    f"[bold cyan]开始监控: {url}[/bold cyan]\n"
                    f"检查间隔: [green]{interval}秒[/green]\n"
                    f"AI提取: [green]{'开启' if extract else '关闭'}[/green]\n\n"
                    f"按 Ctrl+C 停止监控",
                    title="实时监控",
                    border_style="blue",
                )
            )

            # 启动监控
            await realtime.start()

            # 保持运行
            try:
                while True:
                    await asyncio.sleep(1)
            except KeyboardInterrupt:
                console.print("\n[yellow]停止监控...[/yellow]")
                await realtime.stop()

        except Exception as e:
            logger.error(f"监控错误: {e}")
            console.print(f"[red]错误: {e}[/red]")
            raise typer.Exit(1)

    asyncio.run(_monitor())


@app.command()
def system_info():
    """显示系统信息"""
    detector = OSDetector()
    info = detector.detect()

    table = Table(title="系统信息", show_header=True, header_style="bold magenta")
    table.add_column("项目", style="cyan")
    table.add_column("值", style="green")

    table.add_row("操作系统类型", info.os_type)
    table.add_row("操作系统名称", info.os_name)
    table.add_row("操作系统版本", info.os_version)
    table.add_row("系统发布版本", info.os_release)
    table.add_row("架构", info.architecture)
    table.add_row("处理器", info.processor)
    table.add_row("Python版本", info.python_version)
    table.add_row("主机名", info.hostname)
    table.add_row("用户名", info.username)

    console.print(table)


@app.command()
def system_status():
    """显示系统状态（CPU、内存、磁盘等）"""
    controller = OSController()

    # CPU信息
    cpu_info = controller.execute("get_cpu_info")
    if cpu_info["success"]:
        cpu = cpu_info["result"]
        console.print(
            Panel(
                f"CPU核心数: {cpu.get('count', 'N/A')}\n"
                f"CPU使用率: {cpu.get('percent', 0):.1f}%\n"
                f"频率: {cpu.get('freq', {}).get('current', 'N/A')} MHz",
                title="[bold blue]CPU信息[/bold blue]",
                border_style="blue",
            )
        )

    # 内存信息
    mem_info = controller.execute("get_memory_info")
    if mem_info["success"]:
        mem = mem_info["result"]
        total_gb = mem.get("total", 0) / (1024**3)
        used_gb = mem.get("used", 0) / (1024**3)
        available_gb = mem.get("available", 0) / (1024**3)

        console.print(
            Panel(
                f"总内存: {total_gb:.2f} GB\n"
                f"已使用: {used_gb:.2f} GB ({mem.get('percent', 0):.1f}%)\n"
                f"可用: {available_gb:.2f} GB",
                title="[bold green]内存信息[/bold green]",
                border_style="green",
            )
        )

    # 磁盘信息
    disk_info = controller.execute("get_disk_info")
    if disk_info["success"]:
        disks = disk_info["result"]
        disk_table = Table(title="磁盘信息", show_header=True)
        disk_table.add_column("设备", style="cyan")
        disk_table.add_column("挂载点", style="yellow")
        disk_table.add_column("总容量", style="green")
        disk_table.add_column("已使用", style="red")
        disk_table.add_column("使用率", style="magenta")

        for disk in disks[:5]:  # 只显示前5个
            total_gb = disk.get("total", 0) / (1024**3)
            used_gb = disk.get("used", 0) / (1024**3)
            disk_table.add_row(
                disk.get("device", "N/A"),
                disk.get("mountpoint", "N/A"),
                f"{total_gb:.2f} GB",
                f"{used_gb:.2f} GB",
                f"{disk.get('percent', 0):.1f}%",
            )

        console.print(disk_table)


@app.command()
def list_processes(
    filter_name: Optional[str] = typer.Option(
        None, "--filter", "-f", help="过滤进程名"
    ),
):
    """列出运行中的进程"""
    controller = OSController()

    result = controller.execute("list_processes", filter_name=filter_name)
    if result["success"]:
        processes = result["result"]

        table = Table(title="进程列表", show_header=True)
        table.add_column("PID", style="cyan")
        table.add_column("名称", style="green")
        table.add_column("CPU%", style="yellow")
        table.add_column("内存%", style="red")
        table.add_column("状态", style="magenta")

        for proc in processes[:20]:  # 只显示前20个
            table.add_row(
                str(proc.get("pid", "N/A")),
                proc.get("name", "N/A"),
                f"{proc.get('cpu_percent', 0):.1f}",
                f"{proc.get('memory_percent', 0):.1f}",
                proc.get("status", "N/A"),
            )

        console.print(table)
    else:
        console.print(f"[red]错误: {result.get('error', '未知错误')}[/red]")


@app.command()
def execute(
    command: str = typer.Argument(..., help="要执行的命令"),
    timeout: int = typer.Option(30, "--timeout", "-t", help="超时时间（秒）"),
):
    """执行系统命令"""
    controller = OSController()

    console.print(f"[cyan]执行命令: {command}[/cyan]\n")

    result = controller.execute("execute_command", command=command, timeout=timeout)

    if result["success"]:
        cmd_result = result["result"]
        if cmd_result["success"]:
            if cmd_result["stdout"]:
                console.print(
                    Panel(
                        cmd_result["stdout"],
                        title="[bold green]标准输出[/bold green]",
                        border_style="green",
                    )
                )
            if cmd_result["stderr"]:
                console.print(
                    Panel(
                        cmd_result["stderr"],
                        title="[bold yellow]标准错误[/bold yellow]",
                        border_style="yellow",
                    )
                )
            console.print(f"[green]返回码: {cmd_result['returncode']}[/green]")
        else:
            console.print(f"[red]命令执行失败[/red]")
            if cmd_result["stderr"]:
                console.print(f"[red]{cmd_result['stderr']}[/red]")
    else:
        console.print(f"[red]错误: {result.get('error', '未知错误')}[/red]")


@app.command()
def file_list(
    path: str = typer.Argument(".", help="目录路径"),
    recursive: bool = typer.Option(False, "--recursive", "-r", help="递归列出"),
):
    """列出文件"""
    controller = OSController()

    result = controller.execute("list_files", path=path, recursive=recursive)
    if result["success"]:
        files = result["result"]

        table = Table(title=f"文件列表: {path}", show_header=True)
        table.add_column("名称", style="cyan")
        table.add_column("类型", style="green")
        table.add_column("大小", style="yellow")
        table.add_column("修改时间", style="magenta")

        for file in files[:50]:  # 只显示前50个
            size_str = (
                f"{file.get('size', 0) / 1024:.2f} KB"
                if file.get("size", 0) < 1024**2
                else f"{file.get('size', 0) / (1024**2):.2f} MB"
            )
            table.add_row(
                file.get("name", "N/A"),
                file.get("type", "N/A"),
                size_str,
                file.get("modified", "N/A")[:19] if file.get("modified") else "N/A",
            )

        console.print(table)
        if len(files) > 50:
            console.print(f"[dim]（仅显示前50个，共{len(files)}个）[/dim]")
    else:
        console.print(f"[red]错误: {result.get('error', '未知错误')}[/red]")


@app.command()
def prompt_list():
    """列出所有可用的提示词模板和链"""
    templates = prompt_manager.list_templates()
    chains = prompt_manager.list_chains()

    if templates:
        table = Table(title="可用模板", show_header=True, header_style="bold magenta")
        table.add_column("模板名", style="cyan")
        table.add_column("内容预览", style="yellow")

        for name in templates:
            content = prompt_manager.get_template(name)
            preview = content[:50] + "..." if len(content) > 50 else content
            table.add_row(name, preview)

        console.print(table)
        console.print()

    if chains:
        table = Table(title="可用提示词链", show_header=True, header_style="bold blue")
        table.add_column("链名", style="cyan")
        table.add_column("节点数", style="green")

        for name in chains:
            chain = prompt_manager.get_chain(name)
            if chain:
                table.add_row(name, str(len(chain.nodes)))

        console.print(table)
    else:
        console.print("[yellow]暂无已注册的提示词链[/yellow]")


@app.command()
def prompt_create(
    name: str = typer.Argument(..., help="提示词链名称"),
    role: Optional[str] = typer.Option(None, "--role", "-r", help="角色定义"),
    instruction: Optional[str] = typer.Option(None, "--instruction", "-i", help="指令"),
    context: Optional[str] = typer.Option(None, "--context", help="上下文"),
    constraint: Optional[str] = typer.Option(None, "--constraint", help="约束"),
    example: Optional[str] = typer.Option(None, "--example", "-e", help="示例"),
    output: Optional[Path] = typer.Option(None, "--output", "-o", help="保存到文件"),
):
    """创建提示词链"""
    builder = prompt_manager.create_chain(name)

    if role:
        builder.add_role(role, order=0)
    if instruction:
        builder.add_instruction(instruction, order=10)
    if context:
        builder.add_context(context, order=20)
    if constraint:
        builder.add_constraint(constraint, order=30)
    if example:
        builder.add_example(example, order=40)

    chain = builder.build()
    prompt_manager.register_chain(chain)

    console.print(f"[green]✓ 已创建提示词链: {name}[/green]")
    console.print(
        Panel(
            chain.get_combined(),
            title=f"[bold green]提示词链: {name}[/bold green]",
            border_style="green",
        )
    )

    if output:
        prompt_manager.save_chain(chain, output)
        console.print(f"[green]✓ 已保存到: {output}[/green]")


@app.command()
def prompt_load(file_path: Path = typer.Argument(..., help="提示词文件路径")):
    """从文件加载提示词链"""
    if not file_path.exists():
        console.print(f"[red]错误: 文件不存在: {file_path}[/red]")
        raise typer.Exit(1)

    chain = prompt_manager.load_chain_from_file(file_path)
    if chain:
        console.print(f"[green]✓ 已加载提示词链: {chain.name}[/green]")
        console.print(
            Panel(
                chain.get_combined(),
                title=f"[bold green]提示词链: {chain.name}[/bold green]",
                border_style="green",
            )
        )
    else:
        console.print(f"[red]错误: 加载失败[/red]")
        raise typer.Exit(1)


@app.command()
def db_stats():
    """显示数据库统计信息"""
    stats = db_manager.get_stats()

    table = Table(title="数据库统计", show_header=True, header_style="bold magenta")
    table.add_column("项目", style="cyan")
    table.add_column("数量", style="green")

    table.add_row("对话记录", str(stats["conversations"]))
    table.add_row("提示词链", str(stats["prompt_chains"]))
    table.add_row("用户配置", str(stats["user_configs"]))
    table.add_row("爬虫任务", str(stats["crawler_tasks"]))

    console.print(table)

    if stats.get("crawler_tasks_by_status"):
        console.print("\n[bold]爬虫任务状态分布:[/bold]")
        for status, count in stats["crawler_tasks_by_status"].items():
            console.print(f"  {status}: {count}")


@app.command()
def db_history(
    agent: Optional[str] = typer.Option(None, "--agent", "-a", help="智能体类型"),
    limit: int = typer.Option(10, "--limit", "-l", help="显示数量"),
    session_id: Optional[str] = typer.Option(None, "--session", "-s", help="会话ID"),
):
    """查看对话历史"""
    conversations = db_manager.get_conversations(
        agent_type=agent, session_id=session_id, limit=limit
    )

    if not conversations:
        console.print("[yellow]暂无对话记录[/yellow]")
        return

    table = Table(title="对话历史", show_header=True, header_style="bold magenta")
    table.add_column("时间", style="cyan")
    table.add_column("智能体", style="green")
    table.add_column("用户消息", style="yellow", max_width=40)
    table.add_column("助手回复", style="blue", max_width=40)

    for conv in conversations:
        user_msg = (
            conv.user_message[:50] + "..."
            if len(conv.user_message) > 50
            else conv.user_message
        )
        assistant_msg = (
            conv.assistant_message[:50] + "..."
            if len(conv.assistant_message) > 50
            else conv.assistant_message
        )
        timestamp = (
            conv.timestamp.strftime("%Y-%m-%d %H:%M:%S") if conv.timestamp else "N/A"
        )

        table.add_row(timestamp, conv.agent_type, user_msg, assistant_msg)

    console.print(table)


@app.command()
def db_clear(
    agent: Optional[str] = typer.Option(None, "--agent", "-a", help="智能体类型"),
    session_id: Optional[str] = typer.Option(None, "--session", "-s", help="会话ID"),
    confirm: bool = typer.Option(False, "--yes", "-y", help="确认删除"),
):
    """清空对话历史"""
    if not confirm:
        console.print("[red]请使用 --yes 或 -y 确认删除操作[/red]")
        raise typer.Exit(1)

    count = db_manager.delete_conversations(agent_type=agent, session_id=session_id)

    console.print(f"[green]✓ 已删除 {count} 条对话记录[/green]")


@app.command()
def defense_scan(
    output: Optional[Path] = typer.Option(
        None, "--output", "-o", help="保存报告到文件"
    ),
):
    """执行完整的安全扫描"""

    async def _scan():
        try:
            console.print("[cyan]开始安全扫描...[/cyan]")

            report = await defense_manager.full_scan()

            # 显示摘要
            summary = report.get("summary", {})
            console.print(
                Panel(
                    f"[bold]风险等级:[/bold] {summary.get('risk_level', 'Unknown')}\n"
                    f"[bold]漏洞总数:[/bold] {summary.get('vulnerabilities', {}).get('total', 0)}\n"
                    f"[bold]检测到的攻击:[/bold] {summary.get('attacks', {}).get('total', 0)}",
                    title="[bold green]扫描摘要[/bold green]",
                    border_style="green",
                )
            )

            # 显示漏洞
            vulnerabilities = report.get("vulnerabilities", {}).get("details", [])
            if vulnerabilities:
                table = Table(title="发现的漏洞", show_header=True)
                table.add_column("类型", style="cyan")
                table.add_column("严重程度", style="red")
                table.add_column("描述", style="yellow")

                for vuln in vulnerabilities[:20]:  # 限制显示
                    severity = vuln.get("severity", "Unknown")
                    severity_color = {
                        "Critical": "red",
                        "High": "yellow",
                        "Medium": "blue",
                        "Low": "green",
                    }.get(severity, "white")

                    table.add_row(
                        vuln.get("type", "Unknown"),
                        f"[{severity_color}]{severity}[/{severity_color}]",
                        vuln.get("description", "")[:50],
                    )

                console.print(table)

            # 保存报告
            if output:
                defense_manager.report_generator.save_report(
                    report, output, format="json"
                )
                console.print(f"[green]✓ 报告已保存到: {output}[/green]")
            else:
                # 默认保存
                default_path = Path(
                    f"reports/security_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
                )
                default_path.parent.mkdir(parents=True, exist_ok=True)
                defense_manager.report_generator.save_report(
                    report, default_path, format="json"
                )
                console.print(f"[green]✓ 报告已保存到: {default_path}[/green]")

        except Exception as e:
            logger.error(f"安全扫描错误: {e}")
            console.print(f"[red]错误: {e}[/red]")
            raise typer.Exit(1)

    asyncio.run(_scan())


@app.command()
def defense_monitor(
    start: bool = typer.Option(False, "--start", help="启动监控"),
    stop: bool = typer.Option(False, "--stop", help="停止监控"),
    status: bool = typer.Option(False, "--status", help="查看状态"),
    interval: int = typer.Option(60, "--interval", "-i", help="检查间隔（秒）"),
):
    """防御系统监控"""
    if status:
        status_info = defense_manager.get_status()

        table = Table(title="防御系统状态", show_header=True)
        table.add_column("项目", style="cyan")
        table.add_column("值", style="green")

        table.add_row("监控状态", "运行中" if status_info["monitoring"] else "已停止")
        table.add_row("自动响应", "启用" if status_info["auto_response"] else "禁用")
        table.add_row("封禁IP数", str(status_info["blocked_ips"]))
        table.add_row("漏洞数", str(status_info["vulnerabilities"]))
        table.add_row("检测到的攻击", str(status_info["detected_attacks"]))
        table.add_row("恶意IP数", str(status_info["malicious_ips"]))

        console.print(table)

        # 显示统计信息
        stats = status_info.get("statistics", {})
        if stats:
            console.print("\n[bold]攻击统计:[/bold]")
            for attack_type, count in stats.get("attack_types", {}).items():
                console.print(f"  {attack_type}: {count}")

    elif start:

        async def _start():
            await defense_manager.start_monitoring(interval=interval)

        console.print(f"[green]启动防御监控，检查间隔: {interval}秒[/green]")
        console.print("[yellow]按 Ctrl+C 停止监控[/yellow]")

        try:
            asyncio.run(_start())
        except KeyboardInterrupt:
            asyncio.run(defense_manager.stop_monitoring())
            console.print("\n[yellow]监控已停止[/yellow]")

    elif stop:

        async def _stop():
            await defense_manager.stop_monitoring()

        asyncio.run(_stop())
        console.print("[green]✓ 监控已停止[/green]")

    else:
        console.print("[yellow]请指定 --start, --stop 或 --status[/yellow]")


@app.command()
def defense_blocked(
    list_ips: bool = typer.Option(False, "--list", help="列出被封禁的IP"),
    unblock: Optional[str] = typer.Option(None, "--unblock", "-u", help="解封IP"),
):
    """管理封禁的IP"""
    if list_ips:
        blocked = defense_manager.get_blocked_ips()
        if blocked:
            table = Table(title="封禁的IP列表", show_header=True)
            table.add_column("IP地址", style="red")

            for ip in blocked:
                table.add_row(ip)

            console.print(table)
        else:
            console.print("[yellow]暂无封禁的IP[/yellow]")

    elif unblock:
        if defense_manager.unblock_ip(unblock):
            console.print(f"[green]✓ 已解封IP: {unblock}[/green]")
        else:
            console.print(f"[red]错误: 解封失败或IP未封禁[/red]")

    else:
        console.print("[yellow]请指定 --list 或 --unblock[/yellow]")


@app.command()
def defense_report(
    report_type: str = typer.Option(
        "full", "--type", "-t", help="报告类型 (full/vulnerability/attack)"
    ),
    output: Optional[Path] = typer.Option(
        None, "--output", "-o", help="保存报告到文件"
    ),
):
    """生成防御报告"""
    try:
        if report_type == "full":
            # 需要先执行扫描
            console.print(
                "[yellow]完整报告需要先执行扫描，使用 defense-scan 命令[/yellow]"
            )
            return

        report = defense_manager.generate_report(report_type=report_type)

        if output:
            defense_manager.report_generator.save_report(report, output, format="json")
            console.print(f"[green]✓ 报告已保存到: {output}[/green]")
        else:
            default_path = Path(
                f"reports/{report_type}_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
            )
            default_path.parent.mkdir(parents=True, exist_ok=True)
            defense_manager.report_generator.save_report(
                report, default_path, format="json"
            )
            console.print(f"[green]✓ 报告已保存到: {default_path}[/green]")

        # 显示摘要
        if "summary" in report:
            summary = report["summary"]
            console.print(
                Panel(
                    json.dumps(summary, ensure_ascii=False, indent=2),
                    title=f"[bold green]{report_type} 报告摘要[/bold green]",
                    border_style="green",
                )
            )

    except Exception as e:
        logger.error(f"生成报告错误: {e}")
        console.print(f"[red]错误: {e}[/red]")
        raise typer.Exit(1)


@app.command()
def discover(
    network: Optional[str] = typer.Option(
        None, "--network", "-n", help="网络段（如：192.168.1.0/24），默认自动检测"
    ),
    output: Optional[Path] = typer.Option(
        None, "--output", "-o", help="保存结果到文件"
    ),
):
    """发现内网中的所有目标主机"""

    async def _discover():
        try:
            console.print("[cyan]开始内网发现...[/cyan]")

            hosts = await main_controller.discover_network(network)

            if hosts:
                table = Table(title="发现的主机", show_header=True)
                table.add_column("IP地址", style="cyan")
                table.add_column("主机名", style="green")
                table.add_column("MAC地址", style="yellow")
                table.add_column("开放端口", style="blue")
                table.add_column("授权状态", style="red")

                for host in hosts:
                    ports = ", ".join([str(p) for p in host.get("open_ports", [])[:5]])
                    if len(host.get("open_ports", [])) > 5:
                        ports += "..."

                    auth_status = "已授权" if host.get("authorized") else "未授权"
                    auth_color = "green" if host.get("authorized") else "red"

                    table.add_row(
                        host["ip"],
                        host.get("hostname", "Unknown"),
                        host.get("mac_address", "Unknown"),
                        ports or "None",
                        f"[{auth_color}]{auth_status}[/{auth_color}]",
                    )

                console.print(table)
                console.print(f"\n[green]共发现 {len(hosts)} 个在线主机[/green]")

                # 保存结果
                if output:
                    import json

                    output.write_text(
                        json.dumps(hosts, ensure_ascii=False, indent=2),
                        encoding="utf-8",
                    )
                    console.print(f"[green]✓ 结果已保存到: {output}[/green]")
            else:
                console.print("[yellow]未发现任何在线主机[/yellow]")

        except Exception as e:
            logger.error(f"内网发现错误: {e}")
            console.print(f"[red]错误: {e}[/red]")
            raise typer.Exit(1)

    asyncio.run(_discover())


@app.command()
def authorize(
    target_ip: str = typer.Argument(..., help="目标IP地址"),
    username: str = typer.Option(..., "--username", "-u", help="用户名"),
    password: Optional[str] = typer.Option(None, "--password", "-p", help="密码"),
    key_file: Optional[Path] = typer.Option(
        None, "--key-file", "-k", help="SSH密钥文件"
    ),
    auth_type: str = typer.Option(
        "full", "--type", "-t", help="授权类型 (full/limited/read_only)"
    ),
    description: Optional[str] = typer.Option(None, "--description", "-d", help="描述"),
):
    """授权目标主机"""
    try:
        credentials = {"username": username}

        if password:
            credentials["password"] = password

        if key_file:
            if not key_file.exists():
                console.print(f"[red]错误: 密钥文件不存在: {key_file}[/red]")
                raise typer.Exit(1)
            credentials["key_file"] = str(key_file)

        success = main_controller.authorize_target(
            target_ip=target_ip,
            auth_type=auth_type,
            credentials=credentials,
            description=description,
        )

        if success:
            console.print(f"[green]✓ 已授权目标: {target_ip}[/green]")
        else:
            console.print(f"[red]错误: 授权失败[/red]")
            raise typer.Exit(1)

    except Exception as e:
        logger.error(f"授权错误: {e}")
        console.print(f"[red]错误: {e}[/red]")
        raise typer.Exit(1)


@app.command()
def remote_execute(
    target_ip: str = typer.Argument(..., help="目标IP地址"),
    command: str = typer.Argument(..., help="要执行的命令"),
    output: Optional[Path] = typer.Option(
        None, "--output", "-o", help="保存输出到文件"
    ),
):
    """在授权目标上执行命令"""
    try:
        console.print(f"[cyan]在 {target_ip} 上执行命令: {command}[/cyan]")

        result = main_controller.execute_on_target(target_ip, command)

        if result["success"]:
            console.print(
                Panel(
                    result["output"],
                    title="[bold green]命令输出[/bold green]",
                    border_style="green",
                )
            )

            if result.get("error"):
                console.print(f"[yellow]警告: {result['error']}[/yellow]")

            if output:
                output.write_text(result["output"], encoding="utf-8")
                console.print(f"[green]✓ 输出已保存到: {output}[/green]")
        else:
            console.print(f"[red]错误: {result.get('error', '执行失败')}[/red]")
            raise typer.Exit(1)

    except Exception as e:
        logger.error(f"执行命令错误: {e}")
        console.print(f"[red]错误: {e}[/red]")
        raise typer.Exit(1)


@app.command()
def upload_file(
    target_ip: str = typer.Argument(..., help="目标IP地址"),
    local_file: Path = typer.Argument(..., help="本地文件路径"),
    remote_path: str = typer.Argument(..., help="远程文件路径"),
):
    """上传文件到授权目标"""
    try:
        if not local_file.exists():
            console.print(f"[red]错误: 文件不存在: {local_file}[/red]")
            raise typer.Exit(1)

        console.print(
            f"[cyan]上传文件到 {target_ip}: {local_file} -> {remote_path}[/cyan]"
        )

        result = main_controller.upload_to_target(
            target_ip, str(local_file), remote_path
        )

        if result["success"]:
            console.print(f"[green]✓ 文件上传成功[/green]")
        else:
            console.print(f"[red]错误: {result.get('error', '上传失败')}[/red]")
            raise typer.Exit(1)

    except Exception as e:
        logger.error(f"文件上传错误: {e}")
        console.print(f"[red]错误: {e}[/red]")
        raise typer.Exit(1)


@app.command()
def download_file(
    target_ip: str = typer.Argument(..., help="目标IP地址"),
    remote_path: str = typer.Argument(..., help="远程文件路径"),
    local_file: Path = typer.Argument(..., help="本地保存路径"),
):
    """从授权目标下载文件"""
    try:
        console.print(
            f"[cyan]从 {target_ip} 下载文件: {remote_path} -> {local_file}[/cyan]"
        )

        result = main_controller.download_from_target(
            target_ip, remote_path, str(local_file)
        )

        if result["success"]:
            console.print(f"[green]✓ 文件下载成功[/green]")
        else:
            console.print(f"[red]错误: {result.get('error', '下载失败')}[/red]")
            raise typer.Exit(1)

    except Exception as e:
        logger.error(f"文件下载错误: {e}")
        console.print(f"[red]错误: {e}[/red]")
        raise typer.Exit(1)


@app.command()
def list_targets(
    authorized_only: bool = typer.Option(
        False, "--authorized-only", "-a", help="仅显示已授权的目标"
    ),
):
    """列出所有发现的目标"""
    targets = main_controller.get_targets(authorized_only=authorized_only)

    if targets:
        table = Table(title="目标列表", show_header=True)
        table.add_column("IP地址", style="cyan")
        table.add_column("主机名", style="green")
        table.add_column("开放端口", style="blue")
        table.add_column("授权状态", style="red")

        for target in targets:
            ports = ", ".join([str(p) for p in target.get("open_ports", [])[:5]])
            auth_status = "已授权" if target.get("authorized") else "未授权"
            auth_color = "green" if target.get("authorized") else "red"

            table.add_row(
                target["ip"],
                target.get("hostname", "Unknown"),
                ports or "None",
                f"[{auth_color}]{auth_status}[/{auth_color}]",
            )

        console.print(table)
    else:
        console.print("[yellow]未发现任何目标[/yellow]")


@app.command()
def list_authorizations():
    """列出所有授权"""
    auths = main_controller.auth_manager.list_authorizations(status="active")

    if auths:
        table = Table(title="授权列表", show_header=True)
        table.add_column("目标IP", style="cyan")
        table.add_column("授权类型", style="green")
        table.add_column("用户名", style="yellow")
        table.add_column("创建时间", style="blue")
        table.add_column("描述", style="magenta")

        for auth in auths:
            username = auth.get("credentials", {}).get("username", "N/A")
            created = (
                auth.get("created_at", "N/A")[:19] if auth.get("created_at") else "N/A"
            )

            table.add_row(
                auth["target_ip"],
                auth.get("auth_type", "N/A"),
                username,
                created,
                auth.get("description", "")[:30] or "N/A",
            )

        console.print(table)
    else:
        console.print("[yellow]暂无授权[/yellow]")


@app.command()
def revoke(
    target_ip: str = typer.Argument(..., help="目标IP地址"),
    confirm: bool = typer.Option(False, "--yes", "-y", help="确认撤销"),
):
    """撤销目标授权"""
    if not confirm:
        console.print("[red]请使用 --yes 或 -y 确认撤销操作[/red]")
        raise typer.Exit(1)

    if main_controller.auth_manager.revoke_authorization(target_ip):
        console.print(f"[green]✓ 已撤销授权: {target_ip}[/green]")
    else:
        console.print(f"[red]错误: 授权不存在或撤销失败[/red]")
        raise typer.Exit(1)


def _require_deepseek_api_key() -> None:
    """发布版启动条件：使用 DeepSeek 时必须已配置 API Key，否则退出并提示。"""
    from config import settings

    provider = (settings.llm_provider or "deepseek").strip().lower()
    if provider != "deepseek":
        return
    from utils.model_selector import has_deepseek_api_key

    if has_deepseek_api_key():
        return
    console.print(
        Panel(
            "[yellow]请先配置 DeepSeek API Key 后再启动。[/yellow]\n\n"
            "方式一：环境变量\n  [cyan]export DEEPSEEK_API_KEY=sk-xxx[/cyan]\n\n"
            "方式二：在可执行文件同目录（或当前目录）创建 [cyan].env[/cyan] 文件，内容：\n  [cyan]DEEPSEEK_API_KEY=sk-xxx[/cyan]\n\n"
            "获取 Key: [link]https://platform.deepseek.com[/link]",
            title="[bold]需要配置 DEEPSEEK_API_KEY[/bold]",
            border_style="yellow",
        )
    )
    sys.exit(1)


@app.command()
def config():
    """配置 API Key（交互式）"""
    import keyring
    import getpass

    console.print(
        Panel(
            "[bold]🔑 SecBot API Key 配置[/bold]\n\n"
            "安全存储 API Key 到系统密钥环（keyring）",
            title="配置",
            expand=False,
        )
    )

    providers = ["deepseek", "ollama", "shodan", "virustotal"]
    console.print("\n可用 provider: " + ", ".join(providers))

    provider = typer.prompt("请选择 provider").strip().lower()

    if provider not in providers:
        console.print(f"❌ 无效的 provider: {provider}")
        raise typer.Exit(1)

    current_key = keyring.get_password("secbot", provider)
    if current_key:
        masked = current_key[:8] + "*" * (len(current_key) - 8)
        console.print(f"\n当前 {provider} API Key: {masked}")
        console.print("直接回车保持不变，输入新值覆盖")
    else:
        console.print(f"\n当前 {provider} 未配置")

    new_key = getpass.getpass(f"\n输入新的 {provider} API Key: ")

    if new_key:
        keyring.set_password("secbot", provider, new_key)
        console.print(f"✅ {provider} API Key 已保存到密钥环")
    else:
        console.print("未更改")


@app.command()
def config_show():
    """显示当前 API Key 配置状态"""
    import keyring

    providers = ["deepseek", "ollama", "shodan", "virustotal"]
    console.print(
        Panel("[bold]🔑 当前 API Key 配置状态[/bold]", title="配置状态", expand=False)
    )

    table = Table()
    table.add_column("Provider")
    table.add_column("状态")
    table.add_column("来源")

    for provider in providers:
        key = keyring.get_password("secbot", provider)
        if key:
            masked = key[:8] + "*" * (len(key) - 8)
            table.add_row(provider, f"✅ 已配置", masked)
        else:
            table.add_row(provider, "❌ 未配置", "-")

    console.print(table)
    console.print("\n提示: 使用 [bold]hackbot config[/bold] 命令配置 API Key")


@app.command()
def config_delete(provider: str):
    """删除已配置的 API Key"""
    import keyring

    try:
        keyring.delete_password("secbot", provider)
        console.print(f"✅ {provider} API Key 已删除")
    except keyring.errors.PasswordDeleteError:
        console.print(f"❌ {provider} 未配置或删除失败")


@app.callback(invoke_without_command=True)
def main(ctx: typer.Context):
    """快速上手

    安装后只需一条命令即可进入交互模式（与 Hackbot 对话、执行安全扫描等）：

      hackbot

    开发时可用：python main.py（效果相同）。交互界面内输入 / 可查看斜杠命令（如 /list-tools、/plan、/agent）。
    单次执行示例：hackbot chat "扫描本机开放端口"
    更多命令见下方「Commands」。
    """
    _require_deepseek_api_key()
    if ctx.invoked_subcommand is None:
        ctx.invoke(
            interactive,
            agent="hackbot",
            voice=False,
            verbose=False,
        )


if __name__ == "__main__":
    app()
