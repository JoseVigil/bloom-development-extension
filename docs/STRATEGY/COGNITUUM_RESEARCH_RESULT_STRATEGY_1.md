# COGNITUUM_RESEARCH_RESULT_STRATEGY_1.0

**Versión:** 1.0
**Fecha:** 8 de septiembre de 2026
**Estado:** cierre de Discovery Conceptual → inicio de Product Validation
**Propósito:** consolidar en un único documento el resultado vigente de la investigación de Cognituum: problema, dolor, ICP provisional, hipótesis Gravity, arquitectura conceptual relacionada y criterio de avance.

---

# 0. Research Provenance

Este documento consolida el resultado estratégico acumulado de las distintas sesiones de investigación realizadas sobre Cognituum / Paladín hasta el 8 de septiembre de 2026.

Su función **no es reemplazar el corpus de investigación** ni reproducir cada evidencia individual.

La investigación detallada —casos, threads, candidatos, contraejemplos, workarounds, observaciones y posteriores entrevistas— permanece en el Cowork de investigación y constituye la evidencia primaria sobre la cual se construye este documento.

La evolución de la investigación puede resumirse así:

### Sessions 1–2 — Existencia del problema e ICP provisional

Se identificó un perfil de profesional técnico que utiliza intensivamente coding agents, delega trabajo significativo sobre software real y conserva responsabilidad sobre el resultado.

También apareció un patrón importante:

los candidatos más interesantes no son simplemente personas que se quejan del problema, sino personas que **ya modificaron su comportamiento para compensarlo** mediante documentación, rules, scripts, archivos de contexto, logs, memory systems u otros workarounds.

Esto produjo el concepto de **pre-builder**:

> una persona para quien el problema es suficientemente frecuente como para haber construido una solución privada o imperfecta, pero que no quiere convertirse en una startup de developer tooling para resolverlo.

### Session 3 — Entry pain

La investigación encontró como problema visible la necesidad de reconstruir contexto después de interrupciones de continuidad.

Aparecieron tres componentes:

**Entry pain:** reconstrucción.
**Trigger:** interrupción.
**Residuo:** mantenimiento manual.

También se observó que el cambio de modelo o proveedor puede agravar el problema, pero no es necesario para que ocurra.

### Session 4 — Autopsia de la continuidad

La investigación profundizó qué significa realmente “reconstruir contexto”.

El hallazgo más importante fue distinguir entre:

**“qué pasó”**

y:

**“qué hace que lo que sigue todavía tenga sentido”.**

La primera capa —estado, TODOs, commits, summaries, archivos modificados— aparece cada vez más commoditizada.

La segunda produjo evidencia independiente alrededor de:

* decisiones;
* razones;
* alternativas descartadas;
* reglas;
* restricciones;
* vigencia;
* mecanismos para evitar relitigar decisiones;
* información necesaria para continuar correctamente.

Varias personas independientes habían construido artefactos equivalentes a decision logs o sistemas propios de preservación de decisiones sin utilizar el vocabulario de Cognituum.

Esto produjo una conclusión provisional:

> **El problema interesante puede no ser que la IA olvide qué ocurrió, sino que una decisión previamente tomada deje de ejercer correctamente influencia sobre trabajo posterior.**

### Final Customer Discovery

La última investigación fue diseñada deliberadamente para intentar falsar esa interpretación.

Separó cuatro posibles niveles:

**G1 — Memory**
**G2 — Decision Persistence**
**G3 — Applicability**
**G4 — Governance / Conflict**

Y estableció una regla fundamental:

> **La evidencia del problema no constituye validación de Gravity.**

Gravity debe demostrar que existe un residuo real después de memoria, documentación y persistencia de decisiones.

---

# 1. Estado actual

El discovery conceptual alcanzó un punto de madurez suficiente para dejar de expandir la teoría.

La evidencia externa encontrada de forma independiente muestra repetidamente que profesionales que trabajan con coding agents intentan conservar:

* decisiones;
* razones;
* descartes;
* reglas;
* vigencia;
* contexto;
* handoffs;
* restricciones;
* conocimiento sobre cómo debe continuar el trabajo.

Esto constituye evidencia independiente de que existe un problema alrededor de la **persistencia de decisiones y contexto en trabajos realizados con inteligencia delegada**.

Sin embargo, esa evidencia **no valida todavía Gravity como producto**.

La distinción debe permanecer explícita:

> **Existe evidencia del problema. No existe todavía validación de Gravity.**

