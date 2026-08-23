# MRG — Especificación Técnica del Intent de Merge & Integration

**Versión:** 1.0
**Estado:** Formalización directa de `BSIP-010` (Draft Final — mecanismo de clasificación validado;
**mecanismo de origen de `source_refs` múltiples sigue abierto**, ver §9). Este documento especifica el
diseño normativo aprobado como contrato a implementar, no un comportamiento verificado contra código en
producción.
**Nace de:** `BSIP-009` / `COR_Intent_Spec_v1_0.md` — hereda íntegra la semántica de fusión que `cor`
cubría en v6.0, separada de `cor` para preservarla sin heredar su opacidad de gobernanza (ver §2).
**Depende de:** `BSIP-010` (fuente primaria de este documento, spec unificada v6.1 §8.0), `COR_Intent_Spec_v1_0.md`
(origen genético de este intent), `TST_Intent_Spec_v1_0.md` / `BSIP-011` (comparte la invariante de
invalidación, ver §3.4), `DEV_Intent_Spec_v1_0.md` (intent contra el cual `mrg` se clasifica físicamente,
y referencia de formato de spec)

---

## Nota de naturaleza de este documento

Igual que `COR_Intent_Spec_v1_0.md`, este documento formaliza un BSIP en estado Draft Final, no código ya
corriendo: especifica el contrato que la implementación de `mrg` debe satisfacer. A diferencia de `cor`,
que es una redefinición de un intent existente, `mrg` es un **intent nuevo** — nace para llenar el vacío
que deja la redefinición de `cor` como Core/Governance opaco (BSIP-009 → BSIP-010, ver §2).

