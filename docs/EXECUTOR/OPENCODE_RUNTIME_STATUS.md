# OpenCode dentro de Executor

OpenCode es el runtime first-party de Executor, no un provider/model ni un CLI
externo. Su auditoría operacional vigente permanece en Architecture porque
documenta estado transversal de Setup y Metamorph:

[`OPENCODE_FIRST_PARTY_RUNTIME_STATUS_2026-08-20.md`](../GOVERNANCE/ARCHITECTURE/OPENCODE_FIRST_PARTY_RUNTIME_STATUS_2026-08-20.md).

Para implementación, prevalece
[`EXECUTOR_IMPLEMENTATION_SPEC_v1_0.md`](./EXECUTOR_IMPLEMENTATION_SPEC_v1_0.md),
especialmente el adapter OpenCode, containment, credenciales, health y gates.

Estado: binario/servicio global observado; worker gobernado por execution slot,
auth efímera y adapter neutral todavía `NOT_RUN`/no implementados.

