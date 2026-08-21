# Executor — especificación completa de implementación

**Estado:** instrucción obligatoria para crear el proyecto; Gate C pendiente  
**Versión:** 1.0  
**Fecha:** 2026-08-20  
**Lenguaje:** Go  
**Target:** `installer/executor/`

## 1. Resultado requerido

Construir `Executor`, aplicación first-party distribuible que convierte un
Execution Package autorizado en efectos técnicos verificables, usando runtimes
aislados y sin interpretar el Intent.

Debe ofrecer:

- binario, CLI y servicio propios;
- IPC local autenticado;
- lifecycle durable de execution/attempt;
- workspace y runtime-home efímeros;
- containment por plataforma;
- credenciales efímeras;
- runtime discovery/trust/compatibility;
- adapters OpenCode, Codex y Claude;
- eventos canónicos, snapshots, diff, Evidence y checkpoints;
- fencing, idempotencia y promoción gobernada;
- conformance runner EXC-001..010;
- integración documentada con Brain, Temporal, AITAP, Nucleus, Vault, Setup y
  Metamorph.

## 2. Prohibiciones absolutas

Executor y sus adapters no pueden:

- interpretar, modificar o persistir semántica BISP;
- parsear BSIP Response;
- seleccionar runtime o provider/model;
- autoautorizar Grant o ampliar allowlist/capabilities;
- custodiar secretos permanentes;
- trabajar sobre el workspace canónico;
- promover desde stdout/diff declarado por el runtime;
- usar session IDs/transcripts como recovery durable;
- ejecutar candidatos externos no registrados o no confiables;
- registrar secrets, environment completo o razonamiento privado;
- presentar stubs, mocks o TCP-open como integración/conformidad real.

## 3. Migración y árbol Go

Antes de crear código, producir un mapa archivo-a-archivo desde
`installer/execution/` hacia `installer/executor/`, actualizar referencias y
preservar historia. La carpeta vieja queda como redirect temporal y luego se
elimina; nunca contiene un segundo servicio activo.

```text
installer/executor/
├─ AGENTS.md
├─ README.md
├─ go.mod
├─ cmd/executor/main.go
├─ internal/
│  ├─ app/
│  ├─ cli/
│  ├─ config/
│  ├─ service/
│  ├─ ipc/
│  ├─ auth/
│  ├─ coordinator/
│  ├─ lifecycle/
│  ├─ workspace/
│  ├─ sandbox/
│  ├─ credentials/
│  ├─ snapshot/
│  ├─ diff/
│  ├─ evidence/
│  ├─ checkpoint/
│  ├─ fencing/
│  ├─ promotion/
│  ├─ discovery/
│  ├─ compatibility/
│  ├─ runtimeport/
│  ├─ events/
│  ├─ accounting/
│  └─ telemetry/
├─ runtimes/
│  ├─ registry/
│  ├─ opencode/{adapter,client,decoder,permissions,versiondriver}/
│  ├─ codex/{adapter,process,decoder,config,versiondriver}/
│  └─ claude/{adapter,process,decoder,tools,versiondriver}/
├─ platform/
│  ├─ windows/{service,token,jobobject,acl,network}/
│  ├─ linux/{service,namespaces,seccomp,cgroups,network}/
│  └─ darwin/{service,processgroup,acl,network}/
├─ contracts/{v1,v2}/
├─ conformance/{fixtures,expected,matrix,runner}/
├─ testdata/
└─ scripts/
```

Evitar ciclos: `internal/*` no importa adapters concretos; composición ocurre en
`app`. Contratos y runtimeport no dependen de plataformas.

## 4. Build, identidad y norma CLI

Artefactos:

```text
executor.exe
executor.manifest.json
runtime-compatibility.json
```

Inyectar versión, commit, build time y contract versions mediante ldflags.
Build reproducible, `CGO_ENABLED=0` salvo decisión justificada, checksum SHA-256
y firma dentro del pipeline de release.