El objetivo de la siguiente fase es determinar si el problema llega realmente a la profundidad que Gravity intenta resolver y si existe suficiente dolor como para justificar un producto.

---

# 2. El dolor

La formulación provisional del dolor es:

> **El profesional técnico vuelve a pagar por decisiones que ya había tomado porque esas decisiones no sobreviven correctamente al trabajo futuro.**

La factura aparece como:

* re-explicación;
* re-discusión;
* retrabajo;
* revisión adicional;
* código revertido;
* correcciones manuales;
* tokens desperdiciados;
* pérdida de tiempo;
* riesgo de ejecutar bajo una decisión incorrecta u obsoleta;
* necesidad de actuar nuevamente como intermediario entre una decisión humana anterior y una inteligencia que ejecuta posteriormente.

La formulación más profunda es:

> **Los coding agents pueden recordar información y recuperar decisiones, pero todavía dependen del humano para determinar qué decisiones siguen vigentes y deben gobernar el trabajo que están ejecutando. Ese trabajo convierte al ingeniero en middleware permanente entre el criterio que ya estableció y las inteligencias a las que delega ejecución.**

Esta última afirmación sigue siendo una **hipótesis a validar**, no un hecho demostrado.

---

# 3. El problema fundamental: memoria no es criterio

La distinción conceptual central queda congelada así:

> **Memoria no es criterio.**
>
> **Persistencia de información no es persistencia de autoridad.**

Que una decisión exista en un archivo, una base de datos, un ADR, un rules file, un contexto recuperado o un decision log no implica que el sistema pueda determinar correctamente:

* si sigue vigente;
* dónde aplica;
* cuándo aplica;
* a qué trabajo afecta;
* qué autoridad tiene;
* qué otras decisiones condiciona;
* qué decisión tiene precedencia;
* si existe una excepción;
* si fue reemplazada;
* si entra en contradicción con otra decisión.

Por lo tanto, el problema que Cognituum intenta explorar no es simplemente:

> “¿Cómo hacemos que la IA recuerde?”

sino:

> **¿Cómo hacemos que una decisión humana continúe ejerciendo correctamente su autoridad sobre trabajo futuro?**

---

# 4. Niveles de profundidad del problema

El discovery distingue cuatro niveles.

## G1 — Memory

La decisión simplemente no estaba disponible.

El sistema no tenía acceso a la información.

**Problema:** memory / context retrieval.

---

## G2 — Decision Persistence

La decisión existía y podía recuperarse, pero había que buscarla, reconstruirla o volver a introducirla.

**Problema:** persistencia de decisión.

Esto es aproximadamente el límite que la evidencia externa independiente ya permite considerar plausible.

---

## G3 — Applicability

La inteligencia conocía la decisión, pero no podía determinar correctamente:

* si aplicaba a esta tarea;
* dónde aplicaba;
* cuándo aplicaba;
* qué parte del trabajo debía condicionar.

Aquí comienza propiamente el **territorio de Gravity**.

---

## G4 — Governance / Conflict Resolution

Existen múltiples decisiones y el sistema debe resolver:

* precedencia;
* contradicción;
* excepción;
* herencia;
* reemplazo;
* revocación;
* alcance;
* autoridad.

Aquí aparece el caso fuerte de Gravity.

---

# 5. La hipótesis Gravity

La hipótesis técnica queda formulada como:

> **Gravity convierte decisiones humanas en condiciones operativas persistentes para que puedan seguir gobernando trabajo futuro sin que el humano tenga que reconstruirlas y reimponerlas continuamente.**

Una formulación todavía más simple:

> **Un decision log recuerda. Gravity gobierna.**

Esta frase es una **hipótesis de producto**, no todavía una afirmación validada.

La pregunta experimental es:

> **¿El usuario necesita solamente recordar una decisión, o necesita que esa decisión continúe ejerciendo fuerza correctamente sobre el trabajo futuro?**

---

# 6. Postulate, Posture, Gravity y Orbital

Estas primitives no deben considerarse ornamentación terminológica ni capas arbitrarias agregadas después del problema.

Son la hipótesis técnica mediante la cual se intenta resolver el problema descubierto.

## Postulate

Responde:

> **¿Qué quedó establecido?**

Un Postulate representa aquello que fue establecido como decisión, regla, restricción, principio o condición.

## Posture

Responde:

> **¿Desde qué posición, contexto y autoridad quedó establecido?**

