# Selección manual de Intelligence Supply por Intent — Documento maestro

## 1. Propósito

Este paquete coordina el primer vertical manual para que el Paladín pueda asignar un destino de Intelligence Supply a cada Intent cognitivo de un Mandate preparado, validar el conjunto y entregarlo al flujo de Mandate Genesis.

Este documento es la fuente transversal. Los seis encargos especializados deben referenciarlo y no redefinir silenciosamente sus decisiones. Si el código contradice este paquete, el Work debe presentar la evidencia y detener el cambio afectado hasta que José Vigil resuelva la contradicción.

## 2. Decisiones cerradas

1. La selección es manual. No se implementa recomendación automática.
2. La selección corresponde exclusivamente a Intelligence Supply: `backend_id`, provider y model. No selecciona OpenCode, Codex CLI, Claude Code CLI ni otro runtime de ejecución.
3. Todo Intent que el contrato preparado declare consumidor de inteligencia requiere una asignación válida.
4. Un destino puede asignarse a varios Intents o a todos.
5. Las sugerencias incluidas por el Mandate son informativas, nunca obligatorias.
6. No se crean perfiles, preferencias, CRUD ni configuración durable reutilizable.
7. Core conserva la selección durante la sesión previa al inicio. Si Core se cierra antes de iniciar, la selección se pierde.
8. Una vez iniciado el workflow, el paquete puede viajar como input técnico durable. Esto no lo convierte en una preferencia administrativa.
9. AITAP no persiste asignaciones. Accounting registra únicamente los consumos que efectivamente ocurran.
10. Listar opciones y validar asignaciones no consume tokens, no activa el Mandate y no inicia Intents.
11. El futuro recomendador deberá producir el mismo contrato de asignaciones que utiliza la selección manual.

## 3. Vocabulario

- **Destino de Intelligence Supply:** combinación inequívoca de `backend_id`, provider y model evaluable por AITAP.
- **Proveedor:** servicio efectivo de inteligencia; no equivale a runtime de ejecución.
- **Backend:** ruta registrada por AITAP para provider/model y su Credential Reference.
- **Runtime de ejecución:** target de Execution Layer, fuera de este vertical.
- **Asignación:** elección transitoria de un destino para un Intent.
- **Paquete de asignaciones:** conjunto completo para un Mandate y digest preparado.
- **Validación:** evaluación read-only; no es inferencia ni ejecución.
- **Intent cognitivo:** Intent que el contrato preparado declara consumidor de Intelligence Supply. Core no lo deduce mediante una lista rígida.

## 4. Ownership

| Componente | Responsabilidad |
|---|---|
| AITAP | Publica destinos elegibles, valida asignaciones y suministra inteligencia usando la asignación recibida. |
| Nucleus | Provee evidencia sanitizada de Authority/Vault, verifica contexto y funciona como puente para Core. |
| Diagnóstica Workspace Core | Diseña experiencia, estados, contratos de UI y recorrido. |
| Runner Core | Implementa la interfaz y mantiene la selección en memoria de sesión. |
| Mandate Genesis/Brain | Recibe el paquete, lo asocia a Intents y solicita Supply a AITAP. |
| Integración E2E | Prueba el circuito y sus fronteras sin apropiarse del código de producto. |

Authority emite y revoca Grants. Nucleus Vault conserva secretos. Core nunca accede a secretos ni modifica policies. AITAP no interpreta la respuesta cognitiva, no orquesta el grafo y no ejecuta código.

## 5. Flujo canónico

```text
Contrato preparado identifica Intents cognitivos
  -> Nucleus reúne contexto administrativo sanitizado
  -> AITAP calcula destinos elegibles sin consumir tokens
  -> Core presenta Intents, destinos y sugerencias informativas
  -> Paladín selecciona un destino para cada Intent
  -> Nucleus entrega el conjunto a AITAP para validación read-only
  -> Core recibe resultado válido o correcciones por Intent
  -> al iniciar, Core entrega el paquete validado a Mandate Genesis
  -> Mandate Genesis asocia cada asignación al Intent
  -> antes de cada consumo, AITAP revalida y contacta al provider
  -> AITAP registra Accounting y devuelve respuesta cruda a Brain
```

## 6. Contrato neutral mínimo

El nombre definitivo y la versión pública requieren aprobación de José. Hasta entonces, los Works deben usar el concepto `Intent Supply Assignments` y evitar schemas incompatibles.

