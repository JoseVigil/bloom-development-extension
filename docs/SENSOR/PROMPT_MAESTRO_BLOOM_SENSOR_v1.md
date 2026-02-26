# 📘 PROMPT MAESTRO — IMPLEMENTACIÓN DE BLOOM-SENSOR
> Versión: 1.0 | Derivado de: bloom-launcher | Ecosistema: Bloom

---

## 🧠 CONTEXTO DEL ECOSISTEMA

Estás trabajando en **Bloom**, una arquitectura cognitiva local compuesta por:

| Binario | Rol | Entorno |
|---|---|---|
| `bloom-nucleus` | Gobernanza organizacional | Windows Service, Session 0 |
| `bloom-brain` | Motor de ejecución Python | Windows Service, Session 0 |
| `bloom-sentinel` | Event Bus persistente | Windows Service, Session 0 |
| `bloom-metamorph` | Reconciliador declarativo de binarios | — |
| `bloom-conductor` | UI Electron | Session 1 |
| `bloom-sensor` | Runtime de presencia humana | **Session 1, proceso persistente** |

Todos los binarios Go siguen un patrón homogéneo:
- CLI implementada con **Cobra**
- `--version` y `--info` (contrato con Metamorph)
- Canal stable/beta
- Logging estructurado JSON
- Convención uniforme de comandos

---

## 🎯 OBJETIVO DE ESTA TAREA

Migrar el proyecto `bloom-launcher` (ubicado en `bloom-development-extension/launcher/`) hacia un nuevo proyecto **`bloom-sensor`**.

Este no es un refactor. Es una **re-identidad arquitectónica**:

> Transformar un lanzador técnico en la capa sensorial humana del sistema Bloom.

---

## 📁 ESTRUCTURA DEL REPO DE ORIGEN (launcher)

```
bloom-development-extension/
└── launcher/
    ├── README.md
    ├── cmd/
    │   └── main.go
    ├── go.mod
    ├── go.sum
    ├── internal/
    │   ├── buildinfo/
    │   │   └── buildinfo.go
    │   ├── executor/
    │   │   └── launch.go          ← ELIMINAR (lógica Chrome)
    │   ├── info/
    │   │   ├── info.go            ← MIGRAR (adaptar a sensor)
    │   │   └── version.go         ← MIGRAR (adaptar a sensor)
    │   ├── logger/
    │   │   └── logger.go          ← CONSERVAR SIN CAMBIOS
    │   ├── pipe/
    │   │   └── server.go          ← ELIMINAR (pipe de Brain)
    │   └── startup/
    │       └── startup_windows.go ← CONSERVAR (misma mecánica HKCU)
    └── scripts/
        ├── build.bat
        └── build_number.txt
```

---

## 📁 ESTRUCTURA DESTINO (sensor)

```
bloom-sensor/
│
├── cmd/
│   └── main.go                    ← Entry point, wiring explícito
│
├── internal/
│   ├── core/
│   │   └── core.go                ← SensorCore (ver sección CORE)
│   │
│   ├── cli/
│   │   ├── root.go                ← Cobra root + flags globales
│   │   ├── help_renderer.go       ← Copiado de Nucleus, adaptado
│   │   └── config.go              ← Categorías y branding de Sensor
│   │
│   ├── runtime/
│   │   ├── engine.go              ← Orquestador del loop principal
│   │   ├── loop.go                ← Tick loop con context.Context
│   │   └── scheduler.go          ← Programación de emisiones periódicas
│   │
│   ├── session/
│   │   └── windows.go             ← Detección sesión activa/bloqueada
│   │
│   ├── input/
│   │   └── idle.go                ← GetLastInputInfo / idle detection
│   │
│   ├── metrics/
│   │   ├── energy.go              ← Modelo determinista energy_index
│   │   └── state.go               ← HumanState struct y ring buffer
│   │
│   ├── transport/
│   │   └── sentinel_client.go    ← Conexión a Sentinel (socket/pipe)
│   │
│   ├── startup/
│   │   └── startup_windows.go    ← MIGRADO de launcher (HKCU\Run)
│   │
│   ├── buildinfo/
│   │   └── buildinfo.go          ← MIGRADO de launcher
│   │
│   └── logger/
│       └── logger.go              ← MIGRADO de launcher sin cambios
│
├── pkg/
│   └── events/
│       └── events.go              ← Tipos de eventos HUMAN_*
│
└── main.go                        ← Alternativa a cmd/main.go (elegir uno)
```

---

## 🧬 SENSOR CORE

El `Core` de Sensor **no es** una copia del `core.Core` de Nucleus. Son entidades filosóficamente distintas.

