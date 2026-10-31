@echo off
rem ECHT starten: Doppelklick genuegt. Der Server laeuft in diesem Fenster, solange du ECHT benutzt.
rem (Datei absichtlich ohne Umlaute, damit die Windows-Konsole sie richtig anzeigt.)
setlocal
cd /d "%~dp0"
title ECHT

where node >nul 2>nul
if %errorlevel%==0 (
  node serve.mjs --open
  goto :ende
)

echo Node.js ist nicht installiert. ECHT startet stattdessen mit dem in Windows eingebauten PowerShell-Server.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1"

:ende
if errorlevel 1 (
  echo.
  echo ECHT konnte nicht gestartet werden. Siehe Meldung oben.
  pause
)
