# Cognituum — Executor como aplicación first-party

**Estado:** decisión aprobada y normativa  
**Versión:** 1.0  
**Fecha:** 2026-08-20

## 1. Decisión

`Execution Layer` conserva el nombre del plano/capacidad arquitectónica.
`Executor` es la aplicación first-party que implementa esa capacidad.

```text
Execution Layer = abstracción arquitectónica
Executor        = aplicación first-party concreta
```

Se aprueban:

- nombre de aplicación y work: `EXECUTOR`;
- binario autocontenido: `executor.exe` en Windows;
- implementación en Go;
- servicio propio `BloomExecutorService`;
- CLI, API/IPC, identidad, configuración, logs y telemetría propios;
- source target único `installer/executor/`;
- deployment `BloomNucleus/bin/executor/`;
- runtime state bajo `BloomNucleus/runtime/executor/`;
- Runtime Adapters compilados dentro de Executor;
- runtimes siempre en procesos separados;
- discovery/trust/compatibility de runtimes externos como ownership de Executor.

El work `CLIS INTEGRATION` queda formalmente renombrado `EXECUTOR`. Sus
referencias históricas no se borran: se marcan supersedidas y apuntan al nuevo
handoff.

## 2. Personalidad y límites

Executor es el implementador gobernado de Cognituum: transforma un Execution
Package autorizado en efectos técnicos verificables sin apropiarse del
significado del Intent.

Recibe la orden neutral; crea root y workspace efímeros; resuelve la instalación
del runtime ya seleccionado; controla proceso/sandbox/credenciales efímeras;
captura eventos; calcula snapshot/diff/hashes/Evidence; valida scope; administra
checkpoint/fencing; promueve bajo Grant; devuelve resultado.

Executor no interpreta BISP ni BSIP Response, no selecciona runtime o
provider/model, no gobierna Intents, no autoriza Grants, no custodia secretos
permanentes, no cambia aceptación ni amplía allowlists.

## 3. Ownership definitivo

| Área | Owner |
|---|---|
| Intent/BISP/Mandate y Execution Package | Brain |
| Workflow, dispatch, pausa, retry y swap | Temporal |
| Selección runtime y provider/model, por separado | AITAP |
| Policy/Grant/override | Nucleus |
| Secretos permanentes | Nucleus Vault |
| Lifecycle técnico, sandbox y process tree | Executor |
| Discovery, trust, drift y compatibility de runtimes | Executor |
| Snapshot/diff/hashes/Evidence/checkpoints/fencing | Executor |
| Promoción gobernada | Executor |
| Protocolo nativo | Runtime Adapter interno de Executor |
| Instalación/servicio de Executor y OpenCode | Setup/Installer |
| Rollout/actualización/health de first-party apps | Metamorph |

## 4. Tecnología y superficies

Go queda aprobado por distribución autocontenida, alineación con Nucleus/
Sentinel/Metamorph y control de servicios, Restricted Tokens, Job Objects, ACL,
procesos, pipes, HTTP/SSE y JSON/JSONL.

Artefactos mínimos:

```text
executor.exe
executor.manifest.json
runtime-compatibility.json
```

CLI mínima, sujeta a contratos antes de implementación:

```text
executor --help | --json-help
executor version | status | health | serve
executor runtimes discover|list|inspect|approve|revoke|probe
executor execution submit|status|pause|cancel|evidence
executor conformance run|matrix|report
```

El transporte será neutral. Producción prioriza named pipe en Windows y Unix
domain socket en Linux/macOS; HTTP loopback autenticado queda para desarrollo,
health y tooling. Caller identity y correlation IDs son obligatorios.

## 5. Source y deployment

Target source único:

