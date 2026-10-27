@echo off
chcp 65001 >nul
cd /d "%~dp0"
title ZJU Remake - Beta

rem ---- locate Node: node-path.txt -> PATH -> common install dirs ----
set "NODE_EXE="

if exist "node-path.txt" set /p NODE_EXE=<node-path.txt
if defined NODE_EXE if not exist "%NODE_EXE%" set "NODE_EXE="

if not defined NODE_EXE (
  where node >nul 2>nul
  if not errorlevel 1 set "NODE_EXE=node"
)

if not defined NODE_EXE if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
if not defined NODE_EXE if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "NODE_EXE=%LOCALAPPDATA%\Programs\nodejs\node.exe"

if not defined NODE_EXE (
  echo.
  echo   [X] Node.js not found.
  echo.
  echo       Option 1: install it from https://nodejs.org  ^(LTS^)
  echo       Option 2: if it is installed but not on PATH, write the full
  echo                 path of node.exe into  node-path.txt  in this folder.
  echo.
  pause
  exit /b 1
)

echo   Node: %NODE_EXE%
"%NODE_EXE%" "tools\launch.js"

echo.
echo   Service stopped. Press any key to close.
pause >nul
