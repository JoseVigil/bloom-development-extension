# Orbital
## Fundamentos de Coordinación, Gravity e Interacción Gobernada

**Cognituum — Documento Fundacional**
**Estado:** Conceptual / Fundacional
**Dominio:** Orbital · Gravity · Paladin
**Dependencias conceptuales:** BSIP · Intent Types · `cor` · Mandates · Nucleus · Paladin
**Origen:** evolución del dominio Agentic hacia coordinación gobernada por Intents y criterio persistente
**Revisión:** incorporación de Gravity como campo semántico y normativo de interacción

---

# 1. Propósito

Orbital nace de una pregunta distinta a la que dio origen a los sistemas agénticos tradicionales.

La pregunta no es:

> ¿Cómo podemos darle mayor autonomía a una inteligencia artificial para que resuelva un problema?

La pregunta es:

> ¿Cómo podemos permitir que procesos de inteligencia artificial trabajen, exploren, propongan, verifiquen y ejecuten sin perder el criterio de ingeniería que debe gobernarlos?

Orbital es la respuesta de Cognituum a esa pregunta.

No es un harness de agentes.

No es simplemente un loop.

No es un framework de ejecución.

Orbital es una **capa de coordinación gobernada por criterio**, diseñada para permitir trabajo autónomo o semiautónomo sin entregar a los modelos la autoridad sobre las reglas que gobiernan ese trabajo.

Los modelos pueden razonar.

Los modelos pueden proponer.

Los modelos pueden ejecutar.

Los modelos pueden encontrar errores.

Los modelos pueden generar alternativas.

Pero el sistema debe distinguir entre:

- hacer trabajo;
- interpretar una instrucción;
- tomar una decisión;
- establecer una regla;
- modificar una regla;
- promulgar una regla;
- operar bajo reglas ya establecidas.

Esta distinción conduce a Gravity.

Gravity no es solamente un lenguaje para describir reglas de coordinación.

Gravity constituye el **campo semántico y normativo dentro del cual el trabajo inteligente y la interacción humana adquieren significado operacional**.

Esta ampliación es fundamental.

Orbital gobierna el movimiento.

Gravity gobierna el campo.

Y toda interacción con Paladin ocurre dentro de ese campo.

---

# 2. Del mundo Agentic a Orbital

Orbital surge del trabajo previamente desarrollado dentro del dominio Agentic de Cognituum.

Ese trabajo contiene elementos que siguen siendo fundamentales:

- BSIP;
- Mandates;
- Intents;
- loops agénticos;
- coordinación entre procesos;
- mecanismos de evaluación y corrección;
- Nucleus;
- `cor` como mecanismo formal de gobernanza.

Orbital no invalida ese trabajo.

Lo reorganiza bajo una definición más precisa.

El descubrimiento inicial fue que **el agente no debe ser la unidad conceptual principal**.

Los modelos, agentes, CLIs y herramientas son participantes reemplazables.

Los Intents, Mandates, decisiones y reglas poseen continuidad independientemente de esos participantes.

Pero Gravity introduce una precisión todavía más profunda:

> El trabajo no solamente debe ser trazable por aquello que intenta conseguir. Debe ser interpretable bajo el criterio que estaba vigente cuando fue solicitado y ejecutado.

Por lo tanto, Orbital no debe entenderse como un sistema que organiza agentes.

Debe entenderse como un sistema que **coordina trabajo inteligente dentro de campos explícitos de criterio**.

La autonomía pertenece a la ejecución.

La autoridad pertenece a la gobernanza.

Y el significado operacional pertenece al campo de Gravity vigente.

---

# 3. El principio orbital

La metáfora de Orbital no es accidental.

Un objeto puede moverse.

Puede tener velocidad.

Puede cambiar de posición.

Puede recorrer trayectorias complejas.

Puede interactuar con otros objetos.

Pero su movimiento ocurre dentro de un campo de fuerzas.

En Orbital sucede lo mismo.

Los procesos de AI pueden:

- explorar soluciones;
- leer arquitectura;
- escribir código;
- ejecutar pruebas;
- detectar problemas;
- comparar alternativas;
- modificar implementaciones;
- refutar hipótesis;
- volver atrás;
- generar evidencia;
- proponer nuevas decisiones.

Ese movimiento constituye el trabajo orbital.

Pero determinadas decisiones establecen el campo dentro del cual ese movimiento puede ocurrir.

Esas decisiones constituyen Gravity.

Por eso:

> **Orbital permite movimiento. Gravity establece el campo.**

Sin Orbital no existe capacidad organizada de exploración.

Sin Gravity la exploración puede convertirse en deriva.

