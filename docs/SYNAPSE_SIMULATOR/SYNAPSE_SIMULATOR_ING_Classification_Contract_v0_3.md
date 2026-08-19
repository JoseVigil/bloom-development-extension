# Synapse Simulator — ING Classification Contract v0.3

**Estado:** contrato de Etapa A para aprobación; no implementado.  
**Consumidor inicial:** Mandate Genesis mediante Brain.  
**Frontera reusable:** `CognitiveCounterpart`, operación `classify_ingestion_material`.

## 1. Decisiones cerradas por la devolución del consumidor

El primer intercambio externo ocurre en un Intent real `ing`, stage `classification`, turn `1` para Genesis inicial, con `domain_baseline: empty`. Genesis solicita a Brain ejecutar el turno; nunca llama al Simulator directamente.

```text
Brain prepara evidencia y candidatos
→ CognitiveCounterpart
→ domain_resolution_proposal
→ Brain persiste raw, valida y materializa .domain_resolution.json
→ Brain devuelve resultado durable a Temporal
```

El contrato reusable describe una inferencia y su entrega. Los schemas específicos `ClassificationEvidence` y `DomainResolutionProposal` son payloads versionados de una operación; no convierten `ing`, Genesis, Domain o Gene en conceptos internos del engine.

## 2. Decisión sobre `index.json`

La fuente BISP establece dos momentos diferentes:

- `.context_ing_plan.json` y payload se preparan antes de la inferencia;
- `.index.json` registra el embedding del payload **después de ejecutar la fase**.

Por lo tanto:

1. el request persiste y transporta `.payload.json` más `.request.json`;
2. `.request.json` contiene un `request_manifest` pre-execution con hashes, evidencia y referencias;
3. `.index.json` canónico se genera al cerrar classification, después de aceptar/materializar el resultado;
4. no se introduce un estado pre/post mutable dentro del mismo `index.json`.

Esto evita presentar como final un índice incompleto y mantiene un único significado para el artefacto BISP canónico.

## 3. Layout normativo propuesto

```text
.classification/.turn_X/
├── .turn.json
├── .context_ing_plan.json
└── .files/
    └── .domain_resolution.json

.pipeline/.classification/.turn_X/
├── .payload.json
├── .request.json
├── .index.json                 # sólo al cerrar la fase
└── .response/
    ├── .raw_output.txt
    ├── .response.json
    ├── .report.json
    └── .staging/
```

`.request.json` es el envelope durable exacto entregado. `.response.json` es el envelope parseado, todavía no canónico para el dominio. `.report.json` registra validaciones, duplicados, quarantine y decisión de aceptación.

## 4. Envelope reusable `cognitive.request/1.0`

Campos requeridos:

| Campo | Regla |
|---|---|
| `contract_version` | Exactamente `cognitive.request/1.0` para este major. |
| `request_id` | UUID único por intento físico. |
| `logical_inference_id` | Identidad estable entre retries. |
| `correlation_id` | Identidad estable de conversación/stage/turn. |
| `attempt` | Entero ≥ 1. |
| `supersedes_request_id` | Requerido y no nulo para `attempt > 1`. |
| `intent` | Identidad del intent, stage y turn; datos opacos para el engine. |
| `operation` | `kind`, `input_contract`, `output_contract`. |
| `input` | Payload conforme a `ClassificationEvidence/1.0`. |
| `constraints` | Reglas explícitas que Brain validará. |
| `request_manifest` | Hashes/canonicalización del payload y archivos. |
| `simulation` | Configuración separada; nunca parte de objetivo/evidencia. |
| `created_at`, `metadata` | RFC3339 UTC y auditoría extensible. |

Instancia conceptual aprobable:

```json
{
  "contract_version": "cognitive.request/1.0",
  "request_id": "uuid",
  "logical_inference_id": "uuid",
  "correlation_id": "uuid",
  "attempt": 1,
  "supersedes_request_id": null,
  "intent": {
    "intent_id": "uuid",
    "intent_type": "ing",
    "mandate_id": "uuid",
    "stage": "classification",
    "turn": 1
  },
  "operation": {
    "kind": "classify_ingestion_material",
    "input_contract": "classification-evidence/1.0",
    "output_contract": "domain-resolution-proposal/1.0"
  },
  "input": {},
  "constraints": {},
  "request_manifest": {
    "canonicalization": "RFC8785",
    "hash_algorithm": "sha256",
    "payload_sha256": "64-lowercase-hex",
    "file_count": 1
  },
  "simulation": {"scenario_id": "classification.happy_path"},
  "created_at": "RFC3339",
  "metadata": {}
}
```

El engine sólo interpreta versiones, `operation`, `simulation` y datos necesarios para matching. No decide el significado de `intent.stage` ni valida reglas de Genesis.

