# DEV — Especificación Técnica del Intent de Desarrollo

**Versión:** 1.0
**Estado:** Confirmado contra código — documenta comportamiento real, **no** un rediseño aspiracional
**Depende de:** `BTIPS_dev_doc_Intent_Documentation_v2_0.md` (fuente primaria de este documento, todas las
afirmaciones trazadas a código real), `BLOOM_BISP_Fuente_de_Verdad_v1_0.md` Parte A (protocolo BISP
genérico, capa vectorial aditiva, invariantes 1-5), `ING_Intent_Spec_v1_1.md` / `DIS_Intent_Spec_v1_0.md`
(referencia de formato de spec y contraste con el motor BSIP genérico que `dev/` **no** usa)

---

## Nota de naturaleza de este documento

`ing/` y `dis/` tienen spec formal porque nacieron ya gobernados por `IntentStateManager`: fases
declaradas en `intent_types.py`, validación estricta de orden, `commit_field` por fase. `dev/` y `doc/`
son anteriores a ese motor — son intents **"legacy hand-rolled"** (término del propio código,
`intent_manager.py`, comentario sobre `_BSIP_ENGINE_TYPES`), con fases hardcodeadas directamente en
`intent_manager.py` en vez de en una tabla declarativa.

El equipo de Brain evaluó explícitamente registrar `dev`/`doc` en `intent_types.py` y decidió **no
hacerlo todavía**, con el argumento de que forzar una entrada de registro con `commit_field`/`has_turns`
para fases que en la realidad no comitean nada sería documentar una gramática que no es cierta.

Este documento respeta esa misma disciplina: especifica `dev/` **tal como el código lo ejecuta hoy**,
no como debería ejecutarse si se migrara a BSIP. Donde el comportamiento real diverge de lo que el árbol
de directorios de referencia (`bloom_project_tree.txt`) sugiere, o donde falta una decisión de diseño,
queda marcado explícitamente como **GAP** o **PENDIENTE** — misma convención que usan `ING_Intent_Spec` y
`DIS_Intent_Spec` para sus propios pendientes. Ningún GAP se "resuelve" en este documento; el checklist de
migración a BSIP vive en la sección 9, tomado sin cambios de `BTIPS_dev_doc_Intent_Documentation_v2_0.md`
§10.

---

## 0. Resumen ejecutivo

`dev/` es el intent de **desarrollo**: un ciclo de trabajo humano-gobernado donde se brief-ea una tarea de
código a una IA, se ejecuta, se refina en turnos, y el resultado se fusiona (`merge`) al codebase real del
proyecto. Es, junto con `doc/`, `ing/` y `dis/`, uno de los cuatro tipos de intent **completamente
funcionales en producción** del ecosistema — pero el único, junto a `doc/`, que corre sobre un motor propio
en vez del motor BSIP genérico que gobierna a `ing/`/`dis/`.

Tres fases, sin motor de estado formal: `.briefing/` → `.execution/` → `.refinement/` (con turnos,
`.turn_X/`). No cristaliza a Mandate — `freeze_to_mandate()` levanta `ValueError` explícito para `dev/`.

---

## 1. Estructura de `.dev_state.json`

```json
{
  "uuid": "uuid3(NAMESPACE, name) — determinista",
  "type": "dev",
  "status": "created | in_progress | completed",
  "steps": {
    "create": true,
    "hydrate": false,
    "plan": false,
    "build": false,
    "submit": false,
    "merge": false
  },
  "created_at": "ISO-8601",
  "updated_at": "ISO-8601"
}
```

**Notas de campos (confirmadas contra `_create_initial_state()`):**

- No existe `phase_active` ni `resumable` como en `.ing_state.json`/`.dis_state.json` — no hay motor de
  fases que necesite persistir "en qué fase estoy". El avance real se infiere contando subcarpetas
  existentes bajo `.briefing/`, `.execution/`, `.refinement/`.
- **GAP #1** — el árbol de referencia (`bloom_project_tree.txt`) documenta que `.dev_state.json` "incluye
  `mandate_id` y `gene_id` activo". `_create_initial_state()` real **no escribe ninguno de los dos
  campos**. O el árbol describe un estado deseado no implementado, o existe otro punto del código (no
  verificado en esta investigación) que los agrega después.
- **GAP #10 — divergencia de schema de identidad**: `dev/` usa `uuid`/`type`, mientras que `ing/`/`dis/`
  (spec-compliant) usan `intent_id`/`intent_type`. `intent_manager.py` resuelve la divergencia con dos
  helpers puente, `_uid()` e `_itype()` — el único punto del código que conoce ambas convenciones.
