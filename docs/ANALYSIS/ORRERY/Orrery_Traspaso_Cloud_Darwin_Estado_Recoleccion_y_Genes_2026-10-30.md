# Orrery — traspaso a Cloud CoWork en Darwin: estado, recolección y profundidad de Gene

| Campo | Valor |
|---|---|
| Fecha de corte | 2026-10-30 |
| Tipo | Informe de continuidad y encargo de investigación. No es norma ni aprobación de diseño. |
| Autoridad de diseño | José Vigil |
| Origen | Work ORRERY en Codex/Windows; contraste de los works DOMAINS y GENES |
| Destino | Cloud CoWork en la máquina Darwin, sobre una copia sincronizada de `bloom-development-extension` |
| Referencia Git local | `a0d38e1b84f8eb2155def11d72de4090872f0d87` al redactar; el commit de Universo Fase 1 y capturas es `87893ef9` |

## 0. Instrucción de lectura

Las rutas de este informe son **relativas a la raíz del repositorio** y sirven también en Darwin. Antes de usarlo, comprobar que el checkout de Darwin contiene `87893ef9` o un descendiente con los mismos documentos e imágenes. Este informe no reemplaza a las fuentes: para Orrery mandan su Vocabulario, Constitución, Decisiones y Experience Model; para Gene, el concepto v3.0 y los contratos físicos vigentes. Una propuesta, una captura sintética o una conversación no crea por sí sola una Fuente canónica.

## 1. Resumen del punto de corte

José decidió continuar **la investigación y el desarrollo visual de Orrery en Cloud CoWork**. En Codex se hizo el traspaso documental, se preparó una maqueta SVG inicial y un corte espacial 01 en PlayCanvas, y se documentó la evaluación crítica de esa maqueta. Después, José y el cowork desarrollaron una definición más precisa de **Universo Fase 1**: una ciudad sobre una placa madre, con Tenant como base, Projects como manzanas, Domains como edificios, Genes como pisos o estratos y tuberías que sólo manifiestan conectividad cuando la Fuente la acredita. Esa definición, no la maqueta SVG, es la base visual actual de investigación. Sigue siendo **research no normativo** y conserva decisiones pendientes.

El repo contiene [la definición de Universo Fase 1](VISUAL/Orrery_Estructura_Base_Universo_Fase1_Definicion_v0_1.md) y [diez capturas preliminares](VISUAL/IMAGES/V_01/) de las variantes T1/T2/T3, Foco, tuberías, pila abierta, vista plana y detalle documental. Las capturas muestran **datos simulados** y no aprueban formas finales ni demuestran lectura humana. En el checkout local se encuentran [la escena gris](VISUAL/escena_gris/index_1.html), [la maqueta SVG](VISUAL/primer_corte/index.html) y [un corte espacial 01](VISUAL/primer_corte/index-1.html) basado en PlayCanvas. **No se encontró en este repo un HTML ejecutable identificado como corte 03 o 04.** El cowork debe localizar su fuente de ejecución en Darwin/Project antes de asumir que las capturas son reproducibles desde este checkout; no reconstruirla por inferencia a partir de PNGs.

El trabajo inmediato ya no es elegir de nuevo si Orrery debe ser espacial ni volver a inventar la cámara. Es **determinar qué información real puede nutrir esta estructura, de qué Fuente viene, con qué estado de autoridad y cómo se hace visible sin transformar analogías urbanas en afirmaciones falsas sobre el filesystem**. El desarrollo más intenso se concentrará en Gene: el piso que hoy parece una placa con texto debe permitir comprender una identidad funcional mucho más rica mediante indicación, Foco y Superficie, respetando qué datos están realmente disponibles.

## 2. Fuentes y cambios que debe recuperar Darwin

