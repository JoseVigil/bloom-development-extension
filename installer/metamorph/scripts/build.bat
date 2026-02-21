@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion

:: ════════════════════════════════════════════════════════════════
:: LOG CONFIGURATION
:: ════════════════════════════════════════════════════════════════
set LOG_BASE_DIR=%LOCALAPPDATA%\BloomNucleus\logs\build
set LOG_FILE=%LOG_BASE_DIR%\metamorph_build.log

:: Crear directorios de logs si no existen
if not exist "%LOG_BASE_DIR%" mkdir "%LOG_BASE_DIR%"

:: Iniciar log con timestamp
echo ============================================ > "%LOG_FILE%"
echo Metamorph Build Log - %DATE% %TIME% >> "%LOG_FILE%"
echo ============================================ >> "%LOG_FILE%"
echo. >> "%LOG_FILE%"

:: ════════════════════════════════════════════════════════════════
:: HEADER
:: ════════════════════════════════════════════════════════════════
echo.
echo ============================================
echo 🔧 Building Metamorph - System Reconciler
echo ============================================
echo.
echo 🔧 Building Metamorph >> "%LOG_FILE%"

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
set APP_FOLDER=metamorph
set OUTPUT_BASE=..\..\native\bin\%PLATFORM%\%APP_FOLDER%
set OUTPUT_DIR=%OUTPUT_BASE%
set OUTPUT_FILE=%OUTPUT_DIR%\metamorph.exe
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

:: Crear carpetas de salida
if not exist "%OUTPUT_BASE%" mkdir "%OUTPUT_BASE%"
if not exist "%HELP_DIR%"    mkdir "%HELP_DIR%"

:: ════════════════════════════════════════════════════════════════
:: BUILD NUMBER INCREMENT
:: ════════════════════════════════════════════════════════════════
echo.
echo Incrementando build number...

set BUILD_FILE=build_number.txt
set BUILD_INFO=..\internal\core\build_info.go

if not exist "%BUILD_FILE%" echo 0 > "%BUILD_FILE%"
set /p CURRENT_BUILD=<%BUILD_FILE%
set /a NEXT_BUILD=%CURRENT_BUILD%+1

:: Formatear fecha correctamente
for /f "tokens=1-3 delims=/-" %%a in ('date /t') do set BUILD_DATE=%%c-%%a-%%b
for /f "tokens=1-2 delims=:." %%a in ('echo %time: =0%') do set BUILD_TIME=%%a:%%b:00

:: Generar build_info.go
echo package core > "%BUILD_INFO%"
echo. >> "%BUILD_INFO%"
echo // Auto-generated during build >> "%BUILD_INFO%"
echo const BuildNumber = %NEXT_BUILD% >> "%BUILD_INFO%"
echo const BuildDate = "%BUILD_DATE%" >> "%BUILD_INFO%"
echo const BuildTime = "%BUILD_TIME%" >> "%BUILD_INFO%"
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
echo Compiling metamorph.exe [%PLATFORM%]...

for %%I in ("%OUTPUT_FILE%") do set "ABS_OUTPUT_FILE=%%~fI"

pushd ".."
go build -p 1 -ldflags="-s -w" -o "!ABS_OUTPUT_FILE!" ./main.go >> "%LOG_FILE%" 2>&1
set BUILD_RC=%ERRORLEVEL%
popd

if %BUILD_RC% NEQ 0 (
    echo.
    echo ❌ Compilation failed
    echo    Check log: %LOG_FILE%
    echo.
    echo [ERROR] Compilation failed >> "%LOG_FILE%"
    exit /b %BUILD_RC%
)

echo ✅ Compilation successful
echo    Output: !ABS_OUTPUT_FILE!
echo.

echo [SUCCESS] Compilation successful >> "%LOG_FILE%"
echo Output: !ABS_OUTPUT_FILE! >> "%LOG_FILE%"
echo. >> "%LOG_FILE%"

:: ════════════════════════════════════════════════════════════════
:: COPY RESOURCES
:: ════════════════════════════════════════════════════════════════
set "CONFIG_SOURCE=..\metamorph-config.json"
if exist "%CONFIG_SOURCE%" (
    echo Copying resources...
    copy /Y "%CONFIG_SOURCE%" "%OUTPUT_DIR%\" >nul 2>&1
    if %ERRORLEVEL% EQU 0 (
        echo ✅ Config file copied
        echo.
    )
)

