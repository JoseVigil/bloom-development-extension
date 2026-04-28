# 📦 BTIPS — MODULE: BLOOM SENSOR
> Version: 1.0 | Ecosistema: Bloom | Componente: `bloom-sensor`

---

## 🧭 Contexto

`bloom-sensor` es el **runtime de presencia humana** del ecosistema Bloom. Reemplaza arquitectónicamente a `bloom-launcher`, transformando un puente técnico de sesión en la capa fisiológica del sistema.

```
Sensor = presencia humana (fisiología digital)
Brain  = cognición
Nucleus = gobernanza
Sentinel = sistema nervioso
Metamorph = homeostasis
```

**Sensor mide. Nucleus decide. Brain ejecuta.**

Sensor no sabe si alguien lo escucha. Solo mide. Solo publica. Solo existe mientras el humano existe en sesión.

---

## 1️⃣ Identidad Arquitectónica

| Propiedad | Valor |
|---|---|
| Binario | `bloom-sensor.exe` |
| Rol | Human Presence Runtime |
| Sesión | Session 1 (proceso persistente, arranque automático al login) |
| Predecesor | `bloom-launcher` (Session Bridge / Chrome Spawner) |
| Naturaleza | Observable pasivo — mide y publica, no recibe comandos |

### Tabla de binarios del ecosistema

| Binario | Rol | Entorno |
|---|---|---|
| `bloom-nucleus` | Gobernanza organizacional | Windows Service, Session 0 |
| `bloom-brain` | Motor de ejecución Python | Windows Service, Session 0 |
| `bloom-sentinel` | Event Bus persistente | Windows Service, Session 0 |
| `bloom-metamorph` | Reconciliador declarativo de binarios | — |
| `bloom-conductor` | UI Electron | Session 1 |
| `bloom-sensor` | Runtime de presencia humana | **Session 1, proceso persistente** |

---

## 2️⃣ Estructura del Repositorio

```
bloom-sensor/
├── cmd/
│   └── main.go                          # Entry point, wiring explícito
│
├── internal/
│   ├── core/
│   │   └── core.go                      # SensorCore: infraestructura compartida
│   ├── cli/
│   │   ├── root.go                      # Cobra root + 7 comandos registrados explícitamente
│   │   ├── config.go                    # HelpConfig: 4 categorías
│   │   └── help_renderer.go             # ModernHelpRenderer (homólogo a Nucleus)
│   ├── runtime/
│   │   ├── engine.go                    # Orquestador del loop principal
│   │   ├── loop.go                      # Tick loop con context.Context
│   │   └── scheduler.go                 # Tareas periódicas independientes
│   ├── session/
│   │   └── windows.go                   # WTSQuerySessionInformation
│   ├── input/
│   │   └── idle.go                      # GetLastInputInfo
│   ├── metrics/
│   │   ├── energy.go                    # ComputeEnergyIndex (función pura)
│   │   └── state.go                     # RingBuffer de HumanState
│   ├── transport/
│   │   └── sentinel_client.go           # Client con reconexión en background
│   ├── startup/
│   │   └── startup_windows.go           # Enable / Disable / IsEnabled (HKCU)
│   ├── buildinfo/
│   │   └── buildinfo.go                 # Version, Commit, BuildNumber, Channel
│   └── logger/
│       └── logger.go                    # New(debug bool)
│
└── pkg/
    └── events/
        └── events.go                    # HumanState, Event, constantes HUMAN_*
```

### Migración desde launcher

| Archivo | Acción |
|---|---|
| `logger.go` | Copiado sin modificaciones |
| `startup_windows.go` | Migrado — nombres de clave actualizados |
| `buildinfo.go` | Migrado — nombre del binario actualizado |
| `executor/launch.go` | **Eliminado** (lógica Chrome) |
| `pipe/server.go` | **Eliminado** (pipe de Brain) |
| `go.mod` | Actualizado con nuevo module name `bloom-sensor` |

---

## 3️⃣ SensorCore

El Core de Sensor es filosóficamente distinto al Core de Nucleus.

- **Nucleus Core** → centro administrativo (orientado a comandos)
- **Sensor Core** → núcleo fisiológico (orientado a runtime continuo)

### Regla de oro

> El Core de Sensor **nunca bloquea** por dependencias externas.
> Si Sentinel no está disponible, el Core arranca igual.
> Si la sesión no puede detectarse, el Core arranca igual.
> Degradación elegante siempre.

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

