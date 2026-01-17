Actúa como Principal Systems Architect en Go. 

CONTEXTO:
- Directorio de trabajo: bloom-development-extension/installer/sentinel/
- Objetivo: Compilar sentinel.exe hacia ../native/bin/win32/
- Estructura existente:
  * installer/sentinel/ (código fuente)
  * installer/native/bin/win32/ (destino del .exe)
  * installer/native/bin/logs/ (logs)
  * installer/native/bin/profiles/ (perfiles)

REQUISITOS FASE 1:

1. Crear estructura de paquetes:
   - internal/core/paths.go
   - internal/core/config.go  
   - internal/core/logger.go
   - internal/core/core.go
   - main.go
   - go.mod

2. paths.go debe:
   - Detectar BinDir automáticamente desde os.Executable()
   - Si BinDir termina en "win32" o "darwin": AppDataDir = directorio padre (bin/)
   - Si no: AppDataDir = %LOCALAPPDATA%/BloomNucleus
   - ProfilesDir = AppDataDir/profiles
   - LogsDir = AppDataDir/logs
   - Crear directorios si no existen

3. config.go debe:
   - Leer blueprint.json desde BinDir
   - Parsear: version, profiles[], settings{}, monitoring{}
   - Validar que existan perfiles

4. logger.go debe:
   - Escribir a LogsDir/sentinel_YYYY-MM-DD.log
   - Dual output: consola + archivo

5. main.go debe mostrar:
   - "✓ Sentinel Base Inicializada con éxito"
   - Todas las rutas resueltas
   - "✓ Todas las rutas validadas correctamente"

6. Crear build.bat que:
   - Compile desde installer/sentinel/
   - Output: ../native/bin/win32/sentinel.exe
   - Flags: GOOS=windows GOARCH=386
   - Copie blueprint.json si no existe

ENTREGABLES:
- 7 archivos de código completos y funcionales
- Sin placeholders
- Sin dependencias externas
- Código probado que compile sin errores

NO incluyas explicaciones, solo el código completo de cada archivo.