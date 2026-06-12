@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion

:: ============================================
:: BLOOM - BUILD DE COMPONENTE PARAMETRIZADO
:: Uso: build-component.bat <componente>
:: Componentes validos: nucleus, sentinel, metamorph, sensor
:: ============================================

:: Validar argumento
if "%~1"=="" (
    echo Uso: build-component.bat ^<componente^>
    echo    Componentes validos: nucleus, sentinel, metamorph, sensor
    exit /b 1
)
set "COMPONENT=%~1"

:: Validar que el componente es conocido
set "VALID=0"
for %%C in (nucleus sentinel metamorph sensor) do (
    if /i "%%C"=="%COMPONENT%" set "VALID=1"
)
if "%VALID%"=="0" (
    echo Componente desconocido: %COMPONENT%
    exit /b 1
)

:: ============================================
:: PROJECT ROOT
:: Script en builds/windows/ -> dos niveles arriba es la raiz
:: ============================================
set "PROJECT_ROOT=%~dp0..\.."
for %%I in ("%PROJECT_ROOT%") do set "PROJECT_ROOT=%%~fI"

:: ============================================
:: CONFIGURAR LOG
:: ============================================
set LOG_BASE_DIR=%LOCALAPPDATA%\BloomNucleus\logs\build
set LOG_FILE=%LOG_BASE_DIR%\%COMPONENT%_build.log

if not exist "%LOG_BASE_DIR%" mkdir "%LOG_BASE_DIR%"

echo ============================================ > "%LOG_FILE%"
echo %COMPONENT% Build Log - %DATE% %TIME% >> "%LOG_FILE%"
echo ============================================ >> "%LOG_FILE%"
echo. >> "%LOG_FILE%"

echo ============================================
echo Building %COMPONENT%
echo ============================================
echo Building %COMPONENT% >> "%LOG_FILE%"

:: ============================================
:: DETECCION AUTOMATICA DE ARQUITECTURA
:: ============================================
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

set GOMEMLIMIT=512MiB

echo Environment: >> "%LOG_FILE%"
echo   Detected Platform: %PLATFORM% >> "%LOG_FILE%"
echo   GOARCH: %GOARCH% >> "%LOG_FILE%"
echo. >> "%LOG_FILE%"

:: ============================================
:: PATHS DERIVADOS DEL COMPONENTE
:: ============================================
set "APP_FOLDER=%COMPONENT%"
set "OUTPUT_BASE=%PROJECT_ROOT%\installer\native\bin\%PLATFORM%\%APP_FOLDER%"
set "OUTPUT_DIR=%OUTPUT_BASE%"
set "HELP_DIR=%OUTPUT_DIR%\help"

if /i "%COMPONENT%"=="sensor" (
    set "EXE_NAME=bloom-sensor.exe"
) else (
    set "EXE_NAME=%COMPONENT%.exe"
)
set "OUTPUT_FILE=%OUTPUT_DIR%\%EXE_NAME%"

if not exist "%OUTPUT_BASE%" mkdir "%OUTPUT_BASE%"
if not exist "%HELP_DIR%"    mkdir "%HELP_DIR%"

:: ============================================
:: INCREMENTAR BUILD NUMBER
:: ============================================
if /i "%COMPONENT%"=="sensor" (
    set "BUILD_FILE=%PROJECT_ROOT%\installer\sensor\scripts\build_number.txt"
    set "BUILD_INFO=%PROJECT_ROOT%\installer\sensor\internal\core\build_info.go"
) else (
    set "BUILD_FILE=%PROJECT_ROOT%\installer\%COMPONENT%\scripts\build_number.txt"
    set "BUILD_INFO=%PROJECT_ROOT%\installer\%COMPONENT%\internal\core\build_info.go"
)

if not exist "%BUILD_FILE%" echo 0 > "%BUILD_FILE%"
set /p CURRENT_BUILD=<"%BUILD_FILE%"
set /a NEXT_BUILD=%CURRENT_BUILD%+1

