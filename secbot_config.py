#!/usr/bin/env python3
"""
SecBot 配置命令 - 独立脚本用于配置 API Key
"""

import typer
import keyring
import getpass
from rich.console import Console
from rich.panel import Panel
from rich.table import Table

app = typer.Typer(name="secbot", help="SecBot 安全渗透测试工具")

console = Console()


@app.command()
def config():
    """配置 API Key（交互式）"""
    console.print(
        Panel(
            "[bold]🔑 SecBot API Key 配置[/bold]\n\n"
            "安全存储 API Key 到系统密钥环（keyring）",
            title="配置",
            expand=False,
        )
    )

    providers = ["deepseek", "ollama", "shodan", "virustotal"]
    console.print("\n可用 provider: " + ", ".join(providers))

    provider = typer.prompt("请选择 provider").strip().lower()

    if provider not in providers:
        console.print(f"❌ 无效的 provider: {provider}")
        raise typer.Exit(1)

    current_key = keyring.get_password("secbot", provider)
    if current_key:
        masked = current_key[:8] + "*" * (len(current_key) - 8)
        console.print(f"\n当前 {provider} API Key: {masked}")
        console.print("直接回车保持不变，输入新值覆盖")
    else:
        console.print(f"\n当前 {provider} 未配置")

    new_key = getpass.getpass(f"\n输入新的 {provider} API Key: ")

    if new_key:
        keyring.set_password("secbot", provider, new_key)
        console.print(f"✅ {provider} API Key 已保存到密钥环")
    else:
        console.print("未更改")


@app.command()
def config_show():
    """显示当前 API Key 配置状态"""
    providers = ["deepseek", "ollama", "shodan", "virustotal"]
    console.print(
        Panel("[bold]🔑 当前 API Key 配置状态[/bold]", title="配置状态", expand=False)
    )

    table = Table()
    table.add_column("Provider")
    table.add_column("状态")

    for provider in providers:
        key = keyring.get_password("secbot", provider)
        if key:
            masked = key[:8] + "*" * (len(key) - 8)
            table.add_row(provider, f"✅ 已配置 (" + masked + ")")
        else:
            table.add_row(provider, "❌ 未配置")

    console.print(table)
    console.print("\n提示: 使用 [bold]secbot config[/bold] 命令配置 API Key")


@app.command()
def config_delete(provider: str):
    """删除已配置的 API Key"""
    try:
        keyring.delete_password("secbot", provider)
        console.print(f"✅ {provider} API Key 已删除")
    except keyring.errors.PasswordDeleteError:
        console.print(f"❌ {provider} 未配置或删除失败")


if __name__ == "__main__":
    app()
