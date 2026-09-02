# GravityGraph Domains Genes Postures Provenance and Persistence Audit

## Resultado ejecutivo

La preocupación es válida, pero el repositorio revela una distinción estructural decisiva:

- **GravityGraph no contiene actualmente Domains ni Genes.**
- GravityGraph persiste criterio de gobierno mediante `GravityNode` y `gravityPostures[]`.
- **Domains y Genes pertenecen al Índice Semántico de Dominios/Genes**, deliberadamente separado de GravityGraph.
- Un **Gene vive bajo el Mandate que lo originó**.
- La relación Domain↔Gene vive exclusivamente en `.cache/.semantic-index.json`.
- **“Postulate” no existe como entidad persistente actual**. La entidad es `GravityPosture`; “postulación” es el acto mediante el cual se propone una Posture.
- Genesis tiene contratos para producir Genes y relaciones Domain↔Gene, pero la materialización canónica todavía no está conectada. Lo que hoy puede aparecer como “Domain” en Control corresponde probablemente a una propuesta o scaffold operativo, no al Domain canónico del índice semántico.

Se excluyó completamente de este análisis todo el sistema Intent Core indicado como deprecado.

---

## 1. Vocabulario canónico encontrado

| Concepto | Significado verificado | Persistencia |
|---|---|---|
| Gravity | Sistema completo de gobernanza del criterio | No es por sí mismo una estructura |
| GravityGraph | Criterion y linaje ratificado de ese criterio | `.gravity/**/node.json` |
| GravityNode | Nodo gobernado de Nucleus, Organization, Project, Mandate o Session | `node.json` |
| GravityPosture | Criterio declarado asociado a un GravityNode | `gravityPostures[]` dentro del nodo |
| Postulación | Acto de convertir contenido conversacional en una Posture candidata | No existe como entidad `Postulate` separada |
| Domain | Agrupación semántica mutable de Genes | `.cache/.semantic-index.json` |
| Gene | Unidad funcional durable, con identidad, scope y evolución | `.mandates/{mandate}/.genes/{gene}/` |
| Relación Domain↔Gene | Relación N:M; un Gene puede pertenecer a varios Domains | `domains[domain_id].genes[]` |
| Semantics | Plano probabilístico usado para descubrir relaciones | BISP/ChromaDB; separado de GravityGraph |

La separación está fijada expresamente en [Orbital_Gravity_Persistencia_Grafo_Implementation_Spec_v0_1.md](C:/repos/bloom-development-extension/docs/ANAYSIS/GRAVITY/GRAFO/Orbital_Gravity_Persistencia_Grafo_Implementation_Spec_v0_1.md:38) y en [Cierre_Boundary_Gravity_GravityGraph_Semantics_Provenance_v0_1.md](C:/repos/bloom-development-extension/docs/ANAYSIS/GRAVITY/GRAFO/Cierre_Boundary_Gravity_GravityGraph_Semantics_Provenance_v0_1.md:23).

---

## 2. Qué contiene realmente GravityGraph

El modelo implementado admite solamente cinco tipos de nodo:

```text
NUCLEUS
ORGANIZATION
PROJECT
MANDATE
SESSION
```

Esto está definido en [model.go](C:/repos/bloom-development-extension/installer/nucleus/internal/gravity/model.go:5).

No existen actualmente:

```text
DOMAIN
GENE
POSTULATE
```

como `NodeType` de Gravity.

Cada nodo contiene:

```json
{
  "nodeId": "...",
  "nodeType": "NUCLEUS | ORGANIZATION | PROJECT | MANDATE | SESSION",
  "parentId": "...",
  "gravityPostures": [],
  "status": "...",
  "createdAt": "...",
  "signedBy": {},
  "nodeVersion": 1
}
```

La estructura está implementada en [model.go](C:/repos/bloom-development-extension/installer/nucleus/internal/gravity/model.go:46).

La persistencia vigente se deriva de [store.go](C:/repos/bloom-development-extension/installer/nucleus/internal/gravity/store.go:21) y [resolver.go](C:/repos/bloom-development-extension/installer/nucleus/internal/gravity/resolver.go:110):

