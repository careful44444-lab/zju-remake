@echo off
chcp 65001 >nul
cd /d "%~dp0"
title ZJU Remake - Autostart Test

echo   正在按开机时的样子启动一次（静默，不开浏览器）...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "tools\autostart.ps1" -Run
powershell -NoProfile -ExecutionPolicy Bypass -File "tools\autostart.ps1" -Status
echo.
echo   如果没有报错，说明开机时会这样起来。
echo   浏览器打开 http://127.0.0.1:8123/h5/ 即可验证。
echo.
pause
