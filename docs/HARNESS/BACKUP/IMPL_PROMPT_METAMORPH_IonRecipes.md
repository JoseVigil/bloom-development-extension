# PROMPT DE IMPLEMENTACIÓN — Metamorph
## Ion Recipes Inspection + Reconciliation
### Referencia: BLOOM_HARNESS_IONPUMP_INTEGRATION_MASTER.md · v1.0

---

## Contexto para el implementador

Metamorph agrega soporte para inspeccionar y reconciliar `.ion` recipes. Es la única pieza del ecosistema que **escribe** en `ionsites/`. Brain (IonPump) solo lee. Sentinel no toca `ionsites/`.

**Principio:** Metamorph trata los `.ion` recipes como un tipo más de artefacto gestionado — igual que los binarios. El proceso es: inspect → compare → download staging → validate → swap atómico.

**Documentos de referencia:**
- `BLOOM_HARNESS_IONPUMP_INTEGRATION_MASTER.md` — arquitectura completa
- `METAMORPH-INSPECTION-IMPLEMENTATION-PROMPT.md` — patrón existente de inspect (seguirlo)
- `IONPUMP_IMPLEMENTATION_PROMPT_Complete_Specification.md` — spec de IonPump

---

## Alcance para milestone GitHub

Para el milestone GitHub Onboarding, Metamorph necesita:

1. **`metamorph inspect --ion-recipes`** — lista los ion recipes instalados
2. **Formato de manifest para `.ion` files** — para que `metamorph reconcile` pueda operar
3. **`ionrecipes.go`** — implementación del inspect de ion recipes

El ciclo completo de reconciliación de ion recipes (download + swap) puede implementarse en la fase siguiente si el milestone GitHub no lo requiere end-to-end. Lo que sí se requiere para el milestone es que Metamorph pueda **leer e inspeccionar** el estado actual de los recipes.

---

## 1. Estructura de archivos

```
installer/metamorph/internal/inspection/
├── types.go          ← existente — agregar IonRecipeInfo, IonRecipesResult
├── inspect.go        ← existente — agregar flag --ion-recipes
├── managed.go        ← existente — sin cambios
├── external.go       ← existente — sin cambios
├── utils.go          ← existente — sin cambios
└── ionrecipes.go     ← NUEVO
```

---

## 2. Data structures — agregar a types.go

```go
// types.go — agregar junto a las estructuras existentes de ManagedBinary/ExternalBinary

// IonRecipeInfo representa un ion recipe instalado.
type IonRecipeInfo struct {
    Site          string `json:"site"`
    Version       string `json:"version"`
    Description   string `json:"description"`
    Entrypoint    string `json:"entrypoint"`
    FlowCount     int    `json:"flow_count"`
    Capabilities  []string `json:"capabilities"`
    SizeBytes     int64  `json:"size_bytes"`
    LastModified  string `json:"last_modified"`
    Status        string `json:"status"`    // "healthy", "missing", "corrupted"
    ManifestHash  string `json:"manifest_hash"`
}

// IonRecipesResult es el resultado de inspeccionar todos los ion recipes.
type IonRecipesResult struct {
    Recipes   []IonRecipeInfo `json:"recipes"`
    BasePath  string          `json:"base_path"`
    TotalSites int            `json:"total_sites"`
    TotalFlows int            `json:"total_flows"`
    Timestamp string          `json:"timestamp"`
}
```

---

## 3. ionrecipes.go — implementación completa

