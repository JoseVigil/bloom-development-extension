@echo off
REM ============================================================================
REM run-admin.bat
REM Ejecuta Electron con privilegios de administrador
REM Ubicación: /installer/electron-app/run-admin.bat
REM ============================================================================

echo.
echo ========================================
echo   Bloom Nucleus - Admin Launcher
echo ========================================
echo.

REM Verificar si ya tiene privilegios
net session >nul 2>&1
if %errorLevel% == 0 (
    echo [OK] Running with administrator privileges
    echo [*] Starting Electron...
    echo.
    call npm run electron:dev
) else (
    echo [!] Administrator privileges required
    echo [*] Requesting elevation...
    echo.
    
    REM Relanzar con privilegios usando PowerShell
    powershell -Command "Start-Process cmd -ArgumentList '/c cd /d \"%cd%\" && npm run electron:dev && pause' -Verb RunAs"
    
    echo.
    echo [OK] Elevation request sent
    echo [i] Accept the UAC prompt to continue
    timeout /t 3 /nobreak >nul
)

exit /b