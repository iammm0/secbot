"""
持久化终端会话工具：为 Agent 提供一个可持续交互的系统终端。
支持 open / open_external / exec / read / close / list。
- open: 进程内子进程终端，可 exec 发送命令并读输出
- open_external: 真正打开一个新的系统终端窗口（Windows: cmd/PowerShell，macOS: Terminal，Linux: gnome-terminal/xterm），
  可由 LLM 根据用户意图生成初始命令并在新窗口中执行。
"""

import asyncio
import os
import subprocess
import sys
import threading
import time
import uuid
from typing import Any, Dict, Optional, Tuple

from tools.base import BaseTool, ToolResult
from utils.logger import logger


_OUTPUT_SENTINEL = "__SECBOT_CMD_DONE__"

# 全局会话池（进程生命周期内共享）
_sessions: Dict[str, "TerminalSession"] = {}

# 单个会话最长空闲时间（秒），超过后自动回收
_SESSION_IDLE_TIMEOUT = 600


class TerminalSession:
    """一个持久化的 shell 子进程会话"""

    def __init__(self, session_id: str, cwd: Optional[str] = None):
        self.session_id = session_id
        self.cwd = cwd
        self.process: Optional[asyncio.subprocess.Process] = None
        self.output_buffer: str = ""
        self.last_active: float = time.time()
        self._reader_task: Optional[asyncio.Task] = None
        self._lock = asyncio.Lock()
        # Windows 备用：当 asyncio 子进程不可用时使用同步 Popen + 读线程
        self._sync_process: Optional[subprocess.Popen] = None
        self._buffer_lock: Optional[threading.Lock] = None
        self._reader_thread: Optional[threading.Thread] = None

    # ------------------------------------------------------------------
    # 启动
    # ------------------------------------------------------------------

    async def start(self) -> str:
        """启动 shell 子进程，返回会话欢迎信息"""
        cwd = self._resolve_cwd(self.cwd)

        if sys.platform == "win32":
            shell_cmd = [os.environ.get("COMSPEC", "cmd.exe")]
        elif sys.platform == "darwin":
            shell_cmd = [os.environ.get("SHELL", "/bin/zsh")]
        else:
            shell_cmd = [os.environ.get("SHELL", "/bin/bash")]

        env = os.environ.copy()
        env["TERM"] = "dumb"
        env["LANG"] = env.get("LANG", "en_US.UTF-8")

        try:
            self.process = await asyncio.create_subprocess_exec(
                *shell_cmd,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
                cwd=cwd,
                env=env,
            )
            self._reader_task = asyncio.create_task(self._read_loop())
        except NotImplementedError:
            return await self._start_sync_fallback(cwd, shell_cmd, env)

        self.last_active = time.time()
        await asyncio.sleep(0.3)
        banner = self._drain_buffer()
        shell_name = shell_cmd[0]
        return f"终端会话已启动 (shell={shell_name}, pid={self.process.pid})\n{banner}".strip()

    async def _start_sync_fallback(
        self, cwd: Optional[str], shell_cmd: list, env: dict
    ) -> str:
        """Windows 备用：使用 subprocess.Popen + 后台读线程，不依赖 asyncio 子进程。"""
        loop = asyncio.get_event_loop()

        def create_process() -> subprocess.Popen:
            return subprocess.Popen(
                shell_cmd,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                cwd=cwd,
                env=env,
            )

        self._sync_process = await loop.run_in_executor(None, create_process)
        self._buffer_lock = threading.Lock()
        self.output_buffer = ""

        def read_stdout() -> None:
            if not self._sync_process or not self._sync_process.stdout:
                return
            try:
                while self._sync_process.poll() is None:
                    chunk = self._sync_process.stdout.read(4096)
                    if not chunk:
                        break
                    text = chunk.decode("utf-8", errors="replace")
                    with self._buffer_lock:
                        self.output_buffer += text
                        if len(self.output_buffer) > 200_000:
                            self.output_buffer = self.output_buffer[-100_000:]
            except Exception:
                pass

        self._reader_thread = threading.Thread(target=read_stdout, daemon=True)
        self._reader_thread.start()
        self.last_active = time.time()
        await asyncio.sleep(0.3)
        banner = self._drain_buffer()
        shell_name = shell_cmd[0]
        return f"终端会话已启动 (sync fallback, shell={shell_name}, pid={self._sync_process.pid})\n{banner}".strip()

    # ------------------------------------------------------------------
    # 后台持续读取 stdout
    # ------------------------------------------------------------------

    async def _read_loop(self):
        """后台协程：持续读取子进程 stdout 并追加到 output_buffer"""
        assert self.process and self.process.stdout
        try:
            while True:
                chunk = await self.process.stdout.read(4096)
                if not chunk:
                    break
                text = chunk.decode("utf-8", errors="replace")
                self.output_buffer += text
                # 防止内存膨胀
                if len(self.output_buffer) > 200_000:
                    self.output_buffer = self.output_buffer[-100_000:]
        except (asyncio.CancelledError, Exception):
            pass

    # ------------------------------------------------------------------
    # 发送命令并等待输出
    # ------------------------------------------------------------------

    async def execute(self, command: str, timeout: float = 30.0) -> str:
        """
        向终端发送命令并等待输出稳定。
        通过在命令末尾追加一个 sentinel echo 来判断命令是否执行完毕。
        """
        if self._sync_process is not None:
            return await self._execute_sync(command, timeout)
        if not self.process or self.process.returncode is not None:
            raise RuntimeError("终端会话已关闭或未启动")

        async with self._lock:
            self.last_active = time.time()
            self._drain_buffer()
            if sys.platform == "win32":
                sentinel_cmd = f'{command}\r\necho {_OUTPUT_SENTINEL}\r\n'
            else:
                sentinel_cmd = f'{command}\necho {_OUTPUT_SENTINEL}\n'
            self.process.stdin.write(sentinel_cmd.encode("utf-8"))
            await self.process.stdin.drain()
            deadline = time.time() + timeout
            while time.time() < deadline:
                if _OUTPUT_SENTINEL in self.output_buffer:
                    break
                if self.process.returncode is not None:
                    break
                await asyncio.sleep(0.1)
            output = self._drain_buffer()
            output = self._clean_output(output, command)
            return output

    async def _execute_sync(self, command: str, timeout: float) -> str:
        """同步备用路径：写 stdin，轮询 output_buffer 直到出现 sentinel。"""
        if not self._sync_process or self._sync_process.poll() is not None:
            raise RuntimeError("终端会话已关闭或未启动")
        self.last_active = time.time()
        self._drain_buffer()
        if sys.platform == "win32":
            sentinel_cmd = f'{command}\r\necho {_OUTPUT_SENTINEL}\r\n'
        else:
            sentinel_cmd = f'{command}\necho {_OUTPUT_SENTINEL}\n'
        try:
            self._sync_process.stdin.write(sentinel_cmd.encode("utf-8"))
            self._sync_process.stdin.flush()
        except (BrokenPipeError, OSError) as e:
            raise RuntimeError(f"终端会话已关闭: {e}") from e
        deadline = time.time() + timeout
        while time.time() < deadline:
            with self._buffer_lock:
                buf = self.output_buffer
            if _OUTPUT_SENTINEL in buf:
                break
            if self._sync_process.poll() is not None:
                break
            await asyncio.sleep(0.1)
        output = self._drain_buffer()
        return self._clean_output(output, command)

    # ------------------------------------------------------------------
    # 读取当前缓冲区
    # ------------------------------------------------------------------

    def read(self) -> str:
        """读取当前缓冲区内容（不发送命令）"""
        self.last_active = time.time()
        return self._drain_buffer()

    # ------------------------------------------------------------------
    # 关闭
    # ------------------------------------------------------------------

    async def close(self) -> str:
        """关闭终端会话"""
        if self._sync_process is not None:
            try:
                self._sync_process.stdin.write(b"exit\n")
                self._sync_process.stdin.flush()
            except Exception:
                pass
            try:
                self._sync_process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                self._sync_process.kill()
                self._sync_process.wait()
            if self._reader_thread and self._reader_thread.is_alive():
                self._reader_thread.join(timeout=1)
            remaining = self._drain_buffer()
            self._sync_process = None
            self._buffer_lock = None
            self._reader_thread = None
            return f"终端会话已关闭 (session={self.session_id})\n{remaining}".strip()

        if self._reader_task:
            self._reader_task.cancel()
            try:
                await self._reader_task
            except asyncio.CancelledError:
                pass
        if self.process and self.process.returncode is None:
            try:
                self.process.stdin.write(b"exit\n")
                await self.process.stdin.drain()
            except Exception:
                pass
            try:
                await asyncio.wait_for(self.process.wait(), timeout=3.0)
            except asyncio.TimeoutError:
                self.process.kill()
                await self.process.wait()
        remaining = self._drain_buffer()
        return f"终端会话已关闭 (session={self.session_id})\n{remaining}".strip()

    @property
    def alive(self) -> bool:
        if self._sync_process is not None:
            return self._sync_process.poll() is None
        return self.process is not None and self.process.returncode is None

    # ------------------------------------------------------------------
    # 内部辅助
    # ------------------------------------------------------------------

    @staticmethod
    def _resolve_cwd(cwd: Optional[str]) -> Optional[str]:
        """解析并校验工作目录，Windows 下规范化盘符路径。"""
        if not cwd or not str(cwd).strip():
            return None
        raw = str(cwd).strip()
        if sys.platform == "win32":
            # 兼容 "C:", "C:\", "C:\\" 等，统一为可用的绝对路径
            if len(raw) <= 2 and raw.endswith(":"):
                raw = raw + os.sep
            raw = os.path.normpath(raw)
        path = os.path.abspath(raw)
        if not os.path.isdir(path):
            raise ValueError(f"工作目录不存在或不是目录: {path}")
        return path

    def _drain_buffer(self) -> str:
        """取出并清空输出缓冲区（同步备用路径下加锁）"""
        if self._buffer_lock:
            with self._buffer_lock:
                buf = self.output_buffer
                self.output_buffer = ""
            return buf
        buf = self.output_buffer
        self.output_buffer = ""
        return buf

    @staticmethod
    def _clean_output(output: str, command: str) -> str:
        """移除 sentinel 行和 echo 命令本身，保留有意义的输出"""
        lines = output.splitlines()
        cleaned: list[str] = []
        for line in lines:
            stripped = line.strip()
            if _OUTPUT_SENTINEL in stripped:
                continue
            if stripped == f"echo {_OUTPUT_SENTINEL}":
                continue
            cleaned.append(line)

        # 去除开头可能的命令回显（部分 shell 会回显输入）
        text = "\n".join(cleaned).strip()
        if text.startswith(command.strip()):
            text = text[len(command.strip()):].lstrip("\r\n")
        return text


