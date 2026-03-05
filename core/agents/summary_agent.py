"""
SummaryAgent v2：通用交互摘要智能体
负责将任意类型的交互（安全测试、系统操作、对话等）整理为结构化摘要。
支持：
- 基于 Todo 完成情况总结
- 多维度摘要（任务完成率、关键发现、行动摘要、后续建议）
- 安全测试领域特化（风险评估）
- 会话压缩（compact）
"""

from typing import Optional, List, Dict, Any

from core.agents.base import BaseAgent
from core.models import TodoItem, TodoStatus, InteractionSummary
from utils.logger import logger


def _create_summary_llm():
    """创建 LLM 实例（复用 security_react 的逻辑）"""
    from hackbot_config import settings

    try:
        from langchain_ollama import ChatOllama
    except ImportError:
        from langchain_community.chat_models import ChatOllama

    try:
        from langchain_openai import ChatOpenAI
    except ImportError:
        ChatOpenAI = None

    from pydantic import SecretStr

    provider = (settings.llm_provider or "ollama").strip().lower()
    if provider == "deepseek" and ChatOpenAI and settings.deepseek_api_key:
        model = settings.deepseek_model
        is_reasoner = "reasoner" in model.lower()
        kwargs = dict(
            api_key=SecretStr(settings.deepseek_api_key),
            base_url=settings.deepseek_base_url.rstrip("/"),
            model=model,
        )
        if not is_reasoner:
            kwargs["temperature"] = 0.5
        return ChatOpenAI(**kwargs)
    return ChatOllama(
        base_url=settings.ollama_base_url,
        model=settings.ollama_model,
        temperature=0.5,
    )


