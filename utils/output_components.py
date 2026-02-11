"""
输出组件管理器（向后兼容层）：
原始 v1 接口保留不变，内部转发到新的 tui/components/ 展示组件。
chat 命令和其他非交互式命令通过此接口渲染输出。
"""
from typing import List, Dict, Optional
from rich.console import Console
from rich.panel import Panel
from rich.live import Live
from rich.layout import Layout
from rich.text import Text
from rich.table import Table
from datetime import datetime
from tui.utils import smart_render_text


class OutputComponentManager:
    """输出组件管理器（向后兼容 + 新组件桥接）"""

    def __init__(self, console: Console):
        self.console = console
        self.components = {
            "planning": [],
            "reasoning": [],
            "execution": [],
            "content": [],
            "report": [],
        }
        self.current_iteration = 0
        self.current_component = None

        # 尝试初始化新组件（可选，失败不影响基本功能）
        self._planning = None
        self._reasoning = None
        self._execution = None
        self._content = None
        self._report = None
        try:
            from tui.components.planning import PlanningComponent
            from tui.components.reasoning import ReasoningComponent
            from tui.components.execution import ExecutionComponent
            from tui.components.content import ContentComponent
            from tui.components.report import ReportComponent

            self._planning = PlanningComponent(console)
            self._reasoning = ReasoningComponent(console)
            self._execution = ExecutionComponent(console)
            self._content = ContentComponent(console)
            self._report = ReportComponent(console)
        except Exception:
            pass

    def add_planning(self, content: str):
        """添加规划内容"""
        self.components["planning"].append({
            "content": content,
            "timestamp": datetime.now(),
            "iteration": self.current_iteration,
        })
        self._display_planning(content)

    def add_reasoning(self, content: str, iteration: int = None):
        """添加推理内容"""
        if iteration is not None:
            self.current_iteration = iteration
        self.components["reasoning"].append({
            "content": content,
            "timestamp": datetime.now(),
            "iteration": self.current_iteration,
        })
        if self._reasoning:
            self._reasoning.add_thought(content, self.current_iteration)
            self._reasoning.display()
        else:
            self._display_reasoning(content, self.current_iteration)

    def add_execution(
        self, tool: str, params: dict, script: str = None,
        result: dict = None, iteration: int = None,
    ):
        """添加执行内容"""
        if iteration is not None:
            self.current_iteration = iteration
        execution_data = {
            "tool": tool,
            "params": params,
            "script": script,
            "result": result,
            "timestamp": datetime.now(),
            "iteration": self.current_iteration,
        }
        self.components["execution"].append(execution_data)
        if self._execution:
            self._execution.add_execution(
                tool=tool, params=params, script=script,
                result=result, iteration=self.current_iteration,
            )
            self._execution.display()
        else:
            self._display_execution(execution_data)

    def add_content(self, content: str):
        """添加正文内容"""
        self.components["content"].append({
            "content": content,
            "timestamp": datetime.now(),
        })
        if self._content:
            self._content.display_content(content)
        else:
            self._display_content(content)

    def add_report(self, content: str):
        """添加报告总结内容"""
        self.components["report"].append({
            "content": content,
            "timestamp": datetime.now(),
        })
        if self._report:
            self._report.set_report(content)
            self._report.display()
        else:
            self._display_report(content)

    # ------------------------------------------------------------------
    # 兜底渲染（当新组件未初始化时使用 Rich Panel）
    # ------------------------------------------------------------------

    def _display_planning(self, content: str):
        self.console.print(
            Panel(
                smart_render_text(content or "", prefer_markdown=True),
                title="[bold magenta]Planning[/bold magenta]",
                border_style="magenta",
                padding=(1, 2),
            )
        )

    def _display_reasoning(self, content: str, iteration: int):
        self.console.print(
            Panel(
                smart_render_text(content or "", prefer_markdown=True),
                title="[bold cyan]推理[/bold cyan]",
                border_style="cyan",
                padding=(1, 2),
            )
        )

    def _display_execution(self, execution_data: dict):
        import json

        tool = execution_data["tool"]
        params = execution_data["params"]
        script = execution_data.get("script")
        result = execution_data.get("result")

        tool_table = Table(show_header=False, box=None, padding=(0, 1))
        tool_table.add_column(style="bold cyan", width=12)
        tool_table.add_column(style="white")
        tool_table.add_row("工具名称", f"[bold yellow]{tool}[/bold yellow]")

        params_table = Table(show_header=True, header_style="bold", box=None, padding=(0, 1))
        params_table.add_column("参数名", style="cyan", width=20)
        params_table.add_column("参数值", style="white")

        for key, value in params.items():
            if isinstance(value, (dict, list)):
                value_str = json.dumps(value, ensure_ascii=False, indent=2)
            else:
                value_str = str(value)
            params_table.add_row(key, value_str)

        parts = ["[bold]工具信息:[/bold]", "", str(tool_table), "",
                  "[bold]参数信息:[/bold]", "", str(params_table)]
        if script:
            parts.extend(["", "[bold]执行脚本/代码:[/bold]", "", f"[dim]{script}[/dim]"])

        self.console.print(
            Panel(
                "\n".join(parts),
                title=f"[bold yellow]执行 - {tool}[/bold yellow]",
                border_style="yellow",
                padding=(1, 2),
            )
        )

        if result:
            if result.get("success", False):
                result_content = result.get("result", "")
                if isinstance(result_content, (dict, list)):
                    result_content = json.dumps(result_content, ensure_ascii=False, indent=2)
                else:
                    result_content = str(result_content)
                self.console.print(
                    Panel(
                        smart_render_text(result_content or "", prefer_markdown=True),
                        title="[bold green]Result - Success[/bold green]",
                        border_style="green",
                        padding=(1, 2),
                    )
                )
            else:
                error = result.get("error", "未知错误")
                self.console.print(
                    Panel(
                        smart_render_text(str(error), prefer_markdown=True),
                        title="[bold red]Result - Failed[/bold red]",
                        border_style="red",
                        padding=(1, 2),
                    )
                )

    def _display_content(self, content: str):
        self.console.print(
            Panel(
                smart_render_text(content or "", prefer_markdown=True),
                title="[bold blue]Content[/bold blue]",
                border_style="blue",
                padding=(1, 2),
            )
        )

    def _display_report(self, content: str):
        self.console.print(
            Panel(
                smart_render_text(content or "", prefer_markdown=True),
                title="[bold green]Report[/bold green]",
                border_style="green",
                padding=(1, 2),
            )
        )

    def get_summary(self) -> str:
        """获取所有组件的摘要"""
        summary_parts = []

        if self.components["planning"]:
            summary_parts.append("## Planning")
            for item in self.components["planning"]:
                summary_parts.append(f"- {item['content'][:100]}...")

        if self.components["reasoning"]:
            summary_parts.append(f"\n## Reasoning ({len(self.components['reasoning'])} iterations)")

        if self.components["execution"]:
            summary_parts.append(f"\n## Execution ({len(self.components['execution'])} actions)")
            for item in self.components["execution"]:
                summary_parts.append(f"- {item['tool']}: {item.get('result', {}).get('success', False)}")

        if self.components["content"]:
            summary_parts.append(f"\n## Content ({len(self.components['content'])} items)")

        if self.components["report"]:
            summary_parts.append(f"\n## Report ({len(self.components['report'])} items)")

        return "\n".join(summary_parts)
