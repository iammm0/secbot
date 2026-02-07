"""
PlannerAgent：任务规划智能体
负责接收用户请求，进行智能路由：
- 简单问候/非技术请求：直接回复
- 技术请求：规划为明确的执行步骤
"""

import re
from typing import Optional, List, Dict, Any
from agents.base import BaseAgent
from utils.logger import logger


class PlannerAgent(BaseAgent):
    """
    Planner Agent 负责：
    1. 判断用户请求类型（问候/闲聊/非技术/技术）
    2. 简单请求直接回复
    3. 技术请求规划为明确的执行步骤
    """

    def __init__(self, name: str = "PlannerAgent"):
        system_prompt = """你是 Hackbot 的任务规划器。你的职责是：

## 核心职责

### 1. 判断请求类型
- **问候类**：你好、hello、早上/下午/晚上好、再见、谢谢等
- **闲聊类**：询问天气、闲聊、关于 Hackbot 本身的问题
- **非技术类**：不属于安全测试、系统操作、代码分析等技术范畴的请求
- **技术类**：安全扫描、系统操作、命令执行、代码分析等需要工具执行的请求

### 2. 简单请求直接回复
对于问候、闲聊、非技术请求，直接给出友好、简洁的回复，不需要调用任何工具。

### 3. 技术请求规划
对于需要执行操作的技术请求，将任务分解为明确的步骤：
- 每个步骤应该是具体、可执行的技术指令
- 步骤之间有逻辑顺序
- 明确每个步骤使用的工具类型

## 输出格式

### 简单请求回复
直接输出回复内容，不需要额外格式。

### 任务规划输出
按照以下格式输出：

**用户请求**: <原始请求>

**任务类型**: <分类说明>

**执行计划**:
1. <步骤1> - 使用<工具/命令>
2. <步骤2> - 使用<工具/命令>
3. <步骤N> - 使用<工具/命令>

**开始执行**"""

        super().__init__(name=name, system_prompt=system_prompt)
        logger.info("初始化 PlannerAgent")

    async def process(self, user_input: str, **kwargs) -> str:
        """
        处理用户输入，判断请求类型并做出相应响应。

        Args:
            user_input: 用户输入

        Returns:
            规划结果或直接回复
        """
        self.add_message("user", user_input)

        # 先进行快速判断（无需调用 LLM）
        request_type = self._quick_classify(user_input)

        if request_type == "greeting":
            # 问候类直接回复
            response = self._handle_greeting(user_input)
            self.add_message("assistant", response)
            return response

        if request_type == "simple":
            # 简单请求直接回复（不需要技术操作）
            response = self._handle_simple(user_input)
            self.add_message("assistant", response)
            return response

        # 需要规划的技术请求，调用 LLM 进行详细规划
        response = await self._plan_technical_task(user_input)
        self.add_message("assistant", response)
        return response

    def _quick_classify(self, user_input: str) -> str:
        """
        快速判断请求类型（基于关键词规则）
        """
        user_input_lower = user_input.strip().lower()

        # 问候类关键词
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

        # 闲聊/非技术类关键词
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

        # 检查问候类
        for g in greetings:
            if (
                user_input_lower.strip() == g.lower()
                or user_input_lower.strip().startswith(g.lower())
            ):
                return "greeting"

        # 检查闲聊类
        for c in chitchat:
            if c in user_input_lower:
                return "simple"

        # 检查是否只是简单的一两句话，没有明确的技术操作意图
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
                "获取",
                "obtain",
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

        # 默认按技术请求处理
        return "technical"

    def _handle_greeting(self, user_input: str) -> str:
        """处理问候语"""
        user_input_lower = user_input.strip().lower()

        responses = []

        if any(x in user_input_lower for x in ["再见", "拜拜", "bye", "quit", "exit"]):
            responses.append("👋 再见！如有需要随时叫我。")
        elif any(x in user_input_lower for x in ["谢谢", "thanks", "thank you"]):
            responses.append("😊 不客气！很高兴能帮助你。")
        elif any(x in user_input_lower for x in ["早上好", "早安", "上午好"]):
            responses.append("🌅 早上好！今天有什么我可以帮你的吗？")
        elif any(x in user_input_lower for x in ["下午好"]):
            responses.append("☀️ 下午好！工作顺利吗？需要什么帮助？")
        elif any(x in user_input_lower for x in ["晚上好", "晚安"]):
            responses.append("🌙 晚上好！夜猫子吗？有什么需要帮忙的？")
        elif any(x in user_input_lower for x in ["你好", "hello", "hi", "嗨"]):
            responses.append(
                "👋 你好！我是 Hackbot，一个安全测试助手。\n我可以帮你进行端口扫描、漏洞检测、系统分析等任务。\\n直接说出你的需求吧！"
            )
        else:
            responses.append("👋 你好！有什么可以帮你的吗？")

        return "\n".join(responses)

    def _handle_simple(self, user_input: str) -> str:
        """处理简单非技术请求"""
        user_input_lower = user_input.strip().lower()

        if "who are you" in user_input_lower or "你是谁" in user_input_lower:
            return """🤖 我是 Hackbot，一个 AI 驱动的安全测试助手。

**我的能力包括：**
- 🔍 端口扫描和服务识别
- 🛡️ 漏洞扫描和安全检测
- 💻 系统状态监控
- 📊 报告生成

有什么安全相关的问题可以直接问我！"""

        if "天气" in user_input_lower or "weather" in user_input_lower:
            return "我没有天气功能，但你可以看看窗外！🌤️"

        if (
            "帮助" in user_input_lower
            or "help" in user_input_lower
            or "能做什么" in user_input_lower
        ):
            return """**Hackbot 可用命令示例：**

- `Scan localhost for open ports` - 扫描本地端口
- `Check system status` - 查看系统状态
- `Crawl https://example.com` - 爬取网页
- `List all running processes` - 列出进程
- `Execute 'ls -la'` - 执行命令

直接说出你的需求即可！"""

        if "功能" in user_input_lower or "介绍" in user_input_lower:
            return """**Hackbot 功能介绍：**

1. **安全扫描**
   - 端口扫描 (`port_scan`)
   - 服务识别 (`service_detect`)
   - 漏洞扫描 (`vuln_scan`)

2. **信息收集**
   - 系统信息探测 (`recon`)
   - 网络发现

3. **系统操作**
   - 命令执行
   - 进程管理
   - 文件操作

4. **网页爬取**
   - 网页内容抓取
   - AI 信息提取

直接告诉我你需要什么！"""

        # 默认简单回复
        return f"我理解你的意思是：「{user_input}」\n\n这看起来是一个简单的问题。如果你有具体的技术需求（比如扫描、检测、执行命令等），请详细告诉我，我会帮你完成！"

    async def _plan_technical_task(self, user_input: str) -> str:
        """
        对技术请求进行详细规划
        """
        from config import settings

        try:
            from langchain_ollama import ChatOllama
        except ImportError:
            from langchain_community.chat_models import ChatOllama

        from langchain_core.messages import SystemMessage, HumanMessage

        # 创建规划 LLM
        try:
            llm = ChatOllama(
                base_url=settings.ollama_base_url,
                model=settings.ollama_model,
                temperature=0.3,
            )
        except Exception as e:
            logger.error(f"创建规划 LLM 失败: {e}")
            return self._simple_plan(user_input)

        planning_prompt = f"""你是 Hackbot 的任务规划专家。请分析以下用户请求，并制定详细的执行计划。

## 用户请求
{user_input}

## 规划要求
1. 分析请求的核心目标
2. 将任务分解为 2-5 个明确的执行步骤
3. 每个步骤要具体、可执行
4. 考虑步骤之间的依赖关系

## 输出格式
请严格按照以下格式输出（不要添加额外内容）：

**用户请求**: <简洁重复用户需求>

**任务分析**: <1-2句话说明任务目标和范围>

**执行计划**:
1. <步骤1描述> - <使用的工具/命令类型>
2. <步骤2描述> - <使用的工具/命令类型>
3. <步骤N描述> - <使用的工具/命令类型>

**开始执行**"""

        try:
            messages = [
                SystemMessage(content=self.system_prompt),
                HumanMessage(content=planning_prompt),
            ]
            response = llm.invoke(messages)
            if hasattr(response, "content"):
                plan = response.content
            else:
                plan = str(response)

            # 确保输出格式正确
            if "**执行计划**:" not in plan:
                return self._simple_plan(user_input)

            return plan
        except Exception as e:
            logger.error(f"规划 LLM 调用失败: {e}")
            return self._simple_plan(user_input)

    def _simple_plan(self, user_input: str) -> str:
        """当 LLM 不可用时的简单规划"""
        user_input_lower = user_input.lower()

        # 基于关键词判断任务类型和步骤
        plan_steps = []

        if any(k in user_input_lower for k in ["scan", "端口", "port"]):
            plan_steps.append("1. 执行端口扫描 - 使用 port_scan")
            plan_steps.append("2. 识别开放服务 - 使用 service_detect")

        if any(k in user_input_lower for k in ["vuln", "漏洞", "漏洞扫描"]):
            plan_steps.append("1. 执行漏洞扫描 - 使用 vuln_scan")
            plan_steps.append("2. 分析检测结果")

        if any(
            k in user_input_lower
            for k in ["system", "系统", "status", "状态", "cpu", "内存", "memory"]
        ):
            plan_steps.append("1. 获取系统信息 - 使用 system_info")
            plan_steps.append("2. 查看系统状态 - 使用 system_status")

        if any(k in user_input_lower for k in ["process", "进程", "list"]):
            plan_steps.append("1. 列出运行进程 - 使用 list_processes")

        if any(k in user_input_lower for k in ["crawl", "爬取", "抓取", "网页"]):
            plan_steps.append("1. 爬取目标网页 - 使用 crawler")

        if any(k in user_input_lower for k in ["command", "命令", "execute", "执行"]):
            plan_steps.append("1. 执行指定命令 - 使用 execute_command")

        if not plan_steps:
            plan_steps.append(f"1. 分析用户需求: {user_input}")
            plan_steps.append("2. 根据需求选择合适的工具执行")

        plan_text = "\n".join(plan_steps)

        return f"""**用户请求**: {user_input}

**任务分析**: 这是一个需要执行技术操作的任务。

**执行计划**:
{plan_text}

**开始执行**"""


def is_simple_request(user_input: str) -> bool:
    """
    快速判断是否为简单请求（可在其他地方使用）
    """
    planner = PlannerAgent()
    return planner._quick_classify(user_input) != "technical"
