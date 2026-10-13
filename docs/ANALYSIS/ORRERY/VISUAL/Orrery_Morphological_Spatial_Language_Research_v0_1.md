# Orrery — Investigación del lenguaje morfológico y espacial v0.1

| Campo | Valor |
|---|---|
| Documento | `docs/ANALYSIS/ORRERY/VISUAL/Orrery_Morphological_Spatial_Language_Research_v0_1.md` (copia en Project BTIPS: `ANALYSIS/ORRERY/VISUAL/Orrery_Morphological_Spatial_Language_Research_v0_1.md`) |
| Tipo | **Investigación. No normativa.** Se ubica como research vigente, subordinado a Vocabulario v1.1, Constitución v1.1, Decisiones arquitectónicas v1.1 y Experience Model v1.0. No es Arquitectura UI/UX, ni Interaction Grammar, ni design system |
| Estado | Borrador para revisión de José |
| Fecha | 2026-10-13 |
| Encargo | "ENCARGO — ORRERY MORPHOLOGICAL / SPATIAL LANGUAGE RESEARCH v0.1" (José, adjunto al cowork) |
| Base normativa | Vocabulario v1.1 · Constitución v1.1 (C-1..C-17) · Decisiones v1.1 (D-1, D-2, D-3, D-3.b, D-4) · Experience Model v1.0 (DJ-1..DJ-11) |
| Referencia física | `main` @ `8b8101a`. El árbol de trabajo tiene sin commitear Vocabulario v1.1, Constitución v1.1, Decisiones v1.1, Experience Model v1.0 y Estado Base v1.0; se leyeron desde el árbol de trabajo |
| Autoridad de diseño | José Vigil (única) |
| No hace | No diseña Orrery. No asigna formas a Entidades, Relaciones, Lentes ni Anotaciones. No define paleta, iconografía, escena, Interaction Grammar ni contratos. No modifica código ni documentos normativos |

### Decisiones de José que rigen este trabajo (2026-10-13)

| ID | Decisión | Efecto en este documento |
|---|---|---|
| DM-1 | Se aprueba el corpus, el material adicional y el archivo a crear. | §1 |
| DM-2 | El Experience Model §4.7 es límite normativo: la contención y la extensión son lo único que el Espacio aporta de forma propia, y ningún fenómeno puede ser perceptible sólo en 3D. Lo que la investigación encuentre más allá de ese límite se registra como hipótesis y no se adopta. | §8, §16 (CR-11) |
| DM-3 | Los ejemplos con forma que aparecen en la norma ("el Project como región", "un halo sobre el Project", "núcleo/envolvente", "borde") son ilustrativos, no asignaciones de forma. | §5–§13 |
| DM-4 | Se autoriza la consulta web para la documentación de PlayCanvas y la literatura de visualización. | §11, Anexo A |
| DM-5 | No se incluyen diagramas analíticos (José no los pidió; el valor por defecto era ninguno). | Todo el documento es texto y tablas |

> **Marcas de evidencia usadas en todo el documento.**
> - **[REF]** observado directamente en una de las cuatro imágenes del corpus visual.
> - **[LIT]** literatura verificada en fuente primaria o registro bibliográfico (Anexo A, identificador L-n).
> - **[PC]** documentación oficial de PlayCanvas (Anexo A, identificador PC-n).
> - **[NORMA]** se apoya en un documento normativo, citado como `Vocab §x`, `C-n`, `D-n`, `EM §x`.
> - **[HIST]** antecedente histórico o borrador reemplazado; se lee a través del vocabulario vigente y no tiene autoridad.
> - **[HIP]** hipótesis de esta investigación; sin evidencia empírica propia.
>
> **Regla de lectura.** Cuando este documento dice que una primitiva "puede" comunicar algo, describe una **capacidad expresiva**. Nunca dice qué término de Orrery debe representarse con ella (encargo §5; DM-3).

---

## 0. Resumen ejecutivo

1. **Lo que hace inteligibles a las referencias positivas no es la tridimensionalidad, sino la disciplina.** Las tres imágenes de Transformers usan alrededor de diez marcas distintas, cada una con una sola función. La relación central se destaca dentro de un contexto que sigue visible, y una superficie de precisión acompaña a la escena. Su espacialidad es, sobre todo, **2.5D**: marcos planos paralelos vistos en un ángulo oblicuo fijo, con líneas de caída que anclan la altura de los puntos. Esa claridad depende de una cámara que eligió un autor, algo que Orrery no tendrá. El principal hallazgo sobre las referencias es lo que **no** demuestran: no prueban que el 3D navegable explique mejor (§3).

2. **La referencia negativa usa los pisos para *sustituir* contención; ese es su problema, no el apilamiento en sí.** Las dos referencias apilan planos. En sample_1 el eje vertical ordena capas **del mismo tipo de estructura**, alineadas entre sí y atravesadas por un recorrido. En `wrong_not_wanted.png` la altura convierte en pisos una jerarquía de **tipos distintos**, mientras que la pertenencia se expresa dos veces y en contradicción (anidamiento dentro del disco y verticales hacia el piso siguiente). La propia imagen incluye una "vista lateral (esquema simplificado)" en 2D que transmite **toda** su información estructural, lo que prueba que su profundidad no aporta nada (§4).

3. **Se proponen 22 primitivas en 7 familias**, cada una evaluada con 10 preguntas en 4 niveles de densidad (N0 escaso a N3 extremadamente denso). Dos hallazgos transversales: casi todas las primitivas que funcionan bien en N0 cambian de significado al repetirse o superponerse, y en perspectiva **el tamaño deja de ser un canal confiable** porque se confunde con la profundidad (§5–§6).

4. **La gramática tiene que impedir que lo perceptual afirme relaciones que la Fuente no afirma.** La percepción agrupa por proximidad, región común, conexión y alineación. La norma prohíbe que la proximidad visual sea Relación (Vocab §2.4) y que se derive estructura de la cercanía (C-3). De ahí sale la regla central: **toda propiedad perceptual que sugiera pertenencia o relación sólo puede producirse a partir de estructura con Fuente; lo accidental debe neutralizarse** (G-2, §7).

5. **La contención sólo representa con honestidad relaciones que sean árboles estrictos.** El Experience Model describe "Gene ⊂ Domain ⊂ Project", pero Gene v3.0 define Domain↔Gene como relación **N:M** (§2.6, inv. 13) y el Vocabulario la lista como Relación (§2.4). Un Gene que pertenece a dos Domains no puede anidarse en ambos. Se registra como contradicción (CR-1) sin resolverla: condiciona cualquier uso futuro de contención para Domains y Genes.

6. **Sobre qué aporta el 3D (encargo §7), la evidencia es acotada.** El 3D mejora la comprensión de **forma global** (St. John et al. 2001) y el **trazado de caminos en grafos densos**, pero esto último sólo con **profundidad cinética**, es decir, movimiento estructurado de cámara (Ware & Franck 1996; Ware & Mitchell 2008). Empeora los juicios de **posición relativa** (St. John 2001; Tory et al. 2006). Dentro del límite del Experience Model §4.7 (DM-2), lo propio del Espacio sigue siendo contención y extensión. Que el 3D ayude a trazar Relaciones densas queda como hipótesis H-3D-1, que no se adopta (§8, CR-11).

7. **Se aceptan pocos canales de identidad a la vez, y la norma pide muchos.** Los canales de identidad efectivos son pocos: región espacial, tono, movimiento y forma (Munzner). La capacidad atencional para categorías simultáneas es baja (Haroz & Whitney 2012). Una conjunción de propiedades no se detecta de un vistazo (Healey & Enns 2012). En cambio, la norma exige distinguir sin depender del color varias dimensiones a la vez:
   - Procedencia;
   - tres estados de cobertura;
   - cuatro estados de colisión;
   - ocho estados de resolución de Location;
   - indicación, Foco y Anchor;
   - y además, **"dos Lentes no comparten el mismo canal de codificación"** (EM §5.4.2).

   Ese requisito admite dos lecturas: que cada Lente use un *tipo* de canal distinto, o que use un *valor* distinto dentro del mismo canal. En las dos, el número de Lentes simultáneas queda acotado perceptualmente. Se registra como CR-2 y es probablemente **el límite real del lenguaje** (§10).

8. **Degradar la representación sin degradar la verdad requiere que la agregación conserve cuatro cosas:** el recuento, la cobertura, lo *desconocido* y la Atención. Un agregado que convierte "contiene algo desconocido" en "nada" viola C-2 y la regla de cobertura (DJ-7). Los criterios de traspaso del Espacio a una Superficie se formulan en §10.6 y §12.

9. **PlayCanvas impone cuatro condiciones materiales al lenguaje:**
   - el picking por buffer de identificadores puede perder objetos pequeños;
   - las instancias de una malla instanciada no tienen identidad de picking documentada;
   - las transparencias se ordenan por instancia de malla y no por píxel, lo que hace frágiles las envolventes translúcidas que se intersectan;
   - las líneas nativas tienen 1 px y el grosor real requiere `WideLineRenderer`.

   Además, no encontré documentado un sistema de niveles de detalle (LOD) para mallas, así que el zoom semántico es lógica de la aplicación (§11).

10. **Se catalogan 18 anti-patrones como fallas informativas**, no estéticas (§14). Se proponen **20 criterios verificables** (K-1..K-20) para juzgar futuras propuestas morfológicas (§18) y **14 recomendaciones** para el encargo de Visual Architecture / Visual Experience v0.1 (§19). Entre ellas:
    - empezar por un inventario y presupuesto de canales;
    - exigir para cada marco 3D su equivalente plano, una variante sin color y una variante de densidad;
    - pedir a José dos decisiones antes de dibujar (CR-1 y CR-2).

---

## 1. Corpus efectivamente leído

### 1.1 Corpus normativo y aplicado (lectura completa)

| Documento | Capa (Estado Base §3) | Lectura |
|---|---|---|
| `docs/ANALYSIS/ORRERY/Orrery_Estado_Base_v1_0.md` | Índice (no normativo) | Completa |
| `docs/ANALYSIS/ORRERY/Orrery_Vocabulario_Normativo_v1_1.md` | Norma | Completa |
| `docs/ANALYSIS/ORRERY/Orrery_Constitucion_v1_1.md` | Norma | Completa |
| `docs/ANALYSIS/ORRERY/Orrery_Decisiones_Arquitectonicas_v1_1.md` | Norma | Completa |
| `docs/ANALYSIS/ORRERY/EXPERIENCE/Orrery_Experience_Model_v1_0.md` | Norma | Completa |
| `docs/ANALYSIS/ORRERY/EXPERIENCE/Orrery_Experience_Model_Escenarios_Trabajo_Activo_v0_1.md` | Evidencia aplicada | Completa |

### 1.2 Actas, antecedentes y material adicional

| Documento | Capa | Lectura | Uso |
|---|---|---|---|
| `docs/ANALYSIS/ORRERY/Orrery_Experience_Model_Assignment_v0_1.md` | Acta | Estructura y ejes A–C, manifest, criterios | Origen de la pregunta "¿qué término o fenómeno hago perceptible y qué acto habilito?" y de la consigna anti-espectacularidad (§1: "que Orrery no termine siendo un visualizador 3D espectacular y semánticamente falso") |
| `[Project] ANALYSIS/ORRERY/EXPERIENCE/Orrery_Actualizacion_Estado_Cowork_ExperienceModel_y_GenesisE2E_v1_0.md` | Acta | Completa | Estado del frente; congelamiento; D-4 |
| `docs/ANALYSIS/ORRERY/UI/Investigacion_Propuesta_Arquitectura_UIUX_Orrery_WorkspaceCore_v0_1.md` | Histórico (borrador, A-8) | §0–§8, §15–§16 | Antecedentes de asignación de formas (§16) y de composición de pantalla |
| `docs/ANALYSIS/ORRERY/UI/Investigacion_Orrery_VisorMandatos_Postulates_GatewayUX_v0_1.md` | Histórico | Completa | Origen de la ontología "sin piso" y del marcador que recorre una ruta |
| `docs/ANALYSIS/ORRERY/UI/Investigacion_Orrery_LocationFirst_Reorientacion_v0_2.md` | Histórico | Completa | Reorientación al territorio; retiro del marcador de ruta |
| `docs/ANALYSIS/ORRERY/UI/Propuesta_Diseno_Orrery_GatewayUX_Onboarding_TransicionEspacial_v0_1.md` | Histórico | Completa | Transición continua de cámara ("vuelo, no corte") |
| `docs/ANALYSIS/ORRERY/UI/Propuesta_Diseno_Orrery_UIContenedora_ModeloInteraccion_IntegracionFormal_v0_1.md` y `_v0_2.md` | Histórico (reemplazados en parte por D-2/D-3) | Completa | Anotación como "capa de tráfico sobre un mapa" |
| `docs/ANALYSIS/ORRERY/UI/Propuesta_Diseno_LedgerPanel_CapaAuditoriaTrazabilidad_v0_1.md` | Histórico (A-7, EM-C07) | Completa | Antecedente de "trayectoria de navegación dibujada" |
| `docs/ANALYSIS/ORRERY/UI/Investigacion_Orrery_Integracion_UI_Entrada_Salida_v0_3.md` y `..._Verificacion_UIContenedora_..._v0_1.md` | Histórico | Dirigida (búsqueda de contenido visual) | Sin hallazgos morfológicos adicionales |
| `docs/ANALYSIS/ORRERY/LOCATION/ORRERY_LOCATION_MATERIAL_CLOSURE_v1_1.md` y `Orrery_LocationSnapshot_v0.md` | Contratos de otro sistema | Dirigida (coordenadas, cámara, layout, estructura no arbórea) | Las coordenadas y el layout nunca son identidad; la estructura de la captura no depende del orden visual |
| `docs/ANALYSIS/GRAVITY/ORBITAL/Orrery_Research_Resultados_v0_1.md` | Histórico | §2.0, §2.1.2, §2.3.3, §2.6, §3 | Zoom semántico, overlays de SIG, foco no destructivo, cámara en tercera persona, Gravity sin geometría de fuerzas |
| `docs/GENES/COGNITUUM_GENE_CONCEPT_v3_0.md` | Contrato de otro sistema | Dirigida (Domain↔Gene) | Relación N:M (CR-1) |
| `docs/DESIGN/# BTIPS Foundational UX-UI Design Doctrine Prompt v0.1.md` | Doctrina (subordinada a la norma, EM Anexo C) | Completa | Calma visual, minimalismo cognitivo |
| `docs/PALETTE/# 🎨 Bloom Color Palette.md` | Restricción de diseño | Completa | Un único acento de estado, un color de error, "el acento no decora; el acento indica" (CR-3, CR-4) |

### 1.3 Corpus visual (inspección directa)

| Archivo | Tamaño | Inspección |
|---|---|---|
| `/srv/share/SUNDAY/ORRERY_SAMPLES/orrery_sample_1.png` | 532 × 947 px | Completa y con ampliación 2× de la escena |
| `/srv/share/SUNDAY/ORRERY_SAMPLES/orrery_sample_2.png` | 530 × 947 px | Completa y con ampliación 2× de la escena |
| `/srv/share/SUNDAY/ORRERY_SAMPLES/orrery_sample_3.png` | 538 × 943 px | Completa y con ampliación 2× de la escena |
| `/srv/share/SUNDAY/ORRERY_SAMPLES/wrong_not_wanted.png` | 1536 × 1024 px | Completa y con recorte de la columna central |

No se consultó el video original de las referencias. Fue una decisión deliberada, para que el análisis no derive en copia (encargo §3.1).

### 1.4 Fuentes externas

PlayCanvas: manual oficial y referencia de API v2.23.1 (el prototipo usa 2.22.1, EM §4.1). Literatura de visualización y percepción verificada en fuente primaria o registro bibliográfico. La lista completa, con lo que se extrajo de cada fuente, está en el Anexo A.

### 1.5 Observaciones de estado (no son hallazgos de esta investigación)

- HEAD contiene `bc823c9 fix(genesis): persist domain candidates and resolve Brain path`, que corresponde a la corrección B1 informada en el acta del Project. EM-C15 sigue marcado como quiebre previsto en los Escenarios hasta que haya evidencia del E2E; esta investigación no altera ese estado.
- No se leyó `.bloom`, `BloomNucleus` ni código de `installer/conductor/workspace/core/orrery/` (congelado, D-4).

---

## 2. Método

### 2.1 Orden de trabajo

El orden de trabajo sigue el del encargo: primero las referencias, luego las primitivas, la gramática, la profundidad, la interacción, la densidad y el medio (PlayCanvas), y **sólo después** el contraste con Orrery (§13). El objetivo es que los fenómenos de Orrery no sesguen la descripción de las capacidades.

### 2.2 Cadena obligatoria para las referencias (encargo §4)

Toda conclusión extraída de una imagen pasa por siete columnas:

```text
Qué observamos → Propiedad morfológica → Capacidad expresiva → Problema que podría ayudar a resolver en Orrery
→ Riesgo → Qué sucede bajo densidad → Qué NO autoriza a concluir
```

### 2.3 Ficha de primitiva (encargo §5)

Cada primitiva se evalúa con diez preguntas:

1. Qué comunica sin texto.
2. Qué depende del contexto.
3. Cómo se combina.
4. Qué ambigüedad introduce.
5. Qué pasa al repetirse.
6. Qué pasa al superponerse.
7. Cómo responde a la profundidad y la perspectiva.
8. Cómo conserva identidad.
9. Cómo se interroga (picking y alternativas).
10. Cómo se comporta en densidad, de N0 a N3.

### 2.4 Escala de densidad

Se definen cuatro niveles **perceptuales**, no numéricos. Los órdenes de magnitud de la última columna son una convención analítica [HIP], no datos de Cognituum.

| Nivel | Definición perceptual | Orden de magnitud ilustrativo de Entidades visibles |
|---|---|---|
| **N0 · escaso** | Todas las Entidades visibles pueden distinguirse, etiquetarse e indicarse a la vez, sin solapamiento | 10⁰–10¹ (el territorio mínimo post-Genesis de CT-01 está aquí [NO OBSERVADO]) |
| **N1 · medio** | Todas son distinguibles, pero no todas pueden etiquetarse a la vez; hay solapamientos parciales | 10¹–10² |
| **N2 · denso** | No todas son distinguibles individualmente en una sola vista; la oclusión y los cruces son sistemáticos; el etiquetado tiene que ser selectivo | 10²–10³ |
| **N3 · extremadamente denso** | No todas pueden representarse individualmente sin agregación; muchas marcas quedan por debajo del umbral de discriminación o de picking | ≥ 10³ |

### 2.5 Lenguaje morfológico frente a estilo gráfico

| Lenguaje morfológico (estructural; se investiga) | Estilo gráfico (no se confunde con lo anterior) |
|---|---|
| Tipo de marca (punto, línea, curva, plano, envolvente), relaciones geométricas (alineación, contención, conexión, distancia, orden en profundidad), guías auxiliares, distribución del énfasis, persistencia del contexto, acoplamiento con una superficie de precisión | Fondo oscuro, paleta neón (cian, violeta, naranja), glow, brillo especular de las esferas, tipografía, textura de grano, nebulosas de fondo |

