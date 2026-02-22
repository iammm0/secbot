@echo off
REM 在新 CMD 窗口中启动 Secbot CLI（保证有真实 TTY，Ink 才能工作）
REM 结束后 pause 便于看到报错
pushd "%~dp0.."
start "Secbot CLI" cmd /k "cd /d %CD% && (uv run python main.py & echo. & echo 按任意键关闭窗口... & pause)"
popd
exit /b 0
