# 🧠 Guía Maestra de Implementación: Comandos METAMORPH v1.0

Esta guía define el estándar para crear comandos en **METAMORPH**, el componente de gestión de infraestructura de la organización Bloom.

> **Nota de Autoría**: Esta guía fue construida a partir del análisis directo de `internal/cli/help_renderer.go` y la estructura de paquetes de Metamorph. Los patrones son consistentes con NUCLEUS pero adaptados al módulo `metamorph`. Antes de agregar una categoría nueva, verificar primero `internal/cli/config.go` para conocer las categorías actualmente definidas.

---

## 📋 Índice

1. [Filosofía de Diseño](#1-filosofía-de-diseño)
2. [Sistema de Categorías](#2-sistema-de-categorías)
3. [Anatomía de un Comando](#3-anatomía-de-un-comando)
4. [Sistema de Auto-Registro](#4-sistema-de-auto-registro)
5. [Comandos con Subcomandos](#5-comandos-con-subcomandos)
6. [Integración JSON](#6-integración-json)
7. [Buenas Prácticas](#7-buenas-prácticas)
8. [Troubleshooting](#8-troubleshooting)
9. [Checklist de Desarrollo](#9-checklist-de-desarrollo)
10. [Referencia Rápida: Templates](#10-referencia-rápida-templates)

---

## 1. Filosofía de Diseño

### 1.1 Principios Fundamentales

METAMORPH usa un sistema de **comandos auto-contenidos y auto-descubiertos**, idéntico al de NUCLEUS:

```
✅ CORRECTO: Cada comando es un archivo independiente por dominio
internal/
├── system/
│   ├── info.go              # Contiene comando "info"
│   └── version.go           # Contiene comando "version"
├── inspection/
│   └── inspect.go           # Contiene comandos de inspección
├── ionpump/
│   └── commands.go          # Contiene comandos de ionpump
├── maintenance/
│   └── rollout.go           # Contiene comandos de rollout
└── rollback/
    └── rollback.go          # Contiene comando "rollback"

❌ INCORRECTO: Centralizar todos los comandos en una sola carpeta
internal/
└── commands/
    ├── system.go
    └── all_commands.go      # NO: no agrupar por conveniencia
```

### 1.2 Flujo de Vida de un Comando

```
1. Desarrollador crea "mi_comando.go" en internal/[modulo]/
2. El archivo define init() que llama core.RegisterCommand()
3. main.go importa el paquete: _ "metamorph/internal/[modulo]"
4. Al compilar, init() se ejecuta automáticamente
5. El comando queda registrado en el registry global
6. CLI construye el árbol de comandos dinámicamente
7. help_renderer agrupa por categoría y genera output
```

### 1.3 La Diferencia Clave vs. NUCLEUS

METAMORPH comparte el mismo motor de help (`ModernHelpRenderer`) y el mismo patrón de auto-registro, pero tiene su propio conjunto de **categorías** orientadas a gestión de infraestructura en lugar de gobernanza. El footer del help lo confirma:

```
🧠 Metamorph: Governance Layer for Bloom Organization
```

---

## 2. Sistema de Categorías

### 2.1 Categorías como Metadata

Las categorías **NO** definen la estructura de carpetas. Son **etiquetas** que se asignan en las `Annotations` de cada comando para organizar la ayuda visual.

**⚠️ IMPORTANTE**: La ubicación física del archivo `.go` NO determina la categoría del comando.

> **⚠️ Advertencia**: Las categorías exactas y su orden están definidos en `internal/cli/config.go`. La tabla a continuación es orientativa basada en la estructura de paquetes actual. **Siempre verificar `config.go` antes de usar o agregar una categoría.**

| Categoría (estimada) | Descripción | Paquete de referencia |
|----------------------|-------------|----------------------|
| **`SYSTEM`** | Información base y diagnóstico | `internal/system/` |
| **`INSPECTION`** | Inspección y verificación de estado | `internal/inspection/` |
| **`IONPUMP`** | Operaciones de ion pump y manifests | `internal/ionpump/` |
| **`MAINTENANCE`** | Rollouts y operaciones de mantenimiento | `internal/maintenance/` |
| **`ROLLBACK`** | Operaciones de rollback | `internal/rollback/` |

### 2.2 Configuración Visual de Categorías

El orden y descripción de las categorías en el help se define en `internal/cli/config.go`. Esta es la **fuente de verdad** — si una categoría no aparece ahí, los comandos se verán bajo `OTHER`:

```go
// internal/cli/config.go
func DefaultMetamorphConfig() HelpConfig {
    return HelpConfig{
        AppName:     "METAMORPH",
        AppSubtitle: "...",
        Width:       80,
        CategoryOrder: []string{
            "SYSTEM",
            "INSPECTION",
            "IONPUMP",
            "MAINTENANCE",
            "ROLLBACK",
            // Agregar nuevas categorías aquí
        },
        CategoryDescs: map[string]string{
            "SYSTEM":      "System information and diagnostics",
            "INSPECTION":  "Component inspection and state verification",
            "IONPUMP":     "Ion pump operations and manifests",
            "MAINTENANCE": "Rollout and maintenance operations",
            "ROLLBACK":    "Rollback and recovery operations",
        },
    }
}
```

**Regla de Oro**: Si agregas una nueva categoría, actualiza `CategoryOrder` y `CategoryDescs` en `config.go`.

---

## 3. Anatomía de un Comando

### 3.1 Plantilla de Comando Auto-Contenido

```go
// File: internal/system/version.go
package system

import (
    "metamorph/internal/core"
    "github.com/spf13/cobra"
)

// init se ejecuta automáticamente cuando se importa el paquete
func init() {
    // PASO 1: Registrar el comando en una categoría
    core.RegisterCommand("SYSTEM", createVersionCommand)
}

// PASO 2: Factory function que crea el comando
func createVersionCommand(c *core.Core) *cobra.Command {
    cmd := &cobra.Command{
        // Sintaxis del comando (lo que aparece en el help)
        Use: "version",

        // Descripción corta (aparece en listados y categorías)
        Short: "Display version information",

        // Descripción larga (aparece en --help del comando)
        Long: `Display the current version of Metamorph along with build metadata.

Includes:
- Semantic version number
- Build date and commit hash
- Target platform and architecture`,

        // Validación de argumentos
        Args: cobra.NoArgs,

        // PASO 3: Annotations — OBLIGATORIO para que aparezca en el help
        Annotations: map[string]string{
            "category": "SYSTEM",
            "json_response": `{
  "version": "1.0.0",
  "build_date": "2025-01-15",
  "commit": "abc1234",
  "platform": "linux/amd64"
}`,
        },

        // Ejemplo de uso
        Example: `  metamorph version
  metamorph --json version`,

        // PASO 4: Lógica de ejecución
        Run: func(cmd *cobra.Command, args []string) {
            result := getVersionInfo(c)

            if c.Config.OutputJSON {
                c.OutputJSON(result)
                return
            }

            c.Logger.Info("Version: %s", result.Version)
            c.Logger.Info("Built:   %s", result.BuildDate)
        },
    }

    return cmd
}

// PASO 5: Lógica de negocio separada (testeable)
type VersionInfo struct {
    Version   string `json:"version"`
    BuildDate string `json:"build_date"`
    Commit    string `json:"commit"`
    Platform  string `json:"platform"`
}

func getVersionInfo(c *core.Core) *VersionInfo {
    return &VersionInfo{
        Version:   c.BuildInfo.Version,
        BuildDate: c.BuildInfo.Date,
        Commit:    c.BuildInfo.Commit,
    }
}
```

### 3.2 Elementos Esenciales

| Elemento | Obligatorio | Descripción |
|----------|-------------|-------------|
| `init()` | ✅ Sí | Auto-registra el comando al importarse el paquete |
| `core.RegisterCommand()` | ✅ Sí | Conecta el comando con el registry global |
| Factory function | ✅ Sí | Función que retorna `*cobra.Command` recibiendo `*core.Core` |
| `Use` | ✅ Sí | Define sintaxis y nombre (ej: `"rollback [target]"`) |
| `Short` | ✅ Sí | Descripción de una línea para listados |
| `Run` | ✅ Sí | Lógica de ejecución del comando |
| `Annotations["category"]` | ✅ Sí | Sin esto, el comando cae en `OTHER` o no aparece |
| `Annotations["json_response"]` | ✅ Sí | Documenta el contrato JSON para automatización |
| `Long` | ⚠️ Recomendado | Documentación detallada (aparece en `--help`) |
| `Example` | ⚠️ Recomendado | Casos de uso concretos |
| `Args` | ⚠️ Recomendado | Validación de argumentos |
| Flags | ❌ Opcional | Según necesidad del comando |
| Lógica separada | ⚠️ Recomendado | Para facilitar testing unitario |

### 3.3 Annotations: Por Qué Son Obligatorias

El `help_renderer.go` de Metamorph lee directamente las annotations para construir el help visual y el JSON de metadata:

```go
// En help_renderer.go — el renderer lee category para agrupar
category := cmd.Annotations["category"]
if category == "" {
    category = "OTHER"   // ← Sin annotation, queda en "OTHER"
}

// En help_renderer.go — el renderer muestra json_response en el detalle
if jsonResp, ok := cmd.Annotations["json_response"]; ok && jsonResp != "" {
    r.writeln("    " + Bold.Apply("JSON Response:", r.useColors))
    // ...
}

// En RenderHelpJSON — exporta metadata completa para automatización
item := CommandJSON{
    Category:     cmd.Annotations["category"],
    JSONResponse: cmd.Annotations["json_response"],
    // ...
}
```

**Sin `"category"`**: El comando no aparece en ninguna sección del help organizado.  
**Sin `"json_response"`**: No se muestra el contrato JSON en el help, y falta documentación para consumidores automatizados.

### 3.4 Patrones de Validación de Argumentos

```go
// Sin argumentos
Args: cobra.NoArgs,

// Exactamente N argumentos
Args: cobra.ExactArgs(1),

// Mínimo N argumentos
Args: cobra.MinimumNArgs(1),

// Máximo N argumentos
Args: cobra.MaximumNArgs(2),

// Rango de argumentos
Args: cobra.RangeArgs(1, 3),

// Validación personalizada
Args: func(cmd *cobra.Command, args []string) error {
    if len(args) < 1 {
        return fmt.Errorf("se requiere el nombre del target")
    }
    if !isValidTarget(args[0]) {
        return fmt.Errorf("target inválido: %s", args[0])
    }
    return nil
},
```

### 3.5 ¿Dónde Poner el Archivo?

```
✅ CORRECTO: Por dominio lógico del paquete existente
internal/
├── system/
│   └── diagnostics.go      # Nuevo comando de diagnóstico → paquete system
├── inspection/
│   └── deep_inspect.go     # Nuevo comando de inspección → paquete inspection
└── ionpump/
    └── sync.go             # Nuevo comando de sync → paquete ionpump

❌ INCORRECTO: Por categoría del help o por conveniencia
internal/
└── commands/
    └── diagnostics.go      # NO crear carpeta "commands"
```

**Regla**: Pon el comando donde vive su lógica de dominio, no donde aparece en el help.

---

## 4. Sistema de Auto-Registro

### 4.1 Registry Centralizado

El registro vive en `internal/core/registry.go`. Aunque no podemos confirmar el contenido exacto sin ver el archivo, el patrón compatible con el `help_renderer.go` es:

```go
// internal/core/registry.go
type CommandFactory func(*Core) *cobra.Command

// Registry global: mapa de categoría -> lista de factories
var commandRegistry = make(map[string][]CommandFactory)

// RegisterCommand es llamado por cada comando en su init()
func RegisterCommand(category string, factory CommandFactory) {
    commandRegistry[category] = append(commandRegistry[category], factory)
}

// GetCommands construye todos los comandos registrados
func GetCommands(c *Core) []*cobra.Command {
    var commands []*cobra.Command
    for _, factories := range commandRegistry {
        for _, factory := range factories {
            commands = append(commands, factory(c))
        }
    }
    return commands
}
```

### 4.2 Proceso de Descubrimiento

```
COMPILACIÓN:
1. main.go importa paquetes con comandos
   _ "metamorph/internal/system"      ← Importa system/version.go, system/info.go
   _ "metamorph/internal/inspection"  ← Importa inspection/inspect.go, etc.
   _ "metamorph/internal/ionpump"     ← Importa ionpump/commands.go, etc.
   _ "metamorph/internal/maintenance" ← Importa maintenance/rollout.go, etc.
   _ "metamorph/internal/rollback"    ← Importa rollback/rollback.go

2. Go ejecuta init() de cada archivo importado
   system/version.go    → init() → core.RegisterCommand("SYSTEM", ...)
   inspection/inspect.go → init() → core.RegisterCommand("INSPECTION", ...)
   ionpump/commands.go  → init() → core.RegisterCommand("IONPUMP", ...)

3. Registry global contiene todas las factories agrupadas por categoría

RUNTIME:
4. CLI llama GetCommands(core) → construye todos los cobra.Command
5. help_renderer agrupa por categoría usando Annotations["category"]
6. Se genera el output visual organizado
```

### 4.3 Activación de un Nuevo Comando

**PASO 1**: Crear el archivo del comando en el paquete correspondiente

```go
// internal/inspection/verify_manifest.go
package inspection

import (
    "metamorph/internal/core"
    "github.com/spf13/cobra"
)

func init() {
    core.RegisterCommand("INSPECTION", createVerifyManifestCommand)
}

func createVerifyManifestCommand(c *core.Core) *cobra.Command {
    return &cobra.Command{
        Use:   "verify-manifest [path]",
        Short: "Verify integrity of a component manifest",
        Args:  cobra.MaximumNArgs(1),
        Annotations: map[string]string{
            "category": "INSPECTION",
            "json_response": `{
  "valid": true,
  "path": "/path/to/manifest.json",
  "errors": []
}`,
        },
        Example: `  metamorph verify-manifest
  metamorph verify-manifest ./manifest.json
  metamorph --json verify-manifest ./manifest.json`,
        Run: func(cmd *cobra.Command, args []string) {
            // lógica...
        },
    }
}
```

**PASO 2**: Verificar que el paquete ya está importado en `main.go`

Si el comando vive en un paquete **ya existente** (ej: `inspection`), el import ciego ya está presente y no hay nada que hacer.

Si el comando vive en un **paquete nuevo**, agregar el import ciego:

```go
// main.go
package main

import (
    "metamorph/internal/core"
    "metamorph/internal/cli"
    
    // IMPORTS CIEGOS: Solo para ejecutar init() de cada paquete
    _ "metamorph/internal/system"
    _ "metamorph/internal/inspection"
    _ "metamorph/internal/ionpump"
    _ "metamorph/internal/maintenance"
    _ "metamorph/internal/rollback"
    _ "metamorph/internal/mi_nuevo_paquete"  // ← agregar si es nuevo
)

func main() {
    c := core.NewCore()
    commands := core.GetCommands(c)
    rootCmd := cli.BuildRootCommand(c, commands)
    
    if err := rootCmd.Execute(); err != nil {
        os.Exit(1)
    }
}
```

**PASO 3**: Compilar y verificar

```bash
go build -o metamorph
./metamorph help                 # El nuevo comando aparece en su categoría
./metamorph verify-manifest --help  # Muestra Long + flags + Example
./metamorph --json help          # Muestra metadata completa en JSON
```

**⚠️ CRÍTICO**: Si creas un comando en un paquete **nuevo**, debes agregar el import ciego en `main.go`. Sin ese import, Go no ejecutará el `init()` y el comando nunca se registrará.

---

## 5. Comandos con Subcomandos

El `help_renderer.go` de Metamorph tiene soporte explícito para subcomandos: muestra una tabla de subcomandos y luego despliega los detalles completos de cada uno (uso, flags, ejemplo, json_response).

### 5.1 Reglas para Comandos con Subcomandos

1. ✅ **SOLO registrar el comando padre** en `init()`
2. ✅ **Annotation `category` en el padre** para que aparezca en el help
3. ✅ **Annotations completas en CADA subcomando** (`category` + `json_response`)
4. ✅ **`Example` en CADA subcomando** mostrando el uso completo con el padre
5. ❌ **NO registrar subcomandos** individualmente en `init()`

### 5.2 Ejemplo: Comando ionpump con Subcomandos

```go
// internal/ionpump/commands.go
package ionpump

import (
    "metamorph/internal/core"
    "github.com/spf13/cobra"
)

// Solo el padre se registra
func init() {
    core.RegisterCommand("IONPUMP", createIonpumpCommand)
}

func createIonpumpCommand(c *core.Core) *cobra.Command {
    cmd := &cobra.Command{
        Use:   "ionpump",
        Short: "Manage ion pump operations",
        
        // El padre necesita category pero NO necesita json_response
        Annotations: map[string]string{
            "category": "IONPUMP",
        },
    }
    
    // Agregar subcomandos
    cmd.AddCommand(createIonpumpListCommand(c))
    cmd.AddCommand(createIonpumpReconcileCommand(c))
    cmd.AddCommand(createIonpumpStatusCommand(c))
    
    return cmd
}

func createIonpumpListCommand(c *core.Core) *cobra.Command {
    return &cobra.Command{
        Use:   "list",
        Short: "List all ion pump instances",
        Args:  cobra.NoArgs,
        
        // Cada subcomando necesita sus propias annotations
        Annotations: map[string]string{
            "category": "IONPUMP",
            "json_response": `{
  "instances": [
    {"id": "ion-001", "status": "running"},
    {"id": "ion-002", "status": "stopped"}
  ],
  "total": 2
}`,
        },
        
        // Example con el path completo: padre + subcomando
        Example: `  metamorph ionpump list
  metamorph --json ionpump list`,
        
        Run: func(cmd *cobra.Command, args []string) {
            // lógica...
        },
    }
}

func createIonpumpReconcileCommand(c *core.Core) *cobra.Command {
    var dryRun bool
    
    cmd := &cobra.Command{
        Use:   "reconcile [target]",
        Short: "Reconcile ion pump state with desired configuration",
        Args:  cobra.MaximumNArgs(1),
        
        Annotations: map[string]string{
            "category": "IONPUMP",
            "json_response": `{
  "reconciled": true,
  "target": "all",
  "changes_applied": 3,
  "dry_run": false
}`,
        },
        
        Example: `  metamorph ionpump reconcile
  metamorph ionpump reconcile ion-001
  metamorph ionpump reconcile --dry-run
  metamorph --json ionpump reconcile`,
        
        Run: func(cmd *cobra.Command, args []string) {
            // lógica...
        },
    }
    
    cmd.Flags().BoolVar(&dryRun, "dry-run", false, "Preview changes without applying them")
    
    return cmd
}

func createIonpumpStatusCommand(c *core.Core) *cobra.Command {
    return &cobra.Command{
        Use:   "status",
        Short: "Show current status of ion pump",
        Args:  cobra.NoArgs,
        
        Annotations: map[string]string{
            "category": "IONPUMP",
            "json_response": `{
  "operational": true,
  "state": "RUNNING",
  "uptime_seconds": 3600
}`,
        },
        
        Example: `  metamorph ionpump status
  metamorph --json ionpump status`,
        
        Run: func(cmd *cobra.Command, args []string) {
            // lógica...
        },
    }
}
```

### 5.3 Cómo Renderiza el Help los Subcomandos

Dado el código del `help_renderer.go`, los subcomandos se muestran así:

```
▸ IONPUMP
    Manage ion pump operations

    Usage: metamorph ionpump

    Subcommands:
      list                  List all ion pump instances
        metamorph ionpump list
      reconcile             Reconcile ion pump state with desired configuration
        metamorph ionpump reconcile [target]
      status                Show current status of ion pump
        metamorph ionpump status

    Subcommand Details:

      └─ LIST
        List all ion pump instances
        ...

      └─ RECONCILE
        Reconcile ion pump state with desired configuration
        ...
```

---

## 6. Integración JSON

### 6.1 Modo JSON para Automatización

Metamorph soporta salida JSON para automatización e integración con otros sistemas:

```bash
metamorph --json version
metamorph --json ionpump status
metamorph --json inspect [target]
```

### 6.2 Implementación de JSON Output en un Comando

```go
Run: func(cmd *cobra.Command, args []string) {
    result, err := doWork(c, args)
    if err != nil {
        c.Logger.Error("❌ Error: %v", err)
        return
    }
    
    // ✅ SIEMPRE verificar primero el flag JSON
    if c.Config.OutputJSON {
        c.OutputJSON(result)
        return   // ← IMPORTANTE: return después de JSON output
    }
    
    // Output humano legible
    c.Logger.Success("✅ Operación completada")
    c.Logger.Info("   Resultado: %v", result)
},
```

### 6.3 Exportar Metadata de Todos los Comandos

Para obtener la estructura completa de comandos en JSON (útil para documentación o integración):

```bash
metamorph --json help
```

Esto genera un JSON con todos los comandos registrados, incluyendo nombre, uso, argumentos, flags y el `json_response` de ejemplo definido en las `Annotations`.

---

## 7. Buenas Prácticas

### 7.1 Separar Lógica de Negocio del Comando Cobra

```go
// ✅ CORRECTO: Lógica separada, testeable
func createRollbackCommand(c *core.Core) *cobra.Command {
    return &cobra.Command{
        Use: "rollback [target]",
        Run: func(cmd *cobra.Command, args []string) {
            result, err := executeRollback(c, args[0])  // ← función separada
            // ...
        },
    }
}

// Función testeable independientemente de Cobra
func executeRollback(c *core.Core, target string) (*RollbackResult, error) {
    // toda la lógica aquí
}

// ❌ INCORRECTO: Toda la lógica dentro del Run
Run: func(cmd *cobra.Command, args []string) {
    // 100 líneas de código aquí — no testeable
},
```

### 7.2 Documentar el Contrato JSON con Precisión

El `json_response` en Annotations **no es decorativo**: es el contrato que documenta qué retorna el comando con `--json`. Debe reflejar la estructura real:

```go
// ✅ CORRECTO: Refleja la estructura real del output
Annotations: map[string]string{
    "json_response": `{
  "success": true,
  "target": "component-name",
  "previous_version": "1.2.0",
  "rolled_back_to": "1.1.0",
  "duration_ms": 1200
}`,
},

// ❌ INCORRECTO: Genérico e inútil
Annotations: map[string]string{
    "json_response": `{"status": "ok"}`,
},
```

### 7.3 Argumentos en `Use` con Sintaxis Clara

El `help_renderer.go` parsea el campo `Use` para extraer y mostrar argumentos:

```go
// Argumento requerido: sin corchetes
Use: "rollback target",         // target es required

// Argumento opcional: con corchetes
Use: "inspect [component]",     // component es optional

// Múltiples argumentos
Use: "deploy target [version]", // target required, version optional
```

### 7.4 Examples Completos y Reales

```go
// ✅ CORRECTO: Muestra casos de uso reales
Example: `  metamorph rollback my-component
  metamorph rollback my-component --to v1.2.0
  metamorph --json rollback my-component`,

// ❌ INCORRECTO: Demasiado genérico
Example: `  metamorph rollback [args]`,
```

---

## 8. Troubleshooting

### 8.1 "Mi comando no aparece en el help"

**Causas posibles:**

1. El paquete no está importado en `main.go`
2. La función `init()` no se está ejecutando
3. La categoría no existe en `internal/cli/config.go`
4. La annotation `"category"` está mal escrita o en minúsculas

**Diagnóstico:**

```bash
# Verificar que el paquete está importado en main.go
grep "metamorph/internal/mipaquete" main.go

# Verificar que la categoría existe en config.go
grep "MI_CATEGORIA" internal/cli/config.go

# Compilar con verbose para ver qué se compila
go build -v ./...

# Ver todos los comandos registrados
./metamorph help
```

### 8.2 "El comando aparece en `OTHER` en vez de su categoría"

**Causa:** La annotation `"category"` está ausente o la categoría no está en `CategoryOrder` del `config.go`.

El renderer asigna `"OTHER"` cuando:
```go
category := cmd.Annotations["category"]
if category == "" {
    category = "OTHER"
}
```

**Solución:**
```go
// 1. Verificar que la annotation está presente en el comando
Annotations: map[string]string{
    "category": "INSPECTION",  // ← Debe existir y coincidir exactamente con config.go
},

// 2. Verificar que la categoría está en config.go
CategoryOrder: []string{
    "INSPECTION",  // ← Debe estar aquí
},
```

### 8.3 "Error: unknown command"

**Causa:** El comando se registró pero algo falla en la construcción del árbol Cobra.

**Solución:**

```go
// Verificar que el factory retorna un comando válido (no nil)
func createMiComando(c *core.Core) *cobra.Command {
    cmd := &cobra.Command{
        Use: "micomando",  // ← Debe estar presente
        Short: "...",      // ← Debe estar presente
        Run: func(cmd *cobra.Command, args []string) {
            // ...
        },
    }
    return cmd  // ← No retornar nil
}
```

### 8.4 "El JSON output no funciona"

**Causa:** No se verifica `c.Config.OutputJSON` antes de imprimir.

```go
// ✅ CORRECTO
Run: func(cmd *cobra.Command, args []string) {
    result := doSomething()
    
    if c.Config.OutputJSON {
        c.OutputJSON(result)
        return  // ← IMPORTANTE: return para no imprimir output humano también
    }
    
    c.Logger.Success("✅ Done")
},
```

### 8.5 "Los subcomandos no se muestran en el help"

**Causa:** Los subcomandos no tienen la annotation `"category"`.

El `help_renderer.go` usa `cmd.Annotations["category"]` tanto para comandos padre como para subcomandos cuando genera el detalle. Asegurarse de que **cada subcomando** tenga sus propias annotations.

---

## 9. Checklist de Desarrollo

Antes de considerar un comando listo, verificar:

**Estructura**
- [ ] El archivo vive en el paquete de dominio correcto dentro de `internal/`
- [ ] El paquete tiene una función `init()` que llama `core.RegisterCommand()`
- [ ] Existe una factory function que retorna `*cobra.Command`

**Cobra Command**
- [ ] `Use` define correctamente la sintaxis con argumentos `[opcionales]` o `requeridos`
- [ ] `Short` tiene una descripción de una línea clara
- [ ] `Long` documenta el comportamiento detallado
- [ ] `Args` valida la cantidad de argumentos
- [ ] `Example` muestra al menos 2-3 casos de uso reales

**Annotations**
- [ ] `"category"` está definido y coincide exactamente con una categoría en `config.go`
- [ ] `"json_response"` refleja la estructura real de la respuesta JSON

**Lógica**
- [ ] El `Run` verifica `c.Config.OutputJSON` antes de cualquier output
- [ ] Después de `c.OutputJSON(...)` hay un `return`
- [ ] La lógica pesada está en funciones separadas (no directamente en `Run`)

**Integración**
- [ ] Si el paquete es nuevo, está importado en `main.go` con import ciego
- [ ] La categoría está en `CategoryOrder` y `CategoryDescs` de `config.go`
- [ ] `go build ./...` compila sin errores
- [ ] `./metamorph help` muestra el nuevo comando en la categoría correcta
- [ ] `./metamorph [comando] --help` muestra la documentación completa
- [ ] `./metamorph --json [comando]` retorna JSON válido

---

## 10. Referencia Rápida: Templates

### Comando Simple

```go
package mipaquete

import (
    "metamorph/internal/core"
    "github.com/spf13/cobra"
)

func init() {
    core.RegisterCommand("MI_CATEGORIA", createMiComando)
}

func createMiComando(c *core.Core) *cobra.Command {
    return &cobra.Command{
        Use:   "micomando [arg-opcional]",
        Short: "Descripción breve del comando",
        Long:  "Descripción detallada de lo que hace el comando.",
        Args:  cobra.MaximumNArgs(1),
        
        Annotations: map[string]string{
            "category": "MI_CATEGORIA",
            "json_response": `{
  "success": true,
  "result": "example"
}`,
        },
        
        Example: `  metamorph micomando
  metamorph micomando mi-arg
  metamorph --json micomando`,
        
        Run: func(cmd *cobra.Command, args []string) {
            result := doWork(c, args)
            
            if c.Config.OutputJSON {
                c.OutputJSON(result)
                return
            }
            
            c.Logger.Success("✅ Completado")
        },
    }
}

func doWork(c *core.Core, args []string) interface{} {
    return map[string]interface{}{"success": true}
}
```

### Comando con Flags

```go
func createMiComandoConFlags(c *core.Core) *cobra.Command {
    var force bool
    var target string
    
    cmd := &cobra.Command{
        Use:   "deploy component",
        Short: "Deploy a component to the environment",
        Args:  cobra.ExactArgs(1),
        
        Annotations: map[string]string{
            "category": "MAINTENANCE",
            "json_response": `{
  "deployed": true,
  "component": "my-component",
  "force": false
}`,
        },
        
        Example: `  metamorph deploy my-component
  metamorph deploy my-component --force
  metamorph deploy my-component --target staging
  metamorph --json deploy my-component`,
        
        Run: func(cmd *cobra.Command, args []string) {
            component := args[0]
            result := deployComponent(c, component, target, force)
            
            if c.Config.OutputJSON {
                c.OutputJSON(result)
                return
            }
            
            c.Logger.Success("✅ Deployed: %s", component)
        },
    }
    
    cmd.Flags().BoolVarP(&force, "force", "f", false, "Force deployment even if already running")
    cmd.Flags().StringVarP(&target, "target", "t", "production", "Target environment")
    
    return cmd
}
```

### Comando con Subcomandos

```go
package mipaquete

import (
    "metamorph/internal/core"
    "github.com/spf13/cobra"
)

// Solo el padre en init()
func init() {
    core.RegisterCommand("MI_CATEGORIA", createPadreCommand)
}

func createPadreCommand(c *core.Core) *cobra.Command {
    cmd := &cobra.Command{
        Use:   "padre",
        Short: "Comando padre con subcomandos",
        
        Annotations: map[string]string{
            "category": "MI_CATEGORIA",
            // El padre no necesita json_response si no tiene Run propio
        },
    }
    
    cmd.AddCommand(createSubUno(c))
    cmd.AddCommand(createSubDos(c))
    
    return cmd
}

func createSubUno(c *core.Core) *cobra.Command {
    return &cobra.Command{
        Use:   "sub-uno",
        Short: "Primer subcomando",
        Args:  cobra.NoArgs,
        
        Annotations: map[string]string{
            "category": "MI_CATEGORIA",
            "json_response": `{"success": true, "action": "sub-uno"}`,
        },
        
        Example: `  metamorph padre sub-uno
  metamorph --json padre sub-uno`,
        
        Run: func(cmd *cobra.Command, args []string) {
            // lógica...
        },
    }
}

func createSubDos(c *core.Core) *cobra.Command {
    return &cobra.Command{
        Use:   "sub-dos [target]",
        Short: "Segundo subcomando",
        Args:  cobra.MaximumNArgs(1),
        
        Annotations: map[string]string{
            "category": "MI_CATEGORIA",
            "json_response": `{"success": true, "action": "sub-dos", "target": "default"}`,
        },
        
        Example: `  metamorph padre sub-dos
  metamorph padre sub-dos mi-target
  metamorph --json padre sub-dos`,
        
        Run: func(cmd *cobra.Command, args []string) {
            // lógica...
        },
    }
}
```

---

## 📚 Recursos Adicionales

- **Cobra**: https://github.com/spf13/cobra
- **pflag**: https://github.com/spf13/pflag
- **Go init()**: https://go.dev/doc/effective_go#init

```bash
# Comandos útiles durante desarrollo
./metamorph help                         # Ver todos los comandos
./metamorph --json help                  # Metadata completa en JSON
./metamorph [comando] --help             # Ayuda de un comando específico
./metamorph --verbose [comando]          # Modo verbose
go build -v ./... && ./metamorph help    # Compilar y verificar
```

---

## 📝 Notas Finales

1. **Verificar `config.go` primero**: Antes de crear una categoría nueva, revisar `internal/cli/config.go` para conocer las categorías actuales y su orden.

2. **Un comando = un archivo**: Cada comando debería ser auto-contenido. Usar un archivo de `commands.go` en el paquete solo cuando los comandos están fuertemente acoplados entre sí.

3. **La ubicación no importa para el help**: El comando aparece en la categoría definida en `Annotations`, no en la carpeta donde vive.

4. **Annotations son el contrato**: `"category"` y `"json_response"` son leídos directamente por `help_renderer.go`. Sin ellos, el comando no funciona bien.

5. **Subcomandos**: Solo el padre se registra en `init()`. Cada subcomando necesita sus propias `Annotations` completas para que el renderer los muestre correctamente.

6. **JSON siempre**: Todo comando debe funcionar con `--json`. Verificar `c.Config.OutputJSON` en el `Run`.

7. **Import ciego en main.go**: Si el paquete es nuevo, agregar `_ "metamorph/internal/[paquete]"` en `main.go`. Sin esto, el `init()` nunca se ejecuta.

---

**Versión**: 1.0  
**Última actualización**: Junio 2025  
**Arquitectura**: Auto-Discovery con Init Functions  
**Basado en**: Análisis de `internal/cli/help_renderer.go` + estructura de paquetes Metamorph  
**Mantenedor**: Equipo Bloom Core
