# ING — Especificación Técnica del Intent de Ingesta

**Versión:** 1.1
**Estado:** Confirmado — listo para implementación
**Reemplaza a:** `ING_Intent_Spec_v1_0.md`
**Depende de:** BTIP_resumen_ecosistema (jerarquía Nucleus→Mandate→Action→Intent), `BLOOM_BISP_Session_Decisions_v1_1`
(Invariantes 1, 2, 3, 4 y 5; mecanismo de `context_plan`/`index.json` de las secciones 5.1 y 5.2; threshold
de similitud 0.40 de la sección 2.6, PENDIENTE de calibración empírica), `DIS_Intent_Spec_v1_0.md`
(intent que asume la propiedad de la topología de Dominios a partir de esta versión)

---

## Changelog v1.0 → v1.1

Esta revisión corrige un resabio del modelo jerárquico anterior que sobrevivió por error a la migración
`gen/` → `ing/`: el spec v1.0 trataba `domain` como una propiedad física del Gene (`gen.json.domain`,
string único). Al formalizar el intent `dis/` y el modelo de topología N:M Domain↔Gene, quedó claro que
esa decisión no era sostenible — un campo de dominio singular en `gen.json` no puede representar un Gene
que pertenece a más de un Dominio, y duplicaba una fuente de verdad que ya existía en
`.cache/.semantic-index.json`.

**No se toca nada del contrato BSIP de fases** (`.reception/`, `.classification/`, `.consolidation/`,
`.pipeline/` espejo) — esta revisión es exclusivamente de alcance y de schema de metadata. Cambios
concretos:

1. `gen.json` (§7.1) pierde el campo `domain`. El Gene vuelve a ser linaje puro.
2. `.cache/.semantic-index.json` (§7.3) pasa a estar keyeado por un `domain_id` estable
   (`dom_{slug}_{hex4}`) en vez de por el nombre del dominio — el nombre es mutable, la clave no puede
   serlo.
3. Se deja explícito (§4 y §5) que `.classification/` de `ing/` solo **siembra la primera arista** de un
   Gene nuevo en `.semantic-index.json`, o extiende la arista existente de un Gene que ya tenía Dominio.
   `ing/` nunca agrega una segunda arista, nunca fusiona, nunca divide, nunca renombra un Dominio — esas
   operaciones son propiedad exclusiva de `dis/` (`DIS_Intent_Spec_v1_0.md §5`).
4. La invariante de la matriz de casos (§8) — "dominio nuevo implica genes nuevos" — se mantiene válida,
   pero se aclara que describe únicamente lo que `ing/` puede producir, no el universo completo de
   combinaciones posibles del grafo (la combinación "gene existente + dominio adicional" existe, y es
   responsabilidad de `dis/`).

---

## Rationale del cambio de estrategia: `gen/` → `ing/`

Se abandonó la propuesta original de un intent `gen/` porque, aunque conceptualmente resolvía el
problema de ingesta de archivos raw para el Mandate Génesis, en la implementación mostró dos fallas
estructurales insalvables: primero, no respetaba la gramática BSIP que ya gobierna a `dev/` y `doc/` —
un número de fases propio de cada tipo (`dev` usa tres: `.briefing/.execution/.refinement/`; `doc` usa
dos: `.context/.curation/`) más un `.pipeline/` espejo por fase — sino que introducía una cuarta fase
ajena (`.scaffold/` multiplicado por dominio) que ningún otro intent tiene, generando una lógica forzada
y fuera de la línea de diseño del protocolo; segundo, colisionaba semánticamente con el concepto de
`gene` (la unidad de ADN del Mandate en `.mandates/{id}/.genes/`), produciendo ambigüedad de vocabulario
entre "el intent gen" y "los genes" que agrupa. La solución fue renombrar y replegar la funcionalidad a
un nuevo tipo de intent, `ing/` (ingesta), diseñado desde cero con sus propias tres fases (`.reception/`,
`.classification/`, `.consolidation/`) más `.pipeline/` espejo, respetando el mismo principio de fases +
pipeline que ya usan `dev` y `doc` sin copiar un número de fases fijo entre ellos, dejando la
vectorización (Ollama/ChromaDB) como una capa aditiva y aislada del contrato BSIP —tal como ya lo es en
los demás intents—, y resolviendo la relación Raw→Dominio→Gene mediante un embudo de dos pasadas
vectoriales (dominio primero, gene después) que no requiere ningún nivel jerárquico nuevo ni carpetas
adicionales.

