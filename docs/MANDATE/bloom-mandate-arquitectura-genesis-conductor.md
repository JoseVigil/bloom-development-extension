# Bloom Mandate — Arquitectura, Genesis y Conductor UX/UI
**Versión:** 2.0 — Documento unificado  
**Fecha:** 2026-06-28  
**Fuentes:** BTIPS v5.0 · Mandate Domain Spec v1.0.0 · Genesis Intent Design v1.0 · GENESIS_INTENT_CREATE.md · relevamiento plugin VSCode · brain-schemas.ts · nucleus_schema.ts · project_schema.ts  
**Audiencia:** Desarrolladores de arquitectura + diseñadores UX/UI

---

## NOTA DE USO

Este documento es la fuente de verdad unificada para el sistema de Mandates de Bloom. Integra la arquitectura general del Mandate con la especificación del Mandate Genesis y la spec UX/UI del Conductor.

**Secciones 1–4** — arquitectura y comportamiento del sistema. Prerequisito de lectura para cualquier decisión de diseño o implementación.

**Sección 5** — especificación del Mandate Genesis: el tipo especial de Mandate que estructura semánticamente un proyecto desde cero. Incluye la extensión `domain_expansion` para proyectos que crecen después del genesis fundacional.

**Sección 6** — brief UX/UI del Conductor, escrito para que una sesión de diseño pueda tomarlo directamente. Leer al menos §1.1 (glosario) antes de ir directo a esta sección.

**Sección 7** — responsabilidades del plugin VS Code en relación a Mandates.

**Sección 8** — patrones de código a seguir.

---

> ## ⚠️ RESOLUCIÓN v1.1 — este documento tiene una contradicción interna (§5.10 vs §6.8) y entra en conflicto con `BLOOM_Mandate_Genesis_Backend_Design_v0_1_0.md` y con el código ya implementado. Leer esto antes que nada.
>
> | Punto | Este documento decía | Queda cerrado así |
> |---|---|---|
> | Nombres de evento — **contradicción interna** | §5.10 (Sentinel) usa `GENESIS_INGEST_STARTED` estilo MAYÚSCULA_CON_GUION. §6.8 (Conductor) usa `genesis:ingest:started` estilo minúscula-con-dos-puntos, **para el mismo receptor**, sin reconciliar entre sí. | Ninguna de las dos. Contrato real: `mandate:{namespace}:{event}` — `mandate:genesis:*`, `mandate:action:*`, `mandate:draft:*`, ya compilado en `ws-events.ts`. Tanto §5.10 como §6.8 quedan superados. |
> | `mandateId` / carpeta | `"genesis-{project-name}-{uuid}"`, carpeta `.genesis-{name}-{uuid}/` (§3.1, §5.9) | UUID plano, carpeta sin prefijo ni punto. `mandate.go` (Go, ya implementado) depende de ese formato — cambiar esto implica tocar Go, no solo este documento. |
> | Ubicación de `gen_state.json` | Dentro de `.intents/.gen/.genesis-{name}-{uuid}/`, separado de `.mandates/` (§3.1) | `gen_state.json` no existe. Las fases viven embebidas en `mandate_state.json`, dentro de `.mandates/{uuid}/`, junto con `mandate.json`. |
> | Intent único `.gen` para las 4 fases (§5.7) | Marcado explícitamente en el propio documento como "pendiente de confirmación" | Sigue abierto — no es uno de los 4 puntos cerrados acá, se resuelve al implementar Fase 4. No bloquea Fases 2-3. |
>
> **Lo que SÍ sigue vigente de este documento sin cambios:** las 4 fases y sus actores (§5.5, §5.6), el diagrama de flujo paso a paso (§5.9, salvo el nombre de archivo `gen_state.json` y el formato de `mandateId`), el vocabulario y wireframes de UX/UI del Conductor (§6, salvo los nombres de evento de §6.8), y §7 (plugin VS Code).

> ## ⚠️ RESOLUCIÓN v1.2 — corrección de la ruta de `nucleus-config.json` documentada en §3.2/§7.3, y nota sobre Temporal en pre-firma (ver detalle completo en `BLOOM_Mandate_Genesis_Backend_Design_v0_1_0.md`).
>
> | Punto | Este documento decía (§3.2, §7.3) | Queda cerrado así |
> |---|---|---|
> | Ruta de `nucleus-config.json` para el fix del plugin VS Code | `.bloom/.nucleus-{workspaceName}/.core/.nucleus-config.json` (con punto antes de `nucleus-config.json`) | **Corregido: sin ese punto.** `.bloom/.nucleus-{slug}/.core/nucleus-config.json`. Confirmado contra `supervisor.go` (Go, backend real) y contra `org-resolver.ts` (`NUCLEUS_CONFIG_REL_PATH = path.join('.core', 'nucleus-config.json')`), ambos ya implementados y consistentes entre sí. El fix documentado acá para `NucleusManager.detectExistingNucleus()` tiene el nombre de archivo mal escrito — corregir antes de aplicarlo al plugin real, o el plugin seguirá sin detectar el Nucleus. |
> | Rol de Temporal en pre-firma (§5.10, ya marcado superado por v1.1 de este documento) | v1.1 de este documento remite a la resolución del Backend Design. | Ver RESOLUCIÓN v1.2 del Backend Design: hay evidencia de código real (`mandate_watcher.go`) de que sí existe un Workflow Temporal real con Start+Signal en pre-firma — el rol funcional de Sentinel descrito en §5.10 (qué evento hace qué) sigue siendo válido conceptualmente, pero la afirmación de "no hay Temporal" ya no se puede sostener sin matices. No re-litigar acá — remitir al lector a la v1.2 del otro documento en vez de duplicar la tabla. |

---

## 1. QUÉ ES UN MANDATE — DEFINICIÓN FORMAL Y LÍMITES

### 1.1 Glosario mínimo

**Intent** — unidad mínima de trabajo técnico. Acotado, determinista, ejecutable por Brain. Tipos: `dev` (código), `doc` (documentación), `exp` (exploración), `inf` (información), `cor` (coordinación), `gen` (genesis — ver §5). Un intent vive en `.bloom/.intents/` y tiene un lifecycle propio.

**Action** — unidad semántica dentro de un Mandate. No ejecuta lógica directamente: declara una intención que Nucleus resuelve como un intent concreto. La Action es el puente entre la estrategia del Mandate y la ejecución del Intent.

**Nucleus** — la única autoridad del sistema. Firma, valida y orquesta. Ningún componente (plugin, Conductor, Alfred) tiene autoridad propia. Toda firma y gobernanza pasa por Nucleus.

**Sentinel** — bus de eventos del ecosistema. Canal de comunicación entre Nucleus, Brain y Conductor. No gestiona infraestructura — transmite eventos de estado.

### 1.2 Definición formal

Un **Mandate** es un contrato estratégico firmado por Nucleus que declara un objetivo organizacional descompuesto en Actions secuenciales, cada una resuelta como un Intent gobernado, orquestado persistentemente vía Temporal bajo autoridad exclusiva de Nucleus.

La jerarquía completa:

```
Nivel 1 — Nucleus        autoridad, gobernanza, firma
Nivel 2 — Mandate        contrato estratégico firmado, versionado, inmutable
Nivel 3 — Action         unidad semántica del Mandate
Nivel 4 — Intent         unidad ejecutable concreta (exp / cor / dev / doc / gen)
```

Un Mandate nunca ejecuta lógica directamente. Nunca escribe en `.intents/`. Solo orquesta, siempre a través de Nucleus, usando Temporal como motor de persistencia.

### 1.3 Qué NO es un Mandate

| NO es / NO hace | SÍ es / SÍ hace |
|---|---|
| Un tipo especial de intent | Un contrato estratégico firmado |
| Un reemplazo de intents | Una capa superior que los orquesta |
| Un runtime paralelo | Un Workflow de Temporal en el mismo runtime |
| Ejecutor de lógica de negocio | Orquestador vía Nucleus exclusivamente |
| Escritor directo en `.intents/` | Solicitante a Nucleus para crear intents |
| Mutable post-creación | Inmutable — el contrato original nunca se altera |

