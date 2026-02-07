"""
SummaryAgent：总结报告智能体
负责将 ReAct 执行结果整理成结构化的安全测试报告。
"""

from typing import Optional, List, Dict, Any
from agents.base import BaseAgent
from utils.logger import logger


class SummaryAgent(BaseAgent):
    """
    Summary Agent 负责：
    1. 收集 ReAct 执行的历史记录
    2. 分析观察结果
    3. 生成结构化的安全测试报告
    """

    def __init__(self, name: str = "SummaryAgent"):
        system_prompt = """你是 Hackbot 的报告生成专家。你的职责是将安全测试的执行结果整理成清晰、结构化的报告。

## 报告结构要求

### 1. 任务总结
- 简要说明测试目标和范围
- 说明执行了哪些操作

### 2. 发现的问题
- 列出所有发现的安全问题
- 每个问题包含：描述、影响、风险等级

### 3. 风险评估
- 对每个问题给出风险等级（高/中/低）
- 说明潜在影响和利用难度

### 4. 修复建议
- 针对每个问题提供具体修复建议
- 分为短期缓解和长期解决方案

### 5. 综合结论
- 整体安全状况评估
- 后续建议

## 输出风格
- 专业、清晰的技术报告风格
- 使用 Markdown 格式
- 适当使用 emoji 增强可读性
- 关键信息用加粗标注"""

        super().__init__(name=name, system_prompt=system_prompt)
        logger.info("初始化 SummaryAgent")

    async def process(
        self,
        user_input: str,
        thoughts: List[str],
        observations: List[str],
        tool_results: List[Dict[str, Any]] = None,
        **kwargs,
    ) -> str:
        """
        生成安全测试报告。

        Args:
            user_input: 原始用户请求
            thoughts: 思考过程列表
            observations: 观察结果列表
            tool_results: 工具执行结果列表（可选）

        Returns:
            结构化的安全测试报告
        """
        self.add_message("user", f"生成报告 - 用户请求: {user_input}")

        # 构建报告生成提示
        report_prompt = self._build_report_prompt(
            user_input, thoughts, observations, tool_results
        )

        try:
            from config import settings

            try:
                from langchain_ollama import ChatOllama
            except ImportError:
                from langchain_community.chat_models import ChatOllama

            from langchain_core.messages import SystemMessage, HumanMessage

            llm = ChatOllama(
                base_url=settings.ollama_base_url,
                model=settings.ollama_model,
                temperature=0.5,
            )

            messages = [
                SystemMessage(content=self.system_prompt),
                HumanMessage(content=report_prompt),
            ]

            response = llm.invoke(messages)
            report = response.content if hasattr(response, "content") else str(response)

            self.add_message("assistant", report)
            return report

        except Exception as e:
            logger.error(f"生成报告失败: {e}")
            return self._fallback_report(user_input, observations)

    def _build_report_prompt(
        self,
        user_input: str,
        thoughts: List[str],
        observations: List[str],
        tool_results: List[Dict[str, Any]] = None,
    ) -> str:
        """构建报告生成的提示词"""

        # 收集所有观察结果
        all_findings = []
        for obs in observations:
            if "失败" not in obs and "错误" not in obs:
                all_findings.append(obs)

        # 收集工具结果
        tools_used = []
        if tool_results:
            for tr in tool_results:
                if tr.get("tool"):
                    tools_used.append(tr["tool"])

        prompt = f"""请根据以下执行结果生成安全测试报告。

## 用户原始请求
{user_input}

## 执行的工具
{", ".join(tools_used) if tools_used else "无"}

## 执行过程
"""

        for i, thought in enumerate(thoughts, 1):
            prompt += f"\n### 思考 {i}\n{thought}\n"

        prompt += "\n## 观察结果\n"
        for i, obs in enumerate(observations, 1):
            prompt += f"\n### 结果 {i}\n{obs}\n"

        prompt += """
## 请生成报告

请严格按照以下格式生成报告：

---

## 📋 任务总结

**测试目标**: <简述用户请求的核心目标>

**执行范围**: <执行了哪些测试>

**测试结果**: <整体结果概述>

---

## 🔍 发现的问题

### 问题 1: <问题名称>
- **描述**: <详细描述>
- **位置/影响**: <相关系统或位置>
- **风险等级**: <高/中/低>

### 问题 2: ...

---

## ⚠️ 风险评估

| 问题 | 风险等级 | 影响范围 | 利用难度 |
|------|----------|----------|----------|
| 问题1 | 高/中/低 | <描述> | 容易/中等/困难 |
| 问题2 | ... | ... | ... |

---

## 🔧 修复建议

### 问题 1 修复建议:
**短期措施**: <快速缓解方案>

**长期方案**: <彻底解决方案>

**最佳实践**: <安全加固建议>

### 问题 2 修复建议:
...

---

## 📊 综合结论

**整体安全评估**: <优秀/良好/一般/需改进>

**优先级排序**:
1. 紧急 - <高风险问题>
2. 重要 - <中风险问题>
3. 可选 - <低风险问题>

**后续建议**: <下一步行动建议>

---

请根据实际情况生成报告内容。如果发现项较少，可以适当简化部分章节。"""

        return prompt

    def _fallback_report(self, user_input: str, observations: List[str]) -> str:
        """当 LLM 不可用时的简单报告"""
        findings_count = len(
            [o for o in observations if "失败" not in o and "错误" not in o]
        )

        report = f"""## 📋 任务总结

**测试目标**: {user_input}

**执行范围**: {", ".join(set(o.split(":")[0] for o in observations if ":" in o)) or "已完成基本测试"}

**测试结果**: 收集到 {findings_count} 个观察结果

---

## 🔍 执行摘要

共执行了 {len(observations)} 个操作步骤，具体结果请参见上方执行历史。

---

## 📊 综合结论

已完成对 "{user_input}" 的分析。具体发现请参考上方的观察结果详情。

**建议**: 
- 查看完整执行历史获取详细信息
- 如需更详细的报告，请确保 LLM 服务正常运行

---

*报告由 SummaryAgent 自动生成*
"""
        return report


async def generate_summary(
    user_input: str,
    thoughts: List[str],
    observations: List[str],
    tool_results: List[Dict[str, Any]] = None,
) -> str:
    """
    快速生成总结报告的辅助函数。
    """
    summary_agent = SummaryAgent()
    return await summary_agent.process(
        user_input=user_input,
        thoughts=thoughts,
        observations=observations,
        tool_results=tool_results,
    )
