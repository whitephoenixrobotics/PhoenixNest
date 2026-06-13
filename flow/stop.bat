@echo off
chcp 65001 >nul
title Phoenix Flow - Stop
cd /d P:\PhoenixFlow

echo ============================================
echo    PHOENIX FLOW - Stopping all services
echo ============================================
echo.

echo [1/2] Stopping backend (port 8000)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8000 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1

echo [2/2] Stopping frontend (port 3000)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1

REM Close leftover server windows by title
taskkill /F /FI "WINDOWTITLE eq Phoenix Flow - Backend*" >nul 2>&1
taskkill /F /FI "WINDOWTITLE eq Phoenix Flow - Frontend*" >nul 2>&1

echo.
echo  All services stopped.
echo.
pause
exit /b 0
