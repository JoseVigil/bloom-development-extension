# BLOOM — Mandate Genesis: Diseño de Backend v0.1.0

**Tipo:** Diseño técnico interno (no RFC todavía — depende de los "Puntos abiertos" de §8)
**Dominio:** Nucleus · Temporal · Filesystem state · Fastify validation
**Depende de:** `BLOOM_Mandate_CLI_Command_Surface_v0_2_0.md`
**Alcance:** Solo `mandateType: genesis` y `mandateType: domain_expansion`. No modifica el diseño ya cerrado de `standard` en §2–§5 del Command Surface — lo **reutiliza** en la Fase 4.

**Historial de revisión:**
- v0.1.0 — versión original (§0–§8).
- Consolidación posterior — se agrega §9 (Control Plane / eventos WebSocket, `:4124`) y §2.5 (topología de implementación de los handlers Fastify). No hay cambios de modelo en §1–§8: el ciclo de vida, el filesystem (`gen_state.json` / `mandate.json` / `mandate_state.json`) y los schemas quedan tal como estaban — esta consolidación es aditiva, documenta la capa de eventos que ya estaba implícita en D-B2/D-B3 pero no tenía contrato formal.
  - **Corrección: ese §9 nunca se escribió.** El archivo termina en §8. La referencia a `ws-events.ts # §9` en el árbol de §2 quedó apuntando a una sección fantasma. Ver resolución abajo.
- **RESOLUCIÓN v1.3** — sesión de integración cruzada Arquitectura+Backend+Frontend, sobre código real de `mandate_genesis_activities.go`, `mandate_genesis_sign_activity.go`, `mandate_genesis_build_workflow.go`, `mandate_genesis_domains_cmd.go`, `mandate_execution_workflow.go`. Cierra D-3 a nivel de datos, confirma formato real de `domainId`, corrige y reabre matices de D-9/D-10/D-11, agrega D-12/D-13/D-14. Ver bloque de resolución más abajo.

> ## ⚠️ RESOLUCIÓN v1.1 — este documento entra en conflicto con `bloom-mandate-arquitectura-genesis-conductor.md` (v2.0) Y con el código ya implementado. Leer esto antes que nada.
>
> | Punto | Este documento decía | Queda cerrado así |
> |---|---|---|
> | Archivo de fases pre-firma | `gen_state.json` separado (§2, §3) | **`gen_state.json` no existe.** Todo vive embebido en `mandate_state.json` desde `create()`. Ver `mandate_state.json` real ya escrito por `create-mandate.handler.ts`. |
> | Human Sync (Fase 3) | D-B3: `Signal` de Temporal bloqueando `MandateGenesisBuildWorkflow` | **No hay Temporal en pre-firma.** El propio `create-mandate.handler.ts` implementado dice explícitamente "ya no depende de Temporal". Confirmar es un evento (`mandate:genesis:domains_confirmed`) que dispara la escritura de `mandate.json`, no un Signal liberando un workflow. |
> | Workflow discreto por fase (D-B2) | `MandateGenesisBuildWorkflow` con 1 `EXECUTE_INTENT` por fase | **No existe ese workflow.** Fases 1-3 las maneja Brain + el watcher de Nucleus (Go) reaccionando a eventos sobre `mandate_state.json`, sin un workflow de Temporal orquestando desde arriba. |
> | Nombres de evento (§9) | No llegó a escribirse — ver nota arriba | Contrato real: `mandate:{namespace}:{event}` (`mandate:genesis:*`, `mandate:action:*`, `mandate:draft:*`). Es el que ya está compilado en `ws-events.ts`. |
> | `mandateId` / carpeta | No especificado explícitamente acá | UUID plano, carpeta sin prefijo ni punto — ya implementado, y `mandate.go` (Go) ya depende de ese formato. |
>
> **Lo que SÍ sigue vigente de este documento sin cambios:** D-B1 (Fase 4 reutiliza el motor de Actions de `mandate run`, no hay mecanismo propio de Genesis post-firma), los schemas de `PhaseRecord` / `HumanSyncRecord` / `DomainCandidate` de §1 (solo cambia dónde viven, no su forma), y los comandos CLI de §7 (`genesis domains list/confirm/reject`).