### 1.4 Tipos de Mandate

| `mandateType` | Descripción |
|---|---|
| `standard` | Mandate genérico. El usuario entrega un `mandate.json` predefinido con actions declaradas. |
| `genesis` | Mandate fundacional de un proyecto. Las actions se determinan durante la ejecución. Ver §5. |
| `domain_expansion` | Extensión incremental de un proyecto cuyo genesis fundacional ya completó. Ver §5.12. |

### 1.5 Separación entre definición y estado

El Mandate tiene dos artefactos en disco, siempre separados:

`mandate.json` — el contrato firmado. Inmutable desde el momento de la firma. Contiene el objetivo, las Actions declaradas, la firma de Nucleus, la versión y los metadatos de creación.

`mandate_state.json` — el estado mutable de ejecución. Registra qué Actions completaron, qué Intents fueron instanciados, el progreso actual, timestamps y resultados. Este archivo crece a lo largo del tiempo; el contrato original no se toca nunca.

Esta separación es la que permite que el Mandate sea portable (el `mandate.json` puede transferirse al marketplace) y auditable (el `mandate_state.json` tiene trazabilidad completa de lo que corrió).

---

## 2. CICLO DE VIDA DE UN MANDATE

### 2.1 Mandate estándar — los cinco estados

```
draft → pending_signature → active → [paused] → completed
                                ↘
                              cancelled
```

**draft** — el usuario formuló el objetivo y las Actions en el Conductor. No existe aún como artefacto firmado. Editable en esta fase.

**pending_signature** — enviado a Nucleus para validación y firma. El usuario no puede editarlo. Nucleus verifica la coherencia, los permisos del actor, y la viabilidad de las Actions declaradas.

**active** — Nucleus firmó. Temporal está corriendo el workflow. Las Actions se están resolviendo como Intents secuencialmente. El contrato es ahora inmutable.

**paused** — workflow detenido manualmente (`nucleus mandate pause`). Temporal retiene el estado exactamente donde estaba. Puede reanudarse sin perder trabajo.

**completed** — todas las Actions se resolvieron satisfactoriamente.

**cancelled** — detenido permanentemente antes de completarse. Los Intents ya ejecutados no se revierten.

### 2.2 Mandate Genesis — estados extendidos

El Genesis agrega un estado previo a `pending_signature`:

```
building → pending → running → completed
                             → failed
                             → aborted
```

**building** — estado exclusivo del genesis. El mandate fue iniciado pero el `mandate.json` aún no fue firmado: la validación de dominios no ocurrió todavía. En el modelo estándar este estado no existe.

Ver §5 para el detalle completo del ciclo de vida del genesis.

### 2.3 Flujo de ejecución estándar paso a paso

```
Usuario formula objetivo
    │  en el Conductor, en lenguaje estructurado
    │  declara Actions y sus tipos de intent esperados
    ▼
Conductor envía mandate.json a Nucleus
    │  via Brain CLI: nucleus mandate create --file mandate.json
    ▼
Nucleus valida y firma
    │  verifica permisos del actor (Master puede crear Mandates)
    │  verifica coherencia de las Actions
    │  firma digitalmente el contrato
    ▼
Temporal Workflow inicia (nucleus mandate run {id})
    │  el Mandate es ahora inmutable y persistente
    ▼
Por cada Action en secuencia:
    │
    ├── Nucleus instancia el Intent correspondiente
    │       (coloca el archivo intent.json en .bloom/.intents/)
    │
    ├── Brain detecta el nuevo Intent y lo ejecuta
    │       (pipeline: parse → contexto → ejecución → AI → output)
    │
    ├── Brain publica eventos de progreso
    │       INTENT_STARTED → INTENT_PROGRESS → INTENT_COMPLETED
    │
    ├── Nucleus registra el resultado en mandate_state.json
    │
    └── Si hay error: Temporal retiene el estado y permite retry
         Si todas las Actions completan: estado → completed
```

### 2.4 Resiliencia y recuperación

Temporal garantiza que en caso de crash, el workflow retoma automáticamente desde el último Intent completado — sin repetir trabajo ya realizado. El `mandate_state.json` es la fuente de verdad para la recuperación.

### 2.5 Comandos CLI canónicos

```bash
nucleus mandate create --file mandate.json   # Mandate estándar: Nucleus valida y firma
nucleus mandate create --type genesis \      # Mandate Genesis (ver §5)
  --name <nombre> --source <path_o_url>
nucleus mandate create --type domain_expansion \  # Genesis incremental (ver §5.12)
  --name <nombre> --source <path_nuevo> \
  --base-genesis <genesis-mandate-id>
nucleus mandate run    {mandateId}           # Inicia el workflow Temporal
nucleus mandate pause  {mandateId}           # Pausa en el punto actual
nucleus mandate resume {mandateId}           # Reanuda desde donde pausó
nucleus mandate status {mandateId}           # Estado actual de ejecución
```

---

## 3. DÓNDE VIVEN LOS MANDATES EN EL FILESYSTEM

### 3.1 Estructura en disco

> ⚠️ SUPERADO por RESOLUCIÓN v1.1 (arriba): sin `gen_state.json` separado, sin `.genesis-{name}-{uuid}/`. Ver tabla al inicio del documento.

```
workspace/
└── .bloom/
    └── .nucleus-{org}/
        ├── .core/
        │   └── .nucleus-config.json
        ├── .mandates/                              ← aquí viven los Mandates
        │   ├── {mandateId}/                        ← Mandate estándar
        │   │   ├── mandate.json                    ← contrato firmado (inmutable)
        │   │   └── mandate_state.json              ← estado de ejecución (mutable)
        │   ├── .genesis-{name}-{uuid}/             ← Mandate Genesis
        │   │   ├── mandate.json                    ← firmado post-validación dominios
        │   │   └── mandate_state.json              ← incluye campos genesis (ver §5.8)
        │   └── .expansion-{name}-{uuid}/           ← Mandate domain_expansion
        │       ├── mandate.json
        │       └── mandate_state.json
        ├── .intents/
        │   ├── .exp/
        │   ├── .dev/
        │   ├── .doc/
        │   ├── .cor/
        │   └── .gen/                               ← intents del genesis (ver §5.7)
        │       └── .genesis-{name}-{uuid}/
        │           ├── gen_state.json
        │           ├── .ingest/
        │           ├── .analysis/
        │           ├── .scaffold/
        │           └── .pipeline/
        ├── .relations/
        │   └── .project-links.json
        └── .governance/
```

### 3.2 Implicación para el plugin VS Code

El plugin detecta Mandates leyendo `.bloom/.nucleus-{org}/.mandates/`. Si ese directorio existe y contiene subdirectorios, hay Mandates en el sistema.

**Bug crítico a corregir antes de cualquier trabajo de Mandate:**

```typescript
// ACTUAL (roto) — NucleusManager.detectExistingNucleus() busca:
'.bloom/core/nucleus-config.json'

// CORRECTO — la ruta real en producción (confirmado contra supervisor.go
// y org-resolver.ts, backend ya implementado — sin punto antes de
// "nucleus-config.json"):
'.bloom/.nucleus-{workspaceName}/.core/nucleus-config.json'
```

Sin este fix, el plugin no puede detectar ningún Nucleus y todo lo que depende de esa detección falla silenciosamente.

### 3.3 El `project-links.json`

`.relations/.project-links.json` registra qué proyectos están vinculados al Nucleus. Un Mandate que involucra múltiples proyectos necesita este archivo para saber en qué contextos puede instanciar Intents. El `MandateManager` del plugin debe leer (no escribir) este archivo.

---

## 4. RESPONSABILIDADES POR SUPERFICIE — LÍMITES ARQUITECTÓNICOS

### 4.1 Tabla de responsabilidades

