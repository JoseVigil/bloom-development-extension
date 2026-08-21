# Migración de routing v1 a v2

- `selected_target` se reemplaza por `runtime` y `effective_intelligence`.
- `target_class` se reemplaza por `runtime_kind` exclusivamente.
- `opencode` sólo puede existir en `runtimes`; nunca como provider/backend.
- `synapse_simulator` deja el registry de runtimes de Executor.
- `managed_by` y paths no ingresan al descriptor sanitizado.
- health de runtime y backend se registran/evalúan independientemente.
- una decisión V1 no puede promoverse automáticamente a V2: debe reevaluarse
  contra policy y snapshot V2.

Artefactos V1 se conservan como evidencia histórica y quedan fuera del path
por defecto del CLI y del motor.
