REM ============================================================================
REM reinstall-nucleus-service.bat
REM Reinstalación atómica del servicio Nucleus (útil para actualizaciones)
REM ============================================================================
@echo off

echo.
echo ========================================
echo  NUCLEUS SERVICE - REINSTALLER
echo ========================================
echo.
echo This will perform a clean reinstall of the Nucleus Service.
echo All managed components will be restarted:
echo   • Temporal Server
echo   • Temporal Worker
echo   • Control Plane
echo   • Ollama ^(if managed^)
echo.
echo Logs and configuration will be preserved.
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
call "%SCRIPT_DIR%uninstall-nucleus-service.bat"
if errorlevel 1 (
    echo.
    echo [ERROR] Uninstall failed, aborting reinstall
    pause
    exit /b 1
)

echo.
echo [STEP 2] Waiting for service cleanup...
echo   Ensuring all subprocesses are terminated...
timeout /t 5 /nobreak >nul
echo.

echo [STEP 3] Installing Nucleus Service...
echo.
call "%SCRIPT_DIR%install-nucleus-service.bat"
if errorlevel 1 (
    echo.
    echo [ERROR] Installation failed
    echo.
    echo You may need to manually check:
    echo   - Nucleus.exe binary exists
    echo   - Temporal.exe is present
    echo   - NSSM.exe is available
    echo   - No permission issues
    echo   - Port 7233 is not blocked
    pause
    exit /b 1
)

echo.
echo ========================================
echo   REINSTALL COMPLETE
echo ========================================
echo.
echo Nucleus Service has been successfully reinstalled.
echo All orchestrated components are being initialized.
echo.

REM Mostrar estado final
echo Current service status:
sc query BloomNucleusService
echo.

echo Check the following to verify full operation:
echo   1. Temporal UI:  http://localhost:8233
echo   2. Service log:  %%ProgramData%%\BloomNucleus\logs\nucleus\service\
echo   3. Health check: nucleus.exe --json health
echo.

pause
exit /b 0