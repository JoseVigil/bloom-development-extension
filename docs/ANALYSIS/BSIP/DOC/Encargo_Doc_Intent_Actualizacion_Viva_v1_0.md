# Encargo — Intent `doc` de actualización viva sobre Project, Domain y Gene

**Estado:** encargo guardado con las respuestas de José del 2026-11-09, más la corrección de DJ-36 y DJ-37 del mismo día. **No autoriza implementación:** quedan abiertas P1 (forma), P48, P34, P49 y P50.
**Fecha:** 2026-11-09 (borrador del 2026-11-08)
**Autoridad:** José Vigil
**Reemplaza, como documento activo:** `Programa_Documentacion_Plan_Ejecucion_v0_1.md` y `v0_2.md`, y `Programa_Documentacion_Encargo_Brain_Tramo1_v0_1.md` y `v0_2.md`. Esos cuatro pasan a `docs/ANALYSIS/BSIP/DOC/HISTORICO/` y a `ANALYSIS/BSIP/DOC/HISTORICO/` en el Project. No se borra nada.
**Se apoya en la investigación ya hecha** (§10), que sigue vigente.

### Marcas

- **IMPL:** existe en código.
- **ESPEC:** solo está especificado.
- **NO EXISTE:** no hay código ni especificación.
- **LAGUNA:** no está definido; se indica el dueño probable.

---

## 1. Propósito

La documentación del sistema tiene que estar siempre actualizada respecto de lo que los intents cambian en la infraestructura. El intent `doc` es la pieza que la mantiene. Este encargo define:
- cuándo se dispara;
- qué tiene que hacer cada vez que corre;
- sobre qué niveles de la infraestructura trabaja;
- en qué orden se construye, con una compuerta por etapa;
- qué queda registrado como pendiente, sin resolver.

Los cinco niveles de la infraestructura son Tenant, Organization, Project, Domain y Gene. Este encargo trabaja Project, Domain y Gene, y deja preparados Tenant y Organization.

**Por qué `doc` corre después de cada intent** (José, 2026-11-09):

> El intent que termina es el que sabe qué cambió. doc existe para sanear todo lo que hizo ese intent, y lo hace cada vez que uno termina. Resuelve un problema grave de los sistemas de desarrollo, que es la inconsistencia de la documentación. Sé que multiplica el consumo de tokens y lo acepto. El intent siguiente se arma con esa documentación, así que tiene que estar saneada antes de que corra. Dentro de un Mandate, el intent siguiente espera a que termine el doc. Si un intent falla o se cancela, no corre su doc y el intent se vuelve a correr hasta que termina.

Este texto dice "cada intent". La regla operativa es DJ-29: disparan `dev`, `ing`, `dis` y `mrg`; no disparan `tst`, `exp` ni `asm`, porque no cambian estado. Se registran las dos formulaciones; DJ-29 es la que fija el disparador.

---

## 2. Decisiones de José que rigen el encargo

### 2.1 Nuevas (2026-11-08)

**DJ-29. Disparador.** Reemplaza a DJ-17 ("cada intent, de cualquier tipo") y a DJ-28 en lo que se contradigan.
- Nucleus dispara `doc` cuando uno de estos intents llega a su estado terminal:
  - `dev`: `finalize`.
  - `ing` y `dis`: `phase_active: done` con `committed: true`.
  - `mrg`: `merged` o `aborted`.
- No disparan `doc`:
  - `tst`, porque no muta nada;
  - `exp`, porque genera hallazgos y no estado;
  - `asm`, porque genera propuestas y no estado.
- `doc` no se dispara a sí mismo.

**DJ-30. Idempotencia.**
- No se mide si el intent modificó archivos. El disparador no busca commits ni compara nada.
- `doc` compara el stack contra el estado real y, si no hay diferencia, termina sin escribir.
- Una corrida vacía es barata.

**DJ-31. Evento correcto en `ing`.** El estado terminal tiene que ser posterior a la publicación canónica de la revisión del Gene, no a la propuesta.

