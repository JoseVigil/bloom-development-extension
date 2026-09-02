# COR — Especificación Técnica del Intent de Core / Governance

**Versión:** 1.0
**Estado:** Formalización directa de `BSIP-009` (Draft Final — mecanismo ya validado en sesión de revisión,
22 ago 2026; **pendiente firma dual formal**: Master + Seguridad). Este documento especifica el diseño
normativo aprobado como contrato a implementar, **no** un comportamiento verificado contra código en
producción — a diferencia de `DEV_Intent_Spec_v1_0.md`, que documenta código ya corriendo.
**Breaking change desde:** v6.0 §6️⃣ (`cor` = *Coordination*) — este documento **supersede** esa semántica
en su totalidad, no la extiende ni la parchea.
**Depende de:** `BSIP-009` (fuente primaria de este documento, spec unificada v6.1 §8.2.2 — política
Zero-Read/Zero-Write), `MRG_Intent_Spec_v1_0.md` / `BSIP-010` (intent que nace del vacío que deja esta
redefinición de `cor`, ver §2), `DEV_Intent_Spec_v1_0.md` (referencia de formato de spec y de la
convención GAP/PENDIENTE que este documento hereda)

---

## Nota de naturaleza de este documento

`dev/` y `doc/` tienen spec porque alguien fue a leer código ya corriendo y documentó lo que encontró.
`cor/` es el caso inverso: no existe todavía una implementación de referencia que auditar bajo la
semántica de este documento — lo que existe es un BSIP en estado **Draft Final**, con el mecanismo de
rechazo ya validado en revisión pero **sin firma dual formal** (Master + Seguridad) al momento de este
documento. Especificar `cor/` aquí es, por lo tanto, fijar el contrato normativo que la implementación
debe satisfacer — no confirmar que ya lo satisface.

Esta inversión de dirección importa para cómo se lee cada sección: donde `DEV_Intent_Spec_v1_0.md` dice
"confirmado contra `_create_initial_state()`", este documento dice "especificado por BSIP-009 §N" — y
donde `DEV_Intent_Spec_v1_0.md` marca **GAP** para divergencias entre árbol de referencia y código real,
este documento marca **GAP** para decisiones de implementación que el BSIP deja abiertas a propósito (la
más crítica: la herramienta de detección/migración de Mandates v6.0 legacy, fijada como entregable
**bloqueante de Fase 1**, sin diseño propio todavía). Ningún GAP se resuelve en este documento.

Además, `cor/` es estructuralmente distinto a cualquier intent documentado hasta ahora en este
ecosistema: no tiene "fases" en el sentido de `dev/`/`ing/`/`dis/` porque no tiene un ciclo de trabajo que
recorrer — es una superficie de gobernanza de acceso más restrictivo posible (Zero-Read/Zero-Write para
Agent Loop), y su "spec" describe primariamente **lo que nunca ocurre**, no una secuencia de pasos.

---

## 0. Resumen ejecutivo

`cor` es el intent de **Core/Governance**: la superficie que representa la "constitución" del sistema
—reglas de negocio, invariantes, políticas de orquestación de Nucleus. En v6.0, `cor` significaba
*Coordination* (merges de código, orden de trabajo entre Actions); BSIP-009 lo redefine por completo como
**breaking change de taxonomía**, no como parche de permisos, al introducirse Agent Loops autónomos en
v6.1. La semántica de fusión que `cor` cubría en v6.0 no desaparece — migra íntegra a `mrg` (BSIP-010,
`MRG_Intent_Spec_v1_0.md`).

La redefinición trae consigo una política sin precedente en el resto de la taxonomía de intents:
**Zero-Read/Zero-Write** para cualquier Agent Loop. No existe una variante de solo-consulta de `cor`
accesible al agente — el riesgo que motiva esto no es solo de escritura (auto-reconfiguración), es de
**lectura**: un `cor` de solo-consulta le daría al agente un vector de reconocimiento clásico sobre los
límites exactos del sistema (paths prohibidos, presupuesto restante, reglas de negocio aplicables).

Invariante central, no configurable por seam ni por Mandate individual: si `proposer_type === "agent"` y
`intent_draft.type === "cor"`, Nucleus rechaza **sin excepción**, antes de evaluar cualquier otro campo del
draft. `cor` no es un intent que un `capability_seam` pueda habilitar — está fuera del universo de intents
proponibles por un Agent Loop a nivel de sistema, no a nivel de configuración.

