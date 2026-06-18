# BLOOM — Genesis Intent `.gen` — Diseño v1.0

**Sesión de diseño arquitectónico · Junio 2026**
Fuente de verdad para la incorporación del intent `.gen` al pipeline BTIPS

---

> **Regla de este documento:** Cualquier decisión de implementación que contradiga lo documentado aquí requiere revisión explícita de arquitectura. Este documento no se diluye con el avance de ejecución.

---

## Fuentes de referencia

Este documento sintetiza decisiones tomadas en sesión a partir de los siguientes artefactos previos:

| Artefacto | Rol en esta sesión |
|---|---|
| `BTIPS_Bloom_Technical_Intent_Package_v5_0.md` | Protocolo base: tipos de intent existentes, arquitectura de Brain, pipeline BISP, mandates |
| `BLOOM_BISP_Session_Decisions_v1_0.md` | Fuente de verdad de la capa vectorial: ChromaDB, Ollama, schema de `index.json`, invariantes |
| `genesis_mandate_flow.svg` | Flujo visual del Genesis Mandate post-onboarding: desde subida de archivos hasta intents `.doc` |
| `bloom_project_tree.txt` | Árbol de filesystem base del proyecto, del cual se deriva la estructura `.gen/` |

---

## 1. Por qué existe el intent `.gen`

### 1.1 El problema que resuelve

El pipeline BTIPS en su versión anterior asume que cuando un intent `.dev` o `.doc` comienza, el proyecto ya tiene estructura: un codebase organizado, una docbase existente, dominios identificados y archivos en sus carpetas correctas. Esa suposición es válida para proyectos en curso, pero falla en el momento cero: cuando un usuario llega a Bloom con un directorio de archivos heterogéneos —código fuente, documentos sueltos, PDFs, planillas, notas— que representan un proyecto real pero sin la forma que el sistema espera.

Sin el intent `.gen`, hay dos opciones malas: pedirle al usuario que organice su proyecto antes de usar Bloom (fricción máxima, abandono seguro) o asumir una estructura que no existe y producir contextos vacíos o incoherentes (degradación silenciosa de calidad).

El intent `.gen` es el proceso de transformación del caos inicial al orden estructurado que el resto del pipeline requiere. Es el puente entre "el usuario tiene archivos" y "el sistema tiene dominios".

### 1.2 Posición en la jerarquía de intents

El BTIPS v5.0 define los siguientes tipos de intent existentes: `dev`, `doc`, `exp`, `inf`, `cor`. El intent `.gen` se agrega como un tipo nuevo con características propias:

| Propiedad | `.dev` | `.doc` | `.gen` |
|---|---|---|---|
| Asume estructura previa | Sí | Sí | No — la construye |
| Opera sobre | codebase + docbase existentes | docbase existente | archivos raw sin estructura |
| Produce | código modificado | documentación viva | genes + docbase inicial |
| Flujo | iterativo (refinement) | iterativo (curation) | unidireccional (fases) |
| Se ejecuta cuántas veces | N (por feature) | N (por área de docs) | Una vez por proyecto |
| Requiere validación humana intermedia | No | No | Sí — en la validación de dominios |

El intent `.gen` no reemplaza a ningún intent existente. Es el precursor que los habilita: sin el genesis ejecutado, un intent `.doc` no tiene docbase sobre qué trabajar, y los genes del Mandate Genesis no existen.

### 1.3 Relación con el Mandate Genesis

El intent `.gen` es el mecanismo de ejecución del **Mandate Genesis**. La jerarquía es:

```
Mandate Genesis
    └── N × Actions de tipo .gen
            └── N × genes (uno por dominio confirmado)
                    └── N × intents .doc futuros
```

El Mandate Genesis es el contrato firmado por Nucleus que declara la intención de estructurar el proyecto. Los intents `.gen` son las unidades ejecutables que materializan ese contrato. Los genes producidos son los ancestros de todos los genes que vendrán durante la vida del proyecto.

---

## 2. Contexto de entrada — ESTAMOS ACA

### 2.1 El punto de partida

El diseño de este documento parte del estado exacto en que se encuentra el sistema cuando el intent `.gen` comienza a ejecutarse:

