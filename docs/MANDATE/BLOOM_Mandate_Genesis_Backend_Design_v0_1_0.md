# BLOOM — Mandate Genesis: Diseño de Backend v0.1.0

**Tipo:** Diseño técnico interno (no RFC todavía — depende de los "Puntos abiertos" de §8)
**Dominio:** Nucleus · Temporal · Filesystem state · Fastify validation
**Depende de:** `BLOOM_Mandate_CLI_Command_Surface_v0_2_0.md`
**Alcance:** Solo `mandateType: genesis` y `mandateType: domain_expansion`. No modifica el diseño ya cerrado de `standard` en §2–§5 del Command Surface — lo **reutiliza** en la Fase 4.

**Historial de revisión:**
- v0.1.0 — versión original (§0–§8).
- Consolidación posterior — se agrega §9 (Control Plane / eventos WebSocket, `:4124`) y §2.5 (topología de implementación de los handlers Fastify). No hay cambios de modelo en §1–§8: el ciclo de vida, el filesystem (`gen_state.json` / `mandate.json` / `mandate_state.json`) y los schemas quedan tal como estaban — esta consolidación es aditiva, documenta la capa de eventos que ya estaba implícita en D-B2/D-B3 pero no tenía contrato formal.

---

## 0. Resumen ejecutivo de las tres decisiones de diseño

| # | Decisión | Por qué |
|---|---|---|
| D-B1 | Fase 4 (scaffold) **no** es un mecanismo propio de Genesis. Una vez firmado el `mandate.json`, cada dominio confirmado se materializa como una `Action` normal (`type: run_intent`, `intentType: gen`, `subPhase: scaffold`) dentro del mismo `operational.actions[]`, y se ejecuta con el `MandateExecutionWorkflow` que ya existe para `mandate run`. | Evita duplicar la máquina de estados Action→Intent→Persistencia. `pause`/`resume`/`status` post-firma quedan gratis — no hay lógica nueva que mantener para Genesis en ese tramo. |
| D-B2 | Pre-firma (Fases 1–3) usa un workflow propio, `MandateGenesisBuildWorkflow`, con **un `EXECUTE_INTENT` discreto por fase** (`ingest`, `cluster`) — nunca un intent único de larga duración cubriendo las 4 fases. | Mismo patrón que ya usa `mandate pipeline` en el Command Surface (§3): un fallo puntual no obliga a recomenzar desde cero, y Sentinel puede recuperar por `sequence number` sin ambigüedad sobre "en qué sub-paso estaba". |
| D-B3 | La Fase 3 (validate / Human Sync Point) **no es un intent**. Es una señal de Temporal (`Signal`) que bloquea el workflow hasta que el CLI dispare `nucleus mandate genesis domains confirm`. | El punto de sincronización humana es, por definición, algo que Nucleus gobierna directamente — no tiene sentido enrutarlo como intent hacia Brain, que no tiene autoridad para decidir en nombre de un humano. |

Consecuencia directa de D-B1 + D-B2: la pregunta "¿intent único o múltiples sub-intents en Fase 4?" tiene dos respuestas distintas según el lado de la firma:

```
Pre-firma  (building):  ingest → cluster → [Human Sync] → sign()
                         cada flecha = 1 EXECUTE_INTENT discreto (intentType: gen, subPhase: ...)
Post-firma (running):   scaffold(domain A) ─┐
                         scaffold(domain B) ─┼─→ Actions paralelas, mismo motor que `mandate run`
                         scaffold(domain C) ─┘
```

---

## 1. Modelo de estados

### 1.1 `standard` (sin cambios respecto al Command Surface v0.2.0)

```
draft → ready_to_sign → signed → running → (paused ⇄ resumed) → completed | failed
```

### 1.2 `genesis` / `domain_expansion`

