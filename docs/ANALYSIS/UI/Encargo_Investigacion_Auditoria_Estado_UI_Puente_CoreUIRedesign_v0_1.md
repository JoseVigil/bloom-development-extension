# Encargo de Investigación — Auditoría de Estado de UI, puente hacia el cowork de Core UI Redesign v0.1

**Basado en:** pedido directo de José, 2026-09-20 — pausa ordenada antes de abrir el frente de desarrollo de
UI. Cierre formal del Tema 1 (Mandate Genesis) ya completado (`Tablero_Seguimiento_Consolidado_v0_2.md` v0.50,
§Z.26); D-25 (Core UI Redesign) quedó explícitamente fuera de ese cierre, reservado para un cowork propio.
**Tipo:** Investigación de sólo lectura — audita y mapea, no diseña ni implementa. No es el cowork de Core UI
Redesign; es el insumo que ese cowork va a necesitar antes de arrancar.
**Encarga:** Control, para ejecución en un cowork de investigación dedicado (puede ser el mismo Control u otro
Work, según decida José).

---

## §0 — Qué se pide

Bloom acumula, a lo largo de varias semanas de coworks, un rastro disperso de decisiones de diseño de UI,
research de interacción, y al menos un prototipo funcional de interfaz (Orrery) — todo documentado, pero en
documentos separados, de fechas distintas, con al menos una corrección ya registrada sobre sí misma (ver
§2.3). Antes de que el cowork de Core UI Redesign empiece a diseñar o tocar código de interfaz, hace falta un
documento único que responda tres preguntas sobre todo ese rastro:

1. **¿Qué vistas/pantallas existen** — como research, como spec, como prototipo de código, o como item de
   backlog (D-25) — y en qué estado real está cada una?
2. **¿Qué decisiones de diseño ya están tomadas y ratificadas** (no reabrir sin motivo) vs. **cuáles siguen
   abiertas** (el próximo cowork las hereda como preguntas, no como respuestas)?
3. **¿Qué componentes o patrones de interacción ya están implementados y son reutilizables**, cuáles están
   solo especificados sin código, y cuáles dependen de infraestructura de backend que todavía no existe (y por
   lo tanto no pueden construirse todavía, aunque estén diseñados)?

El resultado de este encargo es un documento de auditoría — un mapa, no una propuesta de diseño — que el
cowork de Core UI Redesign va a leer primero, antes de generar su propio Investigación/Propuesta/Encargo.

## §1 — Corpus a relevar (ya identificado; el cowork de auditoría puede ampliarlo si encuentra más)

### 1.1 — Hilo Orrery (interfaz principal del workspace)

- `ANAYSIS/GRAVITY/ORBITAL/ORRERY/Cowork_Instrucciones_Lanzamiento_Research_Orrery.md` — instrucciones de
  lanzamiento del research original.
- `ANAYSIS/GRAVITY/ORBITAL/ORRERY/Glosario_Contexto_Cognituum_para_Cowork.md` — glosario de términos
  (Constellation/Orbital/Gravity, jerarquía de tres capas) que el cowork de UI va a necesitar para no
  reinventar vocabulario.
- `ANAYSIS/GRAVITY/ORBITAL/ORRERY/Orrery_Research_Brief_Interfaz_Principal_v0_1.md` (2026-09-11/12) —
  requerimiento de investigación, no diseño. Fija Orrery como interfaz principal del workspace (no un
  dashboard más) y nombra tres tensiones explícitas sin resolver: (a) ¿Orrery es una sola metáfora visual o un
  contenedor de varias vistas?, (b) ¿Gravity se representa literalmente o se abstrae en lenguaje humano?, (c)
  ¿Constellation/Orbital/Gravity son vistas separadas o una sola vista continua con zoom semántico? — la (c)
  es, según el propio brief, la más urgente porque condiciona a las otras dos.
