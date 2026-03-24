"""Root conftest: ensure monorepo workspace packages are importable during tests."""
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parent

for _ws_dir in [
    _ROOT / "packages" / "secbot-core",
    _ROOT / "packages" / "secbot-tools",
    _ROOT / "packages" / "secbot-skills",
    _ROOT / "packages" / "shared-config",
    _ROOT / "packages" / "opencode-adapters",
    _ROOT / "apps" / "secbot-api",
    _ROOT / "apps" / "secbot-cli",
    _ROOT / "apps" / "opencode-gateway",
]:
    _ws_str = str(_ws_dir)
    if _ws_str not in sys.path:
        sys.path.insert(0, _ws_str)
