# TST — Especificación Técnica del Intent de Validation & Test Runner

**Versión:** 1.0
**Estado:** Formalización directa de `BSIP-011` (Draft Final — mecanismo de invalidación por `mrg`
validado; filesystem definitivo de bookkeeping, `.bloom/.intents/.tst/`, confirmado). Este documento
especifica el diseño normativo aprobado como contrato a implementar, no un comportamiento verificado contra
código en producción.
**Relación:** Gate de cierre compartido con `mrg` (`MRG_Intent_Spec_v1_0.md` / BSIP-010) vía la invariante
de invalidación (§3.4).
**Depende de:** `BSIP-011` (fuente primaria de este documento, spec unificada v6.1 §8.0 y §8.2.3 patrón 2 —
esquema de compresión de turnos), `MRG_Intent_Spec_v1_0.md` (contraparte exacta de la invariante de
invalidación), `COR_Intent_Spec_v1_0.md` (comparte el principio rector de que la autoridad nunca se
distribuye, aunque el acceso sí — ver §2), `DEV_Intent_Spec_v1_0.md` (intent que puede proponerse como
self-healing tras un `fail`, y referencia de formato de spec)

---

## Nota de naturaleza de este documento

Como `COR_Intent_Spec_v1_0.md` y `MRG_Intent_Spec_v1_0.md`, este documento formaliza un BSIP en estado
Draft Final — especifica el contrato normativo, no código auditado en producción. De los tres, `tst` es el
que llega con más piezas ya confirmadas por el propio BSIP-011 (mecanismo de invalidación por `mrg` y
filesystem de bookkeeping ambos marcados como validados/confirmados en el header de BSIP-011), lo cual se
refleja en que este documento tiene menos GAPs de diseño abierto que `COR_Intent_Spec_v1_0.md` o
`MRG_Intent_Spec_v1_0.md` — pero no cero: la verificación real contra código (cuando exista una
implementación de referencia) queda, igual que en los otros dos, fuera del alcance de este documento.

Vale la pena notar explícitamente el motivo genético de `tst`, porque es distinto en naturaleza al de
`cor`/`mrg`: no es un problema de taxonomía (qué intent cubre qué superficie), es un problema de
**confianza epistémica** — un Agent Loop tiene tendencia documentada a declarar falsos positivos sobre si
un trabajo está completo. `tst` es la respuesta a eso: la única fuente de verdad objetiva y determinista
sobre si el trabajo del loop cumple lo que se le pidió, y por eso es también el único intent con potestad
de llevar `mandate_state.status` a `"completed"`.

---

## 0. Resumen ejecutivo

`tst` es el intent de **Validation & Test Runner**: gate determinista para el cierre de Mandates
agénticos. Nace no de una necesidad de taxonomía sino de una necesidad de **confianza epistémica** — en un
sistema donde la autoridad de cierre dependiera de la autodeclaración del agente, `status: "completed"`
dejaría de ser una garantía y pasaría a ser una opinión del propio actor que el sistema está tratando de
gobernar. Es la pieza que cierra, en el dominio de la *terminación* de un Mandate, la misma invariante
rectora que gobierna `cor` (BSIP-009): que la autoridad nunca se distribuye, aunque el acceso sí.

Doble rol, no accidental: **gate de calidad** (corre la suite de pruebas real, sin negociación) y
**criterio de terminación** (es el único intent con potestad de llevar `status` a `"completed"`).

Invariante central compartida con `mrg` (BSIP-010): todo `mrg` exitoso invalida retroactivamente todos los
`tst` firmados previamente en el Mandate. Un `tst` que corrió antes de una fusión nunca evaluó el código
que efectivamente terminó en el repositorio — permitir que contara para el cierre habría dejado un hueco
donde la "fuente de verdad objetiva" podía estar desactualizada respecto del estado real del sistema.

`tst` nunca muta el repositorio — no tiene modo de escritura, ni siquiera opcional — y su persistencia de
bookkeeping vive bajo `.bloom/.intents/.tst/`, fuera del alcance de `forbidden_paths` porque es
infraestructura de Nucleus/Executor, no parte del diff que el agente propone.

---

## 1. Estructura de estado bajo `.bloom/.intents/.tst/`

