"""
系统路由 — 系统信息、系统状态
"""

import asyncio
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
    OllamaModelsResponse,
    OllamaModelItem,
    CpuInfo,
    MemoryInfo,
    DiskInfo,
)

router = APIRouter(prefix="/api/system", tags=["System"])
_ollama_pulling: set = set()  # 正在后台拉取的 Ollama 模型名，避免重复触发


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
    """返回当前 LLM 后端与模型配置，供 TUI /model 等使用。"""
    try:
        from hackbot_config import settings
        return SystemConfigResponse(
            llm_provider=settings.llm_provider,
            ollama_model=settings.ollama_model,
            ollama_base_url=settings.ollama_base_url,
            deepseek_model=getattr(settings, "deepseek_model", None),
            deepseek_base_url=getattr(settings, "deepseek_base_url", None),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取配置失败: {e}")


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
    """设置厂商 API Key；若 api_key 为空则删除。"""
    try:
        from hackbot_config import save_config_to_sqlite, delete_provider_api_key
        provider = (body.provider or "").strip().lower()
        if not provider:
            return SetApiKeyResponse(success=False, message="provider 不能为空")
        key = (body.api_key or "").strip()
        if not key:
            delete_provider_api_key(provider)
            msg = f"已删除 {provider} 的 API Key"
        else:
            save_config_to_sqlite(
                f"{provider}_api_key",
                key,
                category="api_keys",
                description=f"{provider} API Key",
            )
            msg = f"已保存 {provider} API Key"

        # 若同时携带 base_url，则一并处理（主要用于 OpenAI 兼容中转等）
        if body.base_url is not None:
            base = (body.base_url or "").strip()
            save_config_to_sqlite(
                f"{provider}_base_url",
                base,
                category="api_keys",
                description=f"{provider} Base URL",
            )
            if base:
                msg += "，并已更新 Base URL"
            else:
                msg += "，并已清除自定义 Base URL"

        return SetApiKeyResponse(success=True, message=msg)
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
