@echo off
chcp 65001 >nul
title Phoenix Flow - Launcher
cd /d "%~dp0"

echo ============================================
echo    PHOENIX FLOW - Starting all services
echo ============================================
echo.

echo [1/3] Freeing ports (stopping old servers)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8000 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1

if not exist "%~dp0apps\api\venv\Scripts\python.exe" goto :novenv

echo [2/3] Starting backend (FastAPI + SQLite)...
start "Phoenix Flow - Backend" cmd /k "cd /d %~dp0apps\api && set PYTHONPATH=%~dp0apps\api && set PHOENIX_DEV=1 && venv\Scripts\python.exe -m uvicorn app.main:app --reload --reload-dir app --host 0.0.0.0 --port 8000"

echo [3/3] Starting frontend (Next.js)...
start "Phoenix Flow - Frontend" cmd /k "cd /d %~dp0apps\web && pnpm dev"

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

:novenv
echo.
echo  ============================================
echo   ERROR: Python venv not found
echo  ============================================
echo   Expected: %~dp0apps\api\venv\Scripts\python.exe
echo.
echo   The backend needs its virtual environment. Set it up once:
echo     cd /d %~dp0apps\api
echo     python -m venv venv
echo     venv\Scripts\pip install torch==2.6.0 torchvision==0.21.0 --index-url https://download.pytorch.org/whl/cu124
echo     venv\Scripts\pip install -r requirements.txt
echo     venv\Scripts\pip install --force-reinstall --no-deps opencv-contrib-python==4.13.0.92
echo.
echo   (Or copy the working venv from the original P:\PhoenixFlow\apps\api\venv)
echo  ============================================
echo.
pause
exit /b 1
