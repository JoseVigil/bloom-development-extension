# Programa de documentación — Plan de ejecución v0.2

**Estado:** propuesta de plan. **No autoriza implementación.**
**Fecha:** 2026-11-07
**Autoridad:** José Vigil
**Reemplaza a:** `Programa_Documentacion_Plan_Ejecucion_v0_1.md`, que se conserva como histórico.
**Base:** `Programa_Documentacion_Documento_Madre_v0_7.md` y sus anexos.

## 0. Qué cambia respecto de v0.1

José decidió el 2026-11-07:

- "Cancelá la etapa E0. No se mide dev como condición previa."
- "El intent doc lo lanza el propio sistema después de cada intent, del tipo que sea (ing, dis, exp, dev y los demás), y sanea lo que hizo el intent anterior."
- "Rehacé el plan en torno a reparar y extender doc con esa política como base, no a dev."
- "Si creés que reparar doc puede romper algo de lo que ya funciona, decime qué es y cómo se verifica, y decido yo si se mide. No propongas etapas que no pedí."

Consecuencias en el plan:

1. **E0 desaparece.** Lo que se llegó a hacer en E0 queda en su registro de traspaso, marcado como cancelado (`TRASPASOS/Traspaso_E0_Cancelada_v1_0.md`).
2. **Ninguna compuerta exige medir `dev`.** Las líneas base (LB-n) se eliminan. Lo que reparar `doc` puede romper está en §4, cada riesgo con su forma de verificarlo. José decide en cada caso si se mide.
3. **Las etapas son solo las de reparar y extender `doc`.** Las antiguas E7 (Genes) y E8 (Impact) dejan de ser etapas: ninguna repara ni extiende `doc` en este programa. Lo que se les preguntó queda en §5 como pedidos en paralelo, con el estado que tenían.
4. **El disparo pasa a ser parte del núcleo.** Desde el principio se diseña para cada tipo de intent, no solo para `dev`.

---

## 1. Etapas con compuertas

**Dueños:** **B** es Brain; **M** es MANDATE; **J** es José.

```
E1 Reparar el pipeline de doc ──► E2 Contrato de salida y "qué cambió" ──► E3 Registro documental
          (B)                                (B)                          (B o Nucleus, según P28)
                                                                                     │
          E6 doc dentro del Mandate ◄── E5 Alcance Project, Domain y Gene ◄── E4 El sistema lanza doc después de cada intent
               (M, con B)                         (B)                                    (B)
```

Ninguna etapa arranca si la compuerta anterior no pasó. Toda compuerta corre sobre el Project de prueba `tests/brain/doc-intent-tests` (P42), en la Mac, con el binario de Brain que se compila e instala por el flujo oficial.

### E1 — Reparar el pipeline de `doc` (B)

| Campo | Contenido |
|---|---|
| Entrada | P1, P3, P4, P5 y P10 respondidas. Para P1, ver además H-3 (§4) |
| Salida | T1.0 a T1.7 del encargo de Brain. Un `doc` recorre create → hydrate → plan → build-payload → canal → download → parse → stage → validate → merge → add-turn → finalize |
| Compuerta G1 | (a) **Piloto P-A:** un `doc` sobre el vertical de Gravity del Project de prueba llega de create a finalize y deja al menos un borrador aplicado en una ruta portable. (b) `finalize` rechaza un `doc` que no cumple la precondición de P5. (c) Las verificaciones de §4 que José decida medir |
| No puede tocar | Nucleus, AITAP, Genes, la extensión, el contrato v4 |

### E2 — Contrato de salida y entrada "qué cambió" (B)

| Campo | Contenido |
|---|---|
| Entrada | G1 pasada |
| Salida | T1.8 a T1.10: el `doc` recibe la lista de cambios del intent anterior, documenta solo eso (DJ-23), declara qué intent sanea, y no lanza otro `doc` (DJ-24) |
| Compuerta G2 | (a) **Piloto P-A.2:** el `doc` que sigue a un intent que cambió archivos del Project de prueba nombra en su contrato de salida solo esos archivos. (b) Un `doc` que sigue a un intent sin cambios termina con "nada que sanear" y no escribe (DJ-25). (c) Intentar lanzar un `doc` desde otro `doc` se rechaza. (d) Las verificaciones de §4 que José decida medir |
| No puede tocar | El formato del ledger de `ing`; el delta de `dis` (pedido R-B1) |

### E3 — Registro documental (B o Nucleus, según P28)

