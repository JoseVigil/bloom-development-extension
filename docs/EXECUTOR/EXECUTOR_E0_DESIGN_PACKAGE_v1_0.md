# Executor — paquete de diseño E0

**Estado:** PROPUESTO PARA APROBACIÓN — diseño únicamente  
**Versión:** 1.0  
**Fecha:** 2026-08-20  
**Work:** EXECUTOR  
**Implementación:** `NOT_RUN`  
**Runtimes reales:** `NOT_RUN`

## 1. Propósito y alcance

Este documento entrega E0 de Executor sin crear `installer/executor/`, mover el
staging ni iniciar runtimes. Define la forma que deberá aprobar Architecture
antes de E1.

Fuentes normativas:

- [`EXECUTOR_ARCHITECTURE_v1_0.md`](./EXECUTOR_ARCHITECTURE_v1_0.md);
- [`EXECUTOR_IMPLEMENTATION_SPEC_v1_0.md`](./EXECUTOR_IMPLEMENTATION_SPEC_v1_0.md);
- [`COGNITUUM_EXECUTOR_APPLICATION_DECISION_v1_0.md`](../GOVERNANCE/ARCHITECTURE/COGNITUUM_EXECUTOR_APPLICATION_DECISION_v1_0.md);
- [`COGNITUUM_EXECUTION_RUNTIME_ADAPTERS_NORM_v1_0.md`](../GOVERNANCE/ARCHITECTURE/COGNITUUM_EXECUTION_RUNTIME_ADAPTERS_NORM_v1_0.md);
- [`COGNITUUM_EXECUTION_RECONCILIATION_2026-08-20.md`](../GOVERNANCE/ARCHITECTURE/COGNITUUM_EXECUTION_RECONCILIATION_2026-08-20.md).

El plan de traslado físico asociado está en
[`EXECUTOR_E0_MIGRATION_PLAN_v1_0.md`](./EXECUTOR_E0_MIGRATION_PLAN_v1_0.md).

## 2. Resultado E0 y clasificación honesta

| Área | Estado al entregar E0 | Resultado de diseño |
|---|---|---|
| Identidad y ownership | `TARGET` aprobado previamente | Executor implementa Execution Layer sin poseer BISP |
| Source target | `TARGET` aprobado previamente | Único target `installer/executor/` |
| Staging | `PARCIAL` documental | `installer/execution/` contiene schemas v1 y handoffs, no servicio |
| Proyecto Go | `NOT_RUN` | Árbol y dependencias definidos abajo |
| CLI BTIPS | `NOT_RUN` | Catálogo, metadata, JSON y generación definidos abajo |
| Contratos v2 | `TARGET` | DTOs y reglas definidos; schemas no materializados |
| Runtime Port | `TARGET` | Interfaces neutrales definidas; no compiladas |
| State/journal/fencing | `TARGET` | Modelo definido; store no elegido definitivamente |
| Brokers y engines | `TARGET` | Puertos y responsabilidades definidos |
| Runtime adapters | `NOT_RUN` | Diseño OpenCode/Codex/Claude, sin procesos reales |
| Setup/Metamorph | `TARGET` | Work packages definidos |
| Containment/conformance | `NOT_RUN` | Threat model, tests y gates definidos |

E0 no declara `IMPLEMENTADO`, `CONFORMANT` ni resuelve `CAF-032` por
inferencia.

## 3. Ownership y flujo obligatorio

```text
Brain construye Execution Package
  → Temporal autoriza dispatch/retry/pause/swap
  → AITAP entrega Routing Decision ya tomada
  → Nucleus entrega Grant verificable
  → Executor valida y materializa el attempt
      → Workspace Broker crea root efímero
      → Sandbox/Credential Brokers preparan capacidades
      → Runtime Adapter conduce proceso separado
      → Snapshot/Diff/Evidence validan efectos
      → Promotion Engine es el único escritor canónico
  → Executor devuelve Events/Result/Evidence neutrales
```

Executor no interpreta BISP o BSIP Response, no selecciona runtime/provider/
modelo, no amplía Grants y no entrega al runtime el workspace canónico.

## 4. Árbol source propuesto

