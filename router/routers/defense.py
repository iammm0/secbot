"""
防御路由 — 安全扫描、监控状态、封禁IP管理、报告
"""

from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from router.dependencies import get_defense_manager
from router.schemas import (
    DefenseScanResponse,
    DefenseStatusResponse,
    BlockedIpsResponse,
    UnblockRequest,
    UnblockResponse,
    DefenseReportResponse,
)

router = APIRouter(prefix="/api/defense", tags=["Defense"])


@router.post("/scan", response_model=DefenseScanResponse, summary="执行安全扫描")
async def defense_scan():
    """执行完整的安全扫描，返回扫描报告。"""
    try:
        dm = get_defense_manager()
        report = await dm.full_scan()
        return DefenseScanResponse(success=True, report=report)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"安全扫描错误: {e}")


@router.get("/status", response_model=DefenseStatusResponse, summary="防御系统状态")
async def defense_status():
    """获取防御系统当前状态。"""
    try:
        dm = get_defense_manager()
        status = dm.get_status()
        return DefenseStatusResponse(
            monitoring=status.get("monitoring", False),
            auto_response=status.get("auto_response", False),
            blocked_ips=status.get("blocked_ips", 0),
            vulnerabilities=status.get("vulnerabilities", 0),
            detected_attacks=status.get("detected_attacks", 0),
            malicious_ips=status.get("malicious_ips", 0),
            statistics=status.get("statistics", {}),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取防御状态失败: {e}")


@router.get("/blocked", response_model=BlockedIpsResponse, summary="封禁IP列表")
async def defense_blocked():
    """列出当前被封禁的 IP 地址。"""
    try:
        dm = get_defense_manager()
        blocked = dm.get_blocked_ips()
        return BlockedIpsResponse(blocked_ips=blocked)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取封禁列表失败: {e}")


@router.post("/unblock", response_model=UnblockResponse, summary="解封IP")
async def defense_unblock(request: UnblockRequest):
    """解封指定的 IP 地址。"""
    try:
        dm = get_defense_manager()
        success = dm.unblock_ip(request.ip)
        if success:
            return UnblockResponse(success=True, message=f"已解封 IP: {request.ip}")
        else:
            return UnblockResponse(success=False, message=f"解封失败或 IP 未封禁: {request.ip}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"解封操作失败: {e}")


@router.get("/report", response_model=DefenseReportResponse, summary="生成防御报告")
async def defense_report(
    type: str = Query("vulnerability", description="报告类型 (full/vulnerability/attack)"),
):
    """生成防御报告。注意: full 类型需先执行扫描。"""
    try:
        dm = get_defense_manager()

        if type == "full":
            return DefenseReportResponse(
                success=False,
                report={"message": "完整报告需要先执行扫描，请调用 POST /api/defense/scan"},
            )

        report = dm.generate_report(report_type=type)
        return DefenseReportResponse(success=True, report=report)

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"生成报告错误: {e}")