**DJ-32. Cambios que no vienen de un intent.** Quedan fuera de alcance por ahora; P41 sigue abierta. El diseño tiene que dejar `doc` idempotente y reutilizable, para que más adelante se pueda agregar un disparador por reconciliación sin rediseñar.

**DJ-33. Niveles.**
- El encargo cubre Project, Domain y Gene, y deja preparados Tenant y Organization.
- La razón: la verdad de Tenant y Organization (cuentas, membresías, roles) vive en el servidor, y Nucleus solo la verifica. `doc` no puede contrastarla contra el filesystem local.
- Domain y Gene todavía no se pueden verificar. `doc` los marca como "declarados, no verificados", no como estado vigente.

**DJ-34. La comparación va antes de cualquier llamada de inteligencia** (José, 2026-11-09). Confirma la consecuencia de DJ-30 señalada en §3.6.

**DJ-35. No se toca el contrato firmado ni se vuelve a probar** hasta que esté fijado el recorrido esperado de `doc` (§12) (José, 2026-11-09).

**DJ-36. Fallo del `doc`** (José, 2026-11-09). Corrige el texto de §1 y completa DJ-19:
- Si el intent mutador terminó bien y falla su `doc`, el `doc` se reanuda.
- El intent mutador no se repite automáticamente, porque eso podría duplicar sus efectos.
- El intent siguiente espera hasta que el `doc` termine.
- Si el mutador falla o se cancela, no se dispara `doc`.

**DJ-37. Contrato firmado** (José, 2026-11-09):
- Este encargo cambia el contrato funcional respecto del 1.2.0 firmado, que contiene un solo `doc`, después de `dis`.
- José no va a editar el 1.2.0 ni a iniciar otra corrida con el grafo viejo.

### 2.2 Anteriores que siguen vigentes

| # | Decisión |
|---|---|
| DJ-1 | El alcance es un campo de la entrada de `doc` |
| DJ-2 | La salida es un borrador, pensado para entrar después a una Contribution con activo `document` |
| DJ-4 | Quién persiste el archivo final es una dependencia externa |
| DJ-10, DJ-14 | El `docs/` del repo y la documentación de usuario que el sistema no produjo quedan fuera |
| DJ-11 | `doc` es un intent de actualización viva, tan capaz como `dev`, y reconoce movimientos y renombres |
| DJ-13 | La identidad de cada documento la da un registro gobernado aparte. El digest es evidencia de integridad, no identidad |
| DJ-16 | Los movimientos de documentos los hace el sistema. Un movimiento hecho fuera del sistema es una anomalía pendiente de declaración y nunca se resuelve por parecido |
| DJ-18, DJ-24 | Un `doc` no dispara otro |
| DJ-19 | Si un intent falla o se cancela, no corre su `doc`. Lo completa DJ-36 para el caso en que falla el `doc` |
| DJ-20 | Dentro de un Mandate, el intent siguiente espera a que termine el `doc` |
| DJ-22 | Si algún día los intents corren en paralelo, Impact verifica las colisiones entre documentaciones |
| DJ-26 | La forma del `doc` en el contrato del Mandate (P35) la responde MANDATE |
| DJ-27 | No se mide `dev` como condición previa |

---

## 3. Contradicciones con decisiones anteriores y con el código

Se muestran las dos versiones. Las que necesitan respuesta de José están marcadas con **→**.

1. **`exp`.**
   - DJ-25 (2026-11-05): "el doc de un exp corre igual".
   - DJ-29: `exp` no dispara `doc`.
   - DJ-29 es posterior y reemplaza a DJ-25.

2. **→ Alcance de cada corrida.**
   - DJ-23 (P34): "cada doc documenta solo lo que cambió el intent anterior".
   - DJ-30: "doc compara el stack contra el estado real".
   - Si "el stack" es toda la documentación del alcance, la corrida ya no se limita a lo que cambió el intent anterior. **P48:** ¿qué es "el stack", y DJ-23 sigue vigente?

