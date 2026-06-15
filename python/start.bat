@echo off
chcp 65001 >nul
title Phoenix Nest - Python - Launcher
cd /d "%~dp0"

echo ============================================
echo    PHOENIX NEST - PYTHON - Starting services
echo ============================================
echo.

echo [1/3] Freeing ports (stopping old servers)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8200 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3200 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1

if not exist "%~dp0apps\api\venv\Scripts\python.exe" goto :novenv

echo [2/3] Starting backend (FastAPI)...
start "Phoenix Nest Python - Backend" cmd /k "cd /d %~dp0apps\api && set PYTHONPATH=%~dp0apps\api && venv\Scripts\python.exe -m uvicorn app.main:app --reload --reload-dir app --host 127.0.0.1 --port 8200"

echo [3/3] Starting frontend (Next.js)...
start "Phoenix Nest Python - Frontend" cmd /k "cd /d %~dp0apps\web && pnpm dev"

echo.
echo  Waiting for servers to warm up...
timeout /t 8 /nobreak >nul

start http://localhost:3200

echo.
echo ============================================
echo    READY!  Browser opening...
echo ============================================
echo    Frontend : http://localhost:3200
echo    API Docs : http://localhost:8200/docs
echo ============================================
echo.
echo  This launcher window can be closed now.
timeout /t 5 /nobreak >nul
exit /b 0

:novenv
echo.
echo  ============================================
echo   ERROR: Python venv not found
echo  ============================================
echo   Expected: %~dp0apps\api\venv\Scripts\python.exe
echo.
echo   Set it up once:
echo     cd /d %~dp0apps\api
echo     python -m venv venv
echo     venv\Scripts\pip install -r requirements.txt
echo  ============================================
echo.
pause
exit /b 1
