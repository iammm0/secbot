"""
QAAgent：专门处理简单问候与项目/上下文问答
- 所有回复均通过 LLM 生成，不设规则快捷回复
- 问候、闲聊、项目能力、帮助等均走 LLM
- Ask 模式：带上下文的 LLM 问答，可选用通用工具（搜索、系统信息、CVE、文件分析）以更准确回答
"""

import asyncio
from typing import Optional, List, Dict, Any

from secbot_agent.core.agents.base import BaseAgent
from utils.logger import logger


# Ask 模式系统提示词（无工具）
ASK_SYSTEM_PROMPT = """你是 Hackbot 的 Ask 模式助手。你的任务是**仅根据当前对话上下文**来回答用户的问题。

规则：
- 仅根据对话上下文中已有的信息来回答
- 如果上下文中没有相关信息，坦诚说明「当前对话中暂无相关信息」
- 不要编造或猜测上下文中不存在的数据
- 不要调用任何工具，不要执行任何操作
- 回答应简洁、准确、有条理
- 如果涉及扫描结果、漏洞发现等安全数据，引用上下文中的具体内容
- 使用 Markdown 格式化输出以提高可读性"""

# Ask 模式系统提示词（带工具：用于更确切回答）
ASK_SYSTEM_PROMPT_WITH_TOOLS = """你是 Hackbot 的 Ask 模式助手。你的任务是根据当前对话上下文**并结合可选工具**来准确回答用户问题。

规则：
- 优先根据对话上下文中已有信息回答；若信息不足或用户问题涉及实时/外部数据，可调用工具获取后再回答
- 可用工具：网络搜索(web_search)、本机系统信息(system_info)、CVE 漏洞查询(cve_lookup)、文件分析(file_analyze)。仅用这些工具做查询与信息收集，不执行任何攻击或修改操作
- 若上下文中已有足够信息则不必调用工具；若需查最新资料、本机状态、漏洞详情、文件属性等再调用
- 回答应简洁、准确、有条理，引用工具返回的关键信息时注明来源
- 使用 Markdown 格式化输出
- 不要编造数据；若工具调用失败则根据已有上下文或坦诚说明无法获取"""


def get_ask_tools() -> List[Any]:
    """返回 Ask 模式可用的通用工具列表（只读/低敏感：搜索、系统信息、CVE、文件分析）。"""
    from tools.base import BaseTool

    tools: List[BaseTool] = []
    try:
        from tools.web_search import WebSearchTool
        tools.append(WebSearchTool())
    except Exception as e:
        logger.bind(agent="qa", event="agent_error", attempt=1).debug(f"Ask 工具 web_search 未加载: {e}")
    try:
        from tools.defense.system_info_tool import SystemInfoTool
        tools.append(SystemInfoTool())
    except Exception as e:
        logger.bind(agent="qa", event="agent_error", attempt=1).debug(f"Ask 工具 system_info 未加载: {e}")
    try:
        from tools.utility.cve_lookup_tool import CveLookupTool
        tools.append(CveLookupTool())
    except Exception as e:
        logger.bind(agent="qa", event="agent_error", attempt=1).debug(f"Ask 工具 cve_lookup 未加载: {e}")
    try:
        from tools.utility.file_analyze_tool import FileAnalyzeTool
        tools.append(FileAnalyzeTool())
    except Exception as e:
        logger.bind(agent="qa", event="agent_error", attempt=1).debug(f"Ask 工具 file_analyze 未加载: {e}")
    return tools


