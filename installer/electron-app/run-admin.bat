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
    npm run dev
) else (
    echo Este instalador requiere privilegios de administrador.
    echo Solicitando permisos...
    echo.
    
    :: Relanzar con privilegios elevados
    powershell -Command "Start-Process cmd -ArgumentList '/c cd /d %~dp0 && npm run dev && pause' -Verb RunAs"
)

pause