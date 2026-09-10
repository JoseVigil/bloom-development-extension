# Encargo de Investigación — Creación de Agentes y Acoplamiento Orbital/Gravity vía Intents

**Tipo:** Documento de apertura — fija el problema, preserva fundamento teórico y lista puntos decisorios. Cero código de producción, cero diseño cerrado.
**Estado:** v0.1 — punto de partida para cruzar dos hilos de investigación en curso.
**Fecha:** 2026-09-10
**Origen:** sesión de auditoría de residuales de `cor` + lectura completa del documento fundacional `Orbital___Fundamentos_de_Coordinacion_Gravity_e_Interaccion_Gobernada.md`. El archivo `COR_Intent_Spec_v1_0.md` ya no existe en el repo (removido deliberadamente por control) — este documento reconstruye sus fundamentos teóricos relevantes a partir de las citas que quedaron preservadas en otros documentos del repo y del Proyecto de investigación, no de memoria libre.

**Convención de evidencia (heredada del resto del repo):**
- **[H]** = Hallazgo, verificado contra código o documento real, citado.
- **[P]** = Propuesta de este documento, sin ratificar.
- **[G]** = Gap. Pregunta abierta que este documento no resuelve, con la razón.

---

## 0. Por qué existe este documento

Dos investigaciones corren en paralelo, con destino a confluir en código real:

1. **Creación de agentes desde cero** — la lógica de qué es un agente en este sistema, cómo se instancia, qué lo distingue de un humano operando la misma CLI. (Hilo que control lleva por otro canal.)
2. **Acoplamiento fino de Orbital a Gravity vía intents** — cómo el ciclo de intents (`exp`/`dev`/`tst`/`mrg`) convierte el trabajo de un agente en algo turno-a-turno, auditado y detenible, en vez de un proceso opaco que corre horas sin supervisión.

Ambos hilos comparten una precondición no resuelta, confirmada contra código real esta sesión: **el sistema no tiene, hoy, ninguna forma de reconocer con certeza que una llamada al binario `nucleus` viene de un Agent Loop y no de un humano operando la CLI con las mismas credenciales de sistema operativo** [H]. Toda la arquitectura de gobernanza — la vieja (`cor`) y la nueva (Gravity) — se construyó *asumiendo* que esa distinción ya existía. No existe. Este documento no la resuelve; la deja explícita, ordenada, y con los fundamentos teóricos necesarios para que el diseño que la resuelva no tenga que empezar de cero.

**Principio rector explícito de control, que gobierna todo lo que sigue:** el objetivo no es maximizar autonomía. Es lo opuesto — una maniobra controlada, auditada y **acoplada al ingeniero turno a turno**, mediada por intents, nunca un proceso que corre desatendido durante horas y se encuentra terminado (o roto) al volver. Cualquier diseño que esta investigación produzca debe evaluarse primero contra ese criterio, no contra cuánta autonomía habilita.

---

## 1. Fundamentos teóricos de `cor` que hay que preservar y trasladar a Gravity

`cor` está deprecado como mecanismo (confirmado por control 2026-09-02, `docs/CONTROL/AGENDA_MAESTRA.md` §11) pero su modelo teórico de gobernanza de agentes sigue siendo válido y es exactamente lo que Gravity, vía Orbital, tiene que absorber. Reconstruido de las citas que sobreviven en el repo:

**1.1 — Veto incondicional y previo a cualquier otra validación.** La invariante central de `cor` no era "un agente no puede escribir reglas de gobierno" sino algo más estricto: *"Si `proposer_type === 'agent'` y `intent_draft.type === 'cor'`, Nucleus rechaza sin excepción, antes de evaluar cualquier otro campo del draft"* — el rechazo ocurría en la **recepción** del draft, antes incluso de que el JSON Schema se evaluara. No era una regla de negocio evaluable — era un veto de nivel de sistema, no configurable por ningún `capability_seam` [H, cita preservada en `NUCLEUS_API_Contracts_Consolidado_v0_1.md` §1.3, atribuida a `COR §0/§3.1/§5`].

**1.2 — Opacidad total (Zero-Read/Zero-Write), no solo prohibición de escritura.** Un agente no solo tenía prohibido modificar las reglas de gobierno — tenía prohibido **leerlas**, incluso en modo consulta. La razón documentada no era higiene de permisos: era cerrar un vector de reconocimiento. Un agente que pudiera leer las reglas de gobierno directamente podría enumerar con precisión los límites exactos del sistema (qué paths, qué presupuestos, qué reglas) en vez de descubrirlos indirectamente turno a turno vía rechazo — lo segundo le da al operador humano visibilidad y control sobre cuánta información de la política se filtra hacia el loop; lo primero se la regala de una [H, `BTIPS_Mandates_Agenticos_Spec_Unificada.md` §8.2.2, ya marcado deprecado pero preservado como registro].

