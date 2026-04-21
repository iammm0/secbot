"""
加载组件：显示加载状态
"""
from rich.console import Console
from rich.panel import Panel
from rich.spinner import Spinner
from rich.live import Live
from rich import box


class LoadingComponent:
    """加载组件，显示加载状态"""

    def __init__(self, console: Console):
        self.console = console

    def show_loading(self, message: str = "加载中..."):
        """显示加载状态"""
        spinner = Spinner("dots", text=message, style="bold cyan")
        return Live(
            Panel(
                spinner,
                border_style="cyan",
                box=box.ROUNDED,
                padding=(1, 2),
                title="[bold cyan]加载组件[/bold cyan]"
            ),
            console=self.console,
            refresh_per_second=10
        )

    def show_loading_simple(self, message: str = "加载中..."):
        """显示简单的加载状态（不使用Live）"""
        self.console.print(f"[cyan]⏳ {message}[/cyan]", end="")
        self.console.print()