CLI con Cobra y ayuda del ecosistema:

```text
executor --help
executor --json-help
executor version [--json]
executor status [--json]
executor health [--json] [--deep]
executor serve
executor runtimes discover|list|inspect|approve|revoke|probe
executor execution submit|status|pause|cancel|evidence
executor conformance run|matrix|report
```

Toda mutación soporta JSON machine-readable, errores estables y correlation ID.
`--json-help` se vuelca en el pipeline compartido de `installer/help/` cuando
Setup/Metamorph integren Executor.

## 5. Configuración y paths

Resolver paths mediante configuración inyectada, nunca hardcodear usuario:

```text
bin/executor/
config/executor/executor.json
config/executor/runtimes.json
config/executor/sandbox-policy.json
config/executor/compatibility.json
logs/executor/
runtime/executor/{workspaces,checkpoints,evidence,runtime-homes,tmp}/
```

Config versionada, validada estrictamente, escrita atómicamente y migrada por
Metamorph. Precedencia: defaults seguros < archivo < flags operacionales
allowlisted. Environment sólo para bootstrap/secrets, nunca configuración
arbitraria silenciosa. Redactar valores sensibles.

## 6. Servicio e IPC

Windows: `BloomExecutorService`, startup automático delayed cuando corresponda,
recovery policy, identidad restringida por perfil, nunca `LocalSystem`.
Linux: systemd compatible. macOS: launchd compatible.

Transporte productivo:

- Windows named pipe con ACL e identidad de caller;
- Linux/macOS Unix domain socket con permisos;
- HTTP loopback autenticado sólo para development, health y tooling.

Definir API transport-neutral; autenticar Brain/Temporal/Nucleus; autorizar por
operación; exigir request/correlation/idempotency IDs; límites de body/stream,
timeouts y backpressure. Health superficial no implica readiness semántica.

Endpoints/operations conceptuales:

- submit/get/status/events/pause/cancel/collect;
- runtime registry/capabilities/health;
- evidence/checkpoint refs;
- service health/readiness/version.

## 7. Contratos v2 obligatorios

No modificar v1 silenciosamente. Proponer JSON Schema 2020-12 y tipos Go para:

- Execution Package v2;
- Runtime Execution Projection v1;
- Runtime Native Event v1;
- Execution Event v2;
- Execution Result v2;
- Evidence v2;
- Checkpoint Manifest v1;
- Promotion Request/Result v1;
- Capability Descriptor v2;
- Runtime Manifest v1;
- common Error Envelope v1.

Todos usan `additionalProperties:false` en envelopes, schema/version, timestamps
UTC RFC3339, IDs no vacíos, enums cerrados y references opacas.

Identidades obligatorias:

- mandate/intent/turn;
- `logical_execution_id`;
- `routing_decision_id`;
- `attempt_id`;
- `execution_id`;
- `runtime_session_ref` sólo Evidence;
- `checkpoint_ref`;
- `idempotency_key`;
- `fence_token`.

Separar siempre:

```text
runtime_id + runtime_kind
effective_intelligence.provider + model + credential_ref/accounting_ref
```

## 8. State machine

Persistir transiciones técnicas con compare-and-set:

```text
RECEIVED → VALIDATED → PREPARING → READY → RUNNING
RUNNING → PAUSING → PAUSED
RUNNING → CANCELLING → CANCELLED
RUNNING → COLLECTING → VALIDATING_EFFECTS
VALIDATING_EFFECTS → PROMOTION_READY → PROMOTING → COMPLETED
* → FAILED
RUNNING/CANCELLING → ORPHANED
```

Estados terminales: COMPLETED, FAILED, CANCELLED. PAUSED es terminal para un
attempt y recuperable para el logical execution. Cada transición guarda actor,
causa, timestamp, expected prior state y Evidence refs.

## 9. Coordinator, leases e idempotencia

