"""
PlannerAgent v2：通用任务规划智能体
负责接收用户请求，进行智能路由，并生成结构化 TodoList：
- 简单问候/非技术请求：直接回复
- 技术请求：规划为明确的执行步骤（结构化 TodoItem）
- 支持依赖编排和实时状态追踪
"""

import json
import re
import uuid
from typing import Optional, List, Dict, Any, Tuple
from urllib.parse import urlparse

from core.agents.base import BaseAgent
from core.models import TodoItem, TodoStatus, PlanResult, RequestType
from utils.logger import logger


class PlannerAgent(BaseAgent):
    """
    Planner Agent v2 负责：
    1. 判断用户请求类型（问候/闲聊/非技术/技术）
    2. 简单请求直接回复
    3. 技术请求规划为结构化 TodoList
    4. 支持依赖编排：根据 todos 的依赖关系确定执行顺序
    5. 实时状态追踪：在 agent 执行过程中更新 todo 状态
    """

    def __init__(self, name: str = "PlannerAgent"):
        system_prompt = """你是 Hackbot 的通用任务规划器。你的职责是：

## 核心职责

### 1. 判断请求类型
- **问候类**：你好、hello、早上/下午/晚上好、再见、谢谢等
- **闲聊类**：询问天气、闲聊、关于 Hackbot 本身的问题
- **非技术类**：不属于安全巡检、系统操作、代码分析等技术范畴的请求
- **技术类**：安全巡检、漏洞扫描、漏洞挖掘、红队攻击测试、系统操作、命令执行等需要工具执行的请求

### 2. 简单请求直接回复
对于问候、闲聊、非技术请求，直接给出友好、简洁的回复，不需要调用任何工具。

### 3. 技术请求 — 结构化规划
先判断是否有必要进行多步规划：若任务可一句话或单一工具完成，可只生成 1 个 todo。
对于需要执行操作的技术请求，将任务分解为结构化 JSON 格式的 TodoList。
每个 Todo 必须包含：id、content、tool_hint（可选）、depends_on（依赖列表）。
若某步骤无需调用工具（仅需推理、说明或人工确认），tool_hint 填 null，执行时该步骤会视为完成、无需工具。

### 4. 巡检与渗透测试任务的特殊处理
对于安全巡检或渗透测试任务，规划时需注意：
- 巡检任务：按顺序执行信息收集→端口扫描→漏洞检测→报告生成
- 渗透测试任务：信息收集→漏洞挖掘→漏洞利用→权限提升→报告生成，仅限授权目标

## 输出格式

### 简单请求
直接输出回复内容，不需要额外格式。

### 技术请求 — 必须严格按以下 JSON 格式输出
```json
{
  "plan_summary": "简要说明任务目标",
  "todos": [
    {"id": "step_1", "content": "步骤描述", "tool_hint": "工具名", "depends_on": []},
    {"id": "step_2", "content": "步骤描述", "tool_hint": "工具名", "depends_on": ["step_1"]}
  ]
}
```

注意：
- todos 中的 id 必须唯一
- depends_on 只能引用前面步骤的 id
- tool_hint 是建议使用的工具名，可以为 null（无需工具的步骤执行时直接视为完成）
- 步骤数量 1-6 个均可；无需多步时可只输出 1 个 todo"""

        super().__init__(name=name, system_prompt=system_prompt)
        # 当前规划结果（用于实时追踪）
        self._current_plan: Optional[PlanResult] = None
        # 单个任务层内允许的最大并行 Todo 数量（逻辑上限，真正并行度还受执行器限制）
        self.max_parallel_per_layer: int = 3
        logger.info("初始化 PlannerAgent v2")

    # ------------------------------------------------------------------
    # 新接口：plan（返回结构化 PlanResult）
    # ------------------------------------------------------------------

    async def plan(self, user_input: str, context: Optional[dict] = None) -> PlanResult:
        """
        分析用户请求，生成结构化计划。

        Args:
            user_input: 用户输入
            context: 可选上下文（当前工具列表、会话历史等）

        Returns:
            PlanResult: 包含 request_type、todos、direct_response、plan_summary
        """
        self.add_message("user", user_input)

        # 快速分类
        request_type_str = self._quick_classify(user_input)

        if request_type_str == "greeting":
            response = await self._reply_via_llm(user_input, "greeting")
            self.add_message("assistant", response)
            result = PlanResult(
                request_type=RequestType.GREETING,
                direct_response=response,
                plan_summary="问候回复",
            )
            self._current_plan = result
            return result

        if request_type_str == "simple":
            response = await self._reply_via_llm(user_input, "simple")
            self.add_message("assistant", response)
            result = PlanResult(
                request_type=RequestType.SIMPLE,
                direct_response=response,
                plan_summary="简单回复",
            )
            self._current_plan = result
            return result

        # 技术请求 → 调用 LLM 生成结构化 TodoList
        plan_result = await self._plan_technical_task_v2(user_input, context)
        self.add_message("assistant", plan_result.plan_summary)
        self._current_plan = plan_result
        return plan_result

    # ------------------------------------------------------------------
    # 旧接口：process（向后兼容）
    # ------------------------------------------------------------------

    async def process(self, user_input: str, **kwargs) -> str:
        """
        向后兼容的 process 接口。
        返回纯文本（与 v1 行为一致）。
        """
        plan_result = await self.plan(user_input, context=kwargs.get("context"))

        if plan_result.direct_response:
            return plan_result.direct_response

        # 将结构化 todos 转为文本
        lines = [f"**用户请求**: {user_input}\n"]
        lines.append(f"**任务分析**: {plan_result.plan_summary}\n")
        lines.append("**执行计划**:")
        for i, todo in enumerate(plan_result.todos, 1):
            tool_part = f" - {todo.tool_hint}" if todo.tool_hint else ""
            lines.append(f"{i}. {todo.content}{tool_part}")
        lines.append("\n**执行计划**")
        return "\n".join(lines)

    # ------------------------------------------------------------------
    # Todo 状态管理
    # ------------------------------------------------------------------

    def update_todo(
        self,
        todo_id: str,
        status: str,
        result_summary: Optional[str] = None,
    ):
        """更新指定 todo 的状态"""
        if not self._current_plan:
            return
        for todo in self._current_plan.todos:
            if todo.id == todo_id:
                todo.status = TodoStatus(status)
                if result_summary:
                    todo.result_summary = result_summary
                break

    def get_current_todos(self) -> List[TodoItem]:
        """获取当前计划的所有 todos"""
        if not self._current_plan:
            return []
        return self._current_plan.todos

    def get_execution_order(self) -> List[List[str]]:
        """
        根据依赖关系 + resource/risk_level 返回**分层并行执行顺序**。

        - 先按依赖关系做拓扑分层；
        - 再在每一拓扑层内，根据 resource / risk_level 进行「安全并发」控制：
          - 同一资源上 risk_level="high" 的 Todo 强制串行（不会出现在同一层）；
          - 受 self.max_parallel_per_layer 控制全局并发上限；
        - 返回值为列表的列表，每个内层列表中的 todo 可并行执行。
        """
        if not self._current_plan:
            return []

        todos: Dict[str, TodoItem] = {t.id: t for t in self._current_plan.todos}
        if not todos:
            return []

        remaining = set(todos.keys())
        completed: set[str] = set()
        layers: List[List[str]] = []
        max_parallel = max(int(self.max_parallel_per_layer or 1), 1)

        while remaining:
            # 1) 找出所有依赖已满足的 Todo（拓扑“就绪集”）
            ready: List[str] = [
                tid
                for tid in remaining
                if all(d in completed for d in todos[tid].depends_on)
            ]

            # 若不存在任何就绪节点，说明存在环或非法依赖，退化为旧逻辑：一次性取出所有剩余
            if not ready:
                layers.append(list(remaining))
                break

            # 2) 在就绪集中，按 resource/risk_level 做并发切分
            current_layer: List[str] = []
            used_high_risk_resources: set[str] = set()

            # 保持顺序稳定：按 Todo id 排序
            for tid in sorted(ready):
                if len(current_layer) >= max_parallel:
                    # 并发上限已满，剩余就绪节点留到下一层
                    continue

                todo = todos[tid]
                resource = getattr(todo, "resource", None) or None
                risk_level = (getattr(todo, "risk_level", None) or "").lower()
                is_high_risk = risk_level == "high"

                # 对同一 resource 的高危步骤强制串行：同一层内只允许 1 个
                if is_high_risk and resource:
                    if resource in used_high_risk_resources:
                        # 推迟到下一层
                        continue
                    used_high_risk_resources.add(resource)

                current_layer.append(tid)

            # 如果由于各种限制导致当前层为空，则退化为「全部就绪节点一层执行」
            if not current_layer:
                current_layer = ready

            layers.append(current_layer)
            for tid in current_layer:
                remaining.discard(tid)
                completed.add(tid)

        return layers

    def find_todo_for_tool(self, tool_name: str) -> Optional[TodoItem]:
        """根据工具名找到匹配的 todo（用于自动更新状态）"""
        if not self._current_plan:
            return None
        for todo in self._current_plan.todos:
            if todo.tool_hint and todo.tool_hint.lower() == tool_name.lower():
                return todo
        return None

    def find_next_pending_todo(self) -> Optional[TodoItem]:
        """找到下一个待执行的 todo"""
        if not self._current_plan:
            return None
        for todo in self._current_plan.todos:
            if todo.status == TodoStatus.PENDING:
                return todo
        return None

    def find_todo_in_progress(self) -> Optional[TodoItem]:
        """找到当前正在执行的 todo（status 为 in_progress），用于执行完成后标记为 completed"""
        if not self._current_plan:
            return None
        for todo in self._current_plan.todos:
            if todo.status == TodoStatus.IN_PROGRESS:
                return todo
        return None

    # ------------------------------------------------------------------
    # 快速分类
    # ------------------------------------------------------------------

    def _quick_classify(self, user_input: str) -> str:
        """快速判断请求类型（基于关键词规则）"""
        user_input_lower = user_input.strip().lower()

        greetings = [
            "你好",
            "hello",
            "hi",
            "hey",
            "嗨",
            "早上好",
            "早安",
            "上午好",
            "下午好",
            "傍晚好",
            "晚上好",
            "晚安",
            "再见",
            "拜拜",
            "bye",
            "quit",
            "exit",
            "谢谢",
            "thanks",
            "thank you",
            "抱歉",
            "对不起",
            "sorry",
            "打扰了",
            "麻烦你",
        ]

        chitchat = [
            "你是谁",
            "你是什么",
            "who are you",
            "天气",
            "weather",
            "今天怎么样",
            "how are you",
            "介绍一下",
            "tell me about",
            "有什么功能",
            "能做什么",
            "帮助",
            "help",
            "帮助我",
            "随便聊聊",
            "chat",
        ]

        for g in greetings:
            if (
                user_input_lower.strip() == g.lower()
                or user_input_lower.strip().startswith(g.lower())
            ):
                return "greeting"

        for c in chitchat:
            if c in user_input_lower:
                return "simple"

        if len(user_input.strip()) < 15:
            action_keywords = [
                "扫描",
                "测试",
                "检查",
                "执行",
                "运行",
                "分析",
                "检测",
                "scan",
                "test",
                "check",
                "execute",
                "run",
                "analyze",
                "detect",
                "攻击",
                "exploit",
                "探索",
                "explore",
                "查找",
                "find",
                "搜索",
                "search",
                "列出",
                "list",
                "显示",
                "show",
                "获取",
                "get",
                "连接",
                "connect",
                "登录",
                "login",
                "ssh",
                "访问",
                "access",
            ]
            if not any(kw in user_input_lower for kw in action_keywords):
                return "simple"

        return "technical"

    # ------------------------------------------------------------------
    # 问候/简单回复（统一通过 LLM，不设快捷回复）
    # ------------------------------------------------------------------

    async def _reply_via_llm(self, user_input: str, request_type: str) -> str:
        """通过 LLM 生成问候或简单请求的回复"""
        import asyncio
        from langchain_core.messages import SystemMessage, HumanMessage

        prompt = (
            "你是 Hackbot 的轻量问答助手。对用户的问候或简单问题做自然、友好的回复。"
            "回复应简洁，不要调用任何工具。"
        )
        if request_type == "greeting":
            prompt += " 当前是问候类输入，自然回应即可。"
        else:
            prompt += " 当前是简单问答（如能做什么、帮助等），简要说明能力并提示用户直接说需求。"

        messages_payload = [
            {"role": "system", "content": prompt},
            {"role": "user", "content": user_input.strip()},
        ]
        try:
            llm = self._get_llm()
            response = await asyncio.wait_for(
                llm.ainvoke([
                    SystemMessage(content=prompt),
                    HumanMessage(content=user_input.strip()),
                ]),
                timeout=30.0,
            )
            if isinstance(response, str):
                return response.strip()
            if hasattr(response, "content") and response.content is not None:
                return str(response.content).strip()
            return str(response).strip()
        except asyncio.TimeoutError:
            return "回复超时，请稍后重试。"
        except Exception as e:
            if "model_dump" in str(e).lower():
                try:
                    from utils.llm_http_fallback import chat_completions_request
                    out = await chat_completions_request(
                        messages_payload, max_tokens=2048, timeout=30.0
                    )
                    if not out.startswith("[LLM 回退失败:"):
                        return out
                except Exception as fb:
                    logger.warning("PlannerAgent HTTP 回退失败: %s", fb)
            logger.warning(f"PlannerAgent _reply_via_llm 错误: {e}")
            return "你好！有什么可以帮你的吗？"

    def _get_llm(self):
        """获取 LLM 实例（延迟初始化）"""
        if not hasattr(self, "_llm") or self._llm is None:
            from core.patterns.security_react import _create_llm
            self._llm = _create_llm()
        return self._llm

    def _handle_greeting(self, user_input: str) -> str:
        """已废弃，保留仅为兼容；实际使用 _reply_via_llm"""
        return "你好！有什么可以帮你的吗？"

    def _handle_simple(self, user_input: str) -> str:
        """已废弃，保留仅为兼容；实际使用 _reply_via_llm"""
        return (
            "我是 Hackbot，一个 AI 驱动的安全测试助手。\n"
            "有什么安全相关的问题可以直接问我！"
        )

    # ------------------------------------------------------------------
    # 技术请求规划 v2（结构化 JSON 输出）
    # ------------------------------------------------------------------

    async def _plan_technical_task_v2(
        self,
        user_input: str,
        context: Optional[dict] = None,
    ) -> PlanResult:
        """使用 LLM 生成结构化 TodoList"""
        from hackbot_config import settings
        from langchain_core.messages import SystemMessage, HumanMessage

        # 构建上下文
        tools_desc = ""
        if context and context.get("tools"):
            tools_desc = "\n## 可用工具\n" + "\n".join(
                f"- {t}" for t in context["tools"]
            )

        planning_prompt = f"""请分析以下用户请求，并制定结构化的执行计划。

## 用户请求
{user_input}
{tools_desc}

## 输出要求
请严格按照以下 JSON 格式输出（不要添加 ```json 标记，直接输出 JSON）：

{{"plan_summary": "简要说明任务目标（1-2句话）", "todos": [{{"id": "step_1", "content": "具体步骤描述", "tool_hint": "建议工具名或null", "depends_on": []}}, {{"id": "step_2", "content": "具体步骤描述", "tool_hint": "建议工具名或null", "depends_on": ["step_1"]}}]}}

规则：
- 先判断是否需要多步规划；若可一步完成可只输出 1 个 todo
- todos 中 1-6 个步骤；某步骤无需工具时 tool_hint 填 null
- id 格式为 step_N；depends_on 只引用前面步骤的 id
- 不要添加任何 JSON 之外的文字"""

        try:
            import asyncio
            from core.patterns.security_react import _create_llm
            provider = (settings.llm_provider or "deepseek").strip().lower()
            llm = _create_llm(provider=provider, temperature=0.3)
            messages = [
                SystemMessage(content=self.system_prompt),
                HumanMessage(content=planning_prompt),
            ]
            if hasattr(llm, "ainvoke"):
                response = await llm.ainvoke(messages)
            else:
                response = await asyncio.to_thread(llm.invoke, messages)
            text = response.content if hasattr(response, "content") else str(response)

            return self._parse_plan_json(text, user_input)

        except Exception as e:
            from utils.model_selector import get_llm_connection_hint

            provider = (settings.llm_provider or "deepseek").strip().lower()
            hint = get_llm_connection_hint(e, provider=provider)
            logger.error(f"规划 LLM 调用失败: {e}")
            plan = self._fallback_plan(user_input)
            plan.plan_summary += f"\n[!] {hint}"
            return plan

    def _parse_plan_json(self, text: str, user_input: str) -> PlanResult:
        """从 LLM 输出中解析结构化 JSON 计划"""
        # 尝试提取 JSON
        json_match = re.search(r'\{[\s\S]*"todos"[\s\S]*\}', text)
        if json_match:
            try:
                data = json.loads(json_match.group())
                todos: List[TodoItem] = []
                for td in data.get("todos", []):
                    todo = TodoItem(
                        id=td.get("id", f"step_{len(todos) + 1}"),
                        content=td.get("content", ""),
                        tool_hint=td.get("tool_hint"),
                        depends_on=td.get("depends_on", []),
                        # 允许 LLM 直接输出 resource / risk_level / agent_hint（向后兼容，可为空）
                        resource=td.get("resource"),
                        risk_level=td.get("risk_level"),
                        agent_hint=td.get("agent_hint"),
                    )
                    todos.append(todo)

                # 基于用户请求 + Todo 内容填充/修正 resource、risk_level、agent_hint
                self._enrich_todos_with_metadata(todos, user_input)

                # 执行本计划需集成的工具（非空 tool_hint 去重）
                tools_required = sorted(
                    {t.tool_hint for t in todos if t.tool_hint and str(t.tool_hint).strip()}
                )

                return PlanResult(
                    request_type=RequestType.TECHNICAL,
                    todos=todos,
                    plan_summary=data.get("plan_summary", f"分析任务: {user_input}"),
                    tools_required=tools_required,
                )
            except json.JSONDecodeError:
                pass

        # JSON 解析失败，回退
        return self._fallback_plan(user_input)

    def _fallback_plan(self, user_input: str) -> PlanResult:
        """LLM 不可用时的简单规划"""
        user_input_lower = user_input.lower()
        todos = []

        if any(
            k in user_input_lower
            for k in ["scan", "扫描", "端口", "port", "内网", "网络"]
        ):
            todos.append(
                TodoItem(
                    id="step_1",
                    content="执行端口扫描",
                    tool_hint="port_scan",
                )
            )
            todos.append(
                TodoItem(
                    id="step_2",
                    content="识别开放服务",
                    tool_hint="service_detect",
                    depends_on=["step_1"],
                )
            )
        elif any(k in user_input_lower for k in ["vuln", "漏洞"]):
            todos.append(
                TodoItem(
                    id="step_1",
                    content="执行漏洞扫描",
                    tool_hint="vuln_scan",
                )
            )
            todos.append(
                TodoItem(id="step_2", content="分析检测结果", depends_on=["step_1"])
            )
        elif any(k in user_input_lower for k in ["system", "系统", "status", "状态"]):
            todos.append(
                TodoItem(
                    id="step_1",
                    content="获取系统信息",
                    tool_hint="system_info",
                )
            )
            todos.append(
                TodoItem(
                    id="step_2",
                    content="查看系统状态",
                    tool_hint="system_info",
                )
            )
        elif any(k in user_input_lower for k in ["crawl", "爬取", "网页"]):
            todos.append(
                TodoItem(
                    id="step_1",
                    content="爬取目标网页",
                    tool_hint="web_crawler",
                )
            )
        elif any(k in user_input_lower for k in ["command", "命令", "execute", "执行"]):
            todos.append(
                TodoItem(
                    id="step_1",
                    content="执行指定命令",
                    tool_hint="terminal_session",
                )
            )
        else:
            todos.append(
                TodoItem(
                    id="step_1",
                    content=f"分析用户需求: {user_input}",
                )
            )
            todos.append(
                TodoItem(
                    id="step_2",
                    content="根据需求选择合适的工具执行",
                    depends_on=["step_1"],
                )
            )

        # 为回退计划同样补充 resource / risk_level / agent_hint
        self._enrich_todos_with_metadata(todos, user_input)

        tools_required = sorted(
            {t.tool_hint for t in todos if t.tool_hint and str(t.tool_hint).strip()}
        )
        return PlanResult(
            request_type=RequestType.TECHNICAL,
            todos=todos,
            plan_summary=f"分析任务: {user_input}",
            tools_required=tools_required,
        )

    # ------------------------------------------------------------------
    # Todo 元数据推断：resource / risk_level / agent_hint
    # ------------------------------------------------------------------

    def _enrich_todos_with_metadata(
        self,
        todos: List[TodoItem],
        user_input: str,
    ) -> None:
        """为 Todo 补充 resource / risk_level / agent_hint 元数据。"""
        for todo in todos:
            resource, risk_level = self._infer_resource_and_risk(todo, user_input)
            if resource and not getattr(todo, "resource", None):
                todo.resource = resource
            if risk_level and not getattr(todo, "risk_level", None):
                todo.risk_level = risk_level
            if not getattr(todo, "agent_hint", None):
                todo.agent_hint = self._map_tool_to_agent_hint(
                    todo.tool_hint, todo.resource or resource
                )

    def _infer_resource_and_risk(
        self,
        todo: TodoItem,
        user_input: str,
    ) -> Tuple[Optional[str], Optional[str]]:
        """综合 Todo 内容与用户请求推断 resource 与 risk_level。"""
        resource = getattr(todo, "resource", None) or self._infer_resource(
            todo, user_input
        )
        risk_level = getattr(todo, "risk_level", None) or self._infer_risk_level(
            todo, user_input
        )
        return resource, risk_level

    def _infer_resource(self, todo: TodoItem, user_input: str) -> Optional[str]:
        """根据 Todo 内容 + 用户输入，粗略推断目标资产 resource。"""
        text = f"{todo.content or ''}\n{user_input or ''}"
        tool = (todo.tool_hint or "").lower()

        # 1) URL → web 资产
        url_match = re.search(r"https?://[^\s]+", text)
        if url_match:
            raw_url = url_match.group(0)
            try:
                parsed = urlparse(raw_url)
                if parsed.scheme and parsed.netloc:
                    origin = f"{parsed.scheme}://{parsed.netloc}"
                    return f"web:{origin}"
            except Exception:
                # 解析失败时仍保留原始 URL
                return f"web:{raw_url}"

        # 2) IP / 子网 → host / subnet
        cidr_match = re.search(
            r"\b(?:\d{1,3}\.){3}\d{1,3}/\d{1,2}\b",
            text,
        )
        if cidr_match:
            return f"subnet:{cidr_match.group(0)}"

        ip_match = re.search(r"\b(?:\d{1,3}\.){3}\d{1,3}\b", text)
        if ip_match:
            return f"host:{ip_match.group(0)}"

        # 3) 域名 → domain
        domain_match = re.search(
            r"\b(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}\b",
            text,
        )
        if domain_match:
            return f"domain:{domain_match.group(0)}"

        # 4) 纯本机/系统信息类 → 视为本机 host
        if tool in {"system_info", "system_status"}:
            return "host:localhost"

        return None

    def _infer_risk_level(self, todo: TodoItem, user_input: str) -> Optional[str]:
        """基于 tool_hint / 文本关键词粗略推断风险等级：high / medium / low。"""
        text = f"{todo.content or ''}\n{user_input or ''}".lower()
        tool = (todo.tool_hint or "").lower()

        high_keywords = [
            "exploit",
            "攻击",
            "attack",
            "暴力",
            "brute",
            "fuzz",
            "dos",
            "ddos",
            "poc",
        ]
        if any(k in tool for k in high_keywords) or any(
            k in text for k in high_keywords
        ):
            return "high"

        medium_keywords = [
            "scan",
            "扫描",
            "枚举",
            "enum",
            "vuln",
            "漏洞",
            "fingerprint",
            "recon",
        ]
        if any(k in tool for k in medium_keywords) or any(
            k in text for k in medium_keywords
        ):
            return "medium"

        # 其他默认视为低风险
        return "low"

    def _map_tool_to_agent_hint(
        self,
        tool_hint: Optional[str],
        resource: Optional[str],
    ) -> Optional[str]:
        """
        将 tool_hint / resource 映射为 agent_hint：
        - network_recon / web_pentest / osint / terminal_ops / defense_monitor
        """
        if not tool_hint and not resource:
            return None

        hint = (tool_hint or "").lower()

        # 优先根据工具名判断
        network_keywords = [
            "port_scan",
            "service_detect",
            "recon",
            "nmap",
            "subnet",
            "ping",
            "traceroute",
            "arp",
            "network_scan",
        ]
        web_keywords = [
            "dir",
            "waf",
            "tech_detect",
            "header",
            "cors",
            "jwt",
            "param",
            "xss",
            "sql",
            "ssrf",
            "web_",
            "http_",
        ]
        osint_keywords = [
            "shodan",
            "virustotal",
            "osint",
            "smart_search",
            "deep_crawl",
            "api_client",
            "web_research",
        ]
        terminal_keywords = [
            "terminal_session",
            "execute_command",
            "shell",
        ]
        defense_keywords = [
            "defense",
            "intrusion",
            "self_vuln",
            "network_analyze",
            "system_info",
            "system_status",
        ]

        if any(k in hint for k in network_keywords):
            return "network_recon"
        if any(k in hint for k in web_keywords):
            return "web_pentest"
        if any(k in hint for k in osint_keywords):
            return "osint"
        if any(k in hint for k in terminal_keywords):
            return "terminal_ops"
        if any(k in hint for k in defense_keywords):
            return "defense_monitor"

        # 再根据 resource 前缀做一轮兜底映射
        if resource:
            if resource.startswith(("host:", "subnet:", "ip:")):
                return "network_recon"
            if resource.startswith("web:"):
                return "web_pentest"
            if resource.startswith(("domain:", "osint:")):
                return "osint"

        return None


def is_simple_request(user_input: str) -> bool:
    """快速判断是否为简单请求"""
    planner = PlannerAgent()
    return planner._quick_classify(user_input) != "technical"