- **Nucleus Core** = centro administrativo (orientado a comandos)
- **Sensor Core** = núcleo fisiológico (orientado a runtime continuo)

### Diseño del Core struct

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

### Regla de oro
> El Core de Sensor **nunca bloquea** por dependencias externas.  
> Si Sentinel no está disponible, el Core arranca igual.  
> Si la sesión no puede detectarse, el Core arranca igual.  
> Degradación elegante siempre.

---

## 🏗 CLI — PATRÓN COBRA CONVENCIONAL

Sensor usa **Cobra convencional** (no auto-discovery de Nucleus). Los comandos se declaran explícitamente en `root.go`.

**Coherencia externa. Simplicidad interna.**

### root.go

```go
// internal/cli/root.go
package cli

import (
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

    // Flags globales
    root.PersistentFlags().BoolVar(&c.Config.Debug, "debug", false, "Enable debug logging")
    root.PersistentFlags().StringVar(&c.Config.Channel, "channel", "stable", "Release channel (stable|beta)")
    root.PersistentFlags().StringVar(&c.Config.ConfigPath, "config", "", "Config file path")
    root.PersistentFlags().BoolVar(&c.Config.OutputJSON, "json", false, "Output in JSON format")

    // Registro explícito de comandos
    root.AddCommand(createRunCommand(c))      // RUNTIME
    root.AddCommand(createStatusCommand(c))   // RUNTIME
    root.AddCommand(createEnableCommand(c))   // LIFECYCLE
    root.AddCommand(createDisableCommand(c))  // LIFECYCLE
    root.AddCommand(createExportCommand(c))   // TELEMETRY
    root.AddCommand(createVersionCommand(c))  // SYSTEM
    root.AddCommand(createInfoCommand(c))     // SYSTEM

    // Help renderer personalizado (copiado y adaptado de Nucleus)
    renderer := NewSensorHelpRenderer(os.Stdout, DefaultSensorConfig())
    root.SetHelpFunc(func(cmd *cobra.Command, args []string) {
        RenderFullHelp(root, renderer)
    })

    return root
}
```

### main.go

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

---

## 🖥 CATEGORÍAS CLI Y COMANDOS

### Configuración del help_renderer (config.go)

```go
// internal/cli/config.go
package cli

type HelpConfig struct {
    AppName      string
    AppSubtitle  string
    Width        int
    CategoryOrder []string
    CategoryDescs map[string]string
}

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
        },
        CategoryDescs: map[string]string{
            "SYSTEM":    "Binary identity and diagnostics",
            "RUNTIME":   "Process lifecycle and live state inspection",
            "LIFECYCLE": "Autostart registration and session management",
            "TELEMETRY": "Human metrics export and observability",
        },
    }
}
```

### Annotations obligatorios en cada comando

Cada `cobra.Command` debe incluir:
```go
Annotations: map[string]string{
    "category":      "RUNTIME",     // Una de: SYSTEM, RUNTIME, LIFECYCLE, TELEMETRY
    "json_response": `{...}`,       // Ejemplo de respuesta JSON válido
},
```

---

## 📋 ESPECIFICACIÓN DE COMANDOS

### `bloom-sensor run`
**Categoría**: RUNTIME

- Inicia el loop persistente de medición
- Llama a `runtime.Engine.Start(c.Ctx)`
- Emite `HUMAN_SESSION_ACTIVE` al arrancar
- Registra loop en logger
- **Flags**:
  - `--foreground`: No redireccionar stdout (útil para debugging)
  - `--once`: Ejecutar un solo tick y salir (diagnóstico)
  - `--diagnostic`: Modo verbose de métricas, imprime cada tick

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

### `bloom-sensor status`
**Categoría**: RUNTIME

- Consulta estado del proceso (¿está corriendo?)
- Consulta clave HKCU (¿está registrado en autostart?)
- Consulta conexión a Sentinel
- No necesita que el proceso esté vivo para correr

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

### `bloom-sensor enable`
**Categoría**: LIFECYCLE

- Registra `BloomSensor = "<install_path>\bloom-sensor.exe run"` en `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`
- Si existía clave `BloomLauncher`, eliminarla
- Idempotente (re-registrar no es error)
- Usa `startup_windows.go` migrado de launcher

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

### `bloom-sensor disable`
**Categoría**: LIFECYCLE

- Elimina la clave `BloomSensor` de HKCU
- Idempotente (clave inexistente no es error)
- **No mata el proceso actual**

```go
Annotations: map[string]string{
    "category": "LIFECYCLE",
    "json_response": `{
  "success": true,
  "removed": true
}`,
},
```

