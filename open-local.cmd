@echo off
setlocal
cd /d "%~dp0"

where node.exe >nul 2>nul
if errorlevel 1 (
  echo [Research Workstation] Node.js 20 or newer is required.
  pause
  exit /b 1
)

node scripts\open-local.mjs %*
set "WORKSTATION_EXIT_CODE=%ERRORLEVEL%"

if not "%WORKSTATION_EXIT_CODE%"=="0" (
  echo.
  echo [Research Workstation] Local mode exited with code %WORKSTATION_EXIT_CODE%.
  pause
)

exit /b %WORKSTATION_EXIT_CODE%
