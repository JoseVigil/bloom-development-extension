# Guía Operacional — Deploy de Ion Sites con Metamorph

**Versión:** Phase 6a (inspección activa) · Phase 6b (reconciliación) en espera de Bartcave  
**Audiencia:** Bloom Platform Engineering  
**Fecha:** Mayo 2026

---

## Panorama general

Un ion site es un paquete `.ion` (ZIP) que Metamorph despliega en AppData para que
Cortex/IonPump lo use en runtime. El flujo completo tiene tres etapas:

```
[Fuente del paquete]
        │
        ▼
[Staging + verificación SHA-256]
        │
        ▼
[Swap atómico → AppData]
        │
        ▼
[IonLoader detecta el cambio → hot-reload]
        │
        ▼
[Cortex ejecuta el ion]
```

---

## 1. Dónde se obtiene el paquete

### Phase 6a — Manual (estado actual)

El paquete lo construís vos localmente desde el directorio de desarrollo.

**Estructura requerida antes de comprimir:**

```
github.com/
├── domain.manifest.json    ← schema_version: "2.0" obligatorio
├── actions/
│   └── generate_pat.ion
├── pages/
│   ├── tokens_page.page.ion
│   └── new_token_page.page.ion
└── shared/
    └── session_guard.ion
```

**Empaquetar:**

```powershell
# Windows PowerShell — desde el directorio que CONTIENE la carpeta github.com/
Compress-Archive -Path .\github.com\* -DestinationPath .\github.com.ion.zip

# Verificar el hash SHA-256 (lo necesitás para el manifest de reconciliación)
Get-FileHash .\github.com.ion.zip -Algorithm SHA256
```

```bash
# macOS / Linux
cd github.com && zip -r ../github.com.ion.zip . && cd ..
shasum -a 256 github.com.ion.zip
```

### Phase 6b — Automático desde Bartcave (futuro, bloqueado)

Nucleus consulta Bartcave, obtiene el manifest de versiones, y llama a
`metamorph reconcile-ion-recipes` automáticamente. No requiere intervención manual.

---

## 2. Ruta de destino en AppData

```
%LOCALAPPDATA%\BloomNucleus\bin\cortex\ionsites\
├── github.com\
│   ├── domain.manifest.json
│   ├── actions\
│   ├── pages\
│   └── shared\
├── _meta\
│   └── versions.json          ← estado de todas las versiones instaladas
├── _staging\
│   ├── downloads\             ← ZIPs descargados antes de extraer
│   └── github.com\            ← extracción temporal pre-swap
└── _backup\
    └── github.com\            ← versión anterior (disponible para rollback)
```

**Ruta completa del site activo:**
```
C:\Users\{usuario}\AppData\Local\BloomNucleus\bin\cortex\ionsites\github.com\
```

---

## 3. Deploy manual — paso a paso

### Paso 1 — Verificar que ionsites/ existe

```powershell
$ionsites = "$env:LOCALAPPDATA\BloomNucleus\bin\cortex\ionsites"
Test-Path $ionsites
# Si es False, Nucleus debe haberlo creado. Crearlo manualmente solo para testing:
New-Item -ItemType Directory -Path $ionsites -Force
```

### Paso 2 — Copiar el ZIP a staging/downloads/

```powershell
$staging = "$ionsites\_staging\downloads"
New-Item -ItemType Directory -Path $staging -Force
Copy-Item .\github.com.ion.zip "$staging\github.com.ion"
```

### Paso 3 — Crear el manifest de reconciliación

Creá un archivo `manifest.json` con la información del paquete.
El campo `sha256` es el hash que obtuviste en el Paso 1 de la sección anterior.
Los `files` son los archivos internos del ZIP con sus hashes individuales.

```json
{
  "ion_recipes": [
    {
      "site": "github.com",
      "version": "1.0.0",
      "download_url": "",
      "sha256": "HASH_DEL_ZIP_COMPLETO",
      "files": [
        {
          "path": "domain.manifest.json",
          "sha256": "HASH_DEL_ARCHIVO"
        },
        {
          "path": "actions/generate_pat.ion",
          "sha256": "HASH_DEL_ARCHIVO"
        },
        {
          "path": "pages/tokens_page.page.ion",
          "sha256": "HASH_DEL_ARCHIVO"
        },
        {
          "path": "pages/new_token_page.page.ion",
          "sha256": "HASH_DEL_ARCHIVO"
        },
        {
          "path": "shared/session_guard.ion",
          "sha256": "HASH_DEL_ARCHIVO"
        }
      ]
    }
  ]
}
```

