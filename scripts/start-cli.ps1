# Start pure TS stack in a new PowerShell window (ensures real TTY)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root'; npm.cmd run start:stack"
