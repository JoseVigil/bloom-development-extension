# Investigación — Puntos exactos de creación de Genes y Domains, y su relación con GravityGraph

**Tipo:** Documento de investigación de diseño — cero código de producción, cero modificación de archivos de
código. Base de información para la decisión pendiente de cierre del diseño de GravityGraph.
**Estado:** v0.1 — materializado por control a partir del research entregado por Génesis en el mismo turno
de conversación; no existía como archivo en disco hasta este documento.
**Fecha:** 2026-09-02
**Repo auditado:** `bloom-development-extension`, vía puente al dispositivo `bell-ubuntu`.
**Verificado por control:** las citas de `brain/core/intent/effect_ledger.py` (obligaciones de `ing`/`dis`,
`mandate_state_integration: "not_wired"`), `docs/BSIP/TYPES/ING_Intent_Spec_v1_1.md §5` (fase
`.consolidation/`), y `brain/core/intent_manager.py` (Brain no escribe Genes ni el índice semántico por sí
mismo) — todas confirmadas exactas contra código real. El resto del documento se apoya en hallazgos ya
ratificados en `GravityGraph_Domains_Genes_Postures_Provenance_and_Persistence_Audit_v0_1.md` (§Q del
Tablero) e `Investigacion_GravityGraph_DomainGene_Relacion_v0_1.md` (§T del Tablero), consistentes con este
documento, no contradichos por él.

**Directiva permanente respetada:** `Intent Cor` (`cor`, también referido como "Intent Core" — ambos nombres
designan el mismo sistema deprecado) está deprecado hace tiempo. Todo el articulado de autorización de
postulados y posturas es competencia exclusiva de Gravity. No se cita acá como referencia de diseño.

---

La pieza que falta no es "encontrar dónde Gravity ya guarda los Genes" — hoy GravityGraph no los guarda.
Genesis posee el contrato semántico para crearlos, pero la materialización real aún no está conectada. Por
eso hay que evitar cerrar el nuevo Gravity Graph tomando `domain_proposal.json` o los `DomainAction` actuales
como si fueran la topología canónica Domain↔Gene.

## 1. Los tres planos que hoy existen

### Plano 1: GravityGraph

Representa criterio de gobierno y su linaje ratificado:

```text
NUCLEUS → ORGANIZATION → PROJECT → MANDATE → SESSION
```

Sus nodos contienen `gravityPostures[]`. El enum implementado no incluye `DOMAIN` ni `GENE`:
`installer/nucleus/internal/gravity/model.go:5`.

### Plano 2: Índice Semántico de Domains/Genes

Representa la topología funcional del sistema:

```text
Domain ←N:M→ Gene
```

Su fuente de verdad contractual es:

```text
<nucleus-root>/.cache/.semantic-index.json
```

Esto está separado expresamente de GravityGraph:
`docs/ANAYSIS/GRAVITY/GRAFO/Orbital_Gravity_Persistencia_Grafo_Implementation_Spec_v0_1.md:38`.

### Plano 3: Genesis operativo

Actualmente produce:

```text
domain_proposal.json
mandate_state.json
mandate.json
DomainAction
scaffold/domain_{name}/
```

Esos artefactos coordinan la construcción, pero no equivalen automáticamente al índice semántico canónico.

---

## 2. Punto normativo exacto de creación

La creación canónica no ocurre durante la identificación preliminar de Domains.

El flujo definido para `ing` es:

```text
.reception
    ↓
.classification
    ↓
.domain_resolution.json
    ↓
.consolidation/.turn_N
    ↓ decisión humana approved/overridden
    ↓ materialización y verificación
    ↓ commit del turno
    ↓ avance de fase
```

**El punto exacto es el cierre confirmado de un turno de `ing/consolidation`.** Cuando el turno solicita
commit, por cada decisión `approved` u `overridden`, deben producirse los siguientes efectos:

1. Crear un Gene nuevo o extender uno existente.
2. Crear o extender exactamente una relación Domain→Gene.
3. Evitar duplicar el `gene_id` dentro de `genes[]`.
4. Crear los artefactos de baseline de conocimiento.

El contrato está documentado en `docs/BSIP/TYPES/ING_Intent_Spec_v1_1.md:379`.

