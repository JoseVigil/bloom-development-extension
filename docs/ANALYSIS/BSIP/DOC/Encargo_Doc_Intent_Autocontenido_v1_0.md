# Encargo autocontenido — Intent `doc` sobre Project, Domain y Gene

| Campo | Valor |
|---|---|
| Estado | Encargo autocontenido para ejecutar sin leer conversaciones previas. **No autoriza implementación ni cambios de código.** Autoriza solo el paso P0 (§8), que es de lectura |
| Fecha | 2026-11-09 |
| Autoridad | José Vigil |
| Idioma de trabajo | Castellano |
| Ubicación | `docs/ANALYSIS/BSIP/DOC/` en el repo `bloom-development-extension`, y `ANALYSIS/BSIP/DOC/` en el Project BTIPS |
| Commit de referencia | `57c4d819dad92da5c844ffe34dc50b3182baf9df`. Es `main` en la Mac (leído de `.git/refs/heads/main`, con `HEAD` → `refs/heads/main`) y es el `HEAD` del clon público en la nube. No se pudo comprobar si la Mac tiene cambios sin commitear: no hay terminal ni Git en la Mac |
| No reemplaza | `Encargo_Doc_Intent_Actualizacion_Viva_v1_0.md` sigue siendo el encargo rector. Este documento lo condensa, lo contrasta con el código actual y fija el primer paso. Si choca con él, manda el rector (con la salvedad de §0.2) |
| No edita | Ningún documento existente. No toca el contrato firmado 1.2.0 |

### Marcas

| Marca | Significado |
|---|---|
| **IMPL** | Existe en código. La cita es al commit de referencia salvo que se diga otra cosa |
| **ESPEC** | Solo está especificado |
| **PROP** | Propuesto, sin norma ni código |
| **NO EXISTE** | No hay código ni especificación |
| **LAGUNA** | No está definido. Se indica el dueño probable |

---

## 0. Cómo usar este encargo

### 0.1 Fuentes rectoras, en orden de precedencia

| # | Fuente | Qué aporta | sha256 de la copia del repo |
|---|---|---|---|
| 1 | `Encargo_Doc_Intent_Actualizacion_Viva_v1_0.md` | Decisiones DJ-29 a DJ-37, recorrido §12, etapas D1-D6. **Manda sobre las demás** | `12b8a063…a974f95` (ver §0.2) |
| 2 | `Programa_Documentacion_Pedido_MANDATE_Contrato_v0_1.md` | Pedido a MANDATE: P35, P36, P39, P40. Donde dice que `exp` dispara `doc`, lo corrige DJ-29 | `8aeac52b…0993115` |
| 3 | `Programa_Documentacion_Documento_Madre_v0_7.md` | Decisiones DJ-1 a DJ-28, inconsistencias I-01 a I-60, preguntas P1 a P47 | `d6ca4363…0a83e5` |
| 4 | `Programa_Documentacion_Politica_Doc_por_Intent_Relevamiento_v0_1.md` (PD) | Cómo termina cada tipo, listas de cambios, contrato v4, Impact | `f6e64972…8d92d8f74` |
| 5 | `Programa_Documentacion_Registro_Documental_Mapa_Decision_v0_1.md` | Registro documental: P27 a P31 | `a917f2f1…0639d` |
| 6 | `TRASPASOS/Traspaso_E0_Cancelada_v1_0.md` | Project de prueba, pruebas de referencia PR-0, hallazgos H-1 a H-5 | `86b6e3b4…dd44` |
| 7 | `docs/BSIP/TYPES/{DOC,DEV,ING,DIS,MRG,TST,EXP,ASM}_Intent_Spec*.md` | Specs de los tipos | — |
| 8 | Project BTIPS: `ANALYSIS/DOC/Relevamiento_Vinculacion_Documental_Arbol_Estructural_v0_1.md` (RV) | Vínculo entre documento y estructura; identidades reales en la Mac | — |

Las fuentes 1 a 6 están en `docs/ANALYSIS/BSIP/DOC/`. **No son fuentes:** los documentos de `docs/ANALYSIS/BSIP/DOC/HISTORICO/`.

### 0.2 Las dos copias del encargo rector no coinciden

| Copia | Qué contiene | Cita |
|---|---|---|
| Repo (Mac y GitHub, idénticas) | DJ-29 a DJ-35. No tiene DJ-36, DJ-37, P50, §3.8 ni §3.9. Estado: "quedan abiertas P1 (forma), P48, P34 y P49" | `docs/ANALYSIS/BSIP/DOC/Encargo_Doc_Intent_Actualizacion_Viva_v1_0.md`, 22 996 bytes, sha256 `12b8a063…`, último commit `34c9e45` |
| Project BTIPS | DJ-29 a DJ-37, P50, §3.8 (fallo del `doc`) y §3.9 (nombre del contrato). Estado: "quedan abiertas P1 (forma), P48, P34, P49 y P50" | `ANALYSIS/BSIP/DOC/Encargo_Doc_Intent_Actualizacion_Viva_v1_0.md`, creado 2026-11-09 20:42 UTC |

El mensaje del commit `34c9e45` describe el contenido de DJ-36 y DJ-37 ("If doc fails after a successful mutating intent, doc resumes…", "will not be edited nor run again with the old graph"), pero el archivo de ese commit no lo tiene.

