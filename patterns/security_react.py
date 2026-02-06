"""
SecurityReActAgent：LLM 驱动的安全测试 ReAct 引擎
支持自动执行（hackbot）和用户确认（superhackbot）两种模式。
"""
import json
import re
from typing import Optional, List, Dict, Any

from agents.base import BaseAgent
from tools.base import BaseTool, ToolResult
from utils.audit import AuditTrail
from utils.confirmation import UserConfirmation, ActionOption
from utils.logger import logger

try:
    from langchain_ollama import ChatOllama
except ImportError:
    from langchain_community.chat_models import ChatOllama
try:
    from langchain_openai import ChatOpenAI
except ImportError:
    ChatOpenAI = None

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
from config import settings


def _create_llm(
    provider: Optional[str] = None,
    model: Optional[str] = None,
    temperature: Optional[float] = None,
) -> BaseChatModel:
    """创建 LLM 实例（复用 langchain_agent 的逻辑）。"""
    p = (provider or settings.llm_provider or "ollama").strip().lower()
    if p == "ollama":
        return ChatOllama(
            base_url=settings.ollama_base_url,
            model=model or settings.ollama_model,
            temperature=temperature if temperature is not None else settings.ollama_temperature,
        )
    if p == "deepseek":
        if ChatOpenAI is None:
            raise ImportError("需安装 langchain-openai: pip install langchain-openai")
        if not settings.deepseek_api_key:
            raise ValueError("请设置 DEEPSEEK_API_KEY")
        resolved = (model or settings.deepseek_model).strip()
        if resolved.lower() == "reasoner":
            resolved = settings.deepseek_reasoner_model
        return ChatOpenAI(
            api_key=settings.deepseek_api_key,
            base_url=(settings.deepseek_base_url).rstrip("/"),
            model=resolved,
            temperature=temperature if temperature is not None else settings.deepseek_temperature,
        )
    raise ValueError(f"不支持的推理后端: {p}")