```
.project-{name}/
└── .bloom/
    ├── .core/
    ├── .intents/
    │   ├── .dev/
    │   ├── .gen/
    │   │   └── .{intent-name-uuid3}/
    │   │       └── gen_state.json   ← ESTAMOS ACA
    │   └── .doc/
    └── .project/
```

**Qué ocurrió antes de este momento:**

El usuario completó el onboarding del sistema (GitHub OAuth, API key, cuenta en Nucleus). Tiene un proyecto existente — código fuente, documentos de diseño, planillas, notas en markdown, lo que sea — y lo entregó al sistema, ya sea como URL de repositorio que Brain clonó, como carpeta local que fue copiada, o como archivos subidos directamente. Ese material crudo llegó al sistema pero todavía no tiene forma: no hay dominios identificados, no hay genes creados, no hay docbase.

El Mandate Genesis fue creado y firmado por Nucleus. El primer intent `.gen` fue instanciado. El `gen_state.json` fue escrito. El genesis puede comenzar.

### 2.2 El problema central del genesis

El desafío de diseño más importante del intent `.gen` es el equilibrio entre autonomía y control. Hay dos errores simétricos que evitar:

**Error por exceso de autonomía:** Brain decide la estructura del proyecto sin consultar al usuario. El usuario descubre que su código de autenticación quedó en el dominio "Infraestructura" en lugar de "Seguridad", o que Brain fusionó en un solo dominio dos subsistemas que el usuario considera conceptualmente separados. Resultado: el usuario no confía en la estructura y tiene que reconstruirla manualmente.

**Error por exceso de fricción:** El sistema le pregunta al usuario que defina sus dominios desde cero antes de hacer cualquier análisis. El usuario tiene que pensar cuántos dominios tiene, cómo se llaman, qué archivos van en cada uno. Resultado: el usuario abandona el proceso antes de ver ningún valor.

La decisión de diseño tomada en sesión: **Brain propone agrupaciones, el usuario aprueba nombres**. Brain hace el trabajo cognitivo pesado (clustering semántico, propuesta de grupos, nombres provisorios). El usuario hace el trabajo de autoridad ligero (validar, renombrar, fusionar si necesario). El punto exacto de intervención humana es la pantalla de validación de dominios.

---

## 3. Estructura de archivos del intent `.gen`

El árbol completo de archivos está definido en `bloom_project_tree.txt` (adjunto por separado). Esta sección explica la lógica de cada capa.

### 3.1 Estructura general

```
.intents/.gen/{intent-name-uuid3}/
│
├── gen_state.json            ← estado activo del intent
├── .ingest/                  ← FASE 1
├── .analysis/                ← FASE 2 + 3
├── .scaffold/                ← FASE 4
│   └── .domain_{name}/       ← × N dominios confirmados
└── .pipeline/                ← estructura BISP
```

### 3.2 La decisión de nomenclatura de fases

Los intents `.dev` usan `.briefing/`, `.execution/`, `.refinement/` — estados de un trabajo iterativo que puede volver hacia atrás. El intent `.gen` usa `.ingest/`, `.analysis/`, `.scaffold/` — fases de un proceso de transformación **unidireccional**. Esta diferencia es intencional: el genesis no refina, transforma. No existe un `.ingest/turn_2/` porque la ingestión no se repite. Si los archivos cambian, se instancia un nuevo intent `.gen`.

### 3.3 Capa 1: `.ingest/`

**Responsabilidad:** Recepción e indexación de archivos raw.

```
.ingest/
├── ingest_manifest.json
├── ingest_index.json
└── .raw/
    └── [archivos originales del usuario — copia inmutable]
```

**`ingest_manifest.json`** — El inventario completo de lo que llegó: path relativo, tipo de archivo, hash SHA256, tamaño, estado de procesamiento (`pending` / `extracted` / `vectorized`). Es la fuente de verdad de qué materiales tiene el genesis disponibles. Brain actualiza el `status` de cada entrada a medida que avanza el procesamiento.

**`ingest_index.json`** — El texto extraído de cada archivo, listo para ser vectorizado por Ollama. Este archivo es la fuente exacta del campo `embedding_source_text` del BISP, de acuerdo con la Invariante 1 del BISP Session Decisions v1.0: *"Todo vector en el package va acompañado del texto original que lo generó."* Sin este archivo, la vectorización no es verificable ni regenerable.