> ## ⚠️ RESOLUCIÓN v1.2 — corrección y cierre de puntos que v1.1 dejó mal resueltos o abiertos, en base a código real (no solo comentarios) de `org-resolver.ts`, `supervisor.go`, `mandate_watcher.go` y `temporal_client.go`.
>
> | Punto | v1.1 decía | Queda cerrado/corregido así |
> |---|---|---|
> | Resolución de organización (Go vs TS) | No se había verificado si `resolveOrg()` (TS) y `supervisor.LoadNucleusConfig()` (Go) hacían lo mismo — quedó como punto abierto en sesión 5. | **CERRADO.** `org-resolver.ts` (`resolveOrg` → `resolveOrganization`) implementa exactamente el mismo mecanismo que `supervisor.go`: sube desde un directorio de partida buscando `.bloom`, encuentra una única carpeta `.nucleus-{slug}`, lee `.core/nucleus-config.json` (**sin punto** antes de `nucleus-config.json`) y valida `organization.slug` contra el nombre de carpeta. Única diferencia deliberada: el lado TS acepta `BLOOM_ORGANIZATION` como aserción post-scan (si está seteada y no coincide con el slug encontrado, error explícito) — el lado Go no tiene ese override. Documentar esta asimetría como decisión intencional, no como bug. |
> | ⚠️ Workflow de Temporal en pre-firma (D-B2/D-B3) | "No existe `MandateGenesisBuildWorkflow`... no hay Temporal en pre-firma... es un evento simple, no un Signal." | **PARCIALMENTE REVERTIDO — código real contradice esto.** `mandate_watcher.go` llama `StartMandateGenesisBuildWorkflow` (arranca un Workflow Temporal real, ID `mandate_genesis_{mandateID}`, confirmado en `temporal_client.go`) cuando `ingest` empieza, y usa `SignalWorkflow(ctx, workflowID, "", "ingest_complete"/"cluster_complete", nil)` para avanzar de fase — **sí hay Signals**, sobre un workflow real. Lo que sigue sin confirmarse: si `MandateGenesisBuildWorkflow` (cuyo cuerpo no se ha visto todavía) efectivamente tiene `setHandler` para esas señales, o si el mecanismo de confirmación humana (`genesis domains confirm`) dispara otro Signal o un evento simple — eso no está en ningún archivo revisado hasta ahora. **No documentar el Human Sync como resuelto en ninguna dirección hasta ver el código de esa parte.** |
> | Formato de `mandateId` / carpeta | UUID plano, sin prefijo ni punto. | Sin cambios — confirmado también en `mandate.go` (`uuid.New().String()`) y en `org-resolver.ts`/`supervisor.go` (que no tocan el formato de ID, pero sí dependen del mismo `.mandates/{uuid}/`). |
> | `mandate_state.json` embebido, sin `gen_state.json` | Confirmado. | Sin cambios — reconfirmado en `mandate.go`, `mandate_watcher.go` y `create-mandate.handler.ts`, los tres escriben/leen el mismo shape (`mandateId`, `mandateType`, `project`, `source`, `status`, `currentPhase`, `phases`). |
> | Convención de nombres de evento | `mandate:{namespace}:{event}` | Sin cambios en el contrato en sí, pero el archivo que lo define aparece con dos nombres distintos entre sesiones (`ws-events.js` en sesión 1, `ws-events.ts` en sesión 4) y nunca se confirmó su contenido real — ver punto abierto D-11 nuevo en §8. |