**[H] Verificado por control:** `ING_Intent_Spec_v1_1.md §5` (fase `.consolidation/`) confirma textualmente:
*"el humano revisa la propuesta de `.domain_resolution.json`, la aprueba, la ajusta o la rechaza, y solo
cuando el turno cierra confirmado Brain escribe los cambios irreversibles en `.genes/` y en
`.cache/.semantic-index.json`."*

La distinción temporal es importante:

```text
classification = propone
consolidation  = ratifica
materializer   = escribe y verifica
commit-turn    = confirma que los efectos están completos
advance-turn   = autoriza el avance
```

Por tanto, `.domain_resolution.json` no es todavía el Domain canónico. Es una resolución candidata que
alimenta la consolidación.

---

## 3. Qué se crea para un Gene

La ubicación contractual es:

```text
<nucleus-root>/
└── .mandates/
    └── .{mandate-id}/
        └── .genes/
            └── .{gene-id}/
                ├── gen.json
                ├── gen_state.json
                └── .history/
                    └── .delta_{N}/
                        ├── delta.json
                        └── snapshot.json
```

Fuente: `docs/GENES/BTIPS_GENES_CONCEPT_v2_0.md:151`.

### Gene nuevo

Debe crear al menos `gen.json`, con identidad y función semántica:

```json
{
  "gene_id": "uuid",
  "mandate_id": "uuid",
  "name": "...",
  "function": "...",
  "created_at": "...",
  "created_by_intent": "...",
  "status": "active",
  "forked_from": null,
  "embedding_ref": "chroma://..."
}
```

**[G] Divergencia de contrato, sin resolver por este documento:** el documento conceptual anterior utiliza
`gen_id` en algunos ejemplos; el contrato de `ing` más reciente utiliza `gene_id`. Esa diferencia debe
homologarse antes de tratar el schema como definitivamente cerrado — no corresponde resolverla
unilateralmente desde Gravity (mismo criterio ya aplicado a otras divergencias documentales de este track).

### Gene existente

No debe reescribir su identidad. Debe agregar:

```text
.genes/{gene_id}/.history/.delta_N/
├── delta.json
└── snapshot.json
```

El delta registra: Intent productor; archivos agregados; archivos modificados; archivos removidos; motivo de
la evolución.

### Estado vivo

`gen_state.json` representa el scope actual del Gene mediante rutas y hashes:
`docs/GENES/BTIPS_GENES_CONCEPT_v2_0.md:188`.

---

## 4. Qué se crea para un Domain

Un Domain no se crea como carpeta ni como nodo Gravity. Se crea como entrada estable dentro de:

```text
<nucleus-root>/.cache/.semantic-index.json
```

Shape contractual:

```json
{
  "updated_at": "ISO-8601",
  "domains": {
    "dom_auth_a1b2": {
      "name": "auth",
      "domain_centroid_ref": "chroma://nucleus/domains/dom_auth_a1b2",
      "genes": ["gene-uuid-1", "gene-uuid-2"],
      "mandates": ["mandate-uuid"],
      "first_created_by": "ing-intent-uuid",
      "last_updated": "ISO-8601"
    }
  }
}
```

Fuente: `docs/BSIP/TYPES/ING_Intent_Spec_v1_1.md:511`.

Las invariantes son:

- `domain_id` es estable.
- `name` puede cambiar.
- `genes[]` es la única fuente de verdad Domain↔Gene.
- La relación es N:M.
- Un Gene puede aparecer en varios Domains.
- `ing` siembra la primera relación.
- `dis` puede agregar otras relaciones o reestructurar la topología.
- La pertenencia a Domains no debe duplicarse dentro de `gen.json`.

Por eso un Domain sin `genes[]` no constituye una topología semántica completa — consistente con el
principio ya ratificado en el Tablero (§Q): un Domain mostrado sin sus Genes es una alerta de integridad
conceptual, no evidencia de que los Genes no existan.

---

## 5. Caso Genesis puro

Para un Genesis con `domain_baseline=empty`, la matriz contractual establece:

```text
Domain: siempre new
Genes:  nuevos
```

Efectos esperados:

```text
.mandates/{genesis-mandate-id}/.genes/{gene-id}/...
.cache/.semantic-index.json:
    domains[{new-domain-id}].genes = [{new-gene-id}, ...]
    domains[{new-domain-id}].mandates = [{genesis-mandate-id}]
```

Fuente: `docs/BSIP/TYPES/ING_Intent_Spec_v1_1.md:559`.

No debería existir, después de una consolidación completa, un Domain Genesis canónico sin al menos un Gene
asociado.

