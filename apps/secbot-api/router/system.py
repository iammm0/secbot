"""
系统路由 — 系统信息、系统状态
"""

import asyncio
import json
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, HTTPException

from router.dependencies import get_os_controller, get_os_detector
from router.schemas import (
    SystemInfoResponse,
    SystemConfigResponse,
    SystemStatusResponse,
    ProviderApiKeyStatus,
    ProviderListResponse,
    SetApiKeyRequest,
    SetApiKeyResponse,
    SetProviderRequest,
    SetProviderSettingsRequest,
    ProviderSettingsResponse,
    OllamaModelsResponse,
    OllamaModelItem,
    CpuInfo,
    MemoryInfo,
    DiskInfo,
    LogLevelResponse,
    SetLogLevelRequest,
    MCPAddRequest,
)
from utils.logger import set_log_level, get_runtime_log_level, logger

router = APIRouter(prefix="/api/system", tags=["System"])
_ollama_pulling: set = set()  # 正在后台拉取的 Ollama 模型名，避免重复触发


def _format_bool(v: bool) -> str:
    return "on" if v else "off"


@router.get("/info", response_model=SystemInfoResponse, summary="系统信息")
async def system_info():
    """获取操作系统、架构、Python 版本等基本信息。"""
    try:
        detector = get_os_detector()
        info = detector.detect()
        return SystemInfoResponse(
            os_type=info.os_type,
            os_name=info.os_name,
            os_version=info.os_version,
            os_release=info.os_release,
            architecture=info.architecture,
            processor=info.processor,
            python_version=info.python_version,
            hostname=info.hostname,
            username=info.username,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取系统信息失败: {e}")


@router.get("/config", response_model=SystemConfigResponse, summary="推理/模型配置")
async def system_config():
    """返回当前 LLM 后端与模型配置，供 TUI /model 等使用（含 SQLite 持久化后的生效值）。"""
    try:
        from hackbot_config import settings, get_provider_model, get_provider_base_url
        # 优先返回 SQLite/环境变量中该厂商的生效值，便于 TUI 展示与编辑后回显
        ollama_model = get_provider_model("ollama") or settings.ollama_model
        ollama_base_url = (get_provider_base_url("ollama") or settings.ollama_base_url).rstrip("/")
        deepseek_model = get_provider_model("deepseek") or getattr(settings, "deepseek_model", None)
        deepseek_base_url = get_provider_base_url("deepseek") or getattr(settings, "deepseek_base_url", None)
        if deepseek_base_url:
            deepseek_base_url = deepseek_base_url.rstrip("/")
        current_provider_model = get_provider_model(settings.llm_provider)
        current_provider_base_url = get_provider_base_url(settings.llm_provider)
        if current_provider_base_url:
            current_provider_base_url = current_provider_base_url.rstrip("/")
        return SystemConfigResponse(
            llm_provider=settings.llm_provider,
            ollama_model=ollama_model,
            ollama_base_url=ollama_base_url,
            deepseek_model=deepseek_model,
            deepseek_base_url=deepseek_base_url or None,
            current_provider_model=current_provider_model,
            current_provider_base_url=current_provider_base_url or None,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取配置失败: {e}")


@router.get("/config/provider/{provider_id}", response_model=ProviderSettingsResponse, summary="获取指定厂商的模型与 Base URL")
async def get_provider_settings(provider_id: str):
    """供「已配置的推理后端」进入详情时拉取该厂商的 model、base_url。"""
    try:
        from utils.model_selector import get_provider_config
        from hackbot_config import get_provider_model, get_provider_base_url

        pid = (provider_id or "").strip().lower()
        if not pid:
            raise HTTPException(status_code=400, detail="provider_id 不能为空")
        if get_provider_config(pid) is None:
            raise HTTPException(status_code=404, detail=f"不支持的推理后端: {pid}")
        model = get_provider_model(pid)
        base_url = get_provider_base_url(pid)
        if base_url:
            base_url = base_url.rstrip("/")
        return ProviderSettingsResponse(provider=pid, model=model, base_url=base_url or None)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/ollama-models", response_model=OllamaModelsResponse, summary="Ollama 本地/在线可用模型列表")
async def list_ollama_models(base_url: Optional[str] = None):
    """
    当用户使用 Ollama 时，自动列出本地（及在线）可用模型，等价于执行 ollama list。
    使用当前配置的 OLLAMA_BASE_URL，或通过 query 参数 base_url 覆盖。
    先通过 check_ollama_running(url) 检查本地 Ollama 是否可达，不可达则返回 error 不拉取列表。
    """
    try:
        from hackbot_config import settings
        from utils.model_selector import get_ollama_models_detail, check_ollama_running

        url = (base_url or getattr(settings, "ollama_base_url", "") or "").strip().rstrip("/") or "http://localhost:11434"
        if not check_ollama_running(url):
            return OllamaModelsResponse(
                models=[],
                base_url=url,
                error="无法连接 Ollama 服务，请确认已启动 Ollama（ollama serve 或打开 Ollama 应用）。",
            )
        from utils.model_selector import pull_ollama_model

        detail = get_ollama_models_detail(url)
        model_names = {m["name"] for m in detail}
        default_model = (getattr(settings, "ollama_model", None) or "").strip()
        pulling_model = None
        if default_model and default_model not in model_names:
            if default_model not in _ollama_pulling:
                _ollama_pulling.add(default_model)

                async def _do_pull():
                    try:
                        await asyncio.to_thread(pull_ollama_model, default_model, url)
                    finally:
                        _ollama_pulling.discard(default_model)

                asyncio.create_task(_do_pull())
            pulling_model = default_model
        return OllamaModelsResponse(
            models=[
                OllamaModelItem(
                    name=m["name"],
                    size=m.get("size"),
                    modified_at=m.get("modified_at"),
                    parameter_size=m.get("parameter_size"),
                    family=m.get("family"),
                )
                for m in detail
            ],
            base_url=url,
            pulling_model=pulling_model,
        )
    except Exception as e:
        from hackbot_config import settings
        return OllamaModelsResponse(
            models=[],
            base_url=getattr(settings, "ollama_base_url", "http://localhost:11434"),
            error=str(e),
        )


@router.get("/config/providers", response_model=ProviderListResponse, summary="列出需 API Key 的厂商及配置状态")
async def list_providers_api_key_status():
    """供 TUI 弹窗展示：哪些厂商需要 Key、是否已配置。"""
    try:
        from utils.model_selector import PROVIDER_REGISTRY, has_provider_api_key
        from hackbot_config import get_provider_base_url

        providers = []
        for p in PROVIDER_REGISTRY:
            pid = p["id"]
            needs_api_key = p.get("needs_api_key", False)
            needs_base_url = p.get("needs_base_url", False)
            has_key = has_provider_api_key(pid) if needs_api_key else True
            base = get_provider_base_url(pid) if needs_base_url else None
            providers.append(
                ProviderApiKeyStatus(
                    id=pid,
                    name=p["name"],
                    needs_api_key=needs_api_key,
                    configured=has_key,
                    needs_base_url=needs_base_url,
                    has_base_url=bool(base) if needs_base_url else True,
                )
            )

        return ProviderListResponse(providers=providers)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/config/api-key", response_model=SetApiKeyResponse, summary="设置或删除 API Key")
async def set_api_key(body: SetApiKeyRequest):
    """设置厂商 API Key（空则删除）；可单独或同时提交 base_url（needs_base_url 的厂商）。"""
    try:
        from hackbot_config import save_config_to_sqlite, delete_provider_api_key
        provider = (body.provider or "").strip().lower()
        if not provider:
            return SetApiKeyResponse(success=False, message="provider 不能为空")
        key = (body.api_key or "").strip()
        only_update_base_url = not key and body.base_url is not None
        msg = ""
        if not key and not only_update_base_url:
            delete_provider_api_key(provider)
            msg = f"已删除 {provider} 的 API Key"
        elif key:
            save_config_to_sqlite(
                f"{provider}_api_key",
                key,
                category="api_keys",
                description=f"{provider} API Key",
            )
            msg = f"已保存 {provider} API Key"

        # 若携带 base_url，则更新 Base URL（第二步仅提交 base_url 时不删 Key）
        if body.base_url is not None:
            base = (body.base_url or "").strip()
            save_config_to_sqlite(
                f"{provider}_base_url",
                base,
                category="api_keys",
                description=f"{provider} Base URL",
            )
            if base:
                msg = msg + "，并已更新 Base URL" if msg else "已更新 Base URL"
            else:
                msg = msg + "，并已清除自定义 Base URL" if msg else "已清除自定义 Base URL"

        return SetApiKeyResponse(success=True, message=msg or "已保存")
    except Exception as e:
        return SetApiKeyResponse(success=False, message=str(e))


@router.post("/config/provider", response_model=SetApiKeyResponse, summary="设置当前默认推理后端")
async def set_provider(body: SetProviderRequest):
    """切换默认推理后端，写入 SQLite，下次请求生效。"""
    try:
        from utils.model_selector import get_provider_config
        from hackbot_config import save_llm_provider

        provider = (body.llm_provider or "").strip().lower()
        if not provider:
            return SetApiKeyResponse(success=False, message="llm_provider 不能为空")
        config = get_provider_config(provider)
        if not config:
            return SetApiKeyResponse(success=False, message=f"不支持的推理后端: {provider}")
        save_llm_provider(provider)
        return SetApiKeyResponse(success=True, message=f"已切换默认推理后端为 {config.get('name', provider)}")
    except Exception as e:
        return SetApiKeyResponse(success=False, message=str(e))


@router.post("/config/provider-settings", response_model=SetApiKeyResponse, summary="更新厂商默认模型或 Base URL")
async def set_provider_settings(body: SetProviderSettingsRequest):
    """更新指定厂商的默认模型、Base URL（写入 SQLite），不涉及 API Key。"""
    try:
        from utils.model_selector import get_provider_config
        from hackbot_config import save_config_to_sqlite

        provider = (body.provider or "").strip().lower()
        if not provider:
            return SetApiKeyResponse(success=False, message="provider 不能为空")
        if get_provider_config(provider) is None:
            return SetApiKeyResponse(success=False, message=f"不支持的推理后端: {provider}")
        parts = []
        if body.model is not None:
            save_config_to_sqlite(
                f"{provider}_model",
                body.model.strip(),
                category="user_preference",
                description=f"{provider} 默认模型",
            )
            parts.append("默认模型")
        if body.base_url is not None:
            val = body.base_url.strip()
            save_config_to_sqlite(
                f"{provider}_base_url",
                val,
                category="api_keys",
                description=f"{provider} Base URL",
            )
            parts.append("API 地址" if val else "清除 API 地址")
        if not parts:
            return SetApiKeyResponse(success=False, message="请提供 model 或 base_url")
        return SetApiKeyResponse(success=True, message=f"已更新 {provider} 的 {'、'.join(parts)}")
    except Exception as e:
        return SetApiKeyResponse(success=False, message=str(e))


@router.get("/status", response_model=SystemStatusResponse, summary="系统状态")
async def system_status():
    """获取 CPU、内存、磁盘实时状态。"""
    try:
        controller = get_os_controller()

        # CPU
        cpu = None
        cpu_info = controller.execute("get_cpu_info")
        if cpu_info["success"]:
            c = cpu_info["result"]
            cpu = CpuInfo(
                count=c.get("count"),
                percent=c.get("percent", 0),
                freq_current=c.get("freq", {}).get("current"),
            )

        # 内存
        memory = None
        mem_info = controller.execute("get_memory_info")
        if mem_info["success"]:
            m = mem_info["result"]
            memory = MemoryInfo(
                total_gb=round(m.get("total", 0) / (1024 ** 3), 2),
                used_gb=round(m.get("used", 0) / (1024 ** 3), 2),
                available_gb=round(m.get("available", 0) / (1024 ** 3), 2),
                percent=m.get("percent", 0),
            )

        # 磁盘
        disks = []
        disk_info = controller.execute("get_disk_info")
        if disk_info["success"]:
            for d in disk_info["result"][:10]:
                disks.append(
                    DiskInfo(
                        device=d.get("device", "N/A"),
                        mountpoint=d.get("mountpoint", "N/A"),
                        total_gb=round(d.get("total", 0) / (1024 ** 3), 2),
                        used_gb=round(d.get("used", 0) / (1024 ** 3), 2),
                        percent=d.get("percent", 0),
                    )
                )

        return SystemStatusResponse(cpu=cpu, memory=memory, disks=disks)

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取系统状态失败: {e}")


@router.get("/log-level", response_model=LogLevelResponse, summary="获取日志级别")
async def get_log_level_config():
    try:
        return LogLevelResponse(level=get_runtime_log_level())
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取日志级别失败: {e}")


@router.post("/log-level", response_model=SetApiKeyResponse, summary="设置日志级别")
async def set_log_level_config(body: SetLogLevelRequest):
    try:
        from hackbot_config import save_log_level

        target = (body.level or "").strip().upper()
        if target not in {"DEBUG", "INFO"}:
            return SetApiKeyResponse(success=False, message="仅支持 DEBUG 或 INFO")

        if not save_log_level(target):
            return SetApiKeyResponse(success=False, message="持久化日志级别失败")

        applied = set_log_level(target, console_verbose=True)
        logger.bind(event="log_level").info(f"日志级别已切换为 {applied}")
        return SetApiKeyResponse(success=True, message=f"日志级别已切换为 {applied}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"设置日志级别失败: {e}")


@router.get("/opencode/capabilities", summary="opencode 兼容能力总览")
async def opencode_capabilities():
    """供 TUI 斜杠命令展示当前 opencode 兼容能力。"""
    from hackbot_config.feature_flags import get_flags

    flags = get_flags()
    return {
        "capabilities": {
            "acp_gateway": True,
            "mcp_adapter": True,
            "plan_ask_agent_modes": True,
            "permissions_model": True,
            "unified_skills": True,
            "opencode_config_compat": True,
        },
        "feature_flags": {
            "SECBOT_ACP_ENABLED": _format_bool(flags.acp_enabled),
            "SECBOT_MCP_ENABLED": _format_bool(flags.mcp_enabled),
            "SECBOT_UNIFIED_SKILLS": _format_bool(flags.unified_skills),
            "SECBOT_EDIT_TOOLS": _format_bool(flags.edit_tools),
            "SECBOT_PLAN_MODE": _format_bool(flags.plan_mode),
            "SECBOT_PERMISSIONS": _format_bool(flags.permissions),
        },
        "tui_switchable_modes": ["ask", "agent"],
        "acp_modes": ["agent", "plan", "ask"],
        "acp_gateway_entry": "python -m opencode_gateway.main",
    }


@router.get("/opencode/acp", summary="ACP 网关能力与方法")
async def opencode_acp_status():
    return {
        "gateway_module": "opencode_gateway.main",
        "transport": "ND-JSON over stdio",
        "methods": [
            "initialize",
            "session/new",
            "session/load",
            "session/prompt",
            "session/setMode",
            "session/list",
            "mcp/status",
            "mcp/add",
            "session/cancel",
        ],
    }


@router.get("/opencode/mcp", summary="MCP 配置与服务列表")
async def opencode_mcp_status():
    from hackbot_config.mcp_config import load_mcp_configs

    raw = load_mcp_configs()
    servers = []
    for name, cfg in raw.items():
        servers.append(
            {
                "name": name,
                "type": cfg.get("type", "local"),
                "enabled": bool(cfg.get("enabled", True)),
                "timeout": int(cfg.get("timeout", 30)),
                "has_command": bool(cfg.get("command")),
                "url": cfg.get("url"),
            }
        )
    return {"count": len(servers), "servers": servers}


@router.post("/opencode/mcp/add", response_model=SetApiKeyResponse, summary="添加 MCP 服务到 opencode.json")
async def opencode_mcp_add(body: MCPAddRequest):
    try:
        root = Path.cwd()
        cfg_path = root / "opencode.json"
        if cfg_path.exists():
            data = json.loads(cfg_path.read_text(encoding="utf-8"))
        else:
            data = {}
        if not isinstance(data, dict):
            data = {}
        mcp = data.get("mcp")
        if not isinstance(mcp, dict):
            mcp = {}
        name = body.name.strip()
        if not name:
            return SetApiKeyResponse(success=False, message="name 不能为空")
        if body.type == "local":
            if not body.command:
                return SetApiKeyResponse(success=False, message="local 类型必须提供 command")
            mcp[name] = {
                "type": "local",
                "command": body.command,
                "environment": body.environment or {},
                "enabled": body.enabled,
                "timeout": body.timeout,
            }
        else:
            if not body.url:
                return SetApiKeyResponse(success=False, message="remote 类型必须提供 url")
            mcp[name] = {
                "type": "remote",
                "url": body.url,
                "headers": body.headers or {},
                "enabled": body.enabled,
                "timeout": body.timeout,
            }
        data["mcp"] = mcp
        cfg_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        return SetApiKeyResponse(success=True, message=f"已写入 {cfg_path.name}：{name}")
    except Exception as e:
        return SetApiKeyResponse(success=False, message=str(e))


@router.get("/opencode/skills", summary="统一技能发现状态")
async def opencode_skills_status():
    from opencode_adapters.unified_skills import UnifiedSkillInjector

    injector = UnifiedSkillInjector()
    items = injector.list_skills()
    return {
        "count": len(items),
        "skills": items[:30],
        "truncated": len(items) > 30,
    }


@router.get("/opencode/permissions", summary="权限策略状态")
async def opencode_permissions_status():
    from opencode_adapters.permissions import PermissionManager

    mgr = PermissionManager()
    policies = {}
    for cat, policy in mgr._policies.items():  # noqa: SLF001 - 调试/展示用途
        policies[cat.value] = {
            "default": policy.default.value,
            "always_allow": sorted(list(policy.always_allow)),
            "always_deny": sorted(list(policy.always_deny)),
        }
    return {"policies": policies}
