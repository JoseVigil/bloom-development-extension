REM ============================================================================
REM install-nucleus-service.bat
REM Instalación del servicio Nucleus con validación completa y logging
REM ============================================================================
@echo off
setlocal enabledelayedexpansion

REM Configuración de rutas - USAR APPDATA donde están deployados los binarios
set APPDATA_ROOT=%LOCALAPPDATA%\BloomNucleus
set NSSM=%APPDATA_ROOT%\bin\nssm\nssm.exe
set NUCLEUS_EXE=%APPDATA_ROOT%\nucleus\nucleus.exe
set SERVICE_NAME=BloomNucleusService
set LOG_BASE=%LOCALAPPDATA%\BloomNucleus\logs\nucleus\service
set INSTALL_LOG_BASE=%LOCALAPPDATA%\BloomNucleus\logs\install

REM Generar nombre de log con fecha
for /f "tokens=2-4 delims=/ " %%a in ('date /t') do (
    set YEAR=%%c
    set MONTH=%%a
    set DAY=%%b
)
for /f "tokens=1-3 delims=:." %%a in ("%TIME%") do (
    set HOUR=%%a
    set MIN=%%b
    set SEC=%%c
)
set HOUR=%HOUR: =0%
REM Asegurar formato YYYYMMDD
set DATESTAMP=%YEAR%%MONTH%%DAY%
set TIMESTAMP=%HOUR%%MIN%%SEC%
set LOG_FILE=%LOG_BASE%\nucleus_service_%DATESTAMP%.log

REM Crear directorio de logs de instalación
if not exist "%INSTALL_LOG_BASE%" (
    mkdir "%INSTALL_LOG_BASE%" 2>nul
)

REM Log de instalación con timestamp
set INSTALL_LOG=%INSTALL_LOG_BASE%\install-nucleus-service_%DATESTAMP%_%TIMESTAMP%.log

REM Iniciar log
echo ============================================ > "%INSTALL_LOG%"
echo BLOOM NUCLEUS SERVICE - INSTALLATION LOG >> "%INSTALL_LOG%"
echo Started: %DATE% %TIME% >> "%INSTALL_LOG%"
echo ============================================ >> "%INSTALL_LOG%"
echo. >> "%INSTALL_LOG%"

echo.
echo ========================================
echo  BLOOM NUCLEUS SERVICE - INSTALLER
echo ========================================
echo.

echo [INFO] Configuration:
echo [INFO] Configuration: >> "%INSTALL_LOG%"
echo   AppData Root: %APPDATA_ROOT%
echo   AppData Root: %APPDATA_ROOT% >> "%INSTALL_LOG%"
echo   NSSM:         %NSSM%
echo   NSSM:         %NSSM% >> "%INSTALL_LOG%"
echo   Binary:       %NUCLEUS_EXE%
echo   Binary:       %NUCLEUS_EXE% >> "%INSTALL_LOG%"
echo   Service:      %SERVICE_NAME%
echo   Service:      %SERVICE_NAME% >> "%INSTALL_LOG%"
echo   Log:          %LOG_FILE%
echo   Log:          %LOG_FILE% >> "%INSTALL_LOG%"
echo   Install Log:  %INSTALL_LOG%
echo   Install Log:  %INSTALL_LOG% >> "%INSTALL_LOG%"
echo.
echo. >> "%INSTALL_LOG%"

REM ============================================================================
REM VALIDACIONES
REM ============================================================================

echo [1/7] Validating binaries...
echo [1/7] Validating binaries... >> "%INSTALL_LOG%"

if not exist "%NSSM%" (
    echo [ERROR] NSSM not found at: %NSSM%
    echo [ERROR] NSSM not found at: %NSSM% >> "%INSTALL_LOG%"
    echo. >> "%INSTALL_LOG%"
    echo Please ensure NSSM is deployed to %%LOCALAPPDATA%%\BloomNucleus\bin\nssm\nssm.exe >> "%INSTALL_LOG%"
    echo Installation failed at: %DATE% %TIME% >> "%INSTALL_LOG%"
    exit /b 1
)
echo   ✓ NSSM found
echo   OK NSSM found >> "%INSTALL_LOG%"