```
                    ┌─────────────── pre-firma (building) ───────────────┐
create ──► building ──► ingest ──► cluster ──► validate (Human Sync) ──► sign()
              │             │           │              │                    │
              │             │           │              │                    ▼
              │             ▼           ▼              ▼              [idéntico a standard desde acá]
              │        building_paused (ver §7 — pausable en ingest/cluster,
              │                          no-op semántico durante el wait de validate)
              ▼
        building_failed (si ingest o cluster terminan en INTENT_FAILED sin recuperación)
```

Diferencia clave con `standard`: **el contrato no existe como artefacto firmado hasta salir de `validate`.** Todo lo que pasa en `building` es mutable y vive exclusivamente en `gen_state.json`, nunca en `mandate.json` — porque `mandate.json` firmado es, por definición en BTIPS, inmutable, y el contenido real de `operational.actions[]` (qué dominios existen) no se conoce hasta que el humano confirma.

### 1.3 `domain_expansion` como caso particular

Recorre exactamente el mismo diagrama de 1.2, con dos restricciones adicionales que se validan en `create` (ver §5):

- `--base-genesis <mandateId>` debe apuntar a un mandate con `mandateType: genesis` y `currentStatus: completed`.
- La Fase 2 (`cluster`) corre con un input adicional: los dominios ya existentes del genesis base, para que Brain pueda distinguir "dominio nuevo" de "extensión de un dominio existente" (cohesión contra el set ya materializado, no solo contra el `--source` nuevo).

---

## 2. Filesystem — `.bloom/.nucleus-{org}/.mandates/{id}/`

```
.bloom/.nucleus-{org}/.mandates/{id}/
├── gen_state.json              # solo existe entre `create --type genesis` y `sign()`.
│                                # NO se borra al firmar — pasa a ser el registro de auditoría
│                                # de cómo se llegó al contrato (ver D-8 en §8).
├── mandate.json                # NO existe hasta que termina la Fase 3 y se confirma.
│                                # Desde ese momento, formato idéntico al de un mandate `standard`.
├── mandate_state.json          # NO existe hasta la firma. A partir de ahí, gobierna Fase 4
│                                # exactamente igual que en `standard` (operationalState por Action).
└── domains/
    └── {domainId}/
        ├── candidate.json      # snapshot de Fase 2 (Brain), pre-confirmación
        └── confirmed.json      # solo si el humano lo aprobó en Fase 3
```

Reglas de existencia de archivos, porque son la forma más barata de que `nucleus mandate status` sepa en qué mitad del diagrama está un mandate sin tener que interpretar campos:

| Archivo presente | Significa |
|---|---|
| Solo `gen_state.json` | Mandate en `building` (pre-firma), cualquier fase 1–3 |
| `gen_state.json` + `mandate.json` | Firmado — Fase 4 en curso o completa. `gen_state.json` queda como historial, ya no se escribe |
| Ni uno ni otro | El `mandateId` no existe |

No propongo un `.lock` file separado para el estado de pausa — el campo `status` dentro de `gen_state.json`/`mandate_state.json` es la única fuente de verdad. Un lock file adicional sería una segunda fuente de verdad que puede desincronizarse (ver el gap de "buffer de Sentinel sin definición de durabilidad" que señalamos en el análisis anterior — no quiero repetir ese patrón acá).

### 2.5 Topología de implementación — módulos Fastify

Esto **no** es el árbol de arriba. El árbol de 2. es el filesystem de *datos en runtime* (`.bloom/.nucleus-{org}/.mandates/{id}/...`), que el Daemon lee y escribe. Lo de acá es el layout de *código fuente* del propio Daemon — dónde vive cada pieza de §5 y §6 dentro del paquete de Nucleus.

