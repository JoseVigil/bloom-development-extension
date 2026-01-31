REM ============================================================================
REM run-dev.bat
REM Ejecuta Electron SIN privilegios (solo para desarrollo de UI)
REM Ubicación: /installer/electron-app/run-dev.bat
REM ============================================================================

@echo off
echo.
echo ========================================
echo   Bloom Nucleus - Dev Mode (No Admin)
echo ========================================
echo.
echo [!] WARNING: You won't be able to install services without admin
echo [i] This mode is useful for UI/logic development only
echo.

call npm run electron:dev

exit /b