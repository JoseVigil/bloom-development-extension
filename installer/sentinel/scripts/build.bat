@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion

:: Configurar directorio de logs (BloomNucleus Spec)
set LOG_BASE_DIR=%LOCALAPPDATA%\BloomNucleus\logs\build
set LOG_FILE=%LOG_BASE_DIR%\sentinel_build.log

:: Crear directorios de logs si no existen
if not exist "%LOG_BASE_DIR%" mkdir "%LOG_BASE_DIR%"

:: Iniciar log con timestamp
echo ============================================ > "%LOG_FILE%"
echo Sentinel Build Log - %DATE% %TIME% >> "%LOG_FILE%"
echo ============================================ >> "%LOG_FILE%"
echo. >> "%LOG_FILE%"

echo ============================================
echo 🚧 Building Sentinel Base (Safe Mode)
echo ============================================
echo 🚧 Building Sentinel Base (Safe Mode) >> "%LOG_FILE%"

:: ────────────────────────────────────────────────────────────────
:: DETECCIÓN AUTOMÁTICA DE ARQUITECTURA (Sustituye el hardcode 386)
:: ────────────────────────────────────────────────────────────────
set GOOS=windows
set CGO_ENABLED=0

if "%PROCESSOR_ARCHITECTURE%"=="AMD64" (
    set PLATFORM=win64
    set GOARCH=amd64
) else if "%PROCESSOR_ARCHITEW6432%"=="AMD64" (
    :: Detecta si estamos en un CMD de 32 bits corriendo en Windows de 64
    set PLATFORM=win64
    set GOARCH=amd64
) else (
    set PLATFORM=win32
    set GOARCH=386
)

:: Limitación de recursos para evitar OOM
set GOMEMLIMIT=512MiB

echo Environment: >> "%LOG_FILE%"
echo   Detected Platform: %PLATFORM% >> "%LOG_FILE%"
echo   GOARCH: %GOARCH% >> "%LOG_FILE%"
echo. >> "%LOG_FILE%"

:: ============================================
:: PROJECT ROOT (ABSOLUTO, CANONICO)
:: ============================================
set "PROJECT_ROOT=%~dp0..\..\.."
for %%I in ("%PROJECT_ROOT%") do set "PROJECT_ROOT=%%~fI"

set "APP_FOLDER=sentinel"
set "OUTPUT_BASE=%PROJECT_ROOT%\installer\native\bin\%PLATFORM%\%APP_FOLDER%"
set "OUTPUT_DIR=%OUTPUT_BASE%"
set "OUTPUT_FILE=%OUTPUT_DIR%\sentinel.exe"
set "HELP_DIR=%OUTPUT_DIR%\help"

:: Crear directorios de salida
if not exist "%OUTPUT_BASE%" mkdir "%OUTPUT_BASE%"
if not exist "%HELP_DIR%"    mkdir "%HELP_DIR%"

:: ============================================
:: INCREMENTAR BUILD NUMBER
:: ============================================
set BUILD_FILE=build_number.txt
set BUILD_INFO=..\internal\core\build_info.go

if not exist "%BUILD_FILE%" echo 0 > "%BUILD_FILE%"
set /p CURRENT_BUILD=<%BUILD_FILE%
set /a NEXT_BUILD=%CURRENT_BUILD%+1

for /f "tokens=1-3 delims=/-" %%a in ('date /t') do set BUILD_DATE=%%c-%%a-%%b
for /f "tokens=1-2 delims=:." %%a in ('echo %time: =0%') do set BUILD_TIME=%%a:%%b:00

(
    echo package core
    echo.
    echo // Auto-generated during build
    echo const BuildNumber = %NEXT_BUILD%
    echo const BuildDate = "%BUILD_DATE%"
    echo const BuildTime = "%BUILD_TIME%"
) > "%BUILD_INFO%"

echo %NEXT_BUILD% > "%BUILD_FILE%"

:: ============================================
:: COMPILACIÓN
:: ============================================
echo.
echo Compiling sentinel.exe [%PLATFORM%]...
echo Compiling sentinel.exe → %OUTPUT_FILE% ... >> "%LOG_FILE%"

pushd "%PROJECT_ROOT%\installer\sentinel"
go build -p 1 -ldflags="-s -w" -o "%OUTPUT_FILE%" . >> "%LOG_FILE%" 2>&1
set BUILD_RC=%ERRORLEVEL%
popd

if %BUILD_RC% NEQ 0 (
    echo ❌ Compilation failed. Revisa el log: %LOG_FILE%
    exit /b %BUILD_RC%
)

echo ✅ Compilation successful: %OUTPUT_FILE%

:: Copiar sentinel-config.json
if exist "..\sentinel-config.json" (
    copy /Y "..\sentinel-config.json" "%OUTPUT_DIR%\" >nul
)

:: ============================================
:: GENERAR DOCUMENTACIÓN DE AYUDA
:: ============================================
for %%F in ("%OUTPUT_FILE%") do set "OUTPUT_FILE_ABS=%%~fF"
"%OUTPUT_FILE_ABS%" --json-help > "%HELP_DIR%\sentinel_help.json" 2>> "%LOG_FILE%"
"%OUTPUT_FILE_ABS%" --help > "%HELP_DIR%\sentinel_help.txt" 2>> "%LOG_FILE%"

:: ============================================
:: REGISTRAR STREAM EN TELEMETRY (NUCLEUS CLI)
:: ============================================
echo.
echo ⏳ Registrando Telemetría vía Nucleus...
echo ⏳ Registrando Telemetría vía Nucleus... >> "%LOG_FILE%"

:: Definir ruta de Nucleus basado en la arquitectura actual
set "NUCLEUS_EXE=%PROJECT_ROOT%\installer\native\bin\%PLATFORM%\nucleus\nucleus.exe"

if exist "%NUCLEUS_EXE%" (
    :: Normalizar ruta del log para el JSON (slashes hacia adelante)
    set "NORM_LOG_PATH=%LOG_FILE:\=/%"

    "!NUCLEUS_EXE!" telemetry register ^
        --stream      sentinel_build ^
        --label       "📦 SENTINEL BUILD" ^
        --path        "!NORM_LOG_PATH!" ^
        --priority    3 ^
        --category    build ^
        --description "Sentinel build pipeline output — compiler and bundler logs for the Sentinel module" >> "%LOG_FILE%" 2>&1

    if %ERRORLEVEL% EQU 0 (
        echo   ✅ Telemetry registrado correctamente
    ) else (
        echo   ⚠️ Error al registrar telemetría (Nucleus RC: %ERRORLEVEL%)
    )
) else (
    echo   ⚠️ No se pudo registrar telemetría: No se encontró Nucleus en %NUCLEUS_EXE%
    echo   ⚠️ Nucleus.exe missing at: %NUCLEUS_EXE% >> "%LOG_FILE%"
)

:resumen
echo.
echo ============================================
echo 🎉 Sentinel Build [%PLATFORM%] completed.
echo ============================================
echo 📦 Output: %OUTPUT_DIR%
echo 📋 Log: %LOG_FILE%
echo.

endlocal