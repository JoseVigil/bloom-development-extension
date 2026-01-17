@echo off
go build -o sentinel.exe
if %ERRORLEVEL% NEQ 0 exit /b %ERRORLEVEL%

:: Crear estructura si no existe
mkdir ..\native\bin\win32 2>nul

:: Copiar binario
copy /Y sentinel.exe ..\native\bin\win32\
copy /Y blueprint.json ..\native\bin\win32\

echo Deployed to native\bin\win32\