**Lo que hace este encargo:** cita DJ-36, DJ-37 y P50 desde la copia del Project, porque José los nombra en el pedido de este encargo. No elige cuál de las dos copias es la vigente ni las sincroniza. **Pendiente de José (X-1):** qué copia rige y si se reemplaza la del repo.

### 0.3 Antes de ejecutar nada

1. Leé este documento entero y después el encargo rector (§0.1, fila 1), en la copia del Project.
2. Comprobá tus permisos (§10). Pueden no coincidir con los de esta sesión.
3. Si una fuente choca con otra, mostrá las dos con cita y no elijas. Lo que no esté definido va como LAGUNA con su dueño.

---

## 1. Objetivo

La documentación del sistema tiene que quedar saneada cada vez que un intent mutador cambia la infraestructura. El intent `doc` es la pieza que la mantiene (encargo rector §1).

| Nivel | Qué hace `doc` | Fuente |
|---|---|---|
| Project | Compara contra el filesystem del Project y sanea | DJ-33; encargo §5.4 |
| Domain | Documenta y marca todo como **"declarado, no verificado"** | DJ-33; encargo §5.5 |
| Gene | Documenta y marca todo como **"declarado, no verificado"** | DJ-33; encargo §5.5 |
| Tenant | No contrasta contenido; deja la estructura preparada | DJ-33; encargo §5.6 |
| Organization | No contrasta contenido; deja la estructura preparada | DJ-33; encargo §5.6 |

Por qué Tenant y Organization quedan solo preparados: "la verdad de Tenant y Organization (cuentas, membresías, roles) vive en el servidor, y Nucleus solo la verifica. `doc` no puede contrastarla contra el filesystem local" (DJ-33).

Requisitos que tiene que cumplir cada corrida (encargo §5, resumidos):
- Se dispara al terminar `dev`, `ing`, `dis` o `mrg` (DJ-29). También corre a mano por CLI.
- Es idempotente: compara la documentación del alcance contra el estado real y, si no hay diferencia, termina sin escribir (DJ-30).
- La comparación va antes de cualquier llamada de inteligencia (DJ-34).
- Reconoce movimientos y renombres hechos por el sistema a través del registro, y marca como anomalía los hechos fuera del sistema (DJ-13, DJ-16).
- Su salida es un borrador con contrato: ruta portable, digest, intent que lo disparó, nivel y marca de verificación, insumos con digests y modelo, si se conoce (DJ-2; encargo §5.8).
- No se dispara a sí mismo (DJ-18, DJ-24).
- Sirve sin cambios para un futuro disparador por reconciliación (DJ-32).

---

## 2. Alcance

### 2.1 Entra

- Reparar y extender el intent `doc` para que cumpla §1.
- La señal de estado terminal y el disparo de `doc` desde Nucleus.
- El registro documental (identidad de cada documento, DJ-13).
- El lugar de `doc` dentro del Mandate, cuando MANDATE responda.

### 2.2 No entra

| Fuera | Fuente |
|---|---|
| El `docs/` del repo y la documentación de usuario que el sistema no produjo | DJ-10, DJ-14 |
| Cambios que no vienen de un intent (P41) | DJ-32 |
| Medir `dev` u otro intent como condición previa | DJ-27 |
| Contrastar Tenant y Organization contra el filesystem | DJ-33 |
| Inferir pertenencia a Domain o Gene, o continuidad por parecido | Encargo §11; DJ-16 |
| Crear Contributions o ratificar | Encargo §11 |
| Editar el contrato 1.2.0 firmado, ejecutar su grafo viejo o iniciar corridas con él | DJ-37 |
| Tocar el contrato o volver a probar antes de que el recorrido §12 quede fijado | DJ-35 |
| Código, hasta que José envíe el encargo con las preguntas de D1 respondidas | Encargo §11 |

### 2.3 Piezas, dueños y estado

