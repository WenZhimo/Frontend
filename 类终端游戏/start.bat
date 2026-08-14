@echo off
setlocal

cd /d "%~dp0"

set "PORT=8040"
set "HOST=127.0.0.1"
set "URL=http://%HOST%:%PORT%/index.html"

echo Starting Local Terminal Games Hub...
echo URL: %URL%
echo.

start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Milliseconds 700; Start-Process '%URL%'"

where py >nul 2>nul
if %errorlevel%==0 (
  py -3 -m http.server %PORT% --bind %HOST%
  goto :done
)

where python >nul 2>nul
if %errorlevel%==0 (
  python -m http.server %PORT% --bind %HOST%
  goto :done
)

echo Python was not found. Install Python or run another static HTTP server in this folder.
pause

:done
endlocal
