@echo off
setlocal
cd /d "%~dp0"

echo Building Secbot npm package...
npm run release:pack
if errorlevel 1 (
  echo Build failed.
  exit /b 1
)

echo Package created successfully.
for %%f in (secbot-*.tgz) do echo   %%f
endlocal
