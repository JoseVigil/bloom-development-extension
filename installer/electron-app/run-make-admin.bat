@echo off
echo ========================================
echo Bloom Nucleus - Build Installer
echo ========================================
echo.

net session >nul 2>&1
if %errorLevel% == 0 (
    echo Ejecutando build con privilegios de administrador...
    echo.
    cd /d "%~dp0"
    npm run make
) else (
    echo Solicitando permisos...
    echo.
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process cmd -ArgumentList '/c cd /d \"%~dp0\" && npm run make && pause' -Verb RunAs"
)

pause