`cor` no cristaliza a Mandate por la misma razón de fondo que impide su lectura: no es una unidad de
trabajo que el agente ejecute, es la política contra la cual toda unidad de trabajo se evalúa.

---

## 1. Estructura de estado — o denegación previa a nivel Nucleus

A diferencia de `.dev_state.json`/`.ing_state.json`, no existe un `.cor_state.json` en el sentido de
"estado de progreso de un intent que el agente puede consultar o del cual pueda inferir su fase actual".
Esto no es una omisión — es la consecuencia directa de la Invariante de opacidad en lectura (§3, punto 2):
cualquier estructura de estado legible por el loop sería, por definición, una superficie de lectura de
`cor`, y por lo tanto está fuera de diseño.

Lo que sí existe es un registro de estado **a nivel Nucleus**, no expuesto al filesystem del Agent Loop ni
a ningún path bajo `.{intent-name-uuid3}/`:

```typescript
// Estado interno de Nucleus — NUNCA serializado a un path accesible por Agent Loop.
// No tiene equivalente en el árbol de directorios del intent, porque cor no tiene
// árbol de directorios propio dentro del scope del agente (ver §2).
interface CorNucleusRecord {
  intent_id: string;
  type: "cor";
  action: "read" | "write";
  rule_id: string;
  authorized_by: "human_operator" | "nucleus_system_decision"; // nunca "agent"
  applied: boolean;
  previous_value?: unknown;
  new_value?: unknown;
  created_at: string;  // ISO-8601
  applied_at?: string; // ISO-8601
}
```

**Notas de campo:**

- `authorized_by` nunca toma el valor `"agent"` bajo ninguna circunstancia — no es un valor que la
  validación de tipos deba rechazar en runtime porque, estructuralmente, jamás llega a construirse un
  `CorNucleusRecord` a partir de una propuesta con `proposer_type === "agent"` (ver Invariante de
  proponente, §3.1). El tipo lo declara como unión cerrada por disciplina de contrato, no porque exista un
  camino de código que deba interceptarlo en ese punto.
- No hay `steps` como en `.dev_state.json` (`create`/`hydrate`/`plan`/`build`/`submit`/`merge`) porque
  `cor` no tiene un ciclo de trabajo de varias fases — es una operación atómica de lectura o escritura
  sobre una regla, autorizada por canal privilegiado, aplicada o rechazada.
- **GAP #C1** — el mecanismo concreto de persistencia de `CorNucleusRecord` (¿tabla en base de datos de
  Nucleus? ¿log de auditoría append-only? ¿ambos?) no está fijado por BSIP-009. El BSIP especifica la
  invariante de autorización y de opacidad; no especifica el motor de almacenamiento subyacente.

### 1.1 Denegación previa a nivel Nucleus (camino dominante para Agent Loop)

Para el 100% de las propuestas con `proposer_type === "agent"` que declaren `type: "cor"`, el ciclo de
vida completo se reduce a un solo evento, anterior a cualquier escritura de estado:

```typescript
// Resultado de rechazo — el único artefacto que un Agent Loop puede llegar
// a observar en relación con cor, y siempre indirectamente (ver §3, punto 2).
interface CorRejection {
  reason_code: "COR_FORBIDDEN_FOR_AGENT";
  proposer_type: "agent";
  intent_draft_type: "cor";
  rejected_at: "validate_and_sign"; // paso de Nucleus donde ocurre, antes de evaluar el JSON Schema del draft
}
```

Este rechazo ocurre en el paso `validate_and_sign` de Nucleus, **antes** de que el JSON Schema del draft
(§4) se evalúe siquiera — la invariante de proponente no es una regla de negocio expresable dentro del
schema del draft, vive en la capa de autorización de Nucleus, un nivel por encima de la validación
estructural.

---

## 2. Ausencia deliberada de estructura de directorios expuesta al agente

`dev/`, `ing/`, `dis/` y `doc/` tienen un árbol `.{intent-name-uuid3}/` con fases materializadas como
subcarpetas que el propio ciclo de vida del intent va poblando. `cor/` **no tiene ese árbol** cuando el
proponente es un Agent Loop, por el mismo motivo que no tiene `.cor_state.json` legible: cualquier
directorio enumerable sería una superficie de reconocimiento.