## 5. `ClassificationEvidence/1.0`

```json
{
  "domain_baseline": "empty",
  "objective": {
    "instructions": "Proponer una resolución Raw → Domain → Gene"
  },
  "candidate_clusters": [
    {
      "candidate_cluster_id": "candidate-1",
      "files": [
        {
          "path": "src/auth/login.ts",
          "sha256": "64-lowercase-hex",
          "summary": "...",
          "symbols": [],
          "imports": []
        }
      ],
      "structural_relations": [],
      "semantic_scores": [],
      "candidate_domains": [],
      "candidate_genes": []
    }
  ]
}
```

Reglas formales:

- al menos un cluster y un archivo;
- cada path aparece exactamente una vez en la evidencia;
- no se transportan embeddings crudos;
- cada archivo tiene path relativo normalizado y sha256;
- candidatos existentes incluyen ID, nombre y score cuando el baseline los permite;
- con baseline `empty`, candidatos existentes deben estar vacíos;
- clusters son propuestas: la response puede aceptar, split, merge o reasignar.

## 6. Constraints `classification-constraints/1.0`

Campos booleanos requeridos:

```json
{
  "all_input_files_must_be_accounted_for": true,
  "allow_cluster_split": true,
  "allow_cluster_merge": true,
  "allow_new_domain": true,
  "allow_existing_domain": false,
  "allow_new_gene": true,
  "allow_existing_gene_extension": false,
  "allow_cross_domain_gene": false,
  "allow_global_domain_restructure": false
}
```

El Simulator reproduce estas restricciones en fixtures; Brain es la autoridad que las hace cumplir.

## 7. Envelope reusable `cognitive.response/1.0`

Campos requeridos: versión, identidades copiadas del request, `operation`, `response_kind`, outcome, completion, output opcional, fixture, timestamps y hash.

```json
{
  "contract_version": "cognitive.response/1.0",
  "request_id": "uuid",
  "logical_inference_id": "uuid",
  "correlation_id": "uuid",
  "intent": {
    "intent_id": "uuid",
    "intent_type": "ing",
    "stage": "classification",
    "turn": 1
  },
  "operation": "classify_ingestion_material",
  "response_kind": "domain_resolution_proposal",
  "outcome": "completed",
  "completion": {"terminal": true, "retryable": false},
  "output": {},
  "human_intervention": null,
  "error": null,
  "fixture": {"id": "classification.happy_path", "version": "1.0.0"},
  "produced_at": "RFC3339",
  "response_sha256": "64-lowercase-hex"
}
```

Outcomes normativos:

| Outcome | Output | Terminal para request | Acción posible de Brain |
|---|---|---:|---|
| `completed` | propuesta completa | Sí | validar/materializar |
| `continue` | preguntas/contexto requerido | Sí | abrir nuevo intercambio |
| `human_required` | ambigüedades/preguntas | Sí | Human Sync |
| `partial` | propuesta recuperable incompleta | Sí | persistir; no cerrar turno |
| `retryable_error` | sin propuesta autoritativa | Sí | nuevo request físico |
| `contract_error` | sin propuesta aceptable | Sí | corregir/fallar/quarantine |

Timeout y disconnect de transporte no se falsifican como contenido cognitivo: aparecen como estado de delivery/receipt y pueden impedir que exista un response envelope.

## 8. `DomainResolutionProposal/1.0`

```json
{
  "clusters": [
    {
      "cluster_id": "resolved-1",
      "source_candidate_ids": ["candidate-1"],
      "files": ["src/auth/login.ts"],
      "domain": {"status": "new", "domain_id": null, "name": "Identity and Access"},
      "genes": [
        {
          "status": "new",
          "gene_id": null,
          "name": "Authentication Lifecycle",
          "files": ["src/auth/login.ts"]
        }
      ],
      "confidence": 0.91,
      "rationale": "..."
    }
  ],
  "unresolved_files": [],
  "questions": []
}
```

Cobertura:

- unión disjunta de `clusters[].files` y `unresolved_files` = archivos del request;
- ningún archivo inventado, omitido o duplicado;
- cada archivo de un gene pertenece al cluster contenedor;
- todo cluster tiene al menos un gene y todo archivo resuelto pertenece al menos a uno;
- `source_candidate_ids` existen; permiten documentar split/merge;
- IDs existentes sólo pueden provenir de candidatos ofrecidos;
- baseline `empty` exige Domain/Gene `new` con IDs nulos;
- no puede expresar cross-domain ni reestructuración global;
- `questions` no decide Human Sync: Brain deriva el estado desde outcome y validación.

## 9. Validación y quarantine en Brain

Orden obligatorio:

