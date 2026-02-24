@echo off
REM 在当前目录运行 TUI（由 Python launcher 在新 CMD 中调用，保证有 TTY）
where node >nul 2>&1 || (
  echo [Secbot] 未找到 node，请安装 Node.js 并确保已加入 PATH。
  echo 当前 PATH 前 200 字符: %PATH:~0,200%
  pause
  exit /b 1
)
node --import tsx src/cli.tsx
set EXIT_CODE=%ERRORLEVEL%
echo.
echo 退出码: %EXIT_CODE%  按任意键关闭窗口...
pause >nul
exit /b %EXIT_CODE%
