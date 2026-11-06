# Programa de documentación — Política de documentación por intent y responsabilidad de Impact (relevamiento)

**Estado:** relevamiento. **No propone diseño, no estima costos y no decide.**
**Fecha:** 2026-11-05
**Autoridad:** José Vigil
**Insumo:** mensaje de José "Para el cowork: política de documentación por intent, y la responsabilidad de Impact" (en adelante **PD**).
**Se integra en:** `Programa_Documentacion_Documento_Madre_v0_5.md` (DJ-17 a DJ-22, I-52 a I-58, P31 a P34).

### Marcas

Las mismas del documento madre: **IMPL**, **ESPEC**, **PROP**, **NO EXISTE**, **LAGUNA** (con dueño probable), **REAL**.

### Límites de la evidencia

- El código se leyó copiado desde el checkout de Darwin. Las búsquedas negativas cubren lo copiado: `brain/`, `src/`, `installer/nucleus/internal/{orchestration, authority, gene, governance, mandate*}` e `installer/impact/`.
- No se leyó estado operativo (DJ-9).
- No se verificó si el worker de Temporal limita la cantidad de workflows o actividades simultáneas.

---

## 0. La política, tal como la escribió José

| # | Regla (cita textual de PD) | Carácter |
|---|---|---|
| PD-1 | "Cada intent, de cualquier tipo, deja detrás un intent doc que sanea todo lo que ese intent hizo." Está por encima de las decisiones anteriores. El costo en tokens se acepta | Decidida |
| PD-2 | "Un doc no dispara otro doc." | Decidida |
| PD-3 | "Si un intent falla o se cancela, no corre su doc: el intent se vuelve a correr hasta que termina su trabajo." | Decidida |
| PD-4 | "El Mandate espera a que termine el doc antes del próximo intent." | Decidida |
| PD-5 | "El Mandate corre de forma unívoca. Hoy los intents no corren en paralelo." | Decidida |
| PD-6 | "Alcance de cada doc: (completar: solo lo que cambió el intent anterior / el Project entero)" | **Sin completar.** Queda como P34 |
| PD-7 | Si un día los intents corren en paralelo, Impact verifica las colisiones de escritura entre documentaciones. José lo considera decidido | Decidida |

**Choque interno de la política (I-58), sin elegir:**
- PD-1: "Cada intent, **de cualquier tipo**".
- PD-2: "Un doc no dispara otro doc."
- `doc` es un tipo de intent (`intent_types.py:38-48`; DOC spec). Leídas literalmente, PD-1 pide un doc después de cada `doc` y PD-2 lo prohíbe. Pregunta para José en P34-bis (§7).

---

## 1. Éxito de un intent: qué significa "terminó su trabajo" por tipo

PD-3 exige que el doc corra solo si el intent terminó. La tabla dice qué evidencia existe hoy, por tipo, para afirmar que terminó. No dice cuál debería usarse.

