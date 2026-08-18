# Contrato de protocolo — Organization Switch

## Principio

Cortex solicita el cambio, Brain transporta el mensaje, Conductor coordina y Nucleus decide si el cambio puede realizarse. Ningún relay ni componente visual puede sustituir la decisión de gobernanza de Nucleus.

## `SWITCH_ORGANIZATION`

Solicitud iniciada desde Cortex/Discovery y enviada a Conductor a través de Brain.

Payload vigente:

```json
{
  "org_id": "string",
  "org_slug": "string"
}
```

Conductor debe consultar `can-switch-org` antes de modificar la organización activa. Si el cambio está permitido, valida el destino, inicia el bloqueo de drenado, persiste `active_org_slug`, finaliza el drenado y publica la confirmación.

## `ORGANIZATION_SWITCHED`

Confirmación de un cambio completado correctamente.

Payload vigente:

```json
{
  "org_id": "string",
  "org_slug": "string",
  "batcave_endpoint_rest": "string",
  "batcave_endpoint_wss": "string"
}
```

Los endpoints deben provenir del contexto real de la organización. La implementación actual conserva placeholders; su resolución productiva sigue pendiente.

## `ORGANIZATION_SWITCH_STATUS`

Nombre reservado, pero sin payload aprobado. No debe declararse ni implementarse por inferencia hasta que su contrato sea decidido explícitamente.

## Reglas operativas

- Cambiar a la organización ya activa es un no-op exitoso, sujeto a validación del estado actual.
- Un cambio bloqueado debe devolver las razones de Nucleus sin reemplazarlas por un error genérico y debe quedar auditado.
- Mientras `draining` esté activo no pueden aceptarse nuevos trabajos ni un segundo cambio concurrente.
- Después del cambio no puede permanecer estado, caché, sesión o credencial perteneciente a la organización anterior.
- La autoridad de organización se resuelve con la precedencia canónica documentada por Nucleus; los consumidores no construyen una fuente paralela.
