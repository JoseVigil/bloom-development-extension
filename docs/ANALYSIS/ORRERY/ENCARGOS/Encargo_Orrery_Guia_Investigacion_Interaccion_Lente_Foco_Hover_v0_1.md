# Orrery — Guía de investigación y diseño de interacción
## Lente · Foco · Hover
**Versión:** 0.1 — Encargo de investigación  
**Estado:** Investigación abierta. No constituye una modificación normativa ni una decisión final de producto.

---

## 1. Encargo

Continuar la investigación de Orrery para determinar cómo debe funcionar la interacción humana con las lecturas visuales del Territorio, estudiando conjuntamente tres conceptos:

- **Lente:** mecanismo conceptual que transforma una Proyección en Anotaciones vinculadas a Entidades del Territorio.
- **Foco:** posible concepto de interacción mediante el cual el usuario elige qué dimensión del Territorio quiere observar.
- **Hover:** interacción transitoria que permite señalar una Entidad mediante el puntero y obtener una respuesta contextual.

El objetivo no es simplemente decidir qué palabra utilizar en la interfaz. Se busca determinar si estos conceptos representan responsabilidades distintas, cómo deberían relacionarse y cuál es la interacción más eficaz para que una persona comprenda estructuras complejas, descubra relaciones relevantes y tome decisiones sin perder el control de su vista.

La investigación debe producir una recomendación fundamentada, verificable y aplicable a la arquitectura, la experiencia y las futuras pruebas de Orrery.

## 2. Objetivo principal

Diseñar una experiencia en la que una persona pueda:

1. Comprender la estructura general del Territorio sin necesidad de inspeccionar cada Entidad individualmente.
2. Elegir qué dimensión informativa quiere explorar.
3. Reconocer patrones relevantes en el Espacio.
4. Inspeccionar una Entidad puntual sin perder el contexto global.
5. Combinar lecturas diferentes sin confundir su procedencia o significado.
6. Acceder al detalle y al fundamento de cada indicación.
7. Mantener el control sobre qué información se activa, qué se muestra y cuándo cambia la vista.

La solución debe ser robusta desde el punto de vista perceptual, semántico y arquitectónico. Debe reducir la ambigüedad, no introducir estados invisibles ni atribuir a los datos significados que sus fuentes no respaldan.

**Criterio rector:** Orrery debe hacer legible la complejidad del Territorio sin alterar la estructura que está representando ni quitarle al usuario el control de la exploración.

## 3. Documentación de referencia y restricciones

Antes de proponer cambios, revisar las versiones actuales de los documentos del proyecto, especialmente:

- `Orrery_Morphological_Spatial_Language_Research_v0_1.md`
- `Orrery_Channel_Budget_Interaction_Reservation_v0_1.md`
- `escena_gris/index.html`
- El Experience Model vigente, en particular EM §5.2 y §5.3, y las referencias a C-7, C-8 y C-17.
- Las decisiones y preguntas abiertas identificadas como O-1, Q-1, F-1 a F-7, X-3 y X-6, en los casos en que correspondan a la versión vigente de la documentación.

Verificar las referencias contra los archivos reales. No dar por supuesto que los identificadores, el contenido o el estado de una decisión siguen vigentes sin comprobarlos.

### Restricciones que deben conservarse durante la investigación

1. El Territorio es independiente de las Lentes que lo interpretan.
2. Una Lente no modifica, reordena ni elimina Entidades del Territorio.
3. Una Lente transforma una Proyección en Anotaciones; no inventa datos ni decide por sí misma qué información es importante.
4. La activación de una Lente no debe producir cambios autónomos de la vista contrarios al control explícito del usuario.
5. Apagar una Lente retira sus Anotaciones, pero no oculta Entidades, reorganiza el Territorio ni mueve la cámara.
6. Las combinaciones de lecturas deben preservar la procedencia y el significado de cada Anotación.
7. La representación debe ser comprensible sin depender exclusivamente del color.
8. La activación, la visibilidad, la disponibilidad de datos y la consulta de detalles son estados distintos y no deben confundirse.
9. La evidencia que no pueda mostrarse espacialmente debe seguir siendo accesible por los mecanismos previstos, con su estado debidamente comunicado.
10. Las decisiones normativas existentes no deben modificarse silenciosamente para acomodar una propuesta nueva.

