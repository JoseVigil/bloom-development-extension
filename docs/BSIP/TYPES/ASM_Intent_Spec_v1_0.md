# ASM — Especificación Técnica del Intent ASM

**Versión:** 1.0
**Estado:** Contrato de consumo derivado del research v0.1; definiciones físicas pendientes, integración no verificada.
**Depende de:** [ASM_Location_Research_v0_1.md](../../ANALYSIS/BSIP/ASM/ASM_Location_Research_v0_1.md) como única fuente del contenido específico de ASM; [BLOOM_BISP_Documento_Unico_v2_0.md](../BLOOM_BISP_Documento_Unico_v2_0.md) como referencia del protocolo común ya citado por el research.

---

## Nota de naturaleza de este documento

Esta especificación formaliza los requisitos de consumo respaldados por el research v0.1. No afirma que estén implementados. Los supuestos y las interfaces pendientes de esa fuente no se convierten en contratos físicos cerrados.

En las referencias internas, **R §4, punto N** significa la subsección N del checklist de [ASM_Location_Research_v0_1.md](../../ANALYSIS/BSIP/ASM/ASM_Location_Research_v0_1.md); **R §N** designa una sección principal de ese mismo archivo. Toda regla específica se acompaña de su origen.

Se distinguen **semantic_contract**, significado y requisitos de consumo, y **availability_profile**, evidencia de disponibilidad. La presencia de un campo o referencia no acredita que exista contenido recuperable. Esta distinción se conserva en validaciones, salida y metadatos. [R §1–3]

Los títulos de estado, directorios y fases reservan los apartados de la especificación; no asignan nombres físicos ni declaran una máquina de estados de ASM. Las denominaciones en lenguaje natural de las tablas describen información contractual, no claves JSON nuevas.

---

## 0. Resumen ejecutivo

ASM consume Location para validar el punto de partida, detectar faltantes, solicitar contexto, jerarquizar evidencia, ensamblar un análisis y preparar una propuesta trazable de Postulate. Location, producido por Already como contrato candidato versionado, expresa desde dónde decidió actuar el humano; no expresa por sí solo el objetivo del trabajo. [R §1; R §4, puntos 1 y 12]

**Reglas de contrato:**

1. ASM debe preservar Location recibido y registrar separadamente sus observaciones de consumo. [R §4, puntos 7 y 10]
2. ASM no debe inventar el objetivo a partir del foco ni fabricar identidad o versión de captura. [R §4, punto 1]
3. ASM debe evaluar suficiencia por conclusión y referencia dependiente; no debe convertir la captura completa en un único estado global de resolución. [R §4, punto 5; R §5]
4. El contenido que sostiene una conclusión debe estar recuperado o contar con evidencia suficiente, revisión y procedencia. Una URI o un vector aislado no bastan. [R §4, punto 3]
5. El ensamblado debe utilizar el mecanismo común de Intents y conservar trazabilidad de inclusiones y exclusiones. [R §4, punto 9]
6. El resultado de análisis precede a la propuesta y no aprueba ni ejecuta nada. [R §4, punto 11]

**availability_profile:** R §1 y §3 no verifican un productor Already ni un consumidor ASM conectados. El presente contrato no transforma esa ausencia de verificación en una afirmación de disponibilidad.

---

## 1. Estructura de estado

PENDIENTE — no definido aún en ASM_Location_Research_v0_1.md

---

## 2. Estructura de directorios de ASM

PENDIENTE — no definido aún en ASM_Location_Research_v0_1.md

---

## 3. Fases

PENDIENTE — no definido aún en ASM_Location_Research_v0_1.md

---

## 4. Ciclo de vida, paso a paso

Los pasos siguientes son el recorrido de consumo definido en R §6. No fijan fases persistidas, turnos, campos de commit, reanudación ni transiciones de una máquina de estados.