3. **→ Quién se entera del estado terminal.**
   - DJ-29: Nucleus dispara `doc`.
   - Código: `dev` corre en Brain, y su `finalize` no avisa a nadie (`intent_manager.py:1863`, sin enganche).
   - Los eventos `INTENT_COMPLETE` e `INTENT_FAILED` del bus de Brain están declarados, pero nadie los emite (`core/server/server_event_bus.py`).
   - Un `dev` corrido a mano ignora `mandate_id` (`intent_manager.py:97`), y el watcher de Nucleus mira Mandates, no intents.
   - Hoy Nucleus no tiene forma de saber que un `dev`, un `ing` o un `dis` terminó fuera de un Mandate. **P49:** ¿cómo se entera Nucleus? Hay que decidir de quién es la señal. Dueño probable: Nucleus y Brain.

4. **El evento de `ing` no existe hoy.**
   - DJ-31: el terminal de `ing` tiene que ser posterior a la publicación canónica de la revisión del Gene.
   - Código: `ing` llega a `done` en Brain (`intent_types.py:135-141`) sin publicar nada en el store de Genes. La materialización física está pendiente y no hay un llamador productivo de `Materialize` (relevamiento RG).
   - Hasta que exista esa publicación, `doc` no se puede disparar después de un `ing`. Queda bloqueado por Genes.

5. **→ El canal de inteligencia frente al disparo automático.**
   - P1, opción (a): respuesta por archivo, asistida por una persona.
   - DJ-29: Nucleus dispara `doc` sin intervención.
   - Si `doc` necesita una persona para obtener la respuesta, cada disparo automático queda esperándola. Hay cuatro formas de resolverlo; José elige una (**P1-forma**, abierta):
     1. **Un canal automático para todas las corridas:** el suministro de AITAP (P1, opción c) o las llamadas directas de `plan` y `validate` a Gemini. Con AITAP, el encargo depende de R-A1. Con Gemini directo, la inteligencia queda fuera de AITAP y antes hay que resolver H-3.
     2. **La comparación corre sola y la inteligencia queda en manos de una persona.** Si no hay diferencias, la corrida termina sola. Si las hay, `doc` queda en un estado visible de "pendiente de respuesta" hasta que una persona complete el paso. Mientras tanto, la documentación queda desactualizada, y dentro de un Mandate el intent siguiente espera (DJ-20). Hoy no existe un estado de espera para `dev` ni para `doc`.
     3. **Lo mecánico se separa del contenido.** Corren sin inteligencia los movimientos y renombres en el registro, la actualización de digests y del contrato, y la marca de "desactualizado" en un documento cuya fuente cambió. Reescribir el contenido va por el canal de P1. Así hay dos clases de actualización: la identidad y la integridad quedan siempre al día, y el contenido puede quedar marcado como desactualizado hasta que alguien lo reescriba.
     4. **Un canal según quién lanza la corrida.** Las corridas que dispara Nucleus usan un canal automático, como en la forma 1. Las corridas a mano pueden usar el canal por archivo. Hay dos canales que mantener.
   - Las cuatro respetan la corrida vacía sin inteligencia (DJ-34) y la regla de que un intent fallido no dispara `doc` (DJ-19). La elección cambia la entrada de D1 y la compuerta D6.

6. **"Una corrida vacía es barata" frente al pipeline actual.** *(Resuelto por DJ-34.)*
   - DJ-30: una corrida vacía es barata.
   - Código: el pipeline de hoy llama a Gemini en `plan` antes de saber si hay algo que hacer (`context_planning/gemini_router.py`).
   - Para que la corrida vacía sea barata, la comparación tiene que ocurrir antes de cualquier llamada de inteligencia. Es una consecuencia de DJ-30; **José confirma.**

8. **El fallo del `doc` en el texto de §1.**
   - §1 dice: "si un intent falla o se cancela, no corre su doc y el intent se vuelve a correr hasta que termina".
   - DJ-36 lo corrige: si el que falla es el `doc`, se reanuda el `doc` y no se repite el mutador.
   - Las dos reglas se complementan: la de §1 vale para el fallo del mutador y DJ-36 para el fallo del `doc`.

