@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion

:: Configurar directorio de logs (usando LOCALAPPDATA para ruta dinámica/portable)
set LOG_BASE_DIR=%LOCALAPPDATA%\BloomNucleus\logs\build
set LOG_FILE=%LOG_BASE_DIR%\sentinel.build.log

:: Crear directorios de logs si no existen
if not exist "%LOG_BASE_DIR%" mkdir "%LOG_BASE_DIR%"

:: Iniciar log con timestamp
echo ============================================ > "%LOG_FILE%"
echo Build Log - %DATE% %TIME% >> "%LOG_FILE%"
echo ============================================ >> "%LOG_FILE%"
echo. >> "%LOG_FILE%"

echo ============================================
echo 🚧 Building Sentinel Base (Safe Mode)
echo ============================================
echo 🚧 Building Sentinel Base (Safe Mode) >> "%LOG_FILE%"

:: Forzamos arquitectura 386
set GOOS=windows
set GOARCH=386
set CGO_ENABLED=0

:: Limitación de recursos para evitar OOM
set GOMEMLIMIT=512MiB

echo Environment: >> "%LOG_FILE%"
echo   GOOS=%GOOS% >> "%LOG_FILE%"
echo   GOARCH=%GOARCH% >> "%LOG_FILE%"
echo   CGO_ENABLED=%CGO_ENABLED% >> "%LOG_FILE%"
echo   GOMEMLIMIT=%GOMEMLIMIT% >> "%LOG_FILE%"
echo. >> "%LOG_FILE%"

:: ────────────────────────────────────────────────────────────────
:: Nueva estructura de salida: installer\native\bin\win32\sentinel\
:: El script se ejecuta desde una ubicación dentro de installer\
:: por lo que necesitamos subir hasta la raíz y bajar a installer\native\
:: ────────────────────────────────────────────────────────────────
set PLATFORM=win32
set APP_FOLDER=sentinel

:: ============================================
:: PROJECT ROOT (ABSOLUTO, CANONICO)
:: ============================================
set "PROJECT_ROOT=%~dp0..\..\.."
for %%I in ("%PROJECT_ROOT%") do set "PROJECT_ROOT=%%~fI"

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

(
    echo package core
    echo.
    echo // Auto-generated during build - DO NOT EDIT
    echo // Generated: %BUILD_DATE% %BUILD_TIME%
    echo.
    echo const BuildNumber = %NEXT_BUILD%
    echo const BuildDate = "%BUILD_DATE%"
    echo const BuildTime = "%BUILD_TIME%"
) > "%BUILD_INFO%"

echo %NEXT_BUILD% > "%BUILD_FILE%"

echo ✅ Build number actualizado: %NEXT_BUILD%
echo ✅ Build number actualizado: %NEXT_BUILD% >> "%LOG_FILE%"
echo.

:: ============================================
:: COMPILACIÓN (corregida)
:: ============================================
echo.
echo Compiling sentinel.exe → %OUTPUT_FILE% ...
echo Compiling sentinel.exe → %OUTPUT_FILE% ... >> "%LOG_FILE%"

pushd "%PROJECT_ROOT%\installer\sentinel"

go build -p 1 -ldflags="-s -w" -o "%OUTPUT_FILE%" . >> "%LOG_FILE%" 2>&1

set BUILD_RC=%ERRORLEVEL%

popd

if %BUILD_RC% NEQ 0 (
    echo. >> "%LOG_FILE%"
    echo ❌ Compilation failed with error code: %BUILD_RC% >> "%LOG_FILE%"
    echo.
    echo ❌ Compilation failed. Revisa el error mostrado arriba.
    echo.
    echo 📋 Log guardado en: %LOG_FILE%
    exit /b 1
)

:: Convertir OUTPUT_FILE a ruta absoluta para poder ejecutarlo
for %%F in ("%OUTPUT_FILE%") do set "OUTPUT_FILE_ABS=%%~fF"

