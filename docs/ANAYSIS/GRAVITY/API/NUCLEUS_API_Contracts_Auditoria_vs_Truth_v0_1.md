# Auditoría del catálogo de API de Nucleus contra la fuente de verdad (`bloom_nucleus_truth.txt` / `bloom_project_truth.txt`)

**Objeto de esta auditoría:** `NUCLEUS_API_Contracts_Consolidado_v0_1.md` (el catálogo de DTOs consolidado a partir de `BTIPS_Mandates_Agenticos_Spec_Unificada.md`, `BLOOM_Mandate_Universal_Schema_v1_2_0.md`, `Orbital_Gravity_Implementation_Spec_v0_1.md` y `COR_Intent_Spec_v1_0.md`).
**Contra qué se audita:** `tree/bloom/truth/bloom_nucleus_truth.txt` y `tree/bloom/truth/bloom_project_truth.txt` — declarados por vos como fuente de verdad, resultado homologado de la primera iteración real de Mandate Genesis en desarrollo, con devoluciones read-only de MANDATE GENESIS, AUTHORIZATION y Brain.
**Fecha:** 2026-08-28

**Método:** no re-litigé si el catálogo refleja bien los 4 documentos de origen (eso ya se auditó al construirlo). Acá reviso una pregunta distinta y más dura: **de lo que el catálogo describe, ¿qué tiene hoy un correlato real en el sistema, y qué convive en el mismo espacio de nombres con algo real pero distinto?** La leyenda de los dos truth (`[IMPLEMENTADO]`, `[DECIDIDO — NO IMPLEMENTADO]`, `[HISTÓRICO/NO VERIFICADO]`, `[DESALINEACIÓN]`) es la que uso para calificar cada hallazgo.

---

## Resumen ejecutivo

El catálogo no contiene errores de transcripción contra sus 4 fuentes — sigue siendo fiel a lo que esos documentos dicen. El problema que encontré es otro, y es el que vos sospechabas: **el catálogo describe con el mismo nivel de confianza cosas que hoy tienen persistencia real y cosas que no existen en absoluto en el sistema**, y en al menos dos puntos usa un nombre (`mandate_state.json`, "grafo") que ya está ocupado en la implementación real por algo estructuralmente distinto. Encontré 3 hallazgos mayores y 2 menores, más un punto que dejo abierto para que lo confirmes vos en vez de asumirlo.

---

## Reencuadre conceptual — Gravity no es un motor de reglas de sistema, es criterio/experiencia

Corrección de encuadre indicada explícitamente para todo análisis futuro, no un hallazgo derivado de los truth: lo que `gravityPostures[]` describe **no debe pensarse ni nombrarse como una regla de sistema** al estilo `capability_seam`/`scope_paths` (que sí son restricciones duras, verificadas estructuralmente por Nucleus contra el diff real). Es **postura** — criterio acumulado, experiencia de desarrollador — y el acto de declararla es **postular**, no "declarar una regla".

Esta distinción no es sólo terminológica; ya tiene un asidero real en el propio diseño de `GRAVITY v0.1`/`MANDATE v1.2.0`, que este documento no había resaltado con suficiente fuerza: el campo `verifiable: true | false` de cada `gravityPosture` (`MANDATE v1.2.0 §5`, ejemplo `grv_2b91` con `"verifiable": false`) ya separa dos casos con tratamiento distinto —

- `verifiable: true` — se acerca a lo que en sistemas sería una regla: puede aplicarse automáticamente (`GRAVITY v0.1 §3.3`, punto 1) y disparar un rechazo estructurado (`GRAVITY_THRESHOLD_BREACHED`).
- `verifiable: false` — es exactamente la **posture**: criterio que se inyecta como contexto para informar el juicio del agente o del humano, sin mecanismo de enforcement automático.