```go
package inspection

import (
    "encoding/json"
    "fmt"
    "os"
    "path/filepath"
    "strings"
    "time"
)

// InspectIonRecipe inspecciona un ion recipe individual dado su directorio.
func InspectIonRecipe(siteDir string) (*IonRecipeInfo, error) {
    site := filepath.Base(siteDir)
    
    // Ignorar _meta/ y otros directorios especiales
    if strings.HasPrefix(site, "_") {
        return nil, nil
    }
    
    info := &IonRecipeInfo{
        Site:   site,
        Status: "missing",
    }
    
    // Leer ion.manifest.json
    manifestPath := filepath.Join(siteDir, "ion.manifest.json")
    manifestData, err := os.ReadFile(manifestPath)
    if err != nil {
        if os.IsNotExist(err) {
            return info, nil // status: missing
        }
        info.Status = "corrupted"
        return info, nil
    }
    
    // Parse manifest
    var manifest struct {
        Site        string   `json:"site"`
        Version     string   `json:"version"`
        Description string   `json:"description"`
        Entrypoint  string   `json:"entrypoint"`
        Flows       []string `json:"flows"`
        Capabilities []string `json:"capabilities"`
    }
    if err := json.Unmarshal(manifestData, &manifest); err != nil {
        info.Status = "corrupted"
        return info, nil
    }
    
    info.Version = manifest.Version
    info.Description = manifest.Description
    info.Entrypoint = manifest.Entrypoint
    info.FlowCount = len(manifest.Flows)
    info.Capabilities = manifest.Capabilities
    info.ManifestHash, _ = CalculateSHA256(manifestPath)
    
    // Verificar que el entrypoint existe
    entrypointPath := filepath.Join(siteDir, manifest.Entrypoint)
    if _, err := os.Stat(entrypointPath); os.IsNotExist(err) {
        info.Status = "corrupted"
        return info, nil
    }
    
    // Calcular tamaño total del directorio
    info.SizeBytes = calculateDirSize(siteDir)
    
    // Timestamp del manifest
    if stat, err := os.Stat(manifestPath); err == nil {
        info.LastModified = stat.ModTime().UTC().Format(time.RFC3339)
    }
    
    info.Status = "healthy"
    return info, nil
}

// InspectAllIonRecipes inspecciona todos los ion recipes en el directorio ionsites/.
func InspectAllIonRecipes(ionsitesPath string) (*IonRecipesResult, error) {
    result := &IonRecipesResult{
        BasePath:  ionsitesPath,
        Timestamp: time.Now().UTC().Format(time.RFC3339),
    }
    
    // Verificar que el directorio existe
    if _, err := os.Stat(ionsitesPath); os.IsNotExist(err) {
        return result, fmt.Errorf("ionsites directory not found: %s", ionsitesPath)
    }
    
    // Listar subdirectorios
    entries, err := os.ReadDir(ionsitesPath)
    if err != nil {
        return result, fmt.Errorf("reading ionsites directory: %w", err)
    }
    
    for _, entry := range entries {
        if !entry.IsDir() {
            continue
        }
        
        siteDir := filepath.Join(ionsitesPath, entry.Name())
        info, err := InspectIonRecipe(siteDir)
        if err != nil {
            // Log error but continue — mismo patrón que managed/external binaries
            fmt.Fprintf(os.Stderr, "warning: inspecting %s: %v\n", entry.Name(), err)
            continue
        }
        if info == nil {
            continue // directorio especial (_meta, etc.)
        }
        
        result.Recipes = append(result.Recipes, *info)
        result.TotalSites++
        result.TotalFlows += info.FlowCount
    }
    
    return result, nil
}

// calculateDirSize calcula el tamaño total de un directorio en bytes.
func calculateDirSize(path string) int64 {
    var size int64
    filepath.Walk(path, func(_ string, info os.FileInfo, err error) error {
        if err != nil || info.IsDir() {
            return nil
        }
        size += info.Size()
        return nil
    })
    return size
}
```

---

## 4. Actualización de inspect.go — agregar flag --ion-recipes