```text
installer/executor/
├─ AGENTS.md
├─ README.md
├─ go.mod
├─ go.sum
├─ cmd/executor/main.go
├─ internal/
│  ├─ app/{app.go,wiring.go}
│  ├─ cli/{config.go,help_renderer.go,catalog.go,registry.go,output.go,errors.go}
│  ├─ config/{config.go,load.go,validate.go,migrate.go}
│  ├─ service/{service.go,lifecycle.go,health.go}
│  ├─ ipc/{server.go,transport.go,limits.go}
│  ├─ auth/{caller.go,authorizer.go}
│  ├─ coordinator/{coordinator.go,slots.go}
│  ├─ lifecycle/{state.go,machine.go,journal.go,repository.go}
│  ├─ workspace/{broker.go,materializer.go,paths.go,links.go}
│  ├─ sandbox/{broker.go,policy.go,process.go}
│  ├─ credentials/{broker.go,handle.go,redaction.go}
│  ├─ snapshot/{engine.go,manifest.go,walker.go}
│  ├─ diff/{engine.go,canonical.go}
│  ├─ evidence/{store.go,manifest.go,retention.go}
│  ├─ checkpoint/{store.go,manifest.go,validate.go}
│  ├─ fencing/{store.go,lease.go,token.go}
│  ├─ promotion/{engine.go,preconditions.go,transaction.go,rollback.go}
│  ├─ discovery/{discoverer.go,candidate.go,provenance.go,trust.go}
│  ├─ compatibility/{registry.go,driver.go,drift.go}
│  ├─ runtimeport/{port.go,types.go,registry.go}
│  ├─ events/{native.go,projector.go,sequence.go}
│  ├─ accounting/{references.go}
│  └─ telemetry/{events.go,metrics.go,redaction.go}
├─ runtimes/
│  ├─ registry/registry.go
│  ├─ opencode/{adapter.go,client.go,decoder.go,permissions.go,versiondriver.go}
│  ├─ codex/{adapter.go,process.go,decoder.go,config.go,versiondriver.go}
│  └─ claude/{adapter.go,process.go,decoder.go,tools.go,versiondriver.go}
├─ platform/
│  ├─ windows/{service.go,token.go,jobobject.go,acl.go,network.go}
│  ├─ linux/{service.go,namespaces.go,seccomp.go,cgroups.go,network.go}
│  └─ darwin/{service.go,processgroup.go,acl.go,network.go}
├─ contracts/{v1,v2}/
├─ conformance/{fixtures,expected,matrix,runner}/
├─ testdata/
└─ scripts/
```

Reglas de dependencias:

- `internal/*` no importa `runtimes/*`;
- `app` es el composition root y registra adapters;
- `runtimeport` y contratos no importan plataforma;
- adapters no importan promotion, snapshot, Grant resolution ni BISP;
- `platform/*` implementa puertos de service/sandbox/process sin negocio;
- ningún package usa paths globales; recibe roots/config por inyección.

## 5. Módulos y puertos Go

### 5.1 Runtime Port

```go
type RuntimePort interface {
    Probe(context.Context, RuntimeInstallation) (CapabilityDescriptor, error)
    Prepare(context.Context, ExecutionPackage, RuntimeProjection,
        WorkspaceHandle, SandboxHandle, CredentialHandle) (PreparedRuntime, error)
    Start(context.Context, PreparedRuntime) (RuntimeHandle, error)
    Events(context.Context, RuntimeHandle) (<-chan RuntimeNativeEvent, <-chan error)
    Status(context.Context, RuntimeHandle) (RuntimeStatus, error)
    Pause(context.Context, RuntimeHandle, PauseRequest) (PauseReceipt, error)
    Cancel(context.Context, RuntimeHandle, CancelRequest) (CancelReceipt, error)
    Collect(context.Context, RuntimeHandle) (NativeCollection, error)
    Dispose(context.Context, RuntimeHandle) error
}
```

Todos los métodos aceptan cancelación, deadlines y handles opacos. `Dispose` y
cleanup son idempotentes. Un adapter nunca retorna éxito a partir de stdout sin
validación externa.

### 5.2 Brokers y engines

