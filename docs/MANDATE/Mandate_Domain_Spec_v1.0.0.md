# Mandate Domain — Implementation Specification

**Bloom / Nucleus · v1.0.0 · Febrero 2026 · Entorno Simulado**

| Campo | Valor |
|---|---|
| Dominio | Strategic (Mandate) |
| Estado | Especificación — Pendiente Implementación |
| Restricción | Extensión controlada — No rediseño |
| Runtime | Temporal (task queue: `mandate-orchestration`) |
| Gobernanza | Nucleus exclusivo |

---

> ⚠️ **Nota de deprecación (2026-09-10):** este documento (v1.0.0, febrero 2026) define el Work Domain como los cuatro intents `.exp`, `.cor`, `dev`, `doc`. Control confirmó el 2026-09-02 que `cor` está **deprecado**, sin transición en curso — ver `docs/CONTROL/AGENDA_MAESTRA.md` §11. Gravity absorbió el articulado de autorización de postulados y posturas que `cor` cubría. Las menciones puntuales de `cor` de acá en adelante quedan anotadas; el Work Domain vigente es `.exp`, `dev`, `doc`. El reemplazo funcional para lo que `cor` cubría en ORGANIZATION/NUCLEUS está propuesto pero sin ratificar.

---

## Tabla de Contenidos

