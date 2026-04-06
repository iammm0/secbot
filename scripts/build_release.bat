@echo off
setlocal
cd /d "%~dp0\.."

echo Building Secbot npm release package...
npm run release:pack
if errorlevel 1 (
  echo Release build failed.
  exit /b 1
)

echo Release package created successfully.
for %%f in (*.tgz) do echo   %%f
endlocal
pause
