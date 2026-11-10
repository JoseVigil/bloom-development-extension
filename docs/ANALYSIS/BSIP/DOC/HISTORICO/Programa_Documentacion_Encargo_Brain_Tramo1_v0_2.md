# Encargo para Brain — Tramo 1: pipeline de `doc`, registro y disparo, con la política por intent

**Estado:** borrador del encargo, para revisión de José. **No autoriza a empezar hasta que José lo envíe con las preguntas que bloquean cada ítem respondidas.**
**Fecha:** 2026-11-07
**Reemplaza a:** `Programa_Documentacion_Encargo_Brain_Tramo1_v0_1.md`, que se conserva como histórico.
**Cambios respecto de v0.1:**
- Se elimina la medición de `dev` como condición previa (DJ-27).
- El `doc` lo lanza el propio sistema después de cada intent, de cualquier tipo (DJ-28).
- Las compuertas pasan a ser las del plan v0.2.

**Plan:** `Programa_Documentacion_Plan_Ejecucion_v0_2.md`. Este encargo cubre las etapas E1 a E4.
**Fuentes:** el documento madre v0.6 y sus anexos (registro documental y política por intent); `docs/BSIP/TYPES/DOC_Intent_Spec_v1_0.md`; `docs/GENES/*`. Las citas de código salen del checkout de la Mac.

---

## 0. Cómo se trabaja

- **Autoridad:** se aplica la sección "Autoridad, alcance y cambios" de `AGENTS.md`. Este encargo es un pedido de implementación **solo para los ítems cuyas preguntas estén respondidas**. Un ítem bloqueado no se implementa: se deja anotado en el traspaso.
- **Arranque:** leer el registro de traspaso de la etapa anterior (plan §2). Si falta, o si su compuerta no pasó, se frena y se avisa a José.
- **Cierre:** escribir el registro de traspaso de la etapa con la evidencia de su compuerta (plan §2.2).
- **Git:** ninguna acción de git. José hace los commits.
- **Comandos para la Mac:** de a uno y sin líneas de comentario.

## 1. Decisiones de José que rigen este encargo

| # | Decisión |
|---|---|
| DJ-1 | `doc` documenta Gene, Domain y Project, con el alcance como campo de la entrada. Hoy solo Project es alcanzable (el alcance es el tramo 2, etapa E5) |
| DJ-2 | La salida es un **borrador**, diseñada para entrar después a una Contribution con activo `document` |
| DJ-4 | Quién persiste el archivo final es una dependencia externa (Composition §6.2) |
| DJ-10, DJ-14 | El `docs/` del repo y la documentación de usuario que el sistema no produjo quedan fuera |
| DJ-11 | `doc` es un intent de actualización viva, tan capaz como `dev`, que reconoce movimientos y renombres |
| DJ-13 | El registro gobernado aparte (O4) es la base de la identidad documental. El digest es evidencia de integridad, no identidad. Se descarta el id dentro del archivo |
| DJ-16 | Los movimientos de documentos los hace el sistema. Uno hecho fuera del sistema es una anomalía pendiente de declaración y nunca se resuelve por parecido |
| DJ-17 | Cada intent deja detrás un `doc` que sanea lo que ese intent hizo |
| DJ-18, DJ-24 | Un `doc` no dispara otro `doc`. El `doc` queda fuera de la regla de DJ-17 |
| DJ-19 | Si un intent falla o se cancela, no corre su `doc`; el intent se vuelve a correr hasta que termina |
| DJ-23 | Cada `doc` documenta solo lo que cambió el intent anterior |
| DJ-25 | El `doc` de un `exp` corre igual; si el `exp` no cambió nada, no tiene nada que sanear |
| DJ-27 | No se mide `dev` como condición previa. Lo que reparar `doc` puede romper se informa a José, y él decide si se mide (plan v0.2 §4) |
| DJ-28 | El `doc` lo lanza el propio sistema después de cada intent, del tipo que sea (`ing`, `dis`, `exp`, `dev` y los demás), y sanea lo que hizo el intent anterior |

**Contradicciones con el encargo v0.1** (se muestran las dos y se usa la de ahora, porque José dijo que DJ-17 está por encima de las decisiones anteriores):

| Encargo v0.1 | Ahora |
|---|---|
| "Quedan fuera las corridas disparadas por un cambio material" (§1 y §9) | DJ-12 y DJ-17: entran |
| "Alcance: solo Brain" | El registro (T1.11) puede ser de Nucleus si P28 = L-N. En ese caso T1.11 sale de este encargo y pasa a uno de Nucleus |
| La línea base de `dev` se corre "antes y después" | DJ-27: no se mide `dev` como condición previa. Los riesgos se informan y José decide |
| DJ-15: el disparo es al terminar un `dev` | DJ-28: el sistema lo lanza después de cada intent, de cualquier tipo |

## 2. Cambios, con la decisión de la que depende cada uno

"Ninguna" significa que el ítem puede hacerse sin esperar una respuesta de José.

### Etapa E1 — Pipeline de punta a punta

