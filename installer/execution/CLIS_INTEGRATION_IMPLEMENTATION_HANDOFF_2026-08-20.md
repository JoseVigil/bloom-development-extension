# Transferencia formal a CLIS Integration

**Origen:** ARCHITECTURE  
**Destino:** CLIS INTEGRATION  
**Estado:** supersedido por `EXECUTOR_IMPLEMENTATION_HANDOFF_2026-08-20.md`  
**Fecha:** 2026-08-20

## Autoridad

> **Renombre normativo:** CLIS Integration ahora es el work `EXECUTOR`. Este
> documento se conserva como trazabilidad histórica; no debe iniciar un work
> paralelo ni una segunda implementación.

CLIS Integration implementará Execution Layer y sus Runtime Adapters conforme a
[`COGNITUUM_EXECUTION_RUNTIME_ADAPTERS_NORM_v1_0.md`](../../docs/GOVERNANCE/ARCHITECTURE/COGNITUUM_EXECUTION_RUNTIME_ADAPTERS_NORM_v1_0.md).
Ante contradicción, esa norma y
`COGNITUUM_RESPONSIBILITY_BOUNDARIES.md` prevalecen. El código y comportamiento
observado prevalecen para describir estado implementado, pero no alteran
ownership sin una nueva decisión de Architecture.

## Alcance transferido

- servicio persistente Execution Layer;
- core neutral, execution roots y brokers;
- snapshot/diff/scope/Evidence/promotion;
- runtime_port y proyección de eventos;
- integración first-party de OpenCode;
- adapters externos Codex CLI y Claude Code CLI;
- containment Windows primero, Linux después y puerto futuro macOS;
- fencing, idempotencia, checkpoints y recovery;
- conformidad EXC-001..010 y piloto EXC-007/008.

No se transfiere semántica BISP, parseo de BSIP Response, selección de runtime o
provider/model, Grants, custodia de secretos ni workflow Temporal.

## Etapa 0 — recepción obligatoria

Antes de adapters o procesos reales, CLIS Integration debe devolver:

1. árbol físico propuesto bajo `installer/execution/`;
2. lenguaje/runtime del servicio y justificación operacional;
3. interfaz exacta de `runtime_port`;
4. schemas versionados de Runtime Projection, Native Event, Result y Evidence;
5. modelo común de errores;
6. Workspace Broker y estrategia de copia/snapshot;
7. Sandbox Broker Windows, incluyendo restricted token y Job Object;
8. Promotion Engine, atomicidad y failure recovery;
9. drivers de compatibilidad/versiones para cada runtime;
10. plan de pruebas unitarias, contractuales, de escape y E2E;
11. contradicciones encontradas con v1/código real;
12. orden de implementación y dependencias;
13. riesgos que requieren aprobación.

La devolución debe etiquetar cada afirmación como `IMPLEMENTADO`, `PARCIAL`,
`BROKEN`, `TARGET` o `NOT_RUN`.

## Orden autorizado

1. Reconciliación y propuesta contractual.
2. DTOs, runtime_port, fixtures y errores.
3. Core con fake runtime determinístico.
4. Containment Windows y pruebas de escape.
5. OpenCode first-party por worker aislado, no el servicio global `:4096`.
6. Codex CLI externo.
7. Claude Code CLI externo.
8. Checkpoint/fencing/recovery y EXC-007/008.
9. Backend Linux y matriz cross-platform.

## Stop conditions

- Sin Gate A no se inicia un runtime real.
- Sin Gate B no se apunta a un repositorio real.
- Sin Gate C no se promueve al workspace canónico.
- Sin batería no se usa `CONFORMANT`.
- El servicio global OpenCode sin auth y ejecutado como `LocalSystem` queda fuera
  del camino gobernado.
- Una duda de ownership vuelve a Architecture; no se resuelve dentro del adapter.

## Contradicciones conocidas que CLIS debe reconciliar

- contracts v1 usan `provider` para runtime y carecen de identidades/fencing;
- estructura provisional usa `providers/`, mientras la norma cierra `runtimes/`;
- no existe todavía core, runtime host ni conformance runner;
- Metamorph tiene source path OpenCode roto y sin inventory/version discovery;
- health de OpenCode es sólo TCP;
- AITAP routing todavía requiere separar de extremo a extremo runtime y
  effective intelligence.

## Criterio de aceptación de la transferencia

La transferencia se considera recibida cuando `AGENTS.md` y `README.md` apuntan
a este handoff y CLIS entrega la respuesta de Etapa 0. No equivale a aprobación
de contratos ni a autorización para ejecutar runtimes.
