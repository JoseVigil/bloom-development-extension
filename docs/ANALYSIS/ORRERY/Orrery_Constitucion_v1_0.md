# Orrery — Constitución v1.0

> **Reemplazado por `Orrery_Constitucion_v1_1.md` (2026-10-11).** Este documento se conserva como versión histórica y no se edita.

**Estado:** normativo. Aprobado por José Vigil el 2026-10-10, con dos ajustes incorporados (C-12: el Contexto confirmado condiciona lo verificado, el anclaje, la Captura y los actos, no la existencia de objetos; C-15: la exclusión de Domain/Gene se refiere a la estructura normativa y no impide percibir sobre una Entidad los efectos de Gravity sobre el Trabajo situado allí).
**Fecha:** 2026-10-10.
**Autoridad:** José Vigil.
**Fundamento obligatorio:** `docs/ANALYSIS/ORRERY/Orrery_Vocabulario_Normativo_v1_0.md`. Todos los términos en mayúscula inicial (Territorio, Entidad, Relación, Fuente, Trabajo, Situar, Proyección, Lente, Anotación, Espacio, Superficie de Workspace Core, Contexto, Foco, Anchor, Navigation State, Captura, Location/LocationSnapshot, Procedencia, Atención, Régimen) tienen exactamente el significado del vocabulario. Esta Constitución no los redefine.
**No hace:** no cierra D-1/D-2/D-3, no diseña vertical slices, no modifica código, schemas ni contratos.

---

## 0. Qué es esta Constitución

Responde **qué nunca puede violar Orrery**, no cómo se implementa.

**Criterio de admisión de un invariante.** Una regla pertenece a esta Constitución sólo si:

1. se deriva del vocabulario normativo o de una decisión vigente del corpus ya contrastado;
2. seguiría siendo verdadera aunque cambien PlayCanvas, Workspace Core, el layout, los endpoints, el formato de persistencia o el proveedor de inteligencia;
3. su violación produciría una de estas fallas: una verdad falsa presentada como verdadera, una autoridad inventada, una decisión que la persona no tomó, o la pérdida de la distinción entre lo que permanece y lo que ocurre.

Las reglas que no pasan este filtro (lenguaje por defecto, gestos, layout, foco inicial, nombres de lentes) son arquitectura o UX y se registran en §3 como tales.

**Principio fundacional (del vocabulario):** *El Territorio permanece. El Trabajo ocurre sobre el Territorio. Las Lentes permiten percibir lo que ocurre y aplica sobre él. Las Superficies permiten comprenderlo y actuar.*

---

## 1. Invariantes

Formato: **Enunciado · Razón · Protege · Cumple · Viola · Condiciona.**

### Título I — Verdad y representación

#### C-1. La representación nunca es verdad

**Enunciado.** Nada que Orrery muestre —Espacio, Anotación o Superficie de Workspace Core— es Fuente de un hecho. Todo hecho mostrado proviene de una Fuente identificable, y su desaparición, pérdida o cambio de representación no altera ese hecho.

**Razón.** Vocabulario §2.2 (el Espacio no tiene verdad propia), §2.7 (la Lente hereda la verdad de la Proyección), §3.2 (la Anotación no es significado), §2.8 (la Superficie no es Fuente). Corpus: Gene v3.0 invariantes 10 y 15 (la pérdida de Orrery no invalida un Gene; las proyecciones se reconcilian desde la fuente canónica, nunca al revés); Closure v1.1 §2 (cámara, coordenadas, filtros y layout son presentación auxiliar).

**Protege.** La frontera representación ≠ verdad y Proyección ≠ Fuente: que Orrery nunca se convierta en una segunda fuente de verdad.

**Cumple.** Borrar la caché visual de Orrery y reabrir produce el mismo Territorio. Un layout distinto conserva identidades y relaciones.

**Viola.** Guardar la posición de un nodo como parte de su identidad. Que una corrección hecha en la representación (renombrar un Domain arrastrándolo) se trate como el nuevo valor sin pasar por su Fuente. Reconstruir el Territorio a partir de lo último que Orrery mostró.

**Condiciona.** Todo contrato de lectura de Orrery; persistencia de cualquier estado del cliente; A4 (reapertura de Location independiente del layout).

#### C-2. Ningún hecho se muestra con más autoridad que la de su Fuente

