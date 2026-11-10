# Programa de documentación — Plan de ejecución v0.1

**Estado:** propuesta de plan. **No autoriza implementación.** Las decisiones abiertas quedan como preguntas para José, marcadas con su número.
**Fecha:** 2026-11-05
**Autoridad:** José Vigil
**Base:** `Programa_Documentacion_Documento_Madre_v0_6.md` y sus anexos: el registro documental y la política por intent (PD).
**Pedidos que acompañan a este plan:**
- `Programa_Documentacion_Encargo_Brain_Tramo1_v0_1.md`
- `Programa_Documentacion_Pedido_MANDATE_Contrato_v0_1.md`
- `Programa_Documentacion_Pedido_Impact_Colisiones_v0_1.md`

### Marcas

Las del documento madre (**IMPL**, **ESPEC**, **PROP**, **NO EXISTE**, **LAGUNA**, **REAL**). Todo lo que este plan agrega es **PROP**.

### Cómo leer las etapas

- Cada etapa tiene **entrada**, **salida**, **compuerta**, **qué no puede tocar** y **dueño**.
- La compuerta es una verificación que se ejecuta: un comando o una corrida real, con un resultado que queda registrado. Leer código o declarar "funciona" no cuenta.
- Ninguna etapa arranca si la compuerta anterior no pasó. La evidencia de la compuerta va en el registro de traspaso (§2).
- **Dueño:** **B** es Brain; **M** es MANDATE (orquestación de Nucleus y Temporal); **G** es Genes; **I** es Impact; **A** es AITAP; **Au** es Authority; **J** es una decisión de José.

---

## 0. Contradicciones con decisiones anteriores

Se muestran las dos versiones y no se elige.

| # | Versión anterior | Versión de ahora | Qué hace este plan |
|---|---|---|---|
| C-1 | Encargo v0.1, tramo 1: "Solo Brain. Sin AITAP, Nucleus ni Executor" | El pedido de ahora: "el encargo del tramo 1 (reparar pipeline de doc, **registro y disparo**)". El registro puede vivir en Nucleus si P28 se responde L-N (anexo del registro §2). El disparo dentro del Mandate es de MANDATE | Divide el pedido en tres etapas: E1 y E2 (pipeline), E3 (registro) y E4 (disparo fuera del Mandate). E3 depende de P28 para saber si es de Brain. El disparo dentro del Mandate queda en E6, que es de MANDATE |
| C-2 | Encargo v0.1 §9: "No hay corridas disparadas por cambios materiales" | DJ-12 y DJ-17: las corridas disparadas por cambios entran; cada intent deja un doc | Se usa DJ-17. El encargo de Brain se rehace con la política |
| C-3 | DJ-15: el disparo es "al terminar un `dev`" | DJ-17: después de cada intent | DJ-15 queda como caso de DJ-17 (madre v0.5) |
| C-4 | DJ-23 (P34): cada doc documenta solo lo que cambió el intent anterior | R-7: "El sistema tiene que saber todo". DJ-16: un movimiento fuera del sistema es una anomalía pendiente de declaración | Ningún doc mira lo que cambió fuera de un intent. Quién detecta esas anomalías queda como I-59 y P41 |
| C-5 | DJ-9: estado operativo no autorizado en esta sesión | Política de pruebas: el piloto real es la verificación principal | El piloto no corre en esta sesión. Lo corre el agente del encargo en su sesión, o José, sobre un Project de prueba que José elige (P42) |
| C-6 | Encargo v0.1, criterio 4: la línea base de `dev` "se ejecuta una vez antes y otra después" | Ahora: "repetida después de cada etapa compartida" | Se usa la versión de ahora (LB-0 a LB-n) |

---

## 1. Secuencia con compuertas

### 1.1 Mapa

