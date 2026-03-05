"""
数据库路由 — 统计、对话历史、清空
"""

from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from router.dependencies import get_db_manager
from router.schemas import (
    DbStatsResponse,
    ConversationRecord,
    DbHistoryResponse,
    DbClearResponse,
)

router = APIRouter(prefix="/api/db", tags=["Database"])


@router.get("/stats", response_model=DbStatsResponse, summary="数据库统计")
async def db_stats():
    """获取数据库各表的记录统计。"""
    try:
        dm = get_db_manager()
        stats = dm.get_stats()

        return DbStatsResponse(
            conversations=stats.get("conversations", 0),
            prompt_chains=stats.get("prompt_chains", 0),
            user_configs=stats.get("user_configs", 0),
            crawler_tasks=stats.get("crawler_tasks", 0),
            crawler_tasks_by_status=stats.get("crawler_tasks_by_status", {}),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取数据库统计失败: {e}")


@router.get("/history", response_model=DbHistoryResponse, summary="对话历史")
async def db_history(
    agent: Optional[str] = Query(None, description="智能体类型"),
    limit: int = Query(10, ge=1, le=100, description="返回数量"),
    session_id: Optional[str] = Query(None, description="会话ID"),
):
    """查看对话历史记录。"""
    try:
        dm = get_db_manager()
        conversations = dm.get_conversations(
            agent_type=agent,
            session_id=session_id,
            limit=limit,
        )

        records = []
        for conv in (conversations or []):
            timestamp = "N/A"
            if hasattr(conv, "timestamp") and conv.timestamp:
                timestamp = conv.timestamp.strftime("%Y-%m-%d %H:%M:%S")

            records.append(
                ConversationRecord(
                    timestamp=timestamp,
                    agent_type=getattr(conv, "agent_type", ""),
                    user_message=getattr(conv, "user_message", ""),
                    assistant_message=getattr(conv, "assistant_message", ""),
                )
            )

        return DbHistoryResponse(conversations=records)

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取对话历史失败: {e}")


@router.delete("/history", response_model=DbClearResponse, summary="清空对话历史")
async def db_clear(
    agent: Optional[str] = Query(None, description="智能体类型"),
    session_id: Optional[str] = Query(None, description="会话ID"),
):
    """清空对话历史记录。"""
    try:
        dm = get_db_manager()
        count = dm.delete_conversations(agent_type=agent, session_id=session_id)

        return DbClearResponse(
            success=True,
            deleted_count=count,
            message=f"已删除 {count} 条对话记录",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"清空对话历史失败: {e}")