> ## ⚠️ RESOLUCIÓN v1.3 — sesión de integración cruzada (Arquitectura + Backend + Frontend), en base a código real de `mandate_genesis_activities.go`, `mandate_genesis_sign_activity.go`, `mandate_genesis_build_workflow.go`, `mandate_genesis_domains_cmd.go`, `mandate_execution_workflow.go` y `gen-state.types.ts`.
>
> | Punto | Estado previo | Queda cerrado/corregido así |
>|---|---|---|
> | Persistencia de la propuesta de Fase 2 | v1.1 decía "todo vive embebido en `mandate_state.json` desde `create()`" | **Matiz confirmado, no contradicción:** la propuesta de Fase 2 (dry-run) SÍ se escribe como archivo plano separado — `{mandatesRoot}/{mandateId}/domain_proposal.json` (`scaffoldDryRun`, confirmado en código). Lo que se embebe en `mandate_state.json` es la **confirmación** (Fase 3), vía `PersistHumanSyncActivity`, que escribe el mismo `phases.validate.humanSync` que ya usa el CLI. No existe `domain_confirmed.json` como archivo separado — ese concepto, presente en `bloom-mandate-arquitectura-genesis-conductor.md`, queda descartado a favor del campo embebido. |
> | Formato de `domainId` | Campo tipado (`string`) sin formato definido | **Cerrado:** `dom_{slug(domainName)}_{sufijo hex de 4 chars}`, generado una única vez en Fase 2 (`newDomainID`). Decisión explícita: NO puede derivarse de `domainName` porque ese campo es mutable (rename es operación obligatoria del diseño) — un id derivado de un campo mutable rompe trazabilidad de eventos/carpetas ya emitidos. |
> | D-3 (dependencias cruzadas) | Abierto | **Cerrado a nivel de datos.** `DomainCandidate.dependsOn?: string[]` (domainIds) → `signMandateActivity` lo traduce a `Action.dependsOn` (actionIds, formato `gen-action-{domainName}`) → y de ahí a `DomainAction.DependsOn` (domainNames) para el child workflow. Una dependencia hacia un dominio no confirmado se descarta en silencio, por decisión explícita. Sigue sin poblarse en la práctica porque no hay clustering real todavía — el mecanismo existe, el productor de datos no. |
> | D-9 (`confirmedBy`) | "Bloqueado, sin mecanismo de identidad" | **Parcialmente cerrado, con una restricción nueva.** El path CLI (`mandate genesis domains confirm`) sí resuelve identidad vía `os/user.Current()` — implementado. Pero el path que resultó ser el real para firmar (señal de Temporal a `MandateGenesisBuildWorkflow`, no el CLI) **no puede** usar esa misma vía: un Workflow de Temporal debe ser determinista y no puede hacer syscalls. Por ese camino, `confirmedBy` llega vacío hoy. Sigue pendiente como decisión de producto: de dónde sale la identidad de quien confirma cuando la confirmación llega por señal. |
> | D-B1 (Fase 4 vía Action, no mecanismo propio) | Vigente como diseño, no verificado en implementación | **Confirmado, con una corrección de implementación real de por medio:** una primera versión de `MandateGenesisBuildWorkflow` lo violó — llamaba `ScaffoldDomainActivity(Mode: real)` directo desde el workflow padre, dominio por dominio, sin pasar por `mandate.json`. Se corrigió para que la Fase 4 pase por `SignMandateActivity` (produce `mandate.json` firmado con `operational.actions[]`) antes de invocar el child `MandateExecutionWorkflow`. D-B1 queda confirmado como el modelo correcto, con evidencia de que es fácil violarlo por accidente si se implementa apurado. |
> | D-10 (`setHandler` ingest_complete/cluster_complete) | Abierto | **Parcialmente respondido, con un matiz importante.** El `MandateGenesisBuildWorkflow` real que se pudo revisar **no usa Signals para Fase 1 (ingest) ni Fase 2 (cluster)** — ejecuta esas Activities de forma directa y secuencial, sin esperar señales externas. El único punto donde el workflow sí espera un Signal es Fase 3 (validate), vía `"mandate:genesis:validate"`. No se pudo confirmar si `mandate_watcher.go` todavía envía `ingest_complete`/`cluster_complete` a un workflow que no los escucha (ese archivo sigue sin revisarse completo) — si los envía, esas señales se pierden sin efecto, que es exactamente el riesgo que D-10 ya anticipaba, ahora confirmado del lado del workflow en vez de solo sospechado. |
> | D-11 (`ws-events.ts`) | Abierto | **Sigue abierto**, con un requisito nuevo confirmado sobre él: el payload de `mandate:action:completed` HOY no incluía `domains[]` (confirmado por grep) — se agregó esta sesión, poblado solo cuando `Mode: dry_run`, para que el `domainId` real de cada dominio propuesto viaje en el evento y la UI no tenga que inventarlo localmente. El archivo `ws-events.ts` en sí sigue sin leerse completo — este cambio se hizo sobre el emisor (`publishMandateEvent`), no sobre el contrato tipado. |
> | D-12 (nuevo) — Confiabilidad del canal de eventos | No existía como punto | `publishMandateEvent` hace POST HTTP **fire-and-forget** (goroutine, sin retry, sin persistencia) a `localhost:48215`. Si el consumidor (UI) no está escuchando en el instante exacto en que una fase completa, pierde el dato (por ejemplo el `domainId` real de Fase 2) sin forma de recuperarlo salvo leer `domain_proposal.json` directo del filesystem. No hay mecanismo de reintento ni cola — es un riesgo real para cualquier UI que dependa solo del evento sin un plan B de polling/lectura directa. |
> | D-13 (nuevo) — `resultRef` no coincide con el árbol de carpetas documentado | No existía como punto | El `resultRef`/layout real hoy es plano: `{mandatesRoot}/{mandateId}/domain_proposal.json` (Fase 2) y `{mandatesRoot}/{mandateId}/scaffold/domain_{name}/` (Fase 4) — confirmado en código. Esto es distinto del layout anidado que documenta `bloom_project_tree_gen.txt` (`.bloom/.intents/.gen/{intent-uuid}/.pipeline/.../.response/report.json`). Ninguno de los dos se declaró explícitamente "el correcto" — queda como discrepancia abierta entre documentación de árbol de filesystem y código real, no resuelta esta sesión. |
> | D-14 (nuevo) — Referencia a "§3.4.1 del contrato" sin sección correspondiente | No existía como punto | Comentarios en código (`mandate_genesis_sign_activity.go`, `mandate_execution_workflow.go`) citan una discrepancia "P4" como documentada en "§3.4.1 del contrato". **Ninguno de los dos documentos de diseño revisados (este ni `bloom-mandate-arquitectura-genesis-conductor.md`) tiene una sección §3.4.1.** O la cita corresponde a una versión de este documento que no se compartió en esta sesión, o es una referencia inexistente que se propagó entre sesiones de código sin verificarse contra la fuente. Marcado para no perder el rastro — no se inventa una sección para que la cita "cierre". |
>
> **Lo que sigue exactamente igual que en v1.2, sin tocar esta sesión:** D-1, D-6, D-7, D-8 (§8), y el modelo de `standard`/§1.1, §4, §5, §7.