| Paso | Obligación de consumo — semantic_contract | Evidencia para avanzar — availability_profile | Origen |
|---|---|---|---|
| Location | Preservar la captura y asociar el pedido sin deducirlo del foco. | Entrada y metadatos mínimos efectivamente presentes. | R §6 |
| Validación | Interpretar versión, delimitar alcance e identificar dependencias. | Comprobaciones registradas e impedimentos explícitos. | R §6 |
| Adquisición | Pedir contenido justificado sin mutar Location. | Fuente autorizada, contenido y revisión obtenidos, o faltante declarado. | R §6 |
| Jerarquización | Priorizar evidencia necesaria y luego contexto útil, preservando contradicciones. | Inventario de contenido real y cobertura del objetivo. | R §6 |
| Ensamblado | Entregar plan y texto al mecanismo común, conservando provenance. | Correspondencia entre plan e inclusiones efectivas del payload. | R §6 |
| Propuesta | Preparar Postulate solo con suficiencia declarada y límites visibles. | Resultado de análisis sin bloqueos críticos; interfaz de entrega aún pendiente. | R §6 |

Si una adquisición cambia el contexto, ASM debe volver a validar las conclusiones dependientes y el orden del plan. Antes de proponer, debe revalidar la evidencia cuya vigencia sea necesaria. Las nuevas observaciones no corrigen retroactivamente la captura. [R §6]

### 4.1 Formato de entrada — contenido de consumo

La entrada comprende Location y el pedido asociado en los términos de R §4, puntos 1–3. Se especifica qué información consume ASM; no se redefine la representación de Location.

| Campo o información consumida | Condición de obligatoriedad | Regla de consumo | Origen |
|---|---|---|---|
| `contract_version` | Obligatoria para ensamblar. | Debe ser interpretable; refiere a las reglas de captura, no a la revisión del recurso. | R §2; R §4, puntos 1–2 |
| `location_id` | Obligatoria como identidad/correlación de captura para ensamblar. | No identifica el recurso enfocado; ASM no la fabrica. | R §2; R §4, puntos 1–2 |
| Foco principal | Obligatorio e inequívoco para ensamblar. | Expresa el punto de partida humano; puede contener una referencia que requiera resolución. | R §2; R §4, puntos 1–3 |
| Alcance y atribución mínima del foco | Obligatorios para ensamblar. | Deben delimitar el consumo y distinguir el origen del aporte. | R §4, puntos 1–2 |
| Organization y Project | Obligatorios cuando determinan identidad, acceso o alcance del recurso. | No sustituyen identidad verificable ni prueban permiso de acceso. | R §2; R §4, punto 2 |
| Objetivo y restricciones del pedido asociado | Necesarios para orientar el trabajo; no se deducen de Location. | Sin objetivo ASM puede evaluar resolubilidad, pero no jerarquizar según una intención inventada. La provisión externa conserva el supuesto de origen S1. | R §4, puntos 1 y 3; R §9 |
| Anchors explícitos adicionales | Opcionales mientras ninguna conclusión dependa de ellos. | Selección humana no equivale a disponibilidad o vigencia. | R §2; R §4, punto 2 |
| Relaciones señaladas o constitutivas | Opcionales mientras ninguna conclusión dependa de ellas. | Distinguir vínculos señalados por el humano de aportes estructurales; conservar extremos, origen y evidencia. | R §2; R §4, puntos 2 y 4 |
| Contexto estructural referenciado | Opcional; expandible dentro del alcance permitido. | Es una pista de recuperación, no contenido adquirido ni permiso para recorrer todo el entorno. | R §2; R §4, punto 2 |
| Evidencia y versiones de captura | Evidencia de revisión obligatoria para afirmar vigencia. | Comparar captura y observación; una fecha sola no prueba igualdad de contenido. | R §2; R §4, punto 2 |
| Estado por referencia | Conservar el estado recibido y registrar aparte la observación de ASM. | Aplicar la interpretación y degradación de §5.2 de este spec. | R §2; R §4, puntos 3–5 |
| `provenance` | Conservar atribución conocida y declarar faltantes. | Distinguir aporte humano, estructural e inferencia; no equivale a certeza. | R §2; R §4, punto 10 |