- `ANAYSIS/GRAVITY/ORBITAL/ORRERY/Orrery_Research_Resultados_v0_1.md` (2026-09-12) — research externo real
  (Airflow Grid/Graph/Gantt, Figma canvas infinito, Kubernetes Lens, VS Code breadcrumbs, Datadog Trace View,
  Ableton Session/Arrangement, Temporal Timeline View), con recomendaciones puntuales por precedente y, para
  cada uno, qué SÍ aplica a Orrery y qué NO. **No cierra las tres tensiones del brief** — las alimenta con
  evidencia, la decisión sigue sin tomar.
- `ANALYSIS/GRAVITY/LOCATION/Investigacion_Already_Orrery_Location_Infraestructura_v0_1_PARCIAL.md` (§3) —
  auditoría de código real de un prototipo Orrery ya construido (`main.ts`/`data.ts`, motor `pc.Picker`):
  confirma que la capa de **interacción** (selección por click/raycasting, cámara orbital con drag/pan,
  labels HTML posicionados sobre el mundo 3D, panel inspector lateral no destructivo) está genuinamente
  resuelta y es reutilizable — pero que la capa de **datos** es enteramente simulada (badge propio del
  prototipo: "ESQUICIO 01 · DATOS SIMULADOS"), sin fetch a ningún backend real, sin persistencia, sin relación
  con `NodeID` de GravityGraph.

### 1.2 — Hilo Location/Domain/Gene (infraestructura que Orrery necesitaría para mostrar datos reales)

- `ANALYSIS/GRAVITY/LOCATION/Investigacion_Already_Orrery_Location_Infraestructura_v0_2_Continuacion.md` y
  `..._v0_3_Addendum.md` (2026-09-14) — no son sobre UI directamente, son sobre qué tan lejos está el backend
  de poder alimentar una vista como Orrery con datos reales. Hallazgo central del v0.3 (corrige al v0.2): el
  gap de mayor apalancamiento de todo ese research es la **ausencia de un productor real de `ProjectID`
  estable** — bloquea en cadena PROJECT → MANDATE Gravity → SESSION Gravity → resolución de Postures activas.
  Mientras ese gap siga abierto, cualquier vista de Orrery que pretenda mostrar la jerarquía completa con
  datos reales (no simulados) tiene un techo de facto. El cowork de auditoría debe dejar esto explícito como
  **dependencia de backend, no de UI** — para que Core UI Redesign no intente resolverlo por su cuenta ni lo
  trate como bloqueante de todo el frente (partes de la UI no dependen de este gap).

### 1.3 — Hilo UX/spec ya ratificado

- `ORBITAL/GRAVITY/Paladin_UX_Postura_Gravity_Masa_Spec_v0_1.md` — spec de UX ya citada como precedente en el
  research de Orrery (patrón de breadcrumb persistente de Gravity). Releer para inventariar qué decisiones de
  esta spec ya están ratificadas y cuáles el research de Orrery reinterpretó (ver el caso SESSION en §1.2:
  la spec original describía SESSION como "conversación viva, turno a turno", y el código real la reinterpretó
  deliberadamente como "una corrida de `MandateExecutionWorkflow`" — una divergencia ya documentada como tal,
  no un error, pero que el cowork de UI necesita conocer si SESSION aparece en cualquier vista).
- `ANAYSIS/GRAVITY/MODELS/Paladin_Client_Object_Model_v0_1.md` — modelo de objetos del lado cliente; revisar
  si sigue vigente o quedó superado por decisiones posteriores (mismo chequeo de vigencia que el resto del
  corpus, ver §2).

### 1.4 — Hilo D-25 / Core UI Redesign propiamente dicho