### PublishHumanState

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
            }
        }()
    }
}
```

---

## 4️⃣ CLI — Patrón Cobra

Sensor usa **Cobra convencional** (no auto-discovery de Nucleus). Los comandos se declaran explícitamente en `root.go`.

**Coherencia externa. Simplicidad interna.**

### Categorías

| Categoría | Descripción |
|---|---|
| `SYSTEM` | Binary identity and diagnostics |
| `RUNTIME` | Process lifecycle and live state inspection |
| `LIFECYCLE` | Autostart registration and session management |
| `TELEMETRY` | Human metrics export and observability |

### root.go

```go
// internal/cli/root.go
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

    return root
}
```

### main.go

```go
// cmd/main.go
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

## 5️⃣ Especificación de Comandos

### `bloom-sensor run` — RUNTIME

Inicia el loop persistente de medición. Llama a `runtime.Engine.Start(c.Ctx)`. Emite `HUMAN_SESSION_ACTIVE` al arrancar.

**Flags:**
- `--once`: Un solo tick y salir (modo diagnóstico)
- `--foreground`: No redirigir stdout
- `--diagnostic`: Modo verbose, imprime cada tick

```json
{
  "status": "running",
  "pid": 1234,
  "session": "active",
  "sentinel_connected": true
}
```

---

### `bloom-sensor status` — RUNTIME

Consulta estado del proceso, clave HKCU y conexión a Sentinel. No requiere que el proceso esté vivo.

```json
{
  "process_running": true,
  "pid": 1234,
  "autostart_registered": true,
  "sentinel_connected": true,
  "last_state_update": "2026-02-24T15:04:05Z"
}
```

---

### `bloom-sensor enable` — LIFECYCLE

Registra `BloomSensor` en `HKCU\Run`. Si existe clave `BloomLauncher`, la elimina. Idempotente.

```json
{
  "success": true,
  "registry_key": "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run\\BloomSensor",
  "value": "C:\\Bloom\\bloom-sensor.exe run"
}
```

---

### `bloom-sensor disable` — LIFECYCLE

Elimina la clave `BloomSensor` de HKCU. **No mata el proceso actual.** Idempotente.

```json
{
  "success": true,
  "removed": true
}
```

---

### `bloom-sensor export` — TELEMETRY

Vuelca el ring buffer a stdout.

**Flags:**
- `--last <duration>`: Filtro de tiempo (`24h`, `1h`, `30m`)
- `--format <json|text>`: Formato de salida

```json
{
  "period": "24h",
  "samples": 1440,
  "avg_energy_index": 0.62,
  "avg_focus_score": 0.71,
  "total_active_minutes": 312,
  "snapshots": [...]
}
```

---

### `bloom-sensor version` — SYSTEM

Imprime versión del binario. Usa `buildinfo.go` migrado.

```json
{
  "version": "1.0.0",
  "channel": "stable",
  "build": "20260224",
  "commit": "abc1234"
}
```

---

### `bloom-sensor info` — SYSTEM

Retorna JSON estructurado obligatorio para Metamorph. Debe incluir `name`, `version`, `channel`, `capabilities`, `requires`.

```json
{
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
}
```

---

## 6️⃣ Runtime Loop

### Ciclo de vida completo

```
1. Inicialización
   ├── Carga de configuración (channel, debug)
   ├── Inicialización del logger → %LOCALAPPDATA%\BloomNucleus\logs\sensor\
   ├── Conexión opcional a Sentinel (no-fatal si no está disponible)
   └── Emisión de HUMAN_SESSION_ACTIVE

2. Loop de muestreo (cada 60 segundos)
   ├── Captura de estado de sesión (WTSQuerySessionInformation)
   ├── Captura de idle time (GetLastInputInfo)
   ├── Cálculo de energy_index (función determinista)
   ├── Push al ring buffer en memoria
   └── Publicación del evento a Sentinel (si conectado)

3. Reconexión resiliente
   └── Si Sentinel no está disponible: backoff exponencial en background
       El loop principal nunca se bloquea esperando a Sentinel.

4. Apagado limpio
   └── Emisión de HUMAN_SESSION_LOCKED al cancelar el contexto
```

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

---

## 7️⃣ Modelo de Métricas

### HumanState (pkg/events/events.go)