9. **Nombre del contrato firmado.**
   - José: "el 1.2.0 firmado".
   - Los documentos del programa lo llaman "v4", por el validador `mandatecontract` (`contract.go:90-99`: seis Actions `ing, dis, doc, exp, dev, exp`).
   - Se toma que nombran el mismo contrato: uno es la versión de la definición firmada y el otro, la del esquema que la valida. No se verificó en la definición publicada (estado operativo, no leído). **José confirma.**

7. **`mrg` y GAP #M1.**
   - José: "mrg está especificado y no implementado (GAP #M1)".
   - Fuentes: `mrg` no tiene código, ya que la búsqueda en Brain, Nucleus y la extensión no lo encuentra. Pero GAP #M1 nombra otra cosa: "el mecanismo de origen de los `source_refs` múltiples", que bloquea la Fase 3 (`MRG_Intent_Spec_v1_0.md` l. 25-30, §9).
   - Son dos hechos distintos y los dos bloquean el disparo de `mrg`.

---

## 4. Estado de partida

Resumen de la investigación. Las citas están en los documentos de §10.

| Tema | Estado |
|---|---|
| Pipeline de `doc` | **IMPL roto.** Huecos G0 a G14: `submit` cableado a `.pipeline/.briefing`; parse, stage y merge solo conocen etapas de `dev`; `download` rechaza las de `doc`; el prompt de validación es de "development intent"; `hydrate` arma codebase y nunca docbase; `finalize` sin precondición |
| Identidad de un documento | **IMPL por ruta.** El `asset_id` de Genes sale de la ruta, así que un renombre es otro activo, sin alias. El id de un intent `doc` sale de su nombre |
| Registro documental | **NO EXISTE.** Decidido como base (DJ-13). Dónde vive, si viaja con el repo y la precedencia en el estado intermedio están abiertos (P27 a P31) |
| Disparo al terminar un intent | **NO EXISTE** en ningún componente |
| Estados terminales | `dev`: `finalize`, sin evidencia del trabajo. `ing` y `dis`: `done` con `committed` y ledger de efectos. `mrg`: solo ESPEC |
| Publicación canónica del Gene | Store IMPL, sin llamador productivo |
| Niveles | Solo Project es alcanzable. Domain y Gene se pueden declarar pero no verificar. Tenant y Organization viven en el servidor |
| Lista de cambios por intent | `dev`: manifiesto de staging. `ing`: ledger. `dis`: solo ESPEC. Con DJ-30 esta lista deja de ser necesaria para disparar, pero sigue disponible |

---

## 5. Qué tiene que cumplir `doc`

Son requisitos, no diseño.

1. Corre cuando Nucleus lo dispara según DJ-29. También se puede correr a mano por CLI.
2. Es idempotente:
   - compara la documentación del alcance contra el estado real;
   - si no hay diferencia, termina sin escribir;
   - dos corridas seguidas sin cambios en el medio dejan los mismos digests.
3. La comparación ocurre antes de cualquier llamada de inteligencia (pendiente de confirmación, §3.6).
4. En Project trabaja contra el filesystem del Project.
5. En Domain y Gene marca todo como "declarado, no verificado".
6. En Tenant y Organization no contrasta contenido; deja la estructura lista.
7. Reconoce movimientos y renombres hechos por el sistema a través del registro (DJ-13, DJ-16), y marca como anomalía los que se hicieron fuera del sistema.
8. Su salida es un borrador con contrato. Cada archivo declara:
   - la ruta portable;
   - el digest;
   - el intent que lo disparó;
   - el nivel y la marca de verificación;
   - los insumos con sus digests;
   - el modelo usado, si se conoce.
9. No se dispara a sí mismo. No corre si el intent que lo dispararía falló o se canceló.
10. Sirve sin cambios para un futuro disparador por reconciliación (DJ-32).

---

## 6. Piezas y dueños

