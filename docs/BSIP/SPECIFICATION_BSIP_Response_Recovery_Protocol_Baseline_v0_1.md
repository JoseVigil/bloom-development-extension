# SPECIFICATION: BSIP Response & Recovery Protocol (Baseline v0.1)

**Estado:** Research CONCLUIDO — listo para fase de implementación
**Ámbito:** `brain` (bloom-development-extension) + Contrato D + OpenCode
**Fuera de ámbito de este documento:** investigación de API directa / AITAP (rama separada, ver Prompt Máster entregado al cierre de este research)
**Documento fuente:** consolidación de sesión de investigación sobre `bsip-response.zip`, `BTIPS_Bloom_Technical_Intent_Package_v6_0.md`, `bloom_project_tree.txt`, `ARCHITECTURE_HarnessProtocol.md`, `brain_tree.txt`, `help-full.txt`, `Claude_Web_Context_Awareness_-_Context_Limit_Preflight_Test.md`, `Cognituum_Companion_Implementation_Guide_v1_2.md`

---

## 0. Resumen ejecutivo

Este documento consolida el Baseline v0.1 del protocolo BSIP Response: cómo una IA de frontera empaqueta y devuelve modificaciones de código estructuradas (Contrato D), cómo `brain` las aplica a través de OpenCode, cómo se protege ese ciclo contra agotamiento de tokens (EOT — *End of Tokens*), y cómo se recupera de una interrupción sin intervención humana.

Cuatro pilares quedan cerrados en este baseline:

1. **Simulación de protocolo:** `synapse-simulator` (naming final).
2. **Protección Anti-EOT:** protocolo de 3 capas.
3. **Contrato D + OpenCode:** bloque `execution_hint` por operación.
4. **Recuperación headless:** cadena `recover` → `GapEngine` → `continuity`.

Este documento no reabre ninguna de estas decisiones. Donde una definición depende de la rama de investigación AITAP (todavía no iniciada) o quedó explícitamente pendiente durante el research, se marca como **PENDIENTE** en vez de inventarse una resolución — es preferible una spec incompleta pero honesta a una spec completa pero falsa.

---

## 1. Glosario y Taxonomía Formal

### 1.1 Tabla de términos

| Término | Definición | Estado |
|---|---|---|
| **BTIPS** | Bloom Technical Intent Package System — el marco general de unidades estructuradas de intención técnica (`dev`, `doc`, `ing`, `dis`). Documento base: `BTIPS_Bloom_Technical_Intent_Package_v6_0.md`. | Estable |
| **BSIP / BSIP-Response** | El intent, en su forma empaquetada, enviado a una IA de frontera (`BSIP`) y la respuesta estructurada que esa IA devuelve (`BSIP-Response`), conteniendo operaciones de filesystem sobre el Contrato D. | Baseline v0.1 |
| **Contrato D** | El schema JSON que define la forma de una `BSIP-Response`: `bsip_response_version`, `intent_id`, `turn_id`, `operations[]` (`create`/`edit`/`patch`/`delete`), checksums SHA-256. Ver §3. | Baseline v0.1 (extendido en este documento) |
| **`synapse-simulator`** | Simulador/emulador del protocolo de comunicación Synapse (mensajes de onboarding, registro de cuentas y keys, y — a partir de este baseline — turnos de submit/response de BSIP). Vive en la capa de extensión Chrome, schema-driven (`*.schema.json` + `registerHandler`/`applySchemaDefaults` en `background.js`). | Nombre final — ver §1.2 |
| **`Harness`** | Reservado **exclusivamente** para el ecosistema global de gestión y gobernanza de Cognituum sobre las conexiones a IAs de frontera. No se aplica a ningún componente de simulación, recuperación, ni a `synapse-simulator`. | Nombre final — ver §1.2 |
| **AITAP** | Capa (en diseño, fuera de este documento) que administrará el "grifo" y la telemetría de todas las conexiones a IA, incluyendo llamadas API directas. | **PENDIENTE** — ver nota de tensión en §1.2 |
| **Companion (v1.2, Store-Ready)** | Panel lateral de la extensión Chrome, cuarto activo nativo de Cortex (junto a Discovery, Landing, `synapse-simulator`). Webview de Gemini para asistencia humana ("segunda opinión"). Sin acceso directo al contexto de Cortex, activado manualmente por el ingeniero vía botón en Landing, condicionado a handshake Synapse de 3 fases. | Estable — **excluido de este protocolo**, ver §1.3 |
| **`GapEngine` / `GapAnalyzer`** | Módulo Python headless, sin UI, que consume `execution_report.json` (ver §4.2) y construye el payload de continuidad tras una interrupción por EOT. | Baseline v0.1 (nuevo) |
| **EOT (End of Tokens)** | Agotamiento del presupuesto de tokens de una IA de frontera a mitad de la generación de una `BSIP-Response`, resultando en un Contrato D truncado/inválido si no se detecta. | Baseline v0.1 |
| **Per-Turn Capacity Check** | Evaluación implícita, dentro de la instrucción del turno (no un intent separado), donde la IA de frontera determina en tiempo de ejecución si puede completar el `BSIP-Response` del turno actual sin truncamiento. Ver Capa 2, §2.3. | Baseline v0.1 (nuevo) |
| **`intent dev` de continuidad** | Un nuevo intent tipo `dev`, lanzado por `continuity`, que empaqueta únicamente el delta remanente identificado por `GapEngine`, para ejecución en sesión fresca o proveedor secundario. | Baseline v0.1 (nuevo) |

