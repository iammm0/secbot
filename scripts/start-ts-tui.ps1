# Start pure TS stack (TS backend + TS TUI)
# Usage: .\scripts\start-ts-tui.ps1
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root
npm.cmd run start:stack