| Pieza | Dueño | Estado | Cita |
|---|---|---|---|
| Pipeline de `doc` | **Brain** | **IMPL roto.** `submit_intent()` lee siempre `.pipeline/.briefing` | `brain/core/intent_manager.py:2258` (definición), `:2315` (`pipeline_dir = intent_path / ".pipeline" / ".briefing"`) |
| | | El prompt de validación es de `dev` | `brain/core/intent/validation_manager.py:316` ("You are analyzing changes for a development intent.") |
| | | La detección de etapa no conoce `context` ni `curation_X` | `_detect_latest_stage` en `staging_manager.py:337`, `merge_manager.py:322`, `validation_manager.py:510`, `response_parser.py:79`; ninguno de los cuatro archivos menciona `curation` |
| | | `hydrate` comprime con `CodeCompressor` y no produce docbase | `intent_manager.py:260` (`hydrate_intent`), `:320` (`CodeCompressor(...)`). Existe un modo `docbase` en `brain/core/filesystem/files_compressor.py:20, 57` que `hydrate` no usa |
| | | `finalize` de `dev`/`doc` marca `completed` sin precondición; solo `ing`/`dis` pasan por el motor | `intent_manager.py:1865` (`finalize_intent`), `:1900-1910` (rama BSIP), `:1919` (`status = "completed"`) |
| Comparación previa, corrida vacía, marca por nivel, contrato de salida | **Brain** | **NO EXISTE** | Encargo §6 |
| Canal de inteligencia de `doc` | **Brain** o **AITAP** (P1) | **LAGUNA.** El suministro de inteligencia solo cubre ING y DIS | `brain/commands/intent/supply.py:1` ("Machine-readable ING and DIS Intelligence Supply boundary"), `:14` |
| Registro documental | **Brain** o **Nucleus** (P28) | **NO EXISTE.** Decidido como base (DJ-13) | Anexo del registro §2 y §8 |
| Señal de estado terminal hacia Nucleus | **Nucleus** y **Brain** (P49) | **NO EXISTE.** `INTENT_COMPLETE` e `INTENT_FAILED` están declarados en el bus de Brain y nadie en Brain los emite | `brain/core/server/server_event_bus.py:54-55`. Ver §4, fila C-5 |
| Disparo de `doc` en Nucleus | **Nucleus** | **NO EXISTE** | Encargo §6 |
| Identidad del intent `doc` | **Brain** | **IMPL** por nombre: `uuid3` del nombre; renombrar recalcula el id | `intent_manager.py:139`, `:998` |
| Publicación canónica de la revisión del Gene en `ing` | **Genes** | **IMPL sin llamador productivo.** No hay llamadas a `.Materialize(` fuera de pruebas en `installer/` | Búsqueda en el commit de referencia; encargo §3.4 |
| `mrg` | Dueño de MRG | **ESPEC.** Sin código: `mrg` solo aparece como valor de prueba en `installer/nucleus/internal/gravity/resolver_test.go:36, 50`. Además, GAP #M1 | `MRG_Intent_Spec_v1_0.md` l. 25-30, §9 |
| `doc` dentro del contrato del Mandate | **MANDATE** | **NO EXISTE** como `doc` por intent. El v4 exige seis Actions `ing, dis, doc, exp, dev, exp` | `installer/nucleus/internal/orchestration/mandatecontract/contract.go:115-117`; campos de cumplimiento `[ing, dis, doc, exp]` en `:208` |
| Ejecución del Mandate | **MANDATE** | **IMPL** hasta la propuesta de `dis`: el workflow despacha `ing`, espera la decisión humana, despacha `dis` y termina con `Fulfilled: false` | `installer/nucleus/internal/orchestration/temporal/workflows/mandate_execution_workflow.go:225` (`MandateDISActivity`), `:239` |
| Colisiones entre documentaciones, si algún día hay paralelo | **Impact** (verifica) y **Nucleus** (arbitra) | **NO EXISTE** | DJ-22; PD §5; I-56 |

---

## 3. Decisiones vigentes

### 3.1 Del encargo rector (2026-11-08 y 2026-11-09)

| # | Decisión | Fuente |
|---|---|---|
| DJ-29 | **Disparador.** Nucleus dispara `doc` cuando llegan a su estado terminal: `dev` (`finalize`); `ing` y `dis` (`phase_active: done` con `committed: true`); `mrg` (`merged` o `aborted`). No disparan `tst` ("no muta nada"), `exp` ("genera hallazgos y no estado") ni `asm` ("genera propuestas y no estado"). `doc` no se dispara a sí mismo. Reemplaza a DJ-17 y a DJ-28 en lo que se contradigan | Encargo §2.1 (las dos copias) |
| DJ-30 | **Idempotencia.** El disparador no busca commits ni compara. `doc` compara "el stack" contra el estado real y, si no hay diferencia, termina sin escribir. Una corrida vacía es barata | Ídem |
| DJ-31 | En `ing`, el estado terminal es posterior a la publicación canónica de la revisión del Gene, no a la propuesta | Ídem |
| DJ-32 | Los cambios que no vienen de un intent quedan fuera por ahora (P41 abierta). `doc` queda idempotente y reutilizable para un futuro disparador por reconciliación | Ídem |
| DJ-33 | Niveles: Project, Domain y Gene; Tenant y Organization, preparados. Domain y Gene, "declarados, no verificados" | Ídem |
| DJ-34 | La comparación va antes de cualquier llamada de inteligencia | Ídem |
| DJ-35 | No se toca el contrato firmado ni se vuelve a probar hasta que esté fijado el recorrido esperado de `doc` (encargo §12) | Ídem |
| DJ-36 | **Fallo del `doc`.** Si el mutador terminó bien y falla su `doc`, el `doc` se reanuda. El mutador no se repite automáticamente, porque podría duplicar sus efectos. El intent siguiente espera a que el `doc` termine. Si el mutador falla o se cancela, no se dispara `doc` | **Solo en la copia del Project** (§0.2) |
| DJ-37 | **Contrato firmado.** El encargo cambia el contrato funcional respecto del 1.2.0 firmado, que tiene un solo `doc`, después de `dis`. José no va a editar el 1.2.0 ni a iniciar otra corrida con el grafo viejo | **Solo en la copia del Project** (§0.2) |

### 3.2 Anteriores que siguen en pie (encargo §2.2; documento madre §3)