### `bloom-sensor export`
**Categoría**: TELEMETRY

- Vuelca el ring buffer interno a stdout (JSON o texto)
- **Flags**:
  - `--last <duration>`: Filtro de tiempo (ej: `24h`, `1h`, `30m`)
  - `--format <json|text>`: Formato de salida

```go
Annotations: map[string]string{
    "category": "TELEMETRY",
    "json_response": `{
  "period": "24h",
  "samples": 1440,
  "avg_energy_index": 0.62,
  "avg_focus_score": 0.71,
  "total_active_minutes": 312,
  "snapshots": [...]
}`,
},
```

### `bloom-sensor version`
**Categoría**: SYSTEM

- Imprime versión del binario
- Usa `buildinfo.go` migrado

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
```

### `bloom-sensor info`
**Categoría**: SYSTEM

- Retorna JSON estructurado **obligatorio para Metamorph**
- Contrato: debe incluir `name`, `version`, `channel`, `capabilities`, `requires`

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

> ⚠️ `--info` como flag global **o** `info` como subcomando son equivalentes.  
> Si el ecosistema usa subcomando, implementarlo como subcomando. Ser consistente con el resto.

---

## 🔄 RUNTIME LOOP

### engine.go

```go
// internal/runtime/engine.go
package runtime

import (
    "time"

    "bloom-sensor/internal/core"
    "bloom-sensor/internal/metrics"
    "bloom-sensor/pkg/events"
)

const defaultTickInterval = 60 * time.Second

type Engine struct {
    core     *core.Core
    interval time.Duration
}

func NewEngine(c *core.Core) *Engine {
    return &Engine{
        core:     c,
        interval: defaultTickInterval,
    }
}

func (e *Engine) Start() {
    c := e.core
    c.Logger.Info("bloom-sensor runtime starting")

    // Emitir presencia al arrancar
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

    // 1. Capturar estado de sesión
    sessionActive := c.SessionManager.IsActive()

    // 2. Capturar idle time
    idleSecs := c.MetricsEngine.IdleSeconds()

    // 3. Calcular métricas
    state := c.MetricsEngine.Compute(sessionActive, idleSecs)
    state.Sequence = c.Sequence.Add(1)

    // 4. Actualizar estado interno
    c.CurrentState = &state

    // 5. Log estructurado local (siempre)
    c.Logger.Info("human_state_update", state)

    // 6. Publicar a Sentinel (si disponible, nunca bloquear)
    c.PublishHumanState(state)
}

func (e *Engine) emitSessionEvent(eventType events.EventType) {
    evt := events.NewEvent(eventType, e.core.Sequence.Add(1), nil)
    e.core.PublishEvent(evt)
}
```

### PublishHumanState en Core

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
                // No reintentar aquí — la reconexión es responsabilidad del transport
            }
        }()
    }
}
```

---

## 📊 MODELO DE MÉTRICAS

### HumanState (pkg/events/events.go)

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
    Type               EventType `json:"type"`
    Sequence           uint64    `json:"sequence"`
    Timestamp          time.Time `json:"timestamp"`
    EnergyIndex        float64   `json:"energy_index"`
    FocusScore         float64   `json:"focus_score"`
    FatigueProbability float64   `json:"fatigue_probability"`
    ActiveMinutes      int       `json:"active_minutes"`
    IdleSeconds        int       `json:"idle_seconds"`
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

### Modelo de energía v1 (determinista, sin ML)

```go
// internal/metrics/energy.go
package metrics

import "math"

// EnergyModel v1 — determinista, auditable, reproducible
//
// Formula:
//   energy = 1.0
//          - (active_minutes / 600) * 0.4
//          - (idle_breaks_last_hour < threshold ? 0.2 : 0)
//   clamp(0, 1)

const (
    MaxActiveMinutes  = 600.0
    ActivePenalty     = 0.4
    IdleBreakPenalty  = 0.2
    IdleBreakMin      = 2 // mínimo de breaks por hora recomendados
)

func ComputeEnergyIndex(activeMinutes int, idleBreaksLastHour int) float64 {
    energy := 1.0

    // Penalización por tiempo activo acumulado
    energy -= (float64(activeMinutes) / MaxActiveMinutes) * ActivePenalty

    // Penalización por falta de descansos
    if idleBreaksLastHour < IdleBreakMin {
        energy -= IdleBreakPenalty
    }

    // Clamp [0, 1]
    return math.Max(0, math.Min(1, energy))
}
```

---

## 📝 LOGGING Y TELEMETRÍA

### Estrategia: Autónomo + Integración opcional