**`.raw/`** — Copia inmutable de los archivos originales del usuario. Esta copia existe por dos razones: permite que el genesis sea idempotente (se puede volver a ejecutar sobre el mismo input si falla a mitad) y garantiza que el análisis siempre trabaja sobre el mismo material independientemente de cambios externos al proyecto.

La ingestión soporta todos los formatos que Brain puede extraer a texto: `.pdf`, `.md`, `.docx`, `.xlsx`, `.py`, `.ts`, `.json`, `.txt`, y cualquier formato de código fuente. Archivos que no pueden ser extraídos a texto son registrados en el `ingest_manifest.json` con `status: "unreadable"` y excluidos del análisis semántico.

### 3.4 Capa 2: `.analysis/`

**Responsabilidad:** Clustering semántico y validación de dominios por el usuario.

```
.analysis/
├── domain_proposal.json
├── domain_confirmed.json
└── chroma_refs.json
```

**`domain_proposal.json`** — El output de Brain después de vectorizar todos los archivos del `ingest_index.json` y ejecutar clustering semántico contra ChromaDB. Contiene N grupos con: los archivos que los componen, el score de cohesión semántica del grupo, un nombre provisorio generado por Brain, y una descripción de una línea de la función semántica detectada. El rango de grupos propuestos es de 2 a 7, con default adaptativo según el tamaño y varianza del corpus.

**`domain_confirmed.json`** — El resultado después de que el usuario valida la propuesta. Puede diferir del proposal en nombres (el usuario renombró), en composición (el usuario movió un archivo de un grupo a otro) o en cantidad (el usuario fusionó dos grupos). Este archivo es el que governa todo lo que viene después: `.scaffold/` se construye a partir de `domain_confirmed.json`, no de `domain_proposal.json`. Mientras este archivo no existe, el genesis no puede avanzar a la fase de scaffold.

**`chroma_refs.json`** — Las referencias a la colección ChromaDB del proyecto donde quedaron almacenados los vectores de los archivos. Usa el esquema de URI del BISP: `chroma://proj/gen/domain_N`. Este archivo permite que el genesis sea resumible: si el proceso falla después de la vectorización pero antes del scaffold, Brain puede leer las referencias y continuar sin re-vectorizar.

#### El punto de sincronización explícito

Entre `domain_proposal.json` y `domain_confirmed.json` existe el único punto de sincronización del genesis. Brain no puede continuar al scaffold hasta que el usuario confirme los dominios, porque los genes y la docbase se construyen sobre esa confirmación. Sin embargo, la vectorización previa a este punto es completamente asíncrona: Brain procesa en background, muestra progreso, y el usuario puede hacer otras cosas mientras tanto. El sistema espera antes de mostrar la propuesta de dominios, no antes de empezar a vectorizar.

### 3.5 Capa 3: `.scaffold/`

**Responsabilidad:** Construcción del gene y del semantic scaffold por dominio confirmado.

```
.scaffold/
└── .domain_{name}/        ← una carpeta por dominio (× N)
    ├── gen.json
    ├── gen_state.json
    ├── semantic_scaffold.json
    ├── context_gen_plan.json
    └── .files/
        ├── docbase.json
        ├── docbase_index.json
        └── [optional files]
```

Existe **una carpeta por dominio confirmado**, creada dinámicamente después de que `domain_confirmed.json` es escrito. El nombre de la carpeta es el nombre del dominio tal como fue confirmado por el usuario, normalizado a snake_case.

**`gen.json`** — La identidad del gene. Contiene el nombre del dominio, la función semántica declarada (tal como el usuario la confirmó o como Brain la describió), la lista de archivos asignados al dominio con sus hashes, el `mandate_id` del Mandate Genesis, y la fecha de creación. Es el documento de identidad inmutable del gene a partir de su creación.

**`gen_state.json` del gene** — Distinto del `gen_state.json` del intent (ver sección 4). Este archivo vive en la carpeta del dominio y representa el estado vivo del gene individual: hashes actuales de los archivos que le pertenecen, versión y modelo de embedding usados, estado del gene (`seeded` al crearlo, `live` después de su primer intent `.doc`). Es el archivo que permite detectar si los archivos de un dominio cambiaron y el gene necesita actualización.