Una referencia opcional pasa a ser necesaria para una conclusión cuando esta depende de ella. La criticidad deriva de esa dependencia, no del nombre del campo. [R §4, punto 2]

**Por valor:** versión, correlación, declaración de foco, objetivo asociado, restricciones, estados recibidos y atribución conocida. El foco puede contener una referencia sin incrustar el recurso completo. [R §4, punto 3]

**Por referencia:** archivos, documentación, entidades estructurales, antecedentes y evidencia extensa pueden recibirse así cuando alcance y mecanismo de resolución sean verificables. Antes de fundamentar una conclusión, se exige contenido pertinente recuperado o evidencia suficiente de ese contenido, con revisión y procedencia. [R §4, punto 3]

**availability_profile:** el mínimo exigido no está demostrado como garantía del productor; no se presume resolución universal de las referencias. [R §3; R §4, puntos 1–3]

#### Serialización de entrada

PENDIENTE — no definido aún en ASM_Location_Research_v0_1.md

### 4.2 Condiciones de validación

ASM debe realizar las siguientes comprobaciones en orden y registrar evidencia o imposibilidad de comprobarlas: [R §4, punto 4]

1. Interpretabilidad de versión y presencia del mínimo de consumo.
2. Identidad/correlación de captura y coherencia del foco y alcance.
3. Referencias interpretables, estados admitidos y extremos identificables de relaciones.
4. Atribución humana/estructural; marcar lo desconocido sin reasignarlo.
5. Autorización efectiva antes de recuperar contenido.
6. Resolución y revisión observadas frente a evidencia de captura, conservando ambas.
7. Contradicciones, dependencias críticas y suficiencia para el objetivo.
8. Adecuación del contenido seleccionado y presupuesto antes del ensamblado.

`resolved` recibido no sustituye la comprobación de permiso, vigencia y contenido. Si falta versión o identidad, ASM puede diagnosticar, pero no presentar el consumo como trazable válido. [R §4, puntos 1 y 4]

### 4.3 Adquisición y expansión

ASM debe formular la solicitud de adquisición separada de Location y vinculada a su identidad. Debe expresar referencia o pregunta faltante, motivo, conclusión dependiente, criticidad, alcance permitido, evidencia esperada y límites de búsqueda. La respuesta se incorpora al contexto de trabajo con origen y revisión propios. [R §4, punto 7]

| Contexto | Condición de recuperación | Origen |
|---|---|---|
| Domains y Genes | Identidad provista por fuente autorizada y relaciones verificables; no basta un nombre textual. | R §4, punto 8 |
| Archivos y documentación | Fuente localizable, permiso y revisión asociada al contenido; extractos con localizador. | R §4, punto 8 |
| Gravity | Evidencia pertinente con alcance y vigencia, sin sustituir sus decisiones por inferencia. | R §4, punto 8 |
| Antecedentes BISP | Recuperación mediada por Brain y verificación contra la fuente antes de reutilizar. | R §4, punto 8 |
| Otras relaciones | Justificación de su pertinencia para el objetivo y evidencia del vínculo y sus extremos. | R §4, punto 8 |

Cada ronda debe tener alcance, límite de tiempo/volumen/profundidad y condición de éxito. ASM debe detener la expansión al cubrir la necesidad, agotar el presupuesto o no obtener evidencia nueva. No debe repetir solicitudes indefinidamente ni ampliar Organization/Project por proximidad semántica. Los valores concretos del presupuesto siguen pendientes. [R §5]

Si el humano cambia el foco, debe quedar una decisión explícita y una nueva captura del productor vinculada a la anterior. ASM no debe corregir Location silenciosamente. [R §4, punto 7]

**availability_profile:** el research no verifica canal de adquisición ni resolvedores conectados para todas las entidades. Si no hay capacidad verificada, ASM debe devolver el requerimiento pendiente y no afirmar que despachó una solicitud operativa. [R §4, puntos 6–8]

