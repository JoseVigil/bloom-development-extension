# BLOOM — Intent Types: Gap Analysis (Investigación de Sesión)

**Bloom / Brain · v1.0 · Agosto 2026**

| Campo | Valor |
|---|---|
| Origen | Investigación disparada por revisión de `intent_state_manager.py` / `intent_types.py` |
| Método | Cruce de specs (BTIPS, ING/DIS, Mandate Domain, BISP) contra código real (`brain/`) |
| Estado | Diagnóstico cerrado. **Sin acción de código tomada** — este documento es el registro, no una implementación |
| Alcance | `dev`, `doc`, `exp`, `cor`, `inf`, `ing`, `dis` — los 7 tipos de intent mencionados en el ecosistema |

---

## 0. Decisión tomada en esta sesión

**No se agregan `dev`/`doc` a `intent_types.py` / `INTENT_TYPE_REGISTRY` todavía.**

Motivo: `dev` y `doc`, tal como existen hoy en código (`intent_manager.py`), no usan el modelo de máquina de estados que gobierna `ing`/`dis` (`phase_active` + `commit_field` + `IntentStateManager`). Usan un modelo distinto y más laxo (`status` string + `steps{}` boolean checklist, sin gating). Forzar una entrada de registro que describa `commit_field`/`has_turns` para fases que en la realidad no comitean nada sería documentar una gramática que no es cierta — y el propio principio de este ecosistema (ver `BLOOM_BISP_Session_Decisions_v1_1.md`, nota de cabecera) es no diluir la fuente de verdad con supuestos no verificados.

Este documento existe para que, cuando llegue el momento real de implementar `dev`/`doc` sobre el motor BSIP (o de definir `cor`/`inf`/completar `exp` desde cero), el punto de partida sea preciso y no haya que re-descubrir esto.

---

## 1. Estado real por tipo — resumen ejecutivo

| Tipo | ¿Implementado? | Motor | Nivel | Gap principal |
|---|---|---|---|---|
| `dev` | ✅ Funcional, en producción | Legacy hand-rolled (`status`/`steps{}`) | Project | No es compatible con el modelo BSIP sin reescritura — ver §3 |
| `doc` | ✅ Funcional, en producción | Legacy hand-rolled (`status`/`steps{}`) | Project + Nucleus (BTIPS §6, no confirmado en código a nivel Nucleus) | Idem `dev` — ver §4 |
| `ing` | ✅ Funcional | BSIP genérico (`IntentStateManager`) | Project | Ninguno conocido |
| `dis` | ✅ Funcional | BSIP genérico (`IntentStateManager`) | Nucleus | Ninguno conocido |
| `exp` | 🟡 Parcial — roto | Ad-hoc propio, fuera de ambos motores | Nucleus | Método `NucleusManager.create_exp_intent()` no existe en el código revisado — ver §5 |
| `cor` | ❌ No implementado | — | Nucleus (según árbol conceptual) | Cero código; solo existe como mockup de árbol de directorios — ver §6 |
| `inf` | ❌ No implementado | — | — | Cero código, cero estructura de directorios en ningún árbol real — ver §7 |

---

## 2. Fuentes consultadas en esta investigación

- `intent_state_manager.py`, `intent_types.py` — motor BSIP genérico
- `intent_manager.py` (2192 líneas, `brain/core/`) — orquestador real de `create`/`hydrate`/`add_turn`/`finalize`/`get`/`freeze_to_mandate` para los 4 tipos activos
- `create.py` (CLI `brain intent create`) — valida `intent_type` en `["dev", "doc", "ing", "dis"]`
- `validation_manager.py` — legacy, solo conoce `.dev`/`.doc` (ni siquiera `ing`/`dis`)
- `bloom_project_inspector.py` — legacy, `get_intents_list()` solo escanea `.dev`/`.doc`
- `nucleus_manager.py`, `nucleus_inspector.py`, `create_exp_intent.py` (CLI) — capa Nucleus / `exp`
- `bloom_project_tree.txt`, `bloom_nucleus_tree.txt` — árboles de referencia (parcialmente aspiracionales, no 100% código-verificados)
- `BTIPS_Bloom_Technical_Intent_Package_v6_0.md` §6 — única fuente que da una descripción de una línea para los 5 tipos históricos, incluyendo `inf`
- `Mandate_Domain_Spec_v1_0_0.md` §2.1/§2.3 — lista el "Work Domain" real como `.exp`, `.cor`, `dev`, `doc` (**excluye `inf`** explícitamente)
- `ING_Intent_Spec_v1_1.md` §0 — trata a `inf` como "existente", contradiciendo la ausencia total de código
- `BLOOM_BISP_Session_Decisions_v1_1.md` — protocolo de vectorización, agnóstico de tipo
- `router_prompt.md` — **descartado como fuente**: es un prompt de Gemini para context-planning genérico, no específico de la gramática de intents (aclarado por el usuario)

