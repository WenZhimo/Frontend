@echo off
setlocal
pushd "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found in PATH. Falling back to PowerShell server...
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run-local.ps1"
) else (
  node "%~dp0server.cjs"
)

if errorlevel 1 (
  echo.
  echo Server failed to start.
  pause
)

popd
endlocal
