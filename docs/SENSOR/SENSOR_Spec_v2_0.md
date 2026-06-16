# bloom-sensor — Especificación Maestra
## Ecosistema Bloom / Cognituum
**Versión**: 2.0  
**Fecha**: Junio 2026  
**Estado**: Fuente de verdad activa  
**Scope**: `bloom-development-extension/sensor`

---

## Índice

1. [Filosofía y postura](#1-filosofía-y-postura)
2. [Lugar en el ecosistema](#2-lugar-en-el-ecosistema)
3. [Estructura del repositorio](#3-estructura-del-repositorio)
4. [Arquitectura interna](#4-arquitectura-interna)
5. [Modelo de datos base](#5-modelo-de-datos-base)
6. [Modelo de métricas](#6-modelo-de-métricas)
7. [Estados cognitivos](#7-estados-cognitivos)
8. [CLI — Referencia completa](#8-cli--referencia-completa)
9. [Runtime loop](#9-runtime-loop)
10. [Transporte — Integración con Sentinel](#10-transporte--integración-con-sentinel)
11. [Startup automático (HKCU / launchd / systemd)](#11-startup-automático)
12. [Logging y telemetría](#12-logging-y-telemetría)
13. [Contrato con Metamorph](#13-contrato-con-metamorph)
14. [Roadmap — Features futuras](#14-roadmap--features-futuras)
15. [Decisiones de diseño pendientes](#15-decisiones-de-diseño-pendientes)
16. [Checklist de implementación](#16-checklist-de-implementación)

---

## 1. Filosofía y postura

Sensor es el componente del ecosistema Bloom que escucha al humano. No interpreta intenciones, no ejecuta mandates, no toma decisiones — **mide presencia y publica estado**.

Esa austeridad es intencional.

En un momento donde la industria apunta sistemáticamente a remover al humano del loop operativo, Sensor representa la postura contraria: **la presencia humana no es el problema a resolver, es la señal más valiosa del sistema**. Un sistema que requiere al humano para funcionar bien no es un sistema incompleto — es un sistema honesto.

```
Sensor mide.
Nucleus decide.
Brain ejecuta.
Sentinel conecta.
Metamorph reconcilia.
```

Sensor no sabe si alguien lo escucha. Solo mide. Solo publica. Solo existe mientras el humano existe en sesión.

### Regla de oro del runtime

> El Core de Sensor **nunca bloquea** por dependencias externas.  
> Si Sentinel no está disponible, el Core arranca igual.  
> Si la sesión no puede detectarse, el Core arranca igual.  
> **Degradación elegante siempre.**

---

## 2. Lugar en el ecosistema

| Binario | Rol | Entorno |
|---|---|---|
| `bloom-nucleus` | Gobernanza organizacional | Windows Service, Session 0 |
| `bloom-brain` | Motor de ejecución Python | Windows Service, Session 0 |
| `bloom-sentinel` | Event Bus persistente | Windows Service, Session 0 |
| `bloom-metamorph` | Reconciliador declarativo de binarios | — |
| `bloom-conductor` | UI Electron | Session 1 |
| `bloom-sensor` | Runtime de presencia humana | **Session 1, proceso persistente** |

Todos los binarios Go siguen un patrón homogéneo:
- CLI con **Cobra**
- `--version` y `--json info` (contrato con Metamorph)
- Canal `stable` / `beta`
- Logging estructurado JSON
- Convención uniforme de comandos

---

## 3. Estructura del repositorio

```
bloom-development-extension/
└── sensor/
    ├── README.md
    ├── cmd/
    │   └── main.go
    ├── go.mod
    ├── go.sum
    ├── internal/
    │   ├── buildinfo/
    │   │   └── buildinfo.go
    │   ├── cli/
    │   │   ├── config.go          ← Categorías, branding y HelpConfig
    │   │   ├── diagnostic.go      ← Comando diagnostic + subcomando tick
    │   │   ├── hcu.go             ← Comandos hcu compute y hcu summary
    │   │   ├── help_renderer.go   ← Renderer personalizado (derivado de Nucleus)
    │   │   ├── registry.go        ← BuildRootCommand y registro explícito
    │   │   └── replay.go          ← Comando replay
    │   ├── cmdregistry/
    │   │   └── cmdregistry.go
    │   ├── core/
    │   │   ├── build_info.go
    │   │   └── core.go            ← SensorCore: infraestructura + runtime
    │   ├── input/
    │   │   ├── idle.go            ← GetLastInputInfo (Windows)
    │   │   └── idle_unix.go       ← Equivalente Darwin/Linux
    │   ├── logger/
    │   │   └── logger.go          ← Logging estructurado JSON
    │   ├── metrics/
    │   │   ├── energy.go          ← ComputeEnergyIndex, ComputeFocusScore
    │   │   └── state.go           ← RingBuffer, HumanState, DetectPattern
    │   ├── runtime/
    │   │   ├── engine.go          ← Orquestador del loop principal
    │   │   ├── loop.go            ← Tick loop con context.Context
    │   │   └── scheduler.go       ← Programación de emisiones periódicas
    │   ├── session/
    │   │   ├── session_darwin.go
    │   │   ├── session_unix.go
    │   │   └── windows.go         ← Detección sesión activa/bloqueada
    │   ├── startup/
    │   │   ├── startup_darwin.go  ← launchd plist
    │   │   ├── startup_unix.go    ← systemd unit
    │   │   └── startup_windows.go ← HKCU\Run
    │   └── transport/
    │       └── sentinel_client.go ← Conexión a Sentinel (socket/pipe)
    ├── pkg/
    │   └── events/
    │       └── events.go          ← Tipos de eventos HUMAN_*, HumanState, HCU
    └── scripts/
        ├── build_number.darwin.txt
        ├── build_number.effective.txt
        ├── build_number.linux.txt
        ├── build_number.txt
        └── build_number.windows.txt
```

---

## 4. Arquitectura interna

### SensorCore

El `Core` de Sensor es el núcleo fisiológico del sistema — orientado a runtime continuo. Es distinto al `core.Core` de Nucleus, que es un centro administrativo orientado a comandos.

```go
// internal/core/core.go
package core

import (
    "context"
    "sync/atomic"

    "bloom-sensor/internal/logger"
    "bloom-sensor/internal/metrics"
    "bloom-sensor/internal/session"
    "bloom-sensor/internal/transport"
    "bloom-sensor/pkg/events"
)

type Config struct {
    Debug      bool
    Channel    string // "stable" | "beta"
    ConfigPath string
    OutputJSON bool   // Para comandos CLI (--json flag)
}

type Core struct {
    // Infraestructura
    Logger *logger.Logger
    Config *Config

    // Runtime
    SentinelClient *transport.Client
    SessionManager *session.Manager
    MetricsEngine  *metrics.Engine

    // Estado vivo
    CurrentState *events.HumanState
    Sequence     atomic.Uint64

    // Control del ciclo de vida
    Ctx    context.Context
    Cancel context.CancelFunc
}

func NewCore(cfg *Config) *Core {
    ctx, cancel := context.WithCancel(context.Background())
    return &Core{
        Logger:         logger.New(cfg.Debug),
        Config:         cfg,
        SentinelClient: transport.NewClient(),
        SessionManager: session.NewManager(),
        MetricsEngine:  metrics.NewEngine(),
        CurrentState:   &events.HumanState{},
        Ctx:            ctx,
        Cancel:         cancel,
    }
}
```

### Entry point (main.go)

```go
// cmd/main.go
package main

import (
    "os"

    "bloom-sensor/internal/cli"
    "bloom-sensor/internal/core"
)

func main() {
    cfg := &core.Config{
        Channel: "stable",
    }

    c := core.NewCore(cfg)
    root := cli.BuildRootCommand(c)

    if err := root.Execute(); err != nil {
        c.Logger.Error("Fatal: %v", err)
        os.Exit(1)
    }
}
```

### CLI — Patrón Cobra

Sensor usa **Cobra convencional** — sin auto-discovery. Los comandos se declaran explícitamente en `registry.go`.

**Coherencia externa. Simplicidad interna.**

Cada `cobra.Command` debe incluir `Annotations` con `category` y `json_response`:

```go
Annotations: map[string]string{
    "category":      "RUNTIME",  // SYSTEM | RUNTIME | LIFECYCLE | TELEMETRY | COGNITION
    "json_response": `{...}`,    // Ejemplo de respuesta JSON válida
},
```

---

## 5. Modelo de datos base

### HumanState

```go
// pkg/events/events.go
package events

import "time"

type EventType string

const (
    TypeHumanSessionActive  EventType = "HUMAN_SESSION_ACTIVE"
    TypeHumanSessionLocked  EventType = "HUMAN_SESSION_LOCKED"
    TypeHumanIdle           EventType = "HUMAN_IDLE"
    TypeHumanActive         EventType = "HUMAN_ACTIVE"
    TypeHumanStateUpdate    EventType = "HUMAN_STATE_UPDATE"
)

type HumanState struct {
    Type               EventType      `json:"type"`
    Sequence           uint64         `json:"sequence"`
    Timestamp          time.Time      `json:"timestamp"`
    SessionActive      bool           `json:"session_active"`
    SessionLocked      bool           `json:"session_locked"`
    IdleSeconds        int            `json:"idle_seconds"`
    EnergyIndex        float64        `json:"energy_index"`
    FocusScore         float64        `json:"focus_score"`
    FatigueProbability float64        `json:"fatigue_probability"`
    ActiveMinutes      int            `json:"active_minutes"`
    CognitiveState     CognitiveState `json:"cognitive_state,omitempty"`
}

// Formato de evento para Sentinel (protocolo 4 bytes + JSON)
func (s HumanState) ToEvent() Event {
    return Event{
        Type:     TypeHumanStateUpdate,
        Sequence: s.Sequence,
        Payload:  s,
    }
}

type Event struct {
    Type     EventType   `json:"type"`
    Sequence uint64      `json:"sequence"`
    Payload  interface{} `json:"payload"`
}

func NewEvent(t EventType, seq uint64, payload interface{}) Event {
    return Event{Type: t, Sequence: seq, Payload: payload}
}
```

### RingBuffer

El ring buffer almacena **1440 snapshots** — una jornada completa a 1 tick/minuto.

```go
// internal/metrics/state.go
type RingBuffer struct {
    mu       sync.RWMutex
    capacity int
    items    []events.HumanState
    head     int
    size     int
}

func (rb *RingBuffer) Push(s events.HumanState) { ... }
func (rb *RingBuffer) Last(n int) []events.HumanState { ... }
func (rb *RingBuffer) Since(d time.Duration) []events.HumanState { ... }
```

> **Nota**: El ring buffer es in-memory. Un reinicio del servicio lo borra. Ver sección [15 — Decisiones pendientes](#15-decisiones-de-diseño-pendientes) sobre persistencia opcional.

---

## 6. Modelo de métricas

### energy_index — Modelo determinista v1

`energy_index` es un float entre 0 y 1. Es determinista, auditable y reproducible — sin ML.

```go
// internal/metrics/energy.go
package metrics

import "math"

// Formula:
//   energy = 1.0
//          - (active_minutes / 600) * 0.4
//          - (idle_breaks_last_hour < threshold ? 0.2 : 0)
//   clamp(0, 1)

const (
    MaxActiveMinutes = 600.0
    ActivePenalty    = 0.4
    IdleBreakPenalty = 0.2
    IdleBreakMin     = 2 // mínimo de breaks por hora recomendados
)

func ComputeEnergyIndex(activeMinutes int, idleBreaksLastHour int) float64 {
    energy := 1.0
    energy -= (float64(activeMinutes) / MaxActiveMinutes) * ActivePenalty
    if idleBreaksLastHour < IdleBreakMin {
        energy -= IdleBreakPenalty
    }
    return math.Max(0, math.Min(1, energy))
}
```

### focus_score

`focus_score` mide la **calidad del patrón de actividad** en una ventana de tiempo — no solo la presencia. Un humano puede tener `energy_index` alto pero `focus_score` bajo si su actividad es errática.

```
focus_score = f(idle_regularity, session_continuity, context_switches_inverse)
```

Componentes:

| Componente | Descripción |
|---|---|
| `idle_regularity` | ¿Los breaks son regulares (flujo deliberado) o caóticos (distracción)? |
| `session_continuity` | Tiempo activo sin interrupción mayor |
| `context_switches_inverse` | Inversamente proporcional a cambios de ventana/proceso en la ventana |

Un `focus_score` alto con `energy_index` alto = trabajo sostenido y deliberado.  
Un `focus_score` bajo con `energy_index` alto = actividad intensa pero fragmentada.

```go
// internal/metrics/energy.go

// ComputeFocusScore — complementa a ComputeEnergyIndex, no lo reemplaza.
// window: slice de los últimos N snapshots del ring buffer
func ComputeFocusScore(window []Snapshot) float64 {
    // idle_regularity: coeficiente de variación de los intervalos de idle
    // session_continuity: minutos desde el último idle > threshold
    // context_switches_inverse: 1 / (1 + switches_in_window)
    // Retornar promedio ponderado de los tres componentes
}
```

---

## 7. Estados cognitivos

Los estados cognitivos son una capa de clasificación sobre el `energy_index` que transforma patrones del ring buffer en vocabulario semántico. El estado no se activa en un tick — **emerge de un patrón sostenido**.

### Tipos

```go
// internal/metrics/state.go

type CognitiveState string

const (
    CognitiveStateDeepFocus        CognitiveState = "DEEP_FOCUS"
    CognitiveStateActive           CognitiveState = "ACTIVE"
    CognitiveStateContextSwitching CognitiveState = "CONTEXT_SWITCHING"
    CognitiveStateRecoveryWindow   CognitiveState = "RECOVERY_WINDOW"
    CognitiveStateIdle             CognitiveState = "IDLE"
    CognitiveStateAbsent           CognitiveState = "ABSENT"
)
```

### Condiciones de activación

| Estado | Condición | Descripción |
|---|---|---|
| `DEEP_FOCUS` | `energy_index` > 0.75 sostenido por N ticks, pocos idle breaks | Activo, continuo, sin interrupciones propias |
| `ACTIVE` | `energy_index` > 0.50, patrón regular | Actividad normal de trabajo |
| `CONTEXT_SWITCHING` | Muchos cambios de actividad en ventana corta, `energy_index` variable | Atención fragmentada entre tareas |
| `RECOVERY_WINDOW` | `energy_index` < 0.30 tras período de `DEEP_FOCUS` | Caída deliberada o natural post-esfuerzo sostenido |
| `IDLE` | `energy_index` ≈ 0, sesión activa | Presencia física sin actividad computacional |
| `ABSENT` | Sin sesión activa | El humano no está en el sistema |

### Detector de patrones

```go
// internal/metrics/state.go

type CognitivePattern struct {
    State        CognitiveState `json:"state"`
    Since        time.Time      `json:"since"`
    TicksInState int            `json:"ticks_in_state"`
    Confidence   float64        `json:"confidence"`
}

// DetectPattern analiza la ventana del ring buffer y retorna el patrón actual.
// window: slice de los últimos N snapshots del ring buffer
func DetectPattern(window []Snapshot) CognitivePattern {
    // Calcular energía media, varianza, frecuencia de idle breaks
    // Retornar estado con nivel de confianza
}
```

---

## 8. CLI — Referencia completa

### Opciones globales

```
bloom-sensor [OPTIONS] <command> [args]

--json      Output en JSON (DEBE ir ANTES del comando)
--debug     Habilitar debug logging
--channel   Canal de release: stable|beta (default: stable)
--config    Path al archivo de configuración
--help      Mostrar ayuda
```

> ⚠️ **CRÍTICO**: `--json` DEBE colocarse ANTES del comando.  
> ✅ Correcto: `bloom-sensor --json info`  
> ❌ Incorrecto: `bloom-sensor info --json`

### Categorías y comandos

```
SYSTEM      Versión, identidad y contrato Metamorph          2 cmds
RUNTIME     Iniciar e inspeccionar el loop de presencia       3 cmds
LIFECYCLE   Gestión de autostart (HKCU / launchd / systemd)  2 cmds
TELEMETRY   Exportar snapshots de presencia                   1 cmd
COGNITION   Estados cognitivos, replay y HCU                  2 cmds
                                                     Total:  10 comandos
```

### config.go — Categorías

```go
// internal/cli/config.go
func DefaultSensorConfig() HelpConfig {
    return HelpConfig{
        AppName:     "🌱 BLOOM SENSOR",
        AppSubtitle: "Human Presence Runtime — Bloom Ecosystem",
        Width:       80,
        CategoryOrder: []string{
            "SYSTEM",
            "RUNTIME",
            "LIFECYCLE",
            "TELEMETRY",
            "COGNITION",
        },
        CategoryDescs: map[string]string{
            "SYSTEM":    "Binary identity and diagnostics",
            "RUNTIME":   "Process lifecycle and live state inspection",
            "LIFECYCLE": "Autostart registration and session management",
            "TELEMETRY": "Human metrics export and observability",
            "COGNITION": "Human cognitive effort measurement and session analysis",
        },
    }
}
```

### registry.go — Registro explícito

```go
// internal/cli/registry.go
func BuildRootCommand(c *core.Core) *cobra.Command {
    root := &cobra.Command{
        Use:           "bloom-sensor",
        Short:         "Human presence runtime for the Bloom ecosystem",
        SilenceUsage:  true,
        SilenceErrors: true,
    }

    // Flags globales
    root.PersistentFlags().BoolVar(&c.Config.Debug, "debug", false, "Enable debug logging")
    root.PersistentFlags().StringVar(&c.Config.Channel, "channel", "stable", "Release channel (stable|beta)")
    root.PersistentFlags().StringVar(&c.Config.ConfigPath, "config", "", "Config file path")
    root.PersistentFlags().BoolVar(&c.Config.OutputJSON, "json", false, "Output in JSON format")

    // SYSTEM
    root.AddCommand(createVersionCommand(c))
    root.AddCommand(createInfoCommand(c))

    // RUNTIME
    root.AddCommand(createRunCommand(c))
    root.AddCommand(createStatusCommand(c))
    root.AddCommand(createDiagnosticCommand(c))  // con subcomando tick

    // LIFECYCLE
    root.AddCommand(createEnableCommand(c))
    root.AddCommand(createDisableCommand(c))

    // TELEMETRY
    root.AddCommand(createExportCommand(c))

    // COGNITION
    root.AddCommand(createReplayCommand(c))
    root.AddCommand(createHCUCommand(c))         // con subcomandos compute y summary

    renderer := NewSensorHelpRenderer(os.Stdout, DefaultSensorConfig())
    root.SetHelpFunc(func(cmd *cobra.Command, args []string) {
        RenderFullHelp(root, renderer)
    })

    return root
}
```

---

### SYSTEM

#### `bloom-sensor version`

Imprime versión y datos de build.

```go
Annotations: map[string]string{
    "category": "SYSTEM",
    "json_response": `{
  "version": "1.0.0",
  "channel": "stable",
  "build": "42",
  "commit": "abc1234"
}`,
},
```

#### `bloom-sensor info`

Retorna identidad y contrato Metamorph. **Obligatorio para Metamorph** — debe incluir `name`, `version`, `channel`, `capabilities`, `requires`.

```go
Annotations: map[string]string{
    "category": "SYSTEM",
    "json_response": `{
  "name": "bloom-sensor",
  "version": "1.0.0",
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
```

---

### RUNTIME

#### `bloom-sensor run`

Inicia el loop persistente de detección de presencia.

Flags:
- `--foreground` — mantiene stdout abierto (útil para debugging)
- `--once` — ejecuta un solo tick y sale (modo diagnóstico)
- `--diagnostic` — modo verbose, imprime cada tick

```go
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

> ⚠️ `bloom-sensor` es un proceso de background — compilar con `-H=windowsgui`. Usar `run` solo en contexto de diagnóstico con `--once` o `--diagnostic`.

#### `bloom-sensor status`

Reporta estado del proceso, autostart y conexión a Sentinel. No requiere que el proceso esté vivo.

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

#### `bloom-sensor diagnostic`

Inspecciona el estado del engine en tiempo real.

**Subcomando: `bloom-sensor diagnostic tick`**

Ejecuta un tick completo de presencia e imprime el detalle de métricas.

Flags:
- `--window <n>` — número de snapshots pasados para inferencia cognitiva (default: 5)

```go
// Subcomando tick
Annotations: map[string]string{
    "category": "RUNTIME",
    "json_response": `{
  "timestamp": "2026-02-27T15:04:05Z",
  "session_active": true,
  "session_locked": false,
  "idle_seconds": 42,
  "energy_index": 0.94,
  "focus_score": 0.81,
  "cognitive_state": "DEEP_FOCUS",
  "ticks_in_state": 12,
  "state_confidence": 0.91,
  "sequence": 87,
  "sentinel_connected": true,
  "buffer_size": 42
}`,
},
```

---

### LIFECYCLE

#### `bloom-sensor enable`

Registra `BloomSensor` en HKCU\Run (Windows), launchd (Darwin) o systemd (Linux). Si existía clave `BloomLauncher`, la elimina. Idempotente.

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

#### `bloom-sensor disable`

Elimina la entrada de autostart. **No mata el proceso actual.** Idempotente.

```go
Annotations: map[string]string{
    "category": "LIFECYCLE",
    "json_response": `{
  "success": true,
  "removed": true
}`,
},
```

---

### TELEMETRY

#### `bloom-sensor export`

Vuelca el ring buffer interno a stdout.

Flags:
- `--last <duration>` — filtro de tiempo (ej: `24h`, `1h`, `30m`)
- `--format <json>` — formato de salida (default: `json`)

```go
Annotations: map[string]string{
    "category": "TELEMETRY",
    "json_response": `{
  "period": "24h",
  "samples": 1440,
  "avg_energy_index": 0.62,
  "avg_focus_score": 0.71,
  "total_active_minutes": 312,
  "snapshots": [
    {
      "timestamp": "2026-02-27T15:04:05Z",
      "session_active": true,
      "session_locked": false,
      "idle_seconds": 12,
      "energy_index": 0.99,
      "sequence": 47
    }
  ]
}`,
},
```

---

### COGNITION

#### `bloom-sensor replay`

Re-ejecuta la inferencia cognitiva sobre snapshots históricos del ring buffer. No requiere ML ni estado externo — aritmética pura sobre snapshots almacenados.

Flags:
- `--last <duration>` — ventana temporal (ej: `1h`, `30m`)
- `--window <n>` — tamaño de ventana deslizante para inferencia (mínimo 3, default: 5)

```go
Annotations: map[string]string{
    "category": "COGNITION",
    "json_response": `{
  "period": "1h",
  "samples": 60,
  "avg_energy_index": 0.72,
  "avg_focus_score": 0.65,
  "dominant_state": "DEEP_FOCUS",
  "entries": [
    {
      "timestamp": "2026-02-27T15:04:05Z",
      "session_active": true,
      "session_locked": false,
      "idle_seconds": 18,
      "energy_index": 0.96,
      "focus_score": 0.84,
      "cognitive_state": "DEEP_FOCUS",
      "sequence": 47
    }
  ]
}`,
},
```

#### `bloom-sensor hcu`

Calcula e inspecciona **Human Cognitive Units** para mandates.

HCU es una unidad de medida del esfuerzo cognitivo humano invertido en completar un Mandate. No es tiempo de reloj — es **tiempo cognitivo activo ponderado por calidad de presencia**.

```
HCU = Σ (energy_index_i × weight_i) × active_minutes
```

Donde `weight_i` depende del `cognitive_state` en el tick:

| Estado | Peso |
|---|---|
| `DEEP_FOCUS` | 1.5 |
| `ACTIVE` | 1.0 |
| `CONTEXT_SWITCHING` | 0.7 |
| Resto | 0.3 |

**Subcomando: `bloom-sensor hcu compute <mandate-id>`**

Flags:
- `--nucleus-path <path>` — path al Nucleus para metadata de correlación

```go
Annotations: map[string]string{
    "category": "COGNITION",
    "json_response": `{
  "mandate_id": "M-2024-001",
  "computed_at": "2026-02-27T16:00:00Z",
  "window_start": "2026-02-27T08:00:00Z",
  "window_end": "2026-02-27T15:59:00Z",
  "samples": 480,
  "avg_energy_index": 0.74,
  "avg_focus_score": 0.68,
  "hcu_value": 0.71,
  "dominant_state": "DEEP_FOCUS",
  "nucleus_path": "~/.bloom/.nucleus-acme"
}`,
},
```

**Subcomando: `bloom-sensor hcu summary`**

Resumen cognitivo de la ventana actual del ring buffer.

```go
Annotations: map[string]string{
    "category": "COGNITION",
    "json_response": `{
  "buffer_samples": 240,
  "avg_energy_index": 0.71,
  "avg_focus_score": 0.63,
  "dominant_state": "ACTIVE",
  "state_distribution": {
    "DEEP_FOCUS": 18,
    "ACTIVE": 142,
    "CONTEXT_SWITCHING": 37,
    "RECOVERY_WINDOW": 12,
    "IDLE": 28,
    "ABSENT": 3
  }
}`,
},
```

---

## 9. Runtime loop

### engine.go

```go
// internal/runtime/engine.go
const defaultTickInterval = 60 * time.Second

type Engine struct {
    core     *core.Core
    interval time.Duration
}

func (e *Engine) Start() {
    c := e.core
    c.Logger.Info("bloom-sensor runtime starting")

    e.emitSessionEvent(events.TypeHumanSessionActive)

    ticker := time.NewTicker(e.interval)
    defer ticker.Stop()

    for {
        select {
        case <-c.Ctx.Done():
            c.Logger.Info("bloom-sensor runtime stopping")
            e.emitSessionEvent(events.TypeHumanSessionLocked)
            return

        case <-ticker.C:
            e.tick()
        }
    }
}

func (e *Engine) tick() {
    c := e.core

    sessionActive := c.SessionManager.IsActive()
    idleSecs := c.MetricsEngine.IdleSeconds()
    state := c.MetricsEngine.Compute(sessionActive, idleSecs)
    state.Sequence = c.Sequence.Add(1)

    c.CurrentState = &state
    c.Logger.Info("human_state_update", state)
    c.PublishHumanState(state)
}
```

### PublishHumanState — non-blocking

```go
// internal/core/core.go
func (c *Core) PublishHumanState(state events.HumanState) {
    // Log local — siempre, sin condición
    c.Logger.Info("HUMAN_STATE_UPDATE", map[string]interface{}{
        "energy_index":        state.EnergyIndex,
        "focus_score":         state.FocusScore,
        "fatigue_probability": state.FatigueProbability,
        "active_minutes":      state.ActiveMinutes,
        "idle_seconds":        state.IdleSeconds,
        "sequence":            state.Sequence,
    })

    // Publicar a Sentinel — solo si conectado, nunca bloquear
    if c.SentinelClient != nil && c.SentinelClient.IsConnected() {
        go func() {
            if err := c.SentinelClient.Publish(state.ToEvent()); err != nil {
                c.Logger.Warn("sentinel publish failed: %v", err)
                // No reintentar — la reconexión es responsabilidad del transport
            }
        }()
    }
}
```

---

## 10. Transporte — Integración con Sentinel

**Protocolo**: 4 bytes (big-endian uint32, longitud del payload) + JSON

```go
// internal/transport/sentinel_client.go
type Client struct {
    mu          sync.Mutex
    conn        net.Conn
    connected   bool
    reconnectCh chan struct{}
}

func NewClient() *Client {
    c := &Client{reconnectCh: make(chan struct{}, 1)}
    go c.reconnectLoop()
    return c
}

func (c *Client) Publish(evt events.Event) error {
    // Serializar y enviar con protocolo 4 bytes + JSON
    // Si falla, marcar como desconectado y señalizar reconnect
}

func (c *Client) reconnectLoop() {
    // Reconexión en background con backoff exponencial
    // Nunca bloquea el runtime principal
}
```

---

## 11. Startup automático

### Windows — HKCU\Run

```go
// internal/startup/startup_windows.go
const (
    registryKeyPath  = `Software\Microsoft\Windows\CurrentVersion\Run`
    registryValueOld = "BloomLauncher"  // Eliminar si existe (legacy)
    registryValueNew = "BloomSensor"    // Registrar
)

func Enable(installPath string) error {
    deleteRegistryValue(registryValueOld) // Limpieza de clave legacy
    value := fmt.Sprintf(`"%s\bloom-sensor.exe" run`, installPath)
    return setRegistryValue(registryValueNew, value)
}

func Disable() error {
    return deleteRegistryValue(registryValueNew)
}

func IsEnabled() (bool, string) {
    return readRegistryValue(registryValueNew)
}
```

### Darwin — launchd

Ver `internal/startup/startup_darwin.go`.

### Linux — systemd

Ver `internal/startup/startup_unix.go`.

---

## 12. Logging y telemetría

### Capa 1 — Log propio (siempre activo)

```
logs/sensor/sensor_YYYYMMDD.log
```

- Formato JSON estructurado
- Ring buffer en memoria (1440 snapshots)
- Accesible vía `bloom-sensor export`
- No depende de Nucleus ni Sentinel
- Timestamps siempre UTC

### Capa 2 — Registro en Nucleus telemetry (opcional)

Si Nucleus está disponible al arranque, Sensor puede registrar su stream:

```go
func (e *Engine) registerLogStream(logPath string) {
    err := exec.Command("nucleus", "telemetry", "register",
        "--stream",      "sensor_human_state",
        "--label",       "🌱 SENSOR HUMAN STATE",
        "--path",        logPath,
        "--priority",    "2",
        "--category",    "launcher",   // hasta que Nucleus agregue categoría "sensor"
        "--source",      "launcher",   // ídem
        "--description", "Bloom Sensor — human presence metrics stream",
    ).Run()

    if err != nil {
        e.core.Logger.Warn("nucleus telemetry register skipped: %v", err)
        // No fatal.
    }
}
```

> **Nota**: Categoría `launcher` y source `launcher` son valores heredados del binario predecesor. Actualizar a `sensor` cuando Nucleus agregue esa categoría.

---

## 13. Contrato con Metamorph

Metamorph gestiona el ciclo de vida de los binarios del ecosistema. El contrato mínimo es:

```bash
bloom-sensor --version        # Retorna versión como texto plano
bloom-sensor --json info      # Retorna JSON con capabilities y requires
```

El JSON de `info` debe incluir siempre `name`, `version`, `channel`, `capabilities`, `requires`.

---

## 14. Roadmap — Features futuras

Las siguientes features están especificadas pero **no implementadas**. Son el siguiente paso de evolución de Sensor.

### 14.1 Árbitro de interrupciones

Sensor puede convertirse en un árbitro de interrupciones: una señal que Nucleus puede consultar antes de entregar notificaciones no críticas al humano.

**Filosofía estricta**: Sensor no bloquea nada, solo informa. La decisión de postponer o entregar sigue siendo de Nucleus/Conductor.

Nuevo tipo de evento en `pkg/events/events.go`:

```go
type CognitiveStateChangedEvent struct {
    PreviousState   CognitiveState `json:"previous_state"`
    CurrentState    CognitiveState `json:"current_state"`
    Since           time.Time      `json:"since"`
    Recommendation  string         `json:"recommendation"` // "interrupt_ok" | "defer_if_possible" | "defer_strongly"
}
```

Tabla de recomendaciones:

| Estado actual | Recomendación |
|---|---|
| `DEEP_FOCUS` | `defer_strongly` |
| `ACTIVE` | `defer_if_possible` |
| `CONTEXT_SWITCHING` | `interrupt_ok` |
| `RECOVERY_WINDOW` | `interrupt_ok` |
| `IDLE` / `ABSENT` | `interrupt_ok` |

Archivos afectados: `internal/runtime/engine.go`, `internal/transport/sentinel_client.go`.  
No requiere nuevo comando CLI — el estado es inspeccionable vía `status` y `diagnostic tick`.

### 14.2 Presencia distribuida — privacidad-first

Cuando Alfred necesita decidir si enviar una notificación push al dispositivo móvil, puede consultar a Sentinel el `cognitive_state` actual del humano en su máquina de trabajo.

La señal que sustenta esta decisión es `GetLastInputInfo` (Windows) o su equivalente en Darwin/Linux — la API de idle más básica del SO — más aritmética sobre el ring buffer.

**Sin cámaras. Sin micrófono. Sin embeddings. Sin ML.** Privacidad-first por diseño, no por política.

Cambio requerido: `internal/transport/sentinel_client.go` agrega endpoint de consulta `GET /sensor/cognitive-state` para Alfred. Sin cambios en el loop ni en los comandos CLI.

### 14.3 Ring buffer como memoria episódica

Cruzar el ring buffer con timestamps de intents ejecutados en `.bloom/` para producir una memoria episódica mínima del trabajo:

```
mandate_state.json   →  timestamps de cada Action ejecutada
delta.json (genes)   →  timestamps de cada mutación de cada gen
ring buffer          →  energy_index + cognitive_state cada 60s
```

Extensión del comando `export` con nuevo flag `--correlate`:

```bash
bloom-sensor export --last 24h --correlate ~/.bloom/.nucleus-myorg
```

El output agrega un campo `intent_correlations` con el estado cognitivo promedio durante cada intent.

Archivos afectados: `internal/core/core.go` (función `CorrelateWithNucleus`), `internal/cli/registry.go` (flag `--correlate` en `createExportCommand`).

### 14.4 HCU por gen

Extender el cálculo de HCU para desglosar el esfuerzo por función semántica dentro de un Mandate:

```json
{
  "hcu_by_gene": [
    {
      "gene_id": "gen-uuid-1",
      "gene_semantic_role": "authentication_handler",
      "hcu": 1.84,
      "active_minutes": 73,
      "dominant_state": "DEEP_FOCUS"
    }
  ]
}
```

Saber qué parte del Mandate costó más esfuerzo humano informa cómo se diseñan los próximos.

### 14.5 HCU en el Marketplace

El campo `hcu_creation` se persiste en `mandate_state.json` al cierre del Mandate y viaja con él al Marketplace. El comprador ve:

- Cuánto esfuerzo humano costó construirlo
- Qué partes costaron más
- Una estimación del esfuerzo de adopción (`hcu_adoption_estimate`)

El precio no lo pone el vendor arbitrariamente — lo informa el esfuerzo medido.

---

## 15. Decisiones de diseño pendientes

### 15.1 Persistencia del ring buffer entre reinicios

Las features de correlación histórica (14.3, HCU granular) dependen del ring buffer. El ring buffer actual es in-memory — un reinicio lo borra.

**Propuesta**: flag `--persist-buffer` en `bloom-sensor run` que activa el volcado del ring buffer a un archivo rotativo en el directorio de configuración. Desactivado por default para no alterar el comportamiento actual.

### 15.2 Parsing de timestamps en replay

El comando `replay` en el help actual acepta `--last <duration>`. La feature completa especificada en el roadmap acepta también expresiones relativas (`"2 hours ago"`, `"yesterday 14:30"`).

**Opciones**: dependencia mínima (ej. `github.com/tj/go-naturaldate`), o restringir a ISO 8601 estrictamente en v1 y agregar expresiones relativas en v2.

### 15.3 Categoría de telemetría para HCU y replay

`hcu` y `replay` están actualmente bajo `COGNITION`. Si se crea una categoría separada en el futuro, actualizar `CategoryOrder` y `CategoryDescs` en `config.go`.

---

## 16. Checklist de implementación

### Base (implementado)

- [x] `logger.go` — logging estructurado JSON
- [x] `startup_windows.go` — HKCU, elimina clave legacy `BloomLauncher`
- [x] `startup_darwin.go` — launchd
- [x] `startup_unix.go` — systemd
- [x] `buildinfo.go` — nombre del binario `bloom-sensor`
- [x] `go.mod` — module name `bloom-sensor`
- [x] `SensorCore` — 5 campos de runtime
- [x] `PublishHumanState` — nunca bloquea (goroutine + no-retry)
- [x] `Ctx` y `Cancel` correctamente propagados al engine
- [x] 10 comandos registrados explícitamente en `registry.go`
- [x] Cada comando tiene `Annotations` con `category` y `json_response`
- [x] `--json` flag global funciona y va ANTES del comando
- [x] `help_renderer.go` — adaptado de Nucleus con branding de Sensor
- [x] 5 categorías: SYSTEM, RUNTIME, LIFECYCLE, TELEMETRY, COGNITION
- [x] `version` — versión, channel, build, commit
- [x] `info` — contrato Metamorph con capabilities y requires
- [x] `run` — arranca el engine con `c.Ctx`
- [x] `run --once` — tick único, modo diagnóstico
- [x] `status` — proceso, autostart, sentinel_connected
- [x] `enable` — registra `BloomSensor`, elimina `BloomLauncher`
- [x] `disable` — elimina `BloomSensor`, no mata proceso
- [x] `export --last <duration>` — snapshots del ring buffer
- [x] `diagnostic tick` — tick completo con detalle de métricas
- [x] `replay --last <duration>` — re-inferencia sobre ring buffer histórico
- [x] `hcu compute <mandate-id>` — HCU de un Mandate
- [x] `hcu summary` — resumen cognitivo del ring buffer actual
- [x] Engine sin `for` bloqueante — siempre `select` + `ctx.Done()`
- [x] Sentinel reconnect siempre en background goroutine
- [x] Tick interval = 60s por defecto
- [x] `HUMAN_SESSION_ACTIVE` emitido al arrancar
- [x] `HUMAN_SESSION_LOCKED` emitido al detener
- [x] Log propio en `logs/sensor/sensor_YYYYMMDD.log`
- [x] Ring buffer in-memory (1440 snapshots)
- [x] Registro en Nucleus telemetry — opcional, no fatal
- [x] Timestamps siempre UTC
- [x] `energy_index` — fórmula determinista, clampada a [0, 1]
- [x] `focus_score` — definido como campo de primera clase
- [x] `HumanState` serializable a JSON con tags correctos
- [x] Estados cognitivos canónicos: DEEP_FOCUS, ACTIVE, CONTEXT_SWITCHING, RECOVERY_WINDOW, IDLE, ABSENT
- [x] `bloom-sensor --version` — texto plano (contrato Metamorph)
- [x] `bloom-sensor --json info` — JSON con capabilities y requires

### Roadmap (pendiente)

- [ ] Árbitro de interrupciones — `CognitiveStateChangedEvent` + Recommendation
- [ ] Presencia distribuida — endpoint GET /sensor/cognitive-state para Alfred
- [ ] `export --correlate` — correlación con mandate_state.json del Nucleus
- [ ] Persistencia opcional del ring buffer (`--persist-buffer`)
- [ ] HCU por gen — desglose por función semántica
- [ ] HCU en Marketplace — campo `hcu_creation` en mandate_state.json
- [ ] Parsing de expresiones relativas en `replay` (`"2 hours ago"`)

---

*bloom-sensor — Especificación Maestra v2.0 | Ecosistema Bloom / Cognituum | Junio 2026*
