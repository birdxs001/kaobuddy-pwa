@echo off
setlocal

cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
  py -3 -m venv .venv
)

".venv\Scripts\python.exe" -m pip install -e ".[test]" >nul

where node >nul 2>nul
if %ERRORLEVEL% EQU 0 (
  if exist "node_modules\vite\bin\vite.js" (
    node node_modules\typescript\bin\tsc >nul
    node node_modules\vite\bin\vite.js build >nul
  )
)

start "" "http://127.0.0.1:8000"
".venv\Scripts\python.exe" -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000

endlocal
