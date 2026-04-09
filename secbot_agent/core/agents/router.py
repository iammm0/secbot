"""
MessageRouter：判定用户消息类型，将请求路由到 Q&A Agent 或规划/执行流程
- qa：简单问候、了解项目能力、了解对话上下文等 → 走 QAAgent
- technical：需要执行扫描/检测/命令等操作 → 走 PlannerAgent + 执行
- other：与网络安全/计算机操作无关的问候或闲聊 → 用人格化回复直接回应（不进入 Q&A/技术流）
"""

import asyncio
import json
import re
from typing import Literal, Tuple, Optional

from utils.logger import logger


RouteType = Literal["qa", "technical", "other"]


# 人格设定：天秤 + ENTP-A + 浪漫主义 + 侠义情节（用于「其他」类问候的回复）
ROUTER_PERSONA = """你是 Hackbot 的「门面」人格，负责对与安全/计算机任务无关的问候做简短、妥帖的回应。
人格底色：天秤座的平衡与得体、ENTP-A 的机敏与不拘一格、一点浪漫主义、以及路见不平的侠义心。
- 回复要简短（1～3 句），亲切但不油腻，带一点个性与温度。
- 若对方只是打招呼/闲聊，自然回应并轻轻带一句「有安全巡检、漏洞挖掘或渗透测试需求可以随时叫我」即可。
- 不要展开技术说明，不要调用任何工具。"""

# LLM 意图分类 + 人格回复的提示词
ROUTER_LLM_SYSTEM = ROUTER_PERSONA + """

你的任务只有两个：
1. **分类**：判断用户这句话属于以下哪一种？
   - security_task：与网络安全相关（巡检、漏洞挖掘、红队攻击、入侵检测、端口扫描等）
   - computer_ops_task：与计算机操作相关（执行命令、系统信息、进程/文件操作、远程连接等）
   - project_qa：与「本产品/本助手」相关（你是谁、能做什么、怎么用、帮助）
   - other：以上都不是，只是打招呼、闲聊、或与安全/电脑无关的话题

2. **仅当 intent 为 other 时**：在 reply 里写一句简短的人格化回复（符合上述人格底色），其余情况 reply 留空。

请严格按以下 JSON 输出，不要输出其他内容：
{"intent": "security_task|computer_ops_task|project_qa|other", "reply": ""}
"""


# 与 PlannerAgent 中分类逻辑对齐的规则，便于统一维护
GREETING_KEYWORDS = [
    "你好", "hello", "hi", "hey", "嗨",
    "早上好", "早安", "上午好", "下午好", "傍晚好",
    "晚上好", "晚安", "再见", "拜拜", "bye",
    "quit", "exit", "谢谢", "thanks", "thank you",
    "抱歉", "对不起", "sorry", "打扰了", "麻烦你",
]

QA_KEYWORDS = [
    "你是谁", "你是什么", "who are you",
    "天气", "weather", "今天怎么样", "how are you",
    "介绍一下", "tell me about", "有什么功能", "能做什么",
    "帮助", "help", "帮助我", "随便聊聊", "chat",
    "怎么用", "如何用", "功能介绍",
]

ACTION_KEYWORDS = [
    "扫描", "测试", "检查", "执行", "运行", "分析", "检测",
    "scan", "test", "check", "execute", "run", "analyze", "detect",
    "攻击", "exploit", "探索", "explore", "查找", "find",
    "搜索", "search", "列出", "list", "显示", "show",
    "获取", "get", "连接", "connect", "登录", "login",
    "ssh", "访问", "access", "端口", "port", "漏洞", "vuln",
]