**`semantic_scaffold.json`** — El artefacto primario producido por el intent `.gen`. Contiene el andamiaje cognitivo del dominio: los conceptos técnicos clave identificados en los archivos, las relaciones detectadas entre conceptos, las preguntas abiertas que no pudieron resolverse desde el material disponible, y una descripción de qué es este dominio y qué conocimiento contiene. Este archivo no es documentación final — es el punto de partida que los intents `.doc` futuros usarán para construir documentación real.

**`context_gen_plan.json`** — Análogo al `context_dev_plan.json` de los intents `.dev`, pero especializado para el genesis. Contiene el ranking semántico de los archivos del dominio ordenados por relevancia para el objetivo de scaffolding, el objetivo explícito del intent `.gen` para este dominio, y los parámetros de la consulta a ChromaDB que generó ese ranking. Este archivo es generado usando el mismo mecanismo de vectorización del BISP Session Decisions v1.0: Brain vectoriza el objetivo, consulta ChromaDB, y ordena los archivos por similitud semántica antes de armar el payload.

**`.files/docbase.json` y `docbase_index.json`** — La docbase inicial del dominio. Este es el output que conecta el genesis con el resto del pipeline: cuando un intent `.doc` futuro busca sobre qué trabajar para el dominio de autenticación, encuentra la docbase que el genesis creó. La docbase inicial no es documentación completa — es el andamiaje organizado del conocimiento existente en el proyecto, listo para ser expandido y enriquecido.

### 3.6 Capa 4: `.pipeline/`

**Responsabilidad:** Registro BISP de cada fase del genesis.

```
.pipeline/
├── .ingest/
│   ├── payload.json
│   ├── index.json
│   └── .response/
│       ├── raw_output.txt
│       ├── report.json
│       └── .staging/
├── .analysis/
│   ├── payload.json
│   ├── index.json
│   └── .response/
│       ├── raw_output.txt
│       ├── report.json
│       └── .staging/
└── .scaffold_{domain}/        ← una entrada por dominio confirmado
    ├── payload.json
    ├── index.json
    └── .response/
        ├── raw_output.txt
        ├── report.json
        └── .staging/
```

El pipeline del intent `.gen` sigue exactamente la misma estructura BISP que `.dev` y `.doc`: `payload.json` + `index.json` + `.response/`. Esta decisión es deliberada y sin excepciones: el genesis es un intent como cualquier otro desde la perspectiva del protocolo. Reutiliza el contrato `operational / autarchic / marketplace` sin modificaciones.

La diferencia con `.dev` es que las entradas del pipeline reflejan las **fases del genesis** en lugar de los estados del intents: `.ingest/`, `.analysis/`, `.scaffold_{domain}/`. Esto alinea el artefacto BISP con la fase real que lo generó y permite que Brain sepa exactamente qué payload corresponde a qué momento del proceso.

El campo `marketplace` en `index.json` es `null` en todos los intents `.gen`, igual que en el resto de intents individuales. Es el Mandate Genesis quien, al cerrarse, consolida el `semantic_descriptor` del marketplace, de acuerdo con la Invariante 4 del BISP Session Decisions v1.0.

---

## 4. El `gen_state.json` del intent

El `gen_state.json` del nivel del intent es el archivo más importante del genesis. Es lo primero que Brain lee cuando retoma un genesis interrumpido, y lo que Nucleus consulta para reportar el progreso del Mandate Genesis al usuario.

### 4.1 Schema

```json
{
  "intent_id": "genesis-{uuid3}",
  "intent_type": "gen",
  "mandate_id": "mandate-genesis-{uuid}",
  "project_name": "my-project",
  "created_at": "2026-06-18T10:00:00Z",
  "updated_at": "2026-06-18T10:43:00Z",

  "phase": "analysis",
  "phase_history": ["ingest", "analysis"],

  "ingest": {
    "status": "complete",
    "file_count": 42,
    "types_found": ["md", "pdf", "py", "xlsx"],
    "unreadable_count": 2,
    "ingest_manifest_ref": ".ingest/ingest_manifest.json",
    "vectorization_complete": true,
    "vectorization_completed_at": "2026-06-18T10:38:00Z"
  },

  "analysis": {
    "status": "pending_user_validation",
    "clusters_detected": 5,
    "domain_proposal_ref": ".analysis/domain_proposal.json",
    "domain_confirmed_ref": null,
    "chroma_refs": ".analysis/chroma_refs.json"
  },

  "scaffold": {
    "status": "not_started",
    "domains_total": null,
    "domains_scaffolded": 0,
    "genes_created": []
  },

  "flags": {
    "ollama_available": true,
    "chroma_ready": true,
    "user_source": "local_folder",
    "resumable": true,
    "sync_point_reached": false
  }
}
```

