@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

where powershell >nul 2>nul
if errorlevel 1 (
  echo [tree-launcher] PowerShell was not found.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-tree.ps1"
endlocal
