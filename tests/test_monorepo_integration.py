"""
End-to-end integration tests for the secbot-opencode monorepo.

Tests cover:
  1. Workspace import paths
  2. ACP gateway protocol handling
  3. Plan mode and edit tool semantics
  4. MCP client lifecycle
  5. Unified skills loading
  6. Feature flag gating
"""
import asyncio
import json
import sys
import tempfile
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# ---------------------------------------------------------------------------
# 1. Workspace import paths
# ---------------------------------------------------------------------------

class TestWorkspaceImports:
    """Verify all packages are importable from their new locations."""

    def test_core_import(self):
        import core
        assert hasattr(core, "__file__")

    def test_tools_import(self):
        import tools
        assert hasattr(tools, "__file__")

    def test_skills_import(self):
        import skills
        assert hasattr(skills, "__file__")

    def test_router_import(self):
        import router
        assert hasattr(router, "__file__")

    def test_secbot_cli_import(self):
        import secbot_cli
        assert hasattr(secbot_cli, "__file__")

    def test_hackbot_config_import(self):
        import hackbot_config
        assert hasattr(hackbot_config, "__file__")

    def test_opencode_gateway_import(self):
        import opencode_gateway
        assert opencode_gateway.__version__ == "0.1.0"

    def test_opencode_adapters_import(self):
        import opencode_adapters
        assert opencode_adapters.__version__ == "0.1.0"


# ---------------------------------------------------------------------------
# 2. ACP protocol
# ---------------------------------------------------------------------------

class TestACPProtocol:
    """Test ACP gateway protocol layer."""

    def test_ndjson_transport_creation(self):
        from opencode_gateway.protocol import NDJsonTransport
        transport = NDJsonTransport()
        assert transport._request_handlers == {}

    def test_transport_handler_registration(self):
        from opencode_gateway.protocol import NDJsonTransport
        transport = NDJsonTransport()

        async def dummy(method, params):
            return {}

        transport.on_request("test/method", dummy)
        assert "test/method" in transport._request_handlers

    def test_acp_session_store(self):
        from opencode_gateway.session import ACPSessionStore
        store = ACPSessionStore()
        state = store.create("s1", "/tmp/test")
        assert state.id == "s1"
        assert state.cwd == "/tmp/test"
        assert store.get("s1") is state
        assert store.get("nonexistent") is None

    def test_acp_session_store_mode(self):
        from opencode_gateway.session import ACPSessionStore
        store = ACPSessionStore()
        store.create("s1", ".")
        store.set_mode("s1", "plan")
        assert store.require("s1").mode == "plan"


# ---------------------------------------------------------------------------
# 3. Plan mode and edit tools
# ---------------------------------------------------------------------------

class TestPlanMode:
    """Test plan mode controller and edit tools."""

    def test_plan_mode_defaults(self):
        from opencode_adapters.plan_mode import PlanModeController, SessionMode
        ctrl = PlanModeController()
        assert ctrl.get_mode("s1") == SessionMode.AGENT

    def test_plan_mode_switch(self):
        from opencode_adapters.plan_mode import PlanModeController, SessionMode
        ctrl = PlanModeController()
        ctrl.set_mode("s1", SessionMode.PLAN)
        assert ctrl.get_mode("s1") == SessionMode.PLAN

    def test_plan_mode_tool_filter(self):
        from opencode_adapters.plan_mode import PlanModeController, SessionMode
        ctrl = PlanModeController()
        ctrl.set_mode("s1", SessionMode.PLAN)
        allowed = ctrl.filter_tools("s1", ["execute_command", "smart_search", "port_scan"])
        assert "smart_search" in allowed
        assert "execute_command" not in allowed

    def test_agent_mode_allows_all(self):
        from opencode_adapters.plan_mode import PlanModeController, SessionMode
        ctrl = PlanModeController()
        ctrl.set_mode("s1", SessionMode.AGENT)
        assert ctrl.is_tool_allowed("s1", "execute_command")
        assert ctrl.is_tool_allowed("s1", "smart_search")

    def test_available_modes(self):
        from opencode_adapters.plan_mode import PlanModeController
        ctrl = PlanModeController()
        modes = ctrl.available_modes()
        ids = {m["id"] for m in modes}
        assert ids == {"agent", "plan", "ask"}


class TestEditTools:
    """Test edit/write tools."""

    @pytest.mark.asyncio
    async def test_edit_file_create(self):
        from opencode_adapters.edit_tools import EditFileTool
        tool = EditFileTool()
        with tempfile.NamedTemporaryFile(suffix=".txt", delete=False) as f:
            path = f.name
        Path(path).unlink()

        result = await tool.execute(filePath=path, oldString="", newString="hello world")
        assert result.success
        assert Path(path).read_text() == "hello world"
        Path(path).unlink()

    @pytest.mark.asyncio
    async def test_edit_file_replace(self):
        from opencode_adapters.edit_tools import EditFileTool
        tool = EditFileTool()
        with tempfile.NamedTemporaryFile(suffix=".txt", delete=False, mode="w") as f:
            f.write("foo bar baz")
            path = f.name

        result = await tool.execute(filePath=path, oldString="bar", newString="qux")
        assert result.success
        assert Path(path).read_text() == "foo qux baz"
        Path(path).unlink()

    @pytest.mark.asyncio
    async def test_write_file(self):
        from opencode_adapters.edit_tools import WriteFileTool
        tool = WriteFileTool()
        with tempfile.NamedTemporaryFile(suffix=".txt", delete=False) as f:
            path = f.name

        result = await tool.execute(filePath=path, content="new content")
        assert result.success
        assert Path(path).read_text() == "new content"
        Path(path).unlink()