| Acción | Conductor | VS Code Plugin | Alfred (mobile) |
|---|---|---|---|
| Crear un Mandate estratégico multi-proyecto | ✅ única superficie | — | — |
| Crear un Mandate Genesis | ✅ única superficie | — | — |
| Validar dominios del genesis | ✅ | — | — |
| Firmar un Mandate | Nucleus (interno) | — | — |
| Ver estado de Mandates activos | ✅ | ✅ (read-only, Activity Bar) | ✅ (streaming) |
| Crear intents `dev`/`doc` en contexto de Mandate | ✅ | ✅ (con contexto de código) | — |
| Crear intents `exp`/`cor` organizacionales | ✅ | — | — |
| Pausar / reanudar / cancelar un Mandate | ✅ | — | ✅ (vía Alfred) |
| Aprobar acciones que requieren decisión humana | ✅ | — | ✅ |
| Navegar el filesystem de intents del workspace | — | ✅ | — |
| Observar el Event Bus en tiempo real | ✅ | Parcial (webview) | ✅ (streaming) |
| Gestionar perfiles Chrome y cuentas AI | — | ✅ | — |

### 4.2 Los dos flujos de entrada de un Mandate al workspace del desarrollador

```
FLUJO A — El Mandate nace en el Conductor
─────────────────────────────────────────
Nucleus firma el Mandate en el Conductor
    │  persiste mandate.json en .bloom/.nucleus-{org}/.mandates/
    ▼
FileSystemWatcher del plugin detecta el nuevo directorio
    │  broadcast 'mandate:created' vía WebSocket :4124
    ▼
Plugin actualiza el Activity Bar en tiempo real
    ▼
Desarrollador trabaja los Intents instanciados por el Mandate

FLUJO B — El desarrollador propone el Mandate desde VS Code
──────────────────────────────────────────────────────────
El plugin detecta que un desarrollador quiere iniciar un Mandate
    │  el plugin NO crea el Mandate directamente
    │  abre el Conductor con el contexto pre-cargado
    ▼
El usuario completa la definición en el Conductor
    │  Nucleus firma
    ▼
El Mandate vuelve al plugin vía FileSystemWatcher (Flujo A)
```

---

## 5. MANDATE GENESIS — ESPECIFICACIÓN COMPLETA

### 5.1 Por qué el Genesis es un caso especial

Un Mandate estándar como `auth-cleanup` tiene acciones predefinidas por el usuario (`exp` → `dev` → `doc` sobre `src/auth`): el usuario sabe qué quiere hacer y lo declara en el `mandate.json`.

El **Mandate Genesis** no puede seguir ese modelo por cuatro razones:

1. **Las acciones son desconocidas antes del genesis.** El número de acciones `.gen` es N, donde N es el número de dominios confirmados. Esos dominios no existen hasta que Brain ejecuta el clustering y el usuario los valida. No es posible declarar las acciones en un `mandate.json` pre-escrito.

2. **El genesis se ejecuta exactamente una vez por proyecto** (en su forma fundacional). Es el acto fundacional del proyecto en Bloom, no un mandate recurrente.

3. **El input del usuario no es una descripción de acciones, sino un conjunto de archivos.** El usuario entrega un workspace; Bloom determina la estructura.

4. **Requiere un punto de sincronización humana en el medio.** Entre la Fase 2 (clustering) y la Fase 4 (scaffold), el usuario debe validar los dominios propuestos. Esto es estructuralmente distinto de la pausa manual (`nucleus mandate pause`) que existe para cualquier mandate.

Estas cuatro diferencias justifican que `nucleus mandate create` tenga un caso específico para `--type genesis`, con flags y comportamiento distintos al caso genérico.

### 5.2 Decisión de modelo CLI — por qué Modelo B

Se evaluaron tres modelos:

**Modelo A — Dos comandos separados** (`nucleus mandate create --type genesis` + `nucleus genesis ingest`): requeriría crear un `mandate.json` sin acciones, violando el principio de inmutabilidad del contrato. **Rechazado.**

**Modelo B — Comando unificado con `--source`** (adoptado): `nucleus mandate create --type genesis --name X --source Y`. El `mandate.json` se escribe y firma *después* de la validación de dominios, no al inicio. Preserva la inmutabilidad post-firma.

**Modelo C — `nucleus genesis start`**: destino final de UX a largo plazo, excede el alcance del Paso 1. El Modelo B es el camino hacia él.

### 5.3 Forma del comando genesis

```bash
nucleus mandate create --type genesis \
  --name <nombre-del-proyecto> \
  --source <path_local | url_repositorio> \
  [--nucleus-path <ruta_al_nucleus>]
```

| Flag | Requerido | Descripción |
|---|---|---|
| `--type genesis` | Sí | Activa el flujo de Mandate Genesis. Sin este flag, el comando espera `--file`. |
| `--name` | Sí | Nombre del proyecto. Se usa para el slug del `mandateId` y el nombre del intent `.gen`. |
| `--source` | Sí | Path local absoluto o URL de repositorio Git. |
| `--nucleus-path` | No | Override de la ruta raíz del nucleus. Default: autodetectado desde `.bloom/`. |

### 5.4 Comportamiento de Nucleus al recibir el comando genesis

**Paso 1 — Validación previa (antes de crear nada):**

```
1. Verificar el estado del genesis fundacional para este proyecto:
   → No existe genesis previo: proceder
   → Existe genesis fundacional completado:
       → Si --type genesis: error + "Genesis fundacional ya ejecutado.
         Para agregar dominios usar --type domain_expansion"
       → Si --type domain_expansion: proceder (ver §5.12)
   → Existe genesis fundacional incompleto (status: "building" o "running"):
       → error + "Genesis en progreso. Usar nucleus mandate resume <genesis-id>"

2. Verificar accesibilidad de --source:
   → Path local: verificar que existe y es legible
   → URL Git: verificar conectividad
   → Si no accesible: error antes de crear ningún artefacto

3. Verificar que el Mandate Domain está operativo:
   → Temporal disponible
   → mandate-orchestration-worker registrado
```

**Paso 2 — Creación del estado intermedio (pre-firma):**

```
1. Generar mandateId: "genesis-{project-name}-{uuid3}"
2. Crear carpeta: .bloom/.nucleus-{org}/.mandates/.genesis-{name}-{uuid3}/
3. Escribir mandate_state.json con status: "building"
4. Crear .project/.ai_bot.gen.intent.bl (bot del genesis)
5. Emitir evento Sentinel: MANDATE_GENESIS_INITIATED
6. Retornar al usuario: mandate_id + "Genesis iniciado. Brain comenzará la ingestión en background."
```

**Paso 3 — Delegación a Brain:**

```
Nucleus delega a Brain:
  - mandate_id, source, project_name, nucleus_path

Brain instancia el intent .gen vía: brain intent create --type gen
  - Crea .intents/.gen/.genesis-{name}-{uuid3}/
  - Escribe gen_state.json con phase: "ingest"
  - Inicia Fase 1 (ingest) en background
```

**Paso 4 — Firma diferida del mandate.json (post-validación de dominios):**

```
Cuando el usuario confirma los dominios en la Fase 3:
  - Brain escribe domain_confirmed.json
  - Brain notifica a Nucleus: GENESIS_DOMAINS_CONFIRMED (evento Sentinel)
  - Nucleus construye el mandate.json final:
      → Una action .gen por cada dominio confirmado
      → Firma el documento
  - Nucleus actualiza mandate_state.json: status → "pending"
  - Nucleus inicia MandateWorkflow en Temporal
  - Nucleus actualiza mandate_state.json: status → "running", workflowId → temporal_id
```

### 5.5 Las cuatro fases del genesis

| Fase | Actor | Qué ocurre |
|---|---|---|
| Fase 1 — Ingest | Brain | Copia archivos a `.raw/`, extrae texto, vectoriza en ChromaDB. Emite `GENESIS_INGEST_STARTED` → `GENESIS_INGEST_COMPLETE`. |
| Fase 2 — Cluster | Brain | Clustering semántico sobre ChromaDB. Genera `domain_proposal.json` (2–7 dominios). Emite `GENESIS_DOMAINS_PROPOSED`. |
| Fase 3 — Validate | Usuario (Brain escucha) | El Conductor presenta los dominios propuestos. El usuario puede renombrar, fusionar, mover archivos, confirmar. Emite `GENESIS_DOMAINS_CONFIRMED`. |
| Fase 4 — Scaffold | Brain (via MandateWorkflow) | Crea genes, semantic scaffolds, docbases iniciales por dominio. Las Fases 1-3 ya completaron; el MandateWorkflow orquesta el scaffold de cada dominio. |

