@echo off
rem Startet Core Business im Testmodus: Testszenarien im Startmenue und alle Test-Parameter.
rem Optional Startgeld: "Core Business Testmodus.bat" 100000
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1" -Dev %1
