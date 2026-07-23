@echo off
setlocal
cd /d "%~dp0"
title Sanny Desktop Patch 0.5.1 to 0.5.2
echo.
echo ==============================================
echo   Sanny Desktop Patch 0.5.1 ^> 0.5.2
echo ==============================================
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo [CHYBA] Node.js nebyl nalezen.
  echo Spust nejdriv puvodni INSTALL_AND_RUN.bat, nebo nainstaluj Node.js 20 LTS.
  pause
  exit /b 1
)
node patch-runtime\apply-patch.js
if errorlevel 1 (
  echo.
  echo [CHYBA] Patch se nepodarilo aplikovat.
  echo Puvodni soubory nebyly smazany. Podrobnosti jsou vyse.
  pause
  exit /b 1
)
echo.
echo Patch byl uspesne aplikovan.
echo Ted spust INSTALL_AND_RUN.bat.
pause
