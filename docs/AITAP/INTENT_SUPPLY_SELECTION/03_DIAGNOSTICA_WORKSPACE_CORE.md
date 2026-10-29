# Encargo 3 — Diagnóstica Workspace Core: diseño de experiencia

## Párrafo disparador

Diagnóstica Workspace Core: leé primero `docs/AITAP/INTENT_SUPPLY_SELECTION/00_DOCUMENTO_MAESTRO.md` y luego este encargo. Diseñá la experiencia manual dentro de Wisdom usando exclusivamente superficies sanitizadas de Nucleus/AITAP. No implementes ni inventes payloads propios: entregá wireflow, estados, contratos consumidos y la lista cerrada de archivos para que Runner Core implemente después de la aprobación de José.

## Misión

Definir cómo el Paladín visualiza Intents cognitivos, entiende opciones, selecciona un destino por Intent, corrige incompatibilidades y entrega el paquete validado al inicio de Mandate Genesis.

## Recorrido mínimo

1. Abrir el detalle del Mandate instalado/preparado en Wisdom.
2. Mostrar `Seleccionar suministro` solo con contrato preparado.
3. Mostrar cada Intent cognitivo con propósito y límites comprensibles.
4. Mostrar destinos elegibles y sugerencias diferenciadas.
5. Permitir repetir destino en varios Intents.
6. Impedir continuar con selecciones faltantes.
7. Validar el conjunto mediante Nucleus/AITAP.
8. Mostrar resumen y advertencia de no persistencia.
9. Entregar el paquete al acto explícito de inicio.

## Estados a diseñar

- preparación pendiente;
- opciones cargando;
- sin destinos elegibles;
- selección incompleta;
- selección incompatible;
- validación expirada;
- listo para iniciar;
- inicio cancelado;
- error administrativo recuperable.

## Reglas de UI

- No mostrar runtimes de ejecución como proveedores de tokens.
- No mostrar secrets, key IDs internos ni policies editables.
- No prometer disponibilidad cuando AITAP reporta unknown/stale.
- Explicar indisponibilidad sin exponer información sensible.
- Indicar que cerrar antes de iniciar elimina la selección.
- Indicar que validar no consume tokens ni activa el Mandate.
- No confundir sugerencia con obligación.

## Entregables

- mapa de pantallas y transiciones;
- wireframe textual o visual;
- copy de estados, bloqueos y confirmación;
- modelo de estado de sesión;
- contratos consumidos sin redefinirlos;
- accesibilidad y listas grandes;
- lista exacta de archivos para Runner Core;
- criterios visuales y funcionales.

## Handoff

El resultado debe ser una instrucción ejecutable para Runner Core, con todos los estados resueltos y sin decisiones arquitectónicas ocultas.

