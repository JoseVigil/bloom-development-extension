# ENCARGO — ORRERY MORPHOLOGICAL / SPATIAL LANGUAGE RESEARCH v0.1

## 0. Párrafo disparador — por qué existe esta investigación

La consolidación conceptual de Orrery está cerrada. Después de establecer su Vocabulario, Constitución, Decisiones Arquitectónicas y Experience Model, sabemos con suficiente precisión qué debe poder hacerse perceptible en Orrery, qué actos humanos deben distinguirse y qué cosas la representación nunca puede falsear. El siguiente problema no es todavía diseñar Orrery, sino determinar **qué lenguaje morfológico y espacial puede soportar todo eso sin colapsar cuando aumente la información**. Esta investigación nace de una observación concreta de José durante su propia exploración visual: tres referencias encontradas en una explicación de Transformers (`orrery_sample_1.png`, `orrery_sample_2.png`, `orrery_sample_3.png`) demostraron que una abstracción compleja puede adquirir profundidad, estructura y capacidad explicativa mediante muy pocas primitivas —puntos, líneas, curvas, planos, transparencias, guías, escala, perspectiva, énfasis y movimiento— sin necesidad de convertirse en un mundo físico ni en una metáfora tridimensional literal. En contraste, una exploración anterior de Orrery (`wrong_not_wanted.png`) produjo exactamente el resultado que debe evitarse: pisos jerárquicos, nebulosas, blobs, glow y una estética de “universo” con abundante tridimensionalidad pero poca ganancia equivalente de comprensión. **El contraste entre espacialidad que explica y espacialidad que decora es el disparador de este research.** No se busca copiar las referencias positivas ni simplemente rechazar la negativa: se busca descubrir qué propiedades hacen que una abstracción se vuelva espacialmente inteligible y cuáles producen complejidad visual sin información suficiente. Esto es especialmente crítico porque Orrery deberá absorber progresivamente Territory, Entities, Relations, Work, Lenses, Annotations, Focus, Anchor, Attention, Gravity, Procedencia, cobertura, ejecución y grandes densidades de información. Si las primitivas y su gramática nacen mal, esa complejidad será posteriormente muy difícil de incorporar. Si nacen correctamente, podrán constituir el lenguaje sobre el cual ese universo crezca.

## 1. Propósito

Abrir una investigación específica, anterior a **Visual Architecture / Visual Experience v0.1**, destinada a determinar las propiedades que debe poseer el lenguaje morfológico, espacial y perceptual de Orrery.

La pregunta central es:

> **¿Cuál es el lenguaje espacial mínimo capaz de transformar una gran cantidad de abstracción técnica en un espacio tridimensional comprensible, navegable, interrogable y escalable, sin convertir complejidad en decoración?**

Este trabajo **no diseña todavía Orrery**.

No asigna formas definitivas a los objetos de Cognituum. No produce una escena final. No establece un design system. Su objetivo es construir los criterios con los que posteriormente podremos juzgar y diseñar esas cosas.

La investigación debe considerar desde el comienzo tres propiedades inseparables:

> **claridad local + capacidad compositiva + comportamiento bajo densidad.**

Una solución que funciona con diez elementos y colapsa con cien no constituye un lenguaje adecuado para Orrery.

---

## 2. Corpus autorizado y jerarquía de autoridad

El Cowork tiene autorización para **leer íntegramente la carpeta de Orrery**:

`docs/ANALYSIS/ORRERY/`

y su equivalente disponible en el Project.

Esto incluye documentos normativos vigentes, Experience, investigaciones, auditorías, antecedentes UI/UX, drafts, documentos reemplazados y material histórico que permita comprender cómo se llegó al estado actual.

La autorización de lectura de toda la carpeta **no iguala la autoridad de sus documentos**.

Debe utilizarse esta jerarquía:

**Vocabulario / Constitución / Decisiones Arquitectónicas vigentes**  
→ **Experience Model vigente**  
→ **Estado Base como índice del estado actual**  
→ **evidencia aplicada y research vigente**  
→ **antecedentes históricos, drafts y documentos reemplazados**

El `Orrery_Estado_Base_v1_0.md` es un índice y no reemplaza la autoridad de los documentos normativos.

Ante una contradicción, un documento histórico o de menor autoridad **no debe reconciliarse silenciosamente** con uno superior. Debe registrarse como antecedente, conflicto histórico, hipótesis anterior o decisión reemplazada cuando resulte relevante.