| Puerto | Entrada | Salida | Prohibición |
|---|---|---|---|
| `WorkspaceBroker` | workspace ref, inputs/hashes, Grant, checkpoint | handle opaco/root efímero | revelar root canónico al runtime |
| `SandboxBroker` | policy, root, runtime identity | sandbox/process handles | confiar sólo en permisos nativos del CLI |
| `CredentialBroker` | identity/grant/credential refs/attempt | handle efímero revocable | secret en package, argv, log o Evidence |
| `SnapshotEngine` | root detenido | manifest content-addressed | usar watcher como verdad final |
| `DiffEngine` | snapshots y bytes | diff canónico | aceptar diff nativo como verdad |
| `EvidenceStore` | artefactos sanitizados | refs inmutables | almacenar razonamiento privado/secrets |
| `CheckpointStore` | snapshot/delta/estado confirmado | checkpoint durable | depender de session ID/transcript |
| `FenceStore` | logical execution/attempt | lease y token monotónico | aceptar publicación tardía |
| `PromotionEngine` | result validado, Grant, fence, preconditions | Promotion Result | merge semántico automático v1 |

## 6. Contratos target

Los schemas v1 permanecen históricos/provisionales. E1/E2 no los modificarán
silenciosamente. E0 propone estos documentos versionados:

1. Execution Package v2.
2. Runtime Execution Projection v1.
3. Runtime Native Event v1.
4. Execution Event v2.
5. Execution Result v2.
6. Evidence v2.
7. Checkpoint Manifest v1.
8. Promotion Request v1.
9. Promotion Result v1.
10. Capability Descriptor v2.
11. Runtime Manifest v1.
12. Error Envelope v1.

Reglas comunes:

- JSON Schema 2020-12 y `additionalProperties: false` en envelopes;
- `schema_version`, timestamps UTC RFC3339 y enums cerrados;
- referencias opacas, IDs no vacíos y canonicalización determinística;
- separación estricta entre runtime e inteligencia efectiva;
- secretos y paths canónicos excluidos;
- fingerprints sobre representación canónica documentada.

### 6.1 Identidades y correlación

```text
mandate_id / intent_id / turn_id
logical_execution_id
routing_decision_id
attempt_id
execution_id
idempotency_key
fence_token
checkpoint_ref
runtime_session_ref  # sólo Evidence
```

Un swap conserva `logical_execution_id` y causalidad BISP; crea routing
decision, attempt, execution, fence y sesión nuevos.

### 6.2 Separación runtime/inteligencia

```json
{
  "runtime": {
    "runtime_id": "opencode",
    "runtime_kind": "first_party_runtime",
    "installation_ref": "runtime-installation://opaque"
  },
  "effective_intelligence": {
    "provider": "anthropic",
    "model": "model-id",
    "credential_ref": "credential-ref://opaque",
    "accounting_ref": "accounting://opaque"
  }
}
```

`credential_ref` no habilita a serializar el secreto. Su presencia concreta en
DTOs se somete a minimización por audiencia.

### 6.3 Catálogo inicial de errores estables

```text
RUNTIME_NOT_FOUND              RUNTIME_UNTRUSTED
RUNTIME_INCOMPATIBLE           RUNTIME_START_FAILED
RUNTIME_PROTOCOL_ERROR         RUNTIME_TIMEOUT
RUNTIME_CANCEL_FAILED          RUNTIME_ORPHANED
SANDBOX_SETUP_FAILED           CREDENTIAL_UNAVAILABLE
SCOPE_VIOLATION                PRECONDITION_CONFLICT
FENCE_REVOKED                  CHECKPOINT_INVALID
EVIDENCE_INCOMPLETE            PROMOTION_FAILED
POSTCONDITION_MISMATCH         IDEMPOTENCY_CONFLICT
AUTHENTICATION_FAILED          AUTHORIZATION_DENIED
INVALID_REQUEST                CONTRACT_VERSION_UNSUPPORTED
IPC_UNAVAILABLE                INTERNAL_SAFE_FAILURE
```

Cada error declara código, mensaje seguro, `retryable`, phase, correlation IDs,
Evidence refs y clasificación de causa. Causas internas pueden quedar en logs
redactados; nunca se vuelcan automáticamente al cliente.

## 7. State machine, journal e idempotencia

```text
RECEIVED → VALIDATED → PREPARING → READY → RUNNING
RUNNING → PAUSING → PAUSED
RUNNING → CANCELLING → CANCELLED
RUNNING → COLLECTING → VALIDATING_EFFECTS
VALIDATING_EFFECTS → PROMOTION_READY → PROMOTING → COMPLETED
* → FAILED
RUNNING/CANCELLING → ORPHANED
```