---

## 0. Resumen ejecutivo de las tres decisiones de diseño

| # | Decisión | Por qué |
|---|---|---|
| D-B1 | Fase 4 (scaffold) **no** es un mecanismo propio de Genesis. Una vez firmado el `mandate.json`, cada dominio confirmado se materializa como una `Action` normal (`type: run_intent`, `intentType: gen`, `subPhase: scaffold`) dentro del mismo `operational.actions[]`, y se ejecuta con el `MandateExecutionWorkflow` que ya existe para `mandate run`. | Evita duplicar la máquina de estados Action→Intent→Persistencia. `pause`/`resume`/`status` post-firma quedan gratis — no hay lógica nueva que mantener para Genesis en ese tramo. |
| D-B2 ⚠️ SUPERADA | ~~Pre-firma (Fases 1–3) usa un workflow propio, `MandateGenesisBuildWorkflow`, con un `EXECUTE_INTENT` discreto por fase~~ | Ver RESOLUCIÓN v1.1 arriba: no existe ese workflow de Temporal. Brain + watcher Go sobre eventos, sin orquestador propio. |
| D-B3 ⚠️ SUPERADA | ~~La Fase 3 es una señal de Temporal (`Signal`) que bloquea el workflow~~ | Ver RESOLUCIÓN v1.1 arriba: es un evento simple (`mandate:genesis:domains_confirmed`), no un Signal. |

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

