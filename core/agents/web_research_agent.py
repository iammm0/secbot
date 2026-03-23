"""
WebResearchAgent：独立 ReAct 循环的 Web 研究子 Agent
拥有专属的联网工具集（smart_search / page_extract / deep_crawl / api_client），
可由主 Agent 委托执行互联网信息收集任务。
"""

import json
import re
from typing import Optional, List, Dict, Any

from core.agents.base import BaseAgent
from core.patterns.security_react import _create_llm
from tools.base import BaseTool, ToolResult
from utils.context_info import get_agent_context_block
from utils.logger import logger

from langchain_core.messages import SystemMessage, HumanMessage
from hackbot_config import settings


# -----------------------------------------------------------------
# 系统提示词
# -----------------------------------------------------------------

WEB_RESEARCH_SYSTEM_PROMPT = """你是一个专业的 Web 研究专家 (WebResearchAgent)。你的职责是利用互联网搜索、网页爬取、API 交互等工具，帮助用户收集和整理信息。

【核心能力】
1. 智能搜索 (smart_search)：根据关键词联网搜索，自动访问搜索结果页面，AI 生成综合摘要
2. 网页提取 (page_extract)：给定 URL，智能提取页面内容（纯文本/结构化/自定义 schema）
3. 深度爬取 (deep_crawl)：从起始 URL 出发，广度优先发现和爬取相关页面
4. API 交互 (api_client)：调用各种 REST API 获取数据（天气、IP、GitHub、汇率等内置模板）

【工作原则】
- 先思考用最少的工具调用获取最多的有用信息
- 搜索时使用精确、有针对性的关键词
- 对获取的信息进行去重和交叉验证
- 结果以结构化、易读的格式呈现
- 标注信息来源 URL

【沟通方式】
- 使用中文回答
- 客观准确地呈现搜索结果
- 对不确定的信息注明"未经验证"
- 提供信息来源以便用户核实"""


# -----------------------------------------------------------------
# WebResearchAgent
# -----------------------------------------------------------------