- `mandate_id`, `domain_baseline` y `scope` (parámetros que sí existen en la firma de `create_intent()`
  por compartir función con `ing/`/`dis/`) se **ignoran** para `dev/` — son exclusivos del motor BSIP.

---

## 2. Estructura de directorios de `dev/`

Confirmada en dos fuentes independientes: `bloom_project_tree.txt` y `_create_directory_structure()` de
`intent_manager.py`.

```
.{intent-name-uuid3}/
├── .dev_state.json          ← ver GAP #1 (sección 1): no lleva mandate_id/gene_id pese a lo
│                                que documenta el árbol de referencia
├── .briefing/                ← sin turnos, acto inicial único
│   ├── .briefing.json
│   └── .files/
│       ├── .codebase.json
│       ├── .codebase_index.json
│       ├── .docbase.json / .docbase_index.json   ← GAP: declarados en el árbol de referencia,
│       │                                             NO generados por hydrate_intent() para dev
│       └── [optional files]
├── .execution/
│   └── .files/  (misma forma que .briefing/.files/)
├── .refinement/               ← con turnos
│   └── .turn_X/
│       ├── .turn.json
│       └── .files/ (misma forma)
└── .pipeline/                 ← contrato BISP, con asimetría — ver sección 5
    ├── .briefing/  {.payload.json, .index.json, .response/{.raw_output.txt, .report.json, .staging/}}
    ├── .execution/ (misma forma completa, con .response/.staging)
    └── .refinement/  ← GAP #8: SIN mirror completo — no tiene .response/.staging por turno,
                          a diferencia de .briefing y .execution
```

**Fases (3):** `briefing` → `execution` → `refinement` (con turnos, `.turn_X/`).

---

## 3. Fases

### 3.1 `.briefing/` — sin turnos

Acto inicial único, análogo a `.reception/` de `ing/` o `.context/` de `doc/`: se recibe el brief de la
tarea de desarrollo y se prepara el contexto de código sobre el que va a trabajar la IA.

- `hydrate_intent()` escribe `.briefing/.briefing.json` con `content_key: "instruction"` y genera
  `.briefing/.files/.codebase.json` / `.codebase_index.json`.
- **GAP** — `hydrate_intent()` usa la misma mecánica (`CodeCompressor`, `content_key="instruction"`) para
  `dev/` y `doc/` sin distinción; no hay una ruta de hidratación propia de `dev/` separada de la que
  también corre para `doc/`.

### 3.2 `.execution/` — steps `plan` / `build` sin verificar

`.execution/` existe como carpeta con la misma forma que `.briefing/.files/`, y el state inicial declara
los steps `plan` y `build` — pero el comportamiento real de esos steps **no fue verificado contra código**
en esta investigación: viven presumiblemente en `commands/intent/{plan,build_payload}.py` y
`core/context_planning/payload_builder.py`, archivos no compartidos (ver §9, pendiente heredado de
`BTIPS_dev_doc_Intent_Documentation_v2_0.md` §9).

### 3.3 `.refinement/` — con turnos

Fase de cierre iterativo, análoga a `.consolidation/` de `ing/` o `.curation/` de `doc/`.

- `add_turn()` agrega un turno en `.refinement/.turn_N/.turn.json`: `{turn_id, actor, content,
  timestamp}`. La numeración de turno es simplemente "subcarpetas existentes + 1" — no hay validación de
  que la fase anterior haya cerrado.
- **GAP #6** — el parámetro `close_phase` es aceptado por la firma de `add_turn()` pero **nunca se lee**
  en la rama `dev`/`doc`: es un no-op silencioso, no una decisión de diseño documentada. A diferencia de
  `ing/`/`dis/` (gobernados por `IntentStateManager`, que sí levanta `PhaseNotActiveError`), nada impide
  agregar un turno de refinamiento sin haber pasado por `.execution/`.
- **GAP #7** — `finalize_intent()` no exige ninguna precondición de cierre: se puede finalizar un `dev`
  con `.refinement/` vacío. Nada en el código lo impide.

---

## 4. Ciclo de vida real, paso a paso

