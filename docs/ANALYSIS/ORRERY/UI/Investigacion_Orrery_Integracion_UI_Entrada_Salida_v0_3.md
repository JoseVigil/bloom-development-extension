# Investigación — Orrery integrado en la UI: entrada, propósito, salida y frontera con Assembly/ASEM

**Tipo:** Investigación de arquitectura de UX de integración [R]. No es diseño final de interfaz, no es
wireframe, no autoriza cambios de código.
**Estado:** v0.3 — incorpora la devolución de José a `Investigacion_Orrery_LocationFirst_Reorientacion_v0_2.md`.
**Fecha:** 2026-09-20.
**No reabre:** el contrato `LocationSnapshot v0.1` (`docs/ANALYSIS/ORRERY/LOCATION/Orrery_LocationSnapshot_v0.md`).
Ese documento sigue siendo, sin cambios, la fuente de verdad de qué es una Location y qué captura. Este
documento no vuelve a preguntar qué es Location — la usa como dato ya cerrado.
**Lo que cambia respecto de v0.2:** v0.2 se quedó investigando *hacia adentro* de Orrery (qué representa,
qué excluye). Esta ronda se mueve a la capa inmediatamente superior: **Orrery no es una experiencia
aislada — es una capa visual de navegación espacial dentro de un sistema mayor**, y lo que falta investigar
es la interfaz entre esa capa y la UI que la contiene: cómo se entra, qué se hace mientras se está adentro,
qué se obtiene, cómo se sale, y dónde termina Orrery y empieza Assembly/ASEM.

---

## §0 — El diagrama que ordena esta ronda

```text
UI / SISTEMA CONTENEDOR
        │
        │ contexto existente (un scope, un anchor, algo ya seleccionado en la UI plana)
        ▼
     ENTRADA                    ← §1
        │
        ▼
     ORRERY                     ← §2
        │
        │ Location como key driver
        │ navegación / observación / análisis espacial
        │ Mandates visualizados como objetivos sobre el territorio (§2.3)
        │
        ▼
     RESULTADO                  ← §3
        │  (comprensión espacial, no necesariamente un objeto nuevo persistido)
        ▼
      SALIDA                    ← §4
        │
        ▼
UI / SISTEMA CONTENEDOR
        │
        ▼
ASSEMBLY / ASEM (Intent nuevo)  ← §5
        │
        ▼
POSTULATE
```

Location (`LocationSnapshot`) sigue siendo el key driver de la experiencia espacial — eso no cambia. Lo que
esta ronda agrega es todo lo que rodea a esa experiencia: cómo se entra, con qué propósito, qué convive
adentro (Mandates como objetivos visualizados, no como razón de ser), qué se lleva el usuario, cómo sale, y
dónde exactamente termina la responsabilidad de Orrery y empieza la de Assembly/ASEM.

---

## §1 — Entrada: de la UI existente a Orrery

### 1.1 La pregunta, ampliada

No es "¿qué acción abre Orrery?". Es: **¿desde qué contexto de la UI existente entra el usuario, qué motivo
operativo tiene, qué elemento constituye el punto de entrada, y qué contexto debe conservar Orrery al
recibirlo?**

### 1.2 Regla que gobierna la entrada

La entrada debe partir de algo que **ya existe** en el sistema — nunca de que Orrery descubra una
necesidad, interprete un Mandate, o decida que el usuario "debería" explorar determinado territorio. El
usuario llega con un contexto y eleva su perspectiva hacia Orrery. Esto es la misma regla que ya fijó
`Investigacion_Orrery_LocationFirst_Reorientacion_v0_2.md` §6 (el disparador está asociado a *dónde* está
parado el usuario, no a una interpretación de *qué* está pasando ahí) — esta ronda no la cambia, la aplica
con más precisión a los puntos de entrada concretos que ya existen en el shell real.

### 1.3 Puntos de entrada candidatos, contra lo que ya existe en código

