# Especificación de API y DTOs del Backend Nucleus — Catálogo Consolidado

> ⚠️ **Auditado contra la fuente de verdad real** (`tree/bloom/truth/bloom_nucleus_truth.txt` / `bloom_project_truth.txt`, primera iteración de Mandate Genesis en desarrollo). Ver `NUCLEUS_API_Contracts_Auditoria_vs_Truth_v0_1.md` antes de tomar cualquier decisión de implementación sobre este catálogo — en particular: `mandate_state.json` real permanece implementado y orientado a `signature`/`reconciliation`; el registro agéntico de turnos es un contrato separado llamado `orbital_agentic_state.json`, sin implementación en código todavía y correlacionado con el primero únicamente por `mandate_id`; `mrg`/`tst` no tienen ningún scaffold real todavía; el grafo de Gravity del Bloque 3/4 no tiene persistencia real y coexiste, sin relación declarada, con el grafo de Dominios/Genes que sí existe (`.cache/.semantic-index.json`); y el rol `Architect` que Gravity asume para firmar el nivel `PROJECT` no existe en el modelo de autorización vigente.

> **Nota de terminología (2026-08-28):** lo que los cuatro documentos fuente llaman `gravityRules[]` / "regla" no es, conceptualmente, un conjunto de reglas de sistema — es criterio acumulado, postura de ingeniería, experiencia de desarrollador. Desde esta fecha, todo análisis y prosa nueva sobre Gravity usa **posture** para el elemento individual (lo que antes se llamaba "una regla") y **postular** para el acto de declararla — nunca "regla"/"declarar una regla". Esta convención **no altera ninguna cita textual** de este documento: donde `gravityRules[]`, `ruleId`, `rule_ref`, `appliedRuleId` o "regla" aparecen citados verbatim de BTIPS/MANDATE v1.2.0/GRAVITY v0.1/COR v1.0, se preservan exactamente como en la fuente — cambiarlos ahí sería falsificar la cita, no aplicar una convención de estilo. Si el nombre de campo en sí (`gravityRules[]` → `gravityPostures[]`) debe cambiar también en los cuatro documentos fuente es una decisión pendiente de confirmación.

**Estado:** Borrador de consolidación v0.1 — construido exclusivamente a partir de fragmentos ya existentes en los cuatro documentos fuente. No introduce comportamiento nuevo salvo donde se marca explícitamente.
**Fecha:** 2026-08-28
**Alcance:** DTOs y contratos de API para (1) `intent_draft`, (2) respuesta de `validate_and_sign`, (3) consulta de Gravity activa, (4) evento de arbitraje + notificación, (5) propuesta de versionado del contrato de API.

---

## 0. Método y convención de citas

Este documento es un trabajo de **consolidación, no de invención**. Cada campo listado abajo cae en una de tres categorías, marcadas explícitamente en cada tabla:

| Marca | Significado |
|---|---|
| ✅ **Confirmado** | El campo aparece literalmente (nombre y/o valor) en al menos uno de los cuatro documentos fuente. Cita puntual incluida. |
| ⚠️ **Ambigüedad detectada** | El campo aparece en las fuentes, pero con inconsistencias de nombre, forma o alcance entre documentos (o entre prosa y ejemplo JSON dentro del *mismo* documento). Se documentan ambos lados sin resolver silenciosamente a favor de uno. |
| 🆕 **Propuesta nueva a validar** | El campo, endpoint o mecanismo **no** tiene respaldo textual directo en ninguno de los cuatro documentos. Se incluye porque el pedido lo requiere (p. ej. un mecanismo de notificación, que ninguna fuente especifica), pero es una recomendación de diseño, no un hecho documentado. |

**Fuentes y abreviaturas usadas en las citas:**

| Abreviatura | Documento |
|---|---|
| **[BTIPS]** | `BTIPS_Mandates_Agenticos_Spec_Unificada.md` |
| **[MANDATE v1.2.0]** | `BLOOM_Mandate_Universal_Schema_v1_2_0.md` |
| **[GRAVITY v0.1]** | `Orbital_Gravity_Implementation_Spec_v0_1.md` |
| **[COR v1.0]** | `COR_Intent_Spec_v1_0.md` |

Las citas de la forma `[BTIPS §8.5]` señalan sección concreta. Cuando una fuente cita a su vez a un documento que **no** está entre los cuatro adjuntos (p. ej. `v1.1.0` de Mandate Universal Schema, o `MRG_Intent_Spec_v1_0.md`), se marca explícitamente como "citado pero no verificable con las fuentes disponibles" — el dato se incluye porque aparece nombrado en uno de los cuatro documentos, pero su definición original no pudo confirmarse contra el documento de origen real.

---

## 1. DTO — `IntentDraft` (consolidado)

### 1.1 Envelope de la propuesta

El ciclo turno a turno se describe en **[BTIPS §8.3]**, diagrama de secuencia: `Agent-->>Temporal: intent_draft (type, target, payload)`, seguido de `Temporal->>Nucleus: validate_and_sign(intent_draft, capability_seam)`.