for /f "tokens=1-3 delims=/-" %%a in ('date /t') do set BUILD_DATE=%%c-%%a-%%b
for /f "tokens=1-2 delims=:." %%a in ('echo %time: =0%') do set BUILD_TIME=%%a:%%b:00

(
    echo package core
    echo.
    echo // Auto-generated during build
    echo const BuildNumberInt = %NEXT_BUILD%
    echo const BuildNumber    = BuildNumberInt
    echo const BuildDate = "%BUILD_DATE%"
    echo const BuildTime = "%BUILD_TIME%"
) > "%BUILD_INFO%"

echo %NEXT_BUILD% > "%BUILD_FILE%"

:: ============================================
:: COMPILACION
:: ============================================
echo.
echo Compiling %EXE_NAME% [%PLATFORM%]...
echo Compiling %EXE_NAME% - %OUTPUT_FILE% ... >> "%LOG_FILE%"

if /i "%COMPONENT%"=="sensor" (
    set "BUILD_DIR=%PROJECT_ROOT%\installer\sensor"
    set "BUILD_PKG=.\cmd"
) else (
    set "BUILD_DIR=%PROJECT_ROOT%\installer\%COMPONENT%"
    set "BUILD_PKG=."
)

pushd "!BUILD_DIR!"
go build -p 1 -ldflags="-s -w" -o "%OUTPUT_FILE%" !BUILD_PKG! >> "%LOG_FILE%" 2>&1
set BUILD_RC=%ERRORLEVEL%
popd

if %BUILD_RC% NEQ 0 (
    echo FAILED - Compilation failed. Revisa el log: %LOG_FILE%
    exit /b %BUILD_RC%
)

echo OK - Compilation successful: %OUTPUT_FILE%

if exist "%PROJECT_ROOT%\installer\%COMPONENT%\%COMPONENT%-config.json" (
    copy /Y "%PROJECT_ROOT%\installer\%COMPONENT%\%COMPONENT%-config.json" "%OUTPUT_DIR%" >nul
)

:: ============================================
:: GENERAR DOCUMENTACION DE AYUDA
:: ============================================
for %%F in ("%OUTPUT_FILE%") do set "OUTPUT_FILE_ABS=%%~fF"
"%OUTPUT_FILE_ABS%" --json-help > "%HELP_DIR%\%COMPONENT%_help.json" 2>> "%LOG_FILE%"
"%OUTPUT_FILE_ABS%" --help      > "%HELP_DIR%\%COMPONENT%_help.txt"  2>> "%LOG_FILE%"

:: ============================================
:: REGISTRAR TELEMETRY
:: ============================================
echo.
echo Registrando Telemetria via Nucleus...
echo Registrando Telemetria via Nucleus... >> "%LOG_FILE%"

set "NUCLEUS_EXE=%PROJECT_ROOT%\installer\native\bin\%PLATFORM%\nucleus\nucleus.exe"

if exist "%NUCLEUS_EXE%" (
    set "NORM_LOG_PATH=%LOG_FILE:\=/%"

    "!NUCLEUS_EXE!" telemetry register ^
        --stream      %COMPONENT%_build ^
        --label       "%COMPONENT% BUILD" ^
        --path        "!NORM_LOG_PATH!" ^
        --priority    3 ^
        --category    build ^
        --description "%COMPONENT% build pipeline output" >> "%LOG_FILE%" 2>&1

    if %ERRORLEVEL% EQU 0 (
        echo   Telemetry registrado correctamente
    ) else (
        echo   Error al registrar telemetria (Nucleus RC: %ERRORLEVEL%)
    )
) else (
    echo   Nucleus no encontrado en %NUCLEUS_EXE%
    echo   Nucleus.exe missing at: %NUCLEUS_EXE% >> "%LOG_FILE%"
)

:resumen
echo.
echo ============================================
echo %COMPONENT% Build [%PLATFORM%] completed.
echo ============================================
echo Output: %OUTPUT_DIR%
echo Log: %LOG_FILE%
echo.

endlocal
