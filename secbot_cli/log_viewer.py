"""
多文件实时日志查看器：
- 持续跟随 backend / tui 日志文件
- 按来源前缀输出，便于在单独终端观察全链路
"""

import argparse
import time
from pathlib import Path


def _tail_stream(paths: list[Path], interval: float = 0.2) -> None:
    handles: dict[Path, object] = {}
    positions: dict[Path, int] = {}

    for p in paths:
        p.parent.mkdir(parents=True, exist_ok=True)
        p.touch(exist_ok=True)
        f = p.open("r", encoding="utf-8", errors="replace")
        f.seek(0, 2)
        handles[p] = f
        positions[p] = f.tell()

    print("=== Secbot 日志观察窗口 ===")
    print("按 Ctrl+C 退出日志窗口，不影响主程序。")
    for p in paths:
        print(f"- {p}")
    print("")

    try:
        while True:
            had_new = False
            for p in paths:
                f = handles[p]
                f.seek(positions[p])
                chunk = f.read()
                if chunk:
                    had_new = True
                    positions[p] = f.tell()
                    prefix = p.stem.upper()
                    for line in chunk.splitlines():
                        print(f"[{prefix}] {line}")
            if not had_new:
                time.sleep(interval)
    except KeyboardInterrupt:
        pass
    finally:
        for f in handles.values():
            try:
                f.close()
            except Exception:
                pass


def main() -> None:
    parser = argparse.ArgumentParser(description="Secbot 日志实时查看")
    parser.add_argument("--file", action="append", required=True, help="要跟随的日志文件")
    args = parser.parse_args()
    files = [Path(p).resolve() for p in args.file if p]
    _tail_stream(files)


if __name__ == "__main__":
    main()