| Campo | Tipo | Estado | Cita | Nota |
|---|---|---|---|---|
| `type` | enum: `exp \| dev \| tst \| mrg \| doc \| cor` | ✅ Confirmado | Matriz completa en **[BTIPS §8.6.1]** | `inf` existe como intent type (v6.0 §6️⃣) pero queda **fuera** de esta matriz agéntica por decisión explícita — no participa del ciclo `exp → dev → tst [→ mrg → tst]` **[BTIPS §8.6.1]** |
| `proposer_type` | string (valor confirmado: `"agent"`) | ⚠️ Ambigüedad detectada | **[BTIPS §8.3]** (prosa); **[COR §0, §3.1, §3.3]** | Ver §1.4 — inconsistencia de nombre con el campo `proposed_by` que aparece en los ejemplos JSON de `orbital_agentic_state.json` |
| `target` | string (path o glob) | ✅ Confirmado | **[BTIPS §8.5]**, turnos 1, 4, 8 | Usado en ejemplos `exp`, `dev`, `tst` |
| `source_refs` | string[] | ✅ Confirmado | **[BTIPS §8.2.1]** (regla de clasificación); **[BTIPS §8.5]**, turnos 6, 7 | Usado en ejemplos `dev` (mal clasificado) y `mrg` |
| `payload` | objeto anidado, forma no fijada para tipos no-`cor` | ⚠️ Ambigüedad detectada | Nombrado en **[BTIPS §8.3]** (prosa del diagrama) | Ver §1.4 — ningún ejemplo JSON de `exp/dev/tst/mrg` muestra un wrapper `payload`; sólo `cor` lo tiene formalmente (§1.3) |

### 1.2 Variantes por tipo — con los ejemplos de `orbital_agentic_state.json` (turnos)

Todos los ejemplos siguientes provienen literalmente de **[BTIPS §8.5]**, el contrato documental de turnos de `orbital_agentic_state.json`:

**`exp` (turno 1):**
```jsonc
{ "type": "exp", "target": "src/auth/session.py" }
```
Cita: **[BTIPS §8.5]**, turno 1. Posture material: "Lectura, AST, inspección de contexto sin alteración" — **[BTIPS §8.6.1]**.

**`dev` (turno 4, ejemplo de rechazo por path):**
```jsonc
{ "type": "dev", "target": "src/vault/keys.py" }
```
Cita: **[BTIPS §8.5]**, turno 4. Posture material: "un único `source_ref`" — **[BTIPS §8.2.1]**, **[BTIPS §8.6.1]**.

**`dev` (turno 6, ejemplo de rechazo por clasificación — mismo tipo declarado, forma distinta):**
```jsonc
{ "type": "dev", "source_refs": ["local/session-fix", "local/token-refresh"] }
```
Cita: **[BTIPS §8.5]**, turno 6. Este draft es rechazado precisamente porque trae 2 `source_refs` bajo `type: "dev"` — ver §2.3.

**`mrg` (turno 7 — reenvío correctamente clasificado del mismo cambio):**
```jsonc
{ "type": "mrg", "source_refs": ["local/session-fix", "local/token-refresh"] }
```
Cita: **[BTIPS §8.5]**, turno 7. Posture material: "declara **dos o más** `source_ref`" — **[BTIPS §8.2.1]**.

**`tst` (turno 8):**
```jsonc
{ "type": "tst", "target": "tests/auth/**" }
```
Cita: **[BTIPS §8.5]**, turno 8. Posture material: "Ejecución de pruebas deterministas en el Runner", no modifica el repositorio — **[BTIPS §8.4]**, **[BTIPS §8.6.1]**.

**`doc`** — sin ejemplo de shape concreto en ninguna de las cuatro fuentes. Aparece únicamente como entrada en `allowed_intent_types` (**[BTIPS §8.2]**) y en la matriz (**[BTIPS §8.6.1]**), nunca con un `intent_draft` de ejemplo. **No se infiere su forma por analogía con `exp`/`dev`** — sería invención. Queda documentado como *gap de fuente*, no como campo propuesto.

### 1.3 Caso `cor` — rechazo explícito para agentes

`cor` tiene una forma de draft propia y **nunca es válido si `proposer_type === "agent"`**, sin excepción y sin depender de la configuración del `capability_seam`:

```typescript
// [COR §4] — interfaz completa, citada literalmente
interface CorIntentDraft {
  type: "cor";
  action: "read" | "write";              // AMBOS vetados para Agent Loop
  target: string;                         // referencia a la regla de negocio/invariante/política
  payload: {
    rule_id: string;
    proposed_change?: Record<string, unknown>;  // solo si action === "write"
  };
}
```
Cita: **[COR §4]** (TypeScript + JSON Schema draft-07 idénticos).

Invariante de rechazo (✅ confirmado, cita textual):

> "Si `proposer_type === "agent"` y `intent_draft.type === "cor"`, Nucleus rechaza **sin excepción**, antes de evaluar cualquier otro campo del draft." — **[COR §0]**, reafirmado en **[COR §3.1]**: *"`cor` no es un intent que un `capability_seam` pueda habilitar — está fuera del universo de intents proponibles por un Agent Loop a nivel de sistema, no a nivel de configuración."*

El JSON Schema del draft en **[COR §4]** lo declara incluso como comentario estructural no evaluable por el propio schema:
```jsonc
// "x-nucleus-invariant": "proposer_type !== 'agent'"
```
Este chequeo ocurre en `validate_and_sign`, **antes** de que el JSON Schema del draft se evalúe — **[COR §1.1]**, **[COR §5]** (tabla de ciclo de vida, fila "Recepción del draft").

Consistente con la matriz de **[BTIPS §8.6.1]**: `cor` → "Accesible por Agent Loop: **No** — `forbidden_intent_types`, Zero-Read/Zero-Write".

### 1.4 Ambigüedades detectadas (no resueltas silenciosamente)