**Enunciado.** Todo lo que Orrery muestra conserva su Procedencia y nunca se presenta con una clase de autoridad superior a la de su Fuente. Una propuesta no se muestra como confirmada, una proyección no se muestra como canónica, un dato visual no se muestra como real, un candidato semántico no se muestra como Relación, una propuesta de un modelo no se muestra como decisión humana, una ejecución excepcional o reinterpretada no se muestra como ejecución ordinaria. Lo que no pudo verificarse o evaluarse se muestra como tal, nunca como ausencia ni como conformidad.

**Razón.** Vocabulario §2.5 (clases de Fuente), §3.5 (Procedencia). Corpus: LocationSnapshot §D (estados `unverifiable`, `unsupported` distintos de `missing`); Gene v3.0 §7.8 (candidato ≠ relación ratificada); spec de Colisiones §4.2 (no ocultar incertidumbre como compatibilidad); Impact (`coverage`, `indeterminacy`; ningún resultado es permiso); Paladin UX §3.3 (reinterpretación y excepción nunca se ven como ejecución sin conflicto).

**Protege.** La confianza de la persona en lo que ve: la promesa de Command Respect depende de que el sistema no aparente cumplimiento.

**Cumple.** Un `DomainCandidate` se muestra como propuesto; las `decisions` de `domain_definition.json` como propuestas del modelo; un evaluador no disponible como "no evaluable".

**Viola.** Dibujar los objetos de `data.ts` sin marca de simulación. Mostrar "sin conflictos" cuando Gravity no pudo resolverse. Mostrar un nodo DOMAIN de GravityGraph como el Domain canónico.

**Condiciona.** Todo read model (debe declarar Procedencia y disponibilidad); diseño de estados vacíos; F-5.

### Título II — Territorio

#### C-3. Orrery no crea Territorio

**Enunciado.** El Territorio contiene sólo Entidades y Relaciones obtenidas de sus Fuentes. Orrery no crea, infiere, completa, reordena ni re-anida Entidades o Relaciones, y no deriva identidad de nombres, rutas, proximidad visual o similitud semántica.

**Razón.** Vocabulario §2.1, §2.3, §2.4, §2.7 (la Lente no agrega Entidades ni Relaciones). Corpus: UI Contenedora v0.2 §2.2 (Orrery no reordena, aplana ni re-anida la jerarquía); LocationSnapshot §A.8 y §B (objetos de demostración no se promueven; no inventar IDs, rutas ni versiones); Agenda 23-09 (reachability exige Relaciones explícitas y autorizadas).

**Protege.** La permanencia del Territorio y la imposibilidad de fabricar el dónde.

**Cumple.** Un Project sin binding verificado no se dibuja como Entidad verificada; se explica por qué. Un Domain sin fuente canónica sólo aparece con la Procedencia que tenga (p. ej. declarado por un Mandate), no como Entidad canónica.

**Viola.** Agrupar archivos por carpeta y presentarlos como Domains. Conectar dos Genes porque sus embeddings son cercanos. Usar el `id` de la lista de Projects como referencia canónica sin binding.

**Condiciona.** A-5 (identidad de Relación), F-5, contratos de lectura de Domain/Gene, incorporación de proyectos existentes (Bloomaut).

#### C-4. Territorio, Trabajo y Gravity son disjuntos; situar no es pertenecer

**Enunciado.** Ningún objeto de Trabajo (Mandate, Session, Action, Intent, resultado) ni de Gravity (NUCLEUS, Postures, nodos normativos) es Entidad del Territorio. Se relacionan con el Territorio sólo al Situarse sobre una Entidad. Situar no crea Entidades ni Relaciones del Territorio, no cambia la identidad de la Entidad y no puede usarse para navegar, calcular vecindad ni definir reachability del Territorio.

**Razón.** Vocabulario §2.1, §2.3, §2.6, §3.8; decisión V-Q2. Corpus: Gene v3.0 §1, §7.2 (un Mandate origina o contribuye, no posee); contrato GravityGraph DOMAIN/GENE (el padre expresa procedencia, no ownership).

**Protege.** Territorio ≠ Trabajo, Gravity ≠ Territorio, situar ≠ pertenecer.

**Cumple.** El Mandate Genesis se sitúa sobre Domain "Identidad" porque su contrato lo declara; cerrar ese Mandate no altera "Identidad".

**Viola.** Anclar una decisión en un Mandate. Mostrar Domain como hijo de un Mandate en el Territorio. Incluir un Mandate como vecino de un Domain en una Location por la arista `DOMAIN_MANDATE`.

