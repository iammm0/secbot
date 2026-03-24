"""
opencode-adapters: MCP and skills compatibility adapters for secbot.
"""

__version__ = "0.1.0"

from opencode_adapters.permissions import PermissionManager, PermissionCategory, PermissionDecision
from opencode_adapters.edit_tools import EditFileTool, WriteFileTool
from opencode_adapters.plan_mode import PlanModeController, SessionMode
from opencode_adapters.mcp_client import MCPManager, MCPServerConfig, MCPConnection
from opencode_adapters.unified_skills import UnifiedSkillInjector, UnifiedSkillLoader, SkillTool
from opencode_adapters.agent_registry import AgentRegistry, AgentInfo, AgentMode, BUILTIN_AGENTS
from opencode_adapters.system_prompts import get_system_prompt_supplement, build_system_prompt, SYSTEM_PROMPTS

__all__ = [
    "PermissionManager",
    "PermissionCategory",
    "PermissionDecision",
    "EditFileTool",
    "WriteFileTool",
    "PlanModeController",
    "SessionMode",
    "MCPManager",
    "MCPServerConfig",
    "MCPConnection",
    "UnifiedSkillInjector",
    "UnifiedSkillLoader",
    "SkillTool",
    "AgentRegistry",
    "AgentInfo",
    "AgentMode",
    "BUILTIN_AGENTS",
    "get_system_prompt_supplement",
    "build_system_prompt",
    "SYSTEM_PROMPTS",
]
