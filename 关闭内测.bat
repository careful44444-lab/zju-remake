@echo off
chcp 65001 >nul
cd /d "%~dp0"
title ZJU Remake - Stop
powershell -NoProfile -ExecutionPolicy Bypass -File "tools\stop.ps1"
pause