| # | Ambigüedad | Evidencia de cada lado | Resolución de este documento |
|---|---|---|---|
| A1 | **Nombre del campo de proponente**: `proposer_type` vs. `proposed_by` | Prosa usa `proposer_type` — **[BTIPS §8.3]** punto 1, **[COR §0/§3.1/§3.3]** (interfaz TS y prosa). El JSON de ejemplo en `orbital_agentic_state.json` usa `"proposed_by": "agent"` — **[BTIPS §8.5]**, los 4 turnos. | No se unifica arbitrariamente. Se documentan ambos nombres; se recomienda que la implementación real elija uno y lo declare explícitamente en el schema de request — este documento no tiene autoridad para decidir cuál, sólo para señalar que hoy conviven dos nombres para el mismo concepto en las propias fuentes. |
| A2 | **`target` (string) vs. `source_refs` (array)** — ¿son campos independientes o la regla de clasificación de **[BTIPS §8.2.1]** implica que `dev` también debería llevar `source_refs` de longitud 1 en vez de `target`? | La tabla de clasificación (**[BTIPS §8.2.1]**) habla exclusivamente de `source_ref`(s) como el campo que Nucleus cuenta para distinguir `dev` de `mrg`. Los ejemplos JSON de `exp`/`dev`(turno 4)/`tst` usan `target` (string simple), no `source_refs`. | Ninguna de las cuatro fuentes aclara si `target` es un alias de conveniencia para un `source_refs` de un solo elemento, o un campo semánticamente distinto (p. ej. `target` para el archivo/scope de la acción, `source_refs` sólo para operaciones de fusión). Se listan ambos campos por separado en §1.1 y se marca como pendiente de definición — no se asume equivalencia. |
| A3 | **Wrapper `payload`** — ¿existe para todos los tipos o sólo para `cor`? | `cor` tiene `payload: { rule_id, proposed_change? }` formalmente definido — **[COR §4]**. Los ejemplos de `exp/dev/tst/mrg` en **[BTIPS §8.5]** no anidan nada bajo `payload`; `target`/`source_refs` aparecen como campos de primer nivel. La prosa del diagrama de secuencia (**[BTIPS §8.3]**) sí menciona `payload` como tercer campo genérico del draft. | No se asume que `payload` deba envolver `target`/`source_refs` en los tipos no-`cor`. Se documenta la mención de `payload` en la prosa, distinta de lo que muestran los ejemplos concretos. |

---

## 2. DTO — Respuesta de validación y firma (`validate_and_sign`)

### 2.1 Contrato de invocación (contexto, no foco de este bloque)

```text
Temporal->>Nucleus: validate_and_sign(intent_draft, capability_seam)
```
Cita: **[BTIPS §8.3]**. Dos parámetros nombrados explícitamente: el `intent_draft` (§1) y el `capability_seam` ya firmado del Mandate (estructura completa documentada aparte en **[BTIPS §8.2]**, fuera del alcance de este catálogo salvo por referencia).

### 2.2 Forma de la decisión — dos ramas posibles + una tercera introducida por Gravity

El diagrama de secuencia (**[BTIPS §8.3]**) define originalmente sólo dos ramas:

```text
alt dentro del seam y reglas de negocio OK
    Nucleus-->>Temporal: intent firmado
else fuera de seam / regla violada
    Nucleus-->>Temporal: rechazo estructurado (reason_code)
```

**[GRAVITY v0.1 §4]** añade una tercera rama observada en su ejemplo de arbitraje, con un valor de decisión distinto a `signed`/`rejected`:

```jsonc
{
  "turn": 6,
  "mandate_id": "mnd_child_logging",
  "intent_draft": { "type": "dev", "target": "src/ratelimit/fallback_logger.py" },
  "nucleus_decision": "arbitration_triggered",
  "conflict_with": "mnd_child_fallback"
}
```
Cita: **[GRAVITY v0.1 §4]**.

| Campo | Tipo | Estado | Cita | Notas |
|---|---|---|---|---|
| `nucleus_decision` | enum: `"signed" \| "rejected" \| "arbitration_triggered"` | ✅ Confirmado (los tres valores aparecen literalmente) | `signed`/`rejected`: **[BTIPS §8.3]**, **[BTIPS §8.2.1]**, **[BTIPS §8.5]** (todos los turnos). `arbitration_triggered`: **[GRAVITY v0.1 §4]** | |
| `intent_id` | string | ✅ Confirmado | **[BTIPS §8.5]**, turnos 1, 7, 8 (presente sólo cuando `nucleus_decision: "signed"`) | |
| `reason_code` | enum cerrado — ver §2.3 | ✅ Confirmado | Múltiples, ver tabla §2.3 | Presente sólo cuando `nucleus_decision: "rejected"` |
| `detail` | string | ✅ Confirmado (para al menos un `reason_code`) | **[BTIPS §8.2.1]**, **[BTIPS §8.5]** turno 6: `"declared_type=dev but source_refs=2; expected mrg"` | No hay evidencia de que `detail` acompañe a todos los `reason_code` — sólo se confirma para `INTENT_MISCLASSIFIED` |
| `rule_ref` | string | ✅ Confirmado (para un `reason_code` específico) | **[MANDATE v1.2.0 §3]**: *"...el `rule_ref` apunta al `ruleId` heredado"* | Sólo asociado a `GRAVITY_THRESHOLD_BREACHED` |
| `conflict_with` | string (mandate_id) | ✅ Confirmado | **[GRAVITY v0.1 §4]** | Sólo presente cuando `nucleus_decision: "arbitration_triggered"` |
| `gravity_context_injected` | array — ver §2.4 | ✅ Confirmado | **[MANDATE v1.2.0 §3]**, extendido en **[GRAVITY v0.1 §2.2–2.3]** | |

### 2.3 `reason_code` — unión cerrada consolidada de las cuatro fuentes

