"""
QAAgent：专门处理简单问候与项目/上下文问答
- 简单问候：简要回复，不调用工具、不进入规划流程
- 项目能力/上下文了解：简要说明 Hackbot 能做什么、当前对话上下文
"""

from typing import Optional, List

from agents.base import BaseAgent
from utils.logger import logger


# 项目能力简要说明（供「能做什么」类问题使用）
PROJECT_CAPABILITIES = """**Hackbot 能做什么**

1. **安全扫描**：端口扫描、服务识别、漏洞扫描
2. **信息收集**：系统信息、网络发现、内网主机探测
3. **系统操作**：命令执行、进程/文件查看（需授权）
4. **远程控制**：对授权主机的 SSH/WinRM、上传下载
5. **防御与报告**：安全扫描报告、入侵检测、审计留痕

直接说出你的需求即可；也可输入 [cyan]/plan[/cyan] 先编写测试计划，再用 [cyan]/start[/cyan] 执行。"""


class QAAgent(BaseAgent):
    """
    问答 Agent：仅做简短回复，不调用工具、不生成执行计划。
    用于：问候、闲聊、了解项目能力、了解对话上下文等。
    """

    def __init__(self, name: str = "QAAgent"):
        system_prompt = """你是 Hackbot 的轻量问答助手。只做简短、友好的回复。
- 问候类：简短回应即可
- 询问「能做什么」「有什么功能」：简要列举安全扫描、系统操作、远程控制等，并提示用户直接说需求或使用 /plan 编写计划
- 询问对话/上下文：根据当前会话简要说明
不要展开长篇说明，不要调用任何工具。"""
        super().__init__(name=name, system_prompt=system_prompt)
        logger.info("初始化 QAAgent")

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
            "若要执行扫描、检测等操作，直接说出目标或输入 [cyan]/plan[/cyan] 编写测试计划。"
        )

    def _rule_based_reply(self, text: str) -> Optional[str]:
        """规则匹配：问候、感谢、再见、帮助、项目能力等"""
        lower = text.lower().strip()

        # 再见/退出
        if any(x in lower for x in ["再见", "拜拜", "bye", "quit", "exit"]) and len(text) < 20:
            return "再见！需要时随时叫我。"

        # 感谢
        if any(x in lower for x in ["谢谢", "thanks", "thank you"]) and len(text) < 25:
            return "不客气，有需要再说。"

        # 问候
        if any(x in lower for x in ["早上好", "早安", "上午好"]):
            return "早上好！今天想做什么安全测试？"
        if "下午好" in lower:
            return "下午好！需要我帮你做扫描或检测吗？"
        if any(x in lower for x in ["晚上好", "晚安"]):
            return "晚上好！有什么可以帮你的？"
        if any(x in lower for x in ["你好", "hello", "hi", "嗨"]) and len(text) < 15:
            return (
                "你好！我是 Hackbot，做安全测试与自动化。\n"
                "可以说「你能做什么」了解能力，或直接说需求（如：扫描本机端口）。"
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
