# Investigación — Orrery como Visor Espacial de Mandatos en Ejecución: Gramática de Mandate/Postulate y Umbral de Transición Core UI ↔ PlayCanvas v0.1

**Tipo:** Investigación de arquitectura de UX espacial y sistemas de software [R]. No es diseño final de
interfaz, no es wireframe, no autoriza cambios de código.
**Estado:** Borrador v0.1 — para revisión de José. Responde el encargo verbal del cowork de migración de
la sesión de diseño de Orrery UI (2026-09-20), no lo reemplaza.
**Fecha:** 2026-09-20.
**Ejecutado por:** cowork de investigación, con acceso de lectura/escritura al repositorio autorizado por
José para este cowork.
**Continuación directa de:**
- `Orrery_Research_Brief_Interfaz_Principal_v0_1.md` y `Orrery_Research_Resultados_v0_1.md`
  (`docs/ANALYSIS/GRAVITY/ORBITAL/`) — research ya cerrado, con posición tomada en las tres tensiones que
  planteaba. Este documento no las reabre; las usa como restricción de diseño ya vigente.
- `Investigacion_Auditoria_Estado_UI_Consolidada_v0_1.md` (`docs/ANALYSIS/UI/`) — mapa de qué UI existe hoy
  en código real vs. research/spec.
- `ORRERY_LOCATION_MATERIAL_CLOSURE_v1_1.md` (`docs/ANALYSIS/ORRERY/LOCATION/`) — Research de Location
  cerrado, `NOT_SUPPORTED` de punta a punta.

---

## §0 — Qué cambia y por qué (el giro que trae este cowork)

El encargo verbal de José reencuadra Orrery: deja de pensarse como un navegador de locaciones estáticas
(el alcance con el que se cerró `ORRERY_LOCATION_MATERIAL_CLOSURE_v1_1.md`) y pasa a pensarse como **el
visor espacial de mandatos en ejecución** (Mandates y Postulates), impulsado por los loops de intención de
Orbital y Constellation.

Esto **no invalida** el research ya cerrado. Las tres tensiones que `Orrery_Research_Brief_Interfaz_
Principal_v0_1.md` planteaba y que `Orrery_Research_Resultados_v0_1.md` cerró con posición (§3 de ese
documento) siguen vigentes como restricción de diseño:

1. Constellation↔Orbital se navegan como una sola jerarquía continua con zoom semántico; Gravity es una
   capa/vista separada, activable explícitamente, nunca un tercer grafo.
2. Orrery es un contenedor de vistas que comparten principios de interacción (breadcrumb persistente,
   focus no destructivo, confirmación inmediata de intervención), no una sola geometría astronómica.
3. Gravity se traduce a lenguaje humano por defecto, con geometría literal disponible bajo demanda para el
   perfil técnico.

Lo que es nuevo, y lo que este documento investiga, es un objeto que ese research no tenía todavía en el
tablero: **un Mandate en ejecución que atraviesa Domains y responde a ciclos agénticos vivos**, y que por lo
tanto ya no puede vivirse como una pestaña aislada del shell 2D.

**Postura de cautela que este documento adopta, explícita porque José la pidió así:** no se propone llevar
la UI completa de Workspace Core a un navegador 3D. Orrery/PlayCanvas es la **sección 3D de navegación**
dentro del Core UI actual. Se integra donde corresponda dentro de lo que ya existe y funciona en producción
— no reemplaza el shell (`TabBar` + `MandateTab` + `Sidebar`, ver §2) ni se le pide a la Core UI que se
convierta en otra cosa.

---

## §1 — Corpus de respaldo leído para esta investigación

Se leyó, en el orden y con la jerarquía que José indicó, el siguiente corpus (todos verificados por lectura
directa del repositorio, no por referencia):