Coordinator valida package/decision/Grant; reserva execution slot; crea
execution/attempt; obtiene fence; ordena brokers; inicia adapter; proyecta
eventos; detiene process tree; toma snapshot final; valida scope; promueve o
falla; dispone recursos.

Misma `idempotency_key` devuelve ejecución existente o resultado estable. No
crea efectos nuevos. Lease con TTL/heartbeat y fence monotónico. Sólo fence
vigente emite resultado aplicable o promueve. Resultado tardío queda Evidence.

Crash recovery reconstruye desde journal/checkpoint; nunca asume proceso vivo.
Operaciones externas tienen deduplication keys y cleanup repetible.

## 10. Workspace Broker

Entrada: workspace ref gobernada, inputs/hashes, checkpoint y Grant. Salida:
handle opaco y execution root.

Debe:

- verificar root autorizado y hashes;
- crear copia efímera mediante estrategia intercambiable;
- materializar inputs content-addressed;
- normalizar paths relativos y rechazar absolute/UNC/device paths/`..`;
- detectar symlinks, hardlinks, junctions y reparse points;
- impedir enlaces fuera del root;
- aplicar owner/ACL;
- excluir `.git`, secrets y paths prohibidos salvo Grant explícito;
- archivar/destruir según Evidence retention;
- nunca entregar path canónico al runtime.

Implementaciones posibles: copy, reflink, CoW o worktree endurecido. Seguridad no
depende de la optimización elegida.

## 11. Sandbox Broker

Interfaz:

```text
Prepare(policy, root, runtimeIdentity) → SandboxHandle
Start(handle, command, env) → ProcessHandle
SignalCancel / TerminateTree / Inspect / Dispose
```

Windows obligatorio primero:

- restricted access token y usuario no administrativo;
- Job Object por attempt, kill-on-close;
- process tree completo y límites de procesos/memoria/CPU;
- ACL NTFS sólo sobre execution root;
- HOME/USERPROFILE y TEMP/TMP aislados;
- environment allowlist;
- network default deny con excepciones Grant;
- control de junction/reparse/device paths;
- stdout/stderr pipes limitados;
- ningún worker OpenCode como `LocalSystem`.

Linux: user/mount/network namespaces, root read-only, bind root, seccomp,
cgroups y bubblewrap/equivalente. macOS: identidad/process group/root/profile de
sandbox; un backend posterior no altera interfaz.

Pruebas de escape son gate: parent traversal, symlink/junction, alternate data
streams cuando aplique, process spawn, network, HOME/TEMP, named pipes/sockets y
lectura del workspace canónico.

## 12. Credential Broker

Camino preferido: token opaco efímero, audience execution/attempt, TTL corto,
revocable, hacia proxy local que obtiene Vault credential y llama al provider.
Aplicar Accounting, header filtering y rate limits.

Fallback sólo cuando runtime lo requiera:

- materializar en runtime-home con ACL exclusiva;
- nunca argv, prompt, package, event o log;
- environment mínimo y redacción stdout/stderr;
- borrar/revocar al terminar;
- documentar que el runtime sí consume la credencial.

Provider/model efectivo debe acompañar Accounting/Evidence por refs, sin valor
secreto.

## 13. Discovery, trust y compatibility

External candidates pueden provenir de PATH, rutas configuradas, user installs,
package managers, platform-known paths o selección manual. No ejecutar durante
discovery salvo probe dentro de sandbox.

Pipeline obligatorio:

```text
found → canonicalize → metadata → SHA-256 → signature/provenance
→ sandboxed version probe → driver compatibility → trust → explicit register
```

Trust:

- `VERIFIED_VENDOR` y `VERIFIED_PACKAGE_MANAGER`: producción;
- `USER_APPROVED`: sólo policy de desarrollo;
- `UNVERIFIED` y `REJECTED`: nunca Intent gobernado.

