"""
TaskStatusComponent：任务执行状态组件
订阅规划/推理/执行/报告事件，在终端中显示当前任务阶段。
使用 console.print + \\r 覆盖方式而非 Live，避免与 ReasoningComponent 的 Live 冲突。
"""

from typing import Optional, Tuple

from rich.console import Console
from rich.text import Text

from utils.event_bus import EventBus, EventType, Event


# 任务阶段与展示文案
PHASE_LABELS = {
    "planning": ("magenta", "Planning", "规划中…"),
    "thinking": ("cyan", "Thinking", "推理中…"),
    "exec": ("yellow", "Executing", "执行工具"),
    "report": ("green", "Report", "生成报告中…"),
    "done": ("green", "Done", "任务完成"),
}

# Spinner 字符（简单旋转动画，每次调用切换）
_SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]


class TaskStatusComponent:
    """
    任务状态组件：
    - 订阅 PLAN_START / THINK_* / EXEC_* / REPORT_* / ERROR
    - 使用简洁的一行状态文本显示当前阶段
    - 不使用 Live（避免与 ReasoningComponent 的 Live 冲突导致卡顿/变形）
    """

    def __init__(self, console: Console, event_bus: Optional[EventBus] = None):
        self.console = console
        self.event_bus = event_bus
        self._phase: Optional[str] = None
        self._detail: str = ""
        self._frame_idx: int = 0

        if event_bus:
            event_bus.subscribe(EventType.TASK_PHASE, self._on_task_phase)
            event_bus.subscribe(EventType.PLAN_START, self._on_plan_start)
            event_bus.subscribe(EventType.THINK_START, self._on_think_start)
            event_bus.subscribe(EventType.THINK_END, self._on_think_end)
            event_bus.subscribe(EventType.EXEC_START, self._on_exec_start)
            event_bus.subscribe(EventType.EXEC_RESULT, self._on_exec_result)
            event_bus.subscribe(EventType.REPORT_START, self._on_report_start)
            event_bus.subscribe(EventType.REPORT_END, self._on_report_end)
            event_bus.subscribe(EventType.ERROR, self._on_error)

    # ------------------------------------------------------------------
    # 渲染
    # ------------------------------------------------------------------

    def _print_status(self):
        """打印一行简洁状态"""
        if self._phase is None:
            return

        info = PHASE_LABELS.get(self._phase)
        if not info:
            return

        color, tag, label = info

        if self._phase == "done":
            self.console.print(
                Text.assemble(
                    ("  ", ""),
                    ("✓ ", f"bold {color}"),
                    (f"{tag}", f"bold {color}"),
                    (f"  {label}", f"{color}"),
                )
            )
        else:
            # 简单 spinner
            frame = _SPINNER_FRAMES[self._frame_idx % len(_SPINNER_FRAMES)]
            self._frame_idx += 1

            detail_text = ""
            if self._phase == "exec" and self._detail:
                detail_text = f": {self._detail}"

            self.console.print(
                Text.assemble(
                    ("  ", ""),
                    (f"{frame} ", f"bold {color}"),
                    (f"{tag}", f"bold {color}"),
                    (f"  {label}{detail_text}", f"{color}"),
                )
            )

    # ------------------------------------------------------------------
    # 事件处理
    # ------------------------------------------------------------------

    def _on_task_phase(self, event: Event):
        phase = event.data.get("phase", "")
        detail = event.data.get("detail", "")
        if phase:
            self._phase = phase
            self._detail = detail
            self._print_status()

    def _on_plan_start(self, event: Event):
        self._phase = "planning"
        self._detail = ""
        self._print_status()

    def _on_think_start(self, event: Event):
        self._phase = "thinking"
        self._detail = ""
        # 不打印，因为 ReasoningComponent 会处理显示

    def _on_think_end(self, event: Event):
        pass

    def _on_exec_start(self, event: Event):
        tool = event.data.get("tool", "") or event.data.get("params", {}).get("tool", "")
        self._phase = "exec"
        self._detail = tool
        # 不打印，因为 ExecutionComponent 会处理显示

    def _on_exec_result(self, event: Event):
        pass

    def _on_report_start(self, event: Event):
        self._phase = "report"
        self._detail = ""
        self._print_status()

    def _on_report_end(self, event: Event):
        self._phase = "done"
        self._detail = ""
        self._print_status()

    def _on_error(self, event: Event):
        self._phase = "done"
        self._detail = "出错结束"
        self._print_status()
