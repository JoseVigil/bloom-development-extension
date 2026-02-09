@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion

:: Configurar directorio de logs (usando LOCALAPPDATA para ruta dinámica/portable)
set LOG_BASE_DIR=%LOCALAPPDATA%\BloomNucleus\logs\build
set LOG_FILE=%LOG_BASE_DIR%\nucleus.build.log

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

:: Configurar arquitectura
set GOOS=windows
set GOARCH=amd64
set CGO_ENABLED=0

:: Limitación de recursos para evitar OOM (opcional pero recomendado)
set GOMEMLIMIT=512MiB

echo Environment: >> "%LOG_FILE%"
echo   GOOS=%GOOS% >> "%LOG_FILE%"
echo   GOARCH=%GOARCH% >> "%LOG_FILE%"
echo   CGO_ENABLED=%CGO_ENABLED% >> "%LOG_FILE%"
echo   GOMEMLIMIT=%GOMEMLIMIT% >> "%LOG_FILE%"
echo. >> "%LOG_FILE%"

:: ────────────────────────────────────────────────────────────────
:: Estructura de salida deseada → installer\native\bin\...
:: ────────────────────────────────────────────────────────────────
set PLATFORM=win32
set APP_FOLDER=nucleus

set OUTPUT_BASE=..\..\native\bin\%PLATFORM%\%APP_FOLDER%
set OUTPUT_DIR=%OUTPUT_BASE%
set OUTPUT_FILE=%OUTPUT_DIR%\nucleus.exe
set HELP_DIR=%OUTPUT_DIR%\help

:: Crear carpetas de salida
:: Limpiar directorio de destino si existe
if exist "%OUTPUT_DIR%" (
    echo.
    echo Limpiando directorio de destino...
    echo Limpiando directorio de destino... >> "%LOG_FILE%"
    echo   %OUTPUT_DIR%
    
    rd /s /q "%OUTPUT_DIR%" >> "%LOG_FILE%" 2>&1
    if %ERRORLEVEL% EQU 0 (
        echo ✅ Directorio limpiado correctamente
        echo ✅ Directorio limpiado correctamente >> "%LOG_FILE%"
    ) else (
        echo ⚠️ Advertencia: No se pudo limpiar completamente el directorio
        echo ⚠️ Advertencia: No se pudo limpiar completamente el directorio >> "%LOG_FILE%"
    )
    echo.
)

:: Crear carpetas de salida
if not exist "%OUTPUT_BASE%" mkdir "%OUTPUT_BASE%"
if not exist "%HELP_DIR%"    mkdir "%HELP_DIR%"

echo Directorio de salida final: %OUTPUT_DIR% >> "%LOG_FILE%"
dir "%OUTPUT_DIR%" >> "%LOG_FILE%" 2>&1 || echo (carpeta aún vacía o sin permisos) >> "%LOG_FILE%"

:: ============================================
:: INCREMENTAR BUILD NUMBER
:: ============================================
echo.
echo Incrementando build number...
echo Incrementando build number... >> "%LOG_FILE%"

set BUILD_FILE=build_number.txt
set BUILD_INFO=..\internal\core\build_info.go

if not exist "%BUILD_FILE%" (
    echo 0 > "%BUILD_FILE%"
)
set /p CURRENT_BUILD=<%BUILD_FILE%
set /a NEXT_BUILD=%CURRENT_BUILD%+1

for /f "tokens=1-3 delims=/-" %%a in ('date /t') do (
    set BUILD_DATE=%%c-%%a-%%b
)
for /f "tokens=1-2 delims=:." %%a in ('echo %time: =0%') do (
    set BUILD_TIME=%%a:%%b:00
)

echo package core > "%BUILD_INFO%"
echo. >> "%BUILD_INFO%"
echo // Auto-generated during build - DO NOT EDIT >> "%BUILD_INFO%"
echo // Generated: %BUILD_DATE% %BUILD_TIME% >> "%BUILD_INFO%"
echo. >> "%BUILD_INFO%"
echo const BuildNumber = %NEXT_BUILD% >> "%BUILD_INFO%"
echo const BuildDate = "%BUILD_DATE%" >> "%BUILD_INFO%"
echo const BuildTime = "%BUILD_TIME%" >> "%BUILD_INFO%"

