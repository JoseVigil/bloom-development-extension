# Paladin — Modelo de Objetos del Cliente (Postura, Gravity y objetos híbridos)

**Tipo:** Análisis de arquitectura de cliente (no es especificación de UI ni de persistencia de backend)
**Estado:** Borrador v0.1 — análisis en curso, no cerrado
**Fecha:** 2026-08-28
**Dominio:** Paladin · Gravity · Orbital
**Fuentes normativas:**
- `Corolario — La persona como fuente de Gravity.md` (**Cor**)
- `Orbital — Fundamentos de Coordinación, Gravity e Interacción Gobernada.md` (**Orb**)
- `Paladin_UX_Postura_Gravity_Masa_Spec_v0_1.md` (**UX**) — ya resuelve el gesto de postulación, el breadcrumb de Gravity activa y las seis señales de conflicto; este documento no rediseña esa UX, la usa como fuente de qué objetos existen en pantalla.
- `NUCLEUS_API_Contracts_Consolidado_v0_1.md` (**API**) y `NUCLEUS_API_Contracts_Auditoria_vs_Truth_v0_1.md` (**Audit**) — DTOs de backend y su correlato real (o su ausencia).

**Encuadre:** este documento no propone una interfaz nueva. Toma la UX ya especificada y responde una pregunta distinta y previa a cualquier implementación: **de cada cosa que vive en el cliente de Paladin, ¿quién es su dueño?** ¿El cliente, porque nunca debería llegar al backend? ¿El backend, porque el cliente sólo la muestra? ¿O ambos, cada uno una parte?

---

## 1. Por qué la pregunta importa

Orb fija dos principios que, juntos, son la razón de ser de este documento:

> "La sesión no contiene el contexto. La sesión ocurre dentro del contexto." (Orb §11)

> "El campo no gobierna solamente lo que la AI hace. También gobierna cómo la AI interpreta lo que el humano dice." (Orb §3)

Si la sesión no es dueña del contexto, el cliente de Paladin tampoco puede tratarse a sí mismo como dueño de nada que el backend (Nucleus) ya considera autoritativo — hacerlo crearía exactamente lo que Orb §18 y el catálogo de API (§3.1, sobre por qué nunca se expone el grafo completo) tratan como el riesgo central a evitar: **una segunda fuente de verdad**, aunque sea accidental y sólo del lado del cliente.

Al mismo tiempo, Cor fija el otro extremo:

> "El ingeniero puede conversar [...] Pero existe otro acto diferente [...] puede postular una postura." (Cor, "Paladin como espacio para tomar posición")

Antes de ese acto explícito, lo que el ingeniero escribe no es todavía nada que el backend deba conocer. Existe sólo en el cliente, y el cliente es enteramente su dueño.

Este documento clasifica cada objeto relevante de Paladin en una de tres categorías según esa pregunta de propiedad:

| Categoría | Regla de pertenencia |
|---|---|
| **Cliente-only** | Nunca se envía al backend salvo que un acto explícito lo transforme en otra cosa. Mientras no ocurra ese acto, es pura conversación (Cor) y el cliente es su única fuente. |
| **Proyección read-only** | El backend ya lo trata como fuente de verdad (una regla de Gravity, un evento de arbitraje, un rol de autorización). El cliente sólo lo muestra — nunca lo edita, nunca lo mantiene como copia que sobrevive de forma independiente al dato que representa. |
| **Híbrido** | Combina un núcleo backend-autoritativo (inmutable desde el cliente) con una envoltura de estado de interfaz que es enteramente del cliente y nunca viaja de vuelta como si fuera Gravity. |

---

## 2. Tabla de objetos