La auditoría de UI (`Investigacion_Auditoria_Estado_UI_Consolidada_v0_1.md`, §1 y §6.1) confirma qué shell
2D existe hoy en producción. Cualquier punto de entrada a Orrery tiene que anclarse en algo de esa lista, no
inventar un contexto nuevo:

| Contexto existente en la UI | Qué anchor/Location podría constituir el punto de entrada |
|---|---|
| `MandateTab.svelte` — un Mandate abierto, con Domains conocidos | El Project/Domain sobre el que opera ese Mandate, ya identificable en el estado del Mandate |
| `NucleusPanel.svelte`/`ProjectsPanel.svelte` — CRUD real de Organization/Project (auditoría §1, "fuera del corpus del encargo... operativas") | Un Project seleccionado en esa lista, con `ProjectBinding` ya resuelto — es, literalmente, el caso fundacional de `LocationSnapshot` §F.1 ("el usuario abre un Project") |
| Picker de Capa 0 (`docsGate.ts`, migrado 1:1 dentro de `MandateTab.svelte`) | Un Domain candidato ya detectado, si resulta admisible como anchor |
| `Sidebar.svelte` — navegación general del shell | Contexto de Organization activa, no un anchor específico por sí sola |

**Nota importante:** de esta lista, sólo el Project vía `NucleusPanel`/`ProjectsPanel` es hoy un anchor
admisible sin ambigüedad bajo `LocationSnapshot` (Project es tipo de referencia soberana ya resuelta). Un
Domain candidato del picker de Capa 0 no es todavía un Domain canónico (ver `ORRERY_LOCATION_MATERIAL_
CLOSURE_v1_1.md`, tratado aquí como antecedente histórico, pero cuyo hallazgo de hecho — que el índice
canónico Domain/Gene no tiene productor conectado — sigue siendo válido salvo que algo lo haya corregido
después). Esto no bloquea diseñar el gesto de entrada; sí bloquea prometer que hoy aterriza sobre un
territorio real en todos los casos.

### 1.4 Qué contexto debe conservar Orrery al recibir la entrada

Como mínimo, sin inventar campos nuevos fuera de lo que `LocationSnapshot` ya define: la referencia del
anchor de origen (para poder aterrizar con foco, no en la vista general — ver v0.2 §7), y una referencia al
contexto de UI de origen (qué tab/panel abrió el gesto), para que la salida (§4) pueda ser simétrica. Esta
segunda referencia **no es parte de `LocationSnapshot`** — es estado de la capa de integración, propiedad
del cliente de UI, no de la captura de Location. Se mantiene, en los términos de `Paladin_Client_Object_
Model_v0_1.md` §2 (tratado aquí como antecedente, categorías todavía útiles), como algo "cliente-only" o
"híbrido", nunca como un campo dentro del payload de Location.

---

## §2 — Dentro de Orrery: navegación, propósito del usuario, y Mandates como objetivos visualizados

### 2.1 La actividad principal sigue siendo espacial

Navegar, seleccionar anchors, comprender posición estructural, observar relaciones/ancestros/vecinos,
analizar la configuración espacial de la Location. Esto no cambia respecto de v0.2 — es exactamente lo que
`LocationSnapshot` habilita y nada más.

### 2.2 El propósito del usuario no es lo mismo que el contrato de Location

Distinción que esta ronda deja explícita, porque v0.2 no la tenía:

```text
Orrery no interpreta el propósito.
El usuario sí puede tener un propósito al usar Orrery.
```

Un ingeniero puede entrar a Orrery para entender por qué dos Domains están relacionados antes de decidir si
vale la pena declarar algo sobre ellos; puede entrar simplemente para orientarse; puede entrar como parte de
un proceso más largo que termina en Assembly (§5). Orrery no necesita — ni debe — distinguir estos casos
para funcionar. La investigación de UX puede estudiar estos patrones de uso como contexto de diseño, pero
nunca traducirlos en una rama de comportamiento del contrato de Location (eso volvería a ser el error de
v0.1: convertir el propósito en parte de lo que Orrery interpreta).

### 2.3 Mandates como objetos de visualización de objetivos — sin redefinir Orrery