Sensor tiene **dos capas de logging** independientes:

**Capa 1 — Log propio (siempre activo)**
```
logs/sensor/sensor_YYYYMMDD.log
```
- Formato JSON estructurado
- Ring buffer en memoria (últimas N snapshots)
- Accesible vía `bloom-sensor export`
- No depende de Nucleus

**Capa 2 — Registro en Nucleus (opcional)**

Si Nucleus está disponible al arranque, Sensor puede registrar su stream:

```go
// En engine.go, al iniciar:
func (e *Engine) registerLogStream(logPath string) {
    err := exec.Command("nucleus", "telemetry", "register",
        "--stream",      "sensor_human_state",
        "--label",       "🌱 SENSOR HUMAN STATE",
        "--path",        logPath,
        "--priority",    "2",
        "--category",    "launcher",   // categoría existente en Nucleus
        "--source",      "launcher",   // el binario que escribe el log
        "--description", "Bloom Sensor — human presence metrics stream",
    ).Run()

    if err != nil {
        // No fatal. Nucleus puede no estar disponible.
        e.core.Logger.Warn("nucleus telemetry register skipped: %v", err)
    }
}
```

> **Categoría a usar en Nucleus telemetry**: `launcher` (categoría heredada del binario predecesor).  
> Actualizar a `sensor` cuando Nucleus agregue esa categoría en su propia guía.

> **Fuente (`--source`)**: `launcher` hasta que el ecosistema tenga `sensor` registrado.

### Ring buffer en memoria

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

---

## 🔄 STARTUP AUTOMÁTICO (HKCU)

### Migración desde launcher

El mecanismo es **idéntico** al de launcher. Solo cambia el nombre de la clave y el binario.

```go
// internal/startup/startup_windows.go
// Migrado directamente de launcher. Cambios mínimos:

const (
    registryKeyPath  = `Software\Microsoft\Windows\CurrentVersion\Run`
    registryValueOld = "BloomLauncher"   // Eliminar si existe
    registryValueNew = "BloomSensor"     // Registrar
)

func Enable(installPath string) error {
    // 1. Eliminar clave legacy si existe
    deleteRegistryValue(registryValueOld)

    // 2. Registrar nueva clave
    value := fmt.Sprintf(`"%s\bloom-sensor.exe" run`, installPath)
    return setRegistryValue(registryValueNew, value)
}

func Disable() error {
    return deleteRegistryValue(registryValueNew)
}

func IsEnabled() (bool, string) {
    // Retorna (existe, valor_registrado)
    return readRegistryValue(registryValueNew)
}
```

---

## 📡 INTEGRACIÓN CON SENTINEL

### transport/sentinel_client.go

```go
// internal/transport/sentinel_client.go
package transport

// Protocolo: 4 bytes (big-endian uint32, longitud del payload) + JSON

type Client struct {
    mu          sync.Mutex
    conn        net.Conn
    connected   bool
    reconnectCh chan struct{}
}

func NewClient() *Client {
    c := &Client{
        reconnectCh: make(chan struct{}, 1),
    }
    go c.reconnectLoop()
    return c
}

func (c *Client) IsConnected() bool {
    c.mu.Lock()
    defer c.mu.Unlock()
    return c.connected
}

func (c *Client) Publish(evt events.Event) error {
    // Serializar y enviar con protocolo 4 bytes + JSON
    // Si falla, marcar como desconectado y señalizar reconnect
    ...
}

func (c *Client) reconnectLoop() {
    // Reconexión en background con backoff exponencial
    // Nunca bloquea el runtime principal
    ...
}
```

---

## 🔚 CHECKLIST PRE-ENTREGA

### Migración desde launcher
- [ ] `logger.go` copiado sin modificaciones
- [ ] `startup_windows.go` adaptado (nombres de clave actualizados)
- [ ] `buildinfo.go` adaptado (nombre del binario)
- [ ] `executor/launch.go` eliminado
- [ ] `pipe/server.go` eliminado
- [ ] `go.mod` actualizado con nuevo module name (`bloom-sensor`)

### Core
- [ ] `SensorCore` implementado con los 5 campos de runtime
- [ ] `PublishHumanState` nunca bloquea (goroutine + no-retry)
- [ ] `Ctx` y `Cancel` correctamente propagados al engine

### CLI
- [ ] 7 comandos registrados explícitamente en `root.go` (no auto-discovery)
- [ ] Cada comando tiene `Annotations` con `category` y `json_response`
- [ ] `--json` flag global funciona en todos los comandos
- [ ] `help_renderer.go` copiado de Nucleus y adaptado (branding de Sensor)
- [ ] `config.go` con 4 categorías: SYSTEM, RUNTIME, LIFECYCLE, TELEMETRY

