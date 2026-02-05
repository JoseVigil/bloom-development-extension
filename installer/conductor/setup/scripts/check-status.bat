@echo off
echo ========================================
echo BLOOM NUCLEUS - STATUS CHECK
echo ========================================
echo.

echo [CHECK 1] Service status:
sc query BloomNucleusHost 2>nul
if %errorlevel% equ 0 (
    echo ^-^> Service EXISTS in Windows Services
) else (
    echo ^-^> Service NOT FOUND in Windows Services
)
echo.

echo [CHECK 2] Running processes:
tasklist /FI "IMAGENAME eq bloom-host.exe" 2>nul | find /i "bloom-host.exe" >nul
if %errorlevel% equ 0 (
    echo ^-^> bloom-host.exe IS RUNNING as process
    echo.
    tasklist /FI "IMAGENAME eq bloom-host.exe" /V
) else (
    echo ^-^> bloom-host.exe NOT RUNNING
)
echo.

echo [CHECK 3] Files in native directory:
if exist "%LOCALAPPDATA%\BloomNucleus\native\bloom-host.exe" (
    echo ^-^> bloom-host.exe EXISTS
    dir "%LOCALAPPDATA%\BloomNucleus\native\bloom-host.exe" | find "bloom-host.exe"
) else (
    echo ^-^> bloom-host.exe NOT FOUND
)
echo.

echo [CHECK 4] NSSM status:
if exist "%LOCALAPPDATA%\BloomNucleus\native\nssm.exe" (
    echo ^-^> NSSM EXISTS
) else (
    echo ^-^> NSSM NOT FOUND
)
echo.

echo ========================================
echo DIAGNOSIS:
echo ========================================

sc query BloomNucleusHost 2>nul | find /i "RUNNING" >nul
set SERVICE_RUNNING=%errorlevel%

tasklist /FI "IMAGENAME eq bloom-host.exe" 2>nul | find /i "bloom-host.exe" >nul
set PROCESS_RUNNING=%errorlevel%

if %SERVICE_RUNNING% equ 0 (
    echo [OK] Service is running correctly
) else if %PROCESS_RUNNING% equ 0 (
    echo [ERROR] Process is running but NOT as service!
    echo [FIX] Run emergency-cleanup.bat then reinstall
) else (
    echo [INFO] Nothing is running
    echo [FIX] Run the installer
)

echo.
pause