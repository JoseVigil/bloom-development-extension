# Encargo 5 — Mandate Genesis: consumo del paquete por Intent

## Párrafo disparador

Mandate Genesis: leé primero `docs/AITAP/INTENT_SUPPLY_SELECTION/00_DOCUMENTO_MAESTRO.md` y después este encargo. Integrá el paquete manual validado como input técnico del workflow y utilizá la asignación correspondiente al solicitar Intelligence Supply a AITAP. Mandate Genesis no selecciona providers, no modifica el paquete, no aplica fallback silencioso y no interpreta autoridad. Antes de implementar, relevá el código real, devolvé la lista exacta de archivos y esperá aprobación de José.

## Misión

Conectar el paquete producido por Core con los consumos cognitivos del grafo:

```text
ing -> dis -> doc -> exp -> [dev condicional] -> exp
```

Solo los nodos que el contrato preparado declare consumidores de inteligencia requieren asignación.

## Resolución W4 para este vertical

José ratificó que la selección manual de Intelligence Supply permanece únicamente en la sesión de Core hasta el acto explícito de inicio. Para este vertical, esta regla reemplaza la propuesta anterior de un recibo W4 durable previo al inicio: no se crea ni se exige ese recibo para conservar las asignaciones. Al iniciar, Nucleus verifica el paquete validado y su vínculo con el Mandate y el digest preparado; el paquete pasa a ser input técnico durable del workflow iniciado. Cerrar Core antes de iniciar descarta la selección; cerrarlo después no elimina el input del workflow. Los workflows ya iniciados conservan su historia. Esta resolución no autoriza por sí misma a iniciar un Mandate existente ni a migrar su estado.

## Responsabilidades

- Recibir el paquete al iniciar.
- Verificar `mandate_id` y `prepared_contract_digest`.
- Vincular cada consumo al `action_id` del contrato preparado; `intent_type` puede repetirse y no identifica una asignación.
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