| Campo | Contenido |
|---|---|
| Entrada | G2 pasada; P27 a P31 respondidas |
| Salida | T1.11: registro gobernado aparte (O4, DJ-13). Los movimientos que hace el sistema pasan por el registro |
| Compuerta G3 | (a) **Piloto P-A.1:** un movimiento o renombre hecho por el sistema conserva la identidad del documento. (b) Un movimiento hecho a mano queda como anomalía pendiente de declaración y no se resuelve por parecido (DJ-16). (c) Ninguna escritura en `.genes/` |
| No puede tocar | El store y el contrato de Genes; Location |

### E4 — El sistema lanza `doc` después de cada intent (B)

| Campo | Contenido |
|---|---|
| Entrada | G3 pasada. P36 y P39 respondidas. P37-bis respondida: qué pieza lanza el `doc` y si vale también para los intents corridos a mano |
| Salida | T1.12 a T1.15. Cuando cualquier intent termina bien, el sistema lanza su `doc`: `ing`, `dis`, `dev`, y `exp` cuando exista. Si un intent falla o se cancela, no se lanza `doc` (DJ-19). `dev` y `doc` pasan a tener estados de fallo y cancelación |
| Compuerta G4 | En el Project de prueba: (a) un `dev` que cierra bien produce exactamente un `doc`; (b) un `ing` o un `dis` que cierra bien produce exactamente un `doc`; (c) un intent forzado a fallar no produce `doc` y muestra el fallo; (d) un `doc` no produce otro; (e) la serie se comporta según P36 |
| No puede tocar | El Mandate. La extensión, salvo que P37-bis la involucre |
| Límite actual | `exp` no produce resultado y `asm`, `mrg` y `tst` no existen en código (anexo PD §1). Hasta que existan, G4 solo puede probar `ing`, `dis` y `dev` |

### E5 — Alcance Project, Domain y Gene (B)

| Campo | Contenido |
|---|---|
| Entrada | G4 pasada; P2, P6 y P7 respondidas |
| Salida | T2.1 a T2.4 del encargo v0.1: el alcance como campo de la entrada (DJ-1) |
| Compuerta G5 | (a) Un `doc` sin alcance no se crea. (b) Con alcance `domain` o `gene`, la salida dice "declarado, no verificado". (c) P-A y G4(a) vuelven a pasar con alcance `project` |
| No puede tocar | Genes; la inferencia de pertenencia |

### E6 — `doc` dentro del Mandate (M, con B)

| Campo | Contenido |
|---|---|
| Entrada | G5 pasada; respuesta de MANDATE a R-M1; decisión de José a P35 después de esa respuesta; P36, P39 y P40; respuesta de AITAP a R-A1, si P1 la requiere |
| Salida | La versión de contrato que surja de R-M1. Dentro de un Mandate, cada intent espera a su `doc` antes del siguiente (DJ-20) |
| Compuerta G6 | (a) En Windows, donde corren las pruebas funcionales del RUNNER: un Mandate de prueba corre con un `doc` después de cada intent y respeta la espera. (b) Un fallo provocado se comporta según P39. (c) Las verificaciones de §4 que José decida medir |
| No puede tocar | El pipeline de Brain, salvo la interfaz que pida MANDATE |

---

## 2. Traspaso entre encargos

Se mantiene el de v0.1 §2, con un solo cambio: el formato pierde la fila de línea base de `dev`. Las reglas siguen igual:
- cada encargo termina con su registro;
- cada encargo empieza leyendo el anterior y frena si falta, si la compuerta no pasó o si un pedido del que depende no tiene respuesta;
- un registro no se edita después de escrito.

**Lugar:** `docs/ANALYSIS/BSIP/DOC/TRASPASOS/` en el repo y `ANALYSIS/BSIP/DOC/TRASPASOS/` en el Project (P44, respondida).

**Formato:**

```markdown
# Traspaso E<n> — <nombre de la etapa>

## Identificación
- Etapa / Encargo / Fecha / Quién lo ejecutó / Máquina
- Código: commit del repo y versión del binario de Brain usado

## Lectura del traspaso anterior
- Registro leído (ruta y sha256)
- Compuerta anterior: PASÓ / NO PASÓ (si no pasó, se frena acá)
- Pedidos de los que depende: estado (si alguno no tiene respuesta, se frena acá)

## Qué hizo
## Qué decidió (cada decisión de diseño cita la DJ o la P que la habilita)
## Qué quedó abierto (dueño probable y etapa que bloquea)

## Evidencia de la compuerta
| Verificación | Comando o corrida | Resultado | Evidencia (ruta y sha256) |

## Verificaciones de riesgo (§4) que José pidió medir y su resultado
## Qué necesita el próximo encargo
```

---