```go
// inspect.go — agregar el flag y la lógica al comando existente

func createInspectCommand(c *core.Core) *cobra.Command {
    cmd := &cobra.Command{
        Use:   "inspect",
        Short: "Inspect all binaries and show detailed info",
        Run: func(cmd *cobra.Command, args []string) {
            includeExternal, _ := cmd.Flags().GetBool("all")
            includeIonRecipes, _ := cmd.Flags().GetBool("ion-recipes")  // NUEVO

            // ... lógica existente de managed/external ...

            // NUEVO: inspeccionar ion recipes si se pidió
            if includeIonRecipes {
                ionsitesPath := resolveIonSitesPath(c.Config)
                ionResult, err := InspectAllIonRecipes(ionsitesPath)
                if err != nil {
                    fmt.Fprintf(os.Stderr, "warning: ion recipes inspection: %v\n", err)
                } else {
                    if c.Config.OutputJSON {
                        // Incluir en el JSON completo
                        c.OutputJSON(map[string]interface{}{
                            "managed_binaries":  managed,
                            "external_binaries": external,
                            "ion_recipes":       ionResult,
                        })
                    } else {
                        printIonRecipesTable(ionResult)
                    }
                }
            }
        },
    }

    cmd.Flags().BoolP("all", "a", false, "Include external binaries")
    cmd.Flags().Bool("ion-recipes", false, "Inspect ion automation recipes")  // NUEVO
    
    return cmd
}

// resolveIonSitesPath determina la ruta a ionsites/ basada en config.
func resolveIonSitesPath(cfg *config.Config) string {
    // BloomNucleus/bin/cortex/ionsites/
    base := resolveBasePath(cfg)  // usa la misma lógica que para binarios
    return filepath.Join(base, "cortex", "ionsites")
}

// printIonRecipesTable formatea la salida de ion recipes como tabla.
func printIonRecipesTable(result *IonRecipesResult) {
    fmt.Printf("\nIon Automation Recipes\n")
    fmt.Printf("Base: %s\n", result.BasePath)
    fmt.Println(strings.Repeat("─", 70))
    
    for _, recipe := range result.Recipes {
        status := "✓ Healthy"
        if recipe.Status == "missing" {
            status = "✗ Missing"
        } else if recipe.Status == "corrupted" {
            status = "⚠ Corrupted"
        }
        
        size := FormatSize(recipe.SizeBytes)
        fmt.Printf("%-20s v%-10s %2d flows  %8s  %s\n",
            recipe.Site,
            recipe.Version,
            recipe.FlowCount,
            size,
            status,
        )
    }
    
    fmt.Println(strings.Repeat("─", 70))
    fmt.Printf("Total: %d sites, %d flows\n", result.TotalSites, result.TotalFlows)
}
```

---

## 5. Formato de manifest para reconciliación de ion recipes

Cuando Nucleus decide actualizar los ion recipes, envía a Metamorph un manifest con esta estructura (extensión del manifest de binarios existente):

```json
{
  "manifest_version": "1.1",
  "system_version": "2.5.0",
  "release_channel": "stable",
  "artifacts": [
    {
      "name": "brain",
      "binary": "brain.exe",
      "version": "2.5.0",
      "sha256": "abc123...",
      "channel": "stable"
    }
  ],
  "ion_recipes": [
    {
      "site": "github.com",
      "version": "1.1.0",
      "sha256_manifest": "def456...",
      "sha256_archive": "ghi789...",
      "download_url": "https://batcave.internal/recipes/github.com-1.1.0.tar.gz",
      "files": [
        { "path": "ion.manifest.json", "sha256": "..." },
        { "path": "auth.ion",          "sha256": "..." }
      ]
    }
  ]
}
```

**Campos de ion_recipes:**
- `site` — identificador del ion (coincide con nombre de directorio)
- `version` — versión nueva del recipe
- `sha256_manifest` — hash de `ion.manifest.json` para verificación rápida
- `sha256_archive` — hash del archivo `.tar.gz` del recipe completo
- `download_url` — URL de descarga (solo accesible desde Nucleus, no desde internet público)
- `files` — lista de archivos individuales con sus hashes para verificación post-swap

**Proceso de reconciliación (Fase siguiente al milestone GitHub):**

```
1. Metamorph recibe manifest con ion_recipes
2. Para cada ion recipe:
   a. Compara version actual (inspect) vs version en manifest
   b. Si son iguales: skip
   c. Si difieren:
      i.  Descarga archive a staging/
      ii. Verifica sha256_archive
      iii. Extrae a staging/{site}/
      iv. Verifica hashes individuales de cada archivo
      v.  Swap atómico: mueve ionsites/{site}/ a ionsites/{site}.bak/
      vi. Mueve staging/{site}/ a ionsites/{site}/
      vii. IonPump watchdog detecta cambio, recarga con validación
      viii. Si IonPump reporta error: restaura desde .bak/
3. Reporta resultado a Nucleus
```

