# AITAP — Runtime and Intelligence Routing v2

**Estado:** norma vigente del work AITAP  
**Versión:** 2.0  
**Fecha:** 2026-08-20

Una decisión AITAP contiene dos dimensiones ortogonales y obligatorias:

```text
runtime.runtime_id + runtime.runtime_kind
effective_intelligence.backend_id + provider + model
  + credential_ref + accounting_ref
```

OpenCode existe únicamente como runtime `opencode`, de clase
`first_party_runtime`. Codex CLI y Claude Code CLI son `external_runtime`.
OpenCode no puede registrarse como provider/backend/model.

Executor publica a AITAP un Runtime Capability Descriptor sanitizado: runtime
ID/kind, capabilities, backends soportados, health, compatibility y conformance.
No publica paths, binarios, protocolo nativo, procesos ni Evidence. AITAP posee
el catálogo de backend/model, Credential References, policy y Accounting.

El fingerprint SHA-256 cubre request, policy completa, snapshot completo,
runtime seleccionado, backend y model. Cambiar cualquiera produce una nueva
decisión auditable. Runtime health y backend health se filtran por separado.

AITAP no descubre runtimes, no resuelve secretos, no ejecuta procesos, no toca
workspaces, no posee checkpoints/fencing/Evidence y no parsea BSIP Response.

La versión vigente es `cognituum.routing/v2` bajo
`installer/aitap/contracts/v2/`. V1 queda `SUPERSEDED` y no admite conversión
implícita. El snapshot `genesis-pilot/v2` es un fixture `simulated`; health y
compatibility reales continúan `unknown` hasta consumir publicación de Executor.

