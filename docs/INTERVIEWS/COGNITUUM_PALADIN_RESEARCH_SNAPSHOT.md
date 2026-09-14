**COGNITUUM / PALADÍN**

**Research Snapshot**

Congelamiento del estado de investigación · 13 de septiembre de 2026

> Objetivo: preservar el momento actual de customer discovery antes de
> convertir hipótesis en arquitectura. El documento separa evidencia,
> lenguaje inducido, workarounds observados, inferencias de producto y
> conclusiones todavía falsables.

# 0. Cómo leer este documento

Este documento no pretende demostrar que Cognituum o Paladín ya
encontraron product–market fit. Congela un conjunto de entrevistas,
autoobservaciones y conversaciones de campo que ya permiten descartar
algunas formulaciones débiles, identificar patrones repetidos y orientar
el desarrollo hacia problemas que aparecen detrás de workflows muy
diferentes.

La disciplina metodológica central es separar cuatro cosas: (1) lo que
efectivamente ocurrió o fue dicho; (2) la explicación causal del
entrevistado, que puede ser correcta o no; (3) el workaround que
construyó; y (4) nuestra inferencia de producto. Además, el lenguaje se
clasifica como espontáneo, adoptado/desarrollado o inducido por el
entrevistador.

## Escala de evidencia

| **Nivel**               | **Qué significa**                                                                                          | **Peso**                                                                     |
|-------------------------|------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------|
| Espontáneo              | El entrevistado introduce por sí mismo el fenómeno o vocabulario.                                          | Alto                                                                         |
| Adoptado / desarrollado | El entrevistador introduce el concepto y la persona lo reconoce y lo desarrolla con experiencia propia.    | Medio                                                                        |
| Inducido                | La pregunta contiene la hipótesis y la respuesta no aporta evidencia independiente.                        | Bajo                                                                         |
| Conductual / workaround | La persona construyó hábitos, archivos, agentes, commits, supervisores o procesos para evitar un problema. | Muy alto para existencia de costo, no necesariamente para willingness-to-pay |

# 1. Estado ejecutivo: qué sabemos hoy

La investigación se movió desde una hipótesis centrada en “pérdida de
control” hacia una pregunta más amplia: ¿qué factura humana sigue
existiendo cuando la IA ya ejecuta gran parte del desarrollo, y qué
infraestructura construyen los equipos para hacer esa ejecución
confiable? Control sigue siendo una dimensión posible, pero ya no debe
ser la pregunta madre ni el pain asumido.

El patrón más consistente hasta ahora no es que todos describan el mismo
dolor con las mismas palabras. Es que los usuarios avanzados construyen
disciplina alrededor de la IA: specs, planes previos, commits pequeños,
reglas, decisiones, carpetas de lessons, permisos, agentes aislados,
TLs, tickets, reviewers, sesiones cortadas manualmente, notificaciones y
overseers. En varios casos el dolor visible disminuyó precisamente
porque ya pagaron el costo de construir ese sistema.

Esto produce una conclusión provisional fuerte: Paladín no puede ganar
pidiendo a un equipo sofisticado que abandone su workflow para adoptar
“la forma Cognituum”. Debe poder potenciar, reconocer o gobernar cómo ya
trabaja el usuario, y agregar valor donde sus workarounds todavía
dependen de memoria humana, mantenimiento manual, sincronización,
detección de excepciones o reconstrucción de contexto.

Una segunda conclusión provisional: la oportunidad no parece ser “más
memoria” ni “más agentes”. El territorio más específico que sigue
apareciendo es el estado normativo del criterio: qué decisión está
vigente, cuál fue reemplazada, quién puede cambiarla, qué alcance tiene,
cuándo una ejecución la contradice y cómo se propaga un cambio de
mandato sin obligar al humano a auditarlo todo.

## Formulación provisional del núcleo

> > “El problema no es solamente qué recuerda la IA. Es qué de lo que
> > recuerda todavía tiene derecho a gobernar.”

Esta formulación nace del caso Intent COR y todavía es hipótesis de
producto. Las entrevistas externas aportan piezas compatibles
—decisiones, “why”, reglas que dejan de respetarse, specs, planes,
workarounds de autoridad— pero aún no prueban que “continuidad de
criterio” sea el entry pain comercial.

