# AITAP routing para Mandate Genesis y CLIS Integration

**Estado:** investigación arquitectónica; propuesta pendiente de aprobación  
**Fecha:** 2026-08-20  
**No autoriza implementación.**

## 1. Conclusión

AITAP puede participar en la selección de un runtime de ejecución sólo mediante
un **Routing Decision Contract** abstracto. No debe iniciar, pausar, cancelar ni
reanudar CLIs. Brain/Temporal solicitan y registran la decisión; Execution Layer
materializa la ejecución mediante adapters de CLIS Integration.

La taxonomía obligatoria es:

- **Intelligence Provider/Model:** produce inferencia cruda. AITAP selecciona y
  hace failover dentro de Intelligence Supply.
- **Execution Provider/Adapter:** ejecuta tools sobre un workspace (Codex CLI,
  Claude Code CLI, OpenCode). Execution Layer/CLIS Integration lo materializa.
- **Deterministic Counterpart:** fixture como Synapse Simulator. No es un
  provider de IA ni un CLI; puede participar en el piloto sólo como target de
  prueba explícito.

AITAP puede evaluar candidatos de las tres clases si se aprueba extender su
policy engine a un **selector de target abstracto**, pero la decisión debe ser
una recomendación/autorización acotada, no ownership de ejecución. La opción de
menor cambio para el piloto es que AITAP decida sólo `target_id` y que Temporal
autorice cuándo aplicar o reevaluar esa decisión.

## 2. Evidencia y estado actual

| Hecho | Estado | Evidencia |
|---|---|---|
| Brain conserva semántica y lifecycle BISP, pero aún llama providers directamente | Implementado/contradicción target | `CAF-001`; `COGNITUUM_RESPONSIBILITY_BOUNDARIES.md` §13 |
| AITAP no tiene motor de routing operativo | Scaffold | `installer/aitap/README.md`; `src/aitap/commands/route/route_status.py:7-24` |
| AITAP vigente selecciona provider/model de Supply, no executor CLI | Normativo | `installer/aitap/AGENTS.md`; `COGNITUUM_RESPONSIBILITY_BOUNDARIES.md` §§5-8 |
| Execution Layer tiene ubicación y schemas v1, pero no core/adapters/batería | Provisional/NOT_RUN | `installer/execution/README.md`; `COGNITUUM_EXECUTION_LAYER_CONFORMANCE_v1_0.md` §§2-6 |
| El package v1 ya porta checkpoint, capabilities, grant y correlación | Materializado, no integrado | `installer/execution/contracts/v1/execution-package.schema.json:7-67` |
| Result v1 distingue `paused` y referencias de Evidence | Materializado, no integrado | `installer/execution/contracts/v1/execution-result.schema.json:7-41` |
| Genesis usa Temporal con Activities para I/O y retry | Implementado | `mandate_genesis_build_workflow.go:87-140` |
| Genesis persiste Human Sync antes de firmar y avanzar | Implementado | `mandate_genesis_build_workflow.go:159-220` |
| La ejecución real del child workflow sigue pendiente | Abierto | `mandate_genesis_build_workflow.go:251-273` |
| Genesis invoca hoy Brain por subprocess para create/hydrate | Implementado | `mandate_genesis_activities.go:368-482` |
| CLIS Integration no tiene componente localizable con ese nombre | Abierto | relevamiento del árbol al 2026-08-20; los adapters previstos viven conceptualmente bajo `installer/execution/providers/` |

## 3. Findings nuevos

- **CAF-030 — CONTRADICCIÓN:** “AITAP elige executor” excede su contrato
  vigente. Puede cerrarse aprobando selección abstracta sin lifecycle.
- **CAF-031 — ABIERTO:** no existe un productor/consumidor integrado para los
  contratos Execution v1; los schemas no prueban comportamiento.
- **CAF-032 — ABIERTO:** CLIS Integration es ownership nominal, todavía sin
  ubicación o puerto implementado independiente de los adapters previstos.
- **CAF-033 — GAP:** `Execution Package` no incluye `logical_inference_id`,
  `attempt_id`, `routing_decision_ref` ni `idempotency_key`; son necesarios
  para correlación y swaps reproducibles.
- **CAF-034 — GAP:** `Execution Event` no expresa `checkpoint_id`, estado
  confirmado del workspace ni causalidad del intento; `checkpoint_ref` solo
  aparece en el siguiente package.