Se buscaron explícitamente todos los `reason_code` nombrados literalmente (como string) en los cuatro documentos, no sólo los que ya aparecían agrupados en un mismo bloque. Resultado:

#### 2.3.1 Códigos confirmados y vigentes (unión cerrada activa)

| `reason_code` | Cita(s) | Contexto |
|---|---|---|
| `INTENT_MISCLASSIFIED` | **[BTIPS §8.2, §8.2.1, §8.2.2, §8.3, §8.5, §8.7]** | Draft declara `type` inconsistente con el número real de `source_ref` (regla de **[BTIPS §8.2.1]**). Manejo: `reject_and_wait_for_resubmission` (renombrado desde `reject_and_reclassify` en la revisión del 22 ago 2026, **[BTIPS §8.7]** punto 1) — Nucleus **no** corrige el draft, el agente reclasifica y reenvía. |
| `SCOPE_VIOLATION` | **[BTIPS §8.2.2, §8.3]**; referenciado también en **[COR §3.2]** | Escalación configurada por seam: `on_scope_violation: "reject_and_notify_human"` — **[BTIPS §8.2]**. |
| `PATH_FORBIDDEN` | **[BTIPS §8.2.2, §8.3, §8.5]** turno 4; referenciado en **[COR §3.2]** | Escalación: `on_forbidden_path_touch: "reject_intent_hard_stop"` — **[BTIPS §8.2]**. |
| `BUDGET_EXCEEDED` | **[BTIPS §8.2.2, §8.3]**; referenciado en **[COR §3.2]** | Escalación: `on_budget_exceeded: "pause_and_request_extension"` — **[BTIPS §8.2]**. |
| `COR_FORBIDDEN_FOR_AGENT` | **[COR §1.1]** (interfaz `CorRejection` completa), **[COR §4]** (comentario de schema), **[COR §5]** (tabla de ciclo de vida) | Único `reason_code` cuyo shape de rechazo está completamente tipado en la fuente — ver §2.3.3. |
| `GRAVITY_THRESHOLD_BREACHED` | **[MANDATE v1.2.0 §3]**; re-citado en **[GRAVITY v0.1 §3.3]** punto 2 | ⚠️ Ambas fuentes citan el origen de este código como `v1.1.0 §4`, documento **no incluido** entre los cuatro adjuntos — su definición completa (más allá del nombre y de que dispara con `verifiable: true` y puebla `rule_ref`) no pudo verificarse contra el documento de origen real. Se incluye porque el string aparece nombrado literalmente en dos de las cuatro fuentes entregadas. |

#### 2.3.2 Código nombrado pero explícitamente **no ratificado** — no forma parte de la unión activa

| `reason_code` | Cita | Por qué se separa |
|---|---|---|
| `MERGE_CONFLICT_BUDGET_EXCEEDED` | **[BTIPS §8.1.1]**, bloque marcado *"Marca de ratificación pendiente"* | La propia fuente dice textualmente: *"Ese mecanismo de dry-run [...] vía `reason_code: MERGE_CONFLICT_BUDGET_EXCEEDED` **no forma parte de esta spec unificada** — es una propuesta de extensión hecha al formalizar BSIP-010, todavía sin firma."* Mezclarlo sin aviso en la unión cerrada activa violaría la disciplina de consolidación pedida. Se documenta aquí como candidato conocido, condicionado a que BSIP-010 se ratifique. |

#### 2.3.3 Shape de rechazo completamente tipado — único caso con estructura íntegra en la fuente

```typescript
// [COR §1.1] — citado literalmente
interface CorRejection {
  reason_code: "COR_FORBIDDEN_FOR_AGENT";
  proposer_type: "agent";
  intent_draft_type: "cor";
  rejected_at: "validate_and_sign";
}
```
Para el resto de los `reason_code` de §2.3.1, las fuentes confirman el nombre del código y su condición de disparo, pero **no** un shape de payload de rechazo tan completo como éste — no se extrapola esa estructura a los demás códigos por analogía, para no inventar campos.

#### 2.3.4 Gap — código de rechazo mencionado pero nunca nombrado literalmente

**[COR §3.4]** describe una condición de rechazo real: *"Un Mandate marcado como v6.0 que referencia `cor` con semántica de coordinación es rechazado en su totalidad al intentar correr bajo runtime v6.1, con un `reason_code` de migración pendiente"* — pero el string concreto de ese `reason_code` **nunca se nombra** en ninguna de las cuatro fuentes (a diferencia de los seis casos de arriba, todos citados con su string literal). No se inventa un nombre para incluirlo en la unión cerrada.

> 🆕 **Propuesta nueva a validar** (opcional, fuera de la unión cerrada): si se desea nombrar este código antes de que las fuentes lo hagan, un candidato consistente con la convención `SCREAMING_SNAKE_CASE` ya usada sería `MANDATE_SCHEMA_VERSION_UNSUPPORTED`. Esto es una sugerencia de este documento, no un hecho de las fuentes.

### 2.4 `gravity_context_injected` — quién lo puebla y con qué forma

| Campo | Tipo | Estado | Cita |
|---|---|---|---|
| `ruleId` | string | ✅ Confirmado | **[MANDATE v1.2.0 §3]**, **[GRAVITY v0.1 §2.3]** |
| `origin` | enum: `"own" \| "inherited"` (alcance Mandate↔sub-Mandate) | ✅ Confirmado | **[MANDATE v1.2.0 §3]** |
| `origin` (extendido) | enum: `"nucleus" \| "organization" \| "project" \| "mandate_own" \| "mandate_inherited" \| "session"` | ✅ Confirmado | **[GRAVITY v0.1 §2.2]**: *"`v1.2.0` §3 definía `origin: "own" \| "inherited"`, acotado a la relación Mandate↔sub-Mandate. Se extiende a: [...]"* — `mandate_own`/`mandate_inherited` reemplazan a `own`/`inherited` en el nuevo enum de 6 valores. |
| `sourceMandateId` | string | ✅ Confirmado | **[MANDATE v1.2.0 §3]** (ejemplo con `origin: "inherited"`) |