Posture sitúa la decisión.

Permite comprender que una misma proposición puede adquirir diferente significado o fuerza dependiendo de:

* contexto;
* alcance;
* autoridad;
* posición;
* situación;
* relación con otras decisiones.

## Gravity

Responde:

> **¿Qué de todo lo establecido debe ejercer fuerza sobre este trabajo ahora?**

Gravity determina aplicabilidad y fuerza operacional.

Su problema específico aparece cuando no basta con recuperar una decisión, sino que es necesario determinar qué influencia debe tener sobre la ejecución presente.

## Orbital

Responde:

> **¿Cómo ejecuta una inteligencia dentro de ese campo de criterio?**

Orbital representa la ejecución de inteligencia bajo las condiciones determinadas por el campo establecido.

---

# 7. Paladín

Paladín permanece como fuente humana de autoridad.

La evolución conceptual importante es:

> **Paladín deja de ser el secretario que vuelve a cargar contexto y pasa a establecer el criterio bajo el cual pueden actuar las inteligencias.**

El objetivo no es eliminar la autoridad humana.

El objetivo es evitar que el humano tenga que **reimponer manualmente esa autoridad en cada ejecución**.

---

# 8. La cadena conceptual

La arquitectura conceptual vigente puede expresarse como:

**Paladín decide**
↓
**Postulate establece**
↓
**Posture sitúa autoridad y contexto**
↓
**Gravity determina aplicabilidad y fuerza operacional**
↓
**Orbital ejecuta bajo ese criterio**
↓
**Mandate organiza capacidades y trabajo que pueden operar bajo él**
↓
**Wisdom eventualmente permite reutilizar y distribuir esas estructuras**

Esta cadena debe entenderse como arquitectura conceptual vigente, no como una afirmación de que todas sus capas ya estén validadas comercialmente.

---

# 9. Mandate no es el problema fundamental

Mandate debe permanecer fuera del núcleo de validación inicial.

**Mandate no resuelve el dolor fundamental.**

Puede consumir, organizar, heredar y ejecutar trabajo dentro del campo que Gravity establece.

Por lo tanto:

> **No necesitamos demostrar Mandates ni Wisdom para validar el primer mercado de Cognituum.**

Introducirlos prematuramente en entrevistas o discovery comercial agregaría complejidad y podría confundir la hipótesis principal.

---

# 10. Wisdom tampoco forma parte de esta validación

Wisdom representa una capa posterior de reutilización/distribución de estructuras de criterio.

No debe utilizarse para validar el problema inicial.

La investigación actual debe permanecer concentrada en una sola pregunta:

> **¿Una decisión humana puede continuar gobernando correctamente trabajo futuro sin que el humano tenga que reconstruir y reimponer continuamente el contexto que la originó?**

---

# 11. ICP provisional

El ICP provisional es:

> **AI-intensive accountable engineer:** profesional técnico hands-on que delega trabajo significativo a coding agents sobre software real del que continúa siendo responsable, trabaja sobre proyectos suficientemente largos o complejos como para atravesar múltiples ejecuciones y ya experimentó costos por decisiones que debieron ser reconstruidas, defendidas, corregidas o reaplicadas.

El early adopter más interesante no es simplemente quien declara experimentar el problema.

Es quien **ya cambió su comportamiento para compensarlo**.

Ejemplos:

* rules;
* decision logs;
* ADRs;
* archivos de contexto;
* handoffs;
* scripts;
* MCPs;
* instrucciones persistentes;
* workarounds manuales.

Y aun así encuentra un residuo del problema.

El cargo no define el ICP.

Puede ser:

* senior engineer;
* staff/principal engineer;
* tech lead;
* maintainer;
* technical founder;
* CTO hands-on.

Lo que importa es el comportamiento.

La investigación debe determinar qué variable conductual predice realmente la intensidad del dolor y permitir reemplazar esta definición si la evidencia exige hacerlo.

---

# 12. Mercado inicial: todavía no establecido

Existe una diferencia entre tener un ICP provisional y haber identificado un mercado inicial.

Todavía debe determinarse **dónde se concentra económicamente el problema**.

Los segmentos candidatos incluyen:

* individual contributors intensivos en agentes;
* staff/principal engineers;
* technical founders;
* tech leads;
* maintainers;
* consultores técnicos con múltiples proyectos;
* equipos pequeños AI-native;
* equipos de producto medianos;
* organizaciones mayores.

