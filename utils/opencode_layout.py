"""
OpenCode 风格的布局组件
仿制 opencode 的界面布局
"""
from rich.console import Console
from rich.layout import Layout
from rich.panel import Panel
from rich.text import Text
from rich.align import Align
from rich import box


def create_opencode_layout(console: Console) -> Layout:
    """创建类似 opencode 的布局"""
    layout = Layout()
    
    # 分割为三个主要区域：顶部（logo）、中间（输入）、底部（提示）
    layout.split_column(
        Layout(name="header", size=5),  # Logo 区域
        Layout(name="main", ratio=1),   # 主输入区域
        Layout(name="footer", size=3),  # 底部提示区域
    )
    
    # 顶部：Hackbot Logo
    logo_text = """
╦ ╦┌─┐┌─┐┌─┐┌─┐┌─┐┌─┐  ┌─┐┌─┐┌─┐┌─┐┌─┐┌─┐
╠═╣│ ││ │├─┘├─┘├─┤│ │  │ │├─┘├─┘│ │├─┘├─┘
╩ ╩└─┘└─┘┴  ┴  ┴ ┴└─┘  └─┘┴  ┴  └─┘┴  ┴  
"""
    layout["header"].update(
        Align.center(
            Text(logo_text, style="bold bright_cyan"),
            vertical="middle"
        )
    )
    
    # 中间：输入区域
    input_area = Panel(
        "",
        border_style="bright_blue",
        box=box.ROUNDED,
        padding=(2, 4),
        title="[bold bright_blue]Security Testing Agent[/bold bright_blue]",
        title_align="center"
    )
    layout["main"].update(input_area)
    
    # 底部：提示和快捷键
    footer_content = Layout()
    footer_content.split_row(
        Layout(name="tip", ratio=2),
        Layout(name="shortcuts", ratio=1)
    )
    
    # 左下角提示
    tip_text = Text("💡 Tip: Run /share to create a public link to your conversation", style="dim")
    footer_content["tip"].update(tip_text)
    
    # 右下角快捷键
    shortcuts_text = Text("tab agents  ctrl+p commands", style="dim", justify="right")
    footer_content["shortcuts"].update(shortcuts_text)
    
    layout["footer"].update(footer_content)
    
    return layout


def create_input_panel(placeholder: str = "Ask anything...", example: str = None) -> Panel:
    """创建类似 opencode 的输入面板"""
    if example:
        placeholder_text = f"{placeholder} \"{example}\""
    else:
        placeholder_text = placeholder
    
    # 创建输入框样式的面板
    input_panel = Panel(
        Text(placeholder_text, style="dim"),
        border_style="bright_blue",
        box=box.ROUNDED,
        padding=(1, 2),
        height=5
    )
    
    return input_panel


def create_suggestions_bar(suggestions: list = None) -> Text:
    """创建建议栏（显示在输入框下方）"""
    if not suggestions:
        suggestions = ["Build", "Hackbot", "SuperHackbot"]
    
    suggestion_text = Text()
    for i, suggestion in enumerate(suggestions):
        if i == 0:
            suggestion_text.append(suggestion, style="bold bright_blue")
        else:
            suggestion_text.append(f" {suggestion}", style="dim")
    
    return suggestion_text
