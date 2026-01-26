@echo off
setlocal

echo ============================================
echo Building Sentinel Base (Safe Mode)
echo ============================================

:: Forzamos arquitectura 386
set GOOS=windows
set GOARCH=386
set CGO_ENABLED=0

:: LIMITACIÓN DE RECURSOS PARA EVITAR "OUT OF MEMORY"
set GOMEMLIMIT=512MiB

set OUTPUT_DIR=..\native\bin\win32
set OUTPUT_FILE=%OUTPUT_DIR%\sentinel.exe
set HELP_DIR=help

if not exist "%OUTPUT_DIR%" mkdir "%OUTPUT_DIR%"
if not exist "%HELP_DIR%" mkdir "%HELP_DIR%"

echo Compiling sentinel.exe...
:: -p 1: Compila un paquete a la vez (usa poca RAM)
:: -ldflags: Quita símbolos pesados para achicar el EXE
go build -p 1 -ldflags="-s -w" -o "%OUTPUT_FILE%" .

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ✗ Compilation failed. Si el error es de import, revisa el archivo mencionado.
    exit /b 1
)

echo ✓ Compilation successful: %OUTPUT_FILE%

if exist "blueprint.json" (
    copy /Y "blueprint.json" "%OUTPUT_DIR%\blueprint.json" >nul
    echo ✓ blueprint.json updated
)

echo.
echo ============================================
echo Generating Help Documentation
echo ============================================

:: Generar archivo JSON de ayuda
echo Generating sentinel_help.json...
"%OUTPUT_FILE%" --json-help > "%HELP_DIR%\sentinel_help.json" 2>nul
if %ERRORLEVEL% EQU 0 (
    echo ✓ JSON help generated: %HELP_DIR%\sentinel_help.json
) else (
    echo ✗ Warning: Failed to generate JSON help
)

:: Generar archivo TXT de ayuda (sin colores ANSI)
echo Generating sentinel_help.txt...
"%OUTPUT_FILE%" --help > "%HELP_DIR%\sentinel_help.txt" 2>nul
if %ERRORLEVEL% EQU 0 (
    echo ✓ Text help generated: %HELP_DIR%\sentinel_help.txt
) else (
    echo ✗ Warning: Failed to generate text help
)

echo.
echo ============================================
echo Build completed.
echo ============================================
echo.
echo Output files:
echo   Executable: %OUTPUT_FILE%
if exist "%HELP_DIR%\sentinel_help.json" (
    echo   Help JSON:  %HELP_DIR%\sentinel_help.json
)
if exist "%HELP_DIR%\sentinel_help.txt" (
    echo   Help TXT:   %HELP_DIR%\sentinel_help.txt
)
echo.

endlocal