Runtime Manifest incluye installation ID, source/path interno, artifact version/
hash/publisher/signature, trust, adapter version, compatibility, capabilities y
last verified. AITAP recibe descriptor sanitizado sin path.

Revalidar startup, pre-execution, file change, TTL expiry, Executor update y
registry update. State: DISCOVERED→VERIFIED→REGISTERED→DRIFTED→QUARANTINED→
REPROBE→COMPATIBLE|INCOMPATIBLE. Nueva versión no se ejecuta automáticamente.

## 14. Runtime Port

Interfaz neutral:

```text
Probe(ctx, RuntimeInstallation) → CapabilityDescriptor
Prepare(ctx, Package, Projection, WorkspaceHandle, SandboxHandle,
        CredentialHandle) → PreparedRuntime
Start(ctx, PreparedRuntime) → RuntimeHandle
Events(ctx, RuntimeHandle) → stream RuntimeNativeEvent
Status / Pause / Cancel / Collect / Dispose
```

Adapters no hacen snapshot, canonical diff, scope validation, promotion, Grant
resolution o BISP parsing. Toda implementación soporta context cancellation,
timeouts, bounded buffers y cleanup idempotente.

## 15. Runtime Execution Projection

Derivar vista minimizada con IDs físicos/lógico, objective, mode prescriptive,
operations con precondition hash y refs, constraints, allowed/forbidden paths,
capabilities, acceptance criteria, governed checks y prior checkpoint.

Excluir secrets, keys, routing candidates/costs/policy completa, identidad humana
innecesaria, canonical paths, comandos arbitrarios, session IDs anteriores y
datos de otros Intents.

## 16. Native events y canonical projection

RuntimeNativeEvent guarda runtime/version, execution/attempt, native sequence,
received time, native type, sanitized payload ref y redaction status. Decoder
versionado produce Execution Event con sequence monotónica asignada por Executor.

Evento desconocido se conserva, no equivale a éxito y puede marcar runtime
DEGRADED/INCOMPATIBLE. stdout y stderr siempre separados, tamaño y rate
limitados; backpressure no puede bloquear indefinidamente el process tree.

## 17. OpenCode adapter

Usar worker `opencode serve` aislado por execution slot mediante HTTP/OpenAPI y
SSE. No usar servicio global `127.0.0.1:4096` hasta resolver auth/identidad/
aislamiento; el camino gobernado crea worker propio.

Lifecycle:

1. slot/root/home/puerto loopback efímero;
2. usuario/password efímeros;
3. worker con CORS/mDNS off, firewall e identidad restringida;
4. health + exact version/driver;
5. SSE antes de session;
6. crear sesión y enviar projection;
7. responder permissions desde Grant;
8. capturar status/tool/file/diff/error/abort;
9. pause/cancel/terminate;
10. collect native Evidence; dispose worker.

Un worker no atiende simultáneamente roots distintos. Permissions nativas para
read/edit/shell/external/web/subagents/MCP se derivan del Grant, pero no
reemplazan sandbox. Diff OpenCode es auxiliar.

## 18. Codex adapter

`codex exec` child efímero por attempt, sin sesión compartida v1. Probe version
y binary hash; `CodexVersionDriver` encapsula flags, JSONL, sandbox, schema,
cancel, cwd y provider/endpoint config.

Runtime-home/cwd/environment aislados; network off salvo Grant; stdout JSONL y
stderr separados; líneas inválidas a Evidence. Cancel cooperativo → grace → Job
Object/process group → drain pipes → snapshot → revoke fence. Seguridad no
depende sólo del sandbox nativo.

## 19. Claude adapter

Proceso no interactivo efímero. Probe/hash/driver; runtime-home/settings/cwd
aislados; stream-json versionado; allowed/disallowed tools; MCP/plugins externos
off salvo Grant; nunca bypass permissions productivo.

Preferir `bloom_read`, `bloom_patch`, `bloom_test`, `bloom_report` y
`governed-command://`; evitar shell arbitrario. Misma cancelación, pipes,
snapshot y fencing que Codex.

