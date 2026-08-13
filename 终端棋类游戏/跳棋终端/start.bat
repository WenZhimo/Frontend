@echo off
setlocal
cd /d "%~dp0"

set "PORT=8026"

where py >nul 2>nul
if %ERRORLEVEL%==0 (
  start "Checkers Terminal Server" /min py -3 -m http.server %PORT% --bind 127.0.0.1
) else (
  start "Checkers Terminal Server" /min python -m http.server %PORT% --bind 127.0.0.1
)

timeout /t 1 >nul
start "" "http://127.0.0.1:%PORT%/"