| Paso (método) | Comportamiento en `dev/` | Notas |
|---|---|---|
| `create_intent()` | Crea `.briefing/`, `.execution/`, `.refinement/`, `.pipeline/*`. Genera `intent_id` determinista vía `uuid.uuid3(NAMESPACE, name)`. | `mandate_id`/`domain_baseline`/`scope` se ignoran (exclusivos de `ing`/`dis`). |
| `hydrate_intent()` | Escribe `.briefing/.briefing.json` (`content_key="instruction"`) + `.codebase.json`/`.codebase_index.json`. | Nunca genera `.docbase*.json` — no aplica a `dev/`, que trabaja sobre codebase. |
| *(`plan`, `build`)* | Steps declarados en el state; comportamiento real no verificado. | Pendiente §9. |
| `submit_intent()` | Lee `.pipeline/.briefing/.payload.json` + `.index.json`, empaqueta y envía por TCP al native host (`bloom-host`, puerto 5678 default). | Path hardcodeado a `.pipeline/.briefing/` — correcto para `dev/` en su primera fase. |
| `ResponseParser.parse()` | Lee `.raw_output.txt` de la etapa detectada, valida protocolo y checksum. | Detecta el "stage" activo por convención de nombre. |
| `ValidationManager.validate()` | Valida hashes en `.staging/`, corre análisis opcional con Gemini, genera `.report.json`. | Prompt hardcodeado: `"You are analyzing changes for a development intent."` — coherente para `dev/`, pero es el mismo prompt sin variante que usa `doc/` (ver `DOC_Intent_Spec_v1_0.md` §5). |
| `StagingManager.stage()` | Copia `.files/` → `.staging/` según `.raw_output.json`, genera `.staging_manifest.json`. | `_detect_latest_stage()` reconoce literalmente `"briefing"`/`"execution"`/`"refinement_X"` — vocabulario nativo de `dev/`. |
| `add_turn()` | Agrega turno en `.refinement/.turn_N/.turn.json`. | Ver GAP #6, sección 3.3. |
| `MergeManager.merge()` | Aplica `.staging/` al codebase real, con backup opcional. | `_detect_latest_stage()` tiene rama explícita `if intent_type == "dev": revisar .refinement/` — correcta y nativa para este tipo. |
| `finalize_intent()` | Marca `status: "completed"`, `steps.merge = True`. | Sin precondición — ver GAP #7. |
| `freeze_to_mandate()` | **No soportado** — `ValueError` explícito. | Confirmado por el docstring: "dev/doc no cristalizan — no convergen contra ningún grafo de Dominios." `dev/` no produce `mandate.json`. |

### Steps declarados en el state inicial

```python
"steps": {"create": True, "hydrate": False, "plan": False,
          "build": False, "submit": False, "merge": False}
```

---

## 5. Contrato `.pipeline/` y estado real de la capa vectorial

