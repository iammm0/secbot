"""
Feature flags for gradual rollout of opencode integration.

Controls which integration capabilities are active. Can be configured
via environment variables or the secbot config file.
"""
from __future__ import annotations

import os
from dataclasses import dataclass


def _env_bool(key: str, default: bool = False) -> bool:
    val = os.environ.get(key, "").strip().lower()
    if val in ("1", "true", "yes", "on"):
        return True
    if val in ("0", "false", "no", "off"):
        return False
    return default


@dataclass
class FeatureFlags:
    """
    Integration feature flags. All default to False (off) for safe rollout.

    Enable via environment variables:
        SECBOT_ACP_ENABLED=true        # ACP gateway
        SECBOT_MCP_ENABLED=true        # MCP tool integration
        SECBOT_UNIFIED_SKILLS=true     # Unified skills layer
        SECBOT_EDIT_TOOLS=true         # opencode-style edit/write tools
        SECBOT_PLAN_MODE=true          # Plan mode support
        SECBOT_PERMISSIONS=true        # Permission system
    """
    acp_enabled: bool = False
    mcp_enabled: bool = False
    unified_skills: bool = False
    edit_tools: bool = False
    plan_mode: bool = False
    permissions: bool = False

    @classmethod
    def from_env(cls) -> "FeatureFlags":
        return cls(
            acp_enabled=_env_bool("SECBOT_ACP_ENABLED"),
            mcp_enabled=_env_bool("SECBOT_MCP_ENABLED"),
            unified_skills=_env_bool("SECBOT_UNIFIED_SKILLS"),
            edit_tools=_env_bool("SECBOT_EDIT_TOOLS"),
            plan_mode=_env_bool("SECBOT_PLAN_MODE"),
            permissions=_env_bool("SECBOT_PERMISSIONS"),
        )

    @classmethod
    def all_enabled(cls) -> "FeatureFlags":
        return cls(
            acp_enabled=True,
            mcp_enabled=True,
            unified_skills=True,
            edit_tools=True,
            plan_mode=True,
            permissions=True,
        )


_flags: FeatureFlags | None = None


def get_flags() -> FeatureFlags:
    global _flags
    if _flags is None:
        _flags = FeatureFlags.from_env()
    return _flags


def reset_flags():
    global _flags
    _flags = None
