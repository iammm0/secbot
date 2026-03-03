"""
会话列表路由 — GET /api/sessions
当前后端为无状态（每次请求独立 SessionManager），无持久会话存储；
此接口返回空列表及说明，供 TUI /sessions 斜杠命令展示，避免 404。
"""

from fastapi import APIRouter

router = APIRouter(prefix="/api/sessions", tags=["Sessions"])


@router.get("", summary="会话列表")
async def list_sessions():
    """
    返回会话列表。当前实现为无状态，会话由 TUI 本地管理，此处返回空列表。
    """
    return {
        "sessions": [],
        "note": "当前后端为无状态，会话由 TUI 本地管理。",
    }