### 1.2 Desambiguación: `synapse-simulator` vs. `Harness`

Durante el research surgió una colisión de nombres real, ya corregida: el simulador de protocolo (JSON-schema-driven, para simular mensajes de onboarding y, en este baseline, turnos de BSIP) se llamó inicialmente "Harness" en dos lugares distintos y no relacionados — un harness Python ad-hoc de investigación (`synapse_harness.zip`, usado solo dentro de la sesión de research para probar `parse → validate → apply` contra un repo de juguete) y el componente real de la extensión Chrome descrito en `ARCHITECTURE_HarnessProtocol.md`.

**Resolución adoptada:** el componente de simulación de protocolo (incluida su futura extensión para turnos de submit/response de BSIP) se llama formalmente **`synapse-simulator`**. El término **`Harness`** queda reservado en exclusiva para la capa global de gestión y gobernanza de Cognituum sobre IAs de frontera — no se usa para ningún otro componente, presente o futuro.

**Tensión no resuelta, marcada explícitamente:** la definición de `Harness` adoptada en este research ("ecosistema global de gestión y gobernanza de Cognituum") es muy cercana, en su descripción textual, a la definición dada de AITAP ("la capa que administrará el grifo y la telemetría de todas las conexiones a IA"). Este documento **no resuelve** si `Harness` y AITAP son la misma capa vista desde dos ángulos, si AITAP es un subcomponente de `Harness` (el "grifo" específicamente), o si hay una tercera colisión de nombres en formación. Se deja como primera pregunta a resolver, explícitamente, al abrir la rama de investigación AITAP — no se asume ninguna de las tres opciones acá.

### 1.3 Desambiguación: `GapEngine` vs. `Companion`

Se evaluó y **descartó** usar Companion (v1.2, Store-Ready Edition) como el módulo de análisis de brecha del flujo de recuperación. Motivo, verificado contra `Cognituum_Companion_Implementation_Guide_v1_2.md`:

- Companion es un panel lateral de navegador que embebe un webview de Gemini, con inyección de texto vía DOM, para dar "una segunda opinión inmediata... sin reemplazar el pipeline de BTIPS ni tener acceso directo al contexto de Cortex".
- Su activación requiere: onboarding manual completo (cuenta Google + API key de Gemini pegada a mano), handshake Synapse de 3 fases confirmado, y accionamiento manual del ingeniero desde un botón en Landing.
- No existe en su especificación ningún mecanismo de disparo automático ante un evento de `brain`, ni un canal para que Companion devuelva un veredicto estructurado de vuelta al pipeline. Es una herramienta de consulta humana, no un agente autónomo.