```text
installer/executor/
├─ cmd/executor/
├─ internal/{service,coordinator,lifecycle,workspace,sandbox,credentials,
│            snapshot,evidence,promotion,discovery,compatibility,runtimeport}/
├─ runtimes/{opencode,codex,claude,registry}/
├─ platform/{windows,linux,darwin}/
├─ contracts/{v1,v2}/
├─ conformance/{fixtures,expected,matrix,runner}/
└─ scripts/
```

`installer/execution/` es staging provisional existente. EXECUTOR debe migrarlo
con preservación de historia y referencias; no puede mantener dos
implementaciones activas. Hasta esa migración, contiene sólo contratos/docs y
el handoff, no un segundo servicio.

Deployment:

```text
BloomNucleus/
├─ bin/executor/{executor.exe,executor.manifest.json,runtime-compatibility.json}
├─ config/executor/{executor.json,runtimes.json,sandbox-policy.json,compatibility.json}
├─ logs/executor/
└─ runtime/executor/{workspaces,checkpoints,evidence,runtime-homes,tmp}/
```

`BloomExecutorService` usa identidad restringida compatible con el perfil
activo; nunca `LocalSystem`.

## 6. Runtime model y discovery

OpenCode continúa como `first_party_runtime`, distribuido por BTIPS y operado en
workers aislados por Executor. Codex CLI, Claude Code CLI y futuros CLIs son
`external_runtime`; BTIPS no instala sus binarios.

Executor Runtime Discovery es el mecanismo uniforme para externos:

```text
candidate → canonical path → metadata/hash/signature/provenance
→ sandboxed version probe → compatibility → trust → explicit registration
```

Nunca ejecuta silenciosamente el primer binario de PATH. Drivers vendor-specific
definen nombres/rutas/probe/publisher/rangos/capabilities/protocolo. Agregar un
runtime requiere driver+adapter, no cambio de Setup.

Trust levels: `VERIFIED_VENDOR`, `VERIFIED_PACKAGE_MANAGER`, `USER_APPROVED`,
`UNVERIFIED`, `REJECTED`. Producción admite los dos primeros; desarrollo puede
admitir `USER_APPROVED` bajo policy. Los dos últimos no ejecutan Intents.

AITAP recibe sólo runtime ID, capabilities, health y conformance; nunca paths.
Executor revalida al iniciar, antes de ejecutar, ante cambio/TTL/update o cambio
del registry. Drift pasa por quarantine/reprobe antes de reutilización.

## 7. Setup y Metamorph

Setup empaqueta/copía Executor, crea config/roots/ACL, registra servicio/startup,
logs/telemetry, verifica checksum/version/health e inicia discovery externo.

Metamorph administra inspect→compare→stop→stage→verify→atomic replace→config
migration→start→semantic health→rollback. Verifica versión, checksum, firma,
service/API, contratos, config drift y compatibility registry. No instala ni
actualiza CLIs externos; consulta a Executor.

## 8. Gates

- **A — Nombre/ownership:** cerrado por esta decisión.
- **B — Deployment:** Setup y Metamorph deben aceptar work packages.
- **C — Contratos:** Runtime Port, Package, Projection, Native/Canonical Events,
  Result y Evidence aprobados antes de runtimes reales.
- **D — Contención:** ningún repositorio real sin aislamiento probado.
- **E — Conformidad:** ningún runtime `CONFORMANT` sin batería.

## 9. Fuentes relacionadas

- `COGNITUUM_RESPONSIBILITY_BOUNDARIES.md`;
- `COGNITUUM_EXECUTION_RUNTIME_ADAPTERS_NORM_v1_0.md`;
- `OPENCODE_FIRST_PARTY_RUNTIME_STATUS_2026-08-20.md`;
- `docs/EXECUTOR/EXECUTOR_ARCHITECTURE_v1_0.md`;
- `docs/EXECUTOR/EXECUTOR_IMPLEMENTATION_SPEC_v1_0.md`;
- `docs/EXECUTOR/EXECUTOR_IMPLEMENTATION_HANDOFF_2026-08-20.md`.
