"""
ContentComponent：内容展示组件
展示 agent 的普通回复内容（非推理、非执行的对话内容）
支持 Markdown 渲染

优化：添加 emoji 标题、统一间距处理
"""

from typing import Optional

from rich.console import Console
from rich.panel import Panel
from rich.markdown import Markdown
from rich.text import Text
from rich import box

from tui.utils import adaptive_padding
from utils.event_bus import EventBus, EventType, Event


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

        panel_title = title or "[bold blue]📝 Content[/bold blue]"
        self.console.print(
            Panel(
                renderable,
                title=panel_title,
                border_style="blue",
                box=box.ROUNDED,
                padding=adaptive_padding(self.console),
            )
        )

    def display_observation(self, content: str, tool: str = "", iteration: int = 0):
        """显示观察结果，使用 Markdown 渲染"""
        if not self._visible:
            return

        title_parts = ["👁 Observation"]
        if iteration:
            title_parts.append(f"#{iteration}")
        if tool:
            title_parts.append(f"({tool})")

        title = f"[bold blue]{' '.join(title_parts)}[/bold blue]"
        self.console.print(
            Panel(
                Markdown(content or ""),
                title=title,
                border_style="blue",
                box=box.ROUNDED,
                padding=adaptive_padding(self.console),
            )
        )

    def display_assistant_message(self, content: str, agent_name: str = "Assistant"):
        """显示助手消息（Markdown 格式）"""
        if not self._visible:
            return

        self.console.print(
            Panel(
                Markdown(content),
                title=f"[bold green]🤖 {agent_name}[/bold green]",
                border_style="green",
                box=box.ROUNDED,
                padding=adaptive_padding(self.console),
            )
        )

    def display_user_message(self, content: str, username: str = "You"):
        """显示用户消息，使用 Markdown 渲染"""
        if not self._visible:
            return

        self.console.print(
            Panel(
                Markdown(content or ""),
                title=f"[bold bright_blue]💬 {username}[/bold bright_blue]",
                border_style="bright_blue",
                box=box.ROUNDED,
                padding=(0, 1),
            )
        )