**Resolución adoptada:** el análisis de brecha automático se implementa en un módulo nuevo y headless, `GapEngine`/`GapAnalyzer`, dentro de `core/intent/` de `brain` — sin relación de código ni de responsabilidad con Companion. La guía v1.2 de Companion se respeta sin modificaciones; Companion permanece disponible como recurso de consulta humana opcional, fuera de este protocolo.

---

## 2. Arquitectura del Protocolo Anti-EOT (End of Tokens)

### 2.1 Motivación y alcance de la evidencia

El diseño toma como punto de partida el experimento documentado en `Claude Web Context Awareness - Context Limit Preflight Test.md`, con dos salvedades explícitas que condicionan todo el diseño de abajo:

1. El experimento es **una anécdota de una sola interacción, sin verificación de ground truth** (no se comparó la estimación de tokens del modelo contra un conteo real) y sin distinguir si la respuesta `INSUFICIENTE` reflejaba una estimación real de presupuesto de contexto o un reconocimiento genérico de que la tarea pedida era de gran alcance. Por eso el protocolo no depende de una sola capa de auto-reporte del modelo.
2. El experimento evalúa la dificultad de un **corpus ya visible** (input conocido). El problema real de `brain` es distinto y más difícil: estimar el tamaño de una **salida que el modelo todavía no generó** (operaciones, diffs, checksums). Por este motivo, la Capa 2 de este protocolo se trata como señal heurística de mejor esfuerzo, nunca como garantía, y se refuerza obligatoriamente con las Capas 1 y 3.

### 2.2 Capa 1 — Estimación determinística de entrada (lado `brain`)

- **Cuándo corre:** antes de `submit`, inmediatamente después (o como parte) de `brain intent build-payload`.
- **Qué hace:** tokeniza el `payload.json` ya ensamblado con un tokenizer local aproximado y lo compara contra una tabla de ventanas de contexto conocidas por proveedor/modelo, mantenida por `brain` (no preguntada al modelo).
- **Por qué es la capa prioritaria:** es 100% verificable, no depende de que el modelo coopere, y descarta el caso más simple (payload ya excede la ventana) sin gastar ni un token de la IA de frontera.
- **Salida:** veredicto `PASS` / `WARN` / `FAIL` adjunto al ciclo de vida del intent, antes de invocar `submit`.
- **Dependencia PENDIENTE:** la tabla de ventanas de contexto por proveedor/modelo no existe todavía como artefacto de configuración de `brain` — debe crearse (ver §5).

### 2.3 Capa 2 — Per-Turn Capacity Check (lado modelo)

- **Cuándo corre:** en tiempo de ejecución de la IA de frontera, como parte de la instrucción del turno actual — **no** como un intent de preflight separado (se descartó explícitamente por generar overhead inaceptable).
- **Qué hace:** la IA evalúa, antes de comenzar a emitir operaciones, si puede completar el `BSIP-Response` completo del turno sin riesgo de truncamiento. Si determina que no puede garantizarlo, emite el mensaje de control (ver §2.5) **en vez de empezar a generar operaciones**, no a mitad de generación.
- **Naturaleza de la señal:** heurística de mejor esfuerzo. No hay garantía de que el modelo la emita correctamente en todos los casos ni en todos los proveedores — la consistencia de formato del mensaje es controlable desde `brain`; que el modelo efectivamente la dispare cuando corresponde, no.

### 2.4 Capa 3 — Detección post-hoc de truncamiento (lado `brain`)

- **Cuándo corre:** al recibir la respuesta, dentro de `brain intent parse --strict`.
- **Qué hace:** clasifica cualquier fallo de parseo en una de tres categorías, en vez de tratarlas todas como "violación de protocolo" genérica:
  - `truncation_detected: true` — JSON incompleto, última operación cortada a mitad de un `diff`/`content`, o `operations.length` declarado (si existiera un conteo previo) no coincide con lo recibido.
  - `schema_violation` — JSON válido y completo, pero no cumple Contrato D (tipos incorrectos, campos requeridos faltantes).
  - `malformed_output` — no es JSON parseable en absoluto y no hay indicios de truncamiento (p. ej. el modelo respondió en prosa).
