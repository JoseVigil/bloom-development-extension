@echo off
echo ========================================
echo Bloom Nucleus Installer - Dev Mode
echo ========================================
echo.

:: Verificar privilegios de administrador
net session >nul 2>&1
if %errorLevel% == 0 (
    echo Ejecutando con privilegios de administrador...
    echo.
    cd /d "%~dp0"
    electron . --dev
) else (
    echo Solicitando permisos de administrador...
    echo.
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process cmd -ArgumentList '/c cd /d \"%~dp0\" && electron . --dev && pause' -Verb RunAs"
)

pause