Tratar todo `gravityPostures[]` como si fuera enteramente de la primera clase —como hizo, sin decirlo, el catálogo original al describir `resolve_active_gravity` junto al mismo lenguaje de rechazo estructurado que usa `capability_seam`— es precisamente el error de encuadre que hay que dejar de cometer. Cuando se retome el diseño de Gravity, vale la pena preguntar explícitamente, posture por posture: ¿esto es criterio (`verifiable: false`, informa el juicio) o es una restricción dura que de verdad amerita bloquear la firma de un intent (`verifiable: true`)? Son dos mecanismos distintos que hoy comparten un único campo y un único vocabulario, y esa mezcla es la que motivó, con razón, el pedido de dejar de llamarlo "regla".

---

## Hallazgo mayor #1 — "el grafo" son en realidad tres cosas distintas, sin relación declarada entre ellas

Ninguno de los 4 documentos de origen del catálogo cruza esto explícitamente, y el catálogo lo heredó sin señalarlo. Hoy conviven, bajo vocabulario parecido ("grafo", "topología", "árbol"), tres estructuras que no tienen relación de diseño entre sí:

| | Grafo de Dominios/Genes (Mandate Genesis) | Grafo de Gravity (Orbital) | Árbol de delegación de sub-Mandates |
|---|---|---|---|
| **Qué modela** | La topología semántica del código: qué Dominios y Genes existen, y cómo se relacionan | Criterio de gobierno heredado en 5 niveles: Nucleus→Organización→Proyecto→Mandate→Sesión | Jerarquía padre/hijo de Mandates delegados (`max_depth: 2`) |
| **Persistencia real hoy** | `.cache/.semantic-index.json` a nivel Nucleus — **[IMPLEMENTADO vacío]**, "efectos DIS no conectados por Genesis"; copias locales por intent `dis`: `.domain_graph_snapshot.json` / `.domain_graph_delta.json` — **[IMPLEMENTADO por Brain]**, wiring de Genesis **pendiente** | **No aparece en ningún lugar de ninguno de los dos truth.** Ni como directorio placeholder, ni como campo de `mandate_state.json`, ni mencionado en las notas de alcance | **No aparece en ningún lugar de ninguno de los dos truth** |
| **Quién lo produce** | Intents `ing`/`dis`, ejecutados por Brain | Nadie — es diseño, no código | Nadie — es diseño, no código |
| **Cita en truth** | `bloom_nucleus_truth.txt` líneas 240-247 (`.cache/`); `bloom_project_truth.txt` líneas 189-213 (`.discovery/`, `.mapping/`, `.ratification/`) | — (ausencia confirmada por lectura completa de ambos archivos) | — (ausencia confirmada) |

**Por qué esto importa para el catálogo:** el bloque 3 de mi catálogo (`resolve_active_gravity`) y el bloque 4 (`ArbitrationEvent`) describen operaciones sobre "el grafo" de Gravity como si fuera una extensión natural de algo que el sistema ya sabe hacer con grafos. No lo es. El único grafo con persistencia real hoy es el de Dominios/Genes, y está vacío/desconectado incluso ahí (`efectos DIS no conectados por Genesis`). Cuando alguien en tu equipo lea "el grafo" en la documentación de Gravity, no hay ninguna garantía de que entienda que se trata de una estructura de datos completamente nueva y sin relación con `.semantic-index.json` — que es, hoy, el único "grafo" que existe de verdad en Nucleus.

**Recomendación:** antes de implementar nada del catálogo de Gravity, nombrar la estructura de forma que no comparta vocabulario con el grafo de Dominios/Genes (`GravityNode`/`GravityGraph` ya evita colisión de nombre de tipo, pero la prosa de los 4 documentos y de mi catálogo dice "el grafo" a secas en varios lugares — vale la pena una pasada de terminología).

---

## Hallazgo mayor #2 — resolución: `mandate_state.json` real y Orbital Agentic State son artefactos separados

Esto es el hallazgo más concreto y más urgente de resolver antes de tomar cualquier decisión de implementación.

**Lo que existe hoy, `[IMPLEMENTADO]`, según `bloom_nucleus_truth.txt` líneas 219-224:**
```
mandate_state.json
├── stateVersion       ← monotónica por mutación efectiva
├── updatedAt          ← misma sustitución atómica
├── signature          ← not_ready | pending | signed | failed
│   └── intentId | artifacts | timestamps | failure
└── reconciliation     ← diagnóstico watcher; Temporal indisponible = unknown
```

