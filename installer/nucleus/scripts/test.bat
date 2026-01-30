@echo off
chcp 65001 >nul
echo ============================================
echo 🧪 Testing Nucleus
echo ============================================

:: Verificar que el binario existe
if not exist "bin\nucleus.exe" (
    echo ❌ nucleus.exe not found. Run scripts\build.bat first.
    exit /b 1
)

echo.
echo [1/5] Testing version command...
bin\nucleus.exe version
echo.

echo [2/5] Testing version JSON...
bin\nucleus.exe --json version
echo.

echo [3/5] Testing info command...
bin\nucleus.exe info
echo.

echo [4/5] Testing info JSON...
bin\nucleus.exe --json info
echo.

echo [5/5] Testing help...
bin\nucleus.exe --help | head -n 20
echo ... (truncated)
echo.

echo ============================================
echo ✅ All tests completed
echo ============================================
echo.
echo Help files generated:
if exist "help\nucleus_help.txt" echo   ✅ help\nucleus_help.txt
if exist "help\nucleus_help.json" echo   ✅ help\nucleus_help.json
echo.