Además, `ing/` deja de ser exclusivo del Mandate Génesis: al incorporar un campo `domain_baseline`
(`empty` para génesis, `existing` para cualquier incorporación posterior) se convierte en el mecanismo
genérico y reutilizable para anexar cualquier subsistema, repo o módulo nuevo al sistema en cualquier
momento de su vida, con trazabilidad completa vía `parent_mandates` y `.history/.delta_N` sin romper la
inmutabilidad de los Mandates ya firmados.

**Nota agregada en v1.1:** la frase original de esta sección decía que "el dominio pasa a ser una
etiqueta semántica sobre el gene, no un contenedor estructural" y proponía representarlo como
`gen.json.domain`. Esa representación concreta fue el error que corrige esta versión — el *principio*
(dominio no es contenedor estructural) seguía siendo correcto; lo que estaba mal era dónde vivía el dato.
Ver Changelog y §7.1/§7.3.

---

## 0. Resumen ejecutivo

`ing/` es el sexto tipo de intent del sistema, sumado a los cinco existentes (`dev`, `doc`, `exp`, `inf`,
`cor`) — y precede en el flujo típico al séptimo, `dis/`. Su función es incorporar archivos raw o de código
nuevos al ecosistema — tanto en el arranque de un proyecto (Mandate Génesis) como en cualquier
incorporación posterior (nuevo subsistema, nuevo repo, nuevo módulo) — y sembrar el linaje de los Genes
resultantes. La curación de la topología de Dominios a la que esos Genes pertenecen es responsabilidad de
`dis/`, no de `ing/` (ver §4 y `DIS_Intent_Spec_v1_0.md`).

Reglas de diseño que este documento fija como contrato:

1. `ing/` sigue el mismo principio BSIP que `dev`/`doc`: fases de trabajo humano-gobernado + `.pipeline/`
   espejo por fase (el número de fases es propio de cada tipo — `dev` tiene tres, `doc` tiene dos, `ing`
   define las suyas en la sección 2). No introduce una fase estructural nueva como `.scaffold/`.
2. `ing/` **siempre** corre bajo un Mandate, nunca "suelto". No existe un modo standalone.
3. **Dominio no es un nivel jerárquico, ni una carpeta persistida, ni un campo del Gene.** Es una relación
   N:M entre Dominio y Gene, resuelta por clustering vectorial y persistida exclusivamente en
   `.cache/.semantic-index.json` a nivel Nucleus. `gen.json` no tiene ni necesita ningún campo de dominio.
4. La resolución Raw → Dominio → Gene ocurre en dos pasadas dentro de `.classification/`: primero
   Dominio (coarse, Nucleus-wide), después Gene (fine, acotado al dominio ya resuelto). El resultado de
   esa resolución es la **primera arista** del Gene en `.semantic-index.json` — no un campo del Gene.
5. La vectorización (Ollama/ChromaDB) es aditiva y aislada del contrato BSIP — se invoca desde Brain
   dentro de cada fase, siguiendo el mismo mecanismo `context_plan → payload` / `index.json` post-fase
   ya documentado en BISP §5.1 y §5.2. No es una fase ni un payload que dialoga con la AI web.
6. La capa vectorial es aditiva y nunca bloqueante (Invariante 3 BISP): si Ollama no está disponible,
   `ing/` degrada a resolución manual en `.consolidation/` en vez de abortar el intent (ver sección 6).
7. **`ing/` nunca reestructura Dominios ya existentes.** No fusiona, no divide, no renombra, no agrega una
   segunda arista a un Gene que ya tenía Dominio asignado. Toda reestructuración de la topología es
   competencia exclusiva de `dis/`.