if not exist "%NUCLEUS_EXE%" (
    echo [ERROR] Nucleus.exe not found at: %NUCLEUS_EXE%
    echo [ERROR] Nucleus.exe not found at: %NUCLEUS_EXE% >> "%INSTALL_LOG%"
    echo. >> "%INSTALL_LOG%"
    echo Please ensure Nucleus binary is deployed to %%LOCALAPPDATA%%\BloomNucleus\nucleus\nucleus.exe >> "%INSTALL_LOG%"
    echo Installation failed at: %DATE% %TIME% >> "%INSTALL_LOG%"
    exit /b 1
)
echo   ✓ Nucleus.exe found
echo   OK Nucleus.exe found >> "%INSTALL_LOG%"

REM Verificar que Temporal existe
set TEMPORAL_EXE=%APPDATA_ROOT%\bin\temporal\temporal.exe
echo   Checking Temporal at: %TEMPORAL_EXE% >> "%INSTALL_LOG%"
if not exist "%TEMPORAL_EXE%" (
    echo [ERROR] Temporal.exe not found at: %TEMPORAL_EXE%
    echo [ERROR] Temporal.exe not found at: %TEMPORAL_EXE% >> "%INSTALL_LOG%"
    echo. >> "%INSTALL_LOG%"
    echo Nucleus requires Temporal Server binary to be present >> "%INSTALL_LOG%"
    echo Installation failed at: %DATE% %TIME% >> "%INSTALL_LOG%"
    exit /b 1
)
echo   ✓ Temporal.exe found
echo   OK Temporal.exe found >> "%INSTALL_LOG%"
echo.
echo. >> "%INSTALL_LOG%"

REM ============================================================================
REM CREAR DIRECTORIO DE LOGS
REM ============================================================================

echo [2/7] Creating log directory...
echo [2/7] Creating log directory... >> "%INSTALL_LOG%"
if not exist "%LOG_BASE%" (
    mkdir "%LOG_BASE%" 2>nul
    if errorlevel 1 (
        echo [ERROR] Failed to create log directory: %LOG_BASE%
        echo [ERROR] Failed to create log directory: %LOG_BASE% >> "%INSTALL_LOG%"
        echo Installation failed at: %DATE% %TIME% >> "%INSTALL_LOG%"
        exit /b 1
    )
)
echo   ✓ Log directory ready: %LOG_BASE%
echo   OK Log directory ready: %LOG_BASE% >> "%INSTALL_LOG%"
echo.
echo. >> "%INSTALL_LOG%"

REM ============================================================================
REM LIMPIEZA DE SERVICIO EXISTENTE
REM ============================================================================

echo [3/7] Checking for existing service...
echo [3/7] Checking for existing service... >> "%INSTALL_LOG%"
sc query "%SERVICE_NAME%" >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo   Found existing service, removing...
    echo   Found existing service, removing... >> "%INSTALL_LOG%"
    
    REM Detener servicio si está corriendo
    sc query "%SERVICE_NAME%" | find "RUNNING" >nul
    if %ERRORLEVEL% EQU 0 (
        echo   Stopping service... >> "%INSTALL_LOG%"
        sc stop "%SERVICE_NAME%" >> "%INSTALL_LOG%" 2>&1
        timeout /t 5 /nobreak >nul
    )
    
    REM Remover servicio con NSSM
    echo   Removing with NSSM... >> "%INSTALL_LOG%"
    "%NSSM%" remove "%SERVICE_NAME%" confirm >> "%INSTALL_LOG%" 2>&1
    if errorlevel 1 (
        echo [ERROR] Failed to remove existing service >> "%INSTALL_LOG%"
    )
    
    timeout /t 3 /nobreak >nul
    echo   ✓ Old service removed
    echo   OK Old service removed >> "%INSTALL_LOG%"
) else (
    echo   ✓ No existing service found
    echo   OK No existing service found >> "%INSTALL_LOG%"
)
echo.
echo. >> "%INSTALL_LOG%"