| # | Decisión |
|---|---|
| DJ-1 | El alcance es un campo de la entrada de `doc` |
| DJ-2 | La salida es un borrador, pensado para entrar después a una Contribution con activo `document` |
| DJ-4 | Quién persiste el archivo final es una dependencia externa |
| DJ-10, DJ-14 | El `docs/` del repo y la documentación que el sistema no produjo quedan fuera |
| DJ-11 | `doc` es un intent de actualización viva, tan capaz como `dev`, y reconoce movimientos y renombres |
| DJ-13 | La identidad de cada documento la da un registro gobernado aparte. El digest es evidencia de integridad, no identidad |
| DJ-16 | Los movimientos los hace el sistema. Un movimiento fuera del sistema es una anomalía pendiente de declaración y nunca se resuelve por parecido |
| DJ-18, DJ-24 | Un `doc` no dispara otro |
| DJ-19 | Si un intent falla o se cancela, no corre su `doc`. Para el fallo del propio `doc`, lo completa DJ-36 |
| DJ-20 | Dentro de un Mandate, el intent siguiente espera a que termine el `doc` |
| DJ-22 | Si algún día hay paralelo, Impact verifica las colisiones entre documentaciones |
| DJ-26 | La forma del `doc` en el contrato del Mandate (P35) la responde MANDATE |
| DJ-27 | No se mide `dev` como condición previa |

### 3.3 Reemplazadas (se conservan para leer las fuentes viejas)

| # | Texto | Reemplazada por |
|---|---|---|
| DJ-17 | "Cada intent, de cualquier tipo, deja detrás un intent doc" (madre §3) | DJ-29 |
| DJ-25 | "El doc de un exp corre igual" (madre §3) | DJ-29 (encargo §3.1) |
| DJ-28 | "Después de cada intent, del tipo que sea (ing, dis, exp, dev y los demás)" (madre §3) | DJ-29 |
| DJ-23 | "Cada doc documenta solo lo que cambió el intent anterior" | **No está reemplazada:** queda en duda por P48 (§5.1) |

---

## 4. Contradicciones y desfasajes que encontró este encargo

Se muestran las dos versiones. No se elige.

| # | Tema | Versión 1 | Versión 2 | Quién decide |
|---|---|---|---|---|
| C-1 | `exp` dispara `doc` | Pedido a MANDATE §1, punto 6: "El `doc` de un `exp` corre igual" | DJ-29: `exp` no dispara `doc`. El encargo rector §10 ya pide actualizar el pedido | Rige DJ-29 por instrucción de José. Actualizar el pedido: José |
| C-2 | Las dos copias del encargo rector | Repo: sin DJ-36, DJ-37 ni P50 | Project: con DJ-36, DJ-37 y P50 | José (X-1, §0.2) |
| C-3 | Qué despacha hoy el Mandate | PD §2 y pedido a MANDATE §1: "despacha solo `ing` y devuelve `Fulfilled: false`" (`mandate_execution_workflow.go:193-224`) | Commit de referencia: despacha `ing`, espera la decisión, despacha `dis` (`MandateDISActivity`, l. 225) y termina con `Fulfilled: false` (l. 239). Lo agregó el commit `0dad6cc` | Hecho de código. **Riesgo para DJ-37:** la siguiente Action del grafo firmado v4 es `doc` (posición 3, `contract.go:117`). Si alguien agrega su despacho, se ejecuta el grafo viejo. Dueño: MANDATE; José decide |
| C-4 | Líneas citadas en las fuentes | `contract.go:90-99` (seis Actions), `:183-185` (cumplimiento); `intent_manager.py:1910-1917` (`finalize`), `:1863` | Commit de referencia: `contract.go:115-117` y `:208`; `intent_manager.py:1865` y `:1919` | Hecho. Lo corrige el paso P0 (§8) |
| C-5 | Quién emite `INTENT_FAILED` | Encargo §3.3: declarados en el bus de Brain y nadie los emite | Sentinel emite un código `INTENT_FAILED` cuando falla el envío de un intent a Brain (`installer/sentinel/internal/eventbus/daemon.go:496`). Es un error de envío, no el estado terminal de un intent | No cambia P49. Se registra como homónimo |
| C-6 | Nombre del contrato firmado | José y DJ-37: "el 1.2.0 firmado" | Fuentes del programa: "v4", por el validador (`contract.go:115-117`). La copia del Project, §3.9, toma que son el mismo contrato y pide confirmación a José. No se verificó en la definición publicada (estado operativo, no autorizado) | José |
| C-7 | Lista de huecos del pipeline | Encargo §4: "Huecos G0 a G14" | La enumeración G0 a G14 vive en `HISTORICO/` (encargos de Brain tramo 1), que no es fuente. La spec vigente usa otra numeración: GAP #2 a #10 y dos sin número (`DOC_Intent_Spec_v1_0.md` §7) | **LAGUNA.** Dueño: José. Hasta que decida, este encargo usa la numeración de la DOC spec |
| C-8 | Formato del traspaso | Encargo §9: "el formato es el del plan v0.2 §2" | El plan v0.2 pasó a `HISTORICO/` (encargo, cabecera) | **LAGUNA.** Dueño: José. Hasta que decida, P0 usa como modelo `Traspaso_E0_Cancelada_v1_0.md` |
| C-9 | Texto del propósito frente a DJ-36 | Encargo §1: "si un intent falla o se cancela, no corre su doc y el intent se vuelve a correr hasta que termina" | DJ-36: si falla el `doc`, se reanuda el `doc` y no se repite el mutador | La copia del Project (§3.8) dice que se complementan. Sin decisión nueva |

---

## 5. Pendientes sin resolver

Ninguno se resuelve acá.

### 5.1 De José