**Condiciona.** F-1, F-2, F-3, F-4; schema de Location; contrato de proyección estructural de Gravity.

#### C-5. La identidad del Territorio no depende del Trabajo

**Enunciado.** La identidad y vigencia de una Entidad sobreviven al inicio, cierre, fallo o supersesión de cualquier objeto de Trabajo que la haya originado o modificado. El origen se conserva como Procedencia, nunca como dependencia de identidad.

**Razón.** Vocabulario §2.3, §3.5. Corpus: Gene v3.0 invariantes 3, 4 y 14 (origen inmutable, no ownership; un Mandate cerrado no deja huérfano a un Gene vivo); contrato GravityGraph (enmienda del 02-09: `origin_mandate_id` es procedencia).

**Protege.** "El Territorio permanece".

**Cumple.** Un Gene creado por un Mandate sigue siendo el mismo Gene después de que tres Mandates posteriores lo contribuyen.

**Viola.** Que la ruta o identidad de una Entidad se derive del Mandate que la creó, de modo que mover o cerrar el Mandate cambie la referencia.

**Condiciona.** F-3, F-4; G2 de Genes; Location (referencias a Gene + revisión capturada).

### Título III — Espacio, Lentes y Anotaciones

#### C-6. El Espacio sólo recibe Territorio y Anotaciones

**Enunciado.** El Espacio recibe exactamente dos cosas: una representación del Territorio y Anotaciones producidas por Lentes. Ningún otro objeto (Mandate, Posture, evento, decisión, borrador) entra al Espacio como objeto propio.

**Razón.** Vocabulario §2.2, §3.2. Corpus: UI Contenedora v0.1 §0 y §4.4 (la única estructura primaria que cruza hacia el motor es territorio; las capas sólo dicen dónde dibujar). Esta es la reinterpretación de ese invariante con el vocabulario v1.0.

**Protege.** Que el Espacio no acumule lógica de Trabajo o de Gravity por conveniencia.

**Cumple.** Un Mandate esperando aprobación aparece como una Anotación sobre "Identidad", con referencia a esa Entidad y un estado.

**Viola.** Un nodo "Mandate" en la escena con su propio objeto de datos y su propia jerarquía (como en `data.ts`). Un panel de simulación que narra Intents dentro del motor espacial.

**Condiciona.** D-1, D-2 (cualquier régimen debe respetarlo); F-5; arquitectura del motor espacial.

#### C-7. Una Lente sólo lee

**Enunciado.** Una Lente lee una Proyección y produce Anotaciones. No contiene información propia, no persiste, no decide relevancia ni Atención y no agrega Entidades ni Relaciones. Sólo puede existir una Lente para información cuyas filas se refieran a Entidades del Territorio.

**Razón.** Vocabulario §2.7 y decisión V-Q1.

**Protege.** Lente ≠ información, Proyección ≠ Fuente.

**Cumple.** Una Lente que lee "Postures declaradas por nodo de spine" y anota halos; al apagarla, nada cambia en ninguna Fuente.

**Viola.** Una "lente" que guarda un historial de navegación; una lente que decide qué Mandates "importan"; una lente de contabilidad de inteligencia sin Entidad a la que referirse.

**Condiciona.** A-3 (nombres de Lentes no pueden coincidir con nombres de información), A-8, naming y catálogo de Lentes en la arquitectura UI/UX.

#### C-8. Una Anotación siempre se refiere a una Entidad existente y no lleva significado propio

**Enunciado.** Toda Anotación referencia una Entidad presente en el Territorio. Su significado está en la Proyección y se explica en una Superficie de Workspace Core. Quitar todas las Anotaciones deja el Territorio intacto.

**Razón.** Vocabulario §3.2, §3.8. Corpus: UI Contenedora v0.1 §2.2 ("la anotación que una capa dibuja sobre territorio ajeno").

**Protege.** Que la percepción de lo que ocurre no se convierta en estructura del dónde.

**Cumple.** Si el Domain al que se refiere una Anotación deja de existir, la Anotación no se dibuja "en el aire"; se informa la referencia degradada.

**Viola.** Dibujar un Mandate en coordenadas propias sin Entidad de referencia. Explicar la decisión pendiente sólo con el color del glifo.

**Condiciona.** Modelo de Anotación; manejo de referencias degradadas.

### Título IV — Navegación y Location

#### C-9. Navegar no es capturar

