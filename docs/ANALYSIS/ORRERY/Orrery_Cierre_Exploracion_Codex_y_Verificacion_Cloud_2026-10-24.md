# Orrery — cierre de la exploración en Codex y traspaso para verificación en Cloud

| Campo | Valor |
|---|---|
| Fecha | 2026-10-24 |
| Tipo | Acta de investigación y traspaso. **No normativa; no aprueba un diseño ni modifica el protocolo.** |
| Autoridad de diseño | José Vigil |
| Alcance | Trabajo local en Codex desde el traspaso de Orrery hasta la revisión del primer corte visual |
| Propósito | Permitir que el cowork de Cloud verifique fuentes, avances, límites y próximo problema visual sin inferir aprobación de lo que sigue abierto |

## 1. Conclusión ejecutiva

El trabajo en Codex fue útil para **recuperar el contexto local, ordenar documentos y materializar un primer corte navegable**, pero **no resolvió el objetivo de representar Orrery como un Territorio espacial**. José vio el corte en el navegador y lo considera medianamente aceptable **sólo como maqueta y representación muy aproximada**. Su evaluación más reciente es que la escena parece una composición 2D que simula volumen: no permite percibir con claridad la territorialidad del ambiente y del ecosistema, la profundidad espacial ni la línea del horizonte. La agrupación jerárquica de objetos sí es legible y constituye el aspecto rescatable. Esta recepción no es aprobación del diseño final ni de su gramática espacial.

La siguiente investigación debe concentrarse en **la renderización de objetos en el Espacio**, no en ampliar paneles, textos, métricas ni el protocolo experimental. El contraste requerido es si una escena con cámara y profundidad realmente navegables hace perceptible un Territorio. La forma, escala, horizonte y lenguaje de Entidades siguen abiertos; el research morfológico y el presupuesto de canales son fuentes para evaluar propuestas, no resultados visuales adoptados por este corte.

## 2. Fuentes y artefactos disponibles localmente

1. [Índice de continuidad](Orrery_Continuidad_Local_2026-10-18.md): orden de lectura, procedencia y faltantes. Sus párrafos sobre el «punto exacto de continuación» reflejan el traspaso original y **no incorporan aún todas las decisiones conversadas después**; leer junto con esta acta.
2. Norma vigente: [Vocabulario v1.1](Orrery_Vocabulario_Normativo_v1_1.md), [Constitución v1.1](Orrery_Constitucion_v1_1.md), [Decisiones v1.1](Orrery_Decisiones_Arquitectonicas_v1_1.md) y [Experience Model v1.0](EXPERIENCE/Orrery_Experience_Model_v1_0.md), orientados por el [Estado Base](Orrery_Estado_Base_v1_0.md).
3. Research visual: [lenguaje morfológico v0.1](VISUAL/Orrery_Morphological_Spatial_Language_Research_v0_1.md) — aprobado como research, no como diseño — y [presupuesto de canales v0.1](VISUAL/Orrery_Channel_Budget_Interaction_Reservation_v0_1.md) — borrador para revisión. La [escena gris](VISUAL/escena_gris/index_1.html) es evidencia técnica distinta del corte visual.
4. Interacción: [research v0.2](INTERACTION/Orrery_Interaction_Research_Lente_Seleccion_Indicacion_v0_2.md), [protocolo experimental v0.1](INTERACTION/Orrery_Interaction_Experiment_Protocol_v0_1.md) y [corrección de continuidad](INTERACTION/Orrery_Correccion_Continuidad_Protocolo_2026-10-18.md). El protocolo v0.1 conserva su estado de borrador; sus porcentajes, hipótesis y planificación temporal no están aprobados como conjunto.
5. Artefacto construido en Codex: [primer corte visual](VISUAL/primer_corte/index.html), HTML autónomo con datos sintéticos, separado del código congelado de `installer/conductor/workspace/core/orrery/`. No usa una Fuente real ni acredita una corrida de Genesis E2E.
6. Procedencia completa: [traspaso detallado](Orrery_Traspaso_Codex_Estado_y_Orden_de_Lectura_v1_0.md), [traspaso Windows](Orrery_Traspaso_Codex_Windows_v1_0.md) y encargos originales en [`ENCARGOS/`](ENCARGOS/).

Los cinco textos fuente agregados durante el traspaso (dos de interacción y tres encargos) se verificaron por tamaño y SHA-256 contra la tabla del traspaso detallado tras restaurar los saltos de línea LF. La verificación es contra esa tabla, no contra una lectura independiente del Project BTIPS. Los demás documentos que sólo existen en el Project están enumerados en el índice de continuidad y no se incorporaron en esta etapa.

## 3. Qué muestra el primer corte y qué se observó

La escena sintética muestra Tenant › Organization › Project como árbol con Fuente; Domain y Gene como Entidades separadas dentro de Project; dos Anotaciones de una Lente Trabajo; y una Lente Gravity «activa sin datos», cuyo estado por Entidad permanece *desconocido*. Permite enfocar objetos, recorrer y cambiar escala. La etiqueta de datos sintéticos permanece visible. La escena no afirma que la cercanía entre Domain y Gene constituya una relación N:M.