- **No existe todavía ningún documento dedicado.** Todo lo que hay es la línea de la Agenda Maestra: *"D-25:
  confirmar si hace falta separar `GenesisTab` de `StandardMandateTab` o unificar en un `MandateTab`
  orientado por estado"* — y la mención, en el cierre del Tema 1 de esta sesión
  (`Cierre_Implementacion_D27_UnificacionCreacionMandates_v1_0.md` §4), de que quedó fuera de alcance por
  decisión explícita de José. El cowork de auditoría debe localizar en el repo real (`src/ui`, `webview/app`,
  y cualquier `GenesisTab`/`StandardMandateTab`/`MandateTab` existente) el estado actual de esos componentes
  — que probablemente no está documentado en ningún Investigación/Propuesta previo, a diferencia del resto del
  corpus.

## §2 — Qué debe producir la auditoría, concretamente

Un documento único (`Investigacion_Auditoria_Estado_UI_Consolidada_v0_1.md` o el nombre que el cowork de
auditoría considere apropiado), con, como mínimo:

1. **Inventario de vistas/pantallas**, una fila por vista, con columnas: nombre, dónde está documentada,
   dónde está (si está) implementada en código real, y estado (`solo_research` / `solo_spec` /
   `prototipo_no_conectado` / `implementado_parcial` / `implementado_completo`) — mismo rigor de evidencia que
   ya usa el hilo Already/Orrery (cita archivo+símbolo, nunca "debería estar implementado").
2. **Registro de decisiones ratificadas vs. abiertas**, separado del inventario de vistas — una decisión
   ratificada (ej. la reinterpretación de SESSION) no debe reabrirse sin motivo nuevo; una decisión abierta
   (ej. las tres tensiones del Research Brief de Orrery, §1.3 de ese documento) debe pasar tal cual, sin que la
   auditoría intente resolverla por su cuenta — eso es trabajo del propio cowork de Core UI Redesign, no de
   esta auditoría.
3. **Registro de componentes/patrones reutilizables**, distinguiendo explícitamente patrón de interacción
   (que puede sobrevivir aunque cambien los datos, ej. el motor de cámara/selección de `main.ts`) de dato
   simulado (que no debe arrastrarse al nuevo cowork como si fuera real).
4. **Registro de dependencias de backend no resueltas** que limitan lo que cualquier vista puede mostrar hoy
   con datos reales (el gap de `ProjectID`, y cualquier otro que aparezca al relevar el corpus) — marcadas
   como fuera del alcance de UI, para que Core UI Redesign sepa qué NO puede prometer todavía.
5. **Estado real de D-25** (§1.4) — el único punto donde la auditoría sí debe generar evidencia nueva
   (relevamiento de código en `src/ui`/`webview/app`), no solo consolidar documentos existentes.

## §3 — Fuera de alcance (explícito)

- **No es diseño de UI.** Ningún wireframe, ninguna elección de componente, ninguna resolución de las
  tensiones abiertas del Research Brief de Orrery — esa es la primera tarea del cowork de Core UI Redesign
  una vez que tenga este mapa.
- **No es implementación.** Cero cambios de código en esta auditoría.
- **No resuelve el gap de `ProjectID` de backend** ni ningún otro gap de infraestructura que encuentre — los
  registra como dependencia, no los toca. Ese trabajo, si se decide hacer, es un cowork de Backend/Gravity
  aparte.
- **No reabre decisiones ya ratificadas** documentadas como tales en el corpus (ej. SESSION como corrida de
  `MandateExecutionWorkflow`) salvo que encuentre evidencia real de que el código actual las contradice —en
  cuyo caso lo señala, no lo corrige por su cuenta.

## §4 — Continuidad

Con este documento de auditoría en mano, el cowork de Core UI Redesign arranca su propio ciclo
Investigación → Propuesta → Encargo → Implementación → Cierre para D-25 y para lo que la auditoría revele
sobre Orrery/D-25, ya con el terreno relevado en vez de partir de cero releyendo semanas de research disperso.
Este documento (el Encargo de auditoría) y el que produzca (`Investigacion_Auditoria_Estado_UI_Consolidada`)
quedan ambos en `docs/ANALYSIS/UI/`, como puente formal entre el cierre del Tema 1 (Mandate Genesis) y la
apertura del nuevo frente.