Una propiedad se considera **estructural** sólo si, al reemplazar su estilo por otro neutro (escala de grises, sin glow, sin brillo), la información que transmite sobrevive. Esta prueba se aplica a las cuatro imágenes (§3.5, §4.3).

### 2.6 Límites del método

- Las referencias son fotogramas fijos de un video. No se observa su interacción ni su movimiento real; el movimiento sólo se infiere de indicios (partículas sobre los arcos, diferencias entre fotogramas).
- No se construyó ningún prototipo. Las conclusiones sobre PlayCanvas se apoyan en documentación y no fueron medidas.
- La literatura citada estudia tareas genéricas de visualización. Su traslado a Orrery se marca como [HIP] cuando no es directo.

---
## 3. Referencias positivas: análisis individual y comparado

### 3.1 Inventario de lo observado [REF]

**orrery_sample_1.png (fotograma 01:18 de 02:03).**
- **Planos.** Cuatro planos translúcidos paralelos, apilados verticalmente y vistos en perspectiva oblicua. Cada uno tiene un contorno fino coloreado y un relleno casi transparente.
- **Puntos.** Sobre cada uno de los tres planos superiores hay una fila de 10 a 12 puntos, alineados en columnas casi idénticas de un plano a otro. El segundo punto de cada fila es naranja en todos los planos; el resto lleva el color del plano.
- **Arcos.** Sobre cada fila se elevan arcos que conectan pares de puntos, en tres tonos distintos (rosado, violeta, azul), con pequeñas marcas blancas sobre las curvas que sugieren partículas en movimiento.
- **Primer plano.** El plano inferior, más grande y cercano, contiene esferas con volumen aparente y sombreado, agrupadas cerca de la etiqueta "it". De ellas salen arcos finos y blancos en abanico. Un único arco grueso, saturado y luminoso (naranja) va de "it" a "cat", con el valor "100%" junto al extremo. Una flecha recta (cian) y una línea fina recta (naranja) apuntan en la misma dirección general.
- **Líneas de caída.** Desde las esferas bajan verticales discontinuas hasta pequeñas elipses en un nivel inferior.
- **Rótulos.** Dos rótulos fijos a la pantalla, "MANY LAYERS" y "SEVERAL HEADS", fuera de la escena.
- **Superficie de precisión.** Debajo, un panel de código de 16 líneas con la línea 3 resaltada.

**orrery_sample_2.png (fotograma 00:04).**
- La misma composición, pero con **tres** planos y **uno o dos arcos por plano**, cada arco del color de su plano.
- El primer plano y el arco "it → cat 100%" son idénticos.
- El panel de código muestra las líneas 5–10, con las líneas 6–7 resaltadas.

**orrery_sample_3.png (rótulo "ALL WORDS AT ONCE").**
- No hay planos.
- **Puntos.** Puntos dispersos en profundidad: siete con etiqueta ("the", "was", "because", "milk", "thirsty", "drank", "it") y varios grises sin etiqueta. En el margen derecho, un grupo de puntos naranjas, uno de ellos grande y etiquetado "cat".
- **Convergencia.** Líneas rectas con pequeñas puntas parten de los puntos etiquetados y convergen en un punto cercano a "thirsty". Desde ahí sale una flecha (cian) y una línea (naranja) hacia "cat".
- **Guías.** Verticales discontinuas descienden desde cada punto etiquetado, y una línea horizontal discontinua atraviesa la escena.
- **Etiquetas.** Siempre de frente a la cámara.
- **Superficie de precisión.** Panel de código con las líneas 4–7 resaltadas.

### 3.2 Análisis individual con la cadena del §2.2

La columna **"No autoriza"** es obligatoria y se lee como restricción para todo lo que sigue.

#### sample_1 / sample_2

| # | Observamos [REF] | Propiedad morfológica | Capacidad expresiva | Problema de Orrery que podría ayudar a resolver | Riesgo | Bajo densidad | **No autoriza a concluir** |
|---|---|---|---|---|---|---|---|
| R1 | Planos paralelos apilados; cada uno contiene la misma clase de estructura (una fila de puntos con arcos) | **Eje homogéneo ordenado**: la tercera dimensión indexa repeticiones del mismo tipo de estructura | Copresencia de varias instancias paralelas de una estructura, comparables entre sí, sin cambiar de vista | Hacer copresentes estructuras paralelas de igual naturaleza | Que el eje se lea como jerarquía o importancia (arriba = superior) aunque sea sólo un índice | Con muchas capas, los planos lejanos se comprimen por perspectiva y sus marcas se vuelven ilegibles | Que la jerarquía de Orrery (Tenant › … › Gene) deba representarse con planos apilados. Las capas de la referencia **no** son niveles de una jerarquía de tipos distintos |
| R2 | Los puntos ocupan las mismas columnas en todos los planos; el punto naranja se repite en la misma columna | **Alineación y correspondencia entre marcos** | Identidad que se conserva a través de vistas o capas: "este es el mismo elemento en otra capa" | Reconocer la misma Entidad en contextos distintos (p. ej. con Lentes distintas activas) | La alineación accidental también se lee como correspondencia | Con muchas columnas, la alineación se pierde en perspectiva; hace falta una guía o una interacción que vincule | Que una Entidad de Orrery deba tener réplicas en varias capas. La correspondencia en Orrery es identidad `(fuente, tipo, id)`, no posición (C-1) |
| R3 | Planos casi vacíos: contorno y relleno mínimo | **Plano como marco de referencia**, no como objeto | Extensión común, "suelo" local que hace legibles posición y altura de lo que está encima | Dar referencia espacial sin agregar objetos | Que el marco se lea como Entidad contenedora | Muchos marcos translúcidos superpuestos producen mezclas de color ambiguas y problemas de orden de transparencias (§11.3) | Que alguna Entidad de Orrery sea un plano (encargo §4) |
| R4 | Arcos que salen del plano y vuelven a él | **Relación como curva fuera del plano de los puntos** | Conexión que no atraviesa los demás puntos de la fila; la altura del arco crece con la separación entre extremos | Hacer distinguibles Relaciones entre elementos alineados | Que la altura del arco se lea como magnitud o importancia | Con muchos arcos sobre la misma fila aparecen cruces y anidamientos difíciles de seguir; hay que agrupar o filtrar | Que las Relaciones de Orrery sean arcos (encargo §5) |
| R5 | Arcos de tres tonos en un mismo plano ("SEVERAL HEADS") | **Familias de conexiones distinguidas por tono** | Varias capas de relación copresentes sobre la misma estructura | Distinguir clases de Anotaciones entre Entidades | Depende del color (EM §4.6.4) y satura rápido (Haroz & Whitney 2012, L-11) | Más de unas pocas familias por tono dejan de distinguirse | Que cada Lente de Orrery tenga un tono (CR-2) |
| R6 | Un arco grueso, saturado y etiquetado con un valor; el resto, fino y desaturado; las capas superiores, más chicas pero presentes | **Énfasis localizado con contexto persistente** (foco + contexto) | Destacar un elemento sin hacer desaparecer el resto | Hacer perceptible el Foco sin perder el contexto (C-8; EM §5.4.5) | Que el énfasis se lea como "lo más importante" en vez de "lo que miro" | El contraste del énfasis se mantiene sólo si el resto está atenuado; con muchos énfasis simultáneos ninguno destaca | Que el Foco de Orrery deba ser una curva luminosa, ni que el énfasis pueda derivarse de relevancia (C-17) |
| R7 | Tres marcas para tres cosas: arco grueso, flecha recta, línea fina | **Distinción por tipo de marca, no sólo por color** | Distintas clases de relación con distinta geometría | Distinguir sin color Relación, Anotación entre Entidades y guía auxiliar | Demasiados tipos de marca se vuelven un código que hay que aprender | Las diferencias finas (punta de flecha, grosor) se pierden en densidad o a distancia | Que estas tres marcas concretas tengan un significado en Orrery |
| R8 | Verticales discontinuas desde las esferas hasta "huellas" en un nivel inferior | **Líneas de caída** (guía auxiliar) | Hacer legible la posición en profundidad de un punto flotante sin estereoscopía | Leer posición en el Espacio sin depender de rotar la cámara | Que la guía se confunda con una Relación | Muchas líneas de caída forman una "cortina" que tapa la escena | Que Orrery necesite un suelo o un piso. La guía puede ser local y temporal (§6.6) |
| R9 | Esferas con sombreado en el primer plano, puntos planos en el fondo | **Gradiente de materialidad por cercanía** | El primer plano parece "más real" y más interrogable | Señalar qué es interrogable ahora | Que la materialidad se lea como un tipo distinto de objeto | Con muchas esferas sombreadas, la iluminación produce ruido | Que las Entidades de Orrery sean esferas |
| R10 | Marcas blancas sobre los arcos | **Movimiento implícito** (partículas que recorren la curva) | Dirección y flujo a lo largo de una conexión | Expresar dirección de una relación | Movimiento perpetuo que compite con la lectura (CR-3) | Muchas partículas producen centelleo; la dirección deja de leerse | Que haya flujo animado en Orrery. Una Relación no es un proceso |
| R11 | "MANY LAYERS", "SEVERAL HEADS" fuera de la escena, fijos a la pantalla | **Rotulación del marco, separada de los objetos** | Orientar sobre *qué* se está viendo sin poner texto en el mundo | Capa de orientación (EM §3.2, capa O) | Ninguno estructural | No se densifica: describe la vista, no los elementos | Que la orientación de Orrery deba ser un rótulo de título |
| R12 | Panel de código debajo, con líneas resaltadas que cambian entre fotogramas en correspondencia con la escena | **Acoplamiento escena ↔ superficie de precisión** por resaltado sincronizado | Explicación precisa y lenguaje formal junto a una representación que da orientación | Relación Espacio ↔ Superficie (D-2; EM §5.7) | Que el lector tenga que adivinar *qué parte* de la escena corresponde a *qué parte* del panel | Si el panel crece, el resaltado tiene que conducir la mirada | Que Orrery ubique una Superficie debajo de la escena. Esa disposición se parece al Régimen en paneles (R-C), y D-2 eligió R-B |
| R13 | 00:04 tiene 3 planos y 1–2 arcos por plano; 01:18 tiene 4 planos y varios arcos | **Revelación progresiva narrada** | Complejidad que se agrega por pasos | Primera entrada; orientación | La revelación la conduce un autor, no la persona | — | Que Orrery pueda revelar complejidad por su cuenta. Los cambios de lugar o de modo ocurren por acto de la persona (C-17); sólo el detalle por escala es compatible (EM §5.4.4) |

#### sample_3

| # | Observamos [REF] | Propiedad morfológica | Capacidad expresiva | Problema de Orrery | Riesgo | Bajo densidad | **No autoriza a concluir** |
|---|---|---|---|---|---|---|---|
| R14 | Puntos dispersos libremente en 3D; su posición expresa similitud de significado (espacio de embeddings) | **La posición como valor semántico** | Ver de un vistazo qué está "cerca" de qué en un espacio de rasgos | — | En Orrery, la posición afirmaría algo que ninguna Fuente afirma: "parecido" sería "relacionado" | La nube se vuelve masa y la cercanía en pantalla deja de corresponder a la cercanía en el espacio (perspectiva) | **Nada para la estructura del Territorio**: la proximidad visual no es Relación (Vocab §2.4), la similitud no crea estructura (C-3), y una posición no es identidad (C-1). Es la capacidad que menos se traslada |
| R15 | Siete puntos con etiqueta; muchos grises sin etiqueta | **Etiquetado selectivo y contexto atenuado** | Mantener presente lo no relevante para la tarea sin competir | Densidad media y alta | Que lo gris se lea como "inexistente" o "inactivo" | Al aumentar los puntos grises, el contraste con los etiquetados baja | Que lo no etiquetado pueda ocultarse sin declararlo (EM §5.4.4: ocultar sin decirlo está prohibido) |
| R16 | Líneas que convergen en un punto calculado y una flecha resultante | **Construcción derivada visualizada** (una operación: la suma ponderada) | Mostrar cómo se compone un resultado | — | En Orrery equivaldría a calcular algo en el cliente y dibujarlo como hecho | Las líneas de convergencia se cruzan y saturan | Que Orrery dibuje resultados que no provienen de una Fuente (C-1, C-3, C-15) |
| R17 | Verticales discontinuas desde cada punto etiquetado y una horizontal discontinua | **Guías auxiliares de referencia** sin plano visible | Anclar puntos flotantes a una referencia implícita | Leer posición sin marco visible | Que la línea horizontal se lea como eje con significado | Las guías se multiplican con los puntos | Que el Espacio de Orrery tenga ejes con unidades. No hay dimensión métrica en el Territorio |
| R18 | Etiquetas siempre de frente a la cámara | **Texto en pantalla anclado a un punto del mundo** | Lectura del nombre sin inclinación por perspectiva | Identidad legible (EM §4.4) | Las etiquetas se superponen entre sí | El problema de ubicación de etiquetas crece rápido (§6.6) | Una técnica de etiquetado concreta |

### 3.3 Análisis comparado de las tres referencias positivas

| Propiedad | sample_1 | sample_2 | sample_3 | Lectura comparada |
|---|---|---|---|---|
| Marcas distintas usadas | ~10 (plano, punto, esfera, arco, arco destacado, flecha, línea, línea de caída, huella, partícula) | ~9 | ~7 | El vocabulario es pequeño y **cada marca tiene una sola función** |
| Uso de la tercera dimensión | Índice de capas (eje homogéneo) y arcos fuera del plano | Ídem | La posición en profundidad codifica un valor | En 1 y 2 la profundidad **ordena estructuras**; en 3 **codifica un dato**. Sólo lo primero es compatible con Orrery |
| Cámara | Oblicua, fija, elegida por un autor | Ídem | Ídem | **Ninguna imagen prueba que la composición sobreviva a una cámara libre.** Vistos de canto, los planos apilados degeneran en líneas |
| Énfasis | Uno solo, fuerte | Uno solo | Uno o dos | Un único foco por vista mantiene el contraste |
| Contexto | Persistente y atenuado | Persistente | Persistente y gris | El contexto nunca desaparece; se atenúa |
| Texto en escena | Mínimo (2 etiquetas y 1 valor) | Mínimo | 8 etiquetas | El texto de la escena nombra; el texto de la Superficie explica |
| Superficie de precisión | Sí, sincronizada | Sí | Sí | Las tres asumen que **la escena sola no alcanza** |
| Densidad real | Baja (≈50 marcas) | Baja | Baja | Las tres están en N0–N1. **No dicen nada directo sobre N2 o N3** |

**Síntesis del análisis comparado.**
1. La tridimensionalidad de las referencias positivas es mayormente **2.5D**: marcos planos paralelos, vistos en un ángulo fijo, con guías que anclan la altura. Gran parte de su claridad viene de principios planos (alineación, pocas marcas, un énfasis, contexto atenuado) aplicados dentro de un marco con profundidad.
2. Lo que esa profundidad sí aporta: **compacidad** (varias capas en el espacio de una), una **gestalt de "la misma estructura repetida"** y **arcos que no se cruzan con los puntos de la fila**.
3. Las referencias no muestran navegación, ni interrogación, ni densidad. Por eso no autorizan conclusiones sobre esos tres ejes, que son los más críticos para Orrery (§8–§10).

### 3.4 Lo que las referencias demuestran sobre la "tridimensionalidad sin escenario físico"

| Pregunta del encargo (§3.1) | Respuesta [REF] |
|---|---|
| ¿De dónde sale la profundidad si no hay piso, edificio, habitación ni paisaje? | De **tres fuentes**: el orden de los marcos planos (R1), las guías que anclan la altura (R8, R17) y el gradiente de tamaño y materialidad por cercanía (R9). Ninguna representa algo del mundo físico; todas organizan información |
| ¿Por qué no parece un "universo"? | Porque nada es ambiental. Cada marca o es dato, o es guía, o es rótulo. No hay fondo figurativo (salvo un viñeteado leve) ni marcas sin función |
| ¿Qué convive con la información precisa? | Un panel textual exacto, sincronizado por resaltado (R12), que no intenta competir con la escena |

### 3.5 Prueba de estilo neutro (§2.5) sobre las referencias positivas

Si se reemplaza el estilo por escala de grises, sin glow ni sombreado:
- **Sobrevive:** la estructura en capas (R1), la alineación (R2), la diferencia entre arco, flecha y línea (R7), las líneas de caída (R8), el énfasis por grosor (R6) y el acoplamiento con el panel (R12).
- **Se pierde:** la distinción entre familias de arcos por tono (R5) y la identidad del punto naranja repetido en cada capa (R2, parcialmente).

**Conclusión:** la mayor parte de la inteligibilidad de las referencias es morfológica, no cromática. Las dos excepciones dependen de un único canal (tono), que es justamente lo que la norma prohíbe para codificar estados (EM §4.6.4).

---

## 4. Análisis de `wrong_not_wanted.png`

### 4.1 Inventario de lo observado [REF]

- **Título y lema.** "Concepto: Arquitectura Volumétrica", con el lema "Sin un piso. Todo en el espacio."
- **Estratos.** Seis estratos elípticos apilados verticalmente: Tenant (arriba, "Nivel raíz"), Organización, Proyecto, Dominios, Genes y, sin etiqueta propia en la columna central, "Sub-objetos / Recursos" al pie. Cada estrato es un disco translúcido con borde luminoso. El ancho crece hacia abajo, salvo el primero.
- **Nebulosas.** Dentro de cada estrato hay "nebulosas" o *blobs* de bordes difusos (verde, azul, violeta, naranja) que **se repiten en todos los niveles con la misma forma**. Cada blob contiene un pequeño grafo de nodos luminosos unidos por líneas.
- **Conexiones.** Verticales punteadas unen blobs de un estrato con los del siguiente, y un eje vertical central atraviesa todos los estratos.
- **Rotulación.** Íconos y etiquetas por nivel. A la izquierda, columnas de texto: "Cómo se ve" y "Beneficios" ("Facilita la comprensión de relaciones", "Escalable y adaptable"). A la derecha, la leyenda "Niveles de la estructura" y una **"Vista lateral (esquema simplificado)"**: seis elipses planas apiladas con su nombre.
- **Ambientación.** Fondo de cielo estrellado con nebulosas violetas. Glow en casi todas las marcas.

### 4.2 Por qué usa mucho espacio tridimensional y comunica poca estructura