La revisión local comprobó sintaxis de JavaScript e IDs únicos. Una captura en navegador y dos comportamientos básicos fueron comprobados: desactivar Trabajo retira sus marcas, y enfocar Domain cambia el panel de identidad. Esto **verifica funcionamiento técnico puntual**, no comprensión humana ni calidad espacial.

José navegó el corte y aportó dos niveles de feedback:

- Primero, lo recibió favorablemente como aproximación inicial.
- Después precisó que esa aprobación es **condicional al carácter de maqueta**. Ve agrupación, jerarquía y conexiones, pero no un ambiente espacial convincente. Considera que hay demasiado texto alrededor para la pregunta actual y quiere concentrar la investigación en la renderización de los objetos en el Espacio.

La observación posterior precisa el alcance de la primera; no deben presentarse como dos aprobaciones independientes.

## 4. Domain y Gene: intuición a investigar, no contrato nuevo

José percibe Domain y Gene como organismos relativamente parecidos y planteó que un Gene puede verse «dentro» de un Domain, pero también puede relacionarse con varios Domains e incluso atravesar Projects. Esto es una **intuición sobre la lectura espacial**, no una decisión de cambiar el modelo. El research de presupuesto de canales registra DJ-CR1: la contención se reserva a árboles con Fuente; Domain↔Gene N:M requiere otro dispositivo de pertenencia. Por eso, una nueva escena no debe hacer que la cercanía o el anidamiento sugieran una pertenencia única falsa. Cloud debe contrastar esta intuición con las fuentes normativas y proponer formas visuales que conserven la multiplicidad y la Procedencia.

## 5. Decisiones de interacción conversadas durante esta etapa

José revisó los tratamientos I-1..I-13 del protocolo para la **investigación**, con alcances y correcciones transmitidos en la conversación de Codex. Esto no aprueba el protocolo v0.1 completo ni sus umbrales e hipótesis. En particular:

- I-1..I-8 se aceptaron para la primera ronda con las restricciones comunicadas: Q-1 como primera lectura con leyenda disponible; indicación del bloque normativo limitada a Experience Model §4.4; «sin Foco» fuera de la primera prueba; y una Lente activa sin datos que no consume un lugar destinado a Anotaciones visibles de O-1.
- I-9..I-13 se aceptaron para la primera ronda **con correcciones**, no según la redacción literal del borrador. José rechazó los ~95 minutos y dos encuentros obligatorios de I-10. Orrery es una experiencia continua: las pausas responden a la persona y ningún bloque termina por reloj. La duración puede describir fricción o retorno, sin puntuar rapidez por defecto. Una pérdida de Fuente en vivo sigue fuera de esta primera observación; «DATOS SIMULADOS» permanece visible.
- Los umbrales numéricos de §6, las hipótesis de §8, el perfil y número de participantes, y la versión revisada del protocolo permanecen abiertos. No se construyó el prototipo comparativo ni se realizaron sesiones con personas.

**Límite de trazabilidad:** el documento de corrección de continuidad registra la situación anterior a la aprobación conversada de I-9..I-13. Estas aprobaciones posteriores están en la conversación de Codex y requieren consolidación explícita en un documento nuevo antes de usarse como instrucciones operativas de una prueba. No reinterpretar el borrador v0.1 como si ya contuviera las correcciones.

## 6. Pedido de verificación a Cloud

1. **Contrastar esta acta con las fuentes vigentes** y señalar cualquier afirmación que exceda el Vocabulario, la Constitución, las Decisiones o el Experience Model. No modificar esas fuentes por inferencia.
2. **Evaluar el primer corte como maqueta**, no como Visual Architecture aprobada. Explicar por qué su renderización no produce territorialidad, profundidad ni horizonte suficientes, usando los criterios del research morfológico y del presupuesto de canales.
3. **Proponer un siguiente corte espacial acotado** centrado en cámara, profundidad, escala, horizonte y presencia de las Entidades, con pocos datos sintéticos. Indicar qué fenómeno perceptual demostraría cada decisión y cómo se observaría al navegar. No diseñar aún toda la UI ni introducir semántica falsa para Domain↔Gene o Gravity.
4. **Separar evidencia, hipótesis y decisión.** Identificar qué validó realmente la escena gris, qué verificó técnicamente el primer corte y qué sigue siendo juicio de José o pregunta abierta.
5. **Reconciliar el estado del protocolo** con las decisiones conversadas, sin aprobar porcentajes o hipótesis por omisión. La evaluación formal de N1 y colisiones queda para después de tener una representación visible que merezca ponerse a prueba.

## 7. Límites de este cierre

Este documento cierra **la evaluación del primer corte hecho en Codex**, no la investigación visual de Orrery. No adopta una arquitectura 3D, una cámara, un horizonte literal, una morfología de Domain/Gene ni un comportamiento final de Lentes. El siguiente corte visual es una propuesta que José deberá ver y corregir. No hay autorización derivada de esta acta para cambiar el código congelado de Orrery, la norma o el protocolo experimental.
