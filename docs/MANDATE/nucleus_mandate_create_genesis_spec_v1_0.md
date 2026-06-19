# `nucleus mandate create` — Especificación del Comando Genesis
## Bloom / Nucleus · Spec v1.0 · Junio 2026

| Campo | Valor |
|---|---|
| Alcance | Comando `nucleus mandate create` con foco en el Mandate Genesis |
| Fuentes | Mandate Domain Spec v1.0.0 · BLOOM Genesis Intent `.gen` Design v1.0 · BTIPS v5.0 · GENESIS_INTENT_CREATE.md |
| Estado | Especificación — Pendiente Implementación |
| Decisión de modelo CLI | Modelo B (create unificado con `--source`) — pendiente confirmación |

---

## Tabla de Contenidos

1. [El punto de partida — qué ya existe](#1-el-punto-de-partida--qué-ya-existe)
2. [Por qué el Mandate Genesis es un caso especial](#2-por-qué-el-mandate-genesis-es-un-caso-especial)
3. [Decisión de modelo CLI — los tres caminos](#3-decisión-de-modelo-cli--los-tres-caminos)
4. [Spec del comando `nucleus mandate create`](#4-spec-del-comando-nucleus-mandate-create)
5. [El intent `.gen` como acción del Mandate](#5-el-intent-gen-como-acción-del-mandate)
6. [Rol de Sentinel en la creación del Mandate Genesis](#6-rol-de-sentinel-en-la-creación-del-mandate-genesis)
7. [Rol de Brain en la ejecución del genesis](#7-rol-de-brain-en-la-ejecución-del-genesis)
8. [Modificaciones al contrato de datos del Mandate](#8-modificaciones-al-contrato-de-datos-del-mandate)
9. [Flujo completo de creación y ejecución](#9-flujo-completo-de-creación-y-ejecución)
10. [Condiciones de error y recuperación](#10-condiciones-de-error-y-recuperación)
11. [Pendientes bloqueantes antes de implementar](#11-pendientes-bloqueantes-antes-de-implementar)

---

## 1. El punto de partida — qué ya existe

El Mandate Domain Spec v1.0.0 define el mandato como un contrato estratégico firmado que orquesta intents a través de Nucleus usando Temporal. El comando existente es:

```bash
nucleus mandate create --file mandate.json
```

Este comando asume que el `mandate.json` ya fue escrito por el usuario y lo entrega como input. Nucleus lo valida, firma, crea la carpeta `.mandates/{uuid}/` con `mandate.json` y `mandate_state.json` inicial.

El Mandate Genesis introduce una diferencia fundamental: **el usuario no tiene un `mandate.json` predefinido que entregar**. Lo que tiene son archivos de proyecto. El Mandate Genesis se construye a partir de esos archivos, no a pesar de su ausencia.

---

## 2. Por qué el Mandate Genesis es un caso especial

Un Mandate genérico como `auth-cleanup` tiene acciones predefinidas por el usuario (`exp` → `dev` → `doc` sobre `src/auth`). El usuario sabe qué quiere hacer y lo declara en el `mandate.json`.

El Mandate Genesis no puede seguir ese modelo porque:

1. **Las acciones son desconocidas antes del genesis.** El número de acciones `.gen` es N, donde N es el número de dominios confirmados. Esos dominios no existen hasta que Brain ejecuta la Fase 2 de clustering y el usuario confirma en la Fase 3. No es posible declarar las acciones en un `mandate.json` pre-escrito.

2. **El genesis se ejecuta exactamente una vez por proyecto.** No es un mandate recurrente ni paramétrico. Es el acto fundacional del proyecto en Bloom.

3. **El input del usuario no es una descripción de acciones, sino un conjunto de archivos.** El usuario entrega un workspace; Bloom determina la estructura.

4. **Requiere un punto de sincronización humana en el medio.** Entre la Fase 2 (clustering) y la Fase 4 (scaffold), el usuario debe validar los dominios. El Mandate Genesis necesita manejar este punto de pausa estructural, distinto de la pausa manual (`nucleus mandate pause`) que existe para cualquier mandate.

Estas cuatro diferencias justifican que `nucleus mandate create` tenga un caso específico para el tipo `genesis`, con flags y comportamiento distintos al caso genérico.

---

## 3. Decisión de modelo CLI — los tres caminos

El documento `GENESIS_INTENT_CREATE.md` define tres modelos posibles. Esta sección los evalúa en el contexto del Mandate Genesis específicamente.

### Modelo A — Dos comandos separados

```bash
nucleus mandate create --type genesis --name "my-genesis"
nucleus genesis ingest <workspace_path> --mandate genesis-uuid
```

**Problema:** El `mandate create` del primer comando crea un `mandate.json` sin acciones. Eso viola el contrato del Mandate Domain Spec, que dice que `actions[]` declara las acciones del mandate. Un mandate sin acciones no puede ser firmado correctamente, o requiere una firma provisional con la promesa de que las acciones se populan después — lo cual introduce una excepción en el modelo de contrato inmutable.

**Veredicto:** Rechazado. Requiere violar el principio de inmutabilidad del `mandate.json`.

### Modelo B — Comando unificado con `--source`

```bash
nucleus mandate create --type genesis \
  --name "my-genesis" \
  --source <path_or_url>
```

**Mecánica:** `nucleus mandate create` crea un Mandate Genesis en dos tiempos internos:
1. Crea la carpeta `.mandates/{uuid}/` y el `mandate_state.json` inicial con `status: "building"`
2. Instancia el intent `.gen` para la ingestión y el clustering
3. Cuando el usuario confirma los dominios, Nucleus firma el `mandate.json` final con las acciones ya conocidas
4. Arranca el MandateWorkflow en Temporal

**Implicación clave:** El `mandate.json` se escribe y firma **después** de la validación de dominios, no al inicio. Esto modifica el flujo de creación respecto al caso genérico pero preserva la inmutabilidad post-firma.

**Veredicto:** Adoptado para el primer pass de implementación.

### Modelo C — Comando `nucleus genesis start`

```bash
nucleus genesis start <workspace_path>
```

**Evaluación:** Comando de alto nivel que abstraería completamente la creación del mandate y la instanciación del intent `.gen`. Es la UX correcta a largo plazo, pero requiere que `nucleus genesis` exista como subcomando, que el Mandate Genesis se auto-instancie, y que Brain sepa que un proyecto sin genesis necesita este paso primero. Excede el alcance del Paso 1.

**Veredicto:** Destino final de UX. A implementar cuando el CLI tenga más madurez. El Modelo B es el camino hacia él.

---

## 4. Spec del comando `nucleus mandate create`

### 4.1 Forma del comando — caso genérico (existente)

```bash
nucleus mandate create --file mandate.json
```

Este caso no cambia. El `mandate.json` pre-escrito es validado, firmado, y persistido.

### 4.2 Forma del comando — caso genesis (nuevo)

```bash
nucleus mandate create --type genesis \
  --name <nombre-del-proyecto> \
  --source <path_local | url_repositorio> \
  [--nucleus-path <ruta_al_nucleus>]
```

**Flags:**

| Flag | Requerido | Descripción |
|---|---|---|
| `--type genesis` | Sí | Activa el flujo de Mandate Genesis. Sin este flag, el comando espera `--file`. |
| `--name` | Sí | Nombre del proyecto. Se usa para el slug del `mandateId` y el nombre del intent `.gen`. |
| `--source` | Sí | Path local absoluto o URL de repositorio Git. |
| `--nucleus-path` | No | Override de la ruta raíz del nucleus. Default: autodetectado desde `.bloom/`. |

### 4.3 Comportamiento de Nucleus al recibir el comando

**Paso 1 — Validación previa (antes de crear nada):**

```
1. Verificar que no existe un intent .gen previo para este proyecto
   → Si existe: error + "Genesis ya ejecutado. Usar nucleus mandate status <genesis-id>"
   → Si existe un genesis incompleto: error + "Genesis en progreso. Usar nucleus mandate resume <genesis-id>"

2. Verificar accesibilidad de --source
   → Path local: verificar que existe y es legible
   → URL Git: verificar conectividad (ping superficial al host)
   → Si no accesible: error antes de crear ningún artefacto

3. Verificar que el Mandate Domain está operativo
   → Temporal disponible
   → mandate-orchestration-worker registrado
   → Si no: error descriptivo con estado actual del runtime
```

**Paso 2 — Creación del estado intermedio (pre-firma):**

```
1. Generar mandateId: "genesis-{project-name}-{uuid3}"
2. Crear carpeta: .bloom/.nucleus-{org}/.mandates/.genesis-{name}-{uuid3}/
3. Escribir mandate_state.json con status: "building"
   (estado nuevo exclusivo del genesis — no existe en el caso genérico)
4. Emitir evento Sentinel: MANDATE_GENESIS_INITIATED
5. Retornar al usuario:
   → mandate_id: "genesis-{name}-{uuid3}"
   → "Genesis iniciado. Brain comenzará la ingestión en background."
```

**Paso 3 — Delegación a Brain:**

```
Nucleus delega a Brain:
  - mandate_id
  - source (path o URL)
  - project_name
  - nucleus_path

Brain instancia el intent .gen:
  - Crea .intents/.gen/.genesis-{name}-{uuid3}/
  - Escribe gen_state.json con phase: "ingest"
  - Inicia Fase 1 (ingest) en background
```

**Paso 4 — Firma diferida del mandate.json (post-validación de dominios):**

```
Cuando el usuario confirma los dominios en la Fase 3 del genesis:
  - Brain escribe domain_confirmed.json
  - Brain notifica a Nucleus: DOMAINS_CONFIRMED (evento Sentinel)
  - Nucleus construye el mandate.json final:
      → Una action .gen por cada dominio confirmado
      → Firma el documento
  - Nucleus actualiza mandate_state.json: status → "pending"
  - Nucleus inicia MandateWorkflow en Temporal
  - Nucleus actualiza mandate_state.json: status → "running", workflowId → temporal_id
```

---

## 5. El intent `.gen` como acción del Mandate

### 5.1 Extensión del schema de `mandate.json`

El contrato del Mandate Domain Spec v1.0.0 define `intentType` como `exp | cor | dev | doc`. El Mandate Genesis requiere agregar `gen` a ese conjunto.

```json
{
  "mandateId": "genesis-my-project-a1b2c3",
  "version": "1.0.0",
  "organization": "bloom",
  "signedBy": "root",
  "objective": "Genesis de my-project — estructuración semántica inicial",
  "mandateType": "genesis",
  "status": "pending",
  "createdAt": "2026-06-18T10:00:00Z",
  "genesisSource": "local:///Users/dev/workspace/my-project",
  "actions": [
    {
      "actionId": "gen-action-authentication",
      "intentType": "gen",
      "description": "Scaffold del dominio Authentication",
      "payload": {
        "domain_name": "authentication",
        "domain_files": ["src/auth/", "docs/auth.md"],
        "domain_cohesion_score": 0.87
      },
      "status": "pending",
      "resultRef": null
    },
    {
      "actionId": "gen-action-infrastructure",
      "intentType": "gen",
      "description": "Scaffold del dominio Infrastructure",
      "payload": {
        "domain_name": "infrastructure",
        "domain_files": ["infra/", "docker-compose.yml"],
        "domain_cohesion_score": 0.79
      },
      "status": "pending",
      "resultRef": null
    }
  ]
}
```

**Campos nuevos respecto al schema genérico:**

| Campo | Descripción | Obligatorio en genesis |
|---|---|---|
| `mandateType` | `"genesis"` — identifica que es un Mandate Genesis. Permite que MandateWorkflow sepa cómo procesarlo. | Sí |
| `genesisSource` | Path o URL original del workspace del usuario. Para auditoría y resumabilidad. | Sí |

### 5.2 Un intent `.gen` por acción, no uno global

La jerarquía del Genesis Design v1.0 establece:

```
Mandate Genesis
    └── N Actions de tipo .gen
            └── Un intent .gen por dominio
                    └── scaffold individual del dominio
```

Esto implica que el MandateWorkflow crea **N intents `.gen` secuencialmente** (o en paralelo si el diseño lo permite), uno por dominio confirmado. Cada intent `.gen` ejecuta la Fase 4 (scaffold) de un único dominio. Las Fases 1 (ingest), 2 (cluster) y 3 (validate) ocurren antes de que el MandateWorkflow esté activo — son parte de la creación del mandate, no de su ejecución.

**Consecuencia para `waitIntentResult`:** La activity `waitIntentResult` del MandateWorkflow debe saber observar el `report.json` del pipeline de un intent `.gen`. El path del `resultRef` para un intent `.gen` completado es:

```
.intents/.gen/.{intent-uuid}/.pipeline/.scaffold_{domain}/.response/.report.json
```

### 5.3 El `resultRef` en `mandate_state.json` para intents `.gen`

```json
{
  "actionId":   "gen-action-authentication",
  "intentId":   "gen-authentication-x9y8z7",
  "intentType": "gen",
  "status":     "completed",
  "resultRef":  ".intents/.gen/.gen-authentication-x9y8z7/.pipeline/.scaffold_authentication/.response/.report.json",
  "resolvedAt": "2026-06-18T11:30:00Z"
}
```

---

## 6. Rol de Sentinel en la creación del Mandate Genesis

Sentinel actúa como bus de eventos en el ecosistema Bloom. En el flujo del Mandate Genesis, Sentinel es el canal de comunicación entre los tres actores principales (Nucleus, Brain, Conductor) y el mecanismo que permite que el punto de sincronización humana (validación de dominios) sea asíncrono y no bloqueante para el proceso completo.

### 6.1 Eventos que Sentinel debe gestionar

| Evento | Emisor | Receptores | Momento |
|---|---|---|---|
| `MANDATE_GENESIS_INITIATED` | Nucleus | Conductor, Brain | Al crear el estado intermedio |
| `GENESIS_INGEST_STARTED` | Brain | Conductor | Al iniciar Fase 1 |
| `GENESIS_INGEST_PROGRESS` | Brain | Conductor | Periódico durante ingestión |
| `GENESIS_INGEST_COMPLETE` | Brain | Conductor, Nucleus | Al completar vectorización |
| `GENESIS_DOMAINS_PROPOSED` | Brain | Conductor | Al escribir `domain_proposal.json` |
| `GENESIS_DOMAINS_CONFIRMED` | Conductor (acción del usuario) | Nucleus, Brain | Al confirmar dominios el usuario |
| `GENESIS_SCAFFOLD_STARTED` | Brain | Conductor | Al iniciar Fase 4 |
| `GENESIS_SCAFFOLD_DOMAIN_COMPLETE` | Brain | Conductor, Nucleus | Por cada dominio scaffoldeado |
| `GENESIS_COMPLETE` | Nucleus (MandateWorkflow) | Conductor | Al completar todos los dominios |
| `GENESIS_ERROR` | Brain o Nucleus | Conductor | En cualquier error recuperable o fatal |

### 6.2 Sentinel como coordinador del punto de sincronización

El punto de sincronización entre la Fase 3 (validate) y la Fase 4 (scaffold) es el momento más crítico del genesis. El flujo es:

```
Brain emite: GENESIS_DOMAINS_PROPOSED
    ↓
Sentinel enruta al Conductor
    ↓
Conductor muestra la pantalla de validación de dominios
    ↓
Usuario confirma (o modifica y confirma)
    ↓
Conductor emite: GENESIS_DOMAINS_CONFIRMED (con payload: domain_confirmed.json)
    ↓
Sentinel enruta a Nucleus y Brain
    ↓
Nucleus recibe confirmación → construye mandate.json → firma
    ↓
Brain recibe confirmación → comienza Fase 4 scaffold
    ↓
Nucleus arranca MandateWorkflow en Temporal
```

**Invariante:** El evento `GENESIS_DOMAINS_CONFIRMED` es el único trigger que habilita a Nucleus para firmar el `mandate.json`. Sin ese evento, el mandate no existe formalmente. Sin ese evento, Brain no puede iniciar la Fase 4.

### 6.3 Eventos de configuración — si Sentinel gestiona configuración

El Genesis Design v1.0 no especifica si Sentinel debe crear configuración al inicio del genesis. Sin embargo, hay dos casos donde Sentinel puede necesitar actuar para la configuración del proyecto:

**Caso 1 — Inicialización de la colección ChromaDB del proyecto:**
Sentinel puede ser el componente que, al recibir `MANDATE_GENESIS_INITIATED`, emite una señal a Brain para inicializar la colección ChromaDB del proyecto si no existe. Alternativamente, Brain puede hacerlo directamente al iniciar la Fase 1. La decisión afecta si ChromaDB setup es responsabilidad de Sentinel (evento-driven) o de Brain (procedural).

**Recomendación:** Brain inicializa ChromaDB directamente en la Fase 1. Sentinel no gestiona configuración de infraestructura vectorial. Sentinel es un bus de eventos de estado, no un gestor de infraestructura.

**Caso 2 — Creación del `.ai_bot.gen.intent.bl` en `.project/`:**
El Genesis Design v1.0 establece que el bot específico del genesis vive en `.project/.ai_bot.gen.intent.bl`. Este archivo debe existir antes de que Brain ejecute la Fase 4 (scaffold), porque contiene las instrucciones del modelo para el análisis de dominios.

Opciones:
- Nucleus lo crea como parte del `mandate create` (junto con el estado intermedio del mandate)
- Brain lo crea al iniciar la Fase 4, antes de armar el payload

**Recomendación:** Nucleus lo crea en el Paso 2 de la creación (junto con el `mandate_state.json` inicial). El bot del genesis debe existir desde el inicio del proceso, no solo para la fase de scaffold.

---

## 7. Rol de Brain en la ejecución del genesis

### 7.1 Brain como ejecutor de las cuatro fases

Brain es el único componente que ejecuta lógica de transformación en el genesis. Nucleus ordena, Sentinel comunica, Brain transforma. La división es:

| Fase | Actor | Brain hace |
|---|---|---|
| Fase 1 — Ingest | Brain | Copia archivos a `.raw/`, extrae texto, vectoriza en ChromaDB |
| Fase 2 — Cluster | Brain | Consulta ChromaDB, ejecuta clustering, genera `domain_proposal.json` |
| Fase 3 — Validate | Usuario (Brain escucha) | Espera evento `GENESIS_DOMAINS_CONFIRMED`, escribe `domain_confirmed.json` |
| Fase 4 — Scaffold | Brain (via MandateWorkflow) | Crea genes, semantic scaffolds, docbases iniciales por dominio |

### 7.2 Instanciación del intent `.gen` por Brain

Cuando Nucleus delega a Brain en el Paso 3 del comando `nucleus mandate create`, Brain instancia el intent `.gen` con la siguiente estructura inicial:

```
.intents/.gen/.genesis-{name}-{uuid3}/
├── gen_state.json          ← phase: "ingest", mandate_id: "genesis-..."
├── .ingest/
│   ├── ingest_manifest.json    ← status: "pending" para cada archivo
│   ├── ingest_index.json       ← vacío, se completa durante Fase 1
│   └── .raw/                   ← archivos del usuario, copiados por Brain
├── .analysis/              ← creado vacío, se puebla en Fase 2
├── .scaffold/              ← creado vacío, se puebla en Fase 4 por dominio
└── .pipeline/              ← estructura BISP vacía
```

### 7.3 Cómo Brain sabe qué dominio scaffoldear (recibe del MandateWorkflow)

En la Fase 4, el MandateWorkflow itera las acciones del `mandate.json` y por cada acción de tipo `gen` llama a `createIntent(action, mandateId)`. El `payload` de la acción contiene:

```json
{
  "domain_name": "authentication",
  "domain_files": ["src/auth/", "docs/auth.md"],
  "domain_cohesion_score": 0.87
}
```

Brain recibe este payload y ejecuta el scaffold del dominio específico. No ejecuta el intent `.gen` completo desde cero — las Fases 1, 2 y 3 ya ocurrieron. Brain lee el estado existente del intent `.gen` del genesis y ejecuta **únicamente la Fase 4** para el dominio indicado.

**Implicación de implementación:** El intent `.gen` creado en el Paso 3 es **un único intent** que contiene todas las fases. Cuando el MandateWorkflow llama a `createIntent` para el scaffold del dominio `authentication`, Brain no crea un nuevo intent `.gen` — ejecuta la Fase 4 de la carpeta `.scaffold/.domain_authentication/` dentro del intent `.gen` ya existente.

Esta es una diferencia respecto al modelo genérico de Mandate donde cada `createIntent` crea un nuevo intent. El genesis reutiliza el mismo intent `.gen` para todas las acciones de scaffold, porque las Fases 1-3 son compartidas.

**Decisión pendiente:** ¿El MandateWorkflow crea N intents `.gen` independientes (uno por dominio, cada uno autónomo) o llama N veces a Brain sobre el mismo intent `.gen` del genesis? La arquitectura más limpia crea un único intent `.gen` que contiene todas las fases y subfases. El MandateWorkflow orquesta las subfases de scaffold dentro de ese único intent. Esto requiere que `waitIntentResult` pueda observar el estado de un subfase de scaffold individual, no solo el estado final del intent completo.

---

## 8. Modificaciones al contrato de datos del Mandate

### 8.1 Nuevo campo en `mandate.json` — `mandateType`

```json
"mandateType": "genesis" | "standard"
```

- `standard` es el caso genérico (todos los mandates existentes).
- `genesis` activa el flujo especial de creación diferida.
- El MandateWorkflow usa este campo para decidir cómo procesar las acciones.

**Alternativa sin campo nuevo:** Detectar el tipo por la presencia de acciones de tipo `gen` en `actions[]`. Más simple pero menos explícito.

### 8.2 Nuevo estado en `mandate_state.json` — `"building"`

```json
"status": "building"
```

Estado nuevo exclusivo del Mandate Genesis. Indica que el mandate fue iniciado pero el `mandate.json` aún no fue firmado (la validación de dominios no ocurrió). Los valores existentes (`pending`, `running`, `paused`, `failed`, `completed`, `aborted`) se mantienen sin cambios.

La secuencia de estados del Mandate Genesis es:

```
building → pending → running → completed
                              → failed
                              → aborted
```

La secuencia de un Mandate estándar sigue siendo:

```
(created) → pending → running → completed
                               → failed
                               → aborted
```

### 8.3 Extensión de `mandate_state.json` para el genesis

El genesis requiere campos adicionales en `mandate_state.json` para trackear el progreso pre-firma:

```json
{
  "mandateId": "genesis-my-project-a1b2c3",
  "mandateType": "genesis",
  "workflowId": null,
  "status": "building",
  "genesisIntentId": "gen-genesis-my-project-x9y8z7",
  "genesisPhase": "analysis",
  "domainsProposed": 5,
  "domainsConfirmed": null,
  "mandateJsonSignedAt": null,
  "currentActionId": null,
  "completedActions": [],
  "failedAction": null,
  "history": [],
  "createdAt": "2026-06-18T10:00:00Z",
  "updatedAt": "2026-06-18T10:43:00Z"
}
```

**Campos nuevos:**

| Campo | Descripción |
|---|---|
| `genesisIntentId` | ID del intent `.gen` único del genesis. Permite a cualquier componente encontrar el intent. |
| `genesisPhase` | Fase actual del genesis antes de la firma: `ingest`, `cluster`, `validate`. Después de la firma: `null`. |
| `domainsProposed` | Número de dominios propuestos por Brain en la Fase 2. |
| `domainsConfirmed` | Número de dominios confirmados por el usuario. `null` hasta la confirmación. |
| `mandateJsonSignedAt` | Timestamp de la firma del `mandate.json`. `null` hasta la confirmación. |

---

## 9. Flujo completo de creación y ejecución

```
Usuario ejecuta:
  nucleus mandate create --type genesis --name "my-project" --source /workspace/my-project
          │
          ▼
Nucleus — Validación previa
  • No genesis previo para este proyecto
  • Source accesible
  • Temporal operativo
          │
          ▼
Nucleus — Creación del estado intermedio
  • Genera mandateId: "genesis-my-project-a1b2c3"
  • Crea .mandates/.genesis-my-project-a1b2c3/
  • Escribe mandate_state.json: status: "building"
  • Emite: MANDATE_GENESIS_INITIATED → Sentinel
  • Crea .project/.ai_bot.gen.intent.bl
  • Retorna al usuario: mandate_id + mensaje de progreso
          │
          ▼
Nucleus delega a Brain
  • mandate_id, source, project_name
          │
          ▼
Brain — Instancia el intent .gen
  • Crea .intents/.gen/.genesis-my-project-x9y8z7/
  • Escribe gen_state.json: phase: "ingest"
  • Emite: GENESIS_INGEST_STARTED → Sentinel → Conductor
          │
          ▼
Brain — Fase 1: Ingest (background, usuario no necesita estar)
  • Copia archivos a .raw/
  • Extrae texto → ingest_index.json
  • Vectoriza en ChromaDB
  • Actualiza gen_state.json: vectorization_complete: true
  • Emite: GENESIS_INGEST_COMPLETE → Sentinel
          │
          ▼
Brain — Fase 2: Cluster (background)
  • Clustering semántico sobre ChromaDB
  • Genera domain_proposal.json (2-7 dominios)
  • Actualiza gen_state.json: phase: "analysis"
  • Emite: GENESIS_DOMAINS_PROPOSED → Sentinel → Conductor
          │
          ▼
★ PUNTO DE SINCRONIZACIÓN — El usuario debe estar presente ★
          │
          ▼
Conductor — Pantalla de validación de dominios
  • Presenta domain_proposal.json al usuario
  • Usuario puede: renombrar, fusionar, mover archivos, confirmar
          │
          ▼
Usuario confirma dominios
          │
          ▼
Conductor emite: GENESIS_DOMAINS_CONFIRMED (payload: domain_confirmed.json)
          │
          ├──────────────────────────────────────┐
          ▼                                      ▼
Brain — recibe confirmación              Nucleus — recibe confirmación
  • Escribe domain_confirmed.json          • Construye mandate.json con N acciones .gen
  • Actualiza gen_state.json:              • Firma el mandate.json
    domain_confirmed_ref, sync_point       • Actualiza mandate_state.json:
    reached: true                            status: "pending", mandateJsonSignedAt
                                           • Inicia MandateWorkflow en Temporal
                                           • Actualiza mandate_state.json:
                                             status: "running", workflowId
          │
          ▼
MandateWorkflow (Temporal) — por cada dominio confirmado
  • createIntent(gen-action-{domain}, mandateId) → Brain
  • Brain ejecuta Fase 4 (scaffold) del dominio
  • Brain crea .scaffold/.domain_{name}/ completo
  • Brain actualiza gen_state.json del intent
  • Brain escribe report.json del pipeline
  • waitIntentResult detecta report.json: completed
  • MandateWorkflow registra en history[]
  • MandateWorkflow avanza al siguiente dominio
          │
          ▼
Cuando todos los dominios están scaffoldeados:
  • MandateWorkflow: status → "completed"
  • Nucleus emite: GENESIS_COMPLETE → Sentinel → Conductor
  • Conductor muestra resumen: N genes creados, dominios, archivos procesados
```

---

## 10. Condiciones de error y recuperación

### 10.1 Errores en la fase pre-firma (status: "building")

| Condición | Comportamiento | Recovery |
|---|---|---|
| Source no accesible al iniciar | Error inmediato, nada creado | Re-ejecutar comando con source corregido |
| Ollama no disponible | Brain continúa con clustering textual degradado; flag en `gen_state.json` | No requiere acción del usuario |
| ChromaDB no disponible | Brain continúa sin vectorización; flag en `gen_state.json` | No requiere acción del usuario |
| Error durante Fase 1 (crash de Brain) | `gen_state.json` persiste con `resumable: true` | `nucleus mandate resume genesis-{id}` → Brain retoma desde ingest |
| Error durante Fase 2 (crash de Brain) | `gen_state.json` persiste con fase actual | `nucleus mandate resume` → Brain retoma desde cluster (no re-vectoriza) |
| Usuario abandona la validación | `mandate_state.json` queda en `status: "building"`, `gen_state.json` en `phase: "analysis"` | `nucleus mandate resume` → Conductor vuelve a mostrar la propuesta de dominios |

### 10.2 Errores en la fase post-firma (status: "running")

Heredados del modelo estándar del Mandate Domain Spec v1.0.0:

| Condición | Comportamiento |
|---|---|
| Falla el scaffold de un dominio | `failedAction` registrado, mandate → `failed` |
| Crash de Temporal | Recovery automático. MandateWorkflow lee `completedActions`, salta lo hecho |
| Pausa manual | `nucleus mandate pause genesis-{id}` — señal Temporal estándar |

### 10.3 El genesis se ejecuta exactamente una vez

La validación en el Paso 1 del comando garantiza que no puede existir más de un genesis por proyecto. Si un genesis falló y el usuario quiere reintentar, el camino es:

```bash
# Si el genesis está en estado "building" (pre-firma, recuperable):
nucleus mandate resume genesis-{id}

# Si el genesis falló post-firma (durante scaffold):
nucleus mandate status genesis-{id}    # revisar qué dominio falló
nucleus mandate resume genesis-{id}    # retomar desde el dominio fallido
```

No existe un "re-genesis" completo. Si el usuario quiere empezar de cero, debe eliminar el mandate fallido explícitamente (comando a definir fuera del alcance de este spec) y crear uno nuevo.

---

## 11. Pendientes bloqueantes antes de implementar

### 11.1 Decisión pendiente crítica — ¿Un intent `.gen` o N intents `.gen`?

**La pregunta:** Cuando el MandateWorkflow llama a `createIntent` para cada dominio, ¿crea un nuevo intent `.gen` independiente por dominio, o ejecuta una subfase dentro del único intent `.gen` del genesis?

**Opción A — N intents independientes:**
- Un intent `.gen` por dominio confirmado
- Cada intent `.gen` contiene solo la Fase 4 (scaffold) del dominio específico
- El intent `.gen` "madre" (con las Fases 1-3) queda como artefacto de ingestión/análisis, no como intent ejecutable del MandateWorkflow
- Ventaja: Sigue el modelo estándar de Mandate (cada action crea un intent nuevo)
- Desventaja: Los N intents no tienen Fases 1-3 propias — son intents incompletos por diseño

**Opción B — Un único intent `.gen` con subfases:**
- Un único intent `.gen` para todo el genesis
- El MandateWorkflow no crea intents nuevos — orquesta subfases dentro del intent existente
- `waitIntentResult` observa el estado de cada subfase de scaffold, no del intent completo
- Ventaja: La estructura del tree refleja la realidad (un genesis = un intent)
- Desventaja: Requiere que `waitIntentResult` sea más sofisticada — observar subfases, no solo el intent completo

**Recomendación:** Opción B. El genesis es conceptualmente un único proceso con N subfases de scaffold. Crear N intents independientes sin Fases 1-3 crea intents estructuralmente incompletos que el resto del sistema no puede procesar correctamente.

### 11.2 Extensión de `intentType` en `mandate.json`

El schema del Mandate Domain Spec v1.0.0 define `intentType: "exp | cor | dev | doc"`. Agregar `gen` requiere actualizar el schema y cualquier validación que exista sobre ese campo.

### 11.3 Schema completo de `domain_proposal.json`

Definido como pendiente en el Genesis Design v1.0, Sección 10. Necesario antes de implementar la Fase 2 y la pantalla de validación del Conductor.

### 11.4 Contrato de observación de `waitIntentResult` para intents `.gen`

El Mandate Domain Spec v1.0.0 identifica `waitIntentResult` como el bloqueante crítico de toda la implementación. Para el genesis en Opción B (un único intent):

- ¿Qué path observa `waitIntentResult` para saber que el scaffold del dominio `authentication` completó?
- ¿El `report.json` de `.pipeline/.scaffold_authentication/.response/` es suficiente?
- ¿O se necesita un campo en `gen_state.json` del intent que Brain actualiza por dominio?

**Propuesta:** Brain actualiza el campo `genes_created` en `gen_state.json` del intent después de cada scaffold completado. `waitIntentResult` observa ese campo (polling sobre el archivo) para el dominio específico.

### 11.5 Diseño de la pantalla de validación de dominios en Conductor

UX crítica del genesis. El Genesis Design v1.0 la identifica como pendiente en la Sección 10. Las cuatro operaciones disponibles (renombrar, fusionar, mover, confirmar) necesitan diseño de UX antes de que Sentinel pueda especificar qué payload lleva el evento `GENESIS_DOMAINS_CONFIRMED`.

---

*`nucleus mandate create` — Especificación del Comando Genesis · Bloom / Nucleus · Junio 2026*
*Fuentes: Mandate Domain Spec v1.0.0 · Genesis Intent Design v1.0 · BTIPS v5.0 · GENESIS_INTENT_CREATE.md*
*Este documento es una especificación de implementación. No modificar sin revisión arquitectónica.*
