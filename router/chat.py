"""
聊天路由 — 使用 Interaction 编排（SessionManager + EventBus）的 SSE 流式接口
"""

import asyncio
import json
import traceback
import uuid
from typing import Any, AsyncGenerator

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
from router.schemas import ChatRequest, ChatResponse, RootResponseRequest
from core.session import SessionManager
from utils.event_bus import EventBus, EventType, Event
from utils.root_policy import save_root_policy

router = APIRouter(prefix="/api/chat", tags=["Chat"])

# 需 root 权限时：request_id -> Future[dict | None]，由 POST /root-response 解析
_root_pending: dict[str, asyncio.Future[dict[str, Any] | None]] = {}


def _event_to_sse(event: Event) -> tuple[str, dict] | None:
    """将 EventBus 事件映射为前端 SSE 的 (event_name, data)。"""
    t, d = event.type, event.data
    if t == EventType.PLAN_START:
        return (
            "planning",
            {
                "content": d.get("summary", ""),
                "todos": d.get("todos", []),
                "agent": d.get("agent"),
            },
        )
    if t == EventType.THINK_START:
        return (
            "thought_start",
            {
                "iteration": d.get("iteration", 1),
                "agent": d.get("agent"),
            },
        )
    if t == EventType.THINK_CHUNK:
        return (
            "thought_chunk",
            {
                "chunk": d.get("chunk", ""),
                "iteration": d.get("iteration", 1),
                "agent": d.get("agent"),
            },
        )
    if t == EventType.THINK_END:
        return (
            "thought",
            {
                "content": d.get("thought", ""),
                "iteration": d.get("iteration", 1),
                "agent": d.get("agent"),
            },
        )
    if t == EventType.EXEC_START:
        return (
            "action_start",
            {
                "tool": d.get("tool", ""),
                "params": d.get("params", {}),
                "iteration": d.get("iteration", 1),
                "agent": d.get("agent"),
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
                "agent": d.get("agent"),
            },
        )
    if t == EventType.CONTENT:
        return (
            "content",
            {
                "content": d.get("content", ""),
                "agent": d.get("agent"),
            },
        )
    if t == EventType.REPORT_END:
        return (
            "report",
            {
                "content": d.get("report", ""),
                "agent": d.get("agent"),
            },
        )
    if t == EventType.TASK_PHASE:
        return (
            "phase",
            {
                "phase": d.get("phase", ""),
                "detail": d.get("detail", ""),
                "agent": d.get("agent"),
            },
        )
    if t == EventType.ROOT_REQUIRED:
        return (
            "root_required",
            {"request_id": d.get("request_id", ""), "command": d.get("command", "")},
        )
    if t == EventType.ERROR:
        return (
            "error",
            {
                "error": d.get("error", ""),
                "agent": d.get("agent"),
            },
        )
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
        EventType.ROOT_REQUIRED,
        EventType.ERROR,
    ):
        event_bus.subscribe(et, on_bus_event)

    async def get_root_password(command: str) -> dict[str, Any] | None:
        """需 root 时暂停：发 root_required，等客户端 POST root-response 后返回。"""
        request_id = str(uuid.uuid4())
        fut: asyncio.Future[dict[str, Any] | None] = asyncio.get_running_loop().create_future()
        _root_pending[request_id] = fut
        try:
            event_bus.emit_simple(
                EventType.ROOT_REQUIRED,
                request_id=request_id,
                command=command,
            )
            return await asyncio.wait_for(fut, timeout=300.0)
        except asyncio.TimeoutError:
            return None
        finally:
            _root_pending.pop(request_id, None)

    session_manager = SessionManager(
        event_bus=event_bus,
        console=console,
        agents=get_agents(),
        planner=get_planner_agent(),
        qa_agent=get_qa_agent(),
        summary_agent=get_summary_agent(),
        get_root_password=get_root_password,
    )

    force_qa = request.mode == "ask"
    plan_only = False  # 已移除 plan 模式，仅 ask / agent
    force_agent_flow = request.mode == "agent"
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
                force_agent_flow=force_agent_flow,
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


@router.post("/root-response", summary="需 root 权限时用户选择回传")
async def root_response(body: RootResponseRequest):
    """
    当 SSE 收到 root_required 后，前端弹窗让用户选择「执行一次 / 总是允许 / 拒绝」，
    首次允许时输入本机账户或 root 密码，然后 POST 到此接口以继续执行。
    """
    request_id = body.request_id
    fut = _root_pending.get(request_id)
    if not fut or fut.done():
        raise HTTPException(status_code=400, detail="无效或已过期的 request_id")
    if body.action == "always_allow":
        save_root_policy(root_policy="always_allow")
        # 首次「总是允许」时若提供了密码，本次仍用密码执行一次，后续才不询问
        if body.password:
            fut.set_result({"action": "run_once", "password": body.password})
            return {}
    payload: dict[str, Any] = {"action": body.action}
    if body.password is not None:
        payload["password"] = body.password
    fut.set_result(payload)
    return {}


# ---------------------------------------------------------------------------
# 同步聊天（仍按 mode 调用，保持兼容）
# ---------------------------------------------------------------------------


@router.post("/sync", response_model=ChatResponse, summary="同步聊天")
async def chat_sync(request: ChatRequest):
    """
    同步聊天接口。按 mode: ask=QA, agent=智能体（开源版自动化安全测试智能体）。
    仍直接调用各 agent，不经过 SessionManager。
    """
    try:
        if request.mode == "ask":
            qa = get_qa_agent()
            response = await qa.answer(request.message)
            return ChatResponse(response=response, agent="qa")
        agent_instance = get_agent(request.agent)
        if request.prompt:
            agent_instance.update_system_prompt(request.prompt)

        # 若 Agent 定义了并发锁，则保证同一 Agent 的任务串行执行
        lock = getattr(agent_instance, "_concurrency_lock", None)
        if lock is not None:
            async with lock:
                response = await agent_instance.process(request.message)
        else:
            response = await agent_instance.process(request.message)
        return ChatResponse(response=response, agent=request.agent)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"聊天处理错误: {e}")
