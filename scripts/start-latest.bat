@echo off
setlocal
pushd "%~dp0.."

echo Pulling latest code, rebuilding and starting Secbot...
start "Secbot Latest" cmd /k "cd /d %CD% && npm.cmd run start:latest"

popd
endlocal
exit /b 0
