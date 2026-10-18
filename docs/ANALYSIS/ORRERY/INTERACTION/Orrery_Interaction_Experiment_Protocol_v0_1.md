# Orrery — Protocolo experimental de interacción v0.1

## Lente, selección de lecturas e indicación · primera ronda

| Campo | Valor |
|---|---|
| Documento | `docs/ANALYSIS/ORRERY/INTERACTION/Orrery_Interaction_Experiment_Protocol_v0_1.md` (copia en Project BTIPS: `ANALYSIS/ORRERY/INTERACTION/Orrery_Interaction_Experiment_Protocol_v0_1.md`) |
| Tipo | Protocolo de investigación. **No normativo.** Subordinado a la norma vigente y a `Orrery_Interaction_Research_Lente_Seleccion_Indicacion_v0_2.md` (en adelante **IX v0.2**) |
| Estado | **BORRADOR PARA APROBACIÓN.** Los umbrales de §6 son **propuestos**. No se construye el prototipo ni se realiza ninguna sesión hasta que José apruebe este documento |
| Fecha | 2026-10-16 |
| Decisiones que lo rigen | DJ-I1..I9 (IX v0.2, cabecera) |
| Autoridad | José Vigil (única) |
| No hace | No modifica la norma, el research v0.1 ni la escena gris. No resuelve las decisiones que siguen abiertas: las enumera en §2 con un tratamiento propuesto |

---

## 0. Qué hay que aprobar

| # | Qué | Dónde |
|---|---|---|
| A-1 | El tratamiento de cada incompatibilidad o decisión abierta (I-1..I-13) | §2 |
| A-2 | Las condiciones, separadas en bloque normativo y bloque exploratorio [FN] | §4 |
| A-3 | Las tareas y su respuesta correcta | §5 |
| A-4 | **Los umbrales propuestos** | §6 |
| A-5 | Las reglas de clasificación de errores | §7 |
| A-6 | Las hipótesis preregistradas, en particular **qué refuta a m1** | §8 |

Hasta que esto esté aprobado: ni prototipo, ni piloto, ni sesiones.

---

## 1. Objetivo y alcance

**Objetivo.** Producir evidencia exploratoria con personas sobre las siete incertidumbres de IX v0.2 §5 (IX-U1..IX-U7), para cerrar las decisiones que dependen de evidencia: IX-D2, IX-D4, IX-D6, IX-D9, IX-D14 e IX-D15.

| Incertidumbre | Se aborda en | Decisión que alimenta |
|---|---|---|
| IX-U1 Persistencia de las marcas | B2 | IX-D15 |
| IX-U2 Interpretación de las ausencias | B1, B4 | (verifica DJ-I6) |
| IX-U3 Atribución sin color; Lente B | B1 (Q-1), B4 | IX-D4 |
| IX-U4 Contexto y cámara | B3 | IX-D6 (resultado) |
| IX-U5 Indicación | B3, BX | IX-D2 |
| IX-U6 Forma visible de la selección de lecturas | **Diferida a la segunda ronda** (I-3) | IX-D14 |
| IX-U7 Necesidad de comparar | Observación en todos los bloques | IX-D9 |

**Lo que este protocolo no prueba** (guía §7 y IX v0.2):
- Nada de la norma: los resultados no la confirman ni la refutan. Sólo pueden fundamentar una propuesta con su propio trámite (DJ-I7).
- Las formas visuales definitivas: las marcas son las marcas de prueba del presupuesto de canales (`CB`), arbitrarias por diseño (`CB §0`, regla de lectura).
- El rendimiento técnico de PlayCanvas ni del `Picker` (`CB/Q-10`).
- La validez de datos reales: el Territorio es sintético y lleva la marca de simulación (`C-2`, `EM` M31).

**Carácter de la evidencia.** Con 5 a 8 participantes los resultados son **exploratorios**. No habrá pruebas estadísticas inferenciales. Los umbrales de §6 son criterios de decisión acordados de antemano, no pruebas de significación.

---

## 2. Incompatibilidades y decisiones abiertas — tratamiento propuesto

José pidió señalar cualquier incompatibilidad antes de resolverla. Ninguna de éstas está resuelta. Para cada una hay un tratamiento propuesto **que necesita aprobación**.

