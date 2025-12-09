# Tomar ownership de la DLL
takeown /f "C:\Program Files\BloomNucleus\native\libwinpthread-1.dll" /a

# Dar permisos completos a Administradores
icacls "C:\Program Files\BloomNucleus\native\libwinpthread-1.dll" /grant Administrators:F

# Eliminar el archivo
Remove-Item "C:\Program Files\BloomNucleus\native\libwinpthread-1.dll" -Force

# Copiar el nuevo
Copy-Item "C:\repos\bloom-videos\bloom-development-extension\installer\native\bin\win32\libwinpthread-1.dll" "C:\Program Files\BloomNucleus\native\" -Force