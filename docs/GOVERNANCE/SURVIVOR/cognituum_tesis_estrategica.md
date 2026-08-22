# Cognituum: Tesis Estratégica de Supervivencia

**Documento fundador — versión post-interpelación**
*Respuesta estructurada a la refutación cruda de Codex sobre `cognituum_refutaciones.md`*

---

## 0. Propósito de este documento

Este no es un manifiesto de entusiasmo. Es una redefinición deliberadamente angosta de qué es Cognituum, motivada por una interpelación externa que expuso que la versión anterior del proyecto defendía terreno que no es defendible a diez años.

El documento anterior (`cognituum_refutaciones.md`) tenía una falla estructural: ante cada amenaza, redefinía a Cognituum para que quedara fuera de su alcance, y convertía la amenaza en validación. Este documento hace lo contrario: acepta las condiciones de derrota, elige un terreno angosto, y define una prueba capaz de refutar la tesis.

Si esa prueba falla, este documento también cae. Esa es la intención.

---

## 1. Las tres versiones de Cognituum

No hay un solo Cognituum posible. Hay tres, y solo una sobrevive diez años.

| # | Versión | Destino |
|---|---|---|
| 1 | Memoria, auditoría y permisos para agentes | Pierde. Los grandes proveedores (GitHub Copilot Memory, Codex con sandboxing/approvals/OpenTelemetry) ya están construyendo esto con recursos que un jugador chico no puede igualar. |
| 2 | Wrapper que traduce Intents en prompts para Codex/Claude/OpenCode | Pierde. Poco moat, absorbible por cualquier CLI que agregue una capa de templates. |
| 3 | Protocolo y control plane independiente que conserva autoridad, intención, decisiones, ejecución y evidencia entre proveedores | **Es la única apuesta legítima a diez años.** |

Todo lo que sigue en este documento es exclusivamente sobre la versión 3. Las versiones 1 y 2 se abandonan como tesis central — pueden existir como capacidades instrumentales, nunca como diferenciador.

---

## 2. La tesis central (versión angosta)

> **Cognituum no es memoria para agentes, ni auditoría, ni sandbox, ni un meta-IDE. Es el protocolo independiente mediante el cual una organización conserva la propiedad de su intención técnica y delega ejecución revocable a cualquier inteligencia o runtime.**

Formulación operativa, más angosta y más falsable:

> **Cognituum es el lugar donde vive la decisión técnica y su razón — no la ejecución. Cuando cambia el proveedor, el modelo, la sesión o incluso la organización, el Intent y su historial de decisiones sobreviven ese cambio sin degradarse ni perder autoría.**

La pregunta que la sostiene es la única pregunta que ningún proveedor de IA tiene incentivo estructural para responder por su cuenta:

> ¿Quién posee el significado y la autoridad del trabajo cuando cambian el modelo, el proveedor, el runtime, la organización o la sesión?

---

## 3. Por qué esto es lo único gratis que tenemos

Un proyecto chico contra jugadores con miles de ingenieros no puede competir en velocidad, recursos ni cobertura de features. Memoria, sandbox, logs, RBAC — ese terreno se pierde por matemática, no por falta de mérito.

La única ventaja estructural disponible es el **desalineamiento de incentivos**: OpenAI no va a construir portabilidad neutral entre Codex, Claude Code y OpenCode, porque eso facilita que el usuario se vaya de Codex. Ningún vendor va a invertir en la salida de su propio lock-in.

Ese desalineamiento no es una ventaja táctica temporal. Es estructural y no se puede cerrar con un lanzamiento de producto, porque cerrarla implicaría que el vendor trabaje en contra de su propio negocio.

**Esto es el terreno completo donde Cognituum puede competir. Fuera de él, pierde siempre.**

---

## 4. La prueba que puede refutar (o validar) todo el proyecto

No se avanza en arquitectura sin antes intentar romper la tesis con evidencia, no con argumento.

### La prueba cross-CLI

> Interrumpir una tarea en Codex, continuarla en OpenCode o Claude Code, y cerrar el Intent sin perder autoridad, estado, decisiones ni evidencia.

Por qué es *esta* prueba y no otra:

1. **Es binaria.** El Intent sobrevive el cambio de runtime con autoridad y evidencia intactas, o no. No admite reinterpretación favorable — el mismo defecto que tenía el documento de refutaciones original.
2. **Aísla el único terreno con incentivos a favor.** Es exactamente la prueba que ningún vendor tiene motivo de resolver por su cuenta.
3. **Es barata de intentar y cara de fingir.** No requiere Brain, AITAP, Nucleus, ni la arquitectura completa. Requiere: un Intent con estado mínimo, una forma de serializarlo, y demostrar la continuidad de decisión al cruzar de motor.

### Regla de decisión, escrita de antemano

- **Si la prueba pasa:** hay evidencia real (no argumentativa) de que existe un objeto — la decisión y su razón — que puede vivir fuera de cualquier runtime individual. Se procede a la Sección 5.
- **Si la prueba falla de forma clara y repetida:** el proyecto se reduce a lo que sí demuestra valor por sí solo — Mandates como capa de decisiones técnicas acumulables y compartibles — sin la ambición de protocolo independiente. No es fracaso total; es un ajuste de alcance basado en evidencia.

Este documento asume que la prueba **pasa**. Lo que sigue es el desarrollo de esa rama.

---

## 5. El fuerte real (si la prueba se sostiene)

Que la prueba pase no demuestra el protocolo completo. Demuestra que el mecanismo central no es imposible. Eso habilita tres consecuencias concretas, y son esas consecuencias — no el mecanismo en sí — las que constituyen el verdadero moat.

### 5.1 Rompe el lock-in de contexto, no solo el de modelo

El lock-in que todos discuten es el de modelo — cambiar de API es trivial. El lock-in real es el de **contexto acumulado**: todo lo que un agente aprendió sobre por qué se hicieron las cosas de cierta manera, en ese repo, durante esa sesión, con ese proveedor. Hoy eso se pierde o queda enterrado en logs propietarios no estructurados.

Si Cognituum externaliza ese contexto como objeto portable, vende la salida de un lock-in que ningún ingeniero senior nombra todavía como problema explícito, pero que ya sintió cada vez que tuvo que "reexplicarle todo" a una herramienta nueva.

### 5.2 Cambia la unidad de auditoría de "sesión" a "intención"

Codex audita una sesión de Codex. Copilot Memory audita el alcance de Copilot. Ningún vendor individual puede auditar un Intent que cruzó tres proveedores y dos semanas — no por falta de capacidad técnica, sino porque estructuralmente no tiene visibilidad del otro lado.

Esto no es "mejor logging". Es una categoría de evidencia que solo puede existir **afuera** de cualquier vendor individual. Por eso no es copiable dentro de un CLI: hacerlo bien exigiría neutralidad respecto de sí mismo, algo que ningún proveedor puede ofrecer de forma creíble.

### 5.3 Da propiedad revocable, no solo portabilidad

Hoy, si una organización quiere dejar de depender de un proveedor de IA, se lleva el código pero no el criterio técnico acumulado: qué se descartó, por qué, quién aprobó bajo qué supuesto. Eso muere con la sesión o queda fragmentado en logs no reutilizables.

Si Cognituum convierte ese criterio en un activo que la organización posee y puede revocar o mover a voluntad, no compite con Codex — vende un **seguro contra la dependencia de cualquier IA de frontera**. Esto le importa mucho más a quien decide infraestructura organizacional que a un desarrollador individual evaluando qué CLI usar hoy.

---

## 6. Formulación final del moat

> **Cognituum no vende mejor ejecución ni mejor gobernanza administrativa. Vende la única cosa que un proveedor de IA no tiene incentivo estructural para darte: la propiedad, portable y auditable, del criterio técnico que sobrevive a cualquiera de ellos.**

El moat no son los nombres de los componentes (Brain, AITAP, Nucleus, BISP) — esos son copiables. El moat es el conjunto operativo funcionando como sistema: Mandate como autoridad humana, Intent como unidad durable, decisiones aceptadas y descartadas, contexto justificable, ejecución neutral, evidencia correlacionada entre runtimes, y la capacidad demostrable de cambiar de proveedor sin perder significado.

---

## 7. Quién compra esto