Las Fases 1–3 ocurren **antes** de que el MandateWorkflow esté activo — son parte de la creación del mandate, no de su ejecución.

### 5.6 El flujo completo de creación y ejecución del Genesis

```
Usuario ejecuta:
  nucleus mandate create --type genesis --name "my-project" --source /workspace/my-project
          │
          ▼
Nucleus — Validación previa (ver §5.4 Paso 1)
          │
          ▼
Nucleus — Creación del estado intermedio
  • mandateId: "genesis-my-project-a1b2c3"
  • mandate_state.json: status: "building"
  • Emite: MANDATE_GENESIS_INITIATED → Sentinel
  • Retorna al usuario
          │
          ▼
Nucleus delega a Brain → Brain instancia intent .gen
  • gen_state.json: phase: "ingest"
  • Emite: GENESIS_INGEST_STARTED → Sentinel → Conductor
          │
          ▼
Brain — Fase 1: Ingest (background)
  • Copia archivos a .raw/ → extrae texto → vectoriza ChromaDB
  • Emite: GENESIS_INGEST_COMPLETE → Sentinel
          │
          ▼
Brain — Fase 2: Cluster (background)
  • Clustering semántico → domain_proposal.json
  • Emite: GENESIS_DOMAINS_PROPOSED → Sentinel → Conductor
          │
          ▼
★ PUNTO DE SINCRONIZACIÓN — El usuario debe estar presente ★
          │
          ▼
Conductor — Pantalla de validación de dominios
  • Presenta domain_proposal.json
  • Usuario puede: renombrar, fusionar, mover archivos, confirmar
          │
          ▼
Usuario confirma dominios
          │
Conductor emite: GENESIS_DOMAINS_CONFIRMED (payload: domain_confirmed.json)
          │
          ├─────────────────────────────────────┐
          ▼                                     ▼
Brain — recibe confirmación           Nucleus — recibe confirmación
  • Escribe domain_confirmed.json       • Construye mandate.json con N acciones .gen
  • gen_state.json: sync_point          • Firma el mandate.json
    reached: true                       • mandate_state.json: status → "pending"
                                        • Inicia MandateWorkflow en Temporal
                                        • mandate_state.json: status → "running"
          │
          ▼
MandateWorkflow (Temporal) — por cada dominio confirmado:
  • createIntent(gen-action-{domain}, mandateId) → Brain
  • Brain ejecuta Fase 4 (scaffold) del dominio específico
  • Brain crea .scaffold/.domain_{name}/ completo
  • Brain actualiza gen_state.json, escribe report.json
  • waitIntentResult detecta report.json: completed
  • MandateWorkflow registra en history[], avanza al siguiente dominio
          │
          ▼
Cuando todos los dominios están scaffoldeados:
  • MandateWorkflow: status → "completed"
  • Nucleus emite: GENESIS_COMPLETE → Sentinel → Conductor
  • Conductor muestra resumen: N genes creados, dominios, archivos procesados
```

### 5.7 El intent `.gen` — tipo nuevo de intent

El Mandate Genesis requiere agregar `gen` al conjunto de tipos de intent válidos. El schema del Mandate Domain Spec v1.0.0 define `intentType: "exp | cor | dev | doc"`. **Esto requiere actualizar el schema y cualquier validación existente sobre ese campo.**

**Estructura en disco del intent `.gen`:**

```
.intents/.gen/.genesis-{name}-{uuid}/
├── gen_state.json              ← phase, mandate_id, scope, campos de progreso
├── .ingest/
│   ├── ingest_manifest.json   ← status "pending" por cada archivo; se actualiza durante Fase 1
│   ├── ingest_index.json      ← vacío al inicio, se completa durante Fase 1
│   └── .raw/                  ← archivos del usuario, copiados por Brain
├── .analysis/                 ← se puebla en Fase 2 (domain_proposal.json, domain_confirmed.json)
├── .scaffold/                 ← se puebla en Fase 4, una carpeta por dominio
│   ├── .domain_authentication/
│   └── .domain_infrastructure/
└── .pipeline/                 ← estructura BISP
```

**Comando de instanciación (interno — no lo tipea el usuario):**

```bash
brain intent create --type gen \
  --name <nombre-del-proyecto> \
  --source <path_local_o_url> \
  --mandate-id <genesis-mandate-id> \
  [--nucleus-path <ruta_al_nucleus>]
```

Este comando sigue el patrón de `brain intent create --type <tipo>` que ya existe para `dev`, `doc`, `exp`, `cor`. Nucleus lo invoca internamente. También puede usarse manualmente para recovery. A diferencia de los otros tipos, `--source` es obligatorio en la creación misma — el intent `.gen` no tiene razón de existir sin material para ingerir.

**Decisión de implementación — un único intent `.gen` (recomendado):**

El genesis usa un único intent `.gen` para todas las fases. Cuando el MandateWorkflow orquesta el scaffold de cada dominio, no crea N intents `.gen` independientes — ejecuta la Fase 4 de `.scaffold/.domain_{name}/` dentro del intent `.gen` ya existente. Esto requiere que `waitIntentResult` pueda observar el estado de una subfase de scaffold individual (campo `genes_created` en `gen_state.json`), no solo el estado final del intent completo.

La alternativa (N intents independientes por dominio) crearía intents sin Fases 1-3 propias — estructuralmente incompletos. **Esta decisión está pendiente de confirmación antes de implementar.**

### 5.8 Schema del `mandate.json` para el genesis

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

**Campos nuevos respecto al schema estándar:**

| Campo | Descripción |
|---|---|
| `mandateType` | `"genesis"` — identifica que es un Mandate Genesis. El MandateWorkflow lo usa para saber cómo procesar las acciones. |
| `genesisSource` | Path o URL original del workspace. Para auditoría y resumabilidad. |

### 5.9 Schema extendido del `mandate_state.json` para el genesis

> ⚠️ El `mandateId` de ejemplo abajo (`"genesis-my-project-a1b2c3"`) usa el formato SUPERADO por RESOLUCIÓN v1.1. En el código real es un UUID plano sin prefijo (ej. `"a1b2c3d4-..."`). El resto de la estructura de campos (`genesisPhase`, `domainsProposed`, etc.) sigue siendo válida como concepto — solo se relocalizan dentro de la forma real de `mandate_state.json` documentada en `mandate-state.types.ts`.

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

**Campos nuevos exclusivos del genesis:**

| Campo | Descripción |
|---|---|
| `genesisIntentId` | ID del intent `.gen`. Permite a cualquier componente encontrar el intent. |
| `genesisPhase` | Fase actual antes de la firma: `ingest`, `cluster`, `validate`. Después de la firma: `null`. |
| `domainsProposed` | Número de dominios propuestos por Brain en la Fase 2. |
| `domainsConfirmed` | Número de dominios confirmados por el usuario. `null` hasta la confirmación. |
| `mandateJsonSignedAt` | Timestamp de la firma. `null` hasta la confirmación. |

### 5.10 Rol de Sentinel en el Genesis

> ⚠️ SUPERADO por RESOLUCIÓN v1.1 (arriba): los nombres de evento `GENESIS_*` de esta sección no se usan. Contrato real en `ws-events.ts` (`mandate:genesis:*`). El rol funcional de Sentinel descrito acá sigue siendo válido, solo cambian los nombres.

Sentinel es el canal de comunicación entre Nucleus, Brain y Conductor durante el genesis. No gestiona infraestructura — transmite eventos de estado.

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

**Invariante crítica:** El evento `GENESIS_DOMAINS_CONFIRMED` es el único trigger que habilita a Nucleus para firmar el `mandate.json`. Sin ese evento, el mandate no existe formalmente. Sin ese evento, Brain no puede iniciar la Fase 4.

**Sobre la inicialización de ChromaDB:** Brain inicializa ChromaDB directamente en la Fase 1. Sentinel no gestiona configuración de infraestructura vectorial — es un bus de eventos de estado, no un gestor de infraestructura.

### 5.11 Condiciones de error y recovery del Genesis

**Errores en fase pre-firma (status: "building"):**

