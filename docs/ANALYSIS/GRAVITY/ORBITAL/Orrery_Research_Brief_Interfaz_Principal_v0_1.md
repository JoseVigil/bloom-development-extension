# Research Brief — Orrery como Interfaz Principal del Workspace

**Tipo:** Requerimiento de investigación [R]. No es diseño de UI, no es wireframe, no elige
componentes. Insumo previo a definir la arquitectura de interacción de Orrery.
**Fecha:** 2026-09-11
**Origen:** `PALADIN — CONTROL, CONTINUIDAD Y SABIDURIA` (hipótesis de experiencia, 11 sep 2026,
de una conversación con OpenAI) más la definición previa de Orrery ya fijada en esta línea de
investigación (`Orbital da movimiento. Constellation da escala. Orrery da control.`). Ese
documento eleva a Orrery de "vista de un subsistema" a **la interfaz principal del workspace** —
no un dashboard más, sino, en palabras del propio documento fuente, algo del orden de "otra
galaxia", donde el Paladín es protagonista, no operador de una UI que oculta el trabajo debajo.

**Actualización 2026-09-11 (misma fecha, ampliación de alcance):** con `Constellation` ya
definido como capa de orquestación entre Mandates (Constellation coordina Mandates y sus
Orbitales bajo un propósito mayor; Orbital coordina agentes e Intents dentro de un Mandate;
Nucleus y Gravity conservan autoridad y criterio en ambos niveles), este brief se expande para
cubrir **la jerarquía completa de tres capas — Constellation, Orbital, Gravity — como problema
único de usabilidad**, no solo Orbital/Control como en la versión anterior. Esto corrige además un
error ya introducido en la versión previa de este documento (§2.2): ahí se trataba a `Mandate`
como "la unidad superior" comparándolo con un DAG de Airflow — con Constellation definido, la
unidad superior real es Constellation, y Mandate pasa a ser la unidad intermedia entre
Constellation y Orbital.

---

## 0. Tensiones explícitas que este brief no resuelve, solo nombra

Estas dos preguntas condicionan cómo se lee todo lo demás. El research debe traer evidencia para
ambas, no asumir una respuesta:

- **¿Orrery es una sola metáfora visual (orbital/astronómica) o un contenedor de múltiples vistas**
  (orbital para overview, timeline/multipista para Control, otra para Wisdom) que comparten
  principios de interacción pero no una sola geometría?
- **¿Gravity se representa literalmente (fuerzas, líneas, masa visual) o se abstrae completamente**
  en lenguaje humano ("esto queda", "esto gobierna") sin que el usuario vea nunca la palabra
  Gravity ni su geometría de fuerzas?
- **¿Constellation, Orbital y Gravity son tres vistas separadas que el usuario navega, o una sola**
  vista continua con zoom (Constellation al alejar, Orbital al acercarse a un Mandate, Gravity
  como capa que se activa/desactiva en cualquier nivel de zoom)? Esta pregunta es nueva respecto
  de la versión anterior de este brief y es, en rigor, la más urgente de las tres — condiciona a
  las otras dos.

---

## 1. Por qué existe este documento

El documento fuente fija cuatro pilares que **tienen que verse**, no solo existir técnicamente:
Control, Continuidad, Sabiduría, Soberanía. Y fija un principio de diseño explícito: la interfaz
no debe explicar la arquitectura (`Intent → Brain → Nucleus → Gravity → Orbital → Mandate`) —
debe hacer que explicarla resulte innecesario. Esto es un problema de diseño de interacción con
precedentes reales en otras industrias (control de misión, edición audiovisual, juegos,
plataformas de reputación) que todavía no se relevaron.

**No-objetivo explícito:** este brief no propone un layout, un sistema de componentes ni un stack
de rendering. Busca patrones de interacción y de jerarquía visual ya resueltos en otros dominios,
para evaluar cuáles son trasladables a los cuatro pilares.

---

## 2. Líneas de investigación

### 2.0 — Jerarquía multi-escala completa: Constellation → Orbital → Gravity (prioridad)

Esta línea es la de mayor prioridad de todo el brief: cómo se inspecciona, navega y opera la
estructura completa de tres capas sin abrumar al usuario en ningún nivel.

- **Constellation** — grafo de orquestación de alto nivel entre Mandates: dependencias, qué
  corre en paralelo, qué corre en secuencia, qué activa a qué, y cómo el resultado de un Mandate
  condiciona la activación del siguiente.
- **Orbital** — grafo de ejecución agéntica dentro de cada Mandate: intents propuestos,
  ejecuciones, decisiones de validación/firma de Nucleus, turno a turno.
- **Gravity** — no es un tercer grafo aparte, es una capa normativa que actúa *sobre* los otros
  dos: criterio, posturas, límites, activo en cualquier nodo de Constellation o de Orbital.