### 4.2 Campos críticos y su semántica

**`phase`** — El campo que Brain lee para saber dónde retomar. Los valores posibles son `ingest`, `analysis`, `scaffold`, `complete`. Brain nunca retrocede de fase; si hay un error en análisis, Brain no vuelve a ingestión salvo que el usuario lo indique explícitamente.

**`phase_history`** — El registro de todas las fases completadas. Permite auditar el progreso y detectar si alguna fase fue saltada en una ejecución anómala.

**`vectorization_complete`** en `ingest` — Flag crítico para el punto de sincronización. Brain no muestra la propuesta de dominios al usuario hasta que este flag está en `true`. La vectorización es asíncrona; este flag es lo que habilita la transición al análisis.

**`domain_confirmed_ref`** en `analysis` — Cuando este campo es `null`, el genesis está esperando validación del usuario. Cuando apunta a `domain_confirmed.json`, Brain puede avanzar al scaffold. Este `null` es el marcador explícito del punto de sincronización.

**`resumable: true`** — La invariante de diseño más importante del genesis. Si el proceso falla en cualquier punto, Brain puede releer este archivo y continuar desde donde estaba sin reprocesar lo que ya está hecho. La vectorización en ChromaDB persiste, los archivos en `.raw/` persisten, los JSONs escritos persisten. El genesis nunca empieza desde cero si fue interrumpido.

### 4.3 El `gen_state.json` del gene vs el del intent

Existe una distinción importante que debe quedar clara en la implementación:

| Archivo | Ubicación | Qué representa |
|---|---|---|
| `gen_state.json` del intent | `.gen/{uuid3}/gen_state.json` | Estado del proceso del genesis completo |
| `gen_state.json` del gene | `.gen/{uuid3}/.scaffold/.domain_{name}/gen_state.json` | Estado del gene individual de un dominio |

El `gen_state.json` del intent es un archivo de coordinación de proceso. El `gen_state.json` del gene es un archivo de estado vivo del conocimiento semántico de un dominio. Cuando el genesis termina, el `gen_state.json` del intent puede considerarse archivado. El `gen_state.json` de cada gene continúa siendo relevante durante toda la vida del proyecto, actualizándose cada vez que los archivos del dominio cambian.

---

## 5. Flujo de ejecución del pipeline

### 5.1 Visión de conjunto

```
FASE 1: ingest     →  FASE 2: cluster   →  FASE 3: validate   →  FASE 4: scaffold × N
(asíncrona)           (asíncrona)           (sync point)          (asíncrona)
Brain + Ollama        Brain + ChromaDB       usuario confirma       Brain × dominio
```

### 5.2 Fase 1 — Ingest

**Actor:** Brain  
**Input:** Archivos del usuario (URL de repo, carpeta local, archivos subidos)  
**Output:** `ingest_manifest.json`, `ingest_index.json`, `.raw/`

Brain comienza tan pronto el Mandate Genesis es firmado por Nucleus. El usuario no necesita estar presente. El proceso es:

1. Brain recibe la referencia al material del usuario (path local o URL de repositorio clonado)
2. Copia todos los archivos a `.raw/` y escribe el `ingest_manifest.json` inicial con `status: "pending"` para cada archivo
3. Para cada archivo, extrae texto según su tipo:
   - `.md`, `.txt`, `.py`, `.ts`, código fuente → extracción directa
   - `.pdf` → extracción de texto por página
   - `.docx` → extracción de párrafos
   - `.xlsx` → serialización de celdas a texto plano
   - Archivos binarios no reconocidos → `status: "unreadable"` en el manifest