```text
<nucleus-root>/
└── .gravity/
    ├── nucleus.node.json
    ├── .organization/
    │   └── {organization-id}/
    │       └── node.json
    │       └── .project/
    │           └── {project-id}/
    │               └── node.json
    │               └── .mandate/
    │                   └── {mandate-id}/
    │                       ├── node.json
    │                       ├── .submandate/{id}/node.json
    │                       └── .session/{id}/node.json
    ├── .edges/
    └── .index/
```

El resolver recorre esa espina, reúne `gravityPostures[]` activas y las filtra mediante `appliesTo` según el tipo de Intent. No consulta Genes, Domains ni `.semantic-index.json`.

### Conclusión

Si Control de Cloud representa un “Domain” como nodo nativo de GravityGraph, esa representación no tiene contraparte en el modelo Go vigente. Puede ser:

- una proyección construida por la UI;
- una etiqueta informal;
- una lectura de artefactos operativos de Genesis;
- o una mezcla accidental entre GravityGraph e Índice Semántico.

El código actual no permite considerarlo un `GravityNode` canónico.

---

## 3. Qué es una Posture y qué es una postulación

La entidad persistente se llama `GravityPosture`:

```json
{
  "postureId": "...",
  "sourceMandateId": "...",
  "primitive": "...",
  "expression": {},
  "appliesTo": [],
  "status": "active",
  "origin": "...",
  "verifiable": true,
  "promotable": true,
  "promotedTo": [],
  "promotedFrom": {}
}
```

Definición implementada: [model.go](C:/repos/bloom-development-extension/installer/nucleus/internal/gravity/model.go:49).

La documentación UX denomina **postulación** al gesto de tomar contenido conversacional y proponerlo como Posture. La interfaz dice “Postular esto” y luego permite confirmar la postulación: [Paladin_UX_Postura_Gravity_Masa_Spec_v0_1.md](C:/repos/bloom-development-extension/docs/ANAYSIS/GRAVITY/PALADIN/Paladin_UX_Postura_Gravity_Masa_Spec_v0_1.md:16).

Por lo tanto:

```text
Postulación = acción o transición
Posture      = objeto resultante
Postulate    = no existe como entidad canónica encontrada
```

Posture tampoco es meramente un elemento de UI/UX: la UI lo captura y presenta, pero Nucleus lo persiste como parte real del `GravityNode`.

No debería agregarse una colección `postulates[]` al Gravity Graph sin una nueva decisión de contrato.

---

## 4. Procedencia y ubicación de los Genes

La definición conceptual establece que los Genes viven dentro del Mandate:

```text
.bloom/
└── .nucleus-{organization}/
    └── .mandates/
        └── .{mandate-id}/
            ├── mandate.json
            ├── mandate_state.json
            └── .genes/
                └── .{gene-id}/
                    ├── gen.json
                    ├── gen_state.json
                    └── .history/
                        └── .delta_{N}/
                            ├── delta.json
                            └── snapshot.json
```

Fuente: [BTIPS_GENES_CONCEPT_v2_0.md](C:/repos/bloom-development-extension/docs/GENES/BTIPS_GENES_CONCEPT_v2_0.md:151).

### `gen.json`

Identidad durable y función semántica:

```json
{
  "gen_id": "uuid",
  "mandate_id": "uuid",
  "name": "nombre-descriptivo",
  "function": "función semántica",
  "created_at": "timestamp",
  "created_by_intent": "intent-uuid",
  "status": "active | dormant | orphan | forked",
  "forked_from": null,
  "embedding_ref": "chroma://nucleus-org/genes/{gen-id}/function"
}
```

Fuente: [BTIPS_GENES_CONCEPT_v2_0.md](C:/repos/bloom-development-extension/docs/GENES/BTIPS_GENES_CONCEPT_v2_0.md:170).

El contrato posterior de `ing` elimina expresamente cualquier campo singular `domain` de `gen.json`: [ING_Intent_Spec_v1_1.md](C:/repos/bloom-development-extension/docs/BSIP/TYPES/ING_Intent_Spec_v1_1.md:469).

### `gen_state.json`

Scope vivo de archivos:

