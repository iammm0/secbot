"""
ContentComponent：内容展示组件
展示 agent 的普通回复内容（非推理、非执行的对话内容）
支持 Markdown 渲染
"""

from typing import Optional

from rich.console import Console
from rich.panel import Panel
from rich.markdown import Markdown
from rich.text import Text
from rich import box

from utils.event_bus import EventBus, EventType, Event


COLLAPSE_THRESHOLD = 500


class CollapsiblePanel:
    def __init__(
        self,
        content: str,
        title: str,
        border_style: str = "blue",
        collapsed: bool = False,
        console: Optional[Console] = None,
    ):
        self.content = content
        self.title = title
        self.border_style = border_style
        self._collapsed = collapsed
        self.console = console

    def toggle(self):
        self._collapsed = not self._collapsed

    def render(self) -> Panel:
        if self._collapsed or len(self.content) > COLLAPSE_THRESHOLD:
            display_content = (
                self.content[:COLLAPSE_THRESHOLD] + "\n... (内容过长，点击展开)"
            )
            if self._collapsed:
                display_content = (
                    f"[dim]{self.title} (点击展开)[/dim]\n... (内容已折叠)"
                )
        else:
            display_content = self.content

        return Panel(
            Text.from_markup(display_content),
            title=f"[bold {self.border_style}]{self.title}[/bold {self.border_style}]",
            border_style=self.border_style,
            box=box.ROUNDED,
            padding=_adaptive_padding(self.console) if self.console else (1, 2),
        )


def _adaptive_padding(console: Console) -> tuple:
    """根据终端宽度返回合适的 padding"""
    try:
        w = console.width or 80
    except Exception:
        w = 80
    if w < 40:
        return (0, 0)
    if w < 60:
        return (0, 1)
    return (1, 2)


class ContentComponent:
    """
    内容展示组件：

    - 展示 agent 的普通回复内容（非推理、非执行的对话内容）
    - 支持 Markdown 渲染
    - 用于展示问候回复、简单问答、观察结果等
    """

    def __init__(self, console: Console, event_bus: Optional[EventBus] = None):
        self.console = console
        self.event_bus = event_bus
        self._visible: bool = True

        if event_bus:
            event_bus.subscribe(EventType.CONTENT, self._on_content)

    # ------------------------------------------------------------------
    # 事件处理
    # ------------------------------------------------------------------

    def _on_content(self, event: Event):
        """接收内容事件"""
        content = event.data.get("content", "")
        content_type = event.data.get("type", "text")  # text / markdown / observation
        title = event.data.get("title", "")
        self.display_content(content, content_type=content_type, title=title)

    # ------------------------------------------------------------------
    # 公共方法
    # ------------------------------------------------------------------

    def display_content(
        self,
        content: str,
        content_type: str = "text",
        title: str = "",
    ):
        """显示内容，统一使用 Markdown 渲染"""
        if not self._visible:
            return

        renderable = Markdown(content or "")

        panel_title = title or "[bold blue]Content[/bold blue]"
        self.console.print(
            Panel(
                renderable,
                title=panel_title,
                border_style="blue",
                box=box.ROUNDED,
                padding=_adaptive_padding(self.console),
            )
        )

    def display_observation(self, content: str, tool: str = "", iteration: int = 0):
        """显示观察结果，使用 Markdown 渲染"""
        if not self._visible:
            return

        title_parts = ["Observation"]
        if iteration:
            title_parts.append(f"#{iteration}")
        if tool:
            title_parts.append(f"({tool})")

        title = " ".join(title_parts)
        collapsible = CollapsiblePanel(
            content=content or "",
            title=title,
            border_style="blue",
            collapsed=len(content or "") > COLLAPSE_THRESHOLD,
            console=self.console,
        )
        self.console.print(collapsible.render())

    def display_assistant_message(self, content: str, agent_name: str = "Assistant"):
        """显示助手消息（Markdown 格式）"""
        if not self._visible:
            return

        self.console.print(
            Panel(
                Markdown(content),
                title=f"[bold green]{agent_name}[/bold green]",
                border_style="green",
                box=box.ROUNDED,
                padding=_adaptive_padding(self.console),
            )
        )

    def display_user_message(self, content: str, username: str = "You"):
        """显示用户消息，使用 Markdown 渲染"""
        if not self._visible:
            return

        self.console.print(
            Panel(
                Markdown(content or ""),
                title=f"[bold bright_blue]{username}[/bold bright_blue]",
                border_style="bright_blue",
                box=box.ROUNDED,
                padding=(0, 1),
            )
        )