La devolución aclara algo que v0.2 dejó en un lugar demasiado tajante: separar Mandate de Location (correcto,
se mantiene) no significa que Mandate desaparezca de la experiencia. La distinción correcta es:

```text
Location  = dónde
Mandate   = objetivo que puede visualizarse sobre ese territorio
```

Esto es compatible con todo lo que ya se estableció:

- `LocationSnapshot` puede observar un nodo Gravity `MANDATE` como anchor, ancestro o vecino — está en el
  enum de `nodeType` del propio JSON Schema (Sección E). No hace falta inventar nada para que un Mandate
  aparezca *referenciado* dentro de una Location capturada.
- Lo que sigue fuera de v0.1, sin cambios, es que Location **evalúe o interprete** ese Mandate (su estado
  de ejecución, sus Intents, si está corriendo o no). Mostrar que un nodo `MANDATE` existe como parte de la
  posición estructural es observación (admisible); mostrar su progreso en vivo es evaluación de proceso
  (sigue fuera de v0.1, ver v0.2 §5).
- `mandateStore.ts` (auditoría §2.1) sigue siendo la única fuente de verdad de qué está pasando con un
  Mandate. Si Orrery visualiza Mandates como objetivos sobre el territorio, debe leer de ese store — nunca
  reimplementar su propio estado de Mandate en paralelo. Esto ya estaba dicho en
  `Investigacion_Orrery_VisorMandatos_Postulates_GatewayUX_v0_1.md` §4.1 y sigue siendo válido; lo que v0.1
  hacía mal no era leer del store, era concluir de ahí que Orrery *debía redefinirse* alrededor de eso.

**Formulación de trabajo para esta investigación:** un Mandate se visualiza en Orrery como un marcador o
etiqueta sobre el Domain/territorio al que pertenece — un objetivo señalado sobre el mapa, no un proceso
narrado con timeline propio (eso era el error del `marker`/`route` del prototipo, correctamente descartado
en v0.2 §2). La diferencia es sutil pero importante: "acá hay un Mandate que persigue tal objetivo, ubicado
en este territorio" es observación de posición; "este Mandate está en el paso 3 de 4, ejecutando tal Intent
ahora mismo" es narrar un proceso — y eso excede lo que la capa espacial de Orrery debería mostrar según el
propio invariante (Orrery describe dónde, no qué está pasando ahí en tiempo real).

Esta formulación es una hipótesis de diseño para la próxima Propuesta, no una decisión — se marca así en
§7, pregunta 4.

---

## §3 — Resultado: qué obtiene el usuario de la experiencia

### 3.1 La pregunta que faltaba

`LocationSnapshot` define qué **captura** Orrery. No define qué **comprende** el usuario ni qué **construye**
después otro sistema. Son tres categorías distintas:

```text
Lo que Orrery CAPTURA        (LocationSnapshot — ya cerrado, no se reabre)
        ≠
Lo que el usuario COMPRENDE  (objeto de esta investigación)
        ≠
Lo que otro sistema CONSTRUYE (Assembly/ASEM — fuera de esta investigación, ver §5)
```

### 3.2 El producto de la experiencia no es necesariamente un objeto persistido

En primera instancia, lo que el usuario se lleva de Orrery es **comprensión espacial y contexto**: dónde
está, qué está conectado, cuál es su posición estructural, qué vecinos existen, qué objetivos/Mandates
están señalados en ese territorio. Una `LocationSnapshot` capturada es *un* resultado posible (el usuario
decide fijar esa captura), pero no es el único resultado válido: el usuario puede salir de Orrery sin
capturar nada, llevándose sólo la comprensión, y eso sigue siendo un uso legítimo y completo de la
herramienta.

Esto importa para el diseño de la salida (§4): no se puede asumir que "salir de Orrery" siempre coincide con
"hay una Location capturada para pasar al siguiente paso". El mecanismo de salida debe funcionar en ambos
casos.

---

## §4 — Salida: volver al plano operativo

### 4.1 Por qué esto merece ser una pregunta central, no un detalle

