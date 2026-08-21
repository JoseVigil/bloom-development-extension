# Handoff de implementación — EXECUTOR

**Origen:** ARCHITECTURE  
**Destino:** EXECUTOR  
**Estado:** autorizado para diseño y scaffold posterior a aprobación de Etapa 0  
**Fecha:** 2026-08-20

## Instrucción

Crear el proyecto Go `installer/executor/` exactamente conforme a
[`EXECUTOR_IMPLEMENTATION_SPEC_v1_0.md`](./EXECUTOR_IMPLEMENTATION_SPEC_v1_0.md).

La primera entrega no implementa runtimes reales. Debe devolver:

1. plan de migración desde `installer/execution/` con historia y referencias;
2. árbol fuente definitivo;
3. decisiones de módulos/packages Go;
4. CLI y JSON help;
5. configuración, logging, telemetry, servicio e IPC;
6. DTOs v2, runtime_port y errores;
7. discovery/trust/compatibility;
8. Workspace/Sandbox/Credential Brokers;
9. Snapshot/Evidence/Promotion Engines;
10. adapters y version drivers;
11. work packages Setup y Metamorph;
12. plan de pruebas y matriz de gates;
13. contradicciones/riesgos que necesitan aprobación.

Cada afirmación se etiqueta `IMPLEMENTADO`, `PARCIAL`, `BROKEN`, `TARGET` o
`NOT_RUN`. No se aceptan stubs que se presenten como funcionales.

## Stop conditions

- no mover staging sin plan aprobado;
- no dos implementaciones activas;
- no runtime real antes de Gate C;
- no repositorio real antes de Gate D;
- no promoción antes de fence/preconditions/atomicidad/Evidence;
- no externo sin trust/registration;
- no `CONFORMANT` sin batería;
- no reutilizar el OpenCode global inseguro de `:4096`.

