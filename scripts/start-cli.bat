@echo off
setlocal
pushd "%~dp0.."

echo Starting Secbot TS stack in new terminal window...
start "Secbot CLI" cmd /k "cd /d %CD% && npm.cmd run start:stack"

popd
endlocal
exit /b 0
