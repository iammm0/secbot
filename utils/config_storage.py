"""
安全存储 API Key 配置
"""

import keyring
import getpass
from typing import Optional

KEYRING_SERVICE = "secbot"


def get_api_key(provider: str = "deepseek") -> Optional[str]:
    """获取存储的 API Key"""
    return keyring.get_password(KEYRING_SERVICE, provider)


def set_api_key(provider: str, api_key: str) -> None:
    """存储 API Key"""
    keyring.set_password(KEYRING_SERVICE, provider, api_key)


def delete_api_key(provider: str) -> bool:
    """删除存储的 API Key"""
    try:
        keyring.delete_password(KEYRING_SERVICE, provider)
        return True
    except keyring.errors.PasswordDeleteError:
        return False


def configure_api_key(provider: str = "deepseek") -> None:
    """交互式配置 API Key"""
    print(f"\n配置 {provider.upper()} API Key")
    print("-" * 40)

    current_key = get_api_key(provider)
    if current_key:
        masked = current_key[:8] + "*" * (len(current_key) - 8)
        print(f"当前已配置: {masked}")

    print("\n输入新的 API Key（或直接回车保持不变）:")
    new_key = getpass.getpass("> ")

    if new_key:
        set_api_key(provider, new_key)
        print(f"✅ {provider.upper()} API Key 已更新")
    else:
        print("未更改")


def show_config_status() -> dict:
    """显示当前配置状态"""
    status = {}
    providers = ["deepseek", "ollama"]

    for provider in providers:
        key = get_api_key(provider)
        status[provider] = bool(key)

    return status
