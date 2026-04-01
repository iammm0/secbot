"""
启动后端（若未运行）并启动 TS 终端 TUI。
供 main.py 与 secbot-cli/cli.py 调用，实现「一条命令进入全屏 TUI」。
pip 安装的 wheel 不包含 Node TUI，无 TUI 时会仅启动后端并提示。
"""
import os
import sys
import time
import subprocess
import shutil
from pathlib import Path


def _decode_subprocess_bytes(data: bytes | None) -> str:
    """安全解码子进程输出，避免 Windows 默认编码导致 UnicodeDecodeError。"""
    if not data:
        return ""
    for enc in ("utf-8", "gbk", "cp936", "latin-1"):
        try:
            return data.decode(enc)
        except UnicodeDecodeError:
            continue
    return data.decode("utf-8", errors="replace")


def _project_root() -> Path | None:
    """项目根目录（含 terminal-ui 的目录）；若不存在（如 pip 安装后）则返回 None。"""
    root = Path(__file__).resolve().parent.parent
    if (root / "terminal-ui" / "package.json").exists():
        return root
    return None


def _backend_cwd() -> Path:
    """启动后端时使用的工作目录（无 TUI 时用当前目录，便于读 .env）。"""
    return Path.cwd()


def _runtime_log_paths(root: Path) -> tuple[Path, Path]:
    logs_dir = root / "logs"
    logs_dir.mkdir(parents=True, exist_ok=True)
    return logs_dir / "backend-runtime.log", logs_dir / "tui-runtime.log"


def _has_interactive_tty() -> bool:
    """当前进程是否连接到了可用于全屏 Ink TUI 的交互式终端。"""
    streams = (sys.stdin, sys.stdout, sys.stderr)
    try:
        return all(getattr(stream, "isatty", lambda: False)() for stream in streams)
    except Exception:
        return False


def _append_runtime_note(runtime_log: Path, line: str) -> None:
    """向 TUI 运行日志追加一行说明，便于在继承当前终端时保留排查线索。"""
    try:
        runtime_log.parent.mkdir(parents=True, exist_ok=True)
        with open(runtime_log, "a", encoding="utf-8") as fp:
            fp.write(f"{line}\n")
    except Exception:
        pass


def _check_tui_readiness(root: Path) -> tuple[bool, list[str]]:
    """检查 TUI 启动条件是否就绪。返回 (是否就绪, 缺失项列表)。"""
    missing: list[str] = []
    tui_dir = root / "terminal-ui"
    if not tui_dir.is_dir():
        missing.append("目录 terminal-ui 不存在")
        return False, missing
    if not (tui_dir / "package.json").exists():
        missing.append("terminal-ui/package.json 不存在")
        return False, missing
    if not (tui_dir / "node_modules").exists():
        missing.append("未执行 npm install，请在 terminal-ui 目录运行: npm install")
        return False, missing
    node = shutil.which("node")
    if not node:
        missing.append("未找到 Node.js，请安装 Node.js 18+ 并确保在 PATH 中")
        return False, missing
    return True, missing


def _backend_running(port: int = 8000) -> bool:
    """检测本机 port 是否已有后端在监听。"""
    try:
        import urllib.request
        req = urllib.request.Request(
            f"http://127.0.0.1:{port}/api/system/info",
            method="GET",
        )
        urllib.request.urlopen(req, timeout=2)
        return True
    except Exception:
        return False


def _pids_listening_on_port(port: int) -> list[int]:
    """返回正在监听给定端口的进程 PID 列表（可能为空）。"""
    pids: list[int] = []
    if sys.platform == "win32":
        try:
            out = subprocess.run(
                ["netstat", "-ano"],
                capture_output=True,
                text=False,
                timeout=5,
                creationflags=subprocess.CREATE_NO_WINDOW if getattr(subprocess, "CREATE_NO_WINDOW", 0) else 0,
            )
            for line in _decode_subprocess_bytes(out.stdout).splitlines():
                if f":{port}" in line and "LISTENING" in line:
                    parts = line.split()
                    if parts:
                        try:
                            pids.append(int(parts[-1]))
                        except ValueError:
                            pass
        except Exception:
            pass
    else:
        try:
            out = subprocess.run(
                ["lsof", "-i", f":{port}", "-t"],
                capture_output=True,
                text=False,
                timeout=5,
            )
            for s in _decode_subprocess_bytes(out.stdout).strip().split():
                try:
                    pids.append(int(s))
                except ValueError:
                    pass
        except Exception:
            pass
    return list(dict.fromkeys(pids))  # 去重保持顺序


