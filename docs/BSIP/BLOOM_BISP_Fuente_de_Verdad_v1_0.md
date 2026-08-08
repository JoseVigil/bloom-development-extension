# BLOOM — BISP: Fuente de Verdad Consolidada

**Bloom Intent Semantic Package — Documento Único de Referencia**
**Versión:** 1.0 (consolidación) · **Estado:** Vigente
**Fecha de consolidación:** agosto 2026

---

## Nota de consolidación

Este documento **no introduce decisiones nuevas**. Es la fusión, en un único archivo navegable, de tres
documentos que hasta ahora vivían separados y que un mismo lector necesitaba cruzar constantemente:

| Documento fuente | Versión consolidada | Qué aporta a este documento |
|---|---|---|
| `BLOOM_BISP_Session_Decisions` | v1.2 | El protocolo BISP en sí: schema de `index.json`, persistencia, pipeline Brain–Ollama–ChromaDB, contratos de Synapse, invariantes de diseño. |
| `ING_Intent_Spec` | v1.1 | Especificación completa del intent `ing/` (Ingesta): el mecanismo por el cual el sistema incorpora material nuevo y siembra el linaje de Genes. |
| `DIS_Intent_Spec` | v1.0 | Especificación completa del intent `dis/` (Discovery): el mecanismo por el cual el sistema re-mapea la topología de Dominios a partir de Genes ya existentes. |

Ningún schema, invariante, pseudocódigo o tabla fue alterado en la fusión. Donde los documentos
originales se referenciaban entre sí cruzando archivos (por ejemplo, `ING_Intent_Spec` citando
`BLOOM_BISP_Session_Decisions §5.1`), esa referencia ahora apunta a una sección dentro de este mismo
documento. Las referencias cruzadas a documentos que siguen viviendo aparte (Companion, BTIPS, Mandate
Domain Spec, GAP V3 de Mandate Genesis en Go/Temporal) se conservan tal cual, sin intentar traerlas
adentro.

## Nota de alcance

**Este documento cubre:**
- El protocolo BISP como tal — agnóstico de qué intent o qué consumidor lo use (Parte A).
- Los dos tipos de intent que hoy implementan ese protocolo de punta a punta, con spec formal
  confirmada: `ing/` (Parte B) y `dis/` (Parte C).

**Este documento no cubre, porque viven en otro lugar por diseño:**
- La integración del Companion Cognitivo (panel lateral Chromium) — es un consumidor del protocolo, no
  parte de él. Vive en `BLOOM_BISP_Companion_Integration_v2_0.md`.
- Los tipos de intent `dev/`, `doc/`, `exp/`, `cor/`, `inf/` — su estado real de implementación y sus
  gaps se documentan en `BLOOM_Intent_Types_Gap_Analysis_v1_0.md`.
- El workflow Go/Temporal de Mandate Genesis fuera de lo ya cruzado contra código en la sección A.9.

---

# PARTE A — El Protocolo BISP

> Fuente: `BLOOM_BISP_Session_Decisions_v1_2` (heredera de v1.0 y v1.1). Válido y completo en cualquier
> etapa del proyecto, exista o no un consumidor activo, exista o no un intent type corriendo sobre él.

## A.1 Propósito

Este protocolo es la fuente de verdad de las decisiones arquitectónicas tomadas en sesión el 23 de mayo
de 2026, actualizadas el 29 de junio de 2026 y migradas a `ing/` en agosto de 2026. Guía la actualización
de BTIPS, BISP, Mandate Domain Spec, y la evaluación de compatibilidad de archivos Python existentes.

> **Regla heredada, sigue vigente:** cualquier decisión de implementación que contradiga lo documentado
> acá requiere revisión explícita de arquitectura. Este protocolo no se diluye con el avance de ejecución.

## A.2 Decisiones Arquitectónicas

### A.2.1 Infraestructura — ChromaDB y Ollama

| Decisión | Fundamento | Estado |
|---|---|---|
| ChromaDB embebido en Brain como librería Python, no como proceso separado | Brain ya es Python. Evita un binario adicional que Metamorph tendría que gestionar. Modelo idéntico a SQLite en Temporal. | TOMADA |
| Ollama como único generador de embeddings vía `/api/embed`, modelo `nomic-embed-text` | Ollama ya está en el sistema para Alfred. 768 dimensiones con excelente relación calidad/velocidad. | TOMADA |
| Brain es el único orquestador: Brain llama a Ollama, Brain llama a ChromaDB. Nunca al revés. | Punto de control único, auditable, reemplazable sin dependencias cruzadas ocultas. | TOMADA |
| Si Ollama no está disponible, el intent continúa sin vectorización (capa aditiva, no bloqueante) | La vectorización mejora el pipeline existente, no es requerimiento crítico. Degradación graceful obligatoria. | TOMADA |

### A.2.2 Persistencia — Dónde vive ChromaDB

| Decisión | Fundamento | Estado |
|---|---|---|
| Colecciones ChromaDB por proyecto, dentro del filesystem del proyecto | Autarquía local: el conocimiento vectorial viaja con el proyecto. | TOMADA |
| Cache global en `.nucleus-{org}/.cache/chroma/` para queries cross-project | El Nucleus necesita búsquedas semánticas a nivel organización. | TOMADA |
| Mandate consolidado en `.mandates/{id}/.semantic/` al cerrarse el Mandate | La unidad de valor del marketplace es el Mandate completo. | TOMADA |

### A.2.3 Package (BISP) — Schema de `index.json`

| Decisión | Fundamento | Estado |
|---|---|---|
| `index.json` tiene tres capas: `operational`, `autarchic`, `marketplace` | Tres audiencias distintas, cada capa procesable independientemente. | TOMADA |
| Campo `embedding_source_text` obligatorio junto a cada vector | Sin texto fuente el vector no es verificable ni regenerable. | TOMADA |
| El vector nunca viaja a la AI web | Los espacios vectoriales no son interoperables entre modelos. El valor se materializa antes de salir del runtime. | TOMADA |
| Nuevos campos en capa `autarchic`: `findings_summary`, `domain_tags`, `resolved`, `reusable_knowledge` | Habilitan consulta autárquica cross-runtime. Base del `semantic_descriptor` del Mandate. | TOMADA |
| Dos puntos de vectorización: `context_plan.json` (antes del payload) y `index.json` (después de la fase) | Ranking de relevancia antes de armar payload; registro del embedding para consultas futuras. | TOMADA |

### A.2.4 Mandate — Agregación semántica

| Decisión | Fundamento | Estado |
|---|---|---|
| El campo `marketplace` en `index.json` es `null` en intents individuales. Lo completa el Mandate al cerrarse. | El intent no sabe si pertenecerá a un Mandate de marketplace. | TOMADA |
| `mandate_workflow.json` exporta el Temporal workflow history al completarse el Mandate | Auditabilidad completa, verificable por el comprador sin depender del SQLite de Temporal del vendor. | TOMADA |

### A.2.5 Contrato de Synapse — CERRADO ✓

Se definen tres contratos genéricos según audiencia y modo de uso — describen qué hace *cualquier*
consumidor del package al recibirlo, sin asumir un consumidor particular:

| Contrato | Audiencia | Comportamiento |
|---|---|---|
| **A — Continuar** | AI web en flujo activo (Claude, ChatGPT, Grok) | El package llega como contexto de fondo. La AI continúa el flujo sin reconocer explícitamente la recepción. Enriquecimiento silencioso del prompt. |
| **B — Evaluar** | AI web en modo revisión | La AI recibe el package y emite una evaluación estructurada de consistencia con el BISP, solicitada explícitamente por el ingeniero. |
| **C — Decidir compatibilidad** | Marketplace / runtime Bloom externo | El runtime destino recibe el package con `semantic_descriptor` completo y decide compatibilidad. Requiere capa `marketplace` completa. |