v0.1 y v0.2 mencionaban "retorno simétrico y no destructivo" como una línea dentro del mecanismo de umbral.
La devolución señala, con razón, que esto necesita investigación propia: **la salida de Orrery no es
abandonar una vista 3D, es devolver al usuario al plano operativo desde el cual podrá usar lo que acaba de
observar.**

### 4.2 Lo que hay que determinar (sin resolverlo todavía — son preguntas de diseño, no de contrato)

- Desde qué contexto entró el usuario (dato que §1.4 ya pide conservar).
- Qué contexto debe recuperar al salir — ¿el mismo `MandateTab` o panel exacto, en el mismo estado?
- Qué selección/anchor debe conservarse — si el usuario cambió de foco varias veces dentro de Orrery, ¿cuál
  de esos focos "cuenta" al volver?
- Qué resultado de la exploración queda disponible — si hubo una `LocationSnapshot` capturada, ¿dónde
  aparece en la UI de destino?
- Qué estado visual o cognitivo debe mantenerse — evitar que el regreso se sienta como un reinicio.
- Cuándo el usuario considera que terminó — esto es una señal de UX (un gesto de "salir"), no algo que
  Orrery infiera.
- Qué acción concreta lo lleva de la observación espacial a la siguiente actividad del sistema.

### 4.3 Restricción heredada de A4 (Location Closure, antecedente histórico, dato compatible)

`ORRERY_LOCATION_MATERIAL_CLOSURE_v1_1.md` §10 (tratado como antecedente, no como contrato) señalaba un gap
A4: "reapertura de Orrery con representación equivalente independiente del layout". Aunque ese documento ya
no es la fuente de verdad de Location, el problema que describe sigue siendo relevante para la salida: si el
usuario vuelve a entrar más tarde sobre la misma Location capturada, debe poder reconstruir el mismo foco
semántico aunque el layout visual haya cambiado. Esto no es parte del contrato de captura (`LocationSnapshot`
no lo promete); es una propiedad deseable de cómo Orrery, como capa de UI, trata sus propias capturas.

---

## §5 — La frontera con Assembly/ASEM y Postulate

### 5.1 Lo que aclara la devolución

Existe un Intent nuevo — **Assembly/ASEM** — que ocurre **fuera de Orrery**. La frontera es la que marca el
cambio de modo: mientras el usuario navega, observa y comprende, está en Orrery; en el momento en que
empieza a **gestionar y construir** sobre lo que analizó, eso ya es Assembly, no Orrery.

```text
ORRERY                          ASSEMBLY / ASEM                POSTULATE
Location                        gestionar
↓                                componer
navegar                          construir
observar
analizar
comprender
        ↓ salida         ────────────────────►         ↓
```

### 5.2 Qué le corresponde a esta investigación y qué no

Esta investigación **no diseña** Assembly ni Postulate — la devolución lo dice explícitamente y coincide con
lo que ya sabíamos de `LocationSnapshot` (Postulate no está definido en ningún documento del corpus, viejo
o nuevo). Lo que sí le corresponde a esta línea de investigación es una pregunta de integración muy
concreta: **qué información/contexto obtenido en Orrery debe sobrevivir a la salida para que el usuario
pueda continuar correctamente en Assembly/ASEM.**

Formulado con la misma disciplina que el resto del documento: esto no significa que Orrery deba producir un
objeto pensado para Assembly (eso sería diseñar el consumidor, todavía fuera de alcance — ver v0.2 §7,
pregunta 2). Significa que la investigación debe identificar **qué preguntas tendría que poder responder
Assembly sobre lo que pasó en Orrery**, sin comprometerse todavía a cómo se transporta esa respuesta. Como
mínimo, candidatas a estudiar en la próxima ronda (no resueltas acá):

- ¿Qué Location(s) se exploraron o capturaron?
- ¿Qué anchors quedaron señalados al momento de salir?
- ¿Qué Mandates/objetivos estaban visibles sobre ese territorio?

### 5.3 Orrery puede participar en el camino a un Postulate sin crearlo