A diferencia de `dev/`, `ing/`/`dis/` y `mrg`, cuyo estado vive bajo `.{intent-name-uuid3}/` en el árbol
propio del intent, `tst` persiste su bookkeeping en una ubicación **compartida y fija**:
`.bloom/.intents/.tst/`, confirmada por BSIP-011 como filesystem definitivo.

```typescript
// Persistido bajo .bloom/.intents/.tst/{intent_id}.json
interface TstState {
  intent_id: string;
  type: "tst";
  status: "pass" | "fail";
  target: string;                    // glob de la suite de pruebas evaluada
  turn_index: number;                // posición de este tst en la secuencia de turnos firmados del Mandate
  failures?: TstFailureDetail[];      // presente solo si status === "fail"
  invalidated_by_prior_mrg: boolean; // true si este tst corrió, válidamente, DESPUÉS de un mrg posterior a intentos previos
  eligible_for_close: boolean;       // true solo si T > M (§3.4)
  created_at: string;                // ISO-8601
}

interface TstFailureDetail {
  test_id: string;
  location: string;
  summary: string; // resumen estructurado — nunca stack trace crudo completo
}
```

**Notas de campo:**

1. **Invariante de bookkeeping no sujeto a `forbidden_paths` (§3, punto 6).** La persistencia interna de
   resultados de `tst` bajo `.bloom/.intents/.tst/` es infraestructura de Nucleus/Executor, no parte del
   diff propuesto por el agente — no cae bajo las restricciones de `forbidden_paths` del seam, aunque el
   prefijo `.bloom/**` sí esté bloqueado para el **contenido que el agente propone modificar**. Es una
   distinción deliberada entre "el agente no puede escribir aquí" (aplica a su diff) y "el sistema sí
   escribe aquí, y el agente no puede impedirlo ni leerlo como si fuera su propio state" (aplica al
   bookkeeping de `tst`).
2. `turn_index` es lo que permite calcular la invariante `T > M` (§3.4) sin depender de timestamps —
   Nucleus evalúa la secuencia de turnos firmados, no el reloj de pared.
3. `eligible_for_close` es un campo derivado, recalculado cada vez que se firma un nuevo `mrg` o un nuevo
   `tst` en el Mandate — no se fija una sola vez al crear el registro.
4. **GAP #T1** — no está especificado por BSIP-011 si `.bloom/.intents/.tst/{intent_id}.json` es el único
   artefacto persistido, o si existe además un índice agregado por Mandate (p. ej.
   `.bloom/.intents/.tst/_by_mandate/{mandate_id}.json`) que permita resolver rápidamente cuál es el
   último `tst` en `pass` sin escanear todos los registros individuales.

---

## 2. Ausencia de estructura de directorios propia del intent (`.{intent-name-uuid3}/.tst/`)

`tst` no tiene un árbol de fases análogo a `.briefing/`/`.execution/`/`.refinement/` de `dev/`, porque no
tiene un ciclo de trabajo de varias fases — es una ejecución de una suite de pruebas contra un estado dado
del repositorio, con un resultado binario. La ausencia de directorio propio de fases es consistente con —
aunque de raíz distinta a — la de `cor` (`COR_Intent_Spec_v1_0.md` §2): en `cor` la ausencia es por
opacidad deliberada; en `tst` es porque, funcionalmente, no hay fases que atravesar.

Lo que sí existe, dentro del árbol `.{intent-name-uuid3}/.pipeline/` del Mandate (ver §5), es el contrato
BISP estándar de submit/response para la invocación del Runner — eso es artefacto de infraestructura de
ejecución, distinto del bookkeeping de resultado bajo `.bloom/.intents/.tst/` (§1).

---

## 3. Especificación funcional e invariantes

### 3.1 No mutación (invariante absoluta)

`tst` nunca modifica el repositorio. Un draft de `tst` que incluya cualquier campo de escritura o diff es
rechazado estructuralmente **antes de evaluar su contenido semántico** — `tst` no tiene un modo de
escritura, ni siquiera opcional. Esto se refleja en el JSON Schema (§4) mediante `additionalProperties:
false`: cualquier campo que implique escritura (`diff`, `patch`, `source_refs`) es rechazado por Nucleus
antes de llegar siquiera a la evaluación de ese schema.

### 3.2 Resultado determinista binario

Produce exactamente `pass` o `fail`, más un payload estructurado. En `fail`, el payload incluye ubicación y
resumen de cada falla — **nunca un stack trace crudo sin procesar**; el resumen es lo que se comprime hacia
el contexto del próximo turno del agente, consistente con el esquema de compresión de turnos (spec
unificada §8.2.3 patrón 2).