| # | Observamos [REF] | Propiedad, combinación o uso que produce el problema | Falla informativa | Qué aprendemos | **No autoriza a concluir** |
|---|---|---|---|---|---|
| W1 | Cada tipo de Entidad ocupa su propio estrato a una altura | **Tipo convertido en altura** | La tercera dimensión codifica una variable categórica (tipo) que ya está en las etiquetas: la profundidad es redundante | La altura es un canal de magnitud; usarla para categorías desperdicia la dimensión y sugiere orden de importancia | Que el apilamiento sea malo en sí: en sample_1 funciona porque el eje es homogéneo (R1) |
| W2 | Los blobs de Organización están *dentro* del disco de Organización, pero los Proyectos están en *otro* disco, abajo, conectados por verticales | **Pertenencia expresada dos veces y de manera contradictoria** (región común en un nivel, conexión vertical entre niveles) | No se sabe si un Proyecto "está en" la Organización o "cuelga" de ella; la contención deja de ser una regla | Un mismo tipo de relación necesita **una sola** codificación perceptual | Que la contención sea inviable; el problema es el doble código |
| W3 | Blobs de borde difuso con glow | **Envolvente sin límite nítido** | La región común agrupa con fuerza sólo si es una región *acotada* (Palmer 1992, L-8). Con el borde difuso, no se sabe qué está dentro y qué fuera, ni dónde termina un blob y empieza otro | La pertenencia exige un borde decidible, también para el picking (EM §4.3.1) | Que las envolventes estén descartadas |
| W4 | El mismo blob en todos los niveles | **Repetición morfológica** | Ninguna forma dice qué *es* el elemento; la identidad depende sólo del rótulo del nivel | La forma o es identidad, o es neutra; una forma repetida con significados distintos no es ninguna de las dos | Que todas las Entidades necesiten formas distintas (§6.1) |
| W5 | Verde, azul, violeta y naranja se repiten en todos los niveles sin leyenda | **Color sin código** | El tono parece significar algo (¿"este Proyecto pertenece a esta Organización"?) pero no hay regla; el lector inventa relaciones | Un canal usado sin significado produce significado falso | Que el color esté prohibido; está acotado (EM §4.6.4; paleta) |
| W6 | Glow en todas las marcas | **Saliencia uniforme** | Si todo destaca, nada destaca: no queda canal para el Foco, el Anchor, la Atención ni el error (Healey & Enns 2012, L-10: lo más importante tiene que ir en lo más saliente) | La saliencia es un recurso escaso que se reserva | Que no pueda haber luminosidad; la paleta la reserva para el estado activo |
| W7 | Grafos de nodos dentro de cada blob, sin etiquetas ni tipo | **Conexión ornamental** | Las líneas sugieren relaciones que no se pueden interrogar ni nombrar | Una conexión sin identidad ni Fuente es decoración que se lee como dato (C-3) | Que no deba haber conexiones dentro de un contenedor |
| W8 | La "vista lateral (esquema simplificado)" en 2D contiene toda la información estructural de la escena principal | **Profundidad sin ganancia demostrable**: la propia imagen se refuta | La escena 3D no comunica nada que el esquema plano no comunique | **Prueba de aplanamiento**: si el equivalente plano transmite lo mismo, la profundidad es decorativa (K-2) | Que el 3D no aporte nunca; aquí no aporta |
| W9 | Puntos luminosos de los grafos y estrellas del fondo, con la misma marca | **Estructura indistinguible de la ambientación** | No hay forma de saber qué punto es dato y cuál es decoración | Lo ambiental no puede usar las marcas de lo estructural (G-7) | Que deba haber un fondo neutro concreto |
| W10 | El estrato inferior ya tiene unos 40 blobs y se ve saturado | **Comportamiento en densidad** | Con un territorio real (cientos de Genes), el estrato de Genes no admite agregación, etiquetado ni picking | La forma debe pensarse para N2–N3 desde el principio (encargo §1) | — |
| W11 | Volúmenes translúcidos anidados que se solapan | **Interrogabilidad nula** | No hay región de respuesta decidible para el picking (EM §4.3.1). Además, el orden de transparencias por malla haría inestable la imagen en tiempo real (PC-3) | La interrogabilidad es una propiedad de la morfología, no un agregado posterior | — |
| W12 | "Sin un piso. Todo en el espacio" junto a seis pisos | **Contradicción entre la intención y la forma** | Se quiso evitar el piso y se produjeron seis | La metáfora espacial no garantiza la gramática que promete | Nada sobre el lema "sin piso" como principio [HIST, VisorMandatos v0.1 §3] |
| W13 | Fondo de "universo" (estrellas, nebulosas) | **Metáfora literal** | El fondo da a entender que el sistema "es" un cosmos y fija un tono espectacular | La metáfora de Orrery no está en su escenografía. El research histórico ya recomendaba no forzar una única metáfora astronómica [HIST, Research Resultados §3 P2] | Nada sobre el nombre "Orrery" |

### 4.3 Prueba de estilo neutro sobre la referencia negativa

Sin glow, sin color y sin fondo, `wrong_not_wanted.png` se reduce a seis elipses apiladas, con formas repetidas dentro y verticales entre ellas: exactamente su propia "vista lateral". Lo que se pierde al quitar el estilo **es casi todo lo que la imagen tenía de "volumétrico"**, y la estructura que queda es la de una lista de seis niveles.

**Conclusión:** su tridimensionalidad era estilo, no lenguaje.

### 4.4 Lo que la referencia negativa sí hace bien (no se descarta por asociación)

- **Escala por cantidad.** Los estratos con más elementos son más anchos. La extensión crece con el contenido, lo que es coherente con que la extensión sea propia del Espacio (EM §4.7).
- **Contención dentro de un nivel.** Dentro del disco de Organización, los blobs se agrupan por región común.
- **Rotulación clara.** Íconos y etiquetas legibles, más una leyenda.
- **Esquema plano honesto.** Ofrece un equivalente plano (la vista lateral), aunque sin proponérselo prueba su propia redundancia.

### 4.5 Diagnóstico

El problema no está en ninguna primitiva aislada. Está en una **combinación**:
- tipo → altura (W1);
- doble código de pertenencia (W2);
- envolvente difusa (W3);
- forma repetida (W4);
- color sin código (W5);
- saliencia uniforme (W6);
- ambientación con las mismas marcas que la estructura (W9).

Esa combinación produce una escena que **parece** tener mucha estructura y **tiene** la estructura de una lista. La espacialidad decora cuando la profundidad codifica algo que ya está codificado de otra manera, o no codifica nada.

---
## 5. Taxonomía de primitivas

Se distinguen **marcas** (lo que se dibuja), **relaciones geométricas** (lo que surge entre marcas), **propiedades** (cómo se modula una marca), **auxiliares** (lo que hace legible a lo demás) y **tiempo**. La distinción sigue a Bertin (L-1) y Munzner (L-4): las marcas son primitivas geométricas (punto, línea, área) y los canales modulan su apariencia. Munzner agrega que la **contención** y la **conexión** son marcas de *vínculo*, y que el **volumen** "se usa raramente".

| Familia | Primitivas | Notas |
|---|---|---|
| **A · Marcas de posición** | P1 punto · P2 glifo (punto con forma) | Lo discreto: "una cosa, aquí" |
| **B · Marcas lineales** | P3 línea recta · P4 curva o arco · P5 trayectoria · P6 línea discontinua | Lo que une o recorre |
| **C · Marcas de extensión** | P7 plano · P8 superficie · P9 volumen · P10 envolvente | Lo que ocupa o delimita |
| **D · Relaciones geométricas** | P11 distancia o proximidad · P12 alineación · P13 contención · P14 intersección · P15 orientación | Surgen entre marcas; la percepción las lee aunque nadie las haya codificado |
| **E · Propiedades** | P16 escala (tamaño) · P17 profundidad · P18 transparencia · P19 color | Modulan las marcas |
| **F · Auxiliares y texto** | P20 guía auxiliar · P21 texto espacial | Hacen legible lo demás |
| **G · Tiempo** | P22 movimiento (de cámara, de transición, de objeto) | Cambia lo que se ve en el tiempo |

Son 22 primitivas en 7 familias. La lista amplía la del encargo con **glifo**, **alineación** y **color**: el glifo y la alineación aparecieron en el análisis de las referencias (R2, R7), y el color es la dependencia que la norma acota (EM §4.6.4). La **oclusión**, la **saliencia** y la **agregación** no se tratan como primitivas sino como efectos de la gramática (§7) y de la densidad (§10).

---

## 6. Capacidades y límites de cada familia

Cada ficha responde las diez preguntas del §2.3. Abreviaturas: **N0–N3**, niveles de densidad (§2.4); **picking**, la interrogación por puntero.

### 6.1 Familia A — Marcas de posición

#### P1 · Punto

| Pregunta | Respuesta |
|---|---|
| Comunica sin texto | Existencia, discreción ("hay una cosa"), posición relativa, conteo hasta cuatro o cinco elementos sin contar uno a uno |
| Depende del contexto | Qué *es*: sin etiqueta, forma o marco, un punto no tiene tipo |
| Se combina con | Etiqueta → identidad; línea → nodo de una red; plano → pertenencia a un marco; línea de caída → altura legible (R8) |
| Ambigüedad | Punto de datos frente a partícula o estrella de ambientación (W9). En perspectiva, "grande" y "cercano" se confunden |
| Al repetirse | Se vuelve textura o nube y pierde individualidad (W10; sample_3 con los puntos grises) |
| Al superponerse | Esconde el conteo; no se sabe cuántos hay detrás |
| Profundidad y perspectiva | Un punto aislado flota: su profundidad no se lee sin guías ni movimiento (L-7) |
| Identidad | Sólo por posición y etiqueta. La posición no es identidad (C-1), así que la identidad tiene que poder recuperarse por selección o por Superficie |
| Interrogación | Objetivo pequeño. El buffer de picking a baja resolución "puede perder objetos muy pequeños" (PC-1). Hace falta tolerancia o un recorrido de candidatos (EM §4.3.2) |
| Densidad | N0: excelente. N1: etiquetado selectivo. N2: oclusión y fallas de picking. N3: nube; requiere agregación |

#### P2 · Glifo (punto con forma)

| Pregunta | Respuesta |
|---|---|
| Comunica sin texto | Una categoría, si la forma está codificada. La forma es el canal de identidad *menos* efectivo de los cuatro principales (región espacial > tono > movimiento > forma; L-4), pero no depende del color |
| Depende del contexto | Que exista una leyenda o una convención estable |
| Se combina con | Color (riesgo: el tono interfiere asimétricamente con la forma, L-10), tamaño, etiqueta |
| Ambigüedad | En 3D, la silueta de una forma con volumen **cambia al rotar la cámara**. Sólo una forma siempre orientada a la cámara conserva la silueta |
| Al repetirse | Pocas formas distinguibles; con muchas categorías la búsqueda deja de ser inmediata (L-4: "la mayoría de las combinaciones requieren búsqueda serial") |
| Al superponerse | Se pierde la silueta |
| Profundidad y perspectiva | La forma se reconoce mal cuando el glifo es pequeño o lejano |
| Identidad | Identidad de *clase*, no de instancia |
| Interrogación | Igual que P1 |
| Densidad | N0–N1: útil como canal redundante sin color. N2–N3: ilegible si es pequeño; el glifo tiene que sobrevivir como agregado (p. ej. un recuento por clase) |

### 6.2 Familia B — Marcas lineales

#### P3 · Línea recta

| Pregunta | Respuesta |
|---|---|
| Comunica sin texto | Conexión. La conexión uniforme es un principio de agrupamiento que la literatura considera más fuerte que la proximidad [L-17, registro secundario; HIP en cuanto a la jerarquía de fuerza] |
| Depende del contexto | Dirección (sin punta, la línea es simétrica), tipo de vínculo |
| Se combina con | Punta de flecha → dirección; discontinuidad → clase distinta (P6); grosor → énfasis |
| Ambigüedad | En 3D no se sabe si una línea pasa *por delante* o *por detrás* de un punto, ni si dos líneas que se cruzan en pantalla se tocan en el espacio |
| Al repetirse | "Ovillo" (*hairball*): cruces masivos |
| Al superponerse | Se funden; no se puede seguir una en particular |
| Profundidad y perspectiva | La longitud se distorsiona; la longitud deja de ser un canal de magnitud |
| Identidad | Por sus extremos. Una línea sin extremos interrogables es ornamental (W7) |
| Interrogación | Las líneas finas son difíciles de señalar; las nativas tienen 1 px (PC-5). Para que sean objetivos señalables hace falta grosor real o una región de respuesta más ancha |
| Densidad | N0–N1: legible. N2: cruces; el **trazado de caminos** mejora con profundidad cinética y estéreo (L-7, L-9). N3: requiere agrupamiento (*bundling*), filtrado o agregación |

#### P4 · Curva o arco

| Pregunta | Respuesta |
|---|---|
| Comunica sin texto | Conexión que esquiva lo que hay en el medio (R4); una segunda familia de conexión distinguible de la recta (R7) |
| Depende del contexto | El significado de la curvatura y de la altura del arco |
| Se combina con | Agrupamiento jerárquico: las curvas se "doblan" hacia la jerarquía y se agrupan por camino común (Holten 2006, L-14), lo que además revela adyacencias implícitas entre los padres |
| Ambigüedad | La altura del arco se lee como magnitud o importancia aunque no lo sea |
| Al repetirse | Arcos anidados sobre una fila: legibles hasta cierto número; después, abanico confuso |
| Al superponerse | El agrupamiento reduce el desorden **a costa de la trazabilidad de cada curva individual** [HIP, por el mecanismo descrito en L-14] |
| Profundidad y perspectiva | Un arco fuera del plano gana legibilidad en vista oblicua y la pierde de canto |
| Identidad | Igual que P3 |
| Interrogación | Igual que P3, con geometría más compleja |
| Densidad | N1: mejor que la recta para evitar oclusión con los nodos. N2–N3: sólo agrupada o filtrada |

#### P5 · Trayectoria

| Pregunta | Respuesta |
|---|---|
| Comunica sin texto | Recorrido ordenado; algo *se movió* o *se moverá* por estos lugares; secuencia |
| Depende del contexto | Qué recorre (¿un objeto?, ¿la mirada?, ¿un proceso?) y en qué tiempo |
| Se combina con | Movimiento (P22) → narración; punta → sentido |
| Ambigüedad | Implica causalidad o flujo. Una trayectoria sobre el Territorio sugiere que algo "viaja" por él |
| Al repetirse | Muchas trayectorias se entrecruzan como un mapa de tráfico |
| Al superponerse | Pierden la secuencia |
| Profundidad y perspectiva | Igual que P3/P4 |
| Identidad | La del objeto que recorre. Si ese objeto no es Entidad, la trayectoria no tiene ancla territorial |
| Interrogación | Por segmentos |
| Densidad | Se degrada rápido |

**Nota normativa.** Dos usos de la trayectoria aparecen en el corpus histórico. Ambos chocan con la norma vigente:
- **El marcador que recorre una ruta narrando Intents** [HIST, VisorMandatos v0.1 §4.3]: convierte al Trabajo en objeto del Espacio, lo que viola C-6. Fue retirado en LocationFirst v0.2 §3.
- **La "cadena de Locations visitadas" dibujada como camino** [HIST, Ledger v0.1 §5.2]: viola C-9; el rastro de navegación es historia del Navigation State (A-7).

La capacidad existe; su uso para Trabajo o para navegación no está autorizado.

#### P6 · Línea discontinua

| Pregunta | Respuesta |
|---|---|
| Comunica sin texto | Una clase "distinta" de línea: auxiliar, provisoria, hipotética o proyectada, según la convención |
| Depende del contexto | **Totalmente**: en las referencias, lo discontinuo es *guía auxiliar* (R8, R17). En el borrador histórico de UI, el "trazo distinto" servía para relaciones *candidatas* [HIST, UIUX v0.1 §16] |
| Se combina con | Grosor, color |
| Ambigüedad | **Dos convenciones incompatibles** (auxiliar frente a propuesta). Si el lenguaje usa la discontinuidad para ambas, una guía puede leerse como relación propuesta, o al revés |
| Al repetirse | Patrón visual que vibra (efecto moiré) |
| Al superponerse | El patrón se pierde; dos discontinuas superpuestas parecen una continua |
| Profundidad y perspectiva | El paso del trazo se comprime con la distancia; lejos se ve continua |
| Identidad | Igual que P3 |
| Interrogación | Igual que P3 |
| Densidad | N0–N1 únicamente |

### 6.3 Familia C — Marcas de extensión

#### P7 · Plano

| Pregunta | Respuesta |
|---|---|
| Comunica sin texto | Extensión común; marco de referencia; copresencia de lo que está "sobre" él (R3); orden entre planos paralelos (R1) |
| Depende del contexto | Si es un marco (sin significado propio) o un objeto (con identidad) |
| Se combina con | Puntos → pertenencia a un marco; líneas de caída → altura; otros planos → capas |
| Ambigüedad | "Sobre el plano" frente a "en el plano" frente a "flotando cerca"; marco frente a contenedor |
| Al repetirse | Apilado: legible si el eje es homogéneo (R1); se vuelve "pisos" si cada plano es un tipo distinto (W1) |
| Al superponerse | Intersecciones visuales ambiguas; mezclas de color sin significado |
| Profundidad y perspectiva | **Dependiente del ángulo de vista**: de frente es un fondo, oblicuo es un piso, de canto es una línea. Con cámara libre, la lectura cambia con la cámara |
| Identidad | Un plano no tiene identidad si es marco; si la tiene, necesita etiqueta |
| Interrogación | Superficie grande y fácil de señalar, lo que **compite** con lo que está encima: requiere geometría de respuesta sustractiva (EM §4.3.1) |
| Densidad | Uno o pocos marcos: útil en N0–N2. Muchos planos translúcidos: ruido de mezcla y problemas de orden (PC-3) |

#### P8 · Superficie (curva o de relieve)

| Pregunta | Respuesta |
|---|---|
| Comunica sin texto | Forma global; continuidad; "campo". El 3D supera al 2D en la comprensión de forma (St. John et al. 2001, L-5) |
| Depende del contexto | Qué significa cada punto de la superficie |
| Se combina con | Puntos sobre ella → ubicación en un relieve |
| Ambigüedad | **Afirma un valor en cada punto del continuo**, también donde no hay dato. Un relieve sugiere un campo continuo |
| Al repetirse | Superficies superpuestas que se ocluyen |
| Al superponerse | Ilegibles |
| Profundidad y perspectiva | Necesita sombreado o movimiento para leerse |
| Identidad | Difusa |
| Interrogación | Devuelve un punto del continuo, no una Entidad |
| Densidad | No se densifica: abarca el espacio |

**Nota normativa.** El Territorio es discreto (Entidades y Relaciones; Vocab §2.1). Una superficie continua afirmaría valores en lugares donde no hay Entidad. El riesgo más concreto es **Gravity como campo**: el prototipo tiene "campos de Gravity" como objetos del Espacio (EM §5.5; F-5), y C-15 lo prohíbe.

#### P9 · Volumen

| Pregunta | Respuesta |
|---|---|
| Comunica sin texto | Presencia física, masa aparente, "cosa" |
| Depende del contexto | Qué significa el volumen (el volumen es el canal de magnitud menos efectivo; L-4) |
| Se combina con | Transparencia → contenido visible; contención → anidamiento |
| Ambigüedad | El volumen se lee como peso o importancia; en Orrery eso induce a leer Masa (prohibido codificarla en tamaño o prominencia; EM §6.8) |
| Al repetirse | Ocluye todo lo que tiene detrás |
| Al superponerse | El interior es invisible; con volúmenes translúcidos anidados, el orden de transparencias por malla es frágil (PC-3) |
| Profundidad y perspectiva | Su tamaño aparente cambia con la distancia |
| Identidad | Por forma y etiqueta |
| Interrogación | Región grande, pero su interior (lo contenido) requiere geometría de respuesta sustractiva |
| Densidad | Malo desde N1 |

#### P10 · Envolvente (borde que delimita un grupo)