- **CAF-035 — ABIERTO:** EXC-007 no define todavía el punto durable de corte.
- **CAF-036 — RIESGO:** consultar health/métricas no determinísticas desde el
  código de workflow rompería replay de Temporal; debe hacerse en Activity y
  persistirse la decisión devuelta.

## 4. Arquitectura propuesta

```text
Brain (BISP, Intent, turn, validación)
  │ crea logical_inference_id + Execution Package
  ▼
Temporal workflow (transiciones/retries determinísticos)
  │ Activity: solicitar decisión
  ▼
AITAP Policy/Router
  ├─ snapshot versionado de capabilities/health
  ├─ policy versionada + overrides
  ├─ Vault reference + eligibility de credenciales
  └─ Accounting de decisión/consumo
  │ Routing Decision: target abstracto, razones, fallback
  ▼
Temporal persiste resultado de Activity y autoriza dispatch
  ▼
Execution Layer — puerto neutral
  └─ CLIS Integration adapter seleccionado
       ├─ Codex CLI
       ├─ Claude Code CLI
       ├─ OpenCode
       └─ Synapse Simulator (adapter de prueba, si se aprueba)
  │ Events / Result / Evidence
  ▼
Brain persiste, correlaciona y valida; Temporal decide la transición siguiente
```

AITAP nunca conoce comandos internos del CLI. Consume descriptores publicados
por Execution Layer y devuelve un `target_id`; Execution Layer resuelve ese ID
a un adapter local.

## 5. Ownership

| Responsabilidad/estado | Owner | No owner |
|---|---|---|
| Intent, BISP, Mandate, stage, turn, pending y validación | Brain | AITAP/CLIS |
| `logical_inference_id` y resultado lógico aceptado | Brain | AITAP |
| Workflow, retries, timers, signals y autorización de transición | Temporal | AITAP |
| Policy de routing y evaluación de candidatos | AITAP, si se aprueba CAF-030 | CLIS |
| Grants/scopes y autoridad para tools/workspace | Nucleus | AITAP |
| Secretos | Nucleus Vault | Brain/Temporal/AITAP/logs |
| Capability/health del runtime | Execution Layer/CLIS adapter | Brain |
| Lifecycle, `execution_id`, checkpoint y Evidence | Execution Layer | AITAP |
| Proceso/sesión/stream/cancelación/error nativo | CLIS adapter | AITAP/Brain |
| Métricas de Supply y decisión de routing | AITAP Accounting | Brain |
| Evidence de efectos técnicos | Execution Layer | AITAP Accounting |
| Override humano | humano autenticado; Nucleus autoriza; Temporal aplica | AITAP unilateralmente |

## 6. Contratos mínimos

### 6.1 Routing Request — Brain/Temporal → AITAP

```json
{
  "schema_version": "cognituum.routing/v1",
  "routing_request_id": "rr-uuid",
  "logical_inference_id": "li-uuid",
  "intent_ref": "intent://...",
  "stage": "cluster",
  "turn_id": "turn-uuid",
  "target_class": "execution_provider",
  "required_capabilities": ["filesystem.patch", "test.run"],
  "constraints": {"privacy": "local_or_approved_cloud", "max_cost": 1.0},
  "routing_mode": "forced|sticky|policy|failover|escalation",
  "sticky_decision_ref": null,
  "forced_target_id": "codex_cli",
  "excluded_targets": [],
  "policy_ref": "routing-policy://pilot-exc/1",
  "grant_ref": "grant://...",
  "override_ref": null
}
```

Brain entrega referencias y rasgos explícitos, nunca el BISP completo si no es
necesario. AITAP no interpreta contenido semántico libre para inferir el stage.

### 6.2 Routing Decision — AITAP → Brain/Temporal

```json
{
  "schema_version": "cognituum.routing/v1",
  "decision_id": "rd-uuid",
  "routing_request_id": "rr-uuid",
  "policy_version": "pilot-exc/1",
  "registry_snapshot_id": "cr-uuid",
  "selected": {"target_id": "codex_cli", "target_class": "execution_provider"},
  "candidates": [
    {"target_id": "codex_cli", "eligible": true, "score": null, "reason_codes": ["FORCED_MATCH"]},
    {"target_id": "claude_code_cli", "eligible": false, "score": null, "reason_codes": ["NOT_FORCED"]}
  ],
  "fallback_order": ["claude_code_cli", "synapse_simulator"],
  "valid_until": null,
  "decision_fingerprint": "sha256:...",
  "override_ref": null
}
```

El fingerprint cubre request canónico, policy version y registry snapshot. Una
reevaluación crea otro `decision_id`; nunca muta la decisión anterior.