| Tipo | Qué marca hoy que terminó | Quién lo afirma | Qué podría verificar un tercero | Estado |
|---|---|---|---|---|
| `ing` | Fase terminal `done` del motor BSIP (`intent_types.py:102, 135-141`); `finalize` exige que el último turno de `consolidation` tenga `committed: true` (`intent_manager.py:1900-1904`); el ledger de efectos verifica las obligaciones `gene_lineage_materialized`, `domain_gene_edge_*`, `knowledge_baseline_materialized` (`effect_ledger.py:28-34, 246`; `genesis_intelligence.py:317, 360`). En el Mandate, `MandateINGCompletionActivity` compara `resultRef/resultSha256` y `ledgerRef/ledgerSha256` antes de registrar `status: "completed"` (`mandate_execution_activities.go:120-156`) | El motor BSIP + Nucleus | Sí: el resultado y el ledger tienen digest | **IMPL**. La materialización física en el store de Genes sigue pendiente (sin caller productivo de `Materialize`) |
| `dis` | Fase terminal `done` (`intent_types.py:160-165`); `finalize` exige `committed: true` en `ratification` (`intent_manager.py:1900-1904`); obligaciones del ledger `domain_graph_operation_applied` y `domain_graph_delta_materialized` (`effect_ledger.py:35-38`) | El motor BSIP | Parcial: el ledger existe; el Mandate no despacha `dis` (`mandate_execution_workflow.go:193-224`) | **IMPL** en Brain; **NO EXISTE** el despacho desde el Mandate |
| `doc` | `status: "completed"`, que pone `finalize` sin precondición: solo verifica que el intent no esté bloqueado por otro (`intent_manager.py:1910-1917`). No hay estado `failed` ni `cancelled` (`intent_manager.py:850-887`) | Quien llama a `finalize` | No: no hay evidencia del trabajo, solo el estado | **IMPL** sin precondición (G13 del encargo) |
| `dev` | Igual que `doc` (`intent_manager.py:1910-1917`). `plan`/`build` figuran "sin verificar" (DEV spec §3.2) | Quien llama a `finalize` | No | **IMPL** sin precondición |
| `exp` | El validador acepta `status` `ready` o `remediation_required`, con hallazgos con evidencia; `ready` no admite bloqueantes (`experiment.py:21-63`). **Nadie lo llama** (búsqueda de `validate_evaluation`: sin llamadores). No aparece archivo de resultado escrito por código | — | El validador existe; no hay quien produzca el resultado | Validador **IMPL** sin uso; resultado **NO EXISTE** |
| `gen` (vertical v1-v3, no está en v4) | `domain_definition.json` con estructura verificada por el evaluador `domain-definition-structure` (`contract.go:188-190`); `artifactSha256` (`mandate_gen_activity.go:204-247`) | Nucleus | Sí | **IMPL** |
| `asm` | Sin código (`intent_types.py` solo declara `ing` y `dis`) | — | — | **ESPEC** |
| `mrg` | `status` `created / conditionally_signed / dry_run / merged / aborted` (MRG spec l. 70) | — | — | **ESPEC** |
| `tst` | `status` `pass / fail`; `eligible_for_close` (TST spec l. 71-76) | Nucleus calcula `eligible_for_close` (TST spec l. 233) | — | **ESPEC** |

**Qué necesita `doc` para confiar en el éxito.** Las fuentes no lo dicen. Hechos que condicionan la respuesta:

- Para `ing` y `dis` hay evidencia con digest. Para `dev` y `doc` solo hay una marca que cualquiera puede escribir.
- La TST spec rechaza cerrar por autodeclaración: "un sistema donde la autoridad de cierre dependiera de la autodeclaración del agente, `status: "completed"`…" (TST spec l. 41). Esa regla es para cerrar el **Mandate**, no para el éxito de un intent. La tensión con PD-3 se registra como I-55.
- `finalize` de `doc` no tiene precondición. Si el doc que sigue a un intent es a su vez un `doc`, su propio éxito tiene el mismo problema.

**LAGUNA (dueño probable: José + MANDATE para dentro del Mandate; Brain para cada tipo):** qué evidencia cuenta como "terminó su trabajo" para cada tipo sin evidencia (`dev`, `doc`, `exp`, `asm`, `mrg`, `tst`).

**Reintento (PD-3).** Dos fuentes chocan con "se vuelve a correr hasta que termina" (I-52):
- Las actividades del Mandate tienen `RetryPolicy` con `MaximumAttempts: 3` y `StartToCloseTimeout` de 5 minutos (`mandate_execution_workflow.go:178-183`).
- EM-C12: un fallo de ejecución deja el workflow fallido, sin cambio en `mandate_state.json` y sin reintento (`Orrery_Experience_Model_Escenarios_Trabajo_Activo_v0_1.md`, fila G-F; `Genesis_Camino_Cloud_Gobernado_B3_B4_Diseno_v0_1.md` §7).
- Además, `ing` dentro del Mandate espera una decisión humana (`awaiting_human_decision`, `mandate_watcher.go:501`). "Terminar" puede depender de una persona.
- Cada Action firmada tiene su `IdempotencyKey` (`contract.go:82`). No se encontró qué hace el sistema si la misma Action se vuelve a correr después de agotar los reintentos. **LAGUNA** (dueño: MANDATE).

