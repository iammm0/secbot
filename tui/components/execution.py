"""
ExecutionComponent：执行展示组件
订阅 EXEC_* 事件，展示工具执行详情
支持 spinner 动画、详细/简洁模式、/details 切换
"""

import json
from typing import List, Optional

from rich.console import Console, Group
from rich.panel import Panel
from rich.table import Table
from rich.text import Text
from rich.markdown import Markdown
from rich import box

from utils.event_bus import EventBus, EventType, Event


class ExecutionComponent:
    """
    执行展示组件：

    - 展示工具执行详情：工具名、参数、脚本/代码、执行结果
    - 支持执行中 spinner 动画
    - 成功/失败用颜色区分（green/red）
    - 支持 /details 命令切换详细/简洁模式
    - 参数以 Table 格式渲染
    """

    def __init__(self, console: Console, event_bus: Optional[EventBus] = None):
        self.console = console
        self.event_bus = event_bus
        self.executions: List[dict] = []
        self._detail_mode: bool = True  # /details 切换
        self._visible: bool = True

        if event_bus:
            event_bus.subscribe(EventType.EXEC_START, self._on_exec_start)
            event_bus.subscribe(EventType.EXEC_PROGRESS, self._on_exec_progress)
            event_bus.subscribe(EventType.EXEC_RESULT, self._on_exec_result)

    # ------------------------------------------------------------------
    # 事件处理
    # ------------------------------------------------------------------

    def _on_exec_start(self, event: Event):
        """工具执行开始"""
        execution = {
            "tool": event.data.get("tool", ""),
            "params": event.data.get("params", {}),
            "script": event.data.get("script"),
            "iteration": event.iteration or event.data.get("iteration", 0),
            "result": None,
            "success": None,
        }
        self.executions.append(execution)
        self._display_exec_start(execution)

    def _on_exec_progress(self, event: Event):
        """工具执行进度"""
        progress = event.data.get("progress", "")
        if self._visible:
            self.console.print(f"  [dim yellow]... {progress}[/dim yellow]")

    def _on_exec_result(self, event: Event):
        """工具执行结果"""
        success = event.data.get("success", False)
        result_data = {
            "success": success,
            "result": event.data.get("result", "") if success else None,
            "error": event.data.get("error", "未知错误") if not success else None,
        }

        # 更新最后一条执行记录
        if self.executions:
            self.executions[-1]["result"] = result_data
            self.executions[-1]["success"] = success
        self._display_exec_result(result_data)

    # ------------------------------------------------------------------
    # 公共方法
    # ------------------------------------------------------------------

    def toggle_detail_mode(self) -> bool:
        """切换详细/简洁模式"""
        self._detail_mode = not self._detail_mode
        return self._detail_mode

    def add_execution(
        self,
        tool: str,
        params: dict,
        script: Optional[str] = None,
        result: Optional[dict] = None,
        iteration: int = 0,
    ):
        """手动添加一条执行记录"""
        execution = {
            "tool": tool,
            "params": params,
            "script": script,
            "iteration": iteration,
            "result": result,
            "success": result.get("success") if result else None,
        }
        self.executions.append(execution)

    def clear(self):
        """清除所有执行记录"""
        self.executions.clear()

    # ------------------------------------------------------------------
    # 渲染
    # ------------------------------------------------------------------

    def render_execution(self, execution: dict) -> Panel:
        """渲染单条执行记录"""
        tool = execution["tool"]
        params = execution["params"]
        script = execution.get("script")
        iteration = execution.get("iteration", 0)

        if self._detail_mode:
            return self._render_detail(tool, params, script, iteration)
        else:
            return self._render_compact(tool, params, iteration)

    def _render_detail(
        self,
        tool: str,
        params: dict,
        script: Optional[str],
        iteration: int,
    ) -> Panel:
        """详细模式渲染"""
        from rich.console import Group

        renderables = []

        # 工具信息表
        tool_table = Table(show_header=False, box=None, padding=(0, 1))
        tool_table.add_column(style="bold cyan", width=12)
        tool_table.add_column(style="white")
        tool_table.add_row("工具名称", f"[bold yellow]{tool}[/bold yellow]")
        if iteration:
            tool_table.add_row("迭代次数", f"[dim]{iteration}[/dim]")

        renderables.append(Text.from_markup("[bold]工具信息:[/bold]"))
        renderables.append(tool_table)

        # 参数表
        if params:
            params_table = Table(
                show_header=True, header_style="bold", box=None, padding=(0, 1)
            )
            params_table.add_column("参数名", style="cyan", width=20)
            params_table.add_column("参数值", style="white")

            for key, value in params.items():
                if isinstance(value, (dict, list)):
                    value_str = json.dumps(value, ensure_ascii=False, indent=2)
                else:
                    value_str = str(value)
                params_table.add_row(key, value_str)

            renderables.append(Text(""))
            renderables.append(Text.from_markup("[bold]参数信息:[/bold]"))
            renderables.append(params_table)

        if script:
            renderables.append(Text(""))
            renderables.append(Text.from_markup("[bold]执行脚本/代码:[/bold]"))
            renderables.append(Markdown(f"```\n{script}\n```"))

        return Panel(
            Group(*renderables),
            title=f"[bold yellow]Execution - {tool}[/bold yellow]",
            border_style="yellow",
            box=box.ROUNDED,
            padding=(1, 2),
        )

    def _render_compact(self, tool: str, params: dict, iteration: int) -> Panel:
        """简洁模式渲染"""
        params_str = ", ".join(f"{k}={v}" for k, v in params.items())
        if len(params_str) > 80:
            params_str = params_str[:77] + "..."
        content = f"[yellow]{tool}[/yellow]({params_str})"
        iter_label = f" #{iteration}" if iteration else ""
        return Panel(
            content,
            title=f"[bold yellow]Exec{iter_label}[/bold yellow]",
            border_style="yellow",
            box=box.ROUNDED,
            padding=(0, 1),
        )

    def _display_exec_start(self, execution: dict):
        """显示执行开始"""
        if self._visible:
            self.console.print(self.render_execution(execution))

    def _display_exec_result(self, result: dict):
        """显示执行结果"""
        if not self._visible:
            return

        if result.get("success", False):
            result_content = result.get("result", "")
            if isinstance(result_content, (dict, list)):
                result_content = json.dumps(
                    result_content, ensure_ascii=False, indent=2
                )
            else:
                result_content = str(result_content)

            # 截断过长结果
            if len(result_content) > 2000:
                result_content = result_content[:2000] + "\n... (结果已截断)"

            self.console.print(
                Panel(
                    Markdown(result_content),
                    title="[bold green]Result - Success[/bold green]",
                    border_style="green",
                    box=box.ROUNDED,
                    padding=(1, 2),
                )
            )
        else:
            error = result.get("error", "未知错误")
            self.console.print(
                Panel(
                    Markdown(str(error)),
                    title="[bold red]Result - Failed[/bold red]",
                    border_style="red",
                    box=box.ROUNDED,
                    padding=(1, 2),
                )
            )

    def display(self):
        """显示最后一条执行记录"""
        if self._visible and self.executions:
            latest = self.executions[-1]
            self.console.print(self.render_execution(latest))
            if latest.get("result"):
                self._display_exec_result(latest["result"])
