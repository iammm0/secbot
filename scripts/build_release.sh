#!/usr/bin/env bash
# Secbot 可执行文件构建脚本（PyInstaller，当前平台）
# 使用前请安装依赖: pip install -r requirements.txt pyinstaller
# 或: uv pip install -r requirements.txt pyinstaller

set -e
cd "$(dirname "$0")/.."
ROOT="$PWD"

echo "构建目录: $ROOT"
pip install pyinstaller -q

# 清理旧产物
rm -rf build dist

# 单文件可执行程序（hackbot.spec）
pyinstaller hackbot.spec

echo "完成. 可执行文件: dist/hackbot (或 dist/hackbot.exe)"
ls -la dist/