```
E0 Preparación ──► E1 Pipeline doc ──► E2 Contrato de salida y "qué cambió" ──► E3 Registro documental
     (B, J)            (B)                     (B)                                (B o Nucleus, según P28)
                                                                                         │
E8 Paralelo + Impact ◄── E7 Genes ◄── E6 Integración al Mandate ◄── E5 Alcance ◄── E4 Disparo fuera del Mandate
     (I + quien llama)     (G, Au)        (M, A)                       (B)            (B)

Pedidos en paralelo, registrados en §5: MANDATE (R-M1), Impact (R-I1), Genes (R-G1), AITAP (R-A1), Authority (R-Au1).
```

Las etapas son secuenciales, porque E1 a E5 tocan el mismo pipeline de Brain, que comparten `dev` y `doc`. Los pedidos a otros dueños corren en paralelo desde el día uno. Una etapa que depende de un pedido no arranca sin su respuesta.

### 1.2 Etapas

#### E0 — Preparación y línea base (B, J)

| Campo | Contenido |
|---|---|
| Entrada | Documento madre v0.6; este plan; respuestas de José a P1, P3, P4, P5 y P10 (las necesita E1) y a P42 (Project de prueba) y P43 (cómo se instala pytest; §3.1) |
| Salida | (1) **LB-0**: la secuencia de `dev` corrida en el Project de prueba, con el resultado de cada paso, la lista de archivos que tocó y sus digests. (2) **PR-0**: una corrida del inventario de pruebas de §3.1, con el resultado de cada corredor. (3) Primer registro de traspaso (T-E0) |
| Compuerta G0 | Existe LB-0, con el paso donde terminó y los artefactos. Existe PR-0, con la salida de cada corredor. Si `dev` falla hoy en un paso conocido (por ejemplo, `download` rechaza sus etapas: I-46), LB-0 registra ese fallo: **la línea base es lo que pasa hoy, no lo que debería pasar** |
| No puede tocar | Código de cualquier componente |
| Pedidos que abre | R-M1, R-I1, R-G1, R-A1 y R-Au1 (§5) |

#### E1 — Pipeline de `doc` de punta a punta (B)

| Campo | Contenido |
|---|---|
| Entrada | G0 pasada; P1, P3, P4, P5 y P10 respondidas |
| Salida | T1.0 a T1.7 del encargo de Brain. Un `doc` creado por CLI recorre create → hydrate → plan → build-payload → canal (P1) → download → parse → stage → validate → merge → add-turn → finalize |
| Compuerta G1 | (a) **Piloto P-A** en el Project de prueba: termina sin intervención manual entre pasos, salvo la que defina P1, y deja al menos un borrador aplicado en una ruta que pasa `portableRelativePath`. (b) `finalize` falla en un `doc` que no cumple la precondición de P5. (c) **LB-1** igual a LB-0: ningún paso de `dev` falla que antes no fallaba y ningún archivo nuevo fuera de los esperados. (d) PR-1 igual a PR-0 |
| No puede tocar | Nucleus, AITAP, Genes, la extensión, el contrato v4, el motor de `ing` y `dis` (`IntentStateManager`, salvo lo que decida P10) |

#### E2 — Contrato de salida y entrada "qué cambió" (B)

| Campo | Contenido |
|---|---|
| Entrada | G1 pasada; DJ-23 (P34), DJ-24 (P34-bis), DJ-25 (P38) |
| Salida | T1.8 (contrato de salida), T1.9 (el `doc` recibe la lista de cambios del intent anterior) y T1.10 (un `doc` no dispara otro) |
| Compuerta G2 | (a) **Piloto P-A.2**: un `dev` modifica un archivo de código del vertical; el `doc` siguiente recibe el manifiesto de staging de ese `dev`, y su contrato de salida nombra solo lo que ese `dev` cambió. (b) Un `doc` lanzado después de un intent que no cambió nada termina con "nada que sanear" y no escribe (DJ-25). (c) Intentar lanzar un `doc` como consecuencia de otro `doc` se rechaza (DJ-24). (d) LB-2 igual a LB-0 |
| No puede tocar | El formato del ledger de `ing` (es del dueño de ING); el escritor del delta de `dis` (I-57, pedido interno de Brain al dueño de DIS); Genes |

