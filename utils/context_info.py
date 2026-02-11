"""
Agent 运行上下文：当前时间、运行环境等，供 Hackbot 在推理时感知自身所处环境。
"""
import os
import platform
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional


def get_current_time_str() -> str:
    """返回当前本地时间字符串（含时区信息）。"""
    now = datetime.now()
    # 尝试带时区
    try:
        import time
        if time.daylight:
            tzname = time.tzname[1]
            utcoff = time.altzone
        else:
            tzname = time.tzname[0]
            utcoff = time.timezone
        hours, remainder = divmod(abs(utcoff), 3600)
        mins, _ = divmod(remainder, 60)
        tz_str = f"UTC{'-' if utcoff <= 0 else '+'}{hours:02d}:{mins:02d} ({tzname})"
    except Exception:
        tz_str = "local"
    return f"{now.strftime('%Y-%m-%d %H:%M:%S')} {tz_str}"


def get_environment_summary() -> dict:
    """收集当前运行环境信息（OS、Python、工作目录、是否容器/虚拟环境等）。"""
    info = {
        "os": platform.system(),
        "os_release": platform.release() or "",
        "machine": platform.machine() or "",
        "python_version": f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}",
        "cwd": str(Path.cwd()),
        "in_venv": _in_venv(),
        "in_docker": _in_docker(),
        "in_ci": _in_ci(),
    }
    return info


def _in_venv() -> bool:
    """是否在虚拟环境中运行。"""
    return (
        hasattr(sys, "real_prefix")
        or (hasattr(sys, "base_prefix") and sys.base_prefix != sys.prefix)
    )


def _in_docker() -> bool:
    """是否在 Docker 容器内运行（常见检测方式）。"""
    try:
        Path("/.dockerenv").resolve().stat()
        return True
    except (OSError, Exception):
        pass
    try:
        with open("/proc/self/cgroup", "r") as f:
            return "docker" in f.read() or "containerd" in f.read()
    except (OSError, FileNotFoundError, Exception):
        pass
    return False


def _in_ci() -> bool:
    """是否在 CI 环境中。"""
    ci_vars = ("CI", "GITHUB_ACTIONS", "GITLAB_CI", "JENKINS_URL", "TRAVIS", "BUILDKITE")
    return any(os.environ.get(v) for v in ci_vars)


def get_agent_context_block(include_time: bool = True, include_env: bool = True) -> str:
    """
    生成供注入到 Agent 提示词中的「当前上下文」文本块。
    Hackbot 据此知晓当前时间和运行环境。
    """
    lines = ["## 当前上下文"]
    if include_time:
        lines.append(f"- **当前时间**：{get_current_time_str()}")
    if include_env:
        env = get_environment_summary()
        env_desc = []
        env_desc.append(f"{env['os']} {env['os_release']} ({env['machine']})".strip())
        env_desc.append(f"Python {env['python_version']}")
        env_desc.append(f"工作目录：{env['cwd']}")
        if env["in_venv"]:
            env_desc.append("运行在虚拟环境 (venv/conda)")
        if env["in_docker"]:
            env_desc.append("运行在 Docker 容器内")
        if env["in_ci"]:
            env_desc.append("运行在 CI 环境中")
        lines.append("- **运行环境**：" + "；".join(env_desc))
    return "\n".join(lines) + "\n"