**Enunciado.** El Navigation State es mutable, de sesión y no autoritativo. Una LocationSnapshot sólo nace de una Captura explícita. Ninguna acción de navegación, selección o enfoque produce una Location, y ninguna Location es requisito para navegar.

**Razón.** Vocabulario §3.3, §3.4. Corpus: Agenda 23-09 ("Navigation State es mutable y de sesión; LocationSnapshot es una captura verificable").

**Protege.** navegación ≠ captura; que la evidencia de "desde dónde se decidió" no se diluya en un rastro de navegación.

**Cumple.** La persona recorre diez Domains y sólo al declarar desde uno se produce una Captura.

**Viola.** Registrar cada salto de foco como una Location (Ledger Panel v0.1 §3.1). Exigir una snapshot recibida para poder dibujar el Territorio (lectura literal de UI Contenedora v0.2 §2.2).

**Condiciona.** D-3 (excluye la lectura literal de la regla 1:1), A-6, A-7, encargo A1 de Location.

#### C-10. Sólo un acto deliberado ancla; el Foco nunca se captura

**Enunciado.** Un Anchor existe sólo por un acto deliberado de la persona sobre una Entidad. El Foco, la selección incidental o lo último visitado nunca se convierten en Anchor. Una Captura incluye Anchors y evidencia estructural; nunca el Foco.

**Razón.** Vocabulario §2.10, §2.11; decisión V-Q3. Corpus: LocationSnapshot §C.5 (`origin: user_anchor` como selección explícita).

**Protege.** Foco ≠ Anchor; que la Location exprese la intención de situarse, no la trayectoria de la mirada.

**Cumple.** "Declarar desde Identidad" ancla Identidad; mirar un Gene antes no lo incluye.

**Viola.** Marcar todo lo seleccionado como `user_anchor`. Llamar anchor a lo último visitado y usarlo como punto de decisión.

**Condiciona.** A-1 (el "foco principal" de ASM debe expresarse como Anchor), F-1, F-5, F-7.

#### C-11. Una Location dice dónde, no para qué, y es inmutable

**Enunciado.** Una LocationSnapshot conserva Contexto, Anchors, evidencia estructural y procedencias; no contiene la declaración de lo que se quiere hacer, ni interpretación de propósito, relevancia, Gravity o consecuencias, ni coordenadas o cámara. Una vez capturada no se modifica: la resolución posterior produce diagnósticos separados por referencia y un cambio de Anchors produce otra captura.

**Razón.** Vocabulario §2.12. Corpus: LocationSnapshot §C.9, §D y Sección H (exclusiones); Closure v1.1 §8 (resolución por referencia); invariante ratificado "Orrery describe dónde está el usuario; no interpreta para qué le servirá estar ahí".

**Protege.** Que un consumidor (ASM, adopción de decisiones) reciba evidencia estable sin reinterpretación.

**Cumple.** Una Location capturada sobre un Gene en revisión R1 sigue diciendo R1 aunque el Gene pase a R2; la reapertura informa `changed`.

**Viola.** Actualizar la Location a la revisión vigente. Guardar la declaración humana dentro de la captura. Tratar `localLocation` como Location.

**Condiciona.** F-1, F-6, A-1, A-5; contratos Location–ASM; A3–A5 de Location.

### Título V — Contexto, autoridad y acción

#### C-12. Lo verificado, el anclaje, la Captura y los actos dependen de un Contexto confirmado

**Enunciado.** El Contexto confirmado no condiciona la existencia ni la ocurrencia de objetos en Cognituum; condiciona lo que Orrery puede representar como verificado y desde dónde puede permitir anclar, capturar y canalizar actos. Sin un Contexto confirmado por su Fuente, Orrery no presenta Territorio como verificado, no permite anclar ni capturar y no canaliza actos. Si el Contexto no puede confirmarse, Orrery lo dice y no fabrica uno.

**Razón.** Vocabulario §2.9; decisión V-Q5. Corpus: LocationSnapshot §F.1 (sin vínculo comprobado no se fabrica una Location válida); Agenda Tema 12 ("Core/UI sólo presenta estados verificados y no transforma datos legacy en autoridad").

**Protege.** Que el dónde y la acción estén siempre atados a una soberanía verificada.

**Cumple.** Con binding vencido, el Espacio no dibuja el Project como verificado y la Superficie explica qué falta.

**Viola.** Usar el `active_project_id` de configuración como Contexto sin verificación. Mezclar Entidades de dos Projects en una misma captura.