| ID | Incompatibilidad o decisión abierta | Por qué afecta al protocolo | Tratamiento propuesto | Qué no hace el tratamiento |
|---|---|---|---|---|
| **I-1** | La alternativa C "dentro de norma" (C-in: Lentes apagadas) se convierte en la condición persistente si la persona puede activar Lentes durante la tarea | Sin una definición operativa, el eje E-1 no compara nada | Operar E-1 como **valor por defecto declarado del Régimen**: N-ON (P-W1 y P-G2 activas al entrar) frente a N-OFF (ninguna activa al entrar; la persona puede activarlas). Las dos son normativas (`EM §5.3.1`, TR-04). Se mide si activa, cuándo, y la exactitud y el tiempo resultantes | No prohíbe la activación, que sería una restricción artificial |
| **I-2** | El experimento 1 (comprensión espontánea) y la prueba de Q-1 (Lente B sin aprendizaje) requieren participantes que no conozcan la gramática. Sólo un bloque puede ir primero | Si uno va después del otro, el segundo ya no es "sin aprendizaje" | **Integrar Q-1 en el bloque 1**, como primera pregunta, antes de cualquier otra | No mide Q-1 en densidad ni con tres Lentes. Eso queda para B4, ya con aprendizaje, y se informa como tal |
| **I-3** | El eje E-3 (selección de lecturas como concepto visible o sólo inventario) cambia los rótulos y el modelo mental. Probarlo con el mismo participante contamina la segunda condición | Exige un diseño entre sujetos. Con 5 a 8 personas, 3 o 4 por grupo no alcanzan para comparar | **Diferir E-3 (IX-U6) a una segunda ronda.** En la primera, la capa O muestra el inventario de Lentes según `EM §5.3.2`, sin concepto adicional | No cierra IX-D14 |
| **I-4** | La política general de cámara (`CB/Q-5`, IX-D12) sigue abierta, y m1 y m3 necesitan una base común | Si m1 y m3 corren con políticas distintas, la diferencia no es atribuible | Usar **CA-2 (cámara acotada, elevación mínima de alrededor de 30°)**, que es la configuración por defecto de la escena gris, en todas las condiciones | No decide IX-D12 |
| **I-5** | El tope y O-1 (IX-D4) no están aprobados, y las tareas con tres Lentes necesitan un comportamiento | Sin tope, la tercera Lente no tiene canal (`CB §8`) | Usar **O-1 como condición [HIP] dentro de norma**: `CB §8.4` muestra que cumple `EM §5.3.2` y `§5.4.4` si la capa O es persistente. Al desactivar una Lente visible, **sin promoción automática** (IX-C6, alternativa a): es la única opción compatible con `EM §5.3.3`, y no se prueba la alternativa (b), que sería [FN] | No decide IX-D4 ni IX-D5. Que la norma imponga (a) en el bloque normativo es una consecuencia, no una elección |
| **I-6** | "Sin Foco" (IX-D7) y lo que oculta el modo foco (IX-D13) siguen abiertos | Son vías posibles para retomar el contexto | **Excluirlos de las tareas.** Vías de retorno disponibles: volver al Foco anterior (historia) y enfocar un ancestro (TR-18, TR-19) | No decide IX-D7 ni IX-D13 |
| **I-7** | El contenido de la indicación más allá de `EM §4.4` (IX-C2, IX-D10) sigue abierto | Afecta qué ve la persona al señalar | En el bloque normativo, **la indicación muestra exactamente `EM §4.4`**: nombre, tipo, marca de Procedencia, verificación, marca de simulación y recuento por Lente. La Procedencia por Anotación en el Espacio queda como en `CB §7.1` (débil o no débil); su detalle, sólo en la Superficie | No decide IX-D10 |
| **I-8** | La guía pide no explicar de antemano el significado de las marcas, pero la capa O de la condición incluye el inventario de Lentes con un glifo de cada una | Podría leerse como una explicación previa | Tratar la leyenda del inventario como **parte de la interfaz**, no como explicación: es lo que la persona tendría en el producto. El moderador no la explica ni la señala | — |
| **I-9** | Los umbrales de tiempo no pueden fijarse sin una línea de base, y la guía prohíbe fijarlos después de ver los resultados | Sin línea de base, un umbral absoluto sería arbitrario | Fijar ahora **sólo umbrales relativos** entre condiciones (§6.3). Si hicieran falta umbrales absolutos, se fijarían con el piloto, cuyos datos se **excluyen** del análisis, y se aprobarían antes de la primera sesión principal | — |
| **I-10** | La duración estimada de todos los bloques es de unos 95 minutos | La fatiga degrada los datos de los últimos bloques | **Dos sesiones por participante**: S1 = B0–B3 (unos 50 min); S2 = B4–B7 y BX (unos 45 min) | Depende de la disponibilidad de participantes, que todavía no está definida |
| **I-11** | DJ-I6 no dice qué pasa con las Anotaciones ya dibujadas cuando la Fuente deja de responder (TR-08) | Un evento de pérdida de Fuente durante una tarea tendría un comportamiento indefinido | **No incluir pérdidas de Fuente durante las tareas.** "Activa sin datos" aparece sólo como estado estático de un ensayo | No decide el comportamiento de TR-08 |
| **I-12** | Con m3 la cámara acerca el Foco, así que el problema de tamaño pequeño de `CB/F-1` desaparece en esa condición. Con m1, si la Entidad ya está visible, no (HX-18) | Medir Foco/Anchor sólo en contexto favorecería a m3 por construcción | Medir de dos maneras: (a) **en contexto**, dentro de cada condición, y (b) con una **prueba estática** a tamaño N2, idéntica para todos y sin cámara, como en el catálogo de la escena | — |
| **I-13** | El Territorio es sintético y la cobertura de Gravity es hipotética: hoy sólo *desconocido* es verdad (`EM` CT-04) | La marca de simulación es obligatoria (`C-2`) | La capa O muestra siempre "DATOS SIMULADOS", y el moderador lo dice al empezar. La cobertura de P-G2 sigue DJ-I6 en cada ensayo | — |