---

## 2. Contrato del Mandate: qué cambia frente a v4 y quién es el dueño

| Aspecto | Lo firmado (v4) | Lo que dice la política | Dueño de la pieza | Estado |
|---|---|---|---|---|
| Lugar de `doc` | Una sola Action `doc`, en la posición 3: `ing, dis, doc, exp, dev, exp` (`contract.go:93`; `mandate-v4-sign/main.go:293`; definición publicada REAL según RV) | Un doc después de **cada** intent (PD-1) | MANDATE (`mandatecontract`), herramienta de firma, Authority (firma) | Choque (I-53) |
| Cantidad de Actions | "exactly six signed Actions" (`contract.go:90-91`); cualquier otra secuencia se rechaza (`contract.go:97-99`) | Seis intents más sus docs | MANDATE | Choque (I-53) |
| Dependencias | Cada Action depende solo de la anterior (`contract.go:109-111`) | "El Mandate espera a que termine el doc antes del próximo intent" (PD-4) | MANDATE | Compatible con la cadena lineal, pero hoy el doc no está después de cada intent |
| Condición de rama | Solo el `dev` lleva `WhenResult: "remediation_required"` (`contract.go:112-116`) | PD-3: si el intent falla, no corre su doc y se reintenta | MANDATE | **LAGUNA:** la política no dice qué pasa con el doc de un `exp` que da `ready` (el `dev` no corre) |
| Cumplimiento | Evaluador `exp-ready`, campos requeridos `[ing, dis, doc, exp]` (`contract.go:183-185`) | No lo menciona | MANDATE | **LAGUNA:** si los docs posteriores cuentan para el cumplimiento |
| Ejecución real | El workflow adoptado despacha solo `ing` y devuelve `Fulfilled: false` (`mandate_execution_workflow.go:193-224`) | PD-4 supone un Mandate que despacha todo | MANDATE | La política describe un Mandate que todavía no ejecuta más allá de `ing` |
| Inmutabilidad | Las condiciones de rama "are part of the signed contract, never a workflow signal" (`contract.go:87`). El arbitraje nunca modifica un Mandate firmado (INVARIANT-ARB-003, `NUCLEUS_API_Contracts_Consolidado_v0_1.md` §4.2) | — | MANDATE | Hecho: los Mandates ya firmados con v4 no cambian solos |

**Pregunta sin respuesta en las fuentes (LAGUNA, dueño: José + MANDATE):** el doc que exige PD-1, ¿es una Action firmada del contrato o algo que el Mandate agrega por política sin firmarlo? Las dos lecturas tienen consecuencias distintas para la firma. No se elige.

---

## 3. Qué cambió: ¿existe una lista de cambios por tipo de intent?

PD-6 está sin completar. Si el alcance es "solo lo que cambió el intent anterior", el doc necesita esta lista. Si es "el Project entero", no.

