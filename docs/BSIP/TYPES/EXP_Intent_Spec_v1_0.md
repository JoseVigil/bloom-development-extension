# EXP — Especificación Técnica del Intent de Exploración

**Versión:** 1.0
**Estado:** Borrador de contrato — documenta comportamiento real donde existe evidencia de código, y marca como
**PENDIENTE** todo punto de diseño no decidido. No es un rediseño aspiracional ni una propuesta de integración
con ningún Mandate.
**Depende de:** `BTIPS_Bloom_Technical_Intent_Package_v6_0.md` §4 y §6 (definición de una línea, nivel de
ejecución en Nucleus, rol dentro de la jerarquía Mandate→Action→Intent), `BLOOM_Intent_Types_Gap_Analysis_v1_0.md`
§2 y §5 (única fuente con evidencia de código real para `exp`), `intent_types.py` (motor `IntentTypeSpec` /
`INTENT_TYPE_REGISTRY`, mecanismo de extensión al que este documento no resuelve si `exp` debe incorporarse),
`ING_Intent_Spec_v1_1.md` / `DIS_Intent_Spec_v1_0.md` (referencia de formato de spec y contraste con el motor
BSIP genérico que `exp` **no** usa hoy)

---

## Nota de naturaleza de este documento

`exp` no encaja en ninguna de las dos categorías que sí tienen precedente en el ecosistema. No es "legacy
hand-rolled" como `dev`/`doc` (no usa el modelo `status` string + `steps{}` boolean checklist de
`intent_manager.py` — de hecho no aparece una sola vez en ese archivo). Tampoco está gobernado por
`IntentStateManager`/`intent_types.py` como `ing`/`dis` (el `INTENT_TYPE_REGISTRY` de `intent_types.py`
solo contiene `IntentType.ING` e `IntentType.DIS`; `exp` no tiene entrada). Corre con un **motor propio,
ad-hoc**, implementado en `nucleus_manager.py`/`nucleus_inspector.py`, separado de `intent_manager.py`.

Además, `exp` tiene un **bug de código confirmado, no un gap de diseño**: el CLI (`create_exp_intent.py`)
invoca `NucleusManager.create_exp_intent()`, método que no existe en el archivo de 855 líneas revisado
(`BLOOM_Intent_Types_Gap_Analysis_v1_0.md` §5). Este documento no asume ni una implementación ni un archivo
desactualizado — queda como GAP abierto, igual que lo dejó el Gap Analysis.

**Alcance estricto de este documento:** el contrato y protocolo del *intent type* `exp` en sí mismo — sus
fases, su motor, su estado de implementación. **Fuera de alcance, deliberadamente:**

- Cualquier rol que `exp` pueda cumplir dentro del Action Graph de un Mandate concreto (incluido, pero no
  limitado a, Mandate Genesis).
- Cualquier noción de `exp` como gate obligatorio de entrada o salida hacia `dev`, o como paso de
  re-evaluación posterior a `dev`.
- Los términos `exp-evaluation` / `exp-reevaluation` — son etiquetas de Action propuestas para un Mandate
  específico, no vocabulario del intent type, y no aparecen en este documento por esa razón.

Esa capa de orquestación, si se decide, es responsabilidad exclusiva del Action Graph del Mandate que
instancia el intent — nunca una propiedad canónica de `exp` (ver §7 para la única mención permitida, a
título de ejemplo abstracto).

---

## 0. Resumen ejecutivo

`exp` es el intent de **exploración**: reduce incertidumbre investigando alternativas, hipótesis o escenarios
antes de tomar una decisión informada (`BTIPS §6`). Tres fases confirmadas por scaffold de código real:

```
Inquiry → Discovery (con turnos) → Findings
```

`NucleusManager.create()` scaffoldea `.intents/.exp/` correctamente al crear un Nucleus — la estructura de
directorios y el CLI existen y están bien formados. Pero el intent está **roto en el punto de creación de
instancia**: el método que el CLI necesita invocar no existe en el código revisado. No corre sobre
`IntentStateManager` ni sobre el motor legacy de `dev`/`doc`; es un tercer motor, propio, sin formalizar.