Pero ahora debemos agregar una consecuencia todavía más importante:

> **El campo no gobierna solamente lo que la AI hace. También gobierna cómo la AI interpreta lo que el humano dice.**

Gravity afecta tanto la ejecución como la interacción.

---

# 4. Gravity

Gravity es el lenguaje de criterio de Cognituum.

No pretende reemplazar Java, Python, C, Rust, Go ni ningún otro lenguaje de programación.

Tampoco pretende reemplazar el lenguaje natural.

Opera en otra dimensión.

Un lenguaje de programación tradicional describe principalmente comportamiento computacional.

Gravity describe **criterio operacional aplicable al trabajo inteligente**.

Puede expresar:

- decisiones;
- restricciones;
- prioridades;
- límites;
- invariantes;
- condiciones;
- excepciones;
- tolerancias;
- riesgos aceptables;
- riesgos inadmisibles;
- relaciones;
- precedencias;
- autoridad;
- criterios de evaluación;
- condiciones de escalamiento;
- reglas de coordinación;
- principios de ingeniería;
- conocimiento derivado de experiencia.

Gravity puede pensarse inicialmente como un **lenguaje de reglas densas en criterio**.

Su objetivo no es describir cada paso que debe realizar una AI.

Su objetivo es establecer las fuerzas que deben permanecer verdaderas mientras la AI trabaja.

Pero Gravity posee además una segunda propiedad fundacional:

> **Las reglas Gravity participan en la interpretación de las expresiones realizadas dentro de su campo.**

Por lo tanto, Gravity no es solamente una entrada de ejecución.

Es también una entrada de interpretación.

---

# 5. Gravity como campo semántico y normativo

Este principio redefine la relación entre Gravity y lenguaje natural.

En los sistemas contemporáneos de AI suele hablarse de *context engineering*.

Documentos, memorias, instrucciones, reglas, ejemplos y otros artefactos son incorporados al contexto del modelo para mejorar su respuesta.

Gravity no debe reducirse a ese mecanismo.

Gravity puede utilizar técnicamente mecanismos de contextualización, recuperación, serialización o composición de prompts.

Pero conceptualmente es otra cosa.

> **Gravity no es información adjunta al prompt.**

> **Gravity es el sistema de leyes bajo el cual el prompt adquiere significado operacional.**

Esta distinción es fundamental.

Consideremos una expresión aparentemente simple:

> Cambiemos este contrato.

En un sistema conversacional plano, la interpretación depende fundamentalmente de la conversación y de la capacidad del modelo para inferir restricciones.

En Cognituum podrían existir, antes de esa expresión, reglas como:

```text
Organization Gravity:
    signed-contracts are immutable

Project Gravity:
    BSIP is normative over implementation

Mandate Gravity:
    preserve backwards compatibility

Session Gravity:
    investigate alternatives before contract modification
```

La frase:

> Cambiemos este contrato.

no puede entonces interpretarse como una instrucción operacional aislada.

Debe interpretarse dentro del campo vigente.

Conceptualmente:

```text
Natural Language
        +
Active Gravity
        ↓
Contextualized Meaning
        ↓
Operational Interpretation
        ↓
Allowed / Rejected / Escalated / Reframed Action
```

Esto permite formular uno de los principios centrales de Gravity:

> **Un prompt dice algo. Gravity determina qué puede significar operacionalmente eso que fue dicho.**

---

# 6. Del prompt plano al lenguaje gobernado

La interacción convencional con AI puede representarse aproximadamente así:

```text
User
  │
  ▼
Prompt
  │
  ▼
Model
  │
  ▼
Response / Action
```

La interacción gobernada por Gravity introduce otra estructura:

```text
                    ACTIVE GRAVITY
                          │
              ┌───────────┴───────────┐
              │                       │
         Semantic Field          Normative Field
              │                       │
              └───────────┬───────────┘
                          │
User ── Natural Language ─┤
                          │
                          ▼
                Operational Meaning
                          │
                          ▼
                       Orbital
                          │
                          ▼
                    Response / Work
```

El lenguaje natural no desaparece.

Al contrario.

Puede volverse más natural porque deja de cargar permanentemente con la obligación de repetir todas las restricciones relevantes.

El usuario puede expresarse coloquialmente precisamente porque existe un campo formal que preserva aquello que no debería tener que volver a decir.

---

# 7. Gravity no reemplaza el prompting

Gravity y prompting no son alternativas.

Coexisten.

El usuario puede decir:

> Sí.

> Continuá.

> Probá otra alternativa.

> No estoy de acuerdo.

> Revisá primero los tests.

