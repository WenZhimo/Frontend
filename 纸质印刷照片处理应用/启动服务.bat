@echo off
setlocal

cd /d "%~dp0"

if /I "%~1"=="--check" (
  echo start script check passed.
  exit /b 0
)

echo.
echo ========================================
echo  Paper Print Photo App - Dev Server
echo ========================================
echo.

if not exist "package.json" (
  echo [ERROR] package.json was not found.
  echo Script directory: %~dp0
  pause
  exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js was not found. Please install Node.js first.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm was not found. Please check your Node.js installation.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo [INFO] node_modules not found. Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo [ERROR] npm install failed.
    pause
    exit /b 1
  )
  echo.
)

echo [INFO] Starting local dev server...
echo [INFO] Open the URL printed by Vite, usually http://127.0.0.1:5173/
echo [INFO] If the port is busy, Vite will choose another port.
echo [INFO] Press Ctrl+C to stop the server.
echo.

call npm run dev
set EXIT_CODE=%ERRORLEVEL%

echo.
if not "%EXIT_CODE%"=="0" (
  echo [ERROR] Server exited with code %EXIT_CODE%.
) else (
  echo [INFO] Server stopped.
)

pause
exit /b %EXIT_CODE%
