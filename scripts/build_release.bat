@echo off
REM Secbot 可执行文件构建脚本（PyInstaller，Windows）
REM 使用前请安装依赖: pip install -r requirements.txt pyinstaller

cd /d "%~dp0\.."
echo 构建目录: %CD%

pip install pyinstaller -q
if exist build rmdir /s /q build
if exist dist rmdir /s /q dist

pyinstaller hackbot.spec

echo 完成. 可执行文件: dist\hackbot.exe
dir dist
pause