---

## 1. Estructura de `.ing_state.json`

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

- `domain_baseline`: `"empty"` únicamente cuando el Mandate es Génesis puro (no hay genes previos contra
  qué comparar). `"existing"` en cualquier Mandate de incorporación, sin importar si termina creando
  dominios nuevos o no — el valor describe si *hay* línea base disponible, no el resultado de la
  clasificación.
- `baseline_scope`: lista de `mandate_id` contra los que se acota la Pasada 1. Array vacío = Nucleus-wide
  (default recomendado). Se puede acotar si el negocio requiere que un dominio de un Mandate no sea
  visible para otro (multi-tenant, por ejemplo).
- `thresholds`: valores por defecto propuestos, calibrables por Mandate. **Pendiente de validación
  empírica** — el 0.40 de gene reusa el default sugerido en BISP §2.6 (PENDIENTE en ese documento
  también); el 0.45 de dominio es punto de partida propio de este spec, sin medición.
- `classification_summary.unresolved_no_vectorization`: cuenta clusters que no pudieron resolverse por
  vector (Ollama caído) y quedaron diferidos a decisión manual en `.consolidation/` — ver sección 6.

---

## 2. Estructura de directorios de `ing/`

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

*(sin cambios respecto a v1.0)*

---

## 3. Fase `.reception/`

*(sin cambios respecto a v1.0)*

### Propósito

Fase de apertura — recibe el raw entrante y lo deja inventariado y con texto extraído, listo para que
`.classification/` lo procese. Sin turnos: es un único acto de recepción, igual que `.briefing/` en `dev`
o `.context/` en `doc`. Si algo llega mal formado o incompleto, se resuelve reintentando la fase desde
cero, no iterando un turno — la iteración humana entra recién en `.consolidation/`.

### `.reception.json`

```json
{
  "requested_by": "action_id dentro del Mandate que disparó este intent",
  "objective": "texto libre: qué se está incorporando y por qué",
  "source": "upload_directo | repo_clone | filesystem_scan",
  "files_received": 0,
  "received_at": "ISO-8601"
}
```

### `.files/.rawbase.json` — inventario BSIP-compatible

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