class WebResearchAgent(BaseAgent):
    """
    Web 研究子 Agent：拥有独立的 ReAct 循环。
    由 WebResearchTool 桥接工具创建和调用。
    """

    def __init__(self, max_iterations: int = 8):
        super().__init__(
            name="WebResearchAgent", system_prompt=WEB_RESEARCH_SYSTEM_PROMPT
        )

        # 延迟导入，避免循环依赖
        from tools.web_research.smart_search_tool import SmartSearchTool
        from tools.web_research.page_extract_tool import PageExtractTool
        from tools.web_research.deep_crawl_tool import DeepCrawlTool
        from tools.web_research.api_client_tool import ApiClientTool

        self.research_tools: List[BaseTool] = [
            SmartSearchTool(),
            PageExtractTool(),
            DeepCrawlTool(),
            ApiClientTool(),
        ]
        self.tools_dict: Dict[str, BaseTool] = {t.name: t for t in self.research_tools}
        self.max_iterations = max_iterations

        # LLM
        self.llm = _create_llm()

        # ReAct 历史
        self._react_history: List[Dict[str, str]] = []

    # -----------------------------------------------------------------
    # 工具描述
    # -----------------------------------------------------------------

    def _get_tools_description(self) -> str:
        lines = ["可用工具："]
        for t in self.research_tools:
            lines.append(f"- {t.name}: {t.description}")
        return "\n".join(lines)

    # -----------------------------------------------------------------
    # LLM 调用
    # -----------------------------------------------------------------

    async def _call_llm(self, messages: List) -> str:
        import asyncio

        try:
            response = await asyncio.wait_for(self.llm.ainvoke(messages), timeout=60.0)
        except Exception as e:
            logger.bind(agent=self.name, event="llm_error", attempt=1).error(f"WebResearchAgent LLM 调用失败: {e}")
            return f"[LLM 调用失败: {e}]"
        if hasattr(response, "content") and response.content:
            return str(response.content)
        return str(response)

    # -----------------------------------------------------------------
    # 对外入口
    # -----------------------------------------------------------------

    async def research(self, query: str) -> str:
        """
        执行 Web 研究任务。

        Args:
            query: 研究主题/查询

        Returns:
            研究报告（纯文本）
        """
        return await self.process(query)

    async def process(self, user_input: str, **kwargs) -> str:
        """ReAct 主循环"""
        self._react_history = []
        self.add_message("user", user_input)

        response_parts: List[str] = []
        iteration = 0

        while iteration < self.max_iterations:
            iteration += 1

            # ---- THINK ----
            thought = await self._think(user_input)
            self._react_history.append({"type": "thought", "content": thought})
            logger.bind(agent=self.name, event="thought_end", attempt=1).info(f"[WebResearch] Thought {iteration}: {thought[:120]}...")

            # ---- 解析 ACTION ----
            action_info = self._parse_action(thought)

            if action_info is None:
                # Final Answer
                final = self._extract_final_answer(thought)
                response_parts.append(final)
                break

            tool_name = action_info.get("tool", "")
            tool_params = action_info.get("params", {})

            # ---- 检查工具 ----
            tool = self.tools_dict.get(tool_name)
            if not tool:
                obs = f"工具 '{tool_name}' 不存在。可用: {', '.join(self.tools_dict.keys())}"
                self._react_history.append({"type": "observation", "content": obs})
                continue

            # ---- 执行工具 ----
            logger.bind(agent=self.name, event="tool_call_start", tool=tool_name, attempt=1).info(f"[WebResearch] Action {iteration}: {tool_name}({tool_params})")
            try:
                result = await tool.execute(**tool_params)
            except Exception as e:
                result = ToolResult(success=False, result=None, error=str(e))

            obs = self._format_observation(result)
            self._react_history.append({"type": "observation", "content": obs})
            logger.bind(agent=self.name, event="tool_call_end", tool=tool_name, attempt=1).info(f"[WebResearch] Observation {iteration}: {obs[:120]}...")

        else:
            # 达到最大迭代
            response_parts.append(
                f"[WebResearchAgent] 达到最大迭代次数 ({self.max_iterations})，"
                "以下是目前收集到的信息："
            )
            # 汇总已有观察
            for item in self._react_history:
                if item["type"] == "observation":
                    response_parts.append(item["content"][:500])

        # 如果循环正常结束但 response_parts 为空，生成总结
        if not response_parts:
            summary = await self._generate_summary(user_input)
            response_parts.append(summary)

        full_response = "\n\n".join(response_parts)
        self.add_message("assistant", full_response)
        return full_response

    # -----------------------------------------------------------------
    # 推理
    # -----------------------------------------------------------------

    async def _think(self, user_input: str) -> str:
        history_text = ""
        for item in self._react_history:
            t = item["type"].upper()
            content = item["content"]
            # 限制单条历史长度避免 token 爆炸
            if len(content) > 2000:
                content = content[:2000] + "...(已截断)"
            history_text += f"\n[{t}] {content}"

        tools_desc = self._get_tools_description()
        context_block = get_agent_context_block()

        prompt = f"""你是一个 Web 研究专家，使用 ReAct 模式工作。

{tools_desc}

## 输出格式

每次推理请严格按以下格式之一输出：

### 需要调用工具时：
Thought: <你的分析和推理>
Action: {{"tool": "<工具名>", "params": {{<参数JSON>}}}}

### 任务完成时：
Thought: <你的分析>
Final Answer: <完整的研究报告>

## 重要指导原则

1. **高效利用工具**：尽量用最少的工具调用收集最多的信息
2. **smart_search 优先**：大多数查询先用 smart_search 进行智能搜索
3. **page_extract 深入**：当需要某个页面的详细内容时使用
4. **deep_crawl 广度**：当需要爬取多个相关页面时使用
5. **api_client 精确**：当需要结构化数据（天气、IP、GitHub 等）时使用
6. **Final Answer 必须完整**：包含信息来源、主要发现、结论

{context_block}
## 当前任务

用户查询: {user_input}

## 历史记录
{history_text if history_text else "(无)"}

请继续推理："""

        messages = [
            SystemMessage(content=self.system_prompt),
            HumanMessage(content=prompt),
        ]

        return await self._call_llm(messages)

    # -----------------------------------------------------------------
    # Action 解析
    # -----------------------------------------------------------------

    def _parse_action(self, thought: str) -> Optional[Dict[str, Any]]:
        if "Final Answer:" in thought or "final answer:" in thought.lower():
            return None

        # 1) 定位 Action: 后的 JSON
        action_label = re.search(r"Action:\s*\{", thought, re.IGNORECASE)
        if action_label:
            start = action_label.end() - 1
            depth = 0
            for i in range(start, len(thought)):
                if thought[i] == "{":
                    depth += 1
                elif thought[i] == "}":
                    depth -= 1
                    if depth == 0:
                        try:
                            return json.loads(thought[start : i + 1])
                        except json.JSONDecodeError:
                            break

        # 2) 任意位置匹配
        for match in re.finditer(r"\{", thought):
            start = match.start()
            depth = 0
            for i in range(start, len(thought)):
                if thought[i] == "{":
                    depth += 1
                elif thought[i] == "}":
                    depth -= 1
                    if depth == 0:
                        snippet = thought[start : i + 1]
                        if '"tool"' in snippet:
                            try:
                                obj = json.loads(snippet)
                                if isinstance(obj, dict) and "tool" in obj:
                                    return obj
                            except json.JSONDecodeError:
                                pass
                        break
        return None

    # -----------------------------------------------------------------
    # 结果格式化
    # -----------------------------------------------------------------

    @staticmethod
    def _format_observation(result: ToolResult) -> str:
        if result.success:
            data = result.result
            if isinstance(data, dict):
                lines = []
                for key, value in data.items():
                    if isinstance(value, list):
                        lines.append(f"  {key}: {len(value)} 项")
                        for item in value[:5]:
                            if isinstance(item, dict):
                                lines.append(
                                    f"    - {json.dumps(item, ensure_ascii=False)[:200]}"
                                )
                            else:
                                lines.append(f"    - {str(item)[:200]}")
                        if len(value) > 5:
                            lines.append(f"    ... (共 {len(value)} 项)")
                    elif isinstance(value, dict):
                        lines.append(f"  {key}:")
                        for k, v in list(value.items())[:10]:
                            lines.append(f"    {k}: {str(v)[:200]}")
                    else:
                        lines.append(f"  {key}: {str(value)[:500]}")
                return "\n".join(lines)
            elif isinstance(data, list):
                return "结果:\n" + "\n".join(f"  - {item}" for item in data[:10])
            return f"结果: {data}"
        return f"执行失败: {result.error}"

    @staticmethod
    def _extract_final_answer(thought: str) -> str:
        """从 thought 中提取 Final Answer 部分"""
        patterns = [
            r"Final Answer:\s*(.*)",
            r"final answer:\s*(.*)",
        ]
        for pat in patterns:
            match = re.search(pat, thought, re.DOTALL | re.IGNORECASE)
            if match:
                return match.group(1).strip()
        return thought

    async def _generate_summary(self, user_input: str) -> str:
        """根据已收集的信息生成总结"""
        observations = [
            item["content"]
            for item in self._react_history
            if item["type"] == "observation"
        ]
        if not observations:
            return "未能收集到有效信息。"

        obs_text = "\n\n".join(obs[:1000] for obs in observations)
        prompt = f"""请根据以下收集到的信息，为用户的查询生成一份简洁的研究报告。

用户查询: {user_input}

收集到的信息:
{obs_text[:5000]}

请生成结构化的研究报告，包含:
1. 主要发现
2. 关键信息
3. 信息来源
4. 结论"""

        messages = [
            SystemMessage(content=self.system_prompt),
            HumanMessage(content=prompt),
        ]
        return await self._call_llm(messages)