### Comandos SYSTEM
- [ ] `version` retorna JSON con version, channel, build, commit
- [ ] `info` retorna JSON con name, version, channel, capabilities, requires (contrato Metamorph)

### Comandos RUNTIME
- [ ] `run` arranca el engine con `c.Ctx`
- [ ] `run --once` ejecuta un tick y sale (modo diagnóstico)
- [ ] `status` reporta: proceso, autostart, sentinel_connected

### Comandos LIFECYCLE
- [ ] `enable` registra `BloomSensor` en HKCU y elimina `BloomLauncher` si existe
- [ ] `disable` elimina `BloomSensor` de HKCU sin matar el proceso
- [ ] Ambos son idempotentes

### Comandos TELEMETRY
- [ ] `export --last <duration>` retorna snapshots del ring buffer
- [ ] `export --format json` retorna JSON válido

### Runtime
- [ ] Engine nunca entra en `for` sin `select` + `ctx.Done()`
- [ ] Sentinel reconnect es siempre en background goroutine
- [ ] Tick interval = 60s por defecto
- [ ] `HUMAN_SESSION_ACTIVE` emitido al arrancar
- [ ] `HUMAN_SESSION_LOCKED` emitido al detener

### Logging
- [ ] Log propio en `logs/sensor/sensor_YYYYMMDD.log`
- [ ] Ring buffer implementado en memoria
- [ ] Registro en Nucleus telemetry es opcional y no fatal si falla
- [ ] Categoría usada: `launcher` | Source: `launcher` (hasta que exista `sensor`)
- [ ] Timestamps siempre UTC

### Modelo de métricas
- [ ] `energy_index` calculado con fórmula determinista (sin ML)
- [ ] Resultado clampado a [0, 1]
- [ ] Función de cómputo pura y testeable independientemente
- [ ] `HumanState` serializable a JSON con tags correctos

### Metamorph
- [ ] `bloom-sensor --version` retorna versión como texto plano
- [ ] `bloom-sensor --json info` retorna JSON con capabilities y requires
- [ ] Binario firmable y actualizable declarativamente

---

## 🧠 FILOSOFÍA FINAL

```
Sensor = presencia humana (fisiología digital)
Brain  = cognición
Nucleus = gobernanza
Sentinel = sistema nervioso
Metamorph = homeostasis
```

**Sensor mide. Nucleus decide. Brain ejecuta.**

Sensor no sabe si alguien lo escucha.  
Solo mide. Solo publica. Solo existe mientras el humano existe en sesión.

---

## Archivos de Contexto Requeridos

---

**Imprescindibles — sin estos el AI no puede generar código correcto:**

Del repositorio del launcher (tenés que extraerlos vos):
- `launcher/internal/logger/logger.go` — se copia verbatim, el AI necesita ver la firma exacta
- `launcher/internal/startup/startup_windows.go` — se migra, el AI necesita ver la implementación HKCU real
- `launcher/internal/buildinfo/buildinfo.go` — se adapta, necesita ver qué expone
- `launcher/internal/info/info.go` y `version.go` — base para los comandos `info` y `version`
- `launcher/go.mod` — para saber el module name actual y dependencias

Del ecosistema Nucleus (ya lo tenés subido):
- `help_renderer.go` — el AI lo copia y adapta, si no lo tiene lo inventa mal

El prompt generado:
- `PROMPT_MAESTRO_BLOOM_SENSOR_v1.md`

---

**Opcionales — mejoran precisión pero el AI puede inferirlos:**

- `BLOOM_NUCLEUS_LOGGING_SPEC.md` — útil si querés que el registro en `nucleus telemetry register` sea exactamente correcto
- `launcher/cmd/main.go` — ayuda a entender el wiring actual, pero el prompt ya lo describe

---

**Lo que NO adjuntés:**

- `executor/launch.go` — se elimina, adjuntarlo confunde
- `pipe/server.go` — ídem
- La guía de comandos NUCLEUS — ya está destilada en el prompt, agregarla duplica contexto sin valor

En total son **7–8 archivos** más el prompt. El par más crítico es `startup_windows.go` + `logger.go` porque son los únicos que se usan tal cual y el AI no puede adivinar sus firmas internas.

---

*Prompt generado para ecosistema Bloom — Versión 1.0*  
*Basado en: bloom-launcher tree, BLOOM_NUCLEUS_LOGGING_SPEC, Guía Maestra NUCLEUS v2.0, help_renderer.go*
