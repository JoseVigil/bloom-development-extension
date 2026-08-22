# Cognituum Execution Layer

Ubicación física propuesta y materializada de la Execution Layer. En este corte
solo existen contratos v1 provisionales; core, adapters y batería ejecutable
permanecen pendientes. Ninguna batería puede comenzar antes del gate de
reconciliación.

OpenCode es el runtime first-party administrado de Cognituum. Setup/Installer ya
materializa su binario y servicio; Metamorph contiene lifecycle de rollout
parcial. La integración neutral de Execution sigue pendiente. Codex CLI y
Claude Code CLI son integraciones externas administradas por Executor. Los contratos
v1 que denominan `provider` al runtime requieren revisión versionada.

Ver
[`COGNITUUM_EXECUTION_LAYER_CONFORMANCE_v1_0.md`](../../docs/GOVERNANCE/ARCHITECTURE/COGNITUUM_EXECUTION_LAYER_CONFORMANCE_v1_0.md).

Gate activo:
[`COGNITUUM_EXECUTION_RECONCILIATION_2026-08-20.md`](../../docs/GOVERNANCE/ARCHITECTURE/COGNITUUM_EXECUTION_RECONCILIATION_2026-08-20.md).

Norma cerrada:
[`COGNITUUM_EXECUTION_RUNTIME_ADAPTERS_NORM_v1_0.md`](../../docs/GOVERNANCE/ARCHITECTURE/COGNITUUM_EXECUTION_RUNTIME_ADAPTERS_NORM_v1_0.md).

Decisión de aplicación:
[`COGNITUUM_EXECUTOR_APPLICATION_DECISION_v1_0.md`](../../docs/GOVERNANCE/ARCHITECTURE/COGNITUUM_EXECUTOR_APPLICATION_DECISION_v1_0.md).

Documentación y transferencia formal vigente de EXECUTOR:
[`docs/EXECUTOR/README.md`](../../docs/EXECUTOR/README.md).

Estado de recepción: Etapa 0 habilitada. Gate C bloquea la implementación de
runtimes reales hasta que EXECUTOR devuelva y Architecture apruebe árbol, lenguaje,
DTOs, `runtime_port`, errores, containment, promotion y plan de pruebas.

Esta carpeta es staging provisional y no es ubicación documental vigente. El target aprobado es
`installer/executor/`; la migración debe preservar historia y no dejar dos
implementaciones activas.
