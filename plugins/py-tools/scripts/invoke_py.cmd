@echo off
setlocal
powershell -ExecutionPolicy Bypass -File "%~dp0invoke_py.ps1" %*
exit /b %errorlevel%