Si una hipótesis de esta investigación entra en conflicto con una restricción existente, documentar el conflicto y presentar las alternativas. No resolverlo mediante una interpretación implícita.

## 4. Hipótesis que deben investigarse

No asumir que las hipótesis siguientes son verdaderas. Tratarlas como preguntas de investigación.

### H1. Lente, Foco y Hover pueden representar responsabilidades distintas

La Lente podría ser el mecanismo de representación; el Foco, la intención o selección persistente de una lectura; y el Hover, la inspección transitoria de una Entidad.

Investigar si esta separación mejora la comprensión o introduce una complejidad conceptual innecesaria.

### H2. El usuario necesita distinguir entre exploración global y exploración local

El Foco podría facilitar la detección de patrones en muchas Entidades simultáneamente. El Hover podría permitir inspeccionar una Entidad concreta sin abandonar esa lectura global.

Comprobar si ambas capacidades son necesarias y si su combinación ofrece ventajas frente a alternativas más simples.

### H3. La combinación de lecturas es una capacidad central de Orrery

El valor de P-W1 y P-G2, por ejemplo, consiste en reconocer simultáneamente que existe trabajo y que ese trabajo colisiona con un criterio.

Investigar cómo mantener esa combinación comprensible, especialmente cuando aumenta la cantidad de Entidades, Anotaciones o estados simultáneos.

### H4. La respuesta al Hover debe ser contextual y progresiva

El señalamiento podría ofrecer una primera indicación, mientras que una acción explícita permitiría abrir la Superficie y acceder al detalle completo.

Investigar qué información debe aparecer inmediatamente, cuál debe esperar a una acción adicional y cómo evitar la sobrecarga visual.

### H5. El mouse puede ser el dispositivo prioritario sin convertirse en una dependencia conceptual

Investigar una experiencia optimizada para escritorio y mouse. Distinguir los requisitos concretos de la implementación de los conceptos generales de señalar, inspeccionar, seleccionar y activar.

No es necesario diseñar ahora una experiencia multidispositivo completa. Sí es necesario evitar que el modelo conceptual dependa innecesariamente de un evento específico del mouse.

### H6. El límite de Lentes visibles afecta también a la interacción

La hipótesis de un máximo de dos Lentes simultáneamente visibles no debe darse por validada por esta investigación. Estudiar cómo interactúan el límite perceptual, la identificación de las Lentes, el Hover y el acceso a información no visible en el Espacio.

La investigación de interacción debe aportar evidencia útil para Q-1, sin sustituir la validación perceptual específica que esa pregunta requiere.

## 5. Preguntas de investigación

Responder explícitamente a cada pregunta. Para cada una, identificar evidencia disponible, incertidumbres, alternativas y recomendación.

### A. Semántica y arquitectura conceptual

1. ¿Qué significa exactamente Lente en la arquitectura de Orrery?
2. ¿Foco representa una entidad del modelo, un estado de la vista, una intención del usuario o simplemente una etiqueta de interfaz?
3. ¿Hover es una acción, un estado transitorio, un mecanismo de inspección o una combinación de ellos?
4. ¿Existe una separación conceptual más sencilla que preserve las capacidades necesarias?
5. ¿Qué conceptos deberían existir en la arquitectura y cuáles deberían existir solamente en la interfaz?
6. ¿Qué términos podrían confundirse con foco de cámara, foco de teclado, iluminación, zoom, selección o filtrado?

### B. Activación y persistencia

7. ¿Cómo debería activarse una lectura: mediante inventario, acción contextual, atajo de teclado u otro mecanismo?
8. ¿Qué diferencia existe entre activar una Lente, mantener un Foco y señalar una Entidad?
9. ¿Qué debería persistir al mover el puntero, seleccionar otra Entidad o abrir una Superficie?
10. ¿Cómo se comportan dos Lentes activas cuando el usuario inspecciona una Entidad?
11. ¿Qué sucede si el usuario señala una Entidad que no contiene Anotaciones para el Foco activo?
12. ¿Cómo se comunica una Lente activa sin datos o activa pero no visible por el límite de canales?
13. ¿Qué comportamiento debe tener la vista cuando llega una Atención mientras el usuario está explorando?