---

## 3. Participantes y diseño

| Aspecto | Propuesta | Estado |
|---|---|---|
| Número | **6** como objetivo; mínimo 5, máximo 8 | [PEND] disponibilidad (DJ-I4) |
| Perfil | Personas que no participaron en el diseño de la gramática visual de Orrery (guía §7). Preferentemente con experiencia técnica (desarrollo o gestión de proyectos de software), porque es el público de Workspace Core | [PEND] José |
| Exclusión | Quien haya visto la escena gris, el research morfológico, el presupuesto de canales o este protocolo | Propuesta |
| Diseño | **Intra-sujeto** para E-1, cámara y número de Lentes. Orden de las condiciones **contrabalanceado** (AB/BA alternado entre participantes) | Propuesta |
| Aprendizaje entre condiciones | Cada condición usa un **Territorio isomorfo distinto**: misma estructura, nombres de Entidades distintos y disposición espejada. La respuesta correcta está definida por Territorio | Propuesta |
| Sesiones | Dos por participante (I-10) | [PEND] |
| Moderación | José. Pensamiento en voz alta. Guion fijo (§5). El moderador no explica marcas ni corrige respuestas | Propuesta |
| Registro | Grabación de pantalla y audio, registro de eventos del prototipo (§9) y hoja de respuestas | Propuesta; requiere consentimiento (§10) |
| Dispositivo | Escritorio, mouse y teclado; pantalla de al menos 1920×1080. Equivalente de teclado disponible siempre (`EM §4.6.2`) | Propuesta |

---

## 4. Condiciones

### 4.1 Constantes en todas las condiciones normativas

| Elemento | Valor | Fuente |
|---|---|---|
| Color | **Sólo grises** (croma 0) | Guía §7; `CB §12.2` |
| Marcas | Marcas de prueba del presupuesto de canales: silueta, textura, adjuntos con ranura y giro, relleno, contornos reservados | `CB §7.2`, RI-1..RI-5 |
| Indicación | Contenido exacto de `EM §4.4`, con **recuento por Lente** | DJ-I2; I-7 |
| Recorridos sin puntero | Mover la indicación y recorrer candidatos son **acciones separadas** | `EM §4.6.2`; corrige IX-C9 respecto de la escena gris |
| Foco | Contorno reservado + cadena de ancestros en la capa O; la cámara según la condición (m1 o m3) | `CB §6`; DJ-I9 |
| Anchor | Doble anillo + lista en la capa O | `CB §6` |
| Capa O | Contexto, Foco, Anchors, convocatorias de Atención, inventario de Lentes con su estado (S-L0..S-L3) y su convención de cobertura, y "DATOS SIMULADOS" | `EM §5.3.2`; `CB §10.1`; I-13 |
| Superficie | Sujeto = Foco; Anotaciones de todas las Lentes activas, con Procedencia | `EM §5.7`; `D-2` |
| Cobertura | Según DJ-I6: *ninguno* sólo con cobertura declarada; "activa sin datos" deja todo en *desconocido*; sin "no aplica" | DJ-I6 |
| Cámara base | CA-2 | I-4 |
| Tope | 2 Lentes visibles, O-1, sin promoción automática | I-5 [HIP] |
| Cambios de la Fuente | Sin animación (no hay eventos de Fuente en las tareas, salvo la llegada de Atención en B6) | `CB` RI-3; I-11 |

### 4.2 Bloque normativo

| Condición | Factor | Qué varía | Normativa porque |
|---|---|---|---|
| **N-ON** | E-1 | P-W1 y P-G2 activas al entrar | Valor por defecto declarado (`EM §5.3.1`) |
| **N-OFF** | E-1 | Ninguna Lente activa al entrar; la persona puede activarlas desde la capa O | Ídem (I-1) |
| **N-M1** | Cámara | Movimiento mínimo: la cámara se mueve sólo si la marca queda fuera de un margen seguro del 10% de la vista o por debajo del tamaño legible; menor desplazamiento posible, conservando altura y dirección; acerca sólo hasta el tamaño legible | Lectura de "orientar" (`Vocab §2.10`, `DJ-8`); DJ-I9 |
| **N-M3** | Cámara | Reencuadre: centra la Entidad y acerca hasta que su marca ocupe alrededor del 15% de la altura de la vista, con transición continua de unos 400 ms | Ídem; `CB §6` (C5) |
| **N-L2** | Lentes | Dos Lentes activas y visibles (P-W1, P-G2) | `EM §5.4.1` |
| **N-L3** | Lentes | Tres Lentes activas (P-W1, P-G2, P-A1); la tercera en S-L3 (O-1) | `EM §5.4.1` + O-1 [HIP] (I-5) |
| N0 / N1 / N2 | Densidad | Factor dentro de B2, B4 y B5 (densidades del presupuesto de canales) | `CB §12.3` |