REM ============================================================================
REM ROTACIÓN DE LOG SI ES NECESARIO
REM ============================================================================

echo [4/7] Checking log rotation...
echo [4/7] Checking log rotation... >> "%INSTALL_LOG%"
echo   OK Skipping rotation (will be handled by service) >> "%INSTALL_LOG%"
echo.
echo. >> "%INSTALL_LOG%"

REM ============================================================================
REM INSTALACIÓN DEL SERVICIO
REM ============================================================================

echo [5/7] Installing Nucleus Service with NSSM...
echo [5/7] Installing Nucleus Service with NSSM... >> "%INSTALL_LOG%"

REM A. Instalar servicio
echo   Running: "%NSSM%" install "%SERVICE_NAME%" "%NUCLEUS_EXE%" >> "%INSTALL_LOG%"
"%NSSM%" install "%SERVICE_NAME%" "%NUCLEUS_EXE%" >> "%INSTALL_LOG%" 2>&1
if errorlevel 1 (
    echo [ERROR] Failed to install service
    echo [ERROR] Failed to install service >> "%INSTALL_LOG%"
    echo NSSM install command failed with errorlevel %ERRORLEVEL% >> "%INSTALL_LOG%"
    echo Installation failed at: %DATE% %TIME% >> "%INSTALL_LOG%"
    exit /b 1
)
echo   ✓ Service installed
echo   OK Service installed >> "%INSTALL_LOG%"

REM B. Configurar argumentos (comando 'service' en lugar de 'dev-start')
echo   Setting AppParameters... >> "%INSTALL_LOG%"
"%NSSM%" set "%SERVICE_NAME%" AppParameters "service" >> "%INSTALL_LOG%" 2>&1
echo   ✓ Arguments configured
echo   OK Arguments configured >> "%INSTALL_LOG%"

REM C. Directorio de trabajo
set WORK_DIR=%APPDATA_ROOT%\nucleus
echo   Setting AppDirectory to: %WORK_DIR% >> "%INSTALL_LOG%"
"%NSSM%" set "%SERVICE_NAME%" AppDirectory "%WORK_DIR%" >> "%INSTALL_LOG%" 2>&1
echo   ✓ Working directory set
echo   OK Working directory set >> "%INSTALL_LOG%"

REM D. Variables de entorno (incluyendo BLOOM_LOGS_DIR para LOCALAPPDATA)
set ENV_VARS=BLOOM_LOGS_DIR=%LOCALAPPDATA%\BloomNucleus\logs
echo   Setting environment variables... >> "%INSTALL_LOG%"
"%NSSM%" set "%SERVICE_NAME%" AppEnvironmentExtra "%ENV_VARS%" >> "%INSTALL_LOG%" 2>&1
echo   ✓ Environment variables set
echo   OK Environment variables set >> "%INSTALL_LOG%"

REM E. Redirección de logs
echo   Setting log redirection... >> "%INSTALL_LOG%"
"%NSSM%" set "%SERVICE_NAME%" AppStdout "%LOG_FILE%" >> "%INSTALL_LOG%" 2>&1
"%NSSM%" set "%SERVICE_NAME%" AppStderr "%LOG_FILE%" >> "%INSTALL_LOG%" 2>&1
echo   ✓ Log redirection configured
echo   OK Log redirection configured >> "%INSTALL_LOG%"

REM F. Configuración de inicio
echo   Setting service configuration... >> "%INSTALL_LOG%"
"%NSSM%" set "%SERVICE_NAME%" Start SERVICE_AUTO_START >> "%INSTALL_LOG%" 2>&1
"%NSSM%" set "%SERVICE_NAME%" AppExit Default Restart >> "%INSTALL_LOG%" 2>&1
"%NSSM%" set "%SERVICE_NAME%" DisplayName "Bloom Nucleus Service" >> "%INSTALL_LOG%" 2>&1
"%NSSM%" set "%SERVICE_NAME%" Description "Bloom Nucleus Service - Orchestrates Temporal, Worker, Ollama, and Control Plane" >> "%INSTALL_LOG%" 2>&1
echo   ✓ Service configuration complete
echo   OK Service configuration complete >> "%INSTALL_LOG%"
echo.
echo. >> "%INSTALL_LOG%"