```
<raíz del paquete del Daemon — sin confirmar todavía en qué monorepo/carpeta cuelga>/
└── src/
    ├── schemas/
    │   └── create-mandate.schema.ts        # §5.1 — CreateMandateBody y la unión discriminada
    │
    ├── hooks/
    │   └── assert-base-genesis-completed.hook.ts   # §5.2 — preHandler, valida contra filesystem
    │
    ├── types/
    │   └── gen-state.types.ts              # §3 — GenState, PhaseRecord, HumanSyncRecord, DomainCandidate
    │
    ├── fs/
    │   └── mandate-paths.ts                # resuelve mandatePath()/genStatePath()/mandateJsonPath()
    │                                        # usado por §5.2, §5.4, §7.4
    │
    ├── workflows/
    │   └── genesis-build-workflow.types.ts # input de MandateGenesisBuildWorkflow (§6.1)
    │
    ├── temporal/
    │   └── client.ts                       # arranca MandateGenesisBuildWorkflow (§6.1) vía WorkflowClient
    │
    ├── events/
    │   ├── ws-events.ts                    # §9 — contrato completo de eventos del Control Plane
    │   └── mandate-event-publisher.ts      # wrapper tipado sobre el broadcaster de :4124
    │
    ├── handlers/
    │   └── create-mandate.handler.ts       # §5.4 — createMandateHandler
    │
    └── routes/
        └── mandates.routes.ts              # registra POST /mandates: schema + preHandler + handler
```

Grafo de dependencias internas (quién importa a quién, sin las libs externas):

```
routes/mandates.routes.ts
  ├─→ schemas/create-mandate.schema.ts
  ├─→ hooks/assert-base-genesis-completed.hook.ts ──→ schemas/create-mandate.schema.ts
  │                                                 ──→ fs/mandate-paths.ts
  │                                                 ──→ types/gen-state.types.ts
  ├─→ handlers/create-mandate.handler.ts ──→ schemas/create-mandate.schema.ts
  │                                       ──→ fs/mandate-paths.ts
  │                                       ──→ types/gen-state.types.ts
  │                                       ──→ temporal/client.ts ──→ workflows/genesis-build-workflow.types.ts
  │                                       ──→ events/mandate-event-publisher.ts ──→ events/ws-events.ts
  └─→ events/mandate-event-publisher.ts
```

**Pendiente, no resuelto en esta consolidación:** en qué carpeta del monorepo cuelga la raíz `src/` de arriba (nombre del paquete del Daemon, si convive con código de otros dominios de Nucleus o si Mandates tiene su propio paquete). Ningún documento de este dominio lo define — queda para resolver contra el repo real, no por diseño en abstracto.

---

## 3. Schemas TypeScript — `gen_state.json`

```typescript
interface GenState {
  mandateId: string;
  mandateType: 'genesis' | 'domain_expansion';
  baseGenesisId?: string;        // solo domain_expansion — referencia al genesis del que parte
  source: string;                // repo/path/URL analizado en ingest
  project: string;
  name: string;

  status: 'building' | 'building_paused' | 'building_failed' | 'signed';
  currentPhase: 'ingest' | 'cluster' | 'validate' | 'scaffold' | 'complete';

  phases: {
    ingest: PhaseRecord;
    cluster: PhaseRecord;
    validate: PhaseRecord & { humanSync: HumanSyncRecord };
    // 'scaffold' NO vive acá — a partir de la firma, el progreso de scaffold
    // se lee de mandate_state.json (D-B1), no de gen_state.json.
  };

  createdAt: string;             // ISO 8601
  signedAt?: string;             // se completa recién al confirmar Fase 3
  pausedAt?: string;
  pausedPhase?: 'ingest' | 'cluster';   // nunca 'validate' — ver §7.2
}

interface PhaseRecord {
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  startedAt?: string;
  completedAt?: string;
  intentId?: string;             // correlation id del EXECUTE_INTENT
  sequenceNumber?: number;       // sequence number de Sentinel al completar — para recovery
  failureReason?: string;
}

interface HumanSyncRecord {
  candidateDomains: DomainCandidate[];   // escrito por Brain al completar 'cluster'
  confirmedDomainIds?: string[];         // escrito por Nucleus al recibir el comando confirm
  confirmedAt?: string;
  confirmedBy?: string;                  // identidad — ver D-9 en §8, mismo gap que ya
                                          // señalamos para 'evidence record decision'
}

interface DomainCandidate {
  domainId: string;
  name: string;
  cohesionScore: number;          // 0.0–1.0, mismo rango que --min-cohesion en link-genes
  suggestedActionCount: number;   // preview, no las Actions reales todavía
  overlapsWithExisting?: string;  // solo domain_expansion: domainId del genesis base si hay solapamiento
}
```