def _kill_processes_on_port(port: int = 8000) -> bool:
    """结束占用指定端口的所有进程。返回是否曾尝试结束过进程。"""
    pids = _pids_listening_on_port(port)
    if not pids:
        return False
    if sys.platform == "win32":
        for pid in pids:
            try:
                subprocess.run(
                    ["taskkill", "/PID", str(pid), "/T", "/F"],
                    capture_output=True,
                    timeout=10,
                    creationflags=subprocess.CREATE_NO_WINDOW if getattr(subprocess, "CREATE_NO_WINDOW", 0) else 0,
                )
            except Exception:
                pass
    else:
        for pid in pids:
            try:
                os.kill(pid, 9)
            except (ProcessLookupError, PermissionError):
                pass
    return True


def _stop_backend(port: int = 8000) -> bool:
    """结束占用端口的后端进程（再次启动时先关后开）。返回是否成功释放端口。"""
    if not _kill_processes_on_port(port):
        return True
    return _wait_port_free(port, timeout=8.0)


def _wait_port_free(port: int, timeout: float = 10.0) -> bool:
    """轮询直到端口无进程监听或超时。"""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if not _pids_listening_on_port(port):
            return True
        time.sleep(0.3)
    return False


def _start_backend(root: Path, port: int = 8000, runtime_log: Path | None = None) -> subprocess.Popen | None:
    """后台启动 Python 后端（优先 uv run python -m router.main）。root 为工作目录。返回 Popen 或 None。"""
    env = os.environ.copy()
    env["PYTHONDONTWRITEBYTECODE"] = "1"  # 确保后端加载最新 .py 源码
    # 从 TUI 启动后端时禁用 reload，避免 Windows 下文件句柄过多
    env.setdefault("SECBOT_DESKTOP", "1")
    env.setdefault("SECBOT_SERVER_RELOAD", "false")
    stdout_target = subprocess.DEVNULL
    stderr_target = subprocess.DEVNULL
    log_fp = None
    if runtime_log is not None:
        runtime_log.parent.mkdir(parents=True, exist_ok=True)
        log_fp = open(runtime_log, "a", encoding="utf-8", buffering=1)
        stdout_target = log_fp
        stderr_target = log_fp
    for cmd in (
        ["uv", "run", "python", "-B", "-m", "router.main"],
        [sys.executable, "-B", "-m", "router.main"],
    ):
        try:
            proc = subprocess.Popen(
                cmd,
                cwd=root,
                env=env,
                stdout=stdout_target,
                stderr=stderr_target,
                stdin=subprocess.DEVNULL,
                creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if sys.platform == "win32" else 0,
            )
            if log_fp is not None:
                proc._secbot_log_fp = log_fp  # type: ignore[attr-defined]
            return proc
        except FileNotFoundError:
            continue
        except Exception:
            if log_fp is not None:
                try:
                    log_fp.close()
                except Exception:
                    pass
            raise
    if log_fp is not None:
        try:
            log_fp.close()
        except Exception:
            pass
    return None


def _wait_backend(port: int = 8000, timeout: float = 15.0) -> bool:
    """轮询直到后端就绪或超时。"""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if _backend_running(port):
            return True
        time.sleep(0.5)
    return False