> Mostrame por qué elegiste eso.

> Cambiemos de estrategia.

Estas expresiones siguen siendo lenguaje humano ordinario.

No necesitan transformarse automáticamente en Gravity.

La diferencia es que ya no existen en vacío.

Se producen dentro de un campo.

Por eso:

> **Gravity no reemplaza el prompting. Gravity le da un sistema de leyes al prompting.**

El prompt conserva flexibilidad.

Gravity conserva criterio.

La combinación permite una interacción que puede ser simultáneamente:

- coloquial;
- creativa;
- rigurosa;
- persistente;
- trazable;
- gobernada.

---

# 8. La jerarquía de Gravity

Gravity no debe asumirse como un conjunto plano de reglas.

Cognituum posee diferentes niveles de autoridad, persistencia y alcance.

La interacción debe poder ocurrir dentro de una **jerarquía de gravedad activa**.

Conceptualmente:

```text
NUCLEUS
│
└── ORGANIZATION GRAVITY
        │
        │ principios institucionales
        │ políticas
        │ autoridad
        │ invariantes globales
        │
        ▼
    PROJECT GRAVITY
        │
        │ arquitectura
        │ decisiones persistentes
        │ convenciones
        │ experiencia del proyecto
        │
        ▼
    MANDATE GRAVITY
        │
        │ objetivo
        │ restricciones particulares
        │ tolerancias
        │ criterios de éxito
        │
        ▼
    SESSION GRAVITY
        │
        │ hipótesis temporales
        │ reglas locales
        │ decisiones de trabajo
        │
        ▼
    NATURAL LANGUAGE
        │
        │ conversación
        │ feedback
        │ exploración
        │ instrucciones
        ▼
    OPERATIONAL INTERPRETATION
```

Las capas inferiores no reemplazan arbitrariamente a las superiores.

Operan dentro de ellas.

Una regla de sesión existe dentro del Mandate.

El Mandate existe dentro del proyecto.

El proyecto existe dentro del campo organizacional definido por Nucleus.

Por lo tanto, la interpretación de una expresión local puede depender de reglas provenientes de múltiples escalas.

---

# 9. Herencia, precedencia y autoridad

La jerarquía Gravity introduce una propiedad fundamental: **el criterio posee alcance**.

No todas las reglas tienen la misma autoridad.

No todas las reglas tienen la misma duración.

No todas las reglas pueden modificar a otras.

Una Session Gravity puede establecer:

> Durante esta investigación, priorizar velocidad sobre optimización.

Pero no debería poder invalidar silenciosamente una Organization Gravity que establezca:

> Ningún dato de producción puede utilizarse en entornos experimentales.

De la misma manera, un Mandate puede introducir una excepción local únicamente si la gobernanza superior permite esa clase de excepción.

Esto implica que Gravity necesitará eventualmente mecanismos formales para representar:

- scope;
- inheritance;
- precedence;
- authority;
- override;
- exception;
- conflict;
- expiration;
- promotion.

La sintaxis todavía no debe fijarse.

Pero la semántica jerárquica sí debe considerarse fundacional.

---

# 10. La interpretación ocurre bajo Gravity

Una consecuencia arquitectónica importante es que Cognituum no debería enviar simplemente:

```text
prompt → model
```

Conceptualmente debe existir primero una resolución del campo vigente:

```text
Organization Gravity
        +
Project Gravity
        +
Mandate Gravity
        +
Session Gravity
        ↓
Resolved Active Gravity
        +
Natural Language
        ↓
Operational Interpretation
```

El resultado no debe entenderse simplemente como un prompt enriquecido.

Es la **interpretación de una expresión dentro de un sistema de reglas**.

Esto permite que el mismo texto pueda producir consecuencias diferentes dependiendo del campo bajo el cual sea pronunciado.

Y eso es correcto.

Porque en ingeniería el significado operacional de una decisión nunca depende exclusivamente de las palabras.

Depende también de:

- arquitectura;
- autoridad;
- historia;
- restricciones;
- riesgo;
- decisiones previas;
- políticas;
- contexto del trabajo.

Gravity convierte esas condiciones en parte explícita del sistema.

---

# 11. La sesión deja de ser el contenedor del contexto

Los sistemas conversacionales actuales tienden a organizar la experiencia alrededor de sesiones.

La sesión acumula mensajes.

Los mensajes generan contexto.

El modelo responde en función de aquello que permanece disponible dentro de esa conversación.

Esto produce un problema estructural:

> **La sesión termina convirtiéndose accidentalmente en el contenedor del conocimiento necesario para trabajar.**