- Cada transición usa compare-and-set con estado previo esperado.
- Journal append-only: actor, causa, UTC, IDs y Evidence refs.
- `PAUSED` termina un attempt, no el logical execution.
- Una misma `idempotency_key` no crea nuevos efectos.
- Lease con TTL/heartbeat y fence monotónico.
- Crash recovery reconstruye desde journal/checkpoint, nunca desde memoria de
  proceso.
- Resultado de fence revocado se conserva como Evidence y no se promueve.

La tecnología concreta del store queda abierta para E1/E2; debe demostrar
atomicidad, CAS, fsync/commit semantics y recovery antes de aprobarse.

## 8. Workspace, sandbox y credenciales

### 8.1 Workspace

- validar workspace ref y hashes antes de copiar;
- root privado por attempt;
- paths relativos normalizados; rechazar absolute, UNC, device y `..`;
- detectar symlinks, hardlinks, junctions y reparse points;
- excluir `.git`, credenciales y paths prohibidos salvo Grant explícito;
- estrategia copy/reflink/CoW/worktree intercambiable;
- seguridad independiente de la optimización;
- runtime jamás recibe la ruta canónica.

### 8.2 Sandbox

Windows primero: identidad no administrativa, restricted token, Job Object
kill-on-close, ACL por root, HOME/USERPROFILE/TEMP aislados, environment
allowlist, stdout/stderr acotados y network default deny. Nunca `LocalSystem`.

Linux preserva el puerto mediante namespaces/seccomp/cgroups; Darwin mediante
identidad, process group, ACL y backend de sandbox compatible.

### 8.3 Credenciales

Preferencia: token opaco de attempt hacia proxy local con TTL, audience,
revocación, Accounting, filtrado y rate limits. Fallback sólo si el runtime lo
exige: materialización en runtime-home con ACL exclusiva, environment mínimo,
redacción y eliminación/revocación al terminar.

## 9. Discovery, trust, drift y compatibility

```text
found → canonicalize → metadata → SHA-256 → signature/provenance
→ sandboxed version probe → version driver → trust → explicit registration
```

Estados:

```text
DISCOVERED → VERIFIED → REGISTERED → DRIFTED → QUARANTINED
→ REPROBE → COMPATIBLE | INCOMPATIBLE
```

Producción acepta `VERIFIED_VENDOR` y `VERIFIED_PACKAGE_MANAGER`.
`USER_APPROVED` es sólo desarrollo bajo policy. `UNVERIFIED` y `REJECTED` no
ejecutan Intents. Discovery no ejecuta el primer candidato de PATH; todo probe
ocurre dentro de sandbox. AITAP recibe descriptor sanitizado, nunca path.

## 10. Runtime Projection y eventos

Runtime Projection contiene objetivo prescriptivo, operaciones con
preconditions, constraints, allowed/forbidden paths, capabilities, aceptación,
checks gobernados y checkpoint previo. Excluye policy completa, paths
canónicos, candidates/costos, identidad innecesaria, secretos y sesiones
anteriores.

`RuntimeNativeEvent` preserva runtime/version, IDs físicos, secuencia nativa,
tiempo de recepción, tipo, payload sanitizado por ref y estado de redacción. Un
decoder versionado emite `ExecutionEvent` con secuencia monotónica de Executor.
Evento desconocido se evidencia y puede degradar compatibilidad; nunca equivale
a éxito.

## 11. Diseño de adapters

### 11.1 OpenCode

- worker `opencode serve` aislado por execution slot;
- loopback/puerto/password efímeros, CORS y mDNS desactivados;
- SSE activo antes de crear sesión;
- permissions derivadas del Grant, sin reemplazar OS sandbox;
- un worker no comparte roots;
- no usar el servicio global inseguro de `:4096`;
- provider/model efectivo permanece separado y auditable.

### 11.2 Codex CLI

- `codex exec` efímero por attempt;
- hash/version driver y flags encapsulados;
- cwd/runtime-home/environment aislados;
- JSONL y stderr separados; líneas inválidas a Evidence;
- cancelación cooperativa, grace, process tree termination y drain;
- seguridad externa adicional al sandbox nativo.

