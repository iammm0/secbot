"""
ReAct模式：推理和行动循环
"""
from typing import List, Dict, Any
from agents.base import BaseAgent
from utils.logger import logger


class ReActAgent(BaseAgent):
    """ReAct模式智能体：Reasoning + Acting"""
    
    def __init__(self, name: str = "ReActAgent", system_prompt: str = None, tools: List[Any] = None):
        if system_prompt is None:
            # 默认的 ReAct 模式提示词
            system_prompt = """你是一个使用ReAct模式的智能体。
ReAct模式包含以下步骤：
1. Thought: 思考当前情况
2. Action: 决定采取的行动
3. Observation: 观察行动结果
4. 重复直到完成任务

请按照这个模式工作。"""
        super().__init__(name, system_prompt)
        self.tools = tools or []
        self.thoughts: List[str] = []
    
    async def process(self, user_input: str, **kwargs) -> str:
        """ReAct处理流程"""
        max_iterations = kwargs.get("max_iterations", 5)
        iteration = 0
        
        response_parts = []
        response_parts.append(f"🤔 开始处理: {user_input}\n")
        
        while iteration < max_iterations:
            iteration += 1
            logger.info(f"ReAct迭代 {iteration}/{max_iterations}")
            
            # Thought阶段
            thought = await self._think(user_input, response_parts)
            self.thoughts.append(thought)
            response_parts.append(f"💭 Thought {iteration}: {thought}\n")
            
            # Action阶段
            action = await self._decide_action(thought)
            response_parts.append(f"⚡ Action {iteration}: {action}\n")
            
            # Observation阶段
            observation = await self._observe(action)
            response_parts.append(f"👁️ Observation {iteration}: {observation}\n")
            
            # 检查是否完成任务
            if await self._is_complete(observation):
                response_parts.append(f"✅ 任务完成！\n")
                break
        
        result = "".join(response_parts)
        self.add_message("assistant", result)
        return result
    
    async def _think(self, user_input: str, context: List[str]) -> str:
        """思考阶段"""
        # 这里可以调用LLM进行推理
        return f"分析用户需求: {user_input}"
    
    async def _decide_action(self, thought: str) -> str:
        """决定行动"""
        return f"基于思考 '{thought}' 决定下一步行动"
    
    async def _observe(self, action: str) -> str:
        """观察行动结果"""
        return f"执行了 '{action}'，观察结果"
    
    async def _is_complete(self, observation: str) -> bool:
        """判断是否完成任务"""
        # 简单的完成判断逻辑
        return "完成" in observation or "成功" in observation

