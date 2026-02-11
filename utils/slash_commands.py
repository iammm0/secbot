"""
交互式斜杠命令前缀匹配：用户输入 / 后匹配最接近的命令，支持快速选择。
输入 "/" 时可对将要执行的命令进行补全。

v2：新增 /thinking, /details, /compact, /sessions, /new, /export 命令
v3：大量集成 main.py CLI 命令（list-agents, list-tools, system-info, db-stats 等）
"""
from typing import Tuple, Optional, List

# 按长度降序，以便优先匹配如 /audit export、/list-tools 等
SLASH_COMMANDS = (
    "/audit export",
    "/defense-blocked",
    "/defense-report",
    "/defense-status",
    "/defense-scan",
    "/list-authorizations",
    "/list-processes",
    "/list-targets",
    "/system-status",
    "/system-info",
    "/prompt-list",
    "/db-history",
    "/list-tools",
    "/list-agents",
    "/file-list",
    "/db-stats",
    "/clear",
    "/audit",
    "/model",
    "/accept",
    "/reject",
    "/start",
    "/plan",
    "/agent",
    "/ask",
    "/thinking",
    "/details",
    "/compact",
    "/sessions",
    "/new",
    "/export",
    "/root-config",
)

def _build_slash_help() -> str:
    """根据 COMMAND_DESCRIPTIONS 生成「命令 — 简要说明」帮助文案。"""
    lines = ["可用命令（输入前缀可匹配）:"]
    for cmd in SLASH_COMMANDS:
        desc = COMMAND_DESCRIPTIONS.get(cmd, "")
        lines.append(f"  [cyan]{cmd}[/cyan]  —  {desc}")
    lines.append("例: [dim]/m[/dim] → /model, [dim]/pl[/dim] → /plan, [dim]/st[/dim] → /start")
    return "\n".join(lines)


# SLASH_HELP 在文件末尾根据 COMMAND_DESCRIPTIONS 生成


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
    return [cmd for cmd, _ in get_slash_completions_with_descriptions(prefix)]


def get_slash_completions_with_descriptions(prefix: str) -> List[Tuple[str, str]]:
    """
    返回 (命令, 简要说明) 列表，供补全时展示「命令 — 说明」。
    """
    prefix = prefix.strip().lower()
    if not prefix or not prefix.startswith("/"):
        return []
    matches = [
        c for c in SLASH_COMMANDS
        if c.startswith(prefix) or (
            prefix.startswith(c.split()[0]) if " " in c else prefix.startswith(c)
        )
    ]
    out = []
    for cmd in sorted(matches):
        desc = COMMAND_DESCRIPTIONS.get(cmd, "")
        out.append((cmd, desc))
    return out


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
    "/plan": "进入计划模式，编写自动化安全测试计划",
    "/start": "计划模式下确认计划并开始执行",
    "/agent": "切换 default（hackbot）或 super（superhackbot）模式",
    "/ask": "切换 Ask 模式：对当前对话上下文提问，不执行推理或动作",
    "/thinking": "切换推理过程的显示/隐藏",
    "/details": "切换工具执行详情的详细/简洁模式",
    "/compact": "压缩当前会话历史",
    "/sessions": "列出/切换会话",
    "/new": "新建会话",
    "/export": "导出当前对话为 Markdown",
    # CLI 集成命令（与 main.py --help 对应）
    "/list-agents": "列出可用智能体（hackbot / superhackbot）",
    "/list-tools": "列出已集成工具（可接 agent/category 参数）",
    "/clear": "清空当前对话历史与记忆",
    "/system-info": "显示系统信息（OS、架构、Python 等）",
    "/system-status": "显示系统状态（CPU、内存、磁盘）",
    "/list-processes": "列出运行中的进程（可接 --filter 名）",
    "/file-list": "列出目录文件（可接路径，默认当前目录）",
    "/prompt-list": "列出提示词模板与链",
    "/db-stats": "显示数据库统计",
    "/db-history": "查看对话历史（可接 --limit）",
    "/defense-scan": "执行完整安全扫描",
    "/defense-status": "查看防御系统状态",
    "/defense-blocked": "列出/管理封禁 IP",
    "/defense-report": "生成防御报告",
    "/list-targets": "列出发现的目标主机",
    "/list-authorizations": "列出所有授权",
    "/root-config": "配置 root 权限策略：ask（每次询问密码）/ always（不询问）",
}

# 用 COMMAND_DESCRIPTIONS 生成帮助文案，保证与补全说明一致
SLASH_HELP = _build_slash_help()
