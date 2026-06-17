@echo off
chcp 65001 >nul
title PhoenixFlow - Desktop Launcher
cd /d "%~dp0"

echo ============================================
echo    PHOENIXFLOW - Desktop (Electron)
echo ============================================
echo.

echo [1/4] Freeing ports...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8000 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1

if not exist "%~dp0apps\api\venv\Scripts\python.exe" goto :novenv

echo [2/4] Starting backend (FastAPI + SQLite)...
start "PhoenixFlow - Backend" cmd /k "cd /d %~dp0apps\api && set PYTHONPATH=%~dp0apps\api && set PHOENIX_DEV=1 && venv\Scripts\python.exe -m uvicorn app.main:app --reload --reload-dir app --host 0.0.0.0 --port 8000"

echo [3/4] Starting frontend (Next.js)...
start "PhoenixFlow - Frontend" cmd /k "cd /d %~dp0apps\web && pnpm dev"

echo  Waiting for servers to warm up...
timeout /t 10 /nobreak >nul

echo [4/4] Launching Desktop app (Electron)...
cd /d %~dp0apps\desktop
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

:novenv
echo.
echo  ============================================
echo   ERROR: Python venv not found
echo  ============================================
echo   Expected: %~dp0apps\api\venv\Scripts\python.exe
echo   Set it up once (see start.bat header) or copy the working venv
echo   from the original P:\PhoenixFlow\apps\api\venv
echo  ============================================
echo.
pause
exit /b 1