class SummaryAgent(BaseAgent):
    """
    Summary Agent v2 负责：
    1. 收集 ReAct 执行的历史记录和 Todo 完成情况
    2. 分析观察结果
    3. 生成结构化的交互摘要（通用 + 安全测试领域特化）
    4. 压缩会话历史
    """

    def __init__(self, name: str = "SummaryAgent"):
        system_prompt = """你是 Hackbot 的通用报告生成专家。你的职责是将任务的执行结果整理成清晰、结构化的报告。

## 报告结构要求

### 1. 任务总结
- 简要说明任务目标和范围
- 说明执行了哪些操作

### 2. Todo 完成情况
- 统计任务完成率
- 列出每个 Todo 的最终状态

### 3. 关键发现
- 列出所有重要发现
- 每个发现包含：描述、影响

### 4. 风险评估（仅安全测试类任务）
- 对每个问题给出风险等级（高/中/低）
- 说明潜在影响和利用难度

### 5. 修复/改进建议
- 针对每个问题提供具体建议
- 分为短期缓解和长期解决方案

### 6. 综合结论
- 整体评估
- 后续建议

### 7. 攻击取证信息（若适用）
- 若检测到攻击行为，单独列出「攻击取证报告」小节
- 包含：攻击者IP、攻击时间、攻击手法、证据完整性状态

### 8. 执行失败的工具（若有）
- 若有工具执行失败，请单独列出「执行失败的工具」小节，写明工具名与失败原因，便于后续排查。

## 输出风格
- 专业、清晰的技术报告风格
- 使用 Markdown 格式
- 关键信息用加粗标注
- 攻击取证信息需标注证据完整性"""

        super().__init__(name=name, system_prompt=system_prompt)
        logger.info("初始化 SummaryAgent v2")

    # ------------------------------------------------------------------
    # 新接口：summarize_interaction
    # ------------------------------------------------------------------

    async def summarize_interaction(
        self,
        user_input: str,
        todos: Optional[List[TodoItem]] = None,
        thoughts: Optional[List[str]] = None,
        observations: Optional[List[str]] = None,
        tool_results: Optional[List[Dict[str, Any]]] = None,
        interaction_type: str = "technical",
        brief: bool = False,
        agent_tool_results_by_agent: Optional[Dict[str, List[Dict[str, Any]]]] = None,
    ) -> InteractionSummary:
        """
        总结单次交互行为。

        Args:
            user_input: 原始用户请求
            todos: TodoItem 列表（来自 PlannerAgent）
            thoughts: 思考过程列表
            observations: 观察结果列表
            tool_results: 工具执行结果列表
            interaction_type: 交互类型 (technical/simple)
            brief: 若为 True，只生成简要总结（做了什么、完成情况、主要结论）

        Returns:
            InteractionSummary: 结构化摘要
        """
        todos = todos or []
        thoughts = thoughts or []
        observations = observations or []

        # 计算 todo 完成情况
        todo_completion = self._compute_todo_stats(todos)

        # 构建报告 prompt（brief 时用简短版）
        if brief:
            report_prompt = self._build_brief_summary_prompt(
                user_input,
                todos,
                todo_completion,
                observations,
                tool_results,
                agent_tool_results_by_agent,
            )
        else:
            report_prompt = self._build_report_prompt_v2(
                user_input,
                todos,
                thoughts,
                observations,
                tool_results,
                interaction_type,
                agent_tool_results_by_agent,
            )

        # 调用 LLM 生成报告
        raw_report = await self._generate_report(report_prompt)

        # 构建结构化摘要
        summary = InteractionSummary(
            task_summary=f"任务: {user_input}",
            todo_completion=todo_completion,
            key_findings=self._extract_findings(observations),
            action_summary=self._extract_actions(tool_results),
            risk_assessment=self._extract_risk_assessment(raw_report)
            if interaction_type == "technical"
            else None,
            recommendations=self._extract_recommendations(raw_report),
            overall_conclusion=self._extract_conclusion(raw_report),
            raw_report=raw_report,
        )

        return summary

    # ------------------------------------------------------------------
    # 旧接口：process（向后兼容）
    # ------------------------------------------------------------------

    async def process(
        self,
        user_input: str,
        thoughts: Optional[List[str]] = None,
        observations: Optional[List[str]] = None,
        tool_results: Optional[List[Dict[str, Any]]] = None,
        **kwargs,
    ) -> str:
        """
        向后兼容的 process 接口。
        返回纯文本报告。
        """
        # 如果传入了 thoughts 和 observations，走摘要流程
        if thoughts is not None or observations is not None:
            summary = await self.summarize_interaction(
                user_input=user_input,
                thoughts=thoughts or [],
                observations=observations or [],
                tool_results=tool_results,
                interaction_type="technical",
            )
            return summary.raw_report

        # 否则走简单 LLM 调用
        self.add_message("user", f"生成报告 - 用户请求: {user_input}")
        report_prompt = self._build_simple_prompt(user_input)
        report = await self._generate_report(report_prompt)
        self.add_message("assistant", report)
        return report

    # ------------------------------------------------------------------
    # 会话压缩
    # ------------------------------------------------------------------

    async def compact_session(self, messages: List[Dict[str, str]]) -> str:
        """
        压缩会话历史为简洁的上下文摘要。
        仿 opencode 的 /compact 命令。

        Args:
            messages: 会话消息列表 [{"role": "...", "content": "..."}]

        Returns:
            压缩后的上下文摘要
        """
        msg_text = "\n".join(
            f"[{m.get('role', '?')}] {m.get('content', '')[:200]}"
            for m in messages[-20:]  # 最多取最近 20 条
        )

        compact_prompt = f"""请将以下对话历史压缩为简洁的上下文摘要（不超过 300 字）。
保留关键信息：任务目标、已完成的操作、重要发现、待处理事项。

## 对话历史
{msg_text}

## 输出
请直接输出压缩后的摘要，不要添加标题或格式标记："""

        try:
            llm = _create_summary_llm()
            from langchain_core.messages import SystemMessage, HumanMessage

            response = llm.invoke(
                [
                    SystemMessage(content="你是一个会话压缩专家。"),
                    HumanMessage(content=compact_prompt),
                ]
            )
            return response.content if hasattr(response, "content") else str(response)
        except Exception as e:
            logger.error(f"会话压缩失败: {e}")
            return f"会话包含 {len(messages)} 条消息。最近讨论了相关任务。"

    # ------------------------------------------------------------------
    # 内部方法
    # ------------------------------------------------------------------

    def _compute_todo_stats(self, todos: List[TodoItem]) -> Dict[str, int]:
        """计算 todo 完成统计"""
        total = len(todos)
        completed = sum(1 for t in todos if t.status == TodoStatus.COMPLETED)
        failed = sum(1 for t in todos if t.status == TodoStatus.CANCELLED)
        in_progress = sum(1 for t in todos if t.status == TodoStatus.IN_PROGRESS)
        return {
            "total": total,
            "completed": completed,
            "failed": failed,
            "cancelled": failed,
            "in_progress": in_progress,
        }

    def _build_brief_summary_prompt(
        self,
        user_input: str,
        todos: List[TodoItem],
        todo_completion: Dict[str, int],
        observations: List[str],
        tool_results: Optional[List[Dict[str, Any]]],
        agent_tool_results_by_agent: Optional[Dict[str, List[Dict[str, Any]]]] = None,
    ) -> str:
        """构建简要总结的 prompt（最后报告：简要说下做了什么即可）"""
        todo_lines = []
        for t in todos:
            status_icon = {
                "completed": "[x]",
                "in_progress": "[~]",
                "cancelled": "[-]",
            }.get(t.status.value, "[ ]")
            todo_lines.append(f"  {status_icon} {t.content}")
        tools_used: List[str] = []
        failed_tools: List[Dict[str, str]] = []
        if tool_results:
            for tr in tool_results:
                if tr.get("tool"):
                    tools_used.append(tr["tool"])
                if not tr.get("success", True) and tr.get("tool"):
                    failed_tools.append(
                        {
                            "tool": tr.get("tool", ""),
                            "error": tr.get("error", "未知错误"),
                        }
                    )

        failed_section = ""
        if failed_tools:
            lines = [f"  - {ft['tool']}: {ft['error']}" for ft in failed_tools]
            failed_section = "\n- 执行失败的工具：\n" + "\n".join(lines)

        # 按子 Agent 的执行概览（若存在多 Agent 协作）
        agent_overview_lines: List[str] = []
        if agent_tool_results_by_agent:
            for agent, results in agent_tool_results_by_agent.items():
                total = len(results)
                success_cnt = sum(1 for r in results if r.get("success", False))
                if total == 0:
                    continue
                tools = sorted(
                    {
                        str(r.get("tool"))
                        for r in results
                        if r.get("tool") is not None
                    }
                )
                tools_str = ", ".join(tools) if tools else "无明确工具名"
                agent_overview_lines.append(
                    f"- {agent}: {success_cnt}/{total} 步成功，涉及工具: {tools_str}"
                )

        agent_section = ""
        if agent_overview_lines:
            agent_section = (
                "\n- 子智能体执行概览：\n"
                + "\n".join(agent_overview_lines)
            )

        return f"""请用 3～5 句话简要总结本次交互（不要长报告）：

- 用户请求：{user_input}
- Todo 完成：{todo_completion.get("completed", 0)}/{todo_completion.get("total", 0)} 项
- 执行的工具：{", ".join(tools_used) if tools_used else "无"}
- 观察结果条数：{len(observations)}{failed_section}{agent_section}

请直接输出简要总结，包含：做了什么、完成情况、主要结论。若有未完成步骤或工具执行失败，请明确列出并简要说明原因。不要分章节、不要长列表。"""

    def _build_report_prompt_v2(
        self,
        user_input: str,
        todos: List[TodoItem],
        thoughts: List[str],
        observations: List[str],
        tool_results: Optional[List[Dict[str, Any]]],
        interaction_type: str,
        agent_tool_results_by_agent: Optional[Dict[str, List[Dict[str, Any]]]] = None,
    ) -> str:
        """构建 v2 版本的报告生成 prompt"""
        # Todo 完成情况
        todo_section = ""
        if todos:
            todo_lines = []
            for t in todos:
                status_icon = {
                    TodoStatus.COMPLETED: "[x]",
                    TodoStatus.IN_PROGRESS: "[~]",
                    TodoStatus.CANCELLED: "[-]",
                }.get(t.status, "[ ]")
                result = f" -> {t.result_summary}" if t.result_summary else ""
                todo_lines.append(f"{status_icon} {t.content}{result}")
            todo_section = "\n## Todo 完成情况\n" + "\n".join(todo_lines)

        # 工具使用与失败记录
        tools_used: List[str] = []
        failed_tools_section = ""
        if tool_results:
            for tr in tool_results:
                if tr.get("tool"):
                    tools_used.append(tr["tool"])
            failed = [
                tr
                for tr in tool_results
                if not tr.get("success", True) and tr.get("tool")
            ]
            if failed:
                lines = [
                    f"- **{tr.get('tool', '')}**: {tr.get('error', '未知错误')}"
                    for tr in failed
                ]
                failed_tools_section = (
                    "\n## 执行失败的工具\n\n" + "\n".join(lines) + "\n"
                )

        # 多 Agent 执行概览
        agent_overview = ""
        if agent_tool_results_by_agent:
            lines: List[str] = []
            for agent, results in agent_tool_results_by_agent.items():
                total = len(results)
                if total == 0:
                    continue
                success_cnt = sum(1 for r in results if r.get("success", False))
                tools = sorted(
                    {
                        str(r.get("tool"))
                        for r in results
                        if r.get("tool") is not None
                    }
                )
                tools_str = ", ".join(tools) if tools else "无"
                lines.append(
                    f"- **{agent}**: 执行 {total} 步，其中 {success_cnt} 步成功，涉及工具: {tools_str}"
                )
            if lines:
                agent_overview = "\n## 子智能体执行概览\n\n" + "\n".join(lines) + "\n"

        prompt = f"""请根据以下执行结果生成报告。

## 用户原始请求
{user_input}

## 交互类型
{interaction_type}
{todo_section}

## 执行的工具
{", ".join(tools_used) if tools_used else "无"}
{failed_tools_section}
{agent_overview}

## 执行过程
"""
        for i, thought in enumerate(thoughts, 1):
            prompt += f"\n### 思考 {i}\n{thought}\n"

        prompt += "\n## 观察结果\n"
        for i, obs in enumerate(observations, 1):
            prompt += f"\n### 结果 {i}\n{obs}\n"

        prompt += """
## 请生成报告

请按以下 Markdown 格式生成报告：

---

## 任务总结

**目标**: <简述>
**范围**: <执行了哪些测试>
**结果**: <整体结果概述>

---
"""
        if failed_tools_section:
            prompt += """
## 执行失败的工具（必填）

上方已列出本轮执行失败的工具及原因，请在报告中**原样或概括**写出「执行失败的工具」小节，便于用户排查。

---
"""
        prompt += """
## 关键发现

- **发现 1**: <描述>
- **发现 2**: <描述>

---
"""

        if interaction_type == "technical":
            prompt += """
## 风险评估

| 问题 | 风险等级 | 影响范围 | 建议 |
|------|----------|----------|------|
| ... | 高/中/低 | ... | ... |

---
"""

        prompt += """
## 建议

1. <具体建议>
2. <具体建议>

---

## 综合结论

<整体评估和后续建议>

---

请根据实际情况生成报告内容。如果发现项较少，可以适当简化。"""

        return prompt

    def _build_simple_prompt(self, user_input: str) -> str:
        """简单报告的 prompt"""
        return f"请为以下任务生成简要报告：{user_input}"

    async def _generate_report(self, prompt: str) -> str:
        """调用 LLM 生成报告"""
        try:
            llm = _create_summary_llm()
            from langchain_core.messages import SystemMessage, HumanMessage

            response = llm.invoke(
                [
                    SystemMessage(content=self.system_prompt),
                    HumanMessage(content=prompt),
                ]
            )
            report = response.content if hasattr(response, "content") else str(response)
            return report
        except Exception as e:
            logger.error(f"生成报告失败: {e}")
            return self._fallback_report(prompt)

    def _fallback_report(self, prompt: str) -> str:
        """LLM 不可用时的兜底报告"""
        return (
            "## 任务总结\n\n"
            "已完成任务分析。具体发现请参考上方的执行历史。\n\n"
            "---\n\n"
            "## 综合结论\n\n"
            "任务已执行完毕。如需更详细的报告，请确保 LLM 服务正常运行。\n\n"
            "---\n\n"
            "*报告由 SummaryAgent v2 自动生成*"
        )

    def _extract_findings(self, observations: List[str]) -> List[str]:
        """从观察结果中提取关键发现"""
        findings = []
        for obs in observations:
            if "失败" not in obs and "错误" not in obs and len(obs.strip()) > 10:
                text = obs.strip()
                if len(text) > 100:
                    text = text[:97] + "..."
                findings.append(text)
        return findings[:10]  # 最多 10 条

    def _extract_actions(
        self, tool_results: Optional[List[Dict[str, Any]]]
    ) -> List[str]:
        """提取已执行的操作摘要"""
        if not tool_results:
            return []
        actions = []
        for tr in tool_results:
            tool = tr.get("tool", "unknown")
            success = tr.get("success", False)
            status = "成功" if success else "失败"
            actions.append(f"{tool}: {status}")
        return actions

    def _extract_risk_assessment(self, report: str) -> Optional[Dict[str, Any]]:
        """从报告文本中提取风险评估（简单启发式）"""
        risks = {"high": 0, "medium": 0, "low": 0}
        report_lower = report.lower()
        risks["high"] = report_lower.count("高风险") + report_lower.count("high")
        risks["medium"] = report_lower.count("中风险") + report_lower.count("medium")
        risks["low"] = report_lower.count("低风险") + report_lower.count("low")
        if sum(risks.values()) == 0:
            return None
        return risks

    def _extract_recommendations(self, report: str) -> List[str]:
        """从报告中提取建议（简单启发式）"""
        recs = []
        in_rec_section = False
        for line in report.split("\n"):
            stripped = line.strip()
            if "建议" in stripped and ("#" in stripped or "**" in stripped):
                in_rec_section = True
                continue
            if in_rec_section:
                if stripped.startswith("#") or stripped.startswith("---"):
                    in_rec_section = False
                    continue
                if stripped.startswith(("-", "*", "1", "2", "3", "4", "5")):
                    clean = stripped.lstrip("-*0123456789. ")
                    if clean:
                        recs.append(clean)
        return recs[:5]

    def _extract_conclusion(self, report: str) -> str:
        """从报告中提取结论"""
        in_conclusion = False
        conclusion_lines = []
        for line in report.split("\n"):
            stripped = line.strip()
            if "结论" in stripped and ("#" in stripped or "**" in stripped):
                in_conclusion = True
                continue
            if in_conclusion:
                if stripped.startswith("---"):
                    break
                if stripped:
                    conclusion_lines.append(stripped)
        if conclusion_lines:
            return " ".join(conclusion_lines[:3])
        return ""


async def generate_summary(
    user_input: str,
    thoughts: List[str],
    observations: List[str],
    tool_results: Optional[List[Dict[str, Any]]] = None,
) -> str:
    """快速生成总结报告的辅助函数（向后兼容）"""
    summary_agent = SummaryAgent()
    return await summary_agent.process(
        user_input=user_input,
        thoughts=thoughts,
        observations=observations,
        tool_results=tool_results,
    )
