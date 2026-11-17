# Orrery — informe de control para Antigravity (Windows)

| Campo | Valor |
|---|---|
| Corte | 2026-11-14 |
| Propósito | Transferir estado, fuentes, tareas y dependencias para gestionar la continuidad de Orrery entre Darwin y Windows. |
| Autoridad | José Vigil decide producto, diseño y alcance. Este informe no aprueba variantes ni modifica contratos. |
| Raíz de rutas | `bloom-development-extension/`; todas las rutas de abajo son relativas a esa raíz. En Windows, el checkout consultado está en `C:\repos\bloom-development-extension`. |
| Referencia local | HEAD observado: `341e3fc1`. Los cambios de Orrery y DOC citados estaban limpios en el árbol de trabajo al preparar este informe. |

## 1. Instrucción de José y estado operativo

Antigravity debe poder **seguir el estado de Orrery**, hacer visibles las dependencias y llevar a José las preguntas que requieran su decisión. El trabajo de fondo de Windows (Antigravity y Codex) y el trabajo de Darwin (Cloud CoWork, concentrado en Orrery y DOC) son líneas coordinadas por José, no fuentes intercambiables de autoridad.

**Pausa actual indicada por José:** no continuar ahora con nuevas decisiones o desarrollo sustantivo de Orrery. Esperar el resultado de Genesis, que debe aportar un grafo, y la consolidación del nuevo intent `doc`, que incorpora información estructural de Tenant, Organization, Project, Domain y Gene. Durante esta espera sí corresponde conservar el estado, contrastar entregables cuando lleguen e identificar las preguntas que Orrery deberá formularles. La pausa no significa que Genesis o `doc` ya estén integrados con Orrery.

## 2. Dónde quedó Orrery

Orrery ya tiene una **base normativa de experiencia** y una **dirección visual de research**. La norma no se deriva de las maquetas. El [Estado Base](Orrery_Estado_Base_v1_0.md) es el índice histórico de precedencia; contrastarlo con estas fuentes vigentes:

| Fuente | Ruta | Estado y función |
|---|---|---|
| Vocabulario | `docs/ANALYSIS/ORRERY/Orrery_Vocabulario_Normativo_v1_1.md` | Normativo. Define Territorio, Espacio, Entidad, Relación, Fuente, Trabajo, Lente, Superficie, Contexto, Foco y demás términos. |
| Constitución | `docs/ANALYSIS/ORRERY/Orrery_Constitucion_v1_1.md` | Normativa. Invariantes de representación, autoridad, territorio, trabajo, Lentes y navegación. |
| Decisiones | `docs/ANALYSIS/ORRERY/Orrery_Decisiones_Arquitectonicas_v1_1.md` | Normativas D-1 a D-4; D-4 mantiene congelada la implementación de Workspace Core Orrery hasta una decisión posterior. |
| Experience Model | `docs/ANALYSIS/ORRERY/EXPERIENCE/Orrery_Experience_Model_v1_0.md` | Normativo. Secuencia, indicación, Foco, Superficie, Lentes, cobertura, Procedencia y requisitos de información. |
| Universo Fase 1 | `docs/ANALYSIS/ORRERY/VISUAL/Orrery_Estructura_Base_Universo_Fase1_Definicion_v0_1.md` | Definición de research de José, **no normativa**. Tenant base, Project manzana, Domain edificio, Gene piso; calles y tuberías con límites de Fuente. D-E1 a D-E6 siguen como opciones por decidir, no como aprobación de una variante. |
| Handoff previo | `docs/ANALYSIS/ORRERY/Orrery_Traspaso_Cloud_Darwin_Estado_Recoleccion_y_Genes_2026-10-30.md` | Corte documental anterior. Útil para genealogía de preguntas; su inventario de prototipos quedó superado por las corridas C0–C3 agregadas después. |

