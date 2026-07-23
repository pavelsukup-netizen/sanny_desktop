@echo off
setlocal
cd /d "%~dp0"
title Sanny Desktop Rollback 0.5.2
echo.
echo ==============================================
echo   Sanny Desktop Rollback 0.5.2 ^> 0.5.1
echo ==============================================
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo [CHYBA] Node.js nebyl nalezen.
  pause
  exit /b 1
)
node patch-runtime\rollback-patch.js
if errorlevel 1 (
  echo.
  echo [CHYBA] Rollback selhal.
  pause
  exit /b 1
)
echo.
echo Puvodni soubory byly obnoveny.
pause
