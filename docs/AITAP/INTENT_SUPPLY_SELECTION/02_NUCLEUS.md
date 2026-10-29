# Encargo 2 — Nucleus: puente administrativo transitorio

## Párrafo disparador

Nucleus: leé primero `docs/AITAP/INTENT_SUPPLY_SELECTION/00_DOCUMENTO_MAESTRO.md` y después este encargo. Debés conectar Core con la elegibilidad y validación de AITAP usando Authority y Vault sin custodiar una configuración durable. Investigá qué superficies existentes pueden reutilizarse, devolvé la lista exacta de archivos y esperá aprobación antes de implementar.

## Misión

Proveer el puente administrativo para que Core solicite opciones y valide asignaciones sin acceder directamente a secrets, policies ni proyecciones internas de Authority.

## Responsabilidades

- Resolver organización, instalación, proyecto, Mandate y digest preparado.
- Resolver el Grant vigente y producir evidencia detached.
- Exponer metadata sanitizada de Credential References.
- Entregar a AITAP evidencia de elegibilidad.
- Recibir el paquete de Core y solicitar validación a AITAP.
- Devolver errores sanitizados por Intent.
- Comprobar actor y contexto vigentes.

## No debe hacer

- No seleccionar provider/model.
- No conservar preferencias, perfiles ni configuración reusable.
- No entregar secretos.
- No interpretar respuestas cognitivas.
- No reservar presupuesto durante listado/validación.
- No tratar sugerencias como autorización.

## No persistencia

Antes del inicio, la selección permanece en la sesión de Core. Nucleus no crea un registro durable. Una vez iniciado, el paquete puede viajar como input técnico; Nucleus no lo convierte en preferencia administrativa.

## Entregables

- endpoints o comandos mínimos;
- contratos Core↔Nucleus y Nucleus↔AITAP;
- autoridad de campos;
- validación del actor;
- tratamiento de revocación, expiración y evidencia stale;
- errores sanitizados;
- lista exacta de archivos y pruebas.

## PASS

- Core nunca ve secretos ni datos innecesarios del Grant.
- AITAP recibe evidencia suficiente para fallar cerrado.
- Validar es idempotente y no consume tokens.
- Cerrar antes del inicio no deja configuración durable.
- Grant revocado o vencido bloquea el destino.

## Handoff

Nucleus entrega a Core una superficie administrativa estable y a Integración E2E fixtures sanitizados para casos permitidos, denegados y stale.

