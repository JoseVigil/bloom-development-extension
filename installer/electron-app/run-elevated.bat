REM ============================================================================
REM run-elevated.bat (Versión simplificada para compatibilidad)
REM Ubicación: /installer/electron-app/run-elevated.bat
REM ============================================================================

@echo off
REM Wrapper simple que llama a run-admin.bat
call "%~dp0run-admin.bat"
exit /b