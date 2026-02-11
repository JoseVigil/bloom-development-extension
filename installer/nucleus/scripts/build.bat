@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion

:: Configurar directorio de logs (Siguiendo Spec: LocalAppData\BloomNucleus\logs\[app])
set LOG_BASE_DIR=%LOCALAPPDATA%\BloomNucleus\logs\build
set LOG_FILE=%LOG_BASE_DIR%\nucleus_build.log

:: Crear directorios de logs si no existen
if not exist "%LOG_BASE_DIR%" mkdir "%LOG_BASE_DIR%"

:: Iniciar log con timestamp
echo ============================================ > "%LOG_FILE%"
echo Build Log - %DATE% %TIME% >> "%LOG_FILE%"
echo ============================================ >> "%LOG_FILE%"
echo. >> "%LOG_FILE%"

echo ============================================
echo 🚧 Building Nucleus Base (Safe Mode)
echo ============================================
echo 🚧 Building Nucleus Base (Safe Mode) >> "%LOG_FILE%"

:: ────────────────────────────────────────────────────────────────
:: DETECCIÓN AUTOMÁTICA DE ARQUITECTURA
:: ────────────────────────────────────────────────────────────────
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

:: ────────────────────────────────────────────────────────────────
:: Estructura de salida dinamica
:: ────────────────────────────────────────────────────────────────
set APP_FOLDER=nucleus
set OUTPUT_BASE=..\..\native\bin\%PLATFORM%\%APP_FOLDER%
set OUTPUT_DIR=%OUTPUT_BASE%
set OUTPUT_FILE=%OUTPUT_DIR%\nucleus.exe
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

:: ============================================
:: INCREMENTAR BUILD NUMBER
:: ============================================
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

:: ============================================
:: COMPILACIÓN
:: ============================================
echo Compiling nucleus.exe [%PLATFORM%]...
for %%I in ("%OUTPUT_FILE%") do set "ABS_OUTPUT_FILE=%%~fI"

pushd ".."
go build -p 1 -ldflags="-s -w" -o "!ABS_OUTPUT_FILE!" ./main.go >> "%LOG_FILE%" 2>&1
set BUILD_RC=%ERRORLEVEL%
popd

if %BUILD_RC% NEQ 0 (
    echo ❌ Compilation failed. Revisa: %LOG_FILE%
    exit /b %BUILD_RC%
)
echo ✅ Compilation successful: !ABS_OUTPUT_FILE!

:: ============================================
:: COPIAR RECURSOS
:: ============================================
set "GOVERNANCE_SOURCE=..\nucleus-governance.json"
if exist "%GOVERNANCE_SOURCE%" copy /Y "%GOVERNANCE_SOURCE%" "%OUTPUT_DIR%\" >nul

:: ============================================
:: GENERAR DOCUMENTACIÓN DE AYUDA
:: ============================================
"!ABS_OUTPUT_FILE!" --json-help > "%HELP_DIR%\nucleus_help.json" 2>> "%LOG_FILE%"
"!ABS_OUTPUT_FILE!" --help > "%HELP_DIR%\nucleus_help.txt" 2>> "%LOG_FILE%"

:: ============================================
:: ACTUALIZAR TELEMETRY (USANDO NUCLEUS CLI)
:: ============================================
echo.
echo ⏳ Registrando Telemetría...
echo ⏳ Registrando Telemetría... >> "%LOG_FILE%"

:: Normalizar ruta del log para el JSON (Slashes hacia adelante)
set "NORM_LOG_PATH=%LOG_FILE:\=/%"

:: Ejecutar el comando de registro usando el binario recién compilado
"!ABS_OUTPUT_FILE!" telemetry register ^
    --stream nucleus_build ^
    --label "📦 NUCLEUS BUILD" ^
    --path "!NORM_LOG_PATH!" ^
    --priority 3 >> "%LOG_FILE%" 2>&1

if %ERRORLEVEL% EQU 0 (
    echo ✅ Telemetry actualizado vía Nucleus CLI
    echo   Stream  : nucleus_build >> "%LOG_FILE%"
    echo   Priority: 3 >> "%LOG_FILE%"
) else (
    echo ⚠️ Error al registrar telemetría (Código: %ERRORLEVEL%)
    echo ⚠️ Error al registrar telemetría >> "%LOG_FILE%"
)

:: ============================================
:: RESUMEN FINAL
:: ============================================
echo.
echo ============================================
echo 🎉 Nucleus Build [%PLATFORM%] completed.
echo ============================================
echo 📦 Archivos en: %OUTPUT_DIR%
echo 📋 Log: %LOG_FILE%
echo.

endlocal