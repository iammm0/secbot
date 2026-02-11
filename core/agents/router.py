"""
MessageRouter：判定用户消息类型，将请求路由到 Q&A Agent 或规划/执行流程
- qa：简单问候、了解项目能力、了解对话上下文等 → 走 QAAgent
- technical：需要执行扫描/检测/命令等操作 → 走 PlannerAgent + 执行
"""

from typing import Literal

from utils.logger import logger


RouteType = Literal["qa", "technical"]


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

    - 纯问候、感谢、再见、询问项目能力/帮助/上下文 → qa
    - 包含明确操作意图（扫描、执行、检测等）或无法判为简单问 → technical

    Args:
        user_input: 用户原始输入

    Returns:
        "qa" | "technical"
    """
    if not user_input or not user_input.strip():
        return "qa"

    lower = user_input.strip().lower()

    # 问候类：短句或明显问候开头
    for g in GREETING_KEYWORDS:
        if lower == g or (len(lower) < 25 and lower.startswith(g)):
            logger.debug(f"Router: greeting -> qa (keyword={g})")
            return "qa"

    # 明确问答类
    for q in QA_KEYWORDS:
        if q in lower:
            logger.debug(f"Router: qa keyword -> qa (keyword={q})")
            return "qa"

    # 短句且无操作关键词 → 倾向 qa（避免误判为技术请求）
    if len(user_input.strip()) < 15:
        if not any(kw in lower for kw in ACTION_KEYWORDS):
            logger.debug("Router: short message without action -> qa")
            return "qa"

    # 含操作意图或较长描述 → technical
    if any(kw in lower for kw in ACTION_KEYWORDS):
        logger.debug("Router: action keyword -> technical")
        return "technical"

    # 默认：无法明确判为简单问则走技术流程（由 Planner 再细分）
    logger.debug("Router: default -> technical")
    return "technical"
