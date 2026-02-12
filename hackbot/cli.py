"""
Hackbot CLI 入口（包安装后通过 hackbot / secbot 命令调用）
直接进入交互模式，无子命令 — 类似 opencode 的极简体验。
"""

import uuid
from rich.console import Console

from core.agents.hackbot_agent import HackbotAgent
from core.agents.superhackbot_agent import SuperHackbotAgent
from core.agents.qa_agent import QAAgent
from core.agents.planner_agent import PlannerAgent
from utils.audit import AuditTrail
from core.memory import MemoryManager
from database.manager import DatabaseManager

console = Console()

# ---- 全局实例（轻量，按需初始化） ----

db_manager = DatabaseManager()
_session_id = str(uuid.uuid4())
audit_trail = AuditTrail(db_manager, _session_id)
agents: dict = {}
_planner_agent = PlannerAgent()
_qa_agent = QAAgent()

_AGENT_TYPES = ("hackbot", "superhackbot")


def get_agent(agent_type: str):
    """获取智能体实例（首次请求时创建并缓存）"""
    if agent_type not in _AGENT_TYPES:
        console.print(f"[red]错误: 未知的智能体类型 '{agent_type}'[/red]")
        raise SystemExit(1)
    if agent_type not in agents:
        if agent_type == "hackbot":
            instance = HackbotAgent(name="Hackbot", audit_trail=audit_trail)
        else:
            instance = SuperHackbotAgent(name="SuperHackbot", audit_trail=audit_trail)
        instance.memory = MemoryManager()
        agents[agent_type] = instance
    return agents[agent_type]


def app():
    """hackbot / secbot 命令入口 — 直接进入交互模式。"""
    from hackbot.run_interactive import run_interactive_ui

    run_interactive_ui(
        agent="hackbot",
        voice=False,
        verbose=False,
        console=console,
        get_agent=get_agent,
        agents=agents,
        planner_agent=_planner_agent,
        qa_agent=_qa_agent,
        audit_trail=audit_trail,
    )
