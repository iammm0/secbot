"""
安全测试工具路由 — 列出 Secbot 集成的安全测试工具
"""

from fastapi import APIRouter

from tools.pentest.security import ALL_SECURITY_TOOLS

router = APIRouter(prefix="/api/tools", tags=["Tools"])


@router.get("", summary="列出安全测试工具")
async def list_tools():
    """列出 Secbot 中集成的全部安全测试工具（名称与描述）。"""
    return {
        "tools": [
            {"name": t.name, "description": t.description}
            for t in ALL_SECURITY_TOOLS
        ],
    }