## 3. Pruebas

- **Relevamiento:** se mantiene el de v0.1 §3.1. La corrida de referencia de las pruebas que ya existen es PR-0, hecha en la nube el 2026-11-06 sobre el commit `21a00dc`. Está en el traspaso de E0. Sirve como punto de comparación para el riesgo R-4 (§4), si José decide medirlo.
- **Política:** se mantiene la de v0.1 §3.2, sin el punto 4 (la línea base de `dev`). El piloto real sobre el Project de prueba sigue siendo la verificación principal de cada compuerta.

---

## 4. Lo que reparar `doc` puede romper, y cómo se verifica

José decide en cada caso si se mide.

| # | Qué puede romper | Por qué | Cómo se verifica | Etapa |
|---|---|---|---|---|
| R-1 | `dev` | `doc` comparte con `dev` parse, stage, validate, merge, download, plan, build-payload y submit. T1.2 a T1.5 cambian esos managers | Correr un `dev` en el Project de prueba después de E1 y E2. Hoy corta en `plan` por H-3, así que solo se puede comparar hasta ahí, salvo que se resuelva H-3. `dev` no tiene pruebas automáticas | E1, E2 |
| R-2 | `list`, `get`, inspector, recovery, download y la extensión, que leen la identidad de los intents | T1.0 toca la forma en que se identifica un intent | `brain intent list` y `brain intent get` sobre el intent `dev` que ya existe en el Project de prueba (`9f7d9b50-…`), antes y después. Para la extensión, una comprobación a mano (P46) | E1 |
| R-3 | La extensión e inspectores que leen el estado de `dev` y `doc` | T1.12 agrega estados de fallo y cancelación | `list` y `get` sobre intents viejos y nuevos; la extensión a mano (P46) | E4 |
| R-4 | `ing` y `dis` | El disparo de E4 se engancha al cierre de todos los intents, incluido el cierre BSIP de `ing` y `dis` (`intent_manager.py:1900-1904`) | Las pruebas de Brain (`brain/tests`), comparadas con PR-0: 43 pasan y 2 fallan desde antes | E4 |
| R-5 | Documentación real de los Projects | Si el sistema lanza `doc` solo, el merge escribe sin que nadie lo pida. En un Project real (por ejemplo, elias-repos) podría pisar documentos | Las compuertas corren solo en el Project de prueba. Qué protección necesita un Project real lo decide José antes de E4 | E4 |
| R-6 | Los Mandates v4 ya firmados | E6 cambia el contrato o el workflow | `go test` de `mandatecontract` y `temporal/workflows` (pasan en PR-0), más un Mandate v4 existente corrido de nuevo en Windows | E6 |
| R-7 | El store de Genes | El registro de E3 vive al lado de los Genes | G3(c): ninguna escritura en `.genes/` | E3 |

**Bloqueante, no riesgo — H-3.** El `plan` de Brain busca la clave de Gemini en `gemini-profiles` del vault, y el onboarding solo guarda `gemini-key:default`. El `doc` también llama a `plan` y a `validate`. Mientras esto no se resuelva, o mientras P1 no elija otro canal, el piloto P-A de G1 corta igual que cortó el `dev`.

---

## 5. Pedidos a otros dueños

| ID | Dueño | Qué se pide | Bloquea | Estado |
|---|---|---|---|---|
| R-M1 | MANDATE | Cambio de contrato: P35, P36, P39, P40 | E6 | Redactado, sin enviar |
| R-A1 | AITAP | Suministro de inteligencia para `doc` | E1 si P1 lo elige; E6 | No redactado |
| R-B1 | Brain, dueño de DIS | Quién escribe `.domain_graph_delta.json` | G4(b) para `dis` | No redactado |
| R-I1 | Impact | Las siete preguntas sobre colisiones (DJ-22) | Ninguna etapa de este plan | Redactado, sin enviar |
| R-G1, R-Au1 | Genes, Authority | P25, P30, O5, KD; RatificationEnvelope | E3 solo si P30 involucra al Gene | No redactados |

---

## 6. Preguntas para José

| ID | Pregunta | Bloquea |
|---|---|---|
| **P37-bis** | "Lo lanza el propio sistema": ¿qué pieza lo lanza fuera del Mandate (Brain al cerrar el intent, u otra)? ¿Vale también para un intent corrido a mano por CLI? | E4 |
| P1, P3, P4, P5, P10 | Las del encargo de Brain | E1 |
| H-3 | ¿Se resuelve dentro de E1 (P1) o queda para otro dueño? | G1 |
| R-1 a R-7 | Cuáles se miden | Cada compuerta |
