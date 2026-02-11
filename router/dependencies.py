"""
共享依赖 — 单例化核心服务实例，供所有路由共用。
与 hackbot/cli.py 中的初始化逻辑保持一致。
"""

import uuid
from functools import lru_cache

from core.agents.hackbot_agent import HackbotAgent
from core.agents.superhackbot_agent import SuperHackbotAgent
from core.agents.qa_agent import QAAgent
from core.agents.planner_agent import PlannerAgent
from core.agents.summary_agent import SummaryAgent
from database.manager import DatabaseManager
from memory.database_memory import DatabaseMemory
from defense.defense_manager import DefenseManager
from controller.controller import MainController
from system.controller import OSController
from system.detector import OSDetector
from prompts.manager import PromptManager
from utils.audit import AuditTrail


# ---------------------------------------------------------------------------
# 全局会话 ID（服务器生命周期内唯一）
# ---------------------------------------------------------------------------
_session_id = str(uuid.uuid4())


# ---------------------------------------------------------------------------
# 延迟初始化的单例容器
# ---------------------------------------------------------------------------
class _Singletons:
    """延迟初始化，避免 import 时就加载重型模块。"""

    _db_manager: DatabaseManager | None = None
    _prompt_manager: PromptManager | None = None
    _audit_trail: AuditTrail | None = None
    _agents: dict | None = None
    _qa_agent: QAAgent | None = None
    _planner_agent: PlannerAgent | None = None
    _summary_agent: SummaryAgent | None = None
    _defense_manager: DefenseManager | None = None
    _main_controller: MainController | None = None
    _os_controller: OSController | None = None
    _os_detector: OSDetector | None = None

    # -- 数据库 --
    @classmethod
    def db_manager(cls) -> DatabaseManager:
        if cls._db_manager is None:
            cls._db_manager = DatabaseManager()
        return cls._db_manager

    # -- 提示词管理器 --
    @classmethod
    def prompt_manager(cls) -> PromptManager:
        if cls._prompt_manager is None:
            cls._prompt_manager = PromptManager(db_manager=cls.db_manager())
        return cls._prompt_manager

    # -- 审计留痕 --
    @classmethod
    def audit_trail(cls) -> AuditTrail:
        if cls._audit_trail is None:
            cls._audit_trail = AuditTrail(cls.db_manager(), _session_id)
        return cls._audit_trail

    # -- 智能体 --
    @classmethod
    def agents(cls) -> dict:
        if cls._agents is None:
            audit = cls.audit_trail()
            cls._agents = {
                "hackbot": HackbotAgent(name="Hackbot", audit_trail=audit),
                "superhackbot": SuperHackbotAgent(
                    name="SuperHackbot", audit_trail=audit
                ),
            }
            # 为智能体添加数据库记忆
            for agent_name, agent_instance in cls._agents.items():
                db_memory = DatabaseMemory(
                    cls.db_manager(), agent_type=agent_name, session_id=_session_id
                )
                agent_instance.db_memory = db_memory
        return cls._agents

    @classmethod
    def qa_agent(cls) -> QAAgent:
        if cls._qa_agent is None:
            cls._qa_agent = QAAgent()
        return cls._qa_agent

    @classmethod
    def planner_agent(cls) -> PlannerAgent:
        if cls._planner_agent is None:
            cls._planner_agent = PlannerAgent()
        return cls._planner_agent

    @classmethod
    def summary_agent(cls) -> SummaryAgent:
        if cls._summary_agent is None:
            cls._summary_agent = SummaryAgent()
        return cls._summary_agent

    # -- 防御管理器 --
    @classmethod
    def defense_manager(cls) -> DefenseManager:
        if cls._defense_manager is None:
            cls._defense_manager = DefenseManager(auto_response=True)
        return cls._defense_manager

    # -- 主控制器（网络发现 + 远程控制） --
    @classmethod
    def main_controller(cls) -> MainController:
        if cls._main_controller is None:
            cls._main_controller = MainController()
        return cls._main_controller

    # -- 系统控制 / 检测 --
    @classmethod
    def os_controller(cls) -> OSController:
        if cls._os_controller is None:
            cls._os_controller = OSController()
        return cls._os_controller

    @classmethod
    def os_detector(cls) -> OSDetector:
        if cls._os_detector is None:
            cls._os_detector = OSDetector()
        return cls._os_detector


# ---------------------------------------------------------------------------
# FastAPI Depends 快捷函数
# ---------------------------------------------------------------------------


def get_db_manager() -> DatabaseManager:
    return _Singletons.db_manager()


def get_prompt_manager() -> PromptManager:
    return _Singletons.prompt_manager()


def get_agents() -> dict:
    return _Singletons.agents()


def get_agent(agent_type: str):
    """获取指定类型的智能体，不存在时抛出 ValueError。"""
    agents_map = _Singletons.agents()
    if agent_type not in agents_map:
        raise ValueError(
            f"未知的智能体类型 '{agent_type}'，可选: {', '.join(agents_map.keys())}"
        )
    return agents_map[agent_type]


def get_qa_agent() -> QAAgent:
    return _Singletons.qa_agent()


def get_planner_agent() -> PlannerAgent:
    return _Singletons.planner_agent()


def get_summary_agent() -> SummaryAgent:
    return _Singletons.summary_agent()


def get_defense_manager() -> DefenseManager:
    return _Singletons.defense_manager()


def get_main_controller() -> MainController:
    return _Singletons.main_controller()


def get_os_controller() -> OSController:
    return _Singletons.os_controller()


def get_os_detector() -> OSDetector:
    return _Singletons.os_detector()


def get_session_id() -> str:
    return _session_id
