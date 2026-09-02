# DIS — Especificación Técnica del Intent de Discovery

**Versión:** 1.0
**Estado:** Confirmado — listo para implementación
**Depende de:** BTIP_resumen_ecosistema (jerarquía Nucleus→Mandate→Action→Intent), `ING_Intent_Spec_v1_1.md`
(estructura de `.genes/`, `.semantic-index.json`, mecanismo de dos pasadas Raw→Dominio→Gene, contrato
`.pipeline/`), `BLOOM_BISP_Session_Decisions_v1_1.md` (Invariantes 1-5; mecanismo de `context_plan`/
`index.json`, §5.1 y §5.2)

---

## Rationale: por qué existe `dis/` y por qué no es parte de `ing/`

Durante el diseño de `ing/` se asumió que la resolución Raw → Dominio → Gene, corrida por lotes en
`.classification/`, era suficiente para mantener consistente la topología de Dominios de un proyecto.
Esa asunción resultó incompleta por una razón estructural, no de implementación: `ing/.classification`
resuelve **localmente** — compara el lote que acaba de entrar contra los centroides de Dominio ya
existentes, y solo puede *sumar*. Nunca reconsidera lo que ya fue consolidado por lotes anteriores,
porque no tiene ese contexto completo delante ni ese es su trabajo.

Esto genera un problema real, no hipotético, en dos escenarios concretos:

1. **Mandate Génesis con múltiples corridas de `ing/`.** Con `domain_baseline: empty`, cada corrida solo
   compara contra los Dominios creados por corridas anteriores *dentro del mismo Nucleus*. Es esperable
   que dos lotes ingeridos en momentos distintos, sin verse entre sí, terminen creando dos Dominios que en
   realidad son el mismo territorio conceptual mal cortado.
2. **Genes cross-domain.** Un Gene puede legítimamente pertenecer a más de un Dominio (many-to-many, ver
   `ING_Intent_Spec_v1_1.md §7.1` y `§7.3`). Detectar esa segunda pertenencia requiere comparar Genes y
   Dominios *entre sí*, no comparar un lote nuevo contra lo ya existente — es, por definición, una mirada
   retrospectiva y global que `ing/` no puede producir desde su propio diseño local-incremental.

`dis/` (Discovery) es el intent que corre **después** de una o más corridas de `ing/` — a demanda o
periódicamente — con la vista completa: no asimila material crudo, no toca `.rawbase`, no crea Genes.
Su universo de trabajo es exclusivamente el conjunto de Genes ya existentes (con su linaje ya fijado por
`ing/`) y el grafo de Dominios en `.cache/.semantic-index.json`. Su única salida es un grafo de Dominios
corregido: altas y bajas de la relación Domain↔Gene, fusiones, splits y renombres.

Reglas de diseño que este documento fija como contrato:

1. `dis/` sigue el mismo principio BSIP que `dev`/`doc`/`ing`: fases de trabajo humano-gobernado +
   `.pipeline/` espejo por fase, con el contrato `.payload.json` + `.index.json` + `.response/` **idéntico**
   al del resto de los intents, sin variantes. Ver §6.
2. `dis/` **siempre** corre bajo un Mandate, nunca "suelto" — mismo principio que `ing/`.
3. `dis/` **nunca** escribe en `.mandates/{id}/.genes/{gene_id}/gen.json`. No tiene nada que escribir ahí:
   el linaje de un Gene (`mandate_id`, `semantic_function`, `scope_files`) es inmutable desde su
   perspectiva. `dis/` escribe exclusivamente en `.cache/.semantic-index.json`.
4. `dis/` **nunca** crea Genes. Si al analizar el corpus detecta que un Gene debería dividirse en dos
   unidades funcionales distintas, eso es un hallazgo a reportar — no una operación que `dis/` ejecute
   por sí mismo (ver §9, pendiente explícito).
