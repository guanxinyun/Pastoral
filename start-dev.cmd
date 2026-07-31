@echo off
setlocal
cd /d "%~dp0"

title Pastoral Dev Server - http://127.0.0.1:5501

where node >nul 2>nul
if errorlevel 1 (
  echo [error] Node.js was not found. Install Node.js and try again.
  pause
  exit /b 1
)

echo [Pastoral] Building index.html and starting watch server...
echo [Pastoral] URL: http://127.0.0.1:5501/
echo [Pastoral] Keep this window open. Press Ctrl+C to stop.
echo.

node dev.js

if errorlevel 1 (
  echo.
  echo [error] The development server stopped unexpectedly.
  pause
)