### 11.3 Claude Code CLI

- proceso no interactivo efímero;
- version driver y stream-json versionado;
- settings/home/cwd aislados;
- tools allow/disallow; MCP/plugins off salvo Grant;
- nunca bypass de permisos productivo;
- preferir tools gobernadas a shell arbitrario.

Los tres permanecen `NOT_RUN` hasta los gates correspondientes.

## 12. Snapshot, Evidence, checkpoint y promoción

- snapshot before/after externo al runtime sobre bytes reales;
- recorrido final después de detener el process tree;
- diff canónico reproducible; diff nativo sólo auxiliar;
- cualquier cambio fuera de scope invalida el attempt completo;
- Evidence inmutable/content-addressed con redacción verificable;
- checkpoint autosuficiente respecto del runtime anterior;
- Promotion Engine verifica Grant, fence, preconditions y concurrencia;
- promoción atómica o fail-safe, con hashes posteriores y rollback probado;
- sin promoción parcial tras `SCOPE_VIOLATION`;
- sin merge semántico automático en v1.

## 13. CLI BTIPS de primera clase

Referencia: patrón Cobra de Nucleus, parametrizado y endurecido. Superficies:

```text
executor --help
executor --json-help
executor <command> --help
executor --json <command>
```

### 13.1 `internal/cli/help_renderer.go`

El renderer recibirá `io.Writer`, `HelpConfig` y un catálogo validado; no
consultará directamente `os.Stdout` para decidir colores o redirección. Tendrá
dos proyecciones puras del mismo árbol Cobra:

- `RenderText(root, config, writer)` para ayuda humana determinista;
- `RenderJSON(root, config, writer)` para `cognituum.cli.catalog/v1`.

Un walker recursivo preservará el path padre/hijo y recolectará flags locales e
heredados sin ejecutar handlers. La validación ocurrirá antes de renderizar y
devolverá error por metadata ausente, categoría desconocida, duplicados, JSON
inválido o schema refs vacías. Serialización y escritura propagarán errores; no
se permitirá el patrón Nucleus que ignora `json.Marshal`.

Color y ancho se determinarán mediante capacidades inyectadas. La salida de
archivo/build será siempre sin ANSI, con orden estable, newline final y line
endings normalizados. Texto y JSON consumirán el mismo modelo intermedio
`Catalog`, evitando dos inventarios divergentes.

### 13.2 `internal/cli/config.go`

`HelpConfig` será inyectable y contendrá `AppName`, `BinaryName`, `Subtitle`,
`Width`, ejemplos globales, orden/descripción de categorías, versión de catálogo
y refs de schemas comunes. No contendrá strings `nucleus`.

Categorías definitivas:

| Orden | Categoría | Responsabilidad CLI |
|---|---|---|
| 1 | `SYSTEM` | version, status, health |
| 2 | `SERVICE` | serve y lifecycle administrativo autorizado |
| 3 | `RUNTIMES` | discovery, trust, registry y probe |
| 4 | `EXECUTION` | submit/status/pause/cancel |
| 5 | `EVIDENCE` | consulta y recolección |
| 6 | `CONFORMANCE` | runner, matriz e informes |

### 13.3 Árbol de comandos candidato

```text
executor
├─ version
├─ status
├─ health [--deep]
├─ serve
├─ service status|start|stop|restart
├─ runtimes discover|list|inspect|approve|revoke|probe
├─ execution submit|status|pause|cancel
├─ evidence get|collect
└─ conformance run|matrix|report
```

`service install/uninstall` no se incorpora hasta reconciliarlo con ownership de
Setup/Metamorph. `execution evidence` se excluye para evitar duplicar el padre
`evidence`.

### 13.4 Registro y metadata

- registro por factory, exactamente una vez por padre;
- subcomandos agregados al padre, nunca registrados individualmente;
- imports explícitos en composition root activan factories;
- registry rechaza nombre/path duplicado y categoría desconocida;
- recorrido recursivo, no flattening de subcomandos;
- orden determinístico independiente del orden de `init()`.

Metadata obligatoria por nodo ejecutable:

```text
category, command_path, short, long, arguments, flags, examples,
mutability, authorization, response_schema_ref, error_envelope_ref,
correlation_id_required, availability_status, error_codes
```

### 13.5 JSON Help v1

