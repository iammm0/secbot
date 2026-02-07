"""
Hackbot 标识和启动界面
"""
from rich.console import Console
from rich.text import Text
from rich.panel import Panel


def print_hackbot_banner(console: Console):
    """打印大大的 Hackbot 标识，类似 opencode 风格"""
    # 使用更清晰的 ASCII Art
    banner = """
██╗  ██╗ █████╗  ██████╗██╗  ██╗██████╗  ██████╗ ████████╗
██║  ██║██╔══██╗██╔════╝██║ ██╔╝██╔══██╗██╔═══██╗╚══██╔══╝
███████║███████║██║     █████╔╝ ██████╔╝██║   ██║   ██║   
██╔══██║██╔══██║██║     ██╔═██╗ ██╔══██╗██║   ██║   ██║   
██║  ██║██║  ██║╚██████╗██║  ██╗██████╔╝╚██████╔╝   ██║   
╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝╚═════╝  ╚═════╝    ╚═╝   
"""
    
    # 直接打印，不使用 Panel，更简洁
    console.print()
    console.print(banner, style="bold bright_cyan", justify="center")
    console.print("[bold bright_cyan]Security Testing Agent[/bold bright_cyan]", justify="center")
    console.print()


def print_hackbot_logo_simple(console: Console):
    """打印简单的 Hackbot Logo"""
    logo = """
    ██╗  ██╗ █████╗  ██████╗██╗  ██╗██████╗  ██████╗ ████████╗
    ██║  ██║██╔══██╗██╔════╝██║ ██╔╝██╔══██╗██╔═══██╗╚══██╔══╝
    ███████║███████║██║     █████╔╝ ██████╔╝██║   ██║   ██║   
    ██╔══██║██╔══██║██║     ██╔═██╗ ██╔══██╗██║   ██║   ██║   
    ██║  ██║██║  ██║╚██████╗██║  ██╗██████╔╝╚██████╔╝   ██║   
    ╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝╚═════╝  ╚═════╝    ╚═╝   
    """
    
    console.print(logo, style="bold bright_cyan", justify="center")
    console.print()