| Pregunta | Respuesta |
|---|---|
| Comunica sin texto | **Pertenencia por región común**: los elementos dentro de una región acotada se perciben juntos. Este agrupamiento puede imponerse sobre la proximidad y la similitud, admite anidamiento jerárquico y depende de la profundidad percibida (Palmer 1992, L-8) |
| Depende del contexto | Que el borde sea nítido y decidible (W3) |
| Se combina con | Etiqueta → nombre del grupo; anidamiento → jerarquía; escala → cantidad contenida |
| Ambigüedad | Envolventes que se superponen se leen como pertenencia múltiple (un diagrama de Euler). La visualización de conjuntos con muchas relaciones posibles es un problema no trivial (Alsallakh et al., L-15). Además, una superposición accidental afirma una pertenencia que no existe |
| Al repetirse | Muchas envolventes contiguas forman un mosaico; los bordes compiten |
| Al superponerse | Pertenencia múltiple ambigua |
| Profundidad y perspectiva | Una envolvente 3D (casco) se ve distinta desde cada ángulo; una 2.5D (región sobre un marco) es más estable |
| Identidad | La del grupo, si el grupo es una Entidad |
| Interrogación | Geometría de respuesta = envolvente menos lo contenido visible (EM §4.3.1) |
| Densidad | N0–N2 con anidamiento limitado. **Sólo representa con honestidad relaciones de árbol estricto** (§7.3; CR-1) |

### 6.4 Familia D — Relaciones geométricas

#### P11 · Distancia o proximidad

| Pregunta | Respuesta |
|---|---|
| Comunica sin texto | Agrupamiento; "esto va con esto" (principio clásico de la Gestalt) |
| Depende del contexto | Que exista una escala de distancia con significado |
| Se combina con | Envolvente (la región común la supera, L-8); alineación |
| Ambigüedad | **La proximidad se percibe siempre**, aunque el layout la haya producido por accidente |
| Al repetirse | Grupos espurios |
| Al superponerse | — |
| Profundidad y perspectiva | La proximidad en pantalla no coincide con la proximidad en el espacio. Los juicios de posición relativa son peores en 3D que en 2D (L-5, L-6) |
| Identidad | No aplica |
| Interrogación | No es interrogable: es una lectura |
| Densidad | Crece la proximidad accidental |

**Nota normativa.** La proximidad visual no es Relación (Vocab §2.4); el Espacio no crea estructura por cercanía (C-3); agrupar por similitud es una señal de "segundo modelo" (EM §5.8). La proximidad es una primitiva **peligrosa por defecto**: ningún layout puede producir proximidad que no esté respaldada por estructura sin contrarrestarla con separación (G-2).

#### P12 · Alineación

| Pregunta | Respuesta |
|---|---|
| Comunica sin texto | Correspondencia, orden, comparabilidad. La percepción es relativa y gana precisión con marcos comunes, escalas y alineación (L-4; Cleveland & McGill, L-2) |
| Depende del contexto | Qué dimensión alinea |
| Se combina con | Planos (R1, R2), guías |
| Ambigüedad | La alineación accidental se lee como correspondencia |
| Al repetirse | Grilla; puede leerse como tabla |
| Al superponerse | — |
| Profundidad y perspectiva | Se pierde en perspectiva salvo desde ángulos favorables |
| Identidad | Ayuda a reconocer "lo mismo" en otra capa (R2) |
| Interrogación | Lectura, no objeto |
| Densidad | Útil en N1–N2 si el eje se mantiene legible |

#### P13 · Contención

| Pregunta | Respuesta |
|---|---|
| Comunica sin texto | "Está dentro de": pertenencia jerárquica. La contención puede anidarse (L-4) |
| Depende del contexto | Que la relación de la Fuente sea un **árbol** |
| Se combina con | Envolvente (P10), escala (el contenedor es mayor que lo contenido), etiquetas |
| Ambigüedad | **No admite pertenencia múltiple sin superposición**, y la superposición introduce la ambigüedad de P10. Expresar la misma pertenencia con contención en un nivel y con conexión en otro rompe la regla (W2) |
| Al repetirse | Anidamiento profundo: los niveles internos se vuelven diminutos; requiere escala semántica |
| Al superponerse | Ver P10 |
| Profundidad y perspectiva | La contención 3D (volumen dentro de volumen) oculta lo contenido; la 2.5D (región dentro de región sobre un marco) lo mantiene visible |
| Identidad | Contenedor y contenido conservan cada uno su identidad |
| Interrogación | La regla del EM §4.3.1 (responde la Entidad más específica bajo el punto) presupone contención decidible |
| Densidad | N0–N2 con escala semántica estructural (EM §5.4.4). N3: agregación por contenedor |

**Nota normativa.** El EM §4.7 identifica la contención como uno de los dos aportes propios del Espacio. Es, por lo tanto, **la primitiva de mayor legitimidad normativa y, a la vez, la de mayor exigencia de veracidad**: sólo puede afirmar lo que la Fuente afirma como árbol (CR-1).

#### P14 · Intersección

| Pregunta | Respuesta |
|---|---|
| Comunica sin texto | Lo compartido entre dos extensiones; cruce |
| Depende del contexto | Si la intersección es dato (pertenencia común) o accidente geométrico |
| Se combina con | Envolventes → diagrama de Euler; planos → ejes de cruce |
| Ambigüedad | En 3D, dos planos o volúmenes que se cortan producen una línea de intersección que se lee como relación |
| Al repetirse | Mosaico de regiones compartidas, ilegible pasados unos pocos conjuntos (L-15) |
| Al superponerse | — |
| Profundidad y perspectiva | Las intersecciones translúcidas son el peor caso del orden de transparencias por malla (PC-3) |
| Identidad | — |
| Interrogación | La región intersectada no es una Entidad; responder a ella sería inventar un objeto |
| Densidad | N0–N1 |

#### P15 · Orientación

| Pregunta | Respuesta |
|---|---|
| Comunica sin texto | Dirección, "arriba", inclinación. La inclinación se detecta de un vistazo, sin búsqueda (L-4) |
| Depende del contexto | Un marco de referencia estable |
| Se combina con | Flechas, planos, glifos |
| Ambigüedad | En 3D, la orientación de un objeto cambia con la cámara; sólo la orientación relativa al mundo o a la pantalla es estable |
| Al repetirse | Un campo de orientaciones produce textura |
| Al superponerse | — |
| Profundidad y perspectiva | Se distorsiona con la perspectiva |
| Identidad | — |
| Interrogación | — |
| Densidad | Útil como canal de pocos valores |

### 6.5 Familia E — Propiedades

#### P16 · Escala (tamaño)

| Pregunta | Respuesta |
|---|---|
| Comunica sin texto | Magnitud; prominencia; "contiene más" |
| Depende del contexto | Una referencia para comparar |
| Se combina con | Contención (el contenedor es más grande); énfasis |
| Ambigüedad | **En perspectiva, el tamaño aparente se confunde con la cercanía.** Además, el área y el volumen se perciben con error sistemático (L-2, L-4) |
| Al repetirse | Jerarquía visual por tamaño: se lee como importancia |
| Al superponerse | Lo grande tapa lo chico |
| Profundidad y perspectiva | Ver ambigüedad |
| Identidad | — |
| Interrogación | Lo pequeño es difícil de señalar (PC-1) |
| Densidad | El tamaño mínimo legible fija cuántas Entidades caben en una vista |

**Nota normativa.** La Masa no determina tamaño, posición, prominencia ni color de nada en el Espacio (EM §6.8). El tamaño tampoco puede derivar de relevancia inferida (C-17). Lo que la norma deja disponible es el tamaño **estructural** (extensión por contenido; EM §4.7).

#### P17 · Profundidad

| Pregunta | Respuesta |
|---|---|
| Comunica sin texto | Orden delante/detrás; capas; cercanía a la cámara |
| Depende del contexto | Indicios: oclusión, perspectiva, sombra, movimiento. La profundidad (posición 3D) es un canal de magnitud débil (L-4) |
| Se combina con | Guías (R8), movimiento de cámara (profundidad cinética, L-7) |
| Ambigüedad | Sin indicios, la profundidad absoluta no se lee |
| Al repetirse | — |
| Al superponerse | Oclusión: el problema 3D principal, con técnicas identificables (Elmqvist & Tsigas, EM X1) |
| Profundidad y perspectiva | — |
| Identidad | — |
| Interrogación | El picking con profundidad es opcional y permite reconstruir la posición en el mundo (PC-1, PC-2) |
| Densidad | En N2–N3 la oclusión crece con la profundidad |

#### P18 · Transparencia

| Pregunta | Respuesta |
|---|---|
| Comunica sin texto | Copresencia de lo que está detrás; "esto no es sólido"; marco que no tapa (R3) |
| Depende del contexto | Cuánto se ve a través |
| Se combina con | Planos, envolventes, volúmenes |
| Ambigüedad | Qué está delante; mezclas de color sin significado (un rojo detrás de un azul parece violeta) |
| Al repetirse | Muchas capas translúcidas se acumulan hasta la opacidad o el blanco |
| Al superponerse | El orden de dibujo se resuelve **por instancia de malla, de atrás hacia adelante** (PC-3). Superficies translúcidas que se intersectan o se envuelven no pueden ordenarse correctamente por objeto [HIP, consecuencia del ordenamiento por malla] |
| Profundidad y perspectiva | Aumenta la ambigüedad de profundidad |
| Identidad | — |
| Interrogación | Lo translúcido igual responde al picking y tapa lo que se ve a través |
| Densidad | Sólo N0–N1 |

#### P19 · Color

| Pregunta | Respuesta |
|---|---|
| Comunica sin texto | Categoría (tono) o magnitud (luminancia, saturación). El tono es el segundo canal de identidad más efectivo (L-4) y el de mayor capacidad atencional para distinguir categorías, con cerca del doble que el movimiento (Haroz & Whitney 2012, L-11) |
| Depende del contexto | Leyenda; contraste con el fondo; visión del color de cada persona |
| Se combina con | Forma (con interferencia asimétrica: la variación de tono enmascara patrones de forma; L-10) |
| Ambigüedad | Color sin código (W5); colores que se mezclan por transparencia |
| Al repetirse | La capacidad para categorías simultáneas es baja; las guías recomiendan "menos es más" y mostrar "un par de categorías a la vez" (L-11) |
| Al superponerse | Mezcla |
| Profundidad y perspectiva | La iluminación y la niebla alteran el color percibido |
| Identidad | Identidad de clase |
| Interrogación | — |
| Densidad | Satura antes que la forma o la posición |

**Nota normativa.** Ningún estado se codifica sólo con color (EM §4.6.4; C-8). La paleta vigente tiene un único acento de estado activo y un único color de error ("el acento no decora; el acento indica"). El color disponible para el lenguaje es, por diseño, escaso (CR-4).

### 6.6 Familia F — Auxiliares y texto

#### P20 · Guía auxiliar (líneas de caída, ejes, huellas, marcos)

| Pregunta | Respuesta |
|---|---|
| Comunica sin texto | Dónde está algo respecto de una referencia; hace legible la profundidad (R8, R17) |
| Depende del contexto | Que se distinga de los datos |
| Se combina con | Puntos, planos |
| Ambigüedad | Una guía que se parece a una Relación se lee como Relación |
| Al repetirse | Cortina de líneas (R8 bajo densidad) |
| Al superponerse | — |
| Profundidad y perspectiva | Es su razón de ser |
| Identidad | No tiene; no debe responder al picking como Entidad (EM §4.3.6, "lo que nunca responde como Entidad") |
| Interrogación | No interrogable |
| Densidad | **Local y temporal** (sólo para lo indicado o enfocado) [HIP]; permanente sólo en N0 |

#### P21 · Texto espacial (etiquetas)

| Pregunta | Respuesta |
|---|---|
| Comunica sin texto | — (*es* el texto). Nombra con precisión |
| Depende del contexto | Que sea legible: tamaño, ángulo, contraste |
| Se combina con | Puntos, envolventes, Anotaciones |
| Ambigüedad | A qué marca pertenece una etiqueta en zonas densas |
| Al repetirse | Problema de ubicación de etiquetas; superposición |
| Al superponerse | Ilegible |
| Profundidad y perspectiva | El texto inclinado por perspectiva se lee mal (EM §4.7, X4). Las etiquetas siempre de frente a la cámara evitan la inclinación (R18). Las fuentes MSDF se mantienen nítidas a cualquier tamaño (PC-6). El prototipo usa etiquetas HTML (EM §4.6) |
| Identidad | Es el portador principal de identidad legible (EM §4.4: nombre, tipo) |
| Interrogación | Una etiqueta puede ser un sustituto de la Entidad para señalarla (EM §4.3.4) |
| Densidad | N0: todas. N1: selectivas. N2: sólo foco, indicación y anclas. N3: ninguna individual; texto de agregado |

### 6.7 Familia G — Tiempo

#### P22 · Movimiento

Se distinguen tres clases, porque su valor informativo es opuesto.

| Clase | Comunica | Evidencia | Riesgo |
|---|---|---|---|
| **G-a · Movimiento de cámara controlado por la persona** | Estructura 3D por profundidad cinética. El movimiento estructurado mejoró la comprensión de grafos más que el estéreo (Ware & Franck 1996, L-7), y con movimiento y estéreo se trazaron caminos en grafos de hasta ~1000 nodos (L-9) | L-7, L-9 | Desorientación si la cámara no tiene límites ni retorno |
| **G-b · Transición animada entre estados** | Continuidad del objeto a través del cambio; seguimiento. Las transiciones animadas "pueden mejorar significativamente la percepción gráfica" (Heer & Robertson 2007, L-13). Antecedente: el "vuelo" de cámara hacia el Foco en lugar de un corte [HIST, Gateway v0.1 §3.2] | L-13 | Transiciones largas que retrasan la acción |
| **G-c · Movimiento de objetos en reposo** (partículas, pulsos, órbitas, respiración) | Agrupamiento por movimiento común: el movimiento agrupa objetos distintos, y el circular es el que más atención demanda (Bartram & Ware 2002, L-12). Atrae la atención: un cambio rápido produce transitorios que alertan (L-10) | L-10, L-12 | **Compite con la lectura**; con muchas fuentes de movimiento ninguna destaca. La paleta prohíbe "animaciones sin cambio de estado real" (CR-3) |

| Pregunta | Respuesta común |
|---|---|
| Identidad | Una transición animada conserva la identidad de un objeto entre dos estados mejor que un corte [HIP basado en L-13] |
| Interrogación | Un objeto en movimiento es un objetivo móvil, más difícil de señalar |
| Densidad | G-a escala bien (es la persona quien mira). G-b escala si se anima lo que cambió y no todo. G-c **no escala**: satura en N1 |
| Ceguera al cambio | Un cambio fuera del foco de atención se pierde fácilmente (Healey & Enns 2012, L-10). Lo que cambia en la Fuente y requiere a la persona **no puede depender de un cambio sutil dentro de la escena**: corresponde a la convocatoria en la capa O (EM §7.4; C-17) |

---
## 7. Gramática espacial

Una primitiva aislada no es un lenguaje (encargo §6). La gramática estudia qué afirman las **combinaciones** y cómo evitar que la representación afirme lo que la Fuente no afirma.

### 7.1 Estructura conceptual frente a estructura perceptual

- **Estructura conceptual:** las relaciones que la Fuente afirma (Vocab §2.1–§2.4, §3.2, §3.8).
- **Estructura perceptual:** las relaciones que una persona *lee* en la imagen (agrupamiento, contención, conexión, orden, prominencia), las haya codificado alguien o no.

La gramática es correcta cuando **toda estructura perceptual corresponde a una estructura conceptual con Fuente, o se declara auxiliar o de vista**. Cuando la imagen hace legibles relaciones que no existen, la representación se convierte en una **segunda ontología** (encargo §6), que es exactamente lo que C-3 y el EM §5.8 prohíben.

#### Relaciones conceptuales que el lenguaje deberá soportar, por su naturaleza

| Relación (norma) | Naturaleza estructural | Qué propiedad perceptual exigiría (no qué forma) | Restricción normativa |
|---|---|---|---|
| Pertenencia soberana Tenant › Organization › Project (› Repository) | **Árbol estricto**, respaldado por `ProjectBinding` | Pertenencia inequívoca y anidable | C-3, C-12 (sólo verificado con Contexto confirmado) |
| Domain y Gene dentro del Project | Árbol respecto del Project (frontera de identidad del Gene V1 = Project) | Pertenencia al Project | Vocab §2.1, §2.3 |
| Domain ↔ Gene ratificada | **N:M** (Gene v3.0 §2.6, inv. 13; Vocab §2.4) | Pertenencia múltiple o conexión; **no** contención estricta | CR-1 |
| `ParentID` observado | Vínculo de padre (Vocab §2.4) | Pertenencia | LocationSnapshot §6 |
| Situar (Trabajo sobre Entidad) | **No es Relación** del Territorio | Adherencia de una Anotación a una Entidad, sin posición propia | C-4, C-6, C-8 |
| Anotación sobre Entidad | Referencia, no estructura | Subordinación visible a la Entidad | C-8; EM §5.1 |
| Anotación entre dos Entidades (p. ej. `semantic_candidate`) | Propuesta, no Relación | Distinguible de una Relación **sin color**; no navegable | EM §5.8 (L4, L5); C-2 |
| Criterio de Gravity por nodo de la jerarquía normativa | Anotación sobre las Entidades Organization y Project; NUCLEUS, MANDATE y SESSION no tienen Entidad | Ninguna geometría propia; sin campo, región ni volumen | C-4, C-6, C-15 |
| Referencia `missing` de una Location reabierta | Anotación con el ancestro como soporte espacial | Distinguir "sobre el ancestro" de "del ancestro" | DJ-9 |

### 7.2 Efectos gramaticales