| Categoría | Objeto | Dónde vive | Mutabilidad | Dependencia del backend | Comportamiento al cerrar sesión |
|---|---|---|---|---|---|
| **Cliente-only** | `PosturaDraft` — borrador de Postura en el panel de postulación (criterio + alcance propuesto), UX §1.4 | Estado del panel de postulación en el cliente (memoria de componente; a lo sumo `sessionStorage` del tab para sobrevivir un refresh accidental — nunca sincronizado a backend) | Totalmente mutable: criterio editable, alcance reasignable, hasta confirmar o descartar | Ninguna. No corresponde a ningún DTO de **API** (`IntentDraft`, `validate_and_sign`, etc.) — nace de un mensaje ya enviado a la conversación (Cor, UX §1.1–§1.2) y todavía no cruzó el acto de postulación | **Se pierde.** No se guarda como borrador persistente (ver §3) |
| **Cliente-only** | `ComposerDraft` — texto no enviado en el campo de entrada | Estado del compositor, en memoria del cliente | Totalmente mutable | Ninguna — nunca llegó siquiera a ser un turno de conversación | Se pierde, sin tratamiento especial: es la misma pérdida que cualquier cliente de chat convencional acepta para texto no enviado |
| **Proyección read-only** | `GravityActivaDelTurno` — breadcrumb compacto + panel expandido por turno, UX §2 | Adjunto de forma inmutable a cada turno del historial de conversación del cliente — un arreglo de snapshots por turno, **no** un objeto singleton "Gravity actual" que se sobreescribe | Inmutable tras su creación. El cliente nunca edita `postureId`/`origin`/`sourceMandateId`; un turno nuevo crea un snapshot nuevo, nunca actualiza uno anterior | `gravity_context_injected[]` de la respuesta de `validate_and_sign` (**API** §2.4) y/o `resolve_active_gravity(session_id)` (**API** §3.2) — nunca el grafo completo (**API** §3.1, decisión explícita citada de **Impl** §2.4) | El cache local de turnos pasados se descarta; al reabrir la sesión se vuelve a pedir al backend (log de turnos), nunca se resucita desde la copia local tratada como autoritativa |
| **Proyección read-only** | `AutoridadDeAlcanceDelIngeniero` — qué niveles (Sesión/Mandate/Project/Organization) puede firmar el ingeniero actual; habilita o deshabilita opciones en el selector de alcance, UX §1.4 | Cache de sesión en el cliente, **revalidada cada vez que se abre el panel de postulación** (no cacheada de una sola vez para toda la sesión — ver corrección en §4) | Read-only estricto — el cliente nunca asigna ni modifica roles | Modelo de autorización de Nucleus (`RoleMaster` / `RoleSpecialist`). **Audit** advierte que el rol `Architect`, que **Impl** §1.3 asume para firmar `PROJECT`, no existe en el modelo de autorización vigente — el cliente debe reflejar los roles que el backend realmente devuelve, nunca los nombrados en la spec de Gravity | Se descarta; se vuelve a pedir al backend en la próxima sesión y en cada apertura del panel dentro de la misma sesión |
| **Proyección read-only** | `VistaDeGrafoCompletoBajoDemanda` — "Ver grafo completo", UX §2.3 | Sólo en memoria del cliente mientras esa vista separada y deliberada está abierta | Read-only | 🆕 Gap: **API** §3.2 no define todavía un endpoint standalone para esto; **Impl** sólo prohíbe exponer el grafo completo al Agent Loop, no fija el contrato para un visor humano | Se descarta por completo al cerrar la vista (no sólo la sesión) — nunca queda residente en memoria como estructura de fondo, siguiendo la misma disciplina de exposición mínima que aplica **API** §3.1 y §3.3 |
| **Híbrido** | `ConflictoDeTurnoCard` — una de las seis señales de conflicto, UX §3.2 | Adjunto al turno correspondiente en el historial del cliente | Núcleo backend (`nucleus_decision`, `reason_code`, `detail`, `posture_ref`, `conflict_with`, alternativa ejecutada, autoridad de excepción) inmutable/read-only. Envoltura de cliente (expandido/colapsado; y si la señal es la #6 "Proponer modificar Gravity", el gesto que reabre el panel de postulación) libremente mutable | Respuesta de `validate_and_sign` (**API** §2.2–§2.4) mapeada a las seis señales de **UX** §3.2 | El núcleo backend se vuelve a pedir al reabrir (mismo criterio que `GravityActivaDelTurno`); el estado de interfaz (expandido/colapsado) se pierde sin consecuencia — es ajuste visual, nunca contenido gobernado por Gravity |
| **Híbrido** | `ArbitrationNotificationCard` — notificación de arbitraje, **API** §4 | Lista de notificaciones del cliente | Núcleo backend (`ArbitrationEvent` completo: `eventId`, `conflictScope`, `involvedMandateIds`, `resolution`, `resolvedBy`, etc.) inmutable/read-only — el cliente nunca lo edita ni siquiera localmente. Envoltura de cliente: marca local "visto/no visto" | `ArbitrationEvent` (**API** §4.1), entregado por push o descubierto por poll (**API** §4.3, propuesta) | La marca "visto/no visto" es una comodidad de interfaz, no un artefacto de Gravity — puede perderse sin problema al cerrar. El evento en sí nunca se guarda localmente como si el cliente fuera su fuente: siempre se re-consulta al backend, que ya lo persiste ("persiste como nodo propio en el grafo", **API** §4.1 cita **Impl** §3.4) |
| **Híbrido (transición)** | `PosturaPendienteDeConfirmación` — objeto optimista entre el clic en "Confirmar postulación" y la respuesta del backend | Cliente, creado en el instante del envío | Congelado en el momento del envío (ya no editable, a diferencia de `PosturaDraft`); sólo cambia su campo de estado (`enviando` / `pendiente` / `confirmada` / `rechazada`), dirigido por la respuesta del backend | 🆕 Gap señalado también en **Audit**: el catálogo no define todavía qué endpoint recibe la postulación de una Postura de alcance Sesión (**Impl** §1.3 dice que se captura "sin firma formal previa", pero no hay un DTO de postulación distinto de `cor` — y `cor` está vetado como canal para esto, **API** §1.3, **COR** §0/§3.1). Este objeto modela la espera, no presupone el contrato final | Si la confirmación no se resolvió antes del cierre, se pierde igual que un `PosturaDraft` no confirmado — no queda como Postura fantasma ni se reintenta silenciosamente en segundo plano. Si el backend ya respondió con éxito, este objeto ya fue reemplazado por la proyección read-only correspondiente y por lo tanto no es lo que se pierde |

---

## 3. Por qué el borrador de Postura no confirmada debe perderse al cerrar

Cor traza la frontera entre dos actos con precisión:

> "Cuando algo que está pensando deja de ser solamente parte de la conversación y pasa a representar cómo considera que el trabajo debe ser realizado, puede postular una postura." (Cor)

Un `PosturaDraft` abierto en el panel — por más que su texto ya esté redactado, por más que el alcance ya esté elegido — **todavía no cruzó ese acto**. Estructuralmente sigue siendo conversación: algo que el ingeniero está pensando, no algo que ya declaró como posición. Orb lo confirma desde el lado de Gravity, no de Postura:

> "No toda conversación se convierte en Gravity." (Orb, Principio XI, §28)

> "La persistencia debe ser deliberada." (Orb, mismo principio)

Si un borrador no confirmado sobreviviera al cierre de la sesión — reapareciendo la próxima vez como si todavía estuviera "a mitad de camino" hacia ser una Postura — el sistema le estaría dando una forma de permanencia que ningún acto deliberado del ingeniero autorizó. La persistencia dejaría de ser deliberada: sería un efecto secundario de haber dejado una pestaña abierta, no una decisión.

**Propuesta de este documento:** al cerrar la sesión de Paladin (o al navegar fuera de ella de una forma que termina la sesión), cualquier `PosturaDraft` o `ComposerDraft` abierto se descarta sin advertencia y sin ofrecerse para recuperar en la sesión siguiente. El acto deliberado sigue siendo, exclusivamente, el clic en "Confirmar postulación" (UX §1.4, paso 3) — no el hecho de haber escrito el criterio, y no el hecho de cerrar o reabrir una pestaña.

**Explícitamente fuera de alcance:** puede existir una necesidad de producto legítima de permitir "guardar borrador" — por ejemplo, un ingeniero que está redactando una Postura extensa y quiere continuarla mañana. Este documento no la resuelve ni la descarta. La señala como **decisión de producto pendiente**, a evaluarse por separado, precisamente porque introducir un borrador persistente cambia el principio recién establecido (persistencia deliberada, no accidental) y merece su propio análisis de diseño — no una resolución de paso dentro de este catálogo de objetos.

---

## 4. Verificación final — ¿algún objeto termina siendo copia mutable de algo autoritativo?

Se revisó cada objeto de la tabla contra la pregunta explícita: **¿existe algún punto en el que el cliente mantenga, como estado propio y mutable, algo que Nucleus ya trata como fuente de verdad?**

- `GravityActivaDelTurno`: no. Es inmutable por diseño (snapshot congelado por turno) y el historial se re-solicita al backend al reabrir, en vez de tratarse la copia local como autoritativa.
- `VistaDeGrafoCompletoBajoDemanda`: no. No hay caching de fondo; se descarta al cerrar la vista, no sólo la sesión.
- `ConflictoDeTurnoCard` y `ArbitrationNotificationCard`: no. En ambos, el núcleo backend-autoritativo es estrictamente read-only y la única parte mutable (expandido/colapsado, visto/no visto) es metadato de interfaz que nunca pretende representar Gravity ni un evento de arbitraje.
- `PosturaPendienteDeConfirmación`: no, pero es el caso que exige más cuidado — es, por diseño, un objeto temporal que *precede* a la versión autoritativa. Se verificó que nunca coexiste permanentemente con ella: al llegar la respuesta del backend se reemplaza (éxito) o se descarta (rechazo/cierre), nunca queda como una segunda copia en paralelo.
- `PosturaDraft` y `ComposerDraft`: no aplica — no tienen contraparte backend mientras son borrador, por definición no pueden ser copia de algo que todavía no existe del lado de Nucleus.

**Un caso sí requirió corrección durante este análisis:** `AutoridadDeAlcanceDelIngeniero`. La primera formulación de este objeto lo trataba como una cache de sesión completa, pedida una sola vez al entrar a Paladin. Ese diseño es exactamente el error que esta verificación existe para atrapar: aunque el cliente nunca *edita* ese dato, una cache de sesión completa sin revalidación se convierte, en la práctica, en una copia que puede divergir silenciosamente de la autoridad real (un rol revocado o cambiado a mitad de sesión seguiría mostrando el nivel de alcance viejo como disponible en el selector de la sección 1.4 de **UX**). Se corrigió en la tabla de §2: el objeto se revalida en cada apertura del panel de postulación, no una sola vez por sesión. Con esa corrección aplicada, ningún objeto de este modelo queda como copia mutable — ni editable ni meramente obsoleta por falta de revalidación — de algo que el backend ya considera autoritativo.

---

## 5. Otros gaps heredados (no generados por este documento)

- El contrato de backend para postular una Postura de alcance Sesión (qué recibe el envío de `PosturaDraft`, con qué respuesta) no está definido en **API** ni en sus fuentes — heredado de **Audit**, no inventado aquí. `PosturaPendienteDeConfirmación` modela la espera sin presuponer ese contrato.
- El mecanismo de firma para Postura de alcance `PROJECT` depende de una brecha de Authorization ya identificada (`Architect` no existe en el modelo vigente) — heredado de **Audit**, afecta a `AutoridadDeAlcanceDelIngeniero` pero no lo resuelve este documento.
- Los tokens visuales definitivos (color, tipografía) siguen fuera de alcance, tal como ya lo fija **UX** §6.

---

*Fin del borrador v0.1. Análisis en curso — no reemplaza ni cierra `Paladin_UX_Postura_Gravity_Masa_Spec_v0_1.md` ni `NUCLEUS_API_Contracts_Consolidado_v0_1.md`, se apoya en ambos.*
