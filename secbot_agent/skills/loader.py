"""
技能加载器 - 加载和管理 Markdown 格式的技能
遵循 OpenAI Agent Skills 标准
"""

import re
import yaml
from pathlib import Path
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field
from loguru import logger

# 内置技能 Markdown 根目录（secbot_agent/skills/base/<技能名>/SKILL.md）
DEFAULT_SKILL_DIR = Path(__file__).resolve().parent / "base"


@dataclass
class SkillManifest:
    """技能清单 - SKILL.md 的 YAML frontmatter"""

    name: str
    description: str
    version: str = "1.0.0"
    author: str = ""
    tags: List[str] = field(default_factory=list)
    triggers: List[str] = field(default_factory=list)
    prerequisites: List[str] = field(default_factory=list)


@dataclass
class Skill:
    """技能单元"""

    manifest: SkillManifest
    instructions: str
    scripts: Dict[str, str] = field(default_factory=dict)
    references: Dict[str, str] = field(default_factory=dict)
    assets: Dict[str, Path] = field(default_factory=dict)
    skill_path: Path = None


class SkillLoader:
    """技能加载器"""

    SKILL_FILE = "SKILL.md"
    SCRIPTS_DIR = "scripts"
    REFERENCES_DIR = "references"
    ASSETS_DIR = "assets"

    FRONTMATTER_REGEX = re.compile(r"^---\n(.*?)\n---\n(.*)$", re.DOTALL | re.MULTILINE)

    def __init__(self, skills_dirs: List[str] = None):
        self.skills_dirs = skills_dirs or [str(DEFAULT_SKILL_DIR)]
        self.loaded_skills: Dict[str, Skill] = {}

    def _parse_frontmatter(self, content: str) -> tuple[Optional[Dict], str]:
        """解析 YAML frontmatter"""
        match = self.FRONTMATTER_REGEX.match(content)
        if match:
            frontmatter_str = match.group(1)
            instructions = match.group(2).strip()
            try:
                manifest_dict = yaml.safe_load(frontmatter_str)
                return manifest_dict, instructions
            except yaml.YAMLError as e:
                logger.error(f"解析 frontmatter 失败: {e}")
                return None, content
        return None, content

    def _load_skill(self, skill_path: Path) -> Optional[Skill]:
        """加载单个技能"""
        skill_file = skill_path / self.SKILL_FILE
        if not skill_file.exists():
            logger.warning(f"技能文件不存在: {skill_file}")
            return None

        try:
            content = skill_file.read_text(encoding="utf-8")
            manifest_dict, instructions = self._parse_frontmatter(content)

            if not manifest_dict:
                manifest_dict = {
                    "name": skill_path.name,
                    "description": content[:200] + "..."
                    if len(content) > 200
                    else content,
                }

            manifest = SkillManifest(
                name=manifest_dict.get("name", skill_path.name),
                description=manifest_dict.get("description", ""),
                version=manifest_dict.get("version", "1.0.0"),
                author=manifest_dict.get("author", ""),
                tags=manifest_dict.get("tags", []),
                triggers=manifest_dict.get("triggers", []),
                prerequisites=manifest_dict.get("prerequisites", []),
            )

            skill = Skill(
                manifest=manifest, instructions=instructions, skill_path=skill_path
            )

            scripts_dir = skill_path / self.SCRIPTS_DIR
            if scripts_dir.exists():
                for script_file in scripts_dir.glob("*"):
                    if script_file.is_file():
                        skill.scripts[script_file.name] = script_file.read_text(
                            encoding="utf-8"
                        )

            references_dir = skill_path / self.REFERENCES_DIR
            if references_dir.exists():
                for ref_file in references_dir.glob("*"):
                    if ref_file.is_file():
                        skill.references[ref_file.name] = ref_file.read_text(
                            encoding="utf-8"
                        )

            assets_dir = skill_path / self.ASSETS_DIR
            if assets_dir.exists():
                for asset_file in assets_dir.glob("*"):
                    if asset_file.is_file():
                        skill.assets[asset_file.name] = asset_file

            logger.info(f"加载技能: {manifest.name} v{manifest.version}")
            return skill

        except Exception as e:
            logger.error(f"加载技能失败 {skill_path}: {e}")
            return None

    def load_all(self) -> Dict[str, Skill]:
        """加载所有技能"""
        self.loaded_skills.clear()

        for skills_dir in self.skills_dirs:
            base_path = Path(skills_dir)
            if not base_path.exists():
                continue

            for skill_dir in base_path.iterdir():
                if skill_dir.is_dir():
                    skill = self._load_skill(skill_dir)
                    if skill and skill.manifest.name:
                        self.loaded_skills[skill.manifest.name] = skill

        logger.info(f"已加载 {len(self.loaded_skills)} 个技能")
        return self.loaded_skills

    def get_skill(self, name: str) -> Optional[Skill]:
        """获取指定技能"""
        return self.loaded_skills.get(name)

    def get_skills_by_tag(self, tag: str) -> List[Skill]:
        """按标签获取技能"""
        return [
            skill for skill in self.loaded_skills.values() if tag in skill.manifest.tags
        ]

    def get_skills_by_triggers(self, query: str) -> List[Skill]:
        """根据触发词获取技能"""
        query_lower = query.lower()
        matched = []

        for skill in self.loaded_skills.values():
            for trigger in skill.manifest.triggers:
                if trigger.lower() in query_lower:
                    matched.append(skill)
                    break

        return matched

    def list_skills(self) -> List[Dict[str, Any]]:
        """列出所有技能概要"""
        return [
            {
                "name": skill.manifest.name,
                "description": skill.manifest.description,
                "version": skill.manifest.version,
                "tags": skill.manifest.tags,
                "triggers": skill.manifest.triggers,
            }
            for skill in self.loaded_skills.values()
        ]