| Efecto (encargo §6) | Combinación que lo produce | Qué afirma ante quien mira | Riesgo de afirmar de más | Condición normativa |
|---|---|---|---|---|
| **Pertenencia** | Contención (P13), región común (P10), conexión con un padre (P3) | "Es parte de" | Doble código (W2); pertenencia accidental por superposición | Sólo con estructura con Fuente (C-3) |
| **Separación** | Distancia (P11), bordes nítidos, vacío | "No tienen que ver" | Separar lo que está relacionado oculta Relaciones | Ninguna Relación con Fuente puede quedar sin representación sin declararse (EM §5.4.4) |
| **Continuidad** | Líneas y curvas continuas, transiciones (G-b) | "Es lo mismo que sigue" | Continuidad entre cosas distintas | — |
| **Agrupamiento** | Proximidad, región común, color o forma común, movimiento común | "Van juntos" | **Agrupar por similitud** es señal de segundo modelo | EM §5.8 |
| **Proximidad** | Distancia | "Están relacionados" | Siempre se percibe | Vocab §2.4; G-2 |
| **Contención** | P13 con P10 | "Está dentro de" | Pertenencia N:M forzada a un árbol | CR-1 |
| **Extensión** | Área o volumen de una región, escala estructural | "Ocupa / abarca / contiene más" | Que se lea como importancia | EM §4.7 (aporte propio); EM §6.8 (no Masa) |
| **Dirección** | Punta de flecha, orientación, movimiento | "De aquí hacia allí" | Implicar flujo o proceso | — |
| **Conexión** | P3, P4 | "Hay un vínculo" | Conexión ornamental (W7) | Vocab §2.4: no es una arista inventada para dibujar |
| **Jerarquía perceptual** | Tamaño, contraste, posición central, saliencia | "Esto primero" | Confundirla con importancia o con jerarquía conceptual | §7.5 |
| **Figura y fondo** | Contraste, desenfoque, saturación | "Esto es dato; aquello es fondo" | Que el fondo use las marcas del dato (W9) | G-7 |
| **Oclusión** | Profundidad | "Está delante" | Ocultar sin decirlo | EM §4.3.3 (lo ocluido sigue siendo alcanzable) |
| **Densidad** | Cantidad de marcas por área | "Acá hay mucho" | Densidad visual tomada como dato | EM §5.4.4 |
| **Prominencia** | Escala, luminosidad, movimiento | "Mirá esto" | Prominencia por relevancia inferida | C-17; EM §5.4.3 |
| **Persistencia del contexto** | Atenuación sin eliminación, marco estable | "Lo demás sigue ahí" | Atenuación no declarada | EM §5.4.5 |
| **Orientación** | Marco fijo, "arriba" estable, rótulos de la vista | "Dónde estoy" | Que el marco de orientación se confunda con estructura | D-2 (HUD siempre presente) |
| **Navegación** | Cámara (G-a), transiciones (G-b), sincronía con la Superficie | "Puedo ir" | Exigir mover la cámara para alcanzar algo | EM §4.3.3, §4.6.1 |

### 7.3 Contención, árboles y pertenencia múltiple

1. La contención (P13) y la región común (P10) son las primitivas de pertenencia más fuertes (L-8) y la contención es un aporte propio del Espacio (EM §4.7).
2. Ambas representan con honestidad sólo relaciones de **árbol**: cada contenido tiene exactamente un contenedor inmediato.
3. Domain↔Gene es N:M (Gene v3.0). Un Gene ratificado en dos Domains no puede estar contenido en ambos sin una de estas tres consecuencias:
   - **superponer envolventes**, lo que produce pertenencia ambigua y no escala (L-15);
   - **replicar al Gene**, lo que hace que una misma identidad parezca dos Entidades e induce a leer dos Genes (C-3: no crear Territorio);
   - **elegir un contenedor**, lo que hace que la representación ordene un hecho que la Fuente no ordena (C-3: "no reordena ni re-anida").
4. Por eso la investigación concluye, como **capacidad y no como decisión**, que el lenguaje necesitará al menos **dos dispositivos de pertenencia distintos**: uno para árboles y otro para relaciones N:M. Cuál será es materia de la Arquitectura UI/UX, una vez que José resuelva CR-1.

### 7.4 Principios gramaticales resultantes

| ID | Principio | Fundamento |
|---|---|---|
| **G-1** | **Una propiedad perceptual, una semántica.** Ningún canal (tono, forma, discontinuidad, movimiento, altura) se usa para dos significados en la misma vista. | W5, P6; EM §5.4.2 |
| **G-2** | **Toda propiedad perceptual que sugiera pertenencia o relación** (proximidad, alineación, región común, conexión, intersección) **se produce sólo a partir de estructura con Fuente.** Lo accidental se neutraliza (separación mínima, ausencia de alineación espuria). | Vocab §2.4; C-3; P11, P12, P14 |
| **G-3** | **Un tipo de relación, un código.** La misma relación conceptual se representa siempre con el mismo dispositivo, en todos los niveles. | W2 |
| **G-4** | **La contención sólo para árboles** de la Fuente. | §7.3; CR-1 |
| **G-5** | **La profundidad sólo se usa si es legible:** con referencia (marco o guía) o con movimiento de cámara. | P17; R8; L-7 |
| **G-6** | **Toda marca es interrogable o se declara auxiliar.** Si una marca no lleva a una identidad, a una Anotación con su Lente o a una función de orientación, sobra. | W7; EM §4.3.6 |
| **G-7** | **Lo ambiental no usa las marcas de lo estructural**, y su retiro no hace perder información. | W9, W13 |
| **G-8** | **El layout del Territorio es determinista e invariante a las Lentes**; la estabilidad es de presentación, no de identidad. | EM §5.8 (L3); C-1 |
| **G-9** | **La prominencia sólo deriva** del Navigation State (Foco, Anchors), de la Atención clasificada por su Fuente, o de la escala estructural. **Nunca** de relevancia inferida ni de Masa. | C-17; EM §5.4.3, §6.8 |
| **G-10** | **Atenuar sí, eliminar no**, y toda atenuación se declara como estado de vista. | EM §5.4.5; R6, R15 |

### 7.5 Jerarquía conceptual frente a jerarquía perceptual

La jerarquía de un sistema no obliga a usar altura, niveles, pisos ni tamaños jerárquicos (encargo §6). Se distinguen tres jerarquías que la representación no debe fusionar:

1. **Jerarquía conceptual:** la estructura de la Fuente (árbol soberano, pertenencia al Project, relaciones N:M).
2. **Jerarquía perceptual:** el orden en que la mirada recorre la imagen (saliencia).
3. **Jerarquía de importancia:** que la norma **no** le asigna a Orrery (C-17).

`wrong_not_wanted.png` fusiona la 1 con una jerarquía de altura (W1). El riesgo simétrico, más sutil, es fusionar la 2 con la 3: hacer más visible lo que "parece importante". **G-9** separa la jerarquía perceptual de la de importancia.

---

## 8. Profundidad informativa frente a decorativa

### 8.1 La pregunta del encargo

> ¿Qué información puede comunicar Orrery gracias a ser tridimensional que sería sustancialmente más difícil de comprender en una representación plana?

La respuesta se acota con DM-2: lo que el Espacio aporta de forma propia es contención y extensión, y ningún fenómeno puede ser perceptible *sólo* en 3D (EM §4.7).

### 8.2 Evidencia

| Fuente | Ganancia del 3D | Costo del 3D | Condición |
|---|---|---|---|
| St. John et al. 2001 (L-5) | Comprensión de **forma** | Peor en juicios de **posición relativa**, aun en tareas que requieren conocimiento 3D | — |
| Tory et al. 2006 (L-6) | Navegación y posicionamiento **aproximados** | Malo para tareas **precisas** | Las vistas combinadas 2D+3D rindieron mejor en tareas precisas, con más confianza de los usuarios |
| Ware & Franck 1996 (L-7) | Tamaño del grafo comprensible ×3 con estéreo y acoplamiento a la cabeza; el movimiento estructurado mejoró más que el estéreo | — | Profundidad cinética |
| Ware & Mitchell 2008 (L-9) | Trazado de caminos en grafos de 333 nodos (personas sin entrenamiento) y hasta 1000 (con entrenamiento), con menos del 10% de error; un orden de magnitud sobre 2D | — | Movimiento y estéreo, pantalla de muy alta resolución |
| Munzner (EM X4; L-4) | — | "No unjustified 3D": oclusión, distorsión de perspectiva, texto inclinado; la profundidad es un canal de magnitud débil | — |
| Cockburn & McKenzie 2002 (EM X4) | — | El 3D dificulta la recuperación en interfaces físicas; no significativo en virtuales | — |
| Elmqvist & Tsigas 2008 (EM X1) | — | La oclusión es un problema de diseño con 50 técnicas en 5 patrones | — |

### 8.3 Usos informativos de la profundidad

| Uso | Qué hace legible | Estado normativo |
|---|---|---|
| **I-1 · Contención y extensión** (regiones anidadas con extensión proporcional a su contenido) | Pertenencia y tamaño estructural | **Aporte propio del Espacio** (EM §4.7) |
| **I-2 · Capas paralelas homogéneas** (eje homogéneo ordenado, R1) | Copresencia de estructuras comparables | Capacidad demostrada en las referencias; no hay en la norma un fenómeno homogéneo apilable evidente [HIP] |
| **I-3 · Separación por profundidad entre clases de marcas** (p. ej. lo estructural en un estrato y lo anotado en otro) | Que las Anotaciones no ocluyan al Territorio | Capacidad [HIP]. **No autoriza** a asignar Lentes a planos (§3.2, R1, R3) |
| **I-4 · Trazado de Relaciones en densidad con profundidad cinética** | Seguir caminos en una red densa | **Hipótesis H-3D-1**, más allá de contención y extensión; no se adopta (CR-11) |
| **I-5 · Forma global del Territorio** (comprensión de forma, L-5) | La "silueta" del Territorio de un vistazo | **Hipótesis H-3D-2**. Riesgo: la forma global depende del layout, no de la Fuente (C-1) |
| **I-6 · Foco con contexto por perspectiva** (lo cercano grande, lo lejano chico) | Una distorsión "ojo de pez" natural | **Hipótesis H-3D-3**. Riesgo: inutiliza el tamaño como canal (P16) |

### 8.4 Usos decorativos de la profundidad

| Uso | Por qué es decorativo | Ejemplo |
|---|---|---|
| D-1 · Profundidad que codifica una variable que ya está codificada | Redundancia que ocupa la dimensión | W1 (tipo → altura) |
| D-2 · Volumen sin semántica | El volumen no representa nada más que "presencia" | W3, W4 |
| D-3 · Profundidad ambiental | El fondo con profundidad (cielo, nebulosas) no es dato | W9, W13 |
| D-4 · Movimiento de cámara automático en reposo (órbita lenta perpetua) | Muestra la profundidad sin que la persona la pida; viola "ninguna actividad del sistema cambia… por sí sola" en cuanto al lugar o modo | C-17; paleta (CR-3) |
| D-5 · Oclusión sin ganancia | Lo que tapa no agrega información | W11 |

### 8.5 Respuesta a la pregunta central

Dentro de la norma vigente, **lo que Orrery puede comunicar gracias a ser tridimensional es la contención y la extensión del Territorio con más espacio disponible que en un plano**:
- regiones anidadas, legibles a varias escalas;
- capas de marcas que no se ocluyen entre sí;
- una navegación que conserva el contexto mientras cambia la escala.

La literatura sugiere una ganancia adicional (H-3D-1: trazado de Relaciones en densidad), pero **condicionada al movimiento de cámara** y medida con estéreo y pantallas de alta resolución, condiciones que Orrery no garantiza. Por eso queda como hipótesis.

La ganancia del 3D, cuando existe, **viene del movimiento**, no de la imagen fija en perspectiva. Una escena 3D que se mira siempre desde el mismo ángulo hereda los costos del 3D (oclusión, distorsión, texto inclinado) sin su beneficio principal.

### 8.6 Prueba de aplanamiento

Para cada uso de la profundidad en una futura propuesta:
1. Describir su **equivalente plano** (vista desde arriba, pequeños múltiplos, lista o árbol).
2. Si el equivalente plano transmite lo mismo con igual o menor esfuerzo, la profundidad es decorativa (W8).
3. Si el equivalente plano pierde algo, nombrar qué (contención, extensión o la separación entre clases de marcas) y **comprobar que la Superficie conserva su equivalente**, porque ningún fenómeno puede ser perceptible sólo en 3D (EM §4.7).

### 8.7 La cámara como parte del lenguaje

Si la ganancia viene del movimiento (§8.5) y los planos degeneran de canto (P7), la **política de cámara** (órbita libre o acotada, ángulos privilegiados, retorno a la vista de orientación) no es un detalle de implementación: es una variable del lenguaje. Esta investigación no la decide. Recomienda que la Arquitectura UI/UX la trate como decisión visual temprana (REC-6, §19).

---

## 9. Interacción como revelación progresiva

### 9.1 Base normativa (no se modifica)

```text
percepción (T2) ─► indicación (efímera) ─► Foco (Navigation State) ─► Anchor (deliberado) ─► Captura (deliberada)
```

- La indicación es un fenómeno sin estatus normativo (DJ-5). No pertenece al Navigation State, no tiene Fuente y no cambia cámara ni Superficie (EM §4.1).
- El Foco cambia la cámara y el sujeto de la Superficie (Vocab §2.10).
- El Anchor sólo existe por un acto deliberado (C-10).
- Indicación → Foco ocurre por un acto, no por permanencia del puntero ni por un temporizador (EM §4.5).

### 9.2 Transiciones

| Transición | Qué puede cambiar perceptualmente | Qué debe permanecer estable | Contexto que se conserva | Cómo evitar que prominencia = cambio de significado | Respuesta interactiva frente a cambio del sistema | Geometrías pequeñas, superpuestas u ocluidas | Alta densidad |
|---|---|---|---|---|---|---|---|
| **Percepción → indicación** | Una marca de respuesta sobre **una única** Entidad candidata. Información mínima: nombre, tipo, Procedencia, verificación, marca de simulación, recuentos por Lente (EM §4.4) | Layout, cámara, Superficie, Anotaciones | Todo | La marca de indicación usa un canal **reservado a la interacción** que ninguna Lente ni Procedencia usa (G-1) | La indicación es inmediata, efímera y desaparece al retirarse el puntero; ningún cambio de la Fuente usa esa firma temporal | Geometría de respuesta sustractiva (EM §4.3.1); recorrido de candidatos (§4.3.2); alcanzable desde la Superficie (§4.3.3) | La resolución del buffer de picking puede perder objetos pequeños (PC-1). La indicación de agregados debe nombrar el agregado ("N Genes"), no un miembro al azar |
| **Indicación → Foco** | La cámara se orienta hacia la Entidad; la Superficie cambia de sujeto; la marca de Foco reemplaza a la de indicación | La identidad y la posición de todas las Entidades | El Territorio circundante, atenuado pero presente (G-10); la cadena de ancestros en la capa O (EM §3.5) | El Foco destaca lo que la persona mira, no lo que "importa" | La transición de cámara es animada y continua (G-b; L-13), con una firma distinta de cualquier cambio de la Fuente | Si la Entidad está ocluida, el Foco la vuelve visible por la cámara o por una técnica de oclusión, sin alterar la estructura | El Foco puede abrir una escala semántica alrededor de la Entidad (expansión estructural; EM §5.4.4), declarando lo que se agregó |
| **Foco → Anchor** | Aparece una marca persistente de Anchor, **perceptiblemente distinta del Foco** (EM §4.6.3) | El Foco y todo lo demás | Los Anchors siguen visibles cuando el Foco se mueve a otra Entidad | El Anchor no es "más importante"; es "desde donde decido" | Es el único de los tres estados que **persiste** hasta un acto inverso; su firma visual debe expresar persistencia, no actividad | Un Anchor ocluido sigue listado en la capa O (EM §3.5) | Los Anchors son pocos por naturaleza; no se agregan |
| **Anchor → Captura** (fuera del alcance visual principal) | Confirmación del acto y de qué se capturó (EM M14) | El Territorio; la Captura no cambia la representación | Todo | — | Es un acto con consecuencia y se confirma en la Superficie, no con un efecto en la escena | — | — |

### 9.3 La indicación como revelación de interrogabilidad

**Pregunta del encargo:** ¿puede la indicación ser el mecanismo por el cual una geometría tridimensional revela que allí hay una Entidad interrogable?

**Respuesta.** Sí, con cuatro condiciones:

1. **Correspondencia exacta entre lo que responde y lo que se revela.** La geometría que responde es la de la Entidad más específica bajo el punto (EM §4.3.1). Si la marca de indicación cubriera también a los contenidos, la persona leería que indica al contenedor *con* sus contenidos.
2. **Revelación sin reorganización.** La indicación no mueve nada, no abre nada y no cambia el layout. Sólo agrega una marca y una etiqueta mínima (EM §4.4). Cualquier efecto que desplace marcas vecinas convierte la indicación en navegación.
3. **Canal reservado.** La marca de indicación, la de Foco y la de Anchor ocupan canales que **ninguna Lente usa**. Si una Lente usara el mismo contorno que la indicación, la persona no sabría si el sistema le está mostrando algo o si es su propio puntero.
4. **Equivalente no puntero.** El mismo recorrido de candidatos por teclado o desde la Superficie (EM §4.6.2).

### 9.4 Distinguir una respuesta interactiva de una modificación del sistema

| Rasgo | Respuesta interactiva (indicación, Foco, Anchor) | Cambio originado en una Fuente (Anotación nueva, estado nuevo) |
|---|---|---|
| Causa | Acto o movimiento de la persona | Lectura de una Proyección |
| Latencia | Inmediata | La de la Fuente; puede llegar en cualquier momento |
| Ubicación | Donde está el puntero, el Foco o el Anchor | En cualquier Entidad, incluso fuera de la vista |
| Canal | Reservado a la interacción (§9.3) | El de la Lente correspondiente |
| Persistencia | Efímera (indicación), de sesión (Foco) o persistente (Anchor) | Mientras la Proyección la sostenga |
| Riesgo | Que se lea como cambio del sistema | Que pase desapercibido (ceguera al cambio, L-10) |
| Mitigación | Firma temporal propia | Si requiere a la persona, es Atención y se convoca en la capa O, sin mover nada (C-17; EM §7.4) |

---

## 10. Comportamiento bajo densidad

### 10.1 Comportamiento por familia, de N0 a N3

| Familia | N0 · escaso | N1 · medio | N2 · denso | N3 · extremadamente denso |
|---|---|---|---|---|
| A · Posición | Todo etiquetado e indicable | Etiquetado selectivo | Oclusión; fallas de picking en objetos pequeños | Nube; requiere agregación |
| B · Lineales | Todas legibles | Cruces | Ovillo; el trazado requiere movimiento (L-7) o agrupamiento (L-14) | Sólo agregados o filtrados |
| C · Extensión | Envolventes nítidas | Anidamiento de dos o tres niveles | Mosaicos; transparencias acumuladas | Sólo contenedores con recuento |
| D · Relaciones geométricas | Lecturas correctas | Primeras lecturas accidentales | La proximidad accidental domina | Ilegible |
| E · Propiedades | Todos los canales disponibles | La capacidad de categorías se agota (L-11) | El tamaño deja de leerse | Sólo luminancia y tono para agregados |
| F · Auxiliares y texto | Permanentes | Locales | Sólo para Foco, indicación y Anchors | Texto de agregado |
| G · Tiempo | Transiciones claras | El movimiento en reposo empieza a competir | Sólo el movimiento de cámara conserva valor | Sólo el movimiento de cámara |

### 10.2 Mecanismos y sus condiciones normativas

| Mecanismo | Qué hace | Condición normativa | Antecedente |
|---|---|---|---|
| **Agregación estructural** | Reemplaza a un conjunto de Entidades por su contenedor con un recuento | Sólo por estructura (profundidad en el Territorio, distancia al Foco), nunca por relevancia; se dice cuánto se agregó (EM §5.4.4) | Furnas (EM X3); van Ham & Perer (EM X5) |
| **Escala semántica** | Cada escala tiene reglas propias de qué mostrar | Reglas estructurales; continuidad durante el zoom (G-b) | [HIST] Research Resultados §2.0.1 (Google Maps) |
| **Desénfasis declarado** | Atenúa lo que no está en foco o no está anotado | Declarado como estado de vista (EM §5.4.5) | Foco no destructivo [HIST] Research Resultados §2.3.3 |
| **Filtrado por Lente** | Desactivar una Lente retira sólo sus Anotaciones | EM §5.3.3 | — |
| **Agrupamiento de conexiones** | Agrupa líneas por camino común en la jerarquía | Que cada Relación siga siendo recuperable por interrogación o en la Superficie | Holten 2006 (L-14) |
| **Traspaso a Superficie** | La lista o la jerarquía reemplazan a la escena para lo individual | Toda Entidad alcanzable en el Espacio lo es en la Superficie (EM §4.6.1) | Ellis & Dix 2007 (L-16): cada técnica de reducción de desorden tiene beneficios y pérdidas |

