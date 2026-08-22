# AITAP–Executor Boundary Package para E0

**Estado:** propuesta contractual para aprobación de Architecture/José  
**Versión:** 1.0  
**Fecha:** 2026-08-20  
**Implementación autorizada:** no  
**Executor/runtimes ejecutados:** no

## 1. Resumen ejecutivo

AITAP produce una **selección abstracta y autoritativa dentro de una Policy ya
autorizada**. No es una mera lista de candidatos, pero tampoco es autoridad de
dispatch: Temporal decide cuándo solicitar, persistir, usar o reevaluar la
decisión. Executor puede rechazar una decisión expirada, incompatible o no
autorizable; nunca sustituye silenciosamente el runtime o la inteligencia.

La decisión conserva dos dimensiones ortogonales:

```text
runtime_id + runtime_kind
provider/backend + model + credential_ref + accounting_ref
```

Executor resuelve `runtime_id` a una instalación local. `installation_ref`,
paths, argumentos, puertos, passwords y session IDs no forman parte de la
decisión AITAP.

El paquete E0 de Executor es compatible en ownership y flujo general, con tres
reconciliaciones necesarias antes de Gate Contracts:

1. retirar `installation_ref` de la superficie AITAP y mantenerlo interno a
   Executor;
2. adoptar `logical_execution_id` para Execution Routing; no reutilizar
   `logical_inference_id` como identidad física/lógica de ejecución;
3. cerrar un Capability Descriptor sanitizado con versiones, trust, TTL,
   locality y mediación de inteligencia.

## 2. Ownership matrix

| Responsabilidad | Owner | Consumidor/colaborador | Prohibición |
|---|---|---|---|
| Intent/BISP/Mandate/stage/turn | Brain | Temporal/AITAP por refs mínimas | AITAP no recibe BISP completo |
| Request y selección de routing | AITAP | Temporal, Executor | no dispatch ni ejecución |
| Policy/Grant/override | Nucleus | AITAP/Temporal/Executor | AITAP no autoautoriza |
| Secretos permanentes | Nucleus Vault | broker autorizado | AITAP sólo conserva refs |
| Workflow/replay/reevaluación/swap | Temporal | Brain/AITAP/Executor | AITAP no cambia trabajo en vuelo |
| Discovery/trust/compatibility | Executor | AITAP recibe descriptor sanitizado | AITAP no recibe paths |
| Adapter/proceso/sandbox/workspace | Executor | runtime | AITAP no participa |
| Attempt/execution/checkpoint/fence | Executor | Temporal/Brain por refs | AITAP no posee lifecycle técnico |
| Routing e Inference Accounting | AITAP | consumidores/auditoría | no almacenar Evidence |
| Execution Evidence/promoción | Executor | Brain/Nucleus | no fusionar con Accounting |
| BSIP Response | Brain/Alfred | Execution Package posterior | AITAP/Executor no parsean |

## 3. Routing Request candidato definitivo

Contrato owner AITAP, productor Brain/Temporal mediante Activity. No contiene
BISP, prompt, comandos, secrets, paths físicos o estado de sesión.

```json
{
  "schema_version": "cognituum.routing/v2-candidate",
  "routing_request_id": "rr-opaque",
  "logical_execution_id": "lex-opaque",
  "correlation": {
    "mandate_ref": "mandate://...",
    "action_ref": "action://...",
    "intent_ref": "intent://...",
    "turn_ref": "turn://..."
  },
  "stage": "dev",
  "routing_mode": "policy|sticky|forced|failover|escalation|recovery",
  "runtime_requirements": {
    "capabilities": ["filesystem.patch", "test.run"],
    "locality": ["local"],
    "allowed_runtime_kinds": ["first_party_runtime", "external_runtime"],
    "forced_runtime_id": null,
    "excluded_runtime_ids": []
  },
  "intelligence_requirements": {
    "required": true,
    "capabilities": ["text.generate", "structured_output"],
    "allowed_privacy": ["local", "approved_cloud"],
    "allowed_providers": [],
    "forced_provider": null,
    "forced_model": null,
    "max_cost": {"amount": 1.0, "currency": "USD"},
    "max_latency_ms": 120000
  },
  "sticky_decision_ref": null,
  "policy_ref": "routing-policy://.../version",
  "grant_ref": "grant://...",
  "override_ref": null,
  "excluded_decision_refs": []
}
```

Reglas:

- `logical_execution_id` es durable entre retry/swap. Un Supply Request puro
  puede conservar `logical_inference_id` en su contrato propio; no se mezclan.