#### E3 — Registro documental (B o Nucleus, según P28)

| Campo | Contenido |
|---|---|
| Entrada | G2 pasada; P27, P28, P29, P30 y P31 respondidas. Si P28 = L-N, la etapa pasa a ser de Nucleus y requiere su propio encargo |
| Salida | Registro gobernado aparte (O4, DJ-13) con la identidad de cada documento del sistema. Los movimientos que hace el sistema pasan por el registro |
| Compuerta G3 | (a) **Piloto P-A.1**: el sistema mueve o renombra el borrador (por `doc`, o por `dev` si P31 lo permite) y el registro conserva la misma identidad. (b) Un movimiento hecho a mano, fuera del sistema, queda marcado como anomalía pendiente de declaración; nunca se resuelve por parecido de contenido (DJ-16, X-3). (c) No hay escrituras en el store de Genes (`.genes/`). (d) LB-3 igual a LB-0 |
| No puede tocar | El contrato G1 y el store de Genes (O5 es una etapa posterior: DJ-13); Location |

#### E4 — Disparo fuera del Mandate (B)

| Campo | Contenido |
|---|---|
| Entrada | G3 pasada; P36, P37 y P39 respondidas |
| Salida | Al cerrar un intent fuera del Mandate, su `doc` se lanza según P37. Un intent que falla o se cancela no lanza `doc` (DJ-19). Para eso, `dev` y `doc` necesitan estados de fallo y cancelación, que hoy no tienen (`intent_manager.py:850-887`) |
| Compuerta G4 | (a) Un `dev` que cierra bien produce exactamente un `doc`. (b) Un `dev` forzado a fallar no produce `doc`, y su estado muestra el fallo. (c) Un `doc` que cierra no produce otro `doc`. (d) Si P36 dice "regla que el sistema garantiza": dos intents lanzados a la vez sobre el mismo Project, uno de los dos se rechaza o espera. Si dice "uso actual": se registra que pueden correr a la vez. (e) LB-4 igual a LB-0 |
| No puede tocar | El Mandate; la extensión, salvo que P37 la involucre |
| Nota | Si P37 = "no", E4 se reduce a (b) y (c) para los intents que corren dentro del Mandate |

#### E5 — Alcance Project, Domain y Gene (tramo 2) (B)

| Campo | Contenido |
|---|---|
| Entrada | G4 pasada; P2, P6 y P7 respondidas |
| Salida | T2.1 a T2.4 del encargo v0.1 |
| Compuerta G5 | (a) Un `doc` sin alcance no se crea. (b) Con alcance `domain` o `gene`, la salida dice "declarado, no verificado". (c) El piloto P-A vuelve a pasar G1 a G4 con alcance `project`. (d) LB-5 igual a LB-0 |
| No puede tocar | Genes; la inferencia de pertenencia (X-1) |

#### E6 — Integración al Mandate (M, con A y B)

| Campo | Contenido |
|---|---|
| Entrada | G5 pasada; **respuesta de MANDATE a R-M1**; decisiones de José a P35 (después de esa respuesta), P36 y P39; respuesta de AITAP a R-A1 (suministro para `doc`) |
| Salida | La versión de contrato que surja de R-M1; el workflow despacha más allá de `ing` y espera el `doc` antes del intent siguiente (DJ-20) |
| Compuerta G6 | (a) En Windows, donde corren las pruebas funcionales del RUNNER: un Mandate de prueba corre su secuencia con los `doc` en el lugar que fije la versión nueva, y cada intent espera a su `doc`. (b) Un fallo provocado se comporta según P39. (c) Los Mandates v4 ya firmados siguen validando y se comportan como antes: `mandatecontract/contract_test.go` y `mandate_execution_workflow_test.go`, más un Mandate v4 existente corrido de nuevo. (d) `go test` de Nucleus con el mismo resultado que PR-0. (e) LB-6 igual a LB-0 |
| No puede tocar | El pipeline de Brain, salvo la interfaz que pida MANDATE; Genes |