### `.files/.rawbase_index.json` — texto extraído

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
`.classification/` — es la aplicación directa de la Invariante 1 del BISP ("todo vector va acompañado
del texto que lo generó").

### `.context_ing_plan.json`

Reusa sin modificaciones el mecanismo ya documentado en BISP §5.1 ("Generación del context_plan"): Brain
vectoriza el objetivo (`.reception.json.objective`) y cada entrada de `.rawbase_index.json`, consulta
ChromaDB y ordena por relevancia. Lo único que cambia respecto a `dev`/`doc` es *qué* se rankea (raw
entrante en vez de codebase/docbase ya existente) — el mecanismo Ollama→ChromaDB→ranking es el mismo, no
uno nuevo.

**Salida que consume `.classification/`:** la lista de `.rawbase.json` filtrada a `status: "received"`,
en el orden de `.context_ing_plan.json`.

---

## 4. Fase `.classification/`

### Propósito

Resuelve, para cada cluster de archivos raw recibidos, la relación Raw → Dominio → Gene mediante el
embudo de dos pasadas descrito en el diseño de esta sesión: primero Dominio (Nucleus-wide), después Gene
(acotado al dominio ya resuelto). Con turnos: si el humano no está de acuerdo con el clustering o el
naming de un dominio propuesto, se abre `.turn_{X+1}/` con la propuesta ajustada, igual que en
`.refinement/` de `dev`.

**Acotación de alcance (v1.1):** esta fase resuelve una asignación **local** de Dominio para el material
que acaba de entrar — compara contra los centroides de Dominio ya existentes al momento de la corrida,
nunca reconsidera Dominios ya consolidados por corridas anteriores entre sí. Si el resultado es
`domain.status: "existing"`, el efecto en `.consolidation/` es agregar la arista Gene→Dominio
correspondiente; si el Gene en cuestión ya fuera, por una corrida previa de `dis/`, cross-domain, esta
fase no lo sabe ni le importa — solo agrega o extiende **una** arista, la que le corresponde a este lote.
Cualquier reestructuración de Dominios ya existentes (fusión, split, rename, o dar de alta una *segunda*
arista sobre un Gene que ya tenía Dominio) es responsabilidad exclusiva de `dis/`
(`DIS_Intent_Spec_v1_0.md §5`).

### Algoritmo

Pseudocódigo del runner (ejecutado por Brain, invocado en cada `.turn_X/` de la fase):

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

**Cambio v1.1 respecto a v1.0:** la Pasada 1 ahora resuelve y transporta `domain_id` (la clave estable en
`.semantic-index.json`, ver §7.3), no solo `name`. El `name` sigue viajando en la propuesta para que el
turno de `.consolidation/` sea legible por un humano sin tener que resolver el ID, pero la escritura
efectiva en §5 usa `domain_id`.

**Nota de implementación (abierta, no bloqueante):** el pseudocódigo vectoriza y clusteriza a nivel
`cluster.centroid` para ambas pasadas. Es razonable evaluar si la Pasada 2 debería recalcular a
granularidad de archivo individual dentro del cluster en vez de reusar el centroide del cluster — afecta
precisión en clusters heterogéneos grandes, pero no afecta la forma del contrato aquí descrito.

`.domain_resolution.json` es un archivo dentro de `.classification/.turn_X/.files/`, siguiendo el mismo
patrón que `.codebase.json` / `.docbase.json` en `dev`/`doc` — no requiere carpeta nueva. Es la
**propuesta**; la confirmación humana ocurre en `.consolidation/` (sección 5), no acá.

---

## 5. Fase `.consolidation/`

### Propósito

Fase de cierre — con turnos, igual que `.refinement/` en `dev` o `.curation/` en `doc`: acá el humano
revisa la propuesta de `.domain_resolution.json`, la aprueba, la ajusta o la rechaza, y solo cuando el
turno cierra confirmado Brain escribe los cambios irreversibles en `.genes/` y en
`.cache/.semantic-index.json`. Esta confirmación cumple el mismo rol que tenía `.domain_confirmed.json`
en la propuesta `gen/` descartada, pero dentro de la gramática de turnos ya conocida — no como un archivo
aislado con forma propia de fase.

### `.consolidation.json`

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

*(único cambio respecto a v1.0: `domain` transporta `domain_id` junto con `name`, ver §7.3)*

### Efecto de `committed: true`

Cuando el turno cierra con `committed: true`, Brain ejecuta, por cada entrada con
`human_decision: "approved"` u `"overridden"`:

- si `gene.status == "extend"` → escribe `.genes/{gene_id}/.history/.delta_N/` (ver sección 7.2)
- si `gene.status == "new"` → crea `.genes/{new_gene_id}/gen.json` (ver sección 7.1)
- en ambos casos → **siembra o extiende exactamente una arista** en `.cache/.semantic-index.json` (ver
  sección 7.3):
  - si `domain.status == "new"` → crea la entrada de Dominio (`domain_id` nuevo, formato `dom_{slug}_{hex4}`)
    con `genes: [gene_id]`
  - si `domain.status == "existing"` → agrega `gene_id` al `genes[]` del `domain_id` ya resuelto en la
    Pasada 1, **solo si `gene_id` no está ya presente en ese `genes[]`** (idempotencia ante reintentos)
- escribe `.files/.docbase.json` (y `.codebase.json` si el raw incluía código) con el resultado final,
  listo para que un `dev`/`doc` futuro lo consuma.

**Límite explícito (v1.1):** este efecto nunca agrega una segunda arista a un `gene_id` que ya tuviera
alguna, nunca quita una arista existente, nunca toca el `genes[]` de un `domain_id` distinto al resuelto
en la Pasada 1 de este mismo turno, y nunca modifica `name` de un Dominio ya existente. Cualquier
necesidad de alguna de esas operaciones se resuelve con una corrida de `dis/`, no ajustando este efecto.

Entradas con `human_decision: "rejected"` no producen ningún efecto — el archivo correspondiente queda
fuera del sistema, disponible para una futura ingesta si se reconsidera.

**Efecto contractual futuro sobre `GravityGraph`:** únicamente después de que las escrituras canónicas
anteriores hayan quedado confirmadas, un materializador gobernado deberá proyectar en Gravity el nodo
`GENE`, el nodo `DOMAIN` si todavía no existe y las relaciones Domain↔Gene y Domain↔Mandate resultantes.
La proyección debe ser idempotente ante reintentos y reconstruible íntegramente desde `gen.json` y
`.cache/.semantic-index.json`; nunca pasa a ser fuente de verdad. “Nucleus-wide” queda acotado a la misma
raíz `.bloom/.nucleus-{organization}/`. Un fallo de proyección no autoriza a reconstruir o alterar el dato
canónico: queda como divergencia pendiente de reconciliación gobernada.

Este efecto es contrato para una implementación posterior. Esta especificación no asigna ownership al
materializador, no define gates ni concurrencia y no habilita `Store.CreateNode` para `DOMAIN` o `GENE`.

Si `committed: false` (el turno queda abierto o el humano pide más iteración), se abre `.turn_{X+1}/` con
la propuesta ajustada — mismo patrón que un turno de `.refinement/` en `dev` que no cierra en la primera
vuelta.

---

## 6. Contrato `.pipeline/` y degradación graceful

*(sin cambios respecto a v1.0)*

### Mismo contrato BISP en las tres fases

Cada fase de `ing/` tiene su `.pipeline/{fase}/` con `.payload.json`, `.index.json` y `.response/`
(`.raw_output.txt`, `.report.json`, `.staging/`) — sin excepciones ni variantes por fase. El
`.payload.json` se arma con el ranking de `.context_ing_plan.json` de esa fase (BISP §5.1). El
`.index.json` se escribe al cerrar la fase con `vector.embedding_ref`, `vector.embedding_source_text` y
`vector.embedded_at` (BISP §5.2, Invariante 1), y respeta las tres capas `operational` / `autarchic` /
`marketplace` del schema general (BISP §2.3) — `marketplace` queda `null` en el intent, lo completa el
Mandate al cerrarse (Invariante 4 BISP).

### Degradación graceful si Ollama no está disponible (Invariante 3 BISP)

- **`.reception/`**: continúa sin bloquearse. `.rawbase_index.json` se escribe igual (texto extraído,
  sin vector). `.context_ing_plan.json` queda sin ranking semántico; el orden de procesamiento cae a
  orden de llegada.
- **`.classification/`**: no puede ejecutar la Pasada 1 ni la Pasada 2 sin vectores. Los clusters
  afectados quedan marcados `status: "unresolved_no_vectorization"` en `.domain_resolution.json` y se
  difieren a `.consolidation/`, donde el humano asigna dominio y gene manualmente. El intent **no** se
  aborta — degrada a decisión manual, tal como exige la Invariante 3.
- **`.consolidation/`**: no depende de vectorización para cerrar — su turno siempre puede cerrarse con
  decisiones humanas explícitas, con o sin vector de respaldo.

---

## 7. Estructura de metadatos actualizada

### 7.1 `gen.json`

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

**Cambio v1.1:** se **elimina** el campo `"domain"` que traía v1.0. El Gene es linaje puro — identidad,
función semántica, archivos que lo componen, Mandate de origen. La pertenencia a uno o más Dominios no es
una propiedad del Gene: vive exclusivamente en `.cache/.semantic-index.json` (§7.3), como relación N:M
gestionada por `ing/` (siembra inicial) y `dis/` (reestructuración).

### 7.2 `.history/.delta_N/delta.json`

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

`snapshot.json` (mismo `.delta_N/`) conserva el rol ya definido en `bloom_nucleus_tree.txt`: estado
completo del scope del gene en ese punto, con hashes — sin cambios de esquema, solo se confirma que todo
delta producido por `ing/` se escribe con este formato. *(sin cambios respecto a v1.0)*

### 7.3 `.cache/.semantic-index.json`

```json
{
  "updated_at": "ISO-8601",
  "domains": {
    "dom_auth_a1b2": {
      "name": "auth",
      "domain_centroid_ref": "chroma://nucleus/domains/dom_auth_a1b2",
      "genes": ["gene-uuid-1", "gene-uuid-2"],
      "origin_mandate_id": "mandate-genesis-uuid",
      "mandates": ["mandate-genesis-uuid"],
      "first_created_by": "ing-intent-uuid-0",
      "last_updated": "ISO-8601"
    },
    "dom_billing_x1y2": {
      "name": "billing",
      "domain_centroid_ref": "chroma://nucleus/domains/dom_billing_x1y2",
      "genes": ["gene-uuid-5"],
      "origin_mandate_id": "mandate-billing-uuid",
      "mandates": ["mandate-billing-uuid"],
      "first_created_by": "ing-intent-uuid-7",
      "last_updated": "ISO-8601"
    }
  }
}
```

**Cambio v1.1 — reemplaza por completo al schema de v1.0:**

- La clave del mapa de `domains` deja de ser el nombre del Dominio y pasa a ser un `domain_id` estable,
  formato `dom_{slug}_{hex4}`, generado una vez y **nunca reutilizado** — ni siquiera si ese Dominio deja
  de existir por una fusión o un split ejecutados por `dis/` (`DIS_Intent_Spec_v1_0.md §7.3`). Este es el
  mismo formato ya resuelto una vez en el diseño previo del Mandate Genesis, recuperado acá porque la
  razón que lo motivó (un ID derivado de un campo mutable rompe trazabilidad ante un rename) sigue siendo
  válida — de hecho más válida ahora, porque `dis/` convierte el rename en una operación de rutina.
- `name` es el único campo mutable — un rename (operación exclusiva de `dis/`) solo toca este campo, la
  clave del mapa no se mueve nunca.
- `genes[]` es la única fuente de verdad de la relación N:M Domain↔Gene. Un `gene_id` puede aparecer en el
  `genes[]` de más de un `domain_id` simultáneamente (Gene cross-domain) — situación que `ing/` nunca
  produce por sí mismo (siempre siembra una única arista), pero que `dis/` sí puede producir, y que
  `ing/.classification` debe tolerar sin error si la encuentra en una corrida posterior (simplemente
  ignora las aristas adicionales que no le correspondan resolver).
- `origin_mandate_id` es obligatorio e inmutable: identifica el Mandate dentro del cual se creó y ratificó
  la identidad del Domain. No se deriva de `first_created_by` ni de la posición de `mandates[]`.
- `mandates[]` es acumulativo: si un Mandate de incorporación posterior extiende un gene de un dominio ya
  existente, su `mandate_id` se agrega a la lista sin reemplazar al Mandate original que creó el dominio.
  Esto preserva trazabilidad completa de qué Mandates tocaron cada dominio a lo largo del tiempo, sin
  necesidad de recorrer todos los Mandates del Nucleus para reconstruirlo.

---

## 8. Matriz de casos de prueba / transición

| Caso | `domain_baseline` | Resultado Pasada 1 | ¿Corre Pasada 2? | Resultado Pasada 2 | Efecto en `.genes/` | Efecto en `.semantic-index.json` |
|---|---|---|---|---|---|---|
| **Génesis** | `empty` | siempre `new` (no hay centroides contra qué comparar) | No | N/A | Crea gene(s) nuevo(s) bajo el Mandate Génesis, sin `parent_mandates` | Crea entrada de dominio nueva (`domain_id` nuevo), `mandates: [genesis_id]`, `genes: [gene_id(s)]` |
| **Incorporación — Dominio existente + Gene existente** | `existing` | `existing` (score ≥ `domain_threshold`) | Sí | `extend` (score ≥ `gene_threshold`) | Escribe `.delta_N` sobre el gene existente; el gene sigue perteneciendo a su Mandate original | Actualiza `last_updated`; agrega el Mandate de incorporación a `mandates[]` si no estaba. `genes[]` no cambia — el gene ya estaba |
| **Incorporación — Dominio existente + Gene nuevo** | `existing` | `existing` | Sí | `new` (score < `gene_threshold` en todos los candidatos) | Crea gene nuevo bajo el Mandate de incorporación | Agrega el nuevo `gene_id` al `genes[]` del `domain_id` resuelto en Pasada 1 |
| **Incorporación — Dominio nuevo + Genes nuevos** | `existing` | `new` (score < `domain_threshold` en todos los dominios existentes) | No | N/A (todo el cluster resulta en genes nuevos) | Crea dominio + N genes nuevos, todos bajo el Mandate de incorporación | Crea entrada de dominio nueva (`domain_id` nuevo), `mandates: [mandate_de_incorporacion_id]`, `genes: [...]` |
| **Sin vectorización disponible** (cualquier `domain_baseline`) | `empty` o `existing` | No se ejecuta (Ollama caído) | No | N/A | Sin efecto hasta `.consolidation/` | Sin efecto hasta `.consolidation/` — cluster marcado `unresolved_no_vectorization`, resuelto a mano por el humano en el turno de consolidación |

**Invariante que valida la matriz:** dominio nuevo implica, por definición, genes nuevos — no existe una
combinación "dominio nuevo + gene existente", porque no puede haber genes previos en un dominio que no
existía. El caso de degradación graceful no agrega una quinta rama de negocio: es el mismo árbol de casos
resuelto manualmente en vez de por vector, sin cambiar el contrato de `.consolidation/`.

**Nota de alcance (v1.1):** esta matriz describe únicamente las combinaciones que `ing/` puede producir.
La combinación "gene ya existente + dominio adicional" (Gene cross-domain) existe en el sistema, pero
nunca la produce `ing/` — es competencia exclusiva de `dis/` (`DIS_Intent_Spec_v1_0.md §8`). No es una
quinta fila faltante en esta tabla: está deliberadamente fuera del alcance de este intent.

---

## 9. Pendientes explícitos (fuera de alcance de esta especificación)

- Calibración empírica de `domain_threshold` (0.45) y `gene_threshold` (0.40, heredado del default
  sugerido en BISP §2.6, también PENDIENTE ahí) contra corpus real.
- Definición de `propose_domain_name(cluster)` — heurística o prompt a AI para nombrar un dominio nuevo.
  Mismo pendiente compartido con `dis/` para `create_domain` (`DIS_Intent_Spec_v1_0.md §9`) — no
  duplicar el diseño, resolver una sola vez.
- Decisión sobre granularidad de vectorización en Pasada 2 (centroide de cluster vs. archivo individual)
  para clusters heterogéneos grandes.
- Formato de parsing de la URI `chroma://...` para los `domain_centroid_ref` de esta especificación —
  depende de que se resuelva el pendiente equivalente ya abierto en BISP §2.6 para el resto del sistema;
  `ing/` no debería definir un formato propio y paralelo.
- Implementación del materializador gobernado de la proyección `DOMAIN`/`GENE` en `GravityGraph`,
  incluyendo ownership, autorización, orden de commit, reintentos, concurrencia y reconciliación.
- **Retirado en v1.1** (ya no aplica): el pendiente de v1.0 sobre "verificar que `.dev_state.json` no
  contemple campos de dominio, gene, threshold, historial de deltas, para sostener la decisión de crear
  `ing` como sexto IntentType" — con `mandateType: genesis` fuera del modelo y el patrón genérico
  `ing/`→`dis/`→`doc/` confirmado, esa verificación ya no es un argumento necesario para la existencia de
  `ing/`; el intent se sostiene por sí mismo como mecanismo genérico de incorporación, no como sustituto
  de una fase de un workflow especial que ya no existe.