# 2. Mapa de participantes y tipo de evidencia

| **Fuente**             | **Perfil / contexto**                            | **Tipo**                        | **Señal principal**                                                                      | **Precaución**                                             |
|------------------------|--------------------------------------------------|---------------------------------|------------------------------------------------------------------------------------------|------------------------------------------------------------|
| José / caso Intent COR | Developer AI-intensive; constructor de Cognituum | Autoentrevista / caso propio    | Criterio obsoleto que sigue gobernando; siga-siga; costo de refactor                     | Genera hipótesis; no valida mercado                        |
| Jordan                 | Senior developer                                 | Entrevista                      | Handoff incómodo; el “why” detrás del cambio; ownership; planificación                   | Control/detachment fueron sembrados por José               |
| Homero                 | Developer, trabajo real con Codex                | Entrevista                      | Reglas dejan de respetarse; plan previo; commits; esfuerzo cognitivo; toma de decisiones | Algunas categorías fueron introducidas por José            |
| Mauro                  | Business/technical builder; workflow avanzado    | Entrevista + concept test       | Ya construyó su sistema; migración es costo; “potenciar mi forma de trabajar”            | Tras revelar producto deja de ser discovery limpio         |
| Broski / grupo         | Power users, múltiples sesiones/agentes          | Observación de campo            | Overseer + notificaciones; coordinación con GitHub/Hermes/containers                     | No es entrevista; no transferir pains de otros             |
| Iván                   | Agencia de software; SDD/specs                   | Entrevista difícil + artefactos | Spec-driven workflow; considera parte del problema resuelto; objeción competitiva        | Mala receptividad; transcripción con atribución imperfecta |
| Skynet / grupo         | Usuarios de Hermes/Antigravity                   | Observación de campo            | Reduce garantías por velocidad; administra fronteras de sesión; “stranger/empty project” | Fragmentos aislados; no validación de mercado              |

# 3. Caso fundador: Intent COR, residuo y autoridad

El caso propio sigue siendo el episodio más claro para formular el
problema. Intent COR fue una decisión arquitectónica válida en una
etapa. Luego fue reemplazada por una arquitectura sistémica alrededor de
Gravity, Mass, Postures, Postulates y Orbital. Sin embargo, el concepto
anterior siguió reapareciendo desde documentación y contexto. Incluso
escribir “no usar Intent COR” preservó el término que se intentaba
retirar.

Fuente: PALADIN_ENTREVISTA_ICP_POWER_ANALISIS_2026-09-09: hallazgo
central y evidencia del episodio.

El costo reportado fue de varios días —aproximadamente cuatro días
intensivos y cerca de una semana de fricción total— con refactors,
tokens, interrupciones y rastros residuales. La interpretación
provisional es que Intent COR no fue olvidado: perdió validez, pero no
perdió completamente influencia operacional.

Fuente: PALADIN_TRANSCRIPCIONES_LITERALES_2026-09-09 y análisis
posterior.

## Conceptos provisionales nacidos del caso

- Criterio zombi: decisión, regla o concepto que perdió validez formal
  pero sigue influyendo porque permanece distribuido en el contexto.

- Autoridad residual: información histórica que continúa siendo
  interpretada como vigente.

- Siga-siga: continuar porque detener, auditar y reconstruir cuesta más
  que dejar avanzar la ejecución; no equivale a confianza plena ni a
  babysitting.

> > “No te puedo detener. Yo no me puedo detener ni vos tampoco, ni yo
> > sé cómo detenerte.”

Caso Intent COR / autoentrevista.

## Principio técnico provisional

Persistir información sin persistir su estado de autoridad puede ser
peor que olvidar. Una memoria perfecta podría recordar perfectamente una
decisión equivocada y seguir obedeciéndola. Por eso memoria, continuidad
y autoridad no deben tratarse como sinónimos.

# 4. Jordan: handoff, ownership y el “why”

