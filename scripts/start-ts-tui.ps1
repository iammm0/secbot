# 启动后端（新窗口）并运行 TS 终端 TUI（当前窗口）
# 用法: .\scripts\start-ts-tui.ps1
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Start-Process -FilePath "python" -ArgumentList "-m", "router.main" -WorkingDirectory $root -WindowStyle Normal
Write-Host "后端已在独立窗口启动，3 秒后启动 TUI..."
Start-Sleep -Seconds 3
Set-Location (Join-Path $root "terminal-ui")
npm run tui