Cada segmento debe evaluarse según:

**frecuencia × costo × urgencia × workaround insuficiente × reachability × capacidad de adopción**

La investigación debe poder completar:

> **El primer mercado de Paladín son ______ trabajando bajo ______, porque ______ ocurre repetidamente y actualmente lo compensan mediante ______.**

Hasta poder completar esa frase con evidencia, **el mercado inicial permanece pendiente de establecer**.

---

# 13. No confundir validación arquitectónica con validación comercial

Éste es uno de los controles más importantes de esta fase.

Pueden existir cuatro resultados:

| Dolor  | Profundidad | Interpretación                                                               |
| ------ | ----------- | ---------------------------------------------------------------------------- |
| Débil  | G3/G4       | Gravity puede ser arquitectónicamente correcta pero comercialmente prematura |
| Fuerte | G1/G2       | Existe mercado, pero Gravity puede estar sobredimensionada                   |
| Débil  | G1/G2       | Detener o reformular                                                         |
| Fuerte | G3/G4       | Caso fuerte para pasar a Product Validation                                  |

Por lo tanto, las entrevistas deben responder simultáneamente:

> **¿Hasta qué profundidad llega el problema?**

y:

> **¿Cuánto cuesta ese problema?**

No alcanza con demostrar que Gravity describe correctamente una arquitectura.

Hay que demostrar que resuelve un dolor por el que alguien cambiaría su comportamiento y eventualmente pagaría.

---

# 14. El protocolo de entrevistas

No preguntar:

> “¿Te gustaría una herramienta que conserve criterio?”

Esa pregunta introduce la solución.

En cambio, partir de incidentes reales.

Por ejemplo:

> “Claude volvió a implementar algo que habíamos descartado.”

A partir de ahí determinar:

1. ¿Qué decisión había sido tomada?
2. ¿Por qué?
3. ¿Qué alternativas se habían descartado?
4. ¿El agente conocía la decisión?
5. ¿Conocía la razón?
6. ¿Sabía si seguía vigente?
7. ¿Sabía si aplicaba a esta tarea?
8. ¿Había otras decisiones relacionadas?
9. ¿Existía una contradicción?
10. ¿Había una excepción?
11. ¿Quién tuvo que resolver el conflicto?
12. ¿Cuánto trabajo humano fue necesario?
13. ¿Qué costo produjo?
14. ¿Con qué frecuencia ocurre?
15. ¿Qué mecanismo utiliza actualmente para evitarlo?
16. ¿Qué parte de ese workaround continúa haciendo manualmente?
17. ¿Qué parte no querría automatizar?

Esto permite clasificar cada incidente en G1/G2/G3/G4.

---

# 15. Human Middleware

Una dimensión central de la investigación es distinguir entre:

> **responsabilidad humana que debe permanecer humana**

y:

> **trabajo mecánico que el sistema podría absorber.**

El problema de Cognituum no debería formularse como la eliminación del criterio humano.

La hipótesis es exactamente la contraria:

**el humano conserva la autoridad, pero deja de pagar repetidamente por transmitirla, reconstruirla y hacerla cumplir.**

Por eso debe investigarse qué trabajo continúa realizando alrededor de:

* `DECISIONS.md`;
* `CLAUDE.md`;
* `AGENTS.md`;
* ADRs;
* rules;
* prompts;
* logs;
* MCPs;
* handoffs;
* notas;
* procesos propios.

La pregunta no es solamente:

> “¿Qué guardás?”

Sino:

> **“¿Qué trabajo seguís teniendo que hacer para que lo guardado afecte correctamente lo que ocurre después?”**

---

# 16. Competitive Kill Test

Gravity debe competir contra la alternativa más barata disponible.

El baseline es aproximadamente:

**Git + `CLAUDE.md` / `AGENTS.md` + ADR / `DECISIONS.md` + disciplina humana + memory/context tools.**

Para cada incidente real debe evaluarse:

> **Si mañana el proveedor ofreciera memoria perfecta, summaries perfectos, infinite context y handoff perfecto, ¿este episodio seguiría ocurriendo?**

Si desaparece, probablemente estamos ante un problema de memory/context.

Si permanece porque todavía es necesario determinar:

* qué es una decisión;
* cuál sigue vigente;
* dónde aplica;
* qué fue descartado;
* cuál tiene precedencia;
* qué constituye una excepción;
* qué reemplazó qué;
* quién puede modificarla;
* cómo debe afectar la ejecución;