- **Por qué es la capa que no se puede sacrificar:** es la única de las tres 100% determinística del lado de `brain` y funciona incluso si la Capa 2 falló en silencio (el modelo no se dio cuenta de que se estaba quedando sin presupuesto).
- **Salida:** extensión de `.parse_report.json` con los campos `truncation_detected: boolean` y `likely_cause: "EOT" | "malformed_json" | "schema_violation"`.

### 2.5 Schema JSON del mensaje de control

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "bsip-response-control-envelope-v0.1",
  "title": "BSIP-Response — Envelope de Control Anti-EOT — Baseline v0.1",
  "description": "Bloque de control obligatorio, primer elemento del BSIP-Response. Distinto del bloque 'operations' del Contrato D (ver seccion 3), que solo debe estar presente si control_status permite continuar.",
  "type": "object",
  "required": ["bsip_response_version", "control_status"],
  "additionalProperties": true,
  "properties": {
    "bsip_response_version": { "type": "string" },
    "control_status": {
      "type": "string",
      "enum": ["OK", "INSUFFICIENT_CONTEXT_WINDOW", "PARTIAL_COMPLETION"],
      "description": "OK: turno completo, procesar 'operations' normalmente. INSUFFICIENT_CONTEXT_WINDOW: el modelo determino antes de empezar que no puede completar el turno; 'operations' debe estar ausente o vacio. PARTIAL_COMPLETION: uso reservado para cuando la deteccion ocurre a mitad de generacion (ver limitacion de recuperabilidad en Nota NDJSON abajo); 'operations' contiene solo las operaciones completadas."
    },
    "control_detail": {
      "type": "object",
      "required": ["reason"],
      "properties": {
        "reason": { "type": "string", "description": "Explicacion breve, legible, del motivo del control_status." },
        "operations_planned": { "type": "integer", "minimum": 0 },
        "operations_completed": { "type": "integer", "minimum": 0 },
        "resume_strategy_suggested": {
          "type": "string",
          "enum": ["split_turn", "reduce_scope", "chunk_by_file"]
        }
      }
    },
    "operations": {
      "type": "array",
      "description": "Presente solo si control_status es OK o PARTIAL_COMPLETION. Ver Contrato D, seccion 3, para el schema de cada operacion.",
      "items": { "$ref": "bsip-response-contrato-d-v0.1#/$defs/operation" }
    }
  }
}
```

**Nota — decisión abierta, marcada explícitamente como PENDIENTE:** el Contrato D actual (§3) es un único blob JSON. Si el modelo se corta a mitad de generación, un JSON incompleto no es parseable ni parcialmente — por lo tanto, `control_status: PARTIAL_COMPLETION` con recuperación real de las operaciones ya completadas **solo es alcanzable si el formato de transporte pasa de un blob único a NDJSON** (una operación por línea, cada una JSON válido independiente). Esta decisión de formato de transporte no fue tomada durante este research y queda pendiente para la fase de implementación. Mientras no se decida, `PARTIAL_COMPLETION` debe tratarse como equivalente a `INSUFFICIENT_CONTEXT_WINDOW` a efectos prácticos (la Capa 3 lo detectará como `truncation_detected: true`, sin operaciones recuperables).

---

## 3. Especificación del Contrato D + Integración OpenCode

### 3.1 Contrato D — schema base (origen: `bsip_response_contrato_d_v0_1.json`, PoC de investigación)

Este schema es el que se validó y ejecutó contra el harness de simulación original. Se reproduce completo, sin modificaciones, como base sobre la que se aplica la extensión `execution_hint` (§3.2):

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "bsip-response-contrato-d-v0.1",
  "title": "BSIP-Response — Contrato D (Ejecutar) — borrador v0.1 de simulacion",
  "description": "Reconstruido desde la seccion 2 (borrador) de BSIP_Response_Spec_PoC_Disparo1_v1_0.md, unicamente para correr el harness de Synapse. No representa una decision de schema final por si solo -- ver extension execution_hint en 3.2 y envelope de control en 2.5 para el Baseline v0.1 completo.",
  "type": "object",
  "required": ["bsip_response_version", "intent_id", "turn_id", "operations"],
  "additionalProperties": true,
  "properties": {
    "bsip_response_version": { "type": "string" },
    "intent_id": { "type": "string", "minLength": 1 },
    "turn_id": { "type": "string", "minLength": 1 },
    "operations": {
      "type": "array",
      "minItems": 1,
      "items": { "$ref": "#/$defs/operation" }
    },
    "metadata": {
      "type": "object",
      "properties": {
        "model": { "type": "string" },
        "channel": { "type": "string", "enum": ["api", "web"] },
        "confidence_or_notes": { "type": "string" }
      }
    }
  },
  "$defs": {
    "sha256": { "type": "string", "pattern": "^[0-9a-f]{64}$" },
    "safe_path": {
      "type": "string",
      "pattern": "^(?!/)(?!.*\\.\\.).+$"
    },
    "operation": {
      "type": "object",
      "required": ["op", "path"],
      "properties": {
        "op": { "type": "string", "enum": ["create", "edit", "patch", "delete"] },
        "path": { "$ref": "#/$defs/safe_path" },
        "content": { "type": "string" },
        "diff": { "type": "string" },
        "checksum_before": { "$ref": "#/$defs/sha256" },
        "checksum_after": { "$ref": "#/$defs/sha256" }
      },
      "allOf": [
        {
          "if": { "properties": { "op": { "const": "create" } } },
          "then": { "required": ["content"] }
        },
        {
          "if": { "properties": { "op": { "const": "edit" } } },
          "then": { "required": ["content"] }
        },
        {
          "if": { "properties": { "op": { "const": "patch" } } },
          "then": { "required": ["diff"] }
        },
        {
          "if": { "properties": { "op": { "const": "delete" } } },
          "then": {}
        }
      ]
    }
  }
}
```