**Generar los hashes de archivos individuales desde PowerShell:**

```powershell
# Desde dentro de la carpeta github.com/
Get-ChildItem -Recurse -File | ForEach-Object {
    $hash = (Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLower()
    $rel  = $_.FullName.Replace((Get-Location).Path + "\", "").Replace("\", "/")
    Write-Output "  { `"path`": `"$rel`", `"sha256`": `"$hash`" },"
}
```

### Paso 4 — Ejecutar el deploy

```powershell
# Deploy completo
metamorph reconcile-ion-recipes --manifest .\manifest.json

# Dry-run primero (recomendado) — verifica sin escribir nada
metamorph reconcile-ion-recipes --manifest .\manifest.json --dry-run

# Con output JSON para diagnóstico
metamorph --json reconcile-ion-recipes --manifest .\manifest.json
```

**Output esperado (éxito):**

```
Ion Recipe Reconciliation
────────────────────────────────────────────────────────────
github.com            1.0.0 (new)         ✅ swapped   (287ms)
────────────────────────────────────────────────────────────
Total: 1 sites   Swapped: 1   Skipped: 0   Rolled back: 0   Failed: 0
```

### Paso 5 — Verificar el resultado

```powershell
# Verificar que el site quedó instalado correctamente
metamorph inspect --ion-recipes

# Output esperado:
# Ion Recipe Packages
# ────────────────────────────────────────────────────────────
# github.com           v1.0.0       1 actions  3 pages    4.2 KB  ✅ healthy
# ────────────────────────────────────────────────────────────
# Total: 1 sites

# Ver el contenido de versions.json
Get-Content "$env:LOCALAPPDATA\BloomNucleus\bin\cortex\ionsites\_meta\versions.json"
```

**versions.json esperado:**

```json
{
  "schema_version": "1.0",
  "sites": {
    "github.com": {
      "version": "1.0.0",
      "installed_at": "2026-05-02T12:00:00Z",
      "sha256": "HASH_DEL_ZIP_COMPLETO",
      "swap_count": 1,
      "status": "active"
    }
  },
  "last_updated": "2026-05-02T12:00:00Z"
}
```

---

## 4. Qué hace Metamorph internamente durante el deploy

Cuando ejecutás `reconcile-ion-recipes`, Metamorph sigue estas 7 fases en orden:

| Fase | Qué hace | Falla si... |
|---|---|---|
| **1. Skip check** | Compara versión + SHA-256 con lo instalado | — |
| **2. Stage** | Extrae el ZIP de `_staging/downloads/` a `_staging/github.com/` | El ZIP no existe o está corrupto |
| **3. Verify** | Verifica SHA-256 de cada archivo declarado en `files[]` | Cualquier hash no coincide → borra staging |
| **4. Signal pre** | Pide a Brain que quiesce el site (detiene flows activos) | Brain responde `timeout` |
| **5. Swap** | Rename: `github.com/ → _backup/github.com/` luego `_staging/github.com/ → github.com/` | Algún rename falla (revierte el primero) |
| **6. Signal post** | Pide a Brain que recargue el site | Brain responde `error` → rollback |
| **7. Rollback** | (Solo si fase 6 falla) Restaura desde `_backup/` | — |

**Regla crítica:** `versions.json` se actualiza solo después del swap exitoso y la confirmación de Brain. Si Brain falla el reload, el swap se revierte — nunca queda un estado inconsistente.

---

## 5. Actualizar un site existente

El proceso es idéntico al deploy inicial. Metamorph detecta automáticamente que ya hay una versión instalada y la mueve a `_backup/` antes de instalar la nueva.

```powershell
# Actualizar github.com de v1.0.0 a v1.1.0
metamorph reconcile-ion-recipes --manifest .\manifest_v1.1.json
```

**Output esperado:**

```
github.com            1.0.0 → 1.1.0       ✅ swapped   (312ms)
```

Si algo sale mal con la nueva versión, la versión anterior está en `_backup/`:

```powershell
# Ver si hay backup disponible
metamorph inspect --ion-recipes --show-backups
```

---

## 6. Diagnóstico y troubleshooting

### El site aparece como `missing_manifest`

```powershell
# Verificar que domain.manifest.json existe en el directorio del site
Test-Path "$env:LOCALAPPDATA\BloomNucleus\bin\cortex\ionsites\github.com\domain.manifest.json"

