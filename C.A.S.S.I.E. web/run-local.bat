@echo off
setlocal

cd /d "%~dp0"

set "HOST=127.0.0.1"
set "PORT=5173"
set "PYTHON_CMD="

where python >nul 2>nul
if %errorlevel%==0 (
  set "PYTHON_CMD=python"
) else (
  where py >nul 2>nul
  if %errorlevel%==0 (
    set "PYTHON_CMD=py -3"
  )
)

if "%PYTHON_CMD%"=="" (
  echo [ERROR] Python was not found.
  echo Install Python or add it to PATH, then run this file again.
  pause
  exit /b 1
)

echo Starting C.A.S.S.I.E Web Sentence Builder...
echo.
echo URL: http://%HOST%:%PORT%/
echo Press Ctrl+C to stop the server.
echo.

%PYTHON_CMD% -m http.server %PORT% --bind %HOST%

echo.
echo Server stopped.
pause