**1.3 — Separación estricta proponente / autoridad / firmante / ejecutor, nunca inferibles unos de otros.** Esta es la pieza que Gravity/Orbital heredó explícitamente y formalizó en `OrbitalExecutionContext`: *"Proponente, autorizado, firmante y ejecutor pueden ser sujetos diferentes y nunca deben inferirse unos de otros."* El flujo esperado es `Agent Loop propone → Nucleus valida → Authorization permite o rechaza → Nucleus firma → Brain/Executor ejecuta → Temporal preserva continuidad` — cada paso es un sujeto potencialmente distinto, y ninguno se asume a partir de otro [H, `Handoff_Genesis_Control...Orbital` §4.4, documento que vive solo en este Proyecto, no en el repo — vale la pena decidir si este documento sí se guarda en el repo, ver §5].

**1.4 — Una AI nunca se autoriza a sí misma.** Principio XII del fundacional: *"Proponer no equivale a promulgar — una AI puede identificar criterio candidato sin poseer autoridad para convertirlo en ley."* Y más explícito en Orb §21: *"Una AI puede identificar Gravity. No puede otorgarse a sí misma autoridad sobre la gravedad que la gobierna."* [H].

**1.5 — Fail-closed como default, nunca fail-open.** Tanto `cor` como el diseño de Orbital que lo sucede asumen que, ante cualquier incertidumbre sobre identidad o autoridad, el sistema debe bloquear, no proceder. `RunID`/`SessionID` identifican una *ejecución*, nunca un *actor* — usarlos como prueba de autorización sería, textualmente, "incorrecto" [H, `Handoff_Genesis_Control...Orbital` §2.3-2.4].

**La consecuencia que ninguna de las cinco piezas de arriba resuelve por sí sola:** todas presuponen que el sistema ya sabe distinguir "esto lo propuso un agente" de "esto lo propuso un humano". Esa distinción — el insumo de entrada de `proposer_type` — nunca tuvo, ni en `cor` ni en Gravity, un mecanismo real de resolución. Fue siempre un campo autodeclarado en el JSON del draft, nunca autenticado contra nada [G — gap heredado, no nuevo, pero que recién ahora queda nombrado con precisión].

---

## 2. El gap confirmado contra código real

`installer/nucleus/internal/authority/` resuelve el rol del llamador (`RoleMaster`/`RoleSpecialist`/`RoleUnknown`) mirando si existe un archivo marcador (`.master`/`.specialist`) **en la instalación/máquina**, vía `core.GetUserRole()`/`detectUserRole()`, con fail-closed a `RoleUnknown` si no hay marcador. `RequireMaster()` consume ese resultado en varios call sites reales (`alfred_server.go`, `dev_start.go`, `commands/mandate.go`) [H].

Ese mecanismo responde **"¿desde qué instalación vino esta llamada?"**, nunca **"¿quién o qué, dentro de esa instalación, la disparó?"**. Si un Agent Loop pudiera invocar programáticamente el mismo binario `nucleus` que vos usás por CLI, en tu misma máquina, heredaría `RoleMaster` completo — indistinguible de vos — sin que exista, hoy, ningún mecanismo (ni siquiera en diseño) que lo note [H — este gap ya estaba nombrado como G.2 en una investigación previa que vive solo en el Proyecto, no en el repo].

Esto no es un defecto de `cor` ni de Gravity específicamente. Es un agujero en la capa de identidad/autenticación sobre la que **ambos** se apoyan. Ninguno de los dos lo resolvió nunca — `cor` lo daba por sentado en diseño (nunca llegó a implementarse), Gravity todavía no lo ha nombrado como requisito explícito de su propio modelo de autorización.

---

## 3. Orden de trabajo pedido por control — y por qué en ese orden

Control fue explícito: primero entender la **lógica de creación de agentes**, después el **acoplamiento fino de Orbital a ese desarrollo vía intents**. Este orden no es arbitrario respecto de lo que ya sabemos:

Si la identidad del agente se define *después* de fijar cómo se acopla a los intents, se corre el riesgo de diseñar el acoplamiento asumiendo una identidad que todavía no existe (el mismo error que ya cometió el diseño de `cor`/Gravity: construir la separación proponente/autoridad/firmante sobre un `proposer_type` que nunca se autenticó). Definir primero *qué es un agente, cómo nace, qué lo identifica de forma verificable* — antes de decidir cómo ese agente conversa con Gravity turno a turno — evita heredar el mismo agujero una tercera vez.

**Puntos que la investigación de "creación de agentes desde cero" necesita resolver, en la medida en que tocan directamente el gap de §2** [P — lista de preguntas, no de respuestas]:

- ¿Qué evento marca el nacimiento de "un agente" en este sistema — un proceso, una sesión de Temporal, una invocación puntual del binario? ¿Es una identidad efímera (por ejecución) o persistente (por instalación, por proyecto)?
- ¿De dónde sale un `actor_id`/`proposer_id` verificable — no autodeclarado — para ese agente? (`SignedBy.ActorID` ya existe como campo en `GravityNode`, pero nada en el código real lo popula hoy para un actor agéntico; es un campo esperando un mecanismo de resolución que no existe.)
- ¿El agente corre con credenciales propias y separadas de las del humano que lo lanza, o necesariamente hereda las del proceso padre? Si es lo segundo (como es hoy, de facto), ¿qué capa adicional podría marcarlo como agente sin depender de que el propio agente lo declare honestamente?
- ¿Qué pasa si esa identidad no puede resolverse con certeza? (Fail-closed ya es el principio establecido en el resto del sistema — §1.5 — así que la respuesta por defecto debería ser "bloquear", no "asumir humano" ni "asumir agente".)