El tamaño legible y los porcentajes de N-M1 y N-M3 son parámetros del prototipo, que se fijan antes del piloto y no se ajustan después [HIP].

### 4.3 Bloque exploratorio [FN] (DJ-I7)

Va **después** de todos los bloques normativos, en la segunda sesión, con rótulo propio en el registro y en el informe. Sus resultados **no se mezclan** con los del bloque normativo y **no autorizan ningún cambio**.

| Condición | Contra qué se compara | Por qué es [FN] |
|---|---|---|
| **FN-VEST** | Indicación con recuento (normativa) | `EM §4.4` dice "y nada más" (HX-17) |
| **FN-M0** | N-M1 | Con un Foco fuera de la vista no "orienta el Espacio" (`DJ-8`); DJ-I9 |
| **FN-CFN** | N-ON | Una Lente activa que sólo dibuja al señalar oculta sus Anotaciones (`EM §5.2`, `§5.4.4`) |

---

## 5. Bloques y tareas

Las instrucciones son neutras: nombran la **pregunta**, nunca la marca. Ejemplo: "¿Dónde hay trabajo en curso?", y no "¿Dónde ves cuadrados?". Cada tarea tiene una **respuesta correcta definida por el Territorio** del ensayo, preparada antes del piloto.

Para que la clasificación sea por creencia expresada (DJ-I8), toda tarea sobre ausencias termina con una **pregunta de conclusión explícita**: "¿Qué concluís sobre X aquí?".

### B0 · Inicio (5 min, sesión 1)

Consentimiento (§10). El moderador dice que los datos son simulados y explica **sólo los controles**: mover la cámara, señalar, elegir y la tecla de recorrido. No explica ninguna marca.

### B1 · Comprensión espontánea y Q-1 (12 min, sesión 1) — experimento 1 de la guía

Condición: N-ON, N-M3, N-L2, Territorio T2 en N1. Durante las primeras preguntas, la escena está quieta.

| # | Pregunta (en este orden) | Mide | Respuesta correcta |
|---|---|---|---|
| B1.1 | "Sin tocar nada: ¿ves grupos distintos de marcas pequeñas pegadas a los objetos? ¿Cuántos? ¿Cómo los distinguís?" | **Q-1**: ¿la Lente B (giro) se distingue de la A (ranura) sin aprendizaje? | Dos grupos, distinguidos por la posición y el giro |
| B1.2 | "¿Qué creés que estás viendo?" | Comprensión global | Lugares (el Territorio) y algo que pasa sobre ellos |
| B1.3 | "¿Qué representa cada grupo de marcas?" | Atribución espontánea | Trabajo en curso / efectos de criterio, en cualquier formulación equivalente |
| B1.4 | "¿Cómo sabés a qué lectura pertenece cada marca?" | Base de la atribución | Por la posición o el giro, o por la leyenda del inventario |
| B1.5 | "Elegí un lugar sin marcas. ¿Qué concluís de ese lugar?" | **Ausencias (N1)** | Depende del ensayo: *ninguno* sólo si la capa O declara cobertura; si no, *desconocido* |
| B1.6 | "Pasá el puntero sobre un objeto y después sacalo. ¿Qué diferencia hay entre lo que apareció y las marcas que ya estaban?" | Respuesta interactiva frente a marca permanente (guía Exp. 1) | Lo que apareció es temporal y responde al puntero; las marcas son información |
| B1.7 | "Si apagás esta lectura [señalando el inventario], ¿qué creés que va a cambiar?" | Previsibilidad | Sólo desaparecen sus marcas; nada se mueve |

### B2 · Descubrimiento global (15 min, sesión 1) — IX-U1, experimento 2

Condiciones: **N-ON frente a N-OFF**, con orden contrabalanceado, Territorio T2 isomorfo, densidades N1 y N2.

| Tarea | Consigna | Ensayos por condición | Respuesta correcta |
|---|---|---|---|
| **T-GLOB** | "Indicá todos los lugares donde hay trabajo en curso" | 2 (N1, N2) | Conjunto de Entidades con filas de P-W1 |
| **T-CONJ** | "Entre los lugares con trabajo en curso, ¿en cuáles el trabajo choca con un criterio? ¿En cuáles no se sabe? ¿En cuáles se evaluó y no choca?" | 2 (N1, N2), con los cuatro estados presentes | Partición de las Entidades con trabajo en: confirmada, indecidible, *ninguno* (con cobertura declarada) y *desconocido* (§6.6 de IX v0.2) |
| **T-ACT** (sólo N-OFF) | Observación: si activa Lentes, cuáles y cuándo | — | — |

### B3 · Inspección, contexto y Foco (18 min, sesión 1) — IX-U4, IX-U5, experimento 3

Condiciones: **N-M1 frente a N-M3**, con orden contrabalanceado, N-ON, Territorio T2 isomorfo en N2, con un Anchor previo en una Entidad pequeña.