### C. Percepción y carga cognitiva

14. ¿Puede el usuario reconocer qué Lente produjo cada marca sin depender del color?
15. ¿Cómo se diferencia una marca permanente de una respuesta transitoria al Hover?
16. ¿Qué ocurre cuando una Entidad contiene marcas de varias Lentes y además está señalada?
17. ¿Cuántos niveles de información puede procesar el usuario antes de perder el contexto?
18. ¿Cómo se conserva la legibilidad al cambiar la escala, la densidad de Entidades o el tamaño de las marcas?
19. ¿Qué señales visuales permiten distinguir entre ausencia de información, ausencia de datos, estado desconocido y falta de representación espacial?

### D. Acceso al detalle

20. ¿Qué debe revelar el Hover sin abrir la Superficie?
21. ¿Qué información necesita una acción explícita adicional?
22. ¿Cómo se preserva la trazabilidad desde una marca hasta la Proyección y su fuente?
23. ¿Cómo puede inspeccionarse una Entidad sin que desaparezca la lectura global que motivó la exploración?
24. ¿Qué ocurre cuando el usuario necesita comparar dos Entidades o dos fundamentos?

### E. Evaluación

25. ¿Qué tareas permiten demostrar que la combinación Lente/Foco/Hover es superior a una alternativa más simple?
26. ¿Qué errores son más graves: no detectar un patrón, atribuirlo a la Lente incorrecta, interpretar una ausencia como un resultado negativo o perder el contexto al inspeccionar?
27. ¿Qué evidencia justificaría conservar la propuesta, modificarla o descartarla?
28. ¿Qué cuestiones deben resolverse antes de comenzar el diseño visual definitivo?

## 6. Alternativas de diseño que deben compararse

Investigar como mínimo estas cuatro alternativas. Se pueden agregar otras si la evidencia lo justifica.

**Alternativa A — Lente persistente + Hover contextual**

El usuario activa una o dos Lentes. Sus Anotaciones permanecen visibles mientras explora el Territorio. El Hover ofrece contexto puntual sobre la Entidad señalada.

**Alternativa B — Foco como concepto visible + Lente como mecanismo interno**

La interfaz presenta «Focos» que el usuario activa y combina. Cada Foco utiliza una Lente o un mecanismo equivalente para generar la lectura. El término Lente podría quedar reservado para la documentación técnica.

**Alternativa C — Inspección predominantemente bajo demanda**

La interfaz reduce las marcas persistentes y depende en mayor medida de la inspección de Entidades. Evaluar si esta alternativa conserva la capacidad de reconocer patrones globales o fuerza al usuario a explorar objeto por objeto.

**Alternativa D — Lectura persistente + Hover escalonado + Superficie explícita**

Las Lentes mantienen las Anotaciones; el Hover ofrece una indicación breve; una acción explícita abre la Superficie completa. El Foco podría ser una forma de organizar la selección de lecturas o resultar innecesario como concepto independiente.

No elegir una alternativa por afinidad terminológica. Compararlas con tareas reales, criterios de aceptación y resultados observables.

## 7. Experimentos y prototipos

La investigación debe producir prototipos funcionales o simulaciones suficientemente fieles como para evaluar comportamientos, no solamente láminas explicativas.

### Experimento 1 — Comprensión espontánea

Mostrar una escena con dos lecturas diferentes sin explicar previamente toda la gramática visual.

Preguntar al participante:

- ¿Qué cree que está viendo?
- ¿Qué representa cada marca?
- ¿Cómo sabe a qué lectura pertenece?
- ¿Qué cree que ocurrirá si desactiva una lectura?
- ¿Qué diferencia observa entre una marca persistente y una respuesta al Hover?

Registrar errores de interpretación y tiempo hasta la respuesta correcta.

### Experimento 2 — Descubrimiento global

Plantear tareas como:

- Encontrar Domains con trabajo pendiente.
- Identificar trabajo que colisiona con un criterio.
- Encontrar Entidades que requieren intervención humana.
- Reconocer una coincidencia entre dos lecturas.

Comparar una vista con Anotaciones persistentes frente a una experiencia predominantemente basada en inspección puntual.