| # | Cambio | Depende de | Cita |
|---|---|---|---|
| T1.0 | Identidad de `doc` compatible con el resto: list, get, el inspector, recovery y download tienen que encontrarlo | **Ninguna** si se usa el puente actual (`_uid()`/`_itype()`). **P21** si se cambia la identidad del intent (IO-1, IO-2 o IO-3) | `intent_manager.py:36-55, 131-142, 865-879` |
| T1.1 | Hidratación documental: producir el insumo de `doc` y fijar el nombre del archivo de contexto | **P3** (formato del insumo) y **P4** (nombres de archivo) | `intent_manager.py:291-366` |
| T1.2 | `plan` reconoce `.context` y `.curation` y escribe dentro de las rutas de `doc` | **Ninguna** para las rutas. **P1** (segunda parte) para saber si `plan` puede seguir llamando a Gemini directamente | `commands/intent/plan.py:118, 157-175` |
| T1.3 | `build-payload` encuentra los insumos de `doc` y acepta un docbase sin codebase | **P3** | `build_payload.py:79-95, 136-160` |
| T1.4 | `submit` lee `.pipeline/.context`; `download` acepta `context` y `curation_N` | **P1** (canal de inteligencia) | `intent_manager.py:2312-2346`; `download_manager.py:375-379` |
| T1.5 | `parse`, `stage`, `validate` y `merge` reconocen `context` y `curation_N`; `validate` usa un prompt documental | **P4** para los nombres de archivo. **Ninguna** para el prompt documental. **P1** si `validate` sigue llamando a Gemini | `response_parser.py:95-104`; `staging_manager.py:354-359`; `merge_manager.py:343-366`; `validation_manager.py` |
| T1.6 | El cierre de turno de `curation` tiene efecto; cada turno tiene su `.response` y su `.staging` | **Ninguna** | `intent_manager.py:1465-1499` |
| T1.7 | `finalize` exige una precondición de cierre | **P5** (cuál precondición). Con DJ-19, esa precondición es también la evidencia de que el `doc` "terminó su trabajo" (anexo PD §1) | `intent_manager.py:1910-1917` |

### Etapa E2 — Contrato de salida y entrada "qué cambió"

| # | Cambio | Depende de | Cita |
|---|---|---|---|
| T1.8 | Contrato de salida. Cada archivo candidato declara: ruta de destino portable, digest, intent de origen, el intent que sanea, insumos con sus digests, la marca `borrador` y, si se conoce, el modelo usado | **Ninguna** para los campos (DJ-2, DJ-17). La ruta sigue relativa a la raíz del Project mientras **P6** no se responda | G1 §4; `gene/assets.go` (`portableRelativePath`) |
| T1.9 | Entrada "qué cambió": el `doc` recibe la lista de cambios del intent que lo precede y documenta solo eso (DJ-23). Fuentes: el manifiesto de staging de `dev`; el ledger y el resultado parseado de `ing`. Un `exp` sin cambios termina con "nada que sanear" (DJ-25) | **Ninguna** para `dev`, `ing` y `exp`. Para `dis`, del escritor de `.domain_graph_delta.json`, que no existe (I-57; pedido interno R-B1). `asm`, `mrg` y `tst` no tienen código y quedan fuera | `staging_manager.py:100, 354-359`; `effect_ledger.py:28-38`; `experiment.py:21-63` |
| T1.10 | Un `doc` no lanza otro `doc` | **Ninguna** (DJ-18, DJ-24) | — |

### Etapa E3 — Registro documental

| # | Cambio | Depende de | Cita |
|---|---|---|---|
| T1.11 | Registro gobernado aparte (O4) con la identidad de cada documento del sistema. Los movimientos y renombres que hace el sistema pasan por el registro. Un movimiento hecho fuera del sistema queda como anomalía pendiente de declaración | **P27** (qué cuenta como "el sistema"), **P28** (dónde vive: si la respuesta es L-N, el ítem pasa a Nucleus), **P29** (si viaja con el repo), **P30** (precedencia en el estado intermedio; puede requerir a Genes) y **P31** (si `dev` puede mover documentos) | Anexo del registro §2 a §6 |

### Etapa E4 — Disparo fuera del Mandate

| # | Cambio | Depende de | Cita |
|---|---|---|---|
| T1.12 | Estados de fallo y cancelación para `dev` y `doc`. DJ-19 necesita distinguir "falló o se canceló" de "terminó", y hoy los dos tipos solo tienen `created`, `in_progress` y `completed` | **Ninguna** para que existan (DJ-19). **P10** para la forma: si `doc` sigue siendo un intent heredado o pasa al motor BSIP | `intent_manager.py:850-887` |
| T1.13 | Cuando un intent de cualquier tipo cierra bien, el sistema lanza su `doc` (DJ-28). Hoy el cierre pasa por `finalize_intent`, que no tiene ningún enganche; `ing` y `dis` cierran por la rama BSIP y `dev` y `doc` por la heredada | **Ninguna** para que exista (DJ-28). **P37-bis** para saber qué pieza lo lanza fuera del Mandate y si vale para los intents corridos a mano | `intent_manager.py:1863, 1900-1917` |
| T1.14 | Reintento de un intent que falló, antes de su `doc` | **P39** (lo relanza el sistema sin límite, o una persona después de agotar los reintentos) | — |
| T1.15 | Serie fuera del Mandate: si un intent corre mientras otro está abierto sobre el mismo Project | **P36** (si "no corren en paralelo" describe el uso actual o es una regla que el sistema garantiza) | `intent_manager.py:97, 1360-1400` |