4. Escribe el texto extraído de cada archivo en `ingest_index.json` con su hash y fuente
5. Actualiza `status: "extracted"` en el `ingest_manifest.json`
6. Invoca Ollama (`/api/embed`, modelo `nomic-embed-text`) para vectorizar cada entrada del `ingest_index.json`
7. Almacena vectores en ChromaDB bajo la colección del proyecto
8. Actualiza `status: "vectorized"` en el manifest y escribe `chroma_refs.json`
9. Actualiza `gen_state.json`: `vectorization_complete: true`

Si Ollama no está disponible, de acuerdo con la Invariante 3 del BISP Session Decisions v1.0, el intent continúa sin vectorización. En ese caso, Brain marca `ollama_available: false` en los flags del `gen_state.json` y avanza al clustering con métodos de similitud textual degradados. La capa semántica es aditiva, no bloqueante.

### 5.3 Fase 2 — Cluster

**Actor:** Brain  
**Input:** `chroma_refs.json` (o `ingest_index.json` si Ollama no disponible)  
**Output:** `domain_proposal.json`

Brain consulta ChromaDB para obtener el espacio de embeddings completo del proyecto y ejecuta clustering semántico:

1. Recupera todos los vectores de la colección del proyecto desde ChromaDB
2. Aplica algoritmo de clustering adaptativo:
   - Tamaño del corpus y varianza semántica determinan el número de clusters propuestos
   - Rango: 2–7 grupos. Si el algoritmo detecta más de 7, consolida hasta llegar a ese límite
   - Un proyecto con archivos semánticamente homogéneos → 2–3 clusters
   - Un proyecto con archivos heterogéneos → 5–7 clusters
3. Para cada cluster, Brain genera un nombre provisorio en lenguaje natural y una descripción de una línea
4. Escribe `domain_proposal.json` con los grupos, sus archivos, scores de cohesión y nombres provisorios
5. Actualiza `gen_state.json`: `phase: "analysis"`, `clusters_detected: N`

### 5.4 Fase 3 — Validate (el punto de sincronización)

**Actor:** Usuario  
**Input:** `domain_proposal.json`  
**Output:** `domain_confirmed.json`

Este es el único punto donde el usuario debe estar presente. El sistema presenta la propuesta de dominios en la interfaz (Conductor o plugin de VS Code) y el usuario tiene cuatro operaciones disponibles:

- **Renombrar** un dominio propuesto
- **Fusionar** dos dominios en uno
- **Mover** un archivo de un dominio a otro
- **Confirmar** sin cambios

Lo que el usuario **no puede** hacer en este punto es crear un dominio desde cero sin archivos. Si el usuario necesita un dominio adicional que no emergió del clustering, eso se resuelve en una iteración posterior del proyecto fuera del genesis.

Una vez que el usuario confirma, Brain escribe `domain_confirmed.json` y actualiza `gen_state.json`: `domain_confirmed_ref` pasa de `null` al path del archivo confirmado, y `sync_point_reached: true`.

### 5.5 Fase 4 — Scaffold (× N dominios)

**Actor:** Brain  
**Input:** `domain_confirmed.json`  
**Output:** `.scaffold/.domain_{name}/` completo por cada dominio

Por cada dominio en `domain_confirmed.json`, Brain ejecuta el scaffold de forma paralela (o secuencial si los recursos lo requieren). Para cada dominio:

1. Crea la carpeta `.scaffold/.domain_{name}/`
2. Escribe `gen.json` con la identidad del gene
3. Escribe `gen_state.json` del gene con estado inicial `seeded`
4. Construye el `context_gen_plan.json`:
   - Vectoriza el objetivo del genesis para este dominio
   - Consulta ChromaDB contra los archivos del dominio con threshold 0.40
   - Ordena los archivos por relevancia semántica
5. Arma el `payload.json` del pipeline con los archivos ordenados semánticamente
6. Envía el payload a la AI (Claude o Gemini, via `brain intent submit`)
7. Recibe la respuesta y la escribe en `.pipeline/.scaffold_{domain}/.response/raw_output.txt`
8. Procesa la respuesta para extraer:
   - El `semantic_scaffold.json` (andamiaje cognitivo)
   - La `docbase.json` inicial
9. Vectoriza el payload completo post-ejecución y actualiza ChromaDB (punto 2 del BISP)
10. Escribe `.pipeline/.scaffold_{domain}/index.json` con `embedding_ref` y `embedding_source_text`
11. Actualiza `gen_state.json` del gene: `status: "seeded"`
12. Actualiza `gen_state.json` del intent: agrega el dominio a `genes_created`