No cristaliza a Mandate (no hay evidencia de `freeze_to_mandate()` para `exp` en ningún archivo revisado).
Nivel de ejecución declarado como "principalmente Nucleus" (BTIPS §6), con mención sin resolver de una
variante "`exp` local" a nivel Project (BTIPS §5) — ver §4, PENDIENTE.

---

## 1. Motor de ejecución

`exp` no usa ninguno de los dos motores existentes en el runtime:

| Motor | ¿Lo usa `exp`? | Evidencia |
|---|---|---|
| Legacy hand-rolled (`status` string + `steps{}` boolean, `intent_manager.py`) | No | `exp` no aparece en `intent_manager.py`; ese archivo orquesta `create`/`hydrate`/`add_turn`/`finalize`/`get`/`freeze_to_mandate` únicamente para los 4 tipos activos ahí (`dev`, `doc`, `ing`, `dis` — confirmado también por `create.py`, que valida `intent_type` contra esa lista de 4). |
| BSIP genérico (`IntentTypeSpec` + `IntentStateManager`, `intent_types.py`) | No | `INTENT_TYPE_REGISTRY` solo declara `IntentType.ING` e `IntentType.DIS`. `get_intent_type_spec()` levantaría `ValueError` si se le pasara `"exp"` — el propio mensaje de error del código lista `exp` entre los tipos "no soportados todavía". |
| Ad-hoc propio (`nucleus_manager.py` / `nucleus_inspector.py`) | Sí | Única vía confirmada. Separado por completo de `intent_manager.py`. |