| Tarea | Consigna | Ensayos por condición | Respuesta correcta | Mide |
|---|---|---|---|---|
| **T-INSP** | "Este lugar [nombrado en la consigna] ¿tiene trabajo que choca con un criterio? Justificalo con lo que encuentres" | 2 | Estado de P-G2 y su fundamento en la Superficie | Decisión de abrir la Superficie; justificación (N1 si es falsa) |
| **T-RET** | Tarea global interrumpida: a mitad de una T-GLOB, inspeccionar una Entidad (T-INSP) y después "seguí con la tarea anterior" | 2 | Completar la T-GLOB sin perder lo ya encontrado | **Continuidad**: reanudación correcta y tiempo |
| **T-FOCO** | Después de cada T-INSP: "¿Qué está enfocado ahora? ¿Qué lugar está anclado?" | 2 | Foco y Anchor reales | Identificación del Foco; Foco frente a Anchor en contexto |
| **T-FA-S** | Prueba estática, igual en las dos condiciones: seis marcas a tamaño N2 (reposo, indicación, Foco, Anchor, Foco + Anchor, Anchor con indicación), en orden aleatorio: "¿Cuál es el Foco? ¿Cuál está anclada? ¿Alguna es las dos cosas?" | 1 (sólo una vez por participante, al final de B3) | Asignación correcta | **`CB/F-1` a tamaño pequeño**, sin ayuda de la cámara (I-12) |

### B4 · Combinación y ausencias (15 min, sesión 2) — IX-U2, IX-U3, experimento 4

Condiciones: **N-L2 frente a N-L3**, con orden contrabalanceado, N-ON, N-M3, Territorio T2 isomorfo en N1 y N2.

| Tarea | Consigna | Ensayos por condición | Respuesta correcta |
|---|---|---|---|
| **T-ATR** | Señalando una marca: "¿A qué lectura pertenece esta marca?". En N-L3, también: "¿Qué dice la lectura que no se ve sobre este lugar?" | 4 | Lente correcta; en N-L3, el recuento de la Lente no visible en la indicación |
| **T-AUS** | Señalando un lugar sin marca de una lectura: "¿Qué concluís sobre [la pregunta de esa lectura] aquí?" | 4: uno por tipo de ausencia | (1) *ninguno* con cobertura declarada; (2) *desconocido* por cobertura; (3) *desconocido* por Lente activa sin datos (DJ-I6); (4) Lente activa no visible por el tope (la información existe y está en la indicación y la Superficie) |

### B5 · Densidad (6 min, sesión 2) — experimento 5

Condición: N-ON, N-M3, T2 de N0 a N3, en ese orden. En cada densidad: "¿Qué podés leer desde aquí sin acercarte?" y "Acercate hasta poder decir cuántos lugares tienen trabajo en curso". Se registra en qué densidad deja de leerse cada dimensión y si la persona nota la agregación ("×N"). No tiene umbral: es descriptivo (`CB/VA-3`).

### B6 · Control y previsibilidad (8 min, sesión 2) — experimento 6

Condición: N-ON, N-M1, N-L2, T2 en N1.

| Tarea | Consigna | Ensayos | Respuesta correcta |
|---|---|---|---|
| **T-PRED** | Antes de cada acto: "¿Qué va a pasar si hacés esto?" Actos: activar una tercera Lente, desactivar una visible, señalar, enfocar, abrir la Superficie, volver al Foco anterior | 6 | Según el modelo de estados (IX v0.2 §6.4) |
| **T-ATN** | Durante una T-GLOB llega una convocatoria de Atención. Después: "¿Cambió algo? ¿Qué? ¿Lo cambiaste vos o el sistema?" | 2 | Sólo apareció la convocatoria en la capa O; nada se movió (`C-17`) |

### BX · Bloque exploratorio [FN] (12 min, sesión 2)

Rotulado [FN] en el registro. Va después de B6 y antes de B7.

| Par | Tarea | Ensayos |
|---|---|---|
| FN-VEST frente al recuento | T-INSP | 2 + 2 |
| FN-M0 frente a N-M1 | T-RET | 1 + 1 |
| FN-CFN frente a N-ON | T-GLOB | 1 + 1 |

### B7 · Cierre (5 min, sesión 2)

Carga percibida (escala de 1 a 7 por condición) y preferencia declarada por condición, con su motivo. Pregunta abierta: "¿En algún momento quisiste comparar dos lugares? ¿Cómo lo hiciste?" (IX-U7). Todo esto es N3 y no decide nada por sí solo (DJ-I8).

---

## 6. Métricas y umbrales propuestos

**Todos los umbrales de esta sección son propuestas para aprobar antes de las sesiones (DJ-I8).** Una vez aprobados, no se modifican a la vista de los resultados. Si el piloto mostrara que alguno es inaplicable, se propondría el cambio **antes** de la primera sesión principal, registrado y con los datos del piloto excluidos (I-9).

### 6.1 Unidades

- **Juicio:** cada afirmación de la persona sobre una Entidad (por ejemplo, "aquí no se sabe"). Una tarea puede producir varios juicios.
- **Ensayo:** una ejecución de una tarea en una condición.
- Las cuentas de la columna "con n = 6" suponen 6 participantes y los ensayos de §5. Si n cambia, rige el porcentaje.

