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
:: BUILD NUMBER
:: ============================================
if /i "%COMPONENT%"=="sensor" (
    set "CORE_PKG=bloom-sensor/internal/core"
) else (
    set "CORE_PKG=%COMPONENT%/internal/core"
)

:: build-all.py es el unico que incrementa build_number.txt y pasa el valor
:: efectivo (base + offset de Windows). Para ejecucion manual, usar el effective
:: persistido; si tampoco existe, compilar con 0 igual que el script Unix.
set "NEXT_BUILD=%BLOOM_BUILD_NUMBER%"
if not defined NEXT_BUILD (
    set "EFFECTIVE_FILE=%PROJECT_ROOT%\installer\%COMPONENT%\scripts\build_number.effective.txt"
    if exist "!EFFECTIVE_FILE!" set /p NEXT_BUILD=<"!EFFECTIVE_FILE!"
)
if not defined NEXT_BUILD set "NEXT_BUILD=0"

:: No parsear DATE/TIME: su formato depende del locale de Windows y puede
:: incluir el dia de la semana (por ejemplo "Wed 08/19/2026"). Eso introducia
:: espacios en -ldflags y el linker interpretaba "-Wed" como otra opcion.
for /f %%I in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd"') do set "BUILD_DATE=%%I"
for /f %%I in ('powershell -NoProfile -Command "Get-Date -Format HH:mm:ss"') do set "BUILD_TIME=%%I"

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
go build -p 1 -ldflags="-s -w -X !CORE_PKG!.buildNumber=%NEXT_BUILD% -X !CORE_PKG!.BuildDate=%BUILD_DATE% -X !CORE_PKG!.BuildTime=%BUILD_TIME%" -o "%OUTPUT_FILE%" !BUILD_PKG! >> "%LOG_FILE%" 2>&1
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
