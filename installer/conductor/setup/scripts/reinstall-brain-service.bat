REM ============================================================================
REM reinstall-brain-service.bat
REM Reinstalación atómica del servicio Brain (útil para actualizaciones)
REM ============================================================================
@echo off

echo.
echo ========================================
echo  BRAIN SERVICE - REINSTALLER
echo ========================================
echo.
echo This will perform a clean reinstall of the Brain Service.
echo All configuration and logs will be preserved.
echo.

REM Verificar permisos de administrador
net session >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] This script requires Administrator privileges
    echo.
    echo Please right-click and select "Run as administrator"
    pause
    exit /b 1
)

set SCRIPT_DIR=%~dp0

echo [STEP 1] Uninstalling existing service...
echo.
call "%SCRIPT_DIR%uninstall-brain-service.bat"
if errorlevel 1 (
    echo.
    echo [ERROR] Uninstall failed, aborting reinstall
    pause
    exit /b 1
)

echo.
echo [STEP 2] Waiting for service cleanup...
timeout /t 3 /nobreak >nul
echo.

echo [STEP 3] Installing Brain Service...
echo.
call "%SCRIPT_DIR%install-brain-service.bat"
if errorlevel 1 (
    echo.
    echo [ERROR] Installation failed
    echo.
    echo You may need to manually check:
    echo   - Brain.exe binary exists
    echo   - NSSM.exe is present
    echo   - No permission issues
    pause
    exit /b 1
)

echo.
echo ========================================
echo   REINSTALL COMPLETE
echo ========================================
echo.
echo Brain Service has been successfully reinstalled.
echo.

REM Mostrar estado final
echo Current service status:
sc query BloomBrainService
echo.

pause
exit /b 0