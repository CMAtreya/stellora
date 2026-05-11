@echo off
setlocal

rem More stable reload behavior on Windows terminals.
set WATCHFILES_FORCE_POLLING=true
set PYTHONUTF8=1

echo Installing dependencies...
pip install -r requirements.txt
if %ERRORLEVEL% NEQ 0 (
    echo Error installing dependencies!
    pause
    exit /b %ERRORLEVEL%
)

echo Starting Backend Server...
python -m uvicorn main:app --reload --reload-dir . --host 127.0.0.1 --port 8000 < NUL
pause
