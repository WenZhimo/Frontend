@echo off
setlocal
cd /d "%~dp0"

set "PORT=8766"
set "URL=http://127.0.0.1:%PORT%/"

call :is_page_running
if not errorlevel 1 goto open_page

where py >nul 2>&1
if not errorlevel 1 (
  start "O EMPIRE Local Server" /min cmd /c "py -3 -m http.server %PORT% --bind 127.0.0.1"
  goto wait_for_server
)

where python >nul 2>&1
if not errorlevel 1 (
  start "O EMPIRE Local Server" /min cmd /c "python -m http.server %PORT% --bind 127.0.0.1"
  goto wait_for_server
)

echo Python was not found. Install Python 3, then run this file again.
pause
exit /b 1

:wait_for_server
for /l %%i in (1,1,20) do (
  call :is_page_running
  if not errorlevel 1 goto open_page
  timeout /t 1 /nobreak >nul
)
echo The local server did not start. Check whether port %PORT% is already in use.
pause
exit /b 1

:open_page
start "" "%URL%"
exit /b 0

:is_page_running
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $page = Invoke-WebRequest -UseBasicParsing -Uri '%URL%' -TimeoutSec 1; if ($page.StatusCode -eq 200 -and $page.Content.Contains('O EMPIRE!')) { exit 0 } } catch {}; exit 1" >nul 2>&1
exit /b %errorlevel%
