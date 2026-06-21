# `nucleus mandate create` — Especificación del Comando Genesis
## Bloom / Nucleus · Spec v1.1 · Junio 2026

| Campo | Valor |
|---|---|
| Alcance | Comando `nucleus mandate create` con foco en el Mandate Genesis |
| Fuentes | Mandate Domain Spec v1.0.0 · BLOOM Genesis Intent `.gen` Design v1.0 (parcial — pendiente) · BTIPS v5.0 · GENESIS_INTENT_CREATE.md |
| Estado | Especificación — Pendiente Implementación |
| Decisión de modelo CLI | Modelo B (create unificado con `--source`) — **confirmado** |

### Changelog v1.0 → v1.1

Esta revisión cierra tres de los cinco pendientes bloqueantes de la v1.0, a partir de evidencia provista por `GENESIS_INTENT_CREATE.md`:

- **11.1 resuelto** — Opción B confirmada: un único intent `.gen` por proyecto, con subfases de scaffold. Se corrigieron las secciones 5.2, 5.3, 7.3 y 9, que en la v1.0 describían (de forma contradictoria) un modelo de N intents independientes.
- **11.2 resuelto** — Extensión trivial de `intentType`, aplicada.
- **11.4 resuelto** — Contrato de `waitIntentResult` para `.gen`: observa `report.json` por subfase de dominio, dentro del único intent. Se descarta el mecanismo alternativo de `genes_created` en `gen_state.json`.
- **Corrección estructural no prevista en la v1.0** — La cadena de invocación de Brain no es `Nucleus → Brain` directo. Es `Nucleus → Sentinel → Brain`. Sentinel no es solo un bus de notificación de estado: es el relay activo que dispara la ejecución de Brain. Se corrigieron las secciones 4.3, 6 y 7.2 en consecuencia, y se incorporó el spec de `brain intent create --type gen` (Modelo B de `GENESIS_INTENT_CREATE.md`) como sección 7.4.
- **11.3 y 11.5 siguen abiertos.** Dependen del Genesis Design v1.0, que todavía no fue provisto.

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
11. [Decisiones tomadas y pendientes abiertos](#11-decisiones-tomadas-y-pendientes-abiertos)

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

### 3.4 Aclaración — esta decisión no es la misma que la de `GENESIS_INTENT_CREATE.md`

`GENESIS_INTENT_CREATE.md` evalúa los mismos tres modelos, pero para un comando distinto, en una capa distinta: `brain intent create --type gen`, sin mención de Mandate. Son dos decisiones de capas diferentes que comparten forma pero no comparten actor:

| Capa | Comando | Quién lo ejecuta | Responsabilidad |
|---|---|---|---|
| Mandate (este documento) | `nucleus mandate create --type genesis --source <path>` | El usuario, vía CLI | Crear el contrato estratégico firmado. Punto de entrada único y gobernado. |
| Intent (`GENESIS_INTENT_CREATE.md`) | `brain intent create --type gen --source <path>` | Brain, invocado por Sentinel — **nunca directamente por el usuario** | Instanciar el intent `.gen` y disparar la Fase 1 (ingest). |

El Modelo B se adopta en ambas capas, pero con un orden de dependencia: el Mandate Genesis existe antes de que Brain ejecute `brain intent create --type gen`. Esto resuelve la pregunta que dejaba abierta `GENESIS_INTENT_CREATE.md` ("¿lo crea Brain automáticamente o tiene que existir antes?") — el Mandate Genesis siempre existe primero, porque Nucleus lo crea en el Paso 2 de la Sección 4.3, antes de que Sentinel dispare a Brain en el Paso 3. `brain intent create --type gen` no es un comando que el usuario tipee en una terminal en el flujo de genesis — es la operación interna que Brain ejecuta cuando Sentinel lo invoca. El detalle completo de esa invocación está en la Sección 7.4.

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

**Paso 3 — Invocación de Brain vía Sentinel (no es delegación directa):**

```
Nucleus emite evento Sentinel: MANDATE_GENESIS_INITIATED
  payload: { mandate_id, source, project_name, nucleus_path }

Sentinel recibe el evento y:
  a) Notifica a Conductor (informativo — progreso visible al usuario)
  b) Invoca a Brain (acción — dispara el trabajo real)

Brain, invocado por Sentinel, ejecuta el equivalente de
"brain intent create --type gen" (spec completa en Sección 7.4):
  - Crea .intents/.gen/.genesis-{name}-{uuid3}/
  - Escribe gen_state.json con phase: "ingest"
  - Inicia Fase 1 (ingest) en background
```

> ⚠️ **Corrección respecto a versiones anteriores de este documento**
>
> Nucleus **no** delega directamente a Brain. Crear intents no es responsabilidad de Nucleus — es responsabilidad de Brain, y la cadena de invocación es `Nucleus → Sentinel → Brain`. Sentinel no es un bus pasivo de notificación en este paso: es el componente que efectivamente dispara la ejecución de Brain. Ver Sección 6.2.

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

### 5.2 Un único intent `.gen` con N subfases de scaffold (Opción B — confirmada)

> ✅ **Pendiente 11.1 resuelto en v1.1.** La v1.0 de este documento describía este punto de forma contradictoria: esta sección decía que el MandateWorkflow crea N intents independientes (Opción A), mientras que la Sección 7.3 decía lo opuesto (Opción B). Se adopta formalmente la Opción B, reforzada por evidencia de `GENESIS_INTENT_CREATE.md`: su condición de error ("ya existe un intent `.gen` en este proyecto") está formulada en singular, por proyecto — el modelo mental de esa fuente nunca contempla N intents `.gen` por dominio.

La jerarquía real es:

```
Mandate Genesis
    └── Un único intent .gen (genesisIntentId)
            └── N subfases de scaffold, una por dominio confirmado
```

El MandateWorkflow **no crea intents nuevos** durante su ejecución. El único intent `.gen` del genesis ya fue creado por Brain (vía Sentinel) en el Paso 3 de la Sección 4.3, antes de que el MandateWorkflow exista. Lo que el MandateWorkflow orquesta, por cada acción `gen-action-{domain}`, es una subfase de scaffold dentro de ese intent ya existente.

**Activities nuevas requeridas para `mandateType: genesis`:**

| Activity | Input | Output / Responsabilidad |
|---|---|---|
| `triggerGenesisDomain(action, genesisIntentId)` | La acción del mandate + el `genesisIntentId` (de `mandate_state.json`, Sección 8.3) | Delega a Brain la Fase 4 (scaffold) para el dominio específico, dentro del intent existente. Retorna `{ accepted: boolean }` — no crea un `intentId` nuevo porque ya existe. |
| `waitIntentResult(genesisIntentId, domain)` | El `genesisIntentId` + el nombre del dominio | Observa `.pipeline/.scaffold_{domain}/.response/.report.json` dentro del intent `.gen` único, hasta estado final. Retorna `{ success, summary, ref }`. |

`triggerGenesisDomain` es una activity nueva, separada de `createIntent`. El `MandateWorkflow` rama su lógica según `mandate.mandateType`: si es `"genesis"`, llama a `triggerGenesisDomain` en vez de `createIntent` para cada acción de tipo `gen`. El contrato genérico de `createIntent` (Mandate Domain Spec v1.0.0, Sección 5.1) queda intacto para mandates estándar — no se sobrecarga su semántica.

`waitIntentResult` se extiende con un parámetro `domain` opcional. Cuando `domain` está presente, observa el `report.json` de esa subfase específica en vez del intent completo. Esto resuelve el pendiente 11.4: se descarta la alternativa de un campo `genes_created` en `gen_state.json` (propuesta en la v1.0 de este documento) porque duplica un mecanismo de observación que el patrón de pipeline (`report.json`) ya resuelve, y que es consistente con el resto del sistema (Mandate Domain Spec v1.0.0, Sección 2.3).

El path del `resultRef` para una subfase de scaffold completada es:

```
.intents/.gen/.{genesisIntentId}/.pipeline/.scaffold_{domain}/.response/.report.json
```

### 5.3 El `resultRef` en `mandate_state.json` para acciones `.gen`

```json
{
  "actionId":   "gen-action-authentication",
  "intentId":   "gen-genesis-my-project-x9y8z7",
  "intentType": "gen",
  "status":     "completed",
  "resultRef":  ".intents/.gen/.gen-genesis-my-project-x9y8z7/.pipeline/.scaffold_authentication/.response/.report.json",
  "resolvedAt": "2026-06-18T11:30:00Z"
}
```

Nótese que `intentId` es el mismo (`genesisIntentId`) para todas las acciones del mandate — a diferencia del modelo estándar, donde cada acción tiene un `intentId` distinto. Lo que varía entre acciones es el segmento `.scaffold_{domain}` del `resultRef`, no el intent.

---

## 6. Rol de Sentinel en la creación del Mandate Genesis

Sentinel actúa como bus de eventos en el ecosistema Bloom. En el flujo del Mandate Genesis, Sentinel es el canal de comunicación entre los tres actores principales (Nucleus, Brain, Conductor). Pero no es solo un canal de notificación: en el momento de arranque del genesis, Sentinel tiene responsabilidad activa — es quien dispara la ejecución de Brain, no un observador pasivo que solo retransmite estado.

### 6.1 Eventos que Sentinel debe gestionar

| Evento | Emisor | Receptores | Momento |
|---|---|---|---|
| `MANDATE_GENESIS_INITIATED` | Nucleus | Conductor (informativo) · Brain (invocación — ver 6.2) | Al crear el estado intermedio |
| `GENESIS_INGEST_STARTED` | Brain | Conductor | Al iniciar Fase 1 |
| `GENESIS_INGEST_PROGRESS` | Brain | Conductor | Periódico durante ingestión |
| `GENESIS_INGEST_COMPLETE` | Brain | Conductor, Nucleus | Al completar vectorización |
| `GENESIS_DOMAINS_PROPOSED` | Brain | Conductor | Al escribir `domain_proposal.json` |
| `GENESIS_DOMAINS_CONFIRMED` | Conductor (acción del usuario) | Nucleus, Brain | Al confirmar dominios el usuario |
| `GENESIS_SCAFFOLD_STARTED` | Brain | Conductor | Al iniciar Fase 4 |
| `GENESIS_SCAFFOLD_DOMAIN_COMPLETE` | Brain | Conductor, Nucleus | Por cada dominio scaffoldeado |
| `GENESIS_COMPLETE` | Nucleus (MandateWorkflow) | Conductor | Al completar todos los dominios |
| `GENESIS_ERROR` | Brain o Nucleus | Conductor | En cualquier error recuperable o fatal |

### 6.2 Sentinel como relay de invocación de Brain — no solo bus de notificación

> ✅ **Corrección estructural resuelta en v1.1.** Las versiones anteriores de este documento asumían que Nucleus delega directamente a Brain (Sección 4.3, Paso 3). Es incorrecto: crear intents no es responsabilidad de Nucleus — es responsabilidad de Brain, y Brain es invocado por Sentinel, que a su vez actúa por instrucción de Nucleus. La cadena es `Nucleus → Sentinel → Brain`.

Cuando Nucleus emite `MANDATE_GENESIS_INITIATED`, Sentinel hace dos cosas en paralelo: notifica a Conductor (para que el usuario vea progreso), e invoca a Brain para que ejecute el equivalente de `brain intent create --type gen` (spec completa en Sección 7.4).

**Decisión de mecanismo — invocación interna, no shell-out de CLI:** Sentinel no ejecuta el comando `brain intent create --type gen` como si fuera un usuario tipeándolo en una terminal. Sentinel emite la invocación como una llamada/evento interno con el mismo contrato de payload y comportamiento que ese comando define (`mandate_id`, `source`, `project_name`, `nucleus_path`), y un listener de Brain lo traduce a la misma lógica. Se adopta este mecanismo, en vez de un shell-out literal, por consistencia con el resto de la arquitectura de Sentinel como bus de eventos (Sección 6.1) — todo lo demás en este flujo es evento, no invocación de proceso externo. Esto sigue siendo un punto a confirmar contra la implementación real de Sentinel cuando esté disponible; no es un pendiente bloqueante para el diseño, pero sí algo a validar antes de escribir código.

Esta corrección también resuelve una pregunta que dejaba abierta `GENESIS_INTENT_CREATE.md`: si el Mandate Genesis lo crea Brain automáticamente al recibir el comando, o si tiene que existir antes. La respuesta es que el Mandate Genesis **siempre existe antes**: Nucleus lo crea en el Paso 2 de la Sección 4.3, y solo después de eso Sentinel invoca a Brain. Brain nunca crea un Mandate Genesis por su cuenta.

### 6.3 Sentinel como coordinador del punto de sincronización

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

### 6.4 Eventos de configuración — si Sentinel gestiona configuración

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

Cuando Sentinel invoca a Brain — por instrucción de Nucleus, en el Paso 3 del comando `nucleus mandate create` (Sección 4.3) — Brain instancia el intent `.gen` con la siguiente estructura inicial:

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

Esta es exactamente la estructura que crea `brain intent create --type gen` (Sección 7.4), ejecutado internamente por Brain cuando Sentinel lo invoca.

### 7.3 Cómo Brain sabe qué dominio scaffoldear (recibe del MandateWorkflow)

En la Fase 4, el MandateWorkflow itera las acciones del `mandate.json` y por cada acción de tipo `gen` llama a `triggerGenesisDomain(action, genesisIntentId)` — no a `createIntent` (Sección 5.2). El `payload` de la acción contiene:

```json
{
  "domain_name": "authentication",
  "domain_files": ["src/auth/", "docs/auth.md"],
  "domain_cohesion_score": 0.87
}
```

Brain recibe este payload y ejecuta el scaffold del dominio específico. No ejecuta el intent `.gen` completo desde cero — las Fases 1, 2 y 3 ya ocurrieron. Brain lee el estado existente del intent `.gen` del genesis y ejecuta **únicamente la Fase 4** para el dominio indicado, dentro de la carpeta `.scaffold/.domain_{name}/` del intent ya existente.

> ✅ **Resuelto en v1.1.** La v1.0 de este documento dejaba esto como decisión pendiente, y de hecho se contradecía con la Sección 5.2 de esa misma versión (que describía N intents independientes). Queda confirmado: el MandateWorkflow no crea intents nuevos para el genesis. Hay un único intent `.gen` que contiene todas las fases y subfases, y el MandateWorkflow orquesta las subfases de scaffold dentro de él vía `triggerGenesisDomain`. Ver Sección 5.2 para el detalle completo del contrato de activities.

### 7.4 Spec adoptada — `brain intent create --type gen`

Adaptado de `GENESIS_INTENT_CREATE.md` (Modelo B). Esta es la operación que Brain ejecuta cuando Sentinel lo invoca en el Paso 3 de la Sección 4.3. No es un comando que el usuario tipee en el flujo de genesis — es la lógica interna de Brain, expuesta también como comando de CLI para uso directo de Brain fuera del flujo de Mandate (debugging, recovery manual).

```
brain intent create --type gen \
  --name "genesis" \
  --source <path_or_url> \
  --nucleus-path <nucleus_root>

Comportamiento:
1. Valida que el proyecto no tenga un intent .gen previo (el genesis se ejecuta una vez)
2. Crea la estructura de directorios completa del intent .gen (Sección 7.2)
3. Escribe gen_state.json con phase: "ingest"
4. Si --source es una URL: clona el repo a .raw/
5. Si --source es un path local: copia los archivos a .raw/ con verificación de hashes
6. Escribe ingest_manifest.json inicial con status: "pending" para cada archivo
7. Inicia la ingestión en background
8. Retorna intent_id (= genesisIntentId, persistido por Nucleus en mandate_state.json)

Condiciones de error:
- Ya existe un intent .gen en este proyecto → error + sugerencia de nucleus mandate status
- --source no existe o no es accesible → error antes de crear nada (ya validado en
  el Paso 1 de Nucleus, Sección 4.3 — esta validación es redundante pero se mantiene
  por si Brain se invoca fuera del flujo de Mandate)
```

**Diferencia respecto a la fuente original:** `GENESIS_INTENT_CREATE.md` deja como pendiente si Brain crea el Mandate Genesis automáticamente o si tiene que pre-existir. En el contexto de este documento esa pregunta no aplica — el Mandate Genesis siempre pre-existe, porque Nucleus lo crea en el Paso 2 de la Sección 4.3 antes de que Sentinel invoque a Brain (Sección 6.2). La condición "el Mandate Genesis no existe" de la fuente original nunca debería ocurrir en este flujo; si ocurre, es un error de orquestación, no un caso a manejar como flujo normal.

---

## 8. Modificaciones al contrato de datos del Mandate

### 8.1 Nuevo campo en `mandate.json` — `mandateType`

```json
"mandateType": "genesis" | "standard"
```

- `standard` es el caso genérico (todos los mandates existentes).
- `genesis` activa el flujo especial de creación diferida.
- El MandateWorkflow usa este campo para decidir cómo procesar las acciones: si es `"genesis"`, usa `triggerGenesisDomain` en vez de `createIntent` para las acciones `gen` (Sección 5.2).

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
Sentinel — recibe MANDATE_GENESIS_INITIATED
  • Notifica a Conductor (informativo)
  • Invoca a Brain con: mandate_id, source, project_name, nucleus_path
          │
          ▼
Brain — ejecuta brain intent create --type gen (Sección 7.4)
  • Crea .intents/.gen/.genesis-my-project-x9y8z7/
  • Escribe gen_state.json: phase: "ingest"
  • Persiste genesisIntentId en mandate_state.json (vía Nucleus)
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
  • triggerGenesisDomain(action, genesisIntentId) → Brain
  • Brain ejecuta Fase 4 (scaffold) del dominio, dentro del intent .gen único
  • Brain crea .scaffold/.domain_{name}/ completo
  • Brain escribe report.json de la subfase .pipeline/.scaffold_{domain}/.response/
  • waitIntentResult(genesisIntentId, domain) detecta report.json: completed
  • MandateWorkflow registra en history[] (intentId = genesisIntentId para todas las acciones)
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

## 11. Decisiones tomadas y pendientes abiertos

### 11.A Resuelto en esta revisión (v1.1)

**11.1 — ¿Un intent `.gen` o N intents `.gen`?** Resuelto: Opción B. Un único intent `.gen` por proyecto, con N subfases de scaffold. Confirmado con evidencia de `GENESIS_INTENT_CREATE.md` (su condición de error sobre intent previo está formulada en singular, por proyecto). Detalle completo: Sección 5.2.

**11.2 — Extensión de `intentType` en `mandate.json`.** Resuelto. El schema pasa de `exp | cor | dev | doc` a `exp | cor | dev | doc | gen`. Sin impacto adicional más allá de actualizar la validación del campo donde exista.

**11.4 — Contrato de `waitIntentResult` para intents `.gen`.** Resuelto: observa `report.json` por subfase de dominio (`.pipeline/.scaffold_{domain}/.response/.report.json`) dentro del único intent `.gen`. Se descarta la alternativa de un campo `genes_created` en `gen_state.json`. Requiere una activity nueva, `triggerGenesisDomain`, separada de `createIntent`. Detalle completo: Sección 5.2.

**Corrección no listada en la v1.0 — cadena de invocación Nucleus → Sentinel → Brain.** No era un pendiente declarado, pero se detectó y corrigió en esta revisión: Nucleus no delega directamente a Brain. Sentinel es el relay activo. Detalle completo: Sección 6.2 y Sección 7.4.

### 11.B Pendientes que siguen abiertos

**11.3 — Schema completo de `domain_proposal.json`.** Sigue pendiente del Genesis Design v1.0, Sección 10, que todavía no fue provisto en esta sesión. Necesario antes de implementar la Fase 2 y la pantalla de validación del Conductor.

**11.5 — Diseño de la pantalla de validación de dominios en Conductor.** Sigue pendiente, por el mismo motivo que 11.3. Las cuatro operaciones disponibles (renombrar, fusionar, mover, confirmar) necesitan diseño de UX antes de que Sentinel pueda especificar qué payload lleva `GENESIS_DOMAINS_CONFIRMED`.

**Pendiente heredado, no específico del genesis — estructura real de `report.json`.** El Mandate Domain Spec v1.0.0 (Sección 9.1, 10.3) identifica como bloqueante crítico para *todo* el dominio Mandate — no solo para el genesis — que nunca se vio un `report.json` o `*_state.json` real de un intent existente (`.exp`, `.cor`), ni código de cómo Synapse dispara un intent hoy. Las activities `waitIntentResult` y `triggerGenesisDomain` de este documento están diseñadas sobre la forma que esos archivos *deberían* tener, no sobre la que tienen. Esto aplica con la misma fuerza al caso genesis que al caso estándar.

**Mecanismo exacto de la invocación Sentinel → Brain.** Se adoptó en la Sección 6.2 que Sentinel invoca a Brain como llamada/evento interno, no como shell-out del comando CLI. Es la decisión de diseño más razonable dada la arquitectura event-driven de Sentinel, pero no fue confirmada contra una implementación real de Sentinel — vale la pena validarla antes de escribir código.

---

*`nucleus mandate create` — Especificación del Comando Genesis · Bloom / Nucleus · v1.1 · Junio 2026*
*Fuentes: Mandate Domain Spec v1.0.0 · Genesis Intent Design v1.0 (parcial) · BTIPS v5.0 · GENESIS_INTENT_CREATE.md*
*Este documento es una especificación de implementación. No modificar sin revisión arquitectónica.*
