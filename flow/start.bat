@echo off
chcp 65001 >nul
title Phoenix Flow - Launcher
cd /d P:\PhoenixFlow

echo ============================================
echo    PHOENIX FLOW - Starting all services
echo ============================================
echo.

echo [1/3] Freeing ports (stopping old servers)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8000 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1

echo [2/3] Starting backend (FastAPI + SQLite)...
start "Phoenix Flow - Backend" cmd /k "cd /d P:\PhoenixFlow\apps\api && set PYTHONPATH=P:\PhoenixFlow\apps\api && set PHOENIX_DEV=1 && venv\Scripts\python.exe -m uvicorn app.main:app --reload --reload-dir app --host 0.0.0.0 --port 8000"

echo [3/3] Starting frontend (Next.js)...
start "Phoenix Flow - Frontend" cmd /k "cd /d P:\PhoenixFlow\apps\web && pnpm dev"

echo.
echo  Waiting for servers to warm up...
timeout /t 9 /nobreak >nul

start http://localhost:3000

echo.
echo ============================================
echo    READY!  Browser opening...
echo ============================================
echo    Frontend : http://localhost:3000
echo    API Docs : http://localhost:8000/docs
echo.
echo    To STOP everything: run  stop.bat
echo    (or just close the 2 opened windows)
echo ============================================
echo.
echo  This launcher window can be closed now.
timeout /t 5 /nobreak >nul
exit /b 0
