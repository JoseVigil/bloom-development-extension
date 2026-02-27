@echo off
REM scripts/build.bat — bloom-sensor build script

setlocal

REM Leer número de build
set /p BUILD_NUMBER=<"%~dp0build_number.txt"
set /a BUILD_NUMBER=%BUILD_NUMBER% + 1

REM Variables de versión
set VERSION=1.0.0
set CHANNEL=stable
set COMMIT_HASH=unknown

REM Intentar obtener el commit hash de git
git rev-parse --short HEAD >nul 2>&1
if %ERRORLEVEL% == 0 (
    for /f %%i in ('git rev-parse --short HEAD') do set COMMIT_HASH=%%i
)

REM Nombre del output
set OUTPUT=bloom-sensor.exe

echo Building %OUTPUT% v%VERSION% build=%BUILD_NUMBER% commit=%COMMIT_HASH%

go build ^
  -ldflags "-X bloom-sensor/internal/buildinfo.Version=%VERSION% ^
            -X bloom-sensor/internal/buildinfo.Commit=%COMMIT_HASH% ^
            -X bloom-sensor/internal/buildinfo.BuildNumber=%BUILD_NUMBER% ^
            -X bloom-sensor/internal/buildinfo.Channel=%CHANNEL% ^
            -H=windowsgui" ^
  -o %OUTPUT% ^
  ./cmd/main.go

if %ERRORLEVEL% NEQ 0 (
    echo BUILD FAILED
    exit /b 1
)

REM Guardar nuevo número de build
echo %BUILD_NUMBER% > "%~dp0build_number.txt"

echo Build OK: %OUTPUT% v%VERSION%+%BUILD_NUMBER%
endlocal