La carpeta completa debe permitir comprender **cómo llegamos hasta aquí**, no reabrir decisiones conceptuales ya cerradas.

Como mínimo, antes de investigar morfología, deben leerse completos y en su versión vigente:

- `Orrery_Estado_Base_v1_0.md`
- `Orrery_Vocabulario_Normativo_v1_1.md`
- `Orrery_Constitucion_v1_1.md`
- `Orrery_Decisiones_Arquitectonicas_v1_1.md`
- `EXPERIENCE/Orrery_Experience_Model_v1_0.md`
- `EXPERIENCE/Orrery_Experience_Model_Escenarios_Trabajo_Activo_v0_1.md`

No modificar ninguno de ellos.

---

## 3. Corpus visual primario aportado por José

Las cuatro imágenes siguientes **forman parte explícita del corpus de esta investigación** y deben ser inspeccionadas directamente por el Cowork:

`/srv/share/SUNDAY/ORRERY_SAMPLES/orrery_sample_1.png`  
`/srv/share/SUNDAY/ORRERY_SAMPLES/orrery_sample_2.png`  
`/srv/share/SUNDAY/ORRERY_SAMPLES/orrery_sample_3.png`  
`/srv/share/SUNDAY/ORRERY_SAMPLES/wrong_not_wanted.png`

No son inspiración genérica ni decoración del encargo. Constituyen evidencia visual que originó la pregunta de investigación.

### 3.1 Referencias positivas

`orrery_sample_1.png`  
`orrery_sample_2.png`  
`orrery_sample_3.png`

Son tres frames de una explicación visual de Transformers seleccionados por José porque muestran una cualidad especialmente relevante para Orrery: **una abstracción compleja se vuelve espacial, referenciada y comprensible utilizando un vocabulario morfológico relativamente pequeño.**

Investigar, entre otras propiedades que puedan descubrirse:

- puntos;
- líneas;
- curvas;
- trayectorias;
- líneas punteadas;
- líneas auxiliares;
- planos;
- transparencias;
- intersecciones;
- escala;
- perspectiva;
- profundidad;
- foreground/background;
- agrupamiento;
- separación;
- énfasis localizado;
- persistencia del contexto;
- relaciones entre elementos;
- referencias espaciales;
- movimiento implícito o explícito;
- convivencia entre representación espacial e información convencional precisa.

Es particularmente importante estudiar cómo consiguen **tridimensionalidad sin construir un escenario físico**. No necesitan piso, edificio, habitaciones ni paisaje. La espacialidad emerge de la propia organización de la información.

También debe distinguirse cuidadosamente **lenguaje morfológico** de **estilo gráfico**.

Fondo oscuro, cyan, violeta, naranja, glow, tipografía y tratamiento visual pueden analizarse, pero no deben confundirse con las propiedades estructurales que hacen inteligible la representación.

Las imágenes positivas **no son un target visual de Orrery**.

No hacer “Orrery parecido a esto”.

### 3.2 Referencia negativa

`wrong_not_wanted.png`

Esta imagen proviene de una exploración previa intentando materializar una “Arquitectura Volumétrica” de Orrery cuando todavía no existía suficiente fundamento conceptual.

Debe considerarse **evidencia negativa de diseño**.

No debe descartarse porque resulte estéticamente menos satisfactoria. Debe investigarse por qué el resultado produjo una gran cantidad de tridimensionalidad sin un incremento equivalente de comprensión.

Analizar particularmente:

- jerarquía conceptual convertida literalmente en altura;
- pisos o estratos apilados;
- nebulosas como contenedores;
- blobs repetidos;
- volumen sin suficiente información;
- glow indiscriminado;
- dependencia del color;
- conexiones ornamentales;
- repetición morfológica;
- profundidad decorativa;
- metáfora de “universo”;
- pérdida potencial de identidad al aumentar densidad;
- dificultad para distinguir estructura de ambientación.

La pregunta no es:

> **¿Cómo hacemos algo más lindo que esto?**

La pregunta es:

> **¿Por qué esta representación utiliza mucho espacio tridimensional pero comunica comparativamente poca estructura útil, y qué podemos aprender de ese resultado antes de definir las primitivas de Orrery?**

No prohibir automáticamente ninguna primitiva porque aparezca en esta referencia. Identificar **qué propiedad, combinación o utilización produjo el problema**.

---

## 4. Regla metodológica para las referencias

Toda conclusión extraída de las cuatro imágenes debe separar explícitamente:

**Qué observamos**  
→ **Qué propiedad morfológica revela**  
→ **Qué capacidad expresiva demuestra**  
→ **Qué problema podría ayudar a resolver en Orrery**  
→ **Qué riesgo introduce**  
→ **Qué sucede bajo densidad**  
→ **Qué NO autoriza a concluir**

Ejemplo metodológico:

> Un plano translúcido permite establecer extensión, copresencia y profundidad conservando parcialmente la visibilidad de elementos posteriores.
>
> Puede ser útil cuando una representación necesita expresar una referencia espacial común.
>
> Bajo densidad puede introducir solapamiento, blending ambiguo y pérdida de separación.
>
> **No autoriza a concluir que Project, Domain o ninguna otra Entity deba representarse mediante un plano.**

Esta última columna es obligatoria durante toda la investigación.

---

## 5. Investigación de primitivas espaciales

Investigar sistemáticamente la capacidad expresiva y las limitaciones de, al menos:

**punto · línea · curva · trayectoria · plano · superficie · volumen · envolvente · transparencia · distancia · escala · profundidad · intersección · contención · orientación · guía auxiliar · texto espacial · movimiento**

La lista puede ampliarse si aparecen primitivas relevantes durante el research.

Para cada una investigar:

- qué puede comunicar sin explicación textual;
- qué depende del contexto;
- cómo se combina con otras;
- qué ambigüedades introduce;
- qué ocurre cuando se repite;
- qué ocurre cuando se superpone;
- cómo responde a profundidad y perspectiva;
- cómo conserva identidad;
- cómo puede ser interrogada;
- qué sucede cuando la escena aumenta fuertemente de densidad.

En esta etapa está explícitamente prohibido concluir:

`Domain = plano`  
`Gene = punto`  
`Project = volumen`  
`Relation = arco`

o cualquier asignación equivalente.

Todavía estamos investigando **capacidades expresivas**, no construyendo el diccionario visual de Cognituum.

---

## 6. Investigación de gramática espacial

Una primitiva aislada no constituye un lenguaje.

Investigar cómo combinaciones de primitivas producen:

- pertenencia;
- separación;
- continuidad;
- agrupamiento;
- proximidad;
- contención;
- extensión;
- dirección;
- conexión;
- jerarquía perceptual;
- foreground/background;
- oclusión;
- densidad;
- prominencia;
- persistencia del contexto;
- orientación;
- navegación.

Distinguir rigurosamente:

**estructura conceptual**  
de  
**estructura perceptual**.

La jerarquía de un sistema no obliga a representarlo mediante altura, niveles, pisos o tamaños jerárquicos.

La gramática espacial debe permitir que la representación ayude a comprender el sistema sin convertirse en una segunda ontología.

---

## 7. Profundidad: informativa frente a decorativa

Este research debe estudiar explícitamente **para qué existe la tercera dimensión**.

No asumir que un objeto debe ocupar profundidad simplemente porque Orrery utiliza un motor 3D.

Investigar cuándo profundidad, distancia, perspectiva, oclusión y cambio de punto de vista:

- aportan información;
- permiten descubrir relaciones;
- conservan contexto;
- expresan extensión;
- permiten navegación;
- ayudan a distinguir densidad;

y cuándo solamente:

- agregan espectacularidad;
- dificultan lectura;
- producen oclusión innecesaria;
- introducen movimiento sin significado;
- convierten estructura abstracta en escenografía.

Una pregunta central del research debe ser:

> **¿Qué información puede comunicar Orrery gracias a ser tridimensional que sería sustancialmente más difícil de comprender en una representación plana?**

---

## 8. Interacción como revelación progresiva

Investigar específicamente la progresión ya establecida por el Experience Model:

**percepción → indicación/hover → Focus → Anchor**

No modificar su semántica.

En particular, investigar la **indicación/hover** como posible mecanismo mediante el cual una geometría tridimensional revela que existe allí una Entity interrogable.

Para cada transición estudiar:

- qué puede cambiar perceptualmente;
- qué debe permanecer estable;
- cuánto contexto debe conservarse;
- cómo evitar que prominencia equivalga a cambio de significado;
- cómo distinguir una respuesta interactiva de una modificación del sistema;
- cómo operar con geometrías pequeñas, superpuestas u ocluidas;
- qué sucede en alta densidad.

Hover no debe convertirse silenciosamente en Focus.

Focus no debe convertirse silenciosamente en Anchor.

Anchor requiere el acto deliberado ya definido por la norma.

No diseñar todavía la Interaction Grammar definitiva.

---

## 9. Densidad y escalabilidad perceptual