Cualquier consumidor adicional (panel lateral, agente de monitoreo, etc.) debe declarar explícitamente a
cuál de estos tres contratos se acoge y documentar sus propias restricciones en su propio documento de
integración. Este protocolo no prescribe restricciones de ningún consumidor específico.

> El picker de Capa 1 en Core (`/genesis`, webview Svelte) y el futuro consumo de
> `findings_summary`/`domain_tags` por Fase 2 de Mandate Genesis son, en estos términos, consumidores que
> eventualmente deberán declararse bajo uno de estos tres contratos — probablemente **B**. Observación
> abierta, no decisión tomada (ver A.2.6).

### A.2.6 Pendientes sin resolver

| Decisión | Contexto | Estado |
|---|---|---|
| Formato de parsing de la URI `chroma://nucleus-org/intent-uuid/phase` | Convención interna; Brain necesita parsearla a `(collection_name, document_id)`. Sin estándar externo a adoptar. | PENDIENTE |
| Threshold de similitud configurable por intent (default sugerido: 0.40) | Intents de dominio muy específico pueden necesitar thresholds más altos. Configuración en `dev_state.json` o `nucleus-config.json`. | PENDIENTE |
| Formato de exportación de embeddings: binario vs JSON base64 | Binario más compacto, menos debuggeable. JSON base64 self-describing, compatible con gzip del package. | PENDIENTE |
| Contrato de Synapse aplicable a Fase 2 de Mandate Genesis | Ver A.2.5 — probablemente Contrato B, sin decisión formal. | PENDIENTE |

## A.3 Por qué agregar vectores al BISP

> **Tesis central:** los vectores no son para las AI web. Son para Bloom. La AI web consume el resultado
> del trabajo vectorial — texto ya ordenado, conflictos ya clasificados, contexto ya filtrado. El vector
> hace su trabajo antes de que el package salga del runtime.

**El problema que resuelven:** sin vectores, el sistema no puede responder preguntas semánticas a escala
— qué archivos son más relevantes para un intent nuevo, si ya se resolvió algo parecido antes, si un
conflicto en `.cor` es semánticamente grave o solo estructural, qué Mandate del marketplace resuelve mejor
un objetivo dado. Con vectores, Brain responde en milisegundos con precisión medible.

**Valor dentro del sistema:**
- *Ranking semántico del `context_plan`*: antes de armar el payload, Brain vectoriza el objetivo del
  intent y consulta ChromaDB contra el codebase/docbase disponible. Los archivos más relevantes van
  primero. En proyectos con 200+ archivos, la diferencia entre los 10 más relevantes y 10 aleatorios es la
  diferencia entre una respuesta precisa y una genérica.
- *Deduplicación de trabajo en Mandates*: al iniciar un Mandate, Brain lo compara contra Mandates ya
  completados en el Nucleus. Si supera el threshold, alerta al orquestador que el problema ya fue
  resuelto.
- *Clasificación semántica de conflictos en `.cor`*: Brain puede determinar si dos ramas en conflicto son
  semánticamente distintas o solo texto renombrado/reformateado.

**Valor en la autarquía entre núcleos Bloom:**
- *Autarquía local*: otra máquina con el mismo runtime puede reconstruir ChromaDB desde el vector
  embebido en `index.json`. `embedding_source_text` garantiza que el vector es verificable y regenerable
  aun si el modelo cambia de versión.
- *Autarquía semántica*: otro runtime puede entender qué resolvió un package sin ejecutarlo, usando
  `findings_summary` y `domain_tags` — búsqueda semántica cross-nucleus sin acceso al codebase original.

**Valor como moat del marketplace:** un Mandate comprado lleva adentro el conocimiento vectorizado de su
propia ejecución, estructurado en el filesystem BTIPS, con trazabilidad Temporal, dentro del runtime
Bloom. Sin el runtime completo, los archivos son texto inerte — la misma lógica que el marketplace de
assets de Unity dentro del engine.

## A.4 Schema del BISP — `index.json` con capas

```json
{
  "operational": {
    "intent_type": "dev",
    "objective": "Refactorizar módulo JWT para RS256",
    "payload_summary": "Contexto técnico ordenado semánticamente para consumo por AI web",
    "phase": "implementation"
  },
  "autarchic": {
    "findings_summary": "Se migró JWT de HS256 a RS256. Impacto en auth_controller y user_model.",
    "domain_tags": ["jwt", "rsa", "authentication", "security"],
    "resolved": true,
    "reusable_knowledge": true,
    "vector": {
      "model": "nomic-embed-text",
      "version": "1.5",
      "dimensions": 768,
      "embedding_ref": "chroma://nucleus-org/intent-uuid/implementation",
      "embedding_source_text": "Refactorizar módulo JWT para RS256, afecta auth_controller y user_model",
      "embedded_at": "2026-05-23T14:33:12Z"
    }
  },
  "marketplace": null
}
```

**Campo `marketplace` a nivel Mandate:**

```json
"marketplace": {
  "mandate_uuid": "mandate-auth-hardening-x7k2",
  "domain": "security/authentication",
  "value_proposition": "Migración completa JWT HS256→RS256 con zero downtime",
  "intent_count": 4,
  "knowledge_coverage": ["jwt", "rsa", "token_rotation", "backwards_compat"],
  "requires_runtime": "bloom/1.0"
}
```

## A.5 Flujo Operativo Brain–Ollama–ChromaDB

### A.5.1 Generación del `context_plan` (antes del payload)

```
Brain tiene: objetivo del intent (dev_state.json)
Brain tiene: lista de archivos disponibles en .files/

1. Brain → Ollama /api/embed: vectoriza el objetivo
   Ollama → Brain: [vector_objetivo — 768 floats]

2. Brain → ChromaDB: almacena vector_objetivo
   key: intent_uuid/phase/objective

3. Para cada archivo en .files/:
   Brain → Ollama /api/embed: vectoriza el archivo
   Brain → ChromaDB: almacena con key intent_uuid/phase/file/{nombre}

4. Brain → ChromaDB.query(vector_objetivo, n_results=10, threshold=0.40)
   ChromaDB → Brain: [(archivo_1, 0.94), (archivo_2, 0.87), ...]

5. Brain escribe context_plan.json con ese ranking
6. Brain arma payload.json con los archivos en ese orden

La AI web recibe texto ordenado semánticamente. Nunca ve el vector.
```

### A.5.2 Registro en `index.json` (después de la fase)

```
Brain acaba de ejecutar la fase y tiene el payload completo

1. Brain → Ollama /api/embed: vectoriza el payload completo
   Ollama → Brain: [vector_payload — 768 floats]

2. Brain → ChromaDB: almacena con key intent_uuid/phase
   metadata: { intent_type, phase, objective, timestamp }

3. Brain actualiza index.json:
   vector.embedding_ref         = "chroma://nucleus-org/intent_uuid/phase"
   vector.embedding_source_text = texto_que_fue_vectorizado
   vector.embedded_at           = timestamp
```

### A.5.3 Deduplicación de Mandates (query cross-intent)

```
Brain inicia un nuevo Mandate con objetivo X

1. Brain → Ollama /api/embed: vectoriza objetivo X
2. Brain → ChromaDB (colección nucleus global).query(vector_X, n=5, threshold=0.85)
3. Si hay resultados:
   Brain recupera los findings_summary de esos intents
   Brain alerta al orquestador: "Problema similar resuelto en mandate-Y"
   Orquestador decide si reutilizar o ejecutar nuevo Mandate
4. Si no hay resultados:
   Brain continúa el Mandate normalmente
```

## A.6 Impacto en Archivos Existentes (protocolo genérico)