| Tipo | Lista que existe | Qué registra | Estado |
|---|---|---|---|
| `dev` | `.staging_manifest.json` (`staging_manager.py:100, 354-359`), aplicado por `MergeManager` (`merge_manager.py:83, 343-366`) | Los archivos preparados en staging. No se verificó si distingue lo aplicado de lo omitido. Movimientos y renombres: `gitManager.ts:75-102` no registra renombres | **IMPL** parcial |
| `doc` | La misma maquinaria de staging, pero cableada a etapas de `dev` (`submit` fija `.pipeline/.briefing`, `intent_manager.py:2312-2346`; gaps G0-G14) | En la práctica, no produce una lista confiable | **IMPL** roto |
| `ing` | `.parsed_result.json` y el ledger de efectos (`genesis_intelligence.py:286-356`; `effect_ledger.py:28-34`) | Los efectos planeados y aplicados, con ids `gene-<hex>` y `contribution-<hex>` | **IMPL**; la materialización física sigue pendiente |
| `dis` | La spec define `.domain_graph_delta.json`: "qué cambió respecto a `.domain_graph_snapshot.json`" (DIS spec l. 161, 308) | — | **ESPEC.** En el código solo aparece la obligación `domain_graph_delta_materialized` del ledger (`effect_ledger.py:38`); no se encontró quién escribe el archivo |
| `exp` | No hay lista. El resultado es una evaluación con hallazgos (`experiment.py:21-63`) | Las fuentes no dicen si `exp` cambia algo que haya que documentar | **LAGUNA** (dueño: EXP spec) |
| `gen` | `domain_definition.json` con `artifactSha256` | Un solo artefacto | **IMPL** |
| `asm`, `mrg`, `tst` | `mrg` tiene `conflict_files` desde `dry_run` (MRG spec l. 92); `asm` y `tst` no definen lista | `conflict_files` son conflictos, no cambios | **ESPEC** / **NO EXISTE** |
| Genes (cualquier intent que publique) | El commit canónico tiene `installed_objects` y `revision_transitions` (`gene/model.go`) | Lo publicado en el store | **IMPL** en el store, sin caller productivo |

**Hecho que no cubre ninguna lista:** los escritores de Brain y de la extensión que no son intents (T-3 del anexo: `context generate`, `NucleusManager`, `ProjectLinker`, `NucleusStrategy.ts`) cambian archivos de documentación. PD-1 habla de intents, así que esos escritores quedan fuera de la política tal como está escrita. **LAGUNA** (dueño: José): si quedan fuera o si pasan a ser intents.

---

## 4. Alcance de la serie: dónde vale la regla de no paralelo y dónde no

PD-5 dice: "Hoy los intents no corren en paralelo". El código muestra esto:

| Situación | ¿Se serializa? | Evidencia | Estado |
|---|---|---|---|
| Intents dentro de un mismo Mandate v4 | Sí, por contrato: cadena lineal de `DependsOn` | `contract.go:109-111` | **IMPL** (solo se despacha `ing`) |
| Dos ejecuciones del mismo Mandate | Sí: un workflow por Mandate, id `mandate_execute_<mandateId>`, `REJECT_DUPLICATE` | `worker.go:48-49`; `mandate_watcher.go:486, 510-519` | **IMPL** |
| Dos Mandates distintos | **No.** Cada uno tiene su propio workflow; el watcher recorre todas las carpetas de Mandates y despacha cada una | `mandate_watcher.go:264-272, 431-520`; `worker.go:48` | **IMPL.** No se verificó un límite de concurrencia del worker |
| Un `dev` o un `doc` corridos a mano por CLI | No. `dev` y `doc` ignoran `mandate_id` | `intent_manager.py:97` | **IMPL** |
| Un `dev` creado desde la extensión | No | `createIntentDev.ts:16` | **IMPL** |
| Un doc manual fuera de un Mandate | No: nada lo ordena respecto de un Mandate en curso | `intent_manager.py:97` | **IMPL** |
| Dos máquinas sobre el mismo Project | No | El bloqueo de un intent guarda el hostname y vive en su archivo de estado (`intent_manager.py:1360-1400`) | **IMPL** |
| Publicaciones al store de Genes | Sí, por Project: `project.lock` y CAS por generación | `gene/materializer.go:46`; `gene/recovery.go:74` | **IMPL** |

**Choque (I-54), sin elegir:**
- PD-5: "Hoy los intents no corren en paralelo."
- Código: dos Mandates pueden correr a la vez, y un intent manual puede correr mientras corre un Mandate. Que hoy no ocurra en la práctica puede ser cierto, porque el Mandate solo despacha `ing`, pero no está impedido.