#### Transporte y responsable de las solicitudes

PENDIENTE — no definido aún en ASM_Location_Research_v0_1.md

### 4.4 Formato de salida — resultado de análisis

ASM debe producir un resultado estructurado anterior a la propuesta, con los siguientes grupos de información. Los grupos no fijan claves serializadas, nombre de archivo ni API. [R §4, punto 11]

| Grupo | Contenido |
|---|---|
| Origen y objetivo | Correlación con Location, versión interpretada, objetivo asociado y alcance. |
| Validación | Resultado de cada comprobación, evidencia y bloqueos. |
| Contexto adquirido | Referencias originales, contenido o extractos pertinentes, revisiones, estados observados y provenance. |
| Selección | Orden y razón de inclusión, exclusiones, recortes y cobertura. |
| Síntesis | Hechos, inferencias, contradicciones y limitaciones diferenciadas. |
| Pendientes | Adquisiciones necesarias y decisiones humanas, con conclusiones dependientes. |
| Aptitud para propuesta | Preparado, preparado con límites o bloqueado, con justificación explícita. |

Los tres rótulos de aptitud no son estados de referencias de Location. “Preparado con límites” solo procede cuando los faltantes no invalidan el alcance declarado; no significa evidencia completa. El análisis precede a la propuesta y no aprueba ni ejecuta nada. [R §4, punto 11]

Si no se puede interpretar la versión, falta foco/objetivo inequívoco, el alcance es contradictorio, falta evidencia crítica, no se verifica autorización necesaria o un cambio invalida el punto de partida, ASM debe detener la preparación de la propuesta. El diagnóstico debe indicar conclusión bloqueada, evidencia faltante y respuesta necesaria para continuar; puede conservar trabajo independiente sin declarar preparado el conjunto. [R §4, punto 6]

ASM debe pedir intervención humana para elegir foco, confirmar reinterpretación o autorizar un alcance nuevo. Un problema técnico recuperable admite adquisición acotada sin convertirse automáticamente en decisión humana. [R §4, punto 6]

**availability_profile:** el research no verifica un productor real de este resultado ni su compatibilidad integral con el mecanismo común. [R §4, punto 11]

#### Serialización del resultado

PENDIENTE — no definido aún en ASM_Location_Research_v0_1.md

#### Formato de la propuesta de Postulate

PENDIENTE — no definido aún en ASM_Location_Research_v0_1.md

---

## 5. Contrato `.pipeline/` y degradación graceful

### 5.1 Mecanismo común de empaquetado

ASM debe entregar objetivo, restricciones y plan de contexto al mecanismo común de Intents. Debe priorizar evidencia indispensable para comprender el foco y evaluar restricciones, luego dependencias verificadas y finalmente antecedentes útiles. Cada selección debe incluir razón, fuente, revisión y conclusión que sostiene. La similitud no reemplaza evidencia obligatoria ni resuelve contradicciones. [R §4, punto 9]

El plan y el contenido materializado deben producir texto ordenado para el consumidor y conservar trazabilidad de inclusiones y exclusiones. El research remite a `context_plan.json` antes de `payload.json` y a la separación de metadatos/audiencias del BISP. ASM propone la selección sin asumir propiedad de la persistencia de esos artefactos. [R §4, punto 9]

**availability_profile:** el research registra que `PayloadBuilder` procesa `priority_tiers`, extrae contenido y puede omitir entradas cuando `_extract_file` devuelve `None`. La integración debe comprobar que ningún elemento indispensable desaparezca sin diagnóstico y verificar la correspondencia entre plan y payload. El research no demuestra preservación integral de provenance ni aceptación directa de todo el plan de ASM. [R §3; R §4, punto 9; R §6]

#### Distribución física por fase y turno

PENDIENTE — no definido aún en ASM_Location_Research_v0_1.md

### 5.2 Estados por referencia y degradación

**semantic_contract:** ASM debe interpretar cada estado respecto de la referencia y de la conclusión dependiente. No debe asignar un único estado global a la captura. [R §2; R §5]