| Archivo / Componente | Estado | Acción requerida |
|---|---|---|
| BTIPS v5.0 (doc) | Actualizar | Agregar sección de capa vectorial, documentar los tres contratos de Synapse, actualizar schema de `index.json`. |
| BISP v1.1 (doc) | Actualizar | Agregar campos: `embedding_source_text`, `findings_summary`, `domain_tags`, `resolved`, `reusable_knowledge`. Formalizar las tres capas. |
| Mandate Domain Spec | Extender | Agregar etapa de consolidación semántica al cierre del Mandate. Documentar `mandate_workflow.json` y `.semantic/`. |
| `chroma_client.py` (NUEVO) | Implementar | `PersistentClient`, `get_or_create_collection`, `add`, `query`. Sin lógica de negocio. |
| `vectorize.py` (NUEVO) | Implementar | Llama a Ollama `/api/embed`, devuelve vector. Manejo graceful si Ollama no está disponible. |
| `chroma_rebuild.py` (NUEVO) | Implementar | Lee `index.json`, extrae `embedding_source_text`, regenera vector, reconstruye la colección local. |
| `semantic_query.py` (NUEVO) | Implementar | Expone `query_similar(text, collection, n, threshold)` para el ranking del `context_plan`. |
| Archivos Python viejos (packages gzip) | Auditar | Evaluar compatibilidad con el pipeline vectorial. |

> Los archivos de consumidores específicos del BISP (Companion, workflow Go de Mandate Genesis) no
> figuran en esta tabla — su impacto se documenta en sus propios documentos de integración y en A.9.

## A.7 Invariantes de Diseño (protocolo)

Estas propiedades no pueden ser violadas por ninguna decisión de implementación posterior sin revisión
explícita de arquitectura.

**Invariante 1 — Texto fuente siempre presente**
Todo vector en el package va acompañado de: modelo exacto, versión, dimensiones, y el texto original que
lo generó. Sin estos cuatro campos, el vector no es parte del BISP.

**Invariante 2 — Brain como único orquestador**
Brain llama a Ollama, Brain llama a ChromaDB. Ningún otro componente tiene acceso directo a ChromaDB.
Ningún componente llama a Ollama excepto Brain.

**Invariante 3 — La capa vectorial es aditiva**
Un intent sin vectorizar es un intent válido. Si Ollama no está disponible, el pipeline continúa sin
vectorización y lo documenta en el `index.json`.

**Invariante 4 — El marketplace es responsabilidad del Mandate**
El campo `marketplace` en `index.json` es `null` en intents individuales. Es el Mandate quien agrega,
consolida y firma el `semantic_descriptor` del package de marketplace.

**Invariante 5 — Separación de audiencias en el package**
`operational` es para AI web (texto). `autarchic` es para runtime Bloom (texto + vector). `marketplace`
es para buyers del marketplace (metadata estructurada). Nunca se mezclan ni se usan fuera de su
audiencia.

## A.8 Estructura de directorios de referencia (protocolo)

```
.bloom/
├── .nucleus-{org}/
│   ├── .cache/
│   │   └── chroma/              ← colección global cross-project
│   └── .mandates/
│       └── {mandate-id}/
│           ├── mandate_workflow.json
│           └── .semantic/       ← consolidación semántica del Mandate
└── .project-{name}/
    └── {intent-uuid}/
        ├── index.json           ← tres capas: operational, autarchic, marketplace
        ├── context_plan.json    ← ranking semántico de archivos
        ├── payload.json
        └── dev_state.json
```

## A.9 Integración con Mandate Genesis (Go/Temporal) — estado real verificado contra código

Esta sección documenta el estado real de un consumidor en potencia del protocolo — el workflow Go de
Mandate Genesis — sin modificar el protocolo en sí.

**Confirmado por código:**
- **Fase 1 (ingest)** del `MandateGenesisBuildWorkflow`: hoy es una sola `PublishMandateEventActivity`
  que emite `mandate:phase:ingest`. **No llama a Brain, no llama a Ollama, no toca ChromaDB.**
- **Fase 2 (cluster)**: hoy es `ScaffoldDomainActivity` con `Mode: dry_run` — devuelve siempre un único
  dominio (`input.Project`), sin clustering real ni consulta a ChromaDB. El cliente TCP:5678 mencionado
  en documentación previa **no existe en el código**.
- **`GenesisBuildInput`** (Temporal): campos reales son `MandateID`, `MandateType`, `BaseGenesisID`,
  `Source`, `Project`, `MandatesRoot`. **No incluye `RawDocs`** — si Fase 1 llega a implementar A.5.1, no
  puede asumir que los archivos le llegan empaquetados en el input de Temporal; tiene que leerlos del
  filesystem en `{MandatesRoot}/{MandateID}`.
- **`runGenIntentActivity`**: no existe en el código.

**Lo que esto significa para la Invariante 2:** sigue siendo el diseño correcto y no cambia. Lo que
cambia es la honestidad sobre el estado actual — Mandate Genesis Fase 1/2 todavía no ejerce esa
invariante porque todavía no llama a nadie. No hay violación de arquitectura; hay una feature no
implementada.

**Pendientes antes de conectar ambos sistemas:**
1. Cómo Fase 1 (Go) invoca a Brain — mecanismo de invocación cross-proceso sin definir (¿HTTP interno
   contra `localhost:48215`, como ya usa `publishMandateEvent()`? ¿otro canal?).
2. Relación entre `{MandatesRoot}/{MandateID}/domain_proposal.json` (layout plano, Go) y
   `.bloom/.project-{name}/{intent-uuid}/index.json` (A.8) — namespaces distintos hoy, sin puente
   definido.
3. Contrato de Synapse aplicable a Fase 2 (ver A.2.5) — cuando se convierta en un Intent BISP procesado
   por IA generativa vía Synapse, tiene que declararse bajo Contrato A, B o C. Hoy no está declarado.

---

# PARTE B — Intent `ing/` (Ingesta)

> Fuente: `ING_Intent_Spec_v1_1`. Sexto tipo de intent del sistema, sumado a `dev`, `doc`, `exp`, `inf`,
> `cor`. Precede en el flujo típico a `dis/` (Parte C).

## B.0 Función y reglas de contrato

`ing/` incorpora archivos raw o de código nuevos al ecosistema — tanto en el arranque de un proyecto
(Mandate Génesis) como en cualquier incorporación posterior (nuevo subsistema, repo, módulo) — y siembra
el linaje de los Genes resultantes. **La curación de la topología de Dominios es responsabilidad de
`dis/`, no de `ing/`** (ver Parte C).

Reglas de diseño fijadas como contrato:

1. `ing/` sigue el mismo principio BSIP que `dev`/`doc`: fases de trabajo humano-gobernado +
   `.pipeline/` espejo por fase. El número de fases es propio de cada tipo (`ing/` define tres, ver B.2).
   No introduce una fase estructural ajena como `.scaffold/`.
2. `ing/` **siempre** corre bajo un Mandate. No existe modo standalone.
3. **Dominio no es un nivel jerárquico, ni una carpeta persistida, ni un campo del Gene.** Es una relación
   N:M entre Dominio y Gene, resuelta por clustering vectorial y persistida exclusivamente en
   `.cache/.semantic-index.json` a nivel Nucleus. `gen.json` no tiene ni necesita campo de dominio.
4. La resolución Raw → Dominio → Gene ocurre en dos pasadas dentro de `.classification/`: primero
   Dominio (coarse, Nucleus-wide), después Gene (fine, acotado al dominio ya resuelto). El resultado es
   la **primera arista** del Gene en `.semantic-index.json` — no un campo del Gene.
5. La vectorización es aditiva y aislada del contrato BSIP — se invoca desde Brain dentro de cada fase,
   siguiendo el mismo mecanismo `context_plan → payload` / `index.json` post-fase de A.5.1/A.5.2. No es
   una fase ni un payload que dialoga con la AI web.
