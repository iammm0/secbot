#!/usr/bin/env bash
# 在当前平台构建 Hackbot 可执行文件（供本地测试或 CI 使用）
# 使用前请安装依赖: pip install -r requirements.txt pyinstaller

set -e
cd "$(dirname "$0")/.."
ROOT="$PWD"

echo "构建目录: $ROOT"
pip install pyinstaller -q

# 清理旧产物
rm -rf build dist

# 单文件可执行程序
pyinstaller hackbot.spec

echo "完成. 可执行文件: dist/hackbot (或 dist/hackbot.exe)"
ls -la dist/
