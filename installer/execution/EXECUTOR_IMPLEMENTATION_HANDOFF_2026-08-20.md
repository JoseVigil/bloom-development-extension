# Transferencia formal a EXECUTOR

> **Ubicación histórica:** el handoff vigente fue migrado a
> `docs/EXECUTOR/EXECUTOR_IMPLEMENTATION_HANDOFF_2026-08-20.md`. Consumir esa
> versión y `docs/EXECUTOR/EXECUTOR_IMPLEMENTATION_SPEC_v1_0.md`.

**Origen:** ARCHITECTURE  
**Destino:** EXECUTOR, antes CLIS INTEGRATION  
**Estado:** autorizado para Etapa 0; runtimes reales bloqueados por Gate C  
**Fecha:** 2026-08-20

## Mandato

Implementar la aplicación first-party Executor en Go conforme a:

- `docs/GOVERNANCE/ARCHITECTURE/COGNITUUM_EXECUTOR_APPLICATION_DECISION_v1_0.md`;
- `docs/GOVERNANCE/ARCHITECTURE/COGNITUUM_EXECUTION_RUNTIME_ADAPTERS_NORM_v1_0.md`;
- `docs/GOVERNANCE/ARCHITECTURE/COGNITUUM_RESPONSIBILITY_BOUNDARIES.md`.

CLIS Integration queda renombrado EXECUTOR. Este handoff reemplaza
`CLIS_INTEGRATION_IMPLEMENTATION_HANDOFF_2026-08-20.md`.

## Primera devolución obligatoria

Antes de scaffold sustantivo o runtimes reales, EXECUTOR debe entregar:

1. plan de migración `installer/execution/` → `installer/executor/` preservando
   historia y evitando implementaciones simultáneas;
2. árbol definitivo y módulos Go;
3. CLI y JSON help contractuales;
4. service lifecycle e IPC autenticado;
5. DTOs v2 y Runtime Port;
6. errores comunes;
7. Discovery core, trust model y compatibility registry;
8. Workspace Broker y Windows Sandbox Broker;
9. Snapshot/Evidence/Promotion Engines;
10. design de adapters OpenCode/Codex/Claude;
11. work package para Setup;
12. work package para Metamorph;
13. pruebas unitarias, contractuales, containment, E2E y conformidad;
14. riesgos, contradicciones y decisiones que vuelven a Architecture.

Cada afirmación usa `IMPLEMENTADO`, `PARCIAL`, `BROKEN`, `TARGET` o `NOT_RUN`.

## Orden de implementación autorizado

1. Reconciliación y migración física aprobada.
2. Scaffold Go, CLI/JSON help, config/logging/service shell.
3. Contratos v2, Runtime Port y fake runtime.
4. Discovery/trust/compatibility.
5. Workspace/Snapshot/Evidence/Promotion fake.
6. Containment Windows.
7. OpenCode first-party aislado.
8. Codex y Claude externos.
9. Checkpoint/fencing/recovery.
10. Setup/Metamorph y conformance matrix.

## Stop conditions

- No mover el árbol sin plan de referencias/historia aprobado.
- No iniciar runtimes reales sin Gate C.
- No tocar repositorios reales sin Gate D.
- No promover sin preconditions/fence/atomicidad/Evidence.
- No ejecutar un externo sin trust y registration explícita.
- No declarar conformidad sin batería.
- No usar el OpenCode global inseguro de `:4096` para ejecución gobernada.
