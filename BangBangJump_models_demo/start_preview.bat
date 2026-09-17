@echo off
setlocal

set "PORT=8123"
set "ROOT=%~dp0"
set "URL=http://127.0.0.1:%PORT%/index.html"

cd /d "%ROOT%"

where python >nul 2>nul
if errorlevel 1 (
  echo Python was not found in PATH.
  echo Please install Python or add it to PATH, then run this file again.
  pause
  exit /b 1
)

echo Starting BangBangJump model preview...
echo Folder: %ROOT%
echo URL:    %URL%
echo.

start "BangBangJump Model Server" cmd /k "cd /d ""%ROOT%"" && python -m http.server %PORT% --bind 127.0.0.1"

timeout /t 2 /nobreak >nul
start "" "%URL%"

echo Preview opened in your browser.
echo You can close the server window when finished.
endlocal
