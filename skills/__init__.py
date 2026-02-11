"""
Skills 模块
提供 Markdown 格式的技能管理和加载功能
遵循 OpenAI Agent Skills 标准
"""

from .loader import Skill, SkillManifest, SkillLoader
from .injector import SkillInjector, AgentSkillIntegrator, integrate_skills_with_agent

__all__ = [
    "Skill",
    "SkillManifest",
    "SkillLoader",
    "SkillInjector",
    "AgentSkillIntegrator",
    "integrate_skills_with_agent",
]