```json
{
  "gen_id": "uuid",
  "scope": [
    {
      "path": "ruta/relativa",
      "md5": "hash",
      "last_seen_in_intent": "intent-uuid",
      "added_at": "timestamp"
    }
  ],
  "last_updated": "timestamp",
  "delta_count": 3
}
```

Fuente: [BTIPS_GENES_CONCEPT_v2_0.md](C:/repos/bloom-development-extension/docs/GENES/BTIPS_GENES_CONCEPT_v2_0.md:188).

### Historia del Gene

Cada evolución se registra en:

```text
.history/.delta_N/
├── delta.json
└── snapshot.json
```

`delta.json` identifica el Intent que produjo la modificación, archivos agregados/modificados/removidos y la razón: [BTIPS_GENES_CONCEPT_v2_0.md](C:/repos/bloom-development-extension/docs/GENES/BTIPS_GENES_CONCEPT_v2_0.md:206).

### Representación vectorial

El vector de la función del Gene está concebido en:

```text
.bloom/.nucleus-{org}/.cache/chroma/
└── {nucleus-genes}/
    └── {gene-id}/function
```

Fuente: [BTIPS_GENES_CONCEPT_v2_0.md](C:/repos/bloom-development-extension/docs/GENES/BTIPS_GENES_CONCEPT_v2_0.md:300).

Esta capa continúa parcialmente documental: el propio documento conserva como pendientes el hook post-merge, el comando `brain gene`, la reconciliación y el surfacing de Genes huérfanos: [BTIPS_GENES_CONCEPT_v2_0.md](C:/repos/bloom-development-extension/docs/GENES/BTIPS_GENES_CONCEPT_v2_0.md:430).

---

## 5. Procedencia y ubicación de los Domains

Un Domain no es:

- una carpeta;
- un nivel jerárquico;
- un campo de `gen.json`;
- un nodo de GravityGraph.

Es una agrupación semántica registrada en:

```text
.bloom/
└── .nucleus-{organization}/
    └── .cache/
        └── .semantic-index.json
```

Contrato: [ING_Intent_Spec_v1_1.md](C:/repos/bloom-development-extension/docs/BSIP/TYPES/ING_Intent_Spec_v1_1.md:85).

Shape documentado:

```json
{
  "updated_at": "ISO-8601",
  "domains": {
    "dom_auth_a1b2": {
      "name": "auth",
      "domain_centroid_ref": "chroma://nucleus/domains/dom_auth_a1b2",
      "genes": [
        "gene-uuid-1",
        "gene-uuid-2"
      ],
      "mandates": [
        "mandate-genesis-uuid"
      ],
      "first_created_by": "ing-intent-uuid",
      "last_updated": "ISO-8601"
    }
  }
}
```

Fuente: [ING_Intent_Spec_v1_1.md](C:/repos/bloom-development-extension/docs/BSIP/TYPES/ING_Intent_Spec_v1_1.md:511).

Reglas confirmadas:

- `domain_id` es estable; el nombre es mutable.
- `genes[]` es la única fuente de verdad de la relación Domain↔Gene.
- Un mismo `gene_id` puede aparecer en varios Domains.
- `mandates[]` registra los Mandates que contribuyeron al Domain.
- `ing` crea la asignación inicial.
- `dis` puede reorganizar la topología: agregar o remover relaciones, crear, renombrar, fusionar o dividir Domains.

La relación N:M y el caso cross-domain están explicitados en [ING_Intent_Spec_v1_1.md](C:/repos/bloom-development-extension/docs/BSIP/TYPES/ING_Intent_Spec_v1_1.md:542).

---

## 6. Cómo deberían nacer desde Genesis

El contrato de `ing` establece:

```text
reception
  → classification
      → domain_resolution.json
  → consolidation
      → revisión humana
      → materialización de Genes y relaciones Domain↔Gene
```

Cuando una decisión de consolidación queda aprobada u overridden:

- Gene existente: crea `.history/.delta_N/`.
- Gene nuevo: crea `gen.json`.
- En ambos casos: materializa exactamente una relación inicial Domain→Gene.
- Evita duplicar el `gene_id` en `genes[]`.
- Materializa el baseline de conocimiento correspondiente.

