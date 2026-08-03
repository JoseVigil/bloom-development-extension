# ING — Especificación Técnica del Intent de Ingesta

**Versión:** 1.0
**Estado:** Confirmado — listo para implementación
**Reemplaza a:** propuesta `gen/` (descartada, ver rationale en sesión de diseño previa)
**Depende de:** BTIP_resumen_ecosistema (jerarquía Nucleus→Mandate→Action→Intent), BLOOM_BISP_Session_Decisions v1.1 (Invariantes 1, 2, 3, 4 y 5; mecanismo de `context_plan`/`index.json` de las secciones 5.1 y 5.2; threshold de similitud 0.40 de la sección 2.6, PENDIENTE de calibración empírica)

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
adicionales: el dominio pasa a ser una etiqueta semántica sobre el gene, no un contenedor estructural.
Además, `ing/` deja de ser exclusivo del Mandate Génesis: al incorporar un campo `domain_baseline`
(`empty` para génesis, `existing` para cualquier incorporación posterior) se convierte en el mecanismo
genérico y reutilizable para anexar cualquier subsistema, repo o módulo nuevo al sistema en cualquier
momento de su vida, con trazabilidad completa vía `parent_mandates` y `.history/.delta_N` sin romper la
inmutabilidad de los Mandates ya firmados.

---

## 0. Resumen ejecutivo

`ing/` es el sexto tipo de intent del sistema, sumado a los cinco existentes (`dev`, `doc`, `exp`, `inf`,
`cor`). Su función es incorporar archivos raw o de código nuevos al ecosistema — tanto en el arranque de
un proyecto (Mandate Génesis) como en cualquier incorporación posterior (nuevo subsistema, nuevo repo,
nuevo módulo).

Reglas de diseño que este documento fija como contrato:

1. `ing/` sigue el mismo principio BSIP que `dev`/`doc`: fases de trabajo humano-gobernado + `.pipeline/`
   espejo por fase (el número de fases es propio de cada tipo — `dev` tiene tres, `doc` tiene dos, `ing`
   define las suyas en la sección 2). No introduce una fase estructural nueva como `.scaffold/`.
2. `ing/` **siempre** corre bajo un Mandate, nunca "suelto". No existe un modo standalone.
3. **Dominio no es un nivel jerárquico ni una carpeta persistida.** Es una etiqueta semántica sobre el
   Gene (`gen.json.domain`), resuelta por clustering vectorial y cacheada en
   `.cache/.semantic-index.json` a nivel Nucleus.
4. La resolución Raw → Dominio → Gene ocurre en dos pasadas dentro de `.classification/`: primero
   Dominio (coarse, Nucleus-wide), después Gene (fine, acotado al dominio ya resuelto).
5. La vectorización (Ollama/ChromaDB) es aditiva y aislada del contrato BSIP — se invoca desde Brain
   dentro de cada fase, siguiendo el mismo mecanismo `context_plan → payload` / `index.json` post-fase
   ya documentado en BISP §5.1 y §5.2. No es una fase ni un payload que dialoga con la AI web.
6. La capa vectorial es aditiva y nunca bloqueante (Invariante 3 BISP): si Ollama no está disponible,
   `ing/` degrada a resolución manual en `.consolidation/` en vez de abortar el intent (ver sección 6).

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

---

## 3. Fase `.reception/`

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
                                   name: candidates.best.name,
                                   score: candidates.best_score }
            else:
                domain_result = { status: "new", name: propose_domain_name(cluster) }

        # ---------- PASADA 2: Gene (solo si el dominio ya existía) ----------
        if domain_result.status == "existing":
            gene_candidates = query_genes_in_domain(
                domain    = domain_result.name,
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
      "domain": { "status": "existing | new", "name": "auth", "score": 0.52 },
      "gene":   { "status": "extend | new", "gene_id": "..." },
      "human_decision": "approved | overridden | rejected",
      "override_reason": null
    }
  ],
  "committed": false,
  "turn_closed_at": null
}
```

### Efecto de `committed: true`

Cuando el turno cierra con `committed: true`, Brain ejecuta, por cada entrada con
`human_decision: "approved"` u `"overridden"`:

- si `gene.status == "extend"` → escribe `.genes/{gene_id}/.history/.delta_N/` (ver sección 7.2)
- si `gene.status == "new"` → crea `.genes/{new_gene_id}/gen.json` (ver sección 7.1)
- en ambos casos → actualiza `.cache/.semantic-index.json` (ver sección 7.3)
- escribe `.files/.docbase.json` (y `.codebase.json` si el raw incluía código) con el resultado final,
  listo para que un `dev`/`doc` futuro lo consuma.

Entradas con `human_decision: "rejected"` no producen ningún efecto — el archivo correspondiente queda
fuera del sistema, disponible para una futura ingesta si se reconsidera.

Si `committed: false` (el turno queda abierto o el humano pide más iteración), se abre `.turn_{X+1}/` con
la propuesta ajustada — mismo patrón que un turno de `.refinement/` en `dev` que no cierra en la primera
vuelta.

---

## 6. Contrato `.pipeline/` y degradación graceful

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
  "domain": "auth",
  "name": "session-management",
  "semantic_function": "gestiona creación y validación de sesiones",
  "embedding_ref": "chroma://nucleus/genes/{gene_id}",
  "created_by_intent": "ing-intent-uuid",
  "scope_files": ["src/auth/session.py", "src/auth/tokens.py"],
  "created_at": "ISO-8601"
}
```