REM ============================================================================
REM INICIAR SERVICIO
REM ============================================================================

echo [6/7] Starting Nucleus Service...
echo [6/7] Starting Nucleus Service... >> "%INSTALL_LOG%"
echo   Running: sc start "%SERVICE_NAME%" >> "%INSTALL_LOG%"
sc start "%SERVICE_NAME%" >> "%INSTALL_LOG%" 2>&1
if errorlevel 1 (
    echo [ERROR] Failed to start service
    echo [ERROR] Failed to start service >> "%INSTALL_LOG%"
    echo sc start failed with errorlevel %ERRORLEVEL% >> "%INSTALL_LOG%"
    echo. >> "%INSTALL_LOG%"
    echo Last 10 lines of service log: >> "%INSTALL_LOG%"
    if exist "%LOG_FILE%" (
        powershell -Command "Get-Content '%LOG_FILE%' -Tail 10" >> "%INSTALL_LOG%" 2>&1
        echo.
        echo Last 10 lines of log:
        powershell -Command "Get-Content '%LOG_FILE%' -Tail 10"
    )
    echo Installation failed at: %DATE% %TIME% >> "%INSTALL_LOG%"
    exit /b 1
)
echo   ✓ Start command sent
echo   OK Start command sent >> "%INSTALL_LOG%"
echo.
echo. >> "%INSTALL_LOG%"

REM ============================================================================
REM VERIFICACIÓN
REM ============================================================================

echo [7/7] Verifying service status...
echo [7/7] Verifying service status... >> "%INSTALL_LOG%"
timeout /t 5 /nobreak >nul

sc query "%SERVICE_NAME%" >> "%INSTALL_LOG%" 2>&1
sc query "%SERVICE_NAME%" | find "RUNNING" >nul
if %ERRORLEVEL% EQU 0 (
    echo   ✓ Service is RUNNING
    echo   OK Service is RUNNING >> "%INSTALL_LOG%"
    echo.
    echo. >> "%INSTALL_LOG%"
    echo ========================================
    echo   NUCLEUS SERVICE INSTALLED SUCCESSFULLY
    echo ========================================
    echo Installation completed successfully at: %DATE% %TIME% >> "%INSTALL_LOG%"
    echo. >> "%INSTALL_LOG%"
    echo Service Name:  %SERVICE_NAME%
    echo Display Name:  Bloom Nucleus Service
    echo Log File:      %LOG_FILE%
    echo Install Log:   %INSTALL_LOG%
    echo.
    echo Components managed by Nucleus:
    echo   • Temporal Server ^(port 7233^)
    echo   • Temporal Worker ^(internal^)
    echo   • Ollama ^(via synapse^)
    echo   • Control Plane ^(Node.js^)
    echo.
    echo Management:
    echo   Start:    sc start %SERVICE_NAME%
    echo   Stop:     sc stop %SERVICE_NAME%
    echo   Status:   sc query %SERVICE_NAME%
    echo.
    exit /b 0
) else (
    echo [ERROR] Service did not start properly
    echo [ERROR] Service did not start properly >> "%INSTALL_LOG%"
    sc query "%SERVICE_NAME%"
    echo. >> "%INSTALL_LOG%"
    echo Last 30 lines of service log: >> "%INSTALL_LOG%"
    if exist "%LOG_FILE%" (
        powershell -Command "Get-Content '%LOG_FILE%' -Tail 30" >> "%INSTALL_LOG%" 2>&1
        echo.
        echo Last 30 lines of log:
        powershell -Command "Get-Content '%LOG_FILE%' -Tail 30"
    )
    echo Installation failed at: %DATE% %TIME% >> "%INSTALL_LOG%"
    exit /b 1
)