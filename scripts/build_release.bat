@echo off
REM 在当前平台构建 Hackbot 可执行文件（Windows）
cd /d "%~dp0\.."
pip install pyinstaller -q
if exist build rmdir /s /q build
if exist dist rmdir /s /q dist
pyinstaller hackbot.spec
echo 完成. 可执行文件: dist\hackbot.exe
dir dist
