@echo off
chcp 65001 >nul
title PhoenixPy - Desktop Launcher
cd /d "%~dp0"

echo ============================================
echo    PhoenixPy - Desktop (Electron)
echo ============================================
echo.

echo [1/4] Freeing ports (stopping old servers)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8200 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3200 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1

if not exist "%~dp0apps\api\venv\Scripts\python.exe" goto :novenv

echo [2/4] Starting backend (FastAPI)...
start "PhoenixPy - Backend" cmd /k "cd /d %~dp0apps\api && set PYTHONPATH=%~dp0apps\api && venv\Scripts\python.exe -m uvicorn app.main:app --reload --reload-dir app --host 127.0.0.1 --port 8200"

echo [3/4] Starting frontend (Next.js)...
start "PhoenixPy - Frontend" cmd /k "cd /d %~dp0apps\web && pnpm dev"

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
echo  (close those windows to stop the servers)
timeout /t 3 /nobreak >nul
exit /b 0

:novenv
echo.
echo  ============================================
echo   ERROR: Python venv not found
echo  ============================================
echo   Expected: %~dp0apps\api\venv\Scripts\python.exe
echo   Set it up once:
echo     cd /d %~dp0apps\api
echo     python -m venv venv
echo     venv\Scripts\pip install -r requirements.txt
echo  ============================================
echo.
pause
exit /b 1
