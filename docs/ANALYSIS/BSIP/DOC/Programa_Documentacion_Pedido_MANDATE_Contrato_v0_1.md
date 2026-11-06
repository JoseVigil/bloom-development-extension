# Pedido a MANDATE — Cambio de contrato bajo la política de documentación por intent

**Para:** la sesión de trabajo de MANDATE (orquestación de Nucleus y Temporal).
**De:** programa de documentación, con autoridad de José Vigil.
**Fecha:** 2026-11-05
**Naturaleza:** pedido de relevamiento y respuesta. **No es un pedido de implementación.** No cambies código ni contratos. Respondé con hechos y citas de código; donde algo no esté definido, marcalo como no definido y decí quién sería el dueño probable.

---

## 1. Contexto

José fijó esta política para el intent `doc`. Según él, está por encima de las decisiones anteriores:

1. "Cada intent, de cualquier tipo, deja detrás un intent doc que sanea todo lo que ese intent hizo." El `doc` queda fuera de la regla: "Un doc no dispara otro doc."
2. "Si un intent falla o se cancela, no corre su doc: el intent se vuelve a correr hasta que termina su trabajo."
3. "El Mandate espera a que termine el doc antes del próximo intent."
4. "El Mandate corre de forma unívoca. Hoy los intents no corren en paralelo."
5. Cada `doc` documenta solo lo que cambió el intent anterior.
6. El `doc` de un `exp` corre igual. Si el `exp` no cambió nada, no tiene nada que sanear.

Lo que el programa relevó del código actual (corregilo si algo está mal):

| Hecho | Cita |
|---|---|
| El v4 exige "exactly six signed Actions", en el orden `ing, dis, doc, exp, dev, exp`, y rechaza cualquier otra secuencia | `mandatecontract/contract.go:90-99` |
| Cada Action depende solo de la anterior; solo el `dev` lleva `WhenResult: "remediation_required"` | `contract.go:109-116` |
| "Branch conditions are part of the signed contract, never a workflow signal" | `contract.go:87` |
| El cumplimiento usa el evaluador `exp-ready`, con los campos requeridos `[ing, dis, doc, exp]` | `contract.go:183-185` |
| El workflow adoptado despacha solo `ing` y devuelve `Fulfilled: false` | `temporal/workflows/mandate_execution_workflow.go:193-224` |
| Las actividades tienen `RetryPolicy` con `MaximumAttempts: 3` y `StartToCloseTimeout` de 5 minutos | `mandate_execution_workflow.go:178-183` |
| EM-C12: un fallo de ejecución deja el workflow fallido, sin cambio en `mandate_state.json` y sin reintento | `Orrery_Experience_Model_Escenarios_Trabajo_Activo_v0_1.md`, fila G-F |
| Hay un workflow por Mandate (`mandate_execute_<mandateId>`, `REJECT_DUPLICATE`); nada serializa Mandates distintos; el watcher recorre todas las carpetas de Mandates | `temporal/worker.go:48-49`; `watchers/mandate_watcher.go:264-272, 486-519` |
| No hay Activity de `doc`, ni `ArtifactRef` para la Action `doc`, ni suministro de inteligencia para `doc` (solo `{ing, dis, gen}`) | `activities/`; `tools/mandate-v4-sign/main.go:293-301`; `brain/commands/intent/supply.py:13-24` |
| El arbitraje nunca modifica un Mandate ya firmado (INVARIANT-ARB-003) | `NUCLEUS_API_Contracts_Consolidado_v0_1.md` §4.2 |

## 2. La pregunta que decide MANDATE: P35

**P35. El `doc` que exige la política, ¿es una Action firmada del contrato o un paso de política del Mandate?**

José no la decide: la deja en manos de MANDATE. Se presentan las dos opciones con las consecuencias que el programa ve. **Confirmá, corregí o completá cada consecuencia, y agregá las que falten.** Si recomendás una opción, decí por qué, citando el código.

### Opción A — Action firmada del contrato

Cada `doc` aparece como una Action `run_intent` con `IntentType: "doc"` en el contrato que se firma, después del intent que sanea.

| Tema | Consecuencia que ve el programa |
|---|---|
| Versión de contrato | El v4 fija seis Actions y su orden (`contract.go:90-99`), así que hace falta una versión nueva del contrato y de la herramienta de firma |
| Mandates ya firmados | No cambian (ARB-003): siguen con un solo `doc`, en la posición 3 |
| Auditoría | Cada `doc` queda firmado, con su `ActionID` y su `IdempotencyKey` |
| Condiciones | El `doc` de un intent condicional (el `dev`, con `WhenResult`) necesita su propia condición firmada. Con la política, el `doc` del `exp` corre aunque el `dev` no corra |
| Cumplimiento | Hay que decidir si los `doc` cuentan en los campos requeridos del evaluador (hoy `[ing, dis, doc, exp]`) |
| Cambiar la política | Cambiar la regla más adelante exige otra versión de contrato y firmar de nuevo |
| Tamaño | El plan firmado pasa de 6 Actions a 6 intents más sus `doc` |

