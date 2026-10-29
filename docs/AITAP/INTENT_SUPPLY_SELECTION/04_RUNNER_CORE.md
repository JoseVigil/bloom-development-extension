# Encargo 4 — Runner Core: implementación del selector manual

## Párrafo disparador

Runner Core: leé primero `docs/AITAP/INTENT_SUPPLY_SELECTION/00_DOCUMENTO_MAESTRO.md`, después el diseño aprobado de Diagnóstica Workspace Core y finalmente este encargo. Implementá únicamente la experiencia aprobada y los contratos congelados de Nucleus/AITAP. No agregues persistencia, acceso directo a Vault, reglas locales de elegibilidad ni selección automática. Antes de escribir, devolvé la lista exacta de archivos y esperá la aprobación de José correspondiente a tu Work.

## Misión

Implementar dentro de Wisdom el selector manual por Intent y el handoff de sesión hacia Mandate Genesis.

## Responsabilidades

- Leer Intents cognitivos de la proyección aprobada.
- Consultar destinos mediante Nucleus.
- Mantener selecciones solo en memoria de sesión.
- Exigir una selección por Intent cognitivo.
- Solicitar validación completa.
- Mostrar errores en el Intent correcto.
- Entregar el paquete validado al inicio.
- Limpiar estado al cancelar, cerrar o cambiar Mandate/digest.

## Fronteras negativas

- No leer registry, policy, Vault ni proyecto directamente.
- No decidir elegibilidad.
- No persistir en localStorage, archivos, base de datos o configuración.
- No consumir tokens ni iniciar Intents durante selección.
- No crear fallback silencioso.

## Pruebas mínimas

- mismo destino para todos;
- destinos distintos;
- Intent sin asignación;
- destino vencido antes de confirmar;
- digest preparado cambiado;
- ausencia de destinos;
- pérdida de selección al cerrar antes del inicio;
- cero secretos y cero llamadas directas a provider;
- handoff exacto del paquete validado.

## Handoff

Runner Core entrega a Mandate Genesis el mecanismo exacto de inicio y paquete de sesión, y a Integración E2E los fixtures necesarios.

