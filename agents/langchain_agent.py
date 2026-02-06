"""
基于 LangChain 的智能体实现
使用 LangChain 进行任务编排和工具调用
支持 Ollama（本地）与 DeepSeek（云端 API）两种推理后端
"""
from typing import Optional, List, Dict, Any

try:
    from langchain_ollama import ChatOllama
except ImportError:
    from langchain_community.chat_models import ChatOllama
try:
    from langchain_openai import ChatOpenAI
except ImportError:
    ChatOpenAI = None  # 使用 DeepSeek 时需安装 langchain-openai

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import SystemMessage, HumanMessage
from langchain_core.tools import BaseTool as LangChainBaseTool

from agents.base import BaseAgent
from config import settings
from tools.base import BaseTool
from utils.logger import logger
from utils.tool_caller import ToolDescriptionGenerator


def _create_llm(
    provider: Optional[str] = None,
    model: Optional[str] = None,
    base_url: Optional[str] = None,
    temperature: Optional[float] = None,
) -> BaseChatModel:
    """根据配置或运行时参数创建推理模型（Ollama 或 DeepSeek）。"""
    p = (provider or settings.llm_provider or "ollama").strip().lower()
    if p == "ollama":
        return ChatOllama(
            base_url=base_url or settings.ollama_base_url,
            model=model or settings.ollama_model,
            temperature=temperature if temperature is not None else settings.ollama_temperature,
        )
    if p == "deepseek":
        if ChatOpenAI is None:
            raise ImportError(
                "使用 DeepSeek 推理需安装 langchain-openai，请执行: pip install langchain-openai"
            )
        if not settings.deepseek_api_key:
            raise ValueError(
                "使用 DeepSeek 时请设置环境变量 DEEPSEEK_API_KEY"
            )
        # 支持 reasoner 别名：推理模式（思考链）
        resolved = (model or settings.deepseek_model).strip()
        if resolved.lower() == "reasoner":
            resolved = settings.deepseek_reasoner_model
        return ChatOpenAI(
            api_key=settings.deepseek_api_key,
            base_url=(base_url or settings.deepseek_base_url).rstrip("/"),
            model=resolved,
            temperature=temperature if temperature is not None else settings.deepseek_temperature,
        )
    raise ValueError(
        f"不支持的推理后端: {p}，可选值: ollama, deepseek"
    )


class LangChainToolWrapper(LangChainBaseTool):
    """将我们的工具包装为 LangChain 工具"""
    
    def __init__(self, tool: BaseTool):
        self._tool = tool
        super().__init__(
            name=tool.name,
            description=tool.description
        )
    
    def _run(self, *args, **kwargs) -> str:
        """同步执行工具"""
        import asyncio
        try:
            # 如果有运行中的事件循环，使用它
            loop = asyncio.get_event_loop()
            if loop.is_running():
                # 如果已经在运行的事件循环中，使用 run_until_complete
                import concurrent.futures
                with concurrent.futures.ThreadPoolExecutor() as executor:
                    future = executor.submit(asyncio.run, self._tool.execute(**kwargs))
                    result = future.result()
            else:
                result = loop.run_until_complete(self._tool.execute(**kwargs))
        except RuntimeError:
            # 没有事件循环，创建一个新的
            result = asyncio.run(self._tool.execute(**kwargs))
        
        if result.success:
            if isinstance(result.result, dict):
                return str(result.result.get("output") or result.result.get("stdout") or result.result)
            return str(result.result)
        else:
            return f"错误: {result.error}"
    
    async def _arun(self, *args, **kwargs) -> str:
        """异步执行工具"""
        if not hasattr(self, '_tool'):
            return "错误: 工具对象未正确初始化"
        result = await self._tool.execute(**kwargs)
        if result.success:
            if isinstance(result.result, dict):
                return str(result.result.get("output") or result.result.get("stdout") or result.result)
            return str(result.result)
        else:
            return f"错误: {result.error}"


