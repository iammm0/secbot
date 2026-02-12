"""
QAAgent：专门处理简单问候与项目/上下文问答
- 简单问候：简要回复，不调用工具、不进入规划流程
- 项目能力/上下文了解：简要说明 Hackbot 能做什么、当前对话上下文
- Ask 模式：带上下文的 LLM 问答，仅回答问题，不执行任何动作
"""

import asyncio
from typing import Optional, List

from core.agents.base import BaseAgent
from utils.logger import logger


# 项目能力简要说明（供「能做什么」类问题使用）
PROJECT_CAPABILITIES = """**Hackbot 能做什么**

1. **安全巡检**：端口扫描、服务识别、漏洞扫描、入侵检测
2. **数字取证**：记录攻击行为、收集证据、支持法律诉讼
3. **信息收集**：系统信息、网络发现、内网主机探测
4. **系统操作**：命令执行、进程/文件查看（需授权）
5. **远程控制**：对授权主机的 SSH/WinRM、上传下载
6. **防御与报告**：安全巡检报告、入侵检测、审计留痕、取证报告

**核心特色：攻击取证**
- 完整记录攻击者 IP、时间、攻击手法
- 固化攻击证据（原始日志、哈希校验）
- 生成符合法律要求的取证报告

直接说出你的需求即可；也可输入 `/plan` 先编写巡检计划，再用 `/start` 执行。"""


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
        system_prompt = """你是 Hackbot 的轻量问答助手。只做简短、友好的回复。
- 问候类：简短回应即可
- 询问「能做什么」「有什么功能」：简要列举安全巡检、数字取证、系统操作、远程控制等能力，并提示用户直接说需求或使用 /plan 编写计划
- 询问对话/上下文：根据当前会话简要说明
不要展开长篇说明，不要调用任何工具。"""
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
        对简单问候/项目能力/上下文类问题做简要回答。
        优先规则匹配，必要时可走 LLM 简短生成。

        Args:
            user_input: 用户输入
            context: 可选，最近几条对话或会话摘要

        Returns:
            简短回复文本
        """
        reply = self._rule_based_reply(user_input.strip())
        if reply is not None:
            return reply

        # 可在此处接入 LLM 做开放式简短回答（如解释上下文）
        # 目前未接 LLM，对未匹配的简单问统一给引导
        return (
            "收到。若是想了解我能做什么，可以说「你能做什么」或「有什么功能」。\n"
            "若要执行巡检、检测或取证任务，直接说出目标或输入 `/plan` 编写巡检计划。"
        )

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

    def _rule_based_reply(self, text: str) -> Optional[str]:
        """规则匹配：问候、感谢、再见、帮助、项目能力等"""
        lower = text.lower().strip()

        # 再见/退出
        if (
            any(x in lower for x in ["再见", "拜拜", "bye", "quit", "exit"])
            and len(text) < 20
        ):
            return "再见！需要时随时叫我。"

        # 感谢
        if any(x in lower for x in ["谢谢", "thanks", "thank you"]) and len(text) < 25:
            return "不客气，有需要再说。"

        # 问候
        if any(x in lower for x in ["早上好", "早安", "上午好"]):
            return "早上好！今天想做什么安全巡检？"
        if "下午好" in lower:
            return "下午好！需要我帮你做巡检或取证吗？"
        if any(x in lower for x in ["晚上好", "晚安"]):
            return "晚上好！有什么可以帮你的？"
        if any(x in lower for x in ["你好", "hello", "hi", "嗨"]) and len(text) < 15:
            return (
                "你好！我是 Hackbot，做安全巡检与数字取证。\n"
                "特色：攻击证据记录，支持法律诉讼。\n"
                "可以说「你能做什么」了解能力，或直接说需求（如：巡检本机服务）。"
            )

        # 项目能力 / 能做什么 / 帮助
        if any(
            kw in lower
            for kw in [
                "你是谁",
                "你是什么",
                "who are you",
                "能做什么",
                "有什么功能",
                "功能介绍",
                "帮助",
                "help",
                "怎么用",
                "如何用",
            ]
        ):
            return PROJECT_CAPABILITIES

        # 天气等无关闲聊
        if any(x in lower for x in ["天气", "weather"]):
            return "我这边没有天气数据，你可以看看窗外～"

        return None
