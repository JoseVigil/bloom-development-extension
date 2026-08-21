# Executor

Executor es la aplicación first-party Go que implementa el plano arquitectónico
Execution Layer de Cognituum.

## Fuentes de este work

Leer en este orden:

1. [`EXECUTOR_ARCHITECTURE_v1_0.md`](./EXECUTOR_ARCHITECTURE_v1_0.md) — identidad,
   ownership, límites y topología de la aplicación.
2. [`EXECUTOR_IMPLEMENTATION_SPEC_v1_0.md`](./EXECUTOR_IMPLEMENTATION_SPEC_v1_0.md)
   — instrucciones completas para crear el proyecto Go.
3. [`EXECUTOR_IMPLEMENTATION_HANDOFF_2026-08-20.md`](./EXECUTOR_IMPLEMENTATION_HANDOFF_2026-08-20.md)
   — transferencia, orden, entregables y stop conditions.
4. [`OPENCODE_RUNTIME_STATUS.md`](./OPENCODE_RUNTIME_STATUS.md) — estado del
   runtime first-party y enlace a la auditoría transversal.

Normas superiores que no se duplican ni reinterpretan:

- [`COGNITUUM_RESPONSIBILITY_BOUNDARIES.md`](../GOVERNANCE/ARCHITECTURE/COGNITUUM_RESPONSIBILITY_BOUNDARIES.md);
- [`COGNITUUM_EXECUTION_RUNTIME_ADAPTERS_NORM_v1_0.md`](../GOVERNANCE/ARCHITECTURE/COGNITUUM_EXECUTION_RUNTIME_ADAPTERS_NORM_v1_0.md);
- [`COGNITUUM_EXECUTION_LAYER_CONFORMANCE_v1_0.md`](../GOVERNANCE/ARCHITECTURE/COGNITUUM_EXECUTION_LAYER_CONFORMANCE_v1_0.md).

## Estado

- Gate A, identidad/ownership: cerrado.
- Source target: `installer/executor/`.
- Staging legacy: `installer/execution/`, sólo hasta migración aprobada.
- Proyecto Go: no creado.
- Contratos v2: no aprobados.
- Runtimes reales: bloqueados por Gate C.
- Repositorios reales: bloqueados por Gate D.
- Conformidad: `NOT_RUN`.