### 6.2 Umbrales absolutos por condición

| ID | Métrica (guía §8) | Definición | Nivel | Umbral propuesto | Con n = 6 | Justificación |
|---|---|---|---|---|---|---|
| **U-N1a** | Errores críticos: ausencias | Juicios en T-AUS y B1.5 que leen *desconocido*, "activa sin datos" o "no visible por el tope" como *ninguno* | N1 | **≤ 5%** de los juicios por condición, **y** a lo sumo 1 por participante y condición, **y** ningún tipo de ausencia confundido por 2 o más participantes | ≤ 1 de 24 en T-AUS por condición | `C-2`, `C-16`. Se tolera un desliz aislado, no un patrón: el mismo error en dos personas es un problema de diseño aunque la tasa sea baja |
| **U-N1b** | Errores críticos: estado | Juicios en T-CONJ y T-INSP que confunden confirmada, indecidible, *ninguno* y *desconocido* | N1 | **≤ 5%** de los juicios por condición, con la misma regla de patrón | Según el número de Entidades con trabajo por Territorio (se fija con el Territorio) | `C-16` (tres estados más *desconocido*, distinguibles) |
| **U-N1c** | Comprensión causal | Justificaciones de T-INSP con un fundamento falso | N1 | **≤ 1** por condición en total | ≤ 1 de 12 | `C-2`. Un fundamento falso es peor que no encontrar el fundamento (que es N3) |
| **U-N2a** | Atribución | Marcas atribuidas a la lectura correcta en T-ATR | N2 | **≥ 90%** en N-L2; **≥ 80%** en N-L3 | ≥ 22 de 24; ≥ 20 de 24 | `EM §5.4.2`. Con tres Lentes, una no es visible y se la atribuye por la indicación |
| **U-N2b** | Continuidad del contexto | Reanudaciones correctas de T-GLOB después de inspeccionar (sin perder lo ya encontrado ni reiniciar la búsqueda) | N2 | **≥ 80%** por condición | ≥ 10 de 12 | Objetivo 4 de la guía |
| **U-N2c** | Identificación del Foco en contexto | Respuestas correctas a "¿qué está enfocado?" en T-FOCO | N2 | **≥ 90%** por condición | ≥ 11 de 12 | `EM §4.6.3` (Foco visible siempre); DJ-I9 |
| **U-N2d** | Foco frente a Anchor en contexto | Respuestas correctas a "¿qué está anclado?" en T-FOCO | N2 | **≥ 85%** por condición | ≥ 11 de 12 | `EM §4.6.3`; `CB/X-4` |
| **U-N2e** | `CB/F-1` a tamaño pequeño (prueba estática) | Asignaciones correctas en T-FA-S, y en particular la distinción Foco / Foco + Anchor | N2 | **≥ 85%** de las asignaciones, **y** al menos 5 de 6 participantes distinguen Foco de Foco + Anchor | ≥ 31 de 36 | `CB/F-1`; DJ-I9 |
| **U-N2f** | Previsibilidad | Predicciones correctas en T-PRED | N2 | **≥ 80%** | ≥ 29 de 36 | Guía §8 |
| **U-N2g** | Control | Creencias de que el sistema actuó solo (sin interpretación falsa del estado; si la hay, cuenta en N1) | N2 | **≤ 1** en total | ≤ 1 de 12 en T-ATN | `C-17` |
| **U-Q1** | Lente B sin aprendizaje (`CB/Q-1`) | Participantes que en B1.1 distinguen los dos grupos y nombran la posición o el giro como diferencia | — | **≥ 5 de 6** (≥ 80%): reconocible. **4 de 6**: no concluyente. **≤ 3 de 6**: no reconocible | — | Si no es reconocible, el tope efectivo sería 1 + 1 relacional (`CB §8.2`) |
| — | Eficiencia, carga y preferencia | Tiempos, pasos, aperturas innecesarias de la Superficie, carga y preferencia declaradas | N3 | **Sin umbral absoluto.** Sólo comparativo (§6.3) | — | DJ-I8 (dominancia) |

**Condición "cumple".** Una condición cumple si alcanza todos los umbrales N1 y N2 que le corresponden. Una condición que no cumple un umbral N1 no puede preferirse a otra que lo cumple, aunque sea mejor en todo lo demás (dominancia, DJ-I8).

### 6.3 Márgenes para comparar condiciones

Con muestras chicas, una diferencia sólo se considera relevante si supera un margen fijado de antemano. Por debajo del margen: **"sin diferencia"**.

| Medida | Margen de diferencia relevante |
|---|---|
| Proporciones (exactitud, continuidad, identificación) | **10 puntos porcentuales** |
| Tiempos (mediana por condición) | **20%** |
| Conteos de errores N1 o N2-control | **2 ocurrencias** |

---

## 7. Reglas de clasificación de errores

### 7.1 Procedimiento