Jordan aporta una señal distinta. La entrevista introdujo desde el lado
del entrevistador palabras como “detachment” y “control”; por lo tanto
no deben contarse como vocabulario espontáneo. Jordan sí adopta
“detachment” y lo desarrolla: al delegar código y tests aparece la duda
de si el resultado es exactamente lo pretendido y una pérdida parcial de
ownership sobre cada detalle.

Fuente: PALADIN_TRANSCRIPCIONES_LITERALES_2026-09-09, entrevista Jordan.

La evidencia más independiente aparece en el handoff. Jordan compara
tomar trabajo ajeno o continuar una rama con reconstruir lo que estaba
ocurriendo. Los commits WIP muestran qué cambió, pero no necesariamente
por qué.

> > “I can see that they changed it. I just don't know why they did it.
> > And I think the 'why' is what we always try to chase: the why, the
> > decision.”

Jordan — transcripción literal.

Esto sugiere que continuidad no es sólo transportar archivos o una
ventana de contexto. El “why” y la decisión que produjo el cambio son
activos cognitivos. También introduce una cautela de gobernanza: Jordan
rechaza la idea de que autoridad signifique que un CTO “call all the
shots”; equipos sanos debaten y delegan. La autoridad humana de
Cognituum, si existe, debe modelar cómo se constituye y reemplaza
criterio, no convertir toda decisión en mando unilateral.

# 5. Homero: reglas, supervisión y esfuerzo cognitivo

Homero relata un episodio concreto: dejó a Codex trabajando sobre varias
tareas/módulos sin supervisión y la ejecución dejó de respetar reglas
del proyecto, incluyendo theme y estructura de archivos. Su explicación
sobre límites de contexto es una hipótesis causal del entrevistado; el
hecho observable es que las reglas existían y el resultado no las
respetó.

Su respuesta práctica es particularmente valiosa: restringe scope, pide
un plan de acción antes de ejecutar, exige commits escalonados y usa
esos checkpoints para detectar si la IA se salió de lo previsto.

Fuente: Homero_spa.txt: plan previo, commits y supervisión.

> > “Che, te saliste de esto, ¿por qué lo tocaste? Yo sé que no vas a
> > modificar otra cosa que no esté dentro de ese plan de acción.”

Homero — workaround de plan previo.

El hallazgo humano aparece al final: Homero observa la tentación de
dejar que la IA haga todo sola. Su formulación propia es “la falta de
esfuerzo cognitivo, básicamente. La toma de decisiones.” Esto abre una
dimensión diferente de control: la IA no sólo puede exceder límites; el
humano puede dejar de ejercer criterio porque delegar es tentador.

Fuente: Homero_spa.txt, cierre de entrevista.

## Tres valores articulados posteriormente por Homero

En una conversación posterior, ya más cerca de una evaluación de
producto que de discovery puro, Homero resume tres puntos de valor:
poder de decisión, contingencia y permanencia/continuidad. Su
formulación más concreta: una decisión tomada al inicio debería seguir
firme en el commit 1000 hasta que él la modifique o quite. También
valora advertencias cuando reglas se rompen o decisiones chocan.

Esta tríada se conserva como lente interna, no como pregunta para
entrevistar: Authority → Contingency/Enforcement → Continuity.

# 6. Mauro: el contraejemplo que cambia el producto

Mauro es crítico porque no sólo sufrió problemas: construyó una solución
operacional propia. Estandariza estructuras entre proyectos, conserva
lessons, documenta decisiones y razones, define permisos sobre lo que un
agente puede hacer, requiere autorización o nunca debe hacer, aísla
agentes por repositorio, usa un TL que coordina sin escribir código,
tickets, sincronización y revisores de contexto fresco. En otras
palabras, muchos pains que Paladín podría intentar vender ya fueron
absorbidos por su disciplina.

Por eso su objeción al pitch de control es decisiva: si se le ofrece
“más control”, la respuesta implícita es “¿quién dijo que no tengo
control?”. No prueba que el problema no exista; prueba que para un
usuario sofisticado el pain puede haber sido pagado por adelantado
mediante arquitectura, hábitos y conocimiento.

Su frase más importante para adopción es explícita:

> > “Yo no quiero que me enseñen a trabajar; yo quiero potenciar mi
> > forma de trabajar.”

Mauro — entrevista.

Fuente: entrevista_Jose_Mauro_ordenada.txt.

Esto obliga a separar superioridad técnica de adoptabilidad. Una
arquitectura puede ser mejor y aun así perder si exige migrar proyectos,
entrenar equipos, cambiar hábitos y abandonar un workflow que ya
funciona. Mauro además advierte que equipos distintos trabajan de formas
distintas y que imponer un esquema puede sentirse “religioso”.

## Implicación de producto

La pregunta deja de ser “¿cómo hacemos que Mauro trabaje como
Cognituum?” y pasa a ser “¿cómo puede Cognituum entender, formalizar y
gobernar cómo Mauro ya trabaja?”. Esta formulación todavía es hipótesis,
pero es una restricción de diseño de primer orden.

# 7. Broski y el grupo: supervisión que escala por excepción

Las conversaciones de campo con Broski no son entrevistas formales. Su
valor está en observar un workaround real. Broski describe cientos de
sesiones/agentes y un sistema de notificaciones en cmux controlado por
su propia CLI. No mira cada terminal: un “overseer agent” le informa
eventos relevantes.

Fuente: Broski_eng.txt, descripción de cmux, notificaciones y overseer.

La señal conductual es fuerte: cuando aumenta la cantidad de ejecuciones
simultáneas, la supervisión no escala mirando más. Escala agregando
estado y convocando atención por excepción. Esto es compatible con una
hipótesis importante para Paladín/Orrery: la interfaz no debería
producir más superficies que vigilar; debería ayudar a decidir qué
merece atención humana.

En la conversación extendida del grupo también aparece una arquitectura
composicional: GitHub/repos, configuración por proyecto, sesiones de
Claude, Hermes y Docker. Esto muestra que Cognituum no compite sólo
contra “otro producto”, sino contra stacks ensamblados por usuarios
avanzados. “Orquestar agentes” o “tener tareas” no alcanza como
diferenciación.

# 8. Iván: specs como solución suficiente y límite del argumento

Iván tiene una agencia y trabaja con un enfoque fuertemente spec-driven.
La entrevista fue difícil: en vez de reconstruir episodios, defendió una
tesis general según la cual el cuello de botella es el humano y la
explicitación mediante specs es la forma de trabajar con IA. Cuando se
le plantea el caso de una decisión incorrecta que queda pegada, responde
que no lo representa. Eso debe registrarse como evidencia negativa para
ese pain en este participante, no racionalizarse.

Fuente: ivan.txt, entrevista del 12/13 Sep 2026.

Al mismo tiempo, las specs que compartió muestran criterio técnico real:
offline-first, servidor sin lógica de negocio, event log append-only,
dominio determinista, política de ambigüedad, confirmación humana de
voz, enteros para dinero/peso y reglas concretas de sincronización. No
son specs triviales ni su brevedad demuestra fallas.

Fuente: Pasted markdown(20260913-022155).md, secciones Solution,
Implementation Decisions y Risks.

## Lo que las specs sí y no demuestran

Sí demuestran que Iván puede constituir decisiones y políticas
explícitas. Por ejemplo, “nunca adivina” y “la voz nunca confirma sola”
funcionan como reglas normativas. No demuestran, por sí solas, cómo una
decisión conserva autoridad en el commit 1000, cómo se detecta
automáticamente una implementación que la contradice, o cómo una
decisión nueva supersede a una anterior en todas las ejecuciones
activas.

La propia spec contiene decisiones todavía abiertas —por ejemplo el
protocolo de báscula— y una lista de incógnitas que se resolverán en
visita. Eso evidencia algo normal y valioso: el criterio del proyecto
está vivo. La pregunta de investigación no es si una spec puede
describir una fotografía, sino cómo se gobierna la transición entre
fotografías.

Un detalle conceptual especialmente fértil: en el dominio del cliente
Iván usa event sourcing y no borra el pasado; una corrección es un
evento nuevo. Esto ilustra exactamente la distinción que nos interesa:
conservar historia no significa que todo el pasado siga gobernando. La
analogía con criterio técnico es nuestra inferencia, no una afirmación
de Iván.