> ⚠️ SUPERADO por RESOLUCIÓN v1.1 (arriba): en toda esta sección (y en §3, §6, §7 donde se repite), reemplazar mentalmente cada mención a `gen_state.json` por "campos embebidos en `mandate_state.json`". No hay dos archivos — hay uno solo, desde `create()`. La tabla de "qué archivos existen según la fase" de abajo queda: **`mandate_state.json` con `status: building*`** (pre-firma) → **`mandate_state.json` con `status: running/paused/completed/failed` + `mandate.json`** (post-firma). El resto del razonamiento de esta sección (por qué `mandate.json` es inmutable hasta la firma, por qué no hace falta un `.lock` aparte) sigue siendo válido tal cual.

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
    │   ├── ws-events.ts                    # §9 — contrato de eventos del Control Plane.
    │                                        # NOTA: recibido en una sesión como `ws-events.js` — no se
    │                                        # confirmó cuál es el nombre/extensión real en el repo.
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
  ├→ handlers/create-mandate.handler.ts ──→ utils/org-resolver.ts (resolveOrg)
```

**Nota RESOLUCIÓN v1.2:** la flecha `create-mandate.handler.ts → utils/org-resolver.ts (resolveOrg)` no estaba mapeada en el grafo original — el `create-mandate.handler.ts` real (ya implementado) importa `resolveOrg` desde `../../utils/org-resolver`, que no aparecía en esta consolidación previa.

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
  // RESOLUCIÓN v1.3: formato confirmado en código — dom_{slug(domainName)}_{sufijo
  // hex 4 chars}, generado una sola vez en Fase 2 (newDomainID). Deliberadamente
  // NO derivado de domainName (mutable por rename) — ver RESOLUCIÓN v1.3 arriba.
  domainId: string;
  name: string;
  cohesionScore: number;          // 0.0–1.0, mismo rango que --min-cohesion en link-genes
  suggestedActionCount: number;   // preview, no las Actions reales todavía
  overlapsWithExisting?: string;  // solo domain_expansion: domainId del genesis base si hay solapamiento
  // D-3 (CERRADO a nivel de datos en RESOLUCIÓN v1.3): domainIds de otros
  // candidatos de los que este depende, según lo que Brain detecte en 'cluster'.
  // Ausente o [] = sin dependencias (paralelo, comportamiento histórico). Se
  // traduce a Action.dependsOn (actionIds) al firmar — ver §6.2. Hoy nunca se
  // puebla: el mecanismo de traducción existe, el productor real (clustering
  // de Brain) todavía no.
  dependsOn?: string[];
}
```

`mandate_state.json` post-firma **no cambia de forma** respecto al que ya usa `standard` — cada dominio confirmado se vuelca a una `Action` en `operational.actions[]` con `intentType: 'gen'` y un campo `payload.subPhase: 'scaffold'`, y su progreso se seguimiento con el mismo `operationalState` que ya existe. No lo repito acá porque no hay nada nuevo que definir.

> **RESOLUCIÓN v1.3 — nota de filesystem:** la propuesta de Fase 2 (antes de
> confirmar) no vive únicamente en memoria/`mandate_state.json` — se escribe
> además como archivo plano `{mandatesRoot}/{mandateId}/domain_proposal.json`
> con el shape `{ status: "proposed", domains: ProposedDomain[] }`, donde cada
> `ProposedDomain` espeja `DomainCandidate` de arriba (mismos campos, más
> `files: string[]` que no vive en `DomainCandidate`). Ver RESOLUCIÓN v1.3 al
> inicio del documento para el porqué de este layout híbrido.

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

