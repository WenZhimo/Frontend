@echo off
setlocal

for %%I in ("%~dp0.") do set "GAME_DIR=%%~nxI"
for %%I in ("%~dp0..") do set "ROOT_DIR=%%~fI"

cd /d "%ROOT_DIR%"

set "PORT=8027"
set "HOST=127.0.0.1"
set "URL=http://%HOST%:%PORT%/%GAME_DIR%/index.html"

where py >nul 2>nul
if %ERRORLEVEL%==0 (
  start "%GAME_DIR% Terminal Server" /min py -3 -m http.server %PORT% --bind %HOST%
) else (
  start "%GAME_DIR% Terminal Server" /min python -m http.server %PORT% --bind %HOST%
)

timeout /t 1 >nul
start "" "%URL%"

endlocal