### 3.2 Extensión Baseline v0.1 — bloque `execution_hint`

**Motivación:** en el harness de simulación original, el mapeo de `op` a herramienta concreta de OpenCode (`patch` vs. `write` vs. `bash`) y sus flags de aplicación estaban **hardcodeados en el adapter** (`opencode_adapter_mock.py`), no en el contrato. Esto significaba que OpenCode no podía tomar decisiones informadas por operación, y no existía ningún mecanismo de auto-verificación tras aplicar un cambio. El Baseline v0.1 mueve esa decisión al propio Contrato D:

```json
{
  "$defs": {
    "execution_hint": {
      "type": "object",
      "description": "Metadatos por operacion para que OpenCode sepa exactamente como procesar, validar e implementar la modificacion sin ambiguedad ni heuristica local.",
      "required": ["tool"],
      "properties": {
        "tool": {
          "type": "string",
          "enum": ["patch", "write", "bash"],
          "description": "Herramienta concreta de OpenCode a invocar para aplicar esta operacion."
        },
        "apply_flags": {
          "type": "string",
          "description": "Flags exactos a pasar a la herramienta (ej. '-p0' para patch)."
        },
        "verify_command": {
          "type": "string",
          "description": "Comando de verificacion local que OpenCode debe ejecutar inmediatamente despues de aplicar la operacion, antes de darla por cerrada (ej. 'pytest tests/test_formatting.py')."
        },
        "on_conflict": {
          "type": "string",
          "enum": ["abort", "retry_full_rewrite"],
          "description": "abort: detener el turno y reportar fallo si la aplicacion o la verificacion fallan. retry_full_rewrite: reintentar la operacion usando 'content' completo (si esta disponible) en vez de 'diff', como fallback ante fallo de aplicacion del diff."
        }
      }
    }
  }
}
```

**Integración:** `execution_hint` se agrega como propiedad opcional dentro de `#/$defs/operation` del Contrato D (§3.1). Operación combinada de ejemplo:

```json
{
  "op": "patch",
  "path": "src/utils/formatting.py",
  "diff": "--- a/src/utils/formatting.py\n+++ b/src/utils/formatting.py\n@@ ...",
  "checksum_before": "fa36c17620fe5c53c1f6ddbf14930f56ec77bca68e6b8d26f528648f2a8bbb20",
  "checksum_after": "c535ce19040e2493c0d23bb2f373909f08130dbeab8b003e28b6f4febb9c5f66",
  "execution_hint": {
    "tool": "patch",
    "apply_flags": "-p0",
    "verify_command": "pytest tests/test_formatting.py",
    "on_conflict": "abort"
  }
}
```

