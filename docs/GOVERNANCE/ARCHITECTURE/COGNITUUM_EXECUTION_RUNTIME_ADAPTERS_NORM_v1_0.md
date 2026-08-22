# Cognituum — Execution Layer y Runtime Adapters

**Estado:** norma arquitectónica cerrada; habilitada para planificación  
**Versión:** 1.0  
**Fecha:** 2026-08-20  
**Plano:** Execution Layer  
**Aplicación implementadora:** Executor (`installer/executor/` target)

## 1. Autoridad y alcance

Esta norma capitaliza el handoff de Architecture a CLIS Integration. Cierra
ownership, topología, aislamiento, promoción, continuidad y conformidad. No
promueve contratos provisionales v1 a implementados ni declara runtimes
conformes sin evidencia ejecutada.

Una modificación de estas decisiones vuelve a Architecture mediante propuesta
explícita. Un adapter no puede introducirla silenciosamente.

## 2. Decisión central

Executor será el servicio first-party persistente que materializa Execution
Layer. Los
Runtime Adapters son módulos internos, pero cada runtime corre en procesos
separados.

- OpenCode: `runtime_id=opencode`, `runtime_kind=first_party_runtime`.
- Codex CLI: `runtime_id=codex_cli`, `runtime_kind=external_runtime`.
- Claude Code CLI: `runtime_id=claude_code_cli`,
  `runtime_kind=external_runtime`.
- Los tres satisfacen un único `runtime_port` neutral.
- Cada attempt opera en un workspace efímero privado.
- Ningún runtime accede o escribe directamente al workspace canónico.
- Sólo Promotion Engine puede promover efectos, bajo Grant y fence vigente.

```text
Brain → Temporal → Execution Layer Service
                       ├─ Coordinator
                       ├─ Workspace/Sandbox/Credential Brokers
                       ├─ Snapshot/Evidence/Promotion
                       └─ Runtime Adapter Host
                            ├─ OpenCode → worker opencode serve
                            ├─ Codex → codex exec child
                            └─ Claude → claude child
```

## 3. Runtime e inteligencia son dimensiones ortogonales

AITAP puede seleccionar runtime abstracto y, por separado, Intelligence
Provider/Backend y modelo. OpenCode nunca reemplaza la identidad del backend
efectivo. Vault, privacidad, Accounting y Evidence deben conservar:

```json
{
  "runtime": {"runtime_id": "opencode", "runtime_kind": "first_party_runtime"},
  "effective_intelligence": {
    "provider": "anthropic",
    "model": "claude-...",
    "credential_ref": "credential-ref://..."
  }
}
```

Quedan prohibidas `opencode_intelligence` y `opencode_execution`.

## 4. Ownership

| Responsabilidad | Owner |
|---|---|
| Intent/BISP/Mandate/stage/turn/pending, parseo y validación | Brain |
| Execution Package neutral | Brain |
| Workflow, dispatch, pausa, retry, swap y transición | Temporal |
| Selección abstracta de runtime y provider/model | AITAP |
| Routing/Inference Accounting | AITAP |
| Policy, Grant, scopes y overrides | Nucleus |
| Secretos | Nucleus Vault |
| Lifecycle técnico, workspace efímero y ejecución | Execution Layer |
| `execution_id`, `attempt_id`, eventos y checkpoints | Execution Layer |
| Snapshot, diff, hashes, Evidence y promoción | Execution Layer |
| Protocolo, proceso y stream nativos | Runtime Adapter |

AITAP y adapters nunca interpretan BSIP Response. Brain no importa formatos
nativos ni depende de session IDs. Execution Layer no decide semántica ni
selecciona el provider de inteligencia.

## 5. Flujo contractual

```text
raw provider response
→ Brain persiste raw
→ Brain parsea/valida Contrato D e incorpora al BISP
→ Execution Package neutral
→ Runtime Execution Projection minimizada
→ Runtime Adapter
→ Execution Result + Evidence
```

