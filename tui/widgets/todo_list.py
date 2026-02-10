"""
Todo 列表渲染组件：将 TodoItem 列表渲染为 Rich 可渲染对象

优化：使用 emoji 图标、高亮当前执行项
"""

from typing import List

from rich.text import Text

from tui.models import TodoItem, TodoStatus


# 状态 -> (图标, 文本颜色, 是否高亮整行)
_STATUS_MAP = {
    TodoStatus.PENDING:     ("⬜", "dim", False),
    TodoStatus.IN_PROGRESS: ("🔄", "bold yellow", True),
    TodoStatus.COMPLETED:   ("✅", "green", False),
    TodoStatus.CANCELLED:   ("⛔", "red dim", False),
}


def render_todo_list(todos: List[TodoItem]) -> Text:
    """
    将 TodoItem 列表渲染为 Rich Text 对象。

    示例输出：
        ✅ 1. 执行端口扫描 - port_scan  (完成)
        🔄 2. 识别开放服务 - service_detect  (执行中)
        ⬜ 3. 分析检测结果
    """
    text = Text()
    for idx, todo in enumerate(todos, 1):
        icon, color, highlight = _STATUS_MAP.get(todo.status, ("⬜", "dim", False))

        # 状态图标
        text.append(f"  {icon} ", style=color)

        # 编号 + 内容
        if todo.status == TodoStatus.CANCELLED:
            content_style = "strike dim"
        elif highlight:
            content_style = "bold yellow"
        else:
            content_style = ""
        text.append(f"{idx}. {todo.content}", style=content_style)

        # 工具提示
        if todo.tool_hint:
            text.append(f"  - {todo.tool_hint}", style="dim cyan")

        # 结果摘要
        if todo.result_summary:
            text.append(f"  ({todo.result_summary})", style="dim green")
        elif todo.status == TodoStatus.IN_PROGRESS:
            text.append("  (执行中...)", style="dim yellow")

        if idx < len(todos):
            text.append("\n")

    return text