Este eje es **obligatorio y de primera clase**.

Orrery no debe diseñarse como una demostración con pocos objetos.

Para cada familia de primitivas y cada propiedad espacial relevante estudiar su comportamiento en cuatro condiciones conceptuales:

**escaso → medio → denso → extremadamente denso**

Investigar:

- clutter;
- oclusión;
- superposición;
- pérdida de identidad;
- pérdida de relaciones;
- saturación cromática;
- saturación de movimiento;
- reducción de escala;
- profundidad excesiva;
- agregación;
- niveles de detalle;
- continuidad durante zoom;
- aparición/desaparición;
- selección;
- picking;
- navegación;
- preservación del contexto;
- posibilidad de volver a encontrar una Entity;
- transición entre representación espacial y explicación precisa.

No asumir que “mostrar todo” es deseable.

Investigar especialmente **cómo puede degradarse la representación sin degradarse la verdad**.

Debe identificarse cuándo el Espacio ya no debería intentar mostrar detalle y una **Superficie de Workspace Core** debería asumir la explicación precisa.

---

## 10. PlayCanvas como condición material

Orrery vivirá sobre **PlayCanvas** y será un espacio tridimensional interactivo en tiempo real.

Por lo tanto, la investigación no puede razonar como si estuviera diseñando:

- concept art;
- una animación renderizada;
- una pieza cinematográfica;
- una infografía estática;
- una escena con cámara predeterminada.

Contrastar las hipótesis morfológicas con capacidades y restricciones relevantes del medio real, incluyendo cuando corresponda:

- cámara y navegación;
- perspectiva;
- picking;
- raycasting;
- profundidad;
- transparencias;
- geometría;
- líneas;
- curvas;
- instancing;
- labels;
- partículas;
- shaders;
- iluminación;
- post-processing;
- movimiento;
- interacción;
- rendimiento;
- grandes cantidades de elementos;
- respuesta visual en tiempo real.

Este contraste **no autoriza implementación** ni selección prematura de técnicas.

Su objetivo es impedir que construyamos un lenguaje cuya capacidad expresiva dependa posteriormente de recursos impropios o inviables para el medio donde debe existir.

---

## 11. Contraste con Orrery

Solo después de estudiar primitivas, gramática, interacción y densidad, confrontar los hallazgos con aquello que Orrery necesita hacer perceptible.

No asignar todavía formas.

Preguntar qué propiedades necesitaría una futura representación para hacer perceptible:

- Territory;
- Entity;
- Relation;
- Context;
- Focus;
- Anchor;
- Work;
- Lens;
- Annotation;
- Procedencia;
- Attention;
- Gravity;
- cobertura;
- `none` frente a `unknown`;
- colisión confirmada;
- colisión indecidible;
- Work activo;
- cambios y estados relevantes del Experience Model.

Preguntas obligatorias:

- ¿Qué necesita una Entity para conservar identidad espacialmente?
- ¿Qué necesita una Relation para seguir siendo distinguible bajo densidad?
- ¿Cómo puede Work hacerse perceptible sin convertirse en Territory?
- ¿Cómo puede una Annotation permanecer subordinada a la Entity que referencia?
- ¿Cómo puede una Lens alterar percepción sin alterar estructura?
- ¿Cómo puede conservarse Procedencia?
- ¿Cómo distinguir perceptualmente Focus y Anchor?
- ¿Cómo puede Gravity hacerse perceptible sin convertirse en geometría territorial?
- ¿Cómo impedir que `unknown` parezca `none`?
- ¿Cómo preservar contexto cuando algo adquiere prominencia?
- ¿Cómo puede un sistema denso seguir siendo navegable e interrogable?

El resultado buscado aquí es **compatibilidad expresiva**, no diseño.

---

## 12. Relación Space ↔ Surface

Las referencias positivas contienen además un fenómeno relevante: una representación espacial puede convivir con una superficie convencional de información precisa sin que ambas intenten cumplir la misma función.

Investigar esta propiedad a la luz de la distinción normativa de Orrery entre **Space y Workspace Core Surfaces**.

No concluir que Orrery debe reproducir la disposición de las referencias ni colocar código debajo de la escena.

Investigar en cambio:

> **qué información puede comprenderse espacialmente y en qué punto la precisión debe transferirse a una Surface sin destruir la continuidad perceptual con el Space.**

Esta frontera será especialmente importante bajo densidad.

---

## 13. Anti-patrones morfológicos

