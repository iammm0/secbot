# Pull latest code, rebuild and launch TS stack in a new terminal window.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root'; npm.cmd run start:latest"