1. Se transcriben las respuestas y las verbalizaciones relevantes de cada ensayo.
2. Cada juicio se clasifica con la rúbrica de §7.2, **por la creencia expresada** (DJ-I8).
3. Si la persona no expresó una creencia, se le hace la pregunta de conclusión del ensayo. Si igual no la expresa, el juicio se registra como "sin conclusión" (N3) y nunca como N1.
4. **Doble codificación.** José codifica en forma independiente las sesiones de al menos 2 de los 6 participantes. Si el acuerdo es menor al **85%** de los juicios, se revisa la rúbrica y se recodifica todo antes de comparar condiciones. Los desacuerdos y su resolución quedan registrados.
5. **Límite reconocido.** Los codificadores ven la condición en la grabación, así que la codificación no es ciega. Se mitiga con la rúbrica cerrada y la doble codificación.

### 7.2 Rúbrica

| Situación observada | Creencia expresada | Clasificación |
|---|---|---|
| No hay marca; la capa O declara que la Lente no cubre | "Aquí no hay [X]" | **N1** |
| Ídem | "No se sabe" o "no está evaluado" | Correcto |
| La Lente está activa sin datos | "No hay [X] en ningún lado" | **N1** |
| La Lente está activa pero no visible por el tope | "Esta lectura no dice nada aquí" | **N1** |
| Ídem | "No se ve; está en la indicación o en el panel" | Correcto |
| Colisión indecidible | "Hay un choque" (como confirmado) o "no hay choque" | **N1** |
| Una marca de P-G2 | "Es de la lectura de trabajo" | **N2** (atribución) |
| Una tarea global interrumpida | Reinicia la búsqueda o declara no recordar lo encontrado | **N2** (continuidad) |
| Llegó una convocatoria | "El sistema me movió la vista" (sin error sobre el estado) | **N2** (control) |
| Llegó una convocatoria | "El sistema activó la lectura de Atención, así que lo demás no requiere a nadie" | **N1** (error de control que produce una interpretación falsa del estado) |
| Búsqueda incompleta | "Sigo buscando" o "no encontré más", sin afirmar que no hay | **N3** |
| Abre la Superficie sin necesitarla | — | **N3** |
| Justifica con un fundamento que la Superficie no dice | — | **N1** (U-N1c) |
| No encuentra el fundamento | "No lo encuentro" | **N3** |

---

## 8. Hipótesis preregistradas y reglas de decisión

Cada hipótesis dice qué la apoya, qué la refuta y qué pasa en cada caso. Corresponde a la pregunta 27 de la guía (conservar, modificar o descartar).

### H-m1 · El movimiento mínimo conserva el contexto sin degradar el Foco (DJ-I9)

**Registrada como hipótesis inicial, no como resultado esperado.**

| | Criterio |
|---|---|
| **Apoyo** | N-M1 cumple todos sus umbrales N1 y N2, **y** supera a N-M3 en continuidad por el margen de §6.3: reanudación correcta 10 puntos o más por encima, o mediana de tiempo de reanudación 20% o más menor |
| **Refutación** (basta una) | **r1.** No hay ventaja de continuidad por el margen. **r2.** La identificación del Foco en N-M1 queda por debajo del 90% (U-N2c) o 10 puntos o más por debajo de N-M3. **r3.** N-M1 produce 2 o más errores N1 o N2-control por encima de N-M3. **r4.** La prueba estática (U-N2e) falla **y** la distinción Foco / Anchor en contexto (U-N2d) falla en N-M1 y no en N-M3 |
| **Consecuencia** | Refutada por r1: no hay razón para preferir m1; se mantiene m3 o se reabre IX-D6. Refutada sólo por r2–r4: m1 no puede adoptarse tal cual; haría falta compensar la señal del Foco a tamaño pequeño, y eso requiere una decisión nueva. Apoyada: evidencia a favor de m1 para IX-D6. **En ningún caso cambia la norma** |

### H-E1 · Las marcas persistentes por defecto mejoran el descubrimiento global

| | Criterio |
|---|---|
| **Apoyo** | En T-GLOB y T-CONJ, N-ON supera a N-OFF en exactitud por 10 puntos o más, o en tiempo por 20% o más, sin más errores N1 |
| **Refutación** | N-OFF iguala o supera a N-ON en exactitud (dentro del margen) sin más errores N1 |
| **Consecuencia** | Evidencia para IX-D15. Una refutación favorece el valor por defecto "sin Lentes", que **es normativo**; no autoriza C-fn |

### H-L3 · Tres Lentes con O-1 son comprensibles

| | Criterio |
|---|---|
| **Apoyo** | En N-L3, U-N2a (≥ 80%) y U-N1a se cumplen, incluido el tipo de ausencia (4), "no visible por el tope" |
| **Refutación** | No se cumple alguno de los dos |
| **Consecuencia** | Evidencia para IX-D4: si se refuta, a favor de O-2 (rechazar la activación) o de un tope menor |

### H-AUS · Los cuatro tipos de ausencia de DJ-I6 se distinguen

| | Criterio |
|---|---|
| **Apoyo** | U-N1a se cumple **para cada tipo** en las dos condiciones de B4 |
| **Refutación** | Algún tipo no cumple |
| **Consecuencia** | Un fallo es un problema de **cómo se comunica** el estado (capa O, indicación), no de DJ-I6. Si el fallo persistiera después de rediseñar la comunicación, podría motivar una revisión de DJ-I6, que es una decisión tuya |

