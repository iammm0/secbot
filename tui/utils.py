"""
TUI 公共工具函数
避免各组件重复定义相同的辅助函数
"""

from rich.console import Console


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