Cuando la sesión desaparece, cambia o se migra hacia otro modelo, gran parte de ese contexto debe reconstruirse.

Cognituum propone invertir esa relación.

En Paladin:

> **La sesión no contiene el contexto. La sesión ocurre dentro del contexto.**

Antes de que una sesión comience ya pueden existir:

- Organization Gravity;
- Project Gravity;
- decisiones históricas;
- arquitectura;
- Mandates;
- Wisdom;
- restricciones;
- políticas;
- autoridad.

La sesión entra dentro de ese mundo.

No lo crea desde cero.

---

# 12. La sesión como contexto efímero dentro de continuidad persistente

La sesión continúa siendo útil.

Puede contener:

- conversación;
- hipótesis;
- exploración;
- feedback;
- decisiones temporales;
- Session Gravity;
- trabajo en progreso.

Pero deja de ser soberana.

Conceptualmente:

```text
Persistent Organizational Context
              │
              ▼
       Persistent Project Context
              │
              ▼
          Mandate Context
              │
              ▼
        ┌─────────────┐
        │   SESSION   │
        │             │
        │ conversation│
        │ exploration │
        │ feedback    │
        │ local rules │
        └─────────────┘
              │
              ▼
       session terminates
              │
              ▼
Persistent Context continues
```

La sesión puede terminar.

El proyecto continúa.

Gravity continúa.

Las decisiones que hayan sido deliberadamente preservadas continúan.

La siguiente sesión vuelve a entrar dentro de ese campo.

---

# 13. No renegociar la ingeniería

Esta arquitectura ataca uno de los problemas fundamentales de la interacción actual con AI.

Hoy el ingeniero frecuentemente debe volver a explicar:

- cómo está construido el sistema;
- qué decisiones ya fueron tomadas;
- qué alternativas ya fueron descartadas;
- qué cosas no deben tocarse;
- qué contratos son normativos;
- qué riesgos son aceptables;
- cómo trabaja el equipo;
- qué criterio debe prevalecer.

Cada nueva conversación puede convertirse en una renegociación.

Gravity cambia esta relación.

El ingeniero no debería tener que decir permanentemente:

> Recordá que acá no hacemos esto.

> Ya habíamos decidido aquello.

> No cambies ese contrato.

> Esa abstracción fue descartada.

> En este proyecto priorizamos X sobre Y.

Si esas decisiones poseen suficiente importancia y persistencia, deben formar parte del campo.

Entonces el lenguaje cotidiano puede apoyarse sobre ellas.

> **El usuario deja de renegociar su ingeniería en cada turno.**

Paladin ya sabe bajo qué gravedad está operando.

---

# 14. Paladin como interfaz situada

Esta arquitectura redefine también a Paladin.

Paladin no es simplemente una interfaz para hablar con una AI.

Tampoco es simplemente un IDE.

Es una interfaz **situada dentro de un sistema de criterio persistente**.

Cuando un ingeniero entra a Paladin, no entra a una conversación vacía.

Entra a:

- una organización;
- un proyecto;
- posiblemente un Mandate;
- una jerarquía de autoridad;
- un conjunto de decisiones;
- un campo Gravity.

Entonces comienza a hablar.

Eso significa que la unidad fundamental de UX no debería ser solamente:

> conversación.

Debe existir también:

> **posición dentro del campo.**

El usuario debería poder comprender, de alguna forma todavía no diseñada:

> ¿Bajo qué Gravity estoy trabajando ahora?

Esta pregunta será fundamental para la futura interfaz.

---

# 15. Conversar bajo Gravity

Podemos denominar provisionalmente **conversación gobernada** a esta forma de interacción.

No significa que cada frase necesite autorización.

Tampoco significa que Gravity deba bloquear constantemente al usuario.

Significa que las expresiones se interpretan dentro de restricciones conocidas.

Ejemplo:

```text
Organization Gravity:
    production credentials never leave Vault

Project Gravity:
    provider integrations must use AITAP

Mandate Gravity:
    migrate provider implementation without changing public API

Session Gravity:
    preserve current fallback until tests pass
```

El usuario dice:

> Hagámoslo directo contra el provider para probar más rápido.

En un chat convencional, el modelo podría interpretar literalmente la instrucción.

En Paladin, la expresión entra en conflicto con Gravity.

El sistema puede entonces:

- rechazar la acción;
- señalar el conflicto;
- reinterpretar una alternativa compatible;
- solicitar elevación;
- permitir una excepción si existe autoridad;
- proponer modificar Gravity si corresponde.

La diferencia no está en que el modelo recibió "más contexto".

La diferencia está en que **la instrucción fue pronunciada dentro de un sistema de leyes**.