**Condiciona.** A-2; contrato de Contexto; cambio de organización.

#### C-13. Una Superficie nunca es autoridad

**Enunciado.** Ninguna Superficie de Workspace Core firma, autoriza, adopta, ratifica ni escribe estado autoritativo. Los actos se canalizan hacia la autoridad responsable y se aplican sobre el objeto exacto —misma versión o digest— que la persona vio. Lo que el cliente conserva de un objeto autoritativo es una lectura revalidable, nunca una copia que evolucione por su cuenta.

**Razón.** Vocabulario §2.8. Corpus: Programa MANDATE §8 Fase 6 ("Core no inventa autoridad ni estados"); M-1 (ejecución desde la versión firmada); `Paladin_Client_Object_Model_v0_1.md` §4 (sin copias mutables; revalidación); actos de Mandate con digest y consentimiento en Authority (`mandate_authority_cmd.go`).

**Protege.** Superficie ≠ autoridad; que la persona apruebe lo que efectivamente vio.

**Cumple.** "Aprobar" muestra el digest del contrato y entrega el acto a Authority; si el contrato cambió, el acto se rechaza.

**Viola.** Un botón que marca un Mandate como aprobado en el store del cliente. Permitir a la persona elegir un alcance de firma que su autoridad no habilita, aunque luego falle.

**Condiciona.** Contratos de comando desde Core; diseño del pasaje a Authority; adopción de Postulate.

#### C-14. Nada se vuelve decisión sin un acto humano deliberado

**Enunciado.** Ninguna propuesta —de un modelo, de ASM, de Orrery o de cualquier proceso— se convierte en decisión, criterio, Postulate o Mandate sin un acto humano explícito sobre esa propuesta exacta. Nada se persiste como si fuera decisión por efecto secundario de redactar, navegar o cerrar.

**Razón.** Vocabulario §2.6, §2.8. Corpus: ADR ASM §12 (adopción separada de propuesta; aprobación contra revisión exacta); AGENDA FOLLOWUP §4 (ASM no crea ni ratifica Postulates); Orbital Principio XI y `Paladin_Client_Object_Model_v0_1.md` §3 (la persistencia debe ser deliberada); posicionamiento PALADIN (sólo el humano confirma, modifica o exceptúa).

**Protege.** La autoridad humana, núcleo de Command Respect.

**Cumple.** Una formulación asistida por un modelo queda como propuesta hasta que la persona la adopta.

**Viola.** Adoptar automáticamente una propuesta "lista". Guardar un borrador como Posture de sesión al cerrar la ventana.

**Condiciona.** Flujo de decisión, contrato de Postulate (BR-09), propuesta de criterio (BR-10), D-13 del borrador de investigación (guardar borradores).

### Título VI — Gravity

#### C-15. Gravity se percibe y se cambia por su autoridad; Orrery no la calcula, no la edita y no la ancla al Territorio

**Enunciado.** La estructura normativa de Gravity —Postures, spine, precedencia y Masa— sólo se sitúa en nodos de su spine (NUCLEUS, ORGANIZATION, PROJECT, MANDATE, SESSION) y nunca en Domains ni Genes. Esta exclusión no impide que Orrery haga perceptibles sobre una Entidad del Territorio los efectos, la aplicabilidad, los conflictos o las consecuencias de Gravity respecto del Trabajo situado en ella, siempre mediante Proyección, Lente y Anotación y conservando su Procedencia. Orrery no resuelve, evalúa ni modifica Gravity: muestra lo que su autoridad resolvió y conduce a la persona al camino legítimo de cambio. La Masa explica peso; no decide conflictos.

**Razón.** Vocabulario §2.1, §2.6, §3.8. Corpus: Gene v3.0 §7.5 y contrato GravityGraph §1 (DOMAIN/GENE excluidos de Postures, spine, precedencia y Masa); `ResolveActive` como único resolvedor; Glosario (Masa nunca decide un conflicto); encargo de investigación ("Gravity no se edita arbitrariamente desde una escena").

**Protege.** Gravity ≠ Territorio; que Orrery no se convierta en un segundo evaluador normativo.

**Cumple.** Una Posture declarada a nivel Project se percibe como aplicando a ese Project y su subárbol, con su origen y aplicabilidad por tipo de trabajo; "modificar" lleva al nivel donde fue declarada.