# 9. Skynet y conversaciones de campo: velocidad, fronteras cognitivas y continuidad

Skynet describe que, al crecer la aplicación, tests y pasos del pipeline
volvieron el cambio demasiado lento. Su reacción fue eliminar staging,
backups y pasos intermedios para prototipar directamente sobre la copia
viva; reporta pasar de aproximadamente dos horas a unos 120 segundos. Es
evidencia de una tensión concreta: las garantías que agregamos alrededor
de la IA pueden terminar siendo desactivadas si su costo supera el valor
percibido.

Fuente: skynet_eng.txt, inicio de conversación.

También administra manualmente la frontera de una sesión según la
complejidad y cantidad de cambios. Dos features complejas pueden
disparar una sesión nueva; varias pequeñas quizá no. Él mismo no afirma
conocer la causa exacta de la degradación, por lo que no debemos
convertir su heurística en prueba de que el contexto largo causa el
problema.

En la segunda conversación aparece lenguaje espontáneo de continuidad:
hablar con el sistema puede sentirse como entregarle “an empty project
it’s never seen before”, y otro participante pregunta si está “talking
to a stranger right now”. Esto es evidencia de experiencia de ruptura de
contexto, pero todavía es un problema de memoria/continuidad general, no
validación de Gravity.

Fuente: skynet_zack_eng.txt, comienzo de conversación.

También aparece una preferencia por interfaces que oculten información
irrelevante y agreguen features útiles, y una descripción de Hermes
alimentando tareas secuencialmente a Antigravity. Esto refuerza dos
límites: Paladín no puede exigir más observación humana proporcional al
número de ejecuciones, y una simple cola de tareas/agentes ya es
commodity competitivo.

# 10. Patrón transversal: los “Paladines artesanales”

La evidencia acumulada permite nombrar un patrón sin afirmar todavía que
sea un segmento comercial: usuarios avanzados construyen sistemas
privados para hacer gobernable la ejecución de IA. Los mecanismos
cambian, pero la función se repite.

| **Persona**       | **Workaround observado**                                                            | **Qué intenta preservar**              | **Costo / límite visible**                   |
|-------------------|-------------------------------------------------------------------------------------|----------------------------------------|----------------------------------------------|
| Homero            | Scope, plan previo, commits pequeños, reglas                                        | Previsibilidad, trazabilidad, decisión | Supervisión y mantenimiento humano           |
| Mauro             | Lessons, decisions, permissions, playbooks, agentes aislados, TL, tickets, reviewer | Consistencia y delegación segura       | Arquitectura propia; alto switching cost     |
| Iván              | SDD/specs, decisiones técnicas explícitas                                           | Claridad previa y repetibilidad        | No vemos enforcement/continuity automáticos  |
| Broski            | Notificaciones, overseer, cmux, GitHub/containers                                   | Atención selectiva a escala            | Stack artesanal/composicional                |
| Skynet            | Recorte de pipeline, sesiones “clean”                                               | Velocidad y eficiencia de contexto     | Sacrifica garantías cuando cuestan demasiado |
| José / Intent COR | Refactors y limpieza documental                                                     | Retirar autoridad a criterio obsoleto  | Días de rework; residuo persistente          |

## Interpretación

El pain no desaparece cuando existe un workaround; muchas veces cambia
de forma. La señal más fuerte para discovery no es “se queja”, sino la
secuencia: problema → cambio de comportamiento → workaround →
mantenimiento/costo → frustración residual. Sin embargo, un workaround
eficaz también puede significar que esa persona ya no tiene suficiente
dolor para migrar.

# 11. Hipótesis competidoras: no cerrar demasiado pronto

A esta altura no conviene declarar un único pain ganador. Hay varias
lentes que deben competir en próximas entrevistas:

- Authority: quién puede constituir, cambiar, invalidar o reemplazar una
  decisión.

- Continuity: qué criterio vigente sobrevive entre sesiones, modelos,
  procesos y tiempo.