Envelope propuesto `cognituum.cli.catalog/v1`:

```json
{
  "schema_version": "cognituum.cli.catalog/v1",
  "application": {
    "app_id": "executor",
    "binary": "executor",
    "version": "build-injected"
  },
  "generated_from": "cobra-runtime-tree",
  "categories": [],
  "commands": [],
  "common_response_schema_ref": "schema://executor/cli/result/v1",
  "error_envelope_ref": "schema://executor/error-envelope/v1"
}
```

Cada comando conserva `command_path` completo, hijos, argumentos, flags locales
y heredados, ejemplos y refs de schemas. `--json-help` sólo describe; nunca
ejecuta handlers.

### 13.6 Resultado JSON y Error Envelope

```json
{
  "schema_version": "cognituum.cli.result/v1",
  "command": "executor runtimes inspect",
  "correlation_id": "corr-opaque",
  "success": true,
  "data_schema_ref": "schema://executor/runtimes/inspect-result/v1",
  "data": {}
}
```

```json
{
  "schema_version": "cognituum.error/v1",
  "command": "executor execution submit",
  "correlation_id": "corr-opaque",
  "success": false,
  "error": {
    "code": "RUNTIME_UNTRUSTED",
    "message": "safe machine-readable message",
    "retryable": false,
    "phase": "VALIDATED",
    "refs": []
  }
}
```

stdout contiene exactamente ayuda humana o un documento JSON; stderr contiene
logs. Nunca se serializan secrets, environment completo o razonamiento privado.

### 13.7 Generación del catálogo

El build/test ejecutará el binario construido, no plantillas manuales:

```text
executor.exe --help      → installer/help/executor_help.txt
executor.exe --json-help → installer/help/executor_help.json
```

La tarea genera en temporales, normaliza line endings, valida JSON/schema,
compara bytes/canonical JSON con los artefactos versionados y falla ante drift.
También falla por comando sin metadata, categoría desconocida, path duplicado,
schema ref ausente o help no determinista. La escritura definitiva pertenece al
pipeline de build aprobado; los archivos no se crean en E0.

## 14. Work package Setup

**Estado:** `TARGET`; aceptación pendiente de Gate Deployment.

- construir bundle firmado/checksummed;
- copiar binario/manifest/compatibility;
- crear config, logs y runtime roots con ACL;
- crear identidad restringida y registrar servicio, nunca `LocalSystem`;
- configurar startup/recovery e IPC ACL;
- instalar OpenCode first-party, no CLIs externos;
- generar/instalar catálogo CLI desde binario compilado;
- verificar version, liveness, readiness y semantic health;
- preservar config/evidence según policy en upgrade/uninstall;
- emitir informe JSON sin secrets.

## 15. Work package Metamorph

**Estado:** `TARGET`; depende de corregir el source path OpenCode.

- registrar Executor como managed first-party;
- inspect/version/hash/signature/service/API/config/contracts/compatibility;
- stop → stage → verify → atomic replace → migrate → start → semantic health;
- rollback verificable;
- detectar drift de catálogos CLI y manifests;
- consultar registry Executor para externos, nunca instalarlos/actualizarlos;
- corregir y probar por separado la ruta fuente OpenCode.

## 16. Threat model mínimo

| Amenaza | Control requerido | Gate |
|---|---|---|
| Runtime lee workspace canónico | root sin path canónico, ACL/token y prueba de denegación | Containment |
| Escape por `..`, symlink, junction o device path | normalización + inspección pre/post | Containment |
| Child/grandchild sobrevive | Job Object/process group kill tree | Containment |
| Exfiltración por red | default deny + allowlist Grant | Containment |
| Secret en argv/env/output | broker, allowlist, redaction y scanners | Containment |
| Binario externo suplantado/drifted | hash/signature/provenance/quarantine | Runtime trust |
| Resultado tardío escribe | lease/fence + único Promotion Engine | Promotion |
| Carrera sobre workspace canónico | precondition hashes + transacción | Promotion |
| Diff/runtime miente | snapshot/diff externo | Effects validation |
| Retry duplica efectos | idempotency ledger/CAS | Recovery |
| Session memory se vuelve estado | checkpoint autosuficiente | Recovery |
| JSON contaminado por logs | stdout/stderr separados y parse tests | CLI |
| Catálogo oculta comando | tree walk + metadata/drift tests | CLI |