```go
type EventType string

const (
    TypeHumanSessionActive EventType = "HUMAN_SESSION_ACTIVE"
    TypeHumanSessionLocked EventType = "HUMAN_SESSION_LOCKED"
    TypeHumanIdle          EventType = "HUMAN_IDLE"
    TypeHumanActive        EventType = "HUMAN_ACTIVE"
    TypeHumanStateUpdate   EventType = "HUMAN_STATE_UPDATE"
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

type Event struct {
    Type     EventType   `json:"type"`
    Sequence uint64      `json:"sequence"`
    Payload  interface{} `json:"payload"`
}
```

### Snapshot de ejemplo

```json
{
  "type": "HUMAN_STATE_UPDATE",
  "sequence": 1440,
  "timestamp": "2026-02-27T15:04:05Z",
  "energy_index": 0.97,
  "focus_score": 0.84,
  "fatigue_probability": 0.12,
  "active_minutes": 42,
  "idle_seconds": 18
}
```

### energy_index — Modelo determinista v1

Sin ML. Sin estado externo. Función pura y testeable independientemente.

```go
// internal/metrics/energy.go
//
// energy = 1.0
//        - (active_minutes / 600) * 0.4
//        - (idle_breaks_last_hour < 2 ? 0.2 : 0)
// clamp(0, 1)

const (
    MaxActiveMinutes = 600.0
    ActivePenalty    = 0.4
    IdleBreakPenalty = 0.2
    IdleBreakMin     = 2
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

### Tabla de comportamiento

| Condición | energy_index |
|---|---|
| Sesión bloqueada | `0.0` |
| Idle > 60 min | `0.0` |
| Idle 30–60 min | Decaimiento lineal `0.5 → 0.0` |
| Idle 0–30 min | Decaimiento suave `1.0 → 0.5` |

Resultado siempre clampado a `[0.0, 1.0]`.

### Ring buffer (internal/metrics/state.go)

```go
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

Capacidad: **1440 entradas = 24h a 1 tick/min**.

---

## 8️⃣ Integración con Sentinel

### Protocolo de transporte

Idéntico al protocolo del ecosistema Bloom: **4 bytes big-endian (longitud) + JSON payload**.

```go
// internal/transport/sentinel_client.go
type Client struct {
    mu          sync.Mutex
    conn        net.Conn
    connected   bool
    reconnectCh chan struct{}
}

func (c *Client) Publish(evt events.Event) error {
    // Serializar y enviar con protocolo 4 bytes + JSON
    // Si falla, marcar desconectado y señalizar reconnect
}

func (c *Client) reconnectLoop() {
    // Reconexión en background con backoff exponencial 2s → 60s
    // Nunca bloquea el runtime principal
}
```

### Eventos publicados a Sentinel

| Evento | Trigger |
|---|---|
| `HUMAN_SESSION_ACTIVE` | Arranque del engine |
| `HUMAN_SESSION_LOCKED` | Shutdown / cancelación de contexto |
| `HUMAN_ACTIVE` | Tick con sesión activa e idle < 30 min |
| `HUMAN_IDLE` | Tick con idle > 30 min |
| `HUMAN_STATE_UPDATE` | Cada tick (snapshot completo) |

### Degradación elegante

Sensor nunca bloquea por dependencias externas:

| Dependencia | Si no disponible |
|---|---|
| Sentinel | Eventos descartados silenciosamente, reconexión en background |
| `WTSQuerySessionInformation` | Asume sesión activa |
| `GetLastInputInfo` | Retorna 0 segundos idle |
| Nucleus telemetry | Registro omitido silenciosamente |

---

## 9️⃣ Startup Automático (HKCU)

### Mecanismo — Migración desde Launcher