---

# 16. Gravity como lenguaje de ingeniería

Un ingeniero experimentado posee reglas que rara vez aparecen explícitamente en código.

Sabe:

- cuándo desconfiar de una solución aparentemente correcta;
- cuándo una prueba positiva no constituye evidencia suficiente;
- cuándo detener una cadena de modificaciones;
- cuándo preservar una implementación imperfecta;
- cuándo exigir evidencia adicional;
- cuándo una anomalía representa error;
- cuándo representa fricción tolerable;
- cuándo una solución local viola un principio global.

Ese conocimiento suele permanecer tácito.

Gravity abre la posibilidad de codificar parte de ese criterio.

No necesariamente mediante largas especificaciones.

También mediante:

- reglas;
- patrones;
- shortcuts;
- principios;
- decisiones;
- excepciones;
- expresiones compactas.

Gravity puede convertirse así en una forma de escribir **sabiduría de ingeniería**.

No porque represente toda la sabiduría humana.

Sino porque puede representar una parte extremadamente valiosa de ella:

> **el criterio utilizado para decidir bajo determinadas circunstancias.**

---

# 17. Gravity de desarrollo

Gravity también modifica la relación entre Intent y código.

Tradicionalmente puede resultar natural declarar:

```text
Intent: dev
```

y posteriormente describir qué código debe producirse.

Pero si un Mandate posee:

- objetivo;
- contexto;
- arquitectura;
- restricciones;
- evidencia;
- Gravity;

Orbital puede descubrir durante ejecución qué movimientos son necesarios.

Puede:

- investigar;
- leer;
- modificar;
- probar;
- volver atrás;
- comparar;
- escribir código;
- generar documentación;
- producir evidencia.

Esto introduce una hipótesis importante:

> **El código puede dejar de ser necesariamente una clase de intención y convertirse en una consecuencia posible del trabajo bajo Gravity.**

La deprecación de `dev` debe resolverse en su especificación correspondiente.

Pero Gravity permite conceptualizar un desarrollo menos rígido.

El ingeniero establece las fuerzas.

Orbital encuentra la trayectoria.

---

# 18. Gravity no debe prescribir innecesariamente la trayectoria

Existe un riesgo fundamental.

Gravity podría convertirse en una nueva forma de escribir especificaciones imperativas:

```text
Modificar A.
Crear B.
Ejecutar C.
Cambiar D.
Probar E.
```

Eso no constituye necesariamente Gravity.

Gravity debería tender a expresar:

```text
Preservar contrato público.

No introducir una segunda fuente de verdad.

Preferir extensión sobre reemplazo.

Exigir evidencia antes de modificar schema.

Escalar cualquier modificación de contrato firmado.
```

La diferencia es estructural.

La primera forma describe trayectoria.

La segunda describe campo.

> **Gravity establece las fuerzas. Orbital encuentra el movimiento.**

---

# 19. Gravity dentro y fuera de Orbital

Gravity nace del estudio de loops agénticos, pero no debe quedar encerrado dentro de ellos.

Puede gobernar:

- una conversación;
- una sesión;
- un Mandate;
- un proceso Orbital;
- una investigación;
- una migración;
- un refactor;
- testing;
- una decisión arquitectónica;
- un proyecto;
- una organización.

Orbital es una forma particularmente importante de movimiento bajo Gravity.

Pero Gravity posee alcance más amplio.

El loop fue el laboratorio.

El campo es generalizable.

---

# 20. Gravity y `cor`

Gravity y `cor` están profundamente relacionados, pero no son la misma cosa.

Gravity expresa criterio.

`cor` representa el canal formal mediante el cual determinadas modificaciones de gobernanza pueden ser promulgadas bajo autoridad de Nucleus.

Por lo tanto:

> **Gravity expresa. `cor` promulga cuando la gobernanza lo requiere.**

Una regla Gravity puede existir como:

- regla de sesión;
- regla de Mandate;
- criterio de proyecto;
- regla candidata;
- conocimiento reusable.

Eso no significa que posea automáticamente autoridad global.

Cuando una decisión necesita convertirse en ley de mayor alcance, debe atravesar la frontera de gobernanza correspondiente.

---

# 21. Postulación y promulgación

Debe preservarse la diferencia entre dos actos.

## Regla postulada

Puede surgir de:

- un ingeniero;
- una conversación;
- un modelo;
- evidencia;
- un proceso Orbital;
- experiencia acumulada.

La postulación significa:

> Esto parece una regla valiosa.

No significa:

> Esta regla gobierna ahora la organización.

## Regla promulgada