class SecurityReActAgent(BaseAgent):
    """
    安全测试 ReAct 智能体基类。
    ReAct 循环：Think -> Action -> Observation -> ... -> Final Answer

    子类通过设置 auto_execute 区分模式：
      - auto_execute=True (HackbotAgent): 自动执行工具
      - auto_execute=False (SuperHackbotAgent): 敏感操作需用户确认
    """

    def __init__(
        self,
        name: str,
        system_prompt: str,
        tools: Optional[List[BaseTool]] = None,
        auto_execute: bool = True,
        max_iterations: int = 10,
        audit_trail: Optional[AuditTrail] = None,
    ):
        super().__init__(name, system_prompt)
        self.security_tools = tools or []
        self.tools_dict: Dict[str, BaseTool] = {t.name: t for t in self.security_tools}
        self.auto_execute = auto_execute
        self.max_iterations = max_iterations
        self.audit = audit_trail
        self.confirmation = UserConfirmation() if not auto_execute else None

        # LLM
        self._provider_override: Optional[str] = None
        self._model_override: Optional[str] = None
        self.llm = _create_llm()
        self.model = settings.ollama_model if (settings.llm_provider or "ollama").strip().lower() == "ollama" else settings.deepseek_model

        # ReAct 状态
        self._react_history: List[Dict[str, str]] = []  # 当前任务的 think/act/obs 历史
        self._waiting_for_confirm = False

    # ---- 模型切换 ----

    def switch_model(self, provider: Optional[str] = None, model: Optional[str] = None) -> str:
        if provider is not None:
            self._provider_override = provider.strip().lower()
            if model is None:
                self._model_override = None
        if model is not None:
            self._model_override = model.strip()
        p = self._provider_override or settings.llm_provider or "ollama"
        m = self._model_override
        self.llm = _create_llm(provider=p, model=m)
        self.model = m or (settings.ollama_model if p == "ollama" else settings.deepseek_model)
        logger.info(f"已切换推理模型: {self.get_current_model()}")
        return self.get_current_model()

    def get_current_model(self) -> str:
        p = (self._provider_override or settings.llm_provider or "ollama").strip().lower()
        m = self._model_override or (settings.ollama_model if p == "ollama" else settings.deepseek_model)
        return f"{p} / {m}"

    # ---- 工具描述 ----

    def _get_tools_description(self) -> str:
        """生成工具列表描述，供 LLM 参考。"""
        lines = ["可用工具："]
        for t in self.security_tools:
            sens = getattr(t, "sensitivity", "low")
            sens_tag = " [敏感-需确认]" if sens == "high" else ""
            lines.append(f"- {t.name}: {t.description}{sens_tag}")
        return "\n".join(lines)

    # ---- LLM 调用 ----

    async def _call_llm(self, messages: List) -> str:
        """调用 LLM 并提取文本内容。"""
        try:
            response = await self.llm.ainvoke(messages)
        except Exception as e:
            logger.error(f"LLM 调用失败: {e}")
            return f"[LLM 调用失败: {e}]"

        if hasattr(response, "content") and response.content:
            return str(response.content)
        return str(response)

    # ---- ReAct 核心 ----

    async def process(self, user_input: str, **kwargs) -> str:
        """
        ReAct 主处理流程。
        如果有待确认的操作（superhackbot），返回方案列表等待 /accept。
        """
        # 如果在等待确认且用户输入不是 /accept 或 /reject，提醒用户
        if self._waiting_for_confirm and self.confirmation:
            return self.confirmation.get_pending_text() + "\n\n请先输入 `/accept N` 确认方案或 `/reject` 拒绝。"

        self.add_message("user", user_input)
        self._react_history = []

        if self.audit:
            self.audit.record(self.name, "result", f"用户输入: {user_input}")

        response_parts = []
        iteration = 0

        while iteration < self.max_iterations:
            iteration += 1

            # ---- THINK ----
            thought = await self._think(user_input)
            self._react_history.append({"type": "thought", "content": thought})
            if self.audit:
                self.audit.record(self.name, "thought", thought)
            response_parts.append(f"💭 **Thought {iteration}**: {thought}\n")

            # ---- 解析 ACTION ----
            action_info = self._parse_action(thought)

            if action_info is None:
                # LLM 认为任务完成，直接输出最终答案
                final = self._extract_final_answer(thought)
                if self.audit:
                    self.audit.record(self.name, "result", final)
                response_parts.append(f"\n📋 **结果**: {final}")
                break

            tool_name = action_info.get("tool", "")
            tool_params = action_info.get("params", {})

            # ---- 检查工具是否存在 ----
            tool = self.tools_dict.get(tool_name)
            if not tool:
                obs = f"工具 '{tool_name}' 不存在。可用工具: {', '.join(self.tools_dict.keys())}"
                self._react_history.append({"type": "observation", "content": obs})
                if self.audit:
                    self.audit.record(self.name, "observation", obs)
                response_parts.append(f"⚡ **Action {iteration}**: {tool_name}({tool_params})\n")
                response_parts.append(f"👁️ **Observation {iteration}**: {obs}\n")
                continue

            # ---- 敏感操作确认（superhackbot）----
            sensitivity = getattr(tool, "sensitivity", "low")
            if not self.auto_execute and sensitivity == "high" and self.confirmation:
                option = ActionOption(
                    index=1,
                    tool_name=tool_name,
                    description=f"执行 {tool_name}: {tool.description}",
                    params=tool_params,
                    sensitivity=sensitivity,
                )
                proposal = self.confirmation.propose(thought, [option])
                self._waiting_for_confirm = True
                # 缓存当前迭代状态
                self._pending_iteration = iteration
                self._pending_response_parts = response_parts
                self._pending_user_input = user_input
                if self.audit:
                    self.audit.record(self.name, "action", f"提出方案待确认: {tool_name}", {"params": tool_params})
                return proposal

            # ---- 执行工具 ----
            response_parts.append(f"⚡ **Action {iteration}**: {tool_name}({tool_params})\n")
            if self.audit:
                self.audit.record(self.name, "action", f"执行: {tool_name}", {"params": tool_params})

            result = await self._execute_tool(tool, tool_params)
            obs = self._format_observation(result)
            self._react_history.append({"type": "observation", "content": obs})
            if self.audit:
                self.audit.record(self.name, "observation", obs, {"tool": tool_name, "success": result.success})
            response_parts.append(f"👁️ **Observation {iteration}**: {obs}\n")

        else:
            response_parts.append(f"\n⚠️ 达到最大迭代次数 ({self.max_iterations})，停止执行。")
            if self.audit:
                self.audit.record(self.name, "result", "达到最大迭代次数")

        full_response = "\n".join(response_parts)
        self.add_message("assistant", full_response)
        return full_response

    async def handle_accept(self, choice: int = 1) -> str:
        """处理用户 /accept 确认。"""
        if not self.confirmation or not self.confirmation.is_pending():
            return "当前没有待确认的操作。"

        selected = self.confirmation.accept(choice)
        if not selected:
            return f"无效的方案编号: {choice}"

        self._waiting_for_confirm = False
        if self.audit:
            self.audit.record(self.name, "confirm", f"用户确认方案 [{choice}]: {selected.tool_name}", {"params": selected.params})

        tool = self.tools_dict.get(selected.tool_name)
        if not tool:
            return f"工具 '{selected.tool_name}' 不存在。"

        # 恢复执行
        iteration = getattr(self, "_pending_iteration", 0)
        response_parts = getattr(self, "_pending_response_parts", [])
        user_input = getattr(self, "_pending_user_input", "")

        response_parts.append(f"✅ 用户确认执行方案 [{choice}]\n")
        response_parts.append(f"⚡ **Action {iteration}**: {selected.tool_name}({selected.params})\n")

        if self.audit:
            self.audit.record(self.name, "action", f"执行已确认: {selected.tool_name}", {"params": selected.params})

        result = await self._execute_tool(tool, selected.params)
        obs = self._format_observation(result)
        self._react_history.append({"type": "observation", "content": obs})
        if self.audit:
            self.audit.record(self.name, "observation", obs, {"tool": selected.tool_name, "success": result.success})
        response_parts.append(f"👁️ **Observation {iteration}**: {obs}\n")

        # 继续 ReAct 循环
        iteration += 1
        while iteration <= self.max_iterations:
            thought = await self._think(user_input)
            self._react_history.append({"type": "thought", "content": thought})
            if self.audit:
                self.audit.record(self.name, "thought", thought)
            response_parts.append(f"💭 **Thought {iteration}**: {thought}\n")

            action_info = self._parse_action(thought)
            if action_info is None:
                final = self._extract_final_answer(thought)
                if self.audit:
                    self.audit.record(self.name, "result", final)
                response_parts.append(f"\n📋 **结果**: {final}")
                break

            t_name = action_info.get("tool", "")
            t_params = action_info.get("params", {})
            t = self.tools_dict.get(t_name)

            if not t:
                obs = f"工具 '{t_name}' 不存在。"
                self._react_history.append({"type": "observation", "content": obs})
                response_parts.append(f"⚡ **Action {iteration}**: {t_name}({t_params})\n")
                response_parts.append(f"👁️ **Observation {iteration}**: {obs}\n")
                iteration += 1
                continue

            sens = getattr(t, "sensitivity", "low")
            if not self.auto_execute and sens == "high" and self.confirmation:
                option = ActionOption(
                    index=1, tool_name=t_name,
                    description=f"执行 {t_name}: {t.description}",
                    params=t_params, sensitivity=sens,
                )
                proposal = self.confirmation.propose(thought, [option])
                self._waiting_for_confirm = True
                self._pending_iteration = iteration
                self._pending_response_parts = response_parts
                self._pending_user_input = user_input
                if self.audit:
                    self.audit.record(self.name, "action", f"提出方案待确认: {t_name}", {"params": t_params})
                return "\n".join(response_parts) + "\n\n" + proposal

            response_parts.append(f"⚡ **Action {iteration}**: {t_name}({t_params})\n")
            if self.audit:
                self.audit.record(self.name, "action", f"执行: {t_name}", {"params": t_params})
            result = await self._execute_tool(t, t_params)
            obs = self._format_observation(result)
            self._react_history.append({"type": "observation", "content": obs})
            if self.audit:
                self.audit.record(self.name, "observation", obs, {"tool": t_name, "success": result.success})
            response_parts.append(f"👁️ **Observation {iteration}**: {obs}\n")
            iteration += 1

        full_response = "\n".join(response_parts)
        self.add_message("assistant", full_response)
        return full_response

    async def handle_reject(self) -> str:
        """处理用户 /reject 拒绝。"""
        if not self.confirmation:
            return "当前模式不需要确认操作。"
        if not self.confirmation.is_pending():
            return "当前没有待确认的操作。"

        self.confirmation.reject()
        self._waiting_for_confirm = False
        if self.audit:
            self.audit.record(self.name, "reject", "用户拒绝了方案")
        return "已拒绝当前方案。请重新描述需求，我会为您重新分析。"

    # ---- 内部方法 ----

    async def _think(self, user_input: str) -> str:
        """调用 LLM 进行推理，输出 Thought（含可能的 Action JSON）。"""
        history_text = ""
        for item in self._react_history:
            t = item["type"].upper()
            history_text += f"\n[{t}] {item['content']}"

        tools_desc = self._get_tools_description()

        prompt = f"""你是一个安全测试专家，使用 ReAct 模式工作。

{tools_desc}

## 输出格式

每次推理请严格按以下格式之一输出：

### 需要调用工具时：
Thought: <你的分析和推理>
Action: {{"tool": "<工具名>", "params": {{<参数JSON>}}}}

### 任务完成时（不再需要工具）：
Thought: <你的分析>
Final Answer: <最终结论和报告>

## 当前任务

用户请求: {user_input}

## 历史记录
{history_text if history_text else "(无)"}

请继续推理："""

        messages = [
            SystemMessage(content=self.system_prompt),
            HumanMessage(content=prompt),
        ]
        return await self._call_llm(messages)

    def _parse_action(self, thought: str) -> Optional[Dict[str, Any]]:
        """
        从 LLM 输出中解析 Action JSON。
        如果输出包含 Final Answer 则返回 None。
        """
        if "Final Answer:" in thought or "final answer:" in thought.lower():
            return None

        # 尝试匹配 Action: {...}
        action_match = re.search(r'Action:\s*(\{.*?\})', thought, re.DOTALL)
        if action_match:
            try:
                return json.loads(action_match.group(1))
            except json.JSONDecodeError:
                pass

        # 尝试匹配独立的 JSON 块
        json_match = re.search(r'\{[^{}]*"tool"[^{}]*\}', thought, re.DOTALL)
        if json_match:
            try:
                return json.loads(json_match.group())
            except json.JSONDecodeError:
                pass

        return None

    def _extract_final_answer(self, thought: str) -> str:
        """提取 Final Answer 部分。"""
        for marker in ["Final Answer:", "final answer:", "FINAL ANSWER:"]:
            idx = thought.find(marker)
            if idx != -1:
                return thought[idx + len(marker):].strip()
        # 如果没有明确标记，返回整个 thought
        return thought.strip()

    async def _execute_tool(self, tool: BaseTool, params: Dict[str, Any]) -> ToolResult:
        """执行工具调用。"""
        try:
            result = await tool.execute(**params)
            return result
        except Exception as e:
            logger.error(f"工具 {tool.name} 执行失败: {e}")
            return ToolResult(success=False, result=None, error=str(e))

    def _format_observation(self, result: ToolResult) -> str:
        """格式化工具执行结果。"""
        if result.success:
            if isinstance(result.result, dict):
                return json.dumps(result.result, ensure_ascii=False, indent=2)
            return str(result.result)
        return f"执行失败: {result.error}"