6. La capa vectorial nunca es bloqueante (Invariante 3): si Ollama no está disponible, `ing/` degrada a
   resolución manual en `.consolidation/` (ver B.6).
7. **`ing/` nunca reestructura Dominios ya existentes.** No fusiona, no divide, no renombra, no agrega
   una segunda arista a un Gene que ya tenía Dominio. Toda reestructuración es competencia exclusiva de
   `dis/`.

> **Nota histórica (rationale del cambio `gen/` → `ing/`):** se abandonó una propuesta original de intent
> `gen/` porque no respetaba la gramática BSIP (introducía una cuarta fase ajena, `.scaffold/` por
> dominio) y colisionaba semánticamente con el concepto de "gene". `ing/` fue diseñado desde cero con sus
> propias tres fases, dejando la vectorización como capa aditiva aislada, y resolviendo Raw→Dominio→Gene
> con un embudo de dos pasadas que no requiere niveles jerárquicos nuevos. Además, `ing/` no es exclusivo
> de Mandate Génesis: el campo `domain_baseline` (`empty` para génesis, `existing` para incorporación
> posterior) lo convierte en mecanismo genérico y reutilizable para anexar cualquier subsistema en
> cualquier momento, con trazabilidad vía `parent_mandates` y `.history/.delta_N`.

## B.1 Estructura de `.ing_state.json`

```json
{
  "intent_id": "uuid",
  "intent_type": "ing",
  "mandate_id": "uuid",

  "phase_active": "reception | classification | consolidation | done",
  "resumable": true,

  "domain_baseline": "empty | existing",
  "baseline_scope": [],

  "thresholds": {
    "domain": 0.45,
    "gene": 0.40
  },

  "classification_summary": {
    "clusters_total": 0,
    "domains_matched": 0,
    "domains_created": 0,
    "genes_extended": 0,
    "genes_created": 0,
    "unresolved_no_vectorization": 0
  },

  "created_at": "ISO-8601",
  "updated_at": "ISO-8601"
}
```

**Notas de campos:**
- `domain_baseline`: `"empty"` únicamente en Mandate Génesis puro (no hay genes previos contra qué
  comparar). `"existing"` en cualquier Mandate de incorporación, sin importar el resultado.
- `baseline_scope`: `mandate_id`s contra los que se acota la Pasada 1. Vacío = Nucleus-wide (default).
- `thresholds`: calibrables por Mandate. **Pendientes de validación empírica** — 0.40 (gene) reusa el
  default de A.2.6; 0.45 (dominio) es punto de partida propio de este spec.
- `classification_summary.unresolved_no_vectorization`: clusters diferidos a decisión manual (ver B.6).

## B.2 Estructura de directorios de `ing/`

```
.intents/
└── .ing/
    └── .{intent-name-uuid}/
        ├── .ing_state.json
        │
        ├── .reception/                  ← sin turnos, igual que .briefing/ (dev) y .context/ (doc)
        │   ├── .reception.json
        │   ├── .context_ing_plan.json
        │   └── .files/
        │       ├── .rawbase.json
        │       ├── .rawbase_index.json
        │       └── [optional files]
        │
        ├── .classification/             ← con turnos, igual que .execution/+.refinement/ (dev)
        │   └── .turn_X/
        │       ├── .turn.json
        │       ├── .context_ing_plan.json
        │       └── .files/
        │           ├── .domain_resolution.json
        │           └── [optional files]
        │
        ├── .consolidation/              ← con turnos, igual que .curation/ (doc)
        │   └── .turn_X/
        │       ├── .consolidation.json
        │       ├── .context_ing_plan.json
        │       └── .files/
        │           ├── .docbase.json
        │           ├── .docbase_index.json
        │           └── [optional: .codebase.json, .codebase_index.json]
        │
        └── .pipeline/                   ← contrato BISP idéntico, por fase
            ├── .reception/
            │   ├── .payload.json
            │   ├── .index.json
            │   └── .response/
            │       ├── .raw_output.txt
            │       ├── .report.json
            │       └── .staging/
            ├── .classification/
            │   └── .turn_X/{.payload.json, .index.json, .response/}
            └── .consolidation/
                └── .turn_X/{.payload.json, .index.json, .response/}
```

## B.3 Fase `.reception/`

**Propósito:** apertura — recibe el raw entrante, lo inventaría y extrae texto, listo para
`.classification/`. Sin turnos: un único acto de recepción, igual que `.briefing/` en `dev` o `.context/`
en `doc`. Si algo llega mal formado, se reintenta la fase desde cero — la iteración humana entra recién
en `.consolidation/`.

**`.reception.json`:**
```json
{
  "requested_by": "action_id dentro del Mandate que disparó este intent",
  "objective": "texto libre: qué se está incorporando y por qué",
  "source": "upload_directo | repo_clone | filesystem_scan",
  "files_received": 0,
  "received_at": "ISO-8601"
}
```

**`.files/.rawbase.json` — inventario BSIP-compatible:**
```json
{
  "files": [
    {
      "path": "raw/invoice_schema.pdf",
      "type": "pdf",
      "hash": "sha256:...",
      "size_bytes": 0,
      "status": "received | rejected_duplicate | rejected_invalid"
    }
  ]
}
```

**`.files/.rawbase_index.json` — texto extraído:**
```json
{
  "entries": [
    {
      "path": "raw/invoice_schema.pdf",
      "extracted_text": "...",
      "extraction_method": "pdf_text | ocr | plain_read",
      "embedding_source_text": "texto (o resumen) que se vectorizará — Invariante 1 BISP"
    }
  ]
}
```
`embedding_source_text` es obligatorio por archivo si ese archivo va a vectorizarse en
`.classification/` — aplicación directa de la Invariante 1 (A.7).

**`.context_ing_plan.json`:** reusa sin modificaciones el mecanismo de A.5.1. Brain vectoriza el
objetivo (`.reception.json.objective`) y cada entrada de `.rawbase_index.json`, consulta ChromaDB y
ordena por relevancia. Lo único que cambia respecto a `dev`/`doc` es *qué* se rankea (raw entrante en
vez de codebase/docbase existente) — el mecanismo Ollama→ChromaDB→ranking es el mismo.

**Salida que consume `.classification/`:** la lista de `.rawbase.json` filtrada a `status: "received"`,
en el orden de `.context_ing_plan.json`.

## B.4 Fase `.classification/`

**Propósito:** resuelve, por cada cluster de archivos raw recibidos, la relación Raw → Dominio → Gene
mediante el embudo de dos pasadas: primero Dominio (Nucleus-wide), después Gene (acotado al dominio ya
resuelto). Con turnos: si el humano no acuerda con el clustering o naming propuesto, se abre
`.turn_{X+1}/`, igual que en `.refinement/` de `dev`.

**Acotación de alcance:** esta fase resuelve una asignación **local** para el material que acaba de
entrar — compara contra centroides ya existentes al momento de la corrida, nunca reconsidera Dominios ya
consolidados por corridas anteriores entre sí. Si un Gene en cuestión ya fuera cross-domain por una
corrida previa de `dis/`, esta fase no lo sabe ni le importa — solo agrega o extiende **una** arista, la
que le corresponde a este lote. Cualquier reestructuración es responsabilidad exclusiva de `dis/`.

**Algoritmo** (pseudocódigo del runner, ejecutado por Brain en cada `.turn_X/`):