#### E7 — Conexión con Genes (G, Au)

| Campo | Contenido |
|---|---|
| Entrada | G6 pasada; respuesta de Genes a R-G1; respuesta de Authority a R-Au1 |
| Salida | La que surja de esas respuestas (O5, Contribution con activo `document`, KD). No se planifica antes de tenerlas |
| Compuerta G7 | La define el encargo de Genes. Mínimo: el store no cambia sus resultados de prueba (`gene/*_test.go`) |

#### E8 — Paralelismo y colisiones (I y quien llama)

| Campo | Contenido |
|---|---|
| Entrada | Solo si algún día los intents corren en paralelo (DJ-22); respuesta de Impact a R-I1 |
| Salida | La que surja de esa respuesta |
| Compuerta G8 | La define ese encargo. Mínimo: `go test` de Impact con el mismo resultado que PR-0 |

### 1.3 Dependencias por etapa

| Etapa | Decisiones de José | Respuestas de otros dueños | Dueño de la etapa |
|---|---|---|---|
| E0 | P42, P43 | — | B, J |
| E1 | P1, P3, P4, P5, P10 | Ninguna, salvo que P1 elija el suministro de AITAP (R-A1) | B |
| E2 | Ninguna nueva (P34, P34-bis y P38 cerradas) | Escritor del delta de `dis` (I-57), pedido interno de Brain | B |
| E3 | P27, P28, P29, P30, P31 | Genes, si P30 da precedencia al Gene | B o Nucleus |
| E4 | P36, P37, P39 | — | B |
| E5 | P2, P6, P7 | Authority o Nucleus, si P6 elige el `project_id` | B |
| E6 | P35, P36, P39, P40 | MANDATE (R-M1), AITAP (R-A1) | M |
| E7 | P25, P30 | Genes (R-G1), Authority (R-Au1) | G, Au |
| E8 | — | Impact (R-I1) | I |

---

## 2. Traspaso entre encargos

### 2.1 Reglas

1. Cada encargo termina escribiendo su registro de traspaso. Sin registro, el encargo no terminó.
2. Cada encargo empieza leyendo el registro del anterior. Frena y avisa a José si: falta el registro; la compuerta no figura como pasada; la evidencia no está o no coincide con su digest; o hay un pedido del que depende sin respuesta.
3. El registro no se edita después de escrito. Una corrección es un registro nuevo que nombra al que corrige.
4. "Qué decidió" se limita a lo que el encargo puede decidir según `AGENTS.md` (detalles de implementación dentro del pedido). Toda decisión de diseño cita la decisión de José que la habilita.

### 2.2 Formato propuesto

Un archivo Markdown por etapa, al lado del documento madre. El nombre y la carpeta los define José (P44). Ejemplo de nombre: `Traspaso_E1_Pipeline_Doc_v1_0.md`.

```markdown
# Traspaso E<n> — <nombre de la etapa>

## Identificación
- Etapa: E<n>
- Encargo: <ruta del encargo>
- Fecha:
- Quién lo ejecutó: <agente y sesión> / <persona>
- Máquina: <Mac / Windows> — Commit al que aplica: <lo indica José>

## Lectura del traspaso anterior
- Registro leído: <ruta> — sha256: <digest>
- Compuerta anterior: G<n-1> — PASÓ / NO PASÓ (si no pasó, el encargo se detiene aquí)
- Pedidos de los que depende esta etapa: <ID> — <estado> (si alguno no tiene respuesta, se detiene aquí)

## Qué hizo
- Cambios: <archivo> — <qué cambió> — <ítem del encargo (T1.x)>
- Archivos agregados que no estaban en el encargo y por qué (AGENTS.md)

## Qué decidió
- <decisión de implementación> — dentro de <ítem del encargo>
- <decisión de diseño> — habilitada por <DJ-x / P-x>

## Qué quedó abierto
- <ítem> — dueño probable — bloquea a <etapa>

## Evidencia de la compuerta
| Verificación | Comando o corrida | Resultado | Evidencia (ruta y sha256) |
|---|---|---|---|
| G<n>(a) | | PASÓ / FALLÓ | |
| Línea base LB-<n> frente a LB-0 | | igual / diferente: <qué> | |
| Pruebas PR-<n> frente a PR-0 | <comando único> | igual / diferente: <qué> | |

## Riesgos observados
- <qué se vio que podría romper algo que ya funcionaba>

## Qué necesita el próximo encargo
- Decisiones de José pendientes: <P-x>
- Pedidos pendientes: <R-x>
- Archivos o datos de entrada: <ruta>
```