echo %NEXT_BUILD% > "%BUILD_FILE%"

echo ✅ Build number actualizado: %NEXT_BUILD%
echo ✅ Build number actualizado: %NEXT_BUILD% >> "%LOG_FILE%"
echo.

:: ============================================
:: COMPILACIÓN
:: ============================================
echo.
echo Compiling nucleus.exe → %OUTPUT_FILE% ...
echo Compiling nucleus.exe → %OUTPUT_FILE% ... >> "%LOG_FILE%"

:: Convertimos OUTPUT_FILE a ruta absoluta ANTES de pushd
for %%I in ("%OUTPUT_FILE%") do set "ABS_OUTPUT_FILE=%%~fI"

echo Ruta absoluta del output (antes de pushd): !ABS_OUTPUT_FILE! >> "%LOG_FILE%"

:: Nos movemos a la carpeta del proyecto (donde está go.mod)
pushd ".."

:: CAMBIO CRÍTICO: Compilar desde la raíz (.) en lugar de ./cmd/nucleus
go build -p 1 -ldflags="-s -w" -o "!ABS_OUTPUT_FILE!" ./main.go >> "%LOG_FILE%" 2>&1

set BUILD_RC=%ERRORLEVEL%

popd

if %BUILD_RC% NEQ 0 (
    echo. >> "%LOG_FILE%"
    echo ❌ Compilation failed with error code: %BUILD_RC% >> "%LOG_FILE%"
    echo.
    echo ❌ Compilation failed. Revisa el log: %LOG_FILE%
    exit /b %BUILD_RC%
)

echo ✅ Compilation successful: !ABS_OUTPUT_FILE!
echo ✅ Compilation successful: !ABS_OUTPUT_FILE! >> "%LOG_FILE%"
echo. >> "%LOG_FILE%"

:: ============================================
:: COPIAR NUCLEUS-GOVERNANCE.JSON
:: ============================================
echo.
echo Copying nucleus-governance.json...
echo Copying nucleus-governance.json... >> "%LOG_FILE%"

set "GOVERNANCE_SOURCE=..\nucleus-governance.json"
set "GOVERNANCE_DEST=%OUTPUT_DIR%\nucleus-governance.json"

if exist "%GOVERNANCE_SOURCE%" (
    copy /Y "%GOVERNANCE_SOURCE%" "%GOVERNANCE_DEST%" >> "%LOG_FILE%" 2>&1
    if %ERRORLEVEL% EQU 0 (
        echo ✅ nucleus-governance.json copied
        echo ✅ nucleus-governance.json copied >> "%LOG_FILE%"
    ) else (
        echo ⚠️ Warning: Failed to copy nucleus-governance.json
        echo ⚠️ Warning: Failed to copy nucleus-governance.json >> "%LOG_FILE%"
    )
) else (
    echo ⚠️ Warning: nucleus-governance.json not found at %GOVERNANCE_SOURCE%
    echo ⚠️ Warning: nucleus-governance.json not found at %GOVERNANCE_SOURCE% >> "%LOG_FILE%"
)

:: ============================================
:: GENERAR AYUDA
:: ============================================
echo.
echo ============================================
echo   Generating Help Documentation
echo ============================================
echo ============================================ >> "%LOG_FILE%"
echo   Generating Help Documentation >> "%LOG_FILE%"
echo ============================================ >> "%LOG_FILE%"

:: Convertimos a ruta absoluta para evitar problemas de resolución relativa
for %%I in ("%OUTPUT_FILE%") do set "ABS_OUTPUT=%%~fI"

echo.
echo Generating nucleus_help.json...
echo Generating nucleus_help.json... >> "%LOG_FILE%"
echo Intentando ejecutar: !ABS_OUTPUT! --json-help >> "%LOG_FILE%"

