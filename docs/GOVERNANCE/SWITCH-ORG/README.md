# Organization Switch

Feature transversal para cambiar la organización activa de una instancia de Bloom sin mezclar ejecución, datos ni credenciales entre organizaciones.

## Fuentes vigentes

1. `ORGANIZATION_SWITCH_ARCHITECTURE.md` — decisiones, invariantes y guardas G1-G8.
2. `ORGANIZATION_SWITCH_PROTOCOL.md` — mensajes y responsabilidades entre Cortex, Brain y Conductor.
3. `ORGANIZATION_SWITCH_IMPLEMENTATION_STATUS.md` — auditoría de código, implementación realizada, verificaciones y pendientes.

Los documentos históricos de prompt fueron consolidados en estas fuentes y no son fuentes vigentes.

## Ownership por componente

| Componente | Responsabilidad |
|---|---|
| Nucleus | Autoridad de `can-switch-org`, bloqueo de drenado, auditoría y aislamiento de Vault |
| Conductor / Workspace Core | Orquestación del cambio y persistencia de la organización activa |
| Cortex / Discovery | Inicio del cambio y presentación del resultado al usuario |
| Brain | Relay de protocolo; no decide si el cambio está autorizado |
| Temporal / Mandate | Evidencia de trabajo no terminal |
| Batcave | Resolución de endpoints y contexto de la organización activa |

## Estado resumido

La cadena principal está implementada en buena medida y pasó controles sintácticos y de compilación. Siguen pendientes la certificación end-to-end con Brain, Temporal y dos organizaciones reales; la resolución productiva de endpoints; la definición de `ORGANIZATION_SWITCH_STATUS`; y confirmar la cobertura completa de todas las clases de trabajo in-flight.