---

## 3. `dev` — lo que existe y lo que falta

### Existe (código real, `intent_manager.py`)

- Directorios: `.briefing/`, `.briefing/.files/`, `.execution/`, `.execution/.files/`, `.refinement/`, más `.pipeline/` espejo de `.briefing/` y `.execution/` (`.refinement/` **no** tiene mirror explícito en `.pipeline/` en el código de `_create_directory_structure` — solo `.pipeline/.refinement` sin subcarpetas `.response/.staging`, a diferencia de `.briefing`/`.execution`. Verificar si es intencional).
- `.dev_state.json`:
  ```json
  {
    "status": "created",
    "name": "...", "type": "dev", "uuid": "...", "created_at": "...",
    "initial_files": [],
    "steps": {"create": true, "hydrate": false, "plan": false,
              "build": false, "submit": false, "merge": false}
  }
  ```
- `hydrate_intent()`: escribe `.briefing/.briefing.json` con key `instruction`.
- `add_turn()`: escribe `.refinement/.turn_N/.turn.json` con `{turn_id, actor, content, timestamp}` — **sin campo de commit**.
- `finalize_intent()`: marca `status = "completed"`, `steps["merge"] = true`. **No valida que haya turnos, ni que `.execution/` tenga respuesta.**

### Falta / gaps confirmados

1. **No hay ningún campo de "commit" en `.turn.json` de `.refinement/`.** El parámetro `close_phase` de `add_turn()` es aceptado por la firma pero **nunca se lee** en la rama `dev`/`doc` — es un no-op silencioso. Hay que decidir si se agrega un campo de cierre real, o si el modelo de `dev` es deliberadamente "turnos libres sin gate" (posible, pero debe ser una decisión explícita, no un olvido).
2. **`finalize_intent()` no tiene invariante de precondición.** Se puede finalizar un `dev` con `.refinement/` vacío. Si se migra a BSIP, esto cambia de comportamiento — usuarios que hoy dependen de finalizar sin refinamiento se romperían.
3. **Schema de identidad distinto** (`uuid`/`type` vs `intent_id`/`intent_type`) — cualquier migración a `intent_types.py` requiere decidir si se convive con esta divergencia (como hoy, vía `_uid()`/`_itype()`) o se normaliza.
4. **No hay spec formal `DEV_Intent_Spec_*.md`.** Solo existe como código + mención de una línea en BTIPS §6.

---

## 4. `doc` — lo que existe y lo que falta

### Existe (código real)

- Directorios: `.context/`, `.context/.files/`, `.curation/`, más `.pipeline/.context/` (con `.response/.staging`) y `.pipeline/.curation/` (sin subcarpetas — mismo patrón asimétrico que `.refinement/` en `dev`).
- `.doc_state.json`:
  ```json
  {
    "status": "created",
    "name": "...", "type": "doc", "uuid": "...", "created_at": "...",
    "initial_files": [],
    "steps": {"create": true, "hydrate": false, "curate": false, "publish": false}
  }
  ```
- `hydrate_intent()`: escribe `.context/.context.json`.
- `add_turn()`: escribe `.curation/.turn_N/.turn.json` — mismo patrón que `dev`, sin commit.
- `finalize_intent()`: marca `steps["publish"] = true`. Mismo problema de falta de invariante que `dev`.

### Falta / gaps confirmados

1. Mismos tres primeros puntos de `dev` (§3.1-3.3), aplicados a `.curation/`.
2. **BTIPS §6 dice que `doc` corre "en Projects y en Nucleus"** — el código revisado (`intent_manager.py`, `_create_directory_structure`) solo cubre el caso Project. No hay evidencia de código de `doc` a nivel Nucleus. Si es un requisito real, está sin implementar; si ya no aplica, la spec BTIPS quedó desactualizada. **PENDIENTE de confirmar cuál de las dos.**
3. No hay spec formal `DOC_Intent_Spec_*.md`.

---

## 5. `exp` — bug conocido, no gap de diseño