| Pieza | Dueño probable | Estado |
|---|---|---|
| Reparar el pipeline de `doc` (G0 a G14) | Brain | IMPL roto |
| Comparación idempotente y corrida vacía | Brain | NO EXISTE |
| Marca por nivel y por verificación | Brain | NO EXISTE |
| Contrato de salida | Brain | NO EXISTE |
| Registro documental | Brain o Nucleus (P28) | NO EXISTE |
| Señal de estado terminal hacia Nucleus | Nucleus y Brain (P49) | NO EXISTE |
| Disparo de `doc` en Nucleus | Nucleus | NO EXISTE |
| Publicación canónica del Gene en `ing` | Genes | IMPL sin llamador |
| `mrg` | Dueño de MRG | ESPEC; GAP #M1 |
| `doc` dentro del contrato del Mandate | MANDATE (pedido R-M1) | NO EXISTE |
| Canal de inteligencia para `doc` | Brain o AITAP (P1) | LAGUNA |

---

## 7. Etapas con compuertas

Ninguna etapa arranca si la compuerta anterior no pasó. Las compuertas corren en el Project de prueba `tests/brain/doc-intent-tests`, en la Mac, con el binario de Brain que se compila e instala por el flujo oficial. Cada etapa termina con su registro de traspaso (§9).

**D1. `doc` corre de punta a punta y es idempotente (Brain).**
- **Entrada:** P1 (con su forma, §3.5), P3, P4, P5, P10, P48 y P34 respondidas. §3.6 confirmado (DJ-34). Recorrido de §12 fijado (DJ-35).
- **Salida:** pipeline reparado; comparación previa; corrida vacía; marca por nivel; contrato de salida.
- **Compuerta:**
  - (a) Una corrida a mano sobre el vertical de Gravity deja un borrador con su contrato.
  - (b) Una segunda corrida sin cambios no escribe nada y no llama a Gemini; los digests son iguales.
  - (c) Después de cambiar un archivo del vertical, la corrida siguiente lo detecta y escribe.
  - (d) Con alcance `domain` o `gene`, la salida dice "declarado, no verificado".
- **No puede tocar:** Nucleus, Genes, Authority, el contrato del Mandate.

**D2. Registro documental (Brain o Nucleus, según P28).**
- **Entrada:** D1 pasada; P27 a P31 respondidas.
- **Compuerta:**
  - (a) Un movimiento hecho por el sistema conserva la identidad.
  - (b) Un movimiento hecho a mano queda como anomalía.
  - (c) Ninguna escritura en `.genes/`.

**D3. Nucleus dispara `doc` al terminar `dev` y `dis` (Nucleus y Brain).**
- **Entrada:** D2 pasada; P49 respondida.
- **Compuerta:**
  - (a) Un `dev` que llega a `finalize` produce exactamente un `doc`.
  - (b) Lo mismo para un `dis` en `done` con `committed: true`.
  - (c) Un `doc` no produce otro.
  - (d) `tst`, `exp` y `asm` no producen `doc`.
  - (e) Un intent que falla no produce `doc`.
- **Límite:** `ing` y `mrg` quedan fuera de esta etapa por §3.4 y §3.7.

**D4. Disparo después de `ing` (Nucleus, con Genes).**
- **Entrada:** D3 pasada; la publicación canónica de la revisión del Gene funcionando (Genes).
- **Compuerta:** el `doc` se dispara después de la publicación, nunca después de la propuesta.

**D5. Disparo después de `mrg` (Nucleus, con el dueño de MRG).**
- **Entrada:** D3 pasada; `mrg` implementado.
- **Compuerta:** `merged` y `aborted` producen cada uno exactamente un `doc`.

**D6. `doc` dentro del Mandate (MANDATE).**
- **Entrada:** D3 pasada; respuesta a R-M1; P35, P36, P39, P40 y P50. Por DJ-37, la prueba no usa el contrato 1.2.0 ni su grafo: necesita la versión nueva que surja de R-M1.
- **Compuerta:**
  - (a) En Windows, un Mandate de prueba espera el `doc` antes del intent siguiente (DJ-20).
  - (b) Los Mandates v4 ya firmados siguen validando.

D4 y D5 dependen de otros dueños. Pueden avanzar en cualquier orden después de D3, cada una cuando su dueño responda.

