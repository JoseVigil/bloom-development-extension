@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion

:: ════════════════════════════════════════════════════════════════
:: LOG CONFIGURATION
:: ════════════════════════════════════════════════════════════════
set LOG_BASE_DIR=%LOCALAPPDATA%\BloomNucleus\logs\build
set LOG_FILE=%LOG_BASE_DIR%\sensor_build.log

:: Crear directorios de logs si no existen
if not exist "%LOG_BASE_DIR%" mkdir "%LOG_BASE_DIR%"

:: Iniciar log con timestamp
echo ============================================ > "%LOG_FILE%"
echo Sensor Build Log - %DATE% %TIME% >> "%LOG_FILE%"
echo ============================================ >> "%LOG_FILE%"
echo. >> "%LOG_FILE%"

:: ════════════════════════════════════════════════════════════════
:: HEADER
:: ════════════════════════════════════════════════════════════════
echo.
echo ============================================
echo � Building Bloom Sensor - Telemetry Daemon
echo ============================================
echo.
echo � Building Bloom Sensor >> "%LOG_FILE%"

:: ════════════════════════════════════════════════════════════════
:: ARCHITECTURE DETECTION
:: ════════════════════════════════════════════════════════════════
set GOOS=windows
set CGO_ENABLED=0

if "%PROCESSOR_ARCHITECTURE%"=="AMD64" (
    set PLATFORM=win64
    set GOARCH=amd64
) else if "%PROCESSOR_ARCHITEW6432%"=="AMD64" (
    set PLATFORM=win64
    set GOARCH=amd64
) else (
    set PLATFORM=win32
    set GOARCH=386
)

:: Limitación de recursos para evitar OOM
set GOMEMLIMIT=512MiB

echo Architecture Detected: %PLATFORM% (%GOARCH%)
echo Environment: >> "%LOG_FILE%"
echo   PLATFORM=%PLATFORM% >> "%LOG_FILE%"
echo   GOOS=%GOOS% >> "%LOG_FILE%"
echo   GOARCH=%GOARCH% >> "%LOG_FILE%"
echo   CGO_ENABLED=%CGO_ENABLED% >> "%LOG_FILE%"
echo   GOMEMLIMIT=%GOMEMLIMIT% >> "%LOG_FILE%"
echo. >> "%LOG_FILE%"

:: ════════════════════════════════════════════════════════════════
:: OUTPUT STRUCTURE
:: ════════════════════════════════════════════════════════════════
:: El script vive en: installer\sensor\scripts\build.bat
:: Subimos dos niveles para llegar a installer\
set SCRIPTS_DIR=%~dp0
pushd "%SCRIPTS_DIR%..\.."
set INSTALLER_ROOT=%CD%
popd

set APP_FOLDER=sensor
set OUTPUT_DIR=%INSTALLER_ROOT%\native\bin\%PLATFORM%\%APP_FOLDER%
set OUTPUT_FILE=%OUTPUT_DIR%\bloom-sensor.exe
set HELP_DIR=%OUTPUT_DIR%\help

:: Limpiar directorio de destino si existe
if exist "%OUTPUT_DIR%" (
    echo.
    echo Limpiando directorio de destino %PLATFORM%...
    rd /s /q "%OUTPUT_DIR%" >> "%LOG_FILE%" 2>&1
    if %ERRORLEVEL% EQU 0 (
        echo ✅ Directorio limpiado correctamente
    )
)

:: Crear carpeta de salida y carpeta help
if not exist "%OUTPUT_DIR%" mkdir "%OUTPUT_DIR%"
if not exist "%HELP_DIR%" mkdir "%HELP_DIR%"

echo Output directory: %OUTPUT_DIR% >> "%LOG_FILE%"
echo Output file: %OUTPUT_FILE% >> "%LOG_FILE%"
echo Help directory: %HELP_DIR% >> "%LOG_FILE%"
echo. >> "%LOG_FILE%"

:: ════════════════════════════════════════════════════════════════
:: BUILD NUMBER INCREMENT
:: ════════════════════════════════════════════════════════════════
echo.
echo Incrementando build number...

set BUILD_FILE=%SCRIPTS_DIR%build_number.txt

if not exist "%BUILD_FILE%" echo 0 > "%BUILD_FILE%"
set /p CURRENT_BUILD=<%BUILD_FILE%
set /a NEXT_BUILD=%CURRENT_BUILD%+1

:: Obtener fecha en formato YYYY-MM-DD via wmic (independiente de locale)
for /f "skip=1 tokens=1" %%d in ('wmic os get LocalDateTime') do (
    if not defined BUILD_DATETIME set BUILD_DATETIME=%%d
)
set BUILD_DATE=%BUILD_DATETIME:~0,4%-%BUILD_DATETIME:~4,2%-%BUILD_DATETIME:~6,2%
set BUILD_TIME=%BUILD_DATETIME:~8,2%:%BUILD_DATETIME:~10,2%:00

:: Guardar nuevo build number
echo %NEXT_BUILD% > "%BUILD_FILE%"

echo ✅ Build number: %NEXT_BUILD% ^(was %CURRENT_BUILD%^)
echo    Date: %BUILD_DATE% %BUILD_TIME%
echo.

echo Build Number: %NEXT_BUILD% >> "%LOG_FILE%"
echo Build Date: %BUILD_DATE% %BUILD_TIME% >> "%LOG_FILE%"
echo. >> "%LOG_FILE%"