### Experimento 3 — Inspección local

Pedir al participante que señale una Entidad, identifique qué información puede obtener inmediatamente y abra la Superficie para justificar una conclusión.

Evaluar si el Hover aporta contexto útil, si interfiere con las marcas existentes o si provoca aperturas y cambios de estado no deseados.

### Experimento 4 — Combinación y conflicto visual

Usar P-W1 y P-G2 como caso prioritario. Después, incorporar una tercera lectura en un escenario controlado.

Observar si el participante puede distinguir las fuentes de información, detectar la combinación relevante y explicar qué evidencia respalda su interpretación.

No utilizar el éxito con dos Lentes para dar por resuelta la cuestión del límite máximo.

### Experimento 5 — Densidad y escala

Repetir las tareas con diferentes cantidades de Entidades, tamaños de marcas y niveles de zoom.

Registrar cuándo la escena deja de ser legible y qué información debe trasladarse a la indicación o la Superficie.

### Experimento 6 — Control y previsibilidad

Introducir eventos de Atención y cambios de contexto.

Verificar que el usuario entiende qué cambió, que la activación de Lentes responde a las reglas previstas y que la inspección no altera inesperadamente la cámara ni la organización del Territorio.

### Condiciones de evaluación

- Incluir participantes que no hayan desarrollado la gramática visual.
- Evitar explicar de antemano el significado de las marcas que se pretende evaluar.
- Separar la evidencia observada de la interpretación del investigador.
- Registrar las tareas, las condiciones del experimento y los criterios utilizados.
- Si la muestra es pequeña, describir los resultados como exploratorios y no como prueba estadística concluyente.
- Mantener una configuración en escala de grises para comprobar que el color no sea indispensable.
- No considerar una prueba técnica exitosa como evidencia suficiente de comprensión humana.

## 8. Métricas y criterios de éxito

Definir un protocolo medible antes de realizar las pruebas. Como mínimo, registrar:

- **Exactitud:** porcentaje de respuestas correctas en la identificación de la lectura y del estado.
- **Tiempo de descubrimiento:** cuánto tarda el usuario en localizar una condición relevante.
- **Atribución:** frecuencia con que asigna una marca a la Lente incorrecta.
- **Comprensión causal:** capacidad de explicar el fundamento de una conclusión mediante la Superficie.
- **Continuidad contextual:** capacidad de retomar la exploración global después de inspeccionar una Entidad.
- **Previsibilidad:** capacidad de anticipar qué ocurrirá al activar, apagar, señalar o abrir.
- **Errores críticos:** confusión entre ausencia de datos, ausencia de Anotaciones y ausencia de una condición.
- **Carga percibida:** dificultad declarada por los participantes, acompañada de evidencia de las tareas.

No inventar umbrales de aprobación retrospectivamente. Proponer valores iniciales, justificar su utilidad y acordarlos antes de validar la solución.

## 9. Entregables obligatorios

### D1. Informe de investigación

Un documento que incluya:

- Estado actual de la documentación.
- Distinción conceptual entre Lente, Foco y Hover.
- Preguntas respondidas y pendientes.
- Evidencia, contradicciones y riesgos.
- Comparación de alternativas.
- Recomendación fundamentada.
- Grado de confianza de cada conclusión.

### D2. Modelo de interacción

Un esquema preciso de estados y transiciones que describa:

- Lentes inactivas y activas.
- Lentes activas sin datos.
- Lentes activas no visibles por el límite.
- Entidades señaladas.
- Indicaciones transitorias.
- Superficies abiertas.
- Llegada de Atención.
- Combinación de lecturas.
- Activación, desactivación y recuperación del contexto.

Cada transición debe especificar su disparador, su resultado observable y qué elementos permanecen inalterados.

### D3. Prototipo comparativo

Prototipos que permitan comparar las alternativas A–D en las tareas prioritarias. Reutilizar la escena gris existente cuando sea técnicamente apropiado, sin modificar el artefacto original sin autorización.

### D4. Matriz de decisiones

Para cada decisión relevante, registrar:

- Identificador.
- Pregunta que resuelve.
- Estado actual.
- Alternativas consideradas.
- Evidencia a favor y en contra.
- Impacto arquitectónico y perceptual.
- Riesgo de no resolverla.
- Responsable y próximo paso.
- Criterio de cierre.

Distinguir entre hechos documentados, restricciones normativas, hipótesis, resultados de pruebas y decisiones aprobadas.

### D5. Recomendación para el equipo

Un documento ejecutivo breve que indique:

1. Qué recomendamos.
2. Por qué.
3. Qué evidencia respalda la recomendación.
4. Qué sigue sin saberse.
5. Qué decisión necesita aprobación.
6. Qué debe implementarse primero.
7. Qué debe permanecer sin cambios hasta completar la investigación.

## 10. Protocolo de trabajo y protección de la documentación

1. Inspeccionar los documentos y la implementación existentes antes de editar.
2. Identificar la fuente de verdad vigente para cada regla.
3. Crear los entregables de investigación como documentos separados o propuestas de cambio revisables.
4. No sobrescribir normas, Experience Model ni artefactos originales como consecuencia de una hipótesis.
5. No convertir una recomendación en una decisión aprobada sin autorización.
6. No modificar simultáneamente una misma fuente de verdad desde tareas de investigación concurrentes.
7. Si una decisión afecta a otra sección normativa, registrar la dependencia y esperar la resolución correspondiente.
8. Mantener trazabilidad entre hallazgos, experimentos, decisiones y requisitos.
9. Informar qué se inspeccionó, qué se modificó, qué no se pudo verificar y dónde se encuentran los resultados.
10. No declarar que una interacción está validada hasta disponer de evidencia humana suficiente para la afirmación realizada.

## 11. Orden de ejecución

**Fase 1 — Comprender.** Revisar la documentación vigente, extraer restricciones y construir el mapa de preguntas abiertas.

**Fase 2 — Modelar.** Definir operacionalmente Lente, Foco y Hover. Dibujar estados y transiciones sin comprometer todavía la solución visual.

**Fase 3 — Comparar.** Construir las alternativas y seleccionar las tareas que mejor permitan diferenciarlas.

**Fase 4 — Probar.** Ejecutar experimentos con participantes, registrar resultados y contrastar las hipótesis.

**Fase 5 — Recomendar.** Presentar la alternativa preferida, las razones, las limitaciones y las decisiones que requieren aprobación.

**Fase 6 — Transferir.** Traducir los resultados aprobados en requisitos para Interaction Grammar, Experience Model y diseño visual, preservando la trazabilidad normativa.

No avanzar directamente desde la discusión terminológica a una implementación definitiva. El resultado de cada fase debe ser revisable y suficiente para decidir si se puede avanzar.

## 12. Condición de finalización

La investigación no se considera terminada por haber encontrado un nombre atractivo o construido una demostración funcional.

Se considera lista para una decisión de producto cuando:

- Las responsabilidades de Lente, Foco y Hover están definidas sin ambigüedades relevantes.
- Las alternativas principales se han comparado mediante tareas representativas.
- Se conoce qué información debe permanecer visible y cuál puede ser contextual.
- Se ha evaluado la combinación de lecturas sin depender exclusivamente del color.
- Las interacciones no violan las restricciones del Territorio ni las reglas de control del usuario.
- Los riesgos, las limitaciones y las preguntas pendientes están documentados.
- Existe una recomendación trazable a la evidencia y una lista concreta de decisiones para aprobación.

**Resultado esperado:** una especificación de interacción de Orrery que permita explorar estructuras complejas, detectar patrones relevantes e inspeccionar evidencia con precisión, sin sobrecargar la percepción ni debilitar la integridad del modelo de información.

---

## Instrucción final al equipo

No partan de la premisa de que Lente, Foco y Hover deben convertirse necesariamente en tres conceptos independientes. Tampoco asuman que uno debe reemplazar a los otros.

Investigen qué responsabilidades necesita realmente la experiencia, cuáles son conceptuales, cuáles pertenecen a la arquitectura y cuáles son meros mecanismos de interacción.

La calidad de la solución debe medirse por la capacidad de las personas para comprender el Territorio, reconocer patrones, identificar sus fundamentos y actuar con confianza, no por la cantidad de conceptos o elementos visuales que la interfaz incorpore.