**Lo que este encargo puede romper.** Los riesgos R-1 a R-7 del plan v0.2 §4 siguen siendo válidos: `dev` comparte managers con `doc`; los lectores de identidad; los estados nuevos; `ing` y `dis`; documentación real; Mandates v4; store de Genes. José decide en cada compuerta cuáles se miden.

---

## 8. Pendientes que el encargo registra sin resolver

| # | Pendiente | Dueño probable |
|---|---|---|
| PD-A | Orden de `doc` respecto de `tst` bajo un Mandate agéntico. La TST spec habla de "la Action exitosa inmediatamente relevante" (`TST_Intent_Spec_v1_0.md` l. 239) y no la define | Dueño de TST y MANDATE |
| PD-B | `mrg` está especificado y no implementado. Además, GAP #M1: origen de los `source_refs` múltiples | Dueño de MRG |
| PD-C | Un `dev` mergeado no está verificado hasta que `tst` da `pass`. El `doc` que sigue a un `dev` documenta algo no verificado. Cómo se marca no está definido | José, con TST |
| PD-D | Cómo llega un cambio de código a una Gene Revision, si `dev` no toca `.genes/` | Genes |
| P41 | Cambios que no vienen de un intent (DJ-32) | José |
| P48 | Qué es "el stack", y si P34/DJ-23 sigue vigente (§3.2). Bloquea D1 | José |
| P50 | "Reanudar" el `doc` (DJ-36). ¿Desde el paso donde falló, o volviendo a correrlo entero? Por DJ-30 una corrida entera no duplica efectos. ¿Lo reanuda el sistema o una persona? Bloquea el paso 11' del recorrido | José |
| P1-forma | Cuál de las cuatro formas de §3.5 resuelve el choque entre P1 y el disparo automático. Bloquea D1 | José |
| P49 | Cómo se entera Nucleus del estado terminal de un intent que corre en Brain (§3.3). Bloquea D3 | José; dueños de la pieza: Nucleus y Brain |
| P1, P3, P4, P5, P10 | Canal de inteligencia, formato del insumo, nombres de archivo, precondición de `finalize`, motor de estado | José |
| P27 a P31 | El registro documental | José |
| P35, P36, P39, P40 | El contrato del Mandate (pedido R-M1) | MANDATE y José |
| H-3 | La clave de Gemini que `plan` y `validate` no encuentran | José |

---

## 9. Traspaso entre etapas

- Cada etapa termina con un registro en `docs/ANALYSIS/BSIP/DOC/TRASPASOS/Traspaso_D<n>_..._v1_0.md`, y lo mismo en el Project. El formato es el del plan v0.2 §2.
- Cada etapa empieza leyendo el registro anterior. Frena si el registro falta, si la compuerta no pasó o si un pedido del que depende no tiene respuesta.

---

## 10. Investigación de respaldo, vigente

| Documento | Para qué |
|---|---|
| `Relevamiento_Vinculacion_Documental_Arbol_Estructural_v0_1.md` | Vínculo documento ↔ estructura; identidades reales en Darwin |
| `Programa_Documentacion_Documento_Madre_v0_7.md` | Decisiones, inconsistencias, identidad, detección de cambios, nomenclatura |
| `Programa_Documentacion_Registro_Documental_Mapa_Decision_v0_1.md` | Dónde vive el registro, viaje con el repo, concurrencia, estado intermedio |
| `Programa_Documentacion_Politica_Doc_por_Intent_Relevamiento_v0_1.md` | Evidencia de éxito por tipo, listas de cambios, contrato v4, serie real, Impact |
| `Programa_Documentacion_Pedido_MANDATE_Contrato_v0_1.md` | Pedido a MANDATE (actualizar: `exp` ya no dispara `doc`) |
| `Programa_Documentacion_Pedido_Impact_Colisiones_v0_1.md` | Pedido a Impact |
| `TRASPASOS/Traspaso_E0_Cancelada_v1_0.md` | Pruebas de referencia (PR-0), Project de prueba, hallazgos H-1 a H-5 |
| `docs/BSIP/TYPES/{DOC,DEV,ING,DIS,MRG,TST,EXP,ASM}_Intent_Spec*.md` | Specs de los tipos de intent |

