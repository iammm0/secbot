"""
Hackbot — 直接进入交互模式（无子命令，类似 opencode）
开发时: python main.py
"""

import sys
import json
from pathlib import Path
from typing import Optional
from rich.console import Console
from rich.panel import Panel
from rich.table import Table

from core.agents.planner_agent import PlannerAgent
from core.agents.qa_agent import QAAgent
from core.agents.hackbot_agent import HackbotAgent
from core.agents.superhackbot_agent import SuperHackbotAgent
from utils.logger import logger
from utils.audit import AuditTrail
from core.memory import MemoryManager
from database.manager import DatabaseManager
from defense.defense_manager import DefenseManager
from controller.controller import MainController
from system.controller import OSController
from system.detector import OSDetector
from prompts.manager import PromptManager
from datetime import datetime
import uuid

console = Console()

# ---- 全局实例 ----

db_manager = DatabaseManager()
prompt_manager = PromptManager(db_manager=db_manager)
_session_id = str(uuid.uuid4())
audit_trail = AuditTrail(db_manager, _session_id)
agents: dict = {}
planner_agent = PlannerAgent()
qa_agent = QAAgent()
defense_manager = DefenseManager(auto_response=True)
main_controller = MainController()

_AGENT_TYPES = ("hackbot", "superhackbot")


def get_agent(agent_type: str):
    """获取智能体实例（首次请求时创建并缓存）"""
    if agent_type not in _AGENT_TYPES:
        console.print(f"[red]错误: 未知的智能体类型 '{agent_type}'[/red]")
        sys.exit(1)
    if agent_type not in agents:
        if agent_type == "hackbot":
            instance = HackbotAgent(name="Hackbot", audit_trail=audit_trail)
        else:
            instance = SuperHackbotAgent(name="SuperHackbot", audit_trail=audit_trail)
        instance.memory = MemoryManager()
        agents[agent_type] = instance
    return agents[agent_type]


# ---- 斜杠命令处理函数（供交互式界面的 /xxx 使用） ----

def _list_agents():
    table = Table(title="可用智能体", show_header=True, header_style="bold magenta")
    table.add_column("类型", style="cyan")
    table.add_column("名称", style="green")
    table.add_column("描述", style="yellow")
    table.add_row("hackbot", "Hackbot", "自动模式（ReAct，基础扫描，全自动）")
    table.add_row("superhackbot", "SuperHackbot", "专家模式（ReAct，全工具，敏感操作需确认）")
    console.print(table)


def _list_tools(agent="all", category="all", verbose=False):
    from tools.pentest.security import (
        CORE_SECURITY_TOOLS, BASIC_SECURITY_TOOLS, ADVANCED_SECURITY_TOOLS, ALL_SECURITY_TOOLS,
    )
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
    if agent == "hackbot":
        allowed = set(t.name for t in BASIC_SECURITY_TOOLS)
    elif agent == "superhackbot":
        allowed = set(t.name for t in ALL_SECURITY_TOOLS)
    else:
        allowed = None
    table = Table(title="已集成工具", show_header=True, header_style="bold magenta")
    table.add_column("名称", style="cyan")
    table.add_column("描述", style="yellow", max_width=60 if not verbose else None)
    table.add_column("分类", style="green")
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
            agents_str = "superhackbot" if id(t) in advanced_set else "hackbot, superhackbot"
            desc = t.description if verbose else (t.description[:57] + "..." if len(t.description) > 60 else t.description)
            table.add_row(t.name, desc, cat_label)
    console.print(table)


def _system_info():
    detector = OSDetector()
    info = detector.detect()
    table = Table(title="系统信息", show_header=True, header_style="bold magenta")
    table.add_column("项目", style="cyan")
    table.add_column("值", style="green")
    table.add_row("操作系统类型", info.os_type)
    table.add_row("操作系统名称", info.os_name)
    table.add_row("操作系统版本", info.os_version)
    table.add_row("架构", info.architecture)
    table.add_row("Python版本", info.python_version)
    table.add_row("主机名", info.hostname)
    table.add_row("用户名", info.username)
    console.print(table)


def _system_status():
    controller = OSController()
    cpu_info = controller.execute("get_cpu_info")
    if cpu_info["success"]:
        cpu = cpu_info["result"]
        console.print(Panel(
            f"CPU核心数: {cpu.get('count', 'N/A')}\nCPU使用率: {cpu.get('percent', 0):.1f}%",
            title="[bold blue]CPU[/bold blue]", border_style="blue",
        ))
    mem_info = controller.execute("get_memory_info")
    if mem_info["success"]:
        mem = mem_info["result"]
        console.print(Panel(
            f"总内存: {mem.get('total', 0) / (1024**3):.2f} GB\n已使用: {mem.get('used', 0) / (1024**3):.2f} GB ({mem.get('percent', 0):.1f}%)",
            title="[bold green]内存[/bold green]", border_style="green",
        ))


