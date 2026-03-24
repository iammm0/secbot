"""
Maps secbot EventBus events to ACP sessionUpdate notifications.

Subscribes to the secbot EventBus and translates each event into the
corresponding ACP session update message, sending them over the transport.
"""
from __future__ import annotations

import uuid
from typing import Any, Dict, Optional

from utils.event_bus import Event, EventBus, EventType
from opencode_gateway.types import (
    PlanEntry,
    PlanEntryStatus,
    ToolCallStatus,
    ToolKind,
    tool_to_kind,
)
from opencode_gateway.protocol import NDJsonTransport

_STATUS_MAP = {
    "pending": PlanEntryStatus.PENDING,
    "in_progress": PlanEntryStatus.IN_PROGRESS,
    "completed": PlanEntryStatus.COMPLETED,
}


class EventMapper:
    """Bridges secbot EventBus events to ACP sessionUpdate notifications."""

    def __init__(
        self,
        event_bus: EventBus,
        transport: NDJsonTransport,
        session_id_resolver: callable,
    ):
        self._bus = event_bus
        self._transport = transport
        self._resolve_session = session_id_resolver
        self._tool_call_ids: Dict[str, str] = {}
        self._subscribe()

    def _subscribe(self):
        self._bus.subscribe_all(self._handle)

    async def _send_update(self, session_id: str, update: Dict[str, Any]):
        await self._transport.send_notification(
            "sessionUpdate",
            {"sessionId": session_id, "update": update},
        )

    async def _handle(self, event: Event):
        sid = self._resolve_session()
        if sid is None:
            return

        data = event.data
        t = event.type

        if t == EventType.PLAN_START:
            todos = data.get("todos", [])
            entries = []
            for todo in todos:
                status_str = todo.get("status", "pending")
                entries.append({
                    "priority": "medium",
                    "status": _STATUS_MAP.get(status_str, PlanEntryStatus.PENDING).value,
                    "content": todo.get("content", ""),
                })
            await self._send_update(sid, {
                "sessionUpdate": "plan",
                "entries": entries,
            })

        elif t == EventType.PLAN_TODO:
            todo_id = data.get("todo_id", "")
            status = data.get("status", "pending")
            await self._send_update(sid, {
                "sessionUpdate": "plan",
                "entries": [{
                    "priority": "medium",
                    "status": _STATUS_MAP.get(status, PlanEntryStatus.PENDING).value,
                    "content": data.get("result_summary", todo_id),
                }],
            })

        elif t == EventType.THINK_START:
            pass

        elif t == EventType.THINK_CHUNK:
            chunk = data.get("chunk", "")
            if chunk:
                await self._send_update(sid, {
                    "sessionUpdate": "agent_thought_chunk",
                    "content": {"type": "text", "text": chunk},
                })

        elif t == EventType.THINK_END:
            thought = data.get("thought", "")
            if thought:
                await self._send_update(sid, {
                    "sessionUpdate": "agent_thought_chunk",
                    "content": {"type": "text", "text": thought},
                })

        elif t == EventType.EXEC_START:
            tool = data.get("tool", "unknown")
            params = data.get("params", {})
            call_id = str(uuid.uuid4())[:12]
            iter_key = f"{event.iteration}:{tool}"
            self._tool_call_ids[iter_key] = call_id
            await self._send_update(sid, {
                "sessionUpdate": "tool_call",
                "toolCallId": call_id,
                "title": tool,
                "kind": tool_to_kind(tool).value,
                "status": ToolCallStatus.PENDING.value,
                "locations": [],
                "rawInput": params,
            })
            await self._send_update(sid, {
                "sessionUpdate": "tool_call_update",
                "toolCallId": call_id,
                "status": ToolCallStatus.IN_PROGRESS.value,
                "kind": tool_to_kind(tool).value,
                "title": tool,
                "rawInput": params,
            })

        elif t == EventType.EXEC_RESULT:
            tool = data.get("tool", "unknown")
            success = data.get("success", False)
            iter_key = f"{event.iteration}:{tool}"
            call_id = self._tool_call_ids.pop(iter_key, str(uuid.uuid4())[:12])
            status = ToolCallStatus.COMPLETED if success else ToolCallStatus.FAILED
            output_text = data.get("result", "") if success else data.get("error", "")
            await self._send_update(sid, {
                "sessionUpdate": "tool_call_update",
                "toolCallId": call_id,
                "status": status.value,
                "kind": tool_to_kind(tool).value,
                "title": tool,
                "content": [{"type": "content", "content": {"type": "text", "text": str(output_text)}}],
                "rawInput": {},
            })

        elif t == EventType.CONTENT:
            text = data.get("content", "")
            if text:
                await self._send_update(sid, {
                    "sessionUpdate": "agent_message_chunk",
                    "content": {"type": "text", "text": text},
                })

        elif t == EventType.REPORT_END:
            report = data.get("report", "")
            if report:
                await self._send_update(sid, {
                    "sessionUpdate": "agent_message_chunk",
                    "content": {"type": "text", "text": report},
                })

        elif t == EventType.ERROR:
            error = data.get("error", "Unknown error")
            await self._send_update(sid, {
                "sessionUpdate": "agent_message_chunk",
                "content": {"type": "text", "text": f"[Error] {error}"},
            })

        elif t == EventType.CONFIRM_REQUIRED:
            await self._send_update(sid, {
                "sessionUpdate": "permission_request",
                "content": {
                    "type": "text",
                    "text": data.get("message", "Permission required"),
                },
                "metadata": {
                    "tool": data.get("tool", ""),
                    "confirm_type": "confirm",
                },
            })

        elif t == EventType.ROOT_REQUIRED:
            await self._send_update(sid, {
                "sessionUpdate": "permission_request",
                "content": {
                    "type": "text",
                    "text": data.get("message", "Root permission required"),
                },
                "metadata": {
                    "tool": data.get("tool", ""),
                    "confirm_type": "root",
                },
            })

        elif t == EventType.PLAN_EXIT_REQUEST:
            await self._send_update(sid, {
                "sessionUpdate": "plan_exit_request",
                "content": {
                    "type": "text",
                    "text": data.get("plan_text", ""),
                },
            })

        elif t == EventType.PLAN_APPROVED:
            await self._send_update(sid, {
                "sessionUpdate": "plan_approved",
                "content": {
                    "type": "text",
                    "text": data.get("plan_text", ""),
                },
            })

        elif t == EventType.SUBAGENT_START:
            await self._send_update(sid, {
                "sessionUpdate": "subagent_start",
                "taskId": data.get("task_id", ""),
                "agentType": data.get("agent_type", ""),
                "description": data.get("description", ""),
            })

        elif t == EventType.SUBAGENT_RESULT:
            await self._send_update(sid, {
                "sessionUpdate": "subagent_result",
                "taskId": data.get("task_id", ""),
                "agentType": data.get("agent_type", ""),
                "success": data.get("success", False),
                "content": {"type": "text", "text": data.get("result", "")},
            })
