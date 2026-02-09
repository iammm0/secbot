"""
增强的输入框模块，使用prompt_toolkit实现历史记录和光标移动功能
类似 opencode 风格的输入框
"""
from typing import Optional, List
import sys
from pathlib import Path
import os
from rich.console import Console
from rich.panel import Panel
from rich.text import Text
from rich import box

# 尝试导入 prompt_toolkit，如果失败则使用标准输入
try:
    from prompt_toolkit import PromptSession
    from prompt_toolkit.history import FileHistory, InMemoryHistory
    from prompt_toolkit.styles import Style
    from prompt_toolkit.completion import Completer, Completion
    from prompt_toolkit.document import Document
    PROMPT_TOOLKIT_AVAILABLE = True
except ImportError:
    PROMPT_TOOLKIT_AVAILABLE = False
    PromptSession = None
    FileHistory = None
    InMemoryHistory = None
    Style = None
    Completer = None
    Completion = None
    Document = None


class _SlashCommandCompleter:
    """输入 '/' 后对斜杠命令进行补全的 Completer（同步+异步接口）"""

    def __init__(self):
        try:
            from utils.slash_commands import get_slash_completions
            self._get_completions = get_slash_completions
        except Exception:
            self._get_completions = lambda p: []

    def _yield_completions(self, document):
        text_before = document.text_before_cursor.strip()
        if not text_before.startswith("/"):
            return
        for cmd in self._get_completions(text_before):
            yield Completion(cmd, start_position=-len(document.text_before_cursor))

    def get_completions(self, document, complete_event):
        yield from self._yield_completions(document)

    async def get_completions_async(self, document, complete_event):
        """prompt_toolkit 在异步环境下会调用此方法，需实现以免报错。"""
        for c in self._yield_completions(document):
            yield c


