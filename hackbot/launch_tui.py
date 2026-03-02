"""
启动后端（若未运行）并启动 TS 终端 TUI。
供 main.py 与 hackbot/cli.py 调用，实现「一条命令进入全屏 TUI」。
pip 安装的 wheel 不包含 Node TUI，无 TUI 时会仅启动后端并提示。
"""
import os
import sys
import time
import subprocess
from pathlib import Path


def _project_root() -> Path | None:
    """项目根目录（含 terminal-ui 的目录）；若不存在（如 pip 安装后）则返回 None。"""
    root = Path(__file__).resolve().parent.parent
    if (root / "terminal-ui" / "package.json").exists():
        return root
    return None


def _backend_cwd() -> Path:
    """启动后端时使用的工作目录（无 TUI 时用当前目录，便于读 .env）。"""
    return Path.cwd()


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


def _start_backend(root: Path, port: int = 8000) -> subprocess.Popen | None:
    """后台启动 Python 后端（优先 uv run python -m router.main）。root 为工作目录。返回 Popen 或 None。"""
    for cmd in (
        ["uv", "run", "python", "-m", "router.main"],
        [sys.executable, "-m", "router.main"],
    ):
        try:
            proc = subprocess.Popen(
                cmd,
                cwd=root,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                stdin=subprocess.DEVNULL,
                creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if sys.platform == "win32" else 0,
            )
            return proc
        except FileNotFoundError:
            continue
    return None


def _wait_backend(port: int = 8000, timeout: float = 15.0) -> bool:
    """轮询直到后端就绪或超时。"""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if _backend_running(port):
            return True
        time.sleep(0.5)
    return False


def _run_tui(root: Path) -> int:
    """运行 TS TUI。Windows 下在当前控制台运行以继承 TTY；非 Windows 用 npm run tui。"""
    tui_dir = root / "terminal-ui"
    env = os.environ.copy()
    env.setdefault("SECBOT_API_URL", "http://localhost:8000")

    if sys.platform == "win32":
        # 新控制台窗口运行 TUI，保证有真实 TTY
        try:
            proc = subprocess.Popen(
                ["cmd", "/k", "node --import tsx src/cli.tsx"],
                cwd=tui_dir,
                env=env,
                creationflags=subprocess.CREATE_NEW_CONSOLE,
            )
            return proc.wait() or 0
        except FileNotFoundError:
            print("未找到 node。请安装 Node.js 18+ 并执行: cd terminal-ui && npm install", file=sys.stderr)
            return 1
        except Exception as e:
            print(f"启动 TUI 失败: {e}", file=sys.stderr)
            return 1
    try:
        proc = subprocess.run(
            ["npm", "run", "tui"],
            cwd=tui_dir,
            env=env,
        )
        return proc.returncode or 0
    except FileNotFoundError:
        print("未找到 npm。请安装 Node.js 18+ 并执行: cd terminal-ui && npm install", file=sys.stderr)
        return 1
    except Exception as e:
        print(f"启动 TUI 失败: {e}", file=sys.stderr)
        return 1


def run_backend_only(port: int = 8000) -> int:
    """仅启动后端并阻塞（前台运行，Ctrl+C 退出）。用于单独排查后端。"""
    root = _project_root() or _backend_cwd()
    if _backend_running(port):
        print(f"后端已在 {port} 端口运行。", flush=True)
        return 0
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
    if not _backend_running(port):
        print(f"后端未运行。请先执行: secbot --backend 或 uv run python main.py --backend", file=sys.stderr)
        return 1
    print("[TUI] 正在启动…", flush=True)
    return _run_tui(root)


def launch_tui(port: int = 8000) -> int:
    """先启动后端（若未运行），再启动 TUI。无 TUI（如 pip 安装）时仅启动后端并提示。"""
    root = _project_root()
    backend_cwd = root if root is not None else _backend_cwd()
    backend_proc = None

    if not _backend_running(port):
        print("[1/2] 启动后端…", flush=True)
        backend_proc = _start_backend(backend_cwd, port)
        if backend_proc is None:
            print("启动后端失败。请手动运行: secbot --backend 或 uv run python -m router.main", file=sys.stderr)
            return 1
        if not _wait_backend(port):
            if backend_proc.poll() is None:
                backend_proc.terminate()
            print("后端启动超时。请检查 8000 端口。", file=sys.stderr)
            return 1
        print("[1/2] 后端已就绪。", flush=True)
    else:
        print("[1/2] 后端已在运行。", flush=True)

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
                backend_proc.terminate()
                backend_proc.wait()
        return 0

    print("[2/2] 启动 TUI…", flush=True)
    code = _run_tui(root)
    if backend_proc is not None and backend_proc.poll() is None:
        backend_proc.terminate()
    return code
