@echo off
chcp 65001 >nul
title Phoenix Nest Hub - Launcher
cd /d "%~dp0"

echo ============================================
echo    PHOENIX NEST HUB - Starting
echo ============================================
echo.

REM [1/3] Ensure dependencies are installed
if not exist "node_modules\electron\dist\electron.exe" goto :install
echo [1/3] Dependencies OK.
goto :build

:install
echo [1/3] Installing dependencies - first run...
call npm install --no-fund --no-audit
if errorlevel 1 goto :npmfail

:build
REM [2/3] Build renderer + main
echo [2/3] Building hub with vite + tsc...
call npm run build
if errorlevel 1 goto :buildfail

REM [3/3] Launch Electron
echo [3/3] Launching Electron...
echo.
echo ============================================
echo    READY!  Opening Phoenix Nest Hub window
echo ============================================
echo.
call npm run electron
exit /b 0

:npmfail
echo.
echo  npm install failed. See messages above.
pause
exit /b 1

:buildfail
echo.
echo  Build failed. See messages above.
pause
exit /b 1