No es el vibe coder ni el ingeniero individual optimizando su propio flujo — ese usuario no va a pagar la fricción de declarar Intents cuando puede simplemente re-explicarle el contexto a un agente nuevo. El comprador natural es:

- **Organizaciones ya mordidas por lock-in** de un vendor tecnológico y decididas a no repetirlo con IA.
- **Equipos regulados** donde el "por qué" de una decisión técnica tiene que sobrevivir auditorías, rotación de personal y cambios de proveedor.
- **Empresas que usan múltiples motores por estrategia de riesgo** (no por indecisión) y necesitan que el criterio técnico no se fragmente entre ellos.

Cognituum no reemplaza a Codex en vibe coding. Es la herramienta que un ingeniero usa *además* de Codex cuando lo que está en juego es la propiedad de la decisión, no solo la velocidad de ejecución.

---

## 8. El riesgo que no se puede ignorar

Aunque la prueba cross-CLI pase, queda sin resolver el riesgo más peligroso identificado en la interpelación original: **que la gobernanza se vuelva otra burocracia**.

Un ingeniero senior puede estar frustrado con los agentes y aun así no querer declarar cada Intent, administrar Mandates, revisar paquetes, mantener policies o pagar la latencia cognitiva del protocolo. Si gobernar una modificación de cinco minutos exige veinte minutos de ceremonia, el usuario vuelve al CLI directo.

**Condición de supervivencia:** capturar la decisión debe costar casi nada comparado con el valor de no perderla después. Este es el segundo hito, inmediato a que la prueba cross-CLI se confirme: medir fricción real de captura, no seguir ampliando arquitectura.

---

## 9. Batería de validación empírica (previa a cualquier expansión)

Antes de construir más superficie de producto, el Work debe responder con evidencia, no con argumento:

1. ¿Un ingeniero obtiene mejor control usando un Intent que usando directamente `AGENTS.md` y Codex?
2. ¿Cuánta ceremonia adicional introduce declarar un Intent?
3. ¿Puede Cognituum limitar técnicamente el contexto y el filesystem expuesto?
4. ¿Puede recuperar una ejecución interrumpida en otro CLI? *(prueba central, Sección 4)*
5. ¿Puede reconstruir por qué se tomó una decisión, no solo qué tools se ejecutaron?
6. ¿Puede impedir una ampliación de scope no autorizada?
7. ¿El mismo BISP produce resultados comparables en dos proveedores distintos?
8. ¿Las decisiones humanas descartadas evitan regresiones posteriores de forma verificable?
9. ¿La Evidence es útil para un tercero, o solo para quien diseñó el sistema?
10. ¿Cinco o diez ingenieros senior pagarían por esta capacidad, hoy, con este nivel de fricción?

---

## 10. Resumen ejecutivo

- Cognituum tiene tres versiones posibles. Dos pierden por comoditización. Una es defendible.
- La versión defendible no compite en memoria, auditoría, sandbox ni gobernanza administrativa — terreno donde los vendors de frontera ganan por recursos.
- Compite en el único terreno donde el desalineamiento de incentivos favorece a un jugador independiente: la propiedad portable del criterio técnico entre proveedores.
- Esa tesis es falsable con una sola prueba concreta y barata: sobrevivir un cambio de runtime sin perder autoridad, estado ni evidencia.
- Si la prueba pasa, el valor no está en el mecanismo sino en sus consecuencias: rompe lock-in de contexto, crea una unidad de auditoría que ningún vendor puede ofrecer, y da propiedad revocable del criterio técnico.
- Si la prueba falla, el proyecto se reduce — sin vergüenza — a Mandates como capa de decisiones acumulables, que tiene valor propio aunque menor.
- El riesgo permanente, pase lo que pase la prueba, es que la gobernanza se vuelva ceremonia. La fricción de captura tiene que costar menos que el valor de no perder la decisión.

---

*Este documento se trata como hipótesis con condiciones de derrota explícitas, no como validación de mercado. Se revisa después de ejecutar la prueba de la Sección 4.*

---

## 11. Pedido concreto: implementación CLI del protocolo BISP