**Cumple también.** Un Mandate situado en Domain "Identidad" fue rechazado por una Posture del Project; una Anotación sobre "Identidad" lo hace perceptible, con Procedencia en la resolución de Gravity y la Posture identificada en su nodo de origen.

**Viola.** Pegar una Posture a un Domain como si allí estuviera declarada. Calcular en el cliente qué Postures aplican. Ordenar dos Postures en conflicto por su Masa.

**Condiciona.** Lectura de criterio (BR-03), lente normativa, F-2 y F-3 (si los nodos DOMAIN/GENE quedan en el spine).

#### C-16. Una colisión tiene tres estados y nunca se confirma por semejanza

**Enunciado.** Toda colisión mostrada está en uno de tres estados —no colisión, confirmada, indecidible— con sujetos, contexto compartido y fundamento identificados. La similitud nunca confirma una colisión, y la imposibilidad de evaluar nunca equivale a compatibilidad.

**Razón.** Corpus: spec de Colisiones §2.2 y §4.2; Impact (`indeterminacy`, `coverage`). Es la aplicación de C-2 a la información normativa, con entidad propia porque gobierna Trabajo y Gravity a la vez.

**Protege.** La capacidad de detectar contradicciones, que es el centro de la promesa de PALADIN.

**Cumple.** Dos Postures cualitativas posiblemente incompatibles aparecen como "indecidible" y piden decisión.

**Viola.** Mostrar sólo "hay conflicto / no hay conflicto". Declarar conflicto porque dos textos se parecen.

**Condiciona.** Contratos de colisión y Assessment (BR-07); evaluación de decisiones.

### Título VII — No interpretación

#### C-17. Orrery no interpreta propósito ni decide Atención

**Enunciado.** Orrery no interpreta para qué le sirve a la persona estar en un lugar, no decide qué es relevante y no clasifica qué requiere Atención: la Atención llega clasificada por el sistema responsable. Por lo mismo, ninguna actividad del sistema cambia por sí sola dónde está o qué hace la persona; los cambios de lugar o de modo ocurren por acto de la persona.

**Razón.** Vocabulario §3.7; decisión V-Q6. Corpus: invariante ratificado de LocationSnapshot ("no interpreta para qué le servirá estar ahí"); Gateway UX v0.1 §2.4 (la actividad de un Mandate no dispara la entrada).

**Protege.** Atención ≠ interpretación de Orrery; la agencia de la persona.

**Cumple.** El workflow de un Mandate expone que espera aprobación; Orrery lo anota y la Superficie lo explica. La persona decide si va.

**Viola.** Un cálculo propio de "qué te necesita" a partir de heurísticas del cliente. Llevar automáticamente a la persona al Espacio porque un Mandate arrancó.

**Condiciona.** Contrato de señales (BR-08), bandeja de Atención, A-8, D-1.

---

## 2. Fronteras y el invariante que las protege

| Frontera | Invariantes |
|---|---|
| representación ≠ verdad | C-1, C-2 |
| Territorio ≠ Trabajo | C-4, C-5 |
| situar ≠ pertenecer | C-4, C-8 |
| Proyección ≠ Fuente | C-1, C-7 |
| Lente ≠ información | C-7 |
| navegación ≠ captura | C-9 |
| Foco ≠ Anchor | C-10 |
| Superficie ≠ autoridad | C-13, C-14 |
| Atención ≠ interpretación de Orrery | C-17 |
| Gravity ≠ Territorio | C-4, C-15 |

---

## 3. Contraste de las decisiones vigentes V-1 a V-16

Referencia: §3 del borrador `Investigacion_Propuesta_Arquitectura_UIUX_Orrery_WorkspaceCore_v0_1.md`.

