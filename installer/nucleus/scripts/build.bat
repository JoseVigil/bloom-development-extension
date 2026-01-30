@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion

echo ============================================
echo 🚧 Building Nucleus
echo ============================================

:: Configurar arquitectura
set GOOS=windows
set GOARCH=amd64
set CGO_ENABLED=0

set OUTPUT_DIR=bin
set OUTPUT_FILE=%OUTPUT_DIR%\nucleus.exe
set HELP_DIR=help

if not exist "%OUTPUT_DIR%" mkdir "%OUTPUT_DIR%"
if not exist "%HELP_DIR%" mkdir "%HELP_DIR%"

:: ============================================
:: INCREMENTAR BUILD NUMBER
:: ============================================
echo.
echo Incrementando build number...

set BUILD_FILE=build_number.txt
set BUILD_INFO=internal\core\build_info.go

:: Leer build number actual (o iniciar en 0)
if not exist "%BUILD_FILE%" (
    echo 0 > "%BUILD_FILE%"
)
set /p CURRENT_BUILD=<%BUILD_FILE%
set /a NEXT_BUILD=%CURRENT_BUILD%+1

:: Obtener timestamp
for /f "tokens=1-3 delims=/-" %%a in ('date /t') do (
    set BUILD_DATE=%%c-%%a-%%b
)
for /f "tokens=1-2 delims=:." %%a in ('echo %time: =0%') do (
    set BUILD_TIME=%%a:%%b:00
)

:: Generar build_info.go
echo package core > "%BUILD_INFO%"
echo. >> "%BUILD_INFO%"
echo // Auto-generated during build - DO NOT EDIT >> "%BUILD_INFO%"
echo // Generated: %BUILD_DATE% %BUILD_TIME% >> "%BUILD_INFO%"
echo. >> "%BUILD_INFO%"
echo const BuildNumber = %NEXT_BUILD% >> "%BUILD_INFO%"
echo const BuildDate = "%BUILD_DATE%" >> "%BUILD_INFO%"
echo const BuildTime = "%BUILD_TIME%" >> "%BUILD_INFO%"

:: Guardar nuevo número
echo %NEXT_BUILD% > "%BUILD_FILE%"

echo ✅ Build number: %NEXT_BUILD%

:: ============================================
:: COMPILAR
:: ============================================
echo.
echo Compiling nucleus.exe...
go build -ldflags="-s -w" -o "%OUTPUT_FILE%" ./cmd/nucleus

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ❌ Build failed
    exit /b 1
)

echo ✅ Compilation successful

:: ============================================
:: GENERAR AYUDA
:: ============================================
echo.
echo Generating help files...

"%OUTPUT_FILE%" --help > "%HELP_DIR%\nucleus_help.txt"
if %ERRORLEVEL% EQU 0 (
    echo ✅ Text help generated: %HELP_DIR%\nucleus_help.txt
) else (
    echo ⚠️ Warning: Failed to generate text help
)

"%OUTPUT_FILE%" --json-help > "%HELP_DIR%\nucleus_help.json"
if %ERRORLEVEL% EQU 0 (
    echo ✅ JSON help generated: %HELP_DIR%\nucleus_help.json
) else (
    echo ⚠️ Warning: Failed to generate JSON help
)

:: ============================================
:: ACTUALIZAR TELEMETRY.JSON
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

:: ───────────────────────────────────────────────────────────────
:: Ruta calculada desde el .bat (installer\sentinel\ → raíz → scripts\python)
:: Subimos SOLO DOS niveles (..\..) porque sentinel está dentro de installer
:: ───────────────────────────────────────────────────────────────
set "PROJECT_ROOT=%~dp0..\..\"

:: Normalizamos (quita el último \ si sobra y maneja bien)
set "PROJECT_ROOT=%PROJECT_ROOT:\\=\%"
set "UPDATE_SCRIPT=%PROJECT_ROOT%scripts\python\update_build_telemetry.py"

:: Depuración clara (puedes comentarlo después de confirmar que funciona)
echo Debug: PROJECT_ROOT resuelto → %PROJECT_ROOT%
echo Debug: UPDATE_SCRIPT → %UPDATE_SCRIPT%
echo Debug: PROJECT_ROOT resuelto → %PROJECT_ROOT% >> "%LOG_FILE%"
echo Debug: UPDATE_SCRIPT → %UPDATE_SCRIPT% >> "%LOG_FILE%"

if not exist "%UPDATE_SCRIPT%" (
    echo ⚠️ No se encontró el script:
    echo     %UPDATE_SCRIPT%
    echo ⚠️ No se encontró el script: >> "%LOG_FILE%"
    echo     %UPDATE_SCRIPT% >> "%LOG_FILE%"
    goto :resumen
)

:: Preparar argumentos
set "TELEMETRY_KEY=nuecleus_build"
set "TELEMETRY_LABEL=📦 NUCLEUS BUILD"
set "TELEMETRY_PATH=%LOG_FILE:\=/%"

:: Ejecutar el script
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

:: ============================================
:: RESUMEN
:: ============================================
echo.
echo ============================================
echo 🎉 Nucleus build completed
echo ============================================
echo.
echo 📦 Output files:
echo   Executable: %OUTPUT_FILE%

if exist "%HELP_DIR%\nucleus_help.txt" (
    echo   Help TXT:  %HELP_DIR%\nucleus_help.txt
)
if exist "%HELP_DIR%\nucleus_help.json" (
    echo   Help JSON: %HELP_DIR%\nucleus_help.json
)

echo.
echo Test commands:
echo   %OUTPUT_FILE% version
echo   %OUTPUT_FILE% info
echo   %OUTPUT_FILE% --json info
echo   %OUTPUT_FILE% --help
echo.

endlocal
