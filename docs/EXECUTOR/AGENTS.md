# docs/EXECUTOR — instrucciones del work

Esta carpeta es la única ubicación documental de la aplicación Executor.

- Leer `README.md`, arquitectura, implementation spec y handoff antes de actuar.
- `Execution Layer` nombra el plano; `Executor` nombra la aplicación Go.
- Target source único: `installer/executor/`.
- No crear dos implementaciones activas con `installer/execution/`.
- No iniciar runtimes reales antes de Gate C ni repos reales antes de Gate D.
- Código gana para estado implementado; Architecture gana para ownership.
- Todo gap usa finding `CAF-*` nuevo o referencia uno existente.
- Documentar siempre `IMPLEMENTADO`, `PARCIAL`, `BROKEN`, `TARGET` o `NOT_RUN`.
- Un cambio de ownership, contrato neutral, aislamiento o promoción vuelve a
  Architecture; no se resuelve silenciosamente en Executor.