| ID | Decisión vigente | Clasificación | Lectura con el vocabulario v1.0 |
|---|---|---|---|
| V-1 | Orrery describe dónde está la persona; no interpreta para qué le sirve. | **Constitucional, reinterpretada** | Se aplica al Espacio y a Location (C-11) y a todo Orrery en cuanto a propósito y Atención (C-17). Ya no puede leerse como "Orrery no muestra Trabajo": el Trabajo se percibe por Lentes (C-6, C-7). |
| V-2 | Sólo territorio cruza al motor; las capas sólo dicen dónde dibujar. | **Constitucional, reinterpretada** | Pasa a C-6 y C-8 con "Territorio + Anotaciones". "Capa consumidora" desaparece (vocabulario R-1). |
| V-3 | Constellation↔Orbital como jerarquía continua con zoom; Gravity como capa separada; Orrery como contenedor de vistas. | **Mixta** | Constitucional sólo "Gravity no es Territorio ni un tercer grafo de Territorio" (C-4, C-15). Zoom semántico y contenedor de vistas son arquitectura/UX. Requiere reinterpretación: Constellation y Orbital son Trabajo, no Territorio; su "zoom continuo" no puede ser navegación del Territorio (C-4). |
| V-4 | Gravity en lenguaje humano por defecto; literal bajo demanda. | **Arquitectura/UX** | Su raíz constitucional es C-2 (no mostrar más ni menos autoridad) y C-15. El lenguaje es elección de diseño. |
| V-5 | El gesto de entrada nunca lo dispara la actividad de un Mandate. | **Constitucional en su núcleo** | Núcleo en C-17 (la actividad no cambia por sí sola el lugar o modo). El gesto concreto es UX. |
| V-6 | Foco inicial determinístico; retorno explícito. | **Arquitectura/UX** | Compatible con C-10 (el foco inicial nunca es Anchor). |
| V-7 | `mandateStore` es la única fuente cliente del estado de Mandate. | **Arquitectura (específica de implementación)** | Principio constitucional subyacente: C-13 (copias del cliente no autoritativas, revalidables). El nombre del store no es constitucional. |
| V-8 | Domain y Gene excluidos de Postures, spine, precedencia y Masa. | **Constitucional (heredada de Gravity)** | C-15. Su dueño es el contrato de Gravity; Orrery la respeta y no puede relajarla. |
| V-9 | Orrery consume proyecciones read-only; Gene como entidad; enlaces como relaciones; candidato ≠ relación ratificada. | **Constitucional, salvo la forma visual** | C-1, C-2, C-3. "Curvas o enlaces" es UX. |
| V-10 | Estados de resolución por referencia; nunca modifican la captura. | **Constitucional** | C-11. |
| V-11 | Core no inventa autoridad ni estados. | **Constitucional** | C-13. |
| V-12 | El borrador no confirmado se pierde al cerrar. | **Mixta** | Constitucional: "la persistencia es deliberada; nada se vuelve decisión por efecto secundario" (C-14). Que se pierda al cerrar es decisión de producto abierta (D-13 del borrador). |
| V-13 | Seis respuestas distinguibles ante conflicto con Gravity; reinterpretación y excepción nunca como ejecución ordinaria. | **Mixta** | Constitucional: no presentar una ejecución reinterpretada o exceptuada como ordinaria (C-2). La tabla de seis señales es UX. |
| V-14 | Proponer criterio es retroactivo, no un modo previo. | **Arquitectura/UX** | Raíz constitucional en C-14 (acto deliberado). |
| V-15 | Orrery prioriza orientación y atención; fracasa si cada ejecución es una cosa más que mirar. | **Principio de producto, no invariante** | Es un criterio de calidad, no una prohibición. Guía la arquitectura UI/UX. |
| V-16 | Pregunta rectora: ¿aumenta el trabajo delegable sin repetir, vigilar ni reconstruir decisiones? | **Criterio de producto superior a Orrery** | Gobierna prioridades de todo PALADIN; la Constitución lo presupone (preámbulo), no lo convierte en invariante. |

Ninguna decisión vigente quedó superada sin reemplazo. V-1 y V-2 cambian de alcance por el vocabulario; V-3 pierde su parte territorial de Trabajo.

---

## 4. Casos de prueba: A-1–A-8 y F-1–F-7

No se modifica ningún contrato. La tabla indica qué invariante decide cada caso y qué resolución permite después.