| Condición | Comportamiento | Recovery |
|---|---|---|
| Source no accesible al iniciar | Error inmediato, nada creado | Re-ejecutar con source corregido |
| Ollama no disponible | Brain continúa con clustering textual degradado; flag en `gen_state.json` | No requiere acción del usuario |
| ChromaDB no disponible | Brain continúa sin vectorización; flag en `gen_state.json` | No requiere acción del usuario |
| Crash de Brain durante Fase 1 | `gen_state.json` persiste con `resumable: true` | `nucleus mandate resume genesis-{id}` → retoma desde ingest |
| Crash de Brain durante Fase 2 | `gen_state.json` persiste con fase actual | `nucleus mandate resume` → retoma desde cluster (no re-vectoriza) |
| Usuario abandona la validación | `mandate_state.json` queda en `building`, `gen_state.json` en `phase: "analysis"` | `nucleus mandate resume` → Conductor vuelve a mostrar la propuesta de dominios |

**Errores en fase post-firma (status: "running"):** Heredados del modelo estándar del Mandate Domain Spec v1.0.0 (Temporal recovery, retry manual, pausa manual).

**No existe "re-genesis fundacional" completo.** Si el usuario quiere empezar de cero, debe eliminar el mandate fallido explícitamente y crear uno nuevo.

---

### 5.12 Genesis incremental — `domain_expansion`

#### 5.12.1 El problema que resuelve

El genesis fundacional estructura el proyecto una vez. Pero un proyecto vive: aparece un subproyecto nuevo, se incorpora un módulo que no existía. ¿Cómo entra ese material nuevo al sistema de genes sin romper la inmutabilidad del Mandate Genesis original?

**`dev` y `doc` no sirven para esto.** Ambos asumen estructura previa — codebase y docbase ya existentes. Un dominio nuevo no tiene codebase ni docbase todavía; necesita exactamente lo que el genesis produce: ingest → cluster → scaffold. Usar `dev`/`doc` para esto sería forzar un intent a hacer un trabajo para el que no fue diseñado.

**Tampoco es reabrir el Mandate Genesis original.** El `mandate.json` del genesis fundacional está firmado y es inmutable. No hay excepción para este caso.

La solución es un **Mandate nuevo, de tipo `domain_expansion`**, que reutiliza el mecanismo del intent `.gen` con un alcance acotado.

#### 5.12.2 Qué es un Mandate `domain_expansion`

Un Mandate `domain_expansion` es un Mandate independiente (nuevo `mandateId`, nuevo `mandate.json`, nueva firma) que ejecuta el mismo mecanismo de cuatro fases del genesis, pero con dos restricciones que lo distinguen del fundacional:

1. **El clustering opera solo sobre el material nuevo**, no sobre todo el proyecto. Los genes existentes no se re-analizan ni se re-vectorizan.
2. **No puede ejecutarse antes de que el genesis fundacional haya completado.** Es lógicamente una operación de "agregar", no de "fundar".

```
Mandate Genesis (fundacional)          Mandate domain_expansion #1
    └── N genes iniciales                  └── M genes nuevos (M ≥ 1)
                                                (no toca los N genes existentes)
```

**Línea conceptual:** `domain_expansion` es para material que no encaja en ningún dominio existente. Si encaja en un dominio existente, no es expansión de dominio — es trabajo normal de `.dev`/`.doc` sobre un gene que ya vive.

#### 5.12.3 Forma del comando

```bash
nucleus mandate create --type domain_expansion \
  --name <nombre-del-proyecto> \
  --source <path_nuevo_material> \
  --base-genesis <genesis-mandate-id>
```

| Flag | Requerido | Descripción |
|---|---|---|
| `--type domain_expansion` | Sí | Activa el flujo de expansión incremental. |
| `--name` | Sí | Nombre del proyecto — debe coincidir con el proyecto del genesis base. |
| `--source` | Sí | Path o URL del material **nuevo** únicamente. No se re-entrega el proyecto completo. |
| `--base-genesis` | Sí | `mandateId` del genesis fundacional completado. Ancla la expansión y permite a Nucleus verificar que el fundacional está `completed`. |

#### 5.12.4 Comportamiento de Nucleus

```
Paso 1 — Validación previa:
  1. Verificar que --base-genesis existe y tiene status: "completed"
     → Si no completó: error + "El genesis fundacional debe completar antes de expandir dominios"
  2. Verificar accesibilidad de --source
  3. Verificar que no hay otro domain_expansion en curso sobre el mismo --base-genesis
     (las expansiones son secuenciales, no concurrentes, para evitar colisiones de clustering)

Paso 2 — Creación del estado intermedio:
  1. mandateId: "expansion-{project-name}-{uuid3}"
  2. mandate_state.json: status: "building", mandateType: "domain_expansion",
     baseGenesisId: <referencia al fundacional>
  3. Emitir: MANDATE_EXPANSION_INITIATED → Sentinel

Paso 3 — Delegación a Brain:
  Brain instancia el intent .gen vía brain intent create --type gen
  → gen_state.json incluye scope: "expansion", base_genesis_id: <referencia>
  → La Fase 2 (cluster) consulta ChromaDB filtrando SOLO los vectores
    del ingest_index.json de este intent — no la colección completa del proyecto

Paso 4 — Firma diferida: idéntico al genesis fundacional.
  Tras EXPANSION_DOMAINS_CONFIRMED, Nucleus construye y firma el mandate.json
  de la expansión con N acciones .gen (una por dominio nuevo confirmado).
```

#### 5.12.5 Qué NO cambia del genesis fundacional al ejecutarse una expansión

| Elemento | Estado tras `domain_expansion` |
|---|---|
| `mandate.json` del genesis fundacional | Sin cambios — firmado, inmutable, archivado |
| Genes existentes (`gen.json`, `gen_state.json` por dominio) | Sin cambios |
| `domain_confirmed.json` del fundacional | Sin cambios — sigue siendo la topología original |
| Colección ChromaDB del proyecto | **Crece** — se agregan vectores del material nuevo, no se tocan los existentes |
| Intent `.gen` del fundacional | Sin cambios — archivado |

#### 5.12.6 Eventos de Sentinel para `domain_expansion`

| Evento | Emisor | Receptores | Momento |
|---|---|---|---|
| `MANDATE_EXPANSION_INITIATED` | Nucleus | Conductor, Brain | Al crear el estado intermedio |
| `EXPANSION_DOMAINS_PROPOSED` | Brain | Conductor | Análogo a `GENESIS_DOMAINS_PROPOSED`, acotado al material nuevo |
| `EXPANSION_DOMAINS_CONFIRMED` | Conductor | Nucleus, Brain | Análogo a `GENESIS_DOMAINS_CONFIRMED` |
| `EXPANSION_COMPLETE` | Nucleus | Conductor | Al completar el scaffold de los dominios nuevos |

La pantalla de validación de dominios en el Conductor es **reutilizable** para `domain_expansion` con un único cambio de copy: debe dejar claro que el usuario está validando dominios nuevos, no la totalidad del proyecto.

#### 5.12.7 Pendiente abierto

Si el material entregado en `--source` de una expansión, tras el clustering, resulta cohesivo con un dominio ya existente (score de similitud > 0.85), Brain debería señalizar ese caso en `domain_proposal.json` con una advertencia (`possible_overlap_with: "authentication"`) en lugar de dejar que el usuario lo descubra después. Esto queda como mejora de UX a definir, no bloqueante para el primer pass.

---

## 6. BRIEF UX/UI DEL CONDUCTOR

**Esta sección está escrita para una sesión especializada en diseño UX/UI. Contiene todo el contexto necesario para diseñar la interfaz del Conductor sin requerir lectura del BTIPS completo.**

### 6.1 Qué es el Conductor y cuál es su trabajo único

El **Conductor** (Bloom Conductor, también llamado Sovereign Intent Interface) es la terminal de gobernanza estratégica del ecosistema. Es una aplicación Electron standalone — no es el plugin de VS Code. Su trabajo:

> Permitir que el Master de la organización formule objetivos estratégicos, los convierta en Mandates firmados (estándar o genesis), y observe su ejecución en tiempo real.