class LangChainAgent(BaseAgent):
    """基于 LangChain 的智能体，使用 LangChain 进行任务编排和工具调用"""
    
    def __init__(
        self, 
        name: str = "LangChainAgent",
        system_prompt: Optional[str] = None,
        tools: Optional[List[BaseTool]] = None
    ):
        super().__init__(name, system_prompt)
        self.tools = tools or []
        # 运行时模型覆盖（对话中 /model 切换用）
        self._provider_override: Optional[str] = None
        self._model_override: Optional[str] = None
        
        self._sync_base_url_and_model()
        self.llm = _create_llm(
            provider=self._provider_override or settings.llm_provider,
            model=self._model_override,
        )
        logger.info(f"推理后端: {self._provider_override or settings.llm_provider}, 模型: {self.model}")
        
        # 初始化工具描述生成器
        self.tool_desc_generator = ToolDescriptionGenerator(self.tools) if self.tools else None
        
        # 将工具转换为 LangChain 工具
        langchain_tools = [LangChainToolWrapper(tool) for tool in self.tools]
        
        # 使用 LangChain 1.1+ 的新 API
        if langchain_tools:
            self.tools_dict = {tool.name: tool for tool in langchain_tools}
            # 配置或运行时发现模型不支持 tools 时，不绑定工具
            supports_tools = getattr(settings, "llm_tools_supported", True)
            if not supports_tools:
                self.llm_with_tools = self.llm
                self.use_bind_tools = False
                logger.info("LLM_TOOLS_SUPPORTED=false，使用纯对话模式（不绑定工具）")
            else:
                try:
                    self.llm_with_tools = self.llm.bind_tools(langchain_tools)
                    self.use_bind_tools = True
                    logger.info("使用 bind_tools 进行工具绑定")
                except (NotImplementedError, AttributeError) as e:
                    self.llm_with_tools = self.llm
                    self.use_bind_tools = False
                    logger.warning(f"当前模型不支持 bind_tools ({e})，将使用提示词方式处理工具调用")
            
            # 使用工具描述生成器增强系统提示词
            if self.tool_desc_generator:
                tools_desc = self.tool_desc_generator.get_tools_for_prompt()
                enhanced_prompt = f"{self.system_prompt}\n\n{tools_desc}"
                self.update_system_prompt(enhanced_prompt)
                logger.debug(f"系统提示词已增强，包含 {self.tool_desc_generator.get_tools_count()} 个工具的描述")
        else:
            self.llm_with_tools = self.llm
            self.tools_dict = {}
            self.use_bind_tools = False
            logger.warning("没有提供工具，LangChain Agent 将无法使用工具调用功能")
    
    def _sync_base_url_and_model(self) -> None:
        """根据当前 provider/model 覆盖更新 base_url 和 model（用于显示）。"""
        p = (self._provider_override or settings.llm_provider or "ollama").strip().lower()
        if p == "ollama":
            self.base_url = settings.ollama_base_url
            self.model = self._model_override if self._model_override is not None else settings.ollama_model
        else:
            self.base_url = settings.deepseek_base_url
            self.model = self._model_override if self._model_override is not None else settings.deepseek_model
    
    def _recreate_llm(self) -> None:
        """按当前 provider/model 覆盖重新创建 llm 与 llm_with_tools。"""
        p = (self._provider_override or settings.llm_provider or "ollama").strip().lower()
        m = self._model_override or (settings.ollama_model if p == "ollama" else settings.deepseek_model)
        self.llm = _create_llm(provider=p, model=m)
        self._sync_base_url_and_model()
        if self.tools_dict:
            supports_tools = getattr(settings, "llm_tools_supported", True)
            if not supports_tools:
                self.llm_with_tools = self.llm
                self.use_bind_tools = False
            else:
                try:
                    langchain_tools = list(self.tools_dict.values())
                    self.llm_with_tools = self.llm.bind_tools(langchain_tools)
                    self.use_bind_tools = True
                except (NotImplementedError, AttributeError):
                    self.llm_with_tools = self.llm
                    self.use_bind_tools = False
        else:
            self.llm_with_tools = self.llm
        logger.info(f"已切换推理模型: {p} / {self.model}")
    
    def switch_model(self, provider: Optional[str] = None, model: Optional[str] = None) -> str:
        """
        切换推理模型（对话中生效）。
        provider: ollama | deepseek，不传则仅改模型名
        model: 模型名，如 gemma3:1b、deepseek-chat；仅切换 provider 时不传则用该后端默认模型
        返回当前模型描述字符串。
        """
        if provider is not None:
            self._provider_override = provider.strip().lower()
            if model is None:
                self._model_override = None  # 换后端时用该后端默认模型
        if model is not None:
            self._model_override = model.strip()
        self._recreate_llm()
        return self.get_current_model()
    
    def get_current_model(self) -> str:
        """返回当前推理后端与模型描述（用于展示）。"""
        self._sync_base_url_and_model()
        p = (self._provider_override or settings.llm_provider or "ollama").strip().lower()
        return f"{p} / {self.model}"
    
    def _extract_response_content(self, response) -> str:
        """
        从响应对象中提取内容
        
        Args:
            response: LLM 响应对象
            
        Returns:
            响应文本内容
        """
        # 尝试多种方式提取内容
        if hasattr(response, 'content'):
            content = response.content
            if content:
                return str(content)
        
        # 尝试从 response_metadata 中获取
        if hasattr(response, 'response_metadata'):
            metadata = response.response_metadata
            if isinstance(metadata, dict):
                # 检查是否有 thinking 字段（Ollama 特有）
                if 'thinking' in metadata:
                    return str(metadata['thinking'])
                # 检查其他可能的字段
                for key in ['text', 'output', 'message']:
                    if key in metadata:
                        return str(metadata[key])
        
        # 尝试直接转换为字符串
        try:
            result = str(response)
            if result and result != 'None':
                return result
        except:
            pass
        
        # 如果都失败了，返回空字符串
        return ""
    
    def get_tools_info(self) -> Dict[str, Any]:
        """
        获取工具信息
        
        Returns:
            包含工具信息的字典
        """
        if not self.tool_desc_generator:
            return {
                "count": 0,
                "names": [],
                "summary": "无可用工具"
            }
        
        return {
            "count": self.tool_desc_generator.get_tools_count(),
            "names": self.tool_desc_generator.get_tool_names(),
            "summary": self.tool_desc_generator.get_tools_summary(),
            "description": self.tool_desc_generator.get_tools_description(format="text")
        }
    
    async def process(self, user_input: str, **kwargs) -> str:
        """处理用户输入"""
        try:
            # 添加用户消息
            self.add_message("user", user_input)
            
            if self.tools_dict:
                # 使用 LangChain 1.1+ 的工具调用方式
                # 构建消息历史
                messages = []
                for msg in self.messages:
                    if msg.role == "system":
                        messages.append(SystemMessage(content=msg.content))
                    elif msg.role == "user":
                        messages.append(HumanMessage(content=msg.content))
                    elif msg.role == "assistant":
                        from langchain_core.messages import AIMessage
                        messages.append(AIMessage(content=msg.content))
                
                # 添加用户输入
                messages.append(HumanMessage(content=user_input))
                
                # 调用 LLM（带工具绑定或提示词方式）
                try:
                    response = await self.llm_with_tools.ainvoke(messages)
                except Exception as e:
                    # 部分 Ollama 模型（如 gemma3:1b）不支持 tools，会返回 400
                    err_msg = str(e).lower()
                    if ("does not support tools" in err_msg or "support tools" in err_msg) or (
                        getattr(e, "status_code", None) == 400 and "tools" in err_msg
                    ):
                        logger.warning(
                            "当前模型不支持工具调用，已自动回退为纯对话模式。"
                            "若经常使用该模型，可在 .env 中设置 LLM_TOOLS_SUPPORTED=false 以跳过工具绑定。"
                        )
                        response = await self.llm.ainvoke(messages)
                    else:
                        raise
                
                # 记录响应信息用于调试
                logger.debug(f"LLM 响应类型: {type(response)}")
                logger.debug(f"LLM 响应属性: {dir(response)}")
                if hasattr(response, 'content'):
                    logger.debug(f"响应内容: {response.content}")
                if hasattr(response, 'tool_calls'):
                    logger.debug(f"工具调用: {response.tool_calls}")
                
                # 检查是否有工具调用
                tool_calls = []
                if self.use_bind_tools:
                    # 使用 bind_tools 时，工具调用在 response.tool_calls 中
                    if hasattr(response, 'tool_calls') and response.tool_calls:
                        tool_calls = response.tool_calls
                else:
                    # 使用提示词方式时，需要从响应文本中解析工具调用
                    if hasattr(response, 'tool_calls') and response.tool_calls:
                        tool_calls = response.tool_calls
                    # 如果响应是文本格式，可以尝试解析 JSON 格式的工具调用
                    elif hasattr(response, 'content') and response.content:
                        # 尝试从内容中解析工具调用（简化版）
                        import json
                        import re
                        content = response.content
                        # 查找 JSON 格式的工具调用
                        json_pattern = r'\{[^{}]*"tool"[^{}]*\}'
                        matches = re.finditer(json_pattern, content, re.DOTALL)
                        for match in matches:
                            try:
                                call = json.loads(match.group())
                                if "tool" in call:
                                    tool_calls.append({
                                        "name": call.get("tool"),
                                        "args": {k: v for k, v in call.items() if k != "tool"}
                                    })
                            except:
                                pass
                
                # 执行工具调用
                if tool_calls:
                    tool_results = []
                    for tool_call in tool_calls:
                        # 解析工具调用格式
                        # 格式1: tool_call['name'] 和 tool_call['args']
                        # 格式2: tool_call['args']['name'] 和 tool_call['args']['arguments'] (Ollama 特有格式)
                        # 格式3: tool_call['function']['name'] 和 tool_call['function']['arguments']
                        
                        tool_name = None
                        tool_args = {}
                        
                        # 尝试从 args 中提取（Ollama 格式）
                        if isinstance(tool_call.get("args"), dict):
                            args_dict = tool_call["args"]
                            if "name" in args_dict:
                                tool_name = args_dict["name"]
                            if "arguments" in args_dict:
                                tool_args = args_dict["arguments"]
                        
                        # 如果还没有找到，尝试标准格式
                        if not tool_name:
                            tool_name = tool_call.get("name") or tool_call.get("function", {}).get("name")
                        
                        if not tool_args:
                            tool_args = tool_call.get("args") or tool_call.get("function", {}).get("arguments", {})
                        
                        # 记录调试信息
                        logger.debug(f"解析工具调用: name={tool_name}, args={tool_args}, 原始调用={tool_call}")
                        
                        if tool_name and tool_name in self.tools_dict:
                            tool = self.tools_dict[tool_name]
                            try:
                                # 执行工具
                                if isinstance(tool_args, str):
                                    import json
                                    tool_args = json.loads(tool_args)
                                
                                # 处理嵌套参数格式 {'args': [...], 'kwargs': {...}}
                                if isinstance(tool_args, dict) and 'args' in tool_args and 'kwargs' in tool_args:
                                    # 合并 args 和 kwargs
                                    final_kwargs = tool_args.get('kwargs', {})
                                    # 如果 args 是列表且只有一个元素，可能是命令字符串
                                    if isinstance(tool_args.get('args'), list) and len(tool_args['args']) == 1:
                                        final_kwargs['command'] = tool_args['args'][0]
                                    tool_args = final_kwargs
                                
                                logger.info(f"执行工具: {tool_name}, 参数: {tool_args}")
                                result = await tool._arun(**tool_args)
                                tool_results.append(f"工具 {tool_name} 执行结果: {result}")
                            except Exception as e:
                                logger.error(f"工具 {tool_name} 执行失败: {e}")
                                tool_results.append(f"工具 {tool_name} 执行失败: {str(e)}")
                        else:
                            logger.warning(f"未找到工具: {tool_name}, 可用工具: {list(self.tools_dict.keys())}")
                            tool_results.append(f"错误: 未找到工具 '{tool_name}'")
                    
                    # 将工具结果添加到消息中
                    from langchain_core.messages import ToolMessage
                    for i, result in enumerate(tool_results):
                        messages.append(ToolMessage(content=result, tool_call_id=tool_calls[i].get("id", f"call_{i}")))
                    
                    # 再次调用 LLM 获取最终响应
                    final_response = await self.llm.ainvoke(messages)
                    assistant_response = self._extract_response_content(final_response)
                else:
                    # 没有工具调用，直接使用响应
                    assistant_response = self._extract_response_content(response)
            else:
                # 没有工具，直接调用 LLM
                messages = []
                for msg in self.messages:
                    if msg.role == "system":
                        messages.append(SystemMessage(content=msg.content))
                    elif msg.role == "user":
                        messages.append(HumanMessage(content=msg.content))
                    elif msg.role == "assistant":
                        from langchain_core.messages import AIMessage
                        messages.append(AIMessage(content=msg.content))
                
                response = await self.llm.ainvoke(messages)
                assistant_response = self._extract_response_content(response)
            
            # 处理空响应
            if not assistant_response or (isinstance(assistant_response, str) and not assistant_response.strip()):
                logger.warning(f"LLM 返回空响应。响应对象: {response}, 类型: {type(response)}")
                # 尝试从响应对象中提取更多信息
                if hasattr(response, '__dict__'):
                    logger.warning(f"响应对象属性: {response.__dict__}")
                if hasattr(response, 'response_metadata'):
                    logger.warning(f"响应元数据: {response.response_metadata}")
                # 返回友好的错误消息
                provider = (settings.llm_provider or "ollama").strip().lower()
                hint = "或检查 Ollama 服务是否正常运行。" if provider == "ollama" else "或检查 DeepSeek API Key 与网络。"
                assistant_response = f"抱歉，我暂时无法生成响应。这可能是因为：\n1. 模型响应格式异常\n2. 提示词过长导致截断\n3. 网络连接问题\n\n请稍后重试，{hint}"
            
            # 添加助手消息
            self.add_message("assistant", assistant_response)
            
            # 保存对话到数据库（如果可用）
            if hasattr(self, 'db_memory') and self.db_memory:
                await self.db_memory.save_conversation(user_input, assistant_response)
            
            logger.info(f"智能体 {self.name} 处理完成")
            return assistant_response
            
        except Exception as e:
            logger.error(f"LangChain Agent 处理错误: {e}")
            import traceback
            traceback.print_exc()
            return f"抱歉，处理时出现错误: {str(e)}"