> **Nota RESOLUCIÓN v1.2:** este pseudocódigo fue marcado como no-existente
> por RESOLUCIÓN v1.1. Código real posterior (`mandate_watcher.go`,
> `temporal_client.go`) muestra que SÍ existe un workflow real arrancado vía
> `StartMandateGenesisBuildWorkflow` y señalizado vía `SignalWorkflow` con
> `ingest_complete`/`cluster_complete` — la forma general de este
> pseudocódigo (condition() esperando señales entre fases) puede ser más
> cercana a la implementación real de lo que v1.1 asumió. No se puede
> confirmar el detalle exacto (Local Activity de `sign()`, mecanismo preciso
> del Human Sync) sin el archivo fuente del workflow. Tratar este bloque
> como "probablemente vigente en su forma general, no verificado en
> detalle" en vez de "superado".
>
> **Nota RESOLUCIÓN v1.3 — ahora sí con el archivo fuente (`mandate_genesis_build_workflow.go`):**
> el pseudocódigo de arriba se confirma solo parcialmente. Diferencias reales:
> - **No hay `setHandler` de `pauseSignal`/`resumeSignal` en el archivo revisado.** Fase 1 y Fase 2 se ejecutan de forma directa y secuencial, sin ningún `condition()` esperando señal — contradice la premisa de D-10 de que el workflow escucha `ingest_complete`/`cluster_complete` como señales de avance. Si `mandate_watcher.go` las sigue enviando, hoy no tienen destinatario (ver D-10 actualizado en §8).
> - **El Human Sync sí es un Signal real** (`workflow.GetSignalChannel(ctx, "mandate:genesis:validate")`, sin timeout — espera indefinida, consistente con la intención original de D-1), pero el payload no es un booleano de confirmación (`humanConfirmationReceived`) sino un objeto tipado (`GenesisValidateSignal{Approved, Domains[]}`) que ya trae la lista de dominios confirmados y sus renames — más rico que el pseudocódigo original.
> - **`signMandateActivity` sí existe y sí es Local Activity conceptualmente correcta**, aunque en el código real se invoca como Activity normal (`workflow.ExecuteActivity`, no `ExecuteLocalActivity`) — matiz de implementación, no de diseño; sigue corriendo dentro del propio proceso de Nucleus, no se enruta a Brain.
> - El workflow **si** termina disparando el child `MandateExecutionWorkflow` tal como predice el pseudocódigo, aunque no es `signMandateActivity` quien lo dispara — es el propio `MandateGenesisBuildWorkflow`, después de recibir el resultado de la firma.

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
| D-1 | `HUMAN_SYNC_TIMEOUT` — ¿cuánto tiempo espera el workflow una confirmación antes de fallar? ¿Hay timeout o el wait es indefinido? **Parcialmente respondido en RESOLUCIÓN v1.3:** el código real confirma wait indefinido (sin timeout) en el Signal de validate — sigue abierto si eso es deliberado o un olvido, y qué pasa si nunca llega. | Si es indefinido, un `genesis` puede quedar "vivo" en Temporal por semanas, consumiendo un workflow slot; si tiene timeout, hace falta definir qué pasa con `gen_state.json` al expirar (¿`building_failed`? ¿se puede re-disparar `validate` sin recorrer `ingest`/`cluster` de nuevo?) |
| ~~D-3~~ **CERRADO (RESOLUCIÓN v1.3)** | ~~Detección de dependencias cruzadas entre dominios confirmados~~ | Resuelto a nivel de datos: `DomainCandidate.dependsOn` → `Action.dependsOn` → `DomainAction.DependsOn`, con traducción completa en `signMandateActivity`. Ver RESOLUCIÓN v1.3 y §3/§6.2. Sigue sin poblarse en la práctica (no hay clustering real), pero eso es un problema distinto (falta de Brain), no de diseño de datos. |
| D-6 (heredado) | Idempotencia de Brain ante reintentos de Activity — ya señalado en el análisis anterior, se vuelve más urgente acá porque Fase 1 (`ingest`) puede ser costosa (leer un repo completo) y un reintento ciego la duplicaría | Afecta directamente el `retry policy` de `runGenIntentActivity` |
| D-7 | ¿`domain_expansion` puede tener como `--base-genesis` otro `domain_expansion` ya completado, o solo un `genesis` raíz? Hoy el `preHandler` de §5.2 lo rechaza explícitamente | Afecta si el modelo de dominios termina siendo un árbol o una lista plana anclada siempre a un único genesis |
| D-8 | ¿`gen_state.json` se conserva indefinidamente post-firma como auditoría, o se archiva/comprime luego de un tiempo? Lo dejé "vive para siempre" en §2 por default, pero eso puede no ser sostenible en volumen | Impacta diseño de storage, no solo de comandos |
| D-9 (heredado) | `confirmedBy` en `HumanSyncRecord`. **Actualizado en RESOLUCIÓN v1.3:** el path CLI ya lo resuelve (`os/user.Current()`), pero el path que resultó ser el real para firmar (Signal de Temporal) no puede usar esa misma vía — un Workflow debe ser determinista. `confirmedBy` llega vacío por el camino que importa. | Bloquea que la firma real (vía Signal, no CLI) tenga atribución — sigue sin fuente de verdad para el caso que efectivamente se usa. |
| D-10 | ¿`MandateGenesisBuildWorkflow` define `setHandler` para `ingest_complete`/`cluster_complete`? **Parcialmente respondido en RESOLUCIÓN v1.3:** el archivo real revisado NO tiene ningún `setHandler` ni Signal para esas dos fases — las ejecuta directo. Solo Fase 3 (validate) usa Signal. Sigue sin confirmarse si `mandate_watcher.go` todavía las envía a un destinatario que no escucha. | Si `mandate_watcher.go` las envía igual, se entregan sin efecto — no rompe nada visible, pero es señal de un supuesto de diseño (fases 1-2 señalizadas externamente) que el código real abandonó sin documentarlo. |
| D-11 | Nombre real del archivo de contrato de eventos: ¿`ws-events.js` o `ws-events.ts`? Sigue sin leerse completo. **Nuevo en RESOLUCIÓN v1.3:** se confirmó (grep) que el payload de `mandate:action:completed` no traía `domains[]` — se agregó esta sesión sobre el emisor (`publishMandateEvent`), sin poder confirmar si eso coincide con lo que el contrato tipado de `ws-events.ts` espera, porque ese archivo sigue sin leerse. | Bloquea confirmar el contrato exacto de eventos contra una fuente de verdad real en vez de inferirlo de los handlers que lo consumen y ahora también de los emisores. |
| D-12 (nuevo, RESOLUCIÓN v1.3) | Confiabilidad del canal de eventos: `publishMandateEvent` es HTTP fire-and-forget (goroutine, sin retry, sin persistencia) a `localhost:48215`. Si el consumidor no escucha en el instante exacto, el dato se pierde sin recuperación salvo leer el filesystem directo. | Cualquier UI o proceso que dependa solo del evento (sin plan B de polling/lectura directa) puede perder silenciosamente datos críticos como el `domainId` real de un dominio propuesto. |
| D-13 (nuevo, RESOLUCIÓN v1.3) | El `resultRef`/layout de filesystem real (`{mandatesRoot}/{mandateId}/domain_proposal.json`, `.../scaffold/domain_{name}/` — plano) no coincide con el layout anidado que documenta `bloom_project_tree_gen.txt` (`.bloom/.intents/.gen/{intent-uuid}/.pipeline/.../.response/report.json`). Ningún lado se declaró "el correcto" todavía. | Bloquea saber si el código actual es una simplificación temporal a corregir, o si el árbol de diseño documenta una estructura que nunca se va a construir así. |
| D-14 (nuevo, RESOLUCIÓN v1.3) | Comentarios en código (`mandate_genesis_sign_activity.go`, `mandate_execution_workflow.go`) citan una discrepancia "P4" documentada en "§3.4.1 del contrato" — ninguno de los documentos de diseño revisados tiene esa sección. | O la cita corresponde a una versión de este documento no compartida en esta sesión, o es una referencia que se propagó entre sesiones de código sin verificarse — hay que rastrear el origen antes de seguir citándola como si existiera. |

---

*Fin del documento — v0.1.0. Complementa `BLOOM_Mandate_CLI_Command_Surface_v0_2_0.md`, no lo reemplaza.*