El Conductor es stateless: no acumula estado en memoria. Al abrirse, reconstruye su realidad escaneando `.bloom/` en el filesystem. **Implicación de UX:** la interfaz siempre refleja lo que está en disco, nunca una vista en memoria que puede divergir.

### 6.2 El usuario del Conductor

**Perfil primario: el Master** — autoridad para crear y firmar Mandates. Puede ser el tech lead o fundador técnico. No necesariamente escribe código todos los días, pero entiende la arquitectura. Necesita ver el estado de todos los Mandates activos de un vistazo, crear Mandates sin fricciones técnicas, tomar decisiones cuando una Action requiere intervención humana, y confiar en que lo que ve es lo que realmente está corriendo.

**Perfil secundario: el Architect** — puede observar Mandates e interactuar con Intents de coordinación (`cor`), pero no puede crear Mandates. Su vista es principalmente de observabilidad.

### 6.3 Las cuatro zonas del Conductor

El Conductor tiene cuatro zonas funcionales con responsabilidades distintas. El diseño UX/UI debe respetar estas fronteras — mezclarlas degrada la claridad cognitiva del usuario.

---

#### ZONA 1 — Mandate Studio
**Propósito:** crear, definir y enviar Mandates a firma (tanto estándar como genesis).

**Para Mandates estándar — qué debe permitir hacer:**
- Nombrar el Mandate con un objetivo en lenguaje natural
- Declarar las Actions en secuencia (descripción, tipo de intent, proyecto destino, criterio de éxito opcional)
- Reordenar Actions por drag-and-drop antes de firmar
- Previsualizar el `mandate.json` que se va a enviar a Nucleus
- Enviar a firma (acción irreversible)

**Para Mandates Genesis — qué debe permitir hacer:**
- Nombrar el proyecto
- Seleccionar el `--source` (path local o URL de repositorio)
- Iniciar el proceso — el Studio muestra el progreso de las Fases 1 y 2 en tiempo real (via eventos Sentinel)
- Presentar la pantalla de validación de dominios cuando Brain emita `GENESIS_DOMAINS_PROPOSED`
- Confirmar los dominios (acción que dispara la firma diferida)

**Pantalla de validación de dominios (genesis y domain_expansion):**
Esta es la pantalla más crítica del Studio para el caso genesis. Muestra el `domain_proposal.json` resultante del clustering. Las cuatro operaciones que debe permitir:
- **Renombrar** un dominio propuesto
- **Fusionar** dos dominios en uno
- **Mover archivos** de un dominio a otro
- **Confirmar** la topología (dispara `GENESIS_DOMAINS_CONFIRMED`)

Para `domain_expansion`, el copy debe dejar explícito que se están validando dominios **nuevos**, no la totalidad del proyecto.

**Restricciones de diseño del Studio:**
- Una vez enviado a firma, el formulario pasa a solo lectura. No hay "editar después de enviar".
- El Studio debe hacer evidente que crear un Mandate es una acción de peso — no un shortcut de un click.
- El Studio toma el foco completo (no es un modal flotante). La pantalla de validación de dominios tampoco coexiste visualmente con el Monitor.

---

#### ZONA 2 — Mandate Monitor
**Propósito:** observar el estado de todos los Mandates activos y el progreso de sus Actions.

**Qué debe mostrar:**
- Lista de Mandates activos con estado (`active`, `paused`, `completed`, `cancelled`, `building` para genesis)
- Para cada Mandate activo: qué Action está en curso y su progreso estimado
- Mandates genesis en fase de ingestión/clustering: progreso de la fase actual
- Mandates que requieren intervención humana (resaltados, con label de texto: "Requiere tu decisión")
- Historial de Mandates completados (colapsado por defecto)

**Estructura de información por Mandate:**

```
[Mandate: "Estabilizar autenticación"]  estado: active
────────────────────────────────────────────────────────
Action 1 ✓  Explorar módulos sin uso         [exp] completado
Action 2 →  Eliminar módulos identificados   [dev] en progreso — Intent #47 corriendo
Action 3 ·  Actualizar documentación         [doc] pendiente
────────────────────────────────────────────────────────
Iniciado: hace 2h    Núcleo: elias-repos    Firmado por: Master
[Pausar]  [Ver detalle]
```

```
[Genesis: "my-project"]  estado: building · Fase: análisis de dominios
────────────────────────────────────────────────────────
⟳ Brain analizando clustering semántico...   5 dominios propuestos
────────────────────────────────────────────────────────
[Ver propuesta de dominios]
```

**Granularidad correcta:** el Monitor muestra estado semántico ("Action 2 en progreso"), no logs de pipeline. Los logs de Brain van al Event Bus Feed (Zona 3).

**Interacciones disponibles desde el Monitor:**
- Pausar / Reanudar un Mandate activo
- Ver el detalle completo de un Mandate
- Aprobar / rechazar una Action que requiere decisión humana
- Cancelar un Mandate (con confirmación explícita — es irreversible)
- Para genesis en `building`: ir a la pantalla de validación de dominios si están listos

**Vacío inteligente:** si no hay Mandates activos, el Monitor muestra "No hay Mandates activos. ¿Querés crear uno?" — con acción directa al Studio.

---

#### ZONA 3 — Event Bus Feed
**Propósito:** observar el flujo de eventos del sistema en tiempo real.

Zona técnica, dirigida principalmente al Architect y al Master cuando necesita debugging. No debe dominar la pantalla principal.

**Qué muestra:** eventos del WebSocket en tiempo real (estándar y genesis), filtros por tipo de evento / por Mandate / por proyecto, timestamps y sequence numbers, posibilidad de pausar el feed sin perder eventos (buffer).

**Nota de diseño:** el Event Bus Feed es observabilidad, no control. No hay acciones en este panel. Esta separación es importante: mezclar "qué está pasando" con "qué puedo hacer" genera confusión de affordance.

---

#### ZONA 4 — Project Browser
**Propósito:** visualizar la jerarquía de proyectos del Nucleus y su estado. Panel de contexto — el usuario lo usa para orientarse, no para realizar acciones.

**No debe permitir:** crear proyectos, crear intents directamente, editar configuración de proyectos.

**Sí debe permitir:** filtrar el Monitor por proyecto, ver el estado de salud de cada proyecto.

---

### 6.4 Organización de la pantalla principal — wireframe conceptual

```
┌─────────────────────────────────────────────────────────────────────┐
│  CONDUCTOR — Bloom Sovereign Intent Interface                        │
│  ─────────────────────────────────────────────────────────────────  │
│  [🏛 Mandates] [📊 Projects] [⚡ Events]          Nucleus: elias ▼  │
├──────────────────┬──────────────────────────────────────────────────┤
│                  │                                                   │
│  PROJECT         │         MANDATE MONITOR                          │
│  BROWSER         │  ─────────────────────────────────────────────── │
│                  │  [+ Definir Mandate]  [+ Genesis de proyecto]    │
│  ● project-a     │                                                   │
│  ● project-b     │  ┌──────────────────────────────────────────┐    │
│  ● plugin-vscode │  │ 🔵 Estabilizar autenticación    [active] │    │
│                  │  │   Action 1 ✓  Action 2 → ...             │    │
│  Nucleus         │  │   [Pausar] [Ver detalle]                  │    │
│  elias-repos     │  └──────────────────────────────────────────┘    │
│  3 proyectos     │                                                   │
│  2 mandates      │  ┌──────────────────────────────────────────┐    │
│                  │  │ ⟳ Genesis: my-project       [building]   │    │
│                  │  │   Fase: análisis · 5 dominios propuestos  │    │
│                  │  │   [Ver propuesta de dominios]             │    │
│                  │  └──────────────────────────────────────────┘    │
│                  │                                                   │
│                  │  Completados (3)  ▸                              │
├──────────────────┴──────────────────────────────────────────────────┤
│  EVENT BUS                                     [filtrar] [pausar]   │
│  14:23:01 mandate:action:started {id: "47", action: 2, type: "dev"} │
│  14:22:58 genesis:domains:proposed {mandateId: "genesis-...", n: 5} │
│  14:22:50 genesis:ingest:complete {mandateId: "genesis-..."}        │
└─────────────────────────────────────────────────────────────────────┘
```