| Estado recibido | Significado de consumo | Acción y condición de continuación | Condición de bloqueo | Origen |
|---|---|---|---|---|
| `resolved` | Resolución informada en la captura. | Comprobar acceso, contenido y vigencia; continuar con evidencia suficiente. | Falla una comprobación crítica aunque la captura declare resolución. | R §2 y §5 |
| `changed` | Diferencia constatada respecto de la captura. | Comparar revisiones y conservar ambas; continuar si el cambio comprendido no altera foco ni fundamento. | Afecta la decisión humana o no puede evaluarse. | R §2 y §5 |
| `stale` | Vigencia insuficiente sin afirmar cambio comprobado. | Refrescar o limitar a uso histórico explícito si la conclusión no depende de actualidad. | Se requiere evidencia actual y no se obtiene. | R §2 y §5 |
| `missing` | No encontrado en el alcance consultado. | Buscar de forma acotada y autorizada; omitir si es complemento sin dependencia crítica. | Recurso indispensable no recuperado. | R §2 y §5 |
| `unauthorized` | Acceso denegado. | Excluir contenido y registrar impedimento con metadatos permitidos; continuar solo trabajo independiente. | Evidencia indispensable inaccesible; no eludir el permiso. | R §2 y §5 |
| `ambiguous` | Más de una interpretación o destino posible. | Exponer alternativas permitidas y pedir desambiguación; continuar solo análisis independiente sin elegir por probabilidad. | Foco o relación necesaria sin resolver. | R §2 y §5 |
| `unsupported` | Referencia no interpretable o no resoluble por el consumidor. | Registrar capacidad faltante; omitir complemento o utilizar una fuente equivalente con equivalencia demostrada. | Pieza indispensable no interpretable. | R §2 y §5 |

**availability_profile:** un fallo de consulta no demuestra `missing`. ASM debe distinguir ausencia de contenido, servicio indisponible y permiso denegado, conservando el fallo de adquisición hasta poder clasificarlo. No debe reescribir el estado original por un fallo de servicio. “No verificado” describe el relevamiento de capacidades; no agrega un estado a Location. [R §3; R §4, punto 5; R §5]

### 5.3 Degradación graceful si Ollama no está disponible

La consulta vectorial debe permanecer mediada por Brain. Si no está disponible, ASM puede seleccionar evidencia explícita suficiente sin vectores; no debe inventar resultados semánticos ni omitir evidencia indispensable. El fallback textual solo es válido cuando la evidencia disponible permite sostener la conclusión. [R §4, punto 8; R §5]

**availability_profile:** el research no verifica dependencias, índices ni disponibilidad de Ollama en ejecución para ASM. [R §3]

---

## 6. Lo que ASM no gestiona

- ASM no produce revisiones de Location: consume la captura y mantiene sus observaciones separadas. [R §4, puntos 7 y 12]
- ASM no convierte sus inferencias en selecciones humanas ni asume disponibilidad por mera mención de entidades. [R §1–3; R §4, punto 10]
- ASM no crea un formato paralelo de ejecución: utiliza el mecanismo común de Intents. [R §4, punto 12]
- El análisis de ASM no equivale a adopción ni aprobación de Postulate. [R §4, puntos 11–12]

### Límites con Gravity, Impact y Postulate

PENDIENTE — no definido aún en ASM_Location_Research_v0_1.md

La fuente conserva un deslinde **provisional [SUPUESTO S3]**: ASM consume resultados disponibles de Gravity sin recalcular su autoridad; puede pedir evaluación de consecuencias a Impact y declarar su ausencia, sin certificar impacto nulo; Postulate conserva la propuesta y su tratamiento. Estos límites se registran con el carácter provisional de origen, no como interfaces cerradas. [R §4, punto 12; R §9]

---

## 7. Estructura de metadatos

### 7.1 Provenance y trazabilidad