Las primeras maquetas y el cierre crítico están en `docs/ANALYSIS/ORRERY/VISUAL/primer_corte/` y `docs/ANALYSIS/ORRERY/Orrery_Cierre_Exploracion_Codex_y_Verificacion_Cloud_2026-10-24.md`. José consideró el primer corte una aproximación útil, pero insuficiente para leer territorialidad, horizonte y espacio tridimensional. La estructura urbana posterior responde a esa observación; todavía necesita evidencia de comprensión y datos reales.

### Corridas visuales comparables ya disponibles

El commit `64e13a99` agregó cuatro HTML independientes y capturas en `docs/ANALYSIS/ORRERY/VISUAL/IMAGES/V_02/`. Sus **rutas reales** son las siguientes; algunos comentarios internos mencionan una ubicación propuesta `VISUAL/corridas_fase1/` que no existe en este checkout.

| Corrida | Ruta HTML desde la raíz | Lo que explora | Estado |
|---|---|---|---|
| C0 | `docs/ANALYSIS/ORRERY/VISUAL/IMAGES/V_02/C0_linea_base.html` | Línea base: Gene como placa textual. | Prototipo exploratorio. |
| C1 | `docs/ANALYSIS/ORRERY/VISUAL/IMAGES/V_02/C1_ficha_en_capas.html` | Piso mínimo; función, revisiones, apariciones, Repositories y activos en Superficie por capas. | Prototipo exploratorio. |
| C2 | `docs/ANALYSIS/ORRERY/VISUAL/IMAGES/V_02/C2_gene_por_lentes.html` | Lectura del Gene por Lentes e indicaciones. | Prototipo exploratorio. |
| C3 | `docs/ANALYSIS/ORRERY/VISUAL/IMAGES/V_02/C3_despiece_FN.html` | Despiece espacial de revisiones y activos. | Exploración **fuera de norma**; no candidata por defecto. |

Los HTML admiten datos simulados y un fixture G1 `test_only`; **ninguno consume datos productivos de Orrery**. Las PNG de `V_02/` son capturas de referencia. Las imágenes anteriores están en `VISUAL/IMAGES/V_01/` y `VISUAL/corte_espacial_04/capturas/`. No se encontró aquí un informe Markdown de evaluación de C0–C3 ni una selección aprobada por José. Antigravity debe registrar las corridas como alternativas, no como solución elegida.

## 3. Estructura de información que condiciona el diseño

| Tema | Fuente desde la raíz | Lectura vigente para gestión |
|---|---|
| Gene conceptual | `docs/GENES/COGNITUUM_GENE_CONCEPT_v3_0.md` | Gene es identidad funcional durable dentro de un Project; Revisiones, activos y Relaciones con Domains. Domain↔Gene N:M ratificada, no ubicación física de archivos. |
| Persistencia Gene | `docs/GENES/COGNITUUM_GENE_CANONICAL_PERSISTENCE_MATERIALIZATION_CONTRACT_v0_1.md`; `installer/nucleus/internal/gene/` | G1 tiene store y fixture. Contrastar cualquier afirmación de publicación productiva con código y pruebas vigentes; el contrato no entrega por sí solo un lector de Orrery. |
| Lifecycle documental de Gene | `docs/GENES/GENE_DOCUMENT_LIFECYCLE_REQUIREMENTS_v0_1.md` | Requerimientos de vigencia documental; no confundir con capacidad productiva ya comprobada. |
| Programa `doc` | `docs/ANALYSIS/BSIP/DOC/Programa_Documentacion_Documento_Madre_v0_7.md` | Documento madre vigente en este checkout; investigación y decisiones registradas, no implementación completa. Versiones v0.1–v0.6 históricas. |
| Alcance y recorrido `doc` | `docs/ANALYSIS/BSIP/DOC/Encargo_Doc_Intent_Actualizacion_Viva_v1_0.md`; `docs/ANALYSIS/BSIP/DOC/Programa_Documentacion_Politica_Doc_por_Intent_Relevamiento_v0_1.md`; `docs/ANALYSIS/BSIP/DOC/Programa_Documentacion_Registro_Documental_Mapa_Decision_v0_1.md` | Requisitos, política y opciones de registro. El `docs/` manual de este repo queda fuera del sistema documental productivo según el documento madre; no usarlo como ejemplo de pertenencia automática a un nodo. |
| Avance `doc` | `docs/ANALYSIS/BSIP/DOC/TRASPASOS/Traspaso_P0_Estado_Partida_v1_0.md`; `docs/ANALYSIS/BSIP/DOC/TRASPASOS/Traspaso_D1_Brain_v1_0.md`; `docs/ANALYSIS/BSIP/DOC/Ficha_Interfaz_Doc_Nucleus_v1_0.md` | P0 auditó anclas. D1 declara implementación y pruebas en nube Linux, con compuerta del binario Mac pendiente en el acta; la ficha explicita disparos aún no soportados. Verificar estado más reciente antes de cerrar tareas. |
| Mandate/Intent productores | `docs/MANDATE/MANDATE_PROGRAM_CANONICAL_SOURCE_v0_1.md`; `docs/BSIP/TYPES/DOC_Intent_Spec_v1_0.md`; `docs/BSIP/TYPES/ING_Intent_Spec_v1_1.md`; `docs/BSIP/TYPES/DIS_Intent_Spec_v1_0.md` | Fuentes para distinguir contrato, propuesta, resultado de Trabajo y Entidad ratificada. |
| Location y grafo | `docs/ANALYSIS/ORRERY/LOCATION/ORRERY_LOCATION_MATERIAL_CLOSURE_v1_1.md`; `docs/ANALYSIS/ORRERY/LOCATION/Orrery_LocationSnapshot_v0.md`; `docs/ANALYSIS/GRAVITY/GRAFO/Investigacion_GravityGraph_DomainGene_Relacion_v0_1.md` | Contratos y research previos. El futuro grafo de Genesis debe compararse contra ellos, sin asumir compatibilidad. |