Cambio respecto al estado previo: se agrega `"domain"` como campo plano de metadata. No hay ninguna
referencia inversa (dominio → genes) dentro de `gen.json` — esa dirección de lookup vive en
`.semantic-index.json` (sección 7.3), evitando datos duplicados desincronizables.

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
delta producido por `ing/` se escribe con este formato.

### 7.3 `.cache/.semantic-index.json`

```json
{
  "updated_at": "ISO-8601",
  "domains": {
    "auth": {
      "domain_centroid_ref": "chroma://nucleus/domains/auth",
      "genes": ["gene-uuid-1", "gene-uuid-2"],
      "mandates": ["mandate-genesis-uuid"],
      "first_created_by": "ing-intent-uuid-0",
      "last_updated": "ISO-8601"
    },
    "billing": {
      "domain_centroid_ref": "chroma://nucleus/domains/billing",
      "genes": ["gene-uuid-5"],
      "mandates": ["mandate-billing-uuid"],
      "first_created_by": "ing-intent-uuid-7",
      "last_updated": "ISO-8601"
    }
  }
}
```

`mandates[]` es acumulativo: si un Mandate de incorporación posterior extiende un gene de un dominio ya
existente, su `mandate_id` se agrega a la lista sin reemplazar al Mandate original que creó el dominio.
Esto preserva trazabilidad completa de qué Mandates tocaron cada dominio a lo largo del tiempo, sin
necesidad de recorrer todos los Mandates del Nucleus para reconstruirlo.

---

## 8. Matriz de casos de prueba / transición

| Caso | `domain_baseline` | Resultado Pasada 1 | ¿Corre Pasada 2? | Resultado Pasada 2 | Efecto en `.genes/` | Efecto en `.semantic-index.json` |
|---|---|---|---|---|---|---|
| **Génesis** | `empty` | siempre `new` (no hay centroides contra qué comparar) | No | N/A | Crea gene(s) nuevo(s) bajo el Mandate Génesis, sin `parent_mandates` | Crea entrada de dominio nueva, `mandates: [genesis_id]` |
| **Incorporación — Dominio existente + Gene existente** | `existing` | `existing` (score ≥ `domain_threshold`) | Sí | `extend` (score ≥ `gene_threshold`) | Escribe `.delta_N` sobre el gene existente; el gene sigue perteneciendo a su Mandate original | Actualiza `last_updated`; agrega el Mandate de incorporación a `mandates[]` si no estaba |
| **Incorporación — Dominio existente + Gene nuevo** | `existing` | `existing` | Sí | `new` (score < `gene_threshold` en todos los candidatos) | Crea gene nuevo bajo el Mandate de incorporación, `domain` heredado del dominio resuelto | Agrega el nuevo `gene_id` a `domains[domain].genes` |
| **Incorporación — Dominio nuevo + Genes nuevos** | `existing` | `new` (score < `domain_threshold` en todos los dominios existentes) | No | N/A (todo el cluster resulta en genes nuevos) | Crea dominio + N genes nuevos, todos bajo el Mandate de incorporación | Crea entrada de dominio nueva, `mandates: [mandate_de_incorporacion_id]` |
| **Sin vectorización disponible** (cualquier `domain_baseline`) | `empty` o `existing` | No se ejecuta (Ollama caído) | No | N/A | Sin efecto hasta `.consolidation/` | Sin efecto hasta `.consolidation/` — cluster marcado `unresolved_no_vectorization`, resuelto a mano por el humano en el turno de consolidación |

**Invariante que valida la matriz:** dominio nuevo implica, por definición, genes nuevos — no existe una
combinación "dominio nuevo + gene existente", porque no puede haber genes previos en un dominio que no
existía. El caso de degradación graceful no agrega una quinta rama de negocio: es el mismo árbol de casos
resuelto manualmente en vez de por vector, sin cambiar el contrato de `.consolidation/`.

---

## 9. Pendientes explícitos (fuera de alcance de esta especificación)

- Calibración empírica de `domain_threshold` (0.45) y `gene_threshold` (0.40, heredado del default
  sugerido en BISP §2.6, también PENDIENTE ahí) contra corpus real.
- Definición de `propose_domain_name(cluster)` — heurística o prompt a AI para nombrar un dominio nuevo.
- Decisión sobre granularidad de vectorización en Pasada 2 (centroide de cluster vs. archivo individual)
  para clusters heterogéneos grandes.
- **Verificar contra el schema real de `exp_state.json` y `dev_state.json`** (código, no diseño) que
  ninguno de los dos contempla campos de dominio, gene, threshold de similitud ni historial de deltas.
  Esto sostiene la decisión de no repartir la Fase 2 (clustering) y la Fase 4 (scaffold) del Mandate
  Génesis entre intents `exp` y `dev` existentes en lugar de crear `ing` como sexto `IntentType` — hoy es
  un argumento de diseño razonado, no un hecho confirmado contra código.
- Formato de parsing de la URI `chroma://...` para los `domain_centroid_ref` de esta especificación —
  depende de que se resuelva el pendiente equivalente ya abierto en BISP §2.6 para el resto del sistema;
  `ing/` no debería definir un formato propio y paralelo.