---

## 3. Pruebas

### 3.1 Relevamiento: qué corredores existen hoy

Se revisó el checkout de la Mac. No se ejecutó nada.

| Componente | Corredor | Qué cubre | Dónde corre hoy | Quién lee el resultado | Estado |
|---|---|---|---|---|---|
| Brain | `pytest` sobre `brain/tests/intent/` (10 archivos) | `ing` y `dis` (ciclo de vida, transiciones, suministro, mapeo), ledger de efectos, `gen_domain`, `validate_contract` y la plantilla de comandos de la CLI | Local, a mano | Nadie definido | **IMPL.** No hay pruebas de `dev` ni de `doc`: plan, build-payload, staging, merge, download, parse y finalize no tienen prueba. `pytest` no figura en `brain/requirements.txt` ni en el entorno virtual `brain/.venv` de Python 3.12 (el de 3.14 no se revisó). `pyproject.toml` no tiene configuración de pytest |
| Brain | Scripts sueltos `tests/brain/e2e_ing_pipeline.py` y `verify_ing_pipeline.py` | Ciclo completo de `ing` contra el core real | A mano: `python3 tests/brain/e2e_ing_pipeline.py` (docstring) | Quien lo corre | **IMPL.** El script crea `.bloom/` en la raíz del repo (`e2e_ing_pipeline.py:25-27`): escribe en el repo al correr |
| Brain | `npm run test:python-install` → `python -m core verify` | Instalación de Python | Local | — | IMPL; no se verificó qué verifica |
| Nucleus | `go test` (estándar de Go) | Al menos 30 archivos `_test.go` en `internal/orchestration` (contrato, firma, watcher, workflows, actividades, comandos, estado) y 5 en `internal/gene` | Local. Los scripts de build (`scripts/build-darwin.sh`) no corren pruebas | Nadie definido | **IMPL** |
| Nucleus | Pruebas de aceptación en `internal/orchestration/acceptance/` | E2E de `gen`, compuerta 2 de RUNNER CORE, Gene G2 | Solo si se activan por variables de entorno; si no, se saltean (`MANDATE_GEN_E2E_OPT_IN=1`, `RUNNER_CORE_GATE2_ROOT`) | Quien las activa | **IMPL**, opt-in. Según José, las pruebas funcionales de RUNNER CORE corren en Windows y en la Mac solo se revisa y compila |
| Impact | `go test` | 4 archivos: evaluación, CLI, logger y telemetría; carpeta `testdata/` | Local | Nadie definido | **IMPL** |
| Extensión | `npm test` | `pretest` compila y corre `eslint`; después `node test-installation.js` | — | — | **Roto:** `test-installation.js` no está en la raíz del repo |
| Extensión | `.vscode-test.mjs` (`out/test/**/*.test.js`) | — | — | — | **NO EXISTE:** no hay carpeta de pruebas en `src/` ni en `out/`, y `@vscode/test-cli` no está entre las dependencias de desarrollo |
| Extensión | `npm run test:gravity-parser` | Parser de expresiones Gravity (`contracts/gravity/parser.test.ts`) | Local | — | **IMPL** |
| Backend (Authority; fuera de los tres pedidos) | `npm test` → `vitest run` en `backend/` | `backend/test/` | Local | — | **IMPL** |
| Integración continua | — | — | — | — | **NO EXISTE:** no hay `.github/` en la raíz. `AGENTS.md` exige un pedido expreso de José para tocar pipelines o CI |

