"""
交互式斜杠命令前缀匹配：用户输入 / 后匹配最接近的命令，支持快速选择。
"""
from typing import Tuple, Optional

# 按长度降序，以便优先匹配 /audit export
SLASH_COMMANDS = (
    "/audit export",
    "/audit",
    "/model",
    "/accept",
    "/reject",
)

SLASH_HELP = (
    "可用命令（输入前缀可匹配）: [cyan]/model[/cyan], [cyan]/accept[/cyan], [cyan]/reject[/cyan], [cyan]/audit[/cyan], [cyan]/audit export[/cyan]  "
    "例: [dim]/m[/dim] → /model, [dim]/ac[/dim] → /accept"
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
    matches = [c for c in SLASH_COMMANDS if c.startswith(prefix) or (prefix.startswith(c.split()[0]) if " " in c else prefix.startswith(c))]
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