1. [Qué Estamos Construyendo](#1-qué-estamos-construyendo)
2. [Background del Sistema](#2-background-del-sistema)
3. [Qué Está Hecho — Baseline](#3-qué-está-hecho--baseline)
4. [Contratos de Datos](#4-contratos-de-datos)
5. [MandateWorkflow — Diseño](#5-mandateworkflow--diseño)
6. [Flujo de Interacción](#6-flujo-de-interacción)
7. [Modelo de Errores y Recuperación](#7-modelo-de-errores-y-recuperación)
8. [Versionado](#8-versionado)
9. [Archivos Complementarios — Qué Adjuntar](#9-archivos-complementarios--qué-adjuntar)
10. [Resumen Ejecutivo del Alcance](#10-resumen-ejecutivo-del-alcance)

---

## 1. Qué Estamos Construyendo

El sistema Bloom/Nucleus ejecuta hoy intents individuales correctamente. Sin embargo, no existe ninguna unidad estratégica superior que permita **agrupar, secuenciar y persistir** múltiples intents bajo una intención firmada y gobernada. Este documento especifica la implementación del **Mandate Domain**: un nuevo nivel estratégico que resuelve exactamente ese problema, sin modificar nada de lo que ya existe.

### 1.1 El Problema Concreto

Hoy el sistema puede ejecutar un intent `exp`, un intent `dev`, un intent `doc`. Pero no puede:

- **Agrupar** esos intents bajo una intención estratégica firmada
- **Orquestar** su ejecución en secuencia con estado persistente
- **Pausar y reanudar** un plan compuesto a lo largo del tiempo
- **Rastrear estratégicamente** qué pasó, qué falló, qué completó
- **Mantener trazabilidad** separada del Work Domain

### 1.2 La Solución: Mandate

Un **Mandate** es un contrato estratégico firmado que declara un conjunto de acciones compuestas por intents gobernados. No ejecuta lógica directamente. Solo orquesta vía Nucleus.

> **DEFINICIÓN FORMAL**
>
> Un Mandate es un agregador estratégico gobernado que declara acciones, cada una compuesta por uno o más intents, y los orquesta secuencialmente a través de Nucleus usando Temporal como motor de persistencia.

### 1.3 Lo Que NO Es Un Mandate

| NO es / NO hace | SÍ es / SÍ hace |
|---|---|
| Un tipo especial de intent | Un contrato estratégico firmado |
| Un reemplazo de Profile Domain | Una capa superior que orquesta Work |
| Un runtime paralelo | Un Workflow de Temporal en el mismo runtime |
| Ejecutor de lógica de negocio | Orquestador vía Nucleus exclusivamente |
| Escritor directo en `.intents/` | Solicitante a Nucleus para crear intents |
| Parte de Profile Domain | Dominio estratégico independiente |

---

## 2. Background del Sistema

### 2.1 Arquitectura Actual — Tres Dominios

| Dominio | Descripción | Runtime | Estado |
|---|---|---|---|
| Profile Domain | Workflows persistentes operativos asociados a perfiles/entornos. Gestionados por Temporal. Usados por Synapse. | Temporal | ✅ Existente |
| Work Domain | Intents ejecutables: `.exp`, `dev`, `doc`. Ejecutados por Nucleus. (`.cor` deprecado 2026-09-02, ver `docs/CONTROL/AGENDA_MAESTRA.md` §11) | Nucleus | ✅ Definido — Workers pendientes |
| Strategic Domain | Mandates. Orquestan Work. Persistentes y firmados. | Temporal | 🔲 Este documento |

### 2.2 Estado Real del Sistema (Sin Supuestos)

> ⚠️ **CORRECCIONES CRÍTICAS SOBRE EL ESTADO ACTUAL**
>
> - Los workers para intents (`.exp`, `dev`, `doc`) **NO existen aún**. Son trabajo pendiente. (`.cor` fue deprecado 2026-09-02 por control, sin transición en curso, ver `docs/CONTROL/AGENDA_MAESTRA.md` §11 — retirado de esta lista.)
> - La task queue `profile-orchestration` **NO está confirmada** como operativa.
> - Temporal está disponible como runtime pero el estado de los workers es desconocido.
> - El Mandate Domain debe diseñarse como extensión aislada, sin asumir dependencias activas.

### 2.3 Componentes del Sistema

**Nucleus**
Autoridad central de gobernanza. Gobierna, explora y coordina. No desarrolla features directamente. Controla routing, versionado, firma y ejecución. Todo pasa por Nucleus.

**Temporal**
Motor de orquestación persistente. Maneja estado de workflows a largo plazo, retry automático, señales (pause/resume/abort), y recuperación tras crashes. Es el único runtime de ejecución para Profiles y Mandates.

**Synapse**
**No modificar.** Es el motor cognitivo del sistema. Gestiona el ciclo de vida de perfiles de navegador. Interactúa con Profile Domain. Mandate Domain es completamente independiente de Synapse.

**Intents (`.exp`, `dev`, `doc`)** *(`.cor` deprecado 2026-09-02, ver `docs/CONTROL/AGENDA_MAESTRA.md` §11)*
Unidades operativas acotadas. Deterministas. Corto plazo. Producen artefactos en el filesystem. No orquestan. No mantienen narrativa. Su estructura de pipeline (`.pipeline/.response/report.json`) es el mecanismo de observación que usará Mandate.

### 2.4 Jerarquía de Dominio

```
Nivel 1 — Nucleus
         Autoridad, gobernanza, routing, firma

Nivel 2 — Mandate
         Entidad estratégica firmada, versionada

Nivel 3 — Action
         Unidad semántica dentro del Mandate

Nivel 4 — Intent
         Unidad ejecutable concreta (exp / dev / doc)  [cor deprecado, ver `docs/CONTROL/AGENDA_MAESTRA.md` §11]
```

### 2.5 Separación Absoluta de Dominios

| Dominio | Ejecuta | Orquesta | Persiste Estado | Interactúa con |
|---|---|---|---|---|
| Profile | Sí | No | Sí | Synapse |
| Work (Intents) | Sí | No | Parcial | Nucleus |
| Mandate | No | Sí | Sí | Nucleus (exclusivo) |

---

## 3. Qué Está Hecho — Baseline

### 3.1 Tree de Nucleus (Inmutable)

```
.bloom/
└── .nucleus-{organization}/
    ├── .core/
    │   ├── nucleus-config.json
    │   ├── .rules.bl
    │   ├── .standards.bl
    │   ├── .policies.bl
    │   ├── .ai_bot.sovereign.bl
    │   ├── .ai_bot.governance.bl
    │   ├── .ai_bot.plane.bl
    │   └── .meta.json
    ├── .governance/
    │   ├── architecture/
    │   ├── security/
    │   └── quality/
    ├── .intents/
    │   └── .exp/
    │       └── .{intent-name-uuid}/
    │           ├── .exp_state.json
    │           ├── .inquiry/
    │           ├── .discovery/
    │           ├── .findings/
    │           └── .pipeline/
    ├── .cache/
    ├── .relations/
    ├── .ownership.json
    ├── findings/
    └── reports/
```

### 3.2 Patrón de Intent (Referencia)

Todos los tipos de intent siguen el mismo patrón estructural. Mandate respeta y reutiliza este patrón:

| Archivo | Propósito |
|---|---|
| `{type}_state.json` | Estado mutable del intent. Actualizado durante ejecución. |
| `{fase}/` | Carpetas de fases de trabajo (inquiry, discovery, briefing, etc.) |
| `.pipeline/` | Artefactos de ejecución: payload, index, response, report, staging |
| `.pipeline/.response/.report.json` | Artefacto final. Aquí observa MandateWorkflow el resultado. |

### 3.3 Extensión del Tree — Única Modificación

**Solo se agrega esto. Nada más se toca:**

```
.bloom/
└── .nucleus-{organization}/
    └── .mandates/                          ← NUEVO
            └── .{mandate-id-uuid}/         ← NUEVA instancia
                    ├── mandate.json         ← Definición estática firmada
                    └── mandate_state.json   ← Estado mutable del workflow
```

### 3.4 Synapse — Arquitectura de Referencia (No Modificar)

El flujo de Synapse documenta cómo funciona hoy el Profile Domain en Temporal. Es la referencia de arquitectura que MandateWorkflow debe seguir como patrón, sin interceptar:

```
Comando CLI → Synapse → Temporal Workflow → Worker → Sentinel → Chrome Profile
```

MandateWorkflow sigue el mismo patrón:

```
CLI → Nucleus → MandateWorkflow (Temporal) → mandate-orchestration-worker
```

---

## 4. Contratos de Datos

Dos archivos. Separación estricta entre definición (inmutable) y estado (mutable).

### 4.1 `mandate.json` — Definición Estática

```
Ubicación: .bloom/.nucleus-{organization}/.mandates/.{mandate-id-uuid}/mandate.json
Naturaleza: Firmada en creación. INMUTABLE post-creación. Solo Nucleus escribe.
```

**Schema formal:**

```json
{
  "mandateId":    "string  → {slug}-{uuid3}  — único, generado en creación",
  "version":      "string  → semver (1.0.0)",
  "organization": "string  → nombre de la organización",
  "signedBy":     "string  → identidad que firma el mandato",
  "objective":    "string  → descripción del objetivo estratégico",
  "status":       "pending → SIEMPRE pending aquí. Estado vivo en mandate_state.json",
  "createdAt":    "string  → ISO8601",
  "actions": [
    {
      "actionId":    "string → único dentro del mandate",
      "intentType":  "string → exp | dev | doc",  // cor deprecado 2026-09-02, ver AGENDA_MAESTRA §11
      "description": "string → qué hace esta acción",
      "payload":     "object → parámetros para el intent (libre, coherente con el tipo)",
      "status":      "pending → estado inicial declarado. Estado real en mandate_state.json",
      "resultRef":   "null   → siempre null aquí. Actualizado en mandate_state.json"
    }
  ]
}
```

**Ejemplo concreto:**

```json
{
  "mandateId":    "auth-cleanup-a1b2c3",
  "version":      "1.0.0",
  "organization": "bloom",
  "signedBy":     "root",
  "objective":    "Cleanup and stabilize authentication layer",
  "status":       "pending",
  "createdAt":    "2026-02-23T00:00:00Z",
  "actions": [
    {
      "actionId":    "action-001",
      "intentType":  "exp",
      "description": "Detect unused modules in auth layer",
      "payload":     { "scope": "src/auth" },
      "status":      "pending",
      "resultRef":   null
    },
    {
      "actionId":    "action-002",
      "intentType":  "dev",
      "description": "Remove unused modules identified in action-001",
      "payload":     { "scope": "src/auth" },
      "status":      "pending",
      "resultRef":   null
    },
    {
      "actionId":    "action-003",
      "intentType":  "doc",
      "description": "Update documentation after cleanup",
      "payload":     { "scope": "src/auth" },
      "status":      "pending",
      "resultRef":   null
    }
  ]
}
```

**Reglas:**

- `mandateId` es único, formato `{slug}-{uuid3}`, generado en creación.
- `status` en `mandate.json` arranca siempre en `pending`. **No se actualiza aquí post-creación.**
- `actions[].status` en este archivo es el estado inicial declarado (`pending`). El estado real vive en `mandate_state.json`.
- `actions[].resultRef` arranca en `null`. Se actualiza en `mandate_state.json`, no aquí.
- `payload` es libre pero debe ser coherente con lo que el `intentType` correspondiente sabe consumir.
- El archivo no se reescribe nunca. Es el contrato original firmado.

---

### 4.2 `mandate_state.json` — Estado Mutable

```
Ubicación: .bloom/.nucleus-{organization}/.mandates/.{mandate-id-uuid}/mandate_state.json
Naturaleza: Mutable. Propiedad exclusiva de MandateWorkflow.
            Actualizado en cada transición vía persistMandateState activity.
```

**Schema formal:**

```json
{
  "mandateId":        "string → referencia al mandate.json",
  "workflowId":       "string → ID del workflow Temporal. null hasta que Nucleus lo inicia",
  "status":           "pending | running | paused | failed | completed | aborted",
  "currentActionId":  "string → acción en curso. null cuando no está activo",
  "completedActions": ["string"],
  "failedAction":     "string | null → primera acción fallida. Se escribe una sola vez",
  "history": [
    {
      "actionId":   "string",
      "intentId":   "string → ID del intent creado por Nucleus",
      "intentType": "string → exp | dev | doc",  // cor deprecado 2026-09-02, ver AGENDA_MAESTRA §11
      "status":     "completed | failed",
      "resultRef":  "string → path al report.json del intent. null si falló",
      "resolvedAt": "string → ISO8601"
    }
  ],
  "createdAt":  "string → ISO8601",
  "updatedAt":  "string → ISO8601 — actualizado en cada escritura"
}
```

**Ejemplo — estado durante ejecución:**

```json
{
  "mandateId":       "auth-cleanup-a1b2c3",
  "workflowId":      "mandate-workflow-auth-cleanup-a1b2c3",
  "status":          "running",
  "currentActionId": "action-002",
  "completedActions": ["action-001"],
  "failedAction":    null,
  "history": [
    {
      "actionId":   "action-001",
      "intentId":   "exp-detect-unused-x9y8z7",
      "intentType": "exp",
      "status":     "completed",
      "resultRef":  ".intents/.exp/.exp-detect-unused-x9y8z7/.findings/.findings.json",
      "resolvedAt": "2026-02-23T01:00:00Z"
    }
  ],
  "createdAt":  "2026-02-23T00:00:00Z",
  "updatedAt":  "2026-02-23T01:05:00Z"
}
```

**Ejemplo — estado final completado:**

```json
{
  "mandateId":        "auth-cleanup-a1b2c3",
  "workflowId":       "mandate-workflow-auth-cleanup-a1b2c3",
  "status":           "completed",
  "currentActionId":  null,
  "completedActions": ["action-001", "action-002", "action-003"],
  "failedAction":     null,
  "history": [
    {
      "actionId":   "action-001",
      "intentId":   "exp-detect-unused-x9y8z7",
      "intentType": "exp",
      "status":     "completed",
      "resultRef":  ".intents/.exp/.exp-detect-unused-x9y8z7/.findings/.findings.json",
      "resolvedAt": "2026-02-23T01:00:00Z"
    },
    {
      "actionId":   "action-002",
      "intentId":   "dev-remove-unused-m3n4o5",
      "intentType": "dev",
      "status":     "completed",
      "resultRef":  ".intents/.dev/.dev-remove-unused-m3n4o5/.pipeline/.execution/.response/.report.json",
      "resolvedAt": "2026-02-23T02:00:00Z"
    },
    {
      "actionId":   "action-003",
      "intentId":   "doc-update-auth-p6q7r8",
      "intentType": "doc",
      "status":     "completed",
      "resultRef":  ".intents/.doc/.doc-update-auth-p6q7r8/.pipeline/.curation/.turn_1/.response/.report.json",
      "resolvedAt": "2026-02-23T03:00:00Z"
    }
  ],
  "createdAt":  "2026-02-23T00:00:00Z",
  "updatedAt":  "2026-02-23T03:05:00Z"
}
```

**Reglas críticas:**

- Solo `MandateWorkflow` escribe en este archivo, vía la activity `persistMandateState`.
- `workflowId` se establece cuando Nucleus inicia el workflow en Temporal. Hasta ese momento puede ser `null`.
- `currentActionId` apunta a la acción en curso. Es `null` cuando el mandate no está activo o ya completó.
- `completedActions` es **append-only**. Nunca se remueve un entry.
- `failedAction` registra la primera acción que falló. Solo se escribe una vez.
- `history[].resultRef` apunta a paths reales del tree existente. No inventa paths nuevos.
- `updatedAt` se actualiza en cada escritura del workflow.
- En caso de crash y recovery, el workflow lee este archivo, verifica `completedActions`, y retoma desde la primera acción que no esté en esa lista.

### 4.3 Separación de Responsabilidades

| Campo | `mandate.json` | `mandate_state.json` |
|---|---|---|
| Fuente de verdad (qué hacer) | ✅ Sí | ❌ No |
| Estado actual de ejecución | ❌ Solo `pending` inicial | ✅ Estado vivo |
| Historial de ejecución | ❌ | ✅ |
| resultRefs reales post-ejecución | ❌ `null` siempre | ✅ paths reales |
| Quién escribe | Nucleus (solo en creación) | MandateWorkflow (durante ejecución) |
| Mutable post-creación | ❌ Nunca | ✅ Siempre |

---

## 5. MandateWorkflow — Diseño

MandateWorkflow es un Workflow de Temporal. Es el único componente que orquesta la ejecución de un Mandate. No ejecuta lógica de negocio. Solo coordina.

### 5.1 Activities Requeridas

| Activity | Input | Output / Responsabilidad |
|---|---|---|
| `loadMandate(path)` | Path a `mandate.json` | Retorna el objeto mandate completo |
| `loadMandateState(path)` | Path a `mandate_state.json` | Retorna estado actual o estado inicial si no existe |
| `persistMandateState(path, state)` | Path + objeto state | Escribe `mandate_state.json` vía gobernanza Nucleus |
| `createIntent(spec, mandateId)` | Spec del intent + mandateId | Delega a Nucleus. Retorna `{ intentId }` |
| `waitIntentResult(intentId)` | intentId del intent creado | Observa `.pipeline/.response/.report.json` hasta estado final |

> ⚠️ **PUNTO CRÍTICO — `waitIntentResult`**
>
> Esta activity es el punto de integración más sensible.
> Debe observar el mecanismo existente de `.pipeline/.response/` sin crear un canal paralelo.
> Reutiliza el sistema actual de `report.json`. No inventa otro mecanismo.
> Requiere acuerdo sobre el contrato de "estado final" de un intent antes de implementar.

### 5.2 Skeleton de MandateWorkflow

```typescript
import { proxyActivities, defineSignal, setHandler, sleep } from '@temporalio/workflow'

const activities = proxyActivities<{
  loadMandate(path: string): Promise<any>
  loadMandateState(path: string): Promise<any>
  persistMandateState(path: string, state: any): Promise<void>
  createIntent(spec: any, mandateId: string): Promise<{ intentId: string }>
  waitIntentResult(intentId: string): Promise<{ success: boolean, summary: string, ref: string }>
}>({ startToCloseTimeout: '10 minutes' })

export interface MandateInput {
  org: string
  mandateId: string
}

export const pauseSignal  = defineSignal('pause')
export const resumeSignal = defineSignal('resume')
export const abortSignal  = defineSignal('abort')

export async function MandateWorkflow(input: MandateInput) {
  const base = `.bloom/.nucleus-${input.org}/.mandates/${input.mandateId}`

  const mandate = await activities.loadMandate(`${base}/mandate.json`)
  const state   = await activities.loadMandateState(`${base}/mandate_state.json`)

  setHandler(pauseSignal,  () => { state.status = 'paused' })
  setHandler(resumeSignal, () => { state.status = 'running' })
  setHandler(abortSignal,  () => { state.status = 'aborted' })

  state.status = 'running'
  await activities.persistMandateState(`${base}/mandate_state.json`, state)

  for (const action of mandate.actions) {

    // Recovery: skip actions already completed
    if (state.completedActions.includes(action.actionId)) continue
    if (state.status === 'aborted') break

    state.currentActionId = action.actionId
    await activities.persistMandateState(`${base}/mandate_state.json`, state)

    // Pause loop
    while (state.status === 'paused') {
      await sleep('5 seconds')
    }

    // Delegate to Nucleus
    const { intentId } = await activities.createIntent(action, input.mandateId)

    // Observe result via existing pipeline
    const result = await activities.waitIntentResult(intentId)

    state.history.push({
      actionId:   action.actionId,
      intentId,
      intentType: action.intentType,
      status:     result.success ? 'completed' : 'failed',
      resultRef:  result.ref ?? null,
      resolvedAt: new Date().toISOString()
    })

    if (!result.success) {
      state.status       = 'failed'
      state.failedAction = action.actionId
      await activities.persistMandateState(`${base}/mandate_state.json`, state)
      return state
    }

    state.completedActions.push(action.actionId)
    await activities.persistMandateState(`${base}/mandate_state.json`, state)
  }

  state.status          = 'completed'
  state.currentActionId = null
  state.updatedAt       = new Date().toISOString()
  await activities.persistMandateState(`${base}/mandate_state.json`, state)

  return state
}
```

### 5.3 Worker: `mandate-orchestration-worker`

| Campo | Valor |
|---|---|
| Nombre | `mandate-orchestration-worker` |
| Task Queue | `mandate-orchestration` |
| Registra | `MandateWorkflow` + `MandateActivities` |
| NO registra | IntentWorkers ni ProfileWorkflows |
| Aislamiento | Task queue propia. No comparte con `profile-orchestration` ni intent workers |

---

## 6. Flujo de Interacción

### 6.1 Flujo Completo de Ejecución

```
CLI
  └─→ nucleus mandate run {mandateId}
        │
        ├─→ Nucleus valida firma de mandate.json
        ├─→ Nucleus inicia MandateWorkflow en Temporal
        ├─→ Nucleus persiste workflowId en mandate_state.json
        │
        └─→ MandateWorkflow (Temporal — mandate-orchestration task queue)
                │
                ├─→ loadMandate()      → lee mandate.json
                ├─→ loadMandateState() → lee o inicializa mandate_state.json
                │
                └─→ [for each action]
                        │
                        ├─→ persistMandateState() → status: running, currentActionId
                        ├─→ createIntent(action, mandateId) → Nucleus
                        │       │
                        │       └─→ Nucleus valida
                        │           Nucleus crea carpeta en .intents/{type}/{uuid}/
                        │           Nucleus lanza IntentWorker
                        │           Retorna { intentId }
                        │
                        ├─→ waitIntentResult(intentId)
                        │       │
                        │       └─→ Observa .pipeline/.response/.report.json
                        │           hasta estado final (completed | failed)
                        │           Retorna { success, summary, ref }
                        │
                        ├─→ persistMandateState() → history[], completedActions[]
                        │
                        └─→ [siguiente action] o [finalizar]
                                │
                                └─→ persistMandateState() → status: completed | failed
```

### 6.2 Flujo Prohibido

> ❌ **ESTO NO PUEDE EXISTIR**
>
> `Mandate → Intent (directo)` — siempre debe pasar por Nucleus
>
> `Mandate → .intents/ (directo)` — Mandate nunca escribe en `.intents/`
>
> `Mandate → Synapse` — dominios completamente separados
>
> `Mandate → Profile Domain` — sin cruce de responsabilidades

### 6.3 Governance CLI

```bash
# Crear un mandate (Nucleus valida y firma)
nucleus mandate create --file mandate.json

# Ejecutar un mandate
nucleus mandate run {mandateId}

# Pausar un mandate en ejecución
nucleus mandate pause {mandateId}

# Reanudar un mandate pausado
nucleus mandate resume {mandateId}

# Ver estado actual
nucleus mandate status {mandateId}
```

---

## 7. Modelo de Errores y Recuperación

### 7.1 Matriz de Errores

| Caso | Estado Resultante | Comportamiento |
|---|---|---|
| Intent falla | `action → failed`, `mandate → failed` | Registra en `history[]`, escribe `failedAction`, detiene ejecución, persiste estado |
| Crash técnico Temporal | Retoma desde último estado | Retry automático. Lee `mandate_state.json`. Salta `completedActions`. No repite. |
| Pausa manual | `running → paused` | Signal `pause`. Workflow en sleep loop. Resume con signal `resume`. |
| Cancelación manual | `→ aborted` | Signal `abort`. Loop principal interrumpido. Estado final persistido. |
| `mandate.json` no encontrado | `→ failed` inmediato | Error en `loadMandate` activity. Workflow falla antes de comenzar. |
| Versión inválida | `→ failed` inmediato | Workflow valida versión al arrancar. Falla controlado con mensaje claro. |

### 7.2 Reglas de Recovery

- **Idempotencia:** El workflow lee `completedActions[]` y omite acciones ya ejecutadas. Nunca repite trabajo completado.
- **Crash safety:** Temporal persiste el estado del workflow. `mandate_state.json` es la fuente de verdad del progreso.
- **No auto-modificación:** El mandate nunca modifica su `mandate.json` original. Solo `mandate_state.json` es mutable.
- **No creación dinámica:** El mandate no puede crear nuevas acciones durante la ejecución. Las acciones son declarativas.
- **`failedAction` es inmutable:** Una vez escrito, no se sobreescribe aunque haya más fallos posteriores.

---

## 8. Versionado

### 8.1 Política

El campo `version` en `mandate.json` sigue semver (`MAJOR.MINOR.PATCH`).

| Tipo de cambio | Ejemplo | Acción requerida |
|---|---|---|
| MAJOR | Cambio en estructura de `actions[]` | Nueva versión obligatoria. Nuevo `mandateId`. |
| MINOR | Agregar campo opcional a `payload` | Bump de versión. Workflow debe aceptar ambas. |
| PATCH | Fix de typo en `description` | Bump de versión. Sin impacto en ejecución. |

### 8.2 Validación en el Workflow

- `MandateWorkflow` valida el campo `version` al arrancar, antes de cualquier acción.
- Si la versión no es compatible con el worker actual, el workflow falla inmediatamente con mensaje claro.
- No hay migración automática entre versiones. Cada mandate es un contrato cerrado.
- Cambios estructurales requieren un nuevo `mandate.json` con nuevo `mandateId`.

---

## 9. Archivos Complementarios — Qué Adjuntar

Para continuar la implementación en el entorno real, estos son los archivos que deben acompañar esta especificación.

### 9.1 Archivos Críticos (Bloqueantes)

| Archivo | Por qué es necesario | Prioridad |
|---|---|---|
| Ejemplo real de `.exp_state.json` | Define el contrato de estado que `waitIntentResult` debe observar | 🔴 Crítico |
| Ejemplo real de `.pipeline/.response/.report.json` (exp) | Confirma estructura del artefacto final del intent. Es el punto de integración de `waitIntentResult`. | 🔴 Crítico |
| Cómo hoy Synapse dispara un intent (código o pseudocódigo) | Para que `createIntent` siga el mismo patrón de delegación a Nucleus sin romper nada. | 🔴 Crítico |

### 9.2 Archivos Importantes (No Bloqueantes para Diseño)

| Archivo | Por qué es necesario | Prioridad |
|---|---|---|
| `nucleus-config.json` actual | Confirma configuración de Temporal y workers existentes | 🟡 Importante |
| Skeleton actual del worker de Synapse (ProfileWorkflow) | Referencia de arquitectura para `mandate-orchestration-worker` | 🟡 Importante |
| Ejemplo de `.dev_state.json` y su `.pipeline/` | Complementa entendimiento del tree de Project | 🟡 Importante |
| `.governance/.decisions/` (si hay ADRs) | Para respetar decisiones arquitectónicas previas | 🟡 Importante |

### 9.3 Lo Que NO Se Necesita

- BTips general (visión estratégica) — no aporta para esta implementación técnica.
- Documentación de mercado o roadmap de producto.
- Synapse Usage Guide completo — solo el mecanismo de disparo de intents es relevante.

---

## 10. Resumen Ejecutivo del Alcance

### 10.1 Qué Se Implementa

1. Contrato `mandate.json` — definición estática, firmada, inmutable.
2. Contrato `mandate_state.json` — estado mutable del workflow.
3. Extensión del tree de Nucleus: `.mandates/` como única modificación.
4. `MandateActivities` (5 activities): `loadMandate`, `loadMandateState`, `persistMandateState`, `createIntent`, `waitIntentResult`.
5. `MandateWorkflow` (Temporal): itera acciones, orquesta intents, persiste estado, maneja señales.
6. `mandate-orchestration-worker`: worker aislado, task queue propia.
7. Governance CLI: `nucleus mandate run/pause/resume/status`.
8. Modelo de errores, recovery y versionado.

### 10.2 Qué NO Se Toca

- Profile Domain (Synapse) — ningún archivo, ningún workflow, ninguna activity.
- `.intents/` — ni lectura directa ni escritura. Solo vía Nucleus.
- Workers existentes — ninguno se modifica ni comparte task queue.
- Gobernanza de Nucleus — se extiende, no se reemplaza.
- Tree actual de Nucleus — solo se agrega `.mandates/`.

### 10.3 Próximo Paso Desbloqueante

> 🔴 **BLOQUEANTE: `waitIntentResult`**
>
> Antes de escribir código de `MandateWorkflow`, se necesita confirmar:
>
> 1. Estructura exacta de `.pipeline/.response/.report.json` para `.exp` (`.cor` deprecado 2026-09-02, ver AGENDA_MAESTRA §11)
> 2. Cómo un intent comunica su estado final (polling sobre `report.json` vs. señal Temporal)
> 3. Qué campos de `report.json` confirman que el intent está `completed` o `failed`
>
> Adjuntar ejemplos reales de estos archivos desbloquea el Paso 3 completo.

---

*Mandate Domain — Implementation Specification v1.0.0 · Bloom / Nucleus · Febrero 2026 · Entorno Simulado*