⚠️ **Nota de compatibilidad no resuelta por las fuentes:** `v1.2.0` usa los valores `"own"`/`"inherited"`; `GRAVITY v0.1` los reemplaza por `"mandate_own"`/`"mandate_inherited"` dentro de un enum de 6 valores. Ninguna de las dos fuentes declara explícitamente que el reemplazo sea retrocompatible (¿los turnos ya persistidos con `"own"`/`"inherited"` se migran, o coexisten dos formas del campo según la versión del documento que gobernaba ese turno?). Se documenta la extensión tal como aparece, sin asumir una migración que ninguna fuente describe.

### 2.5 Contrato separado — Orbital Agentic State (`orbital_agentic_state.json`)

Las fuentes muestran, en rigor, **dos objetos relacionados pero distintos**, y este documento los mantiene separados a propósito en vez de fusionarlos:

1. **La decisión síncrona de `validate_and_sign`** (§2.2–2.4 de este bloque): lo que Nucleus responde en el momento de firmar o rechazar — `nucleus_decision`, `intent_id`/`reason_code`, `gravity_context_injected` (evaluado *durante* la firma, según el algoritmo de **[GRAVITY v0.1 §2.1]**).
2. **El Orbital Agentic State persistido en `orbital_agentic_state.json`** (**[BTIPS §8.5]**, extendido por **[MANDATE v1.2.0 §3]** y **[GRAVITY v0.1 §2.3]**): incluye además `mandate_id`, `turn`, `proposed_by`, `intent_draft` (copia completa), `result` y, opcionalmente, `note` — campos que sólo tienen sentido **después** de la ejecución (o que documentan explícitamente el rechazo, con `result: null`).

**Estado de implementación:** contrato documental — sin implementación en código todavía. `orbital_agentic_state.json` no extiende ni reemplaza al `mandate_state.json` operacional real. Ambos artefactos se correlacionan exclusivamente mediante `mandate_id` y no comparten archivo, schema ni ciclo de vida. La decisión síncrona de `validate_and_sign` puede quedar embebida en el turno agéntico persistido, pero sigue siendo un objeto de respuesta distinto del registro completo posterior a la ejecución.

---

## 3. Endpoint / contrato de consulta de Gravity activa

### 3.1 Decisión: ¿grafo completo o sólo el resultado resuelto para el turno actual?

**Decisión: sólo el resultado ya resuelto para el turno actual — nunca el grafo completo.**

Esta no es una decisión de este documento inventada desde cero: **[GRAVITY v0.1 §2.4]** ya la fija textualmente para el mecanismo de inyección al Agent Loop:

> *"La inyección al Agent Loop sigue el mismo patrón ya aprobado ([BTIPS §8.2.3], patrón 1): se le muestra al modelo **solo el subconjunto de `Resolved Active Gravity` relevante al intent que está por proponer, nunca la totalidad del grafo**. Lo único que cambia es el tamaño del conjunto candidato a filtrar — antes venía solo del Mandate y su seam; ahora viene de los cinco niveles."*

Este documento formaliza esa posture ya existente como el contrato de consulta — no agrega una restricción nueva, la explicita como contrato de API.

**Justificación contra la política de opacidad de `cor`:** la lógica es la misma que sostiene el Zero-Read de `cor`, aplicada aquí sin que Gravity *sea* `cor`:

- **[BTIPS §8.2.2]**, sobre por qué `cor` es opaco incluso en lectura: *"Un agente que pudiera leer `cor` directamente podría enumerar con precisión los límites exactos del sistema (qué paths, qué presupuestos, qué reglas) en vez de descubrirlos indirectamente turno a turno vía rechazo."* Exponer el **grafo completo** de Gravity (todos los nodos `ORGANIZATION`/`PROJECT`/`MANDATE` activos, con sus `gravityRules[]` íntegras, sus relaciones `PARENT_OF`/`INHERITS_FROM` — **[GRAVITY v0.1 §1.2, §1.4]**) sería estructuralmente el mismo vector de reconocimiento: un agente podría enumerar de una sola consulta todos los criterios y umbrales de toda la organización, en vez de descubrirlos turno a turno según lo que aplica a su intent concreto.
- **[COR v1.0 §3.2]**, invariante de opacidad en lectura: *"Toda la telemetría que el agente recibe sobre límites del sistema llega **exclusivamente** filtrada [...] nunca por consulta directa a la regla de negocio cruda."* El mismo principio de "filtrado, nunca consulta cruda" es el que ya aplica **[GRAVITY v0.1 §2.4]** al contexto de Gravity.
- **Contraste explícito que la propia fuente marca:** `Gravity` **no** es `cor` — **[GRAVITY v0.1 §3.4]** aclara sobre `ArbitrationEvent`: *"no es un `corEvent`: no hay promulgación de ley, no hay `CorNucleusRecord`, no hay Zero-Read. Es un evento de coordinación ordinaria, visible para ambos Mandates afectados **sin restricción especial de lectura**."* Es decir, Gravity en general no hereda automáticamente el Zero-Read de `cor` como régimen — pero el mecanismo de inyección al Agent Loop (§2.4) sí adopta, por elección de diseño ya tomada en la fuente, el mismo patrón de filtrado que evita la enumeración total. La justificación no es "Gravity es secreta como `cor`"; es "exponer el grafo completo al proponente de un intent es el mismo vector de reconocimiento que motivó Zero-Read en `cor`, aunque el régimen de gobierno detrás sea distinto y menos restrictivo para otros consumidores" (ver nota abajo).