Cada afirmación relevante debe permitir recorrer: conclusión → fragmento incluido → contenido recuperado y revisión → adquisición → referencia de origen → captura Location → aporte humano o estructural. Las inferencias de ASM deben identificarse con evidencia y limitaciones; no deben pasar a ser selecciones humanas. [R §4, punto 10]

ASM debe conservar estados originales y observados, instantes, comparaciones de versión, razones de exclusión y respuestas humanas. Los resúmenes deben mantener vínculo al contenido condensado. Un hash puede ayudar a verificar integridad, pero no prueba autoría ni autorización. [R §4, punto 10]

Cuando falten revisión o atribución, debe registrarse la carencia y limitarse la conclusión. [R §4, punto 10]

### 7.2 Disponibilidad por consumo

Para cada campo o referencia, ASM debe registrar presencia real, fuente o capacidad consultada, instante de observación, revisión disponible, resultado de acceso/resolución y evidencia. Debe distinguir lo declarado por Location de lo observado durante el consumo. [R §3]

**availability_profile:** la conservación integral de esa cadena no fue demostrada por el research. Su validación permanece como condición de integración. [R §3; R §4, punto 10; R §8]

### 7.3 Representación persistida de metadatos

PENDIENTE — no definido aún en ASM_Location_Research_v0_1.md

---

## 8. Matriz de casos de prueba / transición

La matriz expresa resultados exigidos por las reglas de consumo, no transiciones de una máquina de estados persistida. Los escenarios son criterios de validación, no pruebas ejecutadas. [R §7–8]

| Caso | Precondición | Respuesta exigida | Resultado de consumo | Origen |
|---|---|---|---|---|
| Location sano | Referencias `resolved`; acceso, contenido, revisión y relación comprobados. | Adquirir, ordenar, ensamblar y comprobar que no se perdió inclusión crítica; enlazar conclusiones a fuentes. | Preparado dentro del alcance revisado. | R §7, Location sano |
| Antecedente complementario ausente | Referencia `missing`, sin dependencia crítica. | Registrar búsqueda y omitir antecedente. | Cobertura limitada sin bloqueo por ese antecedente. | R §7, Location degradado |
| Documentación histórica | Referencia `stale`; solo se recupera revisión histórica. | Solicitar vigencia y marcar uso histórico. | Bloqueada la afirmación de coherencia actual. | R §7, Location degradado |
| Relación necesaria ambigua | Más de una alternativa, sin evidencia para escoger. | Pedir desambiguación, sin elección por ranking. | Bloqueada la decisión de qué documentación aplica. | R §7, Location degradado |
| Mezcla `missing` + `stale` + `ambiguous` | Antecedente complementario, documentación necesaria y relación crítica en esas condiciones. | Tratar cada impedimento por separado; conservar análisis independiente. | Bloqueado para coherencia actual. | R §7, Location degradado |
| Se recupera vigencia, persiste ambigüedad | Documentación actual obtenida; relación no resuelta. | Conservar la nueva observación y el bloqueo restante. | Bloqueado. | R §7, Location degradado |
| Se resuelven ambos faltantes críticos | Documentación vigente y relación desambiguada; antecedente aún ausente. | Revalidar y declarar el límite de antecedentes. | Puede quedar preparado con límites. | R §7, Location degradado |
| Cambio de captura relevante | `changed` afecta foco o fundamento, o no puede evaluarse. | Comparar y conservar revisiones; detener propuesta y requerir decisión cuando corresponda. | Bloqueada la conclusión dependiente. | R §4, punto 6; R §5 |
| Acceso denegado a evidencia indispensable | Referencia `unauthorized`. | Excluir contenido, registrar impedimento y no eludir permiso. | Bloqueado para esa conclusión. | R §5 |
| Referencia indispensable no soportada | `unsupported` sin equivalencia demostrada utilizable. | Registrar capacidad faltante. | Bloqueado para esa conclusión. | R §5 |
| Falta versión o identidad | No se puede interpretar/correlacionar la captura. | Diagnosticar sin fabricar valores. | No presentar consumo trazable válido. | R §4, punto 1 |
| Falta objetivo | Solo existe punto de partida. | Evaluar resolubilidad sin inventar intención. | No jerarquizar por objetivo supuesto. | R §4, punto 1 |
| Servicio de consulta falla | No hay resultado verificable de adquisición. | Conservar fallo sin clasificarlo automáticamente como `missing` ni modificar captura. | Limitación o bloqueo según dependencia. | R §4, punto 5; R §5 |
| Presupuesto agotado o sin evidencia nueva | Expansión acotada no cubrió la necesidad. | Detener expansión y declarar faltantes. | Aptitud según suficiencia del alcance; bloquear si falta evidencia crítica. | R §4, puntos 6 y 11; R §5 |
| Contenido indispensable omitido en ensamblado | Plan e inclusiones efectivas no se corresponden. | Detectar la omisión y producir diagnóstico; no declarar preparado el conjunto sin evidencia crítica. | Bloqueo de la propuesta dependiente. | R §4, puntos 6 y 9; R §6–8 |
| Sin capa vectorial | Hay evidencia explícita suficiente. | Seleccionar sin vectores y declarar la degradación. | Puede continuar sin resultados semánticos inventados. | R §4, punto 8; R §5 |