# ======================================================================
# 会话池管理
# ======================================================================

def _cleanup_idle_sessions():
    """清理空闲超时的会话"""
    now = time.time()
    to_remove = [
        sid for sid, s in _sessions.items()
        if (now - s.last_active > _SESSION_IDLE_TIMEOUT) or not s.alive
    ]
    for sid in to_remove:
        session = _sessions.pop(sid, None)
        if session and session.alive:
            asyncio.create_task(session.close())


# ======================================================================
# TerminalSessionTool
# ======================================================================

class TerminalSessionTool(BaseTool):
    """
    持久化终端会话工具：让 Agent 可以打开一个系统终端，持续发送命令并观察输出。
    由 Agent 打开的终端仅由 Agent 通过 exec 执行命令，对用户为只读（用户仅可查看输出，不可在该终端中输入）。
    支持动作：
      - open  : 打开新终端会话（可选指定 cwd）
      - exec  : 向指定会话发送命令并等待输出
      - read  : 读取指定会话当前缓冲区（不发送命令）
      - close : 关闭指定会话
      - list  : 列出当前活跃的终端会话
    """

    sensitivity = "low"

    def __init__(self):
        super().__init__(
            name="terminal_session",
            description=(
                "持久化终端会话工具。由 Agent 打开的终端仅由 Agent 通过 exec 执行命令，对用户为只读（用户仅可查看输出，不可输入）。"
                "action=open: 进程内终端，可 exec 发命令并读输出。"
                "action=open_external: 真正打开一个新的系统终端窗口（Windows: cmd/PowerShell，Mac: Terminal，Linux: gnome-terminal/xterm）；可传 user_intent(用户意图) 由 LLM 生成初始命令在新窗口执行，或直接传 initial_command。"
                "action=exec/read/close/list: 同 open 会话配合使用。"
                "参数: action(open/open_external/exec/read/close/list), session_id, command(exec时), cwd(open/open_external时), initial_command(open_external时可选), user_intent(open_external时可选，由 LLM 转为命令), timeout(exec时默认30)"
            ),
        )

    async def execute(self, **kwargs) -> ToolResult:
        action = (kwargs.get("action") or "").strip().lower()
        session_id = (kwargs.get("session_id") or "").strip()

        # 定期清理空闲会话
        _cleanup_idle_sessions()

        if action == "open":
            return await self._open(kwargs)
        elif action == "open_external":
            return await self._open_external(kwargs)
        elif action == "exec":
            return await self._exec(session_id, kwargs)
        elif action == "read":
            return await self._read(session_id)
        elif action == "close":
            return await self._close(session_id)
        elif action == "list":
            return self._list()
        else:
            return ToolResult(
                success=False,
                result=None,
                error=f"未知动作: {action}，可用: open / open_external / exec / read / close / list",
            )

    # ------------------------------------------------------------------
    # open
    # ------------------------------------------------------------------

    async def _open(self, kwargs: dict) -> ToolResult:
        cwd = (kwargs.get("cwd") or "").strip() or None
        session_id = str(uuid.uuid4())[:8]
        session = TerminalSession(session_id, cwd=cwd)
        try:
            banner = await session.start()
        except Exception as e:
            err_msg = str(e).strip() or repr(e) or type(e).__name__
            logger.warning("终端在 cwd=%s 下启动失败: %s，尝试不指定 cwd 回退", cwd, err_msg)
            if cwd is not None:
                session = TerminalSession(session_id, cwd=None)
                try:
                    banner = await session.start()
                    banner = f"[已回退到当前工作目录]\n{banner}"
                except Exception as e2:
                    err_msg = str(e2).strip() or repr(e2) or type(e2).__name__
                    logger.error("终端会话启动失败: %s", err_msg, exc_info=True)
                    return ToolResult(
                        success=False,
                        result=None,
                        error=f"终端启动失败: {err_msg}",
                    )
            else:
                logger.error("终端会话启动失败: %s", err_msg, exc_info=True)
                return ToolResult(
                    success=False,
                    result=None,
                    error=f"终端启动失败: {err_msg}",
                )

        _sessions[session_id] = session
        logger.info(f"终端会话已创建: {session_id}")
        return ToolResult(
            success=True,
            result={
                "session_id": session_id,
                "message": banner,
                "hint": "使用 action=exec, session_id=该ID, command=你的命令 来执行命令",
                "read_only_for_user": True,
            },
        )

    # ------------------------------------------------------------------
    # open_external：真正打开新的系统终端窗口（cmd/PowerShell/Terminal/xterm）
    # ------------------------------------------------------------------

    async def _generate_command_from_intent(self, user_intent: str) -> str:
        """由 LLM 根据用户意图生成要在终端执行的一条命令。"""
        if not (user_intent or "").strip():
            return ""
        try:
            from langchain_core.messages import SystemMessage, HumanMessage
            from secbot_agent.core.patterns.security_react import _create_llm
            llm = _create_llm()
            prompt = (
                "你是一个终端命令生成器。根据用户的自然语言意图，输出一条且仅一条可在终端执行的命令。"
                "不要解释、不要换行、不要代码块。"
                "Windows 下使用 cmd 可识别的语法（如 dir、cd、ping）；Linux/Mac 使用 bash 语法。"
                "若意图不明确或无法转为单条命令，输出: echo 暂无明确命令"
            )
            messages = [
                SystemMessage(content=prompt),
                HumanMessage(content=f"用户意图：{user_intent.strip()}\n\n请只输出一条命令："),
            ]
            out = await asyncio.wait_for(llm.ainvoke(messages), timeout=15.0)
            cmd = (getattr(out, "content", None) or str(out) or "").strip()
            if cmd.startswith("```"):
                for line in cmd.split("\n"):
                    if not line.strip().startswith("```"):
                        cmd = line.strip()
                        break
            return cmd[:2000] or ""
        except Exception as e:
            logger.warning("LLM 生成终端命令失败: %s", e)
            return ""

    def _spawn_external_terminal_windows(self, cwd: Optional[str], initial_command: str) -> Tuple[bool, str]:
        """Windows: 在新窗口启动 cmd 或 PowerShell，可选执行初始命令。"""
        try:
            cwd_resolved = TerminalSession._resolve_cwd(cwd) if cwd else None
            work_dir = cwd_resolved or os.getcwd()
            work_dir_safe = work_dir.replace("'", "''")
            # 优先使用 PowerShell
            ps_path = os.path.join(os.environ.get("SystemRoot", "C:\\Windows"), "System32", "WindowsPowerShell", "v1.0", "powershell.exe")
            if os.path.exists(ps_path):
                ps_cmd = f"Set-Location -LiteralPath '{work_dir_safe}'"
                if initial_command:
                    ps_cmd = f"{ps_cmd}; {initial_command}"
                subprocess.Popen(
                    ["cmd", "/c", "start", "powershell", "-NoExit", "-Command", ps_cmd],
                    cwd=work_dir,
                    creationflags=subprocess.CREATE_NEW_CONSOLE,
                )
            else:
                part = f'cd /d "{work_dir}"'
                if initial_command:
                    part = f'{part} && {initial_command}'
                subprocess.Popen(
                    ["cmd", "/c", "start", "", "cmd", "/k", part],
                    cwd=work_dir,
                    creationflags=subprocess.CREATE_NEW_CONSOLE,
                )
        except Exception as e:
            return False, str(e)
        return True, ""

    def _spawn_external_terminal_darwin(self, cwd: Optional[str], initial_command: str) -> Tuple[bool, str]:
        """macOS: 用 AppleScript 让 Terminal.app 执行脚本。"""
        try:
            cwd_resolved = TerminalSession._resolve_cwd(cwd) if cwd else None
            work_dir = cwd_resolved or os.getcwd()
            script_body = f"cd {repr(work_dir)}"
            if initial_command:
                script_body = f"{script_body}; {initial_command}"
            script_body_esc = script_body.replace("\\", "\\\\").replace('"', '\\"')
            script = f'tell application "Terminal" to do script "{script_body_esc}"'
            subprocess.Popen(["osascript", "-e", script], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except Exception as e:
            return False, str(e)
        return True, ""

    def _spawn_external_terminal_linux(self, cwd: Optional[str], initial_command: str) -> Tuple[bool, str]:
        """Linux: 尝试 gnome-terminal 或 xterm。"""
        try:
            cwd_resolved = TerminalSession._resolve_cwd(cwd) if cwd else None
            work_dir = cwd_resolved or os.getcwd()
            cmd = f"cd {repr(work_dir)}"
            if initial_command:
                cmd = f"{cmd}; {initial_command}"
            cmd = f"{cmd}; exec $SHELL"
            if os.path.exists("/usr/bin/gnome-terminal"):
                subprocess.Popen(["gnome-terminal", "--", "bash", "-c", cmd], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            elif os.path.exists("/usr/bin/xterm"):
                subprocess.Popen(["xterm", "-e", f"bash -c {repr(cmd)}"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            else:
                return False, "未找到 gnome-terminal 或 xterm"
        except Exception as e:
            return False, str(e)
        return True, ""

    async def _open_external(self, kwargs: dict) -> ToolResult:
        """打开一个新的系统终端窗口（根据平台使用 cmd/PowerShell/Terminal/xterm），可选执行 LLM 根据意图生成的命令。"""
        cwd = (kwargs.get("cwd") or "").strip() or None
        initial_command = (kwargs.get("initial_command") or "").strip()
        user_intent = (kwargs.get("user_intent") or "").strip()
        if user_intent and not initial_command:
            initial_command = await self._generate_command_from_intent(user_intent)
        if cwd:
            try:
                TerminalSession._resolve_cwd(cwd)
            except ValueError as e:
                return ToolResult(success=False, result=None, error=str(e))
        ok = False
        err_msg = ""
        if sys.platform == "win32":
            ok, err_msg = self._spawn_external_terminal_windows(cwd, initial_command)
        elif sys.platform == "darwin":
            ok, err_msg = self._spawn_external_terminal_darwin(cwd, initial_command)
        else:
            ok, err_msg = self._spawn_external_terminal_linux(cwd, initial_command)
        if not ok:
            return ToolResult(success=False, result=None, error=f"无法启动外部终端: {err_msg}")
        shell_name = "PowerShell" if sys.platform == "win32" else ("Terminal.app" if sys.platform == "darwin" else "gnome-terminal/xterm")
        return ToolResult(
            success=True,
            result={
                "message": f"已在新窗口打开系统终端（{shell_name}）",
                "initial_command": initial_command or None,
                "hint": "后续若要由本助手继续在该机执行命令，请使用 action=open 打开进程内终端，再用 action=exec 发送命令。",
            },
        )

    # ------------------------------------------------------------------
    # exec
    # ------------------------------------------------------------------

    async def _exec(self, session_id: str, kwargs: dict) -> ToolResult:
        if not session_id:
            # 如果只有一个活跃会话，自动使用
            alive = {sid: s for sid, s in _sessions.items() if s.alive}
            if len(alive) == 1:
                session_id = next(iter(alive))
            else:
                return ToolResult(
                    success=False,
                    result=None,
                    error="缺少 session_id。请先 action=open 创建会话，或指定已有会话 ID。",
                )

        # 若传入的是占位符（如 <当前会话ID>），提示使用 open 返回的真实 session_id
        if session_id and ("<" in session_id or ">" in session_id or "当前会话" in session_id):
            return ToolResult(
                success=False,
                result=None,
                error="请使用 action=open 返回的真实 session_id 执行命令，不要使用占位符。当前活跃会话可先 action=list 查看。",
            )

        session = _sessions.get(session_id)
        if not session or not session.alive:
            return ToolResult(
                success=False,
                result=None,
                error=f"会话 {session_id} 不存在或已关闭。请先 action=open 创建会话，或 action=list 查看已有会话。",
            )

        command = (kwargs.get("command") or "").strip()
        if not command:
            return ToolResult(success=False, result=None, error="缺少 command 参数。")

        timeout = 30.0
        try:
            t = float(kwargs.get("timeout", 30))
            if t > 0:
                timeout = min(t, 120.0)
        except (TypeError, ValueError):
            pass

        try:
            output = await session.execute(command, timeout=timeout)
            return ToolResult(
                success=True,
                result={
                    "session_id": session_id,
                    "command": command,
                    "output": output,
                },
            )
        except RuntimeError as e:
            return ToolResult(success=False, result=None, error=str(e))
        except Exception as e:
            logger.error(f"终端命令执行异常: {e}")
            return ToolResult(success=False, result=None, error=f"执行异常: {e}")

    # ------------------------------------------------------------------
    # read
    # ------------------------------------------------------------------

    async def _read(self, session_id: str) -> ToolResult:
        if not session_id:
            alive = {sid: s for sid, s in _sessions.items() if s.alive}
            if len(alive) == 1:
                session_id = next(iter(alive))
            else:
                return ToolResult(success=False, result=None, error="缺少 session_id。")

        session = _sessions.get(session_id)
        if not session:
            return ToolResult(success=False, result=None, error=f"会话 {session_id} 不存在。")

        output = session.read()
        return ToolResult(
            success=True,
            result={
                "session_id": session_id,
                "output": output or "(无新输出)",
                "alive": session.alive,
            },
        )

    # ------------------------------------------------------------------
    # close
    # ------------------------------------------------------------------

    async def _close(self, session_id: str) -> ToolResult:
        if not session_id:
            return ToolResult(success=False, result=None, error="缺少 session_id。")

        session = _sessions.pop(session_id, None)
        if not session:
            return ToolResult(success=False, result=None, error=f"会话 {session_id} 不存在。")

        try:
            msg = await session.close()
        except Exception as e:
            msg = f"关闭异常: {e}"
        return ToolResult(success=True, result={"session_id": session_id, "message": msg})

    # ------------------------------------------------------------------
    # list
    # ------------------------------------------------------------------

    def _list(self) -> ToolResult:
        sessions_info = []
        for sid, s in _sessions.items():
            pid = None
            if s.process:
                pid = s.process.pid
            elif getattr(s, "_sync_process", None):
                pid = s._sync_process.pid
            sessions_info.append({
                "session_id": sid,
                "alive": s.alive,
                "idle_seconds": round(time.time() - s.last_active, 1),
                "pid": pid,
            })
        return ToolResult(
            success=True,
            result={
                "active_sessions": len([s for s in sessions_info if s["alive"]]),
                "sessions": sessions_info,
            },
        )

    # ------------------------------------------------------------------
    # schema
    # ------------------------------------------------------------------

    def get_schema(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "sensitivity": self.sensitivity,
            "parameters": {
                "action": {
                    "type": "string",
                    "description": "动作: open(进程内终端) / open_external(真正打开新系统终端窗口) / exec(执行命令) / read(读输出) / close(关闭) / list(列出会话)",
                    "required": True,
                },
                "session_id": {
                    "type": "string",
                    "description": "终端会话 ID（exec/read/close 时必需，仅有一个会话时可省略）",
                    "required": False,
                },
                "command": {
                    "type": "string",
                    "description": "要执行的命令（action=exec 时必需）",
                    "required": False,
                },
                "cwd": {
                    "type": "string",
                    "description": "工作目录（action=open/open_external 时可选）",
                    "required": False,
                },
                "initial_command": {
                    "type": "string",
                    "description": "open_external 时在新窗口执行的初始命令（与 user_intent 二选一）",
                    "required": False,
                },
                "user_intent": {
                    "type": "string",
                    "description": "open_external 时用户意图的自然语言描述，由 LLM 生成具体命令在新窗口执行",
                    "required": False,
                },
                "timeout": {
                    "type": "number",
                    "description": "命令超时秒数（action=exec 时可选，默认 30，最大 120）",
                    "default": 30,
                },
            },
        }
