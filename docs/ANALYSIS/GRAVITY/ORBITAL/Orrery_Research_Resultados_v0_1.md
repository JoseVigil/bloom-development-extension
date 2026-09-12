# Research de Usabilidad para Orrery — Resultados

**Tipo:** Entrega de investigación [R], ejecutada según `Cowork_Instrucciones_Lanzamiento_Research_Orrery.md`.
**Insumos leídos:** `Glosario_Contexto_Cognituum_para_Cowork.md`, `Orrery_Research_Brief_Interfaz_Principal_v0_1.md`.
**Fecha:** 2026-09-12.
**Alcance:** casos reales de UX/UI/HCI para las 7 líneas de investigación (secciones 2.0 a 2.6 del
brief), con prioridad en la sección 2.0. No incluye wireframes, mockups, ni recomendaciones de
librería/framework/stack de rendering. Los principios de diseño ya fijados (sección 2 del
glosario) se toman como restricción dada, no se cuestionan.

---

## 2.0 — Jerarquía multi-escala completa: Constellation → Orbital → Gravity (prioridad)

### 1. Zoom semántico en cartografía digital (Google Maps)

- **Qué es:** el sistema de "level of detail" de Google Maps, donde cada nivel de zoom tiene su
  propio conjunto de reglas de qué mostrar. [Prototyping a Smoother Map (Google Design)](https://medium.com/google-design/google-maps-cb0326d165f5).
- **Qué problema resuelve:** evita mostrar toda la información geográfica de una vez. En zoom 0-5
  se ven continentes; en zoom 10, ciudades; en zoom 15, calles; en zoom 20, edificios individuales.
  Un equipo dedicado balancea qué etiquetas y features aparecen en cada nivel.
- **Visual concreto:** la transición entre niveles usa *cross-fading* de opacidad entre tiles de
  zooms adyacentes (blending matemático en potencias de 2), de modo que el cambio de detalle se
  percibe continuo, nunca como un salto brusco de pantalla.
- **Trasladable a Orrery:** el principio "cada nivel de zoom tiene sus propias reglas de qué
  mostrar, el detalle depende del zoom y no de un cambio de pantalla" es exactamente lo que 2.0
  pide para pasar de Constellation a Orbital. Mapea directo al principio "la complejidad existe
  pero no se impone" (glosario §2).
- **Qué NO aplica:** el *blending* de tiles es una técnica de interpolación de imágenes
  rasterizadas sobre una superficie geográfica continua. Orrery no tiene una superficie continua
  entre Constellation y Orbital — tiene una jerarquía discreta de grafos (un Mandate es un nodo,
  no una porción de territorio) — así que la transición necesita otra técnica (morphing de
  nodo-a-grafo-interno), no blending de tiles.
- **Recomendación:** adoptar "detalle dependiente del nivel de zoom, con reglas propias por
  nivel"; descartar el mecanismo de blending de tiles en sí.

### 2. Grafo interactivo de dependencias con nodos compuestos (Nx)

- **Qué es:** el visualizador de grafos de Nx (`nx graph`), con foco en un proyecto, trazado de
  cadena de dependencia entre dos proyectos, y "composite nodes" expandibles.
  [Explore your Workspace — Nx](https://nx.dev/docs/features/explore-graph).
- **Qué problema resuelve:** en un monorepo con cientos de proyectos, permite enfocar uno puntual,
  trazar la dependencia entre dos eligiendo un Start/End, y agrupar proyectos de la misma carpeta
  en un nodo compuesto que se expande *in situ* para revelar los proyectos individuales.
- **Visual concreto:** un nodo compuesto representa un conjunto de proyectos de una carpeta;
  clic en una línea de dependencia revela qué archivo generó esa dependencia.
- **Trasladable a Orrery:** el patrón de "nodo compuesto expandible in situ" es casi literal para
  lo que pide 2.0: un Mandate dentro de Constellation puede comportarse como un nodo compuesto que
  se expande para revelar su Orbital interno sin cambiar de pantalla. El "trace path" responde
  directo a qué depende de qué.
- **Qué NO aplica:** el grafo de Nx es puramente estructural (dependencias de build), sin ninguna
  capa normativa transversal — no tiene equivalente a Gravity actuando sobre el grafo. Ese vacío
  es justo lo que el criterio 6 de la sección 3 del brief marca como incompleto en cualquier
  herramienta de este tipo.
- **Recomendación:** adoptar el nodo compuesto expandible in situ + trace-path para
  Constellation→Orbital; la capa de Gravity queda sin resolver por esta vía y se cubre con el
  patrón 4 (overlays GIS) más abajo.

### 3. `terraform graph` — lectura de paralelismo por ausencia de arco

- **Qué es:** comando de Terraform que emite un grafo en formato DOT/Graphviz de dependencias
  entre recursos. [Terraform Graph: Visualizing Resource Dependencies](https://oneuptime.com/blog/post/2026-02-23-how-to-use-terraform-graph-to-visualize-resource-dependencies/view).
- **Qué problema resuelve:** mostrar qué recursos se crean antes que otros y cuáles no tienen
  relación de dependencia entre sí (paralelizables).
- **Visual concreto:** recursos sin flechas salientes se resuelven primero; un recurso como una
  VPC actúa como nodo base con múltiples flechas apuntando hacia él — de un vistazo se ve el
  efecto cascada de eliminarlo.
- **Trasladable a Orrery:** el criterio visual "sin arco entre dos nodos = paralelizable" responde
  de forma simple y directa a qué corre en paralelo vs. secuencial en Constellation.
- **Qué NO aplica:** es una vista estática generada una vez, no navegable en vivo ni con niveles de
  zoom — no resuelve por sí sola ni el grafo anidado navegable ni la escala (cientos de Mandates
  volviéndose ilegibles).
- **Recomendación:** tomar la regla de lectura (ausencia de arco = paralelismo posible), no el
  mecanismo de generación estática de Terraform.

### 4. Overlays operacionales en SIG (ArcGIS)

- **Qué es:** principios de diseño de "operational overlays" sobre un basemap en sistemas de
  información geográfica. [Designing operational overlays — Esri ArcGIS Blog](https://www.esri.com/arcgis-blog/products/product/mapping/designing-operational-overlays-for-the-arcmap-and-arcgis-online-basemaps).
- **Qué problema resuelve:** mostrar datos operativos (tráfico, eventos) sobre un mapa base sin
  alterar su geometría, con cada capa como servicio independiente activable/desactivable.
- **Visual concreto:** el basemap usa colores menos saturados y texto gris oscuro; el overlay usa
  colores más saturados, texto negro y símbolos con contorno ("cased symbols") más grandes de lo
  normal para distinguirse sobre cualquier fondo — todo mediante "representaciones cartográficas"
  que cambian solo apariencia, nunca la geometría subyacente.
- **Trasladable a Orrery:** es el precedente más directo para "una capa que actúa sobre un grafo
  sin ser un nodo más del grafo". Gravity puede tratarse como un overlay de tráfico: independiente,
  activable/desactivable, con paleta propia más contrastante, que nunca reescribe la topología de
  Constellation/Orbital debajo.
- **Qué NO aplica:** en SIG todos los overlays comparten la misma naturaleza espacial; Gravity no
  es geográfico, es normativo — "qué Postura aplica acá" requiere una interacción explícita (clic)
  que un overlay de tráfico no necesita, porque el tráfico se lee de un vistazo sin interacción.
- **Recomendación:** adoptar el contraste visual (saturación/contorno) y la independencia de
  activación como capa; no adoptar la lectura pasiva-sin-interacción.

### 5. Clustering algorítmico en grafos de red grandes (Gephi/Cytoscape)

- **Qué es:** algoritmos de clustering (Louvain, Girvan-Newman) y *edge bundling* en herramientas
  de análisis de redes a gran escala. [Exploring Graph Algorithms Visualization — Tom Sawyer](https://blog.tomsawyer.com/exploring-graph-algorithms-visualization).
- **Qué problema resuelve:** cuando un grafo tiene demasiados nodos para leerse de una vez, agrupa
  nodos relacionados en comunidades y reduce el cruce visual de líneas, preservando la topología
  completa sin exigir leerla toda de una vez.
- **Visual concreto:** nodos coloreados por comunidad detectada algorítmicamente; líneas agrupadas
  en troncos en vez de cruzarse individualmente; zoom interactivo de vista general a detalle.
- **Trasladable a Orrery:** responde directo a cómo evitar que Constellation con decenas de
  Mandates se vuelva ilegible — clustering por relación (Mandates del mismo propósito mayor) más
  atenuación de lo no relevante al momento actual.
- **Qué NO aplica:** el clustering algorítmico (Louvain) agrupa por métrica de modularidad de
  grafo, no por relevancia al momento presente del Paladín. Orrery necesita que la atenuación
  responda a "qué es relevante ahora" (principio "Paladín protagonista"), no a una métrica
  estructural ciega calculada offline.
- **Recomendación:** tomar el principio de agrupar/atenuar preservando topología completa, pero
  basar el criterio de agrupamiento en relevancia al turno actual, no en modularidad genérica.

**Recomendación de la sección:** ningún precedente relevado resuelve las tres capas juntas — la
síntesis recomendada es "nodo compuesto expandible in situ con zoom semántico dependiente de
nivel" (Nx + Google Maps) para Constellation↔Orbital, con Gravity resuelta como overlay
independiente al estilo GIS, nunca como un tercer grafo.

---

## 2.1 — Interfaces de control cinemático / centro de mando

### 1. Apollo Mission Control — consolas especializadas por dominio

- **Qué es:** la sala de control de la misión Apollo (MOCR), con consolas dedicadas por dominio.
  [Apollo Flight Controller 101](https://tagteam.harvard.edu/hub_feeds/1804/feed_items/54138).
- **Qué problema resuelve:** distribuye un volumen de información inmanejable para una sola
  persona entre especialistas — "cada estación manejaba un grupo específico y relacionado de
  funciones: unas vigilaban el hardware de la nave, otras el software, otras su posición en el
  espacio, otras a la tripulación" — mientras el Flight Director mantiene la síntesis global.
- **Visual concreto:** filas de consolas físicas, cada una con paneles propios, orientadas hacia
  una pantalla central compartida con el estado de la misión.
- **Trasladable a Orrery:** el principio "cada consola ve solo su dominio, una persona sintetiza
  el todo" es antecedente fuerte para separar la vista de Orbital de un Mandate puntual (consola
  especializada) de la vista de Constellation (posición del Flight Director).
- **Qué NO aplica:** el reparto de consolas depende de tener múltiples humanos simultáneos; Orrery
  tiene un solo Paladín por sesión, así que la división de trabajo entre personas no se traslada
  tal cual, solo el principio de alcance acotado por vista.
- **Recomendación:** usar la separación de alcance (dominio acotado vs. síntesis global) como dos
  modos de una misma interfaz operados por la misma persona, no como paneles permanentes separados.

### 2. Diseño de cámara en juegos RTS (StarCraft II vs. Supreme Commander 2)

- **Qué es:** análisis de diseño de cámara en juegos de estrategia en tiempo real. [Analysis: Wide
  Angle Lens — RTS Camera Angles and Design Decisions (Game Developer)](https://www.gamedeveloper.com/design/analysis-wide-angle-lens---rts-camera-angles-and-design-decisions).
- **Qué problema resuelve:** la tensión entre "intimidad" (conexión con unidades individuales) y
  "sentido estratégico" (vista de dios). StarCraft II restringe el zoom para preservar intimidad;
  Supreme Commander 2 permite zoom extremo a vista satelital con unidades reducidas a símbolos
  NATO abstractos para panorama total.
- **Visual concreto:** en Supreme Commander 2, unidades como íconos NATO abstractos en la vista
  más alejada; en StarCraft II la cámara nunca se aleja lo suficiente para perder el detalle de
  las unidades.
- **Trasladable a Orrery:** el hallazgo clave es que sostener el zoom amplio requiere "mejor
  pathfinding, comandos de attack-move, cualquier cosa que deje al jugador mirar el panorama" — es
  decir, que Orbital siga operando con autonomía razonable bajo Capability Seam cuando el Paladín
  está zoomeado en Constellation, sin exigirle bajar al detalle para que las cosas avancen.
- **Qué NO aplica:** la abstracción a íconos NATO sacrifica intencionalmente el detalle de la
  unidad individual. En Orrery eso equivaldría a perder de vista si un Mandate puntual requiere
  intervención humana — choca con fail-closed, que no puede permitir que una alerta quede oculta
  solo porque el Paladín está zoomeado afuera.
- **Recomendación:** adoptar el requisito de autonomía-bajo-zoom-amplio, pero una alerta que
  requiere intervención debe atravesar el nivel de zoom (notificación), nunca quedar oculta por la
  abstracción visual del nivel alejado.

### 3. Bloomberg Terminal — control por densidad, no por simplificación

- **Qué es:** terminal financiero de alta densidad informativa. [Designing for Cognition: The
  Enduring Value of High-Information-Density Interfaces](https://www.lippihom.com/blog/designing-for-cognition-the-enduring-value-of-high-information-density-interfaces).
- **Qué problema resuelve:** mostrar mucha información a usuarios expertos sin simplificarla,
  confiando en que la familiaridad genera velocidad y sensación de dominio, no de agobio — "la
  gente que realmente hace cosas con el software suele preferir ver más, no menos".
- **Visual concreto:** tablas en vez de tarjetas, texto en vez de íconos, layout fijo y
  predecible ("una vez que lo aprendés, se queda aprendido, sin sorpresas"), navegación por
  teclado, mínimo de animaciones y gradientes.
- **Trasladable a Orrery:** el principio "no simplificar para el experto, dar layout fijo y
  predecible" responde a la mitad-ingeniero del principio "la complejidad existe pero no se
  impone" — el nivel de mayor detalle (Orbital/Intent) puede permitirse densidad tipo terminal
  para quien opera ahí.
- **Qué NO aplica:** Bloomberg Terminal no tiene una versión "de un vistazo" para el usuario común
  — es alta densidad todo el tiempo, para todos los usuarios. Aplicado sin distinción de perfil
  chocaría directo con "la complejidad existe pero no se impone".
- **Recomendación:** reservar la densidad tipo terminal para el nivel de mayor detalle, nunca como
  vista por defecto.

### 4. Separación HUD / MFD en cabinas de avión

- **Qué es:** la separación entre el Head-Up Display (información crítica proyectada sobre el
  parabrisas) y los Multi-Function Displays de cabina (navegación, motores, radar, a demanda).
  [How It Works: Head-Up Display (Flying Mag)](https://www.flyingmag.com/how-it-works-head-up-display/);
  [Primary flight display (Wikipedia)](https://en.wikipedia.org/wiki/Primary_flight_display).
- **Qué problema resuelve:** separar información ambiental permanente (actitud, velocidad,
  altitud — siempre visible, baja densidad, consumible sin dejar de mirar afuera) de información
  de intervención (se consulta activamente cuando hace falta decidir algo).
- **Visual concreto:** el HUD superpone símbolos mínimos (horizonte artificial, velocidad,
  altitud) directamente sobre la vista frontal real; los MFD son pantallas separadas que el piloto
  consulta deliberadamente cuando necesita un dato puntual.
- **Trasladable a Orrery:** es el precedente más limpio para el mismo problema que 2.1 plantea
  explícitamente ("información ambiental siempre visible, de baja densidad" vs. "información de
  intervención que aparece solo cuando hace falta decidir"). El breadcrumb de Gravity ya
  prototipado en el proyecto (`Paladin_UX_Postura_Gravity_Masa_Spec_v0_1.md`) es funcionalmente un
  HUD; el detalle de un Mandate puntual es el MFD.
- **Qué NO aplica:** el HUD depende de que haya una sola cosa crítica y sin ambigüedad para
  mostrar; Orrery puede tener varias Posturas activas simultáneamente en un turno, lo que no cabe
  en un HUD de una sola línea sin agruparlas (ya resuelto en el patrón de breadcrumb
  compacto/expandido del documento citado).
- **Recomendación:** formalizar la distinción HUD (ambiental, permanente) / MFD (bajo demanda)
  como principio explícito de qué vive siempre en pantalla vs. qué se abre a pedido.

**Recomendación de la sección:** adoptar la separación HUD/MFD como principio rector de qué es
ambiental vs. de intervención, y el requisito de autonomía-bajo-zoom-amplio de los RTS para que
Orbital siga operando cuando el Paladín está en modo Constellation.

---

## 2.2 — Timeline multipista vs. vista orbital: reconciliar las dos metáforas

### 1. Ableton Live — Session View vs. Arrangement View

- **Qué es:** dos vistas de un mismo proyecto de audio: Session (grid no lineal, clips en loop) y
  Arrangement (timeline lineal). [Ableton Live: Session & Arrangement Views (Sound on Sound)](https://www.soundonsound.com/techniques/ableton-live-session-arrangement-views).
- **Qué problema resuelve:** da soporte simultáneo a procesos que no avanzan linealmente (loops
  que orbitan) y procesos con secuencia temporal (una toma grabada), sin que se sientan dos
  productos distintos — "la belleza del split brain de Live es cómo las pistas de Session y
  Arrangement se comparten".
- **Visual concreto:** tracks compartidos entre ambas vistas, alternables entre modo "clip
  launching" (orbital) y "track playback" (lineal); se puede arrastrar un clip de una vista a la
  otra o grabar una interpretación de Session directamente en el Arrangement.
- **Trasladable a Orrery:** es la evidencia más directa de que "misma unidad de datos, dos
  geometrías de visualización" es viable en un producto maduro. La vista de Constellation
  (secuencia, dependencias) puede ser la "Arrangement", mientras el Orbital en ejecución (intents
  orbitando dentro de un Mandate activo) es la "Session".
- **Qué NO aplica:** en Ableton la elección de vista es una preferencia de flujo de trabajo sin
  jerarquía entre ambas (ninguna vista contiene a la otra); en Orrery, Constellation sí es
  jerárquicamente superior a Orbital. Adoptar el patrón tal cual aplanaría una jerarquía real que
  el glosario fija como de tres niveles, no dos vistas paralelas del mismo nivel.
- **Recomendación:** tomar "misma unidad, dos geometrías" como técnica, manteniendo la jerarquía
  explícita entre Constellation y Orbital que Ableton no necesita.

### 2. Temporal — Timeline View de ejecución de Workflow

- **Qué es:** vista de eventos de ejecución de un Workflow en Temporal. [Let's visualize a
  workflow (Temporal Blog)](https://temporal.io/blog/lets-visualize-a-workflow).
- **Qué problema resuelve:** muestra la ejecución completa de un proceso de larga duración,
  agrupando eventos relacionados (scheduled/started/completed de una misma actividad) en una sola
  fila, distinguiendo qué corrió en paralelo (posición vertical simultánea) de qué corrió en
  secuencia (izquierda a derecha), con una fila superior que da el contexto de duración total.
- **Visual concreto:** fila superior = ejecución completa del Workflow con su duración total;
  filas debajo = actividades individuales coloreadas verde (completado) o rojo (falla); zoom con
  límite para no perder orientación, botón "Fit" para volver a la vista inicial.
- **Trasladable a Orrery:** resuelve casi exactamente lo que pide 2.2 para Mandate-dentro-de-
  Constellation: una fila de contexto total (el Mandate) con las ejecuciones (intents/turnos)
  debajo, sin perder la noción de "cuánto dura esto en total" mientras se inspeccionan eventos
  puntuales.
- **Qué NO aplica:** Temporal es un orquestador de un solo nivel de anidamiento (Workflow →
  Activities); no tiene un tercer nivel superior (Constellation) ni una capa normativa
  transversal (Gravity) — resuelve bien 2 de los 3 niveles que pide el brief.
- **Recomendación:** adoptar "fila de contexto total + filas de detalle con codificación de
  paralelismo por posición" para la vista de un Mandate y su Orbital interno.

### 3. Airflow — Grid View / Graph View / Gantt Chart

- **Qué es:** las tres vistas complementarias de Apache Airflow para un DAG. [An introduction to
  the Airflow UI (Astronomer)](https://www.astronomer.io/docs/learn/airflow-ui/).
- **Qué problema resuelve:** separa tres preguntas distintas — ¿qué patrón hay a través de
  múltiples ejecuciones? (Grid: columnas = corridas, filas = tareas, coloreadas por estado);
  ¿cuál es la estructura de dependencias? (Graph); ¿dónde estuvieron los cuellos de botella de
  tiempo? (Gantt, con paralelismo visible en el eje temporal) — y permite bajar de cualquiera de
  las tres directo a los logs de una tarea puntual con un clic.
- **Visual concreto:** Grid view como cuadrícula de cuadraditos coloreados por estado (una corrida
  por columna); Gantt con barras horizontales cuyo solapamiento en el eje temporal indica
  ejecución en paralelo.
- **Trasladable a Orrery:** la coexistencia de tres vistas explícitas del mismo objeto (histórico
  agregado / estructura / tiempo), navegables con un clic sin perder el objeto seleccionado, es el
  precedente más fuerte a favor de "contenedor de varias vistas" para la pregunta 2 de la sección
  3 del glosario.
- **Qué NO aplica:** cada vista de Airflow es una pantalla separada con su propio layout, sin zoom
  continuo entre ellas — es evidencia a favor de vistas separadas explícitas, no de una vista
  única con zoom semántico. Dato relevante para la toma de posición final (sección 4).
- **Recomendación:** usar Grid+Graph+Gantt como prueba de que "varias vistas explícitas del mismo
  objeto" es un patrón maduro y probado en producción, no una solución de compromiso.

### 4. Figma — canvas infinito con profundidad progresiva

- **Qué es:** el canvas de zoom infinito de Figma, donde frames contienen componentes con
  instancias anidadas y capas. [Adjust your zoom and view options (Figma Help)](https://help.figma.com/hc/en-us/articles/360041065034-Adjust-your-zoom-and-view-options).
- **Qué problema resuelve:** permite que un mismo espacio visual continuo represente tanto la
  vista de conjunto (todos los frames de un proyecto) como el detalle interno de un componente,
  con el zoom como único mecanismo de transición.
- **Visual concreto:** hacer zoom hacia un frame revela sus capas hijas sin cambiar de "modo"; los
  componentes anidados se editan in situ sin abrir una ventana nueva.
- **Trasladable a Orrery:** es el ejemplo más fuerte a favor de la "vista continua con zoom
  semántico" — un mismo lienzo, sin cambio de pantalla, para pasar de conjunto a detalle.
- **Qué NO aplica:** en Figma todos los niveles son geométricamente iguales (frames dentro de
  frames); Constellation/Orbital/Gravity son conceptualmente distintos (grafo de orquestación,
  grafo de ejecución, capa normativa) — forzarlos a la misma geometría de "rectángulos anidados"
  simplificaría de más una diferencia real, riesgo que marca el criterio 6 de la sección 3.
- **Recomendación:** tomar el zoom continuo como mecanismo de transición entre Constellation y
  Orbital (estructuralmente afines, ambos grafos), sin forzar a Gravity dentro de la misma
  geometría de zoom.

**Recomendación de la sección:** el peso de la evidencia recolectada (Airflow con 3 vistas
separadas + Ableton con 2 vistas explícitas de la misma unidad de datos) es más fuerte que el de
una sola vista continua para todo (Figma, Temporal): Constellation/Orbital como zoom continuo
(precedente Nx + Figma + Temporal), Gravity como vista/capa separada activable (precedente
Airflow multi-vista + overlay GIS de 2.0).

---

## 2.3 — Progresión de cuatro niveles: experiencia, operación, inspección, arquitectura

### 1. Kubernetes Lens — overlay lateral no destructivo

- **Qué es:** cliente de escritorio para clusters de Kubernetes. [Manage your Kubernetes cluster
  with Lens (Opensource.com)](https://opensource.com/article/20/6/kubernetes-lens).
- **Qué problema resuelve:** bajar de "todo el cluster" a "logs de un pod específico" pasando por
  categorías de objetos (pods/deployments, daemon sets, etc.), tipo de workload y objeto
  individual, sin abrir una ventana nueva cada vez.
- **Visual concreto:** al seleccionar un objeto, el detalle "se desliza desde la derecha en una
  ventana superpuesta" (overlay), preservando visible la lista de la que salió.
- **Trasladable a Orrery:** el overlay lateral no destructivo es candidato directo para inspeccionar
  un Intent puntual sin perder de vista el Orbital completo del Mandate — responde bien a "bajar
  de nivel nunca se siente como salir de la vista principal".
- **Qué NO aplica:** Lens no separa "para quién es cada nivel" — todos usan la misma densidad de
  información técnica (namespaces, YAML), sin distinguir usuario común de ingeniero. Está
  diseñado íntegramente para perfil técnico.
- **Recomendación:** adoptar el overlay lateral no destructivo como mecanismo de inspección, no la
  densidad de información pareja de Lens.

### 2. VS Code — Breadcrumbs

- **Qué es:** barra de migas de pan sobre el editor de código. [VS Code Breadcrumbs Are Here](https://dev.to/vscode/vscode-breadcrumbs-are-here-jkn).
- **Qué problema resuelve:** mantiene visible en todo momento la posición exacta del usuario en la
  jerarquía (carpeta → archivo → símbolo), navegable con teclado entre niveles, sin depender del
  panel lateral.
- **Visual concreto:** barra horizontal fina, siempre presente arriba del contenido, con
  separadores entre cada nivel; clic en cualquier segmento salta directo a ese nivel.
- **Trasladable a Orrery:** precedente directo para el "breadcrumb de escala" que siempre indica si
  el Paladín está en Constellation, en un Mandate o en un Intent — el proyecto ya tiene un patrón
  de breadcrumb para Gravity (`Paladin_UX_Postura_Gravity_Masa_Spec_v0_1.md`); este caso es
  evidencia externa de que el mismo mecanismo generaliza bien a jerarquías de código.
- **Qué NO aplica:** el breadcrumb de VS Code es puramente posicional (dónde estoy), no indica
  autoridad ni estado — no distingue "este nivel tiene una alerta pendiente" de "este nivel está
  tranquilo". Orrery necesita que el breadcrumb también cargue señal de estado/urgencia.
- **Recomendación:** adoptar el breadcrumb persistente y clickeable como mínimo indispensable,
  sumándole codificación de estado (color/ícono) que VS Code no necesita.

### 3. Datadog — Trace View (flame graph / waterfall) con "focus" no destructivo

- **Qué es:** vista de trazas distribuidas de Datadog APM. [Trace View (Datadog Docs)](https://docs.datadoghq.com/tracing/trace_explorer/trace_view/).
- **Qué problema resuelve:** bajar de un dashboard de servicio a una traza puntual y de ahí a un
  span específico, sin perder la estructura completa — el "focus" en un span reduce lo mostrado
  pero nunca filtra ni altera los datos subyacentes.
- **Visual concreto:** flame graph con spans coloreados por servicio en un eje temporal, minimapa
  para saltar entre detalle y traza completa; "focus" que angosta la vista a un span y sus hijos
  sin descartar el resto.
- **Trasladable a Orrery:** el principio "focus cambia qué se muestra, nunca filtra ni altera lo
  subyacente" es la garantía que Orrery necesita para que "ver menos" en un nivel de zoom no
  implique "hay menos Mandates" — la topología completa de Constellation sigue existiendo aunque
  se esté mirando un solo Mandate.
- **Qué NO aplica:** el flame graph asume causalidad temporal estrictamente jerárquica (todo son
  hijos de un span padre); Constellation no es estrictamente un árbol — puede haber Mandates
  independientes sin relación padre-hijo, así que la geometría de flame graph no calza 1 a 1,
  aunque el principio de "focus no destructivo" sí.
- **Recomendación:** adoptar la garantía "focus no filtra ni altera lo subyacente" como principio
  de interacción, sin adoptar la geometría de flame graph tal cual.

**Recomendación de la sección:** combinar breadcrumb persistente con codificación de estado (VS
Code + el breadcrumb de Gravity ya prototipado) con overlay lateral no destructivo (Lens) y la
garantía de "focus no filtra la topología completa" (Datadog) para los cuatro niveles de
profundidad.

---

## 2.4 — Representación de continuidad a través de modelos/agentes intercambiables

### 1. Temporal Worker Versioning

- **Qué es:** mecanismo de Temporal para que un Workflow de larga duración siga ejecutando aunque
  cambie el código/versión del Worker. [Worker Versioning (Temporal Docs)](https://docs.temporal.io/production-deployment/worker-deployments/worker-versioning).
- **Qué problema resuelve:** separa la identidad del Workflow (qué se ejecuta, su historia) de qué
  Worker/versión lo ejecuta en cada momento — un Workflow "Pinned" se garantiza completo en una
  sola versión; uno "Auto-Upgrade" puede migrar de versión en marcha, mediante un Build ID propio
  por versión de Worker.
- **Visual concreto:** (no hay UI pública detallada) — la asociación Workflow↔versión es un
  metadato de arquitectura, invisible por diseño para el usuario final.
- **Trasladable a Orrery:** es el precedente conceptual más cercano a "el modelo entra y sale de la
  continuidad sin romperla" — la identidad persistente es el Mandate/Orbital, no el modelo
  (Claude/Codex/Gemini) que lo ejecutó en cada turno, igual que el Workflow de Temporal no es
  "propiedad" de ningún Worker.
- **Qué NO aplica:** Temporal no expone al usuario final una narrativa de "quién ejecutó qué" — es
  invisible por diseño. Orrery, en cambio, quiere mostrarle al Paladín qué modelo ejecutó cada
  Intent (transparencia), no ocultarlo — "continuidad por sobre el modelo" no es sinónimo de
  "ocultar qué modelo fue", y Temporal no separa esas dos cosas.
- **Recomendación:** tomar la separación identidad-de-proceso vs. identidad-de-ejecutor como
  arquitectura de datos, pero mostrar el ejecutor como metadato siempre visible, no oculto.

### 2. GitHub Actions — historial de workflow runs

- **Qué es:** registro de ejecuciones de un pipeline de CI/CD. [Viewing workflow run history
  (GitHub Docs)](https://docs.github.com/actions/managing-workflow-runs/viewing-workflow-run-history).
- **Qué problema resuelve:** acumula el historial de corridas de un mismo pipeline a través del
  tiempo, con logs por job y por step accesibles desde la misma pantalla.
- **Visual concreto:** lista de corridas con estado (verde/rojo/amarillo), navegable desde el
  resumen de la corrida hasta el log de un step puntual.
- **Trasladable a Orrery:** confirma el patrón mínimo esperable — el historial de ejecuciones de
  una misma unidad de trabajo (Mandate) se lee como una sola línea temporal.
- **Qué NO aplica:** no se encontró, en la documentación consultada, que la interfaz muestre el
  runner/infraestructura de ejecución como una entidad de primera clase y prominente en el
  historial — **no se encontró precedente claro** de que CI/CD haga visible el "recurso ejecutor"
  con el mismo nivel de detalle que necesitaría Orrery para mostrar qué modelo corrió cada turno.
- **Recomendación:** usar este caso solo para el patrón básico de "una lista temporal de corridas
  con drill-down a logs", no como evidencia de cómo mostrar el ejecutor.

### 3. `git log --graph` / `git blame`

- **Qué es:** visualización ASCII de historial de commits con ramas y merges; blame como
  atribución por línea. [Advanced Git Log (Atlassian)](https://www.atlassian.com/git/tutorials/git-log).
- **Qué problema resuelve:** representa a múltiples autores contribuyendo a una sola narrativa de
  proyecto continua, mostrando dónde converge el trabajo de cada uno sin fragmentar la historia en
  "sesiones" separadas por autor.
- **Visual concreto:** asteriscos marcan commits, líneas verticales marcan ramas, diagonales
  marcan puntos de merge — todo en una columna continua donde ramas de distintos autores conviven
  visualmente y convergen de vuelta a la rama principal.
- **Trasladable a Orrery:** precedente directo para "cambiar de modelo/agente no debe romper la
  narrativa de que es un solo proceso continuo" — el proyecto (rama principal) es el protagonista
  visual, los autores/agentes son atributos de cada commit, no organizadores de la vista.
- **Qué NO aplica:** `git blame` atribuye por línea de código, granularidad sin equivalente directo
  en Mandates/Intents (no hay "líneas" en un Mandate) — la analogía funciona a nivel de principio
  narrativo, no de mecanismo de atribución.
- **Recomendación:** adoptar "el proyecto es la columna vertebral visual, el modelo es un atributo
  del turno, nunca el organizador de la vista" como regla de diseño explícita.

**Recomendación de la sección:** usar `git log --graph` como modelo narrativo (proyecto = columna
vertebral, modelo = atributo visible por turno) combinado con la separación identidad-de-proceso /
identidad-de-ejecutor de Temporal Worker Versioning, mostrando siempre — nunca ocultando — qué
modelo ejecutó cada turno.

---

## 2.5 — Visualización de reputación / criterio acumulado (Wisdom)

### 1. Stack Overflow — reputación de un solo número (caso de advertencia)

- **Qué es:** sistema de puntos de reputación de Stack Overflow. [A Dusting of Gamification (Joel
  on Software)](https://www.joelonsoftware.com/2018/04/13/gamification/).
- **Qué problema resolvía en su dominio:** señalar quién tiene criterio validado por la comunidad,
  incentivando respuestas de calidad.
- **Qué falla, documentado:** el downvote se siente como "una cachetada" cuando el usuario no
  entiende o no está de acuerdo con el rechazo, generando impacto emocional asimétrico; el
  carácter competitivo hace la plataforma "menos inclusiva y acogedora para mucha gente", con
  efecto negativo particular en programadores subrepresentados; y el sistema "no puede lograr que
  la gente haga algo que de todos modos no le interesa hacer" — solo refuerza motivación
  preexistente, no la crea.
- **Visual concreto:** un número único de karma visible junto al nombre de usuario en cada
  respuesta.
- **Trasladable a Orrery:** es la advertencia empírica más fuerte a favor del principio ya fijado
  "Wisdom no es gamificación" — confirma con evidencia real que un número único genera efectos
  secundarios negativos (exclusión, desincentivo), no solo que sea reduccionista.
- **Qué NO aplica:** nada de este mecanismo es trasladable en positivo — es evidencia de qué NO
  hacer. Cualquier variante de "número único de karma" para Wisdom queda descartada.
- **Recomendación:** usar este caso exclusivamente como advertencia.

### 2. GitHub contribution graph — frecuencia confundida con valor (caso de advertencia)

- **Qué es:** la grilla de "cuadraditos verdes" de actividad de commits por día. [Your GitHub
  Contribution Graph Means Absolutely Nothing — And Here's Why](https://dev.to/sylwia-lask/your-github-contribution-graph-means-absolutely-nothing-and-heres-why-2kjc).
- **Qué problema resolvía en su dominio:** dar una señal rápida de actividad reciente en un
  perfil.
- **Qué falla, documentado:** mide frecuencia, no impacto ni calidad — la "paradoja de
  seniority" (un tech lead que hace code review y decisiones arquitectónicas genera menos commits
  que la gente que supervisa); ignora trabajo en repos privados; se puede gamear trivialmente
  (commits automáticos, backups diarios). Cita textual: "un contribution graph de GitHub no mide
  ni productividad, ni habilidad, ni compromiso como desarrollador" — es "un rastro, nunca el
  sistema".
- **Visual concreto:** grilla de 52×7 cuadrados coloreados por intensidad según cantidad de
  commits por día.
- **Trasladable a Orrery:** refuerza, con un segundo caso real, la misma advertencia que Stack
  Overflow — cualquier métrica leída como "más cuadraditos = mejor" termina gamificada y
  desconectada del valor real. Relevante para por qué Wisdom no puede reducirse ni siquiera a un
  gráfico de frecuencia (no solo a un número).
- **Qué NO aplica:** no hay pieza rescatable del mecanismo — está construido sobre el supuesto
  (frecuencia = valor) que el glosario prohíbe para Wisdom.
- **Recomendación:** descartar también cualquier variante de "mapa de calor de actividad" como
  proxy de Wisdom.

### 3. Grafos de citación académica (VOSviewer, CitNetExplorer, Semantic Scholar)

- **Qué es:** herramientas de visualización de redes de citación entre papers académicos.
  [Visualization Software — Measuring Your Scholarly Impact (Harvard Library)](https://guides.library.harvard.edu/c.php?g=311134&p=4423814).
- **Qué problema resuelve en su dominio:** muestra impacto, alcance y transferencia de una idea a
  través de redes de citación en vez de un solo score (como el h-index) — VOSviewer construye
  redes bibliométricas con minería de texto de términos relevantes; CitNetExplorer mapea
  relaciones de citación directamente importadas de Web of Science.
- **Visual concreto:** redes de nodos (papers) conectados por líneas de citación, con clusters
  temáticos visibles por color o posición espacial, en vez de una lista rankeada.
- **Trasladable a Orrery:** es el precedente positivo más fuerte para Wisdom — un caso real donde
  la industria académica ya reemplaza, parcialmente, el ranking lineal por redes que muestran
  impacto, alcance y transferibilidad fuera del contexto original, exactamente las dimensiones que
  el glosario pide (persistencia, reutilización, impacto, alcance, transferibilidad).
- **Qué NO aplica:** estas herramientas son de análisis retrospectivo para especialistas
  (bibliometristas), no pensadas para que un usuario no técnico las lea de un vistazo — chocan con
  "el usuario común entiende de un vistazo" si se trasplantan tal cual.
- **Recomendación:** adoptar la idea de "red de impacto por transferencia" en vez de score, con una
  capa de resumen legible para el Paladín no técnico encima de la red completa.

### 4. LinkedIn Skill Endorsements (caso de fracaso, con datos)

- **Qué es:** sistema de endoso de habilidades de un clic entre contactos de LinkedIn. [Why LinkedIn Endorsements Are Useless: The Data](https://interviewing.io/blog/linkedin-endorsements-useless);
  [Why LinkedIn endorsements are worthless (CBS News)](https://www.cbsnews.com/news/why-linkedin-endorsements-are-worthless/).
- **Qué problema intentaba resolver:** dar reputación profesional social, distribuida entre pares.
- **Por qué falló, con datos:** el lenguaje de programación más avalado coincidió con el lenguaje
  real de mejor desempeño en entrevistas solo ~50% de las veces; la correlación (R²) entre volumen
  de endorsements y habilidad técnica real fue, en palabras del análisis, "pésima"; tener o no
  tener endorsements no tuvo impacto estadístico significativo en el desempeño de entrevista.
  Causas de diseño: endoso de un clic sin fricción, sin verificación de experiencia real, sin
  contexto de la relación entre quien avala y quien es avalado.
- **Visual concreto:** lista de habilidades con contador y fotos de perfil de quienes avalaron,
  ordenada de mayor a menor cantidad.
- **Trasladable a Orrery:** advertencia complementaria — esta vez el fallo no es el número en sí,
  sino la falta de fricción y de contexto en cómo se genera el dato. Si Wisdom incluyera algún
  mecanismo de "avalar" el criterio de otro Paladín, el dato (~50% de correlación real) muestra
  que sin contexto de relación se vuelve ruido.
- **Qué NO aplica:** nada del mecanismo de endoso de un clic es rescatable.
- **Recomendación:** si Wisdom incluye algún aval entre Paladines, exigir contexto de relación y
  evidencia de uso real — nunca un botón de un clic sin fricción.

**Recomendación de la sección:** Wisdom debería visualizarse como red de transferencia (precedente
académico) con dimensiones múltiples visibles, nunca como número o heat-map de frecuencia
(evidencia negativa fuerte y consistente en tres casos distintos), y cualquier mecanismo social de
aval debe llevar fricción y contexto explícito para no repetir el fracaso de LinkedIn.

---

## 2.6 — Diseño "protagonista" vs. diseño "panel de observación"

### 1. Sentido de agencia y latencia acción-efecto (HCI)

- **Qué es:** línea de investigación en HCI/ciencia cognitiva sobre el "sentido de agencia" — la
  sensación subjetiva de "yo causé esto". [Sense of Agency and User Experience: Is There a Link?
  (ACM TOCHI)](https://dl.acm.org/doi/10.1145/3490493).
- **Qué problema estudia:** qué factores de una interfaz aumentan o reducen esa sensación. Es un
  hallazgo consistente y bien establecido en esta línea de investigación (estudios de "intentional
  binding") que la latencia entre una acción y su efecto percibido es uno de los factores más
  determinantes: a mayor demora, más se debilita la sensación de causalidad, incluso cuando el
  resultado final es idéntico.
- **Visual/experiencia concreta:** un usuario percibe el intervalo entre su acción y el efecto como
  más corto cuando siente que él lo causó directamente; esa compresión temporal se rompe al
  introducir demoras o intermediarios (automatización) entre la acción y el efecto.
- **Trasladable a Orrery:** es la base empírica directa de la definición de Control ya fijada por
  el documento fuente ("entender + intervenir + modificar trayectoria + observar el efecto de esa
  intervención") — confirma que la latencia entre que el Paladín interviene (ajusta una Postura,
  aprueba un Mandate) y ve el efecto reflejado en Orbital/Constellation no es un detalle técnico
  menor, es central a si la interfaz se siente protagonista o no.
- **Qué NO aplica:** buena parte de esta literatura mide agencia en tareas motoras simples de
  laboratorio (apretar un botón, ver una luz); Orrery involucra intervenciones de alto nivel cuyo
  efecto completo naturalmente toma minutos u horas — la latencia cero de los estudios de
  laboratorio no es alcanzable ni el estándar correcto.
- **Recomendación:** separar "confirmación inmediata de que la intervención fue recibida" (baja
  latencia, crítico) de "efecto completo visible" (puede tardar, pero debe poder rastrearse) como
  dos momentos distintos de feedback.

### 2. Cámara en primera vs. tercera persona en videojuegos

- **Qué es:** comparación de diseño de cámara subjetiva vs. objetiva. [The Unseen Hand: How Camera
  Design Shapes Player Experience (Wayline)](https://www.wayline.io/blog/camera-design-video-games-player-experience).
- **Qué problema resuelve en su dominio:** primera persona maximiza inmersión ("te volvés el
  personaje") pero sacrifica conciencia periférica, generando ansiedad; tercera persona da
  distancia para ver al propio personaje, sus animaciones y reacciones, lo cual paradójicamente
  "de golpe da una sensación de control" al permitir supervisar el propio estado mientras se
  decide.
- **Visual concreto:** en tercera persona el jugador ve a su propio avatar reaccionar (animaciones,
  daño visible) mientras planea el siguiente movimiento — ese "verse a uno mismo actuando" ancla
  la sensación de agencia, más que la inmersión sensorial pura.
- **Trasladable a Orrery:** evidencia a favor de que Orrery no necesita una metáfora de "primera
  persona" (Paladín viendo literalmente desde adentro de la arquitectura, sin distancia) para
  sentirse protagonista — la distancia moderada de tercera persona parece mejor para tareas donde
  hay que monitorear el propio estado y decidir, que es el caso de uso de Orrery.
- **Qué NO aplica:** la comparación asume un solo avatar controlable; Orrery no tiene avatar — el
  Paladín no controla un personaje, gobierna un sistema. La analogía aporta el principio (ver las
  consecuencias de las propias acciones reflejadas), no una metáfora de cámara literal.
- **Recomendación:** diseñar Orrery para que las intervenciones del Paladín se vean reflejadas
  visiblemente en el estado del sistema (como el propio avatar reaccionando), sin necesidad de una
  metáfora de cámara en primera persona.

### 3. "Juicy design" / effectance en videojuegos

- **Qué es:** marco de diseño de feedback multisensorial inmediato ante acciones del jugador.
  [How does Juicy Game Feedback Motivate? Testing Curiosity, Competence, and Effectance (CHI
  2024)](https://dl.acm.org/doi/fullHtml/10.1145/3613904.3642656); [Good Game Feel: An Empirically
  Grounded Framework for Juicy Design](https://dl.digra.org/index.php/dl/article/download/936/936/933).
- **Qué problema resuelve en su dominio:** genera "effectance" — la sensación de que la propia
  acción causó un efecto satisfactorio e inconfundible en el mundo — reforzando motivación
  intrínseca vía sensación de dominio/competencia. El framework insiste en que la retroalimentación
  debe ser "inequívoca" y "relevante" para las decisiones del jugador.
- **Visual concreto:** efectos en cascada al completar una acción, retroceso de arma exagerado,
  cambios de animación inmediatos, elementos ambientales que reaccionan como retroalimentación de
  fondo.
- **Trasladable a Orrery:** el principio de retroalimentación "inequívoca y relevante" es
  trasladable directo al momento en que el Paladín interviene sobre una Postura o aprueba un
  Mandate: la interfaz debería confirmar esa acción con una señal clara e inmediata, en vez de un
  cambio de estado silencioso que el Paladín tiene que ir a buscar.
- **Qué NO aplica:** el vocabulario visual "juicy" (partículas, sonido, exageración lúdica) es de
  entretenimiento — trasplantarlo literalmente a una herramienta de gobernanza de agentes de IA se
  sentiría fuera de tono, y podría minimizar la seriedad de decisiones con consecuencias reales
  (aprobar que un agente avance sin supervisión no debería sentirse "divertido" de aprobar).
- **Recomendación:** adoptar el principio de confirmación inequívoca e inmediata de cada
  intervención, sin adoptar el vocabulario visual lúdico del que se origina.

**Recomendación de la sección:** diseñar Orrery en torno a la reacción visible e inmediata del
sistema a cada intervención del Paladín (confirmación instantánea + efecto rastreable en el
tiempo), inspirado en el principio de agencia y de effectance, sin adoptar ni la metáfora de
cámara en primera persona ni el vocabulario visual lúdico de los videojuegos.

---

## 3. Toma de posición sobre las tres preguntas abiertas (glosario §3)

### Pregunta 1 (la más urgente): ¿vista continua con zoom semántico, o vistas separadas explícitas?

**Posición: mixta, según capa.** Constellation ↔ Orbital deberían navegarse como **una sola
jerarquía continua con zoom semántico** — son estructuralmente afines (ambos son grafos de
unidades de trabajo con dependencias), y hay tres precedentes convergentes que lo sostienen: el
nodo compuesto expandible in situ de Nx (§2.0.2), el zoom infinito de Figma (§2.2.4) y la fila de
contexto total de Temporal Timeline View (§2.2.2). Gravity, en cambio, debería ser **una capa/vista
separada, activable explícitamente**, nunca parte del mismo continuo de zoom — la evidencia más
fuerte es el patrón de overlay operacional en SIG (§2.0.4), reforzado por el hecho de que Airflow,
un orquestador maduro en producción, resuelve un problema análogo con vistas explícitas separadas
(Grid/Graph/Gantt, §2.2.3) en vez de un único continuo. El criterio 6 del brief (Gravity no es un
tercer grafo) es coherente con esta evidencia: forzar a Gravity dentro del mismo zoom continuo que
Constellation/Orbital repetiría el error que Figma comete al tratar niveles conceptualmente
distintos como si fueran la misma geometría (§2.2.4, "qué NO aplica").

### Pregunta 2: ¿una sola metáfora visual astronómica, o contenedor de vistas con distinta geometría?

**Posición: contenedor de vistas que comparten principios de interacción, no una sola geometría.**
La evidencia más fuerte en contra de una metáfora única es que los problemas de 2.1 a 2.6 mapean,
cada uno, a una familia de interacción distinta y ya resuelta en la industria: mission
control/HUD-MFD para Control (§2.1), DAW/orquestador de workflows para la dualidad
orbital/secuencial (§2.2), observability con drill-down para los cuatro niveles de profundidad
(§2.3), CI/CD y control de versiones para continuidad (§2.4), y redes de citación —no órbitas—
para Wisdom (§2.5). Forzar todo esto a una sola metáfora astronómica aplanaría diferencias reales:
una red de citación (§2.5.3) no tiene ninguna razón conceptual para parecerse a una órbita. La
recomendación es mantener "Orrery" como marca/mecanismo de entrada (y la metáfora orbital es
legítima específicamente para Constellation/Orbital, que ya llevan ese nombre), pero dejar que
Wisdom adopte geometría de red, que Gravity adopte lenguaje de overlay/breadcrumb, y que el modo
de mayor detalle adopte densidad tipo terminal (§2.1.3) — todo unificado por principios de
interacción consistentes (breadcrumb persistente, focus no destructivo, confirmación inmediata de
intervención) en vez de por una sola geometría compartida.

### Pregunta 3: ¿Gravity literal (fuerzas, masa visual) o traducida a lenguaje humano sin geometría propia?

**Posición: lenguaje humano por defecto, con geometría literal disponible bajo demanda para el
perfil técnico.** Tres piezas de evidencia apuntan en la misma dirección: la separación HUD/MFD
(§2.1.4) indica que la capa ambiental permanente debe ser mínima y no una simulación densa; el
patrón de overlay GIS (§2.0.4) resuelve "regla que actúa sobre la vista" con codificación de
color/contraste, no con geometría de fuerzas; y el propio proyecto ya prototipó esta dirección en
`Paladin_UX_Postura_Gravity_Masa_Spec_v0_1.md` con un breadcrumb compacto y textual, expandible a
una lista con íconos de masa, nunca con líneas de fuerza. Al mismo tiempo, el patrón de "focus no
destructivo" de Datadog (§2.3.3) y la coexistencia de resumen legible + red completa de los grafos
de citación (§2.5.3) muestran que no hace falta elegir una sola vez para siempre: la vista por
defecto debe ser lenguaje humano ("esto queda", "esto gobierna"), y una vista expandida — para el
ingeniero que quiere ver el grafo de influencia completo de una Postura — puede ofrecer una
representación más literal sin violar "la complejidad existe pero no se impone", siempre que sea
opcional y nunca el estado inicial.

---

## Notas de cobertura

Todas las preguntas de las secciones 2.0 a 2.6 tienen al menos un caso real de respaldo, salvo la
pregunta de §2.4 sobre si las herramientas de CI/CD muestran el runner/ejecutor como entidad de
primera clase en su historial — ahí se documentó explícitamente "no se encontró precedente claro"
en vez de forzar una analogía débil (ver §2.4.2), tal como piden las instrucciones de lanzamiento.