---

## 6. Comandos CLI — output esperado

```bash
# Inspeccionar ion recipes instalados
metamorph inspect --ion-recipes
```

```
Ion Automation Recipes
Base: C:\Users\user\AppData\Local\BloomNucleus\bin\cortex\ionsites
──────────────────────────────────────────────────────────────────────
github.com           v1.0.0      3 flows     4.2 KB  ✓ Healthy
claude.ai            v1.2.0      5 flows    12.1 KB  ✓ Healthy
chatgpt.com          v1.1.0      4 flows     8.7 KB  ✓ Healthy
──────────────────────────────────────────────────────────────────────
Total: 3 sites, 12 flows
```

```bash
# JSON output
metamorph --json inspect --ion-recipes
```

```json
{
  "ion_recipes": {
    "base_path": "C:\\Users\\user\\AppData\\Local\\BloomNucleus\\bin\\cortex\\ionsites",
    "recipes": [
      {
        "site": "github.com",
        "version": "1.0.0",
        "description": "GitHub PAT authentication flow for Bloom onboarding",
        "entrypoint": "auth.ion",
        "flow_count": 3,
        "capabilities": ["auth", "clipboard_monitor"],
        "size_bytes": 4300,
        "last_modified": "2026-04-01T00:00:00Z",
        "status": "healthy",
        "manifest_hash": "sha256_abc123..."
      }
    ],
    "total_sites": 1,
    "total_flows": 3,
    "timestamp": "2026-04-01T12:00:00Z"
  }
}
```

```bash
# Combinado: binarios + ion recipes
metamorph inspect --all --ion-recipes
metamorph --json inspect --all --ion-recipes
```

---

## 7. Checklist de implementación — Metamorph

- [ ] `IonRecipeInfo` y `IonRecipesResult` agregados a `types.go`
- [ ] `ionrecipes.go` implementado: `InspectIonRecipe`, `InspectAllIonRecipes`
- [ ] `calculateDirSize()` helper en `ionrecipes.go` (o mover a `utils.go`)
- [ ] Flag `--ion-recipes` agregado al comando `inspect` en `inspect.go`
- [ ] `resolveIonSitesPath()` implementado (extiende el path resolver existente)
- [ ] `printIonRecipesTable()` formatea output consistente con el estilo de `inspect`
- [ ] JSON output incluye `ion_recipes` cuando se usa `--ion-recipes`
- [ ] `metamorph inspect --ion-recipes` devuelve 0 recipes (no error) si `ionsites/` está vacío
- [ ] `metamorph inspect --ion-recipes` devuelve error informativo si `ionsites/` no existe
- [ ] Formato de manifest de reconciliación documentado (sección 5 de este documento)
- [ ] Implementación de reconciliación marcada como Fase siguiente (no milestone GitHub)

---

## 8. Invariantes que Metamorph debe respetar

1. **Solo Metamorph escribe en `ionsites/`.** Brain (IonPump) solo lee. Si Metamorph detecta que el directorio fue modificado externamente, lo loggea pero no interfiere.

2. **El swap es atómico.** Si el proceso se interrumpe durante el swap, el sistema queda en un estado determinístico (o la versión nueva, o la versión vieja con backup). Nunca en un estado parcial.

3. **Metamorph no ejecuta recipes.** Solo los inspecciona y mueve archivos. No sabe si un recipe es "correcto" semánticamente — solo verifica hashes y syntax básica.

4. **Metamorph no participa del Event Bus.** Es invocado bajo demanda por Nucleus. Cuando termina, reporta el resultado directamente a Nucleus y termina.

---

*Este prompt referencia: BLOOM_HARNESS_IONPUMP_INTEGRATION_MASTER.md*
*Implementar en orden: types.go → ionrecipes.go → inspect.go (flag) → validar output*
*La reconciliación completa de ion recipes es Fase siguiente al milestone GitHub.*