- Contingency / Enforcement: cómo se detecta que una ejecución rompe una
  regla o entra en contradicción.

- Scope: cómo se limita qué puede tocar una ejecución y cómo se detecta
  expansión no prevista.

- Handoff: qué estado cognitivo debe reconstruirse al cambiar persona,
  sesión, modelo o proveedor.

- Supervision / Attention: cómo saber qué merece atención cuando hay
  muchas ejecuciones.

- Cognitive effort: cuánto criterio humano se está dispuesto a gastar y
  en qué puntos.

- Coordination: cómo se alinean repos, agentes, personas y trabajo
  concurrente.

- Control: resultado o experiencia posible, pero no asumirlo como entry
  pain.

# 12. Lo que ya podemos descartar o debilitar

- “Más memoria” como propuesta suficiente. Memoria sin
  vigencia/autoridad puede preservar mejor el error.

- “Orquestar agentes” como diferenciación principal. El ecosistema ya
  ofrece múltiples harnesses, colas, routing y coordinación.

- “Guardar specs/reglas” como propuesta suficiente. Usuarios como Iván
  ya trabajan así y el open source avanza rápido.

- “Darte más control” como pitch universal. Mauro es un contraejemplo
  directo: ya tiene control suficiente y no quiere migrar para obtener
  más.

- “Ver todo” como UX de gobernanza. Broski y Skynet sugieren que el
  valor está en atención selectiva; más observabilidad puede convertirse
  en más carga.

- “Human-in-the-loop” como garantía suficiente. Un humano puede estar
  presente y aun no tener capacidad práctica de cambiar, detener o
  propagar criterio.

# 13. Lo que empieza a fortalecerse

Sin declararlo todavía como conclusión de mercado, cinco ideas ganaron
densidad transversal:

1.  El criterio humano debe poder existir fuera de una sesión particular
    y sobrevivir al cambio de modelo/proveedor sin confundirse con
    simple memoria.

2.  Una decisión necesita estado: vigente, reemplazada, excepción,
    alcance, precedencia y autoridad de cambio. Historia y autoridad no
    son lo mismo.

3.  La supervisión tiene que escalar por excepción. El sistema debe
    convocar criterio humano en pocos puntos de alto valor, no convertir
    al developer en babysitter de cada ejecución.

4.  La adopción exige respetar workflows existentes. El sistema que
    pretende gobernar el trabajo no puede empezar obligando a reemplazar
    el sistema de trabajo que el usuario ya construyó.

5.  El ICP más fértil parece seguir siendo técnico, hands-on,
    AI-intensive y accountable, pero dentro de él hay subgrupos: quienes
    ya resolvieron gran parte del problema artesanalmente y quienes
    todavía pagan una factura alta con workarounds incompletos.

# 14. Implicaciones para Paladín, Gravity, Orrery y Mandates

## Paladín

Paladín debería representar la experiencia de autoridad humana, no un
IDE que obliga a vigilar más. Su promesa potencial no es “la IA hace
menos” sino “la IA puede avanzar sin que el humano pierda la capacidad
efectiva de cambiar lo que gobierna”. Esta formulación sigue siendo
hipótesis narrativa.

## Gravity

Gravity se fortalece como hipótesis de mecanismo para representar
criterio normativo: posturas/postulados, vigencia, herencia, alcance,
precedencia, reemplazo y contradicción. Pero no debe venderse todavía
como “el pain”; debe demostrar que reduce una factura que los usuarios
ya pagan.

## Contingency / Enforcement

Puede ser el puente entre autoridad y bajo esfuerzo cognitivo: el humano
no revisa todo; el sistema detecta desviaciones relevantes y solicita
criterio. Homero lo articula explícitamente y Broski muestra
conductualmente el valor de ser convocado por excepción.

## Orrery

La visualización no debería ser un mapa bonito de todo lo que existe.
Debe priorizar orientación, estado, relaciones y zonas que requieren
atención. Si el usuario tiene cientos de ejecuciones, Orrery fracasa si
convierte cada una en una cosa más que mirar.

## Mandates / Intents

