# DOC — Especificación Técnica del Intent de Documentación

**Versión:** 1.0
**Estado:** Confirmado contra código — documenta comportamiento real, **no** un rediseño aspiracional
**Depende de:** `BTIPS_dev_doc_Intent_Documentation_v2_0.md` (fuente primaria de este documento, todas las
afirmaciones trazadas a código real), `BLOOM_BISP_Fuente_de_Verdad_v1_0.md` Parte A (protocolo BISP
genérico, capa vectorial aditiva, invariantes 1-5), `DEV_Intent_Spec_v1_0.md` (intent hermano — mismo
motor legacy, mismo patrón de fases + pipeline, varios gaps compartidos), `ING_Intent_Spec_v1_1.md` /
`DIS_Intent_Spec_v1_0.md` (referencia de formato de spec y contraste con el motor BSIP genérico que
`doc/` **no** usa)

---

## Nota de naturaleza de este documento

Misma nota que abre `DEV_Intent_Spec_v1_0.md`, aplicada acá sin cambios: `doc/` es un intent **"legacy
hand-rolled"** (término del propio código), anterior al motor `IntentStateManager` que gobierna a
`ing/`/`dis/`. Sus fases están hardcodeadas en `intent_manager.py`, no declaradas en `intent_types.py`. El
equipo de Brain decidió explícitamente no forzar `doc/` a una entrada de registro con `commit_field` que
documentaría una gramática que en la realidad no comitea nada.

Este documento especifica `doc/` **tal como el código lo ejecuta hoy**. Donde el comportamiento diverge de
lo que documenta el árbol de referencia, o donde falta una decisión, queda marcado como **GAP** o
**PENDIENTE**. Ningún GAP se resuelve acá; el checklist de migración a BSIP vive en la sección 9.

---

## 0. Resumen ejecutivo

`doc/` es el intent de **documentación**. Mismo patrón general que `dev/` (briefing → ejecución/contexto →
refinamiento → merge/publish), orientado a `docbase` en vez de `codebase`. Conceptualmente se dispara
**después** de un `dev/` para documentar lo desarrollado — pero esa relación causal **no está codificada**
en `intent_manager.py`: no existe ningún mecanismo que cree automáticamente un `doc/` al finalizar un
`dev/`. Es convención de uso del ecosistema, no una regla que el motor imponga.

Dos fases, sin motor de estado formal: `.context/` → `.curation/` (con turnos, `.turn_X/`). Un paso menos
que `dev/` en su ciclo de gobierno (`curate`/`publish` en vez de `plan`/`build`/`submit`/`merge`). No
cristaliza a Mandate.

---

## 1. Estructura de `.doc_state.json`

```json
{
  "uuid": "uuid3(NAMESPACE, name) — determinista",
  "type": "doc",
  "status": "created | in_progress | completed",
  "steps": {
    "create": true,
    "hydrate": false,
    "curate": false,
    "publish": false
  },
  "created_at": "ISO-8601",
  "updated_at": "ISO-8601"
}
```

**Notas de campos:**

- Mismo patrón de identidad que `dev/` (`uuid`/`type`, no `intent_id`/`intent_type` — GAP #10, ver
  `DEV_Intent_Spec_v1_0.md` §1). Puenteado por los mismos helpers `_uid()`/`_itype()`.
- `steps` tiene un paso menos que `dev/`: no hay equivalente a `plan`+`build`+`submit`+`merge` — solo
  `curate`/`publish`. Consistente con que `doc/` carece de una fase `.execution/` separada (ver §3).
- **PENDIENTE (heredado de BTIPS §7)** — BTIPS §6 afirma que `doc/` corre "en Projects y en Nucleus". El
  código revisado (`_create_directory_structure()`) solo cubre el caso Project. No hay evidencia de código
  de `doc/` a nivel Nucleus en las fuentes compartidas. No confirmado cuál de las dos fuentes está
  desactualizada.

---

## 2. Estructura de directorios de `doc/`

```
.{intent-name-uuid3}/
├── .doc_state.json
├── .context/                    ← sin turnos, cumple el rol de ".briefing/" de dev
│   ├── .doc.json                 ← GAP #2: nombre según el árbol de referencia; el código real
│   │                                escribe .context.json (mismo archivo, nombre distinto)
│   └── .files/
│       ├── .codebase.json / .codebase_index.json   ← lo que el código realmente genera
│       └── .docbase.json / .docbase_index.json      ← GAP: declarados en el árbol, NO generados
│                                                        por hydrate_intent() (ver §3.1)
├── .curation/                   ← con turnos, cumple el rol de ".refinement/" de dev
│   └── .turn_X/
│       ├── .doc.json
│       └── .files/
└── .pipeline/                   ← contrato BISP, con la misma asimetría que dev/
    ├── .context/  {.payload.json, .index.json, .response/{.raw_output.txt, .report.json, .staging/}}
    └── .curation/  ← GAP #8 (compartido con dev/.refinement/): SIN .response/.staging por turno
```