| Caso | Invariantes | Veredicto constitucional | Resolución que habilita |
|---|---|---|---|
| A-1 "Foco principal" de ASM capturado en Location | C-10, C-11 | Lo capturado debe ser un Anchor | Reconciliar el contrato Location–ASM nombrándolo Anchor principal |
| A-2 "Context" de los tres estados no contrastado | C-12 | Orrery sólo depende del Contexto confirmado | Contrastar cuando la tarea sea accesible; no bloquea |
| A-3 Nombres de Lentes abiertos | C-7 | Una Lente no puede llevar nombre de información | Cerrar naming en la arquitectura UI/UX |
| A-4 Source Authority Profile V1 no localizado | C-1, C-2 | La Constitución opera con las clases de Fuente de la Agenda | Localizar; no bloquea, pero limita la precisión de C-2 |
| A-5 Identidad de Relación | C-3 | Una Relación requiere identidad y Fuente | Encargo de identidad uniforme de Relación |
| A-6 Regla 1:1 de UI Contenedora v0.2 §2.2 | C-9, C-3 | Inconstitucional en su lectura literal; su intención (no jerarquía paralela) se conserva en C-3 | Insumo para D-3 |
| A-7 Ledger: cadena de Locations visitadas | C-9 | Inconstitucional | Revisar el documento: el rastro es Navigation State histórico |
| A-8 Borrador de arquitectura con términos previos | C-6, C-7, C-17 | Debe releerse | Actualizar el borrador a v0.2 |
| F-1 `LocationSnapshot` admite NUCLEUS/MANDATE/SESSION | C-4, C-10 | Inconstitucional | Cambio de schema antes de materializar |
| F-2 `DOMAIN_MANDATE` | C-4, C-8 | Admisible sólo como Proyección de situación; nunca como Relación del Territorio ni para vecindad | Decisión del dueño de Gravity sobre su clasificación |
| F-3 DOMAIN/GENE anidados bajo MANDATE en GravityGraph | C-4, C-5 | Admisible sólo si el anidamiento es procedencia y la identidad no depende del Mandate; Orrery no puede derivar estructura del Territorio de ese anidamiento | Decisión del dueño de Gravity/Genes |
| F-4 `GeneRef` bajo `.mandates/{id}/.genes/` | C-5 | Inconstitucional como identidad; aceptable como transición declarada | Transición ya prevista por Gene v3.0 |
| F-5 Prototipo `orrery` | C-2, C-6, C-10 | Inconstitucional en producción | Corregir al implementar |
| F-6 `localLocation` | C-11 | Orrery nunca lo trata como Location | Renombrar sólo con encargo propio |
| F-7 `lastVisitedAnchor` | C-10 | Inconstitucional como Anchor | Corregir al implementar |

Ningún caso exige modificar la Constitución: todos se resuelven con un invariante existente.

---

## 5. Qué queda fuera de la Constitución

Layout y Régimen; uso de 3D; lenguaje por defecto; vocabulario de presentación; gestos de entrada y salida; foco inicial; nombres y catálogo de Lentes; niveles de detalle; endpoints, stores, formatos y motores de render. Todo eso pertenece a decisiones arquitectónicas y a la arquitectura UI/UX, y debe respetar los invariantes C-1 a C-17.

---

## 6. Enmiendas y precedencia

1. Esta Constitución se subordina al vocabulario normativo v1.0 y no redefine sus términos.
2. Todo documento posterior de ORRERY (decisiones D-*, arquitectura UI/UX, vertical slices, encargos de implementación) debe indicar qué invariantes respeta y no puede contradecir ninguno.
3. Un invariante sólo cambia mediante enmienda explícita aprobada por José, con nueva versión del documento y registro de documentos y contratos afectados.
4. Un contrato físico que viole un invariante se registra como conflicto (como F-1 a F-7) hasta su corrección; nunca como excepción tácita.

---

## 7. Decisiones habilitadas al aprobar esta Constitución

| Decisión | Por qué queda habilitada | Invariantes que la acotan |
|---|---|---|
| **D-1** (alcance de "Orrery": experiencia vs motor) | La Constitución ya fija qué rige en cada pieza, independientemente del nombre | C-6, C-7, C-17 |
| **D-2** (convivencia de Espacio y Superficies en el Régimen) | Pasa a ser una decisión de layout: ninguna opción viola la Constitución mientras el Espacio reciba sólo Territorio y Anotaciones | C-6, C-13 |
| **D-3** (qué renderiza el Espacio y cuándo se captura) | C-9 excluye la lectura literal de la regla 1:1; quedan por elegir las formas compatibles | C-3, C-9, C-10 |
| Encargo de revisión del schema de `LocationSnapshot` (F-1, A-1) | Los criterios de admisión de anchors ya están fijados | C-4, C-10, C-11 |
| Consulta al dueño de Gravity/Genes sobre F-2, F-3, F-4 | Los criterios de aceptabilidad ya están fijados | C-4, C-5, C-15 |
| Actualización del borrador de arquitectura UI/UX a v0.2 (A-8) y del documento de Ledger (A-7) | El vocabulario y los invariantes alcanzan para releerlos | Todos |

Después de esas decisiones siguen, en el orden normativo: arquitectura UI/UX, vertical slices e implementación.
