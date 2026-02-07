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
    PROMPT_TOOLKIT_AVAILABLE = True
except ImportError:
    PROMPT_TOOLKIT_AVAILABLE = False
    PromptSession = None
    FileHistory = None
    InMemoryHistory = None
    Style = None


class EnhancedInput:
    """增强的输入框，支持历史记录、光标移动等功能，类似 opencode 风格"""
    
    def __init__(
        self,
        history_file: Optional[Path] = None,
        prompt: str = "",
        placeholder: str = "Ask anything...",
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
            
            # 创建会话
            # prompt_toolkit默认支持：
            # - 上下键：历史记录导航
            # - 左右键：光标移动
            # - Ctrl+Left/Right：按词移动
            # - Home/End：行首/行尾
            # - Ctrl+A/E：行首/行尾（macOS风格）
            self.session = PromptSession(
                history=history,
                style=style,
            )
        except Exception as e:
            # 如果初始化失败，回退到标准输入
            print(f"[警告] prompt_toolkit 初始化失败，使用标准输入: {e}", file=sys.stderr)
            self.use_prompt_toolkit = False
    
    def prompt_input(self, message: Optional[str] = None) -> str:
        """
        显示类似 opencode 风格的输入框并获取用户输入
        
        Args:
            message: 可选的提示消息
            
        Returns:
            用户输入的字符串
        """
        prompt_text = message if message else self.prompt
        
        # 如果 prompt_toolkit 不可用，使用标准 input
        if not self.use_prompt_toolkit:
            # 显示类似 opencode 的输入框（但不显示输入提示，让input处理）
            self._display_opencode_style_input("")
            try:
                # 用户直接在输入框内输入（使用简单的提示符）
                user_input = input("> ")
                return user_input
            except (KeyboardInterrupt, EOFError):
                return ""
        
        try:
            # 检查是否在异步环境中
            import asyncio
            try:
                loop = asyncio.get_running_loop()
                # 如果在异步环境中，使用标准输入避免阻塞
                print(f"[警告] 检测到异步环境，prompt_toolkit 可能阻塞，使用标准输入", file=sys.stderr)
                self.use_prompt_toolkit = False
                # 显示输入框样式
                self._display_opencode_style_input("")
                # 使用标准输入
                if prompt_text:
                    return input(prompt_text)
                else:
                    return input("> ")
            except RuntimeError:
                # 不在异步环境中，可以使用 prompt_toolkit
                pass
            
            # 在非异步环境中，可以使用 prompt_toolkit
            # 先显示输入框样式
            self._display_opencode_style_input("")
            
            # 使用 prompt_toolkit 获取输入，用户直接在输入框内输入
            # 使用空字符串作为prompt，让输入框看起来更干净
            text = self.session.prompt(
                "",  # 空prompt，输入框已经显示了
                placeholder=self.placeholder,
            )
            return text
        except KeyboardInterrupt:
            # 用户按Ctrl+C，返回空字符串或特殊标记
            return ""
        except EOFError:
            # 用户按Ctrl+D，退出
            return ""
        except Exception as e:
            # 如果 prompt_toolkit 出现问题，回退到标准 input
            print(f"[警告] prompt_toolkit 出错，使用标准输入: {e}", file=sys.stderr)
            self.use_prompt_toolkit = False
            try:
                return input(prompt_text)
            except (KeyboardInterrupt, EOFError):
                return ""
    
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
    
    def _display_opencode_style_input(self, prompt: str = ""):
        """显示类似 opencode 风格的输入框，更简洁的设计"""
        from rich.text import Text
        from rich import box
        
        # 创建简洁的输入框，类似 opencode 风格
        # 使用圆角边框，但更简洁
        placeholder_text = Text(self.placeholder, style="dim")
        
        # 创建输入框显示（高度适中，不会太大）
        input_display = Panel(
            placeholder_text,
            border_style="bright_blue",
            box=box.ROUNDED,
            padding=(1, 2),
            height=2  # 减小高度，更紧凑
        )
        self.console.print(input_display)
        
        # 显示建议栏（类似 opencode 的 "Build DeepSeek Reasoner"）
        # Build 表示编码模式，显示当前使用的 agent
        agent_display = self.current_agent.capitalize()
        other_agent = "SuperHackbot" if self.current_agent == "hackbot" else "Hackbot"
        
        try:
            from utils.opencode_layout import create_suggestions_bar
            suggestions = create_suggestions_bar([agent_display, other_agent])
            self.console.print(suggestions)
        except (ImportError, Exception):
            # 如果导入失败，使用简单的文本
            suggestion_text = Text(agent_display, style="bold bright_blue")
            suggestion_text.append(f" {other_agent}", style="dim")
            self.console.print(suggestion_text)