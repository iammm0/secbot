"""
输出组件管理器：管理终端输出的不同组件
支持规划组件、推理组件、执行组件、正文组件、报告总结组件
"""
from typing import List, Dict, Optional
from rich.console import Console
from rich.panel import Panel
from rich.live import Live
from rich.layout import Layout
from rich.text import Text
from rich.table import Table
from datetime import datetime


class OutputComponentManager:
    """输出组件管理器"""
    
    def __init__(self, console: Console):
        self.console = console
        self.components = {
            "planning": [],  # 规划组件
            "reasoning": [],  # 推理组件
            "execution": [],  # 执行组件
            "content": [],  # 正文组件
            "report": []  # 报告总结组件
        }
        self.current_iteration = 0
        self.current_component = None
    
    def add_planning(self, content: str):
        """添加规划内容"""
        self.components["planning"].append({
            "content": content,
            "timestamp": datetime.now(),
            "iteration": self.current_iteration
        })
        self._display_planning(content)
    
    def add_reasoning(self, content: str, iteration: int = None):
        """添加推理内容"""
        if iteration is not None:
            self.current_iteration = iteration
        self.components["reasoning"].append({
            "content": content,
            "timestamp": datetime.now(),
            "iteration": self.current_iteration
        })
        self._display_reasoning(content, self.current_iteration)
    
    def add_execution(self, tool: str, params: dict, script: str = None, result: dict = None, iteration: int = None):
        """添加执行内容"""
        if iteration is not None:
            self.current_iteration = iteration
        execution_data = {
            "tool": tool,
            "params": params,
            "script": script,
            "result": result,
            "timestamp": datetime.now(),
            "iteration": self.current_iteration
        }
        self.components["execution"].append(execution_data)
        self._display_execution(execution_data)
    
    def add_content(self, content: str):
        """添加正文内容"""
        self.components["content"].append({
            "content": content,
            "timestamp": datetime.now()
        })
        self._display_content(content)
    
    def add_report(self, content: str):
        """添加报告总结内容"""
        self.components["report"].append({
            "content": content,
            "timestamp": datetime.now()
        })
        self._display_report(content)
    
    def _display_planning(self, content: str):
        """显示规划组件"""
        self.console.print(
            Panel(
                content,
                title="[bold magenta]📋 规划组件[/bold magenta]",
                border_style="magenta",
                padding=(1, 2)
            )
        )
    
    def _display_reasoning(self, content: str, iteration: int):
        """显示推理组件"""
        self.console.print(
            Panel(
                content,
                title=f"[bold cyan]🧠 推理组件 - 迭代 {iteration}[/bold cyan]",
                border_style="cyan",
                padding=(1, 2)
            )
        )
    
    def _display_execution(self, execution_data: dict):
        """显示执行组件，使用特定组件渲染工具和参数"""
        tool = execution_data["tool"]
        params = execution_data["params"]
        script = execution_data.get("script")
        result = execution_data.get("result")
        iteration = execution_data.get("iteration", 1)
        
        # 使用表格渲染工具信息
        tool_table = Table(show_header=False, box=None, padding=(0, 1))
        tool_table.add_column(style="bold cyan", width=12)
        tool_table.add_column(style="white")
        tool_table.add_row("工具名称", f"[bold yellow]{tool}[/bold yellow]")
        tool_table.add_row("迭代次数", f"[dim]{iteration}[/dim]")
        
        # 使用表格渲染参数
        params_table = Table(show_header=True, header_style="bold", box=None, padding=(0, 1))
        params_table.add_column("参数名", style="cyan", width=20)
        params_table.add_column("参数值", style="white")
        
        # 格式化参数
        import json
        for key, value in params.items():
            if isinstance(value, (dict, list)):
                value_str = json.dumps(value, ensure_ascii=False, indent=2)
            else:
                value_str = str(value)
            params_table.add_row(key, value_str)
        
        # 构建执行信息
        execution_parts = []
        execution_parts.append("[bold]工具信息:[/bold]")
        execution_parts.append("")
        execution_parts.append(str(tool_table))
        execution_parts.append("")
        execution_parts.append("[bold]参数信息:[/bold]")
        execution_parts.append("")
        execution_parts.append(str(params_table))
        
        if script:
            execution_parts.append("")
            execution_parts.append("[bold]执行的脚本/代码:[/bold]")
            execution_parts.append("")
            execution_parts.append(f"[dim]{script}[/dim]")
        
        execution_info = "\n".join(execution_parts)
        
        self.console.print(
            Panel(
                execution_info,
                title=f"[bold yellow]⚡ 执行组件 - 迭代 {iteration}[/bold yellow]",
                border_style="yellow",
                padding=(1, 2)
            )
        )
        
        # 执行结果
        if result:
            if result.get("success", False):
                result_content = result.get("result", "")
                # 格式化结果
                if isinstance(result_content, (dict, list)):
                    result_content = json.dumps(result_content, ensure_ascii=False, indent=2)
                else:
                    result_content = str(result_content)
                
                self.console.print(
                    Panel(
                        result_content,
                        title="[bold green]✓ 执行结果[/bold green]",
                        border_style="green",
                        padding=(1, 2)
                    )
                )
            else:
                error = result.get("error", "未知错误")
                self.console.print(
                    Panel(
                        error,
                        title="[bold red]✗ 执行失败[/bold red]",
                        border_style="red",
                        padding=(1, 2)
                    )
                )
    
    def _display_content(self, content: str):
        """显示正文组件"""
        self.console.print(
            Panel(
                content,
                title="[bold blue]📄 正文组件[/bold blue]",
                border_style="blue",
                padding=(1, 2)
            )
        )
    
    def _display_report(self, content: str):
        """显示报告总结组件"""
        self.console.print(
            Panel(
                content,
                title="[bold green]📊 报告总结组件[/bold green]",
                border_style="green",
                padding=(1, 2)
            )
        )
    
    def get_summary(self) -> str:
        """获取所有组件的摘要"""
        summary_parts = []
        
        if self.components["planning"]:
            summary_parts.append("## 规划组件")
            for item in self.components["planning"]:
                summary_parts.append(f"- {item['content'][:100]}...")
        
        if self.components["reasoning"]:
            summary_parts.append(f"\n## 推理组件 (共 {len(self.components['reasoning'])} 次推理)")
        
        if self.components["execution"]:
            summary_parts.append(f"\n## 执行组件 (共 {len(self.components['execution'])} 次执行)")
            for item in self.components["execution"]:
                summary_parts.append(f"- {item['tool']}: {item.get('result', {}).get('success', False)}")
        
        if self.components["content"]:
            summary_parts.append(f"\n## 正文组件 (共 {len(self.components['content'])} 条)")
        
        if self.components["report"]:
            summary_parts.append(f"\n## 报告总结组件 (共 {len(self.components['report'])} 条)")
        
        return "\n".join(summary_parts)