| Orden | Archivo o conjunto | Papel y estado |
|---|---|---|
| 1 | [Estado Base](Orrery_Estado_Base_v1_0.md), [Vocabulario v1.1](Orrery_Vocabulario_Normativo_v1_1.md), [Constitución v1.1](Orrery_Constitucion_v1_1.md), [Decisiones v1.1](Orrery_Decisiones_Arquitectonicas_v1_1.md), [Experience Model v1.0](EXPERIENCE/Orrery_Experience_Model_v1_0.md) | Índice y cuatro fuentes normativas vigentes; el código de Orrery sigue congelado según D-4. |
| 2 | [Research morfológico](VISUAL/Orrery_Morphological_Spatial_Language_Research_v0_1.md), [presupuesto de canales](VISUAL/Orrery_Channel_Budget_Interaction_Reservation_v0_1.md), [escena gris](VISUAL/escena_gris/index_1.html) | Research y evidencia técnica previos; el presupuesto conserva preguntas y decisiones no cerradas. |
| 3 | [Research de interacción v0.2](INTERACTION/Orrery_Interaction_Research_Lente_Seleccion_Indicacion_v0_2.md), [protocolo v0.1](INTERACTION/Orrery_Interaction_Experiment_Protocol_v0_1.md), [corrección de continuidad](INTERACTION/Orrery_Correccion_Continuidad_Protocolo_2026-10-18.md) | El protocolo v0.1 es borrador histórico. José rechazó un uso o prueba cortados por los ~95 minutos y dos encuentros obligatorios. Los umbrales e hipótesis no fueron aprobados. |
| 4 | [Índice local de continuidad](Orrery_Continuidad_Local_2026-10-18.md), [cierre del primer corte](Orrery_Cierre_Exploracion_Codex_y_Verificacion_Cloud_2026-10-24.md), actas de traspaso a Codex | Procedencia del rescate documental y evaluación del primer corte. El índice anterior no refleja todo lo conversado después del 18 de octubre; este informe fija el corte actual. |
| 5 | [Universo Fase 1](VISUAL/Orrery_Estructura_Base_Universo_Fase1_Definicion_v0_1.md) y [capturas V_01](VISUAL/IMAGES/V_01/) | Definición de research de José y primeras imágenes. Documento agregado en `87893ef9`; todavía deja D-E1..D-E6 y el alcance del corte 04 pendientes. |
| 6 | [Gene Concept v3.0](../../GENES/COGNITUUM_GENE_CONCEPT_v3_0.md), [persistencia/materialización G1 y extensión G2](../../GENES/COGNITUUM_GENE_CANONICAL_PERSISTENCE_MATERIALIZATION_CONTRACT_v0_1.md), [requisitos de lifecycle documental](../../GENES/GENE_DOCUMENT_LIFECYCLE_REQUIREMENTS_v0_1.md) | Concepto canónico, contrato físico y requerimientos posteriores. El documento de lifecycle **no** equivale a una capacidad productiva ya disponible ni autoriza lectura de contenido documental. |
| 7 | [ING v1.1](../../BSIP/TYPES/ING_Intent_Spec_v1_1.md), [DIS v1.0](../../BSIP/TYPES/DIS_Intent_Spec_v1_0.md) y [clasificación v0.3](../../SYNAPSE_SIMULATOR/SYNAPSE_SIMULATOR_ING_Classification_Contract_v0_3.md) | Productores y propuestas de topología. Distinguir contrato ratificado, diseño pendiente y ejecución física comprobada. |

Los works DOMAINS y GENES son contexto adicional de conversación: DOMAINS hizo un relevamiento **de solo lectura**; GENES implementó y verificó el paquete local G1, pero su resultado no demuestra una cadena productiva completa ING/DIS→Domain/Gene→Orrery. Leer sus conclusiones junto con los documentos y comprobar cualquier afirmación de runtime contra el código y el despliegue de Darwin. No tratar el título o resumen de un work como Fuente.

## 3. Modelo que ya puede usarse para razonar

