@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 正在启动 WorkBreak 开发环境...
echo.
npm run dev
pause