| # | Documento | Qué aporta a esta investigación | Qué restringe |
|---|---|---|---|
| 1 | `ANALYSIS/ORRERY/LOCATION/ORRERY_LOCATION_MATERIAL_CLOSURE_v1_1.md` | Fija dónde termina Navigation State y empieza Location; contrato candidato campo por campo; estado real `NOT_SUPPORTED` de la cadena Organization→Project→Domain→Gene→archivo | No reinventar el contrato de Location; no tratar Domain/Gene como materializados cuando no lo están |
| 2 | `ANALYSIS/GRAVITY/ORBITAL/Orrery_Research_Brief_Interfaz_Principal_v0_1.md` | Fundamento original de Orrery: por qué es la interfaz principal, no un dashboard más; los cuatro pilares (Control, Continuidad, Sabiduría, Soberanía) | Evita que este documento reinvente a Orrery como "navegador técnico genérico" |
| 3 | `ANALYSIS/GRAVITY/ORBITAL/Orrery_Research_Resultados_v0_1.md` | Todo lo ya aprendido con evidencia externa (casos reales), y la toma de posición en las tres tensiones (§3 de ese documento) | Este research no se vuelve a hacer; se hereda como respondido |
| 4 | `GENES/COGNITUUM_GENE_CONCEPT_v3_0.md` | Qué es un Gene (identidad funcional durable, Revisions inmutables, Contributions gobernadas); qué NO es (nodo, carpeta, embedding, Domain, Mandate, arista Gravity) | Impide reinterpretar Gene como nodo de grafo o carpeta en el diseño espacial |
| 5 | `GENES/COGNITUUM_GENE_CANONICAL_PERSISTENCE_MATERIALIZATION_CONTRACT_v0_1.md` | Qué parte de la persistencia/materialización de Gene ya está decidida (G1: store filesystem, digests, protocolo de publicación) y qué queda para G2 (caller productivo, GravityGraph/Location/Orrery como consumidores read-only futuros) | Orrery consumirá Gene sólo cuando exista G2; hoy no hay caller productivo |
| 6 | `ANALYSIS/GRAVITY/GRAFO/GravityGraph_DOMAIN_GENE_Contrato_Propuesto_v0_1.md` | La relación física Domain↔Gene propuesta como proyección Gravity (nodos `DOMAIN`/`GENE`, arista `DOMAIN_GENE`); explícitamente **excluidos** de Postures, spine, precedencia y Masa | Orrery no debe inventar que Domain/Gene participan de la resolución de criterio de Gravity |
| 7 | `ANALYSIS/GRAVITY/GRAFO/Investigacion_GravityGraph_DomainGene_Relacion_v0_1.md` | Auditoría previa: **no existe hoy consumidor real** que justifique persistir una relación Postura↔Domain/Gene; recomienda resolución en tiempo de lectura si aparece un consumidor concreto | Ver hallazgo crítico en §2.2 — este cowork podría ser exactamente ese consumidor |
| 8/9 | `ROLES/BLOOM_ORGANIZATIONAL_BINDING_SEMANTIC_CONTRACT_v0_1.md` y `ROLES/BLOOM_REMOTE_AUTHORITY_PHYSICAL_DESIGN_v0_1.md` | Sostienen la parte soberana Tenant→Organization→Project: `tenant_id` no sustituye `organization_id`; el binding organizacional (`UNBOUND→BOUND→REMOTE_LOCKED`) es una dimensión separada de roles/permisos | Orrery no debe inventar su propia jerarquía de autoridad; Tenant es una capa de plataforma (Sovereign) por encima de Organization, nunca un reemplazo |

Adicionalmente, para entender los objetos de UI ya en pantalla y su propiedad cliente/backend, se releyeron
`Paladin_UX_Postura_Gravity_Masa_Spec_v0_1.md` y `Paladin_Client_Object_Model_v0_1.md` (ambos ya citados
como precedente en el research de Orrery — ver §2.3 más abajo), y se releyó
`Investigacion_Auditoria_Estado_UI_Consolidada_v0_1.md` para saber qué de todo esto ya tiene código real.

---

## §2 — Estado real de lo construido (puente con la auditoría de UI)

### 2.1 — Lo que ya existe y funciona en producción hoy

La auditoría de UI (`Investigacion_Auditoria_Estado_UI_Consolidada_v0_1.md`, §1 y §6.1) confirma, con
evidencia archivo+símbolo:

- **`MandateTab.svelte` + `mandateStore.ts`** — componente único orientado por `mandateType`/
  `domainBaseline`, con ciclo de vida de 4 fases (`ingest/cluster/validate/scaffold`), reconciliación real
  vía `hydrateFromList()` + `applyMandateEvent()` sobre WebSocket, con manejo de eventos desconocidos y
  descarte de actualizaciones stale por `stateVersion`. **Esto ya es la fuente de verdad de un Mandate en
  el cliente.** Cualquier vista nueva de Orrery que muestre Mandates en ejecución debe leer de este store,
  no reimplementar su propio estado de Mandate en paralelo.
