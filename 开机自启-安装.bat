@echo off
chcp 65001 >nul
cd /d "%~dp0"
title ZJU Remake - Autostart Install

powershell -NoProfile -ExecutionPolicy Bypass -File "tools\autostart.ps1" -Install
echo.
pause