- `grant_ref` permite filtrar elegibilidad, pero AITAP no interpreta ni amplía
  capacidades fuera de la proyección autorizada entregada por Nucleus.
- forced routing requiere runtime y, si `required=true`, provider/model o una
  regla policy inequívoca para resolverlos.
- sticky routing referencia una decisión previa; no copia estado privado.
- locality, privacidad, costo y latencia son constraints explícitas, nunca
  inferidas leyendo el Intent.

## 4. Routing Decision candidato definitivo

```json
{
  "schema_version": "cognituum.routing/v2-candidate",
  "decision_id": "rd-opaque",
  "routing_request_ref": "routing-request://...",
  "logical_execution_id": "lex-opaque",
  "correlation": {
    "mandate_ref": "mandate://...",
    "action_ref": "action://...",
    "intent_ref": "intent://...",
    "turn_ref": "turn://..."
  },
  "status": "selected|denied|no_eligible_target|expired|superseded",
  "policy_ref": "routing-policy://.../version",
  "registry_snapshot_ref": "routing-registry://...",
  "runtime": {
    "runtime_id": "opencode",
    "runtime_kind": "first_party_runtime"
  },
  "effective_intelligence": {
    "backend_id": "anthropic_api",
    "provider": "anthropic",
    "model": "model-id",
    "credential_ref": "credential-ref://...",
    "accounting_ref": "accounting://inference/..."
  },
  "runtime_candidates": [],
  "intelligence_candidates": [],
  "reason_codes": ["POLICY_MATCH"],
  "fallback_order": {
    "runtime_ids": ["codex_cli"],
    "backend_ids": ["openai_api"]
  },
  "override_ref": null,
  "valid_until": "2026-08-20T12:00:00Z",
  "fingerprint": "sha256:...",
  "routing_accounting_ref": "accounting://routing/..."
}
```

Cada candidato contiene ID, eligibility, reason codes y descriptor fingerprint;
no contiene score si la policy determinística no usa scoring. Una reevaluación
crea otro `decision_id`, enlaza causalidad con la anterior y nunca la muta.

`installation_ref` queda excluido. Executor lo crea/resuelve internamente una
vez validada la decisión.

## 5. Capability Descriptor Executor → AITAP

```json
{
  "schema_version": "cognituum.runtime-capability/v2-candidate",
  "runtime_id": "opencode",
  "runtime_kind": "first_party_runtime",
  "adapter_version": "opaque-version",
  "runtime_version": "opaque-version",
  "contract_versions": ["cognituum.execution/v2"],
  "capabilities": ["filesystem.patch", "test.run", "checkpoint.external"],
  "transport": {"streaming": true, "pause": true, "cancel": true},
  "context_limits": {"max_input_bytes": 1000000},
  "locality": "local",
  "trust": "VERIFIED_VENDOR",
  "conformance": "NOT_RUN",
  "health": {
    "state": "healthy|degraded|unavailable|unknown",
    "observed_at": "2026-08-20T00:00:00Z",
    "ttl_seconds": 30
  },
  "compatibility": "compatible|incompatible|unknown",
  "intelligence_mediation": {
    "supported": true,
    "backend_ids": ["anthropic_api", "openai_api"],
    "provider_model_explicit": true
  },
  "descriptor_fingerprint": "sha256:...",
  "publisher": "executor"
}
```

Nunca publica binary path, argv, session ID, runtime-home, canonical workspace,
secret, environment, transcript, puerto o password. Para Codex/Claude el nombre
del CLI no determina por sí solo provider/model; la combinación sólo es elegible
si el descriptor declara que puede materializar la inteligencia seleccionada.

Health vencido por TTL equivale a `HEALTH_EXPIRED`, no a healthy. Un fixture
usa `publisher=executor_fixture`, health `unknown` y jamás se presenta como
observación productiva.

## 6. Correlación y fingerprint

Cadena mínima:

```text
mandate/action/intent/turn
  └─ logical_execution_id
      ├─ routing_request_id
      ├─ decision_id
      ├─ routing_accounting_ref
      └─ Executor crea attempt_id + execution_id
          ├─ checkpoint_ref/fence_token
          ├─ inference_accounting_ref
          └─ evidence_refs
```

Fingerprint cubre la representación canónica de:

1. Routing Request completo;
2. Policy identificada por contenido/version/fingerprint;
3. registry snapshot congelado y sus descriptor fingerprints;
4. runtime ID/kind seleccionado;
5. backend/provider/model y Credential Reference seleccionados;
6. override ref y grant ref aplicables;
7. algoritmo y versión de canonicalización.

No cubre timestamps de emisión generados después del cálculo, paths, secrets,
health consultado fuera del snapshot o IDs físicos todavía inexistentes.

Para replay, Temporal persiste request, decision, policy ref/fingerprint,
snapshot ref/fingerprint y resultado de la Activity. El workflow no vuelve a
consultar health ni recalcula la decisión durante replay.

## 7. State transitions de decisión

```text
REQUESTED
  → EVALUATING
  → SELECTED | DENIED | NO_ELIGIBLE_TARGET
SELECTED
  → CONSUMED | EXPIRED | SUPERSEDED
EXPIRED | SUPERSEDED | runtime/provider failure
  → Temporal solicita nueva REQUESTED
```

- AITAP no pasa una ejecución a RUNNING ni la pausa/cancela.
- Temporal decide reevaluación y autoriza dispatch/retry/swap.
- AITAP puede publicar health/circuit events; no actúa sobre attempts activos.
- sticky reutiliza la selección sólo si policy, grant, TTL y snapshot lo
  permiten. La decisión persiste; su validez no se prolonga por mutación.
- failover, escalation, recovery y override crean una decisión nueva.

## 8. Accounting y Evidence

| Registro | Owner | Contenido |
|---|---|---|
| Routing Accounting | AITAP | request/decision, policy, snapshot, candidatos, razones, runtime, provider/model, override, latencia de decisión, outcome |
| Intelligence Supply Accounting | AITAP | consumidor, provider/model efectivo, credential ref, tokens, costo, latencia, finish/outcome |
| Execution Evidence | Executor | attempt/execution, runtime, tool events, snapshots, diff, hashes, tests, checkpoint, promoción |

Los tres se enlazan con refs opacas. Executor transporta/valida Accounting refs,
pero no calcula tokens/costo. AITAP no ingiere diff, tool events o Evidence para
decidir semántica.

## 9. Routing errors estables

AITAP propone usar el Error Envelope común `cognituum.error/v1`, sin apropiarse
del catálogo Executor:

| Código | Retryable típico | Significado |
|---|---:|---|
| `NO_ELIGIBLE_RUNTIME` | sí | filtros dejan cero runtime |
| `CAPABILITY_MISMATCH` | no | capabilities requeridas no disponibles |
| `POLICY_DENIED` | no | policy prohíbe combinación |
| `GRANT_INSUFFICIENT` | no | grant no cubre requisitos |
| `HEALTH_EXPIRED` | sí | observación fuera de TTL |
| `RUNTIME_UNTRUSTED` | no | trust insuficiente |
| `RUNTIME_INCOMPATIBLE` | no/sí tras update | incompatibilidad publicada |
| `PROVIDER_UNAVAILABLE` | sí | backend/model no saludable |
| `CREDENTIAL_UNAVAILABLE` | sí o intervención | ref no resoluble/autorizable |
| `ROUTING_DECISION_EXPIRED` | sí | `valid_until` vencido |
| `ROUTING_CONFLICT` | no | forced/sticky/policy incompatibles |
| `OVERRIDE_UNAUTHORIZED` | no | override sin autoridad Nucleus |

Fields mínimos: `code`, safe message, `retryable`, phase=`ROUTING`, correlation
refs y safe refs. No incluir secretos, paths o causas nativas.

## 10. Estado real y gaps

| Superficie | Estado | Gap |
|---|---|---|
| Boundary/ownership | `IMPLEMENTADO` documental | sujeto a aprobación E0 |
| schemas AITAP routing v2 actuales | `PARCIAL` | faltan logical execution/correlation, locality, cost, latency, grant/policy refs, status/TTL/trust/versions |
| engine determinístico | `PARCIAL` | fixture only; sin Nucleus, Executor, Vault o Accounting store real |
| registry v2 | `PARCIAL` | simulado; health/compatibility `unknown` |
| Capability publication Executor | `TARGET` | Executor E0 diseño, no código |
| Vault/Credential resolution | `TARGET` | refs solamente |
| Routing Accounting | `PARCIAL` | schema/ref; store/event writer pendiente |
| Intelligence Supply | `TARGET` | providers reales no integrados |
| Temporal Activity/consumer | `TARGET` | no integrado |
| CLI routing | `PARCIAL/NOT_RUN E2E` | comando existe; dependencia Typer no disponible en última validación |
| Executor project/adapters | `NOT_RUN` | correctamente fuera de AITAP |
| EXC-007/008 | `NOT_RUN` | depende de gates Executor |