No deben justificarse sólo como unidades de ejecución, porque tareas y
agentes secuenciales ya existen. Su valor potencial está en transportar
propósito, criterio, scope, estado y autoridad de forma
ejecutable/portable. Esto debe demostrarse en producto, no asumirse por
naming.

# 15. ICP provisional y segmentación de adopción

El ICP provisional sigue siendo un “AI-intensive accountable engineer”:
profesional técnico hands-on que delega trabajo significativo a coding
agents, conserva responsabilidad por el resultado y desarrolla software
real con continuidad. Sin embargo, la evidencia obliga a segmentar por
madurez del workaround.

| **Estado**                    | **Descripción**                                                                       | **Lectura para Paladín**                                                             |
|-------------------------------|---------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------|
| Pre-workaround                | Sufre episodios, reexplica, revisa, pierde contexto, arregla después.                 | Puede tener pain alto, pero quizá poca disciplina/adoption ability.                  |
| Workaround privado incompleto | Ya usa specs, rules, commits, planes, archivos, scripts; sigue pagando mantenimiento. | Candidato fuerte: dolor + capacidad + factura residual.                              |
| Sistema artesanal maduro      | Mauro/Broski-like: arquitectura propia, coordinación, supervisión y hábitos sólidos.  | Excelente para falsificar producto; adoption difícil salvo integración/potenciación. |
| Delegación opaca              | No sabe qué hace la IA y tampoco quiere/puede ejercer criterio técnico.               | Puede no ser ICP de Paladín aunque use mucha IA.                                     |

# 16. Nuevo instrumento de entrevista

La pregunta madre ya no debe contener “control”, “reglas”, “continuidad”
ni Gravity. El objetivo es descubrir la factura residual y luego
reconstruir el episodio.

> > “Pensando en las últimas semanas trabajando con IA en un proyecto
> > real, ¿qué es lo que más trabajo, atención o frustración te sigue
> > generando aunque hoy la IA haga gran parte del desarrollo? Contame
> > la última vez que te pasó.”

Después: qué pasó exactamente → qué esperaba → qué hizo la IA → cómo se
dio cuenta → qué tuvo que hacer → cuánto costó. Sólo entonces se
profundiza en la dimensión que haya aparecido: decisión, regla,
contradicción, supervisión, scope, handoff, etc.

> > “¿Qué hacés hoy, de manera manual o con herramientas que te armaste,
> > para evitar que eso vuelva a pasar? ¿Qué parte de todo eso tenés que
> > seguir manteniendo vos para que funcione?”

Para usuarios que responden filosóficamente —como Iván— conviene
llevarlos al límite del workaround: “Perfecto, supongamos que las specs
te resolvieron el problema. Contame la última vez que una spec tuvo que
cambiar después de que el desarrollo ya había empezado. ¿Qué hiciste
para que ese cambio llegara correctamente a todo lo que estaba en
marcha?”

> > “Si una herramienta pudiera eliminar parte de los problemas que me
> > acabás de contar, pero requiriera que vos fueras explícito en
> > ciertos momentos —para decidir, definir una regla o resolver una
> > excepción—, ¿eso sería una carga adicional o estarías dispuesto a
> > dedicarle ese esfuerzo? ¿En qué momentos sí y en cuáles no?”

# 17. Preguntas de falsificación para el producto

- ¿Hay suficientes usuarios para quienes el costo residual de sus
  workarounds sea frecuente y material?

- ¿Una spec + buen workflow + memoria del proveedor resuelve
  suficientemente el problema para la mayoría?

- ¿Los usuarios realmente necesitan autoridad normativa persistente o
  sólo mejor context management?

- ¿Pueden detectar contradicciones/violaciones con herramientas
  existentes a costo aceptable?

- ¿Están dispuestos a declarar explícitamente criterio, o eso destruye
  la ventaja cognitiva de delegar?

- ¿Paladín puede integrarse con GitHub,
  Claude/Codex/Hermes/specs/playbooks existentes sin exigir migración
  conceptual?

- ¿El valor aparece primero en individuo, equipo o empresa? La evidencia
  de Mauro favorece individuo → equipo → organización, pero aún no está
  probado.

