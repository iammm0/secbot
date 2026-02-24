"""
系统路由 — 系统信息、系统状态
"""

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
    CpuInfo,
    MemoryInfo,
    DiskInfo,
)

router = APIRouter(prefix="/api/system", tags=["System"])


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


@router.get("/config/providers", response_model=ProviderListResponse, summary="列出需 API Key 的厂商及配置状态")
async def list_providers_api_key_status():
    """供 TUI 弹窗展示：哪些厂商需要 Key、是否已配置。"""
    try:
        from utils.model_selector import PROVIDER_REGISTRY, has_provider_api_key
        providers = [
            ProviderApiKeyStatus(
                id=p["id"],
                name=p["name"],
                needs_api_key=p.get("needs_api_key", False),
                configured=has_provider_api_key(p["id"]) if p.get("needs_api_key") else True,
            )
            for p in PROVIDER_REGISTRY
        ]
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
            return SetApiKeyResponse(success=True, message=f"已删除 {provider} 的 API Key")
        save_config_to_sqlite(
            f"{provider}_api_key",
            key,
            category="api_keys",
            description=f"{provider} API Key",
        )
        return SetApiKeyResponse(success=True, message=f"已保存 {provider} API Key")
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