BSIP Response es decisión validada; Execution Package es instrucción portable;
Runtime Projection es la vista mínima vendor-specific; Result describe efectos;
Evidence los prueba.

## 6. Identidad, idempotencia y fencing

Contratos futuros distinguen:

- `mandate_id`, `intent_id`, `turn_id`;
- `logical_execution_id`, durable entre retries y swaps;
- `routing_decision_id`;
- `attempt_id` y `execution_id` físicos;
- `runtime_session_ref`, sólo Evidence;
- `checkpoint_ref`, `idempotency_key` y `fence_token`.

Un swap conserva mandate/intent/turn cuando corresponda y
`logical_execution_id`; crea routing decision, attempt, execution, fence y
runtime session nuevos. Sólo el fence vigente publica o promueve. Resultados
tardíos se preservan como Evidence y nunca se aplican.

## 7. Runtime Execution Projection

La proyección v1 contiene execution/attempt/logical IDs, objetivo, modo,
operaciones, constraints, allowed/forbidden paths, capabilities, acceptance
criteria, governed checks y prior checkpoint. Excluye secretos, costos,
candidates, policy interna, identidad innecesaria, paths canónicos externos,
comandos arbitrarios, session IDs previos e información de otros Intents.

## 8. Execution root y contención

```text
execution-root/{execution_id}/
├─ workspace/
├─ runtime-home/
├─ tmp/
├─ control/
├─ events/
├─ snapshots/
├─ evidence/
└─ outputs/
```

Workspace Broker verifica hashes, materializa inputs, normaliza paths, controla
symlinks/hardlinks/reparse points, aplica ACL/ownership y entrega un handle
opaco. HOME/USERPROFILE y TEMP/TMP se reemplazan. El runtime no conoce el path
canónico. El working tree real nunca es sandbox.

Sandbox Broker expone `prepare`, `start`, `signal_cancel`, `terminate_tree`,
`inspect` y `dispose`. Windows usa restricted token, identidad no administrativa,
Job Object kill-on-close, ACL, root/home/temp aislados y network policy. Linux
usa namespaces, root read-only, seccomp, cgroups y network isolation. macOS debe
preservar el puerto aunque su backend llegue después.

## 9. Snapshot, diff, scope y promoción

Snapshot Engine es externo al runtime: recorrido final completo, SHA-256 sobre
bytes reales, paths relativos, sin seguir symlinks fuera del root y sólo tras
detener el árbol de procesos. File watchers son telemetría.

El diff canónico deriva de snapshots y contenidos before/after. Diffs nativos
son Evidence auxiliar. Un cambio fuera del allowlist invalida todo el attempt;
no hay promoción parcial tras scope violation.

Promotion Engine, único escritor canónico, verifica fence, preconditions,
concurrencia y Grant; aplica atómica/transaccionalmente, recalcula hashes,
ejecuta checks y registra Evidence. v1 no realiza merge semántico automático.

Errores mínimos: `PRECONDITION_CONFLICT`, `SCOPE_VIOLATION`, `FENCE_REVOKED`,
`PROMOTION_FAILED` y `POSTCONDITION_MISMATCH`.

## 10. Credential Broker

El package no contiene secretos. El camino preferido usa token opaco por
attempt hacia un proxy local que resuelve Vault/provider con TTL, audience,
revocación, Accounting, filtrado y rate limit. Si el runtime necesita consumir
una credencial directamente, el fallback la materializa sólo en runtime-home,
con ACL, environment filtrado, redacción y eliminación. Nunca cruza hacia Brain,
Temporal, package, Evidence o logs.

## 11. Runtime Port y eventos

El puerto neutral expone `probe`, `prepare`, `start`, `events`, `status`,
`pause`, `cancel`, `collect` y `dispose`. Los adapters no implementan snapshot,
promoción ni parsing de BSIP Response.

`RuntimeNativeEvent` conserva runtime/version, execution/attempt, secuencia
nativa, recepción, tipo, payload Evidence y redacción. Un decoder versionado lo
proyecta a Execution Event. Eventos desconocidos se guardan, nunca significan
éxito y pueden degradar compatibilidad.