`mandate_state.json` post-firma **no cambia de forma** respecto al que ya usa `standard` — cada dominio confirmado se vuelca a una `Action` en `operational.actions[]` con `intentType: 'gen'` y un campo `payload.subPhase: 'scaffold'`, y su progreso se seguimiento con el mismo `operationalState` que ya existe. No lo repito acá porque no hay nada nuevo que definir.

---

## 4. Comandos CLI — nuevos y extendidos

```
# Creación — discriminado por --type
nucleus mandate create --type standard --project <id> --name <name> --objective <string>
nucleus mandate create --type genesis --project <id> --name <name> --source <path|url>
nucleus mandate create --type domain_expansion --project <id> --name <name> \
  --source <path|url> --base-genesis <mandateId>

# Fase 3 — Human Sync Point (nuevo, específico de genesis/domain_expansion)
nucleus mandate genesis domains list --mandate <id>
  # lee gen_state.json.phases.validate.humanSync.candidateDomains — solo válido si
  # currentPhase == 'validate'

nucleus mandate genesis domains confirm --mandate <id> --domain <domainId,...> \
  [--rename <domainId>:<newName>,...]
  # dispara la Signal de Temporal que libera el wait; esto es lo que efectivamente
  # ejecuta sign() — ver §6.2

nucleus mandate genesis domains reject --mandate <id> --domain <domainId,...>
  # remueve candidatos antes de confirmar; no requiere re-correr cluster completo

# Ciclo de vida — mismos verbos que standard, comportamiento discriminado internamente
nucleus mandate pause --mandate <id>
nucleus mandate resume --mandate <id>
nucleus mandate status --mandate <id>
```

No agrego verbos nuevos para pause/resume/status — el comando es el mismo de siempre; lo que cambia es a qué archivo y a qué workflow de Temporal apunta internamente, resuelto por la regla de existencia de archivos de §2.

---

## 5. Validación — Fastify + TypeBox

Asumo Fastify con `@fastify/type-provider-typebox` (es el patrón más común hoy para tener inferencia de tipos en TS sin duplicar interfaces a mano). La CLI le pega a una API local expuesta por el daemon de Nucleus.

### 5.1 Discriminated union en `create`

```typescript
import { Type, Static } from '@sinclair/typebox'

const StandardCreateBody = Type.Object({
  mandateType: Type.Literal('standard'),
  project: Type.String(),
  name: Type.String({ minLength: 1 }),
  objective: Type.String({ minLength: 1 }),
}, { additionalProperties: false })

const GenesisCreateBody = Type.Object({
  mandateType: Type.Literal('genesis'),
  project: Type.String(),
  name: Type.String({ minLength: 1 }),
  source: Type.String({ minLength: 1 }),
}, { additionalProperties: false })

const DomainExpansionCreateBody = Type.Object({
  mandateType: Type.Literal('domain_expansion'),
  project: Type.String(),
  name: Type.String({ minLength: 1 }),
  source: Type.String({ minLength: 1 }),
  baseGenesis: Type.String({ minLength: 1 }),
}, { additionalProperties: false })

// oneOf + discriminator: le da a Ajv (el validador default de Fastify) un error
// específico por rama en vez de "no matching schema in anyOf", que es ilegible
// para un usuario de CLI.
const CreateMandateBody = Type.Unsafe<
  Static<typeof StandardCreateBody> | Static<typeof GenesisCreateBody> | Static<typeof DomainExpansionCreateBody>
>({
  oneOf: [StandardCreateBody, GenesisCreateBody, DomainExpansionCreateBody],
  discriminator: { propertyName: 'mandateType' },
})

fastify.post('/mandates', {
  schema: { body: CreateMandateBody },
  preHandler: [assertBaseGenesisCompletedIfApplicable],
}, createMandateHandler)
```