# Si no existe, el ZIP se extrajo incompleto. Re-deployar.
```

### El deploy falla en fase `verify`

El hash de algún archivo no coincide. Regenerar los hashes y actualizar el manifest:

```powershell
# Verificar hash del ZIP
Get-FileHash .\github.com.ion.zip -Algorithm SHA256

# Limpiar staging manualmente si quedó a medias
Remove-Item -Recurse -Force "$env:LOCALAPPDATA\BloomNucleus\bin\cortex\ionsites\_staging\github.com"
```

### El deploy falla en fase `signal_pre` (Brain no responde)

Brain no está corriendo o IonPump no está escuchando en el puerto configurado.

```powershell
# Verificar que Brain está activo
brain --status

# Forzar el swap sin esperar a Brain (UNSAFE — solo para testing sin Brain)
metamorph reconcile-ion-recipes --manifest .\manifest.json --force-swap
```

### Ver el estado completo del site

```powershell
# Inspección completa
metamorph inspect --ion-recipes
metamorph inspect --ion-recipes --show-pending
metamorph inspect --ion-recipes --show-backups

# JSON para diagnóstico detallado
metamorph --json inspect --ion-recipes
```

### Hay un site en estado `pending`

Indica que Metamorph crasheó durante un swap anterior. Se resuelve automáticamente
al próximo arranque de Metamorph (crash recovery). Para forzarlo:

```powershell
# Simplemente reiniciar Metamorph ejecuta RecoverPendingSwaps al startup
metamorph inspect --ion-recipes --show-pending
```

---

## 7. Cómo Cortex/IonPump accede al site desplegado

Una vez que el site está en AppData, IonPump lo usa así:

```
Brain arranca
    └── IonLoader escanea ionsites/
            └── Encuentra github.com/domain.manifest.json
                    └── Carga en memoria: actions, pages, shared
                            └── Registra watchdog sobre ionsites/github.com/

Intent llega a Brain: { domain: "github.com", action: "generate_pat" }
    └── IonPump busca "generate_pat" en actions cargadas
            └── Ejecuta los steps → envía Synapse commands a content.js
                    └── Cortex ejecuta en el browser
```

**El watchdog de IonLoader** detecta automáticamente cuando Metamorph hace el swap
y recarga el paquete en memoria sin reiniciar Brain. El próximo intent ya usa
la versión nueva.

---

## 8. Referencia rápida de comandos

```powershell
# Inspeccionar sites instalados
metamorph inspect --ion-recipes
metamorph inspect --ion-recipes --show-pending
metamorph inspect --ion-recipes --show-backups
metamorph --json inspect --ion-recipes

# Deploy / actualización
metamorph reconcile-ion-recipes --manifest manifest.json
metamorph reconcile-ion-recipes --manifest manifest.json --dry-run
metamorph reconcile-ion-recipes --manifest manifest.json --force-swap
metamorph --json reconcile-ion-recipes --manifest manifest.json

# Pipe desde stdin (alternativa a --manifest)
Get-Content manifest.json | metamorph reconcile-ion-recipes
```

---

## 9. Checklist de deploy

Antes de ejecutar el deploy, verificar:

- [ ] `domain.manifest.json` tiene `schema_version: "2.0"`
- [ ] `domain` en el manifest coincide con el nombre del directorio (`github.com`)
- [ ] Todos los archivos declarados en `actions`, `pages`, `shared` existen en el ZIP
- [ ] El ZIP fue creado desde **dentro** de la carpeta del site (no desde afuera)
- [ ] Los hashes en `manifest.json` fueron generados **desde el ZIP ya comprimido**
- [ ] Brain está corriendo (o se usa `--force-swap` para testing)
- [ ] Se ejecutó `--dry-run` primero y no reportó errores
- [ ] Después del deploy: `metamorph inspect --ion-recipes` muestra `✅ healthy`

---

*Bloom Platform Engineering · Metamorph Phase 6a · Mayo 2026*
