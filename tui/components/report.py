"""
ReportComponent：报告展示组件
订阅 REPORT_* 事件，展示 SummaryAgent 生成的最终报告
支持分段渲染、流式渲染、导出为 Markdown
"""

from pathlib import Path
from typing import Optional

from rich.console import Console
from rich.panel import Panel
from rich.markdown import Markdown
from rich.text import Text
from rich import box

from tui.models import InteractionSummary
from utils.event_bus import EventBus, EventType, Event


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


class ReportComponent:
    """
    报告展示组件：

    - 展示 SummaryAgent 生成的最终报告
    - 支持分段渲染（任务总结、发现、风险评估、建议、结论）
    - 支持流式渲染报告内容
    - 支持导出为 Markdown 文件
    """

    def __init__(self, console: Console, event_bus: Optional[EventBus] = None):
        self.console = console
        self.event_bus = event_bus
        self._buffer: str = ""
        self._full_report: str = ""
        self._summary: Optional[InteractionSummary] = None
        self._visible: bool = True

        if event_bus:
            event_bus.subscribe(EventType.REPORT_START, self._on_report_start)
            event_bus.subscribe(EventType.REPORT_CHUNK, self._on_report_chunk)
            event_bus.subscribe(EventType.REPORT_END, self._on_report_end)

    # ------------------------------------------------------------------
    # 事件处理
    # ------------------------------------------------------------------

    def _on_report_start(self, event: Event):
        """报告生成开始"""
        self._buffer = ""
        self._full_report = ""

    def _on_report_chunk(self, event: Event):
        """报告流式 chunk"""
        chunk = event.data.get("chunk", "")
        self._buffer += chunk

    def _on_report_end(self, event: Event):
        """报告生成完成"""
        report = event.data.get("report", self._buffer)
        self._full_report = report

        # 如果有结构化摘要
        summary_data = event.data.get("summary")
        if isinstance(summary_data, InteractionSummary):
            self._summary = summary_data
        elif isinstance(summary_data, dict):
            self._summary = InteractionSummary(**summary_data)

        self.display()

    # ------------------------------------------------------------------
    # 公共方法
    # ------------------------------------------------------------------

    def set_report(self, report: str, summary: Optional[InteractionSummary] = None):
        """手动设置报告内容"""
        self._full_report = report
        self._summary = summary

    def display(self):
        """显示报告"""
        if not self._visible or not self._full_report:
            return

        # 主报告面板
        self.console.print(
            Panel(
                Markdown(self._full_report),
                title="[bold green]Report[/bold green]",
                border_style="green",
                box=box.ROUNDED,
                padding=_adaptive_padding(self.console),
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
            title="[bold green]Report[/bold green]",
            border_style="green",
            box=box.ROUNDED,
            padding=_adaptive_padding(self.console),
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
