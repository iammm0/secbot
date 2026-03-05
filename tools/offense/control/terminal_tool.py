"""
持久化终端会话工具：为 Agent 提供一个可持续交互的系统终端。
支持 open / exec / read / close 四个动作，会话间保持工作目录、环境变量等状态。
"""

import asyncio
import os
import sys
import time
import uuid
from typing import Any, Dict, Optional

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

    # ------------------------------------------------------------------
    # 启动
    # ------------------------------------------------------------------

    async def start(self) -> str:
        """启动 shell 子进程，返回会话欢迎信息"""
        if sys.platform == "win32":
            shell_cmd = ["cmd.exe"]
        elif sys.platform == "darwin":
            shell_cmd = [os.environ.get("SHELL", "/bin/zsh")]
        else:
            shell_cmd = [os.environ.get("SHELL", "/bin/bash")]

        env = os.environ.copy()
        env["TERM"] = "dumb"
        env["LANG"] = env.get("LANG", "en_US.UTF-8")

        self.process = await asyncio.create_subprocess_exec(
            *shell_cmd,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            cwd=self.cwd,
            env=env,
        )
        self._reader_task = asyncio.create_task(self._read_loop())
        self.last_active = time.time()

        # 等一小段时间让 shell 启动完成并打印 banner
        await asyncio.sleep(0.3)
        banner = self._drain_buffer()
        shell_name = shell_cmd[0]
        return f"终端会话已启动 (shell={shell_name}, pid={self.process.pid})\n{banner}".strip()

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
        if not self.process or self.process.returncode is not None:
            raise RuntimeError("终端会话已关闭或未启动")

        async with self._lock:
            self.last_active = time.time()
            # 清空之前的缓冲
            self._drain_buffer()

            # 写入用户命令 + sentinel
            if sys.platform == "win32":
                sentinel_cmd = f'{command}\r\necho {_OUTPUT_SENTINEL}\r\n'
            else:
                sentinel_cmd = f'{command}\necho {_OUTPUT_SENTINEL}\n'

            self.process.stdin.write(sentinel_cmd.encode("utf-8"))
            await self.process.stdin.drain()

            # 等待 sentinel 出现在输出中
            deadline = time.time() + timeout
            while time.time() < deadline:
                if _OUTPUT_SENTINEL in self.output_buffer:
                    break
                if self.process.returncode is not None:
                    break
                await asyncio.sleep(0.1)

            output = self._drain_buffer()

            # 清理 sentinel 和 echo 命令本身
            output = self._clean_output(output, command)
            return output

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
        return self.process is not None and self.process.returncode is None

    # ------------------------------------------------------------------
    # 内部辅助
    # ------------------------------------------------------------------

    def _drain_buffer(self) -> str:
        """取出并清空输出缓冲区"""
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
                "持久化终端会话工具。打开一个系统终端并持续交互，命令间保持工作目录和环境变量等状态。"
                "用法: action=open 打开新会话; action=exec + session_id + command 发送命令并获取输出; "
                "action=read + session_id 读取最新输出; action=close + session_id 关闭会话; "
                "action=list 列出活跃会话。"
                "参数: action(open/exec/read/close/list), session_id(会话ID,exec/read/close时必需), "
                "command(exec时的命令), cwd(open时的工作目录), timeout(exec的超时秒数,默认30)"
            ),
        )

    async def execute(self, **kwargs) -> ToolResult:
        action = (kwargs.get("action") or "").strip().lower()
        session_id = (kwargs.get("session_id") or "").strip()

        # 定期清理空闲会话
        _cleanup_idle_sessions()

        if action == "open":
            return await self._open(kwargs)
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
                error=f"未知动作: {action}，可用: open / exec / read / close / list",
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
            logger.error(f"终端会话启动失败: {e}")
            return ToolResult(success=False, result=None, error=f"终端启动失败: {e}")

        _sessions[session_id] = session
        logger.info(f"终端会话已创建: {session_id}")
        return ToolResult(
            success=True,
            result={
                "session_id": session_id,
                "message": banner,
                "hint": "使用 action=exec, session_id=该ID, command=你的命令 来执行命令",
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

        session = _sessions.get(session_id)
        if not session or not session.alive:
            return ToolResult(
                success=False,
                result=None,
                error=f"会话 {session_id} 不存在或已关闭。",
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
            sessions_info.append({
                "session_id": sid,
                "alive": s.alive,
                "idle_seconds": round(time.time() - s.last_active, 1),
                "pid": s.process.pid if s.process else None,
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
                    "description": "动作: open(打开新终端) / exec(执行命令) / read(读输出) / close(关闭) / list(列出会话)",
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
                    "description": "工作目录（action=open 时可选）",
                    "required": False,
                },
                "timeout": {
                    "type": "number",
                    "description": "命令超时秒数（action=exec 时可选，默认 30，最大 120）",
                    "default": 30,
                },
            },
        }
