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

if not exist "%OUTPUT_DIR%" mkdir "%OUTPUT_DIR%"

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

echo ============================================
echo Build completed.
endlocal