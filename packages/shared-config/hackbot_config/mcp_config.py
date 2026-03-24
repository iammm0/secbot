"""
MCP server configuration loader.

Reads MCP server definitions from the unified secbot config,
supporting both local (stdio) and remote (HTTP/SSE) servers,
aligned with opencode's config.mcp schema.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

from utils.logger import logger

DEFAULT_CONFIG_PATHS = [
    ".opencode/opencode.json",
    ".opencode/opencode.jsonc",
    "opencode.json",
    "opencode.jsonc",
]

GLOBAL_CONFIG_PATHS = [
    "~/.config/opencode/opencode.json",
]


def _strip_jsonc_comments(text: str) -> str:
    """Strip single-line // comments from JSONC content."""
    lines = []
    for line in text.splitlines():
        stripped = line.lstrip()
        if stripped.startswith("//"):
            continue
        lines.append(line)
    return "\n".join(lines)


def load_mcp_configs(project_dir: Optional[str] = None) -> Dict[str, Dict[str, Any]]:
    """
    Load MCP server configurations from config files.

    Checks project-level configs first, then global.
    Returns dict of server_name -> raw config dict.
    """
    root = Path(project_dir) if project_dir else Path.cwd()
    servers: Dict[str, Dict[str, Any]] = {}

    search = [root / p for p in DEFAULT_CONFIG_PATHS]
    search.extend(Path(os.path.expanduser(p)) for p in GLOBAL_CONFIG_PATHS)

    for cfg_path in search:
        if not cfg_path.exists():
            continue
        try:
            text = cfg_path.read_text(encoding="utf-8")
            cleaned = _strip_jsonc_comments(text)
            data = json.loads(cleaned)
            mcp_section = data.get("mcp", {})
            for name, cfg in mcp_section.items():
                if name not in servers:
                    servers[name] = cfg
        except Exception as exc:
            logger.warning(f"Failed to load MCP config from {cfg_path}: {exc}")

    env_config = os.environ.get("SECBOT_MCP_CONFIG")
    if env_config:
        try:
            extra = json.loads(env_config)
            for name, cfg in extra.items():
                if name not in servers:
                    servers[name] = cfg
        except Exception as exc:
            logger.warning(f"Failed to parse SECBOT_MCP_CONFIG env: {exc}")

    return servers


def configs_to_server_list(raw: Dict[str, Dict[str, Any]]):
    """Convert raw config dict to MCPServerConfig objects (lazy import to avoid circular deps)."""
    from opencode_adapters.mcp_client import MCPServerConfig, MCPServerType

    configs = []
    for name, cfg in raw.items():
        server_type = MCPServerType(cfg.get("type", "local"))
        if server_type == MCPServerType.LOCAL:
            command = cfg.get("command", [])
            if isinstance(command, str):
                command = command.split()
            configs.append(MCPServerConfig(
                name=name,
                type=MCPServerType.LOCAL,
                command=command,
                environment=cfg.get("environment", {}),
                timeout=cfg.get("timeout", 30),
                enabled=cfg.get("enabled", True),
            ))
        else:
            configs.append(MCPServerConfig(
                name=name,
                type=MCPServerType.REMOTE,
                url=cfg.get("url", ""),
                headers=cfg.get("headers", {}),
                timeout=cfg.get("timeout", 30),
                enabled=cfg.get("enabled", True),
            ))
    return configs