## 3. Compuertas

Son las del plan v0.2 §1. Corren sobre el Project de prueba `tests/brain/doc-intent-tests`, con el binario de Brain compilado e instalado por el flujo oficial.

| Etapa | Compuerta |
|---|---|
| E1 (G1) | (a) Piloto P-A: un `doc` sobre el vertical de Gravity llega de create a finalize y deja al menos un borrador aplicado en una ruta portable. (b) `finalize` rechaza un `doc` que no cumple la precondición de P5. (c) Las verificaciones de riesgo que José pida |
| E2 (G2) | (a) Piloto P-A.2: el contrato de salida del `doc` nombra solo los archivos que cambió el intent anterior. (b) Un `doc` que sigue a un intent sin cambios termina con "nada que sanear" y no escribe. (c) Un `doc` lanzado desde otro `doc` se rechaza. (d) Las verificaciones de riesgo que José pida |
| E3 (G3) | (a) Piloto P-A.1: un movimiento hecho por el sistema conserva la identidad. (b) Un movimiento hecho a mano queda como anomalía. (c) Ninguna escritura en `.genes/` |
| E4 (G4) | (a) Un `dev` que cierra bien produce exactamente un `doc`. (b) Un `ing` o un `dis` que cierra bien produce exactamente un `doc`. (c) Un intent forzado a fallar no produce `doc` y muestra el fallo. (d) Un `doc` no produce otro. (e) El comportamiento de P36 |

## 4. Qué no se hace

- No se toca el Mandate, su contrato ni su workflow. El disparo dentro del Mandate es de MANDATE (pedido R-M1).
- No se toca Nucleus, AITAP, Genes, Authority, Impact ni Orrery. Si P28 = L-N, T1.11 tampoco se hace acá.
- No se crea ninguna Contribution, no se ratifica y no se llama a `Materialize`.
- No se infiere pertenencia a Domain o Gene, ni continuidad de un documento por parecido de contenido.
- No se trabaja el tramo 2 (alcance), que es la etapa E5.
- No se implementa G12 (visualización posterior) mientras P8 siga abierta.
- No se corrige `tests/brain/e2e_ing_pipeline.py`, que escribe `.bloom/` en la raíz del repo. Solo se deja fuera del comando de pruebas.

## 5. Riesgos que el encargo tiene que vigilar

- **Lo que reparar `doc` puede romper:** son los riesgos R-1 a R-7 del plan v0.2 §4, cada uno con su forma de verificarlo. Solo se miden los que José pida.
- **H-3:** el `plan` y el `validate` de `doc` buscan la clave de Gemini en `gemini-profiles`. Mientras eso no se resuelva, o P1 no elija otro canal, el piloto P-A corta en `plan` (traspaso E0).
- **La extensión:** lee el estado de los intents y crea intents `dev` (`createIntentDev.ts:16`), y no tiene pruebas. La comprobación queda pendiente de P46.
- **Merge sobre documentación existente:** el borrador se aplica sobre archivos reales del proyecto sin ratificación. Por eso la compuerta usa el Project de prueba (P42).
- **Inteligencia fuera de AITAP:** si P1 elige la vía por archivo, o si `plan` y `validate` siguen llamando a Gemini directamente.

## 6. Preguntas que bloquean ítems de este encargo

| Pregunta | Bloquea |
|---|---|
| P1 Canal de inteligencia; si `plan` y `validate` pueden llamar a Gemini directamente | T1.4; parte de T1.2 y T1.5 |
| P3 Formato del insumo documental | T1.1, T1.3 |
| P4 Nombres de archivo | T1.1, T1.5 |
| P5 Precondición de `finalize` | T1.7 |
| P6 Id del Project | Solo la base de la ruta en T1.8 |
| P10 Motor de estado | La forma de T1.12 |
| P21 Identidad del intent | T1.0, si no se usa el puente |
| P27 a P31 | T1.11 |
| P36, P37-bis, P39 | T1.15, T1.13, T1.14 |
| P43 pytest (permanente); P45 comando único; P46 extensión. P42 y P44 ya están respondidas | Las compuertas y las verificaciones de riesgo |
| H-3 Clave de Gemini para `plan` y `validate` | G1(a) |

Los ítems que no dependen de ninguna decisión son T1.0 (con el puente actual), T1.2 (rutas), T1.5 (prompt documental), T1.6, T1.8 (campos), T1.9 (para `dev`, `ing` y `exp`), T1.10 y T1.12 (existencia de los estados). Igual no arrancan hasta que José envíe este encargo.