Este mecanismo no nace de una hipótesis de escritorio. Nace de un dolor de producto real: perder contexto cada vez que se agotaban los tokens entre sesiones web. Esa fricción llevó a diseñar Intents como unidad durable, y después el protocolo Synapse — extensión de navegador, host local y Brain gobernado por Nucleus — que ya resuelve exactamente este problema en el dominio de sesiones web: interrumpir, preservar decisión y contexto, y continuar sin pérdida de autoridad.

La prueba cross-CLI de la Sección 4 no es una idea nueva que haya que validar desde cero. Es el mismo mecanismo que Synapse ya demostró viable, portado a un dominio distinto: en lugar de sesiones web del mismo proveedor, runtimes de CLI de proveedores distintos (Codex, Claude Code, OpenCode).

El pedido concreto es este: ayudame a diseñar la implementación CLI del protocolo BISP capaz de procesar un Mandate intercalando Intents entre distintas AI de frontera — el equivalente, en terminal, de lo que Synapse ya hace entre sesiones web. Necesito definir en conjunto:

- Cómo se serializa un Intent para que sea legible y recuperable por cualquier CLI, sin depender del formato interno de ninguno.
- Qué mínimo de estado hace falta persistir para que un Intent interrumpido en un runtime se pueda retomar en otro sin pérdida de decisión ni evidencia.
- Cómo se adapta el rol que cumple el host de Synapse — el punto neutral que preserva estado fuera de cualquier sesión — a un entorno de CLI, donde no hay navegador ni extensión, pero sí procesos, archivos y subprocesos invocables.
- Qué de Brain y Nucleus es portable como lógica de gobierno sobre Mandates, y qué es específico del contexto web y debe rediseñarse para terminal.
- Cuál es la implementación mínima viable que permite correr la prueba de la Sección 4 sin construir el sistema completo primero.

Compartiré por separado el documento donde se explica el origen y el diseño de Synapse, para que la implementación CLI parta de ese mecanismo ya probado en lugar de reinventarlo desde cero.

## 12. Instrucción de ejecución

El orden de trabajo queda fijado así, y no es negociable hasta que la Sección 4 dé un resultado:

1. **No se retoma ni se termina el prototipo web (Synapse) hasta que la prueba cross-CLI de la Sección 4 tenga resultado.** El entorno CLI es más barato de validar y más favorable técnicamente — estado en archivos, logs estructurados, sin fricción de DOM ni ToS. Es el lugar correcto para probar primero el mecanismo más difícil de la tesis.

2. **El entregable inmediato que necesito de Codex es una implementación mínima viable del protocolo BISP en CLI**, suficiente para ejecutar la prueba de la Sección 4 y nada más — no la arquitectura completa de Cognituum (sin Brain, AITAP ni Nucleus todavía). El criterio de "mínimo viable" es literal: lo justo para declarar un Intent, interrumpirlo en un runtime, y retomarlo en otro sin perder autoridad, estado ni evidencia.

3. **Esa implementación mínima debe definir, en este orden de prioridad:**
   - Formato de serialización del Intent, legible y recuperable por cualquier CLI sin depender del formato interno de ninguno.
   - Estado mínimo indispensable a persistir para que la interrupción no pierda decisión ni evidencia.
   - Mecanismo neutral de persistencia (el equivalente en CLI al rol que el host cumple en Synapse) que sobreviva fuera de cualquier sesión de runtime.
   - Qué de la lógica de gobierno sobre Mandates es portable desde el diseño de Synapse, y qué debe rediseñarse por ser específico del entorno web.

4. **El resultado de la prueba decide lo que sigue, sin excepción:** si sostiene la continuidad de decisión entre Codex, Claude Code y OpenCode, se documenta como evidencia y recién ahí se retoma el trabajo sobre la versión web con el protocolo ya validado. Si no la sostiene, el alcance del proyecto se reduce a Mandates como capa de decisiones acumulables, y se revisa desde cero si vale la pena continuar con la ambición de protocolo independiente.

Con esto adjunto tres piezas: este documento de tesis estratégica, el documento general de BTIPS (fotografía completa del sistema, a compartir por separado), y esta instrucción de ejecución. Necesito que la respuesta de Codex sea el diseño concreto del punto 3 — no una evaluación adicional de si la tesis es válida, eso ya está resuelto en este documento — sino el paso a paso técnico para construir la implementación mínima y correr la prueba.