echo ✅ Compilation successful: %OUTPUT_FILE%
echo ✅ Compilation successful: %OUTPUT_FILE% >> "%LOG_FILE%"
echo. >> "%LOG_FILE%"

:: Copiar sentinel-config.json
if exist "..\sentinel-config.json" (
    copy /Y "..\sentinel-config.json" "%OUTPUT_DIR%\sentinel-config.json" >nul
    echo 📦 sentinel-config.json updated
    echo 📦 sentinel-config.json updated >> "%LOG_FILE%"
)

echo.
echo ============================================
echo   Generating Help Documentation
echo ============================================
echo ============================================ >> "%LOG_FILE%"
echo   Generating Help Documentation >> "%LOG_FILE%"
echo ============================================ >> "%LOG_FILE%"

echo.
echo Generating sentinel_help.json...
echo Generating sentinel_help.json... >> "%LOG_FILE%"

"%OUTPUT_FILE_ABS%" --json-help > "%HELP_DIR%\sentinel_help.json" 2>> "%LOG_FILE%"
if %ERRORLEVEL% EQU 0 (
    echo ✅ JSON help generated: %HELP_DIR%\sentinel_help.json
    echo ✅ JSON help generated: %HELP_DIR%\sentinel_help.json >> "%LOG_FILE%"
) else (
    echo ⚠️ Warning: Failed to generate JSON help
    echo ⚠️ Warning: Failed to generate JSON help (Error: %ERRORLEVEL%) >> "%LOG_FILE%"
)

echo.
echo Generating sentinel_help.txt...
echo Generating sentinel_help.txt... >> "%LOG_FILE%"

"%OUTPUT_FILE_ABS%" --help > "%HELP_DIR%\sentinel_help.txt" 2>> "%LOG_FILE%"
if %ERRORLEVEL% EQU 0 (
    echo ✅ Text help generated: %HELP_DIR%\sentinel_help.txt
    echo ✅ Text help generated: %HELP_DIR%\sentinel_help.txt >> "%LOG_FILE%"
) else (
    echo ⚠️ Warning: Failed to generate text help
    echo ⚠️ Warning: Failed to generate text help (Error: %ERRORLEVEL%) >> "%LOG_FILE%"
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

set "UPDATE_SCRIPT=%PROJECT_ROOT%\scripts\python\update_build_telemetry.py"

echo Debug: PROJECT_ROOT resuelto → %PROJECT_ROOT% >> "%LOG_FILE%"
echo Debug: UPDATE_SCRIPT → %UPDATE_SCRIPT% >> "%LOG_FILE%"

if not exist "%UPDATE_SCRIPT%" (
    echo ⚠️ No se encontró el script: %UPDATE_SCRIPT%
    echo ⚠️ No se encontró el script: %UPDATE_SCRIPT% >> "%LOG_FILE%"
    goto :resumen
)

set "TELEMETRY_KEY=sentinel_build"
set "TELEMETRY_LABEL=📦 SENTINEL BUILD"
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
echo 🎉 Sentinel Build completed.
echo ============================================
echo 🎉 Sentinel Build completed successfully >> "%LOG_FILE%"
echo.
echo 📦 Output files:
echo   Executable: %OUTPUT_FILE%
echo. >> "%LOG_FILE%"
echo Output files: >> "%LOG_FILE%"
echo   Executable: %OUTPUT_FILE% >> "%LOG_FILE%"

if exist "%HELP_DIR%\sentinel_help.json" (
    echo   Help JSON: %HELP_DIR%\sentinel_help.json
    echo   Help JSON: %HELP_DIR%\sentinel_help.json >> "%LOG_FILE%"
)
if exist "%HELP_DIR%\sentinel_help.txt" (
    echo   Help TXT:  %HELP_DIR%\sentinel_help.txt
    echo   Help TXT:  %HELP_DIR%\sentinel_help.txt >> "%LOG_FILE%"
)
echo.
echo 📋 Log guardado en: %LOG_FILE%
echo.

endlocal