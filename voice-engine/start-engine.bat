@echo off
cd /d "%~dp0"
if not exist .venv\Scripts\python.exe (
  echo Voice Engine neni nainstalovany. Nejdriv spust install-engine.bat
  pause
  exit /b 1
)
call .venv\Scripts\activate.bat
python server.py
