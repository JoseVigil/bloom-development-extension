@echo off
echo ========================================
echo BLOOM NUCLEUS - EMERGENCY CLEANUP
echo ========================================
echo.
echo This script will forcefully clean all Bloom processes and files
echo WARNING: This will stop the service and delete files!
echo.
pause

echo.
echo [1/5] Stopping service with NSSM...
"%LOCALAPPDATA%\BloomNucleus\native\nssm.exe" stop BloomNucleusHost 2>nul
timeout /t 3 /nobreak >nul

echo [2/5] Removing service with NSSM...
"%LOCALAPPDATA%\BloomNucleus\native\nssm.exe" remove BloomNucleusHost confirm 2>nul
timeout /t 2 /nobreak >nul

echo [3/5] Killing all bloom-host.exe processes...
taskkill /F /IM bloom-host.exe /T 2>nul
timeout /t 3 /nobreak >nul

echo [4/5] Stopping service with sc...
sc stop BloomNucleusHost 2>nul
timeout /t 2 /nobreak >nul

echo [5/5] Deleting service with sc...
sc delete BloomNucleusHost 2>nul
timeout /t 2 /nobreak >nul

echo.
echo Killing processes one more time...
taskkill /F /IM bloom-host.exe /T 2>nul
wmic process where name="bloom-host.exe" delete 2>nul
timeout /t 3 /nobreak >nul

echo.
echo ========================================
echo CLEANUP COMPLETE
echo ========================================
echo.
echo You can now run the installer again.
echo.
pause