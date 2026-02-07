# 🏛️ Guía Maestra de Implementación: Comandos NUCLEUS v2.0

Esta guía define el estándar actualizado para crear comandos en **NUCLEUS**, el sistema de gobernanza de la organización Bloom.

---

## 📋 Índice

1. [Filosofía de Diseño](#1-filosofía-de-diseño)
2. [Sistema de Categorías](#2-sistema-de-categorías)
3. [Anatomía de un Comando](#3-anatomía-de-un-comando)
4. [Sistema de Auto-Registro](#4-sistema-de-auto-registro)
5. [Integración con Electron](#5-integración-con-electron)
6. [Comandos Especiales: Synapse](#6-comandos-especiales-synapse)
7. [Buenas Prácticas](#7-buenas-prácticas)
8. [Checklist de Desarrollo](#8-checklist-de-desarrollo)

---

## 1. Filosofía de Diseño

### 1.1 Principios Fundamentales

NUCLEUS usa un sistema de **comandos auto-contenidos y auto-descubiertos**:

```
✅ CORRECTO: Cada comando es un archivo independiente
internal/
├── analytics/
│   └── heartbeat.go         # Contiene comando "heartbeat"
├── governance/
│   ├── alfred.go            # Contiene comando "alfred"
│   └── audit.go             # Contiene comando "audit"
├── system/
│   ├── info.go              # Contiene comando "info"
│   └── version.go           # Contiene comando "version"
└── vault/
    └── vault.go             # Contiene comando "vault"

❌ INCORRECTO: NO organizar por categorías en el filesystem
commands/
├── system/
│   ├── info.go
│   └── version.go
└── governance/
    └── init.go
```

### 1.2 ¿Por Qué Auto-Contenido?

1. **Descubrimiento Dinámico**: El comando se registra automáticamente al importarse
2. **Ubicación Flexible**: El archivo puede vivir donde tenga más sentido lógico
3. **Sin Dependencias Cruzadas**: Cada comando es una unidad atómica
4. **Fácil Extensión**: Agregar comando = crear archivo + importar paquete

### 1.3 Flujo de Vida de un Comando

```
1. Desarrollador crea "mi_comando.go" en internal/[modulo]/
2. El archivo define init() que llama core.RegisterCommand()
3. main.go importa el paquete: _ "nucleus/internal/[modulo]"
4. Al compilar, init() se ejecuta automáticamente
5. El comando queda registrado en el registry global
6. CLI construye el árbol de comandos dinámicamente
7. help_renderer genera documentación automáticamente
```

---

## 2. Sistema de Categorías

### 2.1 Categorías como Metadata

Las categorías **NO** definen la estructura de carpetas. Son **etiquetas** que se asignan a cada comando para organizar la ayuda.

**⚠️ IMPORTANTE**: La ubicación física del archivo `.go` NO determina la categoría del comando.

| Categoría | Descripción | Ejemplos Reales |
|-----------|-------------|----------------|
| **`SYSTEM`** | Información base y diagnóstico | `internal/system/version.go`, `internal/system/info.go` |
| **`GOVERNANCE`** | Inicialización y autoridad | `internal/governance/alfred.go`, `internal/governance/audit.go` |
| **`VAULT`** | Operaciones de bóveda segura | `internal/vault/vault.go` |
| **`ANALYTICS`** | Monitoreo y telemetría | `internal/analytics/heartbeat.go` |
| **`ORCHESTRATION`** | Workflows con Temporal | `internal/orchestration/workflows/*.go` |
| **`SYNAPSE`** | Comandos especiales de integración | `internal/synapse/commands.go` (caso especial) |

### 2.2 Configuración Visual de Categorías

El orden y descripción de las categorías en el help se define en `internal/cli/config.go`:

```go
func DefaultNucleusConfig() HelpConfig {
    return HelpConfig{
        CategoryOrder: []string{
            "SYSTEM",
            "GOVERNANCE",
            "ANALYTICS",
            "VAULT",
            "ORCHESTRATION",
            "SYNAPSE",
        },
        CategoryDescs: map[string]string{
            "SYSTEM":        "System information and diagnostics",
            "GOVERNANCE":    "Organization initialization and authority",
            "ANALYTICS":     "System monitoring and telemetry",
            "VAULT":         "Secure key and credential management",
            "ORCHESTRATION": "Temporal workflow orchestration and lifecycle",
            "SYNAPSE":       "Integration commands for Sentinel orchestration",
        },
    }
}
```

**Regla de Oro**: Si agregas una nueva categoría, actualiza `config.go` para que aparezca en el help.

---

## 3. Anatomía de un Comando

### 3.1 Plantilla de Comando Auto-Contenido

Un comando en NUCLEUS es un archivo `.go` que:
1. Vive en cualquier paquete dentro de `internal/`
2. Se auto-registra en `init()`
3. Define toda su lógica internamente
4. No depende de otros comandos

```go
// File: internal/analytics/heartbeat.go
// Ubicación física: donde tenga sentido el dominio del comando
package analytics

import (
	"nucleus/internal/core"
	"nucleus/internal/governance"
	"github.com/spf13/cobra"
)

// init se ejecuta automáticamente cuando se importa el paquete
func init() {
	// PASO 1: Registrar el comando en una categoría
	core.RegisterCommand("ANALYTICS", createHeartbeatCommand)
}

// PASO 2: Factory function que crea el comando
func createHeartbeatCommand(c *core.Core) *cobra.Command {
	// Variables para flags (scope local al comando)
	var interval int
	var continuous bool

	cmd := &cobra.Command{
		// Sintaxis del comando
		Use:   "heartbeat [target]",
		
		// Descripción corta (aparece en listados)
		Short: "Send health heartbeat to monitoring system",
		
		// Descripción larga (aparece en --help)
		Long: `Send periodic health heartbeats to the central monitoring system.
		
The heartbeat includes:
- System vitals (CPU, Memory, Disk)
- Active workflow status
- Governance compliance state`,
		
		// Validación de argumentos
		Args: cobra.MaximumNArgs(1),
		
		// Ejemplo de uso
		Example: `  nucleus heartbeat
  nucleus heartbeat central-server
  nucleus heartbeat --interval 60 --continuous`,

		// PASO 3: Lógica de ejecución
		Run: func(cmd *cobra.Command, args []string) {
			target := "default"
			if len(args) > 0 {
				target = args[0]
			}

			// Verificar autoridad si es necesario
			// (no todos los comandos necesitan autorización)
			if continuous {
				if err := governance.RequireMaster(c); err != nil {
					c.Logger.Error("⛔ Continuous mode requires Master role")
					return
				}
			}

			// Ejecutar lógica (ver función separada abajo)
			result, err := sendHeartbeat(c, target, interval, continuous)
			if err != nil {
				c.Logger.Error("❌ Heartbeat failed: %v", err)
				return
			}

			// Output (JSON o humano)
			if c.Config.OutputJSON {
				c.OutputJSON(result)
				return
			}

			c.Logger.Success("✅ Heartbeat sent to %s", target)
			c.Logger.Info("   Status: %s", result.Status)
			c.Logger.Info("   Latency: %dms", result.Latency)
		},
	}

	// PASO 4: Definir flags
	cmd.Flags().IntVarP(&interval, "interval", "i", 30, "Heartbeat interval in seconds")
	cmd.Flags().BoolVarP(&continuous, "continuous", "c", false, "Run continuously")

	return cmd
}

// PASO 5: Lógica de negocio separada (testeable, reutilizable)
type HeartbeatResult struct {
	Status  string `json:"status"`
	Latency int    `json:"latency_ms"`
	Target  string `json:"target"`
}

func sendHeartbeat(c *core.Core, target string, interval int, continuous bool) (*HeartbeatResult, error) {
	// Implementación real del heartbeat
	// Esta función es testeable independientemente de Cobra
	
	result := &HeartbeatResult{
		Status:  "healthy",
		Latency: 45,
		Target:  target,
	}
	
	return result, nil
}
```

### 3.2 Elementos Esenciales

| Elemento | Obligatorio | Descripción |
|----------|-------------|-------------|
| `init()` | ✅ Sí | Auto-registra el comando |
| `core.RegisterCommand()` | ✅ Sí | Conecta con el registry |
| Factory function | ✅ Sí | Retorna `*cobra.Command` |
| `Use` | ✅ Sí | Define sintaxis y nombre |
| `Short` | ✅ Sí | Descripción de una línea |
| `Run` | ✅ Sí | Lógica de ejecución |
| `Long` | ⚠️ Recomendado | Documentación detallada |
| `Example` | ⚠️ Recomendado | Casos de uso |
| `Args` | ⚠️ Recomendado | Validación de argumentos |
| Flags | ❌ Opcional | Según necesidad |
| Lógica separada | ⚠️ Recomendado | Para testing |

### 3.3 Patrones de Validación de Argumentos

```go
// Sin argumentos
Args: cobra.NoArgs,

// Exactamente N argumentos
Args: cobra.ExactArgs(2),

// Mínimo N argumentos  
Args: cobra.MinimumNArgs(1),

// Máximo N argumentos
Args: cobra.MaximumNArgs(1),

// Rango de argumentos
Args: cobra.RangeArgs(1, 3),

// Validación personalizada
Args: func(cmd *cobra.Command, args []string) error {
    if len(args) < 1 {
        return fmt.Errorf("requiere al menos un argumento")
    }
    if !isValidEmail(args[0]) {
        return fmt.Errorf("email inválido: %s", args[0])
    }
    return nil
},
```

### 3.4 ¿Dónde Poner el Archivo?

```
✅ CORRECTO: Por dominio lógico
internal/
├── analytics/
│   └── heartbeat.go        # Comando de telemetría
├── governance/
│   └── audit.go            # Comando de auditoría
└── vault/
    └── vault.go            # Comando de bóveda

❌ INCORRECTO: Por categoría de help
internal/
└── commands/
    ├── analytics/          # NO crear carpeta "commands"
    └── governance/
```

**Regla**: Pon el comando donde vive su lógica de dominio, no donde aparece en el help.

---

## 4. Sistema de Auto-Registro

### 4.1 Registry Centralizado

El registro vive en `internal/core/registry.go`:

```go
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
   _ "nucleus/internal/analytics"   ← Importa analytics/heartbeat.go
   _ "nucleus/internal/governance"  ← Importa governance/*.go
   _ "nucleus/internal/system"      ← Importa system/*.go

2. Go ejecuta init() de cada archivo importado
   analytics/heartbeat.go → init() → core.RegisterCommand("ANALYTICS", ...)
   governance/audit.go    → init() → core.RegisterCommand("GOVERNANCE", ...)
   system/version.go      → init() → core.RegisterCommand("SYSTEM", ...)

3. Registry global ahora contiene:
   {
     "ANALYTICS": [heartbeatFactory],
     "GOVERNANCE": [auditFactory, alfredFactory, ...],
     "SYSTEM": [versionFactory, infoFactory]
   }

RUNTIME:
4. CLI llama GetCommands(core) → construye todos los cobra.Command
5. help_renderer agrupa por categoría y genera output
```

### 4.3 Activación de un Nuevo Comando

**PASO 1**: Crear el archivo del comando

```go
// internal/analytics/metrics.go
package analytics

import (
	"nucleus/internal/core"
	"github.com/spf13/cobra"
)

func init() {
	core.RegisterCommand("ANALYTICS", createMetricsCommand)
}

func createMetricsCommand(c *core.Core) *cobra.Command {
	return &cobra.Command{
		Use:   "metrics",
		Short: "Display system metrics",
		Run: func(cmd *cobra.Command, args []string) {
			// ...
		},
	}
}
```

**PASO 2**: Asegurar que el paquete está importado en `main.go`

```go
// main.go
package main

import (
    _ "nucleus/internal/analytics"  // ← Este import ejecuta init()
    // ...
)
```

**PASO 3**: Compilar y ejecutar

```bash
go build -o nucleus.exe
nucleus help  # El comando "metrics" aparece automáticamente
```

### 4.4 Imports en main.go

```go
// main.go - Estructura típica
package main

import (
    "nucleus/internal/core"
    "nucleus/internal/cli"
    
    // IMPORTS CIEGOS: Solo para ejecutar init()
    _ "nucleus/internal/analytics"     // Registra: heartbeat
    _ "nucleus/internal/governance"    // Registra: alfred, audit, etc.
    _ "nucleus/internal/orchestration" // Registra: workflow, temporal, etc.
    _ "nucleus/internal/synapse"       // Registra: comandos especiales
    _ "nucleus/internal/system"        // Registra: version, info
    _ "nucleus/internal/vault"         // Registra: vault
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

**⚠️ CRÍTICO**: Si creas un comando en un paquete nuevo, **debes** agregar el import ciego en `main.go`.

### 4.5 ¿Qué NO Hacer?

```go
// ❌ NO crear registry por carpeta
// ❌ NO usar convenciones de naming para descubrimiento
// ❌ NO requerir configuración externa para activar comandos
// ❌ NO depender de orden de carga

// ✅ SÍ usar init() + RegisterCommand
// ✅ SÍ mantener comandos auto-contenidos
// ✅ SÍ importar el paquete en main.go
```

---

## 5. Integración con Electron

### 5.1 Modo JSON

NUCLEUS soporta salida JSON para automatización y frontends:

```bash
nucleus --json version
nucleus --json heartbeat
nucleus --json vault status
```

### 5.2 Implementación de JSON Output

```go
func (c *Core) OutputJSON(data interface{}) {
    if c.Config.OutputJSON {
        encoder := json.NewEncoder(os.Stdout)
        encoder.SetIndent("", "  ")
        encoder.Encode(data)
    }
}

// Estructura estándar de respuesta
type Response struct {
    Success bool        `json:"success"`
    Message string      `json:"message,omitempty"`
    Data    interface{} `json:"data,omitempty"`
    Error   string      `json:"error,omitempty"`
}

// En el comando
Run: func(cmd *cobra.Command, args []string) {
    result := doSomething()
    
    if c.Config.OutputJSON {
        c.OutputJSON(Response{
            Success: true,
            Data:    result,
        })
        return
    }
    
    c.Logger.Success("✅ Operation completed")
}
```

### 5.3 Metadata JSON del Sistema de Ayuda

Para exponer toda la estructura de comandos a Electron:

```bash
nucleus help --json > commands.json
```

Esto genera un JSON completo con todos los comandos, flags, argumentos y ejemplos que Electron puede consumir.

---

## 6. Comandos Especiales: Synapse

### 6.1 ¿Qué es Synapse?

**Synapse** es la **única excepción** al patrón de comandos auto-contenidos. 

Es un módulo especial en `internal/synapse/commands.go` que agrupa **comandos de integración** con Sentinel y Temporal.

### 6.2 ¿Por Qué es Especial?

| Aspecto | Comandos Normales | Synapse |
|---------|------------------|---------|
| **Ubicación** | Archivos separados por dominio | Todos en `commands.go` |
| **Propósito** | Funcionalidad atómica | Orquestación de sistemas |
| **Dependencias** | Mínimas | Fuerte acoplamiento con Temporal |
| **Registro** | `init()` en cada archivo | `init()` único en `commands.go` |

### 6.3 Estructura de Synapse

```go
// internal/synapse/commands.go
package synapse

import (
	"nucleus/internal/core"
	"github.com/spf13/cobra"
)

func init() {
	// Un solo init() que registra múltiples comandos
	core.RegisterCommand("SYNAPSE", createSynapseCommands)
}

func createSynapseCommands(c *core.Core) *cobra.Command {
	// Comando raíz de synapse
	cmd := &cobra.Command{
		Use:   "synapse",
		Short: "Synapse integration commands",
	}

	// Agregar subcomandos
	cmd.AddCommand(createLaunchCommand(c))
	cmd.AddCommand(createStopCommand(c))
	cmd.AddCommand(createStatusCommand(c))

	return cmd
}

// Subcomandos específicos
func createLaunchCommand(c *core.Core) *cobra.Command {
	return &cobra.Command{
		Use:   "launch <profile>",
		Short: "Launch Sentinel profile via Temporal",
		Args:  cobra.ExactArgs(1),
		Run: func(cmd *cobra.Command, args []string) {
			// Integración con Temporal workflow
			// ...
		},
	}
}

func createStopCommand(c *core.Core) *cobra.Command {
	// ...
}

func createStatusCommand(c *core.Core) *cobra.Command {
	// ...
}
```

### 6.4 ¿Cuándo Usar el Patrón Synapse?

**✅ Usa Synapse (múltiples comandos en un archivo) si:**
- Los comandos están **fuertemente acoplados** entre sí
- Comparten lógica compleja de integración (ej: cliente Temporal)
- Son parte de un **flujo de orquestación** interdependiente
- Modificar uno afecta directamente a los otros

**❌ NO uses Synapse (crea comandos separados) si:**
- Los comandos son funcionalmente independientes
- Pertenecen a dominios diferentes
- Pueden evolucionar sin afectarse mutuamente
- Son comandos "normales" de CRUD o información

### 6.5 Ejemplo: ¿Synapse o No?

```go
// ❌ NO usar Synapse para esto:
// internal/governance/audit.go
// internal/governance/constitution.go
// Aunque están en el mismo paquete, son independientes

// ✅ SÍ usar Synapse para esto:
// internal/synapse/commands.go con:
//   - launch (inicia workflow)
//   - stop (cancela workflow)  
//   - status (query workflow)
// Todos dependen del mismo cliente Temporal
```

---

## 7. Buenas Prácticas

### 7.1 Principios de Diseño

| Principio | Descripción | Implementación |
|-----------|-------------|----------------|
| **Auto-Contenido** | Un comando = un archivo completo | Todo en el mismo `.go`: init(), factory, lógica |
| **Atomicidad** | Operaciones todo-o-nada | Usar archivos temporales para escrituras críticas |
| **Autorización** | Verificar roles antes de ejecutar | `governance.RequireMaster()` al inicio del `Run` |
| **Idempotencia** | Mismo resultado en múltiples ejecuciones | Verificar estado antes de modificar |
| **Reversibilidad** | Poder deshacer operaciones | Diseñar comandos con contrapartes |
| **Observabilidad** | Logging estructurado | Usar `c.Logger` con niveles apropiados |

### 7.2 Manejo de Archivos Críticos

```go
// ❌ MAL: Escritura directa a blueprint.json
func guardarBlueprint(data []byte) error {
    return os.WriteFile("blueprint.json", data, 0644)
}

// ✅ BIEN: Escritura atómica con archivo temporal
func guardarBlueprint(data []byte) error {
    tempFile := "blueprint.json.tmp"
    targetFile := "blueprint.json"
    
    // 1. Escribir a temporal
    if err := os.WriteFile(tempFile, data, 0644); err != nil {
        return fmt.Errorf("failed to write temp file: %w", err)
    }
    
    // 2. Mover atómicamente (operación atómica del SO)
    if err := os.Rename(tempFile, targetFile); err != nil {
        os.Remove(tempFile) // Cleanup
        return fmt.Errorf("failed to rename: %w", err)
    }
    
    return nil
}
```

**¿Por qué?** Si el proceso se interrumpe durante `WriteFile`, el `blueprint.json` queda corrupto. Con rename atómico, el archivo original permanece intacto hasta que la nueva versión está completa.

### 7.3 Verificación de Roles

```go
// Diferentes niveles de autoridad
Run: func(cmd *cobra.Command, args []string) {
    // Para operaciones críticas de gobernanza
    if err := governance.RequireMaster(c); err != nil {
        c.Logger.Error("⛔ Esta operación requiere rol Master")
        return
    }
    
    // Para operaciones de arquitectura  
    if err := governance.RequireArchitect(c); err != nil {
        c.Logger.Error("⛔ Esta operación requiere rol Architect o superior")
        return
    }
    
    // Para operaciones generales del equipo
    if err := governance.RequireTeamMember(c); err != nil {
        c.Logger.Error("⛔ Esta operación requiere membresía del equipo")
        return
    }
    
    // Operaciones de solo lectura no necesitan verificación
}
```

### 7.4 Logging Estructurado

```go
// Niveles de logging apropiados
c.Logger.Debug("Leyendo configuración desde %s", configPath)    // Detalles técnicos
c.Logger.Info("Equipo tiene %d miembros activos", count)        // Información relevante
c.Logger.Warn("Certificado expira en %d días", days)            // Advertencias
c.Logger.Error("Fallo al conectar con vault: %v", err)          // Errores recuperables
c.Logger.Success("✅ Blueprint actualizado correctamente")       // Operaciones exitosas

// ❌ MAL: Usar fmt.Println
fmt.Println("Operation completed")

// ✅ BIEN: Usar Logger con contexto
c.Logger.Success("✅ Operation completed: %s", operationName)
```

### 7.5 Separación de Lógica de Negocio

```go
// ❌ MAL: Toda la lógica en Run()
Run: func(cmd *cobra.Command, args []string) {
    // 200 líneas de lógica aquí...
    // No es testeable
    // No es reutilizable
}

// ✅ BIEN: Lógica separada en funciones
Run: func(cmd *cobra.Command, args []string) {
    // Validación y setup
    target := args[0]
    
    // Llamar a función de negocio
    result, err := processTarget(c, target, options)
    if err != nil {
        c.Logger.Error("❌ Failed: %v", err)
        return
    }
    
    // Output
    displayResult(c, result)
}

// Función testeable independiente
func processTarget(c *core.Core, target string, opts Options) (*Result, error) {
    // Lógica de negocio
    return &Result{}, nil
}
```

### 7.6 Flags con Valores Por Defecto Sensatos

```go
// ✅ BIEN: Defaults que funcionan para el 80% de casos
cmd.Flags().IntVarP(&interval, "interval", "i", 30, "Heartbeat interval in seconds")
cmd.Flags().StringVarP(&format, "format", "f", "json", "Output format (json|yaml|text)")
cmd.Flags().BoolVarP(&verbose, "verbose", "v", false, "Enable verbose output")

// ❌ MAL: Forzar al usuario a especificar siempre
cmd.Flags().IntVarP(&interval, "interval", "i", 0, "Heartbeat interval (required)")
cmd.MarkFlagRequired("interval")  // Solo si realmente es necesario
```

### 7.7 Nombres de Comandos Claros

```go
// ✅ BIEN: Nombres descriptivos que indican acción
Use: "heartbeat"           // Sustantivo-acción
Use: "launch <profile>"    // Verbo + objeto
Use: "vault seal"          // Objeto + acción

// ❌ MAL: Nombres ambiguos
Use: "do"
Use: "run"
Use: "execute"
```

### 7.8 Documentación en Long

```go
Long: `Descripción completa que explica:

1. QUÉ hace el comando
2. CUÁNDO usarlo
3. QUÉ efectos tiene
4. QUÉ permisos requiere

Ejemplo:
Send periodic health heartbeats to the central monitoring system.

This command reports:
- System vitals (CPU, Memory, Disk)
- Active workflow status  
- Governance compliance state

Requires: Team membership (no special role needed)
Effects: Creates telemetry entries in analytics database`,
```

---

## 8. Checklist de Desarrollo

### 8.1 Antes de Escribir Código

- [ ] ¿El comando tiene un propósito claro y único?
- [ ] ¿La categoría existe en `internal/cli/config.go`?
- [ ] ¿Dónde debe vivir el archivo? (por dominio, no por categoría)
- [ ] ¿Ya existe un comando similar que pueda servir de referencia?

### 8.2 Estructura del Archivo

- [ ] El archivo tiene `package [nombre_apropiado]`
- [ ] Tiene función `init()` que registra el comando
- [ ] La factory function retorna `*cobra.Command`
- [ ] La categoría en `RegisterCommand()` es correcta
- [ ] El `Use` sigue la convención de naming
- [ ] El `Short` es claro y conciso (máx 60 caracteres)
- [ ] El `Long` explica contexto, propósito y efectos
- [ ] El `Example` muestra casos de uso reales con `nucleus` como prefijo

### 8.3 Validación y Seguridad

- [ ] `Args` valida correctamente el número de argumentos
- [ ] Se verifica el rol si la operación es sensible
- [ ] Los errores se manejan apropiadamente (no panic)
- [ ] Las operaciones sobre archivos críticos son atómicas
- [ ] Los secrets/passwords no se loggean nunca

### 8.4 Flags y Opciones

- [ ] Los flags tienen nombres descriptivos
- [ ] Los shortcuts (`-f`, `-v`) no colisionan con flags globales
- [ ] Los defaults son sensatos para el 80% de casos
- [ ] Los flags requeridos realmente son necesarios
- [ ] La ayuda de cada flag es clara

### 8.5 Output y Logging

- [ ] El comando soporta modo `--json` (verifica `c.Config.OutputJSON`)
- [ ] Los logs usan `c.Logger` en vez de `fmt.Println`
- [ ] Los niveles de log son apropiados (Debug/Info/Warn/Error/Success)
- [ ] Los mensajes de éxito son claros y útiles
- [ ] Los mensajes de error indican cómo resolver el problema

### 8.6 Lógica de Negocio

- [ ] La lógica está separada del handler de Cobra
- [ ] Las funciones de negocio son testeables independientemente
- [ ] No hay código duplicado con otros comandos
- [ ] Las operaciones son idempotentes cuando es posible
- [ ] Hay manejo de rollback si la operación falla a medias

### 8.7 Integración

- [ ] El paquete está importado en `main.go` (import ciego `_`)
- [ ] El comando aparece en `nucleus help`
- [ ] El comando está en la categoría correcta del help
- [ ] Funciona con `nucleus --json [comando]`
- [ ] Funciona con `nucleus [comando] --help`

### 8.8 Testing Manual

```bash
# Probar sin argumentos
nucleus micomando

# Probar con argumentos inválidos  
nucleus micomando invalid-arg

# Probar modo ayuda
nucleus micomando --help

# Probar modo JSON
nucleus --json micomando arg

# Probar sin permisos (si aplica)
nucleus micomando arg  # sin rol Master

# Probar flags
nucleus micomando arg --flag1 value --flag2
```

### 8.9 Casos Especiales

Si tu comando es del tipo Synapse (múltiples comandos relacionados):
- [ ] ¿Realmente necesitan estar en el mismo archivo?
- [ ] ¿Comparten estado complejo (ej: cliente Temporal)?
- [ ] ¿Modificar uno afecta a los otros?
- [ ] ¿Se documentó por qué se usa el patrón Synapse?

### 8.10 Documentación

- [ ] El código tiene comentarios explicando decisiones complejas
- [ ] Las estructuras de datos tienen comentarios
- [ ] Si el comando usa archivos de configuración, está documentado
- [ ] Si el comando tiene efectos secundarios, están documentados

### 8.11 Performance

- [ ] El comando no hace I/O innecesario
- [ ] No carga archivos grandes en memoria si no es necesario
- [ ] Las operaciones de red tienen timeouts
- [ ] No hay loops infinitos ni deadlocks potenciales

---

## 9. Ejemplos Completos

### 9.1 Comando Simple de Solo Lectura

```go
// internal/system/version.go
package system

import (
	"fmt"
	"nucleus/internal/core"
	"github.com/spf13/cobra"
)

func init() {
	core.RegisterCommand("SYSTEM", createVersionCommand)
}

func createVersionCommand(c *core.Core) *cobra.Command {
	return &cobra.Command{
		Use:   "version",
		Short: "Display version information",
		Long:  "Display detailed version information including build time and commit hash",
		Args:  cobra.NoArgs,
		
		Example: `  nucleus version
  nucleus --json version`,
		
		Run: func(cmd *cobra.Command, args []string) {
			info := c.GetBuildInfo()
			
			if c.Config.OutputJSON {
				c.OutputJSON(info)
				return
			}
			
			fmt.Printf("NUCLEUS v%s\n", info.Version)
			fmt.Printf("Build: %s\n", info.BuildTime)
			fmt.Printf("Commit: %s\n", info.CommitHash)
		},
	}
}
```

### 9.2 Comando con Autorización y Escritura

```go
// internal/governance/audit.go
package governance

import (
	"nucleus/internal/core"
	"nucleus/internal/governance"
	"github.com/spf13/cobra"
)

func init() {
	core.RegisterCommand("GOVERNANCE", createAuditCommand)
}

func createAuditCommand(c *core.Core) *cobra.Command {
	var export bool
	var format string

	cmd := &cobra.Command{
		Use:   "audit [action]",
		Short: "Perform governance audit",
		Long: `Perform a comprehensive audit of governance compliance.

This command verifies:
- Blueprint integrity
- Role assignments validity
- Vault seal status
- Team member credentials

Requires: Master role
Effects: Generates audit report in .governance/reports/`,

		Args: cobra.MaximumNArgs(1),
		
		Example: `  nucleus audit
  nucleus audit verify
  nucleus audit --export --format pdf`,

		Run: func(cmd *cobra.Command, args []string) {
			// 1. Verificar autorización
			if err := governance.RequireMaster(c); err != nil {
				c.Logger.Error("⛔ Audit requires Master role: %v", err)
				return
			}

			action := "verify"
			if len(args) > 0 {
				action = args[0]
			}

			// 2. Ejecutar audit
			report, err := performAudit(c, action)
			if err != nil {
				c.Logger.Error("❌ Audit failed: %v", err)
				return
			}

			// 3. Exportar si se solicita
			if export {
				if err := exportReport(c, report, format); err != nil {
					c.Logger.Error("❌ Export failed: %v", err)
					return
				}
			}

			// 4. Output
			if c.Config.OutputJSON {
				c.OutputJSON(report)
				return
			}

			c.Logger.Success("✅ Audit completed")
			c.Logger.Info("   Issues found: %d", report.IssueCount)
			c.Logger.Info("   Compliance: %.1f%%", report.ComplianceScore)
		},
	}

	cmd.Flags().BoolVarP(&export, "export", "e", false, "Export audit report")
	cmd.Flags().StringVarP(&format, "format", "f", "json", "Export format (json|pdf|html)")

	return cmd
}

type AuditReport struct {
	IssueCount      int     `json:"issue_count"`
	ComplianceScore float64 `json:"compliance_score"`
	Timestamp       string  `json:"timestamp"`
}

func performAudit(c *core.Core, action string) (*AuditReport, error) {
	// Lógica de audit...
	return &AuditReport{
		IssueCount:      2,
		ComplianceScore: 95.5,
		Timestamp:       "2025-02-06T10:00:00Z",
	}, nil
}

func exportReport(c *core.Core, report *AuditReport, format string) error {
	// Lógica de export atómico...
	return nil
}
```

### 9.3 Comando con Subcomandos (Patrón Normal)

```go
// internal/vault/vault.go
package vault

import (
	"nucleus/internal/core"
	"nucleus/internal/governance"
	"github.com/spf13/cobra"
)

func init() {
	core.RegisterCommand("VAULT", createVaultCommand)
}

func createVaultCommand(c *core.Core) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "vault",
		Short: "Manage secure vault",
		Long:  "Manage the secure credential vault for the organization",
	}

	// Agregar subcomandos como funciones locales
	cmd.AddCommand(createStatusSubcommand(c))
	cmd.AddCommand(createSealSubcommand(c))
	cmd.AddCommand(createUnsealSubcommand(c))

	return cmd
}

func createStatusSubcommand(c *core.Core) *cobra.Command {
	return &cobra.Command{
		Use:   "status",
		Short: "Check vault status",
		Args:  cobra.NoArgs,
		
		Run: func(cmd *cobra.Command, args []string) {
			status := checkVaultStatus(c)
			
			if c.Config.OutputJSON {
				c.OutputJSON(status)
				return
			}
			
			c.Logger.Info("Vault Status: %s", status.State)
			c.Logger.Info("Sealed: %v", status.Sealed)
		},
	}
}

func createSealSubcommand(c *core.Core) *cobra.Command {
	var force bool

	cmd := &cobra.Command{
		Use:   "seal",
		Short: "Seal the vault",
		Long:  "Seal the vault to prevent access to credentials",
		Args:  cobra.NoArgs,

		Run: func(cmd *cobra.Command, args []string) {
			if err := governance.RequireMaster(c); err != nil {
				c.Logger.Error("⛔ Seal requires Master role")
				return
			}

			if !force {
				c.Logger.Warn("⚠️  This will seal the vault. Use --force to confirm")
				return
			}

			if err := sealVault(c); err != nil {
				c.Logger.Error("❌ Failed to seal: %v", err)
				return
			}

			c.Logger.Success("✅ Vault sealed")
		},
	}

	cmd.Flags().BoolVarP(&force, "force", "f", false, "Force seal without confirmation")
	return cmd
}

func createUnsealSubcommand(c *core.Core) *cobra.Command {
	// Similar a seal...
	return &cobra.Command{Use: "unseal", Short: "Unseal the vault"}
}

type VaultStatus struct {
	State  string `json:"state"`
	Sealed bool   `json:"sealed"`
}

func checkVaultStatus(c *core.Core) *VaultStatus {
	return &VaultStatus{State: "healthy", Sealed: false}
}

func sealVault(c *core.Core) error {
	return nil
}
```

---

## 10. Troubleshooting

### 10.1 "Mi comando no aparece en help"

**Causas posibles:**
1. El paquete no está importado en `main.go`
2. La función `init()` no se está ejecutando
3. La categoría no existe en `config.go`

**Solución:**
```bash
# Verificar que el paquete está importado
grep "internal/mimodulo" main.go

# Verificar que la categoría existe
grep "MI_CATEGORIA" internal/cli/config.go

# Compilar con verbose
go build -v
```

### 10.2 "Error: unknown command"

**Causa:** El comando se registró pero algo falla en la construcción del árbol.

**Solución:**
```go
// Verificar que el factory retorna un comando válido
func createMiComando(c *core.Core) *cobra.Command {
	cmd := &cobra.Command{
		Use: "micomando",  // ← Debe estar presente
		// ...
	}
	return cmd  // ← No retornar nil
}
```

### 10.3 "El JSON output no funciona"

**Causa:** No se verifica `c.Config.OutputJSON`.

**Solución:**
```go
Run: func(cmd *cobra.Command, args []string) {
	result := doSomething()
	
	// ✅ SIEMPRE verificar el flag JSON
	if c.Config.OutputJSON {
		c.OutputJSON(result)
		return  // ← IMPORTANTE: return después de JSON
	}
	
	// Output humano
	c.Logger.Success("Done")
}
```

---

## 11. Recursos Adicionales

### 12.1 Documentación de Referencia

- **Cobra**: https://github.com/spf13/cobra
- **pflag**: https://github.com/spf13/pflag  
- **Go init()**: https://go.dev/doc/effective_go#init

### 12.2 Comandos Útiles

```bash
# Ver todos los comandos registrados
nucleus help

# Ver estructura detallada
nucleus help --json | jq .

# Ver ayuda de comando específico
nucleus vault seal --help

# Modo verbose
nucleus --verbose heartbeat

# Compilar y probar
go build -o nucleus.exe && nucleus version
```

---

## 📝 Notas Finales

1. **Un comando = un archivo**: Cada comando es auto-contenido y se registra automáticamente.

2. **La ubicación no importa**: El archivo vive donde tiene sentido por dominio, no por categoría del help.

3. **Synapse es la excepción**: Solo usa el patrón multi-comando cuando hay acoplamiento fuerte (ej: Temporal).

4. **Atomicidad es crítica**: NUCLEUS es la fuente de verdad. Operaciones fallidas no deben corromper el estado.

5. **JSON siempre**: Todo comando debe funcionar con `--json` para integración con Electron.

6. **Import ciegos**: Recuerda agregar `_ "nucleus/internal/[paquete]"` en `main.go`.

7. **Roles primero**: Verifica autorización antes de ejecutar operaciones sensibles.

8. **Help es documentación**: Invierte tiempo en `Short`, `Long` y `Example` - es tu documentación primaria.

---

**Versión**: 2.0  
**Última actualización**: Febrero 2025  
**Arquitectura**: Auto-Discovery con Init Functions  
**Mantenedor**: Equipo Bloom Core