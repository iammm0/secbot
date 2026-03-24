"""
智能体路由 — 列表、清空记忆
"""

from fastapi import APIRouter, HTTPException

from router.dependencies import get_agents
from router.schemas import (
    AgentInfo,
    AgentListResponse,
    ClearMemoryRequest,
    ClearMemoryResponse,
)

router = APIRouter(prefix="/api/agents", tags=["Agents"])


@router.get("", response_model=AgentListResponse, summary="列出所有智能体")
async def list_agents():
    """列出所有可用的智能体类型及说明。"""
    agent_descriptions = {
        "secbot-cli": ("Hackbot", "自动模式（ReAct，基础扫描，全自动）"),
        "superhackbot": ("SuperHackbot", "专家模式（ReAct，全工具，敏感操作需确认）"),
    }

    agents_list = []
    for agent_type in get_agents().keys():
        name, desc = agent_descriptions.get(agent_type, (agent_type, ""))
        agents_list.append(AgentInfo(type=agent_type, name=name, description=desc))

    return AgentListResponse(agents=agents_list)


@router.post("/clear", response_model=ClearMemoryResponse, summary="清空对话记忆")
async def clear_memory(request: ClearMemoryRequest):
    """清空指定智能体的对话记忆，不指定则清空所有。"""
    agents_map = get_agents()

    if request.agent:
        if request.agent not in agents_map:
            raise HTTPException(
                status_code=400,
                detail=f"未知的智能体类型 '{request.agent}'，可选: {', '.join(agents_map.keys())}",
            )
        agents_map[request.agent].clear_memory()
        return ClearMemoryResponse(
            success=True,
            message=f"已清空智能体 '{request.agent}' 的记忆",
        )
    else:
        for agent_instance in agents_map.values():
            agent_instance.clear_memory()
        return ClearMemoryResponse(
            success=True,
            message="已清空所有智能体的记忆",
        )