Una regla adquiere autoridad superior únicamente cuando atraviesa el mecanismo de gobernanza correspondiente.

En el ámbito regulado por `cor`, esa promulgación depende de Nucleus y del canal autorizado.

Esto establece un principio:

> **Una AI puede identificar Gravity. No puede otorgarse a sí misma autoridad sobre la gravedad que la gobierna.**

---

# 22. Promoción de Gravity

La jerarquía permite además pensar en movimiento ascendente.

Una Session Gravity puede demostrar utilidad.

Puede repetirse.

Puede acumular evidencia.

Puede convertirse en candidata a Project Gravity.

Una regla de proyecto puede demostrar aplicabilidad organizacional.

Puede entonces proponerse para gobernanza superior.

Conceptualmente:

```text
Session Gravity
      │
      │ evidence
      ▼
Mandate / Project Candidate
      │
      │ reuse
      ▼
Project Gravity
      │
      │ organizational relevance
      ▼
Governance Candidate
      │
      ▼
     cor
      │
      ▼
Nucleus / Organization Gravity
```

Esto permite que experiencia local pueda transformarse deliberadamente en conocimiento institucional.

---

# 23. De Gravity a Wisdom

Una regla útil puede comenzar como intuición.

Después convertirse en decisión.

Luego en Gravity.

Posteriormente demostrar valor mediante uso y evidencia.

La progresión conceptual puede ser:

```text
Experience
    ↓
Criterion
    ↓
Gravity
    ↓
Repeated Application
    ↓
Evidence
    ↓
Reusable Gravity
    ↓
Wisdom
```

Gravity puede convertirse así en uno de los mecanismos mediante los cuales la experiencia de ingeniería deja de permanecer exclusivamente en la cabeza de una persona.

La experiencia se vuelve:

- expresable;
- verificable;
- trazable;
- versionable;
- reusable;
- transferible.

---

# 24. El ingeniero como fuente de gravedad

Los sistemas agénticos tradicionales tienden a maximizar autonomía.

Orbital debe maximizar otra cosa:

> **autonomía compatible con criterio preservado.**

Eso vuelve a colocar al ingeniero en una posición fundamental.

El ingeniero no necesita ejecutar personalmente cada operación.

Tampoco necesita escribir cada línea de código.

Su valor puede concentrarse cada vez más en:

- juicio;
- criterio;
- experiencia;
- evaluación de trade-offs;
- anticipación;
- reconocimiento de patrones;
- comprensión sistémica;
- capacidad de decidir bajo incertidumbre.

Gravity ofrece un mecanismo para convertir parte de ese valor en infraestructura.

El ingeniero deja de ser solamente quien produce código.

Puede convertirse también en quien:

> **define la gravedad bajo la cual el código es producido y bajo la cual la inteligencia interpreta sus instrucciones.**

---

# 25. Orbital como sistema trazable

Un sistema agéntico convencional puede mostrar qué acciones realizó una AI.

Orbital debe poder explicar algo más profundo:

- qué Mandate estaba activo;
- qué Gravity organizacional aplicaba;
- qué Gravity de proyecto aplicaba;
- qué Gravity de Mandate aplicaba;
- qué Gravity de sesión aplicaba;
- qué dijo el humano;
- cómo fue interpretado;
- qué conflictos fueron detectados;
- qué modelo realizó cada operación;
- qué evidencia produjo;
- qué regla provocó una corrección;
- qué `cor` modificó la gobernanza;
- quién autorizó esa modificación;
- qué trabajo posterior quedó afectado.

La trazabilidad deja entonces de responder únicamente:

> ¿Qué hizo la AI?

Debe poder responder también:

> ¿Bajo qué criterio lo hizo?

Y ahora incorpora una tercera pregunta:

> **¿Bajo qué criterio interpretó aquello que el humano le dijo?**

Esta tercera pregunta es una consecuencia directa de Gravity como campo semántico.

---

# 26. Arquitectura conceptual consolidada

La arquitectura puede representarse así:

```text
                        NUCLEUS
                           │
                  Organization Gravity
                           │
                           ▼
                        PROJECT
                           │
                     Project Gravity
                           │
                           ▼
                        MANDATE
                           │
                     Mandate Gravity
                           │
                           ▼
                        PALADIN
                           │
                     Session Gravity
                           │
                 ┌─────────┴─────────┐
                 │                   │
          Natural Language       Gravity Input
                 │                   │
                 └─────────┬─────────┘
                           ▼
                Operational Meaning
                           │
                           ▼
                        ORBITAL
                           │
                 Movement under Gravity
                           │
         ┌─────────────────┼─────────────────┐
         ▼                 ▼                 ▼
      Explore            Modify             Test
         │                 │                 │
         └─────────────────┼─────────────────┘
                           ▼
                         RESULT
                           │
          Code · Evidence · Documentation
            Decisions · Gravity Candidates
```

