@echo off
REM Secbot 构建脚本（源码分发包 sdist/wheel）（Windows）
REM 在仓库根目录执行: scripts\build.bat
REM 推荐使用: uv run python -m build

cd /d "%~dp0\.."
echo 🚀 开始构建 Secbot...
echo 工作目录: %CD%

REM 检查 Python
python --version >nul 2>&1
if errorlevel 1 (
    echo 错误: 未找到 Python，请先安装 Python 3.10+
    exit /b 1
)
python --version

REM 清理旧的构建文件
echo 清理旧的构建文件...
if exist build rmdir /s /q build
if exist dist rmdir /s /q dist
for /d %%d in (*.egg-info) do if exist "%%d" rmdir /s /q "%%d"

REM 优先使用 uv，否则用 pip
where uv >nul 2>&1
if %errorlevel% equ 0 (
    echo 使用 uv 构建...
    uv run python -m build
) else (
    echo 安装构建工具并构建...
    python -m pip install --upgrade pip build wheel
    python -m build
)

echo ✅ 构建完成！
echo 构建产物：
dir dist

echo 安装示例：
echo   pip install dist\secbot-*.whl
echo   或: uv pip install dist\secbot-*.whl

pause