## 4. Cómo se espera que Orbital, vía intents, provea el acoplamiento fino que pide control

Una vez resuelta (o al menos acotada) la identidad, el segundo hilo es cómo el ciclo de intents mantiene al ingeniero acoplado turno a turno, en vez de dejar correr al agente desatendido. Esto **ya tiene una base de diseño real en el repo**, vale la pena partir de ella en vez de inventar de cero:

- El ciclo vivo `exp → dev → tst [→ mrg → tst]` (`NUCLEUS_API_Contracts_Consolidado_v0_1.md`, sobre `BTIPS §8.5`) obliga a que cada movimiento del agente pase por un `intent_draft` nuevo, validado y firmado por Nucleus — es, por construcción, una secuencia de checkpoints, no un loop libre. Cada turno es una oportunidad de intervención humana, no un detalle de implementación incidental.
- `resolve_active_gravity(session_id)` resuelve, en cada turno, solo el subconjunto de posturas relevantes al intent de ese turno — es el mecanismo por el cual el criterio del ingeniero está presente sin que tenga que repetirlo, pero **esto gobierna qué significa la instrucción, no quién tiene autoridad para ejecutarla** — son dos problemas distintos que conviene no mezclar en el diseño (el fundacional los trata como relacionados pero son ortogonales: uno es interpretación, el otro es autorización).
- El Capability Seam (`scope_paths`, `max_turns`, `max_dev_intents`, `forbidden_paths`, reglas de escalación) ya es, en diseño, el mecanismo que limita cuánto puede avanzar un agente antes de requerir intervención — pero constriñe **qué puede tocar un agente ya autorizado**, no resuelve **si debía haber sido reconocido como agente en primer lugar**.
- El breadcrumb de autoridad en Paladin (`⚙ Org·1 📁 Proy·2 🗂 Mandate·1 💬 Sesión·1`) es, hoy, la única superficie donde el ingeniero ve en vivo bajo qué Gravity está trabajando el agente turno a turno — es la pieza de UX que hace posible el "acoplamiento" que pide control, y probablemente necesite extenderse para mostrar también identidad/procedencia del proponente una vez que ese campo exista de verdad.

**Puntos decisorios de este segundo hilo** [P]:

- ¿Cada turno del agente requiere una acción humana explícita para avanzar (aprobación turno a turno), o solo cuando el Capability Seam lo dispara (escalación por excepción)? Control ya fue explícito: nada de "8 horas desatendido" — pero eso puede resolverse en distintos grados, desde aprobación por turno hasta un presupuesto de turnos acotado con checkpoints periódicos.
- ¿Qué intent tipo marca el cierre auditable de una tanda de trabajo agéntico — hoy es `tst` conceptualmente, pero el gate de cierre por `tst` todavía no existe en código real (`MandateExecutionWorkflow` es declarativo, `propose_next_action` no está implementado)?
- ¿La reclasificación `dev`↔`mrg` (por cantidad de `source_refs`) es suficiente control de "qué tan grande es el cambio que el agente está por hacer", o hace falta una señal adicional pensada específicamente para mantener al ingeniero acoplado (no solo para clasificar el tipo de operación)?

---

## 5. Qué NO hace este documento

No define la identidad de Orbital. No propone un mecanismo concreto de autenticación agente-vs-humano — eso es, deliberadamente, la pregunta que se le devuelve a la investigación de creación de agentes. No escribe código. No decide el orden exacto de implementación. No asume que `SignedBy.ActorID` es la pieza correcta para resolver esto — solo constata que existe y está sin usar para este propósito.

**Pendiente explícito para control:** el documento `Handoff_Genesis_Control_Consolidacion_Orbital_v0_1.md`, citado varias veces acá, es la explicación más completa que existe de la separación proponente/autoridad/firmante/ejecutor — y solo vive en el Proyecto de investigación, nunca se guardó en el repo real (mismo patrón que ya encontramos con la investigación de `cor`). Si esta nueva investigación lo va a citar como referencia viva, probablemente valga la pena guardarlo esta vez en `docs/ANALYSIS/GRAVITY/ORBITAL/` antes de que se pierda igual que el resto.

---

## 6. Cómo usar este documento

Este es el punto de apertura para cruzar los dos hilos: la investigación de creación de agentes (que control lleva en paralelo) y este acoplamiento Orbital/Gravity vía intents. La forma sugerida de continuar es que la investigación de agentes responda, aunque sea parcialmente, las preguntas de §3 — quién es un agente, cómo nace, cómo se identifica de forma verificable — y que ese resultado vuelva acá para cerrar §4 con una propuesta concreta de checkpoints turno-a-turno. Recién ahí hay base suficiente para pasar de documento a un primer `Encargo_Implementacion_*` real, en la misma línea que los que ya existen en el repo para otras piezas de Gravity.