5. Las decisiones estructurales (crear/fusionar/dividir/renombrar Dominio, alta/baja de arista) se
   proponen en `.mapping/` y el humano las aprueba, rechaza, o edita directamente sobre el `.turn.json`.
   No hay estados intermedios, tombstones ni herencias — al cerrar `committed: true`, Brain aplica el mapa
   final tal como quedó escrito. Única garantía de integridad: un `domain_id` usado y luego absorbido por
   un merge o reemplazado por un split **nunca se reasigna** a una entidad nueva (ver §7.3).
6. La vectorización (Ollama/ChromaDB) es aditiva y aislada del contrato BSIP, mismo mecanismo que `ing/`
   (Invariante 3 BISP). Si no está disponible, `dis/` degrada a resolución manual en `.mapping/` en vez de
   abortar (ver §6).

---

## 0. Resumen ejecutivo

`dis/` es el séptimo tipo de intent del sistema, sumado a los seis existentes (`dev`, `doc`, `exp`, `inf`,
`cor`, `ing`). Su función es re-mapear la topología de Dominios de un proyecto a partir de la totalidad de
Genes ya ingeridos — detectando Dominios que deberían fusionarse o dividirse, y Genes cuya funcionalidad
legítimamente se extiende a través de más de un Dominio.

`dis/` no es exclusivo de Mandate Génesis: es el mecanismo genérico y reutilizable para curar la topología
de Dominios en cualquier momento de la vida de un proyecto, con la misma trazabilidad y gobierno humano
que el resto de los intents.

---

## 1. Estructura de `.dis_state.json`

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

- `scope.mode`: `"nucleus_wide"` (default recomendado) analiza todos los Genes del Nucleus disponibles al
  runtime que invoca `dis/`. `"mandate_scoped"` acota el análisis a los Genes de los `mandate_ids` listados
  — útil para curar la topología de un subconjunto del sistema sin tocar Dominios ajenos a ese alcance.
- `thresholds.domain_centroid_similarity`: mismo mecanismo de threshold que `ing/` (BISP §2.6), aplicado
  centroide-contra-centroide en vez de raw-contra-centroide. Punto de partida sin calibración empírica,
  igual que los thresholds de `ing/`.
- `mapping_summary.genes_cross_domain`: contador informativo, no de negocio — cuántos Genes terminan la
  corrida con 2+ aristas de Dominio. Útil para reportes de salud del sistema (`reports/health-dashboard.json`
  a nivel Nucleus).

---

## 2. Estructura de directorios de `dis/`

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
        │       ├── .genebase.json           ← snapshot de todos los Genes del scope (linaje, sin domain)
        │       ├── .genebase_index.json
        │       ├── .domain_graph_snapshot.json  ← copia de .semantic-index.json al momento de arrancar
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
        ├── .ratification/               ← con turnos, igual que .consolidation/ (ing)
        │   └── .turn_X/
        │       ├── .ratification.json           ← committed: false | true
        │       ├── .context_dis_plan.json
        │       └── .files/
        │           ├── .domain_graph_delta.json  ← qué cambió respecto a .domain_graph_snapshot.json
        │           └── [optional files]
        │
        └── .pipeline/                   ← contrato BISP idéntico, por fase — ver §6
            ├── .discovery/
            │   ├── .payload.json
            │   ├── .index.json
            │   └── .response/
            │       ├── .raw_output.txt
            │       ├── .report.json
            │       └── .staging/
            ├── .mapping/
            │   └── .turn_X/
            │       ├── .payload.json
            │       ├── .index.json
            │       └── .response/
            │           ├── .raw_output.txt
            │           ├── .report.json
            │           └── .staging/
            └── .ratification/
                └── .turn_X/
                    ├── .payload.json
                    ├── .index.json
                    └── .response/
                        ├── .raw_output.txt
                        ├── .report.json
                        └── .staging/