La arquitectura técnica definitiva deberá determinar cómo se materializa cada transición.

Pero la arquitectura conceptual queda establecida:

> **El trabajo ocurre bajo Gravity.**

> **La conversación ocurre bajo Gravity.**

> **La interpretación ocurre bajo Gravity.**

---

# 27. Una nueva unidad de ingeniería

El código tradicional conserva implementación.

Git conserva modificaciones.

Los tests conservan expectativas verificables.

La documentación conserva explicaciones.

Cognituum busca preservar decisiones.

Gravity extiende esa tesis.

Permite preservar:

- decisiones;
- formas de decidir;
- restricciones;
- precedencias;
- experiencia;
- criterio.

Una decisión dice:

> En este caso hicimos X.

Una regla Gravity puede decir:

> Bajo estas condiciones debemos preferir X.

Y una jerarquía Gravity puede agregar:

> Mientras esta regla permanezca vigente, toda interacción y ejecución dentro de su alcance debe interpretarse bajo ese criterio.

La primera conserva historia.

La segunda conserva experiencia.

La tercera convierte esa experiencia en **campo operacional persistente**.

---

# 28. Principios fundacionales

## I. La coordinación precede a la ejecución

Antes de permitir autonomía debe existir una forma de establecer bajo qué criterio opera esa autonomía.

## II. Gravity establece el campo

Gravity expresa las fuerzas semánticas y normativas bajo las cuales ocurre el trabajo.

## III. Orbital representa movimiento

Orbital permite explorar y ejecutar dentro del campo sin convertir cada movimiento en una decisión de gobernanza.

## IV. El lenguaje natural continúa siendo de primera clase

El usuario no debe formalizar cada interacción para trabajar con rigor.

## V. Gravity no es context engineering

Puede utilizar mecanismos de contextualización para implementarse, pero conceptualmente representa autoridad, criterio y semántica operacional.

## VI. Todo lenguaje natural ocurre dentro de un campo

Una expresión no debe interpretarse independientemente de la Gravity vigente.

## VII. Gravity es jerárquica

Organization, Project, Mandate y Session Gravity poseen diferentes alcances y niveles de autoridad.

## VIII. Las capas inferiores operan dentro de las superiores

Una regla local no invalida silenciosamente una regla superior.

## IX. La sesión no contiene el contexto

La sesión ocurre dentro de un contexto persistente que existe antes de ella y puede sobrevivirla.

## X. El usuario no renegocia permanentemente su ingeniería

Las decisiones que merecen persistir deben formar parte del campo y no depender de su repetición conversacional.

## XI. La persistencia debe ser deliberada

No toda conversación se convierte en Gravity.

## XII. Proponer no equivale a promulgar

Una AI puede identificar criterio candidato sin poseer autoridad para convertirlo en ley.

## XIII. `cor` preserva la frontera de gobernanza

La promulgación de determinadas reglas de alcance superior ocurre únicamente mediante el canal autorizado.

## XIV. Gravity describe fuerzas, no necesariamente trayectorias

La ejecución debe conservar suficiente libertad para resolver problemas dentro de los límites establecidos.

## XV. La gravedad debe ser trazable

Debe ser posible determinar qué reglas gobernaban una acción y una interpretación.

## XVI. La sabiduría pertenece a quien la produce

La experiencia técnica capturada mediante Gravity no debe quedar encerrada en un proveedor de AI.

---

# 29. Hipótesis de Gravity como lenguaje

Gravity todavía no debe cerrarse prematuramente en una gramática.

Antes deben descubrirse sus verdaderos primitivos.

Entre los candidatos iniciales:

```text
decision
constraint
risk
friction
evidence
priority
exception
authority
threshold
precedence
escalation
tolerance
invariant
scope
inherit
override
expire
promote
```

Estos términos son hipótesis.

El lenguaje deberá surgir de casos reales.

Una regla puede ser extensa.

Otra extremadamente breve.

Otra puede convertirse en un shortcut creado por un ingeniero para encapsular años de experiencia.

El objetivo debe ser:

> **máxima densidad de criterio con mínima ambigüedad operacional.**

---

# 30. Consecuencias para Paladin

Este documento no especifica todavía la UI de Paladin.

Pero establece restricciones que cualquier interfaz futura deberá respetar.

Paladin deberá permitir que el ingeniero pueda, de alguna manera:

- conversar naturalmente;
- conocer bajo qué Gravity está operando;
- introducir Gravity;
- distinguir una regla de una conversación;
- comprender su alcance;
- observar conflictos;
- establecer Gravity local;
- reutilizar Gravity;
- modificarla cuando tenga autoridad;
- proponer promociones;
- observar a Orbital trabajar bajo ella;
- comprender por qué una instrucción fue interpretada de determinada manera.

La interfaz no debe diseñarse primero y adaptar Gravity después.

La interfaz debe surgir de esta arquitectura.

---

# 31. La hipótesis mayor

Durante décadas, los lenguajes de programación permitieron expresar comportamiento computacional.

La llegada de los LLM permite que las máquinas comprendan lenguaje humano con una riqueza anteriormente impracticable.

Pero lenguaje natural sin continuidad produce otro problema:

cada conversación puede volver a negociar aquello que ya había sido decidido.

Gravity propone una tercera capa.

No solamente código.

No solamente lenguaje natural.

**Lenguaje natural operando dentro de criterio persistente.**

Esto permite imaginar una nueva forma de ingeniería:

> El ingeniero puede hablar libremente sin que el sistema olvide las leyes bajo las cuales esa conversación debe ser interpretada.

Gravity no elimina la creatividad.

Le proporciona un campo.

Orbital no elimina la autonomía.

Le proporciona gravedad.

Cognituum no elimina la conversación.

Le proporciona continuidad.

---

# 32. Definición fundacional revisada

A efectos de continuar el diseño, se adopta la siguiente definición:

> **Gravity es el lenguaje y campo semántico-normativo de Cognituum mediante el cual se expresa criterio persistente para gobernar tanto la ejecución del trabajo inteligente como la interpretación operacional de las interacciones humanas. Gravity puede existir jerárquicamente a nivel de organización, proyecto, Mandate y sesión. Las expresiones realizadas dentro de ese campo adquieren significado operacional bajo la combinación de las reglas vigentes y su autoridad relativa.**

> **Orbital es el protocolo de coordinación mediante el cual procesos inteligentes pueden explorar, proponer, verificar y ejecutar dentro de un campo Gravity sin adquirir por ello autoridad para modificar las leyes que los gobiernan.**

> **Paladin es la interfaz de ingeniería mediante la cual el humano entra en ese campo, conversa, establece criterio, conduce trabajo y ejerce autoridad sin tener que renegociar en cada turno las decisiones que Cognituum ya preserva.**

Y queda establecido como principio central:

> **Un prompt dice algo. Gravity determina qué puede significar operacionalmente eso que fue dicho.**

---

# 33. Cambio de paradigma

La arquitectura convencional puede resumirse como:

```text
Session
  └── Context
       └── Prompt
            └── AI
```

La arquitectura propuesta por Cognituum invierte esa relación:

```text
Persistent Gravity
        │
        ├── Organization
        │
        ├── Project
        │
        ├── Mandate
        │
        └── Session
                │
                ▼
          Natural Language
                │
                ▼
      Operational Interpretation
                │
                ▼
             Orbital
```

La diferencia es fundamental.

En el primer modelo:

> **el contexto pertenece a la sesión.**

En Cognituum:

> **la sesión pertenece al contexto.**

Ese contexto posee memoria, jerarquía, autoridad, criterio y continuidad.

Por eso la próxima conversación no comienza desde cero.

Por eso cambiar de modelo no debería significar cambiar de criterio.

Por eso terminar una sesión no debería significar perder la ingeniería que fue necesaria para tomar sus decisiones.

Y por eso Gravity no es simplemente una mejor forma de escribir prompts.

Es una propuesta sobre **cómo debe existir el criterio humano alrededor de la inteligencia artificial**.

---

# 34. Frontera de diseño

Este documento fija el fundamento.

No fija todavía:

- la gramática definitiva de Gravity;
- la representación visual de la jerarquía;
- el mecanismo de resolución de conflictos;
- la sintaxis de shortcuts;
- el runtime de evaluación;
- la UI de Paladin;
- la promoción exacta entre scopes;
- la relación final con los Intent Types actualmente existentes;
- la eventual deprecación de `dev`.

Estas decisiones deben derivarse del fundamento, no condicionarlo.

El próximo paso debe estudiar la experiencia del ingeniero dentro de este sistema.

No empezando por pantallas.

Empezando por una pregunta:

> **¿Cómo se siente desarrollar cuando cada palabra que decimos puede apoyarse sobre un criterio que ya fue decidido, preservado y jerárquicamente aplicado?**

Esa pregunta debe preceder al diseño de Paladin.

---

*Fin del documento fundacional revisado.*
