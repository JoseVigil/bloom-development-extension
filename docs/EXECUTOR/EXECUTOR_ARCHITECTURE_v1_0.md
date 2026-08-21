# Executor — arquitectura de aplicación

**Estado:** normativa  
**Versión:** 1.0  
**Fecha:** 2026-08-20

## Identidad

`Execution Layer` es la capacidad abstracta. `Executor` es la aplicación
first-party en Go que la implementa.

```text
app_id: executor
binary_windows: executor.exe
service_windows: BloomExecutorService
source_target: installer/executor/
deploy_root: BloomNucleus/bin/executor/
runtime_root: BloomNucleus/runtime/executor/
```

Executor materializa intención técnica autorizada sin apropiarse de su
significado. Recibe Execution Package, routing decision y Grant; produce Events,
Result y Evidence neutrales.

## Ownership

Executor posee lifecycle técnico, workspace efímero, sandbox/process tree,
runtime discovery/compatibility, snapshots, diff, hashes, Evidence, checkpoints,
fencing y promoción gobernada.

No posee Intent/BISP, workflow Temporal, selección AITAP, policy Nucleus,
secretos Vault ni interpretación del BSIP Response.

## Runtime model

- OpenCode: `first_party_runtime`, distribuido por BTIPS, worker aislado por
  execution slot.
- Codex CLI, Claude Code CLI y futuros CLIs: `external_runtime`, descubiertos,
  verificados y registrados por Executor; nunca instalados por Setup/Metamorph.
- Runtime Adapters se compilan dentro de Executor; runtimes corren en procesos
  separados.
- Runtime e Intelligence Provider/Model son dimensiones independientes.

## Seguridad invariante

- runtime sin acceso al workspace canónico;
- execution root privado por attempt;
- identidad de servicio no administrativa, nunca `LocalSystem`;
- secrets fuera de package/logs/Evidence;
- sólo Promotion Engine escribe canónico;
- preconditions, Grant y fence vigentes antes de promover;
- resultado tardío se evidencia, nunca se aplica;
- discovery no ejecuta el primer PATH candidate;
- ningún session ID nativo es estado durable.

## Deployment

```text
BloomNucleus/
├─ bin/executor/{executor.exe,executor.manifest.json,runtime-compatibility.json}
├─ config/executor/{executor.json,runtimes.json,sandbox-policy.json,compatibility.json}
├─ logs/executor/
└─ runtime/executor/{workspaces,checkpoints,evidence,runtime-homes,tmp}/
```

Setup instala/configura/registrará el servicio. Metamorph administra inspect,
stage, atomic replace, migración, restart, semantic health y rollback.

## Gates

- Gate B: work packages Setup/Metamorph aceptados.
- Gate C: contratos y runtime_port aprobados antes de runtimes reales.
- Gate D: containment probado antes de repos reales.
- Gate E: batería ejecutada antes de `CONFORMANT`.

La decisión formal que aprueba esta identidad permanece en
[`COGNITUUM_EXECUTOR_APPLICATION_DECISION_v1_0.md`](../GOVERNANCE/ARCHITECTURE/COGNITUUM_EXECUTOR_APPLICATION_DECISION_v1_0.md).

