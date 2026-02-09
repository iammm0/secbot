"""
交互式斜杠命令前缀匹配：用户输入 / 后匹配最接近的命令，支持快速选择。
输入 "/" 时可对将要执行的命令进行补全。

v2：新增 /thinking, /details, /compact, /sessions, /new, /export 命令
"""
from typing import Tuple, Optional, List

# 按长度降序，以便优先匹配如 /audit export
SLASH_COMMANDS = (
    "/audit export",
    "/audit",
    "/model",
    "/accept",
    "/reject",
    # v2 新增命令
    "/thinking",
    "/details",
    "/compact",
    "/sessions",
    "/new",
    "/export",
)

SLASH_HELP = (
    "可用命令（输入前缀可匹配）:\n"
    "  [cyan]/model[/cyan]     切换 LLM 模型\n"
    "  [cyan]/accept[/cyan]    确认敏感操作\n"
    "  [cyan]/reject[/cyan]    拒绝敏感操作\n"
    "  [cyan]/audit[/cyan]     查看审计留痕\n"
    "  [cyan]/thinking[/cyan]  切换推理过程显示\n"
    "  [cyan]/details[/cyan]   切换执行详情模式\n"
    "  [cyan]/compact[/cyan]   压缩会话历史\n"
    "  [cyan]/sessions[/cyan]  列出/切换会话\n"
    "  [cyan]/new[/cyan]       新建会话\n"
    "  [cyan]/export[/cyan]    导出对话为 Markdown\n"
    "例: [dim]/m[/dim] → /model, [dim]/th[/dim] → /thinking, [dim]/de[/dim] → /details"
)


def normalize_slash_input(raw: str) -> Tuple[Optional[str], Optional[str]]:
    """
    对以 / 开头的输入做前缀匹配，返回规范后的整行或提示信息。

    Returns:
        (normalized_input, hint_message)
        - 若可唯一匹配：normalized_input 为展开后的整行（保留后续参数），hint 为 None
        - 若仅输入 "/"：normalized_input 为 None，hint 为帮助文案
        - 若匹配到多个：normalized_input 为 None，hint 为「匹配到多个: ...」
        - 若无匹配：normalized_input 为 None，hint 为「未知命令: ...」
    """
    s = raw.strip()
    if not s.startswith("/"):
        return (raw, None)

    lower = s.lower()
    # 仅 "/" 或 "/ "：显示帮助
    if lower in ("/", ""):
        return (None, SLASH_HELP)

    # 拆成首段与剩余
    parts = s.split(maxsplit=1)
    prefix = parts[0].lower()
    rest = " " + parts[1] if len(parts) > 1 else ""

    # 前缀匹配：命令以用户输入的首段开头，或用户首段是某命令的前缀
    matches = [
        c for c in SLASH_COMMANDS
        if c.startswith(prefix) or (
            prefix.startswith(c.split()[0]) if " " in c else prefix.startswith(c)
        )
    ]
    if not matches:
        return (None, f"未知命令: [red]{prefix}[/red]，输入 [dim]/[/dim] 查看可用命令")

    # 精确匹配优先：用户输入正好是某条命令
    exact = [c for c in matches if c == prefix]
    if exact:
        return (exact[0] + rest, None)
    # 用户正在输入更长命令（如 /audit e → /audit export）
    extended = [c for c in matches if c.startswith(prefix) and len(c) > len(prefix)]
    if extended:
        best = max(extended, key=len)
        return (best + rest, None)
    # 多选时取最短展开（如 /a → /audit）
    best = min(matches, key=len)
    return (best + rest, None)


def get_slash_completions(prefix: str) -> List[str]:
    """
    根据当前输入前缀返回可补全的斜杠命令列表，供输入框补全使用。
    输入 "/" 或 "/au" 等时返回匹配的命令。
    """
    prefix = prefix.strip().lower()
    if not prefix or not prefix.startswith("/"):
        return []
    # 匹配：命令以 prefix 开头，或 prefix 是某命令的前缀
    matches = [
        c for c in SLASH_COMMANDS
        if c.startswith(prefix) or (
            prefix.startswith(c.split()[0]) if " " in c else prefix.startswith(c)
        )
    ]
    return sorted(matches)


# ------------------------------------------------------------------
# 命令处理器注册表（供 interactive 主循环使用）
# ------------------------------------------------------------------

# 将命令名映射到其描述（不包含处理逻辑，逻辑在 interactive 中实现）
COMMAND_DESCRIPTIONS = {
    "/model": "切换 LLM 模型（Ollama/DeepSeek）",
    "/accept": "确认敏感操作（SuperHackbot 模式）",
    "/reject": "拒绝敏感操作",
    "/audit": "查看操作留痕",
    "/audit export": "导出审计报告",
    "/thinking": "切换推理过程的显示/隐藏",
    "/details": "切换工具执行详情的详细/简洁模式",
    "/compact": "压缩当前会话历史",
    "/sessions": "列出/切换会话",
    "/new": "新建会话",
    "/export": "导出当前对话为 Markdown",
}
