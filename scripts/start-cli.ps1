# 在新 PowerShell 窗口中启动 Secbot CLI（保证有真实 TTY）
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root'; uv run python main.py"