```go
// internal/startup/startup_windows.go
const (
    registryKeyPath  = `Software\Microsoft\Windows\CurrentVersion\Run`
    registryValueOld = "BloomLauncher"   // Eliminar si existe
    registryValueNew = "BloomSensor"     // Registrar
)

func Enable(installPath string) error {
    deleteRegistryValue(registryValueOld) // Idempotente
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

La operación `Enable` es **idempotente**. Re-registrar no es error. Eliminar `BloomLauncher` tampoco es error si no existe.

---

## 🔟 Logging y Telemetría

### Capa 1 — Log propio (siempre activo)

```
%LOCALAPPDATA%\BloomNucleus\logs\sensor\sensor_YYYYMMDD.log
```

Formato JSON estructurado. Timestamps siempre UTC. No depende de Nucleus.

### Capa 2 — Registro en Nucleus telemetry (opcional)

```go
// En engine.go, al iniciar:
func (e *Engine) registerLogStream(logPath string) {
    err := exec.Command("nucleus", "telemetry", "register",
        "--stream",      "sensor_human_state",
        "--label",       "🌱 SENSOR HUMAN STATE",
        "--path",        logPath,
        "--priority",    "2",
        "--category",    "launcher",   // categoría heredada; actualizar cuando exista "sensor"
        "--source",      "launcher",   // actualizar cuando el ecosistema registre "sensor"
        "--description", "Bloom Sensor — human presence metrics stream",
    ).Run()

    if err != nil {
        e.core.Logger.Warn("nucleus telemetry register skipped: %v", err)
        // No fatal.
    }
}
```

> **Nota:** Categoría y source usan `launcher` como valor heredado hasta que Nucleus agregue la categoría `sensor` en su propia guía.

---

## 1️⃣1️⃣ Deploy e Instalación

### Ruta de instalación

```
C:\Users\<user>\AppData\Local\BloomNucleus\bin\sensor\bloom-sensor.exe
```

### Flujo de deploy (ejecutado por Conductor)

```
1. bloom-sensor enable    → registra HKCU\Run (elimina BloomLauncher si existe)
2. bloom-sensor run       → inicia el proceso en la sesión activa
3. bloom-sensor --json status  → verificación del deploy
```

### Registro autostart resultante

```
HKCU\Software\Microsoft\Windows\CurrentVersion\Run
  BloomSensor = "C:\...\BloomNucleus\bin\sensor\bloom-sensor.exe" run
```

---

## 1️⃣2️⃣ Contrato con Metamorph

Bloom Sensor cumple el contrato estándar del ecosistema para ser gestionado declarativamente por Metamorph:

```
bloom-sensor --version     → "1.0.0"  (texto plano)
bloom-sensor --json info   → JSON con name, version, channel, capabilities, requires
```

Binario firmable y actualizable declarativamente. Metamorph lo incluye en manifests bajo el nombre `sensor`.

---

## ✅ Checklist de Implementación

### Migración desde launcher
- [ ] `logger.go` copiado sin modificaciones
- [ ] `startup_windows.go` adaptado (nombres de clave actualizados)
- [ ] `buildinfo.go` adaptado (nombre del binario)
- [ ] `executor/launch.go` eliminado
- [ ] `pipe/server.go` eliminado
- [ ] `go.mod` actualizado con module name `bloom-sensor`

### Core
- [ ] `SensorCore` implementado con los 5 campos de runtime
- [ ] `PublishHumanState` nunca bloquea (goroutine + no-retry)
- [ ] `Ctx` y `Cancel` correctamente propagados al engine

### CLI
- [ ] 7 comandos registrados explícitamente en `root.go`
- [ ] Cada comando tiene `Annotations` con `category` y `json_response`
- [ ] `--json` flag global funciona en todos los comandos
- [ ] `help_renderer.go` copiado de Nucleus y adaptado
- [ ] `config.go` con 4 categorías: SYSTEM, RUNTIME, LIFECYCLE, TELEMETRY

### Comandos SYSTEM
- [ ] `version` retorna JSON con version, channel, build, commit
- [ ] `info` retorna JSON con name, version, channel, capabilities, requires

### Comandos RUNTIME
- [ ] `run` arranca el engine con `c.Ctx`
- [ ] `run --once` ejecuta un tick y sale
- [ ] `status` reporta proceso, autostart y sentinel_connected

### Comandos LIFECYCLE
- [ ] `enable` registra `BloomSensor` y elimina `BloomLauncher` si existe
- [ ] `disable` elimina `BloomSensor` sin matar el proceso
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

### Modelo de métricas
- [ ] `energy_index` calculado con fórmula determinista (sin ML)
- [ ] Resultado clampado a `[0, 1]`
- [ ] Función pura y testeable independientemente
- [ ] `HumanState` serializable a JSON con tags correctos

### Logging
- [ ] Log propio en `logs/sensor/sensor_YYYYMMDD.log`
- [ ] Ring buffer implementado en memoria (1440 entradas)
- [ ] Registro en Nucleus telemetry es opcional y no fatal
- [ ] Categoría: `launcher` / Source: `launcher` (hasta que exista `sensor`)
- [ ] Timestamps siempre UTC

### Metamorph
- [ ] `bloom-sensor --version` retorna versión como texto plano
- [ ] `bloom-sensor --json info` retorna JSON con capabilities y requires

---

*BTIPS-MODULE-SENSOR v1.0 — Ecosistema Bloom*