El Event Bus Feed ocupa el tercio inferior y puede colapsarse. El Project Browser es un panel lateral colapsable. El Mandate Monitor es el área principal.

### 6.5 Flujo de creación de un Mandate estándar — UX detallada

**Paso 1 — Trigger:** click en "+ Definir Mandate". El Studio toma el foco completo.

**Paso 2 — Objetivo:** campo grande, prominente: "¿Qué querés lograr?" en lenguaje natural. Sin campos técnicos todavía.

**Paso 3 — Descomposición en Actions:** el sistema puede sugerir una descomposición (si hay integración con IA) o el usuario la construye manualmente. Cada Action: descripción breve, tipo de intent, proyecto destino.

**Paso 4 — Revisión:** pantalla de confirmación con el `mandate.json` en formato legible (no JSON crudo). Advertencia visible: "Al firmar, el contrato es inmutable. Las Actions no pueden modificarse después."

**Paso 5 — Firma:** botón único: "Enviar a Nucleus para firma". No se llama "Crear" ni "Guardar". El estado cambia a `pending_signature`.

**Paso 6 — Confirmación:** una vez firmado, el Studio muestra el Mandate con su ID, estado `active`, y link directo al Monitor. Sin confeti ni animaciones celebratorias — la firma de un contrato es un acto de peso.

### 6.6 Estados que requieren intervención humana — UX de decisión

Cuando una Action de tipo `cor` requiere una decisión humana, el Conductor debe:
- Resaltar el Mandate en el Monitor con indicador visual inequívoco + label de texto "Requiere tu decisión"
- Mostrar notificación del sistema operativo si el Conductor no está en primer plano
- En la vista de detalle, mostrar exactamente qué decisión se requiere con el contexto necesario
- Ofrecer las opciones disponibles de forma binaria o como selección — nunca campo de texto libre cuando hay opciones definidas

La pantalla de decisión no debe mezclarse con el Monitor general. Cuando hay una decisión pendiente, la vista de detalle del Mandate toma el foco.

### 6.7 Restricciones de diseño que vienen de la arquitectura

**El Mandate es inmutable post-firma.** No puede haber un botón "Editar Mandate" después de que Nucleus firmó. El diseño no debe esconder esto — debe hacerlo explícito en el flujo de creación.

**El Conductor es stateless.** Al cerrarse y reabrirse, reconstruye su estado desde el filesystem. No hay sesiones persistentes. El diseño no debe prometer persistencia de vistas o configuraciones que no estén en disco.

**Nucleus puede no estar disponible.** Si el Control Plane (puerto 48215) está desconectado, el Conductor puede leer el estado de los Mandates desde el filesystem, pero no puede firmar nuevos ni enviar comandos. El diseño debe tener un estado de "modo lectura" — no simplemente errores en cada acción.

**Solo el Master puede crear Mandates.** El botón "+ Definir Mandate" debe estar invisible o deshabilitado con explicación para roles Architect o Specialist — no simplemente deshabilitado sin contexto.

**El genesis en `building` no es un error.** El Monitor debe presentar este estado como progreso normal, no como un estado de advertencia. El indicador visual debe ser neutro (no amarillo/rojo) con información de la fase actual.

**El Event Bus Feed es observabilidad, no log de errores.** Lo que muestra son eventos de negocio (mandate iniciado, domains propuestos, intent completado), no traza de pipeline interna. El diseño del Feed no debe parecer una consola de terminal.

### 6.8 Eventos WebSocket que el Conductor consume

> ⚠️ SUPERADO por RESOLUCIÓN v1.1 (arriba): esta sección contradecía a §5.10 dentro del mismo documento (dos convenciones para el mismo receptor). Ninguna de las dos rige — contrato real en `ws-events.ts` (`mandate:genesis:*`, `mandate:action:*`).

El Conductor se conecta al WebSocket en `:4124`. Esta lista define qué transiciones de estado son automáticas en la UI.

**Eventos estándar:**

| Evento | Qué actualiza en el Conductor |
|---|---|
| `mandate:created` | Agrega el Mandate al Monitor |
| `mandate:signed` | Cambia estado de `pending_signature` a `active` |
| `mandate:action:started` | Actualiza qué Action está en curso |
| `mandate:action:completed` | Marca la Action como completada |
| `mandate:action:decision_required` | Resalta el Mandate con indicador de intervención |
| `mandate:action:failed` | Muestra el error en el detalle del Mandate |
| `mandate:paused` | Cambia estado a `paused` |
| `mandate:resumed` | Cambia estado a `active` |
| `mandate:completed` | Mueve el Mandate a completados |
| `mandate:cancelled` | Mueve el Mandate a cancelados |
| `intent:started` | Muestra el Intent en curso dentro de la Action |
| `intent:progress` | Actualiza barra de progreso de la Action |
| `intent:completed` | Marca el Intent como completado |
| `intent:failed` | Muestra error en la Action |

**Eventos del Genesis:**

| Evento | Qué actualiza en el Conductor |
|---|---|
| `genesis:initiated` | Agrega el genesis al Monitor en estado `building` |
| `genesis:ingest:started` | Muestra Fase 1 en progreso en el Monitor |
| `genesis:ingest:progress` | Actualiza barra de progreso de ingestión |
| `genesis:ingest:complete` | Actualiza Monitor: Fase 1 completada |
| `genesis:domains:proposed` | Activa el botón "Ver propuesta de dominios" en el Monitor |
| `genesis:scaffold:started` | Monitor: genesis pasó a `running`, mostrando dominios en proceso |
| `genesis:scaffold:domain:complete` | Actualiza el progreso del scaffold por dominio |
| `genesis:complete` | Mueve el genesis a completados, muestra resumen |
| `genesis:error` | Muestra error en el detalle del genesis con opción de resume |

**Nota:** estos eventos no existen aún en el sistema (confirmado: `ws-events.ts` está vacío). Deben definirse como tipos TypeScript antes de implementar el Conductor.

### 6.9 Vocabulario de interfaz — guía de copy

| Evitar | Usar en su lugar | Motivo |
|---|---|---|
| "Crear tarea" | "Definir Mandate" | Un Mandate no es una tarea |
| "Guardar" | "Enviar a firma" | El acto relevante es la firma |
| "Ejecutar" | "Iniciar workflow" | El Mandate inicia un Workflow de Temporal |
| "Error" (genérico) | "Action fallida — {motivo específico}" | Los errores siempre tienen contexto |
| "Listo" | "Mandate completado" | El estado tiene nombre propio |
| "¿Seguro?" | "Este contrato no puede modificarse después de la firma." | La advertencia es específica |
| "Nuevo" | "+ Definir Mandate" / "+ Genesis de proyecto" | La acción describe lo que se hace |
| "Analizando..." | "Brain analizando clustering semántico — Fase 2 de 4" | El genesis tiene fases con nombre |

**Tono general:** austero y técnico, pero no hostil. El Conductor habla a un Master que sabe lo que hace. Sí necesita que la interfaz le diga exactamente qué está pasando en cada momento.

---

## 7. INTEGRACIÓN CON EL PLUGIN VS CODE — LÍMITES EXPLÍCITOS

### 7.1 Qué construir en el plugin

**MandateTreeProvider** — tree provider en el Activity Bar que muestra:
- Mandates activos en el Nucleus del workspace actual (incluyendo genesis en `building`)
- Estado de cada Mandate
- Action en curso (nombre y tipo de intent)
- Para genesis: fase actual (`ingest`, `cluster`, `validate`)
- Indicador visual si hay una Action que requiere intervención

Este provider es de solo lectura.

**FileSystemWatcher sobre `.bloom/.nucleus-{org}/.mandates/`** — detecta cuando Mandates nuevos llegan (desde el Conductor) y actualiza el tree provider en tiempo real.

**Comando `bloom.openConductor`** — abre el Conductor con el contexto del workspace actual pre-cargado. Este es el único punto de entrada desde el plugin hacia la creación de Mandates.

### 7.2 Qué NO construir en el plugin