Con esto, `--type standard --source foo` (mezclando campos de ramas distintas) falla en validación estructural con un mensaje que señala la rama `genesis`/`domain_expansion` en vez de un genérico "no matching schema" — importante para UX de CLI aunque hoy estemos dejando la UX de lado, porque el mensaje de error *es* parte del contrato del comando.

### 5.2 Lo que el schema no puede validar — `preHandler`

`--base-genesis` apuntando a un mandate real, firmado y `completed` es una verificación semántica contra el filesystem, no estructural. JSON Schema no tiene forma de expresar "este string debe ser un ID que exista y cumpla una condición de estado" — eso va en un hook:

```typescript
async function assertBaseGenesisCompletedIfApplicable(
  request: FastifyRequest<{ Body: Static<typeof CreateMandateBody> }>,
  reply: FastifyReply
) {
  if (request.body.mandateType !== 'domain_expansion') return

  const baseId = request.body.baseGenesis
  const basePath = mandatePath(request.body.project, baseId, 'mandate.json')

  if (!existsSync(basePath)) {
    return reply.code(422).send({
      error: 'BASE_GENESIS_NOT_FOUND',
      detail: `mandate.json no existe para ${baseId} — ¿está todavía en 'building'?`,
    })
  }

  const base = JSON.parse(await readFile(basePath, 'utf-8'))

  if (base.mandateType !== 'genesis') {
    return reply.code(422).send({
      error: 'BASE_GENESIS_WRONG_TYPE',
      detail: `${baseId} es mandateType='${base.mandateType}', se requiere 'genesis'`,
      // nota: esto es una decisión explícita, no un descuido — ver D-7 en §8
      // sobre si domain_expansion debería poder encadenarse sobre otro domain_expansion
    })
  }

  if (base.currentStatus !== 'completed') {
    return reply.code(422).send({
      error: 'BASE_GENESIS_NOT_COMPLETED',
      detail: `${baseId} está en currentStatus='${base.currentStatus}', se requiere 'completed'`,
    })
  }
}
```

### 5.3 Schema de `domains confirm`

```typescript
const ConfirmDomainsBody = Type.Object({
  domains: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
  renames: Type.Optional(Type.Record(Type.String(), Type.String())),
}, { additionalProperties: false })
```

El `preHandler` acá valida contra `gen_state.json`, no contra el body en sí: cada `domainId` en `domains` debe existir en `phases.validate.humanSync.candidateDomains`, y `currentPhase` debe ser exactamente `'validate'` — confirmar en cualquier otra fase es un 409, no un 400 (es un conflicto de estado, no un body inválido).

---

## 6. Contratos Temporal

### 6.1 `MandateGenesisBuildWorkflow` — pre-firma

```typescript
export async function MandateGenesisBuildWorkflow(input: GenesisBuildInput): Promise<void> {
  let paused = false

  setHandler(pauseSignal, () => { paused = true })
  setHandler(resumeSignal, () => { paused = false })

  // Fase 1
  await condition(() => !paused)
  await executeActivity(runGenIntentActivity, { subPhase: 'ingest', ...input })

  // Fase 2
  await condition(() => !paused)
  await executeActivity(runGenIntentActivity, { subPhase: 'cluster', ...input })

  // Fase 3 — Human Sync Point. NO se chequea `paused` acá: ver D-B3 y §7.2,
  // el wait de la signal YA es un estado de espera: un `pause` explícito
  // durante este tramo es un no-op que el handler debe responder como tal,
  // no una transición de estado adicional que journalear.
  const confirmation = await condition(() => humanConfirmationReceived, HUMAN_SYNC_TIMEOUT)
  if (!confirmation) {
    throw ApplicationFailure.create({ message: 'HUMAN_SYNC_TIMEOUT', nonRetryable: true })
  }

  // sign() es una operación de Nucleus (Vault Authority, local) — no es una Activity
  // que se enruta a Brain. Se ejecuta directo acá, dentro del propio workflow,
  // como Local Activity para que quede en el historial de Temporal sin latencia de red.
  await executeLocalActivity(signMandateActivity, { confirmedDomains: confirmedDomainIds })

  // A partir de acá, este workflow TERMINA. Fase 4 no es responsabilidad suya —
  // ver D-B1. El propio signMandateActivity dispara el arranque de
  // MandateExecutionWorkflow (el mismo que usa `mandate run` en standard),
  // pasándole las Actions de scaffold ya generadas.
}
```