Cuando todos los dominios están scaffolded, Brain actualiza `gen_state.json` del intent: `phase: "complete"` y notifica a Nucleus que el Mandate Genesis puede avanzar a su siguiente acción.

---

## 6. Output final del genesis

El genesis produce **tres artefactos** que juntos constituyen la base cognitiva del proyecto:

### 6.1 Topología de dominios

El `domain_confirmed.json` más el conjunto de `gen.json` de cada dominio forman el mapa mental del proyecto: N dominios con nombres definidos por el usuario, cada uno con su conjunto de archivos y su función semántica. Persiste como parte del `mandate.json` del Mandate Genesis y es la estructura que governa cómo se instancian los intents `.doc` futuros.

### 6.2 Los genes iniciales

Uno por dominio, con:
- `gen.json` — identidad inmutable
- `gen_state.json` — estado vivo actualizable
- Vectores en ChromaDB de todos sus archivos

Son los ancestros de todos los genes futuros del proyecto. Cada vez que un intent `.dev` o `.doc` modifica los archivos de un dominio, el gene del dominio es actualizado. Los genes del Mandate Genesis son el estado inicial desde el que se mide toda la evolución posterior del proyecto.

### 6.3 El semantic scaffold por dominio

El `semantic_scaffold.json` de cada dominio más la `docbase.json` inicial. Estos archivos son el punto de partida de los intents `.doc`: cuando un intent de documentación necesita entender qué es el dominio de autenticación, lee el semantic scaffold. Cuando necesita el conocimiento existente organizado, lee la docbase.

**ChromaDB no es un artefacto del genesis — es infraestructura.** La colección del proyecto poblada es el motor que hace que los tres artefactos anteriores sean consultables semánticamente, pero no es "el resultado" desde la perspectiva del usuario ni del sistema de reporting del Mandate.

---

## 7. Integración con el ecosistema BISP y vectorial

### 7.1 Dos puntos de vectorización (igual que en `.dev`)

El intent `.gen` sigue exactamente el esquema de dos puntos de vectorización definido en el BISP Session Decisions v1.0:

**Punto 1 — antes del payload (ingestión):** Brain vectoriza cada archivo del proyecto y consulta ChromaDB para generar el `context_gen_plan.json` con el ranking semántico. El payload que llega a la AI ya tiene los archivos ordenados por relevancia semántica, no como dump desordenado.

**Punto 2 — después de la fase (post-ejecución):** Brain vectoriza el payload completo resultante y registra el `embedding_ref` y `embedding_source_text` en el `index.json` del pipeline. Esto permite que otros intents futuros encuentren el genesis en búsquedas cross-intent.

### 7.2 Invariantes del BISP aplicadas al genesis

Todas las invariantes del BISP Session Decisions v1.0 aplican sin excepción al intent `.gen`:

| Invariante | Aplicación en el genesis |
|---|---|
| **1 — Texto fuente siempre presente** | `ingest_index.json` es la fuente del `embedding_source_text` de todos los vectores del genesis |
| **2 — Brain como único orquestador** | Brain llama a Ollama, Brain llama a ChromaDB. Ningún otro componente tiene acceso directo |
| **3 — Capa vectorial aditiva** | Si Ollama no está disponible, el genesis continúa con clustering textual degradado. Se documenta en `gen_state.json` |
| **4 — Marketplace responsabilidad del Mandate** | `marketplace` es `null` en todos los `index.json` del genesis. El Mandate Genesis completa ese campo al cerrarse |
| **5 — Separación de audiencias** | `operational` para AI web, `autarchic` para runtime Bloom, `marketplace` para el Mandate Genesis |

### 7.3 Colección ChromaDB del proyecto

La colección del proyecto en ChromaDB, creada durante el genesis, persiste y crece durante toda la vida del proyecto. El genesis la puebla con los vectores de todos los archivos del proyecto. Los intents `.dev` y `.doc` futuros agregan vectores de sus propios payloads a la misma colección, acumulando el historial semántico completo del proyecto.

La estructura de keys en ChromaDB para el genesis sigue el mismo esquema URI del BISP:

