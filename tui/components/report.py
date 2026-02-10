"""
ReportComponent：报告展示组件
订阅 REPORT_* 事件，展示 SummaryAgent 生成的最终报告
支持流式渲染（Live 实时更新）、分段渲染、导出为 Markdown

优化要点：
- REPORT_CHUNK 期间启动 Live 实例进行实时流式渲染
- 流式阶段使用 Text（轻量），结束后用 Markdown（完整格式化）
- 流式光标动画与 ReasoningComponent 风格一致
"""

from pathlib import Path
from typing import Optional

from rich.console import Console
from rich.panel import Panel
from rich.markdown import Markdown
from rich.text import Text
from rich.live import Live
from rich import box

from tui.models import InteractionSummary
from tui.utils import adaptive_padding
from utils.event_bus import EventBus, EventType, Event


# 流式刷新频率
REPORT_REFRESH_PER_SECOND = 12
# 流式面板最大行数
REPORT_MAX_STREAM_LINES = 60


class ReportComponent:
    """
    报告展示组件：

    - 展示 SummaryAgent 生成的最终报告
    - 支持流式渲染（Live 实时更新带光标动画）
    - 支持分段渲染（任务总结、发现、风险评估、建议、结论）
    - 支持导出为 Markdown 文件
    """

    def __init__(self, console: Console, event_bus: Optional[EventBus] = None):
        self.console = console
        self.event_bus = event_bus
        self._buffer: str = ""
        self._full_report: str = ""
        self._summary: Optional[InteractionSummary] = None
        self._visible: bool = True
        self._live: Optional[Live] = None
        self._cursor_frame: int = 0

        if event_bus:
            event_bus.subscribe(EventType.REPORT_START, self._on_report_start)
            event_bus.subscribe(EventType.REPORT_CHUNK, self._on_report_chunk)
            event_bus.subscribe(EventType.REPORT_END, self._on_report_end)

    # ------------------------------------------------------------------
    # Live 管理
    # ------------------------------------------------------------------

    def _stop_live(self):
        """安全停止 Live 实例"""
        if self._live:
            try:
                self._live.stop()
            except Exception:
                pass
            self._live = None

    def _render_streaming_panel(self) -> Panel:
        """渲染流式 Report 面板（Text + 闪烁光标）"""
        content = self._buffer.strip() or "..."
        padding = adaptive_padding(self.console)

        # 限制流式面板高度
        lines = content.split("\n")
        if len(lines) > REPORT_MAX_STREAM_LINES:
            content = "\n".join(lines[-REPORT_MAX_STREAM_LINES:])

        # 闪烁光标
        self._cursor_frame += 1
        cursor_char = " \u258c" if self._cursor_frame % 2 == 0 else "  "

        text = Text(content)
        text.append(cursor_char, style="bold green")

        return Panel(
            text,
            title="[bold green]\u258c Report[/bold green]",
            border_style="dim green",
            box=box.SIMPLE,
            padding=padding,
        )

    # ------------------------------------------------------------------
    # 事件处理
    # ------------------------------------------------------------------

    def _on_report_start(self, event: Event):
        """报告生成开始：初始化缓冲区并启动 Live"""
        self._buffer = ""
        self._full_report = ""
        self._cursor_frame = 0
        self._stop_live()
        if self._visible:
            try:
                self._live = Live(
                    self._render_streaming_panel(),
                    console=self.console,
                    refresh_per_second=REPORT_REFRESH_PER_SECOND,
                    transient=True,
                    vertical_overflow="ellipsis",
                )
                self._live.start()
            except Exception:
                self._live = None

    def _on_report_chunk(self, event: Event):
        """报告流式 chunk：追加缓冲区并刷新 Live"""
        chunk = event.data.get("chunk", "")
        self._buffer += chunk
        if self._visible and self._live:
            try:
                self._live.update(self._render_streaming_panel())
            except Exception:
                pass

    def _on_report_end(self, event: Event):
        """报告生成完成：停止 Live，输出最终 Markdown 版本"""
        report = event.data.get("report", self._buffer)
        self._full_report = report

        # 如果有结构化摘要
        summary_data = event.data.get("summary")
        if isinstance(summary_data, InteractionSummary):
            self._summary = summary_data
        elif isinstance(summary_data, dict):
            self._summary = InteractionSummary(**summary_data)

        # 停止 Live（transient=True 自动清除流式帧）
        self._stop_live()
        self._buffer = ""
        # 统一用 display() 输出最终 Markdown 渲染版
        self.display()

    # ------------------------------------------------------------------
    # 公共方法
    # ------------------------------------------------------------------

    def set_report(self, report: str, summary: Optional[InteractionSummary] = None):
        """手动设置报告内容"""
        self._full_report = report
        self._summary = summary

    def display(self):
        """显示报告（最终 Markdown 格式化版本）"""
        if not self._visible or not self._full_report:
            return

        # 主报告面板 — 使用 DOUBLE 边框突出重要性
        self.console.print(
            Panel(
                Markdown(self._full_report),
                title="[bold green]📊 Report[/bold green]",
                border_style="green",
                box=box.DOUBLE,
                padding=adaptive_padding(self.console),
            )
        )

        # 如果有结构化摘要，显示快速统计
        if self._summary:
            self._display_summary_stats()

    def _display_summary_stats(self):
        """显示摘要统计信息"""
        if not self._summary:
            return

        stats = Text()
        tc = self._summary.todo_completion
        if tc.get("total", 0) > 0:
            stats.append("  任务: ", style="dim")
            stats.append(
                f"{tc.get('completed', 0)}/{tc.get('total', 0)} 完成",
                style="green" if tc.get("completed", 0) == tc.get("total", 0) else "yellow",
            )

        if self._summary.key_findings:
            stats.append(f"  |  发现: {len(self._summary.key_findings)} 项", style="dim")

        if self._summary.recommendations:
            stats.append(f"  |  建议: {len(self._summary.recommendations)} 条", style="dim")

        if str(stats):
            self.console.print(stats)

    def render(self) -> Optional[Panel]:
        """渲染报告面板"""
        if not self._full_report:
            return None

        return Panel(
            Markdown(self._full_report),
            title="[bold green]📊 Report[/bold green]",
            border_style="green",
            box=box.DOUBLE,
            padding=adaptive_padding(self.console),
        )

    # ------------------------------------------------------------------
    # 导出
    # ------------------------------------------------------------------

    def export_markdown(self, path: Path) -> bool:
        """导出报告为 Markdown 文件"""
        if not self._full_report:
            return False

        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(self._full_report, encoding="utf-8")
            self.console.print(f"[green]报告已导出到: {path}[/green]")
            return True
        except Exception as e:
            self.console.print(f"[red]导出失败: {e}[/red]")
            return False

    def get_report_text(self) -> str:
        """获取纯文本报告"""
        return self._full_report
