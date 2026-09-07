@echo off
rem Double-clickable entry point for the Jarvis stack - this is the desktop shortcut's target.
rem It exists so the shortcut doesn't have to carry the -ExecutionPolicy dance itself.
title Jarvis
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-jarvis.ps1" %*
if errorlevel 1 (
  echo.
  echo Jarvis exited with an error. The window is being held open so you can read it.
  pause
)
