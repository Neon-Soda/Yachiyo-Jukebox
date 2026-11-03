@echo off
setlocal
cd /d "%~dp0"
call npm run dist
if errorlevel 1 exit /b 1
echo Build complete. The installer path is printed above.