1. persistir `.raw_output.txt` antes de parsear;
2. validar JSON/envelope/versiones;
3. validar request/logical/correlation/intent/stage/turn;
4. validar output contract y cobertura;
5. validar constraints de `ing`;
6. clasificar duplicate/late/superseded;
7. escribir `.response.json` y `.report.json`;
8. sólo entonces materializar `.domain_resolution.json` mediante escritura atómica;
9. generar `.index.json` y cerrar/avanzar según reglas de Brain.

Mismatch de identidad, respuesta conflictiva o contenido prohibido se conserva en staging/quarantine y jamás avanza el trabajo lógico.

## 10. Idempotencia y replay

- mismo `request_id` + mismo canonical hash → mismo pending/final;
- mismo `request_id` + hash distinto → `identity_conflict`;
- retry lógico → mismo `logical_inference_id`, nuevo `request_id`, `attempt + 1`, `supersedes_request_id`;
- duplicate idéntico → auditar y aplicar una vez;
- duplicate conflictivo → quarantine;
- late response → persistir; aplicar sólo si el trabajo sigue abierto y no existe resultado aceptado posterior;
- replay → devuelve exactamente fixture/version/request hash originales, sin nuevo avance lógico.

## 11. Fixtures y matching

Suite inicial: `classification.happy_path`, `continue`, `human_required`, `partial`, `invalid_shape`, `timeout`, `disconnect`, `duplicate`, `truncated`, `wrong_correlation`, `late_response`, `unknown_fixture`.

Cada fixture declara versión de schema, ID/SemVer, contratos soportados, matcher, assertions parciales, response template, timing/fault, resultado esperado y replay. Selección explícita por `simulation.scenario_id` gana. Sin selección explícita, matching usa operación + contratos + predicados; empate de misma prioridad/especificidad es error `ambiguous_fixture`.

Contrato D permanece en catálogo separado y no participa de este flujo.

## 12. Interfaz y ubicación

```text
submit(request) -> SubmitReceipt
get_result(request_id) -> Unknown | Pending | CognitiveResponse
cancel(request_id) -> CancelResult
capabilities() -> versions, limits, catalog hash
```

Primer corte recomendado: engine headless in-process detrás de una interfaz neutral. No TCP, HTTP, browser, Chrome, native host, AITAP u OpenCode. La prueba integrada Synapse se agrega después como adapter y sigue siendo requisito de aceptación global del Simulator distribuido.

## 13. Resultado durable fuera del contrato del Simulator

Brain, no Synapse, devuelve a Temporal:

```json
{
  "request_id": "uuid",
  "intent_id": "uuid",
  "stage": "classification",
  "turn": 1,
  "status": "completed",
  "next_action": "advance_to_consolidation",
  "result_ref": ".classification/.turn_1/.files/.domain_resolution.json"
}
```

`next_action` nunca aparece en la cognitive response.

## 14. Segunda intervención

No bloquea el primer milestone. Si existe feedback humano durante consolidation, la opción compatible inicial es una nueva operación/turn dentro de `consolidation.turn_X+1`; no se reabre classification mientras el runtime no soporte retroceso. Requiere contrato separado antes de implementarse.

## 15. Plan de archivos posterior al gate

1. schemas neutrales request/response;
2. schemas `ClassificationEvidence`, constraints y `DomainResolutionProposal`;
3. modelos/validator de Brain;
4. engine/matcher/faults/ledger Simulator;
5. adapter in-process;
6. catálogo de 12 fixtures;
7. persistencia de request/raw/response/report;
8. materializador Brain de `.domain_resolution.json`;
9. adapter integrado Synapse y superficies Workspace/Cortex;
10. tests de contrato, cobertura, idempotencia, restart y end-to-end.

## 16. Gate actualizado

La implementación requiere aprobar:

1. envelope neutral + payloads específicos versionados;
2. decisión `request_manifest` pre-execution / `index.json` post-fase;
3. reglas de cobertura y baseline vacío;
4. outcomes y separación de fallos de transporte;
5. layout `.pipeline/.classification/.turn_X/`;
6. engine in-process como primer corte;
7. resultado durable derivado exclusivamente por Brain;
8. segunda intervención diferida a contrato de consolidation;
9. confirmación de Mandate Genesis y Brain de que pueden producir/consumir estos shapes.

Primera aceptación posterior al gate:

```text
cognitive.request/1.0 classification.turn_1
→ classification.happy_path@1.0.0
→ cognitive.response/1.0 domain_resolution_proposal
→ replay byte-determinístico
→ Brain valida y produce .domain_resolution.json
```

**No se implementaron schemas ejecutables, engine, fixtures ni integración.** Este documento convierte la devolución del consumidor en un contrato de Etapa A para aprobación.