Esto está definido en [ING_Intent_Spec_v1_1.md](C:/repos/bloom-development-extension/docs/BSIP/TYPES/ING_Intent_Spec_v1_1.md:379).

Brain reconoce esas obligaciones mediante el effect ledger:

```text
gene_lineage_materialized
domain_gene_edge_materialized
domain_gene_edge_deduplicated
knowledge_baseline_materialized
domain_graph_operation_applied
domain_graph_delta_materialized
```

Fuente implementada: [effect_ledger.py](C:/repos/bloom-development-extension/brain/core/intent/effect_ledger.py:25).

Pero el cierre de Brain no escribe por sí mismo Genes ni el índice semántico. Lo declara expresamente en [intent_manager.py](C:/repos/bloom-development-extension/brain/core/intent_manager.py:1900).

Por consiguiente, el sistema conoce las obligaciones y puede registrarlas, pero falta el materializador real que las haga efectivas.

---

## 7. Los “Domains” que Genesis produce hoy no son todavía los canónicos

La Activity actual de Genesis produce un artefacto operativo:

```text
{MandatesRoot}/{mandateID}/domain_proposal.json
```

Contiene:

```json
{
  "status": "proposed",
  "domains": [
    {
      "id": "dom_*",
      "domainName": "...",
      "cohesionScore": 1.0,
      "suggestedActionCount": 1
    }
  ]
}
```

Código: [mandate_genesis_activities.go](C:/repos/bloom-development-extension/installer/nucleus/internal/orchestration/activities/mandate_genesis_activities.go:207).

El código también reconoce que:

- todavía no llama realmente a Brain para clustering;
- el dominio deriva sintéticamente del Project;
- el modo real crea solamente un scaffold incompleto;
- no crea Genes canónicos;
- no actualiza `.semantic-index.json`.

El scaffold físico actual se escribe bajo:

```text
{MandatesRoot}/{mandateID}/scaffold/domain_{name}/
```

y queda marcado como incompleto: [mandate_genesis_activities.go](C:/repos/bloom-development-extension/installer/nucleus/internal/orchestration/activities/mandate_genesis_activities.go:243).

Por eso deben distinguirse cuatro cosas que hoy pueden estar siendo llamadas “Domain”:

| Representación | Estado |
|---|---|
| `domain_proposal.json` | Propuesta operacional de Genesis |
| `mandate_state.json` / Human Sync | Estado y selección del workflow |
| `scaffold/domain_{name}/` | Scaffold físico incompleto |
| `.cache/.semantic-index.json domains[domain_id]` | Domain lógico canónico |

Control de Cloud podría estar mostrando cualquiera de las tres primeras sin estar conectado a la cuarta.

---

## 8. Estado documental y material

| Elemento | Documentado | Implementado | Materializado/conectado |
|---|---:|---:|---:|
| GravityNode | Sí | Sí | Store y resolución implementados |
| GravityPosture | Sí | Sí | Modelo, resolución, masa y parsing |
| Postulación UX | Sí | Parcial/por superficies | No es entidad aparte |
| Domain proposal de Genesis | Sí | Sí | Sí, operacional |
| Scaffold Domain | Sí | Parcial | Marker incompleto |
| Domain canónico | Sí | Schema definido | Índice señalado como vacío/no conectado |
| Gene identity/scope/history | Sí | Contratos y ledger | Materialización Genesis pendiente |
| Domain↔Gene N:M | Sí | Obligaciones del ledger | Escritura real pendiente |
| Gene cross-domain | Sí | Permitido por contrato | Propiedad de `dis`, no demostrada E2E |
| Genes en GravityGraph | No | No | No existe decisión que los incorpore |
| Postulates como objetos | No | No | No existe |

Los truth trees reconocen este estado:

- `.genes/`: decidido, no implementado por Genesis, en [bloom_nucleus_truth.txt](C:/repos/bloom-development-extension/tree/bloom/truth/bloom_nucleus_truth.txt:231).
- `.semantic-index.json`: implementado vacío, efectos no conectados, en [bloom_nucleus_truth.txt](C:/repos/bloom-development-extension/tree/bloom/truth/bloom_nucleus_truth.txt:242).
- El Project Truth aclara que el índice canónico sigue siendo propiedad de Nucleus: [bloom_project_truth.txt](C:/repos/bloom-development-extension/tree/bloom/truth/bloom_project_truth.txt:46).