### 3.2 Contrato — `resolve_active_gravity`

Función/contrato fuente, citado literalmente:

```text
resolve_active_gravity(session_id):
    path ← walk_up(session_id → mandate → project → organization → nucleus)
    collected ← []
    for node in path (orden: NUCLEUS primero, SESSION último):
        for rule in node.gravityRules where rule.status == "active":
            if rule.appliesTo matches current_turn.intent_type:
                collected.append(rule tagged with node.nodeType)
    return collected  # = "Resolved Active Gravity"
```
Cita: **[GRAVITY v0.1 §2.1]**.

| Campo | Tipo | Estado | Cita | Nota |
|---|---|---|---|---|
| `session_id` (parámetro de entrada) | string | ✅ Confirmado | **[GRAVITY v0.1 §2.1]** (único parámetro nombrado en la firma) | |
| `intent_type` (filtro aplicado) | string | ✅ Confirmado como criterio de filtrado | **[GRAVITY v0.1 §2.1]**: `rule.appliesTo matches current_turn.intent_type` | ⚠️ El pseudocódigo lo lee de `current_turn`, ya asociado a la sesión — **no** aparece como segundo parámetro explícito de la función. No se agrega como parámetro de request por analogía; se documenta tal como está. |
| `ruleId` (por elemento del resultado) | string | ✅ Confirmado | **[GRAVITY v0.1 §2.3]** | |
| `origin` (por elemento) | enum de 6 valores — ver §2.4 | ✅ Confirmado | **[GRAVITY v0.1 §2.2]** | |
| `sourceMandateId` (por elemento, si aplica) | string | ✅ Confirmado | **[MANDATE v1.2.0 §3]** | Sólo presente para `origin: mandate_inherited` |

Ejemplo de resultado, citado literalmente de **[GRAVITY v0.1 §2.3]**:
```jsonc
{
  "turn": 4,
  "intent_draft": { "type": "mrg" },
  "gravity_context_injected": [
    { "ruleId": "grv_org_0044", "origin": "organization" },
    { "ruleId": "grv_proj_0012", "origin": "project" },
    { "ruleId": "grv_0af4", "origin": "mandate_own" },
    { "ruleId": "grv_sess_009", "origin": "session" }
  ],
  "nucleus_decision": "signed",
  "result": "pass"
}
```

> 🆕 **Propuesta nueva a validar:** si además de la inyección interna al Agent Loop se necesita un endpoint standalone consultable (p. ej. para Paladin UI o herramientas de auditoría), la fuente **no** lo especifica — **[GRAVITY v0.1 §5]** excluye explícitamente de su alcance *"la representación de Paladin de 'bajo qué Gravity estoy trabajando ahora' [...] es UI, no persistencia ni arbitraje"*. Un endpoint público `GET /gravity/resolve?session_id=...&intent_type=...` con `intent_type` como parámetro explícito (a diferencia de la función interna, que lo toma implícitamente del turno) sería una extensión de superficie de API no cubierta por las cuatro fuentes.

### 3.3 Qué se recomienda **no** exponer nunca a un Agent Loop, por la misma justificación de §3.1

- El listado completo de nodos del grafo (`GravityNode[]`) y sus aristas (`PARENT_OF`, `DELEGATES_TO`, `INHERITS_FROM`, `PROMOTED_FROM`) — **[GRAVITY v0.1 §1.2, §1.4]** — es información de infraestructura de gobierno, análoga en espíritu (no en régimen legal) a lo que `cor` protege con Zero-Read.
- `gravityRules[]` completas de nodos ajenos al camino de resolución del turno actual (p. ej. postures de otro Proyecto que no aplican a este Mandate) — el algoritmo de §3.2 ya las excluye por diseño al filtrar por `appliesTo`/`intent_type`.

---

## 4. Schema de evento de arbitraje + mecanismo de notificación

### 4.1 `ArbitrationEvent` — ya definido en la fuente, citado literalmente

```jsonc
// [GRAVITY v0.1 §3.4]
{
  "eventId": "string — uuid4",
  "conflictScope": "string[] — paths en colisión",
  "involvedMandateIds": ["mnd_a1", "mnd_b2"],
  "commonAuthorityNodeId": "string — nodeId del ancestro común que arbitró (o NUCLEUS si no había uno más específico)",
  "resolutionStrategy": "enum — priority_rule | escalation_rule | default_pause_and_notify",
  "appliedRuleId": "string | null — ruleId de la gravityRule usada, si strategy no fue default",
  "resolution": "enum — mandate_a_proceeds | mandate_b_proceeds | both_paused | rejected",
  "resolvedBy": "enum — nucleus_automatic | human_operator  // nunca 'agent'",
  "occurredAt": "string — ISO 8601"
}
```

| Campo | Estado | Cita |
|---|---|---|
| Todos los campos de arriba | ✅ Confirmado, cita literal única | **[GRAVITY v0.1 §3.4]** |

**Persistencia y visibilidad** (contexto, no campo nuevo): *"Persiste como nodo propio en el grafo, referenciado desde ambos Mandates involucrados [...] Es un evento de coordinación ordinaria, visible para ambos Mandates afectados sin restricción especial de lectura, porque no expone ninguna regla constitucional"* — **[GRAVITY v0.1 §3.4]**.

### 4.2 Invariantes de arbitraje (contexto necesario para interpretar el schema)

