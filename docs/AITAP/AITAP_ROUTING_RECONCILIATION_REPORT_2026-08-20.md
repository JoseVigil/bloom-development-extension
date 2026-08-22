# AITAP — reporte de reconciliación runtime/intelligence

**Fecha:** 2026-08-20  
**Alcance:** `installer/aitap/` y `docs/AITAP/`

## Clasificación de artefactos auditados

| Artefacto previo | Clasificación | Tratamiento |
|---|---|---|
| Routing Request/Decision v1 | `SUPERSEDED` | retenido histórico; engine rechaza V1 |
| Capability Descriptor v1 | `SUPERSEDED` | reemplazado por dos descriptors v2 |
| `genesis-pilot-v1` | `BROKEN` | mezclaba dimensiones y health no observado |
| `genesis-cross-cli-proof/v1` | `SUPERSEDED` | reemplazada por policy ortogonal v2 |
| ejemplo v1 | `SUPERSEDED` | reemplazado por request v2 |
| motor v1 | `CORRECTED` | selecciona runtime y backend/model por separado |
| `route decide` y status | `CORRECTED` | defaults y mensajes apuntan a V2 |
| tests v1 | `SUPERSEDED` | reemplazados por invariantes V2 |
| guardrails OpenCode | `ACCEPTED/CORRECTED` | único runtime; prohibición como provider |

V1 se conserva como evidencia histórica, fuera del path por defecto.

## Inventario archivo por archivo

| Ruta | Estado/tratamiento |
|---|---|
| `contracts/v1/routing-request.schema.json` | `SUPERSEDED`, retenido |
| `contracts/v1/routing-decision.schema.json` | `SUPERSEDED`, retenido |
| `contracts/v1/capability-descriptor.schema.json` | `SUPERSEDED`, retenido |
| `contracts/v1/README.md` | `IMPLEMENTADO`, marcador de migración |
| `contracts/v2/routing-request.schema.json` | `IMPLEMENTADO` |
| `contracts/v2/routing-decision.schema.json` | `IMPLEMENTADO` |
| `contracts/v2/runtime-capability-descriptor.schema.json` | `IMPLEMENTADO` |
| `contracts/v2/intelligence-capability-descriptor.schema.json` | `IMPLEMENTADO` |
| `contracts/v2/capability-registry.schema.json` | `IMPLEMENTADO` |
| `contracts/v2/routing-accounting-event.schema.json` | `IMPLEMENTADO` como contrato; store `TARGET` |
| `registry/genesis-pilot-v1.json` | `BROKEN/SUPERSEDED`, retenido |
| `registry/genesis-pilot-v2.json` | `PARCIAL`, fixture simulado |
| `policies/genesis-cross-cli-proof-v1.json` | `SUPERSEDED`, retenida |
| `policies/genesis-runtime-intelligence-v2.json` | `IMPLEMENTADO` como policy determinística |
| `examples/genesis-ing-request.json` | `SUPERSEDED`, retenido |
| `examples/genesis-ing-request-v2.json` | `IMPLEMENTADO` |
| `src/aitap/routing/engine.py` | `CORRECTED/IMPLEMENTADO` para snapshots V2 |
| `src/aitap/commands/route/route_decide.py` | `CORRECTED`; default V2 |
| `src/aitap/commands/route/route_status.py` | `CORRECTED` |
| `src/aitap/commands/system/status.py` | `CORRECTED` |
| `tests/test_routing_engine.py` | `CORRECTED/IMPLEMENTADO` |
| `MIGRATION_v1_to_v2.md` | `IMPLEMENTADO` |
| `README.md` y `AGENTS.md` | `CORRECTED` contra norma Executor |
| `docs/AITAP/AITAP_Decision_Intelligence_Execution_Routing_v1.md` | `SUPERSEDED` |
| `docs/AITAP/AITAP_Decision_OpenCode_BSIP_CLIS_v1.md` | `ACCEPTED`, corrección Architecture |
| `docs/AITAP/AITAP_Runtime_Intelligence_Routing_v2.md` | `IMPLEMENTADO`, norma vigente AITAP |

Los restantes archivos de CLI base, keys, help, config, VERSION y documentos
históricos no requerían cambio funcional para esta reconciliación: `ACCEPTED`.

## Estado resultante

| Área | Estado |
|---|---|
| Schemas routing v2 | `IMPLEMENTADO` |
| Separación runtime/intelligence | `IMPLEMENTADO` |
| Fingerprint determinístico | `IMPLEMENTADO` |
| Accounting attribution | `PARCIAL`: referencias presentes; store pendiente |
| Runtime descriptor sanitizado | `IMPLEMENTADO` como contrato |
| Runtime registry real | `TARGET`: Executor aún no implementado |
| Runtime health real | `NOT_RUN`: fixture usa `unknown` |
| Backend health real | `NOT_RUN`: fixture usa `unknown` |
| Vault resolution | `TARGET`: sólo Credential References |
| Dynamic failover/circuit breaker | `TARGET` |
| CLI end-to-end | `NOT_RUN`: runtime de prueba sin Typer |
| Runtime execution/Evidence | fuera de alcance; owner Executor |

## Gaps que vuelven a Architecture

- El descriptor definitivo publicado por Executor depende de Gate C; V2 no
  declara aprobado el contrato neutral de Executor.
- `synapse_simulator` fue retirado del registry de runtimes. Reincorporarlo como
  runtime requiere decisión de Architecture y publicación por Executor.
- Los modelos del fixture son referencias de desarrollo existentes, no health,
  disponibilidad ni aprobación productiva observadas.