def route(user_input: str) -> RouteType:
    """
    判定用户输入应走问答（qa）还是技术执行（technical）。
    纯规则版，不含 LLM；用于回退或快速路径。

    - 纯问候、感谢、再见、询问项目能力/帮助/上下文 → qa
    - 包含明确操作意图（扫描、执行、检测等）或无法判为简单问 → technical

    Args:
        user_input: 用户原始输入

    Returns:
        "qa" | "technical"（规则版不区分 other，统一归 qa）
    """
    if not user_input or not user_input.strip():
        return "qa"

    lower = user_input.strip().lower()

    # 问候类：短句或明显问候开头
    for g in GREETING_KEYWORDS:
        if lower == g or (len(lower) < 25 and lower.startswith(g)):
            logger.bind(agent="router", event="stage_end", attempt=1).debug(f"Router: greeting -> qa (keyword={g})")
            return "qa"

    # 明确问答类
    for q in QA_KEYWORDS:
        if q in lower:
            logger.bind(agent="router", event="stage_end", attempt=1).debug(f"Router: qa keyword -> qa (keyword={q})")
            return "qa"

    # 短句且无操作关键词 → 倾向 qa（避免误判为技术请求）
    if len(user_input.strip()) < 15:
        if not any(kw in lower for kw in ACTION_KEYWORDS):
            logger.bind(agent="router", event="stage_end", attempt=1).debug("Router: short message without action -> qa")
            return "qa"

    # 含操作意图或较长描述 → technical
    if any(kw in lower for kw in ACTION_KEYWORDS):
        logger.bind(agent="router", event="stage_end", attempt=1).debug("Router: action keyword -> technical")
        return "technical"

    # 默认：无法明确判为简单问则走技术流程（由 Planner 再细分）
    logger.bind(agent="router", event="stage_end", attempt=1).debug("Router: default -> technical")
    return "technical"


def _parse_router_llm_output(text: str) -> Tuple[Optional[RouteType], Optional[str]]:
    """解析 LLM 返回的 JSON，得到 intent 与 reply。"""
    text = text.strip()
    m = re.search(r"\{[^{}]*\"intent\"[^{}]*\"reply\"[^{}]*\}", text, re.DOTALL)
    if not m:
        m = re.search(r"\{[^{}]*\}", text)
    if not m:
        return None, None
    try:
        data = json.loads(m.group())
        intent = (data.get("intent") or "").strip().lower()
        reply = (data.get("reply") or "").strip()
        if intent in ("security_task", "computer_ops_task"):
            return "technical", reply if reply else None
        if intent == "project_qa":
            return "qa", None
        if intent == "other":
            return "other", reply or None
        return None, None
    except (json.JSONDecodeError, TypeError):
        return None, None


async def route_with_llm(user_input: str) -> Tuple[RouteType, Optional[str]]:
    """
    使用 LLM 做意图分类：网络安全任务 / 计算机操作任务 / 项目问答 / 其他。
    若为「其他」，同时生成人格化回复（天秤+ENTP-A+浪漫+侠义）。

    Args:
        user_input: 用户原始输入

    Returns:
        (route_type, direct_reply)
        - technical: 走规划+执行，direct_reply 为 None
        - qa: 走 QAAgent，direct_reply 为 None
        - other: 直接使用 direct_reply 作为回复，不进入 Q&A 与技术流
        若 LLM 调用失败则回退到规则 route()，返回 (qa|technical, None)
    """
    if not user_input or not user_input.strip():
        return "qa", None

    try:
        from secbot_agent.core.patterns.security_react import _create_llm
        from langchain_core.messages import SystemMessage, HumanMessage

        llm = _create_llm(temperature=0.3)
        messages = [
            SystemMessage(content=ROUTER_LLM_SYSTEM),
            HumanMessage(content=f"用户说：{user_input}"),
        ]
        response = await asyncio.wait_for(llm.ainvoke(messages), timeout=10.0)
        content = getattr(response, "content", None) or str(response)
        route_type, reply = _parse_router_llm_output(content)
        if route_type is not None:
            if route_type == "other":
                logger.bind(agent="router", event="stage_end", attempt=1).debug("Router(LLM): intent=other, 使用人格回复")
            else:
                logger.bind(agent="router", event="stage_end", attempt=1).debug(f"Router(LLM): intent -> {route_type}")
            return route_type, reply if route_type == "other" else None
    except asyncio.TimeoutError:
        logger.bind(agent="router", event="llm_error", attempt=1).warning("Router(LLM): 分类超时，回退规则路由")
    except Exception as e:
        logger.bind(agent="router", event="llm_error", attempt=1).warning(f"Router(LLM): 分类失败，回退规则路由: {e}")

    fallback = route(user_input)
    return fallback, None