Preguntas a responder:
- ¿Qué precedentes existen de **grafos anidados navegables** donde un nodo del grafo superior
  (un Mandate dentro de Constellation) *es* la puerta de entrada a un grafo completo inferior
  (el Orbital de ese Mandate), sin recargar de contexto ni perder la posición del usuario en la
  jerarquía? (Ej: mapas con zoom semántico — un país que al acercarse revela provincias, que al
  acercarse revelan ciudades — donde el nivel de detalle mostrado depende del zoom, no de un
  cambio de pantalla.)
- ¿Cómo se resuelve, en herramientas de grafos de dependencias reales (Bazel/Buck build graphs,
  Nx/Turborepo dependency graphs, Terraform graph), la lectura de **qué puede correr en paralelo
  vs. qué depende de qué** de un vistazo, sin forzar al usuario a leer una lista de dependencias
  en texto?
- ¿Existen precedentes de una **capa que se superpone a un grafo sin ser un nodo más del grafo**
  — comparable a lo que necesita Gravity actuando sobre Constellation y Orbital al mismo tiempo?
  (Ej: capas de overlay en herramientas de mapas — tráfico, clima, límites administrativos —
  que se activan/desactivan sin alterar la geometría base del mapa.)
- ¿Qué patrón de "miga de pan" o indicador de escala usan estas herramientas para que el usuario
  siempre sepa si está mirando el propósito mayor (Constellation), un Mandate puntual (Orbital),
  o un Intent específico — sin necesidad de un selector de nivel explícito y separado de la
  visualización misma?
- ¿Cómo evitan estas herramientas que el grafo superior (Constellation, potencialmente con
  decenas de Mandates) se vuelva ilegible cuando la mayoría de los nodos no son relevantes al
  momento actual — hay patrones de atenuación/agrupamiento (clustering) que preserven la
  topología completa sin exigir leerla toda?

Fuentes sugeridas: zoom semántico en cartografía digital (Google Maps, Mapbox — nivel de detalle
dependiente de zoom); grafos de dependencias de build systems (Bazel, Nx, Turborepo) y su
resolución visual de paralelismo vs. secuencia; Terraform graph / infraestructura como grafo de
recursos con dependencias; capas de overlay en SIG (sistemas de información geográfica) como
precedente de "regla que actúa sobre el mapa sin ser parte de él"; clustering de nodos en
herramientas de grafos de red a gran escala (Gephi, Cytoscape) para legibilidad con muchos nodos.

### 2.1 — Interfaces de control cinemático / centro de mando

El documento pide explícitamente que la experiencia se sienta como "una película" donde el
Paladín es protagonista, no un dashboard pasivo.

Preguntas a responder:
- ¿Cómo resuelven las interfaces de control de misión (NASA/SpaceX Mission Control), las salas de
  control industrial (SCADA) y los cockpits de simulador de vuelo la relación entre **volumen de
  información real** y **sensación de estar al mando** en vez de abrumado?
- ¿Qué patrones usan los juegos de estrategia en tiempo real (vista "de dios" con capacidad de
  entrar al detalle de una unidad) para pasar de overview a inspección sin perder la sensación de
  control continuo?
- ¿Cómo manejan los cockpits de simulador y los HUD de juegos la diferencia entre información
  ambiental (siempre visible, baja densidad) e información de intervención (aparece solo cuando
  hace falta decidir algo)? Es el mismo problema que "el usuario común entiende de un vistazo, el
  ingeniero puede entrar" del documento fuente.
- ¿Qué evidencia existe sobre el punto de quiebre entre "se siente en control" y "se siente
  abrumado" a medida que aumenta el número de procesos simultáneos visibles?

Fuentes sugeridas: literatura de UX de mission control rooms (NASA, SpaceX); design patterns de
juegos RTS (StarCraft, Civilization) para "camera del comandante" vs. vista de unidad; Bloomberg
Terminal y salas de trading como precedente de alta densidad de información con sensación de
control (no de dashboard pasivo); HUD design en simuladores de vuelo (Boeing/Airbus, DCS).

### 2.2 — Timeline multipista vs. vista orbital: reconciliar las dos metáforas

Preguntas a responder:
- ¿Cómo resuelven los editores de audio/video (Ableton Live *session view* vs. *arrangement view*,
  Premiere/DaVinci Resolve) el mismo proceso visto desde dos ángulos distintos — uno lineal en el
  tiempo, otro más libre/espacial — sin que el usuario sienta que son dos productos distintos?