Esto tiene una consecuencia directa sobre cómo se lee este documento: no hay comportamiento "legacy" que
contrastar, pero sí hay una pieza explícitamente **no resuelta** por el propio BSIP-010 y marcada como
bloqueante antes de que `mrg` sea observable en producción (Fase 3 del roadmap): el mecanismo de origen de
los `source_refs` múltiples — de dónde surge la segunda rama local candidata a mergear — no tiene
definición concreta (grieta #3, spec unificada §8.7 y §10). Este documento formaliza la gobernanza sobre
`mrg` **una vez que existe** un `source_ref` válido que evaluar; no formaliza cómo ese segundo origen llega
a existir en primer lugar. Se marca como **GAP #M1**, bloqueante de Fase 3, sección 9.

La misma disciplina de `DEV_Intent_Spec_v1_0.md` y `COR_Intent_Spec_v1_0.md` aplica: ningún GAP se resuelve
en este documento.

---

## 0. Resumen ejecutivo

`mrg` es el intent de **Merge & Integration**: absorbe íntegra la semántica de fusión de código que `cor`
cubría en v6.0, separada en un intent propio para no heredar la opacidad de gobernanza que BSIP-009 impone
sobre `cor` redefinido como Core/Governance. Es, junto a `tst` (BSIP-011), uno de los dos intents nuevos
que completan la spec unificada de gobernanza agéntica v6.1 §8.0.

El motivo de existencia de `mrg` no es solo "darle a `cor` un reemplazo operativo" — es reconocer que la
integración de código tiene un **perfil de riesgo estructuralmente distinto** al de `dev`: mientras `dev`
opera dentro de un scope conocido de antemano (un único origen de cambio, el diff local del propio agente),
`mrg` por definición toca la **intersección** de cambios que pueden venir de fuera del seam original —
otra rama, potencialmente otro Mandate, potencialmente trabajo que el agente nunca produjo directamente.
Por eso `mrg` no hereda automáticamente los límites de `dev`: tiene su propio conjunto de restricciones,
`mrg_constraints`.

La clasificación entre `dev` y `mrg` **no depende de la palabra del agente** — se ancla a la estructura
física del draft: `dev` exige exactamente 1 `source_ref`; `mrg` exige 2 o más. Nucleus valida esto contra
el payload real, no contra el campo `type` declarado, y rechaza con `INTENT_MISCLASSIFIED` cualquier
intento de camuflar una fusión de alto impacto como una modificación rutinaria de un solo archivo (o
viceversa).

`mrg` comparte con `tst` (BSIP-011) una invariante de invalidación cruzada: todo `mrg` ejecutado con éxito
marca como inválidos todos los `tst` firmados previamente en ese Mandate — un `tst` que corrió antes de una
fusión nunca evaluó el código que efectivamente terminó en el repositorio.

---

## 1. Estructura de `.mrg_state.json`

```typescript
interface MrgState {
  intent_id: string;
  type: "mrg";
  status: "created" | "conditionally_signed" | "dry_run" | "merged" | "aborted";
  source_refs: string[];           // longitud >= 2 — validado físicamente por Nucleus antes de crear el state
  target_ref: string;              // rama destino; default = rama de trabajo del Mandate
  mrg_constraints: {
    allowed_source_refs: string[]; // ramas locales permitidas — nunca remotos externos
    max_conflict_files: number;
  };
  conflict_files?: string[];       // poblado solo tras el dry-run (§3.3)
  conflict_count?: number;
  dry_run_aborted?: boolean;
  invalidated_tst_ids?: string[];  // tst previos marcados inválidos por este merge, si tuvo éxito
  created_at: string;              // ISO-8601
  updated_at: string;
}
```

**Notas de campo:**

- `status: "conditionally_signed"` es un estado intermedio que no tiene equivalente en `.dev_state.json`
  (`created | in_progress | completed`) — refleja directamente la validación en dos fases descrita en §3.3:
  Nucleus firma condicionalmente tras pasar las reglas de clasificación y de origen (§3.1, §3.2), antes de
  conocer el radio de impacto real.
- `conflict_files`/`conflict_count` solo existen a partir de `status: "dry_run"` en adelante — antes de
  correr el dry-run, el conteo real de conflictos es desconocido por diseño (no se puede saber sin
  intentar la fusión).
- **GAP #M2** — el schema de identidad (`intent_id`/`type` vs. `uuid`/`type` de `dev/`, ver
  `DEV_Intent_Spec_v1_0.md` GAP #10) no está fijado explícitamente por BSIP-010. Este documento asume
  `intent_id`/`type` por continuidad con `ing`/`dis` (motor BSIP genérico), dado que `mrg` es un intent
  nuevo sin la deuda histórica de `dev`/`doc` — pero BSIP-010 no lo declara de forma explícita.

---

## 2. Estructura de directorios de `mrg/`

```
.{intent-name-uuid3}/
├── .mrg_state.json
├── .constraints/
│   └── .mrg_constraints.json     ← allowed_source_refs, max_conflict_files (§1)
├── .dry_run/                      ← GAP #M3: no fijado por BSIP-010 si es carpeta persistida
│   │                                 o estado transitorio solo en memoria del Executor
│   ├── .conflict_report.json      ← poblado tras el dry-run: conflict_files, conflict_count
│   └── .staging/                  ← estado del intento de merge en el Runner aislado, revertido
│                                     sin dejar estado parcial si excede max_conflict_files (§3.3)
└── .pipeline/                     ← contrato BISP — ver §5
    ├── .briefing/  {.payload.json, .index.json, .response/{.raw_output.txt, .report.json, .staging/}}
    └── .execution/ (misma forma — fusión real post firma condicional)
```

**GAP #M3** — a diferencia de `dev/`, donde `.briefing/`/`.execution/`/`.refinement/` están confirmadas
contra `_create_directory_structure()` real, la estructura de `.dry_run/` propuesta arriba es una inferencia
de este documento a partir de la descripción funcional de BSIP-010 §3.3 ("el Executor corre la fusión en
modo dry-run sobre el Runner aislado"). BSIP-010 no fija si el resultado del dry-run se persiste como
directorio propio o vive transitoriamente en el Runner y solo su resultado (`conflict_report.json`) se
escribe al árbol del intent.

**Fases funcionales (no fases en el sentido de motor `IntentStateManager`):** validación de clasificación
→ firma condicional → dry-run → fusión real o aborto. No hay turnos (`.turn_X/`) como en `dev/refinement/`
— `mrg` es una operación de una sola pasada por Mandate, aunque el Mandate pueda proponer un nuevo `mrg`
tras un aborto.

---

## 3. Especificación funcional e invariantes

### 3.1 Regla de clasificación física (invariante rectora)

`dev` exige exactamente **1** `source_ref`. `mrg` exige **2 o más**. Nucleus valida esto contra el payload
real del draft, no contra el campo `type` declarado:

- Si `type: "dev"` con `source_refs.length >= 2` → rechazo, `INTENT_MISCLASSIFIED`,
  `"declared_type=dev but source_refs=N; expected mrg"`.
- Si `type: "mrg"` con `source_refs.length === 1` → rechazo, `INTENT_MISCLASSIFIED`,
  `"declared_type=mrg but source_refs=1; expected dev"`.

Esta regla es lo que evita que la frontera entre `dev` y `mrg` dependa de una etiqueta autodeclarada por el
agente — un agente (por error o por diseño) no puede camuflar una fusión de alto impacto como una
modificación rutinaria de un solo archivo, ni a la inversa.

### 3.2 Restricción de origen

`mrg_constraints.allowed_source_refs` limita a ramas locales del repositorio del Project — ningún
`source_ref` puede apuntar a un remoto externo. Nucleus valida cada referencia contra la lista de ramas
locales conocidas del Runner antes de firmar.

### 3.3 Tope de radio de impacto — validación en dos fases

`max_conflict_files` acota cuántos archivos en conflicto puede resolver un solo `mrg`. Como el conteo real
de conflictos solo se conoce al intentar la fusión, la validación es de **dos fases**:

1. **Firma condicional.** Nucleus firma condicionalmente tras pasar las reglas de clasificación (§3.1) y de
   origen (§3.2). En este punto `.mrg_state.json.status` pasa a `"conditionally_signed"`.
2. **Dry-run.** El Executor corre la fusión en modo *dry-run* sobre el Runner aislado. Si el conteo de
   archivos en conflicto excede `max_conflict_files`, la fusión se aborta y se revierte **sin dejar estado
   parcial** en el repositorio, y el turno se registra como rechazado post-ejecución con
   `reason_code: "MERGE_CONFLICT_BUDGET_EXCEEDED"`.

Nunca se firma un `mrg` cuyo radio de impacto real termine excediendo lo que Nucleus autorizó — la firma
condicional de la fase 1 no es una autorización final, es una habilitación a intentar, sujeta a revocación
automática por el resultado objetivo del dry-run.

### 3.4 Invariante de invalidación (compartida con `tst`, BSIP-011)

Todo `mrg` ejecutado con éxito marca como inválidos todos los `tst` firmados previamente en ese Mandate
(`invalidated_by: mrg_intent_id`). Ningún `tst` anterior a un `mrg` exitoso cuenta para el criterio de
cierre — ver `TST_Intent_Spec_v1_0.md` §3.4 para la contraparte exacta de esta misma invariante, expresada
como `T > M` desde el lado de `tst`.

### 3.5 Scope compartido con `dev`

`scope_paths`/`forbidden_paths` aplican igual que en `dev`, evaluados contra el **conjunto real de
archivos afectados por la fusión** — no solo contra el `source_ref` declarado. Esto cierra un vector de
evasión simétrico al de la clasificación física: un `source_ref` que en su punto de origen no toque paths
prohibidos podría, tras la fusión real con el `target_ref`, terminar afectando archivos fuera de scope; la
validación contra el conjunto real, no contra el declarado, es lo que lo previene.

---

## 4. Esquema de Payload & Types

```typescript
interface MrgIntentDraft {
  type: "mrg";
  source_refs: string[];      // longitud >= 2, obligatorio — validado físicamente por Nucleus
  target_ref?: string;        // rama destino; default = rama de trabajo del Mandate
  payload?: {
    strategy?: "auto" | "manual_hint";
  };
}

interface MrgIntentResult {
  intent_id: string;
  merged: boolean;
  conflict_files: string[];
  conflict_count: number;
  invalidated_tst_ids: string[]; // tst previos marcados inválidos por este merge exitoso
  dry_run_aborted?: boolean;     // true si conflict_count excedió max_conflict_files
}
```

```jsonc
// JSON Schema (draft-07)
{
  "$id": "https://btips.dev/schemas/mrg-intent-draft.json",
  "type": "object",
  "required": ["type", "source_refs"],
  "properties": {
    "type": { "const": "mrg" },
    "source_refs": {
      "type": "array",
      "items": { "type": "string" },
      "minItems": 2   // invariante de clasificación determinista — no negociable por seam
    },
    "target_ref": { "type": "string" },
    "payload": {
      "type": "object",
      "properties": {
        "strategy": { "enum": ["auto", "manual_hint"] }
      }
    }
  }
}
```

---

## 5. Ciclo de vida real, paso a paso

| Paso | Comportamiento en `mrg/` | Notas |
|---|---|---|
| Recepción del draft | Nucleus cuenta `source_refs.length` contra el `type` declarado. | Clasificación física, no confía en el campo `type` (§3.1). |
| `source_refs.length === 1` con `type: "mrg"` | Rechazo, `INTENT_MISCLASSIFIED`. | Redirige implícitamente a `dev` — ver `DEV_Intent_Spec_v1_0.md`. |
| `source_refs.length >= 2` con `type: "mrg"` | Continúa validación de origen (§3.2). | — |
| Validación de origen | Cada `source_ref` se valida contra ramas locales conocidas del Runner. | Ningún remoto externo permitido — `mrg_constraints.allowed_source_refs`. |
| Firma condicional | `.mrg_state.json.status → "conditionally_signed"`. | No es autorización final (§3.3). |
| Dry-run | Executor corre fusión en modo dry-run sobre Runner aislado; se puebla `.dry_run/.conflict_report.json`. | Ver GAP #M3 sobre persistencia de este artefacto. |
| `conflict_count <= max_conflict_files` | Fusión real se aplica; `status → "merged"`. | `merged: true` en `MrgIntentResult`. |
| `conflict_count > max_conflict_files` | Aborto y reversión sin estado parcial; `status → "aborted"`. | `reason_code: "MERGE_CONFLICT_BUDGET_EXCEEDED"`, `dry_run_aborted: true`. |
| Post-merge exitoso | Todos los `tst` previamente firmados en el Mandate se marcan inválidos. | `invalidated_tst_ids` poblado — ver `TST_Intent_Spec_v1_0.md` §3.4. |
| `freeze_to_mandate()` | **No aplica directamente** — `mrg` es una Action dentro de un Mandate, no una unidad que cristalice por sí sola. | Mismo patrón que `dev/` en cuanto a no ser el punto de cristalización, aunque por razón distinta: `mrg` es demasiado granular, no demasiado opaco. |

---

## 6. Lo que `mrg` no gestiona

- No define el mecanismo por el cual surge un segundo `source_ref` local candidato a mergear — ver
  **GAP #M1**, §9, bloqueante de Fase 3.
- No hereda automáticamente los límites de `dev` — tiene su propio conjunto de restricciones
  (`mrg_constraints`) porque el vector de riesgo es cualitativamente distinto, no solo cuantitativamente
  mayor.
- No permite `source_ref` apuntando a remotos externos, bajo ninguna configuración de seam.
- No cuenta como criterio de cierre de Mandate por sí mismo — `mandate_state.status` solo transiciona a
  `"completed"` vía `tst` en `pass` (ver `TST_Intent_Spec_v1_0.md` §3.3).
- No deja estado parcial en el repositorio si el dry-run excede `max_conflict_files` — la reversión es
  total, no incremental.

---

## 7. Contrato `.pipeline/`

`mrg` mantiene mirror `.pipeline/` para `.briefing/` (recepción del draft + `mrg_constraints`) y
`.execution/` (fusión real post firma condicional), siguiendo el mismo patrón de asimetría documentado
para `dev/` en `DEV_Intent_Spec_v1_0.md` §5 — con la diferencia de que aquí la asimetría es intencional y
declarada por diseño, no un GAP heredado: no hay fase de `.refinement/` con turnos en `mrg`, por lo que no
aplica la pregunta de si esa fase tiene mirror completo.

**GAP #M4** — no está confirmado si el resultado del dry-run (`.dry_run/.conflict_report.json`, §2) se
propaga también al `.pipeline/` como parte del contrato BISP estándar, o si es un artefacto interno del
Executor que nunca cruza esa capa. BSIP-010 no lo especifica.

**Capa vectorial:** sin evidencia en BSIP-010 de que la capa vectorial (Ollama/ChromaDB, BISP Parte A) esté
conectada para `mrg` — mismo estado que `DEV_Intent_Spec_v1_0.md` §5 documenta para `dev/`: declarada por
el protocolo genérico, no confirmada como implementada para este consumidor específico.

---

## 8. Contraste con `dev` y `cor`

| Propiedad | `mrg` (este documento) | `dev/` (`DEV_Intent_Spec_v1_0.md`) | `cor` (`COR_Intent_Spec_v1_0.md`) |
|---|---|---|---|
| `source_refs` exigidos | >= 2, validado físicamente | Exactamente 1 (implícito por scope único) | N/A |
| Clasificación | Física, contra el payload real, no contra `type` declarado | N/A | N/A |
| Restricciones propias | `mrg_constraints` (origen + tope de conflicto) | Ninguna equivalente documentada | Zero-Read/Zero-Write |
| Validación en fases | Sí — firma condicional + dry-run (2 fases) | No — sin motor de fases formal | No aplica (operación atómica) |
| Puede invalidar otro intent | Sí — invalida `tst` previos | No | No |
| Proponible por Agent Loop | Sí, con restricciones | Sí | Nunca |
| Firma requerida | Master + validación arquitectónica Nucleus Core Team | No especificada con ese nivel en `DEV_Intent_Spec_v1_0.md` | Dual: Master + Seguridad |

---

## 9. Pendientes explícitos (checklist previo a Fase 3)

*(Extraído de BSIP-010 §5 y spec unificada §8.7/§10 — decisiones pendientes, no una recomendación de este
documento de resolverlas unilateralmente.)*

- [ ] **GAP #M1 (bloqueante de Fase 3).** Mecanismo de origen de los `source_refs` múltiples — de dónde
  surge la segunda rama local candidata a mergear. BSIP-010 formaliza la gobernanza sobre `mrg` una vez que
  existe un `source_ref` válido que evaluar; no formaliza cómo ese segundo origen llega a existir. `mrg` no
  es observable en producción hasta que esto se resuelva.
- [ ] **GAP #M2.** Confirmar schema de identidad (`intent_id`/`type` asumido por continuidad con `ing`/
  `dis`, no declarado explícitamente por BSIP-010).
- [ ] **GAP #M3.** Definir si `.dry_run/` es directorio persistido o estado transitorio del Executor.
- [ ] **GAP #M4.** Confirmar si el resultado del dry-run cruza al contrato `.pipeline/` estándar.
- [ ] Firma Master + validación arquitectónica de Nucleus Core Team — nivel de escrutinio equivalente a
  `dev` más la validación adicional de `mrg_constraints`.

---

## 10. Mapeo de Compliance ISO/SOC 2

| Control | Por qué lo satisface |
|---|---|
| **SOC 2 CC6.3** — Cambios estructurados a componentes del sistema | `mrg` es, por diseño, el único intent que puede introducir cambios provenientes de múltiples orígenes simultáneos — exactamente el tipo de cambio estructural que CC6.3 exige gobernar con controles diferenciados del cambio rutinario (`dev`). |
| **SOC 2 CC8.1** — Gestión de cambios | El límite de `max_conflict_files` y la validación en dos fases (firma condicional + dry-run) son control de cambios aplicado con evidencia verificable, no solo política declarada. |
| **ISO 27001 A.8.32** — Gestión de cambios | La clasificación determinista por estructura física (no por autodeclaración) es la garantía concreta de que ningún cambio de alto impacto se procesa bajo el régimen de control de un cambio menor. |
| **ISO 27001 A.8.9** — Gestión de configuración | `allowed_source_refs` restringido a ramas locales es control de configuración sobre qué fuentes de cambio son válidas para integrarse al sistema. |

---

*`MRG_Intent_Spec_v1_0.md` · deriva de `BSIP-010` (Draft Final, mecanismo de origen de `source_refs`
múltiples sin resolver — bloqueante de Fase 3). Nace del vacío que deja `COR_Intent_Spec_v1_0.md`
(BSIP-009) y comparte con `TST_Intent_Spec_v1_0.md` (BSIP-011) la invariante de invalidación cruzada. Ver
`DEV_Intent_Spec_v1_0.md` para el formato de referencia y el intent contra el cual `mrg` se clasifica
físicamente.*