entonces aparece evidencia del territorio específico de Gravity.

---

# 17. La prueba decisiva

Si aparecen aproximadamente **3–5 usuarios con casos reales G3/G4 y dolor material**, el siguiente paso no debe ser otro ciclo abierto de investigación conceptual.

Debe ser una primitive mínima de Gravity.

No:

* Cognituum completo;
* Mandate;
* Wisdom;
* Sovereign;
* una plataforma completa.

Sólo una demostración de la proposición central:

> **Una decisión tomada anteriormente condicionó correctamente una ejecución futura sin que el Paladín tuviera que reconstruir manualmente el contexto que la originó.**

---

# 18. Las tres métricas de la primitive

La prueba mínima debe observar tres dimensiones.

## 1. Correctness

Gravity intervino cuando correspondía.

No debe aplicar una decisión fuera de su alcance ni dejar pasar una decisión que debía ejercer influencia.

## 2. Human Middleware

Gravity evitó trabajo humano real.

El criterio no es que la herramienta “se sienta inteligente”.

El criterio es que eliminó una tarea que antes tenía que realizar el humano.

## 3. Retention

El usuario quiere mantenerla funcionando.

La señal más importante no es:

> “Está buenísimo.”

Sino:

> **“No lo saques.”**

Eso comienza a transformar una primitive técnicamente interesante en una hipótesis de producto real.

---

# 19. Criterio de transición

La investigación conceptual debe considerarse cerrada si:

1. aparecen repetidamente incidentes G3/G4;
2. el dolor es material;
3. el usuario ya incurre en workarounds para compensarlo;
4. una primitive mínima puede demostrar correctness;
5. esa primitive reduce trabajo humano real;
6. los usuarios muestran intención de mantenerla.

En ese punto ya no corresponde seguir agregando teoría.

Corresponde construir, medir y validar producto.

---

# 20. Qué NO agregar en esta fase

No expandir innecesariamente hacia:

* Mandates;
* Wisdom;
* Sovereign;
* nuevas taxonomías;
* nuevas primitives;
* nuevas capas arquitectónicas;
* investigación conceptual abierta;
* claims de “cognitive sovereignty”;
* explicaciones adicionales de Postulate/Posture/Gravity/Orbital que no cambien la hipótesis experimental.

La arquitectura conceptual ya es suficientemente rica.

Agregar más teoría antes de probarla puede empezar a degradar la claridad alcanzada.

---

# 21. La doble prueba

Todo el programa queda reducido a dos preguntas.

### Prueba de mercado

> **¿Encontramos personas para quienes una decisión que ya tomaron vuelve a desaparecer del trabajo futuro, y cambiarían su comportamiento o pagarían por impedir que eso ocurra?**

### Prueba de Gravity

> **Cuando la decisión no desaparece como información, ¿el sistema puede determinar que sigue vigente, dónde aplica y cómo debe gobernar lo que ocurre después?**

La primera pregunta valida el **dolor y mercado**.

La segunda valida **la necesidad específica de Gravity**.

No deben confundirse.

---

# 22. Regla de falsación

La hipótesis debe poder morir.

Si las entrevistas muestran que:

> **recordar la decisión alcanza**,

entonces Gravity está sobredimensionada para ese problema.

Si muestran que:

> **la decisión está disponible pero el humano todavía tiene que aplicarla, reconciliarla, actualizarla o hacerla cumplir**,

entonces existe evidencia del territorio específico que Gravity intenta resolver.

Y si además una primitive mínima consigue hacerlo correctamente y los usuarios quieren mantenerla funcionando, la hipótesis pasa de ser una arquitectura conceptual a una **hipótesis de producto real**.

---

# 23. Estado de verdad vigente

A partir de este documento deben mantenerse separadas cuatro categorías.

## Establecido

Existe evidencia independiente de que profesionales que trabajan con coding agents enfrentan problemas de persistencia de decisiones, contexto y reglas.

Existe evidencia de workarounds manuales y parciales creados para compensarlos.

La capa de simple estado/handoff aparece crecientemente commoditizada y no debe utilizarse por sí sola como fundamento diferencial de Cognituum.

## Hipótesis fuerte

El problema puede extenderse más allá de memoria y persistencia hacia:

* aplicabilidad;
* vigencia;
* alcance;
* autoridad;
* precedencia;
* excepción;
* conflicto;
* herencia.

## Hipótesis Gravity