### 6.3 Dispatch — Temporal/Brain → Execution Layer

Extender en una futura versión, no modificar silenciosamente v1:

- `logical_inference_id`: estable entre intentos físicos;
- `attempt_id`: único por dispatch;
- `idempotency_key`: estable para repetir el mismo intento;
- `routing_decision_ref` y `selected_target_id`;
- `precondition_checkpoint_ref` y hash de estado esperado.

El resto es `Execution Package`. El adapter recibe el package validado y una
credencial efímera/handle sólo cuando corresponde.

### 6.4 Capability Descriptor — CLIS → registry

```json
{
  "target_id": "codex_cli",
  "target_class": "execution_provider",
  "adapter_version": "...",
  "runtime_version": "...",
  "capabilities": ["filesystem.patch", "test.run", "checkpoint.external"],
  "transport": {"streaming": true, "cancel": true},
  "context": {"max_bytes": 1000000},
  "locality": "local",
  "credential_requirements": ["credential-ref://codex"],
  "conformance": "NOT_RUN",
  "health": {"state": "healthy", "observed_at": "...", "ttl_seconds": 30}
}
```

CLIS publica descriptores; AITAP no inspecciona binarios ni conoce flags.
Health expirado vuelve al candidato inelegible o fuerza una Activity de refresh.

### 6.5 Attempt Result — Execution Layer → Brain/Temporal

Debe correlacionar `logical_inference_id`, `attempt_id`, `execution_id`,
`decision_id`, status, checkpoint/evidence y efectos confirmados. Brain valida
la semántica; Temporal decide retry, switch o avance.

## 7. State machine

```text
READY
  → DECISION_REQUESTED
  → DECIDED
  → DISPATCH_AUTHORIZED
  → RUNNING
      ├─ COMPLETED → VALIDATING → ACCEPTED | REJECTED
      ├─ CHECKPOINTED → PAUSE_REQUESTED → PAUSED
      ├─ RETRYABLE_FAILURE → REEVALUATION_REQUESTED
      └─ FATAL_FAILURE | CANCELLED
PAUSED | RETRYABLE_FAILURE
  → DECISION_REQUESTED (nuevo decision_id)
  → RECOVERY_DISPATCHED (nuevo attempt_id, mismo logical_inference_id)
  → RUNNING
```

Reglas:

1. Sólo Temporal abre una reevaluación automática; un humano la solicita por
   signal y Nucleus valida autoridad. AITAP puede emitir health/circuit events,
   pero no cambia trabajo en vuelo.
2. No hay switch directo desde `RUNNING`: primero cancelación cooperativa,
   fencing del attempt anterior y checkpoint durable confirmado.
3. Si no se puede confirmar el cese, el intento queda `ORPHANED`; el siguiente
   sólo puede arrancar con un lease/fence que invalide escrituras tardías.
4. Un resultado tardío de un attempt cercado se conserva como Evidence pero no
   puede aplicarse al BISP.
5. Sticky routing conserva `decision_id` mientras sea elegible. Failover y
   escalation crean decisiones nuevas con causalidad explícita.

## 8. Piloto determinístico EXC-007/008

El piloto no usa scoring inteligente.

### Política `pilot-exc/1`

- Primera ejecución: `routing_mode=forced`, target `codex_cli`.
- Corte durable: después de un paso observable que produzca un diff parcial y
  pase un criterio intermedio predefinido. El fixture debe definir ese paso;
  queda sujeto a aprobación por CAF-035.
- Temporal solicita pausa; Execution Layer produce checkpoint content-addressed,
  Result `paused` y hashes del workspace.
- Temporal verifica que el attempt esté cercado y persiste refs.
- Segunda decisión forzada: `claude_code_cli`; mismo
  `logical_inference_id`, nuevo `attempt_id` y `decision_id`.
- EXC-008 repite exactamente el fixture sustituyendo sólo el segundo target por
  `synapse_simulator`.
- Éxito: mismo estado final, diff, checksums y aceptación; ninguna dependencia
  de session ID, transcript o memoria del primer CLI.
- Repetir recovery con la misma `idempotency_key` debe devolver el resultado ya
  confirmado o no-op, nunca duplicar efectos.

Synapse Simulator sólo es válido si implementa el mismo puerto neutral y no
recibe una excepción contractual por ser fixture.

## 9. Routing inteligente posterior

Evolución separada del piloto:

1. filtros duros: grant, capabilities, privacidad, conformance, health y límite
   de contexto;
