"""
测试脚本：在发布前验证核心功能
"""

import sys
import subprocess


def run_test(description: str, command: str) -> bool:
    """运行测试命令"""
    print(f"\n{'=' * 60}")
    print(f"测试: {description}")
    print(f"命令: {command}")
    print("=" * 60)
    result = subprocess.run(command, shell=True, capture_output=True, text=True)
    print(result.stdout[-2000:] if len(result.stdout) > 2000 else result.stdout)
    if result.stderr:
        print(
            "STDERR:",
            result.stderr[-1000:] if len(result.stderr) > 1000 else result.stderr,
        )
    success = result.returncode == 0
    print(f"结果: {'✅ 通过' if success else '❌ 失败'}")
    return success


def main():
    """运行所有测试"""
    tests = []

    # 测试 1: 帮助命令
    tests.append(("帮助命令", "secbot --help"))

    # 测试 2: config show（无配置时）
    tests.append(("config show", "secbot config-show"))

    # 测试 3: 版本检查
    tests.append(
        (
            "版本检查",
            "secbot --version 2>&1 || python -c 'from secbot_cli import __version__; print(__version__)'",
        )
    )

    # 测试 4: 导入测试
    tests.append(
        (
            "模块导入",
            "python -c 'from hackbot_config import settings; print(\"Settings loaded OK\")'",
        )
    )

    # 测试 5: CLI 入口测试
    tests.append(
        (
            "CLI 入口",
            "python -c 'from secbot_cli.cli import app; print(\"CLI loaded OK\")'",
        )
    )

    results = []
    for desc, cmd in tests:
        results.append(run_test(desc, cmd))

    print("\n" + "=" * 60)
    print("测试汇总")
    print("=" * 60)
    passed = sum(results)
    total = len(results)
    print(f"通过: {passed}/{total}")

    if all(results):
        print("\n🎉 所有测试通过！可以发布到 PyPI")
        return 0
    else:
        print("\n⚠️  有测试失败，请检查后重试")
        return 1


if __name__ == "__main__":
    sys.exit(main())
