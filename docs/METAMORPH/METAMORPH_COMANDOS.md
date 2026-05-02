# Guía de Comandos — Metamorph

> Governance Layer for Bloom Organization  
> Versión del renderer: `help_renderer.go` · Framework: Cobra + pflag

---

## Índice

1. [Cómo usar esta guía](#cómo-usar-esta-guía)
2. [Opciones Globales](#opciones-globales)
3. [Anatomía de un Comando](#anatomía-de-un-comando)
4. [Categorías de Comandos](#categorías-de-comandos)
5. [Referencia por Categoría](#referencia-por-categoría)
   - [SYSTEM](#system)
   - [GOVERNANCE](#governance)
   - [ANALYTICS](#analytics)
   - [VAULT](#vault)
   - [ORCHESTRATION](#orchestration)
   - [SYNAPSE](#synapse)
6. [Plantillas de Implementación](#plantillas-de-implementación)
7. [Checklist de Registro](#checklist-de-registro)

---

## Cómo usar esta guía

Esta guía describe cómo el `help_renderer.go` de Metamorph renderiza y expone los comandos Cobra. Cada comando que implementes debe cumplir el contrato definido aquí para aparecer correctamente en:

- `metamorph help` — vista interactiva en terminal (con colores ANSI)
- `metamorph help --json` — exportación JSON para Electron/automatización
- `metamorph <comando> --help` — ayuda individual de Cobra

---

## Opciones Globales

Estas flags son procesadas por el renderer como opciones raíz. Aparecen en la sección **GLOBAL OPTIONS** del help.

| Flag        | Descripción                                  |
|-------------|----------------------------------------------|
| `--json`    | Output en formato JSON (machine-readable)    |
| `--verbose` | Habilita logging detallado para debugging    |
| `--help`    | Muestra el mensaje de ayuda                  |

**Uso:**
```bash
metamorph [OPTIONS] <command> [args]

metamorph version
metamorph info
metamorph --json info
```

---

## Anatomía de un Comando

El renderer inspecciona los siguientes campos de cada `cobra.Command`. Todos impactan en cómo se visualiza el comando en el help.

```
cobra.Command {
    Use          → Sintaxis. Ej: "heartbeat [target]"
                   · Parte antes del primer espacio = nombre del comando
                   · Argumentos entre <> = required
                   · Argumentos entre [] = optional

    Short        → Descripción de una línea (aparece en listados y encabezado)

    Example      → Casos de uso. Una línea por ejemplo.
                   · Siempre usar "metamorph" como prefijo
                   · Incluir variante con --json

    Annotations  → Mapa de metadata OBLIGATORIO:
                   · "category"      → A qué sección del help pertenece
                   · "json_response" → JSON de ejemplo que retorna el comando

    LocalFlags() → Flags definidos con cmd.Flags().XxxVarP(...)
                   · Se muestran con nombre, shorthand y [default: xxx]

    HasSubCommands() → Si true, el renderer muestra sección "Subcommands"
                       y luego "Subcommand Details" con cada sub.
}
```

### Cómo el renderer extrae los argumentos

El renderer parsea el campo `Use` automáticamente para determinar nombre y argumentos:

```
Use: "deploy <environment> [version]"
      ^^^^^^  ^^^^^^^^^^^^  ^^^^^^^^^
      nombre  arg required  arg optional
```

- Texto entre `<>` → `required: true`
- Texto entre `[]` → `required: false`
- El primer token (antes del espacio) → nombre del comando

---

## Categorías de Comandos

Las categorías son **etiquetas en `Annotations["category"]`**, no carpetas del filesystem. El renderer las agrupa y ordena según `HelpConfig.CategoryOrder`.

| Categoría       | Descripción                                      |
|-----------------|--------------------------------------------------|
| `SYSTEM`        | Información base y diagnóstico del sistema       |
| `GOVERNANCE`    | Inicialización y autoridad de organización       |
| `ANALYTICS`     | Monitoreo y telemetría                           |
| `VAULT`         | Gestión segura de claves y credenciales          |
| `ORCHESTRATION` | Orquestación de workflows con Temporal           |
| `SYNAPSE`       | Integración con Sentinel                         |

> **Regla**: Si agregás una categoría nueva, debe estar en `HelpConfig.CategoryOrder` y `HelpConfig.CategoryDescs` dentro de `internal/cli/config.go`, o el renderer la ignorará.

---

## Referencia por Categoría

---

### SYSTEM

Comandos de información base. Generalmente de solo lectura, sin requerir roles especiales.

---

#### `version`

Muestra información de versión del binario.

```
Use:   "version"
Short: "Display version information"
Args:  cobra.NoArgs
```

**Annotations:**
```go
Annotations: map[string]string{
    "category": "SYSTEM",
    "json_response": `{
  "version": "1.0.0",
  "build_time": "2025-02-06T10:00:00Z",
  "commit": "abc123def"
}`,
},
```

**Example:**
```bash
metamorph version
metamorph --json version
```

---

#### `info`

Muestra información general del sistema y entorno.

```
Use:   "info"
Short: "Show system information"
Args:  cobra.NoArgs
```

**Annotations:**
```go
Annotations: map[string]string{
    "category": "SYSTEM",
    "json_response": `{
  "os": "windows",
  "arch": "amd64",
  "go_version": "1.21.0",
  "app_data_path": "C:\\Users\\user\\AppData\\Local\\BloomNucleus",
  "config_exists": true
}`,
},
```

**Example:**
```bash
metamorph info
metamorph --json info
```

---

### GOVERNANCE

Comandos de inicialización y autoridad. La mayoría requiere verificación de rol antes de ejecutar.

---

#### `alfred`

Comando principal de gobernanza. Gestiona la inicialización del blueprint organizacional.

```
Use:   "alfred [action]"
Short: "Manage organization governance blueprint"
Args:  cobra.MaximumNArgs(1)
```

**Annotations:**
```go
Annotations: map[string]string{
    "category": "GOVERNANCE",
    "json_response": `{
  "success": true,
  "action": "init",
  "blueprint_path": ".governance/blueprint.json",
  "master_set": true
}`,
},
```

**Flags:**
```go
cmd.Flags().BoolVarP(&force, "force", "f", false, "Force re-initialization")
cmd.Flags().StringVarP(&output, "output", "o", ".governance", "Output directory")
```

**Example:**
```bash
metamorph alfred
metamorph alfred init
metamorph alfred --force
metamorph --json alfred init
```

> ⚠️ Requiere: rol Master. Verificar con `governance.RequireMaster(c)` al inicio del `Run`.

---

#### `audit`

Auditoría de compliance de gobernanza.

```
Use:   "audit [action]"
Short: "Perform governance audit"
Args:  cobra.MaximumNArgs(1)
```

**Annotations:**
```go
Annotations: map[string]string{
    "category": "GOVERNANCE",
    "json_response": `{
  "issue_count": 2,
  "compliance_score": 95.5,
  "timestamp": "2025-02-06T10:00:00Z",
  "issues": []
}`,
},
```

**Flags:**
```go
cmd.Flags().BoolVarP(&export, "export", "e", false, "Export audit report")
cmd.Flags().StringVarP(&format, "format", "f", "json", "Export format (json|pdf|html)")
```

**Example:**
```bash
metamorph audit
metamorph audit verify
metamorph audit --export --format pdf
metamorph --json audit
```

> ⚠️ Requiere: rol Master.

---

### ANALYTICS

Comandos de monitoreo y telemetría.

---

#### `heartbeat`

Envía un health heartbeat al sistema de monitoreo central.

```
Use:   "heartbeat [target]"
Short: "Send health heartbeat to monitoring system"
Args:  cobra.MaximumNArgs(1)
```

**Annotations:**
```go
Annotations: map[string]string{
    "category": "ANALYTICS",
    "json_response": `{
  "status": "healthy",
  "latency_ms": 45,
  "target": "default"
}`,
},
```

**Flags:**
```go
cmd.Flags().IntVarP(&interval, "interval", "i", 30, "Heartbeat interval in seconds")
cmd.Flags().BoolVarP(&continuous, "continuous", "c", false, "Run continuously")
```

**Example:**
```bash
metamorph heartbeat
metamorph heartbeat central-server
metamorph heartbeat --interval 60 --continuous
metamorph --json heartbeat
```

---

### VAULT

Comandos de gestión segura de credenciales y claves.

---

#### `vault` (con subcomandos)

Comando padre de vault. Agrupa operaciones de bóveda segura.

```
Use:   "vault"
Short: "Secure key and credential management"
```

**Annotations del padre:**
```go
Annotations: map[string]string{
    "category": "VAULT",
},
```

> El comando padre **no tiene** `json_response` porque no tiene lógica propia. Solo sus subcomandos lo tienen.

---

##### `vault seal`

Sella la bóveda.

```
Use:   "seal"
Short: "Seal the vault"
Args:  cobra.NoArgs
```

**Annotations:**
```go
Annotations: map[string]string{
    "category": "VAULT",
    "json_response": `{
  "sealed": true,
  "timestamp": "2025-02-06T10:00:00Z"
}`,
},
```

**Example:**
```bash
metamorph vault seal
metamorph --json vault seal
```

---

##### `vault unseal`

Desella la bóveda con token de autoridad.

```
Use:   "unseal <token>"
Short: "Unseal the vault with authority token"
Args:  cobra.ExactArgs(1)
```

**Annotations:**
```go
Annotations: map[string]string{
    "category": "VAULT",
    "json_response": `{
  "sealed": false,
  "authorized_by": "master",
  "expires_at": "2025-02-06T22:00:00Z"
}`,
},
```

**Example:**
```bash
metamorph vault unseal <token>
metamorph --json vault unseal <token>
```

> ⚠️ Requiere: rol Master.

---

##### `vault status`

Estado actual de la bóveda.

```
Use:   "status"
Short: "Check vault seal status"
Args:  cobra.NoArgs
```

**Annotations:**
```go
Annotations: map[string]string{
    "category": "VAULT",
    "json_response": `{
  "sealed": false,
  "key_count": 3,
  "last_accessed": "2025-02-06T09:00:00Z"
}`,
},
```

**Example:**
```bash
metamorph vault status
metamorph --json vault status
```

---

### ORCHESTRATION

Comandos para gestión de workflows con Temporal.

---

#### `temporal` (con subcomandos)

Gestión del ciclo de vida del servidor Temporal embebido.

```
Use:   "temporal"
Short: "Manage Temporal Server lifecycle"
```

**Annotations del padre:**
```go
Annotations: map[string]string{
    "category": "ORCHESTRATION",
},
```

---

##### `temporal start`

Inicia el servidor Temporal en modo interactivo.

```
Use:   "start"
Short: "Start Temporal Server"
Args:  cobra.NoArgs
```

**Annotations:**
```go
Annotations: map[string]string{
    "category": "ORCHESTRATION",
    "json_response": `{
  "state": "RUNNING",
  "pid": 12345,
  "grpc_port": 7233,
  "ui_port": 8233,
  "ui_url": "http://localhost:8233",
  "grpc_url": "localhost:7233"
}`,
},
```

**Example:**
```bash
metamorph temporal start
metamorph --json temporal start
```

---

##### `temporal stop`

Detiene el servidor Temporal en ejecución.

```
Use:   "stop"
Short: "Stop running Temporal Server"
Args:  cobra.NoArgs
```

**Annotations:**
```go
Annotations: map[string]string{
    "category": "ORCHESTRATION",
    "json_response": `{
  "state": "STOPPED",
  "message": "Temporal Server stopped successfully"
}`,
},
```

**Example:**
```bash
metamorph temporal stop
metamorph --json temporal stop
```

---

##### `temporal status`

Estado actual del servidor Temporal.

```
Use:   "status"
Short: "Check Temporal Server status"
Args:  cobra.NoArgs
```

**Annotations:**
```go
Annotations: map[string]string{
    "category": "ORCHESTRATION",
    "json_response": `{
  "operational": true,
  "state": "RUNNING",
  "grpc_port": 7233,
  "ui_port": 8233,
  "health_checks": {
    "grpc": true,
    "ui": true
  }
}`,
},
```

**Example:**
```bash
metamorph temporal status
metamorph --json temporal status
```

---

##### `temporal cleanup`

Limpia procesos Temporal huérfanos y libera puertos.

```
Use:   "cleanup"
Short: "Kill orphaned Temporal processes and free ports"
Args:  cobra.NoArgs
```

**Annotations:**
```go
Annotations: map[string]string{
    "category": "ORCHESTRATION",
    "json_response": `{
  "command": "temporal_cleanup",
  "port": 7233,
  "found_process": true,
  "pid": 19580,
  "action_taken": "killed",
  "port_free_after": true,
  "errors": []
}`,
},
```

**Example:**
```bash
metamorph temporal cleanup
metamorph --json temporal cleanup
```

---

### SYNAPSE

Comandos de integración con Sentinel. Este es el único módulo que agrupa múltiples comandos en un solo archivo (`internal/synapse/commands.go`) por acoplamiento fuerte con el cliente Temporal.

---

#### `synapse` (con subcomandos)

Orquestación de perfiles Sentinel vía Temporal.

```
Use:   "synapse"
Short: "Synapse integration commands for Sentinel orchestration"
```

**Annotations del padre:**
```go
Annotations: map[string]string{
    "category": "SYNAPSE",
},
```

---

##### `synapse launch`

Lanza un perfil Sentinel a través de un workflow Temporal.

```
Use:   "launch <profile>"
Short: "Launch Sentinel profile via Temporal"
Args:  cobra.ExactArgs(1)
```

**Annotations:**
```go
Annotations: map[string]string{
    "category": "SYNAPSE",
    "json_response": `{
  "success": true,
  "profile": "production",
  "workflow_id": "synapse-launch-abc123",
  "state": "RUNNING"
}`,
},
```

**Example:**
```bash
metamorph synapse launch production
metamorph synapse launch staging
metamorph --json synapse launch production
```

---

##### `synapse stop`

Cancela un workflow Sentinel en ejecución.

```
Use:   "stop <profile>"
Short: "Stop running Sentinel profile"
Args:  cobra.ExactArgs(1)
```

**Annotations:**
```go
Annotations: map[string]string{
    "category": "SYNAPSE",
    "json_response": `{
  "success": true,
  "profile": "production",
  "state": "STOPPED"
}`,
},
```

**Example:**
```bash
metamorph synapse stop production
metamorph --json synapse stop production
```

---

##### `synapse status`

Estado actual de un perfil Sentinel.

```
Use:   "status [profile]"
Short: "Query Sentinel profile status"
Args:  cobra.MaximumNArgs(1)
```

**Annotations:**
```go
Annotations: map[string]string{
    "category": "SYNAPSE",
    "json_response": `{
  "profile": "production",
  "state": "RUNNING",
  "workflow_id": "synapse-launch-abc123",
  "started_at": "2025-02-06T08:00:00Z"
}`,
},
```

**Example:**
```bash
metamorph synapse status
metamorph synapse status production
metamorph --json synapse status production
```

---

## Plantillas de Implementación

### Comando simple (sin subcomandos)

```go
package mypkg

import (
    "metamorph/internal/core"
    "github.com/spf13/cobra"
)

func init() {
    core.RegisterCommand("CATEGORY", createMyCommand)
}

func createMyCommand(c *core.Core) *cobra.Command {
    var myFlag string

    cmd := &cobra.Command{
        Use:   "mycommand [arg]",
        Short: "Descripción de una línea (máx 60 chars)",
        Long:  "Descripción detallada: qué hace, cuándo usarlo, qué efectos tiene.",
        Args:  cobra.MaximumNArgs(1),

        Annotations: map[string]string{
            "category": "CATEGORY",
            "json_response": `{
  "success": true,
  "result": "example"
}`,
        },

        Example: `  metamorph mycommand
  metamorph mycommand arg
  metamorph --json mycommand arg`,

        Run: func(cmd *cobra.Command, args []string) {
            result, err := doWork(c, args, myFlag)
            if err != nil {
                c.Logger.Error("❌ Failed: %v", err)
                return
            }

            if c.Config.OutputJSON {
                c.OutputJSON(result)
                return
            }

            c.Logger.Success("✅ Done")
        },
    }

    cmd.Flags().StringVarP(&myFlag, "flag", "f", "default", "Flag description")

    return cmd
}

func doWork(c *core.Core, args []string, flag string) (interface{}, error) {
    // lógica separada y testeable
    return map[string]interface{}{"success": true}, nil
}
```

---

### Comando con subcomandos

```go
func init() {
    // SOLO registrar el padre
    core.RegisterCommand("CATEGORY", createParentCommand)
}

func createParentCommand(c *core.Core) *cobra.Command {
    cmd := &cobra.Command{
        Use:   "parent",
        Short: "Descripción del grupo",

        // Annotations en el padre: solo category, sin json_response
        Annotations: map[string]string{
            "category": "CATEGORY",
        },
    }

    cmd.AddCommand(createSubA(c))
    cmd.AddCommand(createSubB(c))

    return cmd
}

func createSubA(c *core.Core) *cobra.Command {
    return &cobra.Command{
        Use:   "suba",
        Short: "Subcomando A",
        Args:  cobra.NoArgs,

        // Cada subcomando tiene Annotations COMPLETO
        Annotations: map[string]string{
            "category": "CATEGORY",
            "json_response": `{"success": true, "sub": "a"}`,
        },

        Example: `  metamorph parent suba
  metamorph --json parent suba`,

        Run: func(cmd *cobra.Command, args []string) { /* ... */ },
    }
}
```

---

## Checklist de Registro

Antes de declarar un comando listo, verificar:

### Estructura
- [ ] `package` correcto para el dominio
- [ ] `init()` llama a `core.RegisterCommand("CATEGORIA", factory)`
- [ ] La factory retorna `*cobra.Command` (nunca nil)

### Campos cobra.Command
- [ ] `Use` define nombre y argumentos (`<required>` / `[optional]`)
- [ ] `Short` ≤ 60 caracteres, sin punto final
- [ ] `Long` explica qué hace, cuándo usarlo y qué efectos tiene
- [ ] `Args` valida cantidad de argumentos
- [ ] `Example` incluye al menos una variante con `--json`
- [ ] `Annotations["category"]` coincide con la categoría de `RegisterCommand`
- [ ] `Annotations["json_response"]` es JSON válido e indentado (2 espacios)

### Si tiene subcomandos
- [ ] Solo el padre está en `RegisterCommand`
- [ ] El padre tiene `Annotations["category"]`
- [ ] **Cada subcomando** tiene `Annotations` con `category` + `json_response`
- [ ] **Cada subcomando** tiene su propio `Example`

### Flags
- [ ] Nombres descriptivos
- [ ] Shorthands no colisionan con `-h`, `-v`, `--json`
- [ ] Defaults sensatos para el 80% de casos

### Output
- [ ] Verifica `c.Config.OutputJSON` y retorna después de `c.OutputJSON(result)`
- [ ] Usa `c.Logger` en lugar de `fmt.Println`

### Integración
- [ ] El paquete tiene import ciego en `main.go`: `_ "metamorph/internal/mypkg"`
- [ ] `metamorph help` muestra el comando en la categoría correcta
- [ ] `metamorph --json <comando>` retorna JSON válido
- [ ] `metamorph <comando> --help` muestra ayuda individual

---

*Guía generada desde `help_renderer.go` · Metamorph · Bloom Organization*
