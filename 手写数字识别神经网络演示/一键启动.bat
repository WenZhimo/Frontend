@echo off
setlocal
cd /d "%~dp0"

set "PORT=8765"
set "URL=http://localhost:%PORT%/index.html"

where py >nul 2>nul
if not errorlevel 1 (
  set "PY=py -3"
) else (
  where python >nul 2>nul
  if not errorlevel 1 (
    set "PY=python"
  ) else (
    echo Python was not found. Please install Python 3 and try again.
    pause
    exit /b 1
  )
)

echo Starting MNIST ONNX CNN demo at %URL%
start "" "%URL%"
%PY% -m http.server %PORT%

echo.
echo Server stopped. If the port was already in use, close the other server or edit PORT in this file.
pause
