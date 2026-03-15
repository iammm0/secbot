"""
TaskExecutor：分层任务执行器
根据 PlannerAgent.get_execution_order() 的依赖关系，按层执行任务：
- 串行层（单 todo）：顺序执行
- 并行层（多 todo）：asyncio.gather 并发执行
每完成一个任务向 EventBus 推送消息，支持线性流式渲染。
"""

import asyncio
from typing import Any, Callable, Dict, List, Optional

from core.models import PlanResult, TodoItem
from utils.event_bus import EventBus, EventType
from utils.logger import logger


class TaskExecutor:
    """
    分层任务执行器。
    输入：PlanResult、agent、planner、event_bus
    按 get_execution_order() 遍历 layers，每层内串行或并行执行。
    """

    def __init__(
        self,
        plan_result: PlanResult,
        agent,
        planner,
        event_bus: EventBus,
        get_root_password: Optional[Callable] = None,
    ):
        self.plan_result = plan_result
        self.agent = agent
        self.planner = planner
        self.event_bus = event_bus
        self.get_root_password = get_root_password
        self._layer_results: Dict[str, Any] = {}

    def _get_todo_by_id(self, todo_id: str) -> Optional[TodoItem]:
        """根据 id 获取 TodoItem"""
        for t in self.plan_result.todos:
            if t.id == todo_id:
                return t
        return None

    async def run(
        self,
        user_input: str,
        on_event: Optional[Callable[[str, dict], None]] = None,
    ) -> str:
        """
        按分层顺序执行所有任务，返回最终响应文本。
        """
        if not self.plan_result.todos:
            return ""

        layers = self.planner.get_execution_order()
        if not layers:
            layers = [[t.id for t in self.plan_result.todos]]

        response_parts: List[str] = []
        iteration = 0

        for layer in layers:
            todos_in_layer = [
                self._get_todo_by_id(tid) for tid in layer
            ]
            todos_in_layer = [t for t in todos_in_layer if t is not None]

            if len(todos_in_layer) == 1:
                # 串行层：直接执行并发送事件
                todo = todos_in_layer[0]
                iteration += 1
                result = await self._execute_single_todo(
                    todo, user_input, iteration, on_event, emit_events=True
                )
                self._layer_results[todo.id] = result
                if result.get("obs"):
                    response_parts.append(result["obs"])
                # 未指定工具的步骤：由执行器标记为已完成并通知 UI
                if result.get("success") and not (getattr(todo, "tool_hint", None) or "").strip():
                    self.planner.update_todo(todo.id, "completed", result.get("obs"))
                    self.event_bus.emit_simple(
                        EventType.PLAN_TODO,
                        todo_id=todo.id,
                        status="completed",
                        result_summary=result.get("obs"),
                    )
            else:
                # 并行层：并发执行，收集结果后按 plan 顺序发送事件（保证线性渲染）
                tasks = []
                for i, todo in enumerate(todos_in_layer):
                    it = iteration + i + 1
                    tasks.append(
                        self._execute_single_todo(
                            todo, user_input, it, None, emit_events=False
                        )
                    )
                results = await asyncio.gather(*tasks, return_exceptions=True)
                for todo, res in zip(todos_in_layer, results):
                    if isinstance(res, Exception):
                        logger.error(f"Todo {todo.id} 执行异常: {res}")
                        err_msg = str(res)
                        self._layer_results[todo.id] = {
                            "success": False,
                            "obs": err_msg,
                            "error": err_msg,
                            "tool": getattr(todo, "tool_hint", ""),
                            "params": {},
                        }
                    else:
                        self._layer_results[todo.id] = res
                        if res.get("obs"):
                            response_parts.append(res["obs"])
                # 按 plan 顺序向队列推送事件，保证从上至下线性渲染
                for i, todo in enumerate(todos_in_layer):
                    res = self._layer_results.get(todo.id, {})
                    it = iteration + i + 1
                    if on_event:
                        on_event(
                            "action_start",
                            {
                                "iteration": it,
                                "tool": res.get("tool", ""),
                                "params": res.get("params", {}),
                            },
                        )
                        on_event(
                            "action_result",
                            {
                                "iteration": it,
                                "tool": res.get("tool", ""),
                                "success": res.get("success", False),
                                "result": res.get("result") if res.get("success") else None,
                                "error": res.get("error", res.get("obs", ""))
                                if not res.get("success")
                                else "",
                            },
                        )
                    # 未指定工具的步骤：由执行器标记为已完成并通知 UI
                    if res.get("success") and not (getattr(todo, "tool_hint", None) or "").strip():
                        self.planner.update_todo(todo.id, "completed", res.get("obs"))
                        self.event_bus.emit_simple(
                            EventType.PLAN_TODO,
                            todo_id=todo.id,
                            status="completed",
                            result_summary=res.get("obs"),
                        )
                iteration += len(todos_in_layer)

        return "\n".join(response_parts) if response_parts else ""

    async def _execute_single_todo(
        self,
        todo: TodoItem,
        user_input: str,
        iteration: int,
        on_event: Optional[Callable[[str, dict], None]],
        emit_events: bool = True,
    ) -> Dict[str, Any]:
        """执行单个 todo，返回 {success, obs, result, tool, params}"""
        if not hasattr(self.agent, "execute_todo"):
            return {
                "success": False,
                "obs": "Agent 不支持 execute_todo 接口",
                "tool": "",
                "params": {},
            }

        # 上下文聚合：
        # - by_todo: 以 todo_id 为 key 的结果映射（向后兼容）
        # - _by_resource_: 以 resource 为 key 的结果列表，便于后续步骤按资产维度引用
        by_todo: Dict[str, Any] = {}
        by_resource: Dict[str, List[Any]] = {}
        for tid, r in self._layer_results.items():
            value = r.get("result") if isinstance(r, dict) else r
            by_todo[tid] = value
            todo_obj = self._get_todo_by_id(tid)
            resource = getattr(todo_obj, "resource", None) if todo_obj else None
            if resource is not None:
                by_resource.setdefault(resource, []).append(value)

        context: Dict[str, Any] = dict(by_todo)
        if by_resource:
            context["_by_resource_"] = by_resource

        result = await self.agent.execute_todo(
            todo=todo,
            user_input=user_input,
            context=context,
            on_event=on_event,
            iteration=iteration,
            get_root_password=self.get_root_password,
            emit_events=emit_events,
        )
        return result
