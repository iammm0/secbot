#!/bin/bash
# Secbot 构建脚本（源码分发包 sdist/wheel）
# 在仓库根目录执行: bash scripts/build.sh
# 推荐使用: uv run python -m build

set -e
cd "$(dirname "$0")/.."
ROOT="$PWD"
echo "🚀 开始构建 Secbot... (根目录: $ROOT)"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# 检查 Python
echo -e "${YELLOW}检查 Python...${NC}"
if command -v python3 &>/dev/null; then
  python_version=$(python3 --version 2>&1)
elif command -v python &>/dev/null; then
  python_version=$(python --version 2>&1)
else
  echo "错误: 未找到 Python，请先安装 Python 3.10+"
  exit 1
fi
echo "$python_version"

# 清理旧构建
echo -e "${YELLOW}清理旧的构建文件...${NC}"
rm -rf build/ dist/ *.egg-info

# 优先使用 uv，否则用 pip
if command -v uv &>/dev/null; then
  echo -e "${YELLOW}使用 uv 构建...${NC}"
  uv run python -m build
else
  echo -e "${YELLOW}安装构建工具并构建...${NC}"
  pip install --upgrade pip build wheel
  python -m build
fi

echo -e "${GREEN}✅ 构建完成！${NC}"
echo -e "${YELLOW}构建产物：${NC}"
ls -lh dist/

echo -e "${GREEN}安装示例：${NC}"
echo "  pip install dist/secbot-*.whl"
echo "  或: uv pip install dist/secbot-*.whl"
