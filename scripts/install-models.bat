@echo off
where ollama >nul 2>nul || (
  echo Ollama nebyla nalezena. Nainstaluj ji z ollama.com.
  pause
  exit /b 1
)
echo Stahuju Qwen 3.5 35B-A3B...
ollama pull qwen3.5:35b-a3b
if errorlevel 1 pause & exit /b 1
echo Stahuju GPT-OSS 20B...
ollama pull gpt-oss:20b
if errorlevel 1 pause & exit /b 1
echo Oba modely jsou pripravene.
pause