| Invariante | Cita |
|---|---|
| `INVARIANT-ARB-001` — ningún conflicto se resuelve por negociación entre Agent Loops/Mandates; la resolución es exclusiva de Nucleus | **[GRAVITY v0.1 §3.2]** |
| `INVARIANT-ARB-002` — el árbitro es siempre la autoridad común más cercana en el grafo, escalando hasta Nucleus | **[GRAVITY v0.1 §3.2]** |
| `INVARIANT-ARB-003` — el resultado del arbitraje nunca modifica `gravityRules[]` de ningún Mandate ya firmado | **[GRAVITY v0.1 §3.2]** |
| Orden de resolución: `priority_rule` (si existe y es `verifiable`) → `escalation_rule` (si existe) → `default_pause_and_notify` (pausa al segundo Mandate en llegar) | **[GRAVITY v0.1 §3.3]** |

### 4.3 Mecanismo de notificación al cliente — push vs. sólo consulta

> 🆕 **Propuesta nueva a validar en su totalidad.** Ninguna de las cuatro fuentes especifica el mecanismo de transporte de la notificación. Lo único confirmado textualmente es que existe la *intención* de notificar:
> - **[GRAVITY v0.1 §3.3]**, punto 3 (default): *"...notifica al humano con ambos `mandateId` y el `scope_path` en conflicto."*
> - **[GRAVITY v0.1 §4]**, ejemplo integrador: *"Ninguno de los dos Agent Loops negoció nada entre sí [...] Ninguno supo siquiera que el otro existía **hasta que Nucleus lo notificó a través del canal humano**."*
> - **[BTIPS §8.2]**, análogamente para otras escalaciones de seam: `on_scope_violation: "reject_and_notify_human"`.
>
> Ningún documento define si ese "canal humano" es push (webhook, WebSocket, email, notificación in-app) o pull (el humano debe consultar). Se recomienda lo siguiente, con la justificación basada en lo que sí está confirmado:

**Recomendación: push como mecanismo primario, con consulta (poll) como respaldo — no mutuamente excluyentes.**

Justificación:

1. **Urgencia operativa confirmada por la fuente:** un arbitraje con `resolutionStrategy: "default_pause_and_notify"` deja un Mandate activo en pausa (`both_paused` o uno de los dos detenido) — **[GRAVITY v0.1 §3.3, §3.4]**. El sistema ya trata los rechazos ordinarios como información entregada de inmediato, no descubierta después (**[BTIPS §8.3]** punto 2: *"El rechazo es información, no un error crudo"*, entregado sincrónicamente en la misma respuesta de `validate_and_sign`). Un Mandate pausado indefinidamente hasta que alguien decida consultar manualmente contradice ese mismo principio de entrega inmediata ya aplicado en el resto del sistema.
2. **El respaldo de consulta ya está garantizado por diseño, sin costo adicional:** **[GRAVITY v0.1 §3.4]** ya establece que el evento "persiste como nodo propio en el grafo [...] visible [...] sin restricción especial de lectura" — es decir, aunque el push fallara o no existiera, el evento siempre es consultable. Esto hace que un mecanismo *sólo* de consulta (sin push) sea funcionalmente suficiente para no perder información, pero operacionalmente más lento para des-pausar un Mandate bloqueado.
3. **Volumen esperado bajo:** el arbitraje se dispara únicamente ante colisión de `scope_paths` entre Mandates **no** relacionados por ancestría directa (**[GRAVITY v0.1 §3.1]**) — un caso que la propia fuente presenta como excepcional frente al camino normal de validación vertical de seam (`v1.2.0` R-18). Un volumen bajo hace viable un mecanismo de push simple (webhook o evento) sin necesidad de infraestructura de streaming de alto throughput.

**Contrato propuesto (🆕, sin respaldo textual — diseño de este documento):**

```typescript
interface ArbitrationNotification {
  event: ArbitrationEvent;        // ver §4.1, sin modificar
  delivery: "push" | "poll_fallback";
  channel?: {
    // Sólo presente si delivery === "push"
    type: "webhook" | "in_app" | "email";
    target: string;               // URL de webhook, canal in-app, dirección, según type
  };
}
```

Y, para el caso de consulta explícita (siempre disponible, independientemente del push):

```typescript
// 🆕 Propuesta — endpoint de consulta, no nombrado por ninguna fuente
// GET /arbitration-events?mandate_id={id}&status=unresolved
// Response: ArbitrationEvent[]  — mismo schema de §4.1, sin cambios
```

---

## 5. Propuesta de versionado del contrato de API — independiente del versionado de los documentos de schema

### 5.1 Evidencia: las cuatro fuentes ya versionan de forma independiente entre sí

| Documento | Versión propia | Qué versiona | Cita |
|---|---|---|---|
| **[BTIPS]** | v6.1 (+ Addendum 22 ago 2026, + Nota cruzada Gravity 27 ago 2026) | La taxonomía de intents y el modelo de gobierno de Mandates Agénticos | Registro de cambios, encabezado de §8️⃣ |
| **[MANDATE v1.2.0]** | v1.2.0 (extiende v1.0.0, v1.0.1, v1.1.0 — "todos permanecen vigentes sin cambios") | El contrato `mandate.json` y su modelo de herencia de Gravity | Encabezado y registro de cambios |
| **[COR v1.0]** | v1.0 (deriva de BSIP-009, **firma dual formal aún pendiente**) | El contrato específico del intent `cor` | Encabezado |
| **[GRAVITY v0.1]** | v0.1 ("borrador [...] exploratorio, no normativo todavía") | El modelo de grafo de Gravity, resolución por turno y arbitraje | Encabezado |