---

## 6. Qué está implementado realmente

### Effect ledger de Brain

Brain ya representa las cuatro obligaciones de `ing`:

```text
gene_lineage_materialized
domain_gene_edge_materialized
domain_gene_edge_deduplicated
knowledge_baseline_materialized
```

Y las dos obligaciones de reorganización de `dis`:

```text
domain_graph_operation_applied
domain_graph_delta_materialized
```

**[H] Verificado por control, exacto:** `brain/core/intent/effect_ledger.py:22-31`
(`_OBLIGATIONS_BY_TYPE = {"ing": (...), "dis": (...)}`).

El ledger vive junto al turno:

```text
<intent-root>/.consolidation/.turn_N/.effect_ledger.json
```

El protocolo dispone de operaciones separadas: `brain intent mark-effect-applied`, `brain intent
commit-turn`, `brain intent advance-turn`. Genesis ya tiene adaptadores Go para consumirlas en
`installer/nucleus/internal/orchestration/activities/mandate_genesis_activities.go:688`.

### Lo que todavía no está conectado

El adaptador existe, pero no está cableado al workflow real porque falta el punto de ejecución que:

1. reciba un turno real de `ing/consolidation`;
2. interprete sus decisiones aprobadas;
3. materialice Genes;
4. actualice el índice semántico;
5. verifique cada efecto;
6. marque cada obligación como aplicada;
7. haga commit;
8. avance el Intent.

