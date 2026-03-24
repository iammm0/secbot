# Secbot Monorepo (English)

<div align="center">

![secbot main screen](assets/secbot-main.png)

**AI security automation platform with ACP/MCP/Skills integration**

[Main README](README.md) | [中文](README_CN.md)

</div>

---

## Security Notice

This repository is for **authorized security testing and defense research only**.
Never run it against systems without explicit permission.

## Project Scope (Current)

The repository has been migrated to a monorepo architecture and now includes:

- **ACP bridge** between external clients and secbot agent runtime
- **MCP integration** for local/remote tool servers
- **Unified skills system** combining secbot and opencode-style skill discovery
- **Plan/Edit capability** with plan mode and opencode-like file editing semantics

## Repository Layout

```text
apps/
  secbot-api/          # API routing layer
  secbot-cli/          # CLI/TUI entrypoints
  opencode-gateway/    # ACP gateway (stdio ND-JSON)

packages/
  secbot-core/         # session/planning/execution core
  secbot-tools/        # built-in tools and system operations
  secbot-skills/       # native skills system
  shared-config/       # shared settings, feature flags, MCP config loader
  opencode-adapters/   # MCP/skills/edit/permission adapters
```

## Main Capabilities

- Multi-agent orchestration with planner + layered execution
- ACP session lifecycle and streaming event mapping
- MCP discovery, wrapping, and invocation as unified tools
- Unified skill loading from secbot + opencode-style directories
- Permission policy model (`allow` / `ask` / `deny`)
- Runtime modes: `agent`, `plan`, `ask`

## Quick Start

### 1) Install

```bash
python -m pip install -e .
```

### 2) Run API / CLI

```bash
secbot-server
# or
python main.py --backend

secbot-cli
# or
python main.py
```

### 3) Run ACP Gateway

```bash
python -m opencode_gateway.main
# or (script entry)
secbot-acp
```

## Feature Flags (Gradual Rollout)

Enable via env vars:

- `SECBOT_ACP_ENABLED`
- `SECBOT_MCP_ENABLED`
- `SECBOT_UNIFIED_SKILLS`
- `SECBOT_EDIT_TOOLS`
- `SECBOT_PLAN_MODE`
- `SECBOT_PERMISSIONS`

Example:

```bash
export SECBOT_ACP_ENABLED=true
export SECBOT_MCP_ENABLED=true
export SECBOT_UNIFIED_SKILLS=true
export SECBOT_EDIT_TOOLS=true
export SECBOT_PLAN_MODE=true
export SECBOT_PERMISSIONS=true
```

## MCP Config Example

Create `opencode.json` in project root:

```json
{
  "mcp": {
    "local-server": {
      "type": "local",
      "command": ["node", "./path/to/server.js"]
    },
    "remote-server": {
      "type": "remote",
      "url": "https://example.com/mcp",
      "headers": {
        "Authorization": "Bearer xxx"
      }
    }
  }
}
```

## Tests

```bash
python -m pytest tests/test_monorepo_integration.py -v
```

## Documentation

- Migration details: `docs/MONOREPO_MIGRATION.md`
- Chinese README: `README_CN.md`
- Main README: `README.md`