class QAAgent(BaseAgent):
    """
    问答 Agent：仅做简短回复，不调用工具、不生成执行计划。
    用于：问候、闲聊、了解项目能力、了解对话上下文等。

    Ask 模式：带上下文的 LLM 问答；可选接入通用工具以更确切回答。
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
        self._ask_tools: Optional[List[Any]] = None  # Ask 模式通用工具，延迟加载
        logger.bind(agent=self.name, event="stage_start", attempt=1).info("初始化 QAAgent")

    def _ensure_llm(self):
        """延迟创建 LLM 实例（仅 ask 模式需要）"""
        if self._llm is None:
            try:
                from secbot_agent.core.patterns.security_react import _create_llm

                self._llm = _create_llm()
                logger.bind(agent=self.name, event="stage_start", attempt=1).info("QAAgent: LLM 实例已创建（用于 Ask 模式）")
            except Exception as e:
                logger.bind(agent=self.name, event="llm_error", attempt=1).error(f"QAAgent: 创建 LLM 实例失败: {e}")
                raise

    def _get_ask_tools_langchain(self):
        """返回 Ask 工具经 LangChain 包装后的列表，用于 bind_tools。"""
        from secbot_agent.core.agents.tool_calling_agent import LangChainToolWrapper

        if self._ask_tools is None:
            self._ask_tools = get_ask_tools()
        return [LangChainToolWrapper(t) for t in self._ask_tools]

    async def _answer_via_http_fallback(self, messages: List[dict]) -> str:
        """
        当 LangChain ainvoke 因部分兼容 API 返回格式触发 model_dump 异常时，
        使用共享的 OpenAI 兼容 chat/completions 直连请求。
        messages: [{"role": "system"|"user"|"assistant", "content": "..."}]
        """
        from utils.llm_http_fallback import chat_completions_request

        result = await chat_completions_request(
            messages, max_tokens=2048, timeout=30.0
        )
        if result.startswith("[LLM 回退失败:"):
            return f"回复出错: {result}"
        return result

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
            if isinstance(response, str):
                return response.strip()
            if hasattr(response, "content") and response.content is not None:
                return str(response.content)
            return str(response)
        except asyncio.TimeoutError:
            return "Ask 模式回答超时，请稍后重试。"
        except (AttributeError, TypeError) as e:
            if "model_dump" in str(e) or "model_dump" in type(e).__name__:
                logger.warning(f"QAAgent ask_with_context 解析触发 model_dump 异常，改用 HTTP 直连回退: {e}")
                fallback_payload = []
                for m in messages:
                    role = getattr(m, "type", None) or "user"
                    if role == "system":
                        fallback_payload.append({"role": "system", "content": getattr(m, "content", "") or ""})
                    elif role == "ai":
                        fallback_payload.append({"role": "assistant", "content": getattr(m, "content", "") or ""})
                    else:
                        fallback_payload.append({"role": "user", "content": getattr(m, "content", "") or ""})
                return await self._answer_via_http_fallback(fallback_payload)
            logger.error(f"QAAgent ask_with_context 错误: {e}")
            return f"Ask 模式回答出错: {e}"
        except Exception as e:
            logger.error(f"QAAgent ask_with_context 错误: {e}")
            return f"Ask 模式回答出错: {e}"

    async def answer_with_context_and_tools(
        self,
        user_input: str,
        conversation_history: List[dict],
        max_tool_rounds: int = 5,
    ) -> str:
        """
        Ask 模式：带对话上下文，并可调用通用工具（搜索、系统信息、CVE、文件分析）以更准确回答。
        若模型不支持 bind_tools 或无可用工具，则回退到纯 answer_with_context。
        """
        from langchain_core.messages import SystemMessage, HumanMessage, AIMessage, ToolMessage

        self._ensure_llm()
        langchain_tools = self._get_ask_tools_langchain()
        if not langchain_tools:
            logger.info("Ask 模式无可用工具，回退到纯上下文问答")
            return await self.answer_with_context(user_input, conversation_history)

        try:
            llm_with_tools = self._llm.bind_tools(langchain_tools)
        except (NotImplementedError, AttributeError, Exception) as e:
            logger.info("Ask 模式 bind_tools 不可用，回退到纯上下文问答: %s", e)
            return await self.answer_with_context(user_input, conversation_history)

        tools_dict: Dict[str, Any] = {t.name: t for t in langchain_tools}

        messages: List[Any] = [SystemMessage(content=ASK_SYSTEM_PROMPT_WITH_TOOLS)]
        if conversation_history:
            recent = conversation_history[-20:]
            context_lines = []
            for msg in recent:
                role_label = "用户" if msg.get("role") == "user" else "助手"
                content = msg.get("content", "")
                if len(str(content)) > 2000:
                    content = str(content)[:2000] + "\n... (已截断)"
                context_lines.append(f"[{role_label}]: {content}")
            context_block = "\n\n".join(context_lines)
            messages.append(HumanMessage(content=f"以下是当前对话的上下文记录：\n\n{context_block}"))
            messages.append(AIMessage(content="好的，我已了解当前对话上下文。如需查实时数据或本机信息可调用工具。"))
        messages.append(HumanMessage(content=user_input))

        try:
            for _ in range(max_tool_rounds):
                response = await asyncio.wait_for(llm_with_tools.ainvoke(messages), timeout=60.0)
                content = self._extract_ask_response_content(response)
                tool_calls = getattr(response, "tool_calls", None) or []

                if not tool_calls:
                    return (content or "").strip() or "抱歉，未能生成有效回复。"

                messages.append(response)
                tool_results = []
                for i, tc in enumerate(tool_calls):
                    tool_name = None
                    tool_args = {}
                    if isinstance(tc.get("args"), dict):
                        ad = tc["args"]
                        if "name" in ad:
                            tool_name = ad["name"]
                        if "arguments" in ad:
                            tool_args = ad["arguments"]
                    if not tool_name:
                        tool_name = tc.get("name") or (tc.get("function") or {}).get("name")
                    if not tool_args:
                        tool_args = tc.get("args") or (tc.get("function") or {}).get("arguments", {})
                    if isinstance(tool_args, str):
                        import json
                        try:
                            tool_args = json.loads(tool_args)
                        except Exception:
                            tool_args = {}
                    if isinstance(tool_args, dict) and "args" in tool_args and "kwargs" in tool_args:
                        tool_args = tool_args.get("kwargs", {})
                        if isinstance(tc.get("args"), dict) and isinstance(tc["args"].get("args"), list) and len(tc["args"].get("args", [])) == 1:
                            tool_args["command"] = tc["args"]["args"][0]
                    if not tool_name or tool_name not in tools_dict:
                        tool_results.append(f"错误: 未找到工具 '{tool_name}'")
                        continue
                    try:
                        result = await tools_dict[tool_name]._arun(**(tool_args or {}))
                        tool_results.append(f"工具 {tool_name} 执行结果: {result}")
                    except Exception as e:
                        logger.warning("Ask 工具 %s 执行失败: %s", tool_name, e)
                        tool_results.append(f"工具 {tool_name} 执行失败: {str(e)}")
                for i, res in enumerate(tool_results):
                    messages.append(ToolMessage(content=res, tool_call_id=tool_calls[i].get("id", f"call_{i}")))
            return (content or "").strip() or "抱歉，已达到工具调用轮数上限，未能生成最终回复。"
        except asyncio.TimeoutError:
            return "Ask 模式回答超时，请稍后重试。"
        except (AttributeError, TypeError) as e:
            if "model_dump" in str(e).lower():
                fallback_payload = [{"role": "system", "content": ASK_SYSTEM_PROMPT_WITH_TOOLS}]
                for m in messages:
                    if hasattr(m, "type"):
                        role = "assistant" if m.type == "ai" else ("system" if m.type == "system" else "user")
                    else:
                        role = "user"
                    fallback_payload.append({"role": role, "content": getattr(m, "content", "") or ""})
                return await self._answer_via_http_fallback(fallback_payload)
            logger.error("QAAgent answer_with_context_and_tools 错误: %s", e)
            return f"Ask 模式回答出错: {e}"
        except Exception as e:
            logger.error("QAAgent answer_with_context_and_tools 错误: %s", e)
            return f"Ask 模式回答出错: {e}"

    @staticmethod
    def _extract_ask_response_content(response: Any) -> str:
        """从 LLM 响应中提取文本内容。"""
        if hasattr(response, "content") and response.content:
            return str(response.content)
        if hasattr(response, "response_metadata") and isinstance(getattr(response, "response_metadata"), dict):
            md = response.response_metadata
            if md.get("thinking"):
                return str(md["thinking"])
            for k in ("text", "output", "message"):
                if k in md:
                    return str(md[k])
        try:
            s = str(response)
            if s and s != "None":
                return s
        except Exception:
            pass
        return ""

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
            if isinstance(response, str):
                return response.strip()
            if hasattr(response, "content") and response.content is not None:
                return str(response.content).strip()
            return str(response).strip()
        except asyncio.TimeoutError:
            return "回复超时，请稍后重试。"
        except (AttributeError, TypeError) as e:
            if "model_dump" in str(e) or "model_dump" in type(e).__name__:
                logger.warning(f"QAAgent LLM 解析触发 model_dump 异常，改用 HTTP 直连回退: {e}")
                return await self._answer_via_http_fallback(
                    [{"role": "system", "content": self.system_prompt or ""}, {"role": "user", "content": user_content}]
                )
            logger.error(f"QAAgent answer LLM 错误: {e}")
            return f"回复出错: {e}"
        except Exception as e:
            logger.error(f"QAAgent answer LLM 错误: {e}")
            return f"回复出错: {e}"
