@echo off
REM M-Bot Windows 构建脚本

echo 🚀 开始构建 M-Bot...

REM 检查 Python
python --version
if errorlevel 1 (
    echo 错误: 未找到 Python，请先安装 Python 3.10+
    exit /b 1
)

REM 清理旧的构建文件
echo 清理旧的构建文件...
if exist build rmdir /s /q build
if exist dist rmdir /s /q dist
if exist *.egg-info rmdir /s /q *.egg-info

REM 安装构建工具
echo 安装构建工具...
python -m pip install --upgrade pip build wheel

REM 构建分发包
echo 构建 Python 包...
python -m build

REM 显示构建结果
echo ✅ 构建完成！
echo 构建产物：
dir dist

echo 安装方式：
echo pip install dist\m_bot-1.0.0-py3-none-any.whl

pause