- ¿Existe precedente de una interfaz que combine "cosas que avanzan en el tiempo" (secuencia) con
  "cosas que orbitan/persisten sin avanzar linealmente" (el propio texto del documento fuente ya
  nombra esta distinción: *"algunos procesos no simplemente recorren una secuencia, sino que
  permanecen orbitando"*)? Esto es más cercano a herramientas de orquestación (Temporal UI, Airflow
  DAG view) que a un DAW puro — vale la pena comparar ambos.
- ¿Cómo manejan las herramientas de orquestación de workflows (Temporal Web UI, Airflow, Prefect)
  la relación entre una unidad intermedia (un Mandate, ejecutándose dentro de un Constellation
  mayor — corregido respecto de la versión anterior de este brief, ver nota de actualización al
  inicio) y "ejecuciones debajo" (turnos, intents) sin que la vista de alto nivel se vuelva
  ilegible cuando hay muchas ejecuciones activas?
- ¿Qué patrón de "profundidad progresiva" usan estas herramientas para pasar de ver un
  Constellation completo, a un Mandate puntual dentro de él, a un Intent específico dentro de ese
  Mandate — tres niveles, no dos — sin romper el contexto visual de dónde está parado el usuario?

Fuentes sugeridas: Ableton Live (session/arrangement view); Temporal Web UI (workflow history,
timeline de eventos); Airflow/Prefect DAG views; Figma (zoom infinito con profundidad progresiva
de frame a componente a capa).

### 2.3 — Progresión de cuatro niveles: experiencia, operación, inspección, arquitectura

El documento fija explícitamente estos cuatro niveles como principio de diseño.

Preguntas a responder:
- ¿Qué herramientas ya resuelven bien una progresión de 3-4 niveles de profundidad técnica sin
  duplicar la interfaz por audiencia (una UI para "vibe coders", otra para ingenieros)?
- ¿Cómo maneja Kubernetes (via Lens, K9s, o el Dashboard oficial) la progresión desde "estado
  general del cluster" hasta "logs de un pod específico" sin perder al usuario en el camino?
- ¿Cómo resuelve VS Code la progresión de explorer de archivos → contenido de archivo → símbolo
  puntual → definición, manteniendo siempre visible "dónde estoy"?
- ¿Qué patrones de *breadcrumb* o *contexto persistente* usan estas herramientas para que bajar de
  nivel nunca se sienta como "salir" de la vista principal?

Fuentes sugeridas: Kubernetes Lens / K9s / Dashboard; VS Code (explorer, breadcrumbs, go-to-definition);
Datadog (dashboard → servicio → traza → span individual) como precedente de observability con
profundidad progresiva real en producción.

### 2.4 — Representación de continuidad a través de modelos/agentes intercambiables

El documento pide que cambiar de modelo (Claude → local → Codex → Gemini) sea visualmente
irrelevante para la continuidad del proyecto.

Preguntas a responder:
- ¿Existe precedente de una interfaz que muestre explícitamente "quién/qué ejecutó cada parte del
  trabajo" (distintos workers, runners o agentes) sin que el cambio de ejecutor rompa la narrativa
  de que es un solo proceso continuo?
- ¿Cómo manejan los sistemas de CI/CD (GitHub Actions, GitLab CI) el historial de un pipeline
  cuando corre en runners distintos, o cuando cambia la versión del runner entre ejecuciones —
  hay algo trasladable a "mostrar el modelo como recurso que entra y sale, no como dueño del
  trabajo"?
- ¿Cómo representan las herramientas de control de versiones distribuido (git blame, git log
  --graph) la continuidad de una línea de trabajo a través de múltiples autores sin fragmentar la
  narrativa en "sesiones" separadas?

Fuentes sugeridas: GitHub Actions / GitLab CI (historial de pipeline con runners variables); git
log --graph y blame view como precedente de continuidad narrativa multi-autor; Temporal (
continuidad de un Workflow a través de múltiples Worker deployments, ya parcialmente relevado en
el brief de identidad de agente).

### 2.5 — Visualización de reputación / criterio acumulado (Wisdom)

El documento pide explícitamente evitar "un único score" y en cambio mostrar dimensiones
múltiples (persistencia, reutilización, impacto, alcance, transferibilidad, adopción, evidencia,
originalidad).

Preguntas a responder:
- ¿Cómo visualiza Stack Overflow la reputación evitando que se lea solo como "un número" — qué
  falla ahí que el documento fuente quiere evitar explícitamente, y qué sí funciona?
- ¿Qué patrones de visualización multi-dimensional (radar charts, badges por categoría, grafos de
  citación) existen para mostrar valor acumulado sin reducirlo a un ranking lineal?
- ¿Cómo maneja un grafo de citas de patentes o papers académicos (impacto + alcance +
  transferibilidad fuera del contexto original) la evidencia de que una idea generó valor en
  lugares que el autor original ni conoce? Es conceptualmente cercano a "Wisdom aplicado en otro
  proyecto".