| # | Pendiente | Bloquea | Fuente |
|---|---|---|---|
| P1 | Canal de inteligencia de `doc`: (a) respuesta por archivo asistida por una persona, (c) suministro de AITAP, u otro | D1; pasos 7 y 8 del recorrido | Madre §16; encargo §3.5 |
| P1-forma | Cuál de las cuatro formas resuelve el choque entre P1 y el disparo automático: (1) un canal automático para todas las corridas; (2) la comparación corre sola y la inteligencia queda en manos de una persona; (3) lo mecánico se separa del contenido; (4) un canal según quién lanza la corrida | D1, D6 | Encargo §3.5 |
| P48 con P34 | Qué es "el stack" de DJ-30, y si sigue vigente DJ-23 ("solo lo que cambió el intent anterior") o la corrida abarca todo el alcance | D1; paso 4 del recorrido | Encargo §3.2 |
| P49 | Cómo se entera Nucleus del estado terminal de un intent que corre en Brain. Hoy `finalize` no avisa a nadie y el watcher de Nucleus mira Mandates, no intents | D3; paso 2 del recorrido | Encargo §3.3 |
| P50 | Qué significa "reanudar" el `doc` (DJ-36): desde el paso donde falló o volviendo a correrlo entero. Por DJ-30, una corrida entera no duplica efectos. ¿Lo reanuda el sistema o una persona? | Paso 11' del recorrido | Solo en la copia del Project, §8 |
| P5 | Precondición de `finalize` para `doc` (hoy no tiene, `intent_manager.py:1919`) | D1; paso 10 del recorrido | Madre §16 |
| P3 | Formato del insumo (docbase) | D1 | Madre §16; encargo §8 |
| P4 | Nombres de archivo (`.context.json` frente a `.doc.json`, GAP #2 de la DOC spec) | D1 | Madre §16; encargo §8 |
| P10 | Motor de estado de `doc` (hoy ninguno; DOC spec §8) | D1 | Madre §16; encargo §8 |
| X-1 | Qué copia del encargo rector rige (§0.2) | La lectura de DJ-36, DJ-37 y P50 | Este encargo |

### 5.2 De MANDATE (pedido R-M1)

| # | Pendiente | Fuente |
|---|---|---|
| P35 | El `doc` por intent, ¿es una Action firmada del contrato o un paso de política del Mandate? José no la decide (DJ-26) | Pedido a MANDATE §2 |
| P36 | "Hoy los intents no corren en paralelo": ¿describe el uso actual o es una regla que el sistema tiene que garantizar? | Pedido §3 |
| P39 | "Se vuelve a correr hasta que termina": ¿lo relanza el sistema sin límite o una persona después de agotar los reintentos? Choca con `MaximumAttempts: 3` y con EM-C12 (I-52) | Pedido §3 |
| P40 | Qué documenta, según su diseño, la Action `doc` que el v4 firma en la posición 3 | Pedido §4 |

Las cuatro bloquean D6. Por DJ-37, la prueba de D6 no usa el 1.2.0 ni su grafo: necesita la versión nueva que surja de R-M1 (copia del Project, D6).

### 5.3 De otros dueños

| # | Pendiente | Dueño probable | Fuente |
|---|---|---|---|
| PD-A | Orden de `doc` respecto de `tst` bajo un Mandate agéntico. La TST spec habla de "la Action exitosa inmediatamente relevante" y no la define | Dueño de TST y MANDATE | `TST_Intent_Spec_v1_0.md` l. 239; encargo §8 |
| PD-B | Implementación de `mrg`: sin código, y GAP #M1 (origen de los `source_refs` múltiples). Bloquea D5 | Dueño de MRG | `MRG_Intent_Spec_v1_0.md` l. 25-30, §9 |
| PD-D | Cómo llega un cambio de código a una Gene Revision, si `dev` no toca `.genes/` | Genes | Encargo §8 |
| — | Publicación canónica de la revisión del Gene en `ing` (DJ-31): store IMPL, sin llamador productivo. Bloquea D4 | Genes | Encargo §3.4 |
| H-3 | La clave de Gemini que `plan` y `validate` no encuentran: Brain lee `gemini-profiles` y el onboarding solo guarda `gemini-key:default`. Causa probable, no comprobada | José decide si se resuelve en D1 o va a otro dueño (Brain, Conductor) | Traspaso E0, H-3 |

### 5.4 Fuera de alcance por ahora

| # | Pendiente | Fuente |
|---|---|---|
| P41 | Quién detecta los cambios hechos fuera de un intent | DJ-32; madre §16 |

### 5.5 Otros pendientes que el encargo rector registra

Siguen abiertos y no se tratan acá: P27 a P31 (registro documental; bloquean D2), PD-C (cómo se marca el `doc` de un `dev` no verificado por `tst`), P37-bis, P43, P45, P46, P47 (madre §16).

---

## 6. Recorrido esperado de `doc` (encargo §12): qué está fijado

| # | Paso | Estado |
|---|---|---|
| 1 | Termina un intent mutador | Fijado: DJ-29, DJ-31, DJ-24 |
| 1' | El intent falla o se cancela: no hay `doc` | Fijado: DJ-19. Quién lo relanza: **P39** |
| 2 | Nucleus se entera | **Abierto: P49** |
| 3 | Nucleus lanza `doc` con la referencia al intent y el alcance | Fijado: DJ-29, DJ-1, DJ-33 |
| 4 | `doc` arma lo que va a comparar | **Abierto: P48 y P34** |
| 5 | Comparación sin inteligencia | Fijado: DJ-30, DJ-34, DJ-13 |
| 6a / 6b | Sin diferencias, termina sin escribir / con diferencias, sigue | Fijado: DJ-30 |
| 7 | Saneo | Movimientos: DJ-13, DJ-16. Contenido: **abierto, P1 y P1-forma** |
| 8 | Validación | **Abierto: P1** |
| 9 | Salida con contrato | Fijado: DJ-2, DJ-33, encargo §5.8 |
| 10 | Cierre de `finalize` | **Abierto: P5** |
| 11 | Dentro de un Mandate, el siguiente espera | Fijado: DJ-20. Forma: **P35** |
| 11' | Falla el `doc` | Copia del Project: DJ-36, con **P50** abierta. Copia del repo: LAGUNA |
| 12 | Ningún `doc` dispara otro | Fijado: DJ-18, DJ-24 |

Mientras sigan abiertos los pasos 2, 4, 7, 8, 10 y 11', rige DJ-35.

---

## 7. Etapas D1 a D6 (encargo §7) y qué las bloquea

| Etapa | Dueño | Bloqueada por |
|---|---|---|
| D1. `doc` de punta a punta e idempotente | Brain | P1, P1-forma, P3, P4, P5, P10, P48 con P34; recorrido fijado (DJ-35); H-3 si el canal es Gemini |
| D2. Registro documental | Brain o Nucleus | D1; P27 a P31 |
| D3. Nucleus dispara `doc` al terminar `dev` y `dis` | Nucleus y Brain | D2; P49 |
| D4. Disparo después de `ing` | Nucleus, con Genes | D3; publicación canónica del Gene |
| D5. Disparo después de `mrg` | Nucleus, con el dueño de MRG | D3; `mrg` implementado (PD-B) |
| D6. `doc` dentro del Mandate | MANDATE | D3; R-M1 (P35, P36, P39, P40); P50; contrato nuevo (DJ-37) |

Las compuertas de D1 a D5 corren en el Project de prueba `tests/brain/doc-intent-tests` (en la Mac, excluido de git por `.git/info/exclude`), con el binario de Brain compilado e instalado por el flujo oficial. D6 corre en Windows. Cada etapa termina con su traspaso en `docs/ANALYSIS/BSIP/DOC/TRASPASOS/` y en el Project.

**Ninguna de las seis puede empezar con las decisiones ya tomadas.** D1 necesita, además de las respuestas de José, que el recorrido esté fijado (DJ-35).

---

## 8. Primer paso verificable: P0, verificación del estado de partida

### 8.1 Por qué este y no otro

- Ninguna etapa D1 a D6 puede empezar sin respuestas de José (§7).
- Fijar el recorrido necesita P49, P48 con P34, P1, P1-forma, P5 y P50 (§6).
- **Lo único que puede hacerse con las decisiones ya tomadas** es comprobar, sin ejecutar nada, que los hechos de código en los que se apoyan el encargo rector y este documento siguen siendo ciertos en el commit vigente. Hace falta: las fuentes citan líneas que ya se desplazaron (C-4), y el Mandate ya despacha más de lo que dicen (C-3).
- P0 no repara, no mide `dev` (DJ-27), no corre `doc`, no corre pruebas, no toca el contrato ni su grafo (DJ-35, DJ-37) y no decide nada.

**Si José entiende que leer código también es "volver a probar" en el sentido de DJ-35, P0 no corre.** En ese caso no hay ningún paso posible sin una respuesta suya. La respuesta que destraba más camino es **P49 junto con P48 y P34**, porque son los pasos 2 y 4 del recorrido y no dependen de otros dueños.

### 8.2 Qué hace

Corre 14 búsquedas de solo lectura sobre el código del commit vigente. Para cada ancla anota si el hecho **SIGUE** o **CAMBIÓ**, con la línea actual. No interpreta ni corrige: si algo cambió, lo informa.

### 8.3 Quién, dónde y con qué

| Campo | Valor |
|---|---|
| Quién la corre | El cowork que ejecute este encargo (Claude). José no corre comandos en este paso |
| Máquina | Contenedor en la nube, sobre el clon público de solo lectura `github.com/JoseVigil/bloom-development-extension`. De la Mac solo se lee `.git/refs/heads/main` por la conexión de archivos, sin terminal |
| Requisitos | `git` y `grep` en la nube. No hace falta Go, Python ni `pytest` |
| Permisos | Lectura del clon; lectura de un archivo de la Mac; escritura de archivos **nuevos** en `docs/ANALYSIS/BSIP/DOC/TRASPASOS/` y en el Project |

### 8.4 Compuerta

**Paso previo, que también es condición.** El commit del clon tiene que ser igual a `main` de la Mac.

```
git -C <clon> rev-parse HEAD
```

Ese valor se compara con el contenido de `/Users/josevigil/repos/bloom-development-extension/.git/refs/heads/main`, leído por la conexión de archivos. Si `.git/HEAD` no apunta a `refs/heads/main`, o los dos valores difieren, P0 se detiene y se le pregunta a José qué commit usar.

**Anclas.** Cada comando se corre desde la raíz del clon. La salida completa va a la evidencia.

| # | Hecho que se comprueba | Fuente que lo afirma | Comando | SIGUE si… | Lectura previa en `57c4d81` |
|---|---|---|---|---|---|
| A1 | `dev` y `doc` ignoran `mandate_id` | Encargo §3.3; madre I-22 | `grep -n '_BSIP_ENGINE_TYPES = \|_BSIP_ENGINE_TYPES and clean_mandate_id' brain/core/intent_manager.py` | Aparecen la tupla `("ing", "dis")` y la condición | l. 32 y 137 |
| A2 | El id de `doc` es `uuid3` del nombre | RV N-16 | `grep -n 'uuid.uuid3(self.INTENT_NAMESPACE' brain/core/intent_manager.py` | Hay al menos dos apariciones (creación y renombre) | l. 139 y 998 |
| A3 | `finalize` de `dev`/`doc` marca `completed` sin precondición | Encargo §4; PD §1 | `grep -n 'def finalize_intent\|_finalize_bsip_intent(intent_path\|state_data\["status"\] = "completed"' brain/core/intent_manager.py` | La rama BSIP es la única con precondición y la asignación de `completed` sigue | l. 1865, 1910, 1919 |
| A4 | `submit` lee siempre `.pipeline/.briefing` | DOC spec GAP #3 | `grep -n 'pipeline_dir = intent_path / ".pipeline" / ".briefing"' brain/core/intent_manager.py` | Aparece | l. 2315 |
| A5 | La detección de etapa no conoce las fases de `doc` | DOC spec GAP #4 | `grep -c 'curation' brain/core/intent/staging_manager.py brain/core/intent/merge_manager.py brain/core/intent/validation_manager.py brain/core/intent/response_parser.py` | Los cuatro dan 0 | 0, 0, 0, 0 |
| A6 | Prompt de validación de `dev` | DOC spec GAP #5 | `grep -n 'analyzing changes for a development intent' brain/core/intent/validation_manager.py` | Aparece | l. 316 |
| A7 | `hydrate` usa `CodeCompressor` | DOC spec §3.1 | `grep -n 'CodeCompressor(' brain/core/intent_manager.py` | Aparece dentro de `hydrate_intent` | l. 320 |
| A8 | `INTENT_COMPLETE`/`INTENT_FAILED` sin emisor en Brain | Encargo §3.3 | `grep -rn 'INTENT_COMPLETE\|INTENT_FAILED' brain/` | Solo la declaración del bus | `server_event_bus.py:54-55` |
| A9 | El v4 exige seis Actions con `doc` en la posición 3 | PD §2; madre I-53 | `grep -n 'exactly six signed Actions\|"ing", "dis", "doc", "exp", "dev", "exp"\|"ing", "dis", "doc", "exp"}' installer/nucleus/internal/orchestration/mandatecontract/contract.go` | Aparecen las tres | l. 115, 117, 208 |
| A10 | Hasta dónde despacha el Mandate | PD §2 (versión vieja); C-3 | `grep -n 'ExecuteActivity(ctx, "Mandate\|Fulfilled: false' installer/nucleus/internal/orchestration/temporal/workflows/mandate_execution_workflow.go` | Se anota la lista exacta de actividades despachadas y si alguna corresponde a `doc` | `MandateIntentActivity` (l. 193), `MandateINGCompletionActivity` (l. 212), `MandateDISActivity` (l. 225), `MandateGenActivity` (l. 242); `Fulfilled: false` en l. 239; ninguna de `doc` |
| A11 | El suministro de inteligencia solo cubre ING y DIS | Madre E7; pedido a MANDATE §1 | `sed -n '1,30p' brain/commands/intent/supply.py` | No aparece `doc` | ING y DIS (l. 1, 14) |
| A12 | `mrg` no tiene código | Encargo §3.7 | `grep -rniw 'mrg' brain/ installer/nucleus/ src/ --include=*.py --include=*.go --include=*.ts` | Solo aparece en archivos de prueba | Solo `gravity/resolver_test.go` |
| A13 | La publicación del Gene no tiene llamador productivo | Encargo §3.4 | `grep -rn '\.Materialize(' installer/ --include=*.go \| grep -v '_test.go'` | Salida vacía | Vacía |
| A14 | `plan` llama a Gemini por el router de contexto | Encargo §3.6 | `ls brain/core/context_planning/` | Existe `gemini_router.py` | Existe |

La columna "Lectura previa" es lo que vio esta sesión al preparar el encargo. **No es la evidencia de la compuerta:** la evidencia es la corrida de P0.

**La compuerta pasa si:**
1. el commit del clon es igual a `main` de la Mac;
2. los 14 comandos se ejecutaron sin error de ejecución (un `grep` sin coincidencias, con código 1, cuenta como ejecutado);
3. cada ancla tiene veredicto SIGUE o CAMBIÓ, con la línea actual;
4. la evidencia está escrita y su sha256 figura en el traspaso.

**La compuerta no pasa si** falta cualquiera de los cuatro puntos. **Un CAMBIÓ no hace fallar la compuerta:** es un resultado que se informa a José y que no se resuelve dentro de P0.

### 8.5 Evidencia que deja

| Archivo | Contenido |
|---|---|
| `docs/ANALYSIS/BSIP/DOC/TRASPASOS/P0_evidencia/anclas_<commit de 7 caracteres>.txt` | Para cada ancla: el comando exacto, la salida completa y el código de salida. Al principio, el commit del clon y el valor leído de la Mac |
| `docs/ANALYSIS/BSIP/DOC/TRASPASOS/Traspaso_P0_Estado_Partida_v1_0.md` | Tabla A1 a A14 con veredicto y línea actual; los CAMBIÓ, con las dos versiones citadas; sha256 del archivo de evidencia. Formato modelo: `Traspaso_E0_Cancelada_v1_0.md` (por C-8) |
| Lo mismo en el Project, en `ANALYSIS/BSIP/DOC/TRASPASOS/` | Copias de los dos archivos |

Los dos archivos son nuevos. No se edita ningún documento existente. Git lo hace José.

### 8.6 Qué no hace P0

No corre Brain, Nucleus, `doc`, `dev`, pruebas unitarias ni el Project de prueba. No lee `~/Library/BloomNucleus`. No toca el contrato 1.2.0 ni su grafo. No cambia código. No actualiza el encargo rector ni corrige sus citas: eso lo decide José con el traspaso en la mano.

---

## 9. Prohibiciones que rigen todo el encargo

- El contrato Genesis 1.2.0 firmado (un solo `doc`, después de `dis`) se conserva intacto: no se edita (DJ-37).
- No se ejecuta su grafo viejo ni se inicia ninguna corrida con él (DJ-37). Ver C-3: el código ya despacha hasta `dis`.
- No se toca el contrato ni se vuelve a probar hasta que el recorrido esperado de `doc` quede fijado (DJ-35).
- No se mide `dev` ni otro intent como condición previa (DJ-27).
- No se completan huecos: lo que no esté definido va como LAGUNA, con su dueño probable.
- Si dos fuentes se contradicen, se muestran las dos con cita y no se elige.
- No se decide por José: lo que dependa de él se pregunta.
- No se leen claves privadas en ningún caso.

---

## 10. Permisos que el ejecutor tiene que comprobar al arrancar

Son los que se comprobaron en la sesión que escribió este encargo (2026-11-09). Pueden no ser los tuyos.

| Permiso | Estado comprobado | Cómo se comprobó |
|---|---|---|
| Lectura de `/Users/josevigil/repos/bloom-development-extension` | Sí | Listado y copia a la sesión de las fuentes de §0.1 y de `.git/refs/heads/main` |
| Escritura de archivos nuevos en el repo | Sí, copiando el archivo de vuelta a la Mac | La entrega de este documento |
| Borrar archivos en la Mac | No | — |
| Terminal en la Mac | No | No hay herramienta de terminal en la conexión |
| Límite de profundidad | No se pueden copiar archivos más de 7 carpetas por debajo de la raíz. Los archivos de los intents dentro de `.bloom/` del Project de prueba quedan fuera; para esos, José corre los comandos, de a uno y sin líneas de comentario | Instrucción de José; no se probó en esta sesión |
| Clon de solo lectura en la nube | Sí, `HEAD` = `57c4d81` | `git clone` y `git log` |
| Lectura y escritura del Project BTIPS en `ANALYSIS/BSIP/DOC/` | Sí | Lectura de RV y del encargo rector; escritura de este documento |
| `~/Library/BloomNucleus` | No conectado y **no autorizado** | — |
| `/Users/josevigil/repos/elias-repos` | Autorizado por José, solo lectura, nunca destino de un merge. **No conectado** en esta sesión | Lista de carpetas conectadas |
| Git | Ninguna acción. Commits y push los hace José | — |
| Código en `brain/` e `installer/nucleus/` | **No autorizado** en este encargo. Según `AGENTS.md`, un pedido concreto de implementación autoriza a editar; investigar, proponer y planificar son de solo lectura; cambiar alcance, arquitectura o nombres se consulta antes | Instrucción de José |

Notas para pruebas futuras, no para P0: en la nube Go no puede bajar módulos del proxy (el cowork de E0 los trajo de GitHub con un `go.mod` alternativo fuera del repo); las pruebas de Brain necesitan `PYTHONPATH` con la raíz del repo y `installer/aitap/src`; `pytest` se instala solo en un entorno de prueba (H-4, H-5). Las pruebas funcionales de Nucleus y del RUNNER corren en Windows; en la Mac solo se revisa y compila.

---

## 11. Qué se leyó para escribir este encargo

| Fuente | Cómo |
|---|---|
| Encargo rector, copia del repo y copia del Project | Completos |
| Pedido a MANDATE | Completo |
| Documento madre v0.7 | Cabecera, §3 (decisiones), §12.3 (I-48 a I-60), §16 a §19 |
| Política por intent (PD) | Completa |
| Mapa del registro documental | Índice y §8 (P27 a P31) |
| Traspaso E0 | Completo. La evidencia de `E0_evidencia/` no se abrió |
| `DOC_Intent_Spec_v1_0.md` | Completa |
| `MRG_Intent_Spec_v1_0.md` | l. 22-32 y estados (l. 70) |
| `TST_Intent_Spec_v1_0.md` | l. 236-242 y búsqueda de "no mutación" |
| `ING_Intent_Spec_v1_1.md` | Búsqueda de publicación canónica (l. 15-17, 391, 422-434) |
| `EXP_Intent_Spec_v1_0.md`, `ASM_Intent_Spec_v1_0.md` | Búsqueda dirigida: confirman que `exp` evalúa y `asm` prepara propuestas. **No leídas completas** |
| `DEV_Intent_Spec_v1_0.md`, `DIS_Intent_Spec_v1_0.md` | Copiadas, **no leídas completas** |
| RV (Project) | Completo |
| Código, commit `57c4d81` en la nube | Solo las búsquedas de las anclas A1 a A14 y `daemon.go:470-500` de Sentinel |

Ningún documento de `HISTORICO/` se leyó.