**Resumen:** hay corredores para `ing`, `dis`, Nucleus e Impact. No hay ninguno para `dev`, `doc` ni la extensión. Ninguno tiene definido quién lee el resultado. Todo se corre a mano y en local.

### 3.2 Política propuesta (PROP, para que José decida)

1. **Ninguna prueba sin dónde corre y quién lee el resultado.** Cada prueba atada a una compuerta se registra con cuatro datos: corredor, máquina (Mac o Windows), comando, y quién lee el resultado (el agente del encargo siguiente, al leer el traspaso, y José). Una prueba sin esos cuatro datos no cuenta para ninguna compuerta.
2. **Pocas pruebas atadas a la compuerta.** Por etapa, solo las verificaciones de §1.2 (entre dos y cinco). El resto de las pruebas que existan no bloquea: se corren en PR-n y se informan en el traspaso.
3. **El piloto real es la verificación principal.** P-A (E1), P-A.2 (E2), P-A.1 (E3) y el Mandate de prueba (E6) corren sobre el Project de prueba (P42), no sobre datos simulados. Una prueba unitaria no reemplaza al piloto en ninguna compuerta.
4. **Línea base de `dev` después de cada etapa compartida.** E1 a E5 tocan managers que usa `dev`. Después de cada una se corre LB-n y se compara con LB-0. La comparación mira el paso donde termina, los archivos que toca y sus digests. Si LB-0 ya fallaba en un paso, la regla es "no falla antes ni distinto".
5. **Un comando único que corra todo.** Corre, en orden: las pruebas de Brain, `go test` de Nucleus, `go test` de Impact, el parser Gravity y la comparación LB-n contra LB-0. Escribe un solo informe con el resultado de cada parte. Cuatro cosas son decisión de José: el nombre y el lugar del comando (P45); cómo se instala `pytest` (P43); si las pruebas de aceptación opt-in entran; y si el comando corre también en Windows. Sin la palabra "bootstrap" en el nombre.
6. **Las pruebas no escriben en el repo.** Corren sobre carpetas temporales o sobre el Project de prueba. El script `e2e_ing_pipeline.py`, que crea `.bloom/` en la raíz, queda afuera del comando hasta que alguien lo corrija. Esa corrección no es de este programa.
7. **El resultado de la compuerta es un archivo, no una afirmación.** El informe del comando único y la evidencia del piloto van con su digest al traspaso.

---

## 4. Riesgos arquitectónicos por etapa

| Etapa | Qué puede romper en lo que ya funciona | Cómo lo detecta la compuerta | Qué no detecta |
|---|---|---|---|
| E0 | Nada: no cambia código. Hay un riesgo de lectura: tomar como "funciona" algo que hoy falla | LB-0 registra el fallo actual tal como es | — |
| E1 | **`dev`:** parse, stage, validate, merge, download, plan y build-payload son compartidos. **Identidad (T1.0):** list, get, los inspectores, recovery, download y la extensión leen `uuid` y `type`. **Merge:** aplica archivos reales sobre documentación existente del proyecto | LB-1 frente a LB-0; G1(a) en el Project de prueba; `brain intent list` y `get` sobre los intents que creó LB-0 | La extensión: no tiene pruebas (§3.1). Requiere una comprobación manual de José (P46) |
| E2 | La lista de cambios de `dev` (`.staging_manifest.json`) puede no distinguir lo aplicado de lo omitido (anexo PD §3) | G2(a) compara el contrato de salida con los archivos que realmente cambiaron en disco | Los cambios de los escritores que no son intents (C-4) |
| E3 | Un registro mal sincronizado deja documentos "huérfanos" o con dos identidades. Riesgo del estado intermedio: el Gene apunta a la ruta vieja (`ASSET_MISSING`, `assets.go:86, 97`) | G3(a), G3(b) y G3(c) | La precedencia entre el registro y el Gene si P30 no se responde |
| E4 | Agregar estados de fallo y cancelación a `dev` y `doc` cambia el schema de estado que leen la extensión y los inspectores. Un disparo mal hecho genera cadenas de `doc` | G4(c) para las cadenas; LB-4; `list` y `get` sobre intents viejos | La extensión (P46) |
| E5 | Un alcance obligatorio rompe los intents creados sin alcance | G5(a) y G5(c); LB-5 | — |
| E6 | Los Mandates v4 firmados, y la idempotencia y el reintento del workflow (`MaximumAttempts: 3`; EM-C12) | G6(c) y G6(d); un Mandate v4 existente corrido de nuevo en Windows | La interacción entre varios Mandates a la vez, si P36 no se responde |
| E7 | El digest canónico del store, `head.json` y el CAS por generación | `gene/*_test.go` con el mismo resultado que PR-0 | Lo que defina el encargo de Genes |
| E8 | El contrato `impact/1` y los tres evaluadores actuales | `go test` de Impact con el mismo resultado que PR-0 | Lo que defina el encargo de Impact |