## 17. Plan de pruebas

### 17.1 Unitarias

- schemas/types/error codes/state transitions;
- registry CLI, metadata, recursion, ordering y duplicate rejection;
- path normalization/link detection;
- hashing/diff/scope/redaction;
- idempotency/fence/CAS;
- discovery/trust/drift/version-driver selection;
- promotion conflicts y rollback.

### 17.2 Contractuales

- golden JSON de contratos v2;
- rechazo explícito de v1 cuando no aplique;
- fake Runtime Port y unknown native events;
- fingerprint/correlation determinísticos;
- catálogo CLI contra schema y DTO refs.

### 17.3 Seguridad e integración

- filesystem/process/network/HOME/TEMP escapes;
- secret leakage por argv/env/stdout/stderr/Evidence;
- service/IPC authentication;
- crash/restart recovery;
- stale fence y late result;
- fake runtime lifecycle completo;
- Setup install y Metamorph rollback.

### 17.4 CLI/catalog

- las cuatro superficies requeridas;
- stdout JSON parseable con stderr activo;
- todo nodo ejecutable posee metadata;
- padre registrado una sola vez;
- catálogo conserva jerarquía completa;
- texto y JSON se regeneran desde el binario;
- build falla ante drift de `executor_help.{txt,json}`.

EXC-001..EXC-010 permanece `NOT_RUN` hasta cerrar reconciliación, contratos,
containment y runtimes.

## 18. Gates propuestos para aprobación

Para evitar la colisión de letras existente entre documentos, E0 propone IDs
estables descriptivos. No renombra normas vigentes sin aprobación:

| ID E0 | Gate | Evidencia de salida |
|---|---|---|
| `EXEC-G0-DESIGN` | E0 aprobado | este paquete + plan de migración aceptados |
| `EXEC-G1-DEPLOYMENT` | Setup/Metamorph | work packages aceptados |
| `EXEC-G2-CONTRACTS` | v2 + Runtime Port | schemas, DTOs, goldens y fake port |
| `EXEC-G3-CONTAINMENT` | aislamiento | escape/process/network/secret tests |
| `EXEC-G4-PROMOTION` | escritura canónica | fence/preconditions/atomicidad/rollback |
| `EXEC-G5-RUNTIMES` | adapters reales | probes/drivers/events por runtime |
| `EXEC-G6-CONFORMANCE` | EXC-001..010 | tres corridas por runtime/par |

Hasta que Architecture acepte esta tabla, las letras originales se citan con
el nombre del gate para evitar ambigüedad.

## 19. Contradicciones y decisiones que requieren aprobación

1. `CAF-032` sigue abierto: falta reconciliar campos y pipeline real antes de
   cerrar schemas.
2. Responsibility Boundaries dice “v1 cerrados”, mientras Conformance los
   declara provisionales. E0 aplica la condición más conservadora.
3. Las letras de gates no son uniformes entre Application/Implementation y la
   norma de Runtime Adapters; se propone §18.
4. Falta decidir store técnico de journal/CAS/fences.
5. Falta cerrar emisión/verificación del Grant Nucleus → Executor.
6. Falta cerrar Credential Broker/proxy y owner de password efímero OpenCode.
7. Falta decidir si Synapse Simulator implementará Runtime Port de prueba o
   conservará exclusivamente su rol cognitivo.
8. `service install/uninstall` puede invadir ownership Setup/Metamorph; queda
   fuera del árbol aprobado hasta resolución.
9. El formato final y URI registry de `response_schema_ref` requieren contrato.
10. E0 no valida todavía flags/protocolos reales de Codex, Claude u OpenCode.

## 20. Criterio de aceptación de E0

E0 queda aceptable si Architecture/José confirma:

- target y migración sin dos implementaciones;
- árbol/package boundaries y Runtime Port;
- lista/versionado de contratos;
- state, idempotency, leases y fencing;
- brokers, engines y Promotion ownership;
- CLI BTIPS, catálogo y generación desde Cobra;
- work packages Setup/Metamorph;
- threat model, tests y gates;
- resolución o aceptación explícita de los abiertos de §19.

La aprobación de E0 habilita planificar E1; no habilita por sí misma runtimes
reales, repositorios reales ni promoción.