---

## 9. Contradicciones y desactualizaciones encontradas

### A. GravityGraph no conoce Domains ni Genes

La ausencia de Genes en una visualización estricta de GravityGraph es consistente con el boundary vigente. Lo preocupante sería que la UI presente Domains como integrantes nativos del grafo y oculte que provienen de otro plano.

No existe actualmente una relación aprobada como:

```text
GravityNode → Domain
GravityPosture → Domain
GravityPosture → Gene
Mandate GravityNode → own Genes
```

Tampoco `appliesTo[]` cumple esa función: filtra por tipos de Intent, no por Domain ni Gene.

### B. Documentación de Gravity atrasada respecto del código

La specification de persistencia todavía afirma que no existía GravityGraph real y que `.gravity` era nuevo. Esa afirmación fue superada por `internal/gravity/model.go`, `store.go` y `resolver.go`.

La separación conceptual sigue siendo válida; el estado de implementación descrito en esa introducción ya no.

### C. Truth de Nucleus no refleja completamente `.gravity`

El árbol homologado sí representa Genes e índice semántico, pero no refleja adecuadamente el layout `.gravity/` que el código actual ya implementa. Esto es un desfase documental.

### D. Contrato Gene duplicado en evolución

El concepto general utiliza en algunos ejemplos `gen_id`, mientras `ING v1.1` fija `gene_id`. Para integración nueva debe prevalecer el contrato operativo más reciente de `ing`, pero esta divergencia merece normalización documental central; no corresponde resolverla unilateralmente desde Gravity.

### E. Documentos Gravity contaminados por referencias históricas

Varios documentos Gravity contienen referencias narrativas al sistema deprecado que José indicó ignorar. No fueron usadas como evidencia arquitectónica. La evidencia válida del reporte proviene del código Gravity vigente, de los boundaries actuales y de los contratos `ing`/`dis`/Genes.

---

## 10. Mapa que debería recibir Genesis Control

Sin diseñar una integración nueva, las fuentes existentes que Control necesita distinguir son:

```text
Criterion / Gravity
└── <nucleus-root>/.gravity/**/node.json
    └── gravityPostures[]

Topología semántica
└── <nucleus-root>/.cache/.semantic-index.json
    └── domains[domain_id]
        ├── name
        ├── genes[]
        └── mandates[]

Linaje y scope funcional
└── <nucleus-root>/.mandates/{mandate_id}/.genes/{gene_id}/
    ├── gen.json
    ├── gen_state.json
    └── .history/.delta_N/

Progreso operacional de Genesis
└── <MandatesRoot>/{mandate_id}/
    ├── mandate_state.json
    ├── domain_proposal.json
    └── scaffold/domain_{name}/
```

La regla esencial para Gravity Graph/Control es:

> GravityGraph, el Índice Semántico Domain/Gene y el estado operacional de Genesis son tres estructuras diferentes. Pueden proyectarse juntas en una UI, pero no deben presentarse como una única fuente de verdad.

## Conclusión para pasar a Genesis Control

1. Los Genes no están “escondidos” dentro de Gravity: **no pertenecen actualmente a GravityGraph**.
2. La fuente canónica prevista de cada Gene es `.mandates/{mandate}/.genes/{gene}/`.
3. La fuente canónica de los Domains y sus Genes es `.cache/.semantic-index.json`.
4. Genesis todavía no materializa esas dos fuentes de forma efectiva; produce propuestas y scaffolds operativos.
5. La entidad vigente es `GravityPosture`, no `Postulate`.
6. No hay hoy una referencia ratificada desde una Posture hacia un Domain o Gene.
7. Si Gravity Graph necesita mostrar Genes y Domains, el paso pendiente no es encontrarlos dentro de `GravityNode`: es definir cómo proyectar o relacionar, sin fusionar, el GravityGraph con el Índice Semántico.
8. Esa relación transversal todavía no está documentada ni implementada y requiere decisión explícita de José Vigil.

La investigación fue exclusivamente de lectura; no se modificó ningún archivo.