## 12. Adapters

### OpenCode first-party

HTTP/OpenAPI + SSE hacia un worker `opencode serve` por execution slot. Usa
runtime-home, puerto loopback y password efímeros, health/version, sesión,
permissions proyectadas, eventos, abort y Evidence. Un worker no atiende
simultáneamente roots distintos.

El servicio global observado en `127.0.0.1:4096` no se usa para ejecución
gobernada hasta resolver autenticación, identidad y aislamiento. El worker usa
loopback, puerto efímero, auth, CORS/mDNS desactivados, firewall e identidad sin
privilegios. OpenCode nunca corre gobernadamente como `LocalSystem`.

### Codex CLI externo

Proceso `codex exec` efímero por attempt; version/checksum driver, runtime-home,
environment y cwd aislados, sandbox/network por Grant, JSON/JSONL, stdout/stderr
separados, límites, cancelación cooperativa, Job Object/process group y snapshot
externo. No hay sesión persistente compartida en v1.

### Claude Code CLI externo

Proceso no interactivo efímero por attempt; version driver, settings/home/cwd
aislados, stream-json versionado, allow/disallow tools, environment allowlisted y
MCP/plugins deshabilitados salvo Grant. No se usa bypass de permisos. Se
prefieren tools gobernadas y `governed-command://` sobre shell arbitrario.

## 13. Checkpoint y recovery

Checkpoint válido referencia snapshot, diff parcial, operaciones completas y
pendientes, outputs, tests, Evidence, package version, precondition hashes y
fence anterior revocado. No depende de conversación, transcript, session ID,
proceso vivo, cache no referenciado ni provider anterior.

EXC-007 pausa Codex en un corte durable aprobado, detiene/cerca el process tree
y produce Result `paused`. EXC-008 crea nueva decisión/attempt/execution y
recupera con Claude desde package/checkpoint/Evidence. La matriz repite con
OpenCode o Synapse. No recibe memoria ni session ID del runtime anterior.

## 14. Conformidad y observabilidad

Con igual package, workspace, checkpoint, allowlist, Grant y aceptación, un
runtime conforme produce scope válido, resultado aceptado, diff/hashes/tests y
Evidence completos, cancelación, recovery e idempotencia. No exige igual
transcript, razonamiento, eventos ni comandos internos.

Eventos mínimos cubren preparación, workspace/sandbox, probe/start/event/
permission/checkpoint/pause/cancel/termination, snapshot/scope/promotion,
completion/failure/fencing. Correlacionan mandate, intent, turn, logical
execution, routing decision, attempt, execution, runtime y checkpoint. Se
excluyen secretos, passwords, environment completo y razonamiento privado.

## 15. Estructura y migración

La estructura target usa `contracts/v2`, `core/` por brokers/engines/port,
`runtimes/{opencode,codex_cli,claude_code_cli}`, `platform/{windows,linux,darwin}`
y `conformance/`. La migración de `providers/` a `runtimes/` es explícita y
reconciliada. Schemas v1 no cambian silenciosamente.

## 16. Gates

- **A — Contratos:** no runtimes reales antes de aprobar DTOs y runtime_port.
- **B — Contención:** no repos reales antes de demostrar root efímero, scope
  denial, termination, aislamiento canónico y ausencia de secretos.
- **C — Promoción:** no cambios canónicos antes de preconditions, fencing,
  atomicidad/fallo seguro y Evidence.
- **D — Conformidad:** no declarar conformidad sin batería ejecutada.
- **E — EXC-007/008:** supervivencia sólo por corridas reproducibles.

## 17. Transferencia

EXECUTOR, nombre vigente del work antes llamado CLIS Integration, queda
autorizado para diseñar e implementar dentro de estos límites. Su paquete formal
es `docs/EXECUTOR/EXECUTOR_IMPLEMENTATION_HANDOFF_2026-08-20.md` y su
target físico único será `installer/executor/` después de migración aprobada.