# ---------------------------------------------------------------------------
# 4. MCP client
# ---------------------------------------------------------------------------

class TestMCPClient:
    """Test MCP manager and tool wrapper."""

    def test_mcp_manager_creation(self):
        from opencode_adapters.mcp_client import MCPManager
        mgr = MCPManager()
        assert mgr.get_status() == {}
        assert mgr.get_all_tools() == []

    @pytest.mark.asyncio
    async def test_mcp_manager_add_remove(self):
        from opencode_adapters.mcp_client import MCPManager, MCPServerConfig
        mgr = MCPManager()
        cfg = MCPServerConfig(name="test", type="remote", url="http://localhost:9999", enabled=False)
        await mgr.add_server(cfg)
        assert "test" in mgr.get_status()
        await mgr.remove_server("test")
        assert "test" not in mgr.get_status()

    def test_mcp_tool_wrapper_schema(self):
        from opencode_adapters.mcp_client import MCPToolWrapper, MCPToolDef, MCPConnection, MCPServerConfig
        cfg = MCPServerConfig(name="srv", type="local", command=["echo"])
        conn = MCPConnection(cfg)
        td = MCPToolDef(
            name="search",
            description="Search something",
            server_name="srv",
            input_schema={"properties": {"query": {"type": "string"}}},
        )
        wrapper = MCPToolWrapper(td, conn)
        assert wrapper.name == "srv_search"
        schema = wrapper.get_schema()
        assert "query" in schema["parameters"]


# ---------------------------------------------------------------------------
# 5. Unified skills
# ---------------------------------------------------------------------------

class TestUnifiedSkills:
    """Test unified skill discovery and injection."""

    def test_skill_tool_list(self):
        from opencode_adapters.unified_skills import UnifiedSkillInjector
        injector = UnifiedSkillInjector(secbot_dirs=["./packages/secbot-skills/skills"])
        skills = injector.list_skills()
        assert isinstance(skills, list)

    def test_skill_tool_schema(self):
        from opencode_adapters.unified_skills import SkillTool, UnifiedSkillInjector
        injector = UnifiedSkillInjector(secbot_dirs=["./packages/secbot-skills/skills"])
        tool = injector.create_skill_tool()
        schema = tool.get_schema()
        assert schema["name"] == "skill"
        assert "name" in schema["parameters"]


# ---------------------------------------------------------------------------
# 6. Feature flags
# ---------------------------------------------------------------------------

class TestFeatureFlags:
    """Test feature flag system."""

    def test_defaults_off(self):
        from hackbot_config.feature_flags import FeatureFlags
        flags = FeatureFlags()
        assert not flags.acp_enabled
        assert not flags.mcp_enabled
        assert not flags.unified_skills

    def test_all_enabled(self):
        from hackbot_config.feature_flags import FeatureFlags
        flags = FeatureFlags.all_enabled()
        assert flags.acp_enabled
        assert flags.mcp_enabled
        assert flags.unified_skills

    def test_from_env(self):
        from hackbot_config.feature_flags import FeatureFlags
        with patch.dict("os.environ", {"SECBOT_ACP_ENABLED": "true", "SECBOT_MCP_ENABLED": "0"}):
            flags = FeatureFlags.from_env()
            assert flags.acp_enabled
            assert not flags.mcp_enabled

    def test_get_flags_cached(self):
        from hackbot_config.feature_flags import get_flags, reset_flags
        reset_flags()
        f1 = get_flags()
        f2 = get_flags()
        assert f1 is f2
        reset_flags()


# ---------------------------------------------------------------------------
# 7. Permission model
# ---------------------------------------------------------------------------

class TestPermissions:
    """Test permission system."""

    def test_default_policies(self):
        from opencode_adapters.permissions import PermissionManager, PermissionCategory, PermissionDecision
        mgr = PermissionManager()
        assert mgr._policies[PermissionCategory.READ].default == PermissionDecision.ALLOW
        assert mgr._policies[PermissionCategory.EDIT].default == PermissionDecision.ASK

    @pytest.mark.asyncio
    async def test_allow_read(self):
        from opencode_adapters.permissions import (
            PermissionManager, PermissionRequest, PermissionCategory, PermissionDecision,
        )
        mgr = PermissionManager()
        req = PermissionRequest(
            id="r1", session_id="s1",
            category=PermissionCategory.READ,
            tool_name="read_file",
        )
        decision = await mgr.check(req)
        assert decision == PermissionDecision.ALLOW

    def test_categorize_tool(self):
        from opencode_adapters.permissions import categorize_tool, PermissionCategory
        assert categorize_tool("execute_command") == PermissionCategory.EXECUTE
        assert categorize_tool("system_control") == PermissionCategory.EDIT
        assert categorize_tool("unknown_tool") == PermissionCategory.READ