**Fases (2):** `context` → `curation` (con turnos, `.turn_X/`).

`doc/` tiene una fase menos que `dev/`: no hay equivalente a `.execution/` — `.context/` cumple el rol de
"acto inicial sin turnos" (como `.briefing/` de `dev`) y `.curation/` el de refinamiento iterativo con
turnos (como `.refinement/` de `dev`), pero sin un paso intermedio de ejecución separado.

---

## 3. Fases

### 3.1 `.context/` — sin turnos

Acto inicial único: recibe el objetivo de documentación y prepara el material base.

- `hydrate_intent()` escribe `.context/.context.json` (**no** `.doc.json` — GAP #2, divergencia de
  nombre entre árbol y código para lo que es el mismo archivo) + `.context/.files/.codebase.json` /
  `.codebase_index.json`.
- **GAP central de `doc/`** — el código usa la misma mecánica de compresión de código (`CodeCompressor`,
  `content_key="instruction"`) que `dev/`, y genera siempre `.codebase*.json`, **nunca** `.docbase*.json`,
  incluso para `doc/`. Hoy `doc/` se hidrata con mecánica de código, no con una mecánica propia de
  documentación — pese a que el árbol de referencia declara `.docbase.json`/`.docbase_index.json` como
  parte de la forma esperada de `.files/`.

### 3.2 `.curation/` — con turnos

Fase de cierre iterativo, mecánicamente casi idéntica a `.refinement/` de `dev/`:

- `add_turn()` agrega turno en `.curation/.turn_N/.turn.json`, misma forma que en `dev/`.
- **GAP #6 (compartido con `dev/`)** — `close_phase` es aceptado por la firma pero nunca leído; no-op
  silencioso. Nada impide agregar un turno de curación sin haber "cerrado" `.context/`.
- **GAP #7 (compartido con `dev/`)** — `finalize_intent()` no exige ningún turno previo: se puede
  finalizar un `doc/` con `.curation/` vacío.

---

## 4. Ciclo de vida real, paso a paso