- ¿El comprador paga por continuidad/authority, o por una consecuencia
  más concreta: menos rework, menos tokens, menos supervisión, menos
  incidentes, handoffs más rápidos?

# 18. Decisiones de desarrollo que este snapshot sí justifica

Estas no son features cerradas; son restricciones de
investigación/diseño suficientemente apoyadas para orientar desarrollo
sin confundirlas con PMF.

- No diseñar Paladín alrededor de supervisión exhaustiva. Priorizar
  excepción, escalamiento y puntos de decisión.

- Representar explícitamente supersesión/reemplazo; una decisión vieja
  debe poder permanecer como historia sin seguir gobernando.

- Mantener proveedor/modelo como capa reemplazable; el criterio no debe
  pertenecer al proveedor de IA.

- Diseñar importación/reconocimiento de workflows existentes como
  problema de primer contacto: repos, specs, rules, tickets, playbooks,
  agents.md/CLAUDE.md y estructuras reales.

- No hacer de “task orchestration” la diferenciación central.

- Hacer observable el “why” y la procedencia del criterio, no sólo el
  diff de código.

- Probar la relación entre Authority, Contingency y Continuity en
  prototipos concretos antes de convertirla en mensaje de venta.

# 19. Conclusión congelada al 13 de septiembre de 2026

La investigación ya no está en el punto de “¿existe algún problema al
programar con IA?”. Existe una familia de problemas y, más importante,
una familia de workarounds. El desafío ahora es identificar cuál de esas
facturas residuales es suficientemente dolorosa, frecuente y común para
constituir un entry point, y qué capa de Cognituum la resuelve sin
exigir que el usuario abandone su sistema.

El mejor candidato conceptual sigue siendo la continuidad del criterio
humano con autoridad efectiva y detección de excepciones. Pero la
evidencia también obliga a humildad: usuarios como Mauro e Iván pueden
considerar su problema suficientemente resuelto; Broski puede construir
su propia supervisión; Skynet puede preferir sacrificar garantías por
velocidad. Por lo tanto, el producto debe ganar por reducir el costo de
gobernar, no por agregar más gobierno.

La frase que mejor congela este momento no es todavía un claim
comercial. Es una pregunta de diseño:

> > “¿Cómo hacemos para que el criterio humano siga gobernando cuando la
> > ejecución de IA escala, cambia de sesión, cambia de modelo, cambia
> > de equipo y cambia de decisión —sin convertir al humano en el cuello
> > de botella?”

# 20. Fuentes preservadas en este snapshot

- PALADIN_TRANSCRIPCIONES_LITERALES_2026-09-09.docx — autoentrevista
  Intent COR + entrevista Jordan.

- PALADIN_ENTREVISTA_ICP_POWER_ANALISIS_2026-09-09.docx — análisis del
  caso Intent COR y extensión Human Authority.

- Homero_spa.txt — entrevista sobre reglas, supervisión, plan previo,
  commits y esfuerzo cognitivo.

- entrevista_Jose_Mauro_ordenada.txt — entrevista completa y
  concept/adoption critique de Mauro.

- Broski_eng.txt — observación de campo sobre múltiples sesiones, cmux,
  notificaciones y overseer.

- ivan.txt — entrevista con Iván, agencia/spec-driven development.

- Pasted markdown(20260913-022155).md — specs compartidas por Iván.

- skynet_eng.txt y skynet_zack_eng.txt — conversaciones de campo sobre
  velocidad, sesiones, continuidad e interfaces.

- Referencias externas citadas por Iván (Sandcastle, Matt Pocock Skills,
  hello-sdd, Theo/T3) se conservan como señales competitivas, pero este
  snapshot no las usa como evidencia primaria de pain.

## Nota epistemológica final

Este documento congela el estado de la evidencia, no la verdad del
producto. Las conclusiones deben cambiar si las próximas entrevistas
muestran que specs/memoria/harnesses existentes resuelven
suficientemente el problema, que los usuarios no quieren declarar
criterio, o que el costo de adopción de Cognituum supera el costo de sus
workarounds actuales. Esa posibilidad no debilita el research: es
precisamente lo que este snapshot debe permitir detectar.