### 3.3 Único gate de cierre

`mandate_state.status` solo puede transicionar a `"completed"` si la Action exitosa inmediatamente
relevante para el cierre es un `tst` en `pass`, y `requires_tst_before_close: true` en el seam. Ningún
`dev` ni ningún `mrg` puede cerrar un Mandate por sí mismo, sin excepción — ver `MRG_Intent_Spec_v1_0.md`
§6, donde se declara explícitamente el reverso de esta misma regla.

### 3.4 Invariante de invalidación por `mrg`

Nucleus evalúa la secuencia de turnos firmados: sea `M` el índice del último `mrg` exitoso y `T` el índice
del último `tst` en `pass`. El Mandate solo puede cerrar si `T > M` (o si no hubo ningún `mrg` en el
Mandate). Un `tst` con `T < M` es tratado como inválido para efectos de cierre, **aunque su resultado
histórico siga en el log de auditoría sin alterarse** — la invalidación es de elegibilidad para cierre, no
un borrado ni una corrección retroactiva del registro.

Esta es la contraparte exacta de la invariante de invalidación declarada desde el lado de `mrg` en
`MRG_Intent_Spec_v1_0.md` §3.4: ambos documentos describen el mismo mecanismo, uno desde el `tst` que
resulta invalidado y otro desde el `mrg` que lo invalida.

### 3.5 Self-healing acotado

Ante un `fail`, el resultado estructurado se pasa como contexto al agente para el turno siguiente, quien
puede proponer un `dev` correctivo (ver `DEV_Intent_Spec_v1_0.md`). Este ciclo se repite hasta `pass` o
hasta agotar `max_turns`/`max_dev_intents` — lo que ocurra primero. Esta capacidad es **exclusiva del loop
agéntico**; la Activity declarativa de Fase 1/Genesis no la implementa, porque un Mandate declarativo no
tiene mecanismo de razonamiento propio para reaccionar a un `fail`.

### 3.6 Bookkeeping no sujeto a `forbidden_paths`

Ver §1, nota 1 — la persistencia bajo `.bloom/.intents/.tst/` es infraestructura de Nucleus/Executor, fuera
del alcance de las restricciones de `forbidden_paths` del seam sobre el contenido propuesto por el agente,
aunque el prefijo `.bloom/**` sí esté bloqueado para ese contenido.

---

## 4. Esquema de Payload & Types

```typescript
interface TstIntentDraft {
  type: "tst";
  target: string;              // glob de la suite de pruebas, o subconjunto acotado por el seam
  payload?: {
    subset_hint?: string[];
  };
}

interface TstFailureDetail {
  test_id: string;
  location: string;
  summary: string;             // resumen estructurado — nunca stack trace crudo completo
}

interface TstIntentResult {
  intent_id: string;
  status: "pass" | "fail";
  failures?: TstFailureDetail[]; // presente solo si status === "fail"
  invalidated_by_prior_mrg: boolean; // true si este tst corrió, válidamente, DESPUÉS de un mrg posterior a intentos previos
  eligible_for_close: boolean;   // true solo si T > M según la regla de invalidación (§3.4)
}
```

```jsonc
// JSON Schema (draft-07)
{
  "$id": "https://btips.dev/schemas/tst-intent-draft.json",
  "type": "object",
  "required": ["type", "target"],
  "properties": {
    "type": { "const": "tst" },
    "target": { "type": "string" },
    "payload": {
      "type": "object",
      "properties": {
        "subset_hint": {
          "type": "array",
          "items": { "type": "string" }
        }
      }
    }
  },
  // Invariante estructural: cualquier campo que implique escritura
  // (diff, patch, source_refs) es rechazado por Nucleus antes de llegar
  // a este schema — tst no tiene una forma válida de draft con escritura.
  "additionalProperties": false
}
```

---

## 5. Ciclo de vida real, paso a paso

