# 📁 SENTINEL v1.2 - Estructura de Archivos (ACTUALIZADA)

## 🎯 Estructura Real del Proyecto

```
bloom-development-extension/
└── installer/
    ├── sentinel/                    ← Aquí estás ahora
    │   ├── main.go                  ← Entry point + JSON-RPC
    │   ├── paths.go                 ← Path resolver (ACTUALIZADO)
    │   ├── process_manager.go       ← Process management
    │   ├── config.go                ← Blueprint parser
    │   ├── logger_hub.go            ← Log aggregator
    │   ├── blueprint.json           ← Config central
    │   ├── build.bat                ← Build script
    │   ├── verify.bat               ← Verification (ACTUALIZADO)
    │   └── sentinel.exe             ← Binary compilado
    │
    ├── native/
    │   └── bin/
    │       └── win32/               ← Deploy target
    │           ├── sentinel.exe     ← Copiado aquí
    │           ├── blueprint.json   ← Copiado aquí
    │           ├── brain/
    │           │   └── brain.exe    ← Python CLI
    │           ├── chrome-win/      ← Chromium (si existe)
    │           │   └── chrome.exe
    │           └── profiles/        ← User profiles
    │
    └── chrome-extension/
        └── src/                     ← BTips extension
            ├── manifest.json
            ├── background.js
            └── ...
```

---

## 🔧 Cambios vs Versión Anterior

### ✅ Rutas Corregidas en `paths.go`

| Componente | Ruta Anterior (INCORRECTA) | Ruta Real (CORRECTA) |
|------------|---------------------------|---------------------|
| Brain | `native/bin/brain.exe` | `native/bin/win32/brain/brain.exe` |
| Chromium | `native/bin/chrome-win/` | `native/bin/win32/chrome-win/` |
| Extension | `native/extension/` | `chrome-extension/src/` |
| Profiles | `%APPDATA%/Synapse/Profiles/` | `native/bin/win32/profiles/` |

---

## 🚀 Pasos de Deploy (Actualizados)

### Paso 1: Verificar estructura
```batch
cd installer\sentinel
verify.bat
```

**Output esperado:**
```
========================================
SENTINEL v1.2 - Verification Script
========================================

[CHECK 1] Verifying sentinel.exe exists...
[FAIL] sentinel.exe not found - run build.bat first

[CHECK 2] Verifying blueprint.json...
[OK] blueprint.json found

[CHECK 3] Verifying project structure...
[OK] brain.exe found
[WARN] chrome.exe not found at ..\native\bin\win32\chrome-win\chrome.exe
[INFO] This is OK if using system Chrome or if Chromium isn't installed yet
[OK] extension directory found

[CHECK 4] Verifying logs directory...
[OK] Logs directory exists: C:\Users\...\AppData\Local\BloomNucleus\logs

[CHECK 5] Verifying temp directory...
[INFO] Temp directory will be created on first run

========================================
VERIFICATION PASSED
All critical checks passed!
========================================
```

### Paso 2: Compilar
```batch
build.bat
```

**Output esperado:**
```
========================================
SENTINEL v1.2 Build Script
========================================

[1/3] Compiling Sentinel...
[OK] sentinel.exe compiled successfully

[2/3] Creating deployment structure...

[3/3] Deploying to native\bin\win32\...
        1 archivo(s) copiado(s).
        1 archivo(s) copiado(s).

========================================
BUILD SUCCESSFUL
========================================
Deployed to: native\bin\win32\
  - sentinel.exe
  - blueprint.json
========================================
```

### Paso 3: Test Básico
```batch
cd ..\native\bin\win32
echo {"method":"status","params":{},"id":1} | sentinel.exe
```

**Output esperado:**
```json
{
  "result": {
    "running_processes": [],
    "port_5678_open": false
  },
  "id": 1
}
```

---

## 📝 Notas Importantes

### ⚠️ Chromium es Opcional
Si `chrome-win` no existe, Sentinel puede usar Chrome del sistema. El warning es informativo, no bloquea la compilación.

### ✅ Profiles en `native/bin/win32/profiles/`
Los perfiles de usuario ahora se guardan junto a `brain.exe`, no en `%APPDATA%`. Esto simplifica el deployment.

### ✅ Extension en `chrome-extension/src/`
La extensión está en la raíz de `installer`, no en `native/`.

---

## 🐛 Troubleshooting

### Error: "brain executable not found"
```batch
# Verificar que brain.exe existe
dir ..\native\bin\win32\brain\brain.exe

# Si no existe, verificar instalación de Brain
```

### Error: "extension directory not found"
```batch
# Verificar estructura
dir ..\chrome-extension\src\manifest.json

# Debe existir y contener manifest.json
```

### Chromium Warning (No es Error)
```
[WARN] chrome.exe not found at ..\native\bin\win32\chrome-win\chrome.exe
[INFO] This is OK if using system Chrome
```
Esto está bien si vas a usar Chrome del sistema. Puedes ignorarlo.

---

## ✅ Checklist Final

- [ ] `verify.bat` pasa (solo 1 error: sentinel.exe no existe antes de build)
- [ ] `build.bat` compila sin errores
- [ ] Archivos copiados a `native/bin/win32/`
- [ ] Test manual devuelve JSON válido
- [ ] Brain responde en `native/bin/win32/brain/brain.exe`

---

## 🎯 Próximo Paso

Una vez compilado:
```batch
# Ejecutar Sentinel directamente
cd ..\native\bin\win32
sentinel.exe

# Debería quedarse esperando comandos JSON por stdin
```

**El violín está afinado con las cuerdas correctas.** 🎻