No se debe presentar AITAP como motor operativo end-to-end: hoy existen un
motor puro y fixtures, no integración durable con Nucleus/Temporal/Executor.

## 11. Decisiones abiertas

1. Repositorio, firma, distribución y revocación de Routing Policies por
   Nucleus.
2. Forma de la proyección de Grant que AITAP puede evaluar sin absorber
   autorización.
3. TTL/clock authority y tratamiento de health `degraded`.
4. Si `credential_ref` viaja en Routing Decision general o en una proyección
   audience-specific hacia Credential Broker.
5. Momento de creación de `routing_accounting_ref` e
   `inference_accounting_ref` cuando aún no ocurrió inferencia.
6. Catálogo model/backend real y versionado; fixtures actuales no son
   aprobación productiva.
7. Rol futuro de Synapse Simulator: no es runtime hasta decisión Architecture.
8. Algoritmo canónico compartido y URI final de schemas/error envelope.

## 12. Requisitos para Executor E0

Executor debe incorporar o preservar:

1. consumo de `decision_id`, `logical_execution_id`, runtime ID/kind,
   effective intelligence y Accounting refs;
2. resolución interna `runtime_id → installation_ref`; nunca pedir a AITAP
   paths o discovery data;
3. publicación sanitizada del descriptor §5 con trust/health TTL/conformance/
   compatibility y fingerprint;
4. validación al dispatch de vigencia, runtime ID/kind y descriptor snapshot;
5. rechazo seguro que devuelva error estable y provoque reevaluación por
   Temporal, sin elegir fallback local;
6. correlación de attempt/execution/Evidence con decision y logical execution;
7. preservación visible de provider/model efectivo en refs de Accounting y
   Evidence, sin atribuirlo a OpenCode;
8. Credential Broker audience-specific; nunca serializar secret;
9. no importar policy/candidates/costs completos a Runtime Projection;
10. no agregar `SelectRuntime`, `SelectModel` ni fallback silencioso.

## 13. Decision Package para Architecture

### Recomendar aprobación

- AITAP produce selección, no recomendación ni dispatch.
- Temporal es único disparador de reevaluación operacional.
- Executor resuelve instalación y puede rechazar, nunca sustituir.
- `logical_execution_id` es identidad de Execution Routing; Supply mantiene su
  identidad propia.
- descriptor sanitizado y catálogo de errores de §§5/9.
- separación de los tres registros: Routing Accounting, Inference Accounting y
  Execution Evidence.

### Requiere decisión explícita

1. aprobar forma cross-system candidata de Request/Decision/Descriptor;
2. retirar `installation_ref` de la muestra E0 §6.2 o declararlo estrictamente
   como proyección interna posterior a AITAP;
3. aprobar policy repository/signature y Grant projection;
4. aprobar TTL/clock authority y tratamiento de degraded/unknown;
5. aprobar audiencia de Credential Reference;
6. resolver Synapse Simulator;
7. armonizar `logical_inference_id` V2 actual con `logical_execution_id` E0;
8. aprobar versionado/canonicalización y referencias del Error Envelope.

### Contradicción documental a corregir

`AITAP_Arquitectura_Grifo_Orquestadores_v1_0.md` §6 todavía afirma que Brain
invoca OpenCode localmente. La decisión superior vigente asigna toda
materialización de runtimes a Executor. Debe marcarse esa sección histórica o
supersedida; AITAP no la corrige silenciosamente en esta revisión.

## 14. Reporte breve para José

La frontera es viable y E0 puede avanzar en diseño, pero no debería aprobarse
sin tres correcciones: `installation_ref` debe ser interno a Executor;
Execution Routing debe correlacionar por `logical_execution_id`; y el Runtime
Capability Descriptor debe incorporar trust, versiones, locality, TTL y
mediación explícita de backend/model. AITAP selecciona el par runtime +
inteligencia bajo policy autorizada; Temporal decide cuándo usar o reevaluar;
Executor resuelve e implementa o rechaza, nunca reemplaza. Estado actual:
contratos/motor `PARCIAL`, integrations `TARGET`, runtimes y EXC `NOT_RUN`.

AITAP queda a la espera de aprobación de José/Architecture. Este paquete no
modificó Executor, no creó adapters y no ejecutó runtimes.