```
chroma://proj-{name}/gen/ingest/{archivo_hash}
chroma://proj-{name}/gen/domain_{name}/objective
chroma://proj-{name}/gen/domain_{name}/scaffold
```

---

## 8. El archivo `.ai_bot.gen.intent.bl` en `.project/`

El genesis requiere su propio bot con instrucciones específicas, paralelo a los existentes `.ai_bot.dev.intent.bl` y `.ai_bot.doc.intent.bl`. Las instrucciones de este bot difieren de los demás en tres aspectos:

**Modo de análisis vs modo de producción:** Los bots de `.dev` y `.doc` están en modo de producción — producen código o documentación. El bot `.gen` está en modo de análisis — produce comprensión y estructura. Sus instrucciones priorizan la identificación de conceptos, relaciones y preguntas abiertas sobre la generación de respuestas definitivas.

**Tolerancia a la ambigüedad:** Los materiales que llegan al genesis son crudos e incompletos. El bot `.gen` debe estar instruido para trabajar con información parcial, documentar explícitamente lo que no pudo determinar, y nunca fabricar estructura donde no existe evidencia en los archivos.

**Output dual:** El bot `.gen` produce dos artefactos por llamada: el `semantic_scaffold.json` (andamiaje cognitivo) y el contenido inicial de la `docbase.json`. Las instrucciones del bot deben especificar el formato exacto de cada uno para que Brain pueda parsear el output sin ambigüedad.

---

## 9. Decisiones de diseño tomadas en sesión

| Pregunta | Decisión |
|---|---|
| ¿Qué es un dominio? | Agrupación semántica plana con nombre, archivos y gene asociado. Jerarquías en V2. |
| ¿Quién define dominios? | Brain agrupa, usuario nombra y valida. Punto de intervención: validación de dominios. |
| ¿Cuántos dominios? | 2–7, default adaptativo por corpus. Brain consolida si detecta más de 7. |
| Relación dominio/intent/gene | Mandate Genesis → N Genes → N intents `.gen`. Un dominio = un gene = un intent `.gen`. |
| Responsabilidad del `.gen` | Produce semantic scaffold + gene poblado. No produce documentación final. |
| ¿Sincrónico o asincrónico? | Asíncrono con un punto de sincronización explícito antes de mostrar la propuesta de dominios. |
| ¿Qué produce el genesis? | Tres artefactos: topología de dominios + genes iniciales + semantic scaffold por dominio. |
| ¿Cómo se retoma si falla? | `gen_state.json` con `resumable: true`. Brain lee la fase activa y continúa desde ahí. |
| ¿El pipeline BISP cambia? | No. El genesis reutiliza el contrato BISP completo. Solo cambia el nombre de las fases en `.pipeline/`. |
| ¿Dónde viven las instrucciones del bot? | `.project/.ai_bot.gen.intent.bl`, simétrico a los bots `.dev` y `.doc` existentes. |

---

## 10. Pendientes abiertos

Los siguientes temas fueron identificados en sesión como pasos siguientes, fuera del alcance de este documento:

| Tema | Descripción |
|---|---|
| Schema completo de `domain_proposal.json` | Definir todos los campos: cohesion score, archivos, nombre provisorio, descripción generada por Brain |
| Schema de `semantic_scaffold.json` | Definir el formato exacto del andamiaje cognitivo para que sea parseable por intents `.doc` |
| Comando `brain genesis ingest` | Diseño del CLI: flags, comportamiento con URL vs carpeta local, output en tiempo real al usuario |
| Algoritmo de clustering de Brain | Detalle del mecanismo adaptativo 2–7: cuándo colapsar clusters, cómo calcular la varianza semántica |
| UX de la pantalla de validación de dominios | Flujo exacto en el Conductor: qué controles exponer, cómo presentar archivos por grupo, orden de interacciones |
| Umbral de similitud configurable por intent | El threshold de 0.40 del BISP aplica como default; definir si el genesis usa el mismo o uno específico |

---

*BLOOM — Genesis Intent `.gen` Design Document · Junio 2026*
*Sesión de diseño base: BTIPS v5.0 + BISP v1.0 + Genesis Mandate Flow*
*Este documento es la fuente de verdad de la sesión. No modificar sin revisión arquitectónica.*