def _terminate_backend_proc(proc: subprocess.Popen | None, port: int = 8000, wait_timeout: float = 8.0) -> None:
    """优雅结束本进程启动的后端并等待释放端口。Windows 下结束进程树以便 uv 子进程一并退出。"""
    if proc is None or proc.poll() is not None:
        return
    if sys.platform == "win32":
        try:
            subprocess.run(
                ["taskkill", "/PID", str(proc.pid), "/T", "/F"],
                capture_output=True,
                timeout=10,
                creationflags=subprocess.CREATE_NO_WINDOW if getattr(subprocess, "CREATE_NO_WINDOW", 0) else 0,
            )
        except Exception:
            try:
                proc.terminate()
            except Exception:
                pass
    else:
        try:
            proc.terminate()
        except Exception:
            pass
    try:
        proc.wait(timeout=wait_timeout)
    except subprocess.TimeoutExpired:
        try:
            proc.kill()
            proc.wait(timeout=2)
        except Exception:
            pass
    # 轮询直到端口释放，避免下一轮启动时仍提示占用
    deadline = time.monotonic() + wait_timeout
    while time.monotonic() < deadline and _pids_listening_on_port(port):
        time.sleep(0.2)
    log_fp = getattr(proc, "_secbot_log_fp", None)
    if log_fp:
        try:
            log_fp.close()
        except Exception:
            pass


def _run_tui(root: Path, runtime_log: Path | None = None) -> int:
    """运行 TS TUI。Windows 下在新控制台窗口运行；非 Windows 用 npm run tui。"""
    tui_dir = root / "terminal-ui"
    env = os.environ.copy()
    env.setdefault("SECBOT_API_URL", "http://localhost:8000")
    interactive_tty = _has_interactive_tty()
    if runtime_log is not None:
        env.setdefault("SECBOT_TUI_RUNTIME_LOG", str(runtime_log))
    try:
        if sys.platform == "win32":
            proc = subprocess.Popen(
                ["cmd", "/k", "chcp 65001 >nul && node --import tsx src/cli.tsx"],
                cwd=tui_dir,
                env=env,
                creationflags=subprocess.CREATE_NEW_CONSOLE,
            )
            return proc.wait() or 0
        stdout_target = None
        stderr_target = None
        log_fp = None
        if runtime_log is not None and not interactive_tty:
            runtime_log.parent.mkdir(parents=True, exist_ok=True)
            log_fp = open(runtime_log, "a", encoding="utf-8", buffering=1)
            stdout_target = log_fp
            stderr_target = log_fp
        elif runtime_log is not None:
            _append_runtime_note(runtime_log, "[launcher] interactive TUI attached to current terminal; stdout/stderr are not redirected.")
        proc = subprocess.run(
            ["npm", "run", "tui"],
            cwd=tui_dir,
            env=env,
            stdout=stdout_target,
            stderr=stderr_target,
        )
        if log_fp is not None:
            log_fp.close()
        return proc.returncode or 0
    except FileNotFoundError as e:
        print(f"未找到 node/npm。请安装 Node.js 18+ 并在 terminal-ui 目录执行: npm install\n{e}", file=sys.stderr)
        return 1
    except Exception as e:
        print(f"启动 TUI 失败: {e}", file=sys.stderr)
        return 1


def _start_log_viewer(root: Path, backend_log: Path, tui_log: Path) -> subprocess.Popen | None:
    """启动日志观察终端，聚合后端与 TUI 日志。"""
    try:
        cmd_list = [
            sys.executable,
            "-m",
            "secbot_cli.log_viewer",
            "--file",
            str(backend_log),
            "--file",
            str(tui_log),
        ]
        if sys.platform == "win32":
            env = os.environ.copy()
            env.setdefault("PYTHONUTF8", "1")
            env.setdefault("PYTHONIOENCODING", "utf-8")
            return subprocess.Popen(
                cmd_list,
                cwd=root,
                env=env,
                creationflags=subprocess.CREATE_NEW_CONSOLE,
            )
        return subprocess.Popen(cmd_list, cwd=root)
    except Exception:
        return None