Puntos a favor de este diseño frente a "un solo intent .gen de 4 fases":

1. **Recuperación granular.** Si Brain se cae durante `cluster`, Sentinel reconecta y reintenta *solo* `cluster` — `ingest` ya quedó persistido como `completed` en `gen_state.json` con su `sequenceNumber`. Con un intent único, no hay forma de saber desde afuera en qué sub-fase interna estaba Brain cuando cayó, salvo que Brain mismo lo reporte vía `INTENT_PROGRESS` — y eso convierte a `INTENT_PROGRESS` en la única fuente de verdad de recovery, cuando el propio Command Surface (§0, R-2) ya estableció que la persistencia de estado es responsabilidad de Nucleus al recibir `INTENT_COMPLETED`, no de inferir del progreso.
2. **El Human Sync Point no puede vivir dentro de un intent.** Un `EXECUTE_INTENT` es una operación que Sentinel enruta a Brain para ejecución — Brain no tiene (ni debería tener) autoridad para bloquear y esperar una confirmación humana; eso es exactamente el rol de Nucleus. Meter la Fase 3 dentro del mismo intent que ingest/cluster rompe el modelo de responsabilidad del documento base.
3. **Idempotencia acotada.** Cada Activity de Temporal ya tiene reintento nativo con backoff; si el intent fuera monolítico, un reintento completo re-ejecutaría ingest aunque ya hubiera terminado bien, con el riesgo de duplicar trabajo en ChromaDB que señalamos como deuda técnica en el análisis anterior (idempotencia de Brain ante reintentos, no resuelta todavía — ver D-6 en §8).

### 6.2 Transición a `MandateExecutionWorkflow` — Fase 4

`signMandateActivity` no solo escribe `mandate.json`: como parte del mismo acto de firma, traduce cada `confirmedDomainId` en una `Action` (`type: run_intent`, `intentType: gen`, `payload.subPhase: 'scaffold'`, `payload.domainId: <id>`) y arma `operational.actions[]` con `workflow.type: 'parallel'` por default (dominios confirmados se asumen independientes — ver D-3 en §8 sobre detección de dependencias cruzadas).

A partir de ahí, arrancar `MandateExecutionWorkflow` con ese `mandate.json` recién firmado es **exactamente** el mismo `child workflow start` que dispara `nucleus mandate run` en un `standard`. No hay Activity nueva que escribir para Fase 4 — es la reutilización literal de D-B1.

---

## 7. `pause` / `resume` / `status` — comportamiento exacto por caso

### 7.1 `standard` — sin cambios

Ya definido en el Command Surface §4: opera sobre `MandateExecutionWorkflow`, señaliza no avanzar a la siguiente Action, no interrumpe la conexión Sentinel-Brain de una Action en curso.

### 7.2 `genesis`/`domain_expansion`, pre-firma (`building`)

| Comando | Si `currentPhase` ∈ {ingest, cluster} | Si `currentPhase` == validate |
|---|---|---|
| `pause` | Envía `pauseSignal`. El `condition()` bloquea antes de la próxima Activity. `gen_state.json`: `status → building_paused`, `pausedPhase` = fase actual, `pausedAt` = now. La Activity en curso (si la hay) **no se cancela** — termina y persiste su resultado; el pause solo impide arrancar la siguiente. | **No-op semántico.** El workflow ya está bloqueado en `condition(() => humanConfirmationReceived, ...)`, esperando al humano — no hay "próximo paso" que impedir. El comando responde `200` con un mensaje explícito ("ya está esperando confirmación humana, pause no tiene efecto acá") en vez de silenciosamente no hacer nada o devolver error. |
| `resume` | Envía `resumeSignal`. `status → building`. La próxima Activity pendiente arranca. | No-op semántico, mismo criterio. |
| `status` | Lee `gen_state.json` directo (sin chain). Devuelve `currentPhase`, estado de cada `PhaseRecord`, y si `status == building_paused`, `pausedPhase`/`pausedAt`. | Igual, más el contenido de `humanSync.candidateDomains` para que el operador sepa que necesita correr `genesis domains confirm`. |