## 20. Snapshot, diff y scope

Snapshot independiente del runtime incluye path relativo, type, SHA-256, size,
mode y symlink target. Detecta create/delete/modify/type/link/out-of-root/metadata/
binary. Hash bytes reales. Rename es derivación, no verdad de seguridad.

File watchers son telemetría; fuente de verdad es recorrido completo después de
terminar process tree. Diff canónico deriva before/after y contenidos. Texto usa
unified diff presentacional sin alterar hashes; binarios add/delete/replace con
hash y size.

Validar cuatro capas: workspace efímero, OS sandbox, runtime native permissions,
post-snapshot promotion validation. Un solo cambio fuera de allowed paths o
dentro de forbidden paths invalida attempt completo; no promoción parcial.

## 21. Evidence Store y checkpoints

Evidence inmutable/content-addressed con hashes, actor/runtime/adapter/effective
intelligence refs, timestamps, native/canonical events, tool classes, tests,
stdout/stderr refs, diff, outputs, package/decision/Grant/fence refs y redaction.

Checkpoint válido contiene snapshot, partial diff, completed/pending operations,
outputs/tests/Evidence, package version, preconditions y fence anterior revocado.
No depende de transcript, session ID, process/cache vivos o provider anterior.

Retention y garbage collection nunca eliminan Evidence referenciada por un
Intent/Mandate activo o auditoría.

## 22. Promotion Engine

Único escritor canónico. Secuencia:

1. recibir validated result;
2. comprobar Grant/fence/attempt;
3. releer canonical precondition hashes;
4. detectar concurrencia;
5. construir canonical patch;
6. aplicar atomic/transaccionalmente;
7. recalcular hashes;
8. ejecutar post-checks gobernados;
9. persistir Evidence y Promotion Result;
10. rollback o fail-safe verificable.

Sin merge semántico automático v1. Errores: PRECONDITION_CONFLICT,
SCOPE_VIOLATION, FENCE_REVOKED, PROMOTION_FAILED, POSTCONDITION_MISMATCH.

## 23. Errores comunes

Implementar códigos estables:

`RUNTIME_NOT_FOUND`, `RUNTIME_UNTRUSTED`, `RUNTIME_INCOMPATIBLE`,
`RUNTIME_START_FAILED`, `RUNTIME_PROTOCOL_ERROR`, `RUNTIME_TIMEOUT`,
`RUNTIME_CANCEL_FAILED`, `RUNTIME_ORPHANED`, `SANDBOX_SETUP_FAILED`,
`CREDENTIAL_UNAVAILABLE`, `SCOPE_VIOLATION`, `PRECONDITION_CONFLICT`,
`FENCE_REVOKED`, `CHECKPOINT_INVALID`, `EVIDENCE_INCOMPLETE`,
`PROMOTION_FAILED`, `POSTCONDITION_MISMATCH`, `IDEMPOTENCY_CONFLICT`.

Envelope incluye code, safe message, retryable, phase, IDs, Evidence refs y
cause classification; nunca secret/raw environment.

## 24. Observabilidad

Eventos mínimos: execution preparing/completed/failed/fenced; workspace
materialized; sandbox prepared; runtime discovered/probed/started/event/
permission/checkpoint/pause/cancel/terminated; snapshot completed; scope
validated; promotion started/completed.

Logs estructurados correlacionan mandate/intent/turn/logical/routing/attempt/
execution/runtime/checkpoint. Métricas: durations por phase, active slots,
queue/backpressure, bytes/events, cancellation, scope violations, promotion,
runtime health/compatibility. Telemetry registration sigue norma Nucleus.

## 25. Health

Separar:

- liveness: proceso responde;
- readiness: stores/config/IPC/brokers disponibles;
- semantic health: sandbox smoke test, runtime registry, compatibility, Evidence
  write/read, fence store y promotion-disabled self-check;
