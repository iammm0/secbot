"""
TUI 公共工具函数
避免各组件重复定义相同的辅助函数
"""

import re

from rich.console import Console
from rich.console import RenderableType
from rich.markdown import Markdown
from rich.text import Text


# 触发 Markdown 渲染的常见语法特征。
# 目标：只有“明显是 Markdown”的内容才走 Markdown 解析，降低纯文本渲染开销。
_MARKDOWN_HINT_RE = re.compile(
    r"(^#{1,6}\s)|"            # 标题
    r"(^\s*[-*+]\s)|"          # 无序列表
    r"(^\s*\d+\.\s)|"          # 有序列表
    r"(```)|"                  # 代码块
    r"(`[^`\n]+`)|"            # 行内代码
    r"(\[[^\]]+\]\([^)]+\))|"  # 链接
    r"(^>\s)|"                 # 引用
    r"(\*\*[^*]+\*\*)|"        # 粗体
    r"(__[^_]+__)|"            # 粗体（下划线）
    r"(^\s*-{3,}\s*$)|"        # 分隔线 ---
    r"(^\s*={3,}\s*$)",        # 分隔线 ===
    re.MULTILINE,
)


def adaptive_padding(console: Console) -> tuple:
    """根据终端宽度返回合适的 padding (vertical, horizontal)"""
    try:
        w = console.width or 80
    except Exception:
        w = 80
    if w < 40:
        return (0, 0)
    if w < 60:
        return (0, 1)
    return (1, 2)


def smart_render_text(content: str, prefer_markdown: bool = True) -> RenderableType:
    """
    根据内容特征自动选择 Text / Markdown 渲染。

    - 默认优先性能：纯文本直接走 Text，避免不必要的 Markdown 解析。
    - 检测到明显 Markdown 语法时才使用 Markdown，保证格式正确。
    """
    value = content or ""
    if not prefer_markdown:
        return Text(value)
    if _MARKDOWN_HINT_RE.search(value):
        return Markdown(value)
    return Text(value)
