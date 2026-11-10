@echo off
setlocal
cd /d "%~dp0"
set "PORT=8137"
set "URL=http://127.0.0.1:%PORT%/"
title CD Case - open study

start "" /b powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 1; Start-Process '%URL%'"

where node >nul 2>nul
if %errorlevel%==0 (
  echo.
  echo   CD Case open study
  echo   %URL%
  echo   Close this window to stop.
  echo.
  node server.js
  goto :done
)

where python >nul 2>nul
if %errorlevel%==0 (
  echo.
  echo   Node.js not found. Falling back to Python.
  echo   %URL%
  echo.
  python -m http.server %PORT% --bind 127.0.0.1
  goto :done
)

echo.
echo   Neither Node.js nor Python was found.
echo   Install one, or serve this folder with any static server.
echo.

:done
echo.
echo   Server stopped.
pause
