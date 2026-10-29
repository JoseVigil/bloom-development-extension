# Encargo 5 — Mandate Genesis: consumo del paquete por Intent

## Párrafo disparador

Mandate Genesis: leé primero `docs/AITAP/INTENT_SUPPLY_SELECTION/00_DOCUMENTO_MAESTRO.md` y después este encargo. Integrá el paquete manual validado como input técnico del workflow y utilizá la asignación correspondiente al solicitar Intelligence Supply a AITAP. Mandate Genesis no selecciona providers, no modifica el paquete, no aplica fallback silencioso y no interpreta autoridad. Antes de implementar, relevá el código real, devolvé la lista exacta de archivos y esperá aprobación de José.

## Misión

Conectar el paquete producido por Core con los consumos cognitivos del grafo:

```text
ing -> dis -> doc -> exp -> [dev condicional] -> exp
```

Solo los nodos que el contrato preparado declare consumidores de inteligencia requieren asignación.

## Responsabilidades

- Recibir el paquete al iniciar.
- Verificar `mandate_id` y `prepared_contract_digest`.
- Correlacionar `intent_id` y `action_id` sin tabla rígida de tipos.
- Conservar el paquete como input técnico del workflow iniciado.
- Construir el request de Supply con la asignación correcta.
- Permitir que AITAP revalide antes del provider.
- Pausar o devolver `action_required` si falta o se rechaza una asignación.
- Entregar la respuesta cruda a Brain.

## No debe hacer

- No elegir ni sustituir provider/model.
- No inferir fallback desde sugerencias.
- No resolver credenciales ni llamar providers directamente.
- No interpretar Authority ni modificar Grants.
- No confundir Supply con runtime de ejecución.

## Casos a definir

- Intent no cognitivo;
- rama `dev` no ejecutada;
- rama `dev` ejecutada con asignación incluida;
- validación expirada;
- provider no disponible al revalidar;
- replay del workflow;
- intento incierto y protección contra duplicación;
- cancelación antes y después del contacto.

## PASS

- Cada consumo usa exactamente la asignación del Intent.
- Replay no vuelve a seleccionar ni duplica una inferencia incierta.
- Rechazo produce pausa explícita, no sustitución.
- El workflow continúa aunque Core esté cerrado.
- Brain sigue siendo dueño de interpretar la respuesta.

## Handoff

Mandate Genesis entrega a Integración E2E un recorrido reproducible con fixtures y puntos observables para routing, pausa y Accounting.