**Lo que mi catálogo (§2.5) describía como registro de turno agéntico**, citando `BTIPS §8.5`, queda denominado `orbital_agentic_state.json` (Orbital Agentic State):
```jsonc
{
  "mandate_id": "mnd_8f2a1c",
  "status": "running",
  "turn_count": 8,
  "turns": [ /* ...cada turno con intent_draft, nucleus_decision, reason_code, result... */ ],
  "budget_consumed": { "turns": 8, "dev_intents": 3, "tokens": 131900 }
}
```

**No hay ningún campo en común entre las dos estructuras.** No hay `turns[]`, ni `turn_count`, ni `budget_consumed`, ni `status: running` en el `mandate_state.json` real — y no hay `signature`, ni `reconciliation`, ni `stateVersion` en el Orbital Agentic State. La resolución aprobada elimina la colisión mediante dos artefactos independientes:

- El **real** es el estado de un Mandate **declarativo** tal como lo produce hoy el único flujo que existe (`MandateGenesisBuildWorkflow` — nombrado explícitamente en la nota `[DESALINEACIÓN]` del propio truth) — está orientado a rastrear **la firma** (`signature.status`), no la ejecución turno a turno.
- `orbital_agentic_state.json` es el contrato documental de `BTIPS §8.5` para el modo `agentic`, que **todavía no tiene ninguna implementación** — ni siquiera el intent `tst` que lo cerraría existe como directorio en ningún truth (ver Hallazgo #4).

Mi catálogo ya distinguía, en su §2.5, "decisión síncrona" vs. "registro de turno persistido", pero asumía incorrectamente que el registro agéntico era una variante del objeto real. La resolución final fija que no lo es: `mandate_state.json` conserva el estado operacional real de Nucleus y `orbital_agentic_state.json` conserva, como contrato documental separado, la ejecución turno a turno del modo agéntico. Se correlacionan por `mandate_id`; no comparten archivo, schema ni ciclo de vida.

**Resolución final aprobada:** se descarta extender el `mandate_state.json` real. Cuando se implemente `execution_mode: "agentic"`, `turns[]`, `budget_consumed` y `gravity_context_injected` pertenecerán a `orbital_agentic_state.json`. El archivo operacional real conserva `signature`, `reconciliation` y `stateVersion` para sus consumidores actuales (`MandateGenesisBuildWorkflow` y el watcher de reconciliación).

---

## Hallazgo mayor #3 — el rol "Architect", que Gravity v0.1 usa para firmar el nivel PROJECT, no existe en el modelo de autorización vigente

`Orbital_Gravity_Implementation_Spec_v0_1.md §1.3` (tabla "Quién firma cada nodo"), fila `PROJECT`:

> *"Humano con autoridad de proyecto (Architect/Master, según roles ya definidos en BTIPS)"*

Mi catálogo tomó esta tabla sin cuestionarla (no formaba parte del alcance original — no era uno de los 5 bloques pedidos), pero es una premisa que **la propia fuente de verdad contradice explícitamente**:

`bloom_nucleus_truth.txt`, línea 20-23:
> *"`.master` — [IMPLEMENTADO] marcador RoleMaster; `.specialist` — [IMPLEMENTADO] marcador RoleSpecialist; ausencia/no reconocido = RoleUnknown (fail-closed). **Architect y Grant no existen en el modelo vigente.**"*

Esto no es un hallazgo aislado mío — ya está registrado como contradicción abierta en tu propia `CONTROL/AGENDA_MAESTRA.md` (que leí en la tarea anterior, sección 9 AUTHORIZATION): *"`.nucleus-governance.json` declara `min_role_for_cor_merge: Architect`, en contradicción con ownership v0.3, `MRG_Intent_Spec` y el código actual; se registra para resolverlo, sin incorporarlo al fix urgente."*

**Consecuencia directa para el catálogo:** el mecanismo de firma del nivel `PROJECT` en el modelo de Gravity (§1 de `GRAVITY v0.1`, y por extensión §3 de mi catálogo) no tiene, hoy, ninguna autoridad real a la cual delegarse — el rol que la spec asume ya definido (`Architect`) es exactamente el mismo rol que tu sistema de autorización real dice que **no existe**. Cualquier implementación de la firma de nodo `PROJECT` en Gravity va a tener que resolver primero esta brecha (¿se firma con `Master` solamente, hasta que `AUTH-OWNERSHIP-01` cierre el modelo de roles? ¿se bloquea Gravity a nivel `PROJECT` hasta entonces?) — no es una decisión que la documentación de Gravity pueda tomar por su cuenta, porque depende de un work item de Authorization que ya está identificado y pendiente en tu propia agenda.

---

## Hallazgo menor #4 — `mrg` y `tst` no tienen ningún scaffold, ni siquiera placeholder, en ninguno de los dos truth

Confirmación, no contradicción — pero vale la pena decirlo con más fuerza de la que tenía mi catálogo original. Comparando qué directorios de intent existen hoy bajo `.intents/` en cada truth:

| Intent | Nucleus truth | Project truth |
|---|---|---|
| `exp` | **[IMPLEMENTADO]** sólo la raíz; interior [DECIDIDO — NO IMPLEMENTADO] | no aparece |
| `ing` | **[IMPLEMENTADO]**, conectado por Genesis | **[IMPLEMENTADO]** por Brain |
| `dis` | **[IMPLEMENTADO]** por Brain; wiring Genesis pendiente | **[IMPLEMENTADO]** por Brain; wiring Genesis pendiente |
| `dev` | no aparece | **[HISTÓRICO/NO VERIFICADO]** |
| `doc` | no aparece | **[HISTÓRICO/NO VERIFICADO]** |
| `cor` | **[HISTÓRICO/NO VERIFICADO]**, semántica vieja (v6.0), "no creado por scaffold actual" | no aplica (nunca fue project-level) |
| `mrg` | **no aparece en absoluto** — ni implementado, ni decidido, ni histórico | **no aparece en absoluto** |
| `tst` | **no aparece en absoluto** | **no aparece en absoluto** |

`mrg` y `tst` son, literalmente, los dos únicos tipos de intent de toda la taxonomía que no tienen ni una mención en ninguno de los dos árboles de verdad — ni siquiera como directorio vacío marcado `[DECIDIDO — NO IMPLEMENTADO]` (que es lo que sí tiene, por ejemplo, `.exp/`). Esto confirma con más precisión de la que yo tenía disponible al escribir el catálogo que **todo** el bloque 1 de mi catálogo referido a las variantes `mrg`/`tst` de `IntentDraft`, y **todo** el mecanismo de reclasificación estructural `dev`/`mrg` de `BTIPS §8.2.1`, describen una superficie sin ningún correlato en el sistema real — ni siquiera un placeholder reservado.

---

## Hallazgo menor #5 — `.cor/` en el truth es el árbol legado de la semántica vieja (v6.0), no la redefinición nueva — confirma que los GAP #C1/#C2 de `COR_Intent_Spec` siguen abiertos

`bloom_nucleus_truth.txt` líneas 114-215 documentan un árbol `.cor/` completo — `.freeze_snapshot/`, `.structural_analysis/`, `.semantic_interpretation/`, `.dual_path_synthesis/`, `.proposal_assembly/`, `.governed_submission/` — marcado **`[HISTÓRICO/NO VERIFICADO]; no creado por scaffold actual`**. Esa estructura es, sin ambigüedad, el pipeline de "merge cognitivo" de la vieja semántica `cor` v6.0 (*Coordination*) — no la redefinición de `COR_Intent_Spec_v1_0.md` como Core/Governance que consolidé en el catálogo.

Esto **no contradice** el catálogo — es una confirmación útil: `COR_Intent_Spec §1` ya admitía GAP #C1 (mecanismo de persistencia de `CorNucleusRecord` no fijado) y GAP #C2 (espacio de nombres de artefactos de `cor` en filesystem no definido). El truth confirma que, en efecto, no existe ningún `.cor_state.json` nuevo ni ningún registro equivalente a `CorNucleusRecord` en el sistema real — los dos GAP siguen exactamente donde estaban. Lo único que agrega el truth es la certeza de que el directorio legado sigue documentado (aunque desactivado) y que nadie lo reemplazó todavía por la estructura nueva.

---

## Confirmación positiva — `freeze_to_mandate()` es real y consistente con lo que dice `COR_Intent_Spec`

`bloom_project_truth.txt` línea 277: `mandate.json` bajo `.mandates/{mandate_id}/` a nivel Project es *"salida local de `freeze_to_mandate()`"* — **[PENDIENTE] fallback local de Brain, NO MandatesRoot canónico**. Esto confirma que `freeze_to_mandate()` es una función real del sistema, tal como la mencionaba `COR_Intent_Spec_v1_0.md §5`, fila "`freeze_to_mandate()`": *"No aplica [para `cor`] — [...] mismo motivo estructural que `dev/`/`doc/` (`ValueError` explícito)."* No hay inconsistencia acá — al contrario, es el único punto donde pude cruzar una afirmación de uno de los 4 documentos contra un nombre de función que aparece también en el truth, y coinciden.

---

## Punto que dejo abierto para que lo confirmes vos, no lo asumo

`.doc/` y `.inf/` no aparecen en ningún lugar del árbol de `.intents/` de `bloom_nucleus_truth.txt`, pese a que tanto `BTIPS_Bloom_Technical_Intent_Package_v7_1_1.md §4️⃣` como la matriz de intents dicen que ambos corren "en Projects y en Nucleus" (`doc`) o "en Projects o Nucleus" (`inf`). El propio `bloom_nucleus_truth.txt` aclara en su encabezado que fue *"homologado [...] con devoluciones read-only de MANDATE GENESIS, AUTHORIZATION y Brain"* — no queda claro si `doc`/`inf` simplemente no entraron en el alcance de esta ronda de homologación, o si de verdad no existen todavía a nivel Nucleus. No lo trato como hallazgo confirmado porque asumir cualquiera de las dos lecturas sería exactamente el tipo de invención que estamos tratando de evitar. Si me confirmás cuál es, lo incorporo.

---

## Veredicto por bloque del catálogo original

| Bloque del catálogo | Veredicto | Motivo |
|---|---|---|
| 1. `IntentDraft` (exp/dev/mrg/tst + cor) | **Válido como diseño; sin correlato real para `mrg`/`tst`** | Hallazgo #4. Las variantes `exp`/`dev` sí tocan intents con algo de scaffold real; `mrg`/`tst` no tienen nada. |
| 2. Respuesta de `validate_and_sign` + `gravity_context_injected` | **Válido como diseño; su contenedor documental es `orbital_agentic_state.json`, separado del `mandate_state.json` real** | Hallazgo #2 resuelto por separación de artefactos; sin implementación en código todavía. |
| 3. Consulta de Gravity activa (grafo completo vs. resuelto) | **La decisión de diseño (nunca exponer el grafo completo) sigue siendo válida y bien fundada; pero "el grafo" que describe no tiene ningún correlato real, y coexiste sin relación declarada con el único grafo que sí existe (Dominios/Genes)** | Hallazgos #1 y #3 (firma de nivel `PROJECT` sin autoridad real). |
| 4. `ArbitrationEvent` + notificación | **Válido como diseño; cero correlato real, consistente con que Gravity en su totalidad no tiene persistencia hoy** | Hallazgo #1. |
| 5. Versionado de API | **No afectado por estos hallazgos** — sigue siendo una propuesta nueva, desacoplada de estos truth, que no reclama ningún correlato real | — |

---

*Fin de la auditoría. Ningún hallazgo de este documento requirió inventar información no presente en `bloom_nucleus_truth.txt` / `bloom_project_truth.txt` — toda cita es verificable línea por línea contra esos dos archivos.*