- ¿Existen precedentes de mercados de reputación profesional portable (no atada a una sola
  plataforma o empleador) que ya hayan intentado y fallado o tenido éxito en convertir reputación
  en algo con valor económico?

Fuentes sugeridas: Stack Overflow reputation system (y sus críticas documentadas); GitHub
contribution graph y su recepción crítica (over-simplificación de "cuadraditos verdes"); grafos de
citación académica (Google Scholar, Semantic Scholar) como precedente de impacto multi-dimensional;
LinkedIn Skill Endorsements como precedente de reputación fragmentada que no logró credibilidad
fuerte — vale la pena entender por qué, para no repetir el mismo error con Wisdom.

### 2.6 — Diseño "protagonista" vs. diseño "panel de observación"

Preguntas a responder:
- ¿Qué diferencia estructural (no solo estética) hay entre una interfaz que se siente "panel que
  miro" y una que se siente "instrumento que opero"? El documento fuente es explícito: el Paladín
  no es un espectador.
- ¿Cómo resuelven los juegos con cámara en primera persona vs. tercera persona esta sensación de
  agencia, y hay algo trasladable a una interfaz de trabajo (no de entretenimiento)?
- ¿Qué rol cumple la latencia percibida entre "intervengo" y "veo el efecto" en la sensación de
  soberanía? (conecta directo con la definición ya fijada de Control: *"entender + intervenir +
  modificar trayectoria + observar el efecto de esa intervención"*).

Fuentes sugeridas: literatura de *agency* en HCI (human-computer interaction) sobre percepción de
control directo vs. control mediado; diseño de feedback loops en juegos (principio de "juicy
feedback" en game design) aplicado a herramientas de productividad, no solo entretenimiento.

---

## 3. Criterios de evaluación para lo que se traiga de vuelta

Cualquier patrón relevado se evalúa contra los principios ya fijados por el documento fuente, no
al revés:

1. **La complejidad existe, pero no se impone** — ningún patrón que exija que el usuario vea la
   arquitectura completa para poder operar es aceptable, aunque sea estándar de industria.
2. **Cuatro niveles de profundidad, no una interfaz por audiencia** — un patrón que resuelva
   profundidad duplicando la UI para distintos perfiles de usuario no aplica tal cual.
3. **El Paladín es protagonista, no operador de un panel** — cualquier patrón que se apoye en
   sensación de "estoy mirando un sistema" en vez de "estoy parado dentro de él" necesita
   adaptación, no adopción directa.
4. **Continuidad del proyecto por sobre el modelo/ejecutor** — un patrón trasladable no puede
   organizar la interfaz alrededor de "qué modelo hizo esto", sino alrededor de "qué decidió el
   Paladín y qué permanece".
5. **Wisdom no es gamificación vacía** — descartar cualquier patrón de reputación que se reduzca,
   en la práctica, a un solo número o ranking lineal, aunque sea el más simple de implementar.
6. **Tres niveles (Constellation, Orbital, Gravity), no dos** — cualquier patrón que solo resuelva
   la relación grafo-superior/grafo-inferior sin dar lugar a Gravity como capa normativa
   transversal a ambos queda incompleto, aunque resuelva bien la navegación jerárquica en sí.

---

## 4. Formato de entrega esperado

Por cada línea (2.0 a 2.6): 3–5 patrones relevados, cada uno con (a) qué problema resuelve en su
dominio original, (b) qué pieza es trasladable a Orrery, (c) qué pieza no aplica por chocar con la
sección 3. Cierre con una recomendación de una línea por sección, y al final una toma de posición
explícita sobre las tres tensiones de la sección 0 (la de Constellation/Orbital/Gravity primero,
por ser la de mayor prioridad) — no dejarlas abiertas otra vez, el research tiene que aportar
evidencia suficiente para inclinar la balanza en al menos una dirección en cada una.

**No se espera** un mockup ni un sistema de diseño — se espera claridad conceptual sobre qué
familia de interacción (mission control, DAW, orquestador de workflows, juego, plataforma de
reputación) resuelve mejor cada pilar, para que el siguiente documento sea ya una spec de
interacción, no una exploración.

---

## 5. Qué NO resuelve este brief

No decide el stack de rendering (SVG, WebGL, Canvas). No define componentes ni layout. No
resuelve las dos tensiones de la sección 0 por sí solo — las plantea para que el research las
conteste con evidencia. No reabre ninguna decisión ya cerrada en los documentos de identidad de
agente (`Orbital_Spec_...`) ni en el brief de Organizaciones — si algo de acá tensiona con esos
documentos, se documenta como hallazgo nuevo, no se resuelve en este mismo texto.