Las decisiones humanas pueden convertirse en condiciones operativas persistentes capaces de gobernar trabajo futuro sin reimposición humana continua.

## Pendiente de validar

* profundidad G3/G4;
* intensidad económica del dolor;
* frecuencia;
* ICP definitivo;
* mercado inicial;
* willingness to pay;
* correctness de Gravity;
* reducción real del Human Middleware;
* retention;
* viabilidad de la primitive como producto.

---

# 24. Regla de actualización de esta fuente de verdad

Este documento representa la **fuente de verdad estratégica vigente** de la investigación de Cognituum.

No debe modificarse simplemente porque aparezca:

* una nueva idea;
* una nueva interpretación arquitectónica;
* una tecnología nueva;
* una nueva capacidad de un frontier model;
* una formulación retórica más atractiva.

Una conclusión establecida aquí debe revisarse cuando aparezca **evidencia nueva relevante**.

Esa evidencia puede provenir de:

* entrevistas;
* comportamiento observado;
* pruebas de producto;
* adopción;
* abandono;
* evidencia competitiva;
* cambios tecnológicos que eliminen efectivamente el problema;
* experimentos controlados.

Cuando nueva evidencia modifique materialmente las conclusiones, debe generarse una nueva versión del documento.

Ejemplos:

`COGNITUUM_RESEARCH_RESULT_STRATEGY_1.1.md`

para una revisión incremental,

o:

`COGNITUUM_RESEARCH_RESULT_STRATEGY_2.0.md`

si cambia sustancialmente la tesis, el ICP, el mercado o la interpretación de Gravity.

La evidencia anterior no debe borrarse ni reinterpretarse silenciosamente.

---

# 25. Decisión actual

**No realizar otro Cowork de investigación abierta.**

La fase conceptual llegó a un punto suficiente.

Completar la investigación final actualmente en curso y utilizarla para corregir, si corresponde:

* dolor;
* ICP;
* mercado inicial;
* profundidad G1–G4;
* evidencia contraria.

En paralelo, comenzar:

# GRAVITY VALIDATION — FIRST PALADINS

con una misión estrecha:

> **Determinar mediante incidentes reales si existen usuarios para quienes recordar una decisión no alcanza y necesitan que esa decisión continúe condicionando correctamente el trabajo futuro.**

Las entrevistas pasan a ser responsabilidad directa de founder discovery.

No explicar Gravity.

No vender Cognituum.

No buscar aprobación.

Buscar incidentes.

Buscar costos.

Buscar workarounds.

Buscar contradicciones.

Buscar aquello que el humano todavía debe hacer incluso cuando la información ya está disponible.

Si aparecen **3–5 Paladines con casos G3/G4 y dolor material**, pasar inmediatamente a la primitive mínima.

---

# 26. Próximo activo que debe producir Cognituum

El próximo activo principal no debe ser otro documento conceptual.

Debe ser evidencia de usuarios.

La secuencia desde este punto es:

**Research Result Strategy 1.0**
↓
**First Paladin Interviews**
↓
**ICP + Market confirmation/correction**
↓
**3–5 casos G3/G4 con dolor material**
↓
**Minimal Gravity Primitive**
↓
**Correctness + Human Middleware reduction + Retention**
↓
**Product Validation**

Sólo después de esa evidencia corresponde decidir cuánto de Gravity, Orbital, Mandates, Wisdom y Sovereign debe convertirse en producto comercial.

---

# 27. Frase de cierre

La tesis vigente de Cognituum puede condensarse en:

> **El código persiste. El estado persiste. El contexto puede persistir. Pero el criterio puede desaparecer de la ejecución.**
>
> **Cognituum explora cómo hacer que una decisión humana no sólo sobreviva como información, sino que continúe ejerciendo autoridad sobre el trabajo futuro.**
>
> **Un decision log recuerda. Gravity gobierna.**

Y las dos preguntas que deciden el próximo capítulo son:

### Mercado

> **¿Encontramos personas para quienes una decisión que ya tomaron vuelve a desaparecer del trabajo futuro y pagarían —en dinero o cambio de comportamiento— por impedir que eso ocurra?**

### Gravity

> **Cuando esa decisión ya está disponible como información, ¿el humano todavía tiene que determinar que sigue vigente, dónde aplica y cómo debe gobernar la ejecución?**

Si la respuesta empírica a ambas preguntas es suficientemente fuerte, **Cognituum deja de necesitar más justificación conceptual y empieza a necesitar producto.**
