# Árbol de Nucleus con `.gravity/` integrado

**Fuentes:**
- `bloom_nucleus_tree.txt` — árbol real del filesystem de Nucleus
- `Orbital_Gravity_Persistencia_Grafo_Implementation_Spec_v0_1.md` §2.4 (layout físico) y §2.5 (nodos `DOMAIN`/`GENE`)

Ningún nombre de archivo o carpeta de este documento fue inventado: todo lo que aparece bajo `.gravity/` está tomado literalmente de §2.4–2.5 de `Persistencia_Grafo`. El resto del árbol es el `bloom_nucleus_tree.txt` real, sin modificar.

---

## Árbol completo

```text
.bloom/
└── .nucleus-{organization}/
    │
    ├── .core/
    │   ├── nucleus-config.json
    │   ├── .rules.bl
    │   ├── .standards.bl
    │   ├── .policies.bl
    │   ├── .ai_bot.sovereign.bl
    │   ├── .ai_bot.governance.bl
    │   ├── .ai_bot.plane.bl
    │   └── .meta.json
    │
    ├── .governance/
    │   ├── architecture/
    │   │   ├── .principles.bl
    │   │   ├── .patterns.bl
    │   │   └── .decisions/
    │   │       └── .adr-{uuid}.json
    │   ├── security/
    │   │   ├── .security-standards.bl
    │   │   └── .compliance-requirements.bl
    │   └── quality/
    │       ├── .code-standards.bl
    │       └── .testing-requirements.bl
    │
    ├── .intents/
    │   ├── .exp/
    │   │   └── .{intent-name-uuid}/
    │   │       ├── .exp_state.json
    │   │       ├── .inquiry/ ...
    │   │       ├── .discovery/ ...
    │   │       ├── .findings/ ...
    │   │       └── .pipeline/ ...
    │   └── .cor/
    │       └── .{intent-name-uuid}/
    │           ├── .cor_state.json
    │           ├── .freeze_snapshot/ ...
    │           ├── .structural_analysis/ ...
    │           ├── .semantic_interpretation/ ...
    │           ├── .dual_path_synthesis/ ...
    │           ├── .proposal_assembly/ ...
    │           ├── .governed_submission/ ...
    │           └── .pipeline/ ...
    │
    ├── .gravity/                                          ← GravityGraph (Persistencia_Grafo §2.4–2.5)
    │   ├── nucleus.node.json                              # singleton, sin parentId
    │   ├── .organization/{orgId}/
    │   │   ├── node.json
    │   │   └── .project/{projectId}/
    │   │       ├── node.json
    │   │       └── .mandate/{mandateId}/
    │   │           ├── node.json
    │   │           ├── .domain/{domainId}/                # proyección — parentId = origin_mandate_id
    │   │           │   └── node.json                      #   canónico → .cache/.semantic-index.json
    │   │           ├── .gene/{geneId}/                     # proyección — parentId = nodeId del MANDATE
    │   │           │   └── node.json                      #   canónico → .mandates/{mandateId}/.genes/{geneId}/
    │   │           ├── .submandate/{subMandateId}/         # máx. 2 niveles
    │   │           │   ├── node.json
    │   │           │   └── .submandate/{subSubMandateId}/
    │   │           │       └── node.json
    │   │           └── .session/{sessionId}/
    │   │               └── node.json                      # efímero — GC al cerrar el Mandate
    │   ├── .edges/
    │   │   ├── domain_gene/                                # proyección reconstruible desde semantic-index
    │   │   ├── domain_mandate/                             # proyección reconstruible desde semantic-index
    │   │   └── arbitration_events.log.jsonl                # append-only
    │   └── .index/                                          # reservado, deliberadamente vacío en v0.1
    │
    ├── .mandates/
    │   └── .{mandate-id-uuid}/
    │       ├── mandate.json                # incluye parent_mandates y own_genes
    │       ├── mandate_state.json
    │       └── .genes/                     # ADN del mandate — fuente canónica de GENE
    │           └── .{gen-id-uuid}/
    │               ├── gen.json
    │               ├── gen_state.json
    │               └── .history/
    │                   └── .delta_{N}/
    │                       ├── delta.json
    │                       └── snapshot.json
    │
    ├── .cache/
    │   ├── .projects-snapshot.json
    │   ├── .semantic-index.json         # fuente canónica de DOMAIN
    │   ├── .dependency-graph.json
    │   ├── .last-sync.json
    │   └── chroma/
    │       ├── {collection-per-project}/
    │       └── {nucleus-genes}/
    │
    ├── .relations/
    │   ├── .project-links.json
    │   └── .dependency-map.json
    │
    ├── .ownership.json
    │
    ├── findings/
    │   ├── README.md
    │   └── {intent-name}/
    │       ├── report.pdf
    │       ├── report.md
    │       └── data.json
    │
    └── reports/
        ├── health-dashboard.json
        ├── statistics.json
        └── exports/
            └── {timestamp}-report.pdf
```

---

## Notas de interpretación (no estructurales)

- **Nodos que aportan Postura** (jerarquía de criterio, `Persistencia_Grafo §2.4`): `nucleus.node.json`, `.organization/`, `.project/`, `.mandate/`, `.submandate/`, `.session/`.
- **Nodos estructurales / proyección** (`§2.5`): `.domain/` y `.gene/`. `gravityPostures[]` queda reservado como arreglo vacío; no participan de la resolución jerárquica ni pueden ser promovidos.
  - `.domain/{domainId}/` → fuente canónica: `.cache/.semantic-index.json`
  - `.gene/{geneId}/` → fuente canónica: `.mandates/{mandateId}/.genes/{geneId}/gen.json`
- **Infraestructura reservada**: `.edges/` (relaciones Domain↔Gene y Domain↔Mandate, proyecciones gobernadas y reconstruibles desde `.semantic-index.json`) e `.index/` (vacío deliberadamente en v0.1 — "tooling, no schema").
- Nucleus permanece como único escritor de cualquier `node.json` bajo `.gravity/`; ningún Agent Loop escribe ahí directamente (`§2.4`, consistente con `BTIPS §8.2`).
