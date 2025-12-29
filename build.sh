#!/bin/bash
# M-Bot 构建脚本

set -e

echo "🚀 开始构建 M-Bot..."

# 颜色输出
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查 Python 版本
echo -e "${YELLOW}检查 Python 版本...${NC}"
python_version=$(python3 --version 2>&1 | awk '{print $2}')
echo "Python 版本: $python_version"

# 清理旧的构建文件
echo -e "${YELLOW}清理旧的构建文件...${NC}"
rm -rf build/ dist/ *.egg-info

# 安装构建工具
echo -e "${YELLOW}安装构建工具...${NC}"
pip install --upgrade pip build wheel

# 构建分发包
echo -e "${YELLOW}构建 Python 包...${NC}"
python -m build

# 显示构建结果
echo -e "${GREEN}✅ 构建完成！${NC}"
echo -e "${YELLOW}构建产物：${NC}"
ls -lh dist/

echo -e "${GREEN}安装方式：${NC}"
echo "pip install dist/m_bot-1.0.0-py3-none-any.whl"