- runtime health: instalación/version/protocol/backend, independiente por target.

TCP-open solo nunca reporta healthy integral.

## 26. Setup work package

Debe especificar bundle/build, copy a bin, default config, runtime roots, ACL,
service identity/registration/startup/recovery, logs/telemetry, manifest/hash/
version, health/readiness, uninstall/upgrade preservation y UI report. Setup
distribuye Executor y OpenCode, no externos.

## 27. Metamorph work package

Registrar Executor como managed first-party: inspect/version/hash/signature/
service/API/config drift/contracts/compatibility; stop→stage→verify→atomic
replace→migrate→start→semantic health→rollback. No instalar/update externos;
consultar Executor registry. Resolver antes el bug conocido de source path
OpenCode mediante work separado y prueba E2E.

## 28. Tests obligatorios

Unitarios:

- schema/types/errors/state transitions;
- path normalization/link detection;
- hashes/diff/scope;
- idempotency/fence/CAS;
- discovery/trust/drift/driver selection;
- redaction/event projection;
- promotion conflict/rollback.

Contractuales:

- golden JSON v2;
- backwards rejection explícita;
- runtime_port fake;
- unknown native events;
- deterministic fingerprint/correlation.

Security/containment:

- filesystem escape, symlink/junction/reparse;
- canonical workspace denial;
- HOME/TEMP isolation;
- network default deny;
- child/grandchild termination;
- secret leakage argv/env/stdout/stderr/Evidence;
- untrusted/drifted binary rejection;
- stale fence and late result rejection.

Integration/E2E:

- service/IPC auth;
- crash/restart recovery;
- fake runtime full lifecycle;
- Setup install and Metamorph rollback;
- OpenCode/Codex/Claude adapters sólo tras gates.

Conformance EXC-001..010: structured output, patch, diff, checksum, acceptance,
scope denial, interruption, cross-runtime recovery, idempotency y provider
disappearance. Tres corridas consecutivas por runtime/par antes de CONFORMANT.

## 29. Secuencia de entregas

1. **E0 diseño:** migración, árbol, packages, DTOs, interfaces, threat model,
   work packages y tests. Sin scaffold sustantivo.
2. **E1 shell:** Go module, CLI/help, config/logging, service/IPC skeleton y fake
   health; claramente TARGET/PARTIAL.
3. **E2 contracts/core fake:** v2, state/journal, fake runtime, workspace/snapshot/
   diff/Evidence/promotion disabled.
4. **E3 Windows containment:** restricted identity/token, Job Object, ACL,
   network, escape tests. Gate D candidate.
5. **E4 OpenCode:** isolated worker/auth/SSE/permissions/version.
6. **E5 Codex**, **E6 Claude**: external discovery/trust/drivers/adapters.
7. **E7 recovery:** pause/checkpoint/fence/idempotency/EXC-007/008.
8. **E8 deployment/Linux:** Setup/Metamorph, namespaces y cross-platform matrix.

Cada etapa presenta diff, tests ejecutados, Evidence, gaps y solicitud de gate.

## 30. Definition of Done

Executor sólo está operativo cuando:

- build/install/update/rollback reproducibles;
- servicio least-privilege e IPC autenticado;
- contratos aprobados y validados;
- workspace canónico inaccesible a runtimes;
- containment y process termination demostrados;
- secrets no aparecen en artefactos;
- discovery/trust/drift rechaza binarios inseguros;
- snapshots/diffs/Evidence externos verifican efectos;
- promotion es fenced, preconditioned y fail-safe;
- crash/retry no duplica efectos;
- recovery no usa session memory;
- EXC-001..010 pasan según criterio;
- documentación implementado/target coincide con código.

Hasta entonces el status máximo es `PARCIAL` o `NOT_RUN`, nunca
`IMPLEMENTADO-COMPLETO` ni `CONFORMANT`.

