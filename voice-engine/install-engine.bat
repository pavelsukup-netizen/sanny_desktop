@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>nul || (
  echo Python nebyl nalezen. Nainstaluj Python 3.11 nebo 3.12 a zaskrtni Add Python to PATH.
  pause
  exit /b 1
)
if not exist .venv (
  py -3.11 -m venv .venv 2>nul || py -3.12 -m venv .venv
)
call .venv\Scripts\activate.bat
python -m pip install --upgrade pip setuptools wheel
pip install -r requirements.txt
if errorlevel 1 (
  echo.
  echo Instalace selhala. Na AMD Windows muze byt potreba nejdriv nainstalovat kompatibilni PyTorch podle dokumentace AMD ROCm.
  pause
  exit /b 1
)
echo.
echo Sanny Voice Engine je nainstalovany.
pause
