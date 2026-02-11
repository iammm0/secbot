"""
聊天路由 — 使用 Interaction 编排（SessionManager + EventBus）的 SSE 流式接口
"""

import asyncio
import json
import traceback
from typing import AsyncGenerator

from fastapi import APIRouter, HTTPException
from rich.console import Console
from sse_starlette.sse import EventSourceResponse

from router.dependencies import (
    get_agent,
    get_agents,
    get_planner_agent,
    get_qa_agent,
    get_summary_agent,
)
from router.schemas import ChatRequest, ChatResponse
from core.session import SessionManager
from utils.event_bus import EventBus, EventType, Event

router = APIRouter(prefix="/api/chat", tags=["Chat"])


def _event_to_sse(event: Event) -> tuple[str, dict] | None:
    """将 EventBus 事件映射为前端 SSE 的 (event_name, data)。"""
    t, d = event.type, event.data
    if t == EventType.PLAN_START:
        return (
            "planning",
            {
                "content": d.get("summary", ""),
                "todos": d.get("todos", []),
            },
        )
    if t == EventType.THINK_START:
        return ("thought_start", {"iteration": d.get("iteration", 1)})
    if t == EventType.THINK_CHUNK:
        return (
            "thought_chunk",
            {"chunk": d.get("chunk", ""), "iteration": d.get("iteration", 1)},
        )
    if t == EventType.THINK_END:
        return (
            "thought",
            {"content": d.get("thought", ""), "iteration": d.get("iteration", 1)},
        )
    if t == EventType.EXEC_START:
        return (
            "action_start",
            {
                "tool": d.get("tool", ""),
                "params": d.get("params", {}),
                "iteration": d.get("iteration", 1),
            },
        )
    if t == EventType.EXEC_RESULT:
        return (
            "action_result",
            {
                "tool": d.get("tool", ""),
                "success": d.get("success", True),
                "result": d.get("result"),
                "error": d.get("error", ""),
                "iteration": d.get("iteration", 1),
            },
        )
    if t == EventType.CONTENT:
        return ("content", {"content": d.get("content", "")})
    if t == EventType.REPORT_END:
        return ("report", {"content": d.get("report", "")})
    if t == EventType.TASK_PHASE:
        return ("phase", {"phase": d.get("phase", ""), "detail": d.get("detail", "")})
    if t == EventType.ERROR:
        return ("error", {"error": d.get("error", "")})
    return None


async def _interaction_event_generator(
    request: ChatRequest,
) -> AsyncGenerator[dict, None]:
    """
    使用 SessionManager.handle_message（Interaction 编排）驱动流式输出。
    先立即发送 connected，再做初始化与编排，避免客户端一直卡在「连接中」。
    """
    # 先发送首包，让前端尽快收到「已连接」、脱离「连接中」状态
    yield {
        "event": "connected",
        "data": json.dumps({"message": "stream started"}, ensure_ascii=False),
    }

    queue: asyncio.Queue = asyncio.Queue()
    event_bus = EventBus()
    console = Console(force_terminal=False)

    def on_bus_event(event: Event):
        mapped = _event_to_sse(event)
        if mapped:
            sse_name, sse_data = mapped
            queue.put_nowait({"event": sse_name, "data": sse_data})

    for et in (
        EventType.PLAN_START,
        EventType.THINK_START,
        EventType.THINK_CHUNK,
        EventType.THINK_END,
        EventType.EXEC_START,
        EventType.EXEC_RESULT,
        EventType.CONTENT,
        EventType.REPORT_END,
        EventType.TASK_PHASE,
        EventType.ERROR,
    ):
        event_bus.subscribe(et, on_bus_event)

    session_manager = SessionManager(
        event_bus=event_bus,
        console=console,
        agents=get_agents(),
        planner=get_planner_agent(),
        qa_agent=get_qa_agent(),
        summary_agent=get_summary_agent(),
    )

    force_qa = request.mode == "ask"
    plan_only = request.mode == "plan"
    agent_type = request.agent if request.mode == "agent" else None
    if agent_type and request.prompt:
        agent_instance = get_agent(agent_type)
        agent_instance.update_system_prompt(request.prompt)

    final_response: list[str] = []

    async def _run_interaction():
        try:
            response = await session_manager.handle_message(
                request.message,
                agent_type=agent_type,
                plan_override=None,
                force_qa=force_qa,
                plan_only=plan_only,
            )
            final_response.append(response)
        except Exception as e:
            queue.put_nowait(
                {
                    "event": "error",
                    "data": {"error": str(e), "traceback": traceback.format_exc()},
                }
            )
        finally:
            if final_response:
                queue.put_nowait(
                    {
                        "event": "response",
                        "data": {
                            "content": final_response[0],
                            "agent": agent_type
                            or (
                                "qa"
                                if force_qa
                                else "planner"
                                if plan_only
                                else "agent"
                            ),
                        },
                    }
                )
            queue.put_nowait({"event": "done", "data": {}})

    task = asyncio.create_task(_run_interaction())

    try:
        while True:
            item = await queue.get()
            yield {
                "event": item["event"],
                "data": json.dumps(item["data"], ensure_ascii=False),
            }
            if item["event"] == "done":
                break
    finally:
        if not task.done():
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass


@router.post("", summary="流式聊天 (SSE，Interaction 编排)")
async def chat_stream(request: ChatRequest):
    """
    流式聊天接口，走 SessionManager 的 Interaction 流程（路由 -> 规划 -> 执行 -> 摘要）。
    返回 text/event-stream，客户端通过 SSE 接收推理过程与最终响应。
    """
    return EventSourceResponse(_interaction_event_generator(request))


# ---------------------------------------------------------------------------
# 同步聊天（仍按 mode 调用，保持兼容）
# ---------------------------------------------------------------------------


@router.post("/sync", response_model=ChatResponse, summary="同步聊天")
async def chat_sync(request: ChatRequest):
    """
    同步聊天接口。按 mode: ask=QA, plan=规划, agent=智能体。
    仍直接调用各 agent，不经过 SessionManager。
    """
    try:
        if request.mode == "ask":
            qa = get_qa_agent()
            response = await qa.answer(request.message)
            return ChatResponse(response=response, agent="qa")
        if request.mode == "plan":
            planner = get_planner_agent()
            plan_result = await planner.plan(request.message)
            summary = plan_result.plan_summary or ""
            if plan_result.direct_response:
                summary = plan_result.direct_response + "\n\n" + summary
            if plan_result.todos:
                lines = [f"- {t.content} ({t.status.value})" for t in plan_result.todos]
                summary = summary + "\n\n**待办:**\n" + "\n".join(lines)
            return ChatResponse(response=summary, agent="planner")
        agent_instance = get_agent(request.agent)
        if request.prompt:
            agent_instance.update_system_prompt(request.prompt)
        response = await agent_instance.process(request.message)
        return ChatResponse(response=response, agent=request.agent)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"聊天处理错误: {e}")