| Paso (método) | Comportamiento en `doc/` | Notas |
|---|---|---|
| `create_intent()` | Crea `.context/`, `.curation/`, `.pipeline/*`. Genera `intent_id` determinista vía `uuid.uuid3`. | `mandate_id`/`domain_baseline`/`scope` se ignoran, igual que en `dev/`. |
| `hydrate_intent()` | Escribe `.context/.context.json` (no `.doc.json` — GAP #2) + `.codebase.json`/`.codebase_index.json`. | Nunca genera `.docbase*.json` — ver GAP central §3.1. |
| *(no hay `plan`/`build`)* | El state de `doc/` pasa directo a `curate` — no existen esos steps. | Coherente con que `doc/` no tiene `.execution/`. |
| `submit_intent()` | **GAP #3 (crítico para `doc/`)** — `submit_intent()` tiene hardcodeado `intent_path / ".pipeline" / ".briefing"` como origen del payload. Nunca revisa `.pipeline/.context/`. | Tal como está escrito, `submit_intent()` **no funciona** para un `doc/` cuyo payload esté en `.pipeline/.context/` — es funcionalmente solo para `dev/` en su primera fase. |
| `ResponseParser.parse()` | Lee `.raw_output.txt` de la etapa detectada. | Comparte la limitación del GAP #4 siguiente. |
| `ValidationManager.validate()` | Valida hashes, corre análisis opcional con Gemini. | **GAP #5** — el prompt está literalmente hardcodeado a `"You are analyzing changes for a development intent."` — no hay variante para `doc/`. El análisis de calidad asume semántica de código, no de documentación. |
| `StagingManager.stage()` | Copia `.files/` → `.staging/`, genera `.staging_manifest.json`. | **GAP #4** — `_detect_latest_stage()` reconoce literalmente `"briefing"`/`"execution"`/`"refinement_X"`. **No reconoce `"context"`/`"curation_X"`.** El pipeline post-payload (`stage`→`validate`→`merge`) no parece probado/soportado para `doc/`, aunque la estructura de carpetas exista. |
| `add_turn()` | Agrega turno en `.curation/.turn_N/.turn.json`. | Ver GAPs #6/#7, sección 3.2. |
| `MergeManager.merge()` | Aplica `.staging/` al codebase real. | **GAP #4 (misma familia)** — `_detect_latest_stage()` de este manager tiene rama explícita solo para `dev` (`if intent_type == "dev": revisar .refinement/`); para `doc/` cae directo a revisar `.pipeline/.execution/` y `.pipeline/.briefing/` — carpetas que **no existen** en un `doc/` intent. |
| `finalize_intent()` | Marca `status: "completed"`, `steps.publish = True`. | Sin precondición de cierre — ver GAP #7. |
| `freeze_to_mandate()` | **No soportado** — `ValueError` explícito, mismo mensaje que `dev/`. | `doc/` no cristaliza a Mandate. |

### Steps declarados en el state inicial

```python
"steps": {"create": True, "hydrate": False, "curate": False, "publish": False}
```

---

## 5. Contrato `.pipeline/` y estado real de la capa vectorial

**Evidencia concreta de que el pipeline de post-procesamiento (`submit`/`stage`/`validate`/`merge`) fue
escrito pensando en `dev/` y no fue adaptado a las convenciones de nombre propias de `doc/`** — los GAPs
#3, #4 y #5 de la sección 4 son, en conjunto, la misma causa raíz vista en tres managers distintos: los
nombres de fase `context`/`curation` de `doc/` no son reconocidos por código que solo conoce
`briefing`/`execution`/`refinement`.

**Asimetría del `.pipeline/` (GAP #8, compartido con `dev/`):** `.context/` tiene mirror completo con
`.response/.staging/`. `.curation/` no lo tiene — mismo patrón asimétrico que `.refinement/` en `dev/`.

**Capa vectorial (Ollama/ChromaDB, BISP Parte A):** igual que en `dev/`, declarada como capa aditiva del
protocolo genérico pero **no confirmada como implementada** contra el código revisado — no hay llamadas a
Ollama, a ChromaDB, ni escritura de `index.json` con las tres capas para `doc/`.

---

## 6. Lo que `doc/` no gestiona

- No toca `.mandates/`, `.genes/`, ni `.cache/.semantic-index.json` — Nucleus-level, exclusivo de
  `ing`/`dis`.
- No cristaliza a Mandate.
- **No hay mecanismo que dispare `doc/` automáticamente al finalizar un `dev/`.** La secuencia
  `dev/` → `doc/` es convención de uso del equipo, no una regla codificada.

---

## 7. Gaps confirmados aplicables a `doc/`

Numeración heredada de `BTIPS_dev_doc_Intent_Documentation_v2_0.md` §8 (misma tabla que
`DEV_Intent_Spec_v1_0.md` §7, filtrada al lado `doc/`):

| # | Gap | Compartido con `dev/` |
|---|---|---|
| 2 | Nombre de archivo de contexto: árbol declara `.context/.doc.json`, código escribe `.context.json` | No — exclusivo de `doc/` |
| 3 | `submit_intent()` con path fijo a `.pipeline/.briefing/` — no funciona para `doc/` | No — el gap existe *en* `dev/` pero *rompe a* `doc/` |
| 4 | `_detect_latest_stage()` de `Staging`/`MergeManager` no reconoce `"context"`/`"curation_X"` | No — exclusivo de `doc/` |
| 5 | Prompt de Gemini hardcodeado a "development intent", sin variante para `doc/` | No — exclusivo de `doc/` |
| 6 | `close_phase` ignorado en `add_turn()` — no-op silencioso | Sí |
| 7 | `finalize_intent()` sin precondición de cierre | Sí |
| 8 | `.pipeline/.curation/` sin mirror completo (`.response/.staging`) | Sí (`.refinement/` en `dev/`) |
| 9 | Ausencia total de `DOC_Intent_Spec_*.md` | Sí — este documento lo cierra |
| 10 | Divergencia de schema de identidad (`uuid`/`type` vs. `intent_id`/`intent_type`) | Sí |
| — | Hidratación genera `.codebase*.json`, nunca `.docbase*.json`, para `doc/` | No — exclusivo de `doc/`, gap central de la fase `.context/` |
| — | Incertidumbre Project vs. Nucleus (BTIPS §6 dice ambos, código solo confirma Project) | No — exclusivo de `doc/` |

**Nota de severidad:** a diferencia de los gaps compartidos con `dev/` (#6, #7, #8, #10 — inconsistencias
de gobierno, pero el pipeline funciona), los gaps #3, #4 y #5 son **específicos de `doc/`** y afectan
directamente si el pipeline de post-procesamiento (`submit`→`stage`→`validate`→`merge`) funciona en la
práctica para este tipo de intent: `submit_intent()` tal como está escrito no llega a leer el payload de
`doc/`, y ninguno de los dos managers de detección de "stage" reconoce su vocabulario de fases.

---

## 8. Contraste con `dev/` y con el motor BSIP genérico

| Propiedad | `doc/` (este documento) | `dev/` | `ing/`/`dis/` (BSIP genérico) |
|---|---|---|---|
| Fases | 2: `.context/` → `.curation/` | 3: `.briefing/` → `.execution/` → `.refinement/` | Propias por tipo, gobernadas por motor |
| Motor de fases | Ninguno | Ninguno | `IntentStateManager` |
| `submit_intent()` funcional | **No confirmado — path hardcodeado a `.briefing/`** | Sí | N/A (mecanismo propio) |
| Detección de "stage" reconoce el vocabulario propio | **No** (`context`/`curation_X` no reconocidos) | Sí (`briefing`/`execution`/`refinement_X`) | Sí, por diseño |
| Genera archivos base propios de su dominio | **No** (genera `.codebase*.json`, no `.docbase*.json`) | Sí (`.codebase*.json`) | Sí |
| Cristaliza a Mandate | No | No | Sí |
| Nivel confirmado en código | Project (Nucleus sin confirmar) | Project | Project (`ing`) / Nucleus (`dis`) |

---

## 9. Pendientes explícitos (checklist de migración a BSIP)

*(Tomado sin cambios de `BTIPS_dev_doc_Intent_Documentation_v2_0.md` §9 y §10 — compartido con
`DEV_Intent_Spec_v1_0.md` §9, con los ítems propios de `doc/` marcados.)*

**Verificación de código pendiente:**
- `core/context/generate.py` / `core/context/manager.py` — posible lógica específica de `doc/` para
  `.docbase.json` (hoy no confirmada; `hydrate_intent()` solo genera `.codebase*.json` para ambos tipos).
- `bloom_project_inspector.py` — citado de segunda mano (`get_intents_list()` "solo escanea
  `.dev`/`.doc`"), no verificado de primera mano.
- Confirmación directa de si `doc/` corre a nivel Nucleus (BTIPS lo afirma, ningún código revisado lo
  muestra).

**Decisiones de diseño pendientes antes de tocar código:**
- [ ] ¿Se corrige `submit_intent()` para que lea `.pipeline/.context/` cuando el intent es `doc/`, en vez
  de asumir siempre `.pipeline/.briefing/`?
- [ ] ¿Se extiende `_detect_latest_stage()` (en `StagingManager` y `MergeManager`) para reconocer
  `"context"`/`"curation_X"`?
- [ ] ¿Se escribe una variante del prompt de Gemini para `doc/` en `ValidationManager`, o se generaliza a
  un prompt parametrizado por `intent_type`?
- [ ] ¿Se implementa una ruta de hidratación propia para `doc/` que genere `.docbase*.json` en vez de
  reusar `CodeCompressor`?
- [ ] Mismos pendientes de gobierno que `dev/`: campo de cierre de turno, precondición de `finalize`,
  normalización de schema de identidad, mirror completo de `.pipeline/.curation/`.
- [ ] Incorporar como postcondición obligatoria de `finalize_intent()` la invocación del servicio
  permanente de visualización de proyectos. Antes de alcanzar `completed`, todo Intent `doc` deberá
  solicitar al servicio que analice si los cambios documentales afectan la representación visual vigente
  del proyecto. La invocación será obligatoria; la modificación de la visualización será condicional al
  análisis. El resultado deberá quedar trazado como uno de estos estados: visualización actualizada,
  actualización no requerida con justificación, o revisión humana requerida.

---

*`DOC_Intent_Spec_v1_0.md` · deriva de `BTIPS_dev_doc_Intent_Documentation_v2_0.md`, sin alterar ninguna
afirmación confirmada por código. Junto con `DEV_Intent_Spec_v1_0.md`, `ING_Intent_Spec_v1_1.md` y
`DIS_Intent_Spec_v1_0.md`, cierra la spec formal de los cuatro tipos de intent funcionales en producción
del ecosistema.*