Los ejemplos de Location sano/degradado conservan **[SUPUESTO S2]**: las fuentes y combinaciones de evidencia son hipotéticas. No representan capturas reales ni crean identidades de Project, Domain o Gene. [R §7 y §9]

---

## 9. Pendientes explícitos (fuera de alcance de esta especificación)

### 9.1 Estado, fases y estructura física

PENDIENTE — no definido aún en ASM_Location_Research_v0_1.md

### 9.2 Serializaciones de entrada, resultado y propuesta

PENDIENTE — no definido aún en ASM_Location_Research_v0_1.md

### 9.3 Provisión del objetivo y restricciones asociados

PENDIENTE — no definido aún en ASM_Location_Research_v0_1.md

La exigencia de no deducirlos del foco está respaldada por R §4, punto 1. La capacidad de recibirlos externamente conserva **[SUPUESTO S1]**, y el canal concreto sigue pendiente. No se asigna nombre contractual ni transporte a esa entrada. [R §8–9]

### 9.4 Transporte de adquisición y valores de presupuesto

PENDIENTE — no definido aún en ASM_Location_Research_v0_1.md

### 9.5 Interfaces de Gravity, Impact y Postulate

PENDIENTE — no definido aún en ASM_Location_Research_v0_1.md

### 9.6 Condiciones de integración conservadas de la fuente

| Pendiente | Evidencia necesaria para cerrarlo | Origen |
|---|---|---|
| Acuerdo de consumo con Already | Capturas reales versionadas, mínimo negociado y tratamiento de incompatibilidades. | R §8 |
| Separar captura y observación | Demostrar que actualizar disponibilidad no sobrescribe el origen humano. | R §8 |
| Resolución de entidades | Fuentes e identidades reales, permisos y revisiones comprobables. | R §8 |
| Adquisición y expansión | Responsable y canal efectivos, límites acordados, respuestas auditables y manejo de fallos. | R §8 |
| Integración BISP | Compatibilidad del plan con el builder y conservación de fuentes críticas, limitaciones y provenance. | R §8 |
| Disponibilidad semántica | Dependencias e índices verificados, almacenamiento efectivo aclarado y degradación sin vectores validada. | R §3 y §8 |
| Vigencia y concurrencia | Política de comparación entre captura, adquisición y propuesta, incluidos cambios durante el consumo. | R §8 |
| Pruebas de aceptación | Verificar siete estados, mezcla de estados, permisos, fallos de servicio, agotamiento de presupuesto y omisión crítica. | R §8 |

Los supuestos S1, S2 y S3 conservan las etiquetas y limitaciones de R §9. Ninguno se completa mediante una decisión nueva en este spec. Los apartados pendientes impiden interpretar esta versión como un contrato físico listo para implementación.