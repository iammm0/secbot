#!/usr/bin/env python3
"""
SecBot 配置命令 - 独立脚本用于配置 API Key
DeepSeek 等密钥存入 SQLite（user_configs），不再使用 .env / keyring。
"""

import typer
import keyring
from rich.console import Console
from rich.panel import Panel
from rich.table import Table

app = typer.Typer(name="secbot", help="SecBot 安全渗透测试工具")

console = Console()

# DeepSeek 使用 SQLite 存储，其余仍用 keyring（可选后续统一迁到 SQLite）
SQLITE_PROVIDERS = ("deepseek",)
KEYRING_PROVIDERS = ("ollama", "shodan", "virustotal")


def _get_deepseek_key_from_db():
    """从 SQLite 读取 deepseek 密钥"""
    try:
        from database.manager import DatabaseManager
        from database.models import UserConfig

        db = DatabaseManager()
        cfg = db.get_config("deepseek_api_key")
        return cfg.value if cfg else None
    except Exception:
        return None


def _save_deepseek_key_to_db(value: str):
    """将 deepseek 密钥写入 SQLite"""
    from database.manager import DatabaseManager
    from database.models import UserConfig

    db = DatabaseManager()
    db.save_config(
        UserConfig(
            key="deepseek_api_key",
            value=value,
            category="api_keys",
            description="DeepSeek API Key",
        )
    )


def _delete_deepseek_key_from_db():
    """从 SQLite 删除 deepseek 密钥"""
    try:
        from database.manager import DatabaseManager

        db = DatabaseManager()
        return db.delete_config("deepseek_api_key")
    except Exception:
        return False


@app.command()
def config():
    """配置 API Key（交互式）。DeepSeek 存入 SQLite，其余存入 keyring。"""
    console.print(
        Panel(
            "[bold]🔑 SecBot API Key 配置[/bold]\n\n"
            "DeepSeek 密钥存入 SQLite；其他 provider 存入系统密钥环（keyring）",
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

    if provider in SQLITE_PROVIDERS:
        current_key = _get_deepseek_key_from_db()
    else:
        current_key = keyring.get_password("secbot", provider)

    if current_key:
        masked = current_key[:8] + "*" * (len(current_key) - 8)
        console.print(f"\n当前 {provider} API Key: {masked}")
        console.print("直接回车保持不变，输入新值覆盖")
    else:
        console.print(f"\n当前 {provider} 未配置")

    new_key = input(f"\n输入新的 {provider} API Key: ").strip()

    if new_key:
        if provider in SQLITE_PROVIDERS:
            _save_deepseek_key_to_db(new_key)
            console.print(f"✅ {provider} API Key 已保存到 SQLite")
        else:

            keyring.set_password("secbot", provider, new_key)
            console.print(f"✅ {provider} API Key 已保存到密钥环")
    else:
        console.print("未更改")


@app.command()
def config_show():
    """显示当前 API Key 配置状态（DeepSeek 来自 SQLite，其余来自 keyring）"""
    providers = ["deepseek", "ollama", "shodan", "virustotal"]
    console.print(
        Panel("[bold]🔑 当前 API Key 配置状态[/bold]", title="配置状态", expand=False)
    )

    table = Table()
    table.add_column("Provider")
    table.add_column("状态")

    for provider in providers:
        if provider in SQLITE_PROVIDERS:
            key = _get_deepseek_key_from_db()
        else:
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
    if provider in SQLITE_PROVIDERS:
        if _delete_deepseek_key_from_db():
            console.print(f"✅ {provider} API Key 已从 SQLite 删除")
        else:
            console.print(f"❌ {provider} 未配置或删除失败")
        return
    try:
        keyring.delete_password("secbot", provider)
        console.print(f"✅ {provider} API Key 已删除")
    except keyring.errors.PasswordDeleteError:
        console.print(f"❌ {provider} 未配置或删除失败")


if __name__ == "__main__":
    app()
