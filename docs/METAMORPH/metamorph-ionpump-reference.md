# Metamorph — IonPump Reference

> **Paquete:** `installer/metamorph/internal/inspection`
> **Archivos:** `types.go` · `ionrecipes.go` · `inspect.go`
> **Estado:** Phase 6a y 6b completamente implementadas en Go.

Este documento describe el subsistema de IonPump dentro de Metamorph: tipos de datos,
filesystem layout, flujo de reconciliación, crash recovery, y contratos de interfaz hacia
Brain. Es la referencia técnica de implementación — para la arquitectura completa del
ecosistema IonPump, ver `IONPUMP_IMPLEMENTATION_PROMPT_v5.md`.

---

## Tabla de contenidos

1. [Filesystem layout](#1-filesystem-layout)
2. [Tipos de datos](#2-tipos-de-datos)
3. [Inspección de sites](#3-inspección-de-sites)
4. [Reconciliación](#4-reconciliación)
5. [Atomic swap](#5-atomic-swap)
6. [Crash recovery](#6-crash-recovery)
7. [versions.json](#7-versionsjson)
8. [Interfaz IonPumpClient](#8-interfaz-ionpumpclient)
9. [Comando inspect --ion-recipes](#9-comando-inspect---ion-recipes)
10. [Bootstrap pipeline](#10-bootstrap-pipeline)
11. [Constantes del paquete](#11-constantes-del-paquete)
12. [Bugs conocidos y gaps](#12-bugs-conocidos-y-gaps)

---

## 1. Filesystem layout

Todos los ion sites viven bajo `ionsites/`, que Metamorph resuelve como:

```
GetBasePath() + "/bin/cortex/ionsites"
```

`GetBasePath()` resuelve en orden:

```
$BLOOM_NUCLEUS_HOME          (si está seteada)
$LOCALAPPDATA/BloomNucleus   (Windows)
~/AppData/Local/BloomNucleus (fallback Windows)
~/Library/BloomNucleus       (macOS — desarrollo)
```

Estructura completa bajo `ionsites/`:

```
ionsites/
├── <domain>/                       ← site instalado (live)
│   ├── domain.manifest.json        ← índice del paquete (schema_version "2.0")
│   ├── actions/
│   │   └── *.ion                   ← flows de negocio públicos
│   ├── pages/
│   │   └── *.page.ion              ← descriptores de página (contratos estáticos)
│   └── shared/
│       └── *.ion                   ← fragments reutilizables
│
├── _backup/
│   └── <domain>/                   ← versión anterior (disponible para rollback)
│
├── _meta/
│   └── versions.json               ← estado de todas las versiones instaladas
│
└── _staging/
    ├── <domain>/                   ← extracción temporal durante reconciliación
    └── downloads/
        └── <domain>.ion            ← ZIP descargado, esperando extracción
```

**Regla crítica:** Los directorios con prefijo `_` son ignorados por
`InspectAllIonRecipes`. `IonLoader` en Brain debe seguir la misma convención.

---

## 2. Tipos de datos

### `IonDomainManifest`

Representación parseada de `domain.manifest.json` en el root de cada site.

```go
type IonDomainManifest struct {
    SchemaVersion         string               `json:"schema_version"` // siempre "2.0"
    Domain                string               `json:"domain"`
    Version               string               `json:"version"`
    Description           string               `json:"description"`
    Author                IonAuthor            `json:"author"`
    Actions               map[string]IonAction `json:"actions"`
    Pages                 map[string]string    `json:"pages"`
    Shared                map[string]string    `json:"shared"`
    EntryActions          []string             `json:"entry_actions"`
    Capabilities          []string             `json:"capabilities"`
    RequiresCortexVersion string               `json:"requires_cortex_version"`
}
```

`Actions` es un mapa: clave = nombre del action, valor = `IonAction` con el path
relativo y si es público. `Pages` y `Shared` son mapas: clave = nombre lógico,
valor = path relativo al root del site.

### `IonAction`

```go
type IonAction struct {
    File   string `json:"file"`   // path relativo al root del ZIP
    Public bool   `json:"public"`
}
```

### `IonAuthor`

```go
type IonAuthor struct {
    Name    string `json:"name"`
    Contact string `json:"contact"`
}
```

### `IonRecipeInfo`

Resultado de inspeccionar un único site instalado. Es el elemento de
`IonRecipesResult.Recipes`.

```go
type IonRecipeInfo struct {
    Site                  string   `json:"site"`
    Version               string   `json:"version"`
    Description           string   `json:"description"`
    SchemaVersion         string   `json:"schema_version"`
    EntryActions          []string `json:"entry_actions"`
    PublicActions         []string `json:"public_actions"`   // derivado: actions donde Public == true
    PageCount             int      `json:"page_count"`       // len(manifest.Pages)
    SharedCount           int      `json:"shared_count"`     // len(manifest.Shared)
    Capabilities          []string `json:"capabilities"`
    RequiresCortexVersion string   `json:"requires_cortex_version"`
    SizeBytes             int64    `json:"size_bytes"`
    Status                string   `json:"status"`
}
```

> **Nota para Brain:** Los campos son `page_count` y `shared_count`.
> `flow_count` **no existe** en ninguna parte del sistema — es un artefacto
> del formato v4 (monolítico) que fue eliminado en v5.

Valores de `Status`:

| Valor | Condición |
|---|---|
| `"healthy"` | Manifest válido y todos los `entry_actions` existen en disco |
| `"missing_manifest"` | `domain.manifest.json` no existe |
| `"invalid_manifest"` | JSON inválido o `version == ""` |
| `"missing_entrypoint"` | Un nombre en `entry_actions` no existe en `actions` o su archivo no está en disco |

### `IonRecipesResult`

Payload completo del comando `inspect --ion-recipes`.

```go
type IonRecipesResult struct {
    BasePath   string          `json:"base_path"`
    Recipes    []IonRecipeInfo `json:"recipes"`      // nunca null — slice vacío si no hay sites
    TotalSites int             `json:"total_sites"`
    TotalFlows int             `json:"total_flows"`
    Timestamp  string          `json:"timestamp"`
}
```

### `IonRecipeUpdate`

Una entrada del manifest de reconciliación recibido desde Nucleus. Describe un
site que debe ser evaluado y potencialmente swapeado.

```go
type IonRecipeUpdate struct {
    Site        string          `json:"site"`         // "github.com"
    Version     string          `json:"version"`      // "1.1.0"
    DownloadURL string          `json:"download_url"` // endpoint de Bartcave
    SHA256      string          `json:"sha256"`       // hash del ZIP completo
    Files       []IonRecipeFile `json:"files"`        // hashes por archivo para verificación
}

type IonRecipeFile struct {
    Path   string `json:"path"`   // relativo al root del ZIP
    SHA256 string `json:"sha256"`
}
```

### `ReconcileResult`

Resultado de la reconciliación de un único site.

```go
type ReconcileResult struct {
    Site            string `json:"site"`
    PreviousVersion string `json:"previous_version"`
    NewVersion      string `json:"new_version"`
    Action          string `json:"action"`     // "skipped" | "swapped" | "rolled_back" | "failed"
    Phase           string `json:"phase"`      // fase donde ocurrió el fallo; vacío en éxito
    DurationMs      int64  `json:"duration_ms"`
    SwappedAt       string `json:"swapped_at,omitempty"`
    Error           string `json:"error,omitempty"`
}
```

### `ReconcileAllResult`

```go
type ReconcileAllResult struct {
    Results   []ReconcileResult `json:"reconcile_results"`
    Summary   ReconcileSummary  `json:"summary"`
    Timestamp string            `json:"timestamp"`
}

type ReconcileSummary struct {
    TotalSites int `json:"total_sites"`
    Skipped    int `json:"skipped"`
    Swapped    int `json:"swapped"`
    RolledBack int `json:"rolled_back"`
    Failed     int `json:"failed"`
}
```

---

## 3. Inspección de sites

### `InspectAllIonRecipes(ionsitesPath string) (*IonRecipesResult, error)`

Lee todos los subdirectorios de `ionsitesPath`, ignora los que empiezan con `_`,
e invoca `InspectIonRecipe` en cada uno. Los errores por site son no-fatales: el
site se registra con `status: "invalid_manifest"` y el scan continúa.

Siempre retorna un slice inicializado (nunca `null` en JSON):

```go
result := &IonRecipesResult{
    Recipes:   []IonRecipeInfo{},
    Timestamp: time.Now().UTC().Format(time.RFC3339),
}
```

> **Gap conocido:** `BasePath`, `TotalSites` y `TotalFlows` no se calculan
> dentro de esta función — quedan en cero/vacío. Ver [sección 12](#12-bugs-conocidos-y-gaps).

### `InspectIonRecipe(sitePath string) (*IonRecipeInfo, error)`

Inspecciona un único directorio de site. Secuencia de ejecución:

```
1. Leer domain.manifest.json
     → si no existe: retorna status "missing_manifest" (no error)
     → si existe pero JSON inválido: retorna status "invalid_manifest"
     → si manifest.Version == "": retorna status "invalid_manifest"

2. Derivar PublicActions
     → itera manifest.Actions, recolecta los que tienen Public == true

3. Verificar entry_actions en disco
     → por cada nombre en manifest.EntryActions:
         - debe existir como clave en manifest.Actions
         - el archivo action.File debe existir en sitePath/
     → si alguno falla: status "missing_entrypoint"

4. Calcular SizeBytes (os.WalkDir recursivo)

5. Retornar IonRecipeInfo con status "healthy" si todo OK
```

### `ReadIonManifestFromZIP(zipPath string) (*IonDomainManifest, error)`

Lee y parsea `domain.manifest.json` desde un `.ion` ZIP sin extraer el
contenido a disco. Aplica el cap de seguridad `ionManifestMaxSize` (64 KB).
Valida que `Version` y `Domain` no estén vacíos.

Esta función está disponible para pre-validar un ZIP antes de iniciar el staging,
pero `ReconcileIonRecipe` actualmente no la invoca — va directo a la extracción.

---

## 4. Reconciliación

### `ReconcileIonRecipe` — las 7 fases

```go
func ReconcileIonRecipe(
    ionsitesPath string,
    update IonRecipeUpdate,
    client IonPumpClient,
    dryRun bool,
    forceSwap bool,
) ReconcileResult
```

El flujo es secuencial. Un fallo en cualquier fase retorna inmediatamente con
`Action: "failed"` y `Phase` indicando dónde ocurrió, excepto en las fases 6 y
7 donde el fallo de reload dispara el rollback.

#### Fase 1 — Skip check

Compara `version` y `sha256` del site instalado (leídos de `versions.json`)
contra los valores del `update`. Si coinciden ambos: retorna `Action: "skipped"`
sin modificar nada en disco.

Si `dryRun == true`: retorna `"skipped"` independientemente del resultado del check.

#### Fase 2 — Stage

Crea `_staging/<site>/` y extrae el ZIP ubicado en
`_staging/downloads/<site>.ion`. La descarga del ZIP es responsabilidad de
Nucleus — Metamorph asume que el ZIP ya existe en esa ruta cuando comienza la
reconciliación.

`extractIonZIP` aplica una validación de path traversal: rechaza cualquier
entrada del ZIP cuyo path resultante escape de `destDir`.

Si falla: `os.RemoveAll(stagingDir)` y retorna `failed` en phase `"stage"`.

#### Fase 3 — Verify

Verifica cada archivo declarado en `update.Files`: calcula su SHA-256 en staging
y lo compara contra el valor declarado (comparación case-insensitive).

Si falla: `os.RemoveAll(stagingDir)` y retorna `failed` en phase `"verify"`.

#### Fase 4 — Signal pre (quiesce)

Llama `client.QuiesceSite(update.Site, ionQuiesceTimeoutMs)`. Brain debe responder
`Status: "quiesced"` para continuar. Si responde `"timeout"` o la llamada falla:
retorna `failed` en phase `"signal_pre"`.

Si `forceSwap == true`: esta fase se saltea completamente. Usado en bootstrap
y testing cuando Brain no está corriendo.

#### Fase 5 — Swap

Ejecuta `atomicSwap(liveDir, stagingDir, backupDir)`. Ver [sección 5](#5-atomic-swap)
para el detalle de los dos renames y el mecanismo de reversión.

Si falla: retorna `failed` en phase `"swap"`. El `atomicSwap` garantiza
que la reversión interna ocurre si el segundo rename falla.

#### Fase 6 — Signal post (reload)

Llama `client.ReloadSite(update.Site, update.Version)`. Si Brain responde
`Status: "reloaded"`: el swap es exitoso. Si falla o retorna error: **activa la
fase 7**.

#### Fase 7 — Rollback

Solo se ejecuta si la fase 6 falla. Llama `rollbackSwap(liveDir, backupDir)`.

`rollbackSwap` hace:

```
1. os.RemoveAll(liveDir)        ← elimina la nueva versión
2. os.Rename(backupDir, liveDir) ← restaura la versión anterior
```

Si el rollback tiene éxito: `Action: "rolled_back"`, `Phase: "signal_post"`.

Si el rollback también falla: `Action: "failed"`, `Phase: "rollback"`. Este es
el caso crítico — el site queda en estado indeterminado. Metamorph lo loggea con
severidad máxima y notifica a Nucleus por separado.

#### Post-swap — Actualización de `versions.json`

Si el swap fue exitoso (fases 5 y 6 completadas), se escribe el nuevo
`VersionEntry` con `Status: "active"`. Un fallo al escribir `versions.json`
**no dispara rollback** — el swap ya ocurrió en disco. El error se loggea y
se continúa.

`SwapCount` se incrementa acumulando el valor anterior:
```go
entry.SwapCount = vf.Sites[site].SwapCount + 1
```

### `ReconcileAllIonRecipes`

Llama `ReconcileIonRecipe` secuencialmente para cada entrada del manifest. Un
fallo en un site no aborta el procesamiento de los siguientes.

---

## 5. Atomic swap

```go
func atomicSwap(liveDir, stagingDir, backupDir string) (swapState, error)
```

Implementa el swap en exactamente dos renames del sistema operativo:

```
Rename 1: liveDir  → backupDir    (salteado si liveDir no existe — primera instalación)
Rename 2: stagingDir → liveDir
```

Si el rename 2 falla después de que el rename 1 completó, se revierte el rename 1
inmediatamente dentro de `atomicSwap`:

```go
if _, statErr := os.Stat(backupDir); statErr == nil {
    _ = os.Rename(backupDir, liveDir)  // reversión inmediata
}
```

La función retorna el estado final del swap via `swapState`:

```go
type swapState int

const (
    swapStateNone      swapState = iota // nada ejecutado
    swapStateFirstDone                  // live→backup completado
    swapStateBothDone                   // staging→live completado
)
```

Este estado es usado por `RecoverPendingSwaps` en startup para determinar qué
ocurrió durante un crash anterior.

**Ventana de vulnerabilidad:** Entre el rename 1 y el rename 2, `liveDir` no
existe. Si el proceso crashea exactamente en ese punto, el site queda sin
directorio live. El crash recovery (sección 6) detecta esta situación via el
estado de `versions.json` y el directorio `_backup/`.

---

## 6. Crash recovery

```go
func RecoverPendingSwaps(ionsitesPath string, client IonPumpClient) error
```

Se ejecuta en el startup de Metamorph. Lee `versions.json` y por cada site
con `Status == "pending"` aplica uno de tres casos:

### Caso A — Swap completado, versions.json no actualizado

**Condición:** `_backup/<domain>/` existe Y la versión en `liveDir/domain.manifest.json`
coincide con la versión pendiente en `versions.json`.

**Interpretación:** Ambos renames completaron (`swapStateBothDone`), pero el
proceso crasheó antes de escribir `versions.json`.

**Acción:** Actualizar `versions.json` con `Status: "active"`.

### Caso B — Solo el primer rename completó

**Condición:** `_backup/<domain>/` existe Y la versión en `liveDir` **no** coincide
con la versión pendiente.

**Interpretación:** El rename 1 (`live → backup`) completó, pero el rename 2
(`staging → live`) no ocurrió antes del crash. El `liveDir` que existe es el
backup restaurado por `atomicSwap` (si el rename 2 falló) o el site no existe.

**Acción:** `os.RemoveAll(backupDir)`. El site queda en el estado que tenía
antes del swap intento — sin versión nueva y sin backup.

### Caso C — Nada que recuperar

**Condición:** `_backup/<domain>/` no existe.

**Acción:** No hace nada (`continue`).

---

## 7. versions.json

Ubicación: `ionsites/_meta/versions.json`

```go
type VersionsFile struct {
    SchemaVersion string                  `json:"schema_version"` // "1.0"
    Sites         map[string]VersionEntry `json:"sites"`
    LastUpdated   string                  `json:"last_updated"`
}

type VersionEntry struct {
    Version     string `json:"version"`
    InstalledAt string `json:"installed_at"`
    SHA256      string `json:"sha256"`
    SwapCount   int    `json:"swap_count"`
    Status      string `json:"status"` // "active" | "pending" | "failed"
}
```

### Lectura — `readVersionsFile`

Si el archivo no existe, retorna un `VersionsFile` vacío (no un error). Este es
el comportamiento correcto para la primera instalación.

### Escritura — `updateVersionsJSON`

Escritura siempre atómica: escribe a `versions.json.tmp` y luego `os.Rename` al
path final. Si el rename falla, elimina el `.tmp`.

El campo `SwapCount` se acumula — nunca se resetea:

```go
entry.SwapCount = vf.Sites[site].SwapCount + 1
```

### Ciclo de vida de `Status`

```
(no existe)
    ↓ inicio de reconciliación
"pending"        ← escrito al comenzar Phase 5 (antes del swap)
    ↓ swap + reload exitosos
"active"         ← escrito al finalizar Phase 6
    ↓ si falla Phase 6 y rollback OK
(entrada permanece "pending" o se marca "failed" según implementación)
    ↓ si falla Phase 6 y rollback falla
"failed"         ← escrito en Phase 7 crítica
```

> **Nota de implementación:** El código actual escribe `"active"` después de un
> swap exitoso, pero no escribe explícitamente `"pending"` al inicio del swap.
> El status `"pending"` en versions.json indica que un swap estaba en curso
> cuando el proceso terminó de forma abrupta — es un estado residual de crash,
> no un estado escrito intencionalmente por el flujo normal.

---

## 8. Interfaz IonPumpClient

```go
type IonPumpClient interface {
    QuiesceSite(site string, timeoutMs int) (QuiesceResult, error)
    ReloadSite(site string, version string) (ReloadResult, error)
}
```

### `QuiesceSite`

Pide a Brain que deje de aceptar nuevos flows para el site y espere a que los
activos terminen. Timeout configurado como `ionQuiesceTimeoutMs = 10_000` ms.

```go
type QuiesceResult struct {
    Status      string `json:"status"`       // "quiesced" | "timeout"
    ActiveFlows int    `json:"active_flows"`
}
```

Si `Status != "quiesced"`, Metamorph retorna `failed` en phase `"signal_pre"` sin
proceder al swap. Salteado completamente si `forceSwap == true`.

### `ReloadSite`

Pide a Brain que recargue el site recién swapeado desde disco.

```go
type ReloadResult struct {
    Status  string `json:"status"` // "reloaded" | "error"
    Version string `json:"version"`
    Error   string `json:"error,omitempty"`
}
```

Si `Status != "reloaded"`, Metamorph dispara el rollback (fase 7).

### Implementación en producción

La implementación productiva usa HTTP hacia Brain. La interfaz permite también una
implementación noop para testing.

### Contrato que Brain debe satisfacer (Phase 4)

Brain debe exponer un endpoint HTTP que responda a los dos métodos de la interfaz.
Las respuestas deben ser JSON que deserialice en `QuiesceResult` y `ReloadResult`
con exactamente los campos y valores documentados arriba. Brain no debe extender
los campos con propiedades adicionales que rompan la deserialización Go.

---

## 9. Comando `inspect --ion-recipes`

Registrado bajo la categoría `INSPECTION`. Flags:

| Flag | Tipo | Default | Descripción |
|---|---|---|---|
| `--ion-recipes` | bool | false | Activa la inspección de ion recipes |
| `--show-pending` | bool | false | Muestra sites con status pending |
| `--show-backups` | bool | false | Muestra sites que tienen directorio en `_backup/` |
| `--all` | bool | false | Incluye binarios externos (independiente de ion recipes) |
| `--native` | bool | false | Inspecciona build output en lugar de AppData |

### Flujo de ejecución

```
runInspection()
  ├── InspectAllManagedBinaries()     ← siempre corre
  ├── inspectBootstrap()              ← siempre corre
  ├── inspectVSCodeExtension()        ← siempre corre
  ├── writeMetamorphConfig()          ← persiste InspectionResult (binarios)
  └── [si --ion-recipes]
        resolveIonSitesPath()
        InspectAllIonRecipes()
          └── InspectIonRecipe()      ← por cada directorio no-_ en ionsites/
        → output JSON o tabla (independiente del InspectionResult de binarios)
```

### Output JSON

El resultado de ion recipes se emite como objeto separado del `InspectionResult`
de binarios — son dos outputs JSON distintos al stdout:

```json
{ "ion_recipes": { ...IonRecipesResult... } }
```

No está incluido dentro del `InspectionResult`. Ion recipes **no se persisten**
en `metamorph.json` ni en ningún archivo de config — solo se exponen en el output
del comando.

### Path de resolución

```go
func resolveIonSitesPath(cfg *core.Config) string {
    base := GetBasePath()
    return filepath.Join(base, "bin", "cortex", "ionsites")
}
```

El parámetro `cfg` está declarado en la firma pero no se usa actualmente —
`GetBasePath()` ya respeta `BLOOM_NUCLEUS_HOME`. El parámetro existe para
extensibilidad futura.

---

## 10. Bootstrap pipeline

### `bootstrap-ions.json`

Manifest de ions para el deploy inicial que Conductor Setup ejecuta antes de que
Bartcave esté disponible. Ubicación en el repo: `installer/native/ionpump/`.

```json
{
  "manifest_version": "1.0",
  "type": "ion_recipes",
  "release_channel": "bootstrap",
  "ions": [
    {
      "domain": "github.com",
      "version": "1.0.0",
      "zip_path": "installer/native/ionpump/github.com.ion.zip",
      "download_url": "",
      "sha256": "<hash del ZIP>",
      "files": [
        { "path": "actions/generate_pat.ion", "sha256": "..." },
        { "path": "domain.manifest.json",     "sha256": "..." },
        { "path": "pages/new_token_page.page.ion", "sha256": "..." },
        { "path": "pages/tokens_page.page.ion",    "sha256": "..." },
        { "path": "shared/session_guard.ion",       "sha256": "..." }
      ]
    }
  ]
}
```

Diferencias respecto a un manifest de Bartcave:
- `"download_url"` está vacío — el ZIP ya está en el repo, no se descarga.
- `"zip_path"` es la ruta relativa al repo del ZIP pre-empaquetado.
- El campo raíz es `"ions"` (no `"recipes"` como era en el spec v4).

### `build-bootstrap-ions.py`

Ubicación: `installer/metamorph/scripts/build-bootstrap-ions.py`

El script calcula las rutas relativas al repo usando:

```python
SCRIPT_DIR    = Path(__file__).parent                # .../installer/metamorph/scripts/
REPO_ROOT     = SCRIPT_DIR.parent.parent.parent      # repo root (tres niveles arriba)
IONS_SRC      = REPO_ROOT / "installer" / "ions"    # fuente de los ion sites
INSTALLER_OUT = REPO_ROOT / "installer" / "native" / "ionpump"  # destino de ZIPs
```

Por cada site en `BOOTSTRAP_SITES`:

1. `collect_site_files(site_dir)` — lista todos los archivos bajo `site_dir` en
   orden determinístico (`sorted(rglob("*"))`).
2. Empaqueta en ZIP con `zipfile.ZIP_DEFLATED`. Paths internos usan forward slashes.
3. Calcula SHA-256 del ZIP y de cada archivo individual.
4. Actualiza `bootstrap-ions.json` con los hashes reales, preservando el resto
   del manifest intacto.

El script no valida el contenido de `domain.manifest.json` — solo hashea archivos.
La validación ocurre en `InspectIonRecipe` al momento del deploy.

### Deploy en bootstrap

```bash
metamorph ion-pump reconcile \
    --manifest installer/native/ionpump/bootstrap-ions.json \
    --force-swap
```

`--force-swap` saltea la fase de quiesce (Brain no está corriendo durante
el bootstrap inicial).

---

## 11. Constantes del paquete

Definidas en `ionrecipes.go`:

```go
const (
    domainManifestFile  = "domain.manifest.json"
    ionManifestMaxSize  = 64 * 1024   // 64 KB — cap de seguridad al leer el manifest
    ionSupportedSchema  = "2.0"
    ionMetaDir          = "_meta"
    ionStagingDir       = "_staging"
    ionBackupDir        = "_backup"
    ionVersionsFile     = "versions.json"
    ionQuiesceTimeoutMs = 10_000
)
```

> **Nota:** `ionSupportedSchema` está definida pero `InspectIonRecipe` no
> valida actualmente que `manifest.SchemaVersion == ionSupportedSchema`.
> Ver [sección 12](#12-bugs-conocidos-y-gaps).

---

## 12. Bugs conocidos y gaps

Esta sección documenta las discrepancias encontradas en la auditoría de Mayo 2026,
con su impacto y estado.

### [BUG] `domain.manifest.json` del site `github.com` — formato incorrecto

**Archivo:** `installer/ions/github.com/domain.manifest.json`

**Problema:** El archivo usa el formato v1.x (arrays de strings para `actions`,
`pages`, `shared`; campos `entrypoint` y `triggers` que no existen en el schema
Go). El schema v2.0 requiere objetos con claves:

```json
// Incorrecto (v1.x):
"actions": ["actions/generate_pat.ion"]

// Correcto (v2.0):
"actions": {
  "generate_pat": { "file": "actions/generate_pat.ion", "public": true }
}
```

**Impacto:** Crítico. Si `InspectIonRecipe` o el `IonLoader` de Brain procesan
este archivo, `manifest.Actions` quedará vacío. `entry_actions` tampoco existe
en el formato actual, por lo que el site reportará `healthy` con datos incorrectos
(`PageCount: 0`, `SharedCount: 0`, `EntryActions: nil`). El build script no
detecta el problema porque solo hashea archivos.

**Acción requerida antes de Phase 1 de Brain:** Reescribir
`installer/ions/github.com/domain.manifest.json` al formato v2.0 correcto y
regenerar los hashes con `build-bootstrap-ions.py`.

---

### [GAP] `BasePath`, `TotalSites` y `TotalFlows` no se calculan

**Ubicación:** `InspectAllIonRecipes` en `ionrecipes.go`

**Problema:** Los tres campos existen en `IonRecipesResult` pero no se asignan
dentro de la función. El JSON de output siempre tendrá `"base_path": ""`,
`"total_sites": 0`, `"total_flows": 0`.

**Fix de una línea para `BasePath` y `TotalSites`:**
```go
result.BasePath = ionsitesPath
result.TotalSites = len(result.Recipes)
```

**`TotalFlows`** requiere decisión de diseño: en el schema v2.0 no existe el
concepto de "flow" como entidad contable (era del formato v4 monolítico). Evaluar
si debe eliminarse del struct o representar otra métrica (e.g. suma de
`entry_actions` de todos los sites).

---

### [GAP] `ionSupportedSchema` no se valida en inspección

**Ubicación:** `InspectIonRecipe` en `ionrecipes.go`

**Problema:** La constante `ionSupportedSchema = "2.0"` existe pero no se usa
para validar `manifest.SchemaVersion`. Un paquete con `schema_version: "1.0"`
pasaría como `healthy`.

**Impacto:** Bajo en producción (Metamorph controla el deploy). Alto si un
paquete mal formado llega al filesystem por otro mecanismo.

**Fix sugerido:** Agregar después del unmarshal del manifest:
```go
if manifest.SchemaVersion != ionSupportedSchema {
    return &IonRecipeInfo{Site: ..., Status: "invalid_manifest"}, nil
}
```

---

### [GAP] `--show-pending` silenciosamente roto

**Ubicación:** `printIonRecipesTable` en `inspect.go`

**Problema:** La flag compara `r.Status == "pending"`, pero `IonRecipeInfo.Status`
nunca tiene ese valor — `"pending"` es un status de `VersionEntry` (en
`versions.json`), no de `IonRecipeInfo`. Los valores válidos de
`IonRecipeInfo.Status` son `healthy`, `missing_manifest`, `invalid_manifest`,
`missing_entrypoint`.

**Consecuencia:** `--show-pending` nunca muestra ningún site.

**Fix:** `InspectAllIonRecipes` debe cruzar el resultado de la inspección con
`versions.json` para exponer el status de deploy junto al status de integridad
del site.

---

### [INFO] `resolveIonSitesPath` — parámetro `cfg` no utilizado

**Ubicación:** `inspect.go` línea 551

**Problema:** El parámetro `cfg *core.Config` está declarado pero no se usa.
`GetBasePath()` resuelve el path correctamente sin él.

**Impacto:** Ninguno funcional. Puede generar un warning de linter. El parámetro
existe por extensibilidad futura (override de path por config).

---

*Última actualización: Junio 2026 — Sesión de verificación post-auditoría.*
*Próxima revisión esperada: al completar Phase 4 de Brain (receptor IonPumpClient).*