### 10.3 Degradar la representación sin degradar la verdad

| ID | Invariante de degradación | Fundamento |
|---|---|---|
| **DV-1** | Un agregado **dice cuántos** elementos representa y de qué tipo. | EM §5.4.4 |
| **DV-2** | Un agregado **conserva la cobertura**: si alguno de sus miembros es *desconocido* para una Lente, el agregado no puede leerse como *ninguno*. | DJ-7; C-2 |
| **DV-3** | Un agregado **conserva la Atención**: si un miembro tiene Atención clasificada, el agregado lo muestra. La Atención atraviesa las escalas. | C-17; [HIST] Research Resultados §2.1.2 ("una alerta… debe atravesar el nivel de zoom") |
| **DV-4** | Un agregado **conserva la Procedencia más débil** de sus miembros, o declara la mezcla; nunca muestra más autoridad que la del miembro menos verificado. | C-2 |
| **DV-5** | Toda Entidad agregada es **recuperable**: por expansión estructural o por la Superficie. | EM §4.6.1 |
| **DV-6** | La degradación es **determinista**: el mismo Territorio, en la misma escala, se agrega igual. | G-8; EM §5.4.3 |

### 10.4 Presupuesto de canales (el límite real del lenguaje)

**Demanda normativa de dimensiones categóricas que pueden estar presentes a la vez:**

| Dimensión | Valores | Fuente normativa | ¿Puede ir sólo en la Superficie? |
|---|---|---|---|
| Tipo de Entidad | 6 (Tenant, Organization, Project, Repository, Domain, Gene) | Vocab §2.3 | No del todo: el tipo es parte de la indicación (EM §4.4); la contención ya lleva parte del tipo |
| Procedencia | 5 (verificado, declarado por un Mandate, propuesto, proyección, no verificable) + simulado | Vocab §3.5; C-2; M9 | No: tiene que haber marca en el Espacio (EM §5.6) |
| Clase de Fuente | 7 | Vocab §2.5 | En parte (texto en Superficie; marca en el Espacio para las débiles, CT-12) |
| Estado interactivo | 3 (indicación, Foco, Anchor) | EM §4 | No |
| Identidad de Lente | Hasta 8 Proyecciones (P-W1..P-I1) | EM §5.2, §5.4.2 | No |
| Cobertura por Lente | 3 (con filas, ninguno, desconocido) | DJ-7 | No (desconocido requiere marca) |
| Estado de colisión | 4 | C-16; EM §6.3 | No |
| Resolución de Location | 8 | LocationSnapshot §D; EM §7.5 | Parcial |
| Atención | presente/ausente | Vocab §3.7 | Convocatoria en la capa O; Anotación opcional |

**Oferta perceptual:**
- Canales de identidad en orden de efectividad: región espacial, tono, movimiento, forma (L-4).
- El tono está limitado por la paleta (CR-4) y no puede ser el único portador (EM §4.6.4).
- El movimiento en reposo es indeseable (CR-3; P22 G-c).
- La forma es el menos efectivo y no es estable en 3D si no se orienta a la cámara (P2).
- La capacidad atencional para categorías simultáneas es baja y mejora con agrupamiento espacial (L-11).
- Las conjunciones de rasgos no se detectan de un vistazo (L-10).

**Conclusión.** **La demanda supera ampliamente a la oferta si todas las dimensiones deben ser simultáneamente perceptibles en el Espacio.** El lenguaje tendrá que decidir:
1. qué dimensiones viven siempre en el Espacio y cuáles sólo en la indicación o en la Superficie;
2. cuántas Lentes pueden estar activas a la vez;
3. qué combinaciones son mutuamente excluyentes en una misma vista.

Esto depende de cómo se lea "dos Lentes no comparten el mismo canal de codificación" (EM §5.4.2):
- **(a)** cada Lente usa un *tipo* de canal distinto: con cuatro canales de identidad, y el movimiento desaconsejado, caben unas tres Lentes simultáneas;
- **(b)** cada Lente usa un *valor* distinto dentro de un canal: caben más, pero la capacidad atencional (L-11) las vuelve indistinguibles pronto.

En ambas lecturas, **el número de Lentes simultáneas está acotado perceptualmente**. Se registra como CR-2 para decisión de José.

### 10.5 Volver a encontrar una Entidad

1. **Layout estable** (G-8): la misma Entidad aparece en el mismo lugar relativo mientras el Territorio no cambie. Esa estabilidad es de presentación; la posición no es identidad (C-1).
2. **Búsqueda en la Superficie** con el mismo efecto sobre el Navigation State (EM §4.6.1; DJ-8).
3. **Rastro de Foco** en la capa O (historia de focos del Navigation State, D-3 §2), **no** dibujado como trayectoria en el Espacio (P5).
4. **Expansión estructural** de los agregados (DV-5).

### 10.6 Cuándo el Espacio debe ceder a una Superficie

El Espacio deja de intentar mostrar detalle y una Superficie de Workspace Core asume la explicación precisa cuando se da cualquiera de estas condiciones:

| # | Condición | Fundamento |
|---|---|---|
| T-1 | Entenderlo requiere una oración | EM §5.7 |
| T-2 | Requiere un valor preciso (número, versión, digest, fecha) | EM §5.7; L-6 (el 3D es malo para tareas precisas) |
| T-3 | Es una secuencia o lista sin sentido espacial (Actions, Intents, eventos) | Vocab §4.2; EM §5.2 |
| T-4 | El número de categorías simultáneas supera la capacidad del canal disponible | §10.4; L-11 |
| T-5 | La Entidad no es representable individualmente en la escala actual (está agregada) | DV-5 |
| T-6 | La pertenencia es N:M y no puede expresarse sin ambigüedad en la escena | §7.3; CR-1 |
| T-7 | Es un acto con consecuencias | EM §7.2; C-13 |

---
## 11. PlayCanvas como condición material

Este contraste no autoriza implementación ni selección de técnicas (encargo §10). Su objetivo es que el lenguaje no dependa de recursos inviables en el medio. La documentación consultada es la del motor v2.23.1; el prototipo usa 2.22.1 (EM §4.1). Nada de esto se midió: son lecturas de documentación [PC] y sus consecuencias [HIP].

### 11.1 Picking

| Hecho documentado [PC] | Consecuencia para el lenguaje |
|---|---|
| El picker dibuja la escena en un buffer fuera de pantalla con un color de identificador por objeto y lee esos colores (PC-1) | El picking devuelve **objetos dibujados**, no Entidades. La correspondencia entre objeto y Entidad la mantiene la aplicación |
| Dibujar el buffer a una fracción de la resolución mejora el rendimiento, con "precisión reducida: objetos muy pequeños pueden perderse" (PC-1) | Hay un **tamaño mínimo interrogable**. Las marcas por debajo necesitan una región de respuesta mayor que la visible, o el recorrido de candidatos (EM §4.3.7) |
| `getSelectionAsync(x, y, width, height)` devuelve las instancias de malla dentro de un rectángulo (PC-2) | La selección rectangular devuelve **conjuntos de candidatos**, base técnica del recorrido de candidatos (EM §4.3.2) |
| La profundidad es opcional; con ella, `getWorldPointAsync` reconstruye la posición en el mundo (PC-1, PC-2) | Permite saber *dónde* se tocó una envolvente; es útil para la geometría de respuesta sustractiva |
| `prepare()` se llama sólo cuando cambian la cámara o los objetos (PC-2) | El costo del picking crece con el movimiento de cámara continuo [HIP] |
| La documentación no describe cómo se informan las instancias de una malla instanciada o agrupada (*batched*) (PC-2) | **Pregunta abierta PA-5**: si las Entidades se dibujan como instancias de una sola malla, no hay garantía documentada de identidad por instancia en el picking |

### 11.2 Instancing (muchos elementos)

| Hecho documentado [PC] | Consecuencia |
|---|---|
| El instancing dibuja **mallas idénticas** con pocos *draw calls* (PC-4) | Favorece un lenguaje con **pocas formas reutilizadas** y penaliza la variedad de formas por Entidad |
| El estado por instancia es limitado (posición, rotación, escala; color como ejemplo) (PC-4) | Los canales por instancia más baratos son posición, escala y color. La forma por instancia exige mallas distintas (más *draw calls*) |
| Todas las instancias se envían a la GPU **sin culling por frustum** (PC-4) | En N3, instanciar todo el Territorio dibuja también lo que no se ve. La agregación (§10.2) además de perceptual es material [HIP] |

### 11.3 Transparencias y capas

| Hecho documentado [PC] | Consecuencia |
|---|---|
| Cada capa tiene subcapas opaca y transparente; las transparentes se ordenan por defecto **de atrás hacia adelante por instancia de malla** (PC-3) | Envolventes translúcidas anidadas o intersectadas (P10, P13, P14) **no se pueden ordenar correctamente por objeto** cuando una envuelve a otra o se cortan [HIP, por el criterio de orden por malla]. Los errores de orden cambian con la cámara: la imagen "parpadea" al orbitar |
| `drawBucket` ofrece un orden grueso (0–255) (PC-3) | Permite ordenar por **clase** (p. ej. guías antes que Anotaciones), no por geometría |
| El orden de capas no anula la prueba de profundidad; para ignorarla hay que desactivar `depthTest` en el material (PC-3) | Las marcas que deben verse siempre (la marca de Foco, la de Anchor) pueden dibujarse sin prueba de profundidad. El costo es perder el indicio de oclusión [HIP] |

### 11.4 Líneas

| Hecho documentado [PC] | Consecuencia |
|---|---|
| WebGL y WebGPU dibujan líneas de **un píxel** (PC-5) | Las Relaciones dibujadas con líneas nativas son difíciles de ver y de señalar; el grosor como canal no existe sin otro mecanismo |
| `WideLineRenderer` dibuja segmentos como geometría orientada a la cámara, con ancho por punto, extremos redondeados, uniones, color por punto, guiones y gradientes; es retenido (PC-5) | Hay grosor, discontinuidad y color por segmento disponibles. Su costo en N2–N3 no está documentado (PA-6) |

### 11.5 Texto

| Hecho documentado [PC] | Consecuencia |
|---|---|
| Las fuentes son atlas MSDF; se mantienen nítidas a cualquier tamaño (PC-6) | El texto en el mundo es viable en nitidez; su legibilidad a ángulos oblicuos no está documentada |
| El conjunto de caracteres se elige al generar la fuente; los conjuntos grandes ocupan varias páginas (PC-6) | Los nombres de Entidades en cualquier idioma requieren un conjunto amplio [HIP] |
| El prototipo usa etiquetas HTML superpuestas (EM §4.6) | Dos vías posibles: HTML en pantalla (siempre legible, sin oclusión por la escena) o texto en el mundo (con oclusión). Decisión de la Arquitectura UI/UX |

### 11.6 Niveles de detalle y escala semántica

- La documentación primaria describe **LOD por streaming para Gaussian Splats** (PC-7).
- **No encontré documentado un sistema de LOD para mallas.**
- En consecuencia, la escala semántica (§10.2) tiene que resolverse como lógica de la aplicación sobre el modelo del Territorio [HIP]. Es coherente con que sus reglas sean estructurales (EM §5.4.4) y no geométricas.

### 11.7 Resumen de restricciones materiales sobre el lenguaje

| ID | Restricción | Primitivas afectadas |
|---|---|---|
| M-1 | Tamaño mínimo interrogable | P1, P2, P3, P21 |
| M-2 | Identidad por instancia no garantizada en el picking de mallas instanciadas | P1, P2 en N2–N3 |
| M-3 | Translúcidos anidados o intersectados con orden inestable | P7, P10, P13, P14, P18 |
| M-4 | Líneas nativas de 1 px; grosor sólo con renderer dedicado | P3, P4, P5, P6 |
| M-5 | Sin culling por frustum en instancing | Toda la familia A en N3 |
| M-6 | Sin LOD de mallas documentado | Escala semántica |

---

## 12. Relación Space ↔ Surface

### 12.1 Lo que muestran las referencias

En las tres referencias, una representación espacial convive con una superficie textual precisa. **No intentan cumplir la misma función** (R12):
- la escena orienta y muestra relaciones;
- el panel de código da el enunciado exacto.

El vínculo entre ambas es el **resaltado sincronizado**: cuando la escena muestra algo, se resaltan las líneas del panel que corresponden.

**No autoriza** a ubicar una Superficie debajo de la escena, ni a reproducir la disposición vertical. Esa disposición se parece al Régimen en paneles (R-C), y D-2 eligió R-B: el Espacio en el escenario completo y las Superficies como capas persistentes y colapsables, sin cambiar sus dimensiones.

### 12.2 Lo que ya fija la norma

| Norma | Contenido |
|---|---|
| D-2 | Las Superficies son capas persistentes y colapsables sobre el escenario; hay un modo foco; el HUD de orientación existe siempre |
| D-2 | Las Superficies funcionan aunque el Espacio no esté disponible |
| EM §5.7 | "Si para entenderlo hace falta una oración, va en la Superficie" |
| EM §4.4 | Información mínima durante la indicación |
| EM §4.6.1 | Toda Entidad alcanzable en el Espacio lo es desde una Superficie |
| DJ-8 | El Foco desde una Superficie territorial es el mismo Foco y orienta el Espacio |
| EM §4.3.5 | Sincronía entre la Entidad indicada o enfocada en el Espacio y la jerarquía de la Superficie |

### 12.3 Qué puede comprenderse espacialmente

| Se comprende espacialmente | Se transfiere a la Superficie |
|---|---|
| Dónde está algo respecto de lo demás (contención, extensión) | Qué es en detalle, por qué está, de dónde viene (T-1) |
| Que hay algo anotado y de qué clase (presencia, estado, Procedencia en posición) | Qué significa la Anotación (C-8) |
| Que algo es *desconocido* o *no evaluado* | La causa (EM M20) |
| Cuánto hay (agregados con recuento) | La lista de lo agregado (DV-5) |
| Qué miro y desde dónde decido (Foco, Anchors) | Qué puedo hacer (actos; EM §7.2) |

### 12.4 Continuidad perceptual entre Espacio y Superficie

| Mecanismo | Qué asegura | Riesgo |
|---|---|---|
| **Resaltado sincronizado** (vincular y resaltar en ambas vistas) | Que lo que se señala en un lado se vea en el otro | Que el resaltado de la Superficie y la indicación del Espacio usen canales distintos y no se reconozcan como "lo mismo" |
| **Misma denominación** (nombre, tipo, marca de Procedencia iguales en ambos) | Reconocimiento inmediato | Abreviaturas distintas en cada lado |
| **Foco único** (DJ-8) | Que cambiar el Foco en un lado mueva el otro | Que un cambio de Foco desde la Superficie mueva la cámara con brusquedad (G-b lo mitiga) |
| **No tapar el sujeto** | La Superficie no puede cubrir la Entidad que explica | En anchos reducidos, inevitable: lo resuelve la Arquitectura UI/UX (D-2 lo deja abierto) |

### 12.5 La frontera bajo densidad

En N0, el Espacio puede mostrar todo lo individual y la Superficie explica. En N2–N3 la relación se invierte para lo individual: **la Superficie se vuelve la vía principal para encontrar una Entidad concreta**, y el Espacio conserva la orientación (dónde está, en qué contexto, qué hay alrededor). Las condiciones de traspaso están en §10.6.

---

## 13. Contraste con los fenómenos del Experience Model

Esta sección pregunta qué **propiedades** necesitaría una representación futura para hacer perceptible cada fenómeno. No asigna formas. La columna "familias con capacidad" indica dónde hay capacidad demostrada, no qué debe usarse.

### 13.1 Tabla de compatibilidad expresiva

| Fenómeno | Norma clave | Propiedades perceptivas necesarias | Lo que la norma excluye | Familias con capacidad | Riesgo principal | Espacio / Superficie |
|---|---|---|---|---|---|---|
| **Territorio** | Vocab §2.1; C-3; D-3 | Pertenencia inequívoca para árboles; un dispositivo distinto para N:M; extensión estructural; estabilidad | Re-anidar, reordenar, crear estructura por cercanía | C, D (contención, envolvente), E (escala estructural) | Segunda ontología (§7.1) | Espacio (orientación) + Superficie (jerarquía) |
| **Entidad** | Vocab §2.3; C-1; EM §4.4 | Identidad recuperable (nombre, tipo), tipo distinguible, Procedencia en posición, interrogable | La posición como identidad | A, C, F | Repetición morfológica (W4) | Ambos |
| **Relación** | Vocab §2.4; C-3 | Distinguible sin color de Anotación-entre-Entidades y de guía; trazable en densidad | Proximidad, similitud, aristas para dibujar | B (P3, P4), D | Ovillo; agrupamiento que pierde trazabilidad | Ambos |
| **Contexto** | Vocab §2.9; C-12; M1, M30 | Estado del Contexto siempre visible; diferencia verificado / no verificable | Fabricar Contexto | F (texto en la capa O) | Que el Espacio parezca verificado sin Contexto (C-12) | Capa O |
| **Foco** | Vocab §2.10; C-10; EM §4.6.3 | Visible siempre; único; canal reservado; transición de cámara continua | Que se capture; que se vuelva Anchor | G-b, E (énfasis), F | Que se lea como importancia | Espacio + Superficie (sincronizados) |
| **Anchor** | Vocab §2.11; C-10 | Persistente; distinto del Foco; varios posibles; visible aunque el Foco se mueva | Que nazca por permanencia o por "último visitado" | E, F | Confusión con el Foco | Espacio + capa O |
| **Trabajo** | Vocab §2.6; C-4; C-6 | Perceptible sólo como Anotación adherida a una Entidad; agregable por Entidad | Objeto propio, posición propia, trayectoria (P5) | A (marca adherida), F | Que parezca Territorio | Anotación + Superficie |
| **Lente** | Vocab §2.7; C-7; EM §5.3–§5.5 | Identidad por Anotación; canal propio (CR-2); retiro sin efecto estructural; inventario en la capa O | Alterar el layout (L3); ocultar Entidades | Canales de identidad | Agotamiento de canales (§10.4) | Inventario en la capa O |
| **Anotación** | Vocab §3.2; C-8; EM §5.1 | Adherida a su Entidad; subordinada; Procedencia propia; orden de composición fijo | Coordenadas propias; significado propio | A, F | Que ocluya a la Entidad o parezca Entidad | Espacio (presencia) + Superficie (significado) |
| **Procedencia** | Vocab §3.5; C-2; M9 | Distinguible sin color en Entidades, en Anotaciones y en agregados (DV-4) | Mostrar más autoridad que la de la Fuente | Canal redundante (forma, textura, texto) | Agotamiento de canales | Ambos |
| **Atención** | Vocab §3.7; C-17; EM §7.4 | Convocatoria persistente en la capa O; opcionalmente Anotación; atraviesa agregados (DV-3) | Mover cámara, Régimen o Foco; inferirla en el cliente | F (capa O); A | Movimiento que atrae (P22 G-c) | Capa O + Superficie |
| **Gravity** | C-15; EM §6 | Sólo Anotación sobre Organization y Project, o sobre la Entidad donde se sitúa el Trabajo afectado | Campos, regiones, volúmenes; codificar la Masa en tamaño, posición, prominencia o color | A (marca adherida) | Geometría territorial (P8, P9) | Anotación + Superficie (Postures, Masa) |
| **Cobertura** | DJ-7; RI-P1 | Declaración por Lente y por Entidad (o global) | Que la ausencia se lea como *ninguno* sin cobertura declarada | F (capa O), A (marca de desconocido) | Saturación si todo es desconocido (§13.2 Q9) | Capa O + Espacio |
| ***Ninguno* frente a *desconocido*** | DJ-7; C-2; C-16 | *Desconocido* con marca positiva; *ninguno* sólo como ausencia **dentro de una zona declarada como evaluada** | Ausencia silenciosa | A, F | Ver §13.2 Q9 | Ambos |
| **Colisión confirmada** | C-16; EM §6.3 | Marca distinta de indecidible y de desconocido, sin depender del color | Confirmar por similitud | A + canal redundante | Confundir los cuatro estados | Espacio (presencia) + Superficie (fundamento) |
| **Colisión indecidible** | C-16; EM §6.5 | Significación visual distinta para incertidumbre de distinto tipo (MacEachren, EM X7) | Presentarla como confirmada o compatible | Ídem | Ídem | Ídem |
| **Trabajo activo** | EM §7.3; Escenarios S1 | Estado por Anotación; cambio de estado legible sin movimiento perpetuo | Narrar progreso inventado (porcentajes inexistentes; Escenarios S1) | A; G-b para el cambio de estado | Movimiento en reposo (CR-3) | Anotación + Superficie |
| **Entidad D-3.b** (declarada por un Mandate) | D-3.b; CT-09 | Procedencia distinta de "verificado"; no anclable (`unsupported`) | Mostrarla como canónica | Canal de Procedencia | — | Ambos |
| **Contexto no confirmado** | C-12; EM §8.1 | Las Entidades se siguen mostrando, pero como "no verificables"; anclar y capturar bloqueados con causa | Fabricar verificación | Canal de Procedencia; capa O | — | Capa O |
| **Location reabierta** | D-3 §5; DJ-9; EM §7.5 | Ocho estados por referencia; `missing` sobre el ancestro sin atribuírselo | Transferir la Anotación al ancestro | A, F | Que el ancestro parezca degradado | Espacio + Superficie |
| **Agregado "N más"** | EM M21; §5.4.4 | Recuento, cobertura, Atención y Procedencia conservados (DV-1..DV-4) | Ocultar sin decirlo | A, F | Agregado que miente por omisión | Espacio + Superficie (lista) |
| **Simulación** | C-2; M31 | Marca obligatoria y global | Dato visual sin marca | F (capa O) | — | Capa O |

