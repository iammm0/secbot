"""
OpenCode 风格输入框

视觉效果:
  ╭── > hackbot ───────────────────────────────────────────╮
  │                                                        │
  ╰──────────── / commands · ↑↓ history · enter send ──────╯

功能：
  - ↑↓ 历史记录切换
  - / 命令自动补全
  - Enter 发送
  - placeholder 占位提示
  - 自适应终端宽度，窄窗口不溢出
"""
from typing import Optional
import sys
from pathlib import Path
from rich.console import Console

# prompt_toolkit 可选
try:
    from prompt_toolkit import PromptSession
    from prompt_toolkit.history import FileHistory, InMemoryHistory
    from prompt_toolkit.styles import Style as PTStyle
    from prompt_toolkit.completion import Completion
    from prompt_toolkit.patch_stdout import patch_stdout
    PROMPT_TOOLKIT_AVAILABLE = True
except ImportError:
    PROMPT_TOOLKIT_AVAILABLE = False


# 最小可用宽度（低于此值使用极简边框）
MIN_FANCY_WIDTH = 30


# ------------------------------------------------------------------
# 斜杠命令补全器
# ------------------------------------------------------------------
class _SlashCompleter:
    """输入 / 后进行斜杠命令补全，选项带简要说明"""

    def __init__(self):
        try:
            from utils.slash_commands import get_slash_completions_with_descriptions
            self._fn = get_slash_completions_with_descriptions
        except Exception:
            self._fn = lambda _: []

    def get_completions(self, document, complete_event):
        text = document.text_before_cursor.strip()
        if not text.startswith("/"):
            return
        for cmd, desc in self._fn(text):
            display = f"{cmd}  —  {desc}" if desc else cmd
            yield Completion(cmd, start_position=-len(text), display=display)

    async def get_completions_async(self, document, complete_event):
        for c in self.get_completions(document, complete_event):
            yield c


# ------------------------------------------------------------------
# 核心输入组件
# ------------------------------------------------------------------
class EnhancedInput:
    """OpenCode 风格的终端输入框（自适应宽度）"""

    def __init__(
        self,
        history_file: Optional[Path] = None,
        prompt: str = "",
        placeholder: str = '输入 / 快捷操作，或直接给我下达任务…',
        console: Optional[Console] = None,
        current_agent: str = "hackbot",
        current_mode: str = "默认",
    ):
        self.placeholder = placeholder
        self.console = console or Console()
        self.current_agent = current_agent
        self.current_mode = current_mode  # 默认 | Ask | Plan | 模拟攻击
        self.use_prompt_toolkit = PROMPT_TOOLKIT_AVAILABLE and sys.stdin.isatty()

        if not self.use_prompt_toolkit:
            return

        # ---- prompt_toolkit 初始化 ----
        try:
            if history_file:
                history_file.parent.mkdir(parents=True, exist_ok=True)
                history = FileHistory(str(history_file))
            else:
                history = InMemoryHistory()

            style = PTStyle.from_dict({
                "": "fg:#d4d4d4",
                "prompt": "fg:#61afef bold",
                "placeholder": "fg:#5c6370 italic",
            })

            # 不自定义 key_bindings，使用 prompt_toolkit 默认行为
            # 默认 multiline=False：Enter 提交，↑↓ 切换历史
            self._session = PromptSession(
                history=history,
                style=style,
                completer=_SlashCompleter(),
                enable_open_in_editor=False,
                mouse_support=False,
            )
        except Exception:
            self.use_prompt_toolkit = False

    # ------------------------------------------------------------------
    # 公开 API
    # ------------------------------------------------------------------

    def prompt_input(self, message: Optional[str] = None) -> str:
        placeholder = message or self.placeholder
        if not self.use_prompt_toolkit:
            return self._fallback(placeholder)
        try:
            return self._run(placeholder)
        except (KeyboardInterrupt, EOFError):
            return ""
        except Exception:
            self.use_prompt_toolkit = False
            return self._fallback(placeholder)

    async def prompt_input_async(self, message: Optional[str] = None) -> str:
        """异步输入：使用 prompt_toolkit 原生异步接口，确保键位正常工作"""
        placeholder = message or self.placeholder
        if not self.use_prompt_toolkit:
            return self._fallback(placeholder)
        try:
            return await self._run_async(placeholder)
        except (KeyboardInterrupt, EOFError):
            return ""
        except Exception:
            self.use_prompt_toolkit = False
            return self._fallback(placeholder)

    def add_to_history(self, text: str):
        if not text.strip():
            return
        if self.use_prompt_toolkit:
            try:
                self._session.history.append_string(text)
            except Exception:
                pass

    # ------------------------------------------------------------------
    # 自适应宽度的边框
    # ------------------------------------------------------------------

    def _get_width(self) -> int:
        """获取当前终端宽度（每次实时获取，应对窗口缩放）"""
        try:
            return self.console.width or 80
        except Exception:
            return 80

    def _print_top_border(self):
        """打印上边框（自适应宽度），清晰标记当前模式"""
        w = self._get_width()
        mode = getattr(self, "current_mode", "默认")

        if w < MIN_FANCY_WIDTH:
            self.console.print(f"[bright_blue]── 模式: {mode} ──[/bright_blue]")
            return

        # 模式：默认 | Ask | Plan | 模拟攻击
        title = f" 模式: {mode} "
        inner = w - 2
        left = 2
        right = max(0, inner - left - len(title))
        self.console.print(
            f"[bright_blue]╭{'─' * left}{title}{'─' * right}╮[/bright_blue]"
        )

    def _print_bottom_border(self):
        """打印下边框（自适应宽度）"""
        w = self._get_width()

        if w < MIN_FANCY_WIDTH:
            # 极窄窗口：简化边框
            self.console.print("[bright_blue]──────────────[/bright_blue]")
            return

        inner = w - 2  # 减去 ╰ 和 ╯
        hint = " / commands · ↑↓ history · enter send "

        # 如果宽度不够放完整 hint，截断
        if inner < len(hint) + 2:
            hint = " /cmd · ↑↓ · enter "
        if inner < len(hint) + 2:
            hint = ""

        right_b = max(0, inner - len(hint))
        self.console.print(
            f"[bright_blue]╰{'─' * right_b}{hint}╯[/bright_blue]"
        )

    # ------------------------------------------------------------------
    # 内部实现
    # ------------------------------------------------------------------

    def _run(self, placeholder: str) -> str:
        """同步模式运行（阻塞）"""
        self._print_top_border()
        try:
            text = self._session.prompt(
                "│ ",
                placeholder=placeholder,
            )
        except (KeyboardInterrupt, EOFError):
            text = ""
        self._print_bottom_border()
        return text

    async def _run_async(self, placeholder: str) -> str:
        """异步模式运行：使用 prompt_toolkit 原生的 prompt_async，键位完全正常"""
        self._print_top_border()
        try:
            with patch_stdout():
                text = await self._session.prompt_async(
                    "│ ",
                    placeholder=placeholder,
                )
        except (KeyboardInterrupt, EOFError):
            text = ""
        self._print_bottom_border()
        return text

    def _fallback(self, placeholder: str) -> str:
        """无 prompt_toolkit 时的简洁回退"""
        self._print_top_border()
        try:
            text = input("│ ")
        except (KeyboardInterrupt, EOFError):
            text = ""
        self._print_bottom_border()
        return text