**LAGUNA (dueño: José):** si PD-5 describe el uso actual o una regla que el sistema tiene que garantizar.

---

## 5. Impact y los documentos

### 5.1 Qué hace Impact hoy

| Hecho | Cita | Estado |
|---|---|---|
| Evalúa hechos y criterios que le dan. "It does not acquire facts, resolve Gravity, establish authority, execute actions, maintain caller state, monitor, or start a server loop" | `installer/impact/README.md` | **IMPL** |
| "Do not implement Monitor, Winston, authority, scheduling or execution here" | `installer/impact/AGENTS.md` | Norma del componente |
| Tres evaluadores: `coexistence`, `preservation`, `compliance`, sobre `gravity-criterion/1` y `gravity-expr/0.1` | `evaluate.go:38` | **IMPL** |
| Un tipo de pregunta desconocido devuelve una evaluación indeterminada ("unsupported evaluator type or version") | `evaluate.go:76-80` | **IMPL** |
| Los tres evaluadores rechazan `payload` y `parameters` | `evaluate.go:103-105` | **IMPL** |
| Los hechos son numéricos: `Fact{ref, metric, unit, value float64, observedAt}` | `contract.go:27-33` | **IMPL** |
| El contexto lleva un solo `scope` como texto | `contract.go:15-21` | **IMPL** |
| Impact no descubre Mandates activos y no lee archivos (PD) | README; `evaluate.go` | **IMPL** |
| `coexistence` necesita expresiones de postura en un contexto compartido; no hay `scope_paths` | `Investigacion_*` de Wisdom G2 (Project BTIPS), relevado en esta serie | **IMPL** |

### 5.2 Qué le falta para verificar una colisión de escritura entre documentaciones

Separado por quién tendría que aportar cada cosa. No se dice cómo resolverlo.

| Lo que falta | Parte de Impact | Parte de quien llama | Estado |
|---|---|---|---|
| Una pregunta que exprese "dos documentaciones escriben lo mismo" | Un tipo de pregunta con su versión. Hoy no existe y cualquier tipo nuevo daría indeterminado (`evaluate.go:76-80`) | Pedirla con ese tipo | **NO EXISTE** |
| Un hecho que pueda llevar un conjunto de documentos o rutas | El contrato solo admite valores numéricos (`contract.go:31`) y los evaluadores no aceptan `payload` (`evaluate.go:103-105`) | Producir esos conjuntos | **NO EXISTE** |
| Qué documentos toca cada doc | — (Impact no lee archivos) | Brain (`doc`) o el Mandate, antes o después de escribir. Depende de PD-6: con "el Project entero" dos docs se tocan siempre | **LAGUNA** (dueño: Brain + José por PD-6) |
| Qué docs están corriendo a la vez | — (Impact no descubre Mandates ni guarda estado) | Nucleus o el Mandate. Hoy nada registra las corridas manuales (§4) | **LAGUNA** (dueño: Nucleus / MANDATE) |
| La identidad de los documentos, para que un renombre no parezca otro documento | — | El registro documental (O4, DJ-13), que no existe todavía | **NO EXISTE** (E1) |
| Momento de la verificación: antes de escribir (lo planeado) o después (lo escrito) | La pregunta tendría que decir cuál | Aportar el dato de ese momento | **LAGUNA** (dueño: José) |
| Qué pasa cuando hay colisión | Impact no decide: su salida es evidencia (README; `Analisis_Estrategico_Cognituum_Evaluators_*` §1) | El arbitraje entre Mandates es exclusivo de Nucleus (INVARIANT-ARB-001; `NUCLEUS_API_Contracts_Consolidado_v0_1.md` §4.2) | **ESPEC** para Mandates; sin regla para docs |

