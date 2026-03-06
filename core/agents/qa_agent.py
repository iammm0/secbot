"""
QAAgent：专门处理简单问候与项目/上下文问答
- 所有回复均通过 LLM 生成，不设规则快捷回复
- 问候、闲聊、项目能力、帮助等均走 LLM
- Ask 模式：带上下文的 LLM 问答，仅回答问题，不执行任何动作
"""

import asyncio
from typing import Optional, List

from core.agents.base import BaseAgent
from utils.logger import logger


# Ask 模式系统提示词
ASK_SYSTEM_PROMPT = """你是 Hackbot 的 Ask 模式助手。你的任务是**仅根据当前对话上下文**来回答用户的问题。

规则：
- 仅根据对话上下文中已有的信息来回答
- 如果上下文中没有相关信息，坦诚说明「当前对话中暂无相关信息」
- 不要编造或猜测上下文中不存在的数据
- 不要调用任何工具，不要执行任何操作
- 回答应简洁、准确、有条理
- 如果涉及扫描结果、漏洞发现等安全数据，引用上下文中的具体内容
- 使用 Markdown 格式化输出以提高可读性"""


class QAAgent(BaseAgent):
    """
    问答 Agent：仅做简短回复，不调用工具、不生成执行计划。
    用于：问候、闲聊、了解项目能力、了解对话上下文等。

    Ask 模式：带上下文的 LLM 问答。
    """

    def __init__(self, name: str = "QAAgent"):
        system_prompt = """你是 Hackbot 的轻量问答助手。对用户的问候、闲聊、能力询问等做自然、友好的回复。
- 问候类：自然回应，可带一点个性
- 询问「能做什么」「有什么功能」：简要列举安全巡检、漏洞挖掘、红队攻击测试、系统操作、远程控制等能力，并提示用户直接说需求
- 闲聊：自然对话，保持友好
- 询问对话/上下文：根据当前会话简要说明
回复应简洁，不要展开长篇说明，不要调用任何工具。"""
        super().__init__(name=name, system_prompt=system_prompt)
        self._llm = None  # 延迟初始化
        logger.info("初始化 QAAgent")

    def _ensure_llm(self):
        """延迟创建 LLM 实例（仅 ask 模式需要）"""
        if self._llm is None:
            try:
                from core.patterns.security_react import _create_llm

                self._llm = _create_llm()
                logger.info("QAAgent: LLM 实例已创建（用于 Ask 模式）")
            except Exception as e:
                logger.error(f"QAAgent: 创建 LLM 实例失败: {e}")
                raise

    async def process(self, user_input: str, **kwargs) -> str:
        """BaseAgent 接口：处理用户输入并返回简短回复"""
        return await self.answer(user_input, context=kwargs.get("context"))

    async def answer(
        self,
        user_input: str,
        context: Optional[List[dict]] = None,
    ) -> str:
        """
        对简单问候/项目能力/闲聊等做回复，统一通过 LLM 生成，不设快捷回复。

        Args:
            user_input: 用户输入
            context: 可选，最近几条对话或会话摘要

        Returns:
            LLM 生成的回复文本
        """
        return await self._answer_via_llm(user_input, context)

    async def answer_with_context(
        self,
        user_input: str,
        conversation_history: List[dict],
    ) -> str:
        """
        Ask 模式：带对话上下文的 LLM 问答。
        仅根据上下文回答问题，不执行任何动作。

        Args:
            user_input: 用户当前的问题
            conversation_history: 对话历史，格式 [{"role": "user"|"assistant", "content": "..."}]

        Returns:
            LLM 根据上下文生成的回答
        """
        from langchain_core.messages import SystemMessage, HumanMessage, AIMessage

        self._ensure_llm()

        # 构建消息列表
        messages = [SystemMessage(content=ASK_SYSTEM_PROMPT)]

        # 注入对话上下文
        if conversation_history:
            # 限制上下文长度，取最近 20 条对话避免 token 超限
            recent = conversation_history[-20:]
            context_lines = []
            for msg in recent:
                role_label = "用户" if msg.get("role") == "user" else "助手"
                content = msg.get("content", "")
                # 截断过长的单条消息
                if len(content) > 2000:
                    content = content[:2000] + "\n... (已截断)"
                context_lines.append(f"[{role_label}]: {content}")

            context_block = "\n\n".join(context_lines)
            messages.append(
                HumanMessage(content=f"以下是当前对话的上下文记录：\n\n{context_block}")
            )
            messages.append(
                AIMessage(content="好的，我已了解当前对话上下文。请问你想了解什么？")
            )

        # 用户的实际问题
        messages.append(HumanMessage(content=user_input))

        try:
            response = await asyncio.wait_for(self._llm.ainvoke(messages), timeout=30.0)
            if hasattr(response, "content") and response.content:
                return str(response.content)
            return str(response)
        except asyncio.TimeoutError:
            return "Ask 模式回答超时，请稍后重试。"
        except Exception as e:
            logger.error(f"QAAgent ask_with_context 错误: {e}")
            return f"Ask 模式回答出错: {e}"

    async def _answer_via_llm(
        self,
        user_input: str,
        context: Optional[List[dict]] = None,
    ) -> str:
        """通过 LLM 生成回复，不设规则快捷回复"""
        from langchain_core.messages import SystemMessage, HumanMessage

        self._ensure_llm()

        user_content = user_input.strip()
        if context and isinstance(context, list):
            recent = context[-10:]
            lines = []
            for item in recent:
                role = item.get("role", "")
                content = item.get("content", "") or item.get("text", "")
                if content and len(str(content)) < 1500:
                    label = "用户" if role == "user" else "助手"
                    lines.append(f"[{label}]: {content}")
            if lines:
                user_content = "以下是近期对话：\n" + "\n".join(lines) + "\n\n用户当前说：\n" + user_content

        messages = [
            SystemMessage(content=self.system_prompt or ""),
            HumanMessage(content=user_content),
        ]

        try:
            response = await asyncio.wait_for(
                self._llm.ainvoke(messages), timeout=30.0
            )
            if hasattr(response, "content") and response.content:
                return str(response.content).strip()
            return str(response).strip()
        except asyncio.TimeoutError:
            return "回复超时，请稍后重试。"
        except Exception as e:
            logger.error(f"QAAgent answer LLM 错误: {e}")
            return f"回复出错: {e}"