Para el canal humano/Nucleus (§3, punto 3), la estructura de persistencia —si existe como directorio real
en filesystem o si vive exclusivamente en el store interno de Nucleus— es un detalle de implementación no
fijado por BSIP-009 (ver GAP #C1). Lo único que el BSIP fija con certeza es la propiedad negativa: **no
existe ningún camino, directo ni indirecto, por el cual un proceso identificado como `proposer_type:
"agent"` pueda enumerar, listar o resolver la existencia de ese árbol**, exista donde exista.

**GAP #C2** — no está definido si, en el caso (canal humano/Nucleus) de que `cor` sí produzca artefactos
en filesystem, esos artefactos caen bajo el prefijo `.bloom/**` reservado (como sí se fija explícitamente
para `tst/`, ver `TST_Intent_Spec_v1_0.md` §1, punto 6) o si tienen un espacio de nombres propio. BSIP-009
no lo especifica.

---

## 3. Especificación funcional e invariantes

Nucleus evalúa estas reglas **antes** de firmar cualquier intent — no configurables por seam, no
negociables por Mandate individual (BSIP-009 §3):

### 3.1 Invariante de proponente

Si `proposer_type === "agent"` y `intent_draft.type === "cor"`, Nucleus rechaza sin excepción,
independientemente de lo que declare el `capability_seam` del Mandate. `cor` no es un intent que un seam
pueda *habilitar* — está fuera del universo de intents proponibles por un Agent Loop a nivel de sistema, no
a nivel de configuración por Mandate. Un `forbidden_intent_types: ["cor"]` mal configurado en un seam
**nunca** debería ser la única barrera; esta invariante existe precisamente para que no lo sea.

### 3.2 Invariante de opacidad en lectura

No existe una variante de `cor` de solo-consulta accesible al loop. Toda la telemetría que el agente
recibe sobre límites del sistema llega **exclusivamente** filtrada a través de los `reason_code`
estructurados de rechazos de *otros* tipos de intent — `SCOPE_VIOLATION`, `PATH_FORBIDDEN`,
`INTENT_MISCLASSIFIED` (ver `MRG_Intent_Spec_v1_0.md` §3.1), `BUDGET_EXCEEDED` — nunca por consulta directa
a la regla de negocio cruda.

### 3.3 Canal de ejecución

`cor` solo es proponible por:

1. Un operador humano directo, a través de un canal privilegiado de Nucleus, o
2. Nucleus mismo, actuando por decisión de sistema.

Nunca a través de un Mandate en `execution_mode: "agentic"`, y nunca por un Mandate declarativo cuya
Action haya sido generada, aunque sea indirectamente, por un Agent Loop. Esta última cláusula cierra un
vector de evasión obvio: un agente no puede "pedirle" a un humano que redacte una Action de `cor` en su
nombre y hacerla pasar por origen humano si la generación de esa Action fue, en cualquier tramo de la
cadena, producto del loop.

### 3.4 Invariante de migración

Nucleus verifica la versión de schema del Mandate contra el runtime activo **antes** de permitir ejecución.
Un Mandate marcado como v6.0 que referencia `cor` con semántica de coordinación es rechazado en su
totalidad al intentar correr bajo runtime v6.1, con un `reason_code` de migración pendiente — no se
ejecuta parcialmente ni se reinterpreta automáticamente.

**GAP #C3 (bloqueante de Fase 1, no post-lanzamiento)** — la herramienta de detección/migración de
Mandates v6.0 legacy que referencian `cor` con sentido de coordinación está fijada como entregable
bloqueante, pero su diseño concreto (¿escaneo batch contra Marketplace? ¿validación lazy al primer intento
de ejecución?) no está especificado por BSIP-009. Una vez que el runtime v6.1 esté en producción, cualquier
Mandate v6.0 sin migrar que invoque `cor` es superficie de riesgo activa, no solo problema de catálogo —
razón por la cual este GAP no puede quedar pendiente más allá de Fase 1.

---

## 4. Esquema de Payload & Types

```typescript
// cor — nunca proponible por proposer_type: "agent"; canal humano/Nucleus exclusivo
interface CorIntentDraft {
  type: "cor";
  action: "read" | "write"; // AMBOS vetados para Agent Loop, sin excepción
  target: string;           // referencia a la regla de negocio, invariante o política de orquestación
  payload: {
    rule_id: string;
    proposed_change?: Record<string, unknown>; // solo aplica si action === "write"
  };
}

interface CorIntentResult {
  intent_id: string;
  applied: boolean;
  rule_id: string;
  previous_value?: unknown;
  new_value?: unknown;
  authorized_by: "human_operator" | "nucleus_system_decision"; // nunca "agent"
}
```

```jsonc
// JSON Schema (draft-07) — validación estructural del draft
{
  "$id": "https://btips.dev/schemas/cor-intent-draft.json",
  "type": "object",
  "required": ["type", "action", "target", "payload"],
  "properties": {
    "type": { "const": "cor" },
    "action": { "enum": ["read", "write"] },
    "target": { "type": "string" },
    "payload": {
      "type": "object",
      "required": ["rule_id"],
      "properties": {
        "rule_id": { "type": "string" },
        "proposed_change": { "type": "object" }
      }
    }
  },
  // Invariante estructural: Nucleus rechaza en el paso de validate_and_sign,
  // ANTES de evaluar este schema, si proposer_type === "agent" — no es
  // una restricción expresable dentro del JSON Schema del draft mismo,
  // vive en la capa de autorización de Nucleus.
  "x-nucleus-invariant": "proposer_type !== 'agent'"
}
```

---

## 5. Ciclo de vida real, paso a paso

| Paso | Comportamiento en `cor/` | Notas |
|---|---|---|
| Recepción del draft | Nucleus identifica `proposer_type` antes de tocar el contenido del draft. | Ocurre en `validate_and_sign`, previo a evaluación de schema (§4). |
| `proposer_type === "agent"` | Rechazo inmediato, `reason_code: "COR_FORBIDDEN_FOR_AGENT"` (§1.1). | No se produce `CorNucleusRecord`. No hay estado intermedio. |
| `proposer_type === "human_operator"` / `"nucleus_system_decision"` | Validación de schema (§4), luego evaluación de la regla de negocio referenciada por `target`/`rule_id`. | Canal privilegiado — fuera del scope de Mandate en `execution_mode: "agentic"` (§3.3). |
| `action === "read"` | Se resuelve el valor actual de la regla y se retorna al canal privilegiado. | Nunca expuesto al Agent Loop, incluso si el Mandate que originó indirectamente la consulta involucra un agente (§3.3). |
| `action === "write"` | Se aplica `proposed_change`, se registra `previous_value`/`new_value`. | Mutación de política de sistema — máximo nivel de privilegio del ecosistema. |
| Verificación de versión de Mandate | Nucleus compara `schema_version` del Mandate contra runtime activo. | Rechazo total si v6.0 + semántica de coordinación (§3.4, GAP #C3). |
| `freeze_to_mandate()` | **No aplica** — `cor` no es una unidad de trabajo de agente, es la política contra la que otras unidades se validan. | Mismo motivo estructural que `dev/`/`doc/` (`ValueError` explícito), pero por una razón de diseño distinta: ahí es porque no cristalizan; acá es porque `cor` nunca corre en un Mandate agéntico. |

---

## 6. Lo que `cor` no gestiona (y por qué es la mitad del punto)

- No es observable, ni en modo lectura, por ningún Agent Loop — esto no es una limitación de superficie de
  API, es la totalidad del punto de la Invariante de opacidad (§3.2).
- No delega en el `capability_seam` la decisión de si un agente puede invocarlo — la restricción es de
  sistema, no de configuración (§3.1).
- No coordina merges de código ni orden de ejecución entre Actions — esa semántica migró íntegra a `mrg`
  (`MRG_Intent_Spec_v1_0.md`, BSIP-010).
- No cristaliza a Mandate.
- No reinterpreta ni ejecuta parcialmente un Mandate v6.0 no migrado — lo rechaza en su totalidad (§3.4).

---

## 7. GAPs confirmados aplicables a `cor`

| # | Gap | Bloqueante |
|---|---|---|
| C1 | Mecanismo concreto de persistencia de `CorNucleusRecord` (tabla / log append-only / ambos) no fijado por BSIP-009 | No |
| C2 | Espacio de nombres de artefactos de `cor` en filesystem (si los hubiera) para el canal humano/Nucleus — ¿bajo `.bloom/**` o namespace propio? | No |
| C3 | Herramienta de detección/migración de Mandates v6.0 legacy que referencian `cor` con semántica de coordinación | **Sí — bloqueante de Fase 1** |
| C4 | Numeración `BSIP-009` asume continuidad secuencial no verificada contra el registro real de BTIPS; si `cor` ya tenía BSIP propio en v6.0, este documento lo supersede, no lo reemplaza en el registro histórico | No (administrativo) |

---

## 8. Contraste con el resto de la taxonomía de intents

| Propiedad | `cor` (este documento) | `dev/` (`DEV_Intent_Spec_v1_0.md`) | `mrg`/`tst` (BSIP-010/011) |
|---|---|---|---|
| Proponible por Agent Loop | Nunca, a nivel de sistema | Sí | Sí, con restricciones propias |
| Variante de solo-lectura para agente | No existe | N/A | N/A |
| Estado legible por el agente | No — ni `.cor_state.json` ni árbol de directorios | Sí, `.dev_state.json` | Sí, estado propio |
| Motor de fases | Ninguno — operación atómica read/write | Ninguno — hardcodeado, 3 fases | `mrg`: validación en 2 fases; `tst`: gate binario |
| Cristaliza a Mandate | No (no es unidad de trabajo de agente) | No (`ValueError` explícito) | No (son Actions dentro de un Mandate) |
| Canal de propuesta | Humano / Nucleus exclusivo | Agent Loop vía Mandate | Agent Loop vía Mandate, con constraints |
| Breaking change en v6.1 | Sí — redefinición total desde v6.0 | No | `mrg` nace nuevo; `tst` se formaliza |

---

## 9. Pendientes explícitos (checklist previo a ratificación)

*(Extraído de BSIP-009 — decisiones pendientes, no una recomendación de este documento de resolverlas
unilateralmente.)*

- [ ] Confirmar contra el registro real de BTIPS si `cor` v6.0 tenía BSIP propio, para fijar si BSIP-009
  **supersede** un registro existente o crea uno nuevo (GAP #C4).
- [ ] Diseño concreto de la herramienta de detección/migración de Mandates v6.0 (GAP #C3) — bloqueante de
  Fase 1, no puede diferirse post-lanzamiento de `orbital`.
- [ ] Firma dual formal: Master + revisión de Seguridad — el mecanismo está validado en sesión de revisión
  (22 ago 2026) pero la firma formal sigue pendiente al momento de este documento.
- [ ] Definir mecanismo de persistencia de `CorNucleusRecord` (GAP #C1) y su espacio de nombres en
  filesystem, si aplica (GAP #C2).

---

## 10. Mapeo de Compliance ISO/SOC 2

| Control | Por qué lo satisface |
|---|---|
| **ISO 27001 A.8.2** — Gestión de derechos de acceso privilegiado | `cor` es, por definición, el conjunto de operaciones de mayor privilegio del sistema (reglas de negocio, invariantes). Restringirlo a canal humano/Nucleus exclusivo es la aplicación directa de este control al dominio agéntico. |
| **ISO 27001 A.5.15** — Control de acceso | La política Zero-Read/Zero-Write es control de acceso en su forma más estricta: ni siquiera lectura condicionada. |
| **ISO 27001 A.8.3** — Restricción de acceso a la información | Justifica específicamente por qué ni siquiera el modo lectura está disponible: el objetivo no es solo evitar modificación, es evitar que la información de la política misma sea observable por el actor que esa política contiene. |
| **SOC 2 CC6.1** — Controles de acceso lógico | El Agent Loop nunca posee credenciales ni ruta de acceso a `cor` — la restricción es arquitectónica, no una regla de autorización que pudiera desactivarse por configuración. |

---

*`COR_Intent_Spec_v1_0.md` · deriva de `BSIP-009` (Draft Final, firma dual pendiente), sin resolver
ninguno de sus GAPs abiertos. Complementa a `MRG_Intent_Spec_v1_0.md` y `TST_Intent_Spec_v1_0.md`
(BSIP-010/011) para cubrir la spec unificada v6.1 §8.0 de gobernanza agéntica en su totalidad. Ver
`DEV_Intent_Spec_v1_0.md` para el formato de referencia y el contraste con intents legacy hand-rolled.*