## 11. Qué no se hace

- No se mide `dev` ni ningún otro intent como condición previa.
- No se contrasta Tenant ni Organization contra el filesystem.
- No se infiere pertenencia a Domain o Gene, ni continuidad por parecido.
- No se crea ninguna Contribution ni se ratifica nada.
- No se cubren los cambios que no vienen de un intent (P41).
- No se toca código hasta que José envíe el encargo con las preguntas de D1 respondidas.

---

## 12. Recorrido esperado de `doc`

Es el recorrido que tiene que cumplir cada corrida. Se fija antes de tocar el contrato firmado o de volver a probar (DJ-35). Describe qué pasa y en qué orden, no cómo se implementa. Cada paso lleva la decisión que lo fija o la pregunta que lo deja abierto.

| # | Paso | Qué pasa | Fijado por / Abierto en |
|---|---|---|---|
| 1 | Termina un intent | `dev` llega a `finalize`; `ing` o `dis` llegan a `done` con `committed: true` (en `ing`, después de la publicación canónica de la revisión del Gene); `mrg` llega a `merged` o `aborted`. `tst`, `exp`, `asm` y `doc` no siguen este recorrido | DJ-29, DJ-31, DJ-24 |
| 1' | El intent falla o se cancela | No hay `doc`. El intent se vuelve a correr hasta que termina; recién entonces se entra al paso 1 | DJ-19. Quién lo relanza: P39 |
| 2 | Nucleus se entera | La señal del estado terminal llega a Nucleus | **Abierto: P49** |
| 3 | Nucleus lanza `doc` | Con la referencia al intent que terminó y el alcance (Project; o Domain o Gene, declarados) | DJ-29, DJ-1, DJ-33 |
| 4 | `doc` arma lo que va a comparar | El conjunto de documentación y de estado real que entra en la comparación | **Abierto: P48** ("el stack") **y P34** (solo lo que cambió el intent, o todo el alcance) |
| 5 | Comparación, sin inteligencia | Compara la documentación contra el estado real usando el registro (identidad) y los digests (integridad). No llama a ninguna inteligencia | DJ-30, DJ-34, DJ-13 |
| 6a | Sin diferencias | Termina sin escribir. Queda registrado que la corrida fue vacía | DJ-30 |
| 6b | Con diferencias | Sigue al paso 7 | DJ-30 |
| 7 | Saneo | Movimientos y renombres hechos por el sistema: se actualizan en el registro. Movimientos hechos fuera del sistema: se marcan como anomalía, sin resolver por parecido. Contenido: se resuelve por el canal y la forma que José elija | DJ-13, DJ-16. **Abierto: P1 y P1-forma** |
| 8 | Validación | Se valida lo producido antes de escribir | Cómo se valida y con qué canal: **abierto en P1** |
| 9 | Salida | Borrador con contrato: ruta portable, digest, intent que lo disparó, nivel y marca de verificación ("declarado, no verificado" en Domain y Gene), insumos con digests, modelo si se conoce | DJ-2, DJ-33, §5.8 |
| 10 | Cierre | `finalize` exige su precondición | **Abierto: P5** |
| 11 | Dentro de un Mandate | El intent siguiente arranca recién cuando el `doc` terminó | DJ-20. Forma en el contrato: P35 (MANDATE) |
| 11' | El `doc` falla | El `doc` se reanuda; el intent mutador no se repite. El intent siguiente espera hasta que el `doc` termine. **Abierto (P50):** qué significa "reanudar" y quién lo hace | DJ-36 |
| 12 | Otro `doc` | No se lanza ninguno como consecuencia de este | DJ-18, DJ-24 |

**Pasos abiertos que impiden dar el recorrido por fijado:** 2 (P49), 4 (P48 y P34), 7 y 8 (P1 y P1-forma), 10 (P5) y 11' (P50). Mientras sigan abiertos, rige DJ-35: no se toca el contrato firmado ni se vuelve a probar.