```
function classification_phase(ing_state, raw_files):
    baseline         = ing_state.domain_baseline          # "empty" | "existing"
    domain_threshold = ing_state.thresholds.domain
    gene_threshold   = ing_state.thresholds.gene

    raw_embeddings = vectorize(raw_files)                 # Brain -> Ollama, capa aislada
    clusters       = semantic_cluster(raw_embeddings)     # agrupa el raw entrante entre sí

    resolution = []

    for cluster in clusters:
        centroid = centroid(cluster.embeddings)

        # ---------- PASADA 1: Dominio ----------
        if baseline == "empty":
            domain_result = { status: "new", name: propose_domain_name(cluster) }
        else:
            candidates = query_domain_centroids(
                scope     = ing_state.baseline_scope,     # [] = nucleus-wide
                vector    = centroid,
                threshold = domain_threshold
            )
            if candidates.best_score >= domain_threshold:
                domain_result = { status: "existing",
                                   domain_id: candidates.best.domain_id,
                                   name: candidates.best.name,
                                   score: candidates.best_score }
            else:
                domain_result = { status: "new", name: propose_domain_name(cluster) }

        # ---------- PASADA 2: Gene (solo si el dominio ya existía) ----------
        if domain_result.status == "existing":
            gene_candidates = query_genes_in_domain(
                domain_id = domain_result.domain_id,
                vector    = centroid,
                threshold = gene_threshold
            )
            if gene_candidates.best_score >= gene_threshold:
                gene_result = { status: "extend",
                                 gene_id: gene_candidates.best.id,
                                 score: gene_candidates.best_score }
            else:
                gene_result = { status: "new" }
        else:
            gene_result = { status: "new" }   # dominio nuevo -> no hay contra qué comparar

        resolution.append({
            cluster_id: cluster.id,
            files:      cluster.files,
            domain:     domain_result,
            gene:       gene_result
        })

    write(".classification/.turn_X/.files/.domain_resolution.json", resolution)
    update(ing_state.classification_summary, resolution)
    return resolution
```

La Pasada 1 resuelve y transporta `domain_id` (la clave estable en `.semantic-index.json`, ver B.7.3),
no solo `name`. El `name` viaja para que el turno de `.consolidation/` sea legible por un humano, pero
la escritura efectiva usa `domain_id`.

**Nota de implementación abierta, no bloqueante:** el pseudocódigo vectoriza y clusteriza a nivel
`cluster.centroid` para ambas pasadas. Es razonable evaluar si la Pasada 2 debería recalcular a
granularidad de archivo individual en clusters heterogéneos grandes — afecta precisión, no la forma del
contrato.

`.domain_resolution.json` sigue el mismo patrón que `.codebase.json`/`.docbase.json` en `dev`/`doc` — no
requiere carpeta nueva. Es la **propuesta**; la confirmación humana ocurre en `.consolidation/`.

## B.5 Fase `.consolidation/`

**Propósito:** cierre — con turnos, igual que `.refinement/` en `dev` o `.curation/` en `doc`. El humano
revisa la propuesta de `.domain_resolution.json`, la aprueba, ajusta o rechaza; solo cuando el turno
cierra confirmado, Brain escribe los cambios irreversibles en `.genes/` y en
`.cache/.semantic-index.json`.

**`.consolidation.json`:**
```json
{
  "turn": "N",
  "reviewed_resolution": [
    {
      "cluster_id": "...",
      "domain": { "status": "existing | new", "domain_id": "dom_auth_a1b2", "name": "auth", "score": 0.52 },
      "gene":   { "status": "extend | new", "gene_id": "..." },
      "human_decision": "approved | overridden | rejected",
      "override_reason": null
    }
  ],
  "committed": false,
  "turn_closed_at": null
}
```

**Efecto de `committed: true`:** por cada entrada con `human_decision: "approved"` u `"overridden"`:
- si `gene.status == "extend"` → escribe `.genes/{gene_id}/.history/.delta_N/` (B.7.2)
- si `gene.status == "new"` → crea `.genes/{new_gene_id}/gen.json` (B.7.1)
- en ambos casos → siembra o extiende **exactamente una arista** en `.cache/.semantic-index.json` (B.7.3):
  - `domain.status == "new"` → crea entrada de Dominio (`domain_id` nuevo, `dom_{slug}_{hex4}`) con
    `genes: [gene_id]`
  - `domain.status == "existing"` → agrega `gene_id` al `genes[]` del `domain_id` ya resuelto, **solo si
    no está ya presente** (idempotencia ante reintentos)
- escribe `.files/.docbase.json` (y `.codebase.json` si el raw incluía código) para un `dev`/`doc` futuro.

**Límite explícito:** este efecto nunca agrega una segunda arista a un `gene_id` que ya tuviera alguna,
nunca quita una arista existente, nunca toca el `genes[]` de un `domain_id` distinto al resuelto en esta
misma corrida, y nunca modifica `name` de un Dominio existente. Cualquier necesidad de esas operaciones
se resuelve con una corrida de `dis/`.

Entradas `"rejected"` no producen efecto — el archivo queda fuera del sistema, disponible para futura
ingesta si se reconsidera. Si `committed: false`, se abre `.turn_{X+1}/` con la propuesta ajustada.

## B.6 Contrato `.pipeline/` y degradación graceful

**Mismo contrato BISP en las tres fases:** cada fase tiene `.pipeline/{fase}/` con `.payload.json`,
`.index.json` y `.response/` (`.raw_output.txt`, `.report.json`, `.staging/`) — sin excepciones. El
`.payload.json` se arma con el ranking de `.context_ing_plan.json` (A.5.1). El `.index.json` se escribe
al cerrar la fase con `vector.embedding_ref`, `vector.embedding_source_text`, `vector.embedded_at`
(A.5.2, Invariante 1), respetando las tres capas del schema general (A.2.3) — `marketplace` queda `null`
en el intent (Invariante 4).

**Degradación graceful si Ollama no está disponible (Invariante 3):**
- `.reception/`: continúa sin bloquearse. `.rawbase_index.json` se escribe igual (sin vector).
  `.context_ing_plan.json` cae a orden de llegada.
- `.classification/`: no puede ejecutar ninguna pasada sin vectores. Clusters afectados quedan marcados
  `status: "unresolved_no_vectorization"` y se difieren a `.consolidation/`, donde el humano asigna
  dominio y gene manualmente. El intent **no** se aborta.
- `.consolidation/`: no depende de vectorización para cerrar — su turno siempre puede cerrarse con
  decisiones humanas explícitas, con o sin vector de respaldo.

## B.7 Estructura de metadatos

### B.7.1 `gen.json`
```json
{
  "gene_id": "uuid",
  "mandate_id": "uuid",
  "name": "session-management",
  "semantic_function": "gestiona creación y validación de sesiones",
  "embedding_ref": "chroma://nucleus/genes/{gene_id}",
  "created_by_intent": "ing-intent-uuid",
  "scope_files": ["src/auth/session.py", "src/auth/tokens.py"],
  "created_at": "ISO-8601"
}
```
Sin campo `"domain"`. El Gene es linaje puro — identidad, función semántica, archivos, Mandate de
origen. La pertenencia a Dominios vive exclusivamente en `.semantic-index.json` (B.7.3), como relación
N:M gestionada por `ing/` (siembra inicial) y `dis/` (reestructuración).

### B.7.2 `.history/.delta_N/delta.json`
```json
{
  "delta_index": "N",
  "intent_id": "ing-intent-uuid",
  "mandate_id": "mandate-de-incorporacion-uuid",
  "change_type": "files_added | files_removed | files_modified",
  "files_delta": {
    "added":    ["src/auth/mfa.py"],
    "removed":  [],
    "modified": []
  },
  "similarity_score": 0.42,
  "timestamp": "ISO-8601"
}
```
`snapshot.json` (mismo `.delta_N/`) conserva el estado completo del scope del gene en ese punto, con
hashes.