```json
{
  "schema_version": "PROPOSED.intent-supply-assignments/v1",
  "mandate_id": "UUID",
  "prepared_contract_digest": "sha256:HEX64",
  "assignments": [
    {
      "intent_id": "UUID",
      "action_id": "ing-1",
      "destination": {
        "backend_id": "gemini_api",
        "provider": "google",
        "model": "MODEL_ID"
      },
      "limits": {
        "max_inferences": 1,
        "max_output_tokens": 4096,
        "max_total_tokens": 12000
      }
    }
  ],
  "validation": {
    "fingerprint": "sha256:HEX64",
    "validated_at": "RFC3339",
    "valid_until": "RFC3339"
  }
}
```

Reglas:

- Core selecciona un destino, no una credencial.
- El contrato no contiene secretos, prompts, comandos, session IDs ni rutas de filesystem.
- Provider/model deben coincidir con el descriptor de `backend_id`.
- El digest impide aplicar la elección a otro contrato preparado.
- AITAP revalida antes del contacto con el provider.
- El fingerprint no es autorización ni sustituye al Grant.

## 7. Elegibilidad

AITAP solo presenta un destino como elegible cuando:

- está registrado y habilitado para Supply;
- satisface capabilities del Intent;
- respeta privacidad;
- está permitido por el Grant;
- posee Credential Reference utilizable o es local sin credencial;
- health y disponibilidad cumplen la frescura aprobada;
- límites por Intent y agregados son compatibles;
- los límites económicos pueden evaluarse con pricing verificable.

Lo desconocido falla cerrado.

## 8. Estados globales

- `not_ready`: falta contrato preparado o digest.
- `selection_required`: faltan asignaciones.
- `validation_required`: el conjunto no fue validado o cambió.
- `invalid`: una o más asignaciones son incompatibles.
- `ready_for_start`: conjunto completo y válido dentro de la sesión.
- `stale`: cambió el digest o expiró evidencia antes del inicio.
- `action_required`: AITAP rechazó una asignación al revalidar durante el workflow.

Ningún estado activa ni completa el Mandate.

## 9. Orden de los Works

1. AITAP fija contrato, listado elegible, validación y consumo manual.
2. Nucleus fija el puente sanitizado y la autoridad de campos.
3. Diagnóstica Workspace Core diseña el recorrido.
4. Runner Core implementa el diseño aprobado.
5. Mandate Genesis integra el paquete como input y lo usa por Intent.
6. Integración E2E verifica el circuito completo.

Diagnóstica Core puede avanzar en wireframes mientras AITAP diseña el contrato, pero Runner Core no debe cristalizar payloads propios antes de congelarlo.

## 10. PASS global

- Todos los Intents cognitivos tienen exactamente una asignación válida.
- Los destinos mostrados son elegibles y sanitizados.
- Las sugerencias se distinguen de autorizaciones.
- Falta o incompatibilidad bloquea el inicio con corrección clara.
- Listar y validar produce cero inferencias y cero tokens.
- Core no ve secretos ni escribe policies.
- Mandate Genesis no elige providers ni aplica fallback por iniciativa propia.
- AITAP revalida y registra el consumo real.
- Cerrar Core antes del inicio elimina la selección.
- El workflow iniciado conserva su input sin crear una preferencia reusable.

## 11. FAIL global

- Se mezcla provider/model con runtime de ejecución.
- Core muestra registry entries como disponibles sin autorización efectiva.
- Se inicia con un Intent cognitivo sin asignación.
- La UI envía secretos o elige Credential References.
- AITAP persiste perfiles o interpreta respuestas.
- Nucleus crea configuración reusable.
- Mandate Genesis sustituye providers silenciosamente.
- Se consumen tokens al listar, seleccionar o validar.
- El futuro recomendador necesita un contrato distinto del manual.

## 12. Fuentes vigentes

- `AGENTS.md`
- `installer/aitap/AGENTS.md`
- `docs/AITAP/AITAP_Arquitectura_Grifo_Orquestadores_v1_0.md`
- `docs/AITAP/AITAP_Decision_Intelligence_Execution_Routing_v1.md`
- `docs/ANALYSIS/WISDOM/Roadmap_Wisdom_Impacto_AITAP_Ejecucion_Mandate_v0_1.md`
- `installer/aitap/contracts/v2/`
- `installer/aitap/src/aitap/routing/engine.py`
- `installer/aitap/src/aitap/intelligence/service.py`
- `installer/nucleus/internal/authority/intelligence_supply_grant.go`
- `webview/app/src/routes/wisdom/+page.svelte`

## 13. Regla de cambio

Cada Work distingue hechos verificados, recomendaciones y decisiones pendientes. Cualquier cambio al contrato común, ownership, selección manual o no persistencia debe elevarse a José antes de implementar.

