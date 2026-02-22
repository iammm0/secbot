"""
EventBus：轻量级事件总线，解耦 Agent 层与 UI 层
支持同步和异步事件订阅与发射
"""

import asyncio
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Callable, Dict, List, Optional, Union

from utils.logger import logger


class EventType(str, Enum):
    """事件类型枚举"""

    # 规划相关
    PLAN_START = "plan_start"
    PLAN_TODO = "plan_todo"
    PLAN_COMPLETE = "plan_complete"

    # 推理相关
    THINK_START = "think_start"
    THINK_CHUNK = "think_chunk"
    THINK_END = "think_end"

    # 执行相关
    EXEC_START = "exec_start"
    EXEC_PROGRESS = "exec_progress"
    EXEC_RESULT = "exec_result"

    # 内容
    CONTENT = "content"

    # 报告相关
    REPORT_START = "report_start"
    REPORT_CHUNK = "report_chunk"
    REPORT_END = "report_end"

    # 任务状态（供加载组件显示当前阶段）
    TASK_PHASE = "task_phase"

    # 交互控制
    CONFIRM_REQUIRED = "confirm_required"
    SESSION_UPDATE = "session_update"
    ERROR = "error"

    # UI 反馈（OpenCode 理念：事件驱动 Toast）
    TOAST_SHOW = "toast_show"
    COMMAND_EXECUTE = "command_execute"


@dataclass
class Event:
    """单个事件"""
    type: EventType
    data: Dict[str, Any] = field(default_factory=dict)
    timestamp: datetime = field(default_factory=datetime.now)
    iteration: int = 0


# 处理器类型：同步或异步 callable
EventHandler = Callable[[Event], Any]


class EventBus:
    """
    轻量级发布-订阅事件总线。

    用法：
        bus = EventBus()
        bus.subscribe(EventType.THINK_CHUNK, my_handler)
        bus.emit(Event(type=EventType.THINK_CHUNK, data={"chunk": "..."}))
    """

    def __init__(self):
        self._handlers: Dict[EventType, List[EventHandler]] = {}
        self._global_handlers: List[EventHandler] = []

    # ------------------------------------------------------------------
    # 订阅
    # ------------------------------------------------------------------

    def subscribe(
        self,
        event_type: Union[EventType, str],
        handler: EventHandler,
    ) -> None:
        """订阅特定事件类型"""
        if isinstance(event_type, str):
            event_type = EventType(event_type)
        self._handlers.setdefault(event_type, []).append(handler)

    def subscribe_all(self, handler: EventHandler) -> None:
        """订阅所有事件（全局处理器）"""
        self._global_handlers.append(handler)

    def unsubscribe(
        self,
        event_type: Union[EventType, str],
        handler: EventHandler,
    ) -> None:
        """取消订阅"""
        if isinstance(event_type, str):
            event_type = EventType(event_type)
        handlers = self._handlers.get(event_type, [])
        if handler in handlers:
            handlers.remove(handler)

    def unsubscribe_all(self, handler: EventHandler) -> None:
        """取消全局订阅"""
        if handler in self._global_handlers:
            self._global_handlers.remove(handler)

    # ------------------------------------------------------------------
    # 发射（同步）
    # ------------------------------------------------------------------

    def emit(self, event: Event) -> None:
        """同步发射事件，依次调用所有处理器"""
        handlers = list(self._global_handlers) + list(
            self._handlers.get(event.type, [])
        )
        for handler in handlers:
            try:
                result = handler(event)
                # 如果处理器返回 coroutine，在当前循环中调度
                if asyncio.iscoroutine(result):
                    try:
                        loop = asyncio.get_running_loop()
                        loop.create_task(result)
                    except RuntimeError:
                        # 没有运行中的事件循环，忽略
                        pass
            except Exception as exc:
                logger.error(f"EventBus handler error [{event.type}]: {exc}")

    # ------------------------------------------------------------------
    # 发射（异步）
    # ------------------------------------------------------------------

    async def emit_async(self, event: Event) -> None:
        """异步发射事件，支持异步处理器"""
        handlers = list(self._global_handlers) + list(
            self._handlers.get(event.type, [])
        )
        for handler in handlers:
            try:
                result = handler(event)
                if asyncio.iscoroutine(result):
                    await result
            except Exception as exc:
                logger.error(f"EventBus async handler error [{event.type}]: {exc}")

    # ------------------------------------------------------------------
    # 便捷方法
    # ------------------------------------------------------------------

    def emit_simple(
        self,
        event_type: Union[EventType, str],
        iteration: int = 0,
        **data,
    ) -> None:
        """便捷的同步发射方法"""
        if isinstance(event_type, str):
            event_type = EventType(event_type)
        self.emit(Event(type=event_type, data=data, iteration=iteration))

    async def emit_simple_async(
        self,
        event_type: Union[EventType, str],
        iteration: int = 0,
        **data,
    ) -> None:
        """便捷的异步发射方法"""
        if isinstance(event_type, str):
            event_type = EventType(event_type)
        await self.emit_async(Event(type=event_type, data=data, iteration=iteration))

    def clear(self) -> None:
        """清除所有订阅"""
        self._handlers.clear()
        self._global_handlers.clear()