2. preferencia determinística versionada: orden estable y desempate por
   `target_id`;
3. score sobre métricas congeladas en el registry snapshot: calidad por clase
   de tarea, costo, latencia y tasa de éxito;
4. aprendizaje/offline evaluation; una versión de modelo produce una policy
   nueva, nunca cambia retroactivamente una decisión;
5. exploración controlada sólo con policy explícita, seed persistida y budget.

La Activity obtiene métricas/health y calcula o solicita la decisión. El
workflow sólo consume el resultado serializado; durante replay no vuelve a
consultar AITAP.

## 10. Fallos, seguridad, observabilidad e idempotencia

| Riesgo | Regla |
|---|---|
| Doble ejecución por retry | `idempotency_key`, lease/fencing y effect ledger por attempt |
| CLI muere sin checkpoint | no hay swap recuperable; restaurar último checkpoint confirmado o fallar |
| Evento fuera de orden | secuencia monotónica y deduplicación por `(execution_id, sequence)` |
| Health cambia tras decidir | decisión conserva snapshot; Temporal decide reevaluar antes de dispatch |
| Credencial expuesta | Vault entrega handle request-scoped directo al adapter; redacción obligatoria |
| Override no autorizado | identidad, motivo, expiry y grant; signal Temporal + audit ref |
| Policy no reproducible | policy y snapshot inmutables, fingerprint y reason codes |
| Resultado tardío | attempt fencing; Evidence sí, aplicación no |
| Contexto incompatible | filtro previo por tamaño/modalidad; error `CAPABILITY_MISMATCH` |
| AITAP caído | retry de Activity; sticky decision vigente sólo si policy lo permite |

Eventos mínimos: `routing.requested`, `routing.decided`,
`routing.overridden`, `execution.dispatched`, `execution.checkpointed`,
`execution.fenced`, `execution.recovered`, `execution.accepted/rejected`.
Todos correlacionan mandate/intent/turn/logical inference/attempt/decision.

Accounting de AITAP registra evaluación, provider/model si hubo Supply,
tokens/costo/latencia/outcome. Evidence de Execution registra efectos, tools,
diffs y tests. No se fusionan ambos stores; se enlazan por referencias.

## 11. Contradicciones y aprobaciones requeridas

1. **Aprobar o rechazar CAF-030:** ampliar AITAP desde routing de Supply a
   selector abstracto multi-clase. Recomendación: aprobar con los límites de
   este documento.
2. **Definir nombre y ownership:** CLIS Integration debería materializarse como
   adapters de `installer/execution/providers/`, no como cuarta capa paralela,
   salvo evidencia que justifique otro componente.
3. **Versionar Execution contracts:** agregar IDs de routing/intento y fencing
   exige v2 o una reconciliación formal; no alterar v1 silenciosamente.
4. **Aprobar el corte EXC-007:** paso concreto, criterios intermedios y fixture.
5. **Decidir Synapse Simulator:** adapter de prueba de Execution o Cognitive
   Counterpart. No puede ocupar ambos roles implícitamente.
6. **Definir autoridad de policy:** AITAP evalúa; Nucleus autoriza policy/grant;
   Temporal aplica. Falta cerrar repositorio y firma de policies.
7. **Resolver reconciliación vigente:** el gate de
   `COGNITUUM_EXECUTION_RECONCILIATION_2026-08-20.md` sigue bloqueando batería y
   promoción de schemas.

## 12. Plan por etapas

| Etapa | Resultado | Gate |
|---|---|---|
| 0. Aprobación | decisiones §11 cerradas | **No escribir código antes de este gate** |
| 1. Contratos | routing v1, capability descriptor y Execution v2/reconciliado | schemas + fixtures aprobados |
| 2. Piloto falso | AITAP policy determinística y registry estático; adapters fake | replay/idempotencia sin CLIs |
| 3. CLIS adapters | Codex y Claude detrás del puerto neutral | EXC-001..006 por adapter |
| 4. Swap | pausa, fencing, checkpoint y recovery | EXC-007..010, tres corridas |
| 5. Synapse | mismo caso con segundo target Synapse | igualdad de outputs/checksums |
| 6. Inteligente | métricas, scoring versionado, circuit breaker y overrides | shadow decisions antes de activar |

Mandate Genesis consume únicamente una interfaz abstracta de contraparte/
ejecución. CLIS Integration implementa adapters. AITAP decide elegibilidad y
preferencia bajo policy; nunca absorbe la orquestación.

