@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Starting WorkBreak dev...
echo.
npm run dev
pause
