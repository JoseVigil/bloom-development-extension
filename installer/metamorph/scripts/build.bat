@echo off
setlocal EnableDelayedExpansion

:: Configurar directorio de logs
set LOG_BASE_DIR=%LOCALAPPDATA%\BloomNucleus\logs\build
set LOG_FILE=%LOG_BASE_DIR%\metamorph_build.log

:: Crear directorios de logs si no existen
if not exist "%LOG_BASE_DIR%" mkdir "%LOG_BASE_DIR%"

:: Iniciar log con timestamp
echo ============================================ > "%LOG_FILE%"
echo Metamorph Build Log - %DATE% %TIME% >> "%LOG_FILE%"
echo ============================================ >> "%LOG_FILE%"
echo. >> "%LOG_FILE%"

echo ============================================
echo Building Metamorph - System Reconciler
echo ============================================
echo Building Metamorph >> "%LOG_FILE%"

:: Deteccion automatica de arquitectura
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

:: Limitacion de recursos para evitar OOM
set GOMEMLIMIT=512MiB

echo Architecture Detected: %PLATFORM% (%GOARCH%)
echo Environment: >> "%LOG_FILE%"
echo   PLATFORM=%PLATFORM% >> "%LOG_FILE%"
echo   GOOS=%GOOS% >> "%LOG_FILE%"
echo   GOARCH=%GOARCH% >> "%LOG_FILE%"
echo   CGO_ENABLED=%CGO_ENABLED% >> "%LOG_FILE%"
echo   GOMEMLIMIT=%GOMEMLIMIT% >> "%LOG_FILE%"
echo. >> "%LOG_FILE%"

:: Estructura de salida dinamica
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
        echo [OK] Directorio limpiado correctamente
    )
)

:: Crear carpetas de salida
if not exist "%OUTPUT_BASE%" mkdir "%OUTPUT_BASE%"
if not exist "%HELP_DIR%"    mkdir "%HELP_DIR%"

:: Incrementar build number
echo Incrementando build number...
set BUILD_FILE=build_number.txt
set BUILD_INFO=..\internal\core\build_info.go

if not exist "%BUILD_FILE%" echo 0 > "%BUILD_FILE%"
set /p CURRENT_BUILD=<%BUILD_FILE%
set /a NEXT_BUILD=%CURRENT_BUILD%+1

for /f "tokens=1-3 delims=/-" %%a in ('date /t') do set BUILD_DATE=%%c-%%a-%%b
for /f "tokens=1-2 delims=:." %%a in ('echo %time: =0%') do set BUILD_TIME=%%a:%%b:00

echo package core > "%BUILD_INFO%"
echo. >> "%BUILD_INFO%"
echo // Auto-generated during build >> "%BUILD_INFO%"
echo const BuildNumber = %NEXT_BUILD% >> "%BUILD_INFO%"
echo const BuildDate = "%BUILD_DATE%" >> "%BUILD_INFO%"
echo const BuildTime = "%BUILD_TIME%" >> "%BUILD_INFO%"
echo %NEXT_BUILD% > "%BUILD_FILE%"

:: Compilacion
echo Compiling metamorph.exe [%PLATFORM%]...
for %%I in ("%OUTPUT_FILE%") do set "ABS_OUTPUT_FILE=%%~fI"

pushd ".."
go build -p 1 -ldflags="-s -w" -o "!ABS_OUTPUT_FILE!" ./main.go >> "%LOG_FILE%" 2>&1
set BUILD_RC=%ERRORLEVEL%
popd

if %BUILD_RC% NEQ 0 (
    echo [ERROR] Compilation failed. Revisa: %LOG_FILE%
    exit /b %BUILD_RC%
)
echo [OK] Compilation successful: !ABS_OUTPUT_FILE!

:: Copiar recursos
set "CONFIG_SOURCE=..\metamorph-config.json"
if exist "%CONFIG_SOURCE%" copy /Y "%CONFIG_SOURCE%" "%OUTPUT_DIR%\" >nul

:: Generar documentacion de ayuda
echo Generando documentacion de ayuda...
"!ABS_OUTPUT_FILE!" --json-help > "%HELP_DIR%\metamorph_help.json" 2>> "%LOG_FILE%"
"!ABS_OUTPUT_FILE!" --help > "%HELP_DIR%\metamorph_help.txt" 2>> "%LOG_FILE%"

:: Actualizar telemetria usando Nucleus CLI
echo.
echo Registrando telemetria...
echo Registrando telemetria... >> "%LOG_FILE%"

:: Normalizar ruta del log para el JSON
set "NORM_LOG_PATH=%LOG_FILE:\=/%"

:: Ejecutar el comando de registro usando Nucleus CLI
nucleus telemetry register --stream metamorph_build --label "METAMORPH BUILD" --path "!NORM_LOG_PATH!" --priority 3 >> "%LOG_FILE%" 2>&1

if %ERRORLEVEL% EQU 0 (
    echo [OK] Telemetry actualizado via Nucleus CLI
    echo   Stream  : metamorph_build >> "%LOG_FILE%"
    echo   Priority: 3 >> "%LOG_FILE%"
) else (
    echo [WARNING] Error al registrar telemetria - Codigo: %ERRORLEVEL%
    echo [WARNING] Error al registrar telemetria >> "%LOG_FILE%"
)

:: Resumen final
echo.
echo ============================================
echo [SUCCESS] Metamorph Build [%PLATFORM%] completed.
echo ============================================
echo Archivos en: %OUTPUT_DIR%
echo Log: %LOG_FILE%
echo.

endlocal
