"""
Entry point for the secbot ACP gateway.

Usage:
    python -m opencode_gateway.main

This launches the ND-JSON transport on stdin/stdout, allowing
ACP-compatible clients (e.g. opencode, Cursor) to communicate
with secbot agents.
"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[3]
for _ws_dir in [
    _ROOT / "packages" / "secbot-core",
    _ROOT / "packages" / "secbot-tools",
    _ROOT / "packages" / "secbot-skills",
    _ROOT / "packages" / "shared-config",
    _ROOT / "packages" / "opencode-adapters",
    _ROOT / "apps" / "secbot-api",
    _ROOT / "apps" / "secbot-cli",
    _ROOT / "apps" / "opencode-gateway",
]:
    _s = str(_ws_dir)
    if _s not in sys.path:
        sys.path.insert(0, _s)

from opencode_gateway.protocol import NDJsonTransport
from opencode_gateway.agent import ACPAgent
from utils.logger import logger


def _build_resolve_agent():
    """Lazy resolver that creates secbot agents on demand."""
    _cache = {}

    def resolve(agent_type: str):
        if agent_type in _cache:
            return _cache[agent_type]
        try:
            from router.dependencies import create_agent
            agent = create_agent(agent_type)
            _cache[agent_type] = agent
            return agent
        except Exception as exc:
            logger.warning(f"Failed to resolve agent '{agent_type}': {exc}")
            return None

    return resolve


async def main():
    logger.info("Starting secbot ACP gateway (ND-JSON over stdio)")
    transport = NDJsonTransport()
    _agent = ACPAgent(transport, resolve_agent=_build_resolve_agent())
    await transport.run()


if __name__ == "__main__":
    asyncio.run(main())
