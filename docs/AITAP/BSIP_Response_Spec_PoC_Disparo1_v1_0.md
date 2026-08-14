# BSIP-Response — Especificación e Investigación (Disparo 1)

**Sistema:** BLOOM / BTIPS / BISP
**Componente:** Protocolo BISP — nuevo Contrato de salida ("Contrato D — Ejecutar")
**Versión:** 1.0
**Estado:** Orden de trabajo abierta — investigación y PoC, sin schema final todavía
**Depende de:** `AITAP_Arquitectura_Grifo_Orquestadores_v1_0.md` v1.1 (marco conceptual — nota: el parseo y
la validación de este contrato son **100% dominio de Brain/cada orquestador, nunca de AITAP**; AITAP solo
transporta la respuesta cruda, ver §1 y §3 de ese documento),
`BLOOM_BISP_Fuente_de_Verdad_v1_0.md` Parte A (Contratos de Synapse A/B/C existentes),
`DEV_Intent_Spec_v1_0.md` (pipeline real de `dev/`: `submit_intent` → `ResponseParser` →
`ValidationManager` → `StagingManager` → `MergeManager`), `BLOOM_Intent_Types_Gap_Analysis_v1_0.md` (GAP #8)

---

## 0. Objetivo

Hoy el protocolo BISP es simétrico solo del lado de entrada: `.payload.json`/`.index.json` estructuran lo
que se envía al frontier. Lo que vuelve (`.raw_output.txt`) es texto libre, interpretado por
`ResponseParser`/`ValidationManager`/`StagingManager` con lógica ad-hoc por tipo de intent.

**Este disparo define y valida un formato de salida igualmente estructurado — el `BSIP-Response` — para que
cualquier consumidor (el `MergeManager` interno de Brain hoy, un adapter de OpenCode mañana, u otro
orquestador como Alfred) pueda interpretar el resultado de un turno sin tener que adivinar su forma.**

No es una migración del runtime existente. Es un contrato nuevo que se valida primero en aislamiento
(PoC), antes de tocar `StagingManager`/`MergeManager` en producción.

**Dónde vive el parseo, explícito:** AITAP transporta la respuesta cruda del modelo sin tocarla — nunca
valida ni interpreta este schema. El parseo de `.raw_output.txt`/respuesta cruda contra este contrato ocurre
enteramente dentro de Brain (hoy) y, cuando corresponda, dentro de Alfred (con su propia implementación,
no compartida). El schema es lo que se comparte entre orquestadores; el código que lo valida, no.

## 1. Por qué es un contrato nuevo y no una extensión de los existentes

El protocolo BISP ya define tres Contratos de Synapse (Parte A, BISP Fuente de Verdad):

| Contrato | Consumidor | Qué hace |
|---|---|---|
| A — Continuar | AI web en flujo activo | Recibe contexto de fondo, sin ack explícito |
| B — Evaluar | AI web en modo revisión | Evaluación estructurada |
| C — Decidir compatibilidad | Runtime externo/marketplace | Decide compatibilidad |

Ninguno de los tres describe un consumidor que **ejecuta cambios físicos sobre un codebase**. Todos asumen
razonamiento, no acción. Por eso el `BSIP-Response` se trata explícitamente como **Contrato D — Ejecutar**:
una cuarta categoría, no una reinterpretación forzada de A/B/C. Cualquier documento futuro que hable de
"Contratos de Synapse" debe listar cuatro, no tres.

## 2. Contrato D — JSON Schema (borrador a desarrollar)

Campos mínimos a definir y validar en el PoC:

```json
{
  "bsip_response_version": "1.0",
  "intent_id": "string",
  "turn_id": "string",
  "operations": [
    {
      "op": "create | edit | patch | delete",
      "path": "string (relativo al root del codebase)",
      "content": "string (para create/edit completos)",
      "diff": "string (unified diff, para op=patch)",
      "checksum_before": "string (hash del archivo antes del cambio, si aplica)",
      "checksum_after": "string (hash esperado tras aplicar)"
    }
  ],
  "metadata": {
    "model": "string",
    "channel": "api | web",
    "confidence_or_notes": "string opcional"
  }
}
```

Esto es un punto de partida, no un schema cerrado. Antes de fijarlo:

- **Analizar `fs_contracts.py`** — el Gap Analysis lo señala como "dueño declarado de la validación de
  shape de negocio de los turnos", pero no verificado de primera mano. Puede que ya exista una noción
  parcial de estructura de operaciones sobre la que conviene construir en vez de reemplazar desde cero.
- **Analizar `ResponseParser.parse()`** — ya "valida protocolo y checksum" sobre `.raw_output.txt` según
  `DEV_Intent_Spec_v1_0.md` §4. Confirmar qué tan cerca está esa validación de lo que necesitaría el
  `BSIP-Response`, para no duplicar lógica de checksum que ya existe.

## 3. Estrategia dual por canal

El mismo contrato de salida, dos caminos muy distintos para lograr que el modelo lo respete:

### 3.1 Canal API (Provider Adapters / futuro AITAP-como-modelo)

Usar *structured output* / *tool-calling* nativo del proveedor cuando esté disponible, para garantizar
cumplimiento de sintaxis JSON al 100% por diseño del proveedor, no por confianza en que el modelo "se porte
bien".

### 3.2 Canal Web/Browser (IonPump / Cortex)

No hay structured output nativo disponible — la IA responde en una interfaz de chat. Se necesita:

- **Prompting de contrato rígido**, inyectado como parte del System Prompt/Genesis, que instruya
  explícitamente el formato `BSIP-Response` esperado.
- **Pipeline de fallback**: si la respuesta llega como texto libre o JSON malformado, un bucle de
  parseo → validación → reintento (con mensaje de corrección al modelo) antes de que el resultado llegue a
  impactar el runtime. Nunca debe pasar un `BSIP-Response` no validado directamente a un consumidor de
  ejecución.

## 4. Entregables del PoC

1. Draft del JSON Schema (§2), revisado contra `fs_contracts.py` y `ResponseParser.parse()`.
2. Protocolo de pruebas contra modelos de frontera vía API (structured output/tool-calling) — medir tasa de
   adherencia al schema sin reintentos.
3. Protocolo de pruebas contra el canal web (prompt rígido + fallback) — medir tasa de adherencia con y sin
   reintento, y cuántos reintentos hacen falta en promedio.
4. Un caso de prueba de extremo a extremo: tomar un `.raw_output.txt` real de un intent `dev/` ya corrido
   (si existe) o generar uno sintético, convertirlo a `BSIP-Response`, y confirmar que un consumidor de
   prueba (aunque sea un script simple, no `MergeManager` real todavía) puede aplicar las operaciones sin
   ambigüedad.

## 5. Auditoría relacionada, no bloqueante para el PoC pero sí para producción

**GAP #8** (`BLOOM_Intent_Types_Gap_Analysis_v1_0.md` / `DEV_Intent_Spec_v1_0.md` §5): `.refinement/` no
tiene mirror completo en `.pipeline/` (`.response/.staging/` por turno), a diferencia de `.briefing/` y
`.execution/`. No está confirmado si `MergeManager` corre sobre turnos de refinamiento en absoluto — el
flujo completo de un intent `dev/` real todavía no se corrió de punta a punta.

**Antes de conectar el `BSIP-Response` a producción** (no antes del PoC en aislamiento) hay que correr un
intent `dev/` completo y confirmar empíricamente si ese gap bloquea aplicar `BSIP-Response` sobre turnos de
`.refinement/`, o si el mecanismo ya funciona ahí y el gap es solo de forma en el árbol de directorios.

## 6. Punto de inserción — recordatorio de alcance

Este disparo no reemplaza el runtime de `dev/`. El pipeline `submit_intent()` → `ResponseParser` →
`ValidationManager` se mantiene intacto. El `BSIP-Response` es el nuevo formato que consumen
`StagingManager`/`MergeManager` (o su reemplazo/complemento futuro) — la sustitución ocurre puntualmente
ahí, no en las etapas previas.

## 7. Preguntas abiertas para cerrar antes de fijar el schema

- [ ] ¿`diff` (unified diff) es el formato correcto para `op=patch`, o conviene un formato de operación más
  granular (line-based, AST-based) según lo que ya sepan aplicar `MergeManager`/futuro adapter de OpenCode?
- [ ] ¿El `BSIP-Response` necesita soportar operaciones parciales (algunas operaciones aplicadas, otras
  rechazadas) o es todo-o-nada por turno?
- [ ] ¿Dónde vive la validación de que las operaciones no tocan paths fuera del scope autorizado del intent
  — en el `BSIP-Response` mismo (campo de scope permitido) o en el consumidor (Nucleus, gobernanza)?
