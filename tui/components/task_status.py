"""
TaskStatusComponent：任务执行状态加载组件
订阅规划/推理/执行/报告事件，在独立 Live 中显示当前任务类型与动画，
让用户清楚知道 Hackbot 正在执行何种任务。
"""

import threading
import time
from typing import Optional, Tuple

from rich.console import Console
from rich.live import Live
from rich.panel import Panel
from rich.spinner import Spinner
from rich.text import Text

from utils.event_bus import EventBus, EventType, Event


# 任务阶段与展示文案
PHASE_LABELS = {
    "planning": "规划中…",
    "thinking": "推理中…",
    "exec": "执行工具",   # 后接 detail: 工具名
    "report": "生成报告中…",
    "done": "任务完成",
}


class TaskStatusComponent:
    """
    任务状态加载组件：
    - 订阅 PLAN_START / THINK_* / EXEC_* / REPORT_* / ERROR
    - 在后台线程用 Live 持续刷新一行：Spinner + 当前任务类型
    - 收到 REPORT_END 或 ERROR 后显示「任务完成」并结束 Live
    """

    def __init__(self, console: Console, event_bus: Optional[EventBus] = None):
        self.console = console
        self.event_bus = event_bus
        self._lock = threading.Lock()
        self._phase: Optional[str] = None
        self._detail: str = ""
        self._live_thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
        self._done_show_until: float = 0  # 显示「完成」到该时间戳后退出

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

    def _set_phase(self, phase: str, detail: str = ""):
        with self._lock:
            self._phase = phase
            self._detail = detail

    def _get_phase(self) -> Tuple[Optional[str], str]:
        with self._lock:
            return (self._phase, self._detail)

    def _start_live_thread(self):
        if self._live_thread is not None and self._live_thread.is_alive():
            return
        self._stop_event.clear()
        self._live_thread = threading.Thread(target=self._run_live, daemon=True)
        self._live_thread.start()

    def _run_live(self):
        try:
            with Live(
                self._render(),
                console=self.console,
                refresh_per_second=10,
                transient=False,
            ) as live:
                while not self._stop_event.is_set():
                    live.update(self._render())
                    self._stop_event.wait(timeout=0.1)
                live.update(self._render())
                time.sleep(1.2)
        finally:
            self._live_thread = None

    def _render(self):
        phase, detail = self._get_phase()
        if phase is None:
            return Panel(
                Text("就绪", style="dim"),
                title="[bold cyan]状态[/bold cyan]",
                border_style="dim",
                padding=(0, 1),
            )
        label = PHASE_LABELS.get(phase, phase)
        if phase == "exec" and detail:
            line = f"{label}: [bold yellow]{detail}[/bold yellow]"
        else:
            line = label
        if phase == "done":
            return Panel(
                Text("✓ ", style="bold green") + Text(line, style="green"),
                title="[bold cyan]状态[/bold cyan]",
                border_style="green",
                padding=(0, 1),
            )
        return Panel(
            Spinner("dots", text=line, style="bold cyan"),
            title="[bold cyan]状态[/bold cyan]",
            border_style="cyan",
            padding=(0, 1),
        )

    def _on_task_phase(self, event: Event):
        phase = event.data.get("phase", "")
        detail = event.data.get("detail", "")
        if phase:
            self._set_phase(phase, detail)
            if phase == "done":
                self._start_live_thread()
                self._stop_event.set()
            else:
                self._start_live_thread()

    def _on_plan_start(self, event: Event):
        self._set_phase("planning", "执行计划")
        self._start_live_thread()

    def _on_think_start(self, event: Event):
        self._set_phase("thinking", "")
        self._start_live_thread()

    def _on_think_end(self, event: Event):
        # 下一轮可能是 THINK_START 或 EXEC_START，这里可保持「推理中」或留空
        pass

    def _on_exec_start(self, event: Event):
        tool = event.data.get("tool", "") or event.data.get("params", {}).get("tool", "")
        self._set_phase("exec", tool)
        self._start_live_thread()

    def _on_exec_result(self, event: Event):
        # 保持显示当前工具，直到下一阶段
        pass

    def _on_report_start(self, event: Event):
        self._set_phase("report", "")
        self._start_live_thread()

    def _on_report_end(self, event: Event):
        self._set_phase("done", "")
        self._done_show_until = time.time() + 1.2
        self._stop_event.set()

    def _on_error(self, event: Event):
        self._set_phase("done", "出错结束")
        self._stop_event.set()
