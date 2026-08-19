# Synapse Simulator — paquete contractual v1

**Estado:** candidato definitivo de Etapa A. No es implementación.  
**Consumidor de referencia:** Brain para `ing/classification/turn_1`; Mandate Genesis consume únicamente el resultado durable de Brain.

## Contenido

- `cognitive-request.schema.json`: envelope reusable de intento físico.
- `cognitive-response.schema.json`: envelope reusable de respuesta cognitiva.
- `classification-evidence.schema.json`: input versionado específico de la operación inicial.
- `domain-resolution-proposal.schema.json`: output versionado específico.
- `fixture.schema.json`: contrato data-only para catálogo, matching, timing y faults.
- `SYNAPSE_SIMULATOR_ING_Classification_Contract_v0_3.md`: semántica, cobertura, idempotencia, layout y gate.

Los schemas usan JSON Schema Draft 2020-12. Las referencias relativas se resuelven desde esta carpeta. `format: uuid` y `format: date-time` deben habilitarse como assertions en el validador de Brain; no basta con anotarlas.

## Límites del JSON Schema

JSON Schema valida shape local. Brain debe aplicar además reglas relacionales que no se expresan de forma segura en estos archivos:

- unicidad global de paths entre clusters;
- cobertura exacta input = resolved ∪ unresolved;
- pertenencia de archivos de genes a su cluster;
- IDs existentes ofrecidos por el request;
- constraints de baseline y prohibición cross-domain/global restructure;
- igualdad de identidades entre request y response;
- hashes RFC 8785 sobre documentos excluyendo su propio campo hash;
- duplicate, late, superseded y quarantine.

Estas reglas están especificadas en las secciones 8–10 del contrato v0.3 y deben tener tests independientes.

## Relación entre primer corte e integración Synapse

No son arquitecturas competidoras ni dos implementaciones semánticas.

```text
Nivel 1 — conformance headless
Brain adapter → CognitiveCounterpart interface → fixture engine in-process

Nivel 2 — aceptación integrada
Workspace → SynapseBridge → Brain adapter → misma interface/engine
          → bloom-host/Native Messaging → Cortex Simulator → retorno
```

El primer corte in-process fija contratos, matching, outcomes, idempotencia y persistencia sin introducir incertidumbre de transporte. No permite declarar terminado el Simulator distribuido.

La integración posterior debe envolver la **misma** interfaz y los mismos envelopes; no puede crear un segundo contrato para Cortex. El engine puede permanecer en Brain o extraerse, pero Workspace y Cortex deben observar el mismo `request_id`, `logical_inference_id`, `correlation_id`, ACK/pending/final y response hash.

### Gates separados

**Gate A — implementación del núcleo:** se abre tras aceptación contractual de Brain y Genesis. Autoriza schemas runtime, engine, fixtures y adapter in-process.

**Gate B — aceptación del Simulator distribuido:** requiere recorrido real Workspace–Synapse–Cortex–retorno, con al menos happy path, wrong correlation, timeout, duplicate y late response. Gate A verde no implica Gate B verde.

La entrega completa no puede declararse terminada hasta Gate B.

## Matriz de conformidad mínima

| Caso | In-process | Synapse integrado |
|---|---:|---:|
| Schema request/response | Obligatorio | Obligatorio |
| Matching determinístico | Obligatorio | Reutiliza resultado |
| Replay byte-determinístico | Obligatorio | Verifica identidad/hash |
| Cobertura y baseline vacío | Brain | Brain |
| Timeout lógico | Obligatorio | Obligatorio |
| Disconnect/framing/ACK | Simulación limitada | Evidencia real obligatoria |
| Duplicate/late response | Obligatorio | Obligatorio |
| Persistencia/restart | Obligatorio | Obligatorio |
| UI Workspace/Cortex opcional para unit tests | Sí | No: ambas superficies participan |

## Solicitud formal de aceptación a Brain

Brain debe responder `ACCEPTED` o enumerar discrepancias concretas para:

1. puede producir `ClassificationEvidence/1.0` sin embeddings crudos;
2. puede canonicalizar RFC 8785 y calcular/verificar sha256;
3. puede persistir `.request.json`, raw antes de parsear, `.response.json` y `.report.json`;
4. puede validar identidad, cobertura, IDs ofrecidos y constraints;
5. puede materializar atómicamente `.domain_resolution.json`;
6. acepta `request_manifest` pre-execution y `.index.json` sólo post-fase;
7. puede hacer exactly-once lógico ante duplicate/replay/late response;
8. puede derivar el resultado durable y `next_action` sin recibirlo del Simulator;
9. acepta la interfaz `submit/get_result/cancel/capabilities`.

## Solicitud formal de aceptación a Mandate Genesis

Genesis debe responder `ACCEPTED` o enumerar discrepancias concretas para:

1. `ing/classification/turn_1`, baseline `empty`, es la primera frontera;
2. Genesis invoca Brain y no Synapse directamente;
3. espera un resultado durable de Brain, no ACK ni cognitive response cruda;
4. `next_action` pertenece a Brain/Temporal, nunca al Simulator;
5. los outcomes cubren continue, Human Sync, partial, retry y terminal error;
6. la segunda intervención en consolidation queda fuera del primer milestone;
7. la aceptación inicial es happy path + replay + `.domain_resolution.json` utilizable.

## Estado del gate

El paquete contractual está listo para revisión. El Gate A permanece cerrado hasta recibir ambas respuestas. No se crearon modelos runtime, validators, fixtures, engine, adapters ni cambios de workflow.