:: ════════════════════════════════════════════════════════════════
:: GENERATE HELP DOCUMENTATION
:: ════════════════════════════════════════════════════════════════
echo Generating help documentation...

:: Generar help en texto
"!ABS_OUTPUT_FILE!" --help > "%HELP_DIR%\metamorph_help.txt" 2>&1
if %ERRORLEVEL% EQU 0 (
    echo ✅ Text help generated
)

:: Generar help en JSON
"!ABS_OUTPUT_FILE!" --json-help > "%HELP_DIR%\metamorph_help.json" 2>&1
if %ERRORLEVEL% EQU 0 (
    echo ✅ JSON help generated
)

:: Generar info JSON
"!ABS_OUTPUT_FILE!" info --json > "%HELP_DIR%\metamorph_info.json" 2>&1
if %ERRORLEVEL% EQU 0 (
    echo ✅ JSON info generated
)
echo.

:: ════════════════════════════════════════════════════════════════
:: ROLLOUT — Deploy binaries from repo to AppData
:: ════════════════════════════════════════════════════════════════
echo Deploying binaries to AppData (rollout)...
echo. >> "%LOG_FILE%"
echo [ROLLOUT] Deploying binaries to AppData >> "%LOG_FILE%"

"!ABS_OUTPUT_FILE!" rollout >> "%LOG_FILE%" 2>&1
set ROLLOUT_RC=%ERRORLEVEL%

if %ROLLOUT_RC% EQU 0 (
    echo ✅ Rollout successful
    echo [SUCCESS] Rollout completed >> "%LOG_FILE%"
) else (
    echo ⚠️  Rollout failed ^(non-critical, check log^)
    echo [WARNING] Rollout failed with code %ROLLOUT_RC% >> "%LOG_FILE%"
)
echo.

:: ════════════════════════════════════════════════════════════════
:: INSPECT — Interrogate all binaries and write metamorph.json
:: ════════════════════════════════════════════════════════════════
echo Inspecting deployed binaries...
echo. >> "%LOG_FILE%"
echo [INSPECT] Interrogating all binaries >> "%LOG_FILE%"

"!ABS_OUTPUT_FILE!" --json inspect >> "%LOG_FILE%" 2>&1
set INSPECT_RC=%ERRORLEVEL%

if %INSPECT_RC% EQU 0 (
    echo ✅ Inspection complete — metamorph.json updated
    echo [SUCCESS] Inspection completed >> "%LOG_FILE%"
) else (
    echo ⚠️  Inspection failed ^(non-critical, check log^)
    echo [WARNING] Inspection failed with code %INSPECT_RC% >> "%LOG_FILE%"
)
echo.

:: ════════════════════════════════════════════════════════════════
:: TELEMETRY REGISTRATION (via Nucleus CLI)
:: ════════════════════════════════════════════════════════════════
echo Registrando telemetría...

:: Normalizar ruta del log para el JSON
set "NORM_LOG_PATH=%LOG_FILE:\=/%"

:: Ejecutar el comando de registro usando Nucleus CLI
nucleus telemetry register ^
    --stream metamorph_build ^
    --label "📦 METAMORPH BUILD" ^
    --path "!NORM_LOG_PATH!" ^
    --priority 3 >> "%LOG_FILE%" 2>&1

if %ERRORLEVEL% EQU 0 (
    echo ✅ Telemetry registered via Nucleus CLI
    echo    Stream: metamorph_build ^| Priority: 3
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
echo 🎉 Metamorph Build Completed [%PLATFORM%]
echo ============================================
echo.
echo 📦 Build Artifacts:
echo    Directory : %OUTPUT_DIR%
echo    Binary    : metamorph.exe
echo    Build #   : %NEXT_BUILD%
echo    Version   : v1.0.0-build.%NEXT_BUILD%
echo.
echo 📋 Build Log:
echo    %LOG_FILE%
echo.

echo ============================================ >> "%LOG_FILE%"
echo [SUCCESS] Build Completed >> "%LOG_FILE%"
echo ============================================ >> "%LOG_FILE%"

endlocal