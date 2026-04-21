"""
网络路由 — 内网发现、目标管理、授权管理
"""


from fastapi import APIRouter, HTTPException, Query

from router.dependencies import get_main_controller
from router.schemas import (
    DiscoverRequest,
    DiscoverResponse,
    HostInfo,
    TargetListResponse,
    AuthorizeRequest,
    AuthorizeResponse,
    AuthorizationInfo,
    AuthorizationListResponse,
    RevokeResponse,
)

router = APIRouter(prefix="/api/network", tags=["Network"])


@router.post("/discover", response_model=DiscoverResponse, summary="内网发现")
async def discover(request: DiscoverRequest):
    """发现内网中所有在线主机。"""
    try:
        mc = get_main_controller()
        hosts = await mc.discover_network(request.network)

        host_list = []
        for h in (hosts or []):
            host_list.append(
                HostInfo(
                    ip=h["ip"],
                    hostname=h.get("hostname", "Unknown"),
                    mac_address=h.get("mac_address", "Unknown"),
                    open_ports=h.get("open_ports", []),
                    authorized=h.get("authorized", False),
                )
            )

        return DiscoverResponse(success=True, hosts=host_list)

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"内网发现错误: {e}")


@router.get("/targets", response_model=TargetListResponse, summary="列出目标")
async def list_targets(
    authorized_only: bool = Query(False, description="仅显示已授权的目标"),
):
    """列出所有已发现的目标主机。"""
    try:
        mc = get_main_controller()
        targets = mc.get_targets(authorized_only=authorized_only)

        target_list = []
        for t in (targets or []):
            target_list.append(
                HostInfo(
                    ip=t["ip"],
                    hostname=t.get("hostname", "Unknown"),
                    mac_address=t.get("mac_address", "Unknown"),
                    open_ports=t.get("open_ports", []),
                    authorized=t.get("authorized", False),
                )
            )

        return TargetListResponse(targets=target_list)

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取目标列表失败: {e}")


@router.post("/authorize", response_model=AuthorizeResponse, summary="授权目标")
async def authorize(request: AuthorizeRequest):
    """授权目标主机。"""
    try:
        mc = get_main_controller()

        credentials = {"username": request.username}
        if request.password:
            credentials["password"] = request.password
        if request.key_file:
            credentials["key_file"] = request.key_file

        success = mc.authorize_target(
            target_ip=request.target_ip,
            auth_type=request.auth_type,
            credentials=credentials,
            description=request.description,
        )

        if success:
            return AuthorizeResponse(success=True, message=f"已授权目标: {request.target_ip}")
        else:
            return AuthorizeResponse(success=False, message="授权失败")

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"授权错误: {e}")


@router.get("/authorizations", response_model=AuthorizationListResponse, summary="列出所有授权")
async def list_authorizations():
    """列出所有活跃的授权记录。"""
    try:
        mc = get_main_controller()
        auths = mc.auth_manager.list_authorizations(status="active")

        auth_list = []
        for a in (auths or []):
            username = a.get("credentials", {}).get("username", "N/A")
            created = a.get("created_at", "N/A")
            if created and len(created) > 19:
                created = created[:19]

            auth_list.append(
                AuthorizationInfo(
                    target_ip=a["target_ip"],
                    auth_type=a.get("auth_type", "N/A"),
                    username=username,
                    created_at=created or "N/A",
                    description=a.get("description", "")[:50] or "N/A",
                )
            )

        return AuthorizationListResponse(authorizations=auth_list)

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取授权列表失败: {e}")


@router.delete("/authorize/{target_ip}", response_model=RevokeResponse, summary="撤销授权")
async def revoke_authorization(target_ip: str):
    """撤销指定目标的授权。"""
    try:
        mc = get_main_controller()
        success = mc.auth_manager.revoke_authorization(target_ip)

        if success:
            return RevokeResponse(success=True, message=f"已撤销授权: {target_ip}")
        else:
            return RevokeResponse(success=False, message=f"授权不存在或撤销失败: {target_ip}")

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"撤销授权错误: {e}")