"!ABS_OUTPUT!" --json-help > "%HELP_DIR%\nucleus_help.json" 2>> "%LOG_FILE%"
if %ERRORLEVEL% EQU 0 (
    echo ✅ JSON help generated: %HELP_DIR%\nucleus_help.json
    echo ✅ JSON help generated: %HELP_DIR%\nucleus_help.json >> "%LOG_FILE%"
) else (
    echo ⚠️ Warning: Failed to generate JSON help (code %ERRORLEVEL%)
    echo ⚠️ Warning: Failed to generate JSON help (code %ERRORLEVEL%) >> "%LOG_FILE%"
)

echo.
echo Generating nucleus_help.txt...
echo Generating nucleus_help.txt... >> "%LOG_FILE%"
echo Intentando ejecutar: !ABS_OUTPUT! --help >> "%LOG_FILE%"

"!ABS_OUTPUT!" --help > "%HELP_DIR%\nucleus_help.txt" 2>> "%LOG_FILE%"
if %ERRORLEVEL% EQU 0 (
    echo ✅ Text help generated: %HELP_DIR%\nucleus_help.txt
    echo ✅ Text help generated: %HELP_DIR%\nucleus_help.txt >> "%LOG_FILE%"
) else (
    echo ⚠️ Warning: Failed to generate text help (code %ERRORLEVEL%)
    echo ⚠️ Warning: Failed to generate text help (code %ERRORLEVEL%) >> "%LOG_FILE%"
)

:: ============================================
:: ACTUALIZAR TELEMETRY
:: ============================================
echo.
echo ⏳ Actualizando telemetry...
echo ⏳ Actualizando telemetry... >> "%LOG_FILE%"

set "PYTHON_EXE=python"
where %PYTHON_EXE% >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ⚠️ Python no encontrado en el PATH. Telemetry no se actualizo.
    echo ⚠️ Python no encontrado en el PATH. Telemetry no se actualizo. >> "%LOG_FILE%"
    goto :resumen
)

set "PROJECT_ROOT=%~dp0..\..\..\"

set "PROJECT_ROOT=%PROJECT_ROOT:\\=\%"
set "UPDATE_SCRIPT=%PROJECT_ROOT%scripts\python\update_build_telemetry.py"

echo Debug: PROJECT_ROOT → %PROJECT_ROOT% >> "%LOG_FILE%"
echo Debug: UPDATE_SCRIPT → %UPDATE_SCRIPT% >> "%LOG_FILE%"

if not exist "%UPDATE_SCRIPT%" (
    echo ⚠️ No se encontró el script: %UPDATE_SCRIPT%
    echo ⚠️ No se encontró el script: %UPDATE_SCRIPT% >> "%LOG_FILE%"
    goto :resumen
)

set "TELEMETRY_KEY=nucleus_build"
set "TELEMETRY_LABEL=📦 NUCLEUS BUILD"
set "TELEMETRY_PATH=%LOG_FILE:\=/%"

%PYTHON_EXE% "%UPDATE_SCRIPT%" "%TELEMETRY_KEY%" "%TELEMETRY_LABEL%" "%TELEMETRY_PATH%"

if %ERRORLEVEL% EQU 0 (
    echo   ✅ Telemetry actualizado correctamente
    echo   Label: %TELEMETRY_LABEL%
    echo   Path : %TELEMETRY_PATH%
    echo   ✅ Telemetry actualizado correctamente >> "%LOG_FILE%"
    echo   Label: %TELEMETRY_LABEL% >> "%LOG_FILE%"
    echo   Path : %TELEMETRY_PATH% >> "%LOG_FILE%"
) else (
    echo   ⚠️ Error al actualizar telemetry (codigo: %ERRORLEVEL%)
    echo   ⚠️ Error al actualizar telemetry (codigo: %ERRORLEVEL%) >> "%LOG_FILE%"
)

:resumen
echo.
echo ============================================
echo 🎉 Nucleus Build completed.
echo ============================================
echo 🎉 Nucleus Build completed successfully >> "%LOG_FILE%"
echo.
echo 📦 Archivos generados en:
echo   %OUTPUT_DIR%
echo.
echo   • Executable     : nucleus.exe
echo   • Blueprint      : nucleus-governance.json
echo   • Help JSON      : help\nucleus_help.json
echo   • Help TXT       : help\nucleus_help.txt
echo.
echo 📋 Log guardado en: %LOG_FILE%
echo.

endlocal