### B.7.3 `.cache/.semantic-index.json`
```json
{
  "updated_at": "ISO-8601",
  "domains": {
    "dom_auth_a1b2": {
      "name": "auth",
      "domain_centroid_ref": "chroma://nucleus/domains/dom_auth_a1b2",
      "genes": ["gene-uuid-1", "gene-uuid-2"],
      "mandates": ["mandate-genesis-uuid"],
      "first_created_by": "ing-intent-uuid-0",
      "last_updated": "ISO-8601"
    }
  }
}
```

- La clave del mapa es un `domain_id` estable, formato `dom_{slug}_{hex4}`, generado una vez y **nunca
  reutilizado** — ni siquiera si ese Dominio deja de existir por fusión o split ejecutados por `dis/`
  (C.7.3). Un ID derivado de un campo mutable rompe trazabilidad ante un rename.
- `name` es el único campo mutable — un rename (operación exclusiva de `dis/`) solo toca este campo.
- `genes[]` es la única fuente de verdad de la relación N:M Domain↔Gene. Un `gene_id` puede aparecer en
  más de un `domain_id` (Gene cross-domain) — situación que `ing/` nunca produce por sí mismo, pero que
  `dis/` sí puede producir, y que `ing/.classification` debe tolerar sin error si la encuentra (ignora
  las aristas adicionales que no le correspondan).
- `mandates[]` es acumulativo: preserva trazabilidad completa de qué Mandates tocaron cada dominio.

## B.8 Matriz de casos de prueba / transición

| Caso | `domain_baseline` | Resultado Pasada 1 | ¿Corre Pasada 2? | Resultado Pasada 2 | Efecto en `.genes/` | Efecto en `.semantic-index.json` |
|---|---|---|---|---|---|---|
| **Génesis** | `empty` | siempre `new` | No | N/A | Crea gene(s) nuevo(s) bajo el Mandate Génesis, sin `parent_mandates` | Crea entrada de dominio nueva, `mandates: [genesis_id]`, `genes: [gene_id(s)]` |
| **Incorporación — Dominio existente + Gene existente** | `existing` | `existing` (score ≥ threshold) | Sí | `extend` (score ≥ threshold) | Escribe `.delta_N` sobre el gene existente | Actualiza `last_updated`; agrega Mandate a `mandates[]` si no estaba |
| **Incorporación — Dominio existente + Gene nuevo** | `existing` | `existing` | Sí | `new` (score < threshold) | Crea gene nuevo bajo el Mandate de incorporación | Agrega el nuevo `gene_id` al `genes[]` del `domain_id` resuelto |
| **Incorporación — Dominio nuevo + Genes nuevos** | `existing` | `new` (score < threshold en todos) | No | N/A | Crea dominio + N genes nuevos | Crea entrada de dominio nueva, `mandates: [incorporación_id]` |
| **Sin vectorización disponible** | `empty` o `existing` | No se ejecuta | No | N/A | Sin efecto hasta `.consolidation/` | Cluster marcado `unresolved_no_vectorization`, resuelto a mano |

**Invariante que valida la matriz:** dominio nuevo implica, por definición, genes nuevos — no existe
combinación "dominio nuevo + gene existente". La degradación graceful no agrega una quinta rama: es el
mismo árbol resuelto manualmente en vez de por vector.

**Nota de alcance:** esta matriz describe únicamente lo que `ing/` puede producir. La combinación "gene
existente + dominio adicional" (cross-domain) existe en el sistema pero nunca la produce `ing/` — es
competencia exclusiva de `dis/` (Parte C).

## B.9 Pendientes explícitos de `ing/`

- Calibración empírica de `domain_threshold` (0.45) y `gene_threshold` (0.40, heredado de A.2.6, también
  pendiente ahí) contra corpus real.
- Definición de `propose_domain_name(cluster)` — heurística o prompt a AI para nombrar un dominio nuevo.
  Pendiente compartido con `dis/` (`create_domain`, C.9) — resolver una sola vez, no duplicar diseño.
- Granularidad de vectorización en Pasada 2 (centroide de cluster vs. archivo individual) para clusters
  heterogéneos grandes.
- Formato de parsing de la URI `chroma://...` — depende de que se resuelva el pendiente equivalente en
  A.2.6. `ing/` no debería definir un formato propio y paralelo.

---

# PARTE C — Intent `dis/` (Discovery)

> Fuente: `DIS_Intent_Spec_v1_0`. Séptimo tipo de intent del sistema, sumado a `dev`, `doc`, `exp`,
> `inf`, `cor`, `ing`.

## C.0 Rationale — por qué existe y por qué no es parte de `ing/`

Durante el diseño de `ing/` se asumió que la resolución Raw → Dominio → Gene, corrida por lotes en
`.classification/`, era suficiente para mantener consistente la topología de Dominios. Esa asunción
resultó incompleta por una razón estructural: `ing/.classification` resuelve **localmente** — compara el
lote que acaba de entrar contra centroides ya existentes, y solo puede *sumar*. Nunca reconsidera lo ya
consolidado por lotes anteriores.

Esto genera dos escenarios concretos:

1. **Mandate Génesis con múltiples corridas de `ing/`.** Con `domain_baseline: empty`, cada corrida solo
   compara contra Dominios creados por corridas anteriores *dentro del mismo Nucleus*. Es esperable que
   dos lotes ingeridos en momentos distintos, sin verse entre sí, terminen creando dos Dominios que en
   realidad son el mismo territorio mal cortado.
2. **Genes cross-domain.** Un Gene puede legítimamente pertenecer a más de un Dominio. Detectar esa
   segunda pertenencia requiere comparar Genes y Dominios *entre sí* — una mirada retrospectiva y global
   que `ing/` no puede producir desde su diseño local-incremental.

`dis/` corre **después** de una o más corridas de `ing/` — a demanda o periódicamente — con la vista
completa: no asimila material crudo, no toca `.rawbase`, no crea Genes. Su universo es exclusivamente el
conjunto de Genes ya existentes y el grafo de Dominios en `.cache/.semantic-index.json`. Su única salida
es un grafo de Dominios corregido: altas/bajas de la relación Domain↔Gene, fusiones, splits, renombres.

**Reglas de diseño fijadas como contrato:**

1. `dis/` sigue el mismo principio BSIP que `dev`/`doc`/`ing`: fases + `.pipeline/` espejo, con el
   contrato `.payload.json` + `.index.json` + `.response/` **idéntico** al resto, sin variantes.
2. `dis/` **siempre** corre bajo un Mandate, nunca "suelto" — mismo principio que `ing/`.
3. `dis/` **nunca** escribe en `.mandates/{id}/.genes/{gene_id}/gen.json`. El linaje de un Gene es
   inmutable desde su perspectiva. `dis/` escribe exclusivamente en `.cache/.semantic-index.json`.
4. `dis/` **nunca** crea Genes. Si detecta que un Gene debería dividirse, eso es un hallazgo a reportar
   — no una operación que ejecute por sí mismo (ver C.9, pendiente explícito).
5. Las decisiones estructurales (crear/fusionar/dividir/renombrar Dominio, alta/baja de arista) se
   proponen en `.mapping/` y el humano las aprueba, rechaza o edita directamente. No hay estados
   intermedios, tombstones ni herencias. Un `domain_id` usado y luego absorbido por merge o reemplazado
   por split **nunca se reasigna** (C.7.3).
6. La vectorización es aditiva y aislada del contrato BISP, mismo mecanismo que `ing/` (Invariante 3).
   Si no está disponible, `dis/` degrada a resolución manual en `.mapping/` (ver C.6).

`dis/` no es exclusivo de Mandate Génesis: es el mecanismo genérico y reutilizable para curar la
topología de Dominios en cualquier momento de la vida de un proyecto, con la misma trazabilidad y
gobierno humano que el resto de los intents.

## C.1 Estructura de `.dis_state.json`