def run_backend_only(port: int = 8000) -> int:
    """仅启动后端并阻塞（前台运行，Ctrl+C 退出）。用于单独排查后端。"""
    root = _project_root() or _backend_cwd()
    if _backend_running(port):
        print(f"检测到后端已在 {port} 端口运行，正在关闭占用该端口的进程…", flush=True)
        if not _stop_backend(port):
            print(f"未能释放端口。请手动关闭占用 {port} 端口的进程后重试。", file=sys.stderr)
            return 1
    print("[后端] 正在启动…", flush=True)
    proc = _start_backend(root, port)
    if proc is None:
        print("启动后端失败。请手动运行: uv run python -m router.main 或 secbot --backend", file=sys.stderr)
        return 1
    if not _wait_backend(port):
        if proc.poll() is None:
            proc.terminate()
        print("后端启动超时。请检查 8000 端口。", file=sys.stderr)
        return 1
    print(f"[后端] 已就绪 http://127.0.0.1:{port} ，按 Ctrl+C 停止。", flush=True)
    try:
        proc.wait()
    except KeyboardInterrupt:
        proc.terminate()
        proc.wait()
    return 0


def run_tui_only(port: int = 8000) -> int:
    """仅启动 TUI（假定后端已在运行）。若未随包安装 TUI（如 pip 安装）则提示并退出。"""
    root = _project_root()
    if root is None:
        print(
            "TUI 未随本包安装（pip 安装不包含 Node 前端）。"
            "请从 GitHub Release 下载对应平台 zip，或从源码运行以使用 TUI。",
            file=sys.stderr,
        )
        return 1
    ready, missing = _check_tui_readiness(root)
    if not ready:
        print("TUI 启动条件未满足：", file=sys.stderr)
        for m in missing:
            print(f"  - {m}", file=sys.stderr)
        return 1
    if not _backend_running(port):
        print(f"后端未运行。请先执行: secbot --backend 或 uv run python main.py --backend", file=sys.stderr)
        return 1
    print("[TUI] 正在启动…", flush=True)
    return _run_tui(root)


def launch_tui(port: int = 8000) -> int:
    """先启动后端（若未运行），再启动 TUI。无 TUI（如 pip 安装）时仅启动后端并提示。"""
    root = _project_root()
    backend_cwd = root if root is not None else _backend_cwd()
    backend_log, tui_log = _runtime_log_paths(backend_cwd)
    backend_proc = None

    if _backend_running(port):
        print("[1/2] 检测到后端已在运行，正在关闭占用 8000 端口的进程…", flush=True)
        if not _stop_backend(port):
            print("未能释放端口。请手动关闭占用 8000 端口的进程后重试。", file=sys.stderr)
            return 1
    print("[1/2] 启动后端…", flush=True)
    backend_proc = _start_backend(backend_cwd, port, runtime_log=backend_log)
    if backend_proc is None:
        print("启动后端失败。请手动运行: secbot --backend 或 uv run python main.py --backend", file=sys.stderr)
        return 1
    if not _wait_backend(port):
        if backend_proc.poll() is None:
            backend_proc.terminate()
        print("后端启动超时。请检查 8000 端口。", file=sys.stderr)
        return 1
    print("[1/2] 后端已就绪。", flush=True)

    if root is None:
        print(
            "[2/2] TUI 未随本包安装（pip 安装不包含 Node 前端），仅后端已启动。",
            file=sys.stderr,
        )
        print(
            "如需完整 TUI，请从 GitHub Release 下载对应平台 zip 或从源码运行。",
            file=sys.stderr,
        )
        if backend_proc is not None:
            try:
                backend_proc.wait()
            except KeyboardInterrupt:
                _terminate_backend_proc(backend_proc, port)
        return 0

    ready, missing = _check_tui_readiness(root)
    if not ready:
        print("[2/2] TUI 启动条件未满足：", file=sys.stderr)
        for m in missing:
            print(f"  - {m}", file=sys.stderr)
        print("请按上述提示准备后再启动。", file=sys.stderr)
        _terminate_backend_proc(backend_proc, port)
        return 1

    print("[2/2] 启动 TUI（可在会话内使用 /logs 查看运行日志）…", flush=True)
    code = _run_tui(root, runtime_log=tui_log)
    _terminate_backend_proc(backend_proc, port)
    return code