**PENDIENTE (decisión de diseño, no resuelta en esta versión):** si `exp` debería migrar a `IntentTypeSpec`
agregando una entrada `_EXP_SPEC` al `INTENT_TYPE_REGISTRY` — el propio `intent_types.py` deja explícito que
el mecanismo de extensión existe y es trivial de usar ("agregar una entrada acá, cero cambios en
`intent_state_manager.py`"), pero también deja explícito que incorporar un tipo nuevo está "fuera de
alcance hasta que haya un mandato explícito para hacerlo". El Gap Analysis (§5) confirma que esta decisión
"no estaba en el alcance de esa sesión" y queda anotada para una futura conversación. Este documento no la
toma tampoco.

---

## 2. Fases

### 2.1 `Inquiry`

Fase de apertura. Existe como scaffold de directorio confirmado (`NucleusManager.create()` lo crea al
inicializar el Nucleus). No hay evidencia de código revisado que documente:

- si tiene turnos (`.turn_X/`) o es un acto único (como `.reception/` de `ing` o `.discovery/` de `dis`);
- estructura interna de archivos (equivalente a `.reception/.raw/` de `ing`);
- contenido de un eventual `.inquiry.json`.

**GAP:** sin evidencia de código para el detalle interno de esta fase más allá de su existencia como
directorio. No se infiere ni se completa acá.

### 2.2 `Discovery`

Confirmada explícitamente como fase **con turnos** (`BLOOM_Intent_Types_Gap_Analysis_v1_0.md §5`: "flujo
Inquiry → Discovery (con turnos) → Findings"). Análogo funcional, a nivel de patrón, a `.refinement/` de
`dev` o `.curation/` de `doc` — una negociación turno a turno.

No hay evidencia de:

- si el `.turn.json` de `Discovery` tiene campo de commit (como `committed` en `.consolidation/` de `ing` o
  `.ratification/` de `dis`) o si sigue el patrón "turnos libres sin gate" que el Gap Analysis identificó
  como característico de `dev`/`doc` (§3.1);
- el actor y contenido exacto de cada turno.

**GAP:** mecanismo de cierre de `Discovery` no confirmado. No se asume ninguno de los dos patrones
existentes en el ecosistema (BSIP con `commit_field`, o legacy sin gate) — queda como PENDIENTE de
verificación contra código real de `nucleus_manager.py`/`nucleus_inspector.py`.

### 2.3 `Findings`

Fase de cierre. El nombre coincide con el concepto de "findings exploratorios" que BTIPS ubica como tipo de
conocimiento propio de Nucleus (§4), y con los campos genéricos de la capa autárquica de BISP
(`findings_summary`, `domain_tags`, `resolved`, `reusable_knowledge` — `BLOOM_BISP_Fuente_de_Verdad_v1_0.md`),
que aplican a cualquier intent, no son exclusivos de `exp`.

No hay evidencia de:

- si `Findings` es un acto único (como `Discovery`/`Inquiry` podrían serlo) o si también itera en turnos;
- si produce un artefacto propio (`.findings.json`) distinto del `findings_summary` genérico de BISP, o si
  simplemente alimenta ese campo genérico sin estructura adicional.

**GAP:** estructura de salida de `Findings` no confirmada en código revisado.

---

## 3. Estado de la instancia (`.exp_state.json` u equivalente)

No hay evidencia de código revisado que muestre el contenido de un archivo de estado análogo a
`.ing_state.json` / `.dis_state.json` / `.dev_state.json` / `.doc_state.json`. El Gap Analysis no reporta
haber encontrado ni un `.exp_state.json`, ni un envelope común, ni el nombre de archivo que usaría.

**PENDIENTE:** este documento no propone un schema para no incurrir en el mismo error que motivó esta
sesión — inventar contrato donde no hay evidencia. Cualquier `EXP_Intent_Spec` posterior a v1.0 debe
completar esta sección únicamente tras inspeccionar el código real de `nucleus_manager.py` /
`nucleus_inspector.py` (los 855+ líneas mencionados en el Gap Analysis), no por analogía con `ing`/`dis`.

---

## 4. Nivel de ejecución — Nucleus vs. Project local

BTIPS da dos afirmaciones que no se concilian entre sí en ningún documento ni código revisado:

- §6: `exp` "se ejecuta **principalmente en Nucleus**, dentro de `.bloom/.intents/.exp/`".
- §5: un Project "puede... ejecutar `exp` **local**".

El Gap Analysis confirma el nivel Nucleus con evidencia de código (`NucleusManager.create()` scaffoldea
`.intents/.exp/` al crear un Nucleus) pero no reporta ninguna evidencia — ni scaffold, ni CLI, ni mención en
`intent_manager.py` — de una variante de `exp` a nivel Project.

**PENDIENTE, sin resolver:** si "`exp` local" es:

1. el mismo motor ad-hoc de Nucleus, simplemente invocado con un scope acotado a un Project, o
2. una segunda implementación no relevada en los archivos consultados hasta ahora, o
3. una imprecisión de BTIPS §5 que no refleja el estado real del código (mismo patrón de discrepancia que el
   Gap Analysis ya encontró para `doc` a nivel Nucleus, §4.2 — no confirmado en código pese a estar en
   BTIPS).

Este documento no elige entre las tres. Se deja como pregunta abierta para una futura sesión de
investigación de código, con el mismo criterio de prudencia aplicado al resto del Gap Analysis.

---

## 5. Mandate — cristalización

No hay evidencia de `freeze_to_mandate()` (u operación equivalente) implementada para `exp` en ningún
archivo revisado. A diferencia de `dev`, donde el Gap Analysis confirma explícitamente que
`freeze_to_mandate()` levanta `ValueError` para ese tipo, no se reporta evidencia directa análoga para
`exp` — ni de que la operación exista y funcione, ni de que exista y falle explícitamente.

**GAP:** estado de cristalización a Mandate no confirmado. No se asume ninguna de las dos posibilidades.

---

## 6. Gap de código confirmado — `NucleusManager.create_exp_intent()`

Este es el único punto de este documento clasificado explícitamente como **bug**, no como decisión de
diseño pendiente:

> "El método `NucleusManager.create_exp_intent()`, invocado por el CLI, no existe en el archivo revisado
> (`nucleus_manager.py`, 855 líneas). Esto es un bug de código o un archivo desactualizado — no un gap de
> diseño ni de documentación."
> — `BLOOM_Intent_Types_Gap_Analysis_v1_0.md §5`

**Acción recomendada, heredada sin cambios del Gap Analysis:** antes de asumir que hay que escribir el
método desde cero, confirmar si existe una versión más reciente de `nucleus_manager.py` en el repositorio
real. Este spec no resuelve el bug; lo hereda como bloqueante para cualquier instanciación real de `exp`
hasta que se confirme cuál de las dos situaciones aplica.

---

## 7. Ejemplo de uso bajo un Mandate (abstracto, no canónico)

BTIPS §7 establece el mecanismo general: un Mandate se descompone en Actions, y cada Action se materializa
en un intent concreto (`exp`, `cor`, `dev`, `doc`) que Nucleus instancia y ejecuta. Bajo ese mecanismo
genérico, un Mandate *podría* usar una instancia de `exp` para investigar una alternativa técnica antes de
decidir si dispara un `dev` — el ejemplo que da el propio BTIPS es "explorar módulos sin uso (`exp`) →
eliminar los identificados (`dev`) → actualizar la documentación (`doc`)".

**Aclaración explícita y obligatoria de este documento:** ese uso, su posición en la secuencia, y cualquier
rol de "puerta de entrada" o "condición de cierre" que un Mandate específico le asigne a una instancia de
`exp`, es una decisión del **Action Graph de ese Mandate** — nunca una regla canónica del intent type `exp`.
Este spec no fija, sugiere, ni valida ningún patrón de uso recurrente (evaluación pre-`dev`, re-evaluación
post-`dev`, o cualquier otro) como parte del contrato de `exp`. Cualquier Mandate que necesite ese
comportamiento debe declararlo y documentarlo en su propia especificación de Action Graph, no heredarlo de
este documento.

---

## 8. Checklist de pendientes de diseño

Ningún ítem de esta lista se resuelve en este documento. Se deja registrado para que la próxima sesión de
trabajo sobre `exp` no tenga que re-descubrirlo — mismo criterio que usa el Gap Analysis para `dev`/`doc`
(§8).

- [ ] Confirmar si existe una versión más reciente de `nucleus_manager.py` con `create_exp_intent()`
      implementado, antes de asumir que el método debe escribirse desde cero (§6).
- [ ] Verificar en código real (`nucleus_manager.py` / `nucleus_inspector.py`) el mecanismo de cierre de la
      fase `Discovery`: ¿`commit_field` explícito (patrón BSIP) o turnos libres sin gate (patrón legacy)? (§2.2)
- [ ] Verificar la estructura interna de `Inquiry` (¿acto único o con turnos?) y de `Findings` (¿acto único,
      con turnos, o produce un artefacto propio además del `findings_summary` genérico de BISP?) (§2.1, §2.3)
- [ ] Documentar el schema real de `.exp_state.json` (o el nombre real del archivo de estado, si es
      distinto) — solo tras inspección directa de código, no por analogía con `ing`/`dis` (§3).
- [ ] Resolver la dualidad Nucleus vs. "`exp` local" a nivel Project: ¿mismo motor con scope acotado, segunda
      implementación no relevada, o imprecisión de BTIPS §5? (§4)
- [ ] Confirmar si `exp` cristaliza a Mandate (`freeze_to_mandate()`) o si, como `dev`, tiene ese camino
      explícitamente bloqueado (§5).
- [ ] Decidir — en una sesión separada, con mandato explícito — si `exp` se incorpora al
      `INTENT_TYPE_REGISTRY` de `intent_types.py` (agregando `_EXP_SPEC`) o se mantiene como motor ad-hoc
      permanente (§1).
- [ ] Cualquier decisión sobre el rol de `exp` dentro del Action Graph de Mandate Genesis (o de cualquier
      otro Mandate) se documenta en la especificación de ese Mandate, no en este archivo (§7).

---

*EXP_Intent_Spec_v1_0.md — contrato del intent type, aislado de lógica de Mandate. Fuente primaria de
evidencia: `BLOOM_Intent_Types_Gap_Analysis_v1_0.md §2/§5`. Ningún GAP ni PENDIENTE de este documento se
resuelve por inferencia o analogía con `ing`/`dis`/`dev`/`doc` — solo por inspección directa de código real.*