### 7.3 `genesis`/`domain_expansion`, post-firma (`signed` en adelante)

Idéntico a §7.1 — es literalmente un `standard` desde ese punto (D-B1), así que no hay tabla nueva que escribir.

### 7.4 `status` — lógica de discriminación unificada

```typescript
async function getMandateStatus(mandateId: string, project: string) {
  const dir = mandatePath(project, mandateId)

  if (existsSync(join(dir, 'mandate.json'))) {
    // firmado — sea standard, genesis post-firma o domain_expansion post-firma,
    // todos leen mandate_state.json de la misma forma.
    return readStandardStatus(dir)
  }

  if (existsSync(join(dir, 'gen_state.json'))) {
    return readGenesisBuildStatus(dir)   // §3, formato GenState
  }

  throw new NotFoundError(`mandateId ${mandateId} no existe en project ${project}`)
}
```

---

## 8. Puntos abiertos — necesitan decisión antes de codear

| # | Pendiente | Por qué importa |
|---|---|---|
| D-1 | `HUMAN_SYNC_TIMEOUT` — ¿cuánto tiempo espera el workflow una confirmación antes de fallar? ¿Hay timeout o el wait es indefinido? | Si es indefinido, un `genesis` puede quedar "vivo" en Temporal por semanas, consumiendo un workflow slot; si tiene timeout, hace falta definir qué pasa con `gen_state.json` al expirar (¿`building_failed`? ¿se puede re-disparar `validate` sin recorrer `ingest`/`cluster` de nuevo?) |
| D-3 | Detección de dependencias cruzadas entre dominios confirmados — hoy asumo `workflow.type: 'parallel'` por default en Fase 4. Si Brain en `cluster` detecta que el dominio B depende de A, ¿dónde se registra esa relación para que `signMandateActivity` arme `dependsOn` en vez de paralelo puro? | Si no se resuelve, todo scaffold es paralelo siempre, lo cual puede ser incorrecto para dominios con dependencia real de código |
| D-6 (heredado) | Idempotencia de Brain ante reintentos de Activity — ya señalado en el análisis anterior, se vuelve más urgente acá porque Fase 1 (`ingest`) puede ser costosa (leer un repo completo) y un reintento ciego la duplicaría | Afecta directamente el `retry policy` de `runGenIntentActivity` |
| D-7 | ¿`domain_expansion` puede tener como `--base-genesis` otro `domain_expansion` ya completado, o solo un `genesis` raíz? Hoy el `preHandler` de §5.2 lo rechaza explícitamente | Afecta si el modelo de dominios termina siendo un árbol o una lista plana anclada siempre a un único genesis |
| D-8 | ¿`gen_state.json` se conserva indefinidamente post-firma como auditoría, o se archiva/comprime luego de un tiempo? Lo dejé "vive para siempre" en §2 por default, pero eso puede no ser sostenible en volumen | Impacta diseño de storage, no solo de comandos |
| D-9 (heredado) | `confirmedBy` en `HumanSyncRecord` depende del mismo mecanismo de identidad que ya señalamos sin resolver para `evidence record decision` en el documento anterior | Bloquea que `genesis domains confirm` tenga atribución real, hoy sería un campo sin fuente de verdad |

---

*Fin del documento — v0.1.0. Complementa `BLOOM_Mandate_CLI_Command_Surface_v0_2_0.md`, no lo reemplaza.*