### 13.2 Preguntas obligatorias del encargo (§11)

**Q1. ¿Qué necesita una Entidad para conservar identidad espacialmente?**
- Un nombre recuperable a demanda (indicación, EM §4.4).
- Un tipo distinguible que no dependa sólo del color.
- Una posición estable, que no es identidad (G-8; C-1).
- No repetir la morfología de otras clases con otro significado (W4).
- Sobrevivir a la agregación como miembro recuperable (DV-5).
- Correspondencia exacta con su fila en la Superficie (§12.4).

**Q2. ¿Qué necesita una Relación para seguir siendo distinguible bajo densidad?**
- Un tipo de marca propio, distinto de la Anotación entre Entidades y de la guía auxiliar (G-1, P6).
- Extremos interrogables.
- Grosor real (M-4).
- Un mecanismo de reducción que conserve la trazabilidad individual o la delegue en la Superficie (L-14, DV-5).
- Movimiento de cámara si se quiere aprovechar la ganancia de trazado (H-3D-1, sin adoptar).

**Q3. ¿Cómo puede el Trabajo hacerse perceptible sin convertirse en Territorio?**
- Sólo como Anotación adherida a la Entidad donde se sitúa (C-4, C-6).
- Sin posición, extensión ni trayectoria propias (P5).
- Con agregación por Entidad cuando hay mucho (EM CT-16).
- Con un cambio de estado legible sin movimiento en reposo.

**Q4. ¿Cómo puede una Anotación permanecer subordinada a la Entidad que referencia?**
- Por **adherencia**: no tiene coordenadas propias y se mueve, se oculta y se agrega con su Entidad.
- Por **orden de composición fijo** (EM §5.4.3).
- Por **escala relativa**: nunca mayor que la marca de su Entidad [HIP].
- Por **no ocluir** a la Entidad, con una separación por profundidad o por desplazamiento constante (I-3, sin asignar).
- Por **desaparecer** si la Entidad no existe, con la excepción de DJ-9.

**Q5. ¿Cómo puede una Lente alterar la percepción sin alterar la estructura?**
- Con marcas aditivas y desénfasis declarado (G-10).
- Con layout invariante (G-8; L3).
- Con un inventario visible en la capa O (EM §5.3.2).
- Con la verificación L2 del EM: el Territorio, con y sin Lentes, tiene los mismos identificadores.

**Q6. ¿Cómo puede conservarse la Procedencia?**
- Con una marca por Entidad y por Anotación en un canal redundante con el color (EM §4.6.4).
- Con DV-4 en los agregados.
- Con el texto completo en la Superficie (EM §5.6).
- Con la regla de que las Fuentes débiles nunca usen la codificación de autoridad canónica (CT-12).

**Q7. ¿Cómo distinguir perceptualmente Foco y Anchor?**
- Por **firma temporal**: el Foco es único y se desplaza; el Anchor persiste y puede ser múltiple.
- Por **canal distinto**, reservado a la interacción (§9.3).
- Por **comportamiento**: el Foco mueve la cámara; el Anchor no.
- Por **presencia en la capa O**: los Anchors siempre listados.

**Q8. ¿Cómo puede Gravity hacerse perceptible sin convertirse en geometría territorial?**
- Sin campos, regiones, superficies ni volúmenes propios (P8, P9; C-15).
- Sólo como Anotación sobre las Entidades asociadas a nodos de la jerarquía normativa (Organization, Project) o sobre la Entidad donde se sitúa el Trabajo afectado.
- Con la Masa sólo en la Superficie (EM §6.8).

El antecedente histórico coincide: "Gravity… con codificación de color/contraste, no con geometría de fuerzas" [HIST, Research Resultados §3 P3]. El anti-patrón vivo es el control "Campos de Gravity" del prototipo (F-5).

**Q9. ¿Cómo impedir que *desconocido* parezca *ninguno*?**
- *Desconocido* necesita una marca positiva o una **declaración global** en la capa O ("no evaluado aquí"), que el EM §5.6 admite.
- *Ninguno* sólo puede mostrarse como ausencia **dentro de una zona declarada como evaluada**, lo que exige representar la cobertura.
- Hoy *desconocido* es el único estado verdadero para Gravity (EM CT-04; Escenarios S10). Si se marcara Entidad por Entidad, todo el Territorio quedaría marcado y la marca dejaría de informar (saturación, L-11).
- Por eso la **declaración global de cobertura** es la vía compatible con la densidad, y la marca por Entidad, la vía para las excepciones [HIP].
- DV-2 extiende la regla a los agregados.

**Q10. ¿Cómo preservar el contexto cuando algo adquiere prominencia?**
- Atenuación en lugar de eliminación (G-10).
- Un único énfasis fuerte por vista (R6).
- Transición de cámara continua (G-b).
- Capa O con la cadena de ancestros y los Anchors.
- Prominencia sólo por las causas de G-9.

**Q11. ¿Cómo puede un sistema denso seguir siendo navegable e interrogable?**
- Con agregación estructural y escala semántica (§10.2).
- Con recorrido de candidatos y picking con tolerancia (§11.1).
- Con búsqueda en la Superficie (§10.5).
- Con un layout estable (G-8).
- Con la Superficie como vía principal para lo individual en N2–N3 (§12.5).
- Con movimiento de cámara controlado por la persona (P22 G-a).

---
## 14. Anti-patrones morfológicos

Se formulan como **fallas informativas o perceptuales**, no como prohibiciones estéticas. Cada uno tiene una prueba de detección aplicable a una propuesta futura.

| ID | Anti-patrón | Falla informativa | Observado en | Prueba de detección | Norma o principio |
|---|---|---|---|---|---|
| AP-1 | **Profundidad sin información** | La tercera dimensión no codifica nada que no esté codificado de otra manera | W1, W8 | Prueba de aplanamiento (§8.6) | EM §4.7; K-2 |
| AP-2 | **Volumen sin semántica** | Lo volumétrico sugiere masa o importancia sin significado | W3, W4; P9 | Reemplazar el volumen por un contorno: ¿se pierde información? | EM §6.8 (no Masa en tamaño ni prominencia) |
| AP-3 | **Contención ambigua** | La misma pertenencia se expresa con dos códigos, o la contención afirma un árbol donde hay N:M | W2; §7.3 | ¿Toda pertenencia de la Fuente usa un único dispositivo? ¿Alguna Entidad tiene más de un padre? | G-3, G-4; CR-1 |
| AP-4 | **Jerarquía = altura por defecto** | El tipo o el nivel se codifica con altura y se lee como importancia | W1 | ¿La altura codifica un valor categórico? | §7.5 |
| AP-5 | **Nebulosa o blob como sustituto de estructura** | Un borde difuso hace indecidible qué está dentro | W3 | ¿Puede trazarse el borde exacto? ¿Responde el picking de forma decidible? | L-8; EM §4.3.1 |
| AP-6 | **Glow indiscriminado** | La saliencia uniforme deja sin canal al Foco, al Anchor, a la Atención y al error | W6 | ¿Qué queda para destacar el Foco? | L-10; paleta ("el acento indica") |
| AP-7 | **Color como única codificación** | Estados ilegibles sin color; color sin código que produce significado falso | W5; R5 | Prueba de escala de grises | EM §4.6.4; C-8 |
| AP-8 | **Exceso de conexiones** | Ovillo: no se puede seguir ninguna Relación | P3 en N2–N3 | ¿Puede trazarse una Relación concreta en N2? | L-14, L-9 |
| AP-9 | **Conexión ornamental** | Líneas sin identidad ni Fuente que se leen como relaciones | W7 | ¿Cada línea lleva a dos identidades y a una Fuente? | Vocab §2.4; C-3; G-6 |
| AP-10 | **Repetición morfológica** | Formas iguales con significados distintos | W4 | ¿Alguna forma aparece con dos significados? | G-1 |
| AP-11 | **Movimiento sin significado** | Animación en reposo que compite con la lectura y agota la atención | R10; D-4; CR-3 | ¿Cada movimiento tiene una causa: acto de la persona, transición o cambio en la Fuente? | Paleta ("no agregar animaciones sin cambio de estado real"); L-12 |
| AP-12 | **Oclusión sin ganancia** | Lo que tapa no agrega información; lo tapado deja de ser alcanzable | W11; D-5 | ¿Toda Entidad es alcanzable sin mover la cámara? | EM §4.3.3 |
| AP-13 | **Espectacularidad que compite con la lectura** | El tono de la escena prima sobre su legibilidad | W13 | Retirar la ambientación: ¿la lectura mejora? | Doctrina ("calma visual"); EM §4.7 |
| AP-14 | **Desaparición del contexto al enfocar** | Enfocar elimina el resto | Contrario de R6 | ¿El Territorio sigue presente, aunque atenuado, con el Foco activo? | G-10; EM §5.4.5 |
| AP-15 | **Representación que funciona sólo con pocos elementos** | La forma no tiene comportamiento definido en N2–N3 | W10 | ¿La propuesta describe N0, N1, N2 y N3? | Encargo §1; K-3 |
| AP-16 | **Posición como significado** | La cercanía visual afirma relación o similitud | R14 | ¿Alguna distancia proviene de una medida de similitud? | Vocab §2.4; C-1; C-3 |
| AP-17 | **Ambientación con marcas estructurales** | No se distingue el dato del decorado | W9 | ¿Hay marcas iguales en el dato y en el fondo? | G-7 |
| AP-18 | **Ausencia silenciosa** | Lo no evaluado o lo agregado se ve como "nada" | §10.3; §13.2 Q9 | ¿Un agregado con miembros *desconocidos* se distingue de uno *ninguno*? | DJ-7; C-2; DV-2 |

---

## 15. Matriz "demuestra / no autoriza"

| Propiedad | Las referencias demuestran | No autorizan a concluir |
|---|---|---|
| Planos apilados (R1) | Que un eje homogéneo ordenado hace copresentes estructuras comparables | Que la jerarquía de Orrery se represente con planos o pisos |
| Alineación entre capas (R2) | Que la alineación conserva la correspondencia de un mismo elemento | Que una Entidad tenga réplicas o que la posición sea su identidad |
| Plano como marco (R3) | Que un marco casi vacío da referencia sin agregar objetos | Que alguna Entidad sea un plano |
| Arcos fuera del plano (R4) | Que una conexión curva evita atravesar los elementos alineados | Que las Relaciones sean arcos |
| Familias de arcos por tono (R5) | Que pueden coexistir pocas familias de conexión | Que cada Lente tenga un tono |
| Énfasis localizado (R6) | Que un único énfasis fuerte con contexto atenuado funciona | Que el Foco sea una curva luminosa, o que el énfasis pueda derivar de relevancia |
| Distinción por tipo de marca (R7) | Que la forma de la marca distingue clases sin color | Que estas marcas tengan significado en Orrery |
| Líneas de caída (R8, R17) | Que la profundidad se vuelve legible anclada a una referencia | Que Orrery necesite piso, suelo o ejes métricos |
| Materialidad por cercanía (R9) | Que lo cercano parece interrogable | Que las Entidades sean esferas |
| Partículas sobre los arcos (R10) | Que el movimiento expresa dirección | Que haya flujo animado |
| Rótulo de la vista (R11) | Que la orientación puede estar fuera de la escena | Que la capa O sea un título |
| Superficie de precisión sincronizada (R12) | Que la precisión se transfiere sin destruir la continuidad, por resaltado sincronizado | Que la Superficie vaya debajo de la escena (D-2 eligió R-B) |
| Revelación progresiva (R13) | Que la complejidad puede agregarse por pasos | Que Orrery revele complejidad por su cuenta (C-17) |
| Posición semántica (R14) | Que un espacio de rasgos se lee de un vistazo | **Nada** para la estructura del Territorio |
| Etiquetado selectivo (R15) | Que lo no etiquetado puede seguir presente y atenuado | Ocultar sin declararlo |
| Construcción derivada (R16) | Que una operación puede visualizarse | Que Orrery dibuje resultados sin Fuente |
| Etiquetas de frente (R18) | Que el texto de frente evita la inclinación | Una técnica concreta de etiquetado |
| `wrong_not_wanted.png` completo | Que mucha profundidad puede tener la estructura de una lista | Que la contención, las envolventes, el apilamiento o la luminosidad estén prohibidos (§4.4) |

---

## 16. Contradicciones encontradas

Ninguna se resuelve aquí. Las de documentos históricos se registran como antecedente; no se reconcilian con la norma (encargo §2).

| ID | Tipo | Contradicción | Evidencia | Qué prevalece hoy | Afecta | Decisión requerida |
|---|---|---|---|---|---|---|
| **CR-1** | Norma ↔ contrato de otro sistema | El EM describe la contención "Gene ⊂ Domain ⊂ Project" (§4.1, §4.3.1, CT-06) y basa en ella la geometría de respuesta. Gene v3.0 define Domain↔Gene como **N:M** (§2.6; inv. 13; "Domain no se almacena como campo singular dentro del Gene"), y el Vocabulario lista Domain↔Gene ratificada como **Relación** (§2.4). Un Gene en dos Domains no puede estar contenido en ambos | EM §4.3; Gene v3.0 líneas 77, 93, 128, 208; Vocab §2.4 | Para el hecho, Gene v3.0 (dueño del contrato). Para la experiencia, el EM, que no distingue el caso N:M | Contención (P13), envolvente (P10), picking (EM §4.3.1), K-8 | Que José decida si la contención de la experiencia se limita a árboles (Tenant…Project y pertenencia al Project) y Domain↔Gene se expresa con otro dispositivo, o si se acepta otra lectura. **Antes de la Arquitectura UI/UX** |
| **CR-2** | Ambigüedad normativa | "Dos Lentes no comparten el mismo canal de codificación" (EM §5.4.2) admite dos lecturas: (a) *tipo* de canal distinto, que con los canales de identidad efectivos (L-4) acota a unas tres Lentes simultáneas; (b) *valor* distinto dentro de un canal, acotado por la capacidad atencional (L-11) | EM §5.4.2; §10.4 | El EM, en cualquiera de sus lecturas | Presupuesto de canales; número de Lentes simultáneas | Que José precise la lectura. Si ninguna basta, la Arquitectura UI/UX debería proponer límites de Lentes simultáneas como decisión visual |
| **CR-3** | Interna a la paleta | La paleta dice "Motion comunica cambio de estado del sistema, no decoración" y prohíbe "agregar animaciones sin cambio de estado real", pero define animaciones infinitas sin cambio de estado: anillos que pulsan, órbita que gira, núcleo que "respira", ambiente que late, línea de barrido cada 8 s | `docs/PALETTE/# 🎨 Bloom Color Palette.md` (secciones Nucleus, Ambient, Scan Line, Reglas de Uso) | Para Orrery, el principio ("no agregar animaciones sin cambio de estado real") es coherente con C-17 y con el EM §4.7; las animaciones de onboarding no son precedente para el Espacio | Movimiento (P22 G-c); AP-11 | Confirmar que las animaciones ambientales del onboarding no se trasladan a Orrery |
| **CR-4** | Restricción ↔ demanda normativa | La paleta tiene un único acento de estado activo y un único color de error. Se declara la única fuente de color ("no crear colores fuera de esta paleta"). La demanda normativa de dimensiones categóricas es mucho mayor (§10.4). El EM ya lo señala (§4.6.4) | Paleta; EM §4.6.4 | El EM: codificación redundante (forma, textura, texto) | Presupuesto de canales | Decidir si Orrery tendrá una extensión de paleta propia o si opera casi sin tono |
| **CR-5** | Doctrina ↔ norma | La Doctrina dice "Nada debe parecer efímero. Nada debe parecer temporal." La norma define estados efímeros por naturaleza (indicación; Foco "atención efímera de navegación", Vocab §2.10) y exige que el Anchor sea perceptiblemente distinto del Foco | Doctrina §"Principio de Continuidad"; Vocab §2.10; EM §4.6.3 | La norma | Firma visual de la indicación y del Foco frente al Anchor (Q7) | Ninguna inmediata: la doctrina se refiere a lo persistido; se registra para que la Arquitectura UI/UX no dé apariencia de permanencia a lo efímero |
| **CR-6** | Histórico ↔ encargo | El borrador UI/UX v0.1 asigna formas (halos, balizas, pulsos, marcadores ▌▌▌, "trazo distinto" para candidatas) y su tabla "Va al espacio" fija morfología | `UI/Investigacion_Propuesta_Arquitectura_UIUX_..._v0_1.md` §16 | El encargo (no asignar formas) y A-8 (el borrador se lee a través del vocabulario) | Todo §5–§13 | Ninguna; se registra como antecedente no adoptado. Su "prueba de pertenencia al espacio" ("si la posición relativa no comunica nada, no va al espacio") es compatible con EM §4.7 y con K-2 |
| **CR-7** | Histórico ↔ norma | El research histórico recomienda agrupar "por relevancia al turno actual, no por modularidad" | `GRAVITY/ORBITAL/Orrery_Research_Resultados_v0_1.md` §2.0.5 | C-17 y EM §5.4.4 (reglas estructurales, nunca de relevancia inferida) | Agregación (§10.2) | Ninguna; antecedente reemplazado |
| **CR-8** | Histórico ↔ norma | El Ledger v0.1 propone dibujar en el Espacio la secuencia de Locations visitadas como camino (una trayectoria) | `UI/Propuesta_Diseno_LedgerPanel_..._v0_1.md` §5.2 | C-9; A-7; EM-C07 | Trayectoria (P5) | Ninguna nueva; se suma la consecuencia morfológica a A-7 |
| **CR-9** | Histórico ↔ norma | El marcador que recorre una ruta sobre los Domains narrando Intents se presentó como "la gramática pedida" | `UI/Investigacion_Orrery_VisorMandatos_..._v0_1.md` §4.3 | C-6; LocationFirst v0.2 §3 (retirado) | Trayectoria (P5); Trabajo (Q3) | Ninguna; antecedente reemplazado |
| **CR-10** | Histórico ↔ evidencia | La ontología transferida en septiembre era "sin piso" (VisorMandatos v0.1 §3), y `wrong_not_wanted.png` lleva el lema "Sin un piso", pero la imagen produce seis pisos | VisorMandatos v0.1 §3; W12 | — ("sin piso" no es término normativo) | — | Ninguna |
| **CR-11** | Encargo ↔ norma | El encargo pide identificar qué comunica el 3D que sería sustancialmente más difícil en plano. La literatura sugiere el trazado de Relaciones en densidad con profundidad cinética (L-7, L-9), ganancia que excede "contención y extensión" (EM §4.7) | §8; EM §4.7 | EM §4.7 (DM-2) | §8.3 (H-3D-1..3) | Ninguna ahora. Si una prueba con usuarios confirmara H-3D-1, correspondería proponer una versión del EM (Vocab §7) |