### 3.3 Loop de auto-verificación de OpenCode

Secuencia obligatoria por operación, a ejecutar por OpenCode en orden:

1. Leer `checksum_before` (si está presente) y verificar contra el archivo real en disco antes de tocar nada. Si no coincide, tratar como conflicto de drift — no aplicar, comportarse según `on_conflict`.
2. Aplicar la operación usando exactamente `execution_hint.tool` + `execution_hint.apply_flags`. No sustituir por heurística local del adapter (esto es lo que corrige respecto del PoC original).
3. Ejecutar `execution_hint.verify_command`, si está presente.
   - Si el comando sale con código 0 → operación confirmada, continuar con la siguiente.
   - Si sale con código distinto de 0 → seguir `on_conflict`:
     - `abort`: detener el turno completo, reportar el fallo con el comando ejecutado y su salida.
     - `retry_full_rewrite`: si la operación tiene `content` disponible (además de `diff`), reintentar usando `content` completo en vez de `diff`, y volver a correr `verify_command` una sola vez más antes de abortar.
4. Confirmar `checksum_after` contra el archivo resultante en disco. Discrepancia aquí, incluso con `verify_command` exitoso, se reporta como advertencia (no aborta el turno, pero se registra en `execution_report.json`, ver §4.2).

---

## 4. Cadena de Responsabilidad de Recuperación (Headless Recovery Flow)

### 4.1 Diagrama de flujo en secuencia textual

```
[Turno N en ejecución]
        │
        ▼
¿La IA de frontera completó el BSIP-Response del turno sin control_status
de alerta, y brain intent parse --strict no detectó truncamiento?
        │
   ┌────┴─────┐
  SÍ           NO  (control_status = INSUFFICIENT_CONTEXT_WINDOW, o
   │               truncation_detected = true en Capa 3)
   ▼                          │
[stage → merge]               ▼
[Turno completo]     [brain intent recover]
                      Capa de Infraestructura:
                        - Libera candados del intent interrumpido
                        - Persiste el estado exacto en execution_report.json
                          (operaciones aplicadas + checksums + delta pendiente)
                                  │
                                  ▼
                      [GapEngine / GapAnalyzer]
                      Módulo headless en core/intent/:
                        - Lee execution_report.json directamente (sin UI)
                        - Determina exactamente qué operaciones del turno
                          interrumpido quedaron sin aplicar
                        - Construye el payload de continuidad conteniendo
                          únicamente ese delta remanente
                                  │
                                  ▼
                      [continuity]
                        - Dispara un nuevo intent tipo 'dev'
                        - Carga el payload construido por GapEngine
                        - Ejecuta en sesión fresca (mismo proveedor u otro,
                          según decisión de canal — ver nota de dependencia
                          con AITAP, PENDIENTE)
```

### 4.2 Especificación del artefacto `execution_report.json`