:: ════════════════════════════════════════════════════════════════
:: COMPILATION
:: ════════════════════════════════════════════════════════════════
echo Compiling bloom-sensor.exe [%PLATFORM%]...
echo [COMPILE] Starting compilation >> "%LOG_FILE%"

for %%I in ("%OUTPUT_FILE%") do set "ABS_OUTPUT_FILE=%%~fI"

:: Entrar al directorio raíz del módulo Go (installer\sensor\)
pushd "%SCRIPTS_DIR%.."

:: Sincronizar dependencias si go.sum está desactualizado o no existe
echo Sincronizando dependencias (go mod tidy)...
echo [DEPS] Running go mod tidy >> "%LOG_FILE%"
go mod tidy >> "%LOG_FILE%" 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ❌ go mod tidy failed
    echo    Check log: %LOG_FILE%
    echo.
    echo [ERROR] go mod tidy failed >> "%LOG_FILE%"
    popd
    exit /b 1
)
echo ✅ Dependencies OK
echo.

go build -p 1 -ldflags="-s -w -X bloom-sensor/internal/buildinfo.Version=1.0.0 -X bloom-sensor/internal/buildinfo.BuildNumber=!NEXT_BUILD! -X bloom-sensor/internal/buildinfo.BuildDate=%BUILD_DATE% -X bloom-sensor/internal/buildinfo.BuildTime=%BUILD_TIME%" -o "!ABS_OUTPUT_FILE!" ./cmd/main.go >> "%LOG_FILE%" 2>&1
set BUILD_RC=%ERRORLEVEL%

popd

if %BUILD_RC% NEQ 0 (
    echo.
    echo ❌ Compilation failed
    echo    Check log: %LOG_FILE%
    echo.
    echo [ERROR] Compilation failed with code %BUILD_RC% >> "%LOG_FILE%"
    exit /b %BUILD_RC%
)

echo ✅ Compilation successful
echo    Output: !ABS_OUTPUT_FILE!
echo.

echo [SUCCESS] Compilation successful >> "%LOG_FILE%"
echo Output: !ABS_OUTPUT_FILE! >> "%LOG_FILE%"
echo. >> "%LOG_FILE%"

:: ════════════════════════════════════════════════════════════════
:: HELP GENERATION
:: ════════════════════════════════════════════════════════════════
echo Generando help...
echo [HELP] Generating help files >> "%LOG_FILE%"

:: sensor_help.txt — salida de --help en texto plano
"!ABS_OUTPUT_FILE!" --help > "%HELP_DIR%\sensor_help.txt" 2>&1
if %ERRORLEVEL% EQU 0 (
    echo ✅ sensor_help.txt generado
    echo [SUCCESS] sensor_help.txt generated >> "%LOG_FILE%"
) else (
    echo ⚠️  sensor_help.txt generation failed ^(non-critical^)
    echo [WARNING] sensor_help.txt generation failed >> "%LOG_FILE%"
)

:: sensor_help.json — salida de --json --help
"!ABS_OUTPUT_FILE!" --json --help > "%HELP_DIR%\sensor_help.json" 2>&1
if %ERRORLEVEL% EQU 0 (
    echo ✅ sensor_help.json generado
    echo.
    echo [SUCCESS] sensor_help.json generated >> "%LOG_FILE%"
) else (
    echo ⚠️  sensor_help.json generation failed ^(non-critical^)
    echo.
    echo [WARNING] sensor_help.json generation failed >> "%LOG_FILE%"
)

:: ════════════════════════════════════════════════════════════════
:: TELEMETRY REGISTRATION (via Nucleus CLI)
:: ════════════════════════════════════════════════════════════════
echo Registrando telemetría...

:: Ruta absoluta a nucleus.exe
set NUCLEUS_EXE=%LOCALAPPDATA%\BloomNucleus\bin\nucleus\nucleus.exe

:: Normalizar ruta del log para el JSON (barras invertidas → barras normales)
set "NORM_LOG_PATH=%LOG_FILE:\=/%"

"%NUCLEUS_EXE%" telemetry register ^
    --stream      sensor_build ^
    --label       "� SENSOR BUILD" ^
    --path        "!NORM_LOG_PATH!" ^
    --priority    3 ^
    --category    sensor ^
    --description "Sensor build pipeline output — compiler and bundler logs for the Sensor module" >> "%LOG_FILE%" 2>&1

if %ERRORLEVEL% EQU 0 (
    echo ✅ Telemetry registered via Nucleus CLI
    echo    Stream: sensor_build ^| Priority: 3
    echo.
    echo [SUCCESS] Telemetry registered >> "%LOG_FILE%"
) else (
    echo ⚠️  Telemetry registration failed ^(non-critical^)
    echo.
    echo [WARNING] Telemetry registration failed >> "%LOG_FILE%"
)

:: ════════════════════════════════════════════════════════════════
:: FINAL SUMMARY
:: ════════════════════════════════════════════════════════════════
echo.
echo ============================================
echo � Bloom Sensor Build Completed [%PLATFORM%]
echo ============================================
echo.
echo � Build Artifacts:
echo    Directory : %OUTPUT_DIR%
echo    Binary    : bloom-sensor.exe
echo    Help      : %HELP_DIR%
echo    Build #   : %NEXT_BUILD%
echo    Version   : v1.0.0-build.%NEXT_BUILD%
echo.
echo � Build Log:
echo    %LOG_FILE%
echo.

echo ============================================ >> "%LOG_FILE%"
echo [SUCCESS] Build Completed — v1.0.0-build.%NEXT_BUILD% >> "%LOG_FILE%"
echo ============================================ >> "%LOG_FILE%"

endlocal