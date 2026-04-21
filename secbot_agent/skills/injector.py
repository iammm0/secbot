"""
技能注入器 - 在智能体处理过程中自动注入相关技能
"""

from typing import Dict, List, Any
from loguru import logger

from secbot_agent.skills.loader import SkillLoader, Skill, DEFAULT_SKILL_DIR


class SkillInjector:
    """技能注入器 - 将相关技能动态注入到 Agent 上下文中"""

    def __init__(self, skill_dirs: List[str] = None):
        self.loader = SkillLoader(skill_dirs or [str(DEFAULT_SKILL_DIR)])
        self.skills = self.loader.load_all()
        logger.info(f"技能注入器初始化完成，加载 {len(self.skills)} 个技能")

    def find_relevant_skills(self, query: str) -> List[Skill]:
        """根据查询找到相关的技能"""
        query_lower = query.lower()
        matched_skills = []

        for skill in self.skills.values():
            score = 0

            for trigger in skill.manifest.triggers:
                if trigger.lower() in query_lower:
                    score += 10

            for tag in skill.manifest.tags:
                if tag.lower() in query_lower:
                    score += 5

            if score > 0:
                matched_skills.append((skill, score))

        matched_skills.sort(key=lambda x: x[1], reverse=True)
        return [s[0] for s in matched_skills[:3]]

    def inject_into_prompt(self, query: str, system_prompt: str) -> str:
        """
        将相关技能注入到系统提示词中

        Args:
            query: 用户查询
            system_prompt: 原始系统提示词

        Returns:
            注入技能后的系统提示词
        """
        relevant_skills = self.find_relevant_skills(query)

        if not relevant_skills:
            return system_prompt

        parts = [system_prompt]

        parts.append("\n\n=== RELEVANT SKILLS ===")

        for skill in relevant_skills:
            parts.append(f"\n--- SKILL: {skill.manifest.name} ---")
            parts.append(skill.instructions)

        parts.append("\n=== END SKILLS ===")

        logger.info(f"注入 {len(relevant_skills)} 个技能到提示词")
        return "\n".join(parts)

    def get_skill_context(self, query: str) -> str:
        """获取相关技能的上下文文本"""
        relevant_skills = self.find_relevant_skills(query)

        if not relevant_skills:
            return ""

        parts = ["=== SKILL CONTEXT ==="]
        for skill in relevant_skills:
            parts.append(f"\n[{skill.manifest.name}]")
            parts.append(skill.instructions)

        return "\n".join(parts)


class AgentSkillIntegrator:
    """智能体技能集成器 - 将技能系统集成到 Agent 生命周期中"""

    def __init__(self, skill_dirs: List[str] = None):
        self.injector = SkillInjector(skill_dirs)
        self._session_skills: Dict[str, List[Skill]] = {}

    def before_process(self, agent_name: str, query: str, system_prompt: str) -> str:
        """处理前的技能注入"""
        enhanced_prompt = self.injector.inject_into_prompt(query, system_prompt)
        relevant_skills = self.injector.find_relevant_skills(query)
        self._session_skills[agent_name] = relevant_skills
        return enhanced_prompt

    def after_process(self, agent_name: str, response: str, query: str):
        """处理后可记录使用的技能"""
        skills = self._session_skills.get(agent_name, [])
        if skills:
            skill_names = [s.manifest.name for s in skills]
            logger.info(f"Agent {agent_name} 使用技能: {skill_names}")

    def get_session_skills(self, agent_name: str) -> List[Skill]:
        """获取会话中使用的技能"""
        return self._session_skills.get(agent_name, [])

    def list_available_skills(self) -> List[Dict[str, Any]]:
        """列出所有可用技能"""
        return self.injector.loader.list_skills()


def create_skill_injector(skill_dirs: List[str] = None) -> SkillInjector:
    """工厂函数：创建技能注入器"""
    return SkillInjector(skill_dirs)


def integrate_skills_with_agent(agent, skill_dirs: List[str] = None):
    """
    为智能体扩展技能能力

    Usage:
        integrate_skills_with_agent(my_agent)

        # 在 process 时自动注入技能
        enhanced_prompt = my_agent._enhance_prompt_with_skills(user_input)
    """
    integrator = AgentSkillIntegrator(skill_dirs)

    def _enhance_prompt_with_skills(query: str) -> str:
        return integrator.before_process(agent.name, query, agent.system_prompt)

    agent._enhance_prompt_with_skills = _enhance_prompt_with_skills
    agent._skill_integrator = integrator

    logger.info(f"已为 Agent {agent.name} 集成技能系统")
    return agent
