@echo off
setlocal

echo ============================================
echo Building Sentinel Base
echo ============================================
echo.

set GOOS=windows
set GOARCH=386
set CGO_ENABLED=0

set OUTPUT_DIR=..\native\bin\win32
set OUTPUT_FILE=%OUTPUT_DIR%\sentinel.exe

if not exist "%OUTPUT_DIR%" (
    echo Creating output directory: %OUTPUT_DIR%
    mkdir "%OUTPUT_DIR%"
)

echo Compiling sentinel.exe...
go build -o "%OUTPUT_FILE%" -ldflags="-s -w" main.go

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ✗ Compilation failed
    exit /b 1
)

echo ✓ Compilation successful: %OUTPUT_FILE%
echo.

if not exist "%OUTPUT_DIR%\blueprint.json" (
    if exist "blueprint.json" (
        echo Copying blueprint.json...
        copy /Y "blueprint.json" "%OUTPUT_DIR%\blueprint.json" >nul
        echo ✓ blueprint.json copied
    ) else (
        echo ⚠ Warning: blueprint.json not found in source directory
    )
) else (
    echo ✓ blueprint.json already exists in output directory
)

echo.
echo ============================================
echo Build completed successfully
echo ============================================
echo Output: %OUTPUT_FILE%
echo.

endlocal