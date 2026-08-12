@echo off
setlocal

set "SCRIPT=%~dp0generate_full_index.py"

if not exist "%SCRIPT%" (
  echo Cannot find "%SCRIPT%".
  echo.
  pause
  exit /b 1
)

where py >nul 2>nul
if %ERRORLEVEL% EQU 0 (
  py -3 "%SCRIPT%"
) else (
  python "%SCRIPT%"
)

set "EXIT_CODE=%ERRORLEVEL%"
if not "%EXIT_CODE%"=="0" (
  echo.
  echo Script exited with code %EXIT_CODE%.
)

echo.
pause
exit /b %EXIT_CODE%
