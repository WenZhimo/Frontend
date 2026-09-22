@echo off
setlocal

cd /d "%~dp0"
git config core.hooksPath .githooks
if errorlevel 1 (
  echo Failed to configure Git hooks.
  exit /b 1
)

echo Git pre-commit hook enabled.
echo New commits will regenerate and stage index.html automatically.
exit /b 0