La pregunta estructural abierta para Orrery es **cómo pasar de Fuentes canónicas a una proyección territorial verificable**. Un documento puede ser activo de una Gene Revision o resultado de un Mandate; eso no equivale por sí solo a pertenencia canónica a Domain, Project, Organization o Tenant. El nuevo programa `doc` investiga y construye ese puente. El mapa de sus inconsistencias y preguntas debe volver al documento madre, no resolverse desde una maqueta de Orrery.

## 4. Registro de tareas para Antigravity

| ID | Tarea de seguimiento | Estado al corte | Evidencia para actualizarla | Dueño del resultado |
|---|---|---|---|---|
| OR-01 | Conservar la base normativa y la definición visual Fase 1 como referencias distintas. | Disponible. Sin nueva decisión. | Fuentes de §2; cualquier nueva aprobación expresa de José. | José / cowork Orrery. |
| OR-02 | Mantener accesibles C0–C3 y sus capturas para comparación; anotar que son simulaciones. | HTML y PNG versionados; sin selección aprobada. | Abrir cada HTML desde `V_02/`; registrar fallas de ejecución si aparecen. | Darwin/Orrery. |
| OR-03 | Recibir el resultado de Genesis y su grafo, con identidad, Relaciones, Procedencia, vigencia y ruta/API de lectura. | **Esperando entregable; no se afirma que el grafo esté listo.** | Documento/contrato, código o respuesta real de Genesis y prueba de lectura. | Work Genesis en Windows; José coordina. |
| OR-04 | Recibir el estado consolidado de `doc`: identidad documental, pertenencia a los cinco niveles, registro, actualización y lectura. | Documento madre v0.7; D1 parcial según acta del 10-11. **Consolidación pendiente.** | Versión nueva del documento madre, traspasos posteriores a D1 y resultados de prueba Mac/productivos. | Cowork DOC en Darwin; sistemas dueños de interfaces. |
| OR-05 | Contrastar el grafo Genesis y el contrato `doc` con Vocabulario, Constitución, Experience Model, Gene v3 y Location. Registrar coincidencias, choques y ausencias con citas. | Preparado como trabajo posterior a OR-03/04. | Matriz Fuente→campo→autoridad→cobertura→lector; ejemplo real de Project. | Cowork Orrery; Antigravity sigue dependencias. |
| OR-06 | Decidir qué información del Gene aparece en piso, indicación, Foco y Superficie, y qué requiere lector de contenido documental. | Cuatro variantes simuladas; **sin decisión**. | Comparación C0–C3 más datos verificados de OR-05; decisión expresa de José. | José, con investigación de Darwin. |
| OR-07 | Resolver D-E1..D-E6 y, después, evaluar el siguiente corte visual y humano. | Opciones abiertas en Universo Fase 1. | Alternativas y observaciones sobre datos reales y corridas. | José. |
| OR-08 | Reabrir el protocolo experimental v0.1 sólo cuando el diseño y los datos hagan útil una prueba formal. | Borrador; duración fija y dos sesiones obligatorias rechazadas. | `INTERACTION/Orrery_Correccion_Continuidad_Protocolo_2026-10-18.md` y nuevas decisiones. | José / cowork Orrery. |

**Secuencia de control pedida por José:** registrar OR-03 y OR-04 como dependencias externas activas; mantener OR-05 a OR-08 pendientes de sus resultados. No iniciar una nueva corrida, selección visual, integración o cambio de contrato de Orrery por el solo hecho de que exista este informe. Cuando lleguen Genesis y `doc`, primero verificar qué fue realmente producido y accesible; después presentar a José las alternativas que requieran decisión.

## 5. Preguntas preparadas para los entregables

1. ¿Qué nodos y aristas entrega el grafo de Genesis, con qué identidad, autoridad, Procedencia, vigencia y cobertura? ¿Qué es ratificado y qué es propuesta o resultado de Trabajo?
2. ¿El grafo incluye Domain↔Gene canónico y Genes sin Domain? ¿Cómo enumera Repositories y cómo distingue un vínculo documental de la ubicación de un archivo?
3. ¿Qué documento identifica `doc` de manera estable, incluso tras moverlo o renombrarlo? ¿Dónde declara pertenencia a Tenant, Organization, Project, Domain o Gene, y quién ratifica esa declaración?
4. ¿Qué entrega hoy una lectura productiva de Gene: identidad, función, revisión, activos, lista de documentos, contenido, validez y Relaciones? Señalar para cada campo productor, formato y ausencia.
5. ¿Cómo distingue el lector un dato inexistente de uno todavía no observado, una revisión capturada de CURRENT y una propuesta de un hecho ratificado?
6. Con los datos efectivamente disponibles, ¿cuáles de C0–C3 pueden evaluarse sin inventar información? ¿Qué información rica debe permanecer en la Superficie y cuál puede indicarse en el Espacio?

Estas preguntas no sustituyen las decisiones de José. Antigravity debe presentarle contradicciones con ambas fuentes y sus citas; no elegir una por su cuenta.

## 6. Material auxiliar y límites

- Investigación de interacción: `docs/ANALYSIS/ORRERY/INTERACTION/Orrery_Interaction_Research_Lente_Seleccion_Indicacion_v0_2.md`, `Orrery_Interaction_Experiment_Protocol_v0_1.md` y `Orrery_Correccion_Continuidad_Protocolo_2026-10-18.md` en la misma carpeta.
- Research morfológico y presupuesto de canales: `docs/ANALYSIS/ORRERY/VISUAL/Orrery_Morphological_Spatial_Language_Research_v0_1.md` y `Orrery_Channel_Budget_Interaction_Reservation_v0_1.md`.
- Código de integración actual: `installer/conductor/workspace/core/orrery/`. Su presencia no levanta el congelamiento D-4 ni convierte los fixtures en datos productivos.
- El Project de Claude puede conservar actas o fuentes que no están en este checkout. Si se usan, registrar nombre, versión y procedencia; no asignarles una ruta de repo inexistente.

**Punto exacto para retomar:** después de recibir y verificar el grafo de Genesis y el contrato/estado consolidado de `doc`, producir el contraste OR-05. Recién con ese contraste será posible decidir qué parte de la riqueza del Gene puede mostrarse con evidencia y qué parte sigue siendo simulación o contrato pendiente.