Construir una clasificación explícita de anti-patrones encontrados tanto en la referencia negativa como durante la investigación.

No formularlos como prohibiciones estéticas.

Formularlos como fallas informativas o perceptuales.

Como mínimo investigar:

- profundidad sin información;
- volumen sin semántica;
- contención ambigua;
- jerarquía = altura por defecto;
- nebulosa/blob como sustituto de estructura;
- glow indiscriminado;
- color como única codificación;
- exceso de conexiones;
- conexión ornamental;
- repetición morfológica;
- movimiento sin significado;
- oclusión sin ganancia;
- espectacularidad que compite con lectura;
- desaparición del contexto al enfocar;
- representaciones que funcionan únicamente con pocos elementos.

---

## 14. Antiobjetivos del encargo

Este trabajo **NO debe producir**:

- mockups finales de Orrery;
- concept art de Orrery;
- una escena final;
- una morfología definitiva;
- una paleta definitiva;
- un design system;
- iconografía definitiva;
- asignaciones Entity→forma;
- asignaciones Domain→forma;
- asignaciones Gene→forma;
- arquitectura definitiva de escena;
- Interaction Grammar;
- vertical slices;
- cambios de contratos;
- cambios de código;
- modificaciones de documentos normativos.

Y especialmente:

> **No hacer Orrery parecido a las referencias positivas.**

y

> **No hacer simplemente “lo contrario” de `wrong_not_wanted.png`.**

Ambos serían atajos.

---

## 15. Entregable

Producir para revisión:

`docs/ANALYSIS/ORRERY/VISUAL/Orrery_Morphological_Spatial_Language_Research_v0_1.md`

y su copia correspondiente en el Project.

El documento debe contener como mínimo:

1. corpus efectivamente leído;
2. método de investigación;
3. análisis individual y comparado de las tres referencias positivas;
4. análisis de `wrong_not_wanted.png`;
5. taxonomía de primitivas;
6. capacidades y límites de cada familia;
7. gramática espacial;
8. profundidad informativa vs. decorativa;
9. interacción y revelación progresiva;
10. comportamiento bajo densidad;
11. restricciones y oportunidades relevantes de PlayCanvas;
12. relación Space ↔ Surface;
13. contraste con los fenómenos del Experience Model;
14. anti-patrones;
15. matriz **“demuestra / no autoriza”**;
16. contradicciones encontradas;
17. preguntas que todavía no pueden responderse;
18. criterios resultantes para evaluar futuras propuestas morfológicas;
19. recomendaciones concretas para el posterior encargo **Orrery Visual Architecture / Visual Experience v0.1**.

El documento puede incluir diagramas analíticos si son necesarios para explicar una propiedad, pero **no debe convertir esos diagramas en propuestas de diseño de Orrery**.

---

## 16. Criterio de éxito

El éxito de esta investigación no consiste en salir sabiendo cómo se verá Orrery.

Consiste en poder recibir posteriormente una propuesta morfológica y responder rigurosamente:

- qué comunica;
- por qué utiliza esa primitiva;
- qué fenómeno hace perceptible;
- qué ambigüedad introduce;
- cómo convive con las demás;
- qué ocurre al aumentar la densidad;
- cómo responde a interacción;
- qué información aporta la tercera dimensión;
- qué debe trasladarse a una Surface;
- y si la representación **explica el sistema o simplemente parece sofisticada**.

El resultado buscado es un lenguaje capaz de crecer.

> **Cuanto más sólida sea la gramática de primitivas, mayor será la cantidad y diversidad de información que Orrery podrá absorber posteriormente sin perder inteligibilidad.**

---

## 17. Condición de detención y autorización

Este encargo autoriza **investigación y lectura**, no implementación.

Antes de escribir cualquier archivo, el Cowork debe devolver exclusivamente:

1. el corpus exacto que propone leer dentro de `docs/ANALYSIS/ORRERY/` y del Project;
2. confirmación de acceso e inspección de las cuatro imágenes en `/srv/share/SUNDAY/ORRERY_SAMPLES/`;
3. cualquier material adicional que considere necesario consultar y por qué;
4. el archivo exacto que propone crear;
5. cualquier archivo existente que considere necesario modificar —por defecto, ninguno—;
6. el método concreto con el que realizará el research;
7. contradicciones, ambigüedades o impedimentos que detecte antes de comenzar.

**Esperar autorización de José antes de escribir.**

No modificar código.  
No modificar contratos.  
No modificar documentos normativos.  
No avanzar a Visual Architecture.  
No diseñar Orrery.