```json
{
  "intent_id": "uuid",
  "intent_type": "dis",
  "mandate_id": "uuid",

  "phase_active": "discovery | mapping | ratification | done",
  "resumable": true,

  "scope": {
    "mode": "nucleus_wide | mandate_scoped",
    "mandate_ids": []
  },

  "thresholds": {
    "domain_centroid_similarity": 0.45
  },

  "mapping_summary": {
    "domains_created": 0,
    "domains_merged": 0,
    "domains_split": 0,
    "domains_renamed": 0,
    "edges_added": 0,
    "edges_removed": 0,
    "genes_cross_domain": 0,
    "unresolved_no_vectorization": 0
  },

  "created_at": "ISO-8601",
  "updated_at": "ISO-8601"
}
```

**Notas de campos:**
- `scope.mode`: `"nucleus_wide"` (default) analiza todos los Genes del Nucleus disponibles.
  `"mandate_scoped"` acota el análisis a los Genes de los `mandate_ids` listados.
- `thresholds.domain_centroid_similarity`: mismo mecanismo de threshold que `ing/` (A.2.6), aplicado
  centroide-contra-centroide en vez de raw-contra-centroide. Sin calibración empírica, igual que `ing/`.
- `mapping_summary.genes_cross_domain`: contador informativo — cuántos Genes terminan con 2+ aristas de
  Dominio. Útil para reportes de salud del sistema a nivel Nucleus.

## C.2 Estructura de directorios de `dis/`

```
.intents/
└── .dis/
    └── .{intent-name-uuid}/
        ├── .dis_state.json
        │
        ├── .discovery/                  ← sin turnos, igual que .reception/ (ing) y .context/ (doc)
        │   ├── .discovery.json
        │   ├── .context_dis_plan.json
        │   └── .files/
        │       ├── .genebase.json                ← snapshot de todos los Genes del scope (sin domain)
        │       ├── .genebase_index.json
        │       ├── .domain_graph_snapshot.json    ← copia de .semantic-index.json al arrancar
        │       └── [optional files]
        │
        ├── .mapping/                    ← con turnos, igual que .classification/ (ing)
        │   └── .turn_X/
        │       ├── .turn.json
        │       ├── .context_dis_plan.json
        │       └── .files/
        │           ├── .mapping_proposal.json
        │           └── [optional files]
        │
        ├── .ratification/               ← con turnos, cierre — aplica el mapa final
        │   └── .turn_X/
        │       └── [contrato análogo a .consolidation/ de ing]
        │
        └── .pipeline/                   ← contrato BISP idéntico, por fase
            ├── .discovery/{.payload.json, .index.json, .response/}
            ├── .mapping/.turn_X/{.payload.json, .index.json, .response/}
            └── .ratification/.turn_X/{.payload.json, .index.json, .response/}
```

## C.3 Fase `.discovery/`

Sin turnos, igual que `.reception/` de `ing/` o `.context/` de `doc/`. Genera `.genebase.json` (snapshot
de todos los Genes del scope, sin campo `domain` — ver C.7.1) y `.domain_graph_snapshot.json` (copia
congelada de `.semantic-index.json` al momento de arrancar, usada luego en C.5 para calcular el diff de
la corrida). Los candidatos de fusión pueden surgir tanto de similitud de centroide como de **evidencia
de Genes cross-domain** ya presente en el grafo (esta segunda fuente no depende de vectorización — ver
C.6).

## C.4 Fase `.mapping/`

Con turnos, igual que `.classification/` de `ing/`. El humano revisa `.mapping_proposal.json` y aprueba,
rechaza o edita directamente cada operación (`create_domain`, `rename_domain`, `add_edge`, `remove_edge`,
`merge_domains`, `split_domains`) sobre el `.turn.json`. No hay sub-schema de `override` separado — el
humano escribe el estado final directamente sobre la propuesta, y `human_decision: "overridden"` es solo
la marca de que ese contenido fue editado, no generado por Brain.

Si `committed: false`, se abre `.turn_{X+1}/` con la propuesta ajustada — mismo patrón que un turno de
`.refinement/` en `dev` o de `.classification/` en `ing/` que no cierra en la primera vuelta.

## C.5 Fase `.ratification/`

Con turnos, `committed: false → true`. Al cerrar con `committed: true`, Brain aplica sobre
`.cache/.semantic-index.json` el mapa final tal como quedó escrito en el último turno de `.mapping/` —
sin recalcular, sin revalidar, sin herencias. Por cada `operation` con `human_decision` en
`approved`/`overridden`:

| `type` | Efecto en `.semantic-index.json` |
|---|---|
| `create_domain` | Nueva entrada, `domain_id` generado (`dom_{slug}_{hex4}`, C.7.3), `genes[]` con los IDs indicados |
| `rename_domain` | Solo cambia `name`. La clave (`domain_id`) nunca se mueve |
| `add_edge` / `remove_edge` | Alta/baja de `gene_id` en `genes[]` del `domain_id` indicado |
| `merge_domains` | Se crea (o reusa, si `target_domain_id` fue indicado en el override) una entrada con la unión de todos los `genes[]` de los `source_domain_ids`. Los `source_domain_ids` dejan de existir como entradas activas |
| `split_domains` | El `source_domain_id` deja de existir como entrada activa. Se crean los `targets[]` como entradas nuevas, cada una con su subconjunto de `genes[]` |

Operaciones `"rejected"` no producen efecto. `.domain_graph_delta.json` registra, a modo de resumen de la
corrida (no de log transaccional), el `diff` entre `.domain_graph_snapshot.json` (C.3) y el estado final
aplicado — insumo directo para que un `doc/` posterior sepa qué cambió sin recorrer los turnos completos
de `.mapping/`.

## C.6 Contrato `.pipeline/` y degradación graceful

**Mismo contrato BISP en las tres fases, sin excepción:** idéntico al de `ing/`, `dev/` y `doc/` — sin
variantes por tratarse de un intent nuevo. `.payload.json` se arma con el ranking de
`.context_dis_plan.json` (A.5.1). `.index.json` se escribe al cerrar la fase con `vector.embedding_ref`,
`vector.embedding_source_text`, `vector.embedded_at` (A.5.2, Invariante 1). No hay payload ni formato
propio de `dis/` que se aparte de este contrato.

**Degradación graceful si Ollama no está disponible (Invariante 3):**
- `.discovery/`: continúa sin bloquearse. `.genebase_index.json` se escribe sin vector.
  `.context_dis_plan.json` no trae candidatos de fusión por similitud de centroide — pero **sí** puede
  seguir trayendo candidatos por evidencia de Genes cross-domain, que no dependen de vectorización.
- `.mapping/`: sin vectores, los turnos arrancan sin propuestas de `merge_domains` por similitud — el
  humano puede seguir proponiendo manualmente cualquier operación sin restricción, porque ninguna
  operación de `.mapping/` depende de tener un score de similitud para ejecutarse.
- `.ratification/`: no depende de vectorización para cerrar, igual que en `ing/`.

## C.7 Estructura de metadatos

### C.7.1 `.genebase.json` (salida de `.discovery/`)
```json
{
  "genes": [
    {
      "gene_id": "uuid",
      "mandate_id": "uuid",
      "semantic_function": "gestiona creación y validación de sesiones",
      "scope_files": ["src/auth/session.py", "src/auth/tokens.py"],
      "created_by_intent": "ing-intent-uuid",
      "created_at": "ISO-8601"
    }
  ]
}
```
Sin campo `domain` — el linaje del Gene (B.7.1) nunca lo tuvo ni lo necesita.

