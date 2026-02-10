"""
PlanningComponent：规划展示组件
订阅 PLAN_* 事件，展示 PlannerAgent 生成的结构化 todos 列表
支持实时更新 todo 状态，可折叠/展开
"""

from typing import List, Optional

from rich.console import Console, Group
from rich.panel import Panel
from rich.text import Text
from rich import box

from tui.models import TodoItem, TodoStatus, PlanResult
from tui.widgets.todo_list import render_todo_list
from tui.widgets.collapsible import CollapsiblePanel
from tui.utils import adaptive_padding, smart_render_text
from utils.event_bus import EventBus, EventType, Event


class PlanningComponent:
    """
    规划展示组件：

    - 展示 PlannerAgent 生成的结构化 todos 列表
    - 每个 todo 有状态标识: [ ] pending / [~] in_progress / [x] completed / [-] cancelled
    - 支持实时更新 todo 状态（agent 执行过程中自动标记进度）
    - 可折叠/展开计划详情
    """

    def __init__(self, console: Console, event_bus: Optional[EventBus] = None):
        self.console = console
        self.event_bus = event_bus
        self.todos: List[TodoItem] = []
        self.plan_summary: str = ""
        self.collapsed: bool = False
        self._visible: bool = True

        # 订阅事件
        if event_bus:
            event_bus.subscribe(EventType.PLAN_START, self._on_plan_start)
            event_bus.subscribe(EventType.PLAN_TODO, self._on_plan_todo)
            event_bus.subscribe(EventType.PLAN_COMPLETE, self._on_plan_complete)

    # ------------------------------------------------------------------
    # 事件处理
    # ------------------------------------------------------------------

    def _on_plan_start(self, event: Event):
        """规划开始"""
        self.todos = []
        self.plan_summary = event.data.get("summary", "")
        todos_data = event.data.get("todos", [])
        for td in todos_data:
            if isinstance(td, TodoItem):
                self.todos.append(td)
            elif isinstance(td, dict):
                self.todos.append(TodoItem(
                    id=td.get("id", ""),
                    content=td.get("content", ""),
                    status=TodoStatus(td.get("status", "pending")),
                    depends_on=td.get("depends_on", []),
                    tool_hint=td.get("tool_hint"),
                ))
        self.display()

    def _on_plan_todo(self, event: Event):
        """单条 todo 状态更新"""
        todo_id = event.data.get("todo_id", "")
        new_status = event.data.get("status", "")
        result_summary = event.data.get("result_summary")
        self.update_todo_status(todo_id, new_status, result_summary)
        self.display()

    def _on_plan_complete(self, event: Event):
        """规划完成"""
        # 可选的完成回调
        pass

    # ------------------------------------------------------------------
    # 公共方法
    # ------------------------------------------------------------------

    def set_plan(self, plan_result: PlanResult):
        """设置完整的规划结果"""
        self.todos = plan_result.todos
        self.plan_summary = plan_result.plan_summary

    def update_todo_status(
        self,
        todo_id: str,
        status: str,
        result_summary: Optional[str] = None,
    ):
        """更新单条 todo 的状态"""
        for todo in self.todos:
            if todo.id == todo_id:
                todo.status = TodoStatus(status)
                if result_summary:
                    todo.result_summary = result_summary
                todo.updated_at = __import__("datetime").datetime.now()
                break

    def get_completion_stats(self) -> dict:
        """获取 todo 完成统计"""
        total = len(self.todos)
        completed = sum(1 for t in self.todos if t.status == TodoStatus.COMPLETED)
        in_progress = sum(1 for t in self.todos if t.status == TodoStatus.IN_PROGRESS)
        cancelled = sum(1 for t in self.todos if t.status == TodoStatus.CANCELLED)
        pending = sum(1 for t in self.todos if t.status == TodoStatus.PENDING)
        return {
            "total": total,
            "completed": completed,
            "in_progress": in_progress,
            "cancelled": cancelled,
            "pending": pending,
        }

    # ------------------------------------------------------------------
    # 渲染
    # ------------------------------------------------------------------

    def render(self) -> Panel:
        """渲染规划组件为 Rich Panel，计划摘要使用 Markdown 渲染"""
        if not self.todos:
            content = Text("暂无计划", style="dim")
        else:
            parts = []
            if self.plan_summary:
                parts.append(smart_render_text(self.plan_summary, prefer_markdown=True))
                parts.append(Text())
            parts.append(render_todo_list(self.todos))
            stats = self.get_completion_stats()
            # 进度条文本
            progress_text = Text()
            progress_text.append(f"\n  进度: ", style="dim")
            done = stats['completed']
            total = stats['total']
            if total > 0:
                filled = int((done / total) * 10)
                bar = "█" * filled + "░" * (10 - filled)
                color = "green" if done == total else "yellow"
                progress_text.append(f"{bar} ", style=color)
            progress_text.append(f"{done}/{total}", style="dim")
            parts.append(progress_text)
            content = Group(*parts)

        if self.collapsed:
            stats = self.get_completion_stats()
            summary = f"计划 ({stats['completed']}/{stats['total']} 完成)"
            return CollapsiblePanel(
                content=content,
                title="[bold magenta]📋 Planning[/bold magenta]",
                border_style="magenta",
                collapsed_summary=summary,
                collapsed=True,
            ).render()

        return Panel(
            content,
            title="[bold magenta]📋 Planning[/bold magenta]",
            border_style="magenta",
            box=box.ROUNDED,
            padding=adaptive_padding(self.console),
        )

    def display(self):
        """直接打印到控制台。简单目标（1 步）只显示单行，不展开完整规划面板。"""
        if not self._visible:
            return
        # 简单目标不要过度规划：仅 1 步时单行展示
        if len(self.todos) == 1:
            first = self.todos[0]
            content = first.content[:60] + "..." if len(first.content) > 60 else first.content
            line = Text.assemble(
                ("📋 计划: ", "bold magenta"),
                (content, "magenta"),
            )
            if first.status == TodoStatus.IN_PROGRESS:
                line.append("  ", "")
                line.append("(执行中...)", "dim yellow")
            elif first.status == TodoStatus.COMPLETED:
                line.append("  ", "")
                line.append("✓" if not first.result_summary else f"✓ {first.result_summary}", "dim green")
            self.console.print(line)
            return
        if self.todos:
            self.console.print(self.render())
