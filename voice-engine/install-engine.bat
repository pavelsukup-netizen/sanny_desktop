@echo off
setlocal
cd /d "%~dp0"

echo Sanny Voice Engine - instalace XTTS-v2
echo.
echo Model XTTS-v2 je poskytovan pod Coqui Public Model License.
echo Pred prvnim stazenim je nutne potvrdit, ze s licenci souhlasis.
choice /C AN /N /M "Souhlasis s licenci a chces pokracovat? [A/N]: "
if errorlevel 2 (
  echo Instalace zrusena.
  pause
  exit /b 1
)
> .tos_accepted echo accepted

where py >nul 2>nul || (
  echo Python nebyl nalezen. Nainstaluj Python 3.11 nebo 3.12 a zaskrtni Add Python to PATH.
  pause
  exit /b 1
)

if not exist .venv (
  py -3.11 -m venv .venv 2>nul || py -3.12 -m venv .venv
)
if not exist .venv\Scripts\python.exe (
  echo Nepodarilo se vytvorit Python virtualni prostredi.
  pause
  exit /b 1
)

call .venv\Scripts\activate.bat
python -m pip install --upgrade pip setuptools wheel
pip install -r requirements.txt
if errorlevel 1 (
  echo.
  echo Instalace selhala. Na AMD Windows muze byt potreba samostatna kompatibilni instalace PyTorch podle AMD ROCm dokumentace.
  echo Zakladni CPU fallback lze zkusit znovu spustenim tohoto souboru.
  pause
  exit /b 1
)

echo.
echo Sanny Voice Engine je nainstalovany.
echo Pri prvnim hlasovem testu se stahne XTTS-v2 model a muze to chvili trvat.
pause