Ninguno de estos cuatro números versiona "la API" como superficie única — cada uno versiona un sub-contrato distinto que la API compone: el schema de Mandate, la semántica de un tipo de intent particular, el modelo de coordinación. Son ejes de versionado **independientes por diseño** (los propios documentos lo dejan explícito: `v1.2.0` dice que `v1.0.0`–`v1.1.0` "permanecen vigentes sin cambios"; `GRAVITY v0.1` dice de sí mismo que "no reemplaza ni fija los addenda ya cerrados del Mandate Universal Schema [...] los extiende"). Un cambio en `COR` de v1.0 a v1.1 no implica necesariamente ningún cambio en la forma de `ValidateAndSignResponse` que un cliente de API consume, y viceversa.

### 5.2 Propuesta (🆕, íntegramente nueva — ninguna fuente define versionado de API)

Se propone un **cuarto eje de versionado**, propio del contrato de API expuesto por Nucleus hacia sus clientes (Agent Loop / Brain, Temporal, Conductor, Paladin), desacoplado de los cuatro anteriores:

```jsonc
// 🆕 Propuesta — header o campo de negociación de versión
{
  "nucleus_api_version": "2026-08.1"   // formato fecha-secuencia, ver justificación
}
```

**Justificación del formato fecha-secuencia en vez de semver clásico:** dado que este contrato de API *compone* cuatro documentos de schema que versionan de forma independiente y con cadencias distintas (v6.1 semántico vs. v1.2.0 de schema vs. v1.0/v0.1 de intents específicos), un semver único de la API (`2.4.0`) oscurecería *cuál* de los cuatro sub-contratos cambió. Un identificador fecha-secuencia (`AAAA-MM.N`) evita prometer compatibilidad semántica falsa entre ejes que no comparten ciclo de vida, y dado que cada sub-documento ya usa su propio criterio de versión (v6.1, v1.2.0, v1.0, v0.1), no compite por el mismo espacio de números.

**Matriz de compatibilidad propuesta** — declarada explícitamente en cada release del contrato de API, no inferida:

| `nucleus_api_version` | Requiere BTIPS ≥ | Requiere MANDATE ≥ | Requiere COR ≥ | Requiere GRAVITY ≥ |
|---|---|---|---|---|
| `2026-08.1` (línea base de este catálogo) | v6.1 + Addendum + Nota Gravity | v1.2.0 | v1.0 | v0.1 |

Esta tabla es el mecanismo concreto para responder, sin ambigüedad, "¿qué versión de la API necesito para que `arbitration_triggered` sea un valor válido de `nucleus_decision`?" (respuesta: cualquier `nucleus_api_version` que declare `GRAVITY ≥ v0.1`) sin acoplar el número de versión de la API al número de versión de cada documento de schema individualmente.

**Negociación:** se propone que el cliente declare la versión de API que soporta (header `X-Nucleus-Api-Version` o campo de handshake al abrir la sesión de Temporal), y que Nucleus rechace o degrade — nunca "adivine" — si el cliente no declara una versión compatible con los sub-contratos que el servidor tiene activos. Esto es consistente con la disciplina ya aplicada en las fuentes para el versionado de `mandate.json` mismo: **[COR §3.4]** ya establece que *"un Mandate marcado como v6.0 [...] es rechazado en su totalidad [...] no se ejecuta parcialmente ni se reinterpreta automáticamente"* — el mismo principio de rechazo explícito en vez de interpretación silenciosa se extiende aquí al contrato de API.

---

## 6. Resumen de gaps heredados de las fuentes (no generados por este documento)

Estos gaps ya estaban abiertos en las fuentes y afectan directamente a los DTOs de este catálogo — se listan para que no se pierdan al consumir sólo el catálogo:

| Gap | Afecta a | Cita |
|---|---|---|
| Origen de los `source_refs` múltiples que necesita `mrg` — sin mecanismo definido de qué produce la segunda rama candidata | DTO `IntentDraft`, variante `mrg` (§1.2) | **[BTIPS §8.7]** punto 3, **[BTIPS §🔟]** |
| Mecanismo de dry-run + `MERGE_CONFLICT_BUDGET_EXCEEDED` — pendiente de ratificación, no forma parte de la spec vigente | `reason_code` (§2.3.2) | **[BTIPS §8.1.1]** |
| `reason_code` de migración de Mandate v6.0 legacy — nunca nombrado literalmente | `reason_code` (§2.3.4) | **[COR §3.4]**, GAP #C3 |
| Mecanismo concreto de persistencia de `CorNucleusRecord` (tabla / log append-only / ambos) | Fuera del alcance directo de este catálogo (estado interno de `cor`, no expuesto) | **[COR §1]**, GAP #C1 |
| Firma dual formal (Master + Seguridad) de BSIP-009 sigue pendiente | Todo el intent `cor` (§1.3) | **[COR]**, encabezado y §9 |
| Qué pasa si un arbitraje produce una tercera colisión (caso de segundo orden) | `ArbitrationEvent` (§4.1) | **[GRAVITY v0.1 §5]** |
| Mecanismo exacto de firma para el nivel `PROJECT` en el grafo de Gravity — no especificado | Resolución de Gravity (§3) | **[GRAVITY v0.1 §5]** |

---

*Fin del catálogo consolidado v0.1. Todo campo marcado ✅ es trazable a una cita puntual de uno de los cuatro documentos adjuntos; todo campo marcado ⚠️ documenta una inconsistencia real entre fuentes sin resolverla por cuenta propia; todo bloque marcado 🆕 es una propuesta de este documento, no un hecho de las fuentes.*