---

## 17. Preguntas que todavía no pueden responderse

| ID | Pregunta | Por qué no puede responderse | De qué depende |
|---|---|---|---|
| PA-1 | ¿Qué densidad real tendrá el Territorio de Cognituum y el de Bloomaut? | El Project gobernado de Cognituum todavía no existe; CT-01 está [NO OBSERVADO] | Genesis E2E; incorporación de Bloomaut |
| PA-2 | ¿Qué tan frecuente será la pertenencia N:M de Genes a Domains? | No hay productor de Genes ni de Relaciones Domain↔Gene (RI-T3, RI-T4) | G2 de Genes; A-5 |
| PA-3 | ¿Cuántas Lentes activará la persona a la vez en la práctica? | No hay Lentes ni uso observado | Prueba con usuarios posterior |
| PA-4 | ¿Cámara libre o acotada? | Es una decisión de UX | Arquitectura UI/UX (REC-6) |
| PA-5 | ¿Se identifican individualmente las instancias de una malla instanciada en el picking? | No está documentado (PC-2) | Prueba técnica no autorizada |
| PA-6 | ¿Qué costo tienen las líneas con grosor y el texto en el mundo en N2–N3, y en qué hardware? | Sin medición; sin hardware objetivo definido | Prueba técnica; definición del hardware objetivo |
| PA-7 | ¿Qué lectura de EM §5.4.2 rige? | Ambigüedad normativa | José (CR-2) |
| PA-8 | ¿La cobertura se declara por región, por Lente o por Entidad? | Depende de la forma de RI-P1, que no existe | Dueños de las Proyecciones |
| PA-9 | ¿Etiquetas en pantalla (HTML) o texto en el mundo? | Sin prueba de legibilidad | Arquitectura UI/UX |
| PA-10 | ¿Cómo se percibe declarar (E8)? | Postulate indefinido (EM-C04) | Decisión de José sobre Postulate |
| PA-11 | ¿Cómo se representa Repository? | Sin dato físico (Vocab §2.3; RI-T5) | Authority / registro |
| PA-12 | ¿Vale H-3D-1 sin estéreo, en monitores comunes? | La evidencia usó estéreo y pantallas de muy alta resolución (L-9) | Prueba con usuarios |
| PA-13 | ¿Es estable la "forma global" del Territorio (H-3D-2) cuando el Territorio cambia? | Depende del algoritmo de layout | Arquitectura UI/UX |

---

## 18. Criterios para evaluar futuras propuestas morfológicas

Responden al criterio de éxito del encargo (§16): poder recibir una propuesta y decir qué comunica, por qué usa esa primitiva, qué fenómeno hace perceptible, qué ambigüedad introduce, cómo convive con las demás, qué pasa en densidad, cómo responde a la interacción, qué aporta la tercera dimensión, qué se transfiere a una Superficie y si **explica el sistema o sólo parece sofisticada**.

| ID | Criterio | Pregunta de prueba | La propuesta falla si… |
|---|---|---|---|
| **K-1** | Trazabilidad semántica | ¿Qué término o fenómeno hace perceptible cada marca y qué acto habilita? (EM §2.1) | Alguna marca no tiene respuesta |
| **K-2** | Aplanamiento | ¿Cuál es el equivalente plano y qué pierde? (§8.6) | El equivalente plano transmite lo mismo, o lo perdido no está en la Superficie |
| **K-3** | Densidad | ¿Cómo se ve en N0, N1, N2 y N3? (§2.4) | Falta algún nivel o se describe sólo N0 |
| **K-4** | Canal único | ¿Algún canal tiene dos significados en la misma vista? (G-1) | Sí |
| **K-5** | Sin color | ¿Se leen todos los estados en escala de grises? (EM §4.6.4) | No |
| **K-6** | Proximidad y alineación | ¿Alguna cercanía, alineación o superposición afirma una relación inexistente? (G-2) | Sí, o no se puede saber |
| **K-7** | Un código por relación | ¿Cada tipo de relación usa un único dispositivo? (G-3) | No |
| **K-8** | Contención honesta | ¿La contención sólo afirma árboles? ¿Cómo se ve un caso N:M? (G-4) | Fuerza un N:M en un árbol o no muestra el caso |
| **K-9** | Interrogabilidad | ¿Toda Entidad es indicable (con tamaño mínimo o candidatos) y alcanzable desde una Superficie? (G-6; M-1; EM §4.6.1) | No |
| **K-10** | Estabilidad | ¿El layout es determinista e idéntico con y sin Lentes? (G-8; L3) | No |
| **K-11** | Prominencia legítima | ¿Cada causa de prominencia es Foco, Anchor, Atención de su Fuente o escala estructural? (G-9) | Hay prominencia por relevancia o por Masa |
| **K-12** | Ambientación retirable | Si se retira lo ambiental, ¿se pierde información o se confunden marcas? (G-7) | Sí |
| **K-13** | Movimiento con causa | ¿Cada movimiento tiene causa (acto, transición, cambio en la Fuente)? (P22) | Hay movimiento en reposo |
| **K-14** | *Ninguno* frente a *desconocido* | ¿Cómo se ve *desconocido* en la Entidad, en el agregado y globalmente? (Q9) | Alguno de los tres se ve como ausencia |
| **K-15** | Agregación veraz | ¿Los agregados cumplen DV-1..DV-6? | No |
| **K-16** | Interacción separada | ¿La indicación, el Foco y el Anchor tienen canales reservados y firmas temporales distintas de los cambios de la Fuente? (§9.3–§9.4) | No |
| **K-17** | Traspaso declarado | ¿Qué se transfiere a la Superficie y bajo qué condición (T-1..T-7)? | No se declara |
| **K-18** | Viabilidad material | ¿Depende de translúcidos anidados, líneas finas como objetivos de interacción, identidad por instancia o LOD de mallas? (M-1..M-6) | Sí, sin alternativa |
| **K-19** | Escasez honesta | Con el territorio mínimo de CT-01 (cuatro o cinco Entidades), ¿la escena se ve escasa sin relleno ni ambientación compensatoria? (Escenarios R-9) | Rellena o simula |
| **K-20** | Sin segunda ontología | ¿La representación introduce niveles, grupos o relaciones que la Fuente no tiene? (§7.1) | Sí |

---

## 19. Recomendaciones para el encargo de Orrery Visual Architecture / Visual Experience v0.1

| ID | Recomendación | Fundamento |
|---|---|---|
| **REC-1** | Usar K-1..K-20 como **puerta de aceptación** de cada marco visual. | §18 |
| **REC-2** | **Empezar por el inventario y el presupuesto de canales** (el Estado Base §9.1 permite inventariarlos antes de asignarlos): qué dimensiones viven siempre en el Espacio, cuáles sólo en la indicación y cuáles sólo en la Superficie. | §10.4 |
| **REC-3** | **Pedir a José dos decisiones antes de dibujar:** CR-1 (dispositivo para N:M) y CR-2 (lectura de EM §5.4.2). | §16 |
| **REC-4** | Probar con **cuatro territorios**: el mínimo [NO OBSERVADO] y el denso [HIPÓTESIS] del Estado Base §9.1, más dos casos de borde: un Gene en dos Domains (CR-1) y Gravity entera en *desconocido* (Q9). | Estado Base §9.1; §13.2 |
| **REC-5** | Acompañar **cada marco 3D** con tres variantes: su equivalente plano (K-2), escala de grises (K-5) y densidad (K-3). | §8.6; §6.5 P19; §2.4 |
| **REC-6** | Tratar la **política de cámara** como decisión visual temprana: libre o acotada, ángulos privilegiados, retorno a la vista de orientación. | §8.7; PA-4 |
| **REC-7** | **Reservar primero los canales de interacción** (indicación, Foco, Anchor) y sólo después asignar canales a Lentes y a Procedencia. | §9.3 |
| **REC-8** | Dedicar un marco propio a la **cobertura**: declaración global más marcas por excepción, y comportamiento en agregados. | §13.2 Q9; DV-2 |
| **REC-9** | Dedicar un marco a las **reglas de adherencia de las Anotaciones**: subordinación, orden de composición, no oclusión, agregación con su Entidad. | §13.2 Q4 |
| **REC-10** | Fijar una **política de movimiento**: G-a y G-b con causa semántica; G-c sólo como consecuencia acotada de un cambio en la Fuente; confirmar CR-3 con José. | §6.7; CR-3 |
| **REC-11** | Incluir marcos del **acoplamiento Espacio ↔ Superficie** en el Régimen Orrery (R-B): resaltado sincronizado, misma denominación, Foco único. | §12.4; D-2; DJ-8 |
| **REC-12** | **No usar las referencias positivas como objetivo visual ni hacer lo contrario de la negativa.** Usar §15 como control. | Encargo §14 |
| **REC-13** | Dejar listadas, **sin autorizarlas**, las preguntas técnicas para una prueba posterior: PA-5, PA-6, PA-9 y M-3. | §11 |
| **REC-14** | Representar la **escasez con honestidad**: el marco de CT-01 tiene cuatro o cinco Entidades y debe verse así (K-19). | Escenarios R-9 |

---

## Anexo A — Fuentes externas

Sólo se usaron fuentes verificadas en fuente primaria o registro bibliográfico. Ninguna redefine términos de Cognituum. Se reutilizan además las fuentes del EM Anexo A, citadas como "EM X-n".

### A.1 Literatura

| ID | Fuente (verificada) | Principio usado | Dónde se usa |
|---|---|---|---|
| L-1 | Bertin, J., *Sémiologie graphique* (1967; trad. *Semiology of Graphics*, 1983) | Noción de variables visuales que modulan marcas | §5 |
| L-2 | Cleveland, W. S. & McGill, R., "Graphical Perception: Theory, Experimentation, and Application to the Development of Graphical Methods", *JASA* 79(387):531–554, 1984 | Precisión distinta según el canal; área y volumen con error sistemático | P12, P16 |
| L-3 | Mackinlay, J., "Automating the Design of Graphical Presentations of Relational Information", *ACM TOG* 5(2):110–141, 1986 | Principios de expresividad y efectividad (retomados por Munzner) | §5 |
| L-4 | Munzner, T., *Visualization Analysis and Design* (2014), presentación "VAD marks" del autor | Marcas punto, línea y área; contención y conexión como marcas de vínculo ("Containment can be nested"); volumen "rarely used"; ranking de canales de magnitud (la profundidad entre los débiles) y de identidad (región espacial > tono > movimiento > forma); separabilidad; *popout*; la mayoría de las combinaciones requieren búsqueda serial | §5, §6, §10.4 |
| L-5 | St. John, M., Cowen, M. B., Smallman, H. S. & Oonk, H. M., "The use of 2D and 3D displays for shape-understanding versus relative-position tasks", *Human Factors* 43(1):79–98, 2001 | 3D mejor para comprender la forma; 2D mejor para la posición relativa | §8.2 |
| L-6 | Tory, M., Kirkpatrick, A. E., Atkins, M. S. & Möller, T., "Visualization Task Performance with 2D, 3D, and Combination Displays", *IEEE TVCG*, 2006, doi 10.1109/TVCG.2006.17 | 3D bueno para lo aproximado y malo para lo preciso; las vistas combinadas, mejores en tareas precisas | §8.2; T-2 |
| L-7 | Ware, C. & Franck, G., "Evaluating stereo and motion cues for visualizing information nets in three dimensions", *ACM TOG* 15(2):121–140, 1996, doi 10.1145/234972.234975 | ×3 de tamaño de grafo comprensible con estéreo y acoplamiento a la cabeza; el movimiento mejora más que el estéreo | §8.2; P22 |
| L-8 | Palmer, S. E., "Common region: A new principle of perceptual grouping", *Cognitive Psychology*, 1992 (PubMed 1516361) | Región común: agrupamiento por región acotada que puede imponerse sobre proximidad y similitud, anidable, dependiente de la profundidad percibida | P10, W3 |
| L-9 | Ware, C. & Mitchell, P., "Visualizing graphs in three dimensions", *ACM TAP* 5(1):2, 2008, doi 10.1145/1279640.1279642 | Trazado de caminos con estéreo y movimiento en grafos de 333 a 1000 nodos, con menos del 10% de error | §8.2; H-3D-1 |
| L-10 | Healey, C. G. & Enns, J. T., "Attention and Visual Memory in Visualization and Computer Graphics", *IEEE TVCG* 18(7):1170–1188, 2012, doi 10.1109/TVCG.2011.127 | Las conjunciones no se detectan de un vistazo; jerarquía de rasgos (el tono interfiere con la forma); lo más importante en lo más saliente; ceguera al cambio | W6, P2, P19, P22, §9.4 |
| L-11 | Haroz, S. & Whitney, D., "How Capacity Limits of Attention Influence Information Visualization Effectiveness", IEEE InfoVis 2012 | Capacidad atencional limitada; el color tiene casi el doble de capacidad que el movimiento; agrupar espacialmente sube la capacidad ~60%; "menos es más", "un par de categorías a la vez" | P19, §10.4 |
| L-12 | Bartram, L. & Ware, C., "Filtering and brushing with motion", *Information Visualization* 1(1):66–79, 2002, doi 10.1057/palgrave.ivs.9500005 | El movimiento agrupa objetos distintos; el circular es el que más atención demanda | P22 G-c |
| L-13 | Heer, J. & Robertson, G., "Animated Transitions in Statistical Data Graphics", *IEEE TVCG* 13(6):1240–1247, 2007, doi 10.1109/TVCG.2007.70539 | Las transiciones animadas pueden mejorar significativamente la percepción gráfica | P22 G-b; §9.2 |
| L-14 | Holten, D., "Hierarchical Edge Bundles: Visualization of Adjacency Relations in Hierarchical Data", *IEEE TVCG* 12(5):741–748, 2006, doi 10.1109/TVCG.2006.147 | Agrupamiento de conexiones por camino jerárquico; revela adyacencias implícitas entre padres | P4, §10.2 |
| L-15 | Alsallakh, B., Micallef, L., Aigner, W., Hauser, H., Miksch, S. & Rodgers, P., "The State-of-the-Art of Set Visualization", *Computer Graphics Forum*, doi 10.1111/cgf.12722 | Visualizar relaciones entre muchos conjuntos es un problema no trivial | P10, P14, §7.3 |
| L-16 | Ellis, G. & Dix, A., "A Taxonomy of Clutter Reduction for Information Visualisation", *IEEE TVCG* 13(6):1216–1223, 2007 | Cada técnica de reducción de desorden tiene beneficios y pérdidas | §10.2 |
| L-17 | Palmer, S. E. & Rock, I., "Rethinking perceptual organization: The role of uniform connectedness", *Psychonomic Bulletin & Review*, 1994 | **Sólo registro bibliográfico secundario; contenido no leído.** Se cita como antecedente de la conexión uniforme; la afirmación sobre su fuerza relativa se marca [HIP] | P3 |

**Consultadas y no usadas:** Tversky, Morrison & Bétrancourt, "Animation: can it facilitate?", *IJHCS* 57:247–262 (2002). La cita se verificó; el contenido no pudo leerse, así que no se extrajo ningún principio.

### A.2 PlayCanvas

| ID | Fuente | Contenido usado |
|---|---|---|
| PC-1 | Manual, "Scene Picker" (developer.playcanvas.com/user-manual/graphics/cameras/scene-picker/) | Buffer de identificadores; fracción de resolución y pérdida de objetos pequeños; profundidad opcional; `getWorldPointAsync` |
| PC-2 | Engine API Reference v2.23.1, clase `Picker` | Constructor (`width`, `height`, `depth`); `prepare`, `getSelectionAsync` (rectángulo, devuelve instancias de malla), `getWorldPointAsync`, `resize`; sin mención de instancing ni batching |
| PC-3 | Manual, "Layers" | Subcapas opaca y transparente; orden de atrás hacia adelante por instancia de malla; `drawBucket`; el orden de capas no anula `depthTest` |
| PC-4 | Manual, "Hardware Instancing" | Mallas idénticas; pocos *draw calls*; estado por instancia limitado; sin culling por frustum |
| PC-5 | Manual, "Wide Lines" | Líneas nativas de 1 px; `WideLineRenderer` con ancho, extremos, uniones, color por punto, guiones y gradientes; retenido |
| PC-6 | Manual, "Fonts" | Atlas MSDF nítido a cualquier tamaño; conjunto de caracteres elegido al generar |
| PC-7 | Manual, "LOD Streaming" (Gaussian Splatting) | LOD documentado para splats; no encontré LOD de mallas documentado |

---

*Fin. Investigación no normativa. No diseña Orrery, no asigna formas, no define paleta, escena, Interaction Grammar ni contratos, y no modifica código ni documentos normativos.*