### Opción B — Paso de política del Mandate

El contrato firma solo los intents. El Mandate agrega el `doc` después de cada uno porque así lo dice una política que no está dentro del contrato firmado.

| Tema | Consecuencia que ve el programa |
|---|---|
| Versión de contrato | La secuencia de intents podría no cambiar. Queda abierto qué pasa con la Action `doc` que el v4 ya firma en la posición 3 (P40) |
| Choque con un principio del código | `contract.go:87`: "Branch conditions are part of the signed contract, never a workflow signal". Un paso que no está firmado y que el workflow ejecuta, ¿entra en ese principio? |
| Mandates ya firmados | Si la política se aplica en el workflow, también cambia el comportamiento de los Mandates v4 ya firmados. ¿Es aceptable bajo ARB-003? |
| Dónde vive la política | Hay que definir dónde vive, quién la firma o la aprueba, cómo se versiona y cómo un Mandate registra qué versión aplicó |
| Idempotencia y auditoría | El `doc` no tiene `IdempotencyKey` firmada; hay que definir cómo se registra y cómo se reintenta |
| Cumplimiento | El evaluador no ve los `doc`, salvo que se cambie |
| Cambiar la política | Se cambia sin firmar de nuevo los contratos |

## 3. Preguntas que José todavía no respondió

José no completó estas dos. **No las decidas.** Para cada opción, decí qué tendría que cambiar en el contrato, en el workflow o en Temporal, y qué contradice del código actual.

**P36. "Hoy los intents no corren en paralelo": ¿describe el uso actual o es una regla que el sistema tiene que garantizar?**
- Si describe el uso actual: ¿qué impide hoy, en el código, que dos Mandates distintos corran a la vez sobre el mismo Project?
- Si es una regla que el sistema garantiza: ¿qué pieza tendría que serializar, entre Mandates y también frente a intents lanzados a mano por la CLI de Brain (que ignoran `mandate_id`, `brain/core/intent_manager.py:97`)? ¿Es de MANDATE o de otro dueño?

**P39. "Se vuelve a correr hasta que termina": ¿lo vuelve a lanzar el sistema sin límite, o lo lanza una persona después de agotar los reintentos?**
- Si lo relanza el sistema sin límite: ¿qué cambia frente a `MaximumAttempts: 3` y frente a EM-C12? ¿Qué pasa con la `IdempotencyKey` de la Action relanzada?
- Si lo lanza una persona: ¿qué estado legible queda para que lo vea (hoy, según EM-C12, no queda ninguno) y con qué acto se relanza?
- En los dos casos: `ing` espera una decisión humana (`awaiting_human_decision`, `mandate_watcher.go:501`). ¿Cuenta eso como "no terminó"?

## 4. Otras preguntas para MANDATE

1. **P40.** La Action `doc` que el v4 firma en la posición 3, ¿qué documenta según su diseño? ¿El resultado de `dis`, el Project entero, otra cosa? ¿Dónde está definido? (La decisión final es de José; lo que se pide acá es el hecho.)
2. **Espera del `doc`:** para que "el Mandate espera a que termine el doc antes del próximo intent", ¿qué evidencia de fin de un `doc` aceptaría el workflow? Hoy `doc` marca `completed` sin precondición (`intent_manager.py:1910-1917`).
3. **Despacho:** ¿qué falta para despachar más allá de `ing` (`dis`, `doc`, `exp`, `dev`)? Hace falta la lista de piezas, no el diseño.
4. **Fallo del `doc`:** si el `doc` de un intent falla, ¿qué hace el Mandate? La política solo dice qué pasa cuando falla el intent.
5. **TST:** la TST spec dice que solo un `tst` en `pass` puede llevar el Mandate a `completed` (TST spec §3.3), y el v4 no tiene `tst`. ¿Cómo se relaciona eso con el cumplimiento `exp-ready`?

## 5. Formato de la respuesta

Un documento con:
1. Para P35: la tabla de cada opción, corregida, con las citas.
2. Para P36 y P39: lo que cambia con cada respuesta posible, con las citas.
3. Para las preguntas de §4: hecho, cita, o "no definido" con el dueño probable.
4. Qué de lo que dice §1 está mal.