- Estructura de directorios y CLI (`create_exp_intent.py`) existen y están bien formados: flujo `Inquiry → Discovery (con turnos) → Findings`.
- `NucleusManager.create()` scaffoldea `.intents/.exp/` correctamente al crear un Nucleus.
- **El método `NucleusManager.create_exp_intent()`, invocado por el CLI, no existe en el archivo revisado** (`nucleus_manager.py`, 855 líneas). Esto es un bug de código o un archivo desactualizado — no un gap de diseño ni de documentación. **Acción recomendada cuando se retome:** confirmar si existe una versión más reciente de `nucleus_manager.py` en el repo real antes de asumir que hay que escribir el método desde cero.
- `exp` no pasa por `intent_types.py`/`IntentStateManager` — corre con su propia lógica. No estaba en el alcance de esta sesión decidir si conviene migrarlo también; queda anotado para una futura conversación, con el mismo criterio de prudencia que se aplicó a `dev`/`doc`.

---

## 6. `cor` — sin implementación

- No existe en `nucleus_manager.py`, `nucleus_inspector.py`, `intent_manager.py`, `create.py`, ni en el `features{}` de `nucleus-config.json` (que solo declara `explorationIntents`).
- Única evidencia: un árbol de directorios en `bloom_nucleus_tree.txt` con 6 fases (`freeze_snapshot → structural_analysis → semantic_interpretation → dual_path_synthesis → proposal_assembly → governed_submission`), **ninguna con `.turn_X/`** — patrón estructural distinto a todo lo demás (ni turnos tipo `ing`/`dis`, ni checklist tipo `dev`/`doc`).
- **PENDIENTE, sin resolver:** qué gobierna el avance entre esas 6 fases si ninguna tiene noción de commit visible. No se infiere ni se inventa acá.
- BTIPS §6 lo describe en una línea: "coordina y gobierna acciones humanas y sistémicas... como autoridad" — insuficiente para derivar una gramática de estado.

---

## 7. `inf` — el gap más profundo, posible tipo no vigente

- **Cero código.** Cero estructura de directorios en cualquier árbol (ni `bloom_project_tree.txt`, ni `bloom_nucleus_tree.txt`).
- `Mandate_Domain_Spec_v1_0_0.md` (§2.1, §2.3) — el documento más orientado a "estado real del sistema, sin supuestos" — **excluye explícitamente `inf`** de la lista de tipos del Work Domain (`.exp`, `.cor`, `dev`, `doc`), aun siendo un documento posterior a la versión de BTIPS que sí lo lista.
- `intent_types.py` e `ING_Intent_Spec_v1_1.md` sí lo mencionan como "existente", pero solo repitiendo la enumeración de BTIPS — ninguno de los dos aporta código ni estructura propia.
- **Hipótesis a confirmar en una futura sesión, no asumida como cierta acá:** que `inf` haya quedado conceptualmente absorbido por la fase `.inquiry/` de `exp` o `.reception/` de `ing` (ambas descritas como "recopilar información/archivos sin transformar decisiones", similar a la definición de una línea que da BTIPS para `inf`). No hay evidencia directa de esto — es una pregunta abierta, no una conclusión.

---

## 8. Checklist para cuando se implemente `dev`/`doc` sobre el motor BSIP

Si en el futuro se decide migrar (no decidido en esta sesión), esto es lo que hay que resolver explícitamente antes de tocar código:

- [ ] ¿Qué campo marca el cierre de `.refinement/`/`.curation/`? ¿Se agrega `committed` a `.turn.json`, o se define otro mecanismo?
- [ ] ¿`finalize_intent()` pasa a exigir una precondición de fase terminal, rompiendo el comportamiento actual (finalizar sin turnos)? ¿Se necesita una migración de intents `dev`/`doc` ya existentes en filesystem?
- [ ] ¿Se normaliza el schema de identidad (`uuid`/`type` → `intent_id`/`intent_type`), o se mantiene el puente de `_uid()`/`_itype()` permanentemente?
- [ ] Confirmar si `.refinement/` y `.curation/` deberían tener mirror completo en `.pipeline/` (con `.response/.staging`) como sí tienen `.briefing`/`.execution`/`.context` — hoy no lo tienen, y no está claro si es a propósito.
- [ ] Confirmar si `doc` corre realmente a nivel Nucleus (BTIPS lo dice, el código no lo muestra).
- [ ] Escribir `DEV_Intent_Spec_*.md` / `DOC_Intent_Spec_*.md` formales — hoy no existen, y el patrón del proyecto exige spec antes que registro en `intent_types.py`.

---

*BLOOM — Intent Types Gap Analysis · v1.0 · Agosto 2026 · Documento de diagnóstico, sin cambios de código aplicados.*