| Paso | Comportamiento en `tst/` | Notas |
|---|---|---|
| Recepción del draft | Validación estructural contra JSON Schema (§4) — cualquier campo de escritura lo rechaza antes de evaluar semántica (§3.1). | `additionalProperties: false` es la barrera técnica de esta invariante. |
| Ejecución en Runner aislado | Corre la suite de pruebas real (`target`, opcionalmente acotada por `subset_hint`), sin negociación de resultado. | Sin modo de escritura, ni siquiera opcional. |
| Cómputo de `T`/`M` | Nucleus evalúa la secuencia de turnos firmados del Mandate antes de fijar `eligible_for_close`. | Ver §3.4 — recalculado, no fijado una vez. |
| `status: "pass"` con `T > M` | `eligible_for_close: true`. | Habilita transición de `mandate_state.status` a `"completed"` si `requires_tst_before_close: true` en el seam. |
| `status: "pass"` con `T <= M` | `eligible_for_close: false`, `invalidated_by_prior_mrg: true`. | Resultado histórico permanece en el log de auditoría, sin alterarse (§3.4). |
| `status: "fail"` | Resultado estructurado (`TstFailureDetail[]`) se comprime hacia el contexto del próximo turno del agente. | Habilita self-healing acotado (§3.5) — el agente puede proponer un `dev` correctivo. |
| Persistencia | Escribe registro bajo `.bloom/.intents/.tst/{intent_id}.json` (§1). | Fuera de `forbidden_paths` para el bookkeeping del sistema — no para el contenido propuesto por el agente. |
| Nuevo `mrg` exitoso posterior | Invalida retroactivamente todos los `tst` con índice de turno menor. | Ver `MRG_Intent_Spec_v1_0.md` §3.4 para la contraparte de este mismo evento. |
| Cierre de Mandate | Transición a `mandate_state.status: "completed"` solo si la Action exitosa inmediatamente relevante es un `tst` en `pass` con `eligible_for_close: true`. | Único intent con esta potestad (§3.3). |

---

## 6. Lo que `tst` no gestiona

- No muta el repositorio bajo ninguna circunstancia — no tiene modo de escritura, ni siquiera acotado o
  condicional.
- No cierra un Mandate por consenso o mayoría de turnos previos — la elegibilidad de cierre depende
  exclusivamente de la comparación de índices `T > M` en el momento de la evaluación, no de un historial
  acumulado de resultados `pass`.
- No permite que `dev` ni `mrg` cierren un Mandate por sí mismos, incluso si ambos tuvieron éxito.
- No reinterpreta ni "perdona" un `tst` invalidado por un `mrg` posterior — el registro histórico
  permanece, pero deja de contar para cierre, sin excepción manual documentada en BSIP-011.
- No implementa self-healing por sí mismo — solo produce el contexto estructurado que **habilita** al
  agente a proponer un `dev` correctivo; la decisión de proponerlo es del loop, no de `tst`.

---

## 7. Contrato `.pipeline/` y estado de la capa vectorial

`tst` mantiene el contrato BISP estándar en `.pipeline/` dentro del árbol del Mandate (submit del draft,
recepción de `.raw_output.txt`, validación) — separado, por diseño, del bookkeeping de resultado bajo
`.bloom/.intents/.tst/` (§1). Esta separación explícita entre "infraestructura de ejecución" (`.pipeline/`)
e "infraestructura de resultado/auditoría" (`.bloom/.intents/.tst/`) no tiene equivalente documentado en
`dev/` (donde ambos viven dentro del mismo árbol `.{intent-name-uuid3}/`).

**GAP #T2** — no está especificado por BSIP-011 si el contrato `.pipeline/` de `tst` tiene mirror completo
(`.response/.staging/`) o si, dado que `tst` no produce diff ni staging de archivos modificados (no muta el
repositorio), la subcarpeta `.staging/` simplemente no aplica y no es un GAP sino una consecuencia directa
de la invariante de no-mutación (§3.1). Este documento se inclina por la segunda lectura, pero BSIP-011 no
lo declara de forma explícita.

**Capa vectorial:** sin evidencia en BSIP-011 de que la capa vectorial (Ollama/ChromaDB, BISP Parte A) esté
conectada para `tst` — mismo estado documentado para `dev/` (`DEV_Intent_Spec_v1_0.md` §5) y `mrg`
(`MRG_Intent_Spec_v1_0.md` §7): declarada por el protocolo genérico, no confirmada como implementada para
este consumidor específico.

---

## 8. Contraste con `mrg`, `dev` y `cor`

