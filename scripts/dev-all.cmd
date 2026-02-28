@echo off
setlocal EnableExtensions

cd /d "%~dp0.."

node .\scripts\dev-all.mjs %*
exit /b %ERRORLEVEL%
