@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul || (
  echo Node.js nebyl nalezen. Nainstaluj Node.js 20 LTS nebo novejsi.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Instaluju Electron zavislosti...
  call npm install
  if errorlevel 1 pause & exit /b 1
)
echo Spoustim Sanny Desktop 0.4...
call npm start
