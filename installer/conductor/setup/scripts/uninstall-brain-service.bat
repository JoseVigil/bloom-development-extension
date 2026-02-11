REM ============================================================================
REM uninstall-brain-service.bat
REM Desinstalación completa del servicio Brain
REM ============================================================================
@echo off

echo.
echo ========================================
echo  BRAIN SERVICE - UNINSTALLER
echo ========================================
echo.

set NSSM=%~dp0..\bin\nssm\nssm.exe
set SERVICE_NAME=BloomBrainService

REM Verificar que NSSM existe
if not exist "%NSSM%" (
    echo [ERROR] NSSM not found at: %NSSM%
    echo Attempting fallback to sc command...
    goto FALLBACK_SC
)

REM Verificar si el servicio existe
sc query "%SERVICE_NAME%" >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [INFO] Service '%SERVICE_NAME%' does not exist, nothing to uninstall
    exit /b 0
)

echo [1/3] Stopping Brain Service...
"%NSSM%" stop "%SERVICE_NAME%" >nul 2>&1

REM Esperar a que se detenga completamente
timeout /t 2 /nobreak >nul

sc query "%SERVICE_NAME%" | find "STOPPED" >nul
if %ERRORLEVEL% EQU 0 (
    echo   ✓ Service stopped
) else (
    echo   ⚠️ Service may still be stopping...
    timeout /t 3 /nobreak >nul
)

echo.
echo [2/3] Removing service registration...
"%NSSM%" remove "%SERVICE_NAME%" confirm >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Failed to remove service with NSSM
    goto FALLBACK_SC
)
echo   ✓ Service removed
echo.

echo [3/3] Verifying removal...
timeout /t 1 /nobreak >nul
sc query "%SERVICE_NAME%" >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo   ✓ Service successfully uninstalled
    echo.
    echo ========================================
    echo   BRAIN SERVICE UNINSTALLED
    echo ========================================
    exit /b 0
) else (
    echo [ERROR] Service still exists after removal
    sc query "%SERVICE_NAME%"
    exit /b 1
)

:FALLBACK_SC
echo.
echo [FALLBACK] Using Windows SC command...
sc stop "%SERVICE_NAME%" >nul 2>&1
timeout /t 2 /nobreak >nul
sc delete "%SERVICE_NAME%" >nul 2>&1
timeout /t 1 /nobreak >nul

sc query "%SERVICE_NAME%" >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo   ✓ Service removed via SC
    exit /b 0
) else (
    echo [ERROR] Failed to remove service
    exit /b 1
)