---

## 5. Pedidos a otros dueños

Corren en paralelo. El estado se actualiza en cada traspaso. Una etapa que depende de un pedido no avanza sin su respuesta.

| ID | Dueño | Qué se pide | Archivo | Bloquea | Estado |
|---|---|---|---|---|---|
| R-M1 | MANDATE | Cambio de contrato bajo DJ-17: P35 (dos opciones con consecuencias), P36, P39, P40, despacho más allá de `ing` y espera del `doc` | `Programa_Documentacion_Pedido_MANDATE_Contrato_v0_1.md` | E6; las decisiones de José a P35 | **Redactado, sin enviar** |
| R-I1 | Impact | Las siete preguntas del anexo PD §5.3 | `Programa_Documentacion_Pedido_Impact_Colisiones_v0_1.md` | E8 | **Redactado, sin enviar** |
| R-G1 | Genes | P25 (documento compartido entre Genes); P30 (precedencia entre registro y Gene en el estado intermedio); si aceptaría continuidad declarada (O5) más adelante; diseño de la KD | No redactado | E3 (si P30 involucra al Gene), E7 | **No redactado.** En esta entrega no se pidió |
| R-A1 | AITAP | Suministro de inteligencia para `doc` (hoy solo `{ing, dis, gen}`) | No redactado | E1 si P1 = (c); E6 | **No redactado** |
| R-Au1 | Authority | Emisor productivo del `RatificationEnvelope`; escritor de bindings de Repository | No redactado | E7 | **No redactado** |
| R-B1 | Brain, dueño de DIS (interno) | Quién escribe `.domain_graph_delta.json` (I-57) | No redactado | El `doc` de un `dis` en E2 | **No redactado** |

Formato de cada actualización: `<fecha> — <ID> — <estado: redactado / enviado / respondido / rechazado> — <ruta de la respuesta> — <qué desbloquea>`.

---

## 6. Preguntas nuevas para José

| ID | Pregunta | Etapa |
|---|---|---|
| P40 | La Action `doc` que el v4 firma en la posición 3, ¿es el `doc` del `dis` según DJ-17, o es otra cosa? | E6 |
| P41 | ¿Quién detecta los cambios hechos fuera de un intent (escritores de Brain y de la extensión, Git, movimientos a mano), si cada `doc` mira solo lo que cambió su intent? (C-4) | E3, E4 |
| P42 | ¿Cuál es el Project de prueba de los pilotos, y en qué máquina? | E0 |
| P43 | ¿Cómo se instala `pytest`: en `requirements.txt`, en un archivo aparte de desarrollo, o de otra forma? Es una dependencia de Brain | E0 |
| P44 | ¿Dónde viven los registros de traspaso y cómo se nombran? | E0 |
| P45 | Nombre y lugar del comando único de pruebas; si incluye las pruebas opt-in; si corre también en Windows | E0 |
| P46 | La extensión no tiene pruebas. ¿Quién comprueba, y cómo, que no se rompe en E1 y E4? | E1, E4 |