| Propiedad | `tst` (este documento) | `mrg` (`MRG_Intent_Spec_v1_0.md`) | `dev/` (`DEV_Intent_Spec_v1_0.md`) | `cor` (`COR_Intent_Spec_v1_0.md`) |
|---|---|---|---|---|
| Muta el repositorio | Nunca — invariante absoluta | Sí, si dry-run está dentro de presupuesto | Sí | Solo reglas de negocio, nunca código |
| Potestad de cerrar Mandate | Sí — único intent con esta potestad | No | No | No (no es unidad de trabajo de agente) |
| Ubicación de persistencia de estado | Compartida y fija: `.bloom/.intents/.tst/` | Propia del intent: `.{intent-name-uuid3}/` | Propia del intent | Nucleus interno, no filesystem del agente |
| Resultado | Binario determinista (`pass`/`fail`) | `merged: true/false` + conteo de conflictos | Sin resultado binario formal | `applied: true/false` |
| Invalidado retroactivamente por otro intent | Sí — por `mrg` exitoso posterior (§3.4) | No — pero invalida `tst` (dirección opuesta) | No | No |
| Proponible por Agent Loop | Sí | Sí, con restricciones | Sí | Nunca |
| Riesgo de ejecución (declarado en BSIP) | Más bajo que `mrg` (no muta), pero mismo escrutinio por potestad de cierre | Alto — múltiples orígenes de cambio | No graduado explícitamente | Máximo privilegio del sistema |

---

## 9. Pendientes explícitos

*(Extraído de BSIP-011 — decisiones pendientes, no una recomendación de este documento de resolverlas
unilateralmente. A diferencia de `COR_Intent_Spec_v1_0.md` y `MRG_Intent_Spec_v1_0.md`, BSIP-011 no declara
ningún pendiente bloqueante equivalente a GAP #C3 o GAP #M1 — el mecanismo de invalidación y el filesystem
de bookkeeping están marcados como validados/confirmados.)*

- [ ] **GAP #T1.** Definir si existe un índice agregado por Mandate bajo
  `.bloom/.intents/.tst/_by_mandate/` o si la resolución de "último `tst` en `pass`" se hace por escaneo
  directo de registros individuales.
- [ ] **GAP #T2.** Confirmar explícitamente (no solo por inferencia de la invariante de no-mutación) si
  `.pipeline/` de `tst` omite `.staging/` por diseño.
- [ ] Confirmar mecanismo exacto de cómputo de `max_turns`/`max_dev_intents` como límite del ciclo de
  self-healing (§3.5) — BSIP-011 declara la existencia del límite, no el valor por defecto ni si es
  configurable por seam.

---

## 10. Mapeo de Compliance ISO/SOC 2

| Control | Por qué lo satisface |
|---|---|
| **SOC 2 CC7.2** — Monitoreo del sistema | `tst` es, literalmente, el mecanismo de monitoreo continuo que valida que el sistema se comporta según lo esperado antes de permitir que un ciclo de cambio se dé por cerrado. |
| **ISO 27001 A.8.29** — Pruebas de seguridad en desarrollo y aceptación | `tst` corriendo en el Project Runner aislado, con resultado determinista `pass`/`fail`, es la implementación directa de este control aplicado a un flujo de desarrollo gobernado por Mandate. |
| **ISO 27001 A.8.31** — Separación de entornos de desarrollo, prueba y producción | La ejecución de `tst` en un Runner aislado, separado del entorno donde vive el código final, y el hecho de que `tst` nunca muta el repositorio, son la aplicación concreta de esta separación. |
| **SOC 2 CC8.1** — Gestión de cambios | La invariante de invalidación por `mrg` es, en esencia, una garantía de que ningún cambio se considera "probado" si el estado que la prueba evaluó ya no es el estado real del sistema — el corazón mismo de una gestión de cambios rigurosa. |

---

*`TST_Intent_Spec_v1_0.md` · deriva de `BSIP-011` (Draft Final, mecanismo de invalidación y filesystem de
bookkeeping ya confirmados). Comparte con `MRG_Intent_Spec_v1_0.md` (BSIP-010) la invariante de
invalidación cruzada, y con `COR_Intent_Spec_v1_0.md` (BSIP-009) el principio rector de que la autoridad
nunca se distribuye, aunque el acceso sí. Junto a `COR_Intent_Spec_v1_0.md` y `MRG_Intent_Spec_v1_0.md`,
cierra la spec unificada v6.1 §8.0 de gobernanza agéntica.*
