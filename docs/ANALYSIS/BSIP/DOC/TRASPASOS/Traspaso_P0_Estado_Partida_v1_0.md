# Traspaso P0 — Verificación del estado de partida (anclas de código)

## Identificación

| Campo | Valor |
|---|---|
| Paso | P0, verificación de anclas de código, de solo lectura. Lo definió `Encargo_Doc_Intent_Autocontenido_v1_0.md` §8. Lo ordenó José el 2026-11-10 |
| Encargo rector | `Encargo_Doc_Intent_Actualizacion_Viva_v1_0.md`, sha256 `21648567…a797a6`, con DJ-36, DJ-37 y P50 (commit `5204450`). X-1 queda cerrado por José |
| Estado | **Compuerta pasada** |
| Fecha | 2026-11-10 03:32 UTC |
| Quién lo ejecutó | Cowork "intent DOC" (Claude) |
| Máquina | Contenedor en la nube (Linux), clon público `github.com/JoseVigil/bloom-development-extension`. De la Mac solo se leyeron `.git/HEAD` y `.git/refs/heads/main` por la conexión de archivos, sin terminal |
| Commit | `520445022f089b1f506e95c9e340add0e124841e`: es `main` en la Mac y el `HEAD` del clon. No se pudo comprobar si la Mac tiene cambios sin commitear (no hay Git ni terminal en la Mac) |
| Interpretación de DJ-35 | Leer código no entra en DJ-35 (José, 2026-11-10) |

## Lectura del traspaso anterior

`TRASPASOS/Traspaso_E0_Cancelada_v1_0.md`: E0 cancelada; no hay compuerta pendiente que herede este paso.

## Qué se hizo

1. Se comparó el commit del clon con `main` de la Mac: **iguales**.
2. Se corrieron los 14 comandos del encargo autocontenido §8.4, sin modificaciones, desde la raíz del clon. Salida completa y código de salida de cada uno en la evidencia.
3. No se ejecutó Brain, Nucleus, `doc`, `dev`, ninguna prueba ni el Project de prueba. No se leyó `~/Library/BloomNucleus`. No se tocó el contrato 1.2.0 ni su grafo. No se cambió código.

## Resultado por ancla

| # | Hecho | Veredicto | Línea actual |
|---|---|---|---|
| A1 | `dev` y `doc` ignoran `mandate_id` | SIGUE | `brain/core/intent_manager.py:32` (`_BSIP_ENGINE_TYPES = ("ing", "dis")`), `:137` |
| A2 | Id de `doc` = `uuid3` del nombre; renombrar lo recalcula | SIGUE | `intent_manager.py:139`, `:998` |
| A3 | `finalize` de `dev`/`doc` marca `completed` sin precondición; solo `ing`/`dis` pasan por el motor | SIGUE | `intent_manager.py:1865`, `:1910`, `:1919` |
| A4 | `submit` lee siempre `.pipeline/.briefing` | SIGUE | `intent_manager.py:2315` |
| A5 | La detección de etapa no conoce `curation` | SIGUE | 0 apariciones en `staging_manager.py`, `merge_manager.py`, `validation_manager.py`, `response_parser.py` (código 1 = sin coincidencias) |
| A6 | Prompt de validación de `dev` | SIGUE | `brain/core/intent/validation_manager.py:316` |
| A7 | `hydrate` usa `CodeCompressor` | SIGUE | `intent_manager.py:260` (`hydrate_intent`), `:320`; el siguiente método empieza en l. 384, así que la llamada está dentro de `hydrate_intent` |
| A8 | `INTENT_COMPLETE`/`INTENT_FAILED` sin emisor en Brain | SIGUE | Solo la declaración, `brain/core/server/server_event_bus.py:54-55` |
| A9 | El v4 exige seis Actions con `doc` en la posición 3 | SIGUE | `installer/nucleus/internal/orchestration/mandatecontract/contract.go:115`, `:117`, `:208` |
| A10 | Hasta dónde despacha el Mandate | SIGUE (igual a la lectura previa) | `MandateIntentActivity` (l. 193), `MandateINGCompletionActivity` (l. 212), `MandateDISActivity` (l. 225), `Fulfilled: false` (l. 239), `MandateGenActivity` (l. 242). Ninguna actividad de `doc` |
| A11 | El suministro de inteligencia solo cubre ING y DIS | SIGUE | `brain/commands/intent/supply.py:1`, `:14` |
| A12 | `mrg` sin código | SIGUE | Solo en `installer/nucleus/internal/gravity/resolver_test.go:36, 50, 61, 96` |
| A13 | Publicación del Gene sin llamador productivo | SIGUE | Sin coincidencias fuera de `_test.go` (código 1) |
| A14 | `plan` usa el router de Gemini | SIGUE | `brain/core/context_planning/gemini_router.py` existe |

**Ningún ancla cambió** entre `57c4d81` y `5204450`. El único commit entre los dos (`5204450`) es solo de documentación.

## Compuerta

| Condición | Resultado |
|---|---|
| 1. Commit del clon = `main` de la Mac | Sí |
| 2. Los 14 comandos se ejecutaron sin error de ejecución | Sí (A5 y A13 salen con código 1 por no tener coincidencias, que es lo esperado) |
| 3. Cada ancla tiene veredicto y línea actual | Sí |
| 4. Evidencia escrita y con sha256 | Sí (abajo) |

## Hallazgos para José (no se resuelven acá)

| # | Hallazgo | Cita |
|---|---|---|
| P0-1 | Las citas de línea del encargo rector y de sus fuentes están desplazadas: `contract.go:90-99` → `:115-117`; `:183-185` → `:208`; `intent_manager.py:1910-1917` → `:1919`; `:1863` → `:1865`; `mandate_execution_workflow.go:193-224` ahora cubre `ing` y `dis` (l. 193-239) | A3, A9, A10 |
| P0-2 | El Mandate despacha hasta la propuesta de `dis`. La Action siguiente del grafo firmado v4 es `doc` (posición 3). Agregar su despacho ejecutaría el grafo viejo (DJ-37). Dueño: MANDATE | A9, A10 |
| P0-3 | El encargo rector todavía remite a `HISTORICO/` para la lista G0-G14 (§4) y para el formato de traspaso (§9: "plan v0.2 §2"). Este traspaso usa como modelo `Traspaso_E0_Cancelada_v1_0.md` | Encargo rector l. 164 y l. 292 |

## Evidencia

| Archivo | sha256 |
|---|---|
| `TRASPASOS/P0_evidencia/anclas_5204450.txt` | `b994863fb4e36f00095002270cc2a73cb1b19a20660c9769c9e62dcfc93e1e0b` |

## Qué necesita el paso siguiente (D1)

Según el encargo rector §7 y §12: P1 con su forma, P3, P4, P5, P10, P48 con P34 respondidas; el recorrido §12 fijado (DJ-35); y una decisión sobre H-3 si el canal es Gemini. José informó que las está respondiendo aparte.