**[H] Verificado por control, exacto:** Brain no materializa esos efectos por la mera existencia del ledger.
Su finalización declara expresamente que no escribe Genes ni `.semantic-index.json`:
`brain/core/intent_manager.py:1900` (comentario textual: *"No escribe genes, deltas, ni
`.cache/.semantic-index.json` — esa responsabilidad ya se ejecutó (o no) en el commit de turno..."*).

**[H] Verificado por control, exacto:** `mandate_state_integration` continúa como `{"status": "not_wired"}`
en `brain/core/intent/effect_ledger.py:137-138`.

---

## 7. Qué produce Genesis hoy en lugar de esa materialización

La Activity actual crea:

```text
{MandatesRoot}/{mandateID}/domain_proposal.json
```

El dominio es todavía sintético: deriva del Project y no de un clustering cognitivo real. El propio código lo
documenta en `installer/nucleus/internal/orchestration/activities/mandate_genesis_activities.go:207`.

Después puede producir:

```text
{MandatesRoot}/{mandateID}/scaffold/domain_{name}/
```

pero el scaffold se encuentra deliberadamente incompleto:
`installer/nucleus/internal/orchestration/activities/mandate_genesis_activities.go:243`.

`MandateExecutionWorkflow` trabaja con `DomainAction`:

```go
type DomainAction struct {
    DomainID   string
    ActionID   string
    DomainName string
    DependsOn  []string
}
```

Fuente: `installer/nucleus/internal/orchestration/temporal/workflows/mandate_execution_workflow.go:22`.

No aparece allí: `GeneID`, `Genes[]`, Gene scope, Gene lineage, ni Domain→Gene edge.

Esto explica por qué Control puede conocer Domains o Actions y, al mismo tiempo, no conocer Genes.

---

## 8. Qué significa esto para GravityGraph

La relación vigente es:

```text
GravityGraph
    MANDATE node
        gravityPostures[]
```

En paralelo:

```text
Mandate canonical state
    .genes/{gene_id}/...
Semantic Index
    domains[{domain_id}].genes[]
```

No existe un contrato implementado que conecte explícitamente `GravityGraph Mandate node ↔ Domain ↔ Gene`.
Tampoco existe una proyección canónica desde `.semantic-index.json` hacia GravityGraph.

**Dos caminos conceptualmente diferentes, cuya elección requiere decisión explícita de José Vigil:**

1. Mantener Domains/Genes fuera de GravityGraph y hacer que Gravity/Control consulte o proyecte el índice
   semántico. **El repositorio actual respalda esta separación** (consistente con la conclusión ya
   ratificada en `Investigacion_GravityGraph_DomainGene_Relacion_v0_1.md`, §T del Tablero: no existe hoy
   ningún consumidor real que fuerce lo contrario).
2. Extender GravityGraph con referencias o tipos nuevos. **El repositorio actual no respalda esto todavía.**

No corresponde agregar nodos `DOMAIN` o `GENE` por inferencia.

---

## 9. Punto de Mandate y Session en Gravity

### Mandate node

El Store puede guardar un `GravityNode` de tipo `MANDATE`, pero no hay un productor en Genesis que lo cree
cuando nace `mandate_state.json`, se firma `mandate.json`, comienza `MandateExecutionWorkflow`, o finaliza
Human Sync. El Store ofrece la primitiva genérica `CreateNode`
(`installer/nucleus/internal/gravity/store.go:61`), pero no hay lifecycle específico de creación de Mandate
Gravity Node conectado al workflow.

### Session node

El resolver exige simultáneamente `mandate_id`, `session_id`, `intent_type`, y falla si alguno falta
(`installer/nucleus/internal/gravity/resolver.go:25`). También valida que
`session.nodeType == SESSION`, `session.nodeId == SessionID`, `session.parentId == MandateID`.

En el código productivo revisado: no aparece un generador de `SessionID`; no aparece una Activity de
creación del Session node; no aparece una transición de cierre de Session; no aparece su conexión con
`MandateExecutionWorkflow`; no aparece una política de una sesión por workflow, por Intent, por Action o por
retry.

Sí existe y está registrada la Activity de lectura `ResolveActiveGravityActivity`
(`installer/nucleus/internal/orchestration/activities/resolve_active_gravity_activity.go:9`,
`installer/nucleus/internal/orchestration/temporal/worker.go:89`).

**Consistente con lo ya registrado en el handoff de sesión** (`Gravity_SESSION_MandateGenesis_Handoff_Investigacion_v0_1.md`,
§P/§U del Tablero) — este documento no agrega un gap nuevo acá, lo reconfirma desde otro ángulo de
investigación independiente.

Asimetría concreta:

```text
resolver implementado                    +
Activity registrada                      -
productor del Mandate node               -
productor del Session node               -
SessionID y lifecycle                    -
wiring al MandateExecutionWorkflow       -
```

---

## 10. Mapa completo del punto faltante

```text
Mandate Genesis
│
├─ domain_proposal.json                     IMPLEMENTADO
├─ Human Sync / selección                   IMPLEMENTADO
├─ mandate.json + DomainActions             IMPLEMENTADO/PARCIAL
├─ ejecución de scaffold                    PARCIAL
│
├─ ing real
│  ├─ reception                             CONTRATO
│  ├─ classification                        CONTRATO/PARCIAL
│  └─ consolidation real                    SIN CONEXIÓN E2E
│      ├─ crear/actualizar Gene              PENDIENTE
│      ├─ escribir Domain→Gene               PENDIENTE
│      ├─ verificar evidencia                PENDIENTE
│      ├─ mark-effect-applied                ADAPTADOR LISTO
│      ├─ commit-turn                        ADAPTADOR LISTO
│      └─ advance-turn                       ADAPTADOR LISTO
│
├─ .mandates/{id}/.genes/                   DECIDIDO, NO MATERIALIZADO
├─ .cache/.semantic-index.json              CONTRATO, VACÍO/NO CONECTADO
│
└─ GravityGraph
   ├─ Mandate node                          MODELO LISTO, CREACIÓN NO CONECTADA
   ├─ Session node                          MODELO/RESOLVER LISTOS, LIFECYCLE PENDIENTE
   ├─ GravityPostures                       IMPLEMENTADO
   ├─ referencia a Domain                   INEXISTENTE
   └─ referencia a Gene                     INEXISTENTE
```

## Conclusión para la definición actual

Antes de cerrar Gravity Graph conviene conservar estas cuatro afirmaciones como guardrails:

1. Un `DomainAction` de Genesis no es el Domain canónico.
2. Un Domain canónico sólo queda completo cuando existe en `.semantic-index.json` con sus `genes[]`.
3. Un Gene no debe inferirse desde el nombre del Domain: tiene identidad, scope, historia y Mandate de
   origen propios.
4. GravityGraph no tiene hoy un contrato que incorpore Domains o Genes; cualquier referencia o proyección
   nueva requiere una decisión explícita de boundary.

La pieza inmediata que falta no es solamente visual: falta el materializador de `ing/consolidation` y,
separadamente, el contrato que determine cómo Gravity/Control observa la topología Domain↔Gene sin
confundirla con Criterion. También permanecen abiertos el nacimiento del Mandate node, la creación y ciclo
de vida del Session node y la generación durable de `SessionID`.