**Dos versiones, sin elegir (I-56):**
- PD-7: "Impact verifica las colisiones de escritura entre documentaciones".
- INVARIANT-ARB-001 (GRAVITY v0.1 §3.2): la colisión de `scope_paths` entre Mandates sin ancestría la resuelve solo Nucleus; un evaluador puede anticiparla, pero no reemplaza el arbitraje (`Analisis_Estrategico_Cognituum_Evaluators_*` §1).
- No es necesariamente una contradicción: verificar y resolver son dos actos distintos. Se registra porque las fuentes no dicen dónde termina uno y empieza el otro para documentos.

### 5.3 Qué preguntarle al trabajo de Impact

1. ¿Una colisión de escritura entre documentaciones cabe en un tipo de pregunta de Impact, o queda fuera de su frontera ("evalúa hechos y criterios")?
2. Si cabe, ¿qué forma de hechos acepta? Hoy son numéricos y sin `payload`. ¿Aceptaría conjuntos de documentos o rutas?
3. ¿Con qué identidad de documento trabajaría: ruta, `asset_id` de Genes o la identidad del registro documental (DJ-13)?
4. ¿La colisión se evalúa sobre lo que cada doc planea escribir, sobre lo que escribió, o sobre las dos cosas?
5. ¿Qué devuelve cuando falta el dato de una de las corridas: indeterminado, como hoy con un tipo desconocido?
6. ¿Cómo se relaciona su evaluación con el arbitraje exclusivo de Nucleus (INVARIANT-ARB-001)?
7. ¿Quién le pide la evaluación: el Mandate, Nucleus o el propio `doc`?

---

## 6. Cómo cambian DJ-3, DJ-15 y P31-P33 bajo la política

| Pieza | Texto anterior | Bajo la política | Qué queda abierto |
|---|---|---|---|
| DJ-3 | CLI a mano en reparación y Action del Mandate después | La parte de CLI no choca con la política. La parte "Action del Mandate" choca con v4, que tiene un solo `doc` (I-53) | Si un intent manual también deja su doc (§4) |
| DJ-15 | El disparo es al terminar un `dev` | Es un caso de PD-1: después de un `dev` corre un doc, igual que después de cualquier intent | I-50 (tiempo real) sigue |
| P31 | ¿Un `dev` puede mover, renombrar o borrar documentos del sistema? | El doc que sigue al `dev` sanea lo que el `dev` hizo (PD-1). La pregunta sigue: si el `dev` puede mover documentos y si lo reporta | Depende de §3 (lista de cambios de `dev`) |
| P32 | ¿"Tiempo real" y "al terminar un `dev`" son lo mismo? | El intervalo pasa a ser "al terminar cada intent". Sigue sin estar definido qué es "tiempo real" (R-6) | Sí |
| P33 | ¿El disparo después de `dev` vale dentro del v4, que firma `doc` antes de `dev`? | Se reformula: v4 tiene un solo `doc`; la política pide uno después de cada intent (I-53) | Dueño: José + MANDATE |

---

## 7. Preguntas para José

| ID | Pregunta |
|---|---|
| **P34** | Alcance de cada doc (PD-6): ¿solo lo que cambió el intent anterior, o el Project entero? |
| **P34-bis** | PD-1 dice "de cualquier tipo" y PD-2 dice "un doc no dispara otro doc". ¿El `doc` queda fuera de PD-1? (I-58) |
| P35 | El doc que exige PD-1, ¿es una Action firmada del contrato o algo que el Mandate agrega por política? (§2) |
| P36 | PD-5, ¿describe el uso actual o es una regla que el sistema tiene que garantizar? (I-54) |
| P37 | ¿Un intent corrido a mano, fuera de un Mandate, también deja su doc? ¿Quién lo lanza? (§4) |
| P38 | Después de un `exp` en `ready`, el `dev` no corre. ¿Corre igual el doc del `exp`? (§2) |
| P39 | "Se vuelve a correr hasta que termina": ¿cómo convive con los tres intentos de Temporal y con EM-C12? (I-52) |