### H-Q1 · La Lente B se reconoce sin aprendizaje

Ver U-Q1. Si no es reconocible, es evidencia para que el tope efectivo sea 1 + 1 relacional (IX-D4, `CB/VA-10`).

### Bloque exploratorio [FN]

No tiene hipótesis de decisión. Se informa de forma descriptiva, en una sección propia. Un resultado favorable a una condición [FN] (por ejemplo, que V-EST reduzca las aperturas innecesarias de la Superficie sin más errores N1) **sólo puede fundamentar una propuesta**, con el procedimiento que corresponda (DJ-I7).

---

## 9. Datos y análisis

**Registro de eventos del prototipo** (exportable en JSON). Por evento: participante, sesión, bloque, condición, Territorio, ensayo, marca de tiempo, tipo de evento y Entidad. Tipos: entra o sale la indicación; recorrido de candidatos; Foco; vuelta por la historia; Superficie abierta o cerrada; Lente activada o desactivada; cambio de visibles; **movimiento automático de cámara** (con su magnitud) frente a movimiento de cámara por la persona; convocatoria; respuesta registrada.

**Hoja de respuestas.** Respuesta, conclusión expresada y codificación (§7) por juicio.

**Análisis.** Descriptivo, por condición y por participante. Proporciones con su conteo (por ejemplo, "10 de 12"), medianas y rangos de tiempo, y la aplicación literal de §6 y §8. Sin inferencia estadística. El bloque [FN], aparte.

**Piloto.** Una o dos personas que no cuentan como participantes. Sirve sólo para la claridad de las consignas y para comprobar que el prototipo registra todo. Sus datos se excluyen. Cualquier cambio de consigna o de parámetro se registra antes de la primera sesión principal.

---

## 10. Consentimiento y datos personales

Consentimiento escrito antes de B0: propósito, grabación de pantalla y audio, uso exclusivo para esta investigación, posibilidad de retirarse sin dar motivos. Los participantes se identifican como P01..P0n. Las grabaciones las guarda José y no se suben al Project. En los documentos se citan respuestas sin datos personales.

---

## 11. Requisitos del prototipo comparativo (no se construye hasta aprobar)

| # | Requisito | Fuente |
|---|---|---|
| PR-1 | Archivo nuevo `docs/ANALYSIS/ORRERY/INTERACTION/prototipo_comparativo/index.html`. Puede partir de una **copia** de la escena gris; el original no se toca | DJ-I3 |
| PR-2 | Condiciones por parámetro: N-ON/N-OFF, N-M1/N-M3, N-L2/N-L3, densidad, y las [FN] sólo con un parámetro explícito que rotula la pantalla y el registro | §4 |
| PR-3 | Indicación con el contenido exacto de `EM §4.4` (recuento por Lente). V-EST, sólo bajo el parámetro [FN] | DJ-I2, DJ-I7 |
| PR-4 | Recorrido de la indicación y recorrido de candidatos, como acciones separadas | `EM §4.6.2`; IX-C9 |
| PR-5 | Cámara m1 y m3 según §4.2, sobre CA-2. m0, sólo bajo el parámetro [FN] | DJ-I9; I-4 |
| PR-6 | O-1 sin promoción automática | I-5 |
| PR-7 | Estados de Lente y de cobertura según DJ-I6, incluida "activa sin datos" | DJ-I6 |
| PR-8 | Sin "quitar Foco" y sin modo foco | I-6 |
| PR-9 | Territorios isomorfos por semilla, espejo y nombres | §3 |
| PR-10 | Prueba estática T-FA-S | I-12 |
| PR-11 | Arnés de tareas: consigna en pantalla, registro de la respuesta y avance de ensayo sin intervención del moderador | §5 |
| PR-12 | Registro de eventos exportable (§9) | §9 |
| PR-13 | Croma 0 en toda la escena y en los controles | Guía §7; `CB §12.2` |
| PR-14 | Marca "DATOS SIMULADOS" siempre visible | I-13; `C-2` |
| PR-15 | Verificación técnica antes del piloto: capturas sin color, registro completo y las 26 transiciones del modelo comprobadas. **Esa verificación no es evidencia de comprensión** | Guía §7 |

---

## 12. Pendientes antes de las sesiones

| # | Pendiente | Quién |
|---|---|---|
| 1 | Aprobar este protocolo: §0, A-1..A-6 | José |
| 2 | Disponibilidad, número y perfil de los participantes | José |
| 3 | Construir el prototipo (§11) y verificarlo técnicamente | Yo, después de 1 |
| 4 | Preparar los Territorios isomorfos con sus respuestas correctas y el guion de moderación | Yo, después de 1 |
| 5 | Piloto y registro de cambios previos a las sesiones | José y yo |

---

*Fin del protocolo v0.1. Borrador para aprobación. No es norma. Los umbrales son propuestas hasta que José los apruebe.*
