@echo off
chcp 65001 >nul
title Phoenix Flow - Desktop Launcher
cd /d P:\PhoenixFlow

echo ============================================
echo    PHOENIX FLOW - Desktop (Electron)
echo ============================================
echo.

echo [1/4] Freeing ports...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8000 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1

echo [2/4] Starting backend (FastAPI + SQLite)...
start "Phoenix Flow - Backend" cmd /k "cd /d P:\PhoenixFlow\apps\api && set PYTHONPATH=P:\PhoenixFlow\apps\api && set PHOENIX_DEV=1 && venv\Scripts\python.exe -m uvicorn app.main:app --reload --reload-dir app --host 0.0.0.0 --port 8000"

echo [3/4] Starting frontend (Next.js)...
start "Phoenix Flow - Frontend" cmd /k "cd /d P:\PhoenixFlow\apps\web && pnpm dev"

echo  Waiting for servers to warm up...
timeout /t 10 /nobreak >nul

echo [4/4] Launching Desktop app (Electron)...
cd /d P:\PhoenixFlow\apps\desktop
if not exist node_modules (
    echo  First run: installing desktop dependencies...
    call pnpm install
)
call pnpm start

echo.
echo  Desktop app closed. The backend/frontend windows are still running.
echo  (run stop.bat to stop everything)
timeout /t 3 /nobreak >nul
exit /b 0
