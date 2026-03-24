"""
Unified skills layer for secbot.

Merges secbot's native SkillLoader/SkillInjector with opencode-style
skill discovery (external dirs, remote URLs, SKILL.md convention).
Supports both:
  - Auto-injection: matching skills injected into system prompts (secbot native)
  - Explicit tool loading: on-demand skill content retrieval (opencode style)
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Dict, List, Optional

from skills.loader import Skill, SkillLoader, SkillManifest
from skills.injector import SkillInjector
from tools.base import BaseTool, ToolResult
from utils.logger import logger

EXTERNAL_SKILL_DIRS = [".claude", ".agents"]
SKILL_FILENAME = "SKILL.md"


def _discover_external_dirs() -> List[str]:
    """Discover external skill directories (e.g. ~/.claude/skills, ~/.agents/skills)."""
    dirs = []
    home = Path.home()
    for ext in EXTERNAL_SKILL_DIRS:
        candidate = home / ext / "skills"
        if candidate.is_dir():
            dirs.append(str(candidate))

    parent = Path.cwd()
    for _ in range(10):
        for ext in EXTERNAL_SKILL_DIRS:
            candidate = parent / ext / "skills"
            if candidate.is_dir():
                dirs.append(str(candidate))
        if parent.parent == parent:
            break
        parent = parent.parent

    return list(dict.fromkeys(dirs))


def _discover_opencode_config_dirs(project_dir: Optional[str] = None) -> List[str]:
    """Discover skill directories from opencode config (skill/ or skills/ in config dir)."""
    dirs = []
    root = Path(project_dir) if project_dir else Path.cwd()

    for pattern in ["skill", "skills", ".opencode/skills"]:
        candidate = root / pattern
        if candidate.is_dir():
            dirs.append(str(candidate))

    global_config = Path.home() / ".config" / "opencode" / "skills"
    if global_config.is_dir():
        dirs.append(str(global_config))

    return dirs


class UnifiedSkillLoader:
    """
    Extends secbot's SkillLoader with opencode-style discovery sources.

    Skill sources (in priority order):
    1. secbot native: ./skills/base/*, ./skills/custom/*
    2. opencode project: .opencode/skills/*, skill/*, skills/*
    3. External: ~/.claude/skills/*, ~/.agents/skills/*
    4. Ancestor directories: ../.claude/skills/* (up to 10 levels)
    5. Global opencode: ~/.config/opencode/skills/*
    6. Custom paths from config
    """

    def __init__(
        self,
        secbot_dirs: Optional[List[str]] = None,
        extra_dirs: Optional[List[str]] = None,
        project_dir: Optional[str] = None,
    ):
        all_dirs = list(secbot_dirs or ["./skills"])
        all_dirs.extend(_discover_opencode_config_dirs(project_dir))
        all_dirs.extend(_discover_external_dirs())
        if extra_dirs:
            all_dirs.extend(extra_dirs)

        seen = set()
        deduped = []
        for d in all_dirs:
            resolved = str(Path(d).resolve())
            if resolved not in seen:
                seen.add(resolved)
                deduped.append(d)

        self._loader = SkillLoader(deduped)
        self._skills: Dict[str, Skill] = {}

    def load_all(self) -> Dict[str, Skill]:
        self._skills = self._loader.load_all()
        logger.info(f"Unified skill loader: {len(self._skills)} skills from {len(self._loader.skills_dirs)} dirs")
        return self._skills

    def get(self, name: str) -> Optional[Skill]:
        return self._skills.get(name) or self._loader.get_skill(name)

    def all(self) -> List[Skill]:
        return list(self._skills.values())

    def list_info(self) -> List[Dict[str, Any]]:
        return self._loader.list_skills()


class UnifiedSkillInjector:
    """
    Unified skill injector that supports both auto-injection and explicit tool loading.

    - Auto-injection: uses trigger/tag matching from secbot's SkillInjector
    - Explicit: provides a `skill` tool that loads skill content on demand (opencode style)
    """

    def __init__(
        self,
        secbot_dirs: Optional[List[str]] = None,
        extra_dirs: Optional[List[str]] = None,
        project_dir: Optional[str] = None,
    ):
        self._loader = UnifiedSkillLoader(secbot_dirs, extra_dirs, project_dir)
        self._loader.load_all()
        self._injector = SkillInjector.__new__(SkillInjector)
        self._injector.loader = self._loader._loader
        self._injector.skills = self._loader._skills

    def inject_into_prompt(self, query: str, system_prompt: str) -> str:
        return self._injector.inject_into_prompt(query, system_prompt)

    def get_skill_context(self, query: str) -> str:
        return self._injector.get_skill_context(query)

    def get_skill_content(self, name: str) -> Optional[str]:
        skill = self._loader.get(name)
        if skill:
            return skill.instructions
        return None

    def list_skills(self) -> List[Dict[str, Any]]:
        return self._loader.list_info()

    def create_skill_tool(self) -> "SkillTool":
        return SkillTool(self)


class SkillTool(BaseTool):
    """
    Explicit skill loading tool (matches opencode SkillTool semantics).

    When called with a skill name, loads and returns the skill content
    for injection into the agent's context.
    """

    def __init__(self, injector: UnifiedSkillInjector):
        super().__init__(
            name="skill",
            description=(
                "Load a skill by name and return its content. "
                "Use this to access specialized knowledge and instructions."
            ),
        )
        self._injector = injector

    async def execute(self, name: str = "", **kwargs) -> ToolResult:
        if not name:
            skills = self._injector.list_skills()
            listing = "\n".join(f"- {s['name']}: {s['description']}" for s in skills)
            return ToolResult(success=True, result=f"Available skills:\n{listing}")

        content = self._injector.get_skill_content(name)
        if content is None:
            return ToolResult(
                success=False,
                result=None,
                error=f"Skill not found: {name}",
            )

        return ToolResult(
            success=True,
            result=f"<skill_content name=\"{name}\">\n{content}\n</skill_content>",
        )

    def get_schema(self) -> dict:
        return {
            "name": self.name,
            "description": self.description,
            "parameters": {
                "name": {
                    "type": "string",
                    "description": "Name of the skill to load (empty to list all)",
                },
            },
        }