- **`installer/conductor/workspace/core/orrery/src/main.ts` + `data.ts`** — el prototipo PlayCanvas.
  Motor de cámara orbital, selección por raycasting, labels HTML, panel inspector lateral no destructivo:
  confirmado como capa de **interacción** genuinamente resuelta y reutilizable. La capa de **datos** es
  enteramente simulada (`items`, `genes` hardcodeados en `data.ts`, badge propio "ESQUICIO 01 · DATOS
  SIMULADOS").
- **`TabBar.svelte` + `tabs.ts`** — shell de pestañas genérico, sin acoplamiento a mandates específicamente.

### 2.2 — Hallazgo crítico: este cowork podría ser el "consumidor real" que faltaba

`Investigacion_GravityGraph_DomainGene_Relacion_v0_1.md` (§9, recomendación) cerró diciendo, textual:

> "No implementar ni ratificar ninguna relación transversal ahora [...] Criterio para reabrir: reabrir esta
> decisión sólo cuando exista al menos un consumidor identificable con una query imposible de resolver
> adecuadamente manteniendo las fuentes separadas."

El giro que trae este cowork — Orrery mostrando Mandates en ejecución que atraviesan Domains, con Gravity
(Posturas) actuando sobre ese recorrido — es **precisamente el tipo de consumidor** que ese documento
dejaba como condición para reabrir la pregunta. Esto no se resuelve en este documento (no es investigación
de backend), pero se señala como hallazgo que la próxima Propuesta/Encargo de backend deberá tomar en
cuenta explícitamente, citando esta investigación como el consumidor que activa la condición de reapertura.

**No se propone** aquí agregar `domainId`/`geneId` a `GravityPosture` ni crear un índice transversal. Si
Orrery necesita cruzar Gravity con Domain/Gene, la primera alternativa a probar — según la propia
recomendación de ese documento (§7.3, Opción C) — es **resolución en tiempo de lectura por el consumidor**
(Orrery compone la vista leyendo `GravityGraph` y el índice semántico por separado), nunca una arista
persistida nueva sin evidencia de necesidad real.

### 2.3 — Ambigüedad terminológica: Postura (Gravity) vs. Postulate (este cowork)

El corpus técnico existente usa **Postura** como la unidad de criterio dentro de Gravity (regla o criterio
informativo, ver `Glosario_Contexto_Cognituum_para_Cowork.md` §1). El encargo de este cowork usa
**Postulate** para referirse a algo que Orrery debe visualizar junto a Mandate. Ningún documento leído
define "Postulate" como término técnico propio — el concepto más cercano es la "declaración humana" de ASM
citada en `ORRERY_LOCATION_MATERIAL_CLOSURE_v1_1.md` §14: *"Location entrega dónde; la declaración expresa
qué."* Es decir, ASM ya distingue Location (dónde) de una declaración de intención humana (qué) — pero esa
declaración no se llama "Postulate" en ningún documento del corpus leído.

**Esta investigación no asume que Postulate = Postura de Gravity.** Son, a priori, dos objetos distintos:
Postura es criterio normativo persistente; la declaración ASM es la expresión puntual de qué se quiere que
pase en un lugar. Tratarlos como sinónimos sin ratificación de José arriesga mezclar dos planos que el
corpus mantiene deliberadamente separados (ver §5 de este documento, GravityGraph §8: *"DOMAIN y GENE
siguen excluidos de Postures, spine, precedencia y Masa"* — la misma disciplina de no mezclar planos aplica
aquí). Se deja como pregunta abierta en §7.

---

## §3 — Ontología de este cowork vs. ontología ya ratificada (conciliación)

José transfiere para este cowork una ontología nueva: **sin piso**, tres estados cognitivos
**Context / Focus / Anchor**, y jerarquía **Tenant → Organization → Project → Domain → Gene → Artifact**.
Ninguno de estos términos, tal como se los da acá, aparece formulado de esa manera en el corpus técnico
existente. Antes de usarlos para diseñar, se los confronta contra lo que el corpus ya ratificó, para no
introducir por accidente una segunda ontología que colisione con la primera.

| Término nuevo | Coincide con... | Compatibilidad | Riesgo si se asume sin ratificar |
|---|---|---|---|
| **Tenant** | `ROLES/BLOOM_REMOTE_AUTHORITY_PHYSICAL_DESIGN_v0_1.md` §0: *"Sovereign es la plataforma; un tenant del cliente contiene organizaciones Bloom. `tenant_id` no sustituye `organization_id` ni crea autoridad entre organizaciones."* | **Compatible.** Tenant es una capa de plataforma por encima de Organization, ya reconocida | Ninguno si se respeta que Tenant no reemplaza ni deriva `organization_id` |
| **Organization → Project** | Espina de Gravity `NUCLEUS → ORGANIZATION → PROJECT → MANDATE → SESSION` (`Investigacion_GravityGraph_DomainGene_Relacion_v0_1.md` §1); boundary de identidad V1 de Gene es el Project (`COGNITUUM_GENE_CONCEPT_v3_0.md` §3) | **Compatible** | Ninguno |
| **Project → Domain → Gene** | Plano semántico N:M ya definido (`COGNITUUM_GENE_CONCEPT_v3_0.md` §2.6, §7.4: Domain↔Gene es N:M, identidad independiente) | **Compatible en el nombre, con una advertencia dura** | Domain y Gene están **explícitamente excluidos** de Postures, spine, precedencia y Masa (`GravityGraph_DOMAIN_GENE_Contrato_Propuesto_v0_1.md` §8). Si la jerarquía visual de este cowork sugiere que Domain/Gene "gobiernan" igual que Gravity, se estaría diseñando sobre un supuesto que el backend ya cerró en contra |
| **Gene → Artifact** | Gene v3.0 admite "activos constitutivos" tipos `file`, `document`, `test` (§2.7, §3) — no usa la palabra "Artifact" | **No ratificado** | El prototipo actual de Orrery ya usa "Artifact" como objeto propio (`data.ts`, kind `Artifact`, "Registro de revisión") — no está definido si es lo mismo que un activo constitutivo de Gene V1 o un cuarto nivel nuevo que este cowork está proponiendo. Ver pregunta en §7 |
| **Sin piso / Context / Focus / Anchor** | No aparecen en el corpus técnico leído como términos de arquitectura | **Aporte nuevo de este cowork** | "Anchor" coincide de forma sugestiva con `explicit_anchors` de Location (`ORRERY_LOCATION_MATERIAL_CLOSURE_v1_1.md` §5: lo señalado explícitamente por el humano en su captura) — pero la coincidencia de nombre no implica coincidencia de contrato. Si este cowork adopta "Anchor" como estado cognitivo de UI, debe decidirse explícitamente si hereda el contrato `NOT_SUPPORTED` de Location o si es un concepto de interacción puramente distinto que no persiste nada. No se asume ninguna de las dos por default |

**Conclusión de esta sección:** la ontología nueva es utilizable para diseñar la experiencia, pero en tres
puntos (Domain/Gene como aparentemente normativos, Gene→Artifact, y Anchor) necesita una decisión explícita
de José antes de que la Propuesta de diseño la dé por asumida (ver §7).

---

## §4 — El problema de diseño: gramática espacial para Mandates/Postulates vivos

### 4.1 — Por qué "tab" ya no alcanza

Un Mandate en ejecución, bajo la reformulación de este cowork, atraviesa Domains y responde a ciclos
agénticos vivos de Orbital. El `MandateTab.svelte` actual (auditoría §5.2) ya modela bien el ciclo de vida
de *un* Mandate como unidad — pero lo hace como pestaña única, sin relación espacial con los Domains que
ese Mandate toca ni con otros Mandates corriendo en paralelo (Constellation). Esa es exactamente la
pregunta 2.0 del research brief original ("cómo se inspecciona, navega y opera la estructura completa de
tres capas sin abrumar al usuario"), ahora con un objeto de primera clase (Mandate vivo) que el research
original todavía no tenía que resolver de forma tan concreta.

**No se propone reemplazar `MandateTab.svelte`.** Se propone que Orrery sea una **vista adicional
sincronizada** con el mismo `mandateStore` (mismo `hydrateFromList()`/`applyMandateEvent()`, mismo
`stateVersion`) — nunca una segunda fuente de verdad de qué está pasando con un Mandate. Esto respeta el
principio ya fijado en `Paladin_Client_Object_Model_v0_1.md` §1: el cliente no puede tratarse a sí mismo
como dueño de nada que el backend ya considera autoritativo.

### 4.2 — Aplicar el research ya cerrado al caso concreto

`Orrery_Research_Resultados_v0_1.md` §3 ya tomó posición en las tres tensiones. Traducido al problema
concreto de "un Mandate operando sobre el espacio":

- **Zoom semántico continuo (Constellation↔Orbital):** un Mandate en Constellation es un nodo compuesto
  expandible in situ (precedente Nx + Figma + Temporal, §2.0.2 y §2.2 del research); acercarse revela su
  Orbital interno (Intents turno a turno) sin cambiar de pantalla.
- **Gravity como overlay separado, nunca un tercer grafo:** las Posturas activas se muestran como capa
  activable (precedente overlay GIS, §2.0.4), en lenguaje humano por defecto (§3, pregunta 3 del research).
- **HUD/MFD:** lo ambiental permanente (breadcrumb de Gravity, ya especificado en `Paladin_UX_Postura_
  Gravity_Masa_Spec_v0_1.md` §2) vive siempre visible y de baja densidad; el detalle de intervención
  (conflicto, postulación) se abre bajo demanda (§2.1 del research).
- **Focus no destructivo (Datadog, §2.3.3):** entrar al detalle de un Mandate en Orrery nunca oculta ni
  altera la topología completa de Constellation — sólo cambia qué se muestra.

### 4.3 — El territorio permanece, el Mandate lo recorre

El propio prototipo de Orrery ya contiene, en germen, exactamente esta gramática — sin que nadie la haya
nombrado así todavía. El `index.html`/`main.ts` actuales muestran:

- Un texto fijo en la intro del esquicio: *"El mundo permanece. El criterio lo alcanza. El trabajo lo
  recorre."* (`main.ts` línea 8).
- Un `marker` (esfera verde) que se mueve sobre una `route` de puntos entre Domains, con un `stage`
  textual que va narrando el Intent actual ("Intent 1 · Inspeccionar identidad" → "Orbital · Segunda pasada
  de revisión" → ... → "Artifact disponible · Recorrido completado") — `main.ts` líneas 55-63.
- Los Domains (`identity`, `access`, `evidence`, `knowledge`, `delivery`) son el territorio fijo; el
  Mandate/Intent es lo único que se desplaza sobre él.

**Esto ya es la gramática pedida**, sólo que hoy corre sobre datos ficticios con un timeline simulado
(`timeline`, `time`, `playing` — controles de reproducción manual). El paso conceptual que este cowork
propone no es inventar una gramática nueva, es **promover ese recorrido de "simulación de datos ficticios"
a consumidor real de `mandateStore`**: el `marker` deja de seguir una `route` hardcodeada y pasa a seguir
la posición real del Mandate/Intent activo, leída de `applyMandateEvent()`; el territorio (Domains) deja de
venir de `data.ts` y pasa a resolverse contra el índice canónico Domain/Gene cuando ese productor exista
(hoy no existe — ver §2.1 de `ORRERY_LOCATION_MATERIAL_CLOSURE_v1_1.md`, fila "Código Project → Domain →
Gene").

### 4.4 — Postulate: tensión a señalar, no a resolver acá

El encargo pide que el Paladín "vea" un mandato operando sobre el espacio "sin caer en HUDs ni dashboards
planos". Pero el research ya cerrado (§4.2 arriba) recomienda explícitamente el patrón HUD/MFD para
justamente este problema (información ambiental permanente vs. de intervención). Hay una tensión real
entre el lenguaje del encargo y la posición ya tomada por el research — **no se resuelve unilateralmente en
este documento.** Se señala en §7 como pregunta para José: si Postulate necesita una representación
volumétrica explícita en el espacio 3D (lo cual reabriría la pregunta 3 del research, hoy cerrada a favor
de "lenguaje humano, sin geometría propia, por defecto"), o si el rechazo a "HUD/dashboard plano" apunta a
otra cosa (por ejemplo, evitar que la capa de intervención se sienta separada del mundo, no a que Postulate
tenga cuerpo propio en el espacio).

---

## §5 — El Umbral de Transición (Gateway UX): Core plano → Orrery volumétrico

### 5.1 — El problema, tal como lo plantea el encargo

Según los propios informes de auditoría de `docs/ANALYSIS/UI/`, el mayor desafío no es que PlayCanvas
renderice bien el espacio 3D (ya validado por el prototipo — auditoría §6.1), sino cómo entra el Paladín
desde la UI plana de Workspace Core al visor volumétrico de Orrery sin sufrir un "shock cognitivo" ni
perder el contexto operativo.

### 5.2 — Precedentes ya relevados que aplican directo

No hace falta investigar de cero: el research ya cerrado trae piezas directamente aplicables al problema
del umbral, aunque el research original no lo haya planteado en estos términos:

- **Focus no destructivo (Datadog, §2.3.3 del research):** el principio de que "focus cambia qué se
  muestra, nunca filtra ni altera lo subyacente" es la garantía exacta que necesita un umbral: cruzarlo no
  puede significar "perder" la vista 2D, sólo cambiar la representación activa.
- **Overlay lateral no destructivo (Kubernetes Lens, §2.3.1):** el patrón inverso (entrar al detalle sin
  abrir ventana nueva) es evidencia de que "bajar de nivel nunca se siente como salir de la vista
  principal" — el mismo criterio aplica, en sentido inverso, para "elevar" a Orrery.
- **Agencia y latencia acción-efecto (§2.6.1):** la transición debe sentirse como el Paladín eligiendo
  deliberadamente elevar su perspectiva sobre algo que ya estaba gobernando en 2D — no como un salto a "otro
  producto". Cámara en tercera persona, no en primera (§2.6.2): el Paladín no se convierte en un personaje
  dentro de Orrery, sigue viéndose a sí mismo operando el sistema.

### 5.3 — Propuesta conceptual del mecanismo (no de implementación)

Siguiendo la sugerencia del propio encargo, se propone:

1. **Invocación contextual, no genérica.** El visor de Orrery no se abre como pestaña nueva del `TabBar`
   ni como modal flotante. Se invoca desde un gesto de "elevar perspectiva" disponible sobre un Domain o un
   Mandate activo en la vista 2D actual — por ejemplo, desde el panel de un `MandateTab` con Intents en
   curso, o desde el picker de Capa 0 (`docsGate.ts`, ya migrado 1:1 y reutilizable — auditoría §6.1).
2. **Condición de aparición, no automatismo.** El gesto está disponible cuando hay algo que amerita verlo
   en volumen (incidencia activa de Mandates, Intents corriendo), pero **nunca se dispara solo** — la
   fricción debe ser deliberada. Esto es consistente con la decisión ya tomada en `Paladin_UX_Postura_
   Gravity_Masa_Spec_v0_1.md` §1.3 para el gesto de postular una Postura: un modo que se activa "por si
   acaso" (aquí, elevarse a 3D automáticamente ante cierta actividad) tienta a quedar encendido y generaría
   exactamente el "shock cognitivo" que se quiere evitar, no lo previene.
3. **Aterrizaje con foco, nunca en la vista general.** Al elevar, Orrery abre centrado en el Domain/Mandate
   de origen — el prototipo ya tiene el mecanismo (`desired`, `desiredDistance`, `select()` en `main.ts`)
   para posicionar la cámara sobre un objeto concreto en vez de la vista "Organización" completa por
   defecto. Elevar la perspectiva de un Domain puntual debe aterrizar sobre ese Domain, no reiniciar en cero.
4. **Retorno simétrico y no destructivo.** Debe existir el gesto inverso ("volver al plano") que reabra el
   `MandateTab` del mismo Mandate que se estaba mirando en volumen — nunca la vista general del shell. Esto
   es, en esencia, el gap **A4** de Location (`ORRERY_LOCATION_MATERIAL_CLOSURE_v1_1.md` §10: "reapertura
   de Orrery con representación equivalente independiente del layout") aplicado en sentido inverso: la
   garantía de continuidad debe sostenerse en ambas direcciones del umbral, no sólo al entrar a Orrery.

### 5.4 — Qué depende de backend antes de que esto sea real (no ficticio)

El mecanismo de umbral en sí es agnóstico de si los datos son reales o simulados. Pero la condición de
aparición ("incidencia activa de Mandates") y el aterrizaje con foco sobre un Domain real dependen de que
Domain/Gene tengan productor canónico conectado — hoy no lo tienen (`ORRERY_LOCATION_MATERIAL_CLOSURE_v1_1.md`
§4, dependencias B1-B3 y C1-C2). El umbral puede diseñarse y hasta prototiparse ya, pero no puede
prometerse "con datos reales" hasta que esos encargos de backend avancen.

---

## §6 — Qué NO se resuelve en esta investigación (fuera de alcance explícito)

- No se decide layout final, tokens visuales, tipografía ni paleta.
- No se define el shape físico de "Postulate" como objeto de datos ni de UI.
- No se resuelve el gap de backend Location/Domain/Gene — sigue `NOT_SUPPORTED` de punta a punta
  (`ORRERY_LOCATION_MATERIAL_CLOSURE_v1_1.md` §16).
- No se reabre la decisión de `Investigacion_GravityGraph_DomainGene_Relacion_v0_1.md` de no persistir una
  relación Postura↔Domain/Gene — se señala como candidato a reapertura (§2.2), no se reabre acá.
- No se resuelve si Postulate y Postura son el mismo objeto o dos objetos distintos (§2.3).
- No se define si "Artifact" en la nueva ontología es el mismo concepto que "activo constitutivo" de Gene
  V1 (§3).
- No se implementa nada: ningún archivo de `installer/conductor/workspace/core/orrery/` ni de
  `webview/app/` fue modificado por esta investigación.

---

## §7 — Preguntas para José antes de pasar a Propuesta de diseño

1. **Postulate vs. Postura:** ¿"Postulate" es la declaración humana de ASM (qué se quiere que pase en un
   lugar), un sinónimo de "Postura" de Gravity, o un tercer objeto que este cowork está introduciendo? La
   respuesta cambia si Postulate hereda la disciplina de "overlay separado, lenguaje humano" que ya rige a
   Gravity, o si necesita su propia representación.
2. **Anchor:** ¿el estado cognitivo "Anchor" de la nueva ontología es el mismo concepto que
   `explicit_anchors` de Location (con su contrato `NOT_SUPPORTED` heredado), o es un concepto de
   interacción de UI puramente distinto, sin relación de persistencia?
3. **Gene → Artifact:** ¿es la misma relación que "activo constitutivo" de Gene V1 (`file`/`document`/
   `test`), o el cowork está proponiendo un nivel ontológico nuevo por encima de Gene que el corpus técnico
   todavía no tiene?
4. **Tensión HUD vs. "sin HUDs ni dashboards planos":** ¿se ratifica la posición ya tomada por el research
   (HUD/MFD, overlay separado para Gravity) también para Postulate, o el cowork quiere una representación
   volumétrica explícita de Postulate en el espacio — lo cual reabriría la pregunta 3 del research ya
   cerrado?
5. **Domain/Gene como consumidor real de GravityGraph:** ¿se autoriza señalar formalmente, en un documento
   de Backend/Gravity aparte, que este cowork constituye el consumidor real que
   `Investigacion_GravityGraph_DomainGene_Relacion_v0_1.md` pedía como condición para reabrir la pregunta de
   relación Postura↔Domain/Gene?

### Secuencia recomendada

1. Resolver las preguntas 1-4 con José (no requieren investigación adicional, son decisiones de producto).
2. Propuesta de diseño de la gramática espacial de "Mandate en ejecución sobre el territorio Domain/Gene"
   (§4), apoyada en `mandateStore` real — sin tocar código todavía.
3. Propuesta separada del mecanismo de Umbral/Gateway (§5) — puede avanzar en paralelo al punto 2, porque es
   agnóstica de si los datos de Domain/Gene son reales o simulados.
4. Recién con 2 y 3 aprobados, Encargo de implementación — nunca antes, siguiendo la misma disciplina que ya
   aplica el resto del corpus (`GravityGraph_DOMAIN_GENE_Contrato_Propuesto_v0_1.md` §10: "arquitectura
   consolidada, implementación no autorizada").