La secuencia conceptual que aporta la devolución (`UI → Orrery → exploración → análisis → salida → gestión
→ Assembly/ASEM → Postulate`) es coherente con todo lo que este documento ya estableció. Se adopta tal
cual, como marco para próximas rondas, sin agregar nada que Orrery deba hacer para "prepararse" para ese
camino más allá de existir como buena herramienta de comprensión espacial.

---

## §6 — Qué sigue perteneciendo inequívocamente a cada capa (frontera resumida)

| Pregunta | Pertenece a |
|---|---|
| Qué captura una Location, qué excluye, sus estados de resolución | `LocationSnapshot v0.1` — cerrado, no se reabre |
| Cómo se navega/visualiza esa Location, cómo se señalan anchors | Orrery (esta línea de investigación) |
| Cómo se entra a Orrery desde la UI existente, con qué contexto | Frontera Orrery↔UI contenedora (esta investigación, §1) |
| Cómo se visualiza un Mandate como objetivo sobre el territorio | Orrery, leyendo de `mandateStore.ts` — nunca reinterpretando su estado (esta investigación, §2.3) |
| Qué está pasando ahora mismo con la ejecución de un Mandate (progreso, Intents en curso) | `MandateTab.svelte`/`mandateStore.ts` — no Orrery |
| Cómo se sale de Orrery y qué contexto se recupera | Frontera Orrery↔UI contenedora (esta investigación, §4) |
| Qué se gestiona/compone a partir de lo explorado | Assembly/ASEM — fuera de esta investigación |
| Qué es y cómo se crea un Postulate | Fuera de esta investigación; fuera también de Assembly según lo poco que se sabe hoy — pendiente de su propio research |

---

## §7 — Preguntas abiertas, reformuladas (reemplazan las de v0.2 §7)

1. **Entrada:** ¿cuáles de los contextos de §1.3 deben tener el gesto de entrada en la primera iteración —
   sólo Project vía `NucleusPanel`, o también Domain candidato desde el picker de Capa 0, sabiendo que este
   último no aterriza hoy sobre territorio canónico?
2. **Propósito del usuario:** ¿existe ya, en algún lugar del producto, telemetría o intención declarada de
   por qué la gente querría "elevar la perspectiva" — o esta investigación debe proponer hipótesis de
   propósito sin datos de uso todavía?
3. **Visualización de Mandate como objetivo:** ¿se ratifica la hipótesis de §2.3 (Mandate = marcador de
   objetivo estático sobre el territorio, sin narrar su progreso en vivo), o José tiene en mente algo
   distinto para "visualizar objetivos"?
4. **Resultado transportable:** de las tres preguntas candidatas de §5.2 (qué Locations, qué anchors, qué
   Mandates visibles), ¿hay otras que Assembly necesitaría y que esta investigación debería anticipar, sin
   llegar a diseñar el mecanismo de transporte?
5. **Multiplicidad de foco en la sesión:** si el usuario cambia de anchor varias veces dentro de una misma
   visita a Orrery (§4.2), ¿la salida debe ofrecer elegir cuál llevarse, o se asume el último foco activo
   por defecto?
6. **Assembly/ASEM:** ¿existe ya algún documento o cowork en curso sobre Assembly/ASEM que esta
   investigación debería leer como antecedente, o es un concepto que se está nombrando por primera vez acá?

### Secuencia recomendada

1. Resolver 1, 3 y 6 con José — son las que más condicionan cómo seguir (qué entradas priorizar, si la
   hipótesis de Mandate-como-marcador es correcta, si hay contexto de Assembly que falta leer).
2. Con eso resuelto, Propuesta de diseño de la capa de integración: gestos de entrada/salida concretos,
   forma de conservar contexto de UI de origen, forma de presentar Mandates como objetivos sobre el
   territorio — todavía sin tocar código.
3. Recién después, si Assembly/ASEM ya tiene su propio research, una investigación separada y posterior
   sobre qué contexto de Orrery necesita consumir Assembly — nunca antes de que ese research exista.