class EnhancedInput:
    """增强的输入框，支持历史记录、光标移动等功能，类似 opencode 风格"""
    
    def __init__(
        self,
        history_file: Optional[Path] = None,
        prompt: str = "",
        placeholder: str = "在此输入，输入 / 可补全命令",
        console: Optional[Console] = None,
        current_agent: str = "hackbot",
    ):
        """
        初始化增强输入框
        
        Args:
            history_file: 历史记录文件路径，如果为None则使用内存历史
            prompt: 提示符
            placeholder: 占位符文本
        """
        self.prompt = prompt
        self.placeholder = placeholder
        self.use_prompt_toolkit = PROMPT_TOOLKIT_AVAILABLE
        self.history_file = history_file
        self.history_list = []  # 简单的历史记录列表
        self.history_index = -1
        self.console = console or Console()
        self.current_agent = current_agent  # 当前使用的agent
        
        if not self.use_prompt_toolkit:
            # 如果 prompt_toolkit 不可用，使用简单的历史记录
            if history_file and history_file.exists():
                try:
                    with open(history_file, 'r', encoding='utf-8') as f:
                        self.history_list = [line.strip() for line in f if line.strip()]
                except Exception:
                    self.history_list = []
            return
        
        # 设置历史记录
        try:
            if history_file:
                history_file.parent.mkdir(parents=True, exist_ok=True)
                history = FileHistory(str(history_file))
            else:
                history = InMemoryHistory()
            
            # 定义样式
            style = Style.from_dict({
                'prompt': 'cyan bold',
                'input': 'white',
                'placeholder': 'dim',
            })
            
            # 创建会话（带斜杠命令补全：输入 / 后自动补全）
            # prompt_toolkit 默认支持：上下键历史、左右键光标、/ 触发补全
            self.session = PromptSession(
                history=history,
                style=style,
                completer=_SlashCommandCompleter() if Completer else None,
            )
        except Exception as e:
            # 如果初始化失败，回退到标准输入
            print(f"[警告] prompt_toolkit 初始化失败，使用标准输入: {e}", file=sys.stderr)
            self.use_prompt_toolkit = False
    
    def prompt_input(self, message: Optional[str] = None) -> str:
        """
        显示 OpenCode 风格输入框，光标在框内输入；输入 / 可补全斜杠命令。
        同步调用时直接在本线程运行；异步环境请使用 await prompt_input_async()。
        """
        panel_placeholder = message if message else self.placeholder
        if not self.use_prompt_toolkit:
            return self._prompt_fallback(panel_placeholder)
        try:
            return self._run_prompt_inside_box(panel_placeholder)
        except KeyboardInterrupt:
            return ""
        except EOFError:
            return ""
        except Exception as e:
            print(f"[警告] prompt_toolkit 出错，使用标准输入: {e}", file=sys.stderr)
            self.use_prompt_toolkit = False
            return self._prompt_fallback(panel_placeholder)

    async def prompt_input_async(self, message: Optional[str] = None) -> str:
        """
        异步用：在子线程跑 prompt_toolkit，不阻塞事件循环，保留 / 补全与历史。
        交互模式在 async 中应调用此方法而非 prompt_input。
        """
        import asyncio
        panel_placeholder = message if message else self.placeholder
        if not self.use_prompt_toolkit:
            return self._prompt_fallback(panel_placeholder)
        try:
            return await asyncio.to_thread(
                self._run_prompt_inside_box,
                panel_placeholder,
            )
        except KeyboardInterrupt:
            return ""
        except EOFError:
            return ""
        except Exception as e:
            print(f"[警告] prompt_toolkit 出错，使用标准输入: {e}", file=sys.stderr)
            self.use_prompt_toolkit = False
            return self._prompt_fallback(panel_placeholder)

    def _run_prompt_inside_box(self, placeholder: str) -> str:
        """在「框内」运行 prompt_toolkit（上边框 + │ 输入行 + 下边框），支持 / 补全。"""
        self._print_input_box_top()
        self._print_suggestions_bar()
        try:
            text = self.session.prompt(
                "│ ",
                placeholder=placeholder,
            )
        finally:
            self._print_input_box_bottom()
        return text

    def _prompt_fallback(self, placeholder: str) -> str:
        """无 prompt_toolkit 时：同样框内输入（上边框 + │ 输入 + 下边框）。"""
        self._print_input_box_top()
        self._print_suggestions_bar()
        try:
            user_input = input("│ ")
        except (KeyboardInterrupt, EOFError):
            user_input = ""
        finally:
            self._print_input_box_bottom()
        return user_input
    
    def add_to_history(self, text: str):
        """手动添加文本到历史记录"""
        if not text.strip():
            return
        
        if self.use_prompt_toolkit:
            try:
                self.session.history.append_string(text)
            except Exception:
                pass
        
        # 同时保存到简单历史记录列表
        if text.strip() not in self.history_list:
            self.history_list.append(text.strip())
            # 限制历史记录数量
            if len(self.history_list) > 1000:
                self.history_list = self.history_list[-1000:]
            
            # 保存到文件
            if self.history_file:
                try:
                    with open(self.history_file, 'a', encoding='utf-8') as f:
                        f.write(text.strip() + '\n')
                except Exception:
                    pass
    
    # 输入框宽度（字符数），与框内输入行一致
    _INPUT_BOX_WIDTH = 50

    def _print_input_box_top(self):
        """打印输入框上边框（╭─ 输入 ───╮），光标下一行在框内。"""
        w = self._INPUT_BOX_WIDTH
        title = " 输入 "
        rest = w - 2 - len(title)
        left = rest // 2
        right = rest - left
        line = "╭" + "─" * left + title + "─" * right + "╮"
        self.console.print(f"[bright_blue]{line}[/bright_blue]")

    def _print_input_box_bottom(self):
        """打印输入框下边框（╰──────╯）。"""
        w = self._INPUT_BOX_WIDTH
        self.console.print(f"[bright_blue]╰{'─' * (w - 2)}╯[/bright_blue]")

    def _print_suggestions_bar(self):
        """打印建议栏（Hackbot  SuperHackbot  输入 / 补全命令），在框上方。"""
        agent_display = self.current_agent.capitalize()
        other_agent = "SuperHackbot" if self.current_agent == "hackbot" else "Hackbot"
        try:
            from utils.opencode_layout import create_suggestions_bar
            suggestions = create_suggestions_bar([agent_display, other_agent, "输入 / 补全命令"])
            self.console.print(suggestions)
        except (ImportError, Exception):
            from rich.text import Text
            t = Text(agent_display, style="bold bright_blue")
            t.append(f"  {other_agent}", style="dim")
            t.append("  输入 / 补全命令", style="dim")
            self.console.print(t)

    def _display_opencode_input_panel(self, placeholder_override: Optional[str] = None):
        """兼容旧调用：画框顶+建议栏，实际输入由 prompt_input 内框内行完成。"""
        self._print_input_box_top()
        self._print_suggestions_bar()

    def _display_opencode_style_input(self, prompt: str = ""):
        """兼容旧调用"""
        self._display_opencode_input_panel()