1. **Domain y Gene son identidades independientes dentro de un Project.** Domain es territorio funcional o conceptual; Gene es identidad funcional durable. Su relación es N:M, ratificada y con Procedencia/vigencia propias ([Gene v3.0, §§2.1, 2.6, 7.4](../../GENES/COGNITUUM_GENE_CONCEPT_v3_0.md)). Un Gene V1 no cruza Projects ni Organizations.
2. **Un piso repetido no crea varios Genes.** Si un Gene se relaciona con varios Domains del mismo Project, puede tener una aparición en cada edificio; la identidad es una sola. Las tuberías del Universo Fase 1 conectan esas apariciones sólo cuando las Relaciones ratificadas lo justifican. Ni la calle ni la tubería sin manifestar son una Relación por sí mismas.
3. **Un archivo no tiene edificio canónico.** Los activos `file`, `document` y `test` se conservan en Gene Revisions. Su referencia física usa `project_id + repository_id + ruta relativa normalizada` ([contrato físico, §4](../../GENES/COGNITUUM_GENE_CANONICAL_PERSISTENCE_MATERIALIZATION_CONTRACT_v0_1.md)). No hay contrato vigente de pertenencia canónica directa archivo↔Domain ni de partición exclusiva de archivos por edificios. La asociación indirecta activo→Gene Revision→Gene↔Domain no autoriza dibujar una ubicación física única del activo en el Domain.
4. **Compartir un activo entre dos Genes sigue necesitando precisión contractual.** DOMAINS no halló una regla explícita que lo permita o prohíba semánticamente. El store G1 identifica el activo sin incorporar `gene_id` a su identidad física, pero eso no decide por sí solo la regla de pertenencia constitutiva entre Genes. El contrato propuesto de clasificación inicial distribuye archivos sin duplicados entre clusters en **ese intercambio**; no impone una partición permanente del Project.
5. **Un Gene puede existir sin Domain ratificado.** El primer Gene productivo puede publicarse sin tal Relación; el materializador no crea Domains ([contrato físico, §11.5](../../GENES/COGNITUUM_GENE_CANONICAL_PERSISTENCE_MATERIALIZATION_CONTRACT_v0_1.md)). Orrery no puede dejarlo sin lugar. La posición visual de esos Genes y de Repositories es D-E2, aún pendiente.
6. **Gene es más que un rótulo.** Tiene función declarada, revisión vigente y eventualmente historia de revisiones, Contributions, activos observados, digests, Procedencia, ratificación y Relaciones. La placa textual del prototipo sólo deja ver una fracción. La norma permite usar la Superficie para comprender contenido y detalle; el Espacio debe conservar identidad y orientación, sin presentar una lista documental como si fuera el Gene completo.

## 4. Preguntas que se deben contestar antes de poblar Orrery con datos reales

Para cada respuesta, entregar **Fuente concreta, versión/estado, forma de acceso en Darwin, productor, autoridad, cobertura y ejemplo verificable**. Si no existe productor o lector, marcarlo `NO DISPONIBLE`; no completar con un dato sintético sin rotular.

| Frente | Pregunta precisa | Resultado esperado |
|---|---|---|
| Contexto y Territorio | ¿Cuál es el Contexto confirmado real y qué Tenant, Organization, Project y Repositories autoriza a navegar? | Ruta de lectura autorizada, identidad de cada Entidad y límite del Territorio. No inferir alcance desde carpetas locales. |
| Domain | ¿Dónde se conserva hoy la identidad canónica de Domain, su Procedencia, estado y vigencia? ¿Qué es propuesta ING, qué es Domain declarado por Mandate y qué está ratificado? | Separación de tres estados con ejemplos y evidencia. |
| Domain↔Gene | ¿Quién publica y quién lee las Relaciones N:M ratificadas? ¿Existe ya en Darwin un store o API productiva, o sólo contrato/proyección transitoria? | Ruta de dato que permita dibujar pisos repetidos y tuberías sin inventar vínculos. |
| Gene | ¿Qué mecanismo devuelve `gene_id`, función declarada, `current_revision_id`, revisión capturada, estado de ratificación y Procedencia? | Perfil mínimo de Gene, con autoridad por campo y error/cobertura cuando falta. |
| Activos | ¿Qué devuelve la Gene Revision para `file`, `document` y `test`? ¿Cómo se resuelve `repository_id` y se verifica la ruta/digest? ¿Puede un mismo activo integrar revisiones de distintos Genes? | Lista declarada de activos con identidad verificable; respuesta explícita sobre compartición o hueco contractual. |
| Conocimiento documental | ¿La Fuente entrega sólo referencias a documentos declarados, o existe un lector gobernado del **contenido**? ¿Quién decide si la documentación constitutiva sigue válida tras una Contribution? | Frontera entre lista, contenido, resumen elaborado y evidencia de vigencia. No prometer navegación de contenido sin contrato. |
| Gene sin Domain y Repository | ¿Cómo se enumeran los Genes ratificados sin Relación Domain y los Repositories del Project? | Datos necesarios para D-E2 sin esconder Entidades. |
| Cobertura y ausencia | ¿La Fuente declara universo completo y revisión observada? ¿Cuándo una ausencia significa *ninguno* y cuándo *desconocido*? | Regla de lectura que evite mostrar una ciudad falsamente vacía. |
| Trabajo y Gravity | ¿Qué datos y cobertura reales existen para las Lentes P-W1/P-G2 en Domain y Project? | Datos de Lente separados de estructura. Si faltan, «activa sin datos» y *desconocido*; creación/ejecución de Mandates es Fase 2. |

**Caso de prueba recomendado:** elegir un Project real con, si existe, un Gene con dos Relaciones Domain ratificadas y una Revision con activos en al menos un Repository. Si tal caso no existe, documentar la ausencia y usar un fixture sintético claramente rotulado para verificar geometría; no llamar a ese fixture evidencia productiva. El resultado debe mostrar la misma identidad Gene en ambos edificios, una sola referencia física por activo y una Superficie que explique la Relación y su Procedencia. No requiere dibujar archivos como edificios, pisos o destinos de calles.

## 5. Requerimiento para el cowork en Darwin

1. **Sincronizar y auditar el corpus mínimo de §2.** Verificar especialmente el commit `87893ef9`, el documento de Universo Fase 1, las diez imágenes y la disponibilidad del código ejecutable que produjo las capturas. No reemplazar capturas por una implementación imaginada.
2. **Construir una matriz Fuente→dato→autoridad→cobertura→consumidor** para §4. Separar contrato documental, código que existe, servicio desplegado y dato real observado. La existencia de un schema o un fixture no prueba un productor en funcionamiento.
3. **Trazar una vertical Gene concreta** desde Contexto confirmado y Domain/Gene ratificados hasta Gene Revision y activos, con una muestra auditada. Identificar cada puente ausente, incluido el de Domain↔Gene canónico hacia Orrery. Evitar leer contenido de documentos o secretos por rutas improvisadas.
4. **Proponer una ficha de información de Gene en capas:** (a) identidad y estado que se reconoce en el piso, (b) indicación permitida por Experience Model §4.4, (c) Superficie de detalle con función, revisión, Procedencia, apariciones y lista de activos **si la Fuente lo autoriza**, (d) eventual contenido y explicación derivados sólo tras definir contrato de lectura, evidencia y vigencia. Cada campo debe citar su Fuente; no presentar una síntesis generada como verdad canónica.
5. **Revisar D-E1..D-E6 del Universo Fase 1 con evidencia**, en especial identificación de Gene sin nombre, lugar de Repositories y Genes sin Domain, orden neutro de pisos y el canal del resaltado. Preparar alternativas concretas para José, sin convertir opciones ilustradas en decisiones.
6. **Devolver un informe de viabilidad y siguiente corte.** Especificar qué puede mostrarse con datos reales hoy, qué necesita trabajo en GENES/DOMAINS/Authority y qué queda como hipótesis de renderización. Proponer un incremento visual comprobable que haga al Gene más informativo sin desbordar el Espacio de texto y sin modificar la norma o contratos por comodidad.

El entregable de esta fase es **un mapa de datos y una propuesta de presentación trazable**. No es un pedido de implementar un lector de documentos, cambiar el modelo de Genes, abrir el Contexto a otros Tenants ni modificar `installer/conductor/workspace/core/orrery/`. Cualquier cambio de esos contratos requiere decisión propia de José y del dueño correspondiente.

## 6. Horizonte de producto

La ciudad ofrece orientación y recorrido: dónde se sitúan Projects y Domains, qué Genes aparecen en cada Domain y qué conectividad está acreditada. La próxima ganancia para la persona debe venir de **comprender el Gene como función durable y conocimiento verificable**, no de colocar más texto sobre la placa 3D. La Superficie puede crecer de una lista declarada a una explicación rica sólo cuando existan Fuentes, contratos de lectura y evidencia de vigencia suficientes. Las Gene Revisions y Contributions deben permitir distinguir lo actual, lo capturado, lo propuesto y lo desconocido; la cercanía visual nunca sustituye esa autoridad.

Las preguntas sobre relaciones entre Genes y sobre tuberías que cruzan Projects, Organizations o Tenants son dirección futura, fuera de V1. La Fase 2 de creación/ejecución de Mandates sigue separada como Trabajo proyectado por Lentes. El protocolo experimental v0.1 permanece pendiente de revisión; no determina el avance visual ni impone una duración máxima de uso.
