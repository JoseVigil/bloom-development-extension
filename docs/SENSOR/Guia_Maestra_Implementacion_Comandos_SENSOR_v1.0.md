# 🌱 Guía Maestra de Implementación: Comandos SENSOR v1.0

Esta guía define el estándar para crear comandos en **SENSOR**, el runtime de presencia humana del ecosistema Bloom.

> **Nota arquitectónica**: SENSOR usa **registro explícito** de comandos, a diferencia de NUCLEUS que usa auto-discovery via `init()`. Esta diferencia es intencional y refleja la filosofía de cada binario: Nucleus es extensible por diseño; Sensor es un runtime fisiológico con un conjunto de comandos estable y deliberado.

---

## Índice

1. [Filosofía de Diseño](#1-filosofía-de-diseño)
2. [Sistema de Categorías](#2-sistema-de-categorías)
3. [Anatomía de un Comando](#3-anatomía-de-un-comando)
4. [Sistema de Registro Explícito](#4-sistema-de-registro-explícito)
5. [Comandos Existentes: Referencia](#5-comandos-existentes-referencia)
6. [Buenas Prácticas](#6-buenas-prácticas)
7. [Checklist de Desarrollo](#7-checklist-de-desarrollo)
8. [Troubleshooting](#8-troubleshooting)

---

## 1. Filosofía de Diseño

### 1.1 Sensor ≠ Nucleus

SENSOR y NUCLEUS comparten la misma infraestructura de CLI (Cobra, `help_renderer.go`, `HelpConfig`) pero tienen filosofías de registro diametralmente opuestas:

| Aspecto | NUCLEUS | SENSOR |
|---------|---------|--------|
| **Registro de comandos** | Auto-discovery vía `init()` | Explícito en `root.go` |
| **Activación** | Import ciego `_` en `main.go` | `root.AddCommand(...)` en `BuildRootCommand` |
| **Extensibilidad** | Alta — agregar archivo = agregar comando | Deliberada — requiere editar `root.go` |
| **Filosofía** | Gobernanza extensible | Runtime fisiológico estable |
| **Naturaleza** | Orientado a comandos | Orientado a runtime continuo |

Esta distinción es intencional. Sensor mide presencia humana — sus comandos son una interfaz de diagnóstico y control sobre un loop persistente, no un sistema de plugins.

### 1.2 Principios Fundamentales

**Coherencia externa. Simplicidad interna.**

Los comandos de Sensor se ven y se comportan igual que los de Nucleus para el ecosistema (mismo formato de help, mismas annotations, mismo `--json`), pero internamente son más simples: no hay magia de `init()`, no hay imports ciegos.

```
✅ CORRECTO: Comandos como funciones factory en internal/cli/
   internal/
   └── cli/
       ├── root.go           ← Registro explícito de comandos
       ├── help_renderer.go  ← Renderer compartido con Nucleus
       ├── config.go         ← Categorías y branding de Sensor
       └── commands/         ← (opcional) archivos separados por dominio
           ├── run.go
           ├── status.go
           └── ...

❌ INCORRECTO: Intentar clonar el patrón init() de Nucleus en Sensor
   internal/
   └── runtime/
       └── run.go  ← Con init() { cli.Register(...) }
   main.go
       └── _ "bloom-sensor/internal/runtime"  ← NO hacer esto
```

### 1.3 Flujo de Vida de un Comando en Sensor

```
1. Desarrollador crea función factory: func createRunCommand(c *core.Core) *cobra.Command
2. La función se declara en un archivo dentro de internal/cli/ (o en root.go mismo)
3. root.go llama explícitamente: root.AddCommand(createRunCommand(c))
4. BuildRootCommand retorna el root con todos los comandos ya adjuntos
5. main.go llama BuildRootCommand(c) y ejecuta root.Execute()
6. help_renderer agrupa por categoría usando Annotations["category"]
```

No hay imports ciegos. No hay `init()`. Todo el árbol de comandos se construye en `BuildRootCommand`.

---

## 2. Sistema de Categorías

### 2.1 Las Cuatro Categorías de Sensor

Las categorías son **etiquetas** en `Annotations`, no estructura de carpetas. Se configuran en `internal/cli/config.go`:

| Categoría | Descripción | Comandos actuales |
|-----------|-------------|-------------------|
| **`SYSTEM`** | Versión, identidad y contrato con Metamorph | `version`, `info` |
| **`RUNTIME`** | Arranque e inspección del loop de presencia humana | `run`, `status` |
| **`LIFECYCLE`** | Gestión de autostart en HKCU | `enable`, `disable` |
| **`TELEMETRY`** | Exportación e inspección de snapshots de presencia | `export` |

### 2.2 Configuración Visual (config.go)

El orden y las descripciones de categorías en el help se definen en `DefaultSensorConfig()`:

```go
// internal/cli/config.go
func DefaultSensorConfig() HelpConfig {
    return HelpConfig{
        AppName:     "SENSOR",
        AppSubtitle: "Human Presence Runtime",
        Width:       120,
        CategoryOrder: []string{
            "SYSTEM",
            "RUNTIME",
            "LIFECYCLE",
            "TELEMETRY",
        },
        CategoryDescs: map[string]string{
            "SYSTEM":    "Version, identity and Metamorph contract",
            "RUNTIME":   "Start and inspect the human presence detection loop",
            "LIFECYCLE": "Manage automatic startup registration (HKCU)",
            "TELEMETRY": "Export and inspect collected presence snapshots",
        },
    }
}
```

**Regla de oro**: Si agregas una nueva categoría, actualiza `CategoryOrder` y `CategoryDescs` en `config.go`. Si la categoría no está en `CategoryOrder`, los comandos de esa categoría no aparecerán en el help.

---

## 3. Anatomía de un Comando

### 3.1 Plantilla de Comando

Un comando en Sensor es una **función factory** que recibe el Core y retorna un `*cobra.Command`. El tipo está definido en `internal/cli/registry.go`:

```go
type CommandFactory func(c *core.Core) *cobra.Command
```

Estructura completa de un comando:

```go
// Puede vivir en root.go directamente, o en un archivo separado
// dentro de internal/cli/ si la lógica es extensa.

func createStatusCommand(c *core.Core) *cobra.Command {
    // Variables para flags (scope local al comando)
    var watchInterval int

    cmd := &cobra.Command{
        // Sintaxis del comando (lo que ve el usuario en el help)
        Use: "status",

        // Descripción corta (aparece en listados de categorías)
        Short: "Inspect current process and sentinel connection state",

        // Descripción larga (aparece en bloom-sensor status --help)
        Long: `Inspect the current state of the bloom-sensor process.

Reports:
  - Whether the process is running (and its PID)
  - Whether autostart is registered in HKCU
  - Whether Sentinel connection is active
  - Timestamp of the last state update

Does not require the process to be running to execute.`,

        // Validación de argumentos
        Args: cobra.NoArgs,

        // OBLIGATORIO: Annotations con category y json_response
        Annotations: map[string]string{
            "category": "RUNTIME",
            "json_response": `{
  "process_running": true,
  "pid": 1234,
  "autostart_registered": true,
  "sentinel_connected": true,
  "last_state_update": "2026-02-24T15:04:05Z"
}`,
        },

        // Ejemplos de uso reales
        Example: `  bloom-sensor status
  bloom-sensor --json status`,

        // Lógica de ejecución
        Run: func(cmd *cobra.Command, args []string) {
            result, err := inspectStatus(c)
            if err != nil {
                c.Logger.Error("status check failed: %v", err)
                return
            }

            // JSON output para automatización
            if c.Config.OutputJSON {
                cli.PrintJSON(result)
                return
            }

            // Output humano
            c.Logger.Info("Process running: %v (PID: %d)", result.ProcessRunning, result.PID)
            c.Logger.Info("Autostart:       %v", result.AutostartRegistered)
            c.Logger.Info("Sentinel:        %v", result.SentinelConnected)
        },
    }

    // Flags opcionales
    cmd.Flags().IntVar(&watchInterval, "watch", 0, "Re-check every N seconds (0 = once)")

    return cmd
}

// Lógica de negocio separada (testeable independientemente de Cobra)
type StatusResult struct {
    ProcessRunning      bool   `json:"process_running"`
    PID                 int    `json:"pid"`
    AutostartRegistered bool   `json:"autostart_registered"`
    SentinelConnected   bool   `json:"sentinel_connected"`
    LastStateUpdate     string `json:"last_state_update"`
}

func inspectStatus(c *core.Core) (*StatusResult, error) {
    // Implementación real...
    return &StatusResult{}, nil
}
```

### 3.2 Elementos Esenciales

| Elemento | Obligatorio | Descripción |
|----------|-------------|-------------|
| Factory function | ✅ Sí | Retorna `*cobra.Command`, recibe `*core.Core` |
| `Use` | ✅ Sí | Define sintaxis y nombre visible |
| `Short` | ✅ Sí | Descripción de una línea (máx. 60 caracteres) |
| `Run` | ✅ Sí | Lógica de ejecución |
| `Annotations["category"]` | ✅ Sí | Sin esto, el comando no aparece en el help |
| `Annotations["json_response"]` | ✅ Sí | Documenta el contrato JSON |
| `AddCommand(...)` en `root.go` | ✅ Sí | Sin esto, el comando nunca se registra |
| `Long` | ⚠️ Recomendado | Documentación detallada para `--help` |
| `Example` | ⚠️ Recomendado | Casos de uso reales, siempre incluir variante `--json` |
| `Args` | ⚠️ Recomendado | Validación explícita de argumentos |
| Lógica separada | ⚠️ Recomendado | Para testing independiente de Cobra |
| Flags | ❌ Opcional | Solo si el comando los necesita |

### 3.3 Annotations: Metadata Crítico

`Annotations` es un mapa que el `help_renderer.go` usa para categorizar y documentar comandos. **Ambas claves son obligatorias**:

```go
Annotations: map[string]string{
    "category":      "RUNTIME",   // Una de: SYSTEM, RUNTIME, LIFECYCLE, TELEMETRY
    "json_response": `{           // JSON válido representando el caso de éxito típico
  "status": "running",
  "pid": 1234
}`,
},
```

**¿Por qué son obligatorios?**

- `category`: El `help_renderer.go` lee este campo en `categorizeCommands()` para agrupar comandos. Sin él, el comando cae en `OTHER` y puede no renderizarse.
- `json_response`: El renderer lo muestra en la sección "JSON Response" del help. Documenta el contrato para conductor (Electron) y automatización.

**Formato del `json_response`:**

```go
// ✅ CORRECTO: JSON válido con backticks, indentado con 2 espacios
"json_response": `{
  "success": true,
  "pid": 1234,
  "channel": "stable"
}`,

// ❌ INCORRECTO: JSON sin comillas en keys
"json_response": `{ success: true }`,

// ❌ INCORRECTO: Vacío o placeholder
"json_response": `{}`,
```

### 3.4 Patrones de Validación de Argumentos

```go
// Sin argumentos (comando de diagnóstico o estado)
Args: cobra.NoArgs,

// Exactamente N argumentos
Args: cobra.ExactArgs(1),

// Mínimo N argumentos
Args: cobra.MinimumNArgs(1),

// Máximo N argumentos (argumento opcional)
Args: cobra.MaximumNArgs(1),

// Validación personalizada
Args: func(cmd *cobra.Command, args []string) error {
    if len(args) > 0 && args[0] != "json" && args[0] != "text" {
        return fmt.Errorf("format must be 'json' or 'text', got: %s", args[0])
    }
    return nil
},
```

---

## 4. Sistema de Registro Explícito

### 4.1 registry.go: El Mecanismo de Registro

A diferencia de Nucleus, Sensor expone el tipo `CommandFactory` y una lista `registry` en `internal/cli/registry.go`. Sin embargo, el mecanismo preferido en Sensor es **registro directo en `root.go`** vía `root.AddCommand(...)`.

`registry.go` provee infraestructura para un patrón opcional de registro desacoplado:

```go
// internal/cli/registry.go

type CommandFactory func(c *core.Core) *cobra.Command

// Register agrega una factory al registry global.
func Register(f CommandFactory) {
    registry = append(registry, f)
}

// Commands retorna todas las factories registradas.
func Commands() []CommandFactory {
    return registry
}

// PrintJSON es el helper compartido para output JSON.
func PrintJSON(v interface{}) error {
    enc := json.NewEncoder(os.Stdout)
    enc.SetIndent("", "  ")
    return enc.Encode(v)
}
```

### 4.2 root.go: El Punto de Registro Canónico

**Todos los comandos se registran aquí, explícitamente**. Esta es la única fuente de verdad sobre qué comandos existen:

```go
// internal/cli/root.go
package cli

import (
    "os"

    "bloom-sensor/internal/core"
    "github.com/spf13/cobra"
)

func BuildRootCommand(c *core.Core) *cobra.Command {
    root := &cobra.Command{
        Use:           "bloom-sensor",
        Short:         "Human presence runtime for the Bloom ecosystem",
        SilenceUsage:  true,
        SilenceErrors: true,
    }

    // Flags globales (disponibles para todos los subcomandos)
    root.PersistentFlags().BoolVar(&c.Config.Debug, "debug", false, "Enable debug logging")
    root.PersistentFlags().StringVar(&c.Config.Channel, "channel", "stable", "Release channel (stable|beta)")
    root.PersistentFlags().StringVar(&c.Config.ConfigPath, "config", "", "Config file path")
    root.PersistentFlags().BoolVar(&c.Config.OutputJSON, "json", false, "Output in JSON format")

    // ─── REGISTRO EXPLÍCITO DE COMANDOS ───────────────────────────────────
    // SYSTEM
    root.AddCommand(createVersionCommand(c))
    root.AddCommand(createInfoCommand(c))

    // RUNTIME
    root.AddCommand(createRunCommand(c))
    root.AddCommand(createStatusCommand(c))

    // LIFECYCLE
    root.AddCommand(createEnableCommand(c))
    root.AddCommand(createDisableCommand(c))

    // TELEMETRY
    root.AddCommand(createExportCommand(c))
    // ──────────────────────────────────────────────────────────────────────

    // Help renderer personalizado
    renderer := NewModernHelpRenderer(os.Stdout, DefaultSensorConfig())
    root.SetHelpFunc(func(cmd *cobra.Command, args []string) {
        RenderFullHelp(root, renderer)
    })

    return root
}
```

### 4.3 Activación de un Nuevo Comando

**PASO 1**: Crear la función factory

Puede vivir en `root.go` si es pequeña, o en un archivo separado dentro de `internal/cli/`:

```go
// internal/cli/export.go  (o directamente en root.go)
package cli

import (
    "time"

    "bloom-sensor/internal/core"
    "github.com/spf13/cobra"
)

func createExportCommand(c *core.Core) *cobra.Command {
    var last string
    var format string

    cmd := &cobra.Command{
        Use:   "export",
        Short: "Dump presence snapshots from the in-memory ring buffer",
        Long: `Export collected human presence snapshots from the ring buffer.

Supports time-based filtering and multiple output formats.
The ring buffer holds the last N snapshots from the current session.`,
        Args: cobra.NoArgs,
        Annotations: map[string]string{
            "category": "TELEMETRY",
            "json_response": `{
  "period": "24h",
  "samples": 1440,
  "avg_energy_index": 0.62,
  "avg_focus_score": 0.71,
  "total_active_minutes": 312,
  "snapshots": []
}`,
        },
        Example: `  bloom-sensor export
  bloom-sensor export --last 1h
  bloom-sensor export --last 30m --format text
  bloom-sensor --json export --last 24h`,
        Run: func(cmd *cobra.Command, args []string) {
            duration, err := time.ParseDuration(last)
            if err != nil && last != "" {
                c.Logger.Error("invalid duration: %s", last)
                return
            }
            result := c.MetricsEngine.Export(duration)
            if c.Config.OutputJSON {
                PrintJSON(result)
                return
            }
            // Output texto...
        },
    }

    cmd.Flags().StringVar(&last, "last", "24h", "Time window to export (e.g. 1h, 30m, 24h)")
    cmd.Flags().StringVar(&format, "format", "json", "Output format: json|text")

    return cmd
}
```

**PASO 2**: Registrar en `root.go`

```go
// En BuildRootCommand, agregar bajo la categoría correspondiente:
root.AddCommand(createExportCommand(c))
```

**PASO 3**: Verificar

```bash
go build -o bloom-sensor.exe ./cmd/
bloom-sensor help        # El comando debe aparecer en TELEMETRY
bloom-sensor export --help
bloom-sensor --json export --last 1h
```

### 4.4 Comandos con Subcomandos

Sensor no tiene comandos con subcomandos actualmente, pero el patrón es el mismo que en Nucleus: solo el padre se pasa a `root.AddCommand()`, y los subcomandos se agregan al padre internamente.

```go
func createDiagnosticCommand(c *core.Core) *cobra.Command {
    // Comando padre: solo necesita "category" en Annotations (sin json_response)
    cmd := &cobra.Command{
        Use:   "diagnostic",
        Short: "Diagnostic utilities for the sensor runtime",
        Annotations: map[string]string{
            "category": "RUNTIME",
        },
    }

    // Los subcomandos SÍ necesitan json_response completo
    cmd.AddCommand(createDiagnosticTickCommand(c))
    cmd.AddCommand(createDiagnosticMetricsCommand(c))

    return cmd
}

func createDiagnosticTickCommand(c *core.Core) *cobra.Command {
    return &cobra.Command{
        Use:   "tick",
        Short: "Execute a single measurement tick and print results",
        Args:  cobra.NoArgs,
        Annotations: map[string]string{
            "category": "RUNTIME",
            "json_response": `{
  "session_active": true,
  "idle_seconds": 45,
  "energy_index": 0.78,
  "focus_score": 0.82,
  "fatigue_probability": 0.12
}`,
        },
        Example: `  bloom-sensor diagnostic tick
  bloom-sensor --json diagnostic tick`,
        Run: func(cmd *cobra.Command, args []string) {
            // Ejecutar un tick de diagnóstico...
        },
    }
}
```

**Luego en `root.go`:**

```go
// SOLO registrar el padre
root.AddCommand(createDiagnosticCommand(c))
```

---

## 5. Comandos Existentes: Referencia

### `bloom-sensor version` — SYSTEM

```go
Annotations: map[string]string{
    "category": "SYSTEM",
    "json_response": `{
  "version": "0.1.0",
  "channel": "stable",
  "build": "20260224",
  "commit": "abc1234"
}`,
},
Example: `  bloom-sensor version
  bloom-sensor --json version`,
```

### `bloom-sensor info` — SYSTEM

Comando especial: contrato obligatorio con Metamorph. El JSON debe incluir `name`, `version`, `channel`, `capabilities` y `requires`.

```go
Annotations: map[string]string{
    "category": "SYSTEM",
    "json_response": `{
  "name": "sensor",
  "version": "0.1.0",
  "channel": "stable",
  "capabilities": [
    "session_monitoring",
    "idle_detection",
    "cognitive_metrics_v1"
  ],
  "requires": {
    "sentinel": ">=1.5.0"
  }
}`,
},
Example: `  bloom-sensor info
  bloom-sensor --json info`,
```

### `bloom-sensor run` — RUNTIME

```go
// Flags específicos:
// --foreground  No redireccionar stdout (debugging)
// --once        Ejecutar un solo tick y salir (diagnóstico)
// --diagnostic  Modo verbose de métricas, imprime cada tick

Annotations: map[string]string{
    "category": "RUNTIME",
    "json_response": `{
  "status": "running",
  "pid": 1234,
  "session": "active",
  "sentinel_connected": true
}`,
},
```

### `bloom-sensor status` — RUNTIME

```go
Annotations: map[string]string{
    "category": "RUNTIME",
    "json_response": `{
  "process_running": true,
  "pid": 1234,
  "autostart_registered": true,
  "sentinel_connected": true,
  "last_state_update": "2026-02-24T15:04:05Z"
}`,
},
```

### `bloom-sensor enable` — LIFECYCLE

Registra `BloomSensor` en `HKCU\...\Run`. Si existe `BloomLauncher`, lo elimina. Idempotente.

```go
Annotations: map[string]string{
    "category": "LIFECYCLE",
    "json_response": `{
  "success": true,
  "registry_key": "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run\\BloomSensor",
  "value": "C:\\Bloom\\bloom-sensor.exe run"
}`,
},
```

### `bloom-sensor disable` — LIFECYCLE

Elimina `BloomSensor` de HKCU. No mata el proceso actual. Idempotente.

```go
Annotations: map[string]string{
    "category": "LIFECYCLE",
    "json_response": `{
  "success": true,
  "removed": true
}`,
},
```

### `bloom-sensor export` — TELEMETRY

```go
// Flags específicos:
// --last <duration>   Filtro de tiempo (ej: 24h, 1h, 30m) — default: 24h
// --format <json|text> Formato de salida — default: json

Annotations: map[string]string{
    "category": "TELEMETRY",
    "json_response": `{
  "period": "24h",
  "samples": 1440,
  "avg_energy_index": 0.62,
  "avg_focus_score": 0.71,
  "total_active_minutes": 312,
  "snapshots": []
}`,
},
```

---

## 6. Buenas Prácticas

### 6.1 JSON Output: Siempre Verificar el Flag

Todo comando debe respetar `c.Config.OutputJSON`. Usar `PrintJSON` de `registry.go`:

```go
Run: func(cmd *cobra.Command, args []string) {
    result := doWork(c)

    // ✅ SIEMPRE verificar primero
    if c.Config.OutputJSON {
        cli.PrintJSON(result)
        return  // IMPORTANTE: return inmediato después de JSON
    }

    // Output humano a continuación
    c.Logger.Info("Done: %v", result)
},
```

```go
// ❌ MAL: Olvidar el return después de JSON
if c.Config.OutputJSON {
    cli.PrintJSON(result)
    // Falta return — continúa ejecutando el output humano
}
c.Logger.Info("Done")  // Se imprime también en modo JSON
```

### 6.2 Degradación Elegante

Sensor nunca debe bloquearse por dependencias externas. Aplicar en los comandos:

```go
// ✅ CORRECTO: Error no es fatal si Sentinel no está disponible
Run: func(cmd *cobra.Command, args []string) {
    result := &StatusResult{}

    // Intentar obtener estado de Sentinel, pero no fallar si no está
    if c.SentinelClient != nil && c.SentinelClient.IsConnected() {
        result.SentinelConnected = true
    }

    // Siempre retornar algo útil
    if c.Config.OutputJSON {
        PrintJSON(result)
    }
},
```

### 6.3 Separación de Lógica de Negocio

La lógica real debe vivir fuera del closure de `Run` para ser testeable:

```go
// ✅ CORRECTO: Lógica separada y testeable
Run: func(cmd *cobra.Command, args []string) {
    result, err := performExport(c, duration, format)
    if err != nil {
        c.Logger.Error("export failed: %v", err)
        return
    }
    if c.Config.OutputJSON {
        PrintJSON(result)
        return
    }
    printExportText(result)
},

// Testeable sin Cobra
func performExport(c *core.Core, d time.Duration, format string) (*ExportResult, error) {
    snapshots := c.MetricsEngine.RingBuffer.Since(d)
    return buildExportResult(snapshots, format), nil
}
```

### 6.4 Logging Estructurado

Usar `c.Logger` siempre, nunca `fmt.Println`:

```go
c.Logger.Debug("reading config from %s", configPath)      // Detalles técnicos
c.Logger.Info("autostart registered: %v", keyPath)        // Información relevante
c.Logger.Warn("sentinel not available, skipping publish") // Advertencias no fatales
c.Logger.Error("registry write failed: %v", err)          // Errores recuperables

// ❌ MAL:
fmt.Println("Done")
fmt.Printf("Error: %v\n", err)
```

### 6.5 Idempotencia en Comandos LIFECYCLE

Los comandos `enable` y `disable` deben ser seguros de ejecutar múltiples veces:

```go
func performEnable(installPath string) (*EnableResult, error) {
    // Eliminar clave legacy si existe (no fallar si no existe)
    _ = deleteRegistryValue("BloomLauncher")

    // Registrar nueva clave (re-registrar no es error)
    value := fmt.Sprintf(`"%s\bloom-sensor.exe" run`, installPath)
    if err := setRegistryValue("BloomSensor", value); err != nil {
        return nil, err
    }

    return &EnableResult{Success: true, Value: value}, nil
}
```

### 6.6 Annotations: Reglas de Formato

```go
// ✅ CORRECTO: JSON válido, indentado, con backticks
Annotations: map[string]string{
    "category": "RUNTIME",
    "json_response": `{
  "status": "running",
  "pid": 1234,
  "sentinel_connected": true
}`,
},

// ❌ INCORRECTO: Sin category — comando invisible en el help
Annotations: map[string]string{
    "json_response": `{"status": "running"}`,
},

// ❌ INCORRECTO: JSON con keys sin comillas
"json_response": `{ status: running }`,

// ❌ INCORRECTO: json_response vacío o placeholder
"json_response": `{}`,
"json_response": `// TODO`,
```

---

## 7. Checklist de Desarrollo

### 7.1 Antes de Escribir el Comando

- [ ] ¿El comando tiene un propósito claro y único?
- [ ] ¿La categoría correcta existe en `config.go`?
- [ ] ¿Ya existe un comando similar que sirva de referencia?
- [ ] ¿El output JSON está definido (qué campos retorna)?

### 7.2 Estructura de la Factory Function

- [ ] La función firma es `func createXxxCommand(c *core.Core) *cobra.Command`
- [ ] `Use` refleja la sintaxis real del comando
- [ ] `Short` tiene máximo 60 caracteres, es claro y accionable
- [ ] `Long` explica qué hace, cuándo usarlo y qué efectos tiene
- [ ] `Args` valida explícitamente los argumentos aceptados
- [ ] `Annotations["category"]` coincide con una categoría en `config.go`
- [ ] `Annotations["json_response"]` es JSON válido y representativo
- [ ] `Example` incluye al menos un caso básico y uno con `--json`
- [ ] Si tiene flags, los defaults son sensatos para el 80% de casos

### 7.3 Registro en root.go

- [ ] `root.AddCommand(createXxxCommand(c))` está en `BuildRootCommand`
- [ ] El `AddCommand` está agrupado bajo el comentario de su categoría

### 7.4 Output y Comportamiento

- [ ] El comando verifica `c.Config.OutputJSON` antes del output humano
- [ ] `PrintJSON` se llama con `return` inmediato después
- [ ] Los errores se loggean con `c.Logger.Error` y retornan sin `panic`
- [ ] Si una dependencia externa no está disponible, el comando degrada elegantemente

### 7.5 Testing Manual

```bash
# Verificar que aparece en el help
bloom-sensor help

# Verificar ayuda específica del comando
bloom-sensor <comando> --help

# Verificar modo JSON (flag ANTES del comando)
bloom-sensor --json <comando>

# Verificar con stderr limpio (para scripts)
bloom-sensor --json <comando> 2>$null        # PowerShell
bloom-sensor --json <comando> 2>/dev/null    # Bash

# Verificar flags
bloom-sensor <comando> --flag value
```

---

## 8. Troubleshooting

### 8.1 "Mi comando no aparece en el help"

**Causas posibles:**

1. Falta `root.AddCommand(createXxxCommand(c))` en `root.go`
2. `Annotations["category"]` está ausente o mal escrito
3. La categoría no está en `CategoryOrder` de `config.go`

**Diagnóstico:**

```bash
# Compilar y verificar el help completo
go build -o bloom-sensor.exe ./cmd/
bloom-sensor help

# Buscar la categoría en config.go
grep "MI_CATEGORIA" internal/cli/config.go

# Verificar el AddCommand en root.go
grep "createMiComando" internal/cli/root.go
```

### 8.2 "El JSON output también muestra logs"

**Causa:** Falta `return` después de `PrintJSON`.

```go
// ❌ MAL
if c.Config.OutputJSON {
    PrintJSON(result)
}
c.Logger.Info("Done")  // Se ejecuta también en modo JSON

// ✅ BIEN
if c.Config.OutputJSON {
    PrintJSON(result)
    return
}
c.Logger.Info("Done")
```

Para output absolutamente limpio en scripts, redirigir stderr:
```bash
bloom-sensor --json status 2>/dev/null
```

### 8.3 "El comando falla si Sentinel no está disponible"

**Causa:** El comando bloquea esperando conexión a Sentinel.

```go
// ❌ MAL: Bloquea si Sentinel no responde
conn := c.SentinelClient.Connect()  // Puede bloquear

// ✅ BIEN: Solo usar Sentinel si ya está conectado
if c.SentinelClient.IsConnected() {
    // Usar Sentinel
}
// Continuar sin él de todas formas
```

### 8.4 "El flag --json no funciona correctamente"

**Causa:** El flag se coloca después del comando en lugar de antes.

```bash
# ❌ MAL — --json después del comando es un flag local, no global
bloom-sensor status --json

# ✅ BIEN — --json antes del comando es el flag global de root
bloom-sensor --json status
```

El `help_renderer.go` ya advierte sobre esto en la sección "COMMON MISTAKES & TIPS".

### 8.5 "¿Cuándo usar cli.Register() vs root.AddCommand()?"

`cli.Register()` (de `registry.go`) es una alternativa desacoplada disponible en Sensor, pero **el patrón canónico es `root.AddCommand()` en `root.go`**. Usar `Register()` solo si se quiere desacoplar el archivo del factory de `root.go` por razones de organización, entendiendo que aún se necesitará llamar a los registros desde algún punto de arranque.

En la práctica: **preferir siempre `root.AddCommand()` directamente en `BuildRootCommand`**.

---

## Referencia Rápida: Template Completo

```go
// internal/cli/micomando.go (o directamente en root.go si es pequeño)
package cli

import (
    "bloom-sensor/internal/core"
    "github.com/spf13/cobra"
)

func createMiComandoCommand(c *core.Core) *cobra.Command {
    var miFlag string

    cmd := &cobra.Command{
        Use:   "micomando [arg-opcional]",
        Short: "Descripción breve del comando",
        Long: `Descripción completa que explica:

1. QUÉ hace el comando
2. CUÁNDO usarlo
3. QUÉ efectos tiene`,
        Args: cobra.MaximumNArgs(1),
        Annotations: map[string]string{
            "category": "RUNTIME", // SYSTEM | RUNTIME | LIFECYCLE | TELEMETRY
            "json_response": `{
  "success": true,
  "field": "value"
}`,
        },
        Example: `  bloom-sensor micomando
  bloom-sensor micomando arg
  bloom-sensor --json micomando`,
        Run: func(cmd *cobra.Command, args []string) {
            result, err := doMiComando(c, miFlag)
            if err != nil {
                c.Logger.Error("failed: %v", err)
                return
            }
            if c.Config.OutputJSON {
                PrintJSON(result)
                return
            }
            c.Logger.Info("Done: %v", result)
        },
    }

    cmd.Flags().StringVar(&miFlag, "mi-flag", "default", "Descripción del flag")

    return cmd
}

type MiComandoResult struct {
    Success bool   `json:"success"`
    Field   string `json:"field"`
}

func doMiComando(c *core.Core, flag string) (*MiComandoResult, error) {
    // Lógica de negocio testeable independientemente
    return &MiComandoResult{Success: true, Field: flag}, nil
}
```

**Y en `root.go`, dentro de `BuildRootCommand`:**

```go
// RUNTIME
root.AddCommand(createRunCommand(c))
root.AddCommand(createStatusCommand(c))
root.AddCommand(createMiComandoCommand(c))  // ← Agregar aquí
```

---

**Versión**: 1.0
**Fecha**: Junio 2026
**Arquitectura**: Registro Explícito con Cobra
**Ecosistema**: Bloom — bloom-sensor
