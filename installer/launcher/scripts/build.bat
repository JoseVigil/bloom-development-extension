@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion

:: ════════════════════════════════════════════════════════════════
:: LOG CONFIGURATION
:: ════════════════════════════════════════════════════════════════
set LOG_BASE_DIR=%LOCALAPPDATA%\BloomNucleus\logs\build
set LOG_FILE=%LOG_BASE_DIR%\launcher_build.log

:: Crear directorios de logs si no existen
if not exist "%LOG_BASE_DIR%" mkdir "%LOG_BASE_DIR%"

:: Iniciar log con timestamp
echo ============================================ > "%LOG_FILE%"
echo Launcher Build Log - %DATE% %TIME% >> "%LOG_FILE%"
echo ============================================ >> "%LOG_FILE%"
echo. >> "%LOG_FILE%"

:: ════════════════════════════════════════════════════════════════
:: HEADER
:: ════════════════════════════════════════════════════════════════
echo.
echo ============================================
echo 🚀 Building Bloom Launcher - Named Pipe Daemon
echo ============================================
echo.
echo 🚀 Building Bloom Launcher >> "%LOG_FILE%"

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
:: El script vive en: installer\launcher\scripts\build.bat
:: Subimos tres niveles para llegar a la raiz del repo (installer\)
set SCRIPTS_DIR=%~dp0
:: SCRIPTS_DIR = ...\installer\launcher\scripts\
:: Subimos a installer\
pushd "%SCRIPTS_DIR%..\.."
set INSTALLER_ROOT=%CD%
popd

set APP_FOLDER=launcher
set OUTPUT_BASE=%INSTALLER_ROOT%\native\bin\%PLATFORM%\%APP_FOLDER%
set OUTPUT_DIR=%OUTPUT_BASE%
set OUTPUT_FILE=%OUTPUT_DIR%\bloom-launcher.exe

:: Limpiar directorio de destino si existe
if exist "%OUTPUT_DIR%" (
    echo.
    echo Limpiando directorio de destino %PLATFORM%...
    rd /s /q "%OUTPUT_DIR%" >> "%LOG_FILE%" 2>&1
    if %ERRORLEVEL% EQU 0 (
        echo ✅ Directorio limpiado correctamente
    )
)

:: Crear carpeta de salida
if not exist "%OUTPUT_DIR%" mkdir "%OUTPUT_DIR%"

echo Output directory: %OUTPUT_DIR% >> "%LOG_FILE%"
echo Output file: %OUTPUT_FILE% >> "%LOG_FILE%"
echo. >> "%LOG_FILE%"

:: ════════════════════════════════════════════════════════════════
:: BUILD NUMBER INCREMENT
:: ════════════════════════════════════════════════════════════════
echo.
echo Incrementando build number...

:: El build_number.txt vive en installer\launcher\scripts\ junto a este bat
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
echo Compiling bloom-launcher.exe [%PLATFORM%]...
echo [COMPILE] Starting compilation >> "%LOG_FILE%"

for %%I in ("%OUTPUT_FILE%") do set "ABS_OUTPUT_FILE=%%~fI"

:: Entrar al directorio raíz del módulo Go (installer\launcher\)
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

go build -p 1 -ldflags="-s -w -X bloom-launcher/internal/buildinfo.BuildNumber=!NEXT_BUILD! -X bloom-launcher/internal/buildinfo.BuildDate=%BUILD_DATE% -X bloom-launcher/internal/buildinfo.BuildTime=%BUILD_TIME%" -o "!ABS_OUTPUT_FILE!" ./cmd/main.go >> "%LOG_FILE%" 2>&1
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
:: TELEMETRY REGISTRATION (via Nucleus CLI)
:: ════════════════════════════════════════════════════════════════
echo Registrando telemetría...

:: Normalizar ruta del log para el JSON (barras invertidas → barras normales)
set "NORM_LOG_PATH=%LOG_FILE:\=/%"

nucleus telemetry register ^
    --stream launcher_build ^
    --label "🚀 LAUNCHER BUILD" ^
    --path "!NORM_LOG_PATH!" ^
    --priority 3 >> "%LOG_FILE%" 2>&1

if %ERRORLEVEL% EQU 0 (
    echo ✅ Telemetry registered via Nucleus CLI
    echo    Stream: launcher_build ^| Priority: 3
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
echo 🎉 Bloom Launcher Build Completed [%PLATFORM%]
echo ============================================
echo.
echo 📦 Build Artifacts:
echo    Directory : %OUTPUT_DIR%
echo    Binary    : bloom-launcher.exe
echo    Build #   : %NEXT_BUILD%
echo    Version   : v1.0.0-build.%NEXT_BUILD%
echo.
echo 📋 Build Log:
echo    %LOG_FILE%
echo.

echo ============================================ >> "%LOG_FILE%"
echo [SUCCESS] Build Completed — v1.0.0-build.%NEXT_BUILD% >> "%LOG_FILE%"
echo ============================================ >> "%LOG_FILE%"

endlocal