"""
ReasoningComponent：推理展示组件
订阅 THINK_* 事件，展示 ReAct 循环中每一次 Thought
支持流式渲染（Live 实时更新）、迭代编号、折叠历史、/thinking 切换显示
自适应终端宽度，窄窗口不变形
"""

from typing import List, Optional

from rich.console import Console
from rich.panel import Panel
from rich.text import Text
from rich.markdown import Markdown
from rich.live import Live
from rich import box

from tui.widgets.collapsible import CollapsiblePanel
from utils.event_bus import EventBus, EventType, Event


# 流式刷新频率（次/秒）
STREAM_REFRESH_PER_SECOND = 8
# Live 面板最大行数（避免超长输出撑坏终端）
MAX_STREAM_LINES = 30


def _adaptive_padding(console: Console) -> tuple:
    """根据终端宽度返回合适的 padding"""
    try:
        w = console.width or 80
    except Exception:
        w = 80
    if w < 40:
        return (0, 0)
    if w < 60:
        return (0, 1)
    return (1, 2)


class ReasoningComponent:
    """
    推理展示组件：

    - 展示 ReAct 循环的每一次 Thought
    - 支持流式渲染（token-by-token）
    - 迭代编号清晰显示
    - 可折叠历史思考步骤，仅展开当前思考
    - 支持 /thinking 命令切换是否显示推理过程
    - 自适应终端宽度
    """

    def __init__(self, console: Console, event_bus: Optional[EventBus] = None):
        self.console = console
        self.event_bus = event_bus
        self.thoughts: List[dict] = []  # [{iteration, content, collapsed}]
        self._current_buffer: str = ""
        self._current_iteration: int = 0
        self._visible: bool = True  # /thinking 切换
        self._show_history: bool = False  # 是否展示历史思考
        self._live: Optional[Live] = None  # 流式输出用 Live 实例

        if event_bus:
            event_bus.subscribe(EventType.THINK_START, self._on_think_start)
            event_bus.subscribe(EventType.THINK_CHUNK, self._on_think_chunk)
            event_bus.subscribe(EventType.THINK_END, self._on_think_end)

    # ------------------------------------------------------------------
    # 事件处理
    # ------------------------------------------------------------------

    def _on_think_start(self, event: Event):
        """推理开始：启动 Live 流式输出"""
        self._current_iteration = event.data.get("iteration", len(self.thoughts) + 1)
        self._current_buffer = ""
        self._stop_live()
        if self._visible:
            try:
                self._live = Live(
                    self._render_streaming_panel(),
                    console=self.console,
                    refresh_per_second=STREAM_REFRESH_PER_SECOND,
                    transient=False,
                    vertical_overflow="ellipsis",
                )
                self._live.start()
            except Exception:
                # Live 启动失败（窗口太小或其他原因），跳过流式显示
                self._live = None

    def _on_think_chunk(self, event: Event):
        """推理流式 token：追加并刷新 Live 显示"""
        chunk = event.data.get("chunk", "")
        self._current_buffer += chunk
        if self._visible and self._live:
            try:
                self._live.update(self._render_streaming_panel())
            except Exception:
                # 更新失败（可能终端正在缩放），静默跳过
                pass

    def _on_think_end(self, event: Event):
        """推理结束：写入历史、停止 Live"""
        content = event.data.get("thought", self._current_buffer)
        self.thoughts.append({
            "iteration": self._current_iteration,
            "content": content,
            "collapsed": True,
        })
        had_live = self._live is not None
        if had_live and self._visible:
            # 用完整内容渲染最后一帧再停止
            self._current_buffer = content
            try:
                self._live.update(self._render_streaming_panel())
            except Exception:
                pass
        self._current_buffer = ""
        self._stop_live()
        if had_live and self._visible:
            # 已通过 Live 展示过，不再 display() 避免重复
            return
        self.display()

    # ------------------------------------------------------------------
    # 公共方法
    # ------------------------------------------------------------------

    def toggle_visibility(self):
        """切换推理过程显示/隐藏（/thinking 命令）"""
        self._visible = not self._visible
        return self._visible

    def toggle_history(self):
        """切换是否显示历史推理步骤"""
        self._show_history = not self._show_history
        return self._show_history

    def add_thought(self, content: str, iteration: int = 0):
        """手动添加一条推理记录"""
        if iteration == 0:
            iteration = len(self.thoughts) + 1
        self.thoughts.append({
            "iteration": iteration,
            "content": content,
            "collapsed": False,
        })

    def clear(self):
        """清除所有推理记录"""
        self._stop_live()
        self.thoughts.clear()
        self._current_buffer = ""
        self._current_iteration = 0

    def _stop_live(self):
        """安全停止 Live 实例"""
        if self._live:
            try:
                self._live.stop()
            except Exception:
                pass
            self._live = None

    def _render_streaming_panel(self) -> Panel:
        """渲染当前缓冲区为流式输出用的 Panel（供 Live 更新），使用 Markdown 渲染"""
        content = self._current_buffer.strip() or "…"
        padding = _adaptive_padding(self.console)

        # 限制流式面板高度
        lines = content.split("\n")
        if len(lines) > MAX_STREAM_LINES:
            content = "\n".join(lines[-MAX_STREAM_LINES:])

        return Panel(
            Markdown(content),
            title=f"[bold cyan]Reasoning - Iteration {self._current_iteration}[/bold cyan]",
            border_style="cyan",
            box=box.ROUNDED,
            padding=padding,
        )

    # ------------------------------------------------------------------
    # 渲染
    # ------------------------------------------------------------------

    def render_thought(self, thought: dict, collapsed: bool = False) -> Panel:
        """渲染单条推理记录，使用 Markdown 渲染内容"""
        iteration = thought["iteration"]
        content = thought["content"]
        padding = _adaptive_padding(self.console)
        renderable = Markdown(content) if content else Text("")

        if collapsed:
            # 折叠模式：显示摘要（纯文本）
            summary = content.replace("\n", " ").strip()
            try:
                w = self.console.width or 80
            except Exception:
                w = 80
            max_summary = max(w - 20, 30)
            if len(summary) > max_summary:
                summary = summary[:max_summary - 3] + "..."
            return CollapsiblePanel(
                content=renderable,
                title=f"[bold cyan]Reasoning - Iteration {iteration}[/bold cyan]",
                border_style="cyan",
                collapsed_summary=summary,
                collapsed=True,
            ).render()

        return Panel(
            renderable,
            title=f"[bold cyan]Reasoning - Iteration {iteration}[/bold cyan]",
            border_style="cyan",
            box=box.ROUNDED,
            padding=padding,
        )

    def render(self) -> Optional[Panel]:
        """渲染当前推理状态"""
        if not self._visible:
            return None

        if not self.thoughts:
            return None

        # 只渲染最后一条（当前）思考
        latest = self.thoughts[-1]
        return self.render_thought(latest, collapsed=False)

    def display(self):
        """直接打印到控制台"""
        if not self._visible:
            return

        # 打印历史思考（折叠）
        if self._show_history and len(self.thoughts) > 1:
            for thought in self.thoughts[:-1]:
                self.console.print(self.render_thought(thought, collapsed=True))

        # 打印最新思考（展开）
        if self.thoughts:
            self.console.print(
                self.render_thought(self.thoughts[-1], collapsed=False)
            )