### C.7.2 `.cache/.semantic-index.json` (única fuente de verdad de Domain↔Gene)
```json
{
  "updated_at": "ISO-8601",
  "domains": {
    "dom_billing_x1y2": {
      "name": "billing",
      "domain_centroid_ref": "chroma://nucleus/domains/dom_billing_x1y2",
      "genes": ["gene-uuid-1", "gene-uuid-9"],
      "mandates": ["mandate-genesis-uuid", "mandate-billing-v2-uuid"],
      "first_created_by": "ing-intent-uuid-0",
      "last_updated": "ISO-8601"
    }
  }
}
```
- `domain_id` (clave): `dom_{slug}_{hex4}`, generado una vez, inmutable, nunca reutilizado aunque el
  Dominio deje de existir por merge o split (C.7.3).
- `name`: mutable. Renombrar solo toca este campo, nunca la clave.
- `genes[]`: única fuente de verdad de la relación N:M — un `gene_id` puede aparecer en más de un
  `domain_id` (cross-domain).
- `mandates[]`: acumulativo, igual que B.7.3.

### C.7.3 Regla de no-reuso de `domain_id`

Cuando un Dominio deja de tener entrada activa (absorbido por `merge_domains`, reemplazado por
`split_domains`), su `domain_id` se retira del mapa y **el generador de IDs nunca vuelve a entregarlo**.
No hay tombstone, no hay campo `status`, no hay redirección automática — solo la garantía de que una
referencia vieja a ese `domain_id` (por ejemplo, desde un `doc/` generado antes del merge) en el peor
caso queda apuntando a algo que ya no está, pero **nunca** a algo que ahora significa otra cosa. Una
referencia desactualizada se resuelve la próxima vez que corra un `doc/`; una referencia que cambió de
significado en silencio es un bug de integridad que este diseño evita de raíz.

## C.8 Matriz de casos de prueba / transición

| Caso | Operación | Precondición | Efecto en `.semantic-index.json` |
|---|---|---|---|
| **Primer Dominio de un cluster sin match** | `create_domain` | Ningún Dominio existente supera el threshold contra el cluster propuesto | Nueva entrada, `domain_id` nuevo, `genes[]` con los IDs del cluster |
| **Gene ya asignado gana una segunda pertenencia** | `add_edge` | El Gene ya tiene arista hacia un Dominio distinto | Se agrega el `gene_id` al `genes[]` del nuevo Dominio, sin tocar la arista existente — Gene queda cross-domain |
| **Corrección de una asignación equivocada de `ing/`** | `remove_edge` + `add_edge` | El humano determina que la siembra local de `ing/` erró el Dominio | Baja del `genes[]` viejo, alta en el correcto |
| **Dos Dominios resultan ser el mismo territorio** | `merge_domains` | Similitud de centroide alta y/o Genes cross-domain compartidos | `source_domain_ids` dejan de tener entrada activa; entrada resultante con la unión de `genes[]` |
| **Un Dominio creció y mezcla dos áreas distintas** | `split_domains` | El humano identifica subconjuntos de `genes[]` con funciones distintas | `source_domain_id` deja de tener entrada activa; se crean los `targets[]` con sus subconjuntos |
| **Sin vectorización disponible** | Cualquiera | Ollama caído | `.discovery/` no trae candidatos por similitud, pero sí por evidencia cross-domain; `.mapping/` sigue operable con propuestas manuales |

## C.9 Pendientes explícitos de `dis/`

- Calibración empírica de `domain_centroid_similarity` (0.45, heredado del punto de partida de `ing/`
  sin medición) contra corpus real.
- Qué hace `dis/` cuando detecta que un **Gene individual** debería dividirse en dos unidades
  funcionales distintas — fijado explícitamente que `dis/` no crea ni divide Genes, solo reporta el
  hallazgo. Falta definir el formato de ese hallazgo y qué intent lo consume (¿un `ing/` de
  re-clasificación puntual? ¿un nuevo tipo de operación?).
- Comportamiento ante concurrencia: qué pasa si `.cache/.semantic-index.json` es tocado por otra corrida
  de `ing/` o `dis/` mientras una corrida de `dis/` está en `.mapping/` con el
  `.domain_graph_snapshot.json` ya congelado. Fuera de alcance de v1.0 — se asume ejecución serializada
  a nivel Nucleus hasta que se defina un mecanismo de lock.
- Definición de `propose_domain_name(cluster)` para `create_domain` — mismo pendiente ya abierto en B.9,
  no se duplica el diseño.
- Formato de parsing de la URI `chroma://...` — depende del mismo pendiente abierto en A.2.6 y en B.9.
  `dis/` no define un formato propio y paralelo.

---

# Apéndice — Invariantes y pendientes consolidados

## Invariantes de diseño (no violables sin revisión explícita de arquitectura)

1. **Texto fuente siempre presente** (A.7) — todo vector va acompañado de modelo, versión, dimensiones y
   texto fuente.
2. **Brain como único orquestador** (A.7) — solo Brain llama a Ollama y a ChromaDB.
3. **La capa vectorial es aditiva** (A.7) — un intent sin vectorizar es válido; degradación graceful
   obligatoria (aplicada en `ing/` B.6 y `dis/` C.6).
4. **El marketplace es responsabilidad del Mandate** (A.7) — `marketplace` es `null` en todo intent
   individual.
5. **Separación de audiencias en el package** (A.7) — `operational`/`autarchic`/`marketplace` nunca se
   mezclan.
6. **Dominio no es un nivel jerárquico ni un campo del Gene** (B.0, regla 3) — es una relación N:M
   persistida exclusivamente en `.cache/.semantic-index.json`.
7. **`ing/` nunca reestructura, `dis/` nunca crea Genes** (B.0 regla 7 / C.0 regla 4) — separación de
   responsabilidades entre siembra local y reestructuración global.
8. **No-reuso de `domain_id`** (B.7.3 / C.7.3) — un ID retirado por merge o split nunca se reasigna.

## Pendientes abiertos (ninguno resuelto en este documento)

| # | Pendiente | Origen | Bloquea a |
|---|---|---|---|
| 1 | Formato de parsing de URI `chroma://...` | A.2.6 | B.9, C.9 |
| 2 | Threshold de similitud default (0.40 gene / 0.45 dominio) sin calibración empírica | A.2.6, B.1, C.1 | Precisión de clustering en `ing/`/`dis/` |
| 3 | Formato de exportación de embeddings (binario vs JSON base64) | A.2.6 | — |
| 4 | Contrato de Synapse aplicable a Fase 2 de Mandate Genesis | A.2.5, A.2.6 | Integración Go/Temporal (A.9) |
| 5 | `propose_domain_name(cluster)` — heurística o prompt de naming | B.9, C.9 | `ing/.classification`, `dis/.mapping` |
| 6 | Granularidad de vectorización en Pasada 2 de `ing/` (centroide vs archivo) | B.9 | Precisión en clusters heterogéneos |
| 7 | Qué hace `dis/` ante un Gene que debería dividirse — formato de hallazgo, intent consumidor | C.9 | Evolución futura de `dis/` o `ing/` |
| 8 | Concurrencia sobre `.semantic-index.json` entre corridas simultáneas de `ing/`/`dis/` | C.9 | Ejecución no serializada a nivel Nucleus |
| 9 | Mecanismo de invocación cross-proceso Go→Brain para Mandate Genesis Fase 1/2 | A.9 | Conexión real del workflow Go al pipeline |
| 10 | Puente entre `domain_proposal.json` (Go, plano) y `.bloom/.project-{name}/{intent-uuid}/` (A.8) | A.9 | Fase 2 de Mandate Genesis apoyándose en `findings_summary`/`domain_tags` |

---

*BLOOM — BISP: Fuente de Verdad Consolidada · v1.0 · Agosto 2026*
*Consolida, sin alterar decisiones: `BLOOM_BISP_Session_Decisions_v1_2`, `ING_Intent_Spec_v1_1`,
`DIS_Intent_Spec_v1_0`. La integración de Companion y el estado de `dev`/`doc`/`exp`/`cor`/`inf` viven en
sus propios documentos y no se duplican acá.*