```

**Nota sobre por qué son tres fases y no dos:** `.discovery/` y `.mapping/` podrían haberse colapsado en una
sola fase con turnos (como hace `doc/` con solo `.context/` + `.curation/`), pero se mantienen separadas
porque cumplen el mismo rol que en `ing/`: `.discovery/` es una carga de contexto cara (todo el corpus de
Genes + el grafo completo) que no necesita intervención humana y no debería repetirse en cada turno de
`.mapping/`. Separar la carga de la negociación evita recomputar el snapshot completo del grafo en cada
vuelta de turno.

**Nota sobre `.ratification/` como fase separada de `.mapping/`:** a diferencia de `ing/`, donde
`.classification/` (turnos, propuesta) y `.consolidation/` (turnos, commit) son fases distintas porque
median entre ellas la extracción de texto/código real a escribir en `.docbase.json`, en `dis/` no hay ese
paso intermedio — `.mapping/` ya produce el mapa final. `.ratification/` existe igual, como fase propia y
no como el mismo turno de `.mapping/`, por dos razones: (a) mantiene la simetría estructural con `ing/`
(propuesta-con-turnos → commit-con-turnos), lo cual simplifica el motor de ejecución genérico que ya
gobierna ambos intents; (b) separa limpiamente "qué se propuso y discutió" (`.mapping/`) de "qué se aplicó
efectivamente al grafo" (`.ratification/`), útil el día que se audite una corrida de `dis/` sin tener que
reconstruir el commit desde el historial de turnos de negociación.

---

## 3. Comportamiento de `.discovery/` (sin turnos)

Fase de carga de contexto, sin interacción humana — mismo rol que `.reception/` de `ing/`:

1. Resuelve el `scope` (§1) contra `.mandates/*/.genes/` — recorre los Mandates aplicables y arma
   `.genebase.json` con el linaje de cada Gene (`gene_id`, `mandate_id`, `semantic_function`,
   `scope_files`, `created_at`, `created_by_intent`) tal como quedó definido en `ING_Intent_Spec_v1_1.md
   §7.1` — **sin ningún campo de dominio**, porque ya no vive ahí.
2. Copia el estado actual de `.cache/.semantic-index.json` a `.domain_graph_snapshot.json` — punto de
   referencia fijo para toda la corrida, incluso si otro proceso llegara a tocar el índice real en
   paralelo (edge case de concurrencia, no bloqueante para v1.0, ver §9).
3. Si Ollama/ChromaDB está disponible, corre una comparación pairwise de centroides de Dominio
   (`domain_centroid_similarity`) y deja precomputados candidatos de fusión, ordenados por score, en
   `.context_dis_plan.json` — listos para que el primer turno de `.mapping/` los muestre ya sugeridos, sin
   que el humano tenga que pedirlos.
4. Independientemente de la vectorización, calcula un segundo tipo de candidato con evidencia más fuerte
   que cualquier score de centroide: **Dominios que ya comparten Genes cross-domain**. Si el Gene X ya
   tiene arista confirmada hacia el Dominio A y hacia el Dominio B, eso es evidencia de que un humano ya
   validó esa doble pertenencia en una corrida anterior de `dis/` — señal de fusión mucho más fuerte que
   una similitud vectorial no confirmada. Este candidato se prioriza por encima del de similitud pura en
   `.context_dis_plan.json`.

---

## 4. Comportamiento de `.mapping/` (con turnos)

### Payload de un turno — `.mapping_proposal.json`

Decisión granular por operación, no un aprobar/rechazar de turno completo — un turno típico trae varias
operaciones mezcladas (una fusión, varias altas de arista, un rename) y el humano necesita aprobar unas y
no otras:

```json
{
  "turn_id": "uuid",
  "operations": [
    {
      "operation_id": "uuid",
      "type": "create_domain | rename_domain | add_edge | remove_edge | merge_domains | split_domains",
      "proposal": { },
      "human_decision": "approved | overridden | rejected",
      "override": null
    }
  ],
  "committed": false
}
```

El contenido de `proposal` varía por `type`. Formas mínimas, sin estados intermedios ni herencias
(principio KISS acordado):

- **`create_domain`**: `{ "name": "invoicing", "gene_ids": ["gene-uuid-3", "gene-uuid-7"] }`
- **`rename_domain`**: `{ "domain_id": "dom_billing_x1y2", "new_name": "payments" }`
- **`add_edge`** / **`remove_edge`**: `{ "domain_id": "dom_billing_x1y2", "gene_id": "gene-uuid-9" }`
- **`merge_domains`**: `{ "source_domain_ids": ["dom_billing_x1y2", "dom_invoicing_z3w4"], "target_name": "billing", "evidence": { "centroid_similarity": 0.81, "shared_cross_domain_genes": ["gene-uuid-9"] } }`
- **`split_domains`**: `{ "source_domain_id": "dom_platform_a9b8", "targets": [ { "name": "auth", "gene_ids": [...] }, { "name": "billing", "gene_ids": [...] } ] }`

`evidence` en `merge_domains` es informativa — ayuda al humano a decidir, no se valida ni se persiste más
allá del turno.

### Edición humana (`overridden`)

Si el humano no está de acuerdo con la propuesta, edita directamente los campos de `proposal` en el
`.turn.json` (por ejemplo, cambia `target_name`, reasigna qué `gene_ids` van a cada `target` de un split, o
decide que el nombre final del merge sea uno distinto a cualquiera de los dos originales). No hay un
sub-schema de `override` separado — el humano escribe el estado final directamente sobre la propuesta, y
`human_decision: "overridden"` es solo la marca de que ese contenido fue editado, no generado por Brain.

### Cierre del turno

Si `committed: false`, se abre `.turn_{X+1}/` con la propuesta ajustada — mismo patrón que un turno de
`.refinement/` en `dev` o de `.classification/` en `ing/` que no cierra en la primera vuelta.

---

## 5. Comportamiento de `.ratification/` (con turnos, `committed: false → true`)

Al cerrar un turno de `.ratification/` con `committed: true`, Brain aplica sobre
`.cache/.semantic-index.json` el mapa final tal como quedó escrito en el último turno de `.mapping/` — sin
recalcular, sin revalidar, sin herencias. Por cada `operation` con `human_decision` en
`approved`/`overridden`:

| `type` | Efecto en `.semantic-index.json` |
|---|---|
| `create_domain` | Nueva entrada, `domain_id` generado (`dom_{slug}_{hex4}`, ver §7.3), `genes[]` con los IDs indicados |
| `rename_domain` | Solo cambia `name`. La clave (`domain_id`) nunca se mueve |
| `add_edge` / `remove_edge` | Alta/baja de `gene_id` en `genes[]` del `domain_id` indicado |
| `merge_domains` | Se crea (o reusa, si `target_domain_id` fue indicado en el override) una entrada con la unión de todos los `genes[]` de los `source_domain_ids`. Los `source_domain_ids` dejan de existir como entradas activas — ver §7.3 sobre no reuso de IDs |
| `split_domains` | El `source_domain_id` deja de existir como entrada activa. Se crean los `targets[]` como entradas nuevas, cada una con su subconjunto de `genes[]` |

Operaciones con `human_decision: "rejected"` no producen ningún efecto sobre el grafo.

`.domain_graph_delta.json` registra, a modo de resumen de la corrida (no de log transaccional), el
`diff` entre `.domain_graph_snapshot.json` (§3) y el estado final aplicado — insumo directo para que un
`doc/` posterior sepa qué cambió sin tener que recorrer los turnos completos de `.mapping/`.

**Efecto contractual futuro sobre `GravityGraph`:** después de confirmar el estado canónico final de
`.cache/.semantic-index.json`, un materializador gobernado deberá sincronizar su proyección estructural:

- `create_domain`: crea idempotentemente la proyección del nuevo `DOMAIN` y sus relaciones;
- `rename_domain`: conserva `nodeId` y actualiza solo la proyección derivada que corresponda;
- `add_edge` / `remove_edge`: activa o desactiva la proyección Domain↔Gene correspondiente;
- `merge_domains`: marca como `superseded` los nodos fuente, deja inactivas sus relaciones proyectadas y
  materializa el dominio destino ratificado;
- `split_domains`: marca como `superseded` el nodo fuente, deja inactivas sus relaciones y materializa los
  nuevos dominios y sus relaciones;
- en todos los casos, las relaciones Domain↔Mandate se derivan del `mandates[]` canónico.

La sincronización debe ser idempotente ante reintentos y reconstruible desde el índice. Gravity preserva
identidad e historia estructural, pero no reemplaza la regla de §7.2: ante cualquier discrepancia,
`.semantic-index.json` gana y la proyección debe reconciliarse. “Nucleus-wide” se limita a la misma raíz
`.bloom/.nucleus-{organization}/`.

Este contrato no asigna ownership al materializador, no resuelve concurrencia, no define gates de
autorización y no habilita `Store.CreateNode` para `DOMAIN` o `GENE`.

---

## 6. Contrato `.pipeline/` y degradación graceful

### Mismo contrato BISP en las tres fases, sin excepción

Cada fase de `dis/` tiene su `.pipeline/{fase}/` con `.payload.json`, `.index.json` y `.response/`
(`.raw_output.txt`, `.report.json`, `.staging/`) — **idéntico** al de `ing/`, `dev/` y `doc/`, sin variantes
por tratarse de un intent nuevo. El `.payload.json` se arma con el ranking de `.context_dis_plan.json` de
esa fase (BISP §5.1). El `.index.json` se escribe al cerrar la fase con `vector.embedding_ref`,
`vector.embedding_source_text` y `vector.embedded_at` (BISP §5.2, Invariante 1). No hay payload ni
formato propio de `dis/` que se aparte de este contrato.

### Degradación graceful si Ollama no está disponible (Invariante 3 BISP)

- **`.discovery/`**: continúa sin bloquearse. `.genebase_index.json` se escribe sin vector.
  `.context_dis_plan.json` no trae candidatos de fusión por similitud de centroide — pero **sí** puede
  seguir trayendo los candidatos por evidencia de Genes cross-domain (§3, punto 4), que no dependen de
  vectorización.
- **`.mapping/`**: sin vectores, los turnos arrancan sin propuestas de `merge_domains` por similitud — el
  humano puede seguir proponiendo manualmente cualquier operación (`create_domain`, `add_edge`, etc.) sin
  restricción, porque ninguna operación de `.mapping/` depende de tener un score de similitud para
  ejecutarse.
- **`.ratification/`**: no depende de vectorización para cerrar, igual que en `ing/`.

---

## 7. Estructura de metadatos actualizada

### 7.1 `.genebase.json` (salida de `.discovery/`)

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

Sin campo `domain` — el linaje del Gene, tal como lo redefine `ING_Intent_Spec_v1_1.md §7.1`, nunca lo tuvo
ni lo necesita.

### 7.2 `.cache/.semantic-index.json` (única fuente de verdad de Domain↔Gene)

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

- `domain_id` (clave del mapa): formato `dom_{slug}_{hex4}`, generado una vez, inmutable, nunca reutilizado
  aunque el Dominio deje de existir por merge o split (§7.3).
- `name`: mutable. Renombrar un Dominio solo toca este campo, nunca la clave.
- `genes[]`: única fuente de verdad de la relación N:M — un `gene_id` puede aparecer en el `genes[]` de más
  de un `domain_id` simultáneamente (Gene cross-domain).
- `mandates[]`: acumulativo, igual que en `ING_Intent_Spec_v1_1.md §7.3` — se agrega el `mandate_id` de
  cualquier Mandate cuyos Genes hayan sido asociados a este Dominio, sin reemplazar al original.

### 7.3 Regla de no-reuso de `domain_id`

Cuando un Dominio deja de tener entrada activa (absorbido por `merge_domains`, reemplazado por
`split_domains`), su `domain_id` se retira del mapa y **el generador de IDs nunca vuelve a entregarlo**. No
hay tombstone, no hay campo `status`, no hay redirección automática — solo la garantía de que una
referencia vieja a ese `domain_id` (por ejemplo, desde un `doc/` generado antes del merge) en el peor caso
queda apuntando a algo que ya no está, pero **nunca** a algo que ahora significa otra cosa. Una referencia
desactualizada se resuelve la próxima vez que corra un `doc/`; una referencia que cambió de significado en
silencio es un bug de integridad que este diseño evita de raíz sin necesitar mecanismo adicional.

---

## 8. Matriz de casos de prueba / transición

| Caso | Operación | Precondición | Efecto en `.semantic-index.json` |
|---|---|---|---|
| **Primer Dominio de un cluster sin match** | `create_domain` | Ningún Dominio existente supera el threshold contra el cluster propuesto | Nueva entrada, `domain_id` nuevo, `genes[]` con los IDs del cluster |
| **Gene ya asignado gana una segunda pertenencia** | `add_edge` | El Gene ya tiene arista hacia un Dominio distinto | Se agrega el `gene_id` al `genes[]` del nuevo Dominio, sin tocar la arista existente — el Gene queda cross-domain |
| **Corrección de una asignación equivocada de `ing/`** | `remove_edge` + `add_edge` | El humano determina que la siembra local de `ing/` erró el Dominio | Baja del `genes[]` viejo, alta en el `genes[]` correcto |
| **Dos Dominios resultan ser el mismo territorio** | `merge_domains` | Similitud de centroide alta y/o Genes cross-domain compartidos entre ambos | `source_domain_ids` dejan de tener entrada activa; entrada resultante con la unión de `genes[]` |
| **Un Dominio creció y mezcla dos áreas distintas** | `split_domains` | El humano identifica subconjuntos de `genes[]` con funciones distintas dentro de un mismo Dominio | `source_domain_id` deja de tener entrada activa; se crean los `targets[]` con sus subconjuntos |
| **Sin vectorización disponible** | Cualquiera | Ollama caído | `.discovery/` no trae candidatos por similitud, pero sí por evidencia cross-domain; `.mapping/` sigue operable con propuestas manuales |

---

## 9. Pendientes explícitos (fuera de alcance de esta especificación)

- Calibración empírica de `domain_centroid_similarity` (0.45, heredado del punto de partida de `ing/` sin
  medición) contra corpus real.
- Qué hace `dis/` cuando detecta que un **Gene individual** debería dividirse en dos unidades funcionales
  distintas — esta especificación fija explícitamente (Rationale, punto 4) que `dis/` no crea ni divide
  Genes, solo reporta el hallazgo. Falta definir el formato de ese hallazgo y qué intent lo consume (¿un
  `ing/` de re-clasificación puntual? ¿un nuevo tipo de operación?).
- Comportamiento ante concurrencia: qué pasa si `.cache/.semantic-index.json` es tocado por otra corrida de
  `ing/` o `dis/` mientras una corrida de `dis/` está en `.mapping/` con el `.domain_graph_snapshot.json` ya
  congelado. Fuera de alcance de v1.0 — se asume ejecución serializada a nivel Nucleus hasta que se defina
  un mecanismo de lock.
- Definición de `propose_domain_name(cluster)` para `create_domain` sugerido automáticamente en
  `.discovery/` — mismo pendiente ya abierto en `ING_Intent_Spec_v1_1.md §9`, no se duplica el diseño acá.
- Formato de parsing de la URI `chroma://...` — depende del mismo pendiente abierto en BISP §2.6 y en
  `ING_Intent_Spec_v1_1.md §9`; `dis/` no define un formato propio y paralelo.
- Implementación del materializador gobernado de la proyección `DOMAIN`/`GENE` en `GravityGraph`, con
  ownership, autorización, commit posterior a la fuente canónica, concurrencia, reintentos y
  reconciliación de divergencias.
