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
from typing import Optional, List, Dict, Any

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
- **技术类**：安全巡检、漏洞扫描、攻击取证、系统操作、命令执行等需要工具执行的请求

### 2. 简单请求直接回复
对于问候、闲聊、非技术请求，直接给出友好、简洁的回复，不需要调用任何工具。

### 3. 技术请求 — 结构化规划
对于需要执行操作的技术请求，将任务分解为结构化 JSON 格式的 TodoList。
每个 Todo 必须包含：id、content、tool_hint（可选）、depends_on（依赖列表）。

### 4. 巡检与取证任务的特殊处理
对于安全巡检或攻击取证任务，规划时需注意：
- 巡检任务：按顺序执行信息收集→端口扫描→漏洞检测→报告生成
- 取证任务：优先确保证据完整性，记录攻击者信息、时间线、攻击载荷

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
- tool_hint 是建议使用的工具名，可以为 null
- 步骤数量应在 2-6 个之间"""

        super().__init__(name=name, system_prompt=system_prompt)
        # 当前规划结果（用于实时追踪）
        self._current_plan: Optional[PlanResult] = None
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
            response = self._handle_greeting(user_input)
            self.add_message("assistant", response)
            result = PlanResult(
                request_type=RequestType.GREETING,
                direct_response=response,
                plan_summary="问候回复",
            )
            self._current_plan = result
            return result

        if request_type_str == "simple":
            response = self._handle_simple(user_input)
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
        lines.append("\n**开始执行**")
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
        根据依赖关系返回分层执行顺序。
        返回值为列表的列表，每个内层列表中的 todo 可并行执行。
        """
        if not self._current_plan:
            return []

        todos = {t.id: t for t in self._current_plan.todos}
        remaining = set(todos.keys())
        completed = set()
        layers = []

        while remaining:
            # 找出所有依赖已完成的 todo
            layer = []
            for tid in list(remaining):
                deps = todos[tid].depends_on
                if all(d in completed for d in deps):
                    layer.append(tid)
            if not layer:
                # 有循环依赖，强制取出剩余
                layer = list(remaining)
            layers.append(layer)
            for tid in layer:
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
    # 问候/简单回复（与 v1 一致）
    # ------------------------------------------------------------------

    def _handle_greeting(self, user_input: str) -> str:
        user_input_lower = user_input.strip().lower()
        if any(x in user_input_lower for x in ["再见", "拜拜", "bye", "quit", "exit"]):
            return "再见！如有需要随时叫我。"
        elif any(x in user_input_lower for x in ["谢谢", "thanks", "thank you"]):
            return "不客气！很高兴能帮助你。"
        elif any(x in user_input_lower for x in ["早上好", "早安", "上午好"]):
            return "早上好！今天有什么我可以帮你的吗？"
        elif any(x in user_input_lower for x in ["下午好"]):
            return "下午好！工作顺利吗？需要什么帮助？"
        elif any(x in user_input_lower for x in ["晚上好", "晚安"]):
            return "晚上好！夜猫子吗？有什么需要帮忙的？"
        elif any(x in user_input_lower for x in ["你好", "hello", "hi", "嗨"]):
            return (
                "你好！我是 Hackbot，一个安全测试助手。\n"
                "我可以帮你进行端口扫描、漏洞检测、系统分析等任务。\n"
                "直接说出你的需求吧！"
            )
        return "你好！有什么可以帮你的吗？"

    def _handle_simple(self, user_input: str) -> str:
        user_input_lower = user_input.strip().lower()

        if "who are you" in user_input_lower or "你是谁" in user_input_lower:
            return (
                "我是 Hackbot，一个 AI 驱动的安全测试助手。\n\n"
                "**我的能力包括：**\n"
                "- 端口扫描和服务识别\n"
                "- 漏洞扫描和安全检测\n"
                "- 系统状态监控\n"
                "- 报告生成\n\n"
                "有什么安全相关的问题可以直接问我！"
            )

        if "天气" in user_input_lower or "weather" in user_input_lower:
            return "我没有天气功能，但你可以看看窗外！"

        if any(kw in user_input_lower for kw in ["帮助", "help", "能做什么"]):
            return (
                "**Hackbot 可用命令示例：**\n\n"
                "- `Scan localhost for open ports` - 扫描本地端口\n"
                "- `Check system status` - 查看系统状态\n"
                "- `Crawl https://example.com` - 爬取网页\n"
                "- `List all running processes` - 列出进程\n"
                "- `Execute 'ls -la'` - 执行命令\n\n"
                "直接说出你的需求即可！"
            )

        if "功能" in user_input_lower or "介绍" in user_input_lower:
            return (
                "**Hackbot 功能介绍：**\n\n"
                "1. **安全扫描** - 端口扫描、服务识别、漏洞扫描\n"
                "2. **信息收集** - 系统信息探测、网络发现\n"
                "3. **系统操作** - 命令执行、进程管理、文件操作\n"
                "4. **网页爬取** - 网页内容抓取、AI 信息提取\n\n"
                "直接告诉我你需要什么！"
            )

        return (
            f"我理解你的意思是：「{user_input}」\n\n"
            "这看起来是一个简单的问题。如果你有具体的技术需求"
            "（比如扫描、检测、执行命令等），请详细告诉我，我会帮你完成！"
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
- todos 中 2-6 个步骤
- id 格式为 step_N
- depends_on 只引用前面步骤的 id
- 不要添加任何 JSON 之外的文字"""

        try:
            from core.patterns.security_react import _create_llm
            provider = (settings.llm_provider or "deepseek").strip().lower()
            llm = _create_llm(provider=provider, temperature=0.3)
            messages = [
                SystemMessage(content=self.system_prompt),
                HumanMessage(content=planning_prompt),
            ]
            response = llm.invoke(messages)
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
                todos = []
                for td in data.get("todos", []):
                    todos.append(
                        TodoItem(
                            id=td.get("id", f"step_{len(todos) + 1}"),
                            content=td.get("content", ""),
                            tool_hint=td.get("tool_hint"),
                            depends_on=td.get("depends_on", []),
                        )
                    )
                return PlanResult(
                    request_type=RequestType.TECHNICAL,
                    todos=todos,
                    plan_summary=data.get("plan_summary", f"分析任务: {user_input}"),
                )
            except json.JSONDecodeError:
                pass

        # JSON 解析失败，回退
        return self._fallback_plan(user_input)

    def _fallback_plan(self, user_input: str) -> PlanResult:
        """LLM 不可用时的简单规划"""
        user_input_lower = user_input.lower()
        todos = []

        if any(k in user_input_lower for k in ["scan", "端口", "port"]):
            todos.append(
                TodoItem(id="step_1", content="执行端口扫描", tool_hint="port_scan")
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
                TodoItem(id="step_1", content="执行漏洞扫描", tool_hint="vuln_scan")
            )
            todos.append(
                TodoItem(id="step_2", content="分析检测结果", depends_on=["step_1"])
            )
        elif any(k in user_input_lower for k in ["system", "系统", "status", "状态"]):
            todos.append(
                TodoItem(id="step_1", content="获取系统信息", tool_hint="system_info")
            )
            todos.append(
                TodoItem(id="step_2", content="查看系统状态", tool_hint="system_status")
            )
        elif any(k in user_input_lower for k in ["crawl", "爬取", "网页"]):
            todos.append(
                TodoItem(id="step_1", content="爬取目标网页", tool_hint="crawler")
            )
        elif any(k in user_input_lower for k in ["command", "命令", "execute", "执行"]):
            todos.append(
                TodoItem(
                    id="step_1", content="执行指定命令", tool_hint="execute_command"
                )
            )
        else:
            todos.append(TodoItem(id="step_1", content=f"分析用户需求: {user_input}"))
            todos.append(
                TodoItem(
                    id="step_2",
                    content="根据需求选择合适的工具执行",
                    depends_on=["step_1"],
                )
            )

        return PlanResult(
            request_type=RequestType.TECHNICAL,
            todos=todos,
            plan_summary=f"分析任务: {user_input}",
        )


def is_simple_request(user_input: str) -> bool:
    """快速判断是否为简单请求"""
    planner = PlannerAgent()
    return planner._quick_classify(user_input) != "technical"