**Nota de reconciliación de nombres, marcada explícitamente:** el árbol canónico de artefactos de pipeline (`bloom_project_tree.txt`) documenta, dentro de cada `.pipeline/.{fase}/.response/`, los archivos `.raw_output.txt` y `.report.json` — no un archivo llamado literalmente `execution_report.json`. Este documento **no decide** si `execution_report.json` es (a) un nombre nuevo para el artefacto ya existente `.report.json`, extendido con los campos de abajo, o (b) un archivo hermano nuevo dentro de la misma carpeta `.response/`. Se deja como decisión de implementación pendiente, y se especifican a continuación los campos obligatorios que el artefacto — cualquiera sea su nombre final — debe contener para que `GapEngine` pueda operar sin ambigüedad.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "execution-report-v0.1",
  "title": "Execution Report — artefacto de estado para GapEngine — Baseline v0.1",
  "type": "object",
  "required": [
    "intent_id",
    "turn_id",
    "provider",
    "channel",
    "operations_applied",
    "operations_pending",
    "control_status_received"
  ],
  "properties": {
    "intent_id": { "type": "string" },
    "turn_id": { "type": "string" },
    "provider": { "type": "string", "description": "Identificador del proveedor de IA que generó el turno (ej. 'claude', 'gemini')." },
    "channel": { "type": "string", "enum": ["api", "web"], "description": "Canal por el que se envió el turno interrumpido." },
    "control_status_received": {
      "type": "string",
      "enum": ["INSUFFICIENT_CONTEXT_WINDOW", "PARTIAL_COMPLETION", "TRUNCATED_UNDETECTED"],
      "description": "TRUNCATED_UNDETECTED: el modelo no emitio control_status, la interrupcion se infirio via Capa 3 (parse --strict)."
    },
    "operations_applied": {
      "type": "array",
      "description": "Operaciones del Contrato D que se aplicaron y verificaron con exito antes de la interrupcion.",
      "items": {
        "type": "object",
        "required": ["op", "path", "checksum_before", "checksum_after"],
        "properties": {
          "op": { "type": "string", "enum": ["create", "edit", "patch", "delete"] },
          "path": { "type": "string" },
          "checksum_before": { "type": "string", "pattern": "^[0-9a-f]{64}$" },
          "checksum_after": { "type": "string", "pattern": "^[0-9a-f]{64}$" },
          "verify_command_result": { "type": "string", "enum": ["passed", "failed", "not_run"] }
        }
      }
    },
    "operations_pending": {
      "type": "array",
      "description": "Delta remanente: operaciones que el BSIP-Response original planeaba (si se conoce el conteo) o infería necesarias, y que no llegaron a aplicarse.",
      "items": {
        "type": "object",
        "required": ["path"],
        "properties": {
          "op": { "type": "string", "enum": ["create", "edit", "patch", "delete"] },
          "path": { "type": "string" },
          "known_intent": { "type": "string", "description": "Descripcion, si esta disponible, de que se esperaba que hiciera esta operacion pendiente." }
        }
      }
    },
    "timestamp": { "type": "string", "format": "date-time" }
  }
}
```

### 4.3 Comportamiento de `GapEngine` — sin UI ni intervención humana

1. Se invoca automáticamente al finalizar `brain intent recover` sobre un intent marcado como interrumpido (no requiere invocación manual del ingeniero).
2. Lee el artefacto de estado (§4.2) directamente del filesystem del intent — no pasa por ningún canal de navegador, webview, ni requiere handshake Synapse.
3. Valida que `operations_pending` sea no vacío; si está vacío pero `control_status_received` indica interrupción, registra una advertencia (posible inconsistencia entre lo reportado por el modelo y lo verificado por `parse --strict`) pero no bloquea.
4. Construye un `payload.json` nuevo, con el mismo formato que consume `brain intent build-payload`, conteniendo únicamente el contexto necesario para resolver `operations_pending` — no reenvía el intent original completo.
5. Entrega ese payload a `continuity`, que lo empaqueta como un nuevo `intent dev` y lo deja listo para `submit`.

---

## 5. Mapeo de Impacto en Archivos de `brain`

Basado en la estructura real relevada en `brain_tree.txt`. Se marca cada archivo como **NUEVO** o **MODIFICADO**, y se referencia la sección de este documento que lo justifica.

### 5.1 `core/intent/` (lógica de negocio)

| Archivo | Estado | Justificación |
|---|---|---|
| `core/intent/gap_engine.py` | **NUEVO** | Implementa `GapEngine`/`GapAnalyzer` (§4.3). Mismo nivel de responsabilidad que `merge_manager.py`, `recovery_manager.py`, `response_parser.py`, `staging_manager.py`, `validation_manager.py` ya existentes en este directorio. |
| `core/intent/recovery_manager.py` | **MODIFICADO** | Debe persistir el artefacto `execution_report.json` (o extender `.report.json`, según se resuelva la nota de §4.2) con los campos de la §4.2, y disparar `gap_engine.py` al finalizar la liberación de candados. |
| `core/intent/response_parser.py` | **MODIFICADO** | Debe reconocer y validar el envelope de control (§2.5) como primer bloque del `BSIP-Response`, antes de intentar parsear `operations`. Debe implementar la clasificación de fallos de la Capa 3 (`truncation_detected`, `likely_cause`). |
| `core/intent/staging_manager.py` | **MODIFICADO** | Debe ejecutar el loop de auto-verificación de OpenCode (§3.3) por operación, incluyendo lectura de `execution_hint` y manejo de `on_conflict`. |
| `core/intent_manager.py` | **MODIFICADO — bloqueante** | `_create_directory_structure()` no crea `.response/.staging/` bajo `.pipeline/.refinement/.turn_X/` (confirmado contra el árbol canónico `bloom_project_tree.txt`, que sí documenta esa carpeta de forma simétrica a `.briefing/` y `.execution/`). Esto **bloquea** el flujo de recuperación para interrupciones que ocurren durante una fase de `.refinement/` (turnos 2+ de un mismo intent) — es un prerequisito, no una mejora opcional, y debe corregirse antes de que `GapEngine` pueda operar sobre intents interrumpidos en refinamiento. |

### 5.2 `core/context_planning/` (Capa 1 del protocolo Anti-EOT)

| Archivo | Estado | Justificación |
|---|---|---|
| `core/context_planning/payload_builder.py` | **MODIFICADO** | Debe incorporar la estimación determinística de tokens de entrada (§2.2) antes de finalizar el `payload.json`. |
| `core/context_planning/provider_windows.json` (o similar, config nueva) | **NUEVO** | Tabla de ventanas de contexto conocidas por proveedor/modelo, consumida por `payload_builder.py`. No existe hoy como artefacto de configuración. |
| `core/context_planning/gemini_router.py` | **MODIFICADO (posible)** | Evaluar si la curación de contexto que ya realiza (previa a `build-payload`) debe recibir el resultado del veredicto de Capa 1 para reducir alcance automáticamente ante un `WARN`/`FAIL`. |

### 5.3 `commands/intent/` (capa CLI)

| Archivo | Estado | Justificación |
|---|---|---|
| `commands/intent/recover.py` | **MODIFICADO** | Exponer el disparo de `GapEngine` como parte del flujo de `recover`, y/o un flag explícito si se decide que no sea automático incondicionalmente. |
| `commands/intent/continuity.py` | **NUEVO** | No existe como comando hoy (`brain intent list` no lo menciona). Implementa el tercer eslabón de la cadena (§4.1): recibe el payload de `GapEngine` y dispara el nuevo `intent dev`. |
| `commands/intent/parse.py` | **MODIFICADO** | Exponer los nuevos campos de `.parse_report.json` (`truncation_detected`, `likely_cause`) generados por la Capa 3, ya soportado en parte por el flag `--output-report` existente. |
| `commands/intent/build_payload.py` | **MODIFICADO** | Exponer verificación de Capa 1 como parte del comando, con salida clara de `PASS`/`WARN`/`FAIL`. |

### 5.4 Schema (`synapse-simulator` / Contrato D)

| Archivo | Estado | Justificación |
|---|---|---|
| `bsip_response_contrato_d_v0_2.json` (o nombre equivalente versionado) | **NUEVO** | Combina el Contrato D base (§3.1) con `execution_hint` (§3.2) y el envelope de control (§2.5) en un único schema formal versionado, reemplazando al borrador `v0_1` usado solo para el harness de investigación. |
| Entrada nueva en el schema de `synapse-simulator` para turnos de submit/response de BSIP | **NUEVO** | Fuera del alcance de código de `brain` — vive en la capa de extensión Chrome. Necesaria para que `synapse-simulator` pueda simular el ciclo completo, incluyendo el envelope de control. No se detalla su implementación en este documento (pertenece a la investigación de `synapse-simulator`, no reabierta acá). |

---

## 6. Estado de cierre

Baseline v0.1 formalmente concluido para los cuatro pilares descritos en §0. Las dependencias marcadas explícitamente como **PENDIENTE** en este documento (tabla de ventanas de contexto por proveedor, decisión NDJSON vs. blob único, nombre final de `execution_report.json`, y la tensión de taxonomía `Harness`/AITAP) no bloquean el inicio de la implementación de los componentes que no dependen de ellas, pero deben resolverse antes de dar por cerrados los puntos correspondientes de §2.5, §4.2 y §5.4.
