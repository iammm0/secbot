"""
可折叠 Panel 组件：支持展开/折叠内容区域
在终端环境中以单行摘要或完整内容两种模式渲染
"""

from typing import Optional, Union

from rich.console import Console, ConsoleOptions, RenderResult
from rich.panel import Panel
from rich.text import Text
from rich import box


class CollapsiblePanel:
    """
    可折叠面板：展开时显示完整内容，折叠时显示单行摘要。

    用法：
        panel = CollapsiblePanel(
            content="完整的长文本...",
            title="推理过程 - 迭代 3",
            border_style="cyan",
            collapsed_summary="Thought: 分析端口扫描结果...",
        )
        panel.collapsed = True
        console.print(panel)
    """

    def __init__(
        self,
        content: Union[str, Text] = "",
        title: str = "",
        border_style: str = "white",
        collapsed_summary: Optional[str] = None,
        collapsed: bool = False,
        padding: tuple = (1, 2),
    ):
        self.content = content
        self.title = title
        self.border_style = border_style
        self.collapsed_summary = collapsed_summary
        self.collapsed = collapsed
        self.padding = padding

    def toggle(self):
        """切换折叠状态"""
        self.collapsed = not self.collapsed

    def render(self) -> Panel:
        """渲染为 Rich Panel"""
        if self.collapsed:
            summary = self.collapsed_summary or self._auto_summary()
            indicator = "[dim]▸ [/dim]"
            return Panel(
                Text.from_markup(f"{indicator}{summary}"),
                title=self.title,
                border_style="dim " + self.border_style,
                box=box.ROUNDED,
                padding=(0, 1),
            )
        else:
            indicator = "[dim]▾ [/dim]"
            title_with_indicator = f"{indicator}{self.title}" if self.title else ""
            return Panel(
                self.content,
                title=title_with_indicator or self.title,
                border_style=self.border_style,
                box=box.ROUNDED,
                padding=self.padding,
            )

    def _auto_summary(self) -> str:
        """自动从内容生成折叠摘要（取前60个字符）"""
        text = str(self.content) if self.content else ""
        # 去掉 Rich 标记，取纯文本
        plain = text.replace("\n", " ").strip()
        if len(plain) > 60:
            return plain[:57] + "..."
        return plain

    def __rich_console__(self, console: Console, options: ConsoleOptions) -> RenderResult:
        yield self.render()
