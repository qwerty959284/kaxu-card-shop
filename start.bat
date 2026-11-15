@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo   卡序 KAXU · 数字卡密商城
echo   前台: http://127.0.0.1:8787
echo   后台: http://127.0.0.1:8787/admin
echo.
node server.js
pause
