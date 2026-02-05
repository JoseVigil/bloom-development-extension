@echo off
REM ============================================================================
REM run-admin.bat
REM Ejecuta Electron Setup con privilegios de administrador
REM Ubicación: /installer/conductor/setup/run-admin.bat
REM ============================================================================

echo.
echo ========================================
echo   Bloom Nucleus Setup - Admin Mode
echo ========================================
echo.

REM Verificar si ya tiene privilegios
net session >nul 2>&1
if %errorLevel% == 0 (
    echo [OK] Running with administrator privileges
    echo [*] Starting Electron Setup...
    echo.
    call npm run dev:no-admin
) else (
    echo [!] Administrator privileges required
    echo [*] Requesting elevation...
    echo.
    
    REM Relanzar con privilegios usando PowerShell
    powershell -Command "Start-Process cmd -ArgumentList '/c cd /d \"%cd%\" && npm run dev:no-admin && pause' -Verb RunAs"
    
    echo.
    echo [OK] Elevation request sent
    echo [i] Accept the UAC prompt to continue
    REM Eliminado timeout - incompatible con Git Bash
)

exit /b