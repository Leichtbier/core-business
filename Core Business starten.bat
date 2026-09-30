@echo off
rem Startet Core Business (ohne Testszenarien).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1"
