"""
Root 权限策略：需要 root 才能执行的操作（如 sudo）的配置与持久化。
- root_command: 提权命令，默认 "sudo"
- root_policy: "ask" = 每次执行前询问密码；"always_allow" = 不询问直接执行（需系统已配置 NOPASSWD）
"""
import json
from pathlib import Path
from typing import Literal

RootPolicyType = Literal["ask", "always_allow"]

DEFAULT_ROOT_COMMAND = "sudo"
DEFAULT_ROOT_POLICY: RootPolicyType = "ask"
CONFIG_DIR = Path.home() / ".secbot-cli"
CONFIG_FILE = CONFIG_DIR / "root_policy.json"


def load_root_policy() -> dict:
    """加载 root 策略，返回 { root_command: str, root_policy: "ask"|"always_allow" }"""
    if not CONFIG_FILE.exists():
        return {
            "root_command": DEFAULT_ROOT_COMMAND,
            "root_policy": DEFAULT_ROOT_POLICY,
        }
    try:
        data = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
        return {
            "root_command": data.get("root_command", DEFAULT_ROOT_COMMAND),
            "root_policy": data.get("root_policy", DEFAULT_ROOT_POLICY),
        }
    except Exception:
        return {
            "root_command": DEFAULT_ROOT_COMMAND,
            "root_policy": DEFAULT_ROOT_POLICY,
        }


def save_root_policy(root_command: str = DEFAULT_ROOT_COMMAND, root_policy: RootPolicyType = DEFAULT_ROOT_POLICY) -> None:
    """保存 root 策略"""
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    CONFIG_FILE.write_text(
        json.dumps({"root_command": root_command, "root_policy": root_policy}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def needs_root_password(command: str, root_command: str = "sudo") -> bool:
    """判断命令是否以 root_command 开头，需要按策略处理密码。"""
    cmd = (command or "").strip()
    if not cmd:
        return False
    # 支持 "sudo ..." 或 "sudo"
    return cmd == root_command or cmd.startswith(root_command + " ")
