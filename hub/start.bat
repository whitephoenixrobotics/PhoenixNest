@echo off
chcp 65001 >nul
title PhoenixNest - Launcher
cd /d "%~dp0"

echo ============================================
echo    PHOENIXNEST - Starting
echo ============================================
echo.

REM [1/2] Ensure dependencies are installed
if not exist "node_modules\electron\dist\electron.exe" goto :install
echo [1/2] Dependencies OK.
goto :run

:install
echo [1/2] Installing dependencies - first run...
call npm install --no-fund --no-audit
if errorlevel 1 goto :npmfail

:run
REM [2/2] Launch Next dev server + Electron together
echo [2/2] Launching PhoenixNest (Next.js + Electron)...
echo.
echo ============================================
echo    Starting dev server, window opens shortly
echo ============================================
echo.
call npm run dev
exit /b 0

:npmfail
echo.
echo  npm install failed. See messages above.
pause
exit /b 1