No debe existir:
- `MandateGenesisPanel.ts` (el Genesis vive en el Conductor)
- `bloom.createMandate` (el plugin no tiene autoridad para crear Mandates)
- Wizard multi-step de creación de Mandate
- Formulario de definición de Actions
- Pantalla de validación de dominios del genesis

El plugin puede tener un botón que abra el Conductor — no el Genesis ni el Studio en sí.

### 7.3 Fix urgente necesario antes de cualquier trabajo de Mandate

```typescript
// ACTUAL (roto):
'.bloom/core/nucleus-config.json'

// CORRECTO — la ruta real en producción (confirmado contra supervisor.go
// y org-resolver.ts, backend ya implementado — sin punto antes de
// "nucleus-config.json"):
'.bloom/.nucleus-{workspaceName}/.core/nucleus-config.json'
```

Sin este fix, el plugin no puede detectar ningún Nucleus y todo lo que depende de esa detección falla silenciosamente.

---

## 8. PATRONES DE CÓDIGO A SEGUIR

### 8.1 Schema de respuesta para operaciones de Mandate

```typescript
// Patrón base (ya existe en brain-schemas.ts):
export const BaseBrainResultSchema = z.object({
  status: BrainStatusSchema,  // 'success' | 'error' | 'not_authenticated' | 'not_nucleus'
  operation: z.string().optional(),
  message: z.string().optional(),
  error: z.string().optional()
});

// Nuevos schemas para Mandate:
export const MandateCreateResultSchema = BaseBrainResultSchema.extend({
  data: z.object({
    id: z.string(),
    path: z.string(),
    status: z.enum(['draft', 'pending_signature', 'active', 'building']),
    mandateType: z.enum(['standard', 'genesis', 'domain_expansion']),
    created_at: z.string()
  }).optional()
});

export const MandateStatusResultSchema = BaseBrainResultSchema.extend({
  data: z.object({
    id: z.string(),
    mandateType: z.enum(['standard', 'genesis', 'domain_expansion']),
    status: z.enum(['building', 'pending', 'running', 'paused', 'completed', 'failed', 'aborted']),
    current_action: z.number().optional(),
    actions_total: z.number().optional(),
    actions_completed: z.number().optional(),
    // Solo para genesis:
    genesisPhase: z.enum(['ingest', 'cluster', 'validate']).optional(),
    domainsProposed: z.number().optional(),
    domainsConfirmed: z.number().optional()
  }).optional()
});
```

### 8.2 Schema de ruta Fastify para mandates

```typescript
// mandate.schema.ts (nuevo, siguiendo el patrón de nucleus_schema.ts y project_schema.ts):
export const mandateSchemas = {
  create: {
    tags: ['mandate'],
    summary: 'Create and sign a new Mandate (standard, genesis, or domain_expansion)',
    body: {
      type: 'object',
      required: ['mandateType'],
      properties: {
        mandateType: { type: 'string', enum: ['standard', 'genesis', 'domain_expansion'] },
        // Para standard:
        objective: { type: 'string', minLength: 1 },
        nucleusPath: { type: 'string' },
        actions: {
          type: 'array',
          items: {
            type: 'object',
            required: ['description', 'intentType', 'projectPath'],
            properties: {
              description: { type: 'string' },
              intentType: { type: 'string', enum: ['exp', 'dev', 'doc', 'cor', 'gen'] },
              projectPath: { type: 'string' }
            }
          }
        },
        // Para genesis y domain_expansion:
        name: { type: 'string' },
        source: { type: 'string' },
        baseGenesisId: { type: 'string' }  // solo para domain_expansion
      }
    },
    response: { 201: { /* MandateCreateResultSchema shape */ } }
  } as FastifySchema,

  status: {
    tags: ['mandate'],
    summary: 'Get Mandate status',
    querystring: {
      type: 'object',
      required: ['id'],
      properties: { id: { type: 'string' } }
    },
    response: { 200: { /* MandateStatusResultSchema shape */ } }
  } as FastifySchema
};
```

### 8.3 Verificación de onboarding antes de operaciones de Mandate

El endpoint `GET /api/nucleus/onboarding-status` ya existe (confirmado en `nucleus_schema.ts`). Antes de permitir cualquier operación de Mandate, verificar que `github_auth: true` en los steps de onboarding. Si no es así, guiar al usuario a completar el onboarding primero.

---

## 9. PENDIENTES — AGENDA PARA PRÓXIMAS SESIONES

### 9.1 Bloqueantes de implementación

**Decisión crítica — ¿Un intent `.gen` o N intents `.gen`?** (ver §5.7): impacta la arquitectura de `waitIntentResult` y el MandateWorkflow. Debe resolverse antes de implementar la Fase 4.

**Extensión de `intentType` en el schema del Mandate:** agregar `gen` al enum `exp | cor | dev | doc` en el Mandate Domain Spec y en todas las validaciones existentes.

**Schema completo de `domain_proposal.json`:** necesario antes de implementar la Fase 2 y la pantalla de validación del Conductor.

**Contrato de observación de `waitIntentResult` para intents `.gen`:** ¿qué path/campo observa para saber que el scaffold de un dominio específico completó? Propuesta: campo `genes_created` en `gen_state.json`, actualizado por Brain después de cada scaffold.

**Diseño completo de la pantalla de validación de dominios en Conductor** (§6.3 Zona 1): las cuatro operaciones (renombrar, fusionar, mover, confirmar) necesitan diseño de UX detallado antes de que Sentinel pueda especificar el payload de `GENESIS_DOMAINS_CONFIRMED`.

**Definición de `ws-events.ts`:** todos los eventos WebSocket listados en §6.8 deben definirse como tipos TypeScript antes de implementar el Conductor.

**Fix en `NucleusManager.detectExistingNucleus()`** (§3.2): bloqueante para cualquier trabajo de Mandate en el plugin.
  - **Actualización RESOLUCIÓN v1.2:** el fix documentado en §3.2 tenía el
    nombre de archivo mal escrito (`.nucleus-config.json` con punto extra).
    La ruta correcta, confirmada contra código backend real, es
    `.core/nucleus-config.json` sin ese punto. Corregir el fix del plugin
    contra la ruta correcta, no contra la que estaba documentada acá
    originalmente.

### 9.2 Preguntas abiertas de arquitectura

**Sobre el Mandate Studio en el Conductor:**
- ¿El Studio integra IA para sugerir la descomposición en Actions, o es completamente manual en v1?
- ¿Hay un límite de Actions por Mandate? ¿Hay validación de coherencia antes de enviar a firma?

**Sobre la gestión de errores en ejecución:**
- Si una Action falla, ¿el Mandate completo se pausa automáticamente o solo esa Action?
- ¿Hay política de retry automático o siempre requiere intervención humana?
- ¿Cuántos retries se permiten antes de marcar una Action como `failed` permanentemente?

**Sobre el Marketplace:**
- ¿La v1 del Conductor incluye UI de publicación al marketplace, o solo consumo?
- ¿El formato de `mandate.json` ya es estable como contrato de intercambio entre organizaciones?

**Sobre el Conductor:**
- ¿El Conductor es una ventana única (single-window Electron) o multi-ventana?
- ¿Hay un sistema de design tokens existente que el Conductor deba respetar, o se define desde cero?
- ¿Las Synapse Pages (Discovery, Landing) comparten el design system del Conductor o son superficies independientes?
- ¿Qué pasa si Nucleus no está disponible (Control Plane desconectado) y hay un genesis en `building`? ¿El Conductor puede mostrar la propuesta de dominios desde el filesystem sin Nucleus activo?

**Sobre el caso de Jose (onboarding incompleto):**
- El Control Plane estaba `DISCONNECTED` en el relevamiento. ¿Hay modo degradado para el Conductor cuando Nucleus no está disponible en tiempo real?
- ¿El step `github_auth` incompleto bloquea la creación de Mandates o solo ciertas operaciones?

---

*Bloom Mandate — Arquitectura, Genesis y Conductor UX/UI · v2.0 · 2026-06-28*  
*Documento unificado. Consolida: bloom-mandate-architecture-uxui.md v1.0 + nucleus_mandate_create_genesis_spec_v1_1.md*  
*No modificar sin revisión arquitectónica.*