def _db_stats():
    stats = db_manager.get_stats()
    table = Table(title="数据库统计", show_header=True, header_style="bold magenta")
    table.add_column("项目", style="cyan")
    table.add_column("数量", style="green")
    table.add_row("对话记录", str(stats["conversations"]))
    table.add_row("提示词链", str(stats["prompt_chains"]))
    table.add_row("用户配置", str(stats["user_configs"]))
    console.print(table)


def _db_history(limit=10):
    conversations = db_manager.get_conversations(limit=limit)
    if not conversations:
        console.print("[yellow]暂无对话记录[/yellow]")
        return
    table = Table(title="对话历史", show_header=True, header_style="bold magenta")
    table.add_column("时间", style="cyan")
    table.add_column("智能体", style="green")
    table.add_column("用户消息", style="yellow", max_width=40)
    table.add_column("助手回复", style="blue", max_width=40)
    for conv in conversations:
        user_msg = conv.user_message[:50] + "..." if len(conv.user_message) > 50 else conv.user_message
        assistant_msg = conv.assistant_message[:50] + "..." if len(conv.assistant_message) > 50 else conv.assistant_message
        timestamp = conv.timestamp.strftime("%Y-%m-%d %H:%M:%S") if conv.timestamp else "N/A"
        table.add_row(timestamp, conv.agent_type, user_msg, assistant_msg)
    console.print(table)


def _defense_scan():
    import asyncio
    async def _scan():
        report = await defense_manager.full_scan()
        summary = report.get("summary", {})
        console.print(Panel(
            f"风险等级: {summary.get('risk_level', 'Unknown')}\n漏洞总数: {summary.get('vulnerabilities', {}).get('total', 0)}",
            title="[bold green]扫描摘要[/bold green]", border_style="green",
        ))
    asyncio.run(_scan())


def _defense_blocked():
    blocked = defense_manager.get_blocked_ips()
    if blocked:
        table = Table(title="封禁的IP列表", show_header=True)
        table.add_column("IP地址", style="red")
        for ip in blocked:
            table.add_row(ip)
        console.print(table)
    else:
        console.print("[yellow]暂无封禁的IP[/yellow]")


def _defense_report():
    console.print("[yellow]完整报告需要先执行扫描，使用 /defense-scan 命令[/yellow]")


def _prompt_list():
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


def _list_targets():
    targets = main_controller.get_targets()
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
            table.add_row(target["ip"], target.get("hostname", "Unknown"), ports or "None", f"[{auth_color}]{auth_status}[/{auth_color}]")
        console.print(table)
    else:
        console.print("[yellow]未发现任何目标[/yellow]")


def _list_authorizations():
    auths = main_controller.auth_manager.list_authorizations(status="active")
    if auths:
        table = Table(title="授权列表", show_header=True)
        table.add_column("目标IP", style="cyan")
        table.add_column("授权类型", style="green")
        table.add_column("用户名", style="yellow")
        for auth in auths:
            username = auth.get("credentials", {}).get("username", "N/A")
            table.add_row(auth["target_ip"], auth.get("auth_type", "N/A"), username)
        console.print(table)
    else:
        console.print("[yellow]暂无授权[/yellow]")


def _slash_parse_list_tools(rest: str):
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


def _slash_parse_limit(rest: str, default: int = 10):
    try:
        n = int((rest or "").strip().split()[-1]) if rest else default
        return {"limit": max(1, min(n, 100))}
    except (ValueError, IndexError):
        return {"limit": default}


def _build_slash_cli_handlers():
    """构建斜杠命令 -> CLI 处理器的映射（供交互式界面的 /xxx 使用）"""
    return {
        "/list-agents": lambda rest: _list_agents(),
        "/list-tools": lambda rest: _list_tools(**_slash_parse_list_tools(rest or "")),
        "/clear": lambda rest: None,  # 由 run_interactive 内部处理
        "/system-info": lambda rest: _system_info(),
        "/system-status": lambda rest: _system_status(),
        "/prompt-list": lambda rest: _prompt_list(),
        "/db-stats": lambda rest: _db_stats(),
        "/db-history": lambda rest: _db_history(**_slash_parse_limit(rest)),
        "/defense-scan": lambda rest: _defense_scan(),
        "/defense-blocked": lambda rest: _defense_blocked(),
        "/defense-report": lambda rest: _defense_report(),
        "/list-targets": lambda rest: _list_targets(),
        "/list-authorizations": lambda rest: _list_authorizations(),
    }


# ---- 入口：直接进入交互模式 ----

def main():
    """hackbot 入口 — 直接进入交互模式，无子命令。"""
    from hackbot.run_interactive import run_interactive_ui

    run_interactive_ui(
        agent="hackbot",
        voice=False,
        verbose=False,
        console=console,
        get_agent=get_agent,
        agents=agents,
        planner_agent=planner_agent,
        qa_agent=qa_agent,
        audit_trail=audit_trail,
        cli_handlers=_build_slash_cli_handlers(),
    )


if __name__ == "__main__":
    main()