**Asimetría del `.pipeline/` (GAP #8):** `.briefing/` y `.execution/` tienen mirror completo en
`.pipeline/` con `.response/.staging/` por fase. `.refinement/` **no** tiene esa subcarpeta declarada en
`_create_directory_structure()`. No está confirmado si es intencional (¿los turnos de refinamiento no
pasan por el pipeline de submit/response?) o un olvido de implementación.

**Capa vectorial (Ollama/ChromaDB, BISP Parte A):** declarada como capa aditiva del protocolo genérico,
pero **no confirmada como implementada** contra el código de `intent_manager.py` revisado en esta
investigación — no hay ninguna llamada a Ollama, a ChromaDB, ni escritura de `index.json` con las tres
capas (`operational`/`autarchic`/`marketplace`) en ninguno de los métodos revisados para `dev/`. El propio
documento BISP (Parte A, §A.9) es honesto sobre que del lado Go/Temporal esta capa tampoco está conectada
todavía. **Conclusión:** para `dev/`, no hay evidencia en el código compartido de que el pipeline
vectorial esté hoy ejercido — es una capa declarada por el protocolo, no verificada en este consumidor.

---

## 6. Lo que `dev/` no gestiona

- No toca `.mandates/`, `.genes/`, ni `.cache/.semantic-index.json` — todo eso es Nucleus-level y, según
  `freeze_to_mandate()`, exclusivo del ciclo `ing`/`dis`.
- No cristaliza a Mandate bajo ninguna circunstancia.
- No valida orden de fases ni exige turnos previos al cierre (ver GAPs #6 y #7).

---

## 7. Gaps confirmados aplicables a `dev/`

Numeración heredada de `BTIPS_dev_doc_Intent_Documentation_v2_0.md` §8, filtrada a los que aplican
directamente a `dev/` (varios son compartidos con `doc/`, marcados como tal):

| # | Gap | Compartido con `doc/` |
|---|---|---|
| 1 | `.dev_state.json` no escribe `mandate_id`/`gene_id` pese a lo que dice el árbol de referencia | No |
| 3 | `submit_intent()` con path fijo a `.pipeline/.briefing/` — no contempla `.pipeline/.context/` de `doc/` | Sí (afecta a `doc/`, no a `dev/`) |
| 4 | Detección de "stage" inconsistente entre managers — vocabulario nativo de `dev/`, sin rama para `doc/` | Sí (afecta a `doc/`) |
| 5 | Prompt de Gemini hardcodeado a "development intent" — correcto para `dev/`, sin variante para `doc/` | Sí (afecta a `doc/`) |
| 6 | `close_phase` ignorado en `add_turn()` — no-op silencioso | Sí |
| 7 | `finalize_intent()` sin precondición de cierre | Sí |
| 8 | `.pipeline/.refinement/` sin mirror completo (`.response/.staging`) | Sí (`.curation/` en `doc/`) |
| 9 | Ausencia total de `DEV_Intent_Spec_*.md` | Sí — este documento y `DOC_Intent_Spec_v1_0.md` lo cierran |
| 10 | Divergencia de schema de identidad (`uuid`/`type` vs. `intent_id`/`intent_type`) | Sí |

---

## 8. Contraste con el motor BSIP genérico (`ing/`/`dis/`)

| Propiedad | `dev/` (este documento) | `ing/`/`dis/` (BSIP genérico) |
|---|---|---|
| Motor de fases | Ninguno — hardcodeado en `intent_manager.py` | `IntentStateManager`, declarativo (`intent_types.py`) |
| Validación de orden de fases | No — `add_turn()` no valida | Sí — `PhaseNotActiveError` |
| Precondición de `finalize` | No | Sí, implícita en el motor de fases |
| Schema de identidad | `uuid`/`type` | `intent_id`/`intent_type` |
| Cristaliza a Mandate | No (`ValueError` explícito) | Sí (`freeze_to_mandate()`) |
| Capa vectorial confirmada en código | No (declarada, no verificada) | Ver `ING_Intent_Spec_v1_1.md`/`DIS_Intent_Spec_v1_0.md` |
| Mirror `.pipeline/` completo en todas las fases | No (`.refinement/` incompleto) | Sí, contrato uniforme |

---

## 9. Pendientes explícitos (checklist de migración a BSIP)

*(Tomado sin cambios de `BTIPS_dev_doc_Intent_Documentation_v2_0.md` §9 y §10 — decisiones pendientes,
no una recomendación de este documento de ejecutarlas.)*

**Verificación de código pendiente:**
- `commands/intent/plan.py`, `build_payload.py` — comportamiento real de los steps `plan`/`build`.
- `core/context_planning/payload_builder.py`, `context_planning/gemini_router.py` — arman el payload que
  consume `submit_intent()`.
- `fs_contracts.py` (si existe) — dueño declarado de la validación de shape de negocio de los turnos.
- `bloom_project_inspector.py` — citado de segunda mano en el Gap Analysis (`get_intents_list()` "solo
  escanea `.dev`/`.doc`"), no verificado de primera mano.

**Decisiones de diseño pendientes antes de tocar código:**
- [ ] ¿Qué campo marca el cierre de `.refinement/`? ¿Se agrega `committed` a `.turn.json`, o se define
  otro mecanismo?
- [ ] ¿`finalize_intent()` pasa a exigir una precondición de fase terminal? ¿Rompe intents `dev/` ya
  existentes en filesystem que hoy dependen de finalizar sin turnos?
- [ ] ¿Se normaliza el schema de identidad (`uuid`/`type` → `intent_id`/`intent_type`), o se mantiene el
  puente `_uid()`/`_itype()` permanentemente?
- [ ] ¿`.refinement/` debería tener mirror completo en `.pipeline/` (con `.response/.staging`) como sí
  tienen `.briefing/`/`.execution/`?

---

*`DEV_Intent_Spec_v1_0.md` · deriva de `BTIPS_dev_doc_Intent_Documentation_v2_0.md`, sin alterar ninguna
afirmación confirmada por código. Complementa a `ING_Intent_Spec_v1_1.md` y `DIS_Intent_Spec_v1_0.md` para
cubrir spec formal de los cuatro tipos de intent funcionales en producción del ecosistema.*
