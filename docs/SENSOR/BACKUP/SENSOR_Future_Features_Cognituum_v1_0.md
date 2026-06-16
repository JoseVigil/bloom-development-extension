# SENSOR — Future Features Specification
## Cognituum / Bloom Ecosystem
**Version**: 1.0  
**Date**: June 2026  
**Status**: Exploratory — pre-implementation  
**Scope**: bloom-development-extension/sensor

---

## Índice

1. [Contexto y postura filosófica](#1-contexto-y-postura-filosófica)
2. [Estados cognitivos nombrados](#2-estados-cognitivos-nombrados)
3. [Árbitro de interrupciones](#3-árbitro-de-interrupciones)
4. [focus_score como campo de primera clase](#4-focus_score-como-campo-de-primera-clase)
5. [Presencia distribuida — privacidad-first](#5-presencia-distribuida--privacidad-first)
6. [Ring buffer como memoria episódica](#6-ring-buffer-como-memoria-episódica)
7. [bloom-sensor replay](#7-bloom-sensor-replay)
8. [HCU — Human Cognitive Unit](#8-hcu--human-cognitive-unit)
9. [Decisiones de diseño pendientes](#9-decisiones-de-diseño-pendientes)
10. [Impacto en root.go — registro explícito](#10-impacto-en-rootgo--registro-explícito)

---

## 1. Contexto y postura filosófica

Sensor es el componente del ecosistema Bloom que escucha al humano. No interpreta intenciones, no ejecuta mandates, no toma decisiones — mide presencia y publica estado. Esa austeridad es intencional.

En un momento donde la industria de software apunta sistemáticamente a remover al humano del loop operativo, Sensor representa la postura contraria: **la presencia humana no es el problema a resolver, es la señal más valiosa del sistema**. Un sistema que requiere al humano para funcionar bien no es un sistema incompleto — es un sistema honesto.

Las features descritas en este documento extienden Sensor desde esa misma postura. Ninguna de ellas introduce decisiones autónomas. Todas amplifican la señal humana, la hacen más legible para el resto del ecosistema, o la preservan como registro histórico con valor económico propio.

### Archivos afectados

| Archivo | Tipo de cambio |
|---|---|
| `internal/metrics/energy.go` | Código nuevo — `CognitiveState`, `HCU compute` |
| `internal/metrics/state.go` | Código nuevo — `CognitivePattern` detector |
| `pkg/events/events.go` | Código nuevo — `HumanCognitiveUnit` struct, nuevos tipos de evento |
| `internal/runtime/engine.go` | Extensión — lógica de árbitro de interrupciones |
| `internal/cli/registry.go` | Extensión — nuevos comandos `diagnostic`, `replay`, `hcu` |
| `internal/core/core.go` | Extensión — `PublishHCU`, correlación con `mandate_state.json` |
| `internal/transport/sentinel_client.go` | Extensión — señal de árbitro hacia Nucleus/Sentinel |

---

## 2. Estados cognitivos nombrados

### Descripción

El `energy_index` actual es determinista, auditable y correcto. Produce un float entre 0 y 1 por tick. Lo que no produce es **vocabulario** — una representación nominal del estado cognitivo que el resto del ecosistema pueda usar para tomar decisiones semánticas.

Esta feature agrega sobre el `energy_index` existente una capa de clasificación que transforma patrones en el ring buffer en estados cognitivos nombrados.

### Estados propuestos

| Estado | Condición | Descripción |
|---|---|---|
| `DEEP_FOCUS` | `energy_index` > 0.75 sostenido por N ticks, pocos idle breaks | El humano está activo, continuo, sin interrupciones propias |
| `ACTIVE` | `energy_index` > 0.50, patrón regular | Actividad normal de trabajo |
| `CONTEXT_SWITCHING` | Muchos cambios de actividad en ventana corta, `energy_index` variable | El humano está fragmentando atención entre tareas |
| `RECOVERY_WINDOW` | `energy_index` < 0.30 tras período de `DEEP_FOCUS` | Caída deliberada o natural post-esfuerzo sostenido |
| `IDLE` | `energy_index` ≈ 0, sesión activa | Presencia física sin actividad computacional |
| `ABSENT` | Sin sesión activa | El humano no está en el sistema |

### Implementación

El detector vive en `internal/metrics/state.go`. Opera sobre una ventana deslizante del ring buffer — no sobre el tick individual. Esto es importante: `DEEP_FOCUS` no se activa en un tick, se **emerge** de un patrón sostenido.

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

type CognitivePattern struct {
    State       CognitiveState `json:"state"`
    Since       time.Time      `json:"since"`
    TicksInState int           `json:"ticks_in_state"`
    Confidence  float64        `json:"confidence"`
}

// DetectPattern analiza la ventana del ring buffer y retorna el patrón actual.
// window: slice de los últimos N snapshots del ring buffer
func DetectPattern(window []Snapshot) CognitivePattern {
    // Implementación: calcular energía media, varianza, frecuencia de idle breaks
    // Retornar estado con nivel de confianza
}
```

El `CognitiveState` se agrega al `HumanState` existente en `pkg/events/events.go` y se publica hacia Sentinel en cada tick, junto con el `energy_index` actual.

### Nuevo comando: `bloom-sensor diagnostic tick`

Expone los estados cognitivos al operador para diagnóstico. Categoría: `RUNTIME`.

```go
// Annotations
"category": "RUNTIME",
"json_response": `{
  "session_active": true,
  "idle_seconds": 45,
  "energy_index": 0.78,
  "focus_score": 0.82,
  "cognitive_state": "DEEP_FOCUS",
  "ticks_in_state": 12,
  "state_confidence": 0.91
}`,
```

---

## 3. Árbitro de interrupciones

### Descripción

Hoy Sentinel puede publicar cualquier intent hacia Nucleus en cualquier momento, independientemente del estado cognitivo del humano. Con los estados cognitivos nombrados disponibles (feature 2), Sensor puede convertirse en un **árbitro de interrupciones**: una señal que Nucleus puede consultar antes de entregar notificaciones no críticas.

La filosofía es estricta: **Sensor no bloquea nada, solo informa**. La decisión de postponer o entregar sigue siendo de Nucleus/Conductor. Sensor provee el contexto; el sistema decide.

### Mecanismo

En `internal/runtime/engine.go`, en cada tick donde el estado cambia, Sensor publica un evento de tipo `CognitiveStateChanged` hacia Sentinel. Nucleus puede suscribirse a este evento y usarlo como gate para notificaciones.

```go
// pkg/events/events.go — nuevo tipo de evento

type CognitiveStateChangedEvent struct {
    PreviousState CognitiveState `json:"previous_state"`
    CurrentState  CognitiveState `json:"current_state"`
    Since         time.Time      `json:"since"`
    Recommendation string        `json:"recommendation"` // "interrupt_ok" | "defer_if_possible" | "defer_strongly"
}
```

El campo `Recommendation` es la voz de Sensor hacia el ecosistema. No es una orden — es una sugerencia informada:

| Estado actual | Recomendación |
|---|---|
| `DEEP_FOCUS` | `defer_strongly` |
| `ACTIVE` | `defer_if_possible` |
| `CONTEXT_SWITCHING` | `interrupt_ok` |
| `RECOVERY_WINDOW` | `interrupt_ok` |
| `IDLE` / `ABSENT` | `interrupt_ok` |

### Implementación en transport

`internal/transport/sentinel_client.go` agrega un método `PublishCognitiveState` que envía el evento al canal de Sentinel correspondiente. Nucleus consume este evento en su capa de governance antes de ejecutar intents que generen notificaciones al humano.

### Sin comando nuevo

Esta feature no requiere comando CLI. Es un comportamiento interno del runtime loop. El estado es inspeccionable vía `bloom-sensor status` y `bloom-sensor diagnostic tick`.

---

## 4. focus_score como campo de primera clase

### Descripción

El `HumanState` en `pkg/events/events.go` ya tiene el campo `focus_score`, pero la guía de Sensor (BTIPS) no define una fórmula explícita para calcularlo — a diferencia del `energy_index` que tiene su fórmula documentada. Esto es tierra fértil.

### Fórmula propuesta

El `focus_score` mide la **calidad del patrón de actividad** en una ventana de tiempo, no solo la presencia. Un humano puede tener `energy_index` alto pero `focus_score` bajo si su actividad es errática.

```
focus_score = f(idle_regularity, session_continuity, context_switches_inverse)
```

Componentes:
- **idle_regularity**: ¿Los breaks son regulares (señal de flujo deliberado) o caóticos (señal de distracción)?
- **session_continuity**: ¿Cuánto tiempo lleva la sesión activa sin interrupción mayor?
- **context_switches_inverse**: Inversamente proporcional a la cantidad de cambios de ventana/proceso en la ventana.

Un `focus_score` alto no significa "trabajando mucho" — significa "trabajando de manera sostenida y deliberada". Un `focus_score` bajo con `energy_index` alto indica actividad intensa pero fragmentada.

### Implementación

La fórmula vive en `internal/metrics/energy.go`, junto al cálculo existente del `energy_index`. Se expone en el mismo tick, sin costo adicional de observación.

```go
// internal/metrics/energy.go

// ComputeFocusScore calcula el focus_score a partir de la ventana del ring buffer.
// Complementa a ComputeEnergyIndex — no lo reemplaza.
func ComputeFocusScore(window []Snapshot) float64 {
    // idle_regularity: coeficiente de variación de los intervalos de idle
    // session_continuity: minutos desde el último idle > threshold
    // context_switches_inverse: 1 / (1 + switches_in_window)
    // Retornar promedio ponderado de los tres componentes
}
```

---

## 5. Presencia distribuida — privacidad-first

### Descripción

Sensor ya corre como servicio en Windows, Darwin y Linux. Esta feature describe cómo la señal de presencia local puede informar decisiones en otros dispositivos del mismo humano — específicamente notificaciones mobile desde Alfred — sin introducir cámaras, micrófonos, ni modelos de ML.

### Mecanismo

Cuando Alfred necesita decidir si enviar una notificación push al dispositivo móvil del humano, puede consultar a Sentinel: "¿cuál es el `cognitive_state` actual del humano en su máquina de trabajo?". Sentinel retorna el último estado publicado por Sensor.

Si el estado es `DEEP_FOCUS`, Alfred postpone la notificación. Si es `IDLE` o `ABSENT`, la envía inmediatamente.

La señal que sustenta esta decisión es `GetLastInputInfo` (Windows) o su equivalente en Darwin/Linux — la API de idle más básica del sistema operativo — más aritmética sobre un ring buffer. Sin cámaras. Sin micrófono. Sin embeddings. Sin ML.

Eso es **privacidad-first por diseño**, no por política: el sistema simplemente no tiene acceso a nada que no sea el tiempo transcurrido desde la última entrada del usuario.

### Cambios requeridos

- `internal/transport/sentinel_client.go`: agregar endpoint de consulta `GET /sensor/cognitive-state` para que Alfred pueda consultar de forma sincrónica
- No hay cambios en el loop de Sensor ni en los comandos CLI

### Sin comando nuevo

El estado ya es publicable vía `bloom-sensor status --json`. La feature es puramente de integración con Alfred vía Sentinel.

---

## 6. Ring buffer como memoria episódica

### Descripción

El ring buffer de Sensor almacena 1440 snapshots — una jornada completa a 1 tick/minuto. El comando `bloom-sensor export` ya permite volcar ese contenido. Esta feature cruza el ring buffer con los timestamps de intents ejecutados en `.bloom/` para producir una **memoria episódica mínima del trabajo**.

### La correlación

```
mandate_state.json   →  timestamps de cada Action ejecutada en un Mandate
delta.json (genes)   →  timestamps de cada mutación de cada gen bajo un intent
ring buffer          →  energy_index + cognitive_state cada 60s
```

Al cruzar estas tres fuentes, es posible responder: *¿en qué estado cognitivo ejecuté cada intent?*. No para optimización automática — para que el humano pueda ver sus propios patrones.

### Extensión del comando export

El comando `bloom-sensor export` existente (TELEMETRY) se extiende con un nuevo flag `--correlate`:

```
bloom-sensor export --last 24h --correlate <path-to-nucleus>
bloom-sensor --json export --last 24h --correlate ~/.bloom/.nucleus-myorg
```

Cuando `--correlate` está presente, el export cruza el ring buffer con los `mandate_state.json` encontrados en el path del Nucleus y agrega al output un campo `intent_correlations`:

```json
{
  "period": "24h",
  "samples": 1440,
  "avg_energy_index": 0.62,
  "avg_focus_score": 0.71,
  "total_active_minutes": 312,
  "intent_correlations": [
    {
      "intent_id": "cor-abc-123",
      "intent_type": "cor",
      "started_at": "2026-06-11T09:15:00Z",
      "closed_at": "2026-06-11T11:42:00Z",
      "avg_energy_index": 0.81,
      "avg_focus_score": 0.79,
      "cognitive_state_distribution": {
        "DEEP_FOCUS": 68,
        "ACTIVE": 24,
        "CONTEXT_SWITCHING": 8
      }
    }
  ],
  "snapshots": []
}
```

### Implementación

- `internal/core/core.go`: nueva función `CorrelateWithNucleus(nucleusPath string, window []Snapshot)` que lee los `mandate_state.json` y cruza timestamps
- El flag `--correlate` se agrega a `createExportCommand` en `internal/cli/registry.go`

---

## 7. bloom-sensor replay

### Descripción

Un comando que toma un timestamp del pasado y reconstruye el estado cognitivo que Sensor hubiera calculado en ese momento, usando los datos del ring buffer. No requiere ML, no requiere estado externo — solo aritmética sobre los snapshots ya almacenados.

### Caso de uso

Entender por qué una sesión de trabajo salió bien o mal. Ver qué estado cognitivo tenía el humano cuando tomó una decisión técnica importante. Auditar una jornada de trabajo desde el punto de vista del esfuerzo.

### Comando: `bloom-sensor replay`

Categoría: **TELEMETRY**

```go
// Annotations
"category": "TELEMETRY",
"json_response": `{
  "timestamp": "2026-06-11T10:30:00Z",
  "reconstructed_state": {
    "energy_index": 0.74,
    "focus_score": 0.81,
    "cognitive_state": "DEEP_FOCUS",
    "ticks_in_state": 8,
    "idle_seconds": 12,
    "session_active": true
  },
  "confidence": 0.94,
  "data_source": "ring_buffer"
}`,
```

```
Usage:
  bloom-sensor replay <timestamp>

Flags:
  --format    Output format: json|text (default: text)

Examples:
  bloom-sensor replay 2026-06-11T10:30:00Z
  bloom-sensor --json replay 2026-06-11T10:30:00Z
  bloom-sensor replay "2 hours ago"
```

El argumento acepta ISO 8601 o expresiones relativas parseables (`"2 hours ago"`, `"yesterday 14:30"`).

La confianza (`confidence`) del resultado decrece si el timestamp solicitado cae en un gap del ring buffer (por ejemplo, si el servicio estaba detenido en ese momento).

### Implementación

- Nueva función factory `createReplayCommand(c *core.Core)` en `internal/cli/registry.go` o archivo separado `internal/cli/replay.go`
- Lógica de negocio `performReplay(c *core.Core, ts time.Time)` separada del closure de `Run` para ser testeable
- `root.go`: `root.AddCommand(createReplayCommand(c))` bajo el bloque `// TELEMETRY`

---

## 8. HCU — Human Cognitive Unit

### Descripción

HCU es una unidad de medida del esfuerzo cognitivo humano invertido en completar o cerrar un Mandate. Es la feature más significativa de este documento porque no solo extiende Sensor — **cambia la naturaleza del Marketplace de Mandates**.

### El problema que resuelve

Hoy no existe ningún mecanismo en el ecosistema para medir cuánto esfuerzo humano real costó construir un Mandate. El precio de un Mandate en el Marketplace sería arbitrario — decidido por el vendor sin base objetiva. Con HCU, el sistema registra el esfuerzo durante la construcción y ese registro se vuelve parte del Mandate mismo.

### Definición formal

```
HCU = Σ (energy_index_i × weight_i) × active_minutes
```

Donde:
- `energy_index_i`: valor del tick i durante la ejecución del Mandate
- `weight_i`: factor de peso según `cognitive_state` en ese tick (`DEEP_FOCUS` = 1.5, `ACTIVE` = 1.0, `CONTEXT_SWITCHING` = 0.7, resto = 0.3)
- `active_minutes`: minutos con sesión activa durante el ciclo de vida del Mandate

HCU no es tiempo de reloj. Es **tiempo cognitivo activo ponderado por calidad de presencia**.

### Las dos métricas

| Métrica | Descripción | Mutabilidad |
|---|---|---|
| `hcu_creation` | Esfuerzo invertido en construir el Mandate. Se calcula al cierre. | Inmutable — es historia |
| `hcu_adoption_estimate` | Estimación del esfuerzo que requerirá del equipo comprador. Se deriva de la complejidad del Mandate. | Calculable en cualquier momento |

### Granularidad por gen

Cada gen del Mandate tiene su propio historial de deltas en `.genes/{gen-id}/history/delta_{N}/delta.json`. Esto permite calcular HCU no solo por Mandate completo sino por función semántica:

```json
{
  "mandate_id": "mandate-uuid",
  "hcu_total": 4.72,
  "hcu_active_minutes": 187,
  "hcu_peak_sessions": 3,
  "hcu_interruption_cost": 0.31,
  "hcu_by_gene": [
    {
      "gene_id": "gen-uuid-1",
      "gene_semantic_role": "authentication_handler",
      "hcu": 1.84,
      "active_minutes": 73,
      "dominant_state": "DEEP_FOCUS"
    },
    {
      "gene_id": "gen-uuid-2",
      "gene_semantic_role": "error_boundary",
      "hcu": 0.61,
      "active_minutes": 28,
      "dominant_state": "ACTIVE"
    }
  ]
}
```

Saber qué parte del Mandate costó más esfuerzo humano informa cómo se diseñan los próximos.

### Nuevo comando: `bloom-sensor hcu`

Categoría: `TELEMETRY` (ver decisión pendiente en sección 9).

```go
// Annotations — comando padre
"category": "TELEMETRY",
// Sin json_response en el padre — los subcomandos lo tienen
```

Subcomandos:

**`bloom-sensor hcu compute <mandate-id>`** — calcula el HCU de un Mandate específico.

```go
"json_response": `{
  "mandate_id": "mandate-uuid",
  "hcu_total": 4.72,
  "hcu_active_minutes": 187,
  "hcu_peak_sessions": 3,
  "hcu_interruption_cost": 0.31,
  "hcu_by_gene": []
}`,
```

**`bloom-sensor hcu summary`** — resumen de HCU de todos los Mandates en el Nucleus local.

```go
"json_response": `{
  "nucleus_path": "~/.bloom/.nucleus-myorg",
  "total_mandates_measured": 12,
  "total_hcu": 47.3,
  "avg_hcu_per_mandate": 3.94,
  "most_expensive_mandate": {
    "mandate_id": "mandate-uuid",
    "hcu": 9.1
  }
}`,
```

### Implementación

- `internal/core/core.go`: función `ComputeMandateHCU(mandateID string, nucleusPath string)` que correlaciona `mandate_state.json` + `delta.json` + ring buffer
- `pkg/events/events.go`: struct `HumanCognitiveUnit` como tipo de primera clase
- `internal/cli/hcu.go` (archivo separado por volumen de lógica): factories `createHCUCommand`, `createHCUComputeCommand`, `createHCUSummaryCommand`
- `root.go`: `root.AddCommand(createHCUCommand(c))` bajo `// TELEMETRY`

### Impacto en el Marketplace

El campo `hcu_creation` se persiste en `mandate_state.json` al cierre del Mandate. Cuando el Mandate se publica al Marketplace, ese campo viaja con él. El comprador ve:

- Cuánto esfuerzo humano costó construirlo
- Qué partes costaron más
- Una estimación del esfuerzo de adopción

El precio no lo pone el vendor arbitrariamente — lo informa el esfuerzo medido. Eso es nuevo.

---

## 9. Decisiones de diseño pendientes

### 9.1 Categoría para HCU y replay: TELEMETRY o COGNITION nueva

Los comandos `hcu` y `replay` encajan semánticamente en TELEMETRY (exportan datos del estado interno de Sensor). Sin embargo, su naturaleza es cualitativamente diferente a `export` — trabajan sobre correlaciones con el Nucleus externo, no solo sobre el ring buffer local.

**Opciones:**

| Opción | Ventaja | Desventaja |
|---|---|---|
| Usar TELEMETRY existente | No rompe la estructura de categorías actual | Mezcla exportación simple con correlación compleja |
| Crear categoría COGNITION | Semánticamente precisa | Requiere editar `CategoryOrder` y `CategoryDescs` en `config.go` |

Si se crea COGNITION, la entrada en `config.go`:

```go
CategoryOrder: []string{
    "SYSTEM",
    "RUNTIME",
    "LIFECYCLE",
    "TELEMETRY",
    "COGNITION",  // nueva
},
CategoryDescs: map[string]string{
    // ... existentes ...
    "COGNITION": "Human cognitive effort measurement and session analysis",
},
```

### 9.2 Persistencia del ring buffer entre reinicios

Las features 6, 7 y 8 dependen del ring buffer para correlaciones históricas. El ring buffer actual es in-memory — un reinicio del servicio lo borra. Para que `replay` y `hcu compute` sean confiables en sesiones pasadas, el ring buffer necesita persistencia opcional en disco.

Propuesta: flag `--persist-buffer` en `bloom-sensor run`, que activa el volcado del ring buffer a un archivo rotativo en el directorio de configuración de Sensor. Desactivado por default para no cambiar el comportamiento actual.

### 9.3 Parsing de timestamps en bloom-sensor replay

El comando `replay` acepta expresiones relativas como `"2 hours ago"`. El ecosistema Bloom no tiene una dependencia de parsing de tiempo natural actualmente. Opciones: dependencia mínima (ej. `github.com/tj/go-naturaldate`), o restringir a ISO 8601 estrictamente en v1 y agregar expresiones relativas en v2.

---

## 10. Impacto en root.go — registro explícito

Siguiendo el estándar de registro explícito de Sensor (sin `init()`, sin auto-discovery), el `BuildRootCommand` en `root.go` quedaría con los nuevos comandos así:

```go
func BuildRootCommand(c *core.Core) *cobra.Command {
    // ... flags globales y setup existente ...

    // SYSTEM
    root.AddCommand(createVersionCommand(c))
    root.AddCommand(createInfoCommand(c))

    // RUNTIME
    root.AddCommand(createRunCommand(c))
    root.AddCommand(createStatusCommand(c))
    root.AddCommand(createDiagnosticCommand(c))  // nuevo — con subcomando tick

    // LIFECYCLE
    root.AddCommand(createEnableCommand(c))
    root.AddCommand(createDisableCommand(c))

    // TELEMETRY
    root.AddCommand(createExportCommand(c))      // extendido — flag --correlate
    root.AddCommand(createReplayCommand(c))      // nuevo

    // TELEMETRY o COGNITION (ver decisión pendiente 9.1)
    root.AddCommand(createHCUCommand(c))         // nuevo — con subcomandos compute y summary

    // ... help renderer ...
}
```

Comandos nuevos: `diagnostic` (con subcomando `tick`), `replay`, `hcu` (con subcomandos `compute` y `summary`).  
Comandos extendidos: `export` (flag `--correlate`).  
Comandos sin cambio en su interfaz: `version`, `info`, `run`, `status`, `enable`, `disable`.

---

*Este documento es parte del sistema de exploración (exp) de Cognituum / Bloom. Las especificaciones aquí descritas son pre-implementación y sujetas a revisión durante el desarrollo.*
