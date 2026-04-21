"""
Memory REST API — 与 npm-release 的 MemoryController 对齐
暴露 /api/memory 系列端点，对接 MemoryManager 和 VectorStoreManager
"""

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from router.dependencies import get_memory_manager, get_vector_store_manager
from secbot_agent.core.context_assembler import text_to_vector, VECTOR_DIMENSION

router = APIRouter(prefix="/api/memory", tags=["Memory"])


class RememberRequest(BaseModel):
    content: str
    memory_type: str = "short_term"
    importance: float = 0.5
    metadata: Dict[str, Any] = {}


class RecallRequest(BaseModel):
    query: str = ""
    memory_type: Optional[str] = None
    limit: int = 10


class VectorAddRequest(BaseModel):
    content: str
    collection: str = "episodic"
    metadata: Dict[str, Any] = {}


class VectorSearchRequest(BaseModel):
    query: str
    collection: str = "episodic"
    limit: int = 10


@router.post("/remember", summary="添加记忆")
async def remember(body: RememberRequest):
    mgr = get_memory_manager()
    await mgr.remember(
        body.content, body.memory_type, body.importance, **body.metadata
    )
    return {"ok": True}


@router.post("/recall", summary="召回记忆")
async def recall(body: RecallRequest):
    mgr = get_memory_manager()
    items = await mgr.recall(body.query, body.memory_type, body.limit)
    return {
        "items": [
            {
                "id": item.id,
                "content": item.content,
                "type": item.type,
                "importance": item.importance,
                "created_at": item.created_at,
                "metadata": item.metadata,
            }
            for item in items
        ]
    }


@router.get("/context", summary="获取 agent 上下文记忆")
async def context(query: str = ""):
    mgr = get_memory_manager()
    ctx = await mgr.get_context_for_agent(query)
    return {"context": ctx}


@router.get("/stats", summary="获取记忆统计")
async def stats():
    mgr = get_memory_manager()
    mem_stats = mgr.get_stats()
    vsm = get_vector_store_manager()
    vec_stats = vsm.get_stats()
    return {"memory": mem_stats, "vector": vec_stats}


@router.post("/clear", summary="清空所有记忆")
async def clear():
    mgr = get_memory_manager()
    await mgr.clear_all()
    return {"ok": True}


@router.get("/list", summary="列出记忆")
async def list_memories(
    memory_type: Optional[str] = None,
    limit: int = 20,
):
    mgr = get_memory_manager()
    if memory_type == "short_term":
        items = await mgr.short_term.get(limit)
    elif memory_type == "episodic":
        items = await mgr.episodic.get(limit)
    elif memory_type == "long_term":
        items = await mgr.long_term.get(limit)
    else:
        st = await mgr.short_term.get(limit)
        ep = await mgr.episodic.get(limit)
        lt = await mgr.long_term.get(limit)
        items = st + ep + lt
    return {
        "items": [
            {
                "id": item.id,
                "content": item.content,
                "type": item.type,
                "importance": item.importance,
                "created_at": item.created_at,
            }
            for item in items[:limit]
        ]
    }


@router.post("/vector/add", summary="添加向量记忆")
async def vector_add(body: VectorAddRequest):
    vsm = get_vector_store_manager()
    vec = text_to_vector(body.content)
    item_id = await vsm.add_memory(
        content=body.content,
        vector=vec,
        memory_type=body.collection,
        metadata=body.metadata,
    )
    return {"id": item_id}


@router.post("/vector/search", summary="向量搜索")
async def vector_search(body: VectorSearchRequest):
    vsm = get_vector_store_manager()
    vec = text_to_vector(body.query)
    store = vsm.get_store(body.collection, VECTOR_DIMENSION)
    results = store.search(vec, limit=body.limit, collection=body.collection, threshold=0.3)
    return {
        "results": [
            {
                "id": item.id,
                "content": item.content,
                "similarity": round(sim, 4),
                "metadata": item.metadata,
            }
            for item, sim in results
        ]
    }


@router.get("/vector/stats", summary="向量存储统计")
async def vector_stats():
    vsm = get_vector_store_manager()
    return vsm.get_stats()
