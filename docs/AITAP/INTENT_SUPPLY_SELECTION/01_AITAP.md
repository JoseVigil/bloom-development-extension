# Encargo 1 — AITAP: contrato y validación de asignaciones manuales

## Párrafo disparador

AITAP: leé primero `docs/AITAP/INTENT_SUPPLY_SELECTION/00_DOCUMENTO_MAESTRO.md` y después ejecutá este encargo. Necesitamos que AITAP sea la fuente de destinos elegibles y valide el paquete manual por Intent sin seleccionar automáticamente, persistir configuraciones, consumir tokens durante la validación ni cruzar la frontera hacia Execution Layer. Antes de implementar, contrastá contratos y código vigentes, devolvé brechas y una lista exacta de archivos, y esperá aprobación expresa de José.

## Misión

Diseñar y posteriormente implementar la superficie que permita:

1. obtener destinos elegibles para un Intent;
2. validar un paquete completo de asignaciones manuales;
3. aceptar la asignación validada en el Supply real;
4. revalidar antes del contacto con el provider.

## Investigación obligatoria

- contratos actuales de Intelligence Supply y su enumeración de Intents;
- `routing/engine.py`, especialmente `supply_routes()` y `decide()`;
- `intelligence/service.py` y chequeos previos;
- policies, registry, health, Vault client, Grants y Accounting;
- soporte CLI read-only sin nueva categoría;
- campos que deben provenir de Nucleus.

## Entregables

- schema neutral `Intent Supply Assignments`;
- request/response de destinos elegibles;
- request/response de validación;
- forma de transportar la asignación en Supply;
- reason codes por Intent y paquete;
- fingerprint, expiración e idempotencia;
- tratamiento de digest cambiado, Grant vencido, health stale y credencial no utilizable;
- lista exacta de archivos y pruebas.

## Reglas

- No selección automática ni persistencia.
- No llamar providers al listar o validar.
- No recibir secretos desde Core.
- No interpretar BSIP Response.
- No invocar runtimes de ejecución ni tocar proyectos.
- No convertir fingerprint en autorización.
- No asumir que registry implica autorización o disponibilidad.

## PASS

- Mismo contrato para selección manual y recomendación futura.
- Validación completa de todos los Intents cognitivos.
- Supply rechaza asignación ausente, stale o incompatible antes del provider.
- Provider/model/backend efectivos quedan en Routing Decision y Accounting.
- Listado y validación prueban cero consumo.
- Privacidad local nunca cae a nube.

## Handoff

AITAP entrega a Nucleus contratos congelados, autoridad de campos, reason codes y evidencia requerida. Entrega a Mandate Genesis la forma exacta de incorporar una asignación al request de Supply.

