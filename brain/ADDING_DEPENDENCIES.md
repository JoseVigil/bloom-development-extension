# Cómo agregar una dependencia Python a Brain

Este documento explica el flujo completo para agregar una librería Python al proyecto Brain, incluyendo el caso especial de librerías nativas de Windows (como `pywin32`).

---

## Arquitectura de dependencias

Brain usa un sistema de **vendoring** — las dependencias se instalan localmente en `brain/libs/` en lugar del sistema global. Esto garantiza que el ejecutable compilado con PyInstaller sea portable y autónomo.

```
brain/
├── requirements.txt          ← Define las dependencias
├── libs/                     ← Dependencias instaladas (vendoring)
└── build_deploy/
    └── brain.spec            ← Declara hiddenimports para PyInstaller
```

El script `scripts/python/install_python_deps.js` es el responsable de leer `requirements.txt` e instalar todo en `brain/libs/` usando `pip install -t`.

---

## Caso 1: Librería Python estándar (puro Python)

La mayoría de las librerías funcionan con este flujo simple.

### Paso 1 — Agregar a `requirements.txt`

```txt
# Para todas las plataformas:
mi-libreria>=1.0.0

# Solo en Windows:
mi-libreria>=1.0.0; sys_platform == "win32"

# Solo en Mac:
mi-libreria>=1.0.0; sys_platform == "darwin"
```

### Paso 2 — Instalar en `libs/`

```bash
node scripts/python/install_python_deps.js
```

Esto instala todas las dependencias de `requirements.txt` dentro de `brain/libs/`.

### Paso 3 — Declarar en `brain.spec` (si PyInstaller no la detecta automáticamente)

Abrir `brain/build_deploy/brain.spec` y agregar los módulos necesarios a la lista `hiddenimports`:

```python
hiddenimports = [
    # ... imports existentes ...

    # Mi nueva librería
    'mi_libreria',
    'mi_libreria.submodulo',
]
```

> **¿Cuándo es necesario?** PyInstaller a veces no detecta imports dinámicos o condicionales. Si al ejecutar el `.exe` aparece `ModuleNotFoundError`, hay que agregar el módulo al `.spec`.

---

## Caso 2: Librería nativa de Windows (`pywin32` y similares)

Las librerías con extensiones C o DLLs nativas **no se pueden vendorear** con `pip install -t`. Deben instalarse en el Python del sistema y PyInstaller las empaqueta automáticamente.

### Ejemplo: `pywin32` (win32pipe, win32file, win32api, pywintypes)

#### Paso 1 — Agregar a `requirements.txt` con marcador de plataforma

```txt
pywin32; sys_platform == "win32"
```

> El marcador `; sys_platform == "win32"` es obligatorio para que el script no falle en Mac/Linux.

#### Paso 2 — Instalar en el Python del sistema (solo Windows)

```bash
# Instalar pywin32
pip install pywin32

# Verificar que funciona
python -c "import win32pipe; print('OK')"
```

> **Importante:** `install_python_deps.js` usa `pip install -t libs/` que falla silenciosamente con pywin32. La instalación en el sistema es necesaria para que PyInstaller pueda recolectar las DLLs.

#### Paso 3 — Verificar `brain.spec`

El `.spec` ya tiene configurada la recolección automática de DLLs de pywin32:

```python
from PyInstaller.utils.hooks import collect_dynamic_libs
binaries = collect_dynamic_libs('win32')
```

Esta línea recolecta automáticamente las DLLs nativas cuando se compila.

#### Paso 4 — Declarar `hiddenimports` en `brain.spec`

```python
hiddenimports = [
    # ... imports existentes ...

    # Windows Named Pipes (pywin32)
    'win32pipe',
    'win32file',
    'win32api',
    'pywintypes',
    'win32con',
]
```

---

## Resumen rápido

| Tipo de librería | `requirements.txt` | `install_python_deps.js` | Instalar en sistema | `hiddenimports` en `.spec` |
|---|---|---|---|---|
| Puro Python | ✅ Agregar | ✅ Ejecutar | ❌ No necesario | Solo si hay imports dinámicos |
| Nativa Windows (pywin32, etc.) | ✅ Agregar con `; sys_platform == "win32"` | ⚠️ No aplica para la librería nativa | ✅ Obligatorio (`pip install`) | ✅ Siempre necesario |

---

## Troubleshooting

**`ModuleNotFoundError` al ejecutar el `.exe`**
→ Falta el módulo en `hiddenimports` del `.spec`. Agregarlo y recompilar.

**La librería se instala en `libs/` pero no funciona en el ejecutable**
→ Probablemente es una librería nativa. Instalarla en el sistema Python y seguir el Caso 2.

**`pip install` falla con pywin32 en `libs/`**
→ Esperado. pywin32 requiere instalación en el sistema. Ver Caso 2.

**Error en Mac/Linux al correr `install_python_deps.js`**
→ Asegurarse de que las dependencias Windows-only tengan el marcador `; sys_platform == "win32"` en `requirements.txt`.
