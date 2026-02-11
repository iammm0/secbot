"""
系统路由 — 系统信息、系统状态
"""

from fastapi import APIRouter, HTTPException

from router.dependencies import get_os_controller, get_os_detector
from router.schemas import (
    SystemInfoResponse,
    SystemStatusResponse,
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
