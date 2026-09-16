# FORWARD ENGINEERING — MARKET REALITY & COGNITUUM CAPABILITY GAP

**Versión:** v0.1  
**Corte de investigación:** 15 de septiembre de 2026.  
**Naturaleza:** investigación y propuesta; no decisión de producto ni autorización de implementación.  
**Repositorio observado:** C:/repos/bloom-development-extension; HEAD 0c69940f36cd20c175e2e7faa3dc564b1bec8c80, con cambios locales preexistentes.  
**Pregunta:** ¿existe trabajo pagado que Cognituum pueda facilitar y qué falta para hacerlo de manera operativa?

## 1. Executive finding

**Existe demanda verificable por implementar, integrar y mantener sistemas ajustados a una organización. “Forward Engineering” no identifica por sí solo un mercado homogéneo ni una profesión nueva.** La evidencia más útil para pequeñas y medianas organizaciones aparece bajo automatización, herramientas internas, integración y responsabilidad técnica de implementación. Hay casos publicados de equipos de unas 60 personas usando automatización con intervención humana; eso demuestra uso, pero no revela necesariamente presupuesto, rentabilidad ni precio del servicio profesional. [S04] [S05]

**La entrada de mercado es plausible; el encaje comercial de Cognituum permanece sin validar.** Una hipótesis razonable es ayudar a un ingeniero interno o integrador recurrente a conservar decisiones, permisos y evidencia durante cambios en un proceso de negocio. No está demostrado que ese profesional pague por una nueva plataforma de protocolo, ni que el costo de adoptarla sea menor que combinar herramientas existentes.

**Cognituum tiene piezas materiales, no una plataforma completa de Forward Engineering.** Hay código de autoridad, Vault, Intents, persistencia de criterio, evaluación limitada de consecuencias, embeddings, generación local en Alfred y routing determinístico. Executor todavía carece del proyecto Go objetivo; AITAP no conecta su vertical real; Orrery es un prototipo con datos ficticios; Location carece de un recorrido completo. Una arquitectura compatible con el problema no equivale a un producto desplegable. [L01] [L02] [L03] [L04] [L05] [L06] [L07] [L08]

**El protocolo podría diferenciar continuidad de intención y autoridad al cambiar de ejecutor. Esa ventaja sigue siendo potencial.** Multimodelo, modelos locales, permisos, trazas y aprobación humana ya tienen equivalentes. Palantir documenta incluso AI FDE con herramientas, modelos seleccionables y propuestas revisables. LangGraph, Temporal, MCP y A2A cubren otras partes de continuidad e interoperabilidad. No se identificó una diferenciación exclusiva ya demostrada. [S13] [S14] [S16] [S17] [S18] [S20]

**Recomendación de investigación:** validar un único proceso interno, con dueño identificable, dos o tres sistemas y resultados medibles. Probar primero continuidad, revisión y recuperación con un profesional responsable. No comenzar por una plataforma general de agentes ni por reemplazar el conjunto del SaaS de una empresa.

### Método y fuerza de evidencia

La investigación externa y el modelo C01–C18 se construyeron antes de leer la arquitectura local. Después se contrastaron con fuentes del repositorio. No se ejecutaron servicios, agentes, builds, pruebas ni operaciones sobre clientes.

Se distingue entre:

- **Documento comercial o contable:** evidencia de contratación, ingresos o modalidad de compra; no atribuye todo el valor al FDE.
- **Caso con empresa y portavoz identificados:** evidencia de despliegue declarado, publicada por un proveedor; resultados no auditados independientemente.
- **Vacante:** evidencia de presupuesto laboral y responsabilidad esperada; no prueba tamaño total de mercado.
- **Documentación técnica/código:** evidencia de mecanismo disponible o implementado; no demuestra adopción ni resultado.
- **Inferencia:** conclusión de este informe; se presenta como tal.

No se entrevistó a profesionales. No se obtuvieron facturas de pymes, contratos privados ni márgenes de consultoras. La muestra es intencional, internacional y sesgada hacia casos que proveedores decidieron publicar. No permite estimar prevalencia, TAM ni precios aceptables en Argentina. “Pyme” se usa descriptivamente por tamaño observado; no como clasificación jurídica.

## 2. Definition and terminology landscape

| Término | Trabajo al que suele referirse | Distinción necesaria |
|---|---|---|
| Forward engineering clásico | Pasar de abstracciones, requisitos y diseño a implementación | Es una dirección del proceso de ingeniería, contrapuesta al reverse engineering; no implica trabajar dentro de un cliente. La taxonomía de Chikofsky y Cross es de 1990. [S01] |
| Forward Deployed Software Engineer | Entender problemas del cliente y construir/desplegar soluciones cerca de sus operaciones | Palantir lo vincula a sus plataformas, datos y aplicaciones a medida. No equivale a escribir software arbitrario sin un sustrato compartido. [S02] |
| FDE de IA | Llevar modelos y sistemas de IA desde descubrimiento hasta producción y adopción | OpenAI explicita responsabilidad sobre alcance, diseño, implementación y resultados de despliegue. [S03] |
| AI/agent engineer | Diseñar agentes, herramientas, recuperación, evaluaciones e integración | Sierra describe trabajo de dominio e ingeniería de agentes; “AI-native” expresa herramientas y método, no una autoridad empresarial nueva. [S08] |
| Implementation engineer | Configurar, migrar e integrar un producto comprado | Generalmente comienza con un producto y alcance de adopción definidos. La frontera contractual pesa tanto como la técnica. [S10] |
| Solutions engineer/architect | Descubrimiento técnico, demostración y validación de una solución | Puede estar ligado a preventa. GitLab separa explícitamente ese trabajo de scoping comercial y entrega de servicios. [S09] [S10] |
| Integration engineer | Resolver intercambios de datos y acciones entre sistemas | Identidades, mapeos, reglas de negocio y fallos parciales son parte del trabajo; no solo conectar una API. [S07] [S20] |
| Field engineer | Ingeniería próxima al despliegue y entorno del cliente | Puede incluir infraestructura o preventa; el título solo no define quién mantiene la solución. |
| Professional services | Modalidad comercial de implementación, migración, capacitación y asesoría | No es una disciplina única. Puede venderse por paquete, horas o alcance contractual. [S10] |
| Embedded engineer | Profesional integrado temporalmente al equipo cliente | Aquí se refiere a inserción organizacional; no a ingeniería de sistemas embebidos/hardware. No implica autoridad soberana. |
| Internal tooling/bespoke development | Aplicaciones y automatizaciones para procesos propios | Puede hacerlo un empleado interno sin título FDE. Harmonic ofrece un ejemplo de responsable de automatización y tooling. [S06] |
| Agentic software development | Delegar tareas de desarrollo a agentes con herramientas | Es una forma de producir software. No resuelve automáticamente descubrimiento, aceptación, permisos y soporte del sistema final. [S24] [S29] |

Las últimas distinciones son una taxonomía analítica del informe, no una norma universal de títulos.

**Definición de trabajo utilizada:** un profesional convierte un problema organizacional situado en un sistema útil, integrado, autorizado y mantenible, y acompaña su adopción. Puede utilizar productos existentes, código propio, automatización determinística e IA. El trabajo también puede concluir que no conviene construir.

Hay dos usos de IA que no deben mezclarse:

1. IA como herramienta del ingeniero para investigar, programar y probar.
2. IA como componente del sistema que usará la empresa.

El primero no obliga al segundo. Una integración determinística puede ser el resultado correcto de un trabajo intensamente asistido por IA.

## 3. What Forward Engineers actually do

La unidad de trabajo observada es un cambio operativo, no un prompt.

| Actividad recurrente | Información que necesita adquirir | Resultado verificable | Evidencia |
|---|---|---|---|
| Elegir problema y dueño | Usuarios, responsable, costo del problema, alternativas y restricciones | Alcance y métrica de aceptación | [S03] [S09] |
| Reconstruir el proceso real | Excepciones, decisiones informales, hojas de cálculo, tiempos y dependencias | Mapa de proceso validado por quienes lo ejecutan | [S05] [S07] |
| Descubrir sistemas y conocimiento | APIs, esquemas, documentos, código heredado y expertos de dominio | Inventario de fuentes, comportamiento y vacíos | [S11] |
| Integrar | IDs, significado de campos, credenciales, límites de API y eventos | Flujo reproducible entre sistemas | [S06] [S07] |
| Diseñar y construir | Requisitos de usuario, decisiones de arquitectura y políticas | Aplicación o automatización revisable | [S02] [S08] |
| Validar | Casos reales, excepciones, falsos positivos y comportamiento anterior | Tests y aceptación del dueño del proceso | [S12] [S29] |
| Desplegar y operar | Entornos, observabilidad, fallos, recuperación y soporte | Servicio utilizable con responsable operativo | [S03] [S04] |
| Transferir y evolucionar | Quién queda a cargo, dependencias y decisiones pendientes | Manual operativo, historial y próxima revisión | [S09] [S10] |

**Correcciones a la lista inicial de la misión:** negociar alcance, demostrar valor, resolver acceso y lograr adopción merecen tanta atención como arquitectura y código. La selección de múltiples modelos aparece en algunos casos; coordinar múltiples agentes no es un requisito universal. Capturar conocimiento implícito requiere participación humana y validación; la búsqueda semántica no lo convierte automáticamente en conocimiento verdadero.

## 4. Existing market models

Para hacer comparables las doce preguntas de la misión, cada modelo se describe en dos tablas. **H** significa decisiones que deben conservar responsables humanos; **A** indica trabajo delegado a software/IA. Las responsabilidades normativas y las conclusiones sobre riesgo son inferencias del informe, apoyadas en el trabajo publicado; no cláusulas contractuales verificadas.

### 4.1 Trabajo, responsabilidad, herramientas e información

| Modelo | 1. Trabajo real | 2. Responsabilidad | 3. Herramientas | 4. Información organizacional |
|---|---|---|---|---|
| Palantir: plataforma + FDSE | Aplicaciones y datos adaptados a operaciones | Entrega técnica de extremo a extremo en equipos pequeños | Foundry/AIP/Ontology; Apollo para entrega de plataforma | Fuentes, reglas operativas y usuarios expertos. [S02] [S21] |
| Laboratorio de IA + FDE | Convertir capacidades de modelos en sistemas productivos | Alcance, construcción, rollout y adopción | Modelos de frontera, sistemas full stack y evaluaciones | Workflow, infraestructura, restricciones y criterios de éxito. [S03] |
| Sierra: producto vertical + agent engineers | Agentes de atención conectados a sistemas de negocio | Comportamiento consistente del agente en su dominio | Agent OS/SDK, modelos, recuperación y APIs | Productos, políticas y secuencias de servicio. [S08] |
| Consultora de modernización | Comprender y transformar sistemas existentes | Equivalencia funcional y transición operativa | Análisis de código, tests, bases de datos y cloud | Reglas heredadas y especialistas del cliente. [S11] [S12] |
| Integración/automatización interna | Reducir trabajo manual entre sistemas | Fiabilidad del proceso implementado | n8n, Workato, APIs, bases y componentes de IA | Identificadores, excepciones y controles de acceso. [S04] [S05] [S07] |
| Tooling propio acelerado por IA | Crear aplicaciones internas específicas | Producto interno y su mantenimiento | Retool o Replit, código e integraciones | Necesidades de operaciones y fuentes empresariales. [S06] [S23] |
| Agencia de implementación de IA para pymes | Automatizar un proceso acotado del cliente | Entrega acordada y seguimiento | CRM, mensajería e IA según caso | Funnel, reglas y datos del proceso. Evidencia de And AI, con limitaciones. [S25] |
| Agente de desarrollo como herramienta | Migraciones y tareas de código delegadas | El equipo humano conserva aceptación y producción | Devin y entorno de desarrollo | Repositorio, especificaciones, tests y convenciones. [S24] |

### 4.2 Decisiones, delegación y economía

| Modelo | 5–7. H / A / integración | 8–10. Riesgo, tiempo y costo | 11–12. Límite pendiente y compra |
|---|---|---|---|
| Palantir | H: prioridad, semántica y aceptación. A: transformaciones y trabajo técnico acotado. Integración anclada a datos y acciones | Conocimiento del dominio, instalación compleja, adopción y personal técnico; el 10-K reconoce oportunidades difíciles y costosas | La plataforma no elimina negociación organizacional. Se paga software y acompañamiento; no se aisló tarifa de FDE. [S21] [S22] |
| FDE de laboratorio | H: alcance, seguridad, calidad y rollout. A: inferencia y construcción asistida. Integración full stack | Ambigüedad y presión de entrega explícitas en la vacante; no hay estudio de reparto horario | No está demostrado un servicio económicamente accesible a pymes. Compra ligada a despliegue de IA; condiciones no públicas en esta fuente. [S03] |
| Sierra | H: políticas y excepciones. A: conversaciones y acciones en flujos integrados | Fiabilidad probabilística, orden de APIs, mejora continua | Cobra por resultados definidos y admite modalidades mixtas; no publica aquí precio por implementación. [S08] [S26] |
| Consultora | H: comportamiento a preservar y corte de producción. A: análisis, refactor y apoyo a tests | Descubrir reglas heredadas y verificar equivalencia; trabajo especializado | IA no sustituye expertos ni operación de migración. Cliente compra transformación y capacidad de entrega. [S11] [S12] |
| Integración interna | H: accesos, excepciones y acción final. A: reunir contexto, transformar y ejecutar flujos definidos | Datos dispersos, onboarding y cambios de API; costo de implementación y soporte | Conectores no resuelven por sí solos semántica ni excepciones. Se paga plataforma y trabajo técnico interno/externo. [S04] [S05] |
| Tooling propio | H: qué construir, permisos y uso. A: generación, búsqueda y tareas repetitivas | Acumulación de apps, mantenimiento y dependencia del constructor | Reemplazar una licencia no prueba ahorro neto total. Se paga tooling, infraestructura y trabajo de quien mantiene. [S06] [S23] |
| Agencia pyme | H: proceso objetivo, mensajes aceptables y lanzamiento. A: seguimiento o procesamiento de información | Personalización por cliente y soporte; horas y margen no publicados | Casos del proveedor no prueban repetibilidad económica. Oferta de proyecto/seguimiento, precio contratado desconocido. [S25] |
| Agente de código | H: descomposición, revisión y merge. A: cambios y pruebas delegadas | Contexto incompleto y costo de revisión; rendimiento depende de tarea | No asume responsabilidad empresarial. Se compra capacidad de desarrollo, no garantía de sistema operativo. [S24] [S27] [S28] |

### 4.3 Palantir: qué explica el modelo y qué no se debe extrapolar

Palantir debe entenderse como una combinación de ingenieros, plataforma compartida y aprendizaje de implementaciones. El FDSE no arranca cada cliente desde cero: trabaja sobre un sustrato para datos, semántica operativa, aplicaciones y controles. La vacante exige contacto con ejecutivos y equipos técnicos, desarrollo a medida y arquitectura. [S02]

La implementación de Tampa General vincula ingenieros con expertos clínicos, operaciones y analítica, y muestra expansión desde un primer caso hacia más casos. Es evidencia de continuidad organizacional, no una demostración de que cualquier pyme pueda comprar o reproducir ese modelo. [S22]

Tres hallazgos técnicos limitan la hipótesis competitiva de Cognituum:

- AIP acepta modelos de distintos proveedores; BYOM y self-hosting están documentados, con limitaciones por producto. [S14] [S15]
- Ontology tiene permisos sobre recursos y datos. Las trazas requieren controles adicionales porque pueden contener información sensible. [S30] [S31]
- AI FDE opera sobre Foundry, dispone de contexto y herramientas seleccionables y propone cambios mediante mecanismos de revisión. Su neutralidad respecto del modelo no significa independencia de Foundry. [S13]

**Conclusión:** Palantir es un competidor funcional relevante, no un ejemplo de producto acoplado a un único LLM. El posible espacio de Cognituum sería continuidad de ingeniería fuera de una plataforma empresarial particular, con menor costo de adopción. Ambas condiciones requieren demostración.

## 5. Evidence of paid demand

| Caso | Conducta observada | Qué demuestra | Qué no demuestra |
|---|---|---|---|
| Palantir, ejercicio 2025 | El 10-K reporta 954 clientes y aproximadamente USD 4.5 mil millones de ingresos | Compra real de plataformas y servicios asociados | Demanda pyme o ingreso atribuible específicamente a FDE. [S21] |
| TMNZ, unas 60 personas | Uso de n8n Enterprise; proveedor reporta 150.000 ejecuciones/mes y 400 horas de productividad mensual | Despliegue de automatización, controles y stack multimodelo en una organización pequeña | Precio pagado, factura, ahorro neto o causalidad independiente. [S04] |
| Oversee, unas 60 personas | n8n Business; ocho personas de operaciones y unas veinte usuarias de herramientas | Trabajo recurrente sobre incidencias y reportes; proveedor reporta menor tiempo de primera respuesta | Importe contractual ni automatización integral: la acción final sigue siendo humana. [S05] |
| Harmonic | 33 apps internas y sustitución declarada de una herramienta de unos USD 20.000/año | Comportamiento concreto de construir para resolver fricción y sustituir una compra | Que todo SaaS sea sustituible o que el ahorro bruto sea beneficio neto. [S06] |
| Boissoneault Electric | Integración de ServiceMax, RingCentral y TSheets; implicación del dueño y Head of IT | La necesidad de integración existe fuera de startups tecnológicas y precede a los LLM | Tamaño actual, presupuesto o margen del implementador; caso de 2021. [S07] |
| Firecrown | Empresa descrita con más de 200 empleados; aplicaciones internas y contratación de perfiles que construyen con Replit | Comportamiento de crear tooling y asignar capacidad humana | Auditoría del ahorro anual de USD 1.2 millones declarado por el proveedor. [S23] |
| GitLab Professional Services | Catálogo de servicios, bloques de 40 horas y paquetes con SOW | Existe un mecanismo explícito de compra de implementación/migración | Una venta concreta o demanda específicamente generativa. [S10] |
| And AI / Boxing Society | Testimonio del propietario sobre CRM, email y WhatsApp | Indicio de despliegue de agencia en una cadena de gimnasios | Factura ni evaluación independiente; confianza menor. [S25] |

**Jerarquía de conclusión:** compra empresarial general, alta confianza; uso en organizaciones pequeñas/medianas identificadas, confianza moderada; disponibilidad a pagar por Cognituum, desconocida.

### Comprador y disparador

Los siguientes patrones son hipótesis comerciales derivadas de los casos, no organigramas verificados para cada empresa.

| Dolor | Quién lo sufre | Quién hace el trabajo | Quién autoriza/paga | Disparador y resultado |
|---|---|---|---|---|
| Investigación manual de incidencias | Soporte/operaciones | Ingeniería interna o integrador | Responsable de operaciones + responsable técnico; presupuesto de empresa | Crecimiento o incumplimiento de tiempos; menor tiempo por caso |
| Doble carga entre CRM/ERP/servicio | Administración y atención | Integration engineer/consultor | Dueño, COO o IT | Errores y retrasos; menor reproceso |
| Herramienta empaquetada rígida | Equipo de negocio | Responsable de tooling | Responsable presupuestario y técnico | Renovación cara o soporte insuficiente; costo total menor |
| Modernización | Equipos que sostienen el legado | Consultora + especialistas internos | Dirección técnica/negocio | Obsolescencia o bloqueo; continuidad y reducción de riesgo |
| IA en producción | Responsable del proceso | AI engineer/FDE | Dueño del proceso con autorización de datos/IT | Piloto útil que no escala; calidad y operación verificables |

Barreras: acceso, datos incompletos, ausencia de dueño, presupuesto de mantenimiento, confianza, seguridad y disponibilidad de expertos. No se encontró una medición comparable de cuál consume más horas en pymes.

### Evidencia descartada o rebajada

And AI publica descripciones incompatibles de Bolsenbroek: una página habla de valoración inmobiliaria y otra de imágenes de vehículos con una mejora diferente. Se excluyen esas métricas del argumento de demanda. El caso Boxing Society queda como testimonio del proveedor, no como corroboración independiente. [S25] [S32]

No se usaron listas anónimas de “casos de IA”, estimaciones de tamaño de mercado ni posts de captación comercial como prueba de compradores. Un precio de oferta no es un precio contratado.

## 6. Human responsibility and stress points

**“Paladin” encuentra un trabajo reconocible, pero no una autoridad universal.** Sus equivalentes parciales incluyen FDE, technical lead, implementation architect, AI engineer y responsable de automatización. La evidencia respalda combinación de criterio técnico, conocimiento de organización y entrega. No demuestra que una sola persona deba controlar presupuesto, acceso a datos y aceptación de negocio.

La responsabilidad se distribuye:

- Dueño del proceso: objetivos, excepciones aceptables y aceptación del resultado.
- Profesional técnico: arquitectura, pruebas, integración, límites de delegación y operación técnica.
- Administrador/seguridad: identidades, permisos y revocación.
- Responsable presupuestario: gasto y continuidad del servicio.

En una pyme una persona puede ocupar varios roles, pero las decisiones siguen siendo diferentes. El software debe registrar con qué autoridad actuó, no deducirla de su capacidad técnica.

| Tensión | Riesgo concreto | Qué debería aliviar una plataforma |
|---|---|---|
| Requisitos tácitos | Automatizar la excepción incorrecta | Registrar ejemplos, supuestos y decisiones del dueño |
| Responsabilidad sin control de accesos | Compromisos imposibles de cumplir | Mostrar prerrequisitos y bloqueos |
| Generación rápida, revisión lenta | Entregar un cambio plausible pero incorrecto | Diff acotado, tests y evidencia de aceptación |
| Múltiples clientes | Mezclar datos, reglas o credenciales | Aislamiento y contexto activo inequívoco |
| Cambio de modelo/agente | Repetir descubrimiento y perder decisiones | Estado durable con semántica explícita |
| Fallo parcial | Repetir una escritura ya aplicada | Recibo de efecto, reconciliación y recuperación |
| Handover | Dependencia de una persona | Runbook y trazabilidad comprensibles por un sucesor |

Esta tabla es una síntesis de riesgos de ingeniería, no un estudio clínico de estrés. Las vacantes describen presión y objetivos cambiantes; los casos muestran trabajo de integración y contexto. No permiten ordenar cuantitativamente los factores. [S02] [S03] [S05] [S20]

La ganancia de IA tampoco debe presumirse: METR encontró ralentización en un experimento específico de 2025; su actualización de febrero de 2026 advierte que la nueva muestra no permite estimar limpiamente el efecto actual. Ninguno de los dos resultados decide por sí solo la productividad de un FDE en una pyme. [S27] [S28]

## 7. Forward Engineering workflow

Flujo derivado del conjunto de fuentes, propuesto como checklist de investigación y entrega:

1. **Entrada y mandato humano:** dueño del problema, presupuesto, alcance y autoridad para investigar.
2. **Descubrimiento situado:** entrevistar, observar casos reales y registrar excepciones.
3. **Inventario autorizado:** sistemas, fuentes, IDs, permisos, dependencias y límites.
4. **Decisión de intervención:** configurar/comprar/integrar/construir/no intervenir; justificar costo total.
5. **Diseño acotado:** comportamiento esperado, datos, efectos externos, pruebas y recuperación.
6. **Construcción:** cambios versionados; IA dentro del alcance permitido.
7. **Validación:** casos normales y adversos; aceptar/rechazar con el dueño del proceso.
8. **Rollout gradual:** entorno definido, reversión o compensación y responsable disponible.
9. **Operación:** observar calidad, costo, fallos y cambios de datos/modelos.
10. **Continuidad:** actualizar decisiones y documentación; probar transferencia a otra persona.

El ciclo vuelve a descubrimiento cuando cambia una regla del negocio. Cancelar ejecución no deshace un efecto ya aplicado: esa diferencia debe ser visible en la interfaz y en los contratos. [S18] [S20]

## 8. Capability model

Clasificación fijada antes del análisis local. ESSENTIAL indica que el trabajo necesita la capacidad, **no** que Cognituum deba implementarla enteramente. COMMODITY describe disponibilidad en el mercado y puede ser operacionalmente indispensable.

| ID | Capacidad derivada | Clase | Trabajo/evidencia de origen |
|---|---|---|---|
| C01 | Descubrimiento del proceso, dueño, excepciones y baseline | ESSENTIAL | Scoping y resultados: [S03] [S09] |
| C02 | Inventario de sistemas, significado de datos y comportamiento legado | ESSENTIAL | Contexto disperso/modernización: [S05] [S11] |
| C03 | Integrar APIs, bases y archivos con mapeos validados y escrituras controladas | ESSENTIAL | Tooling e integración: [S06] [S07] |
| C04 | Identidad, mínimos privilegios, secretos y aislamiento de cliente | ESSENTIAL | Controles de TMNZ y autorización: [S04] [S19] |
| C05 | Construir/adaptar software con cambios versionados y revisión | ESSENTIAL | FDSE y construcción interna: [S02] [S23] |
| C06 | Tests/evaluaciones con excepciones reales y aceptación de negocio | ESSENTIAL | Equivalencia y agentes: [S12] [S29] |
| C07 | Desplegar, configurar y recuperar en el entorno del cliente | ESSENTIAL | Producción y cutover: [S03] [S12] |
| C08 | Observar fallos, costo y operación; asignar soporte | ESSENTIAL | Operación y escalado: [S04] [S05] |
| C09 | Decisiones, procedencia y transferencia con responsable de actualización | IMPORTANT | Handoff y conocimiento legado: [S09] [S11] |
| C10 | Autoridad humana explícita y aprobación antes de efectos sensibles | ESSENTIAL | Operación asistida y revisión: [S05] [S13] |
| C11 | Pausa/reanudación/aborto con estado veraz de efectos | EMERGING | Agentes durables: [S16] [S18] |
| C12 | Routing de modelos/proveedores y opciones local/frontera | COMMODITY | BYOM y gateways: [S14] [S15] [S33] |
| C13 | Generación de código, recuperación semántica y acceso a herramientas | COMMODITY | Ingeniería de agentes y desarrollo: [S08] [S24] |
| C14 | Prácticas reutilizables y reglas específicas de organización | IMPORTANT | Playbooks y contratos: [S03] [S10] |
| C15 | Coordinación multiagente y estado portable entre ejecutores | EMERGING | Protocolos/runtime: [S17] [S18]; necesidad pyme general no probada |
| C16 | Valor y costo total de la intervención; adopción | ESSENTIAL | Resultados operativos y compra: [S04] [S10] |
| C17 | Interfaz de operador, formación y rollout incremental | ESSENTIAL | Uso fuera de ingeniería: [S05] [S23] |
| C18 | Descubrimiento autónomo amplio y sustitución general de SaaS | UNKNOWN | Solo sustituciones selectivas observadas: [S06] |

C09 y C14 son mejoras de plataforma; dejar información suficiente para operar no es opcional. Un documento y un repositorio pueden satisfacer parte de esa necesidad sin un producto nuevo.

## 9. Current tool landscape

| Capa | Referencias observadas | Qué resuelven | Trabajo que permanece |
|---|---|---|---|
| Plataforma empresarial operacional | Palantir Foundry/AIP | Datos, semántica, acciones, permisos y herramientas de desarrollo | Incorporación del dominio, adopción y costo de plataforma. [S13] [S30] |
| Integración/workflows | n8n, Workato | Conectividad y composición de flujos | Calidad del mapeo, excepciones y soporte. [S04] [S07] |
| Aplicaciones internas | Retool, Replit | Interfaces y construcción rápida | Aceptación, mantenimiento y diseño de acceso. [S06] [S23] |
| Ingeniería asistida por agentes | Devin; categoría de agentes de código | Trabajo de repositorio delegado | Responsabilidad sobre alcance y producción. [S24] |
| Runtime de agentes | LangGraph | Persistencia e interrupción; primitivas de orquestación | Diseño del proceso y semántica de efectos. [S16] [S17] |
| Ejecución durable | Temporal | Recuperación y coordinación de trabajo | Idempotencia de actividades y efectos externos. [S20] |
| Integración protocolar | MCP; A2A | Herramientas/recursos o comunicación y tareas entre agentes | Autoridad de negocio, políticas efectivas y portabilidad de significado. [S18] [S19] |
| Gateway de IA | LiteLLM | Modelos, claves virtuales, presupuestos y observabilidad | Operación del gateway y control real del costo de toda la intervención. [S33] [S34] |
| IA empaquetada para pymes | Claude for Small Business | Workflows e integración de aplicaciones habituales | Casos particulares, excepciones y mantenimiento empresarial. [S35] |
| Servicios | Consultoras, agencias, profesionales internos | Descubrimiento, integración y acompañamiento | Escalabilidad económica y transferencia de conocimiento. [S10] [S11] [S25] |

La competencia más difícil puede ser una combinación de estas herramientas ya adoptada, no otro producto con el mismo vocabulario. La disponibilidad de un protocolo no elimina el trabajo de integrar sus implementaciones.

## 10. Cognituum capability mapping

### Criterio de evaluación

- **SUPPORTED:** implementación concreta de la capacidad delimitada, comprobada en código; no certificación productiva.
- **PARTIALLY SUPPORTED:** hay piezas materiales pero falta completar o conectar la capacidad.
- **ARCHITECTURALLY POSSIBLE:** hay contratos/diseño explícitos, sin recorrido implementado suficiente.
- **MISSING:** falta en la superficie auditada el recorrido exigido; no afirmación de inexistencia en todo archivo histórico.
- **UNKNOWN / REQUIRES VERIFICATION:** evidencia insuficiente para una conclusión.

La verificación de ejecución de todas las capacidades es **NOT_RUN** en esta investigación. No se calcula un porcentaje agregado: no hay pesos ni criterios de aceptación que lo justifiquen.

### 10.1 Mapeo de las capacidades externas

| ID | Estado | Evidencia concreta y límite |
|---|---|---|
| C01 | PARTIALLY SUPPORTED | Intents y Genesis conservan trabajo y documentos; no se verificó un flujo de entrevistas, baseline económico y aceptación del dueño. [L09] [L10] |
| C02 | PARTIALLY SUPPORTED | BISP/Chroma y estructura semántica aportan recuperación; Location y productores canónicos Domain↔Gene no completan inventario empresarial. [L05] [L11] [L12] |
| C03 | MISSING | No se identificó una vertical de integración pyme con mapeo, autorización, idempotencia, reintentos y reconciliación. Tener comandos o HTTP no la acredita. Alcance: componentes revisados. |
| C04 | PARTIALLY SUPPORTED | Nucleus tiene decisiones sobre principal/scope/revocación y Vault basado en keyring; el gate de Vault observado es por rol master. No demuestra aislamiento y delegación por usuario de extremo a extremo. [L06] [L07] |
| C05 | PARTIALLY SUPPORTED | Brain tiene parser, staging y merge; Executor neutral con aislamiento/promoción sigue TARGET. Existencia de merge no prueba promoción autorizada. [L01] [L13] |
| C06 | PARTIALLY SUPPORTED | Impact evalúa preguntas delimitadas con inputs explícitos; hay tests locales en el repo. No sustituye aceptación del software, regresión ni evaluación de un agente del cliente. [L04] |
| C07 | PARTIALLY SUPPORTED | Hay arquitectura de instalación de Cognituum; no se demuestra delivery y rollback de aplicaciones del cliente. Executor sigue sin proyecto objetivo. [L01] [L02] |
| C08 | PARTIALLY SUPPORTED | Hay logging/telemetría y referencias contables; no contabilidad completa de inferencia vía AITAP ni observación del proceso del cliente. [L03] [L04] |
| C09 | PARTIALLY SUPPORTED | Estado de Intent, effect ledger, Postures versionadas y procedencia; faltan continuidad integrada y prueba de handover. [L08] [L09] [L14] |
| C10 | PARTIALLY SUPPORTED | Evaluador de autoridad material y creación gobernada de Gravity; no prueba de enforcement de toda acción externa o promoción de código. [L06] [L15] [L02] |
| C11 | ARCHITECTURALLY POSSIBLE | Executor especifica lifecycle/checkpoints/fencing. No se verificó pausa/reanudar/abortar real conservando efectos entre runtimes. [L02] |
| C12 | PARTIALLY SUPPORTED | AITAP separa runtime y backend/modelo en decisiones determinísticas; registry fixture, providers y Vault todavía pendientes. Brain usa embeddings; Alfred sí tiene OllamaTextProvider para generación local, separado del gateway. Integración gobernada y runtime NOT_RUN. [L03] [L11] [L21] |
| C13 | PARTIALLY SUPPORTED | Embeddings/Chroma y manejo de respuestas existen; Alfred implementa generación local, pero la ejecución agéntica integrada no está verificada. [L11] [L13] [L21] |
| C14 | PARTIALLY SUPPORTED | Gravity/Postures materializan criterio con resolución y versiones; herencia de criterio no acredita aplicación universal en ejecución. [L08] [L15] |
| C15 | ARCHITECTURALLY POSSIBLE | Orbital/Constellation y contrato neutral describen coordinación; no hay prueba de sustitución completa de ejecutor. [L02] [L16] |
| C16 | MISSING | No se verificó baseline de negocio, costo humano, mantenimiento y beneficio realizado en una intervención cliente. Accounting de IA cubre solo una parte. [L03] |
| C17 | PARTIALLY SUPPORTED | Interfaces existentes y prototipo Orrery; sus objetos y recorridos son ficticios. No es consola operacional de un caso Forward Engineering. [L05] |
| C18 | UNKNOWN / REQUIRES VERIFICATION | Ni la evidencia externa ni la implementación local respaldan la capacidad general. |

### 10.2 Qué se acredita por concepto

| Concepto solicitado | Estado material observado | Crédito legítimo |
|---|---|---|
| Paladin | Definición humana y producto preliminar | Hipótesis de experiencia; no rol comercial validado. [L16] [L17] |
| Intents/BISP | Implementación parcial de ciclo y artefactos | El registro declarativo inspeccionado contiene ING y DIS; no extrapolar a todos los tipos. [L09] |
| Postulates | UNKNOWN como entidad persistente integral | Hay lenguaje de propuesta y diseño ASM; no confundir con GravityPosture implementada. [L18] |
| Mandates/Actions/Genesis | Código de construcción, firma, dependencia y estado | Capacidades parciales; no equivalen a entregar aplicaciones productivas. [L10] |
| Orbital/Constellation | Arquitectura de coordinación | ARCHITECTURALLY POSSIBLE; no prueba operativa por tener un diagrama. [L16] |
| Nucleus/roles/authority | Evaluador y estructuras implementados | SUPPORTED para decisiones locales delimitadas; integración completa PARTIALLY SUPPORTED. [L06] |
| Brain | Código de manejo de Intents y conocimiento | Herramientas materiales, sin acreditar el futuro Executor. [L09] [L11] [L13] |
| Gravity/Postures | Modelo, store, resolución y frontera portable | SUPPORTED para persistencia/análisis delimitados; no autorización automática de cualquier efecto. [L08] [L15] |
| Impact | Engine y evaluadores coexistence, preservation, compliance | SUPPORTED para preguntas mecánicas definidas. No predice impacto económico ni adquiere hechos. [L04] |
| Monitor | No se verificó Monitor semántico integrado | UNKNOWN; health checks o archivos llamados monitor no acreditan esa responsabilidad. Impact excluye Monitor expresamente. [L04] |
| Orrery | Prototipo visual con fixtures | PARTIALLY SUPPORTED como exploración de interfaz; sin ejecución real. [L05] |
| Location | Contrato candidato y cierre de investigación | MISSING end-to-end; el research del 15/09 lo declara explícitamente. [L12] |
| ASM | Especificación con pendientes físicos | ARCHITECTURALLY POSSIBLE; integración no verificada. [L18] |
| Domains/Genes | Referencias/proyecciones en Gravity; índice semántico separado | PARTIALLY SUPPORTED; contenido canónico productor→store→consumidor no demostrado. [L08] [L12] |
| Evidence | Artefactos de trabajo y ledger; contratos Executor | PARTIALLY SUPPORTED; no prueba neutral completa de efectos reales. [L02] [L14] |
| Vault Shield | Documentación de visualización de credenciales | UNKNOWN como recorrido UI conectado; un indicador no constituye un control de autorización. [L19] |
| Tenant/organization/project | Modelos de autoridad y transporte de ProjectID | PARTIALLY SUPPORTED; no se certificó aislamiento entre clientes. [L06] [L10] |
| Local + frontier / AITAP | Embeddings de Brain, generación local de Alfred y routing fixture | PARTIALLY SUPPORTED; la generación tiene código, pero conexión AITAP integrada y operación real no se certificaron. [L03] [L11] [L21] |
| Decisiones persistentes / transporte de protocolo | Contratos y stores independientes de sesión | Base arquitectónica real, portabilidad semántica end-to-end sin probar. [L08] [L14] [L20] |

### 10.3 Contradicciones documentales encontradas

El archivo BTIPS disponible se llama v7_3 pero su encabezado dice v7.1; varios punteros siguen remitiendo a v6_0. No se usó el nombre del archivo para inferir implementación.

Una auditoría anterior dice que Gravity no contiene DOMAIN/GENE; el modelo actual sí declara ambos y referencias estructurales. Asimismo, comentarios de workflow dicen que ProjectID no tiene productor, pero el watcher y el workflow de construcción ya lo transportan. Alfred también conserva comentarios que niegan routing en AITAP, ya superados por RoutingEngine; su cliente de inferencia continúa sin implementar. **Código actual prevalece sobre comentarios y auditorías anteriores.** Eso tampoco cierra automáticamente coherencia de identidad ni materialización semántica. [L08] [L10] [L12] [L21]

## 11. Missing capabilities

Prioridad propuesta para investigar y después, con aprobación, implementar:

1. **Vertical completa de entrega gobernada.** Intent → autorización → ejecución aislada → resultado verificable → aceptación → promoción/despliegue → recuperación. Executor tiene especificación, no producto operativo. No saltar los gates existentes. [L01] [L02]
2. **Integración de un proceso real.** Conectores concretos, mapeo de negocio, IDs estables, datos de prueba, gestión de fallos y escrituras repetibles sin duplicación. Esto puede apoyarse en n8n/Workato/APIs existentes.
3. **Aceptación basada en resultados.** Dataset de casos, umbrales elegidos por el cliente, responsable de aprobar y evaluación de excepciones. Impact no reemplaza ese trabajo.
4. **Continuidad material de conocimiento.** Fuente, revisión, decisión, vigencia y permisos verificables; capacidad de recuperar contexto sin mezclar clientes. Los nombres Domains/Genes/Location no prueban el recorrido.
5. **Operación del sistema entregado.** Soporte, alertas, backup/restauración, gestión de versiones, credenciales y responsable de incidentes.
6. **Economía y adopción.** Baseline, esfuerzo humano, infraestructura, licencias, costo por caso y mantenimiento. Registrar tokens es insuficiente.
7. **Interfaz mínima de decisión.** Qué se propone, qué cambiará, qué necesita aprobación y qué pasó. La necesidad no exige una visualización espacial completa.

Los gaps de Executor remiten a CAF-019/CAF-020, con la ubicación física reconciliada en CAF-030, y a su especificación y gates vigentes [L22]; este informe no modifica contratos ni crea una segunda arquitectura de ejecución.

## 12. Protocol differentiation analysis

| Dimensión | Evidencia competitiva | Clasificación | Conclusión para Cognituum |
|---|---|---|---|
| Elegir entre modelos | Palantir BYOM; gateways y stacks existentes | ALREADY COMMODITY | No basta como propuesta distintiva. [S14] [S33] |
| Combinar local y frontera | AIP self-hosting y APIs externas | ALREADY COMMODITY | La operación y el costo importan; “local” solo no diferencia. [S15] |
| Conectar herramientas/agentes | MCP y A2A | COMMODITIZING | Integrar estándares tiene más fundamento que atribuir exclusividad a un protocolo propio. [S18] [S19] |
| Pausa y persistencia de ejecución | LangGraph/Temporal | ALREADY COMMODITY como primitivas | Portar estado a otro ejecutor exige más que persistir un checkpoint. [S16] [S20] |
| Permisos, revisión y auditoría | Palantir | ALREADY COMMODITY como categoría | Calidad del enforcement puede diferenciar; su existencia nominal no. [S13] [S30] |
| Reglas de ingeniería propias | Playbooks y mecanismos configurables existentes | COMMODITIZING | El valor sería conservación y aplicación consistente, con menos trabajo humano. |
| Intent + criterio + autoridad + evidencia independientes del ejecutor | Contratos locales ofrecen una separación explícita | POTENTIAL DIFFERENTIATION | Debe funcionar al sustituir runtime, sin perder límites ni reconstruir manualmente la historia. [L02] [L20] |
| Continuidad entre profesionales y organizaciones | Arquitectura PALADIN/SOVEREIGN plantea ownership | POTENTIAL DIFFERENTIATION | Necesita consentimiento, exportación permitida, revocación y handover comprobados. [L17] |
| Seguridad “por protocolo” | Un protocolo requiere implementación correcta | UNPROVEN | Declarar límites no garantiza que el runtime no los eluda. |
| Ventaja comercial pyme | Sin pilotos de Cognituum observados | UNPROVEN | Falta demostrar valor incremental y disponibilidad a pagar. |
| REAL DIFFERENTIATION | Sin prueba comparativa end-to-end | Ninguna acreditada | No confundir posibilidad estructural con ventaja exclusiva actual. |

**Prueba de refutación propuesta:** el mismo ingeniero resuelve el mismo cambio con su stack actual y con Cognituum; se interrumpe una ejecución, se cambia de runtime y un segundo profesional continúa. Evaluar pérdida de decisiones, alcance autorizado, efectos duplicados, tiempo de recuperación, esfuerzo de revisión y costo total.

Condiciones de aprobación para afirmar transportabilidad:

- Exportación/importación con versión y significado definido.
- Decisiones y fuentes recuperables fuera de memoria nativa de sesión.
- Revalidación de autoridad tras revocación o cambio de contexto.
- Evidencia que distingue plan, intento y efecto confirmado.
- Cambio de ejecutor sin conceder permisos más amplios.
- Reconocimiento explícito de estado que no es portable.
- Recuperación que no repite efectos externos desconocidos.

A2A permite tareas y cancelación, pero no garantiza éxito de cancelación; MCP resuelve interfaces/autorización de transporte, no la decisión empresarial de permitir una operación. Eso deja espacio de diseño, pero no prueba que ningún competidor lo cubra mediante otras capas. [S18] [S19]

## 13. Opportunities specifically relevant to small/medium organizations

| Oportunidad | Ajuste observado | Primer comprador hipotético | Principal objeción |
|---|---|---|---|
| Investigación asistida de incidencias | Caso comparable Oversee | Responsable de operaciones con apoyo técnico | Puede resolverse ya con stack existente |
| Documentos/solicitudes hacia sistema de gestión | Integración recurrente y conocimiento de excepciones | Administración/operaciones | Calidad de datos y validación humana |
| Herramienta interna para un cuello de botella | Harmonic/Firecrown | Responsable de tooling/producto | Mantenimiento supera el ahorro de licencia |
| Automatización de coordinación de servicios | BEC | Dueño + IT/integrador | Variabilidad por cliente y soporte de APIs |
| Continuidad del integrador entre entregas | Encaje con hipótesis protocolar | Agencia pequeña o ingeniero responsable | No hay evidencia pública suficiente de pago por continuidad como producto |

**Segmento inicial hipotético:** organización con aproximadamente 20–250 personas, un proceso repetitivo entre sistemas y un profesional técnico disponible. El rango es una hipótesis de muestreo, no una conclusión estadística ni una decisión de posicionamiento.

Los negocios muy pequeños sin responsable técnico pueden necesitar servicio gestionado, no otra herramienta de ingeniería. Los casos fuertemente regulados o de operación crítica elevan el costo de aceptación y soporte; no son el punto de partida predeterminado.

**Primer caso candidato:** preparar un expediente de incidencia a partir de tickets, documentación autorizada y datos de cuenta. El operador recibe fuentes y borrador, decide y registra la resolución. Comenzar en lectura reduce el número de efectos que deben reconciliarse; una siguiente fase podría añadir una escritura acotada, explícitamente autorizada.

La demostración de Cognituum sería preservar el proceso y su criterio cuando cambia un modelo, una API o la persona que mantiene el sistema. La velocidad de generar la primera pantalla es insuficiente.

## 14. Major risks to the hypothesis

1. **Confundir mercado de servicios con mercado de software:** que se pague al integrador no prueba presupuesto adicional para Cognituum.
2. **Costo de adopción:** demasiados conceptos antes del primer resultado pueden anular el beneficio.
3. **Servicios intensivos:** el conocimiento del cliente no se vuelve reutilizable automáticamente.
4. **Competencia integrada:** plataformas empresariales ya reúnen gobierno, modelos y construcción; suites pyme empaquetan casos comunes. [S13] [S35]
5. **Portabilidad incompleta:** cambiar modelo, runtime, datos y autorización son problemas distintos.
6. **Seguridad nominal:** contrato firmado sin enforcement en el efecto real.
7. **Memoria incorrecta:** persistir una decisión obsoleta puede empeorar el sistema.
8. **Desalineación de autoridad:** el profesional no necesariamente puede aprobar política empresarial.
9. **Ahorros inflados:** ahorro bruto de horas/licencia omite mantenimiento y revisión.
10. **Sesgo de publicación:** casi todos los casos positivos son seleccionados por proveedores.
11. **Ciclo largo hasta valor:** completar toda la arquitectura antes de un piloto puede ser económicamente inviable.
12. **Hipótesis demasiado amplia:** “ingeniería para cualquier empresa” no ofrece repetibilidad de integración.

## 15. Questions requiring further research

Protocolo propuesto, sujeto a aprobación; no se realizaron estas entrevistas:

- Entrevistar a responsables de automatización internos, integradores pequeños y FDE/AI engineers; pedir reconstruir un proyecto reciente, no opiniones generales.
- Conseguir dos o tres pilotos pagados o compromisos explícitos de presupuesto; separar interés de compra.
- Solicitar alcance contratado, factura anonimizada, horas por etapa y mantenimiento posterior.
- Identificar quién autoriza datos, quién acepta calidad y quién atiende una caída.
- Medir cuánto trabajo se pierde al cambiar de profesional, modelo o herramienta.
- Observar cómo conservan hoy decisiones y excepciones; comparar con documentación y repositorios existentes.
- Pedir un ejemplo de fallo parcial, revocación y retorno a operación manual.
- Probar sustitución de runtime sobre el mismo paquete de trabajo.
- Verificar capacidad efectiva de integración y aislamiento por cliente en Cognituum.
- Estudiar costos y canales locales si el mercado objetivo es Argentina/Latinoamérica.

**Criterios de descarte:** si los profesionales resuelven continuidad suficientemente con su stack, no aceptan el costo de gobernanza, no pagan por el incremento o el protocolo no reduce pérdidas durante handover, la hipótesis debe reducirse o abandonarse.

No se propone una cifra universal de ahorro mínimo. El umbral debe acordarse antes del piloto según costo, criticidad y alternativa real del comprador.

## 16. Sources with links and dates

### Fuentes externas

Todas consultadas el **2026-09-15**. “s/f” significa que no se verificó fecha editorial; no se reemplaza por fecha del crawler. Documentación viva refleja la versión consultada, no garantiza disponibilidad comercial en todos los planes o países. No se trataron fechas de navegación/footer como fechas de publicación.

| ID | Fuente y fecha | Tipo / límite |
|---|---|---|
| S01 | [Chikofsky y Cross, Reverse Engineering and Design Recovery: A Taxonomy][S01], enero 1990 | Paper original; taxonomía clásica |
| S02 | [Palantir FDSE, New York][S02], vacante viva s/f | Responsabilidades; no estudio laboral |
| S03 | [OpenAI FDE, Seattle][S03], vacante viva s/f | Responsabilidad de entrega |
| S04 | [n8n — TMNZ][S04], s/f | Caso del proveedor con CTO identificado |
| S05 | [n8n — Oversee][S05], s/f | Caso del proveedor con CTO identificado |
| S06 | [Retool — Harmonic][S06], s/f | Caso y testimonio de responsable |
| S07 | [Workato — Boissoneault Electric][S07], 2021-10-19 | Caso histórico, no estado comercial actual |
| S08 | [Sierra — Meet the AI agent engineer][S08], 2024-07-11 | Relato de ingeniera del proveedor |
| S09 | [GitLab — Solutions Architects processes][S09], documentación viva | Descubrimiento y handoff |
| S10 | [GitLab — Selling Professional Services][S10], documentación viva | Compra y responsabilidades de servicios |
| S11 | [Thoughtworks — Kickstart legacy modernization][S11], 2024-08-15 | Experiencia de consultoría; cliente anónimo |
| S12 | [Thoughtworks — Mainframe modernization with AWS and AI][S12], s/f | Caso anónimo; validación y cutover |
| S13 | [Palantir — AI FDE overview][S13], documentación viva | Capacidades y límites de plataforma |
| S14 | [Palantir — Bring your own model][S14], documentación viva; menciona revisión marzo 2026 | Multimodelo y restricciones |
| S15 | [Palantir — Self-host models][S15], documentación viva | Infraestructura propia |
| S16 | [LangGraph — Interrupts][S16], documentación viva | Interrupción y persistencia |
| S17 | [LangChain — Building LangGraph][S17], 2025-09-04 | Diseño del runtime |
| S18 | [A2A — Specification][S18], rama dev consultada | Especificación en evolución, no versión congelada |
| S19 | [MCP — Authorization][S19], versión 2025-11-25 | Autorización de transporte |
| S20 | [Temporal — Building Reliable Applications with Durable Execution][S20], s/f | Guía técnica de fallos y estado |
| S21 | [Palantir — 2025 Form 10-K][S21], ejercicio cerrado 2025-12-31, documento 2026 | Evidencia contable; no desglose FDE/pyme |
| S22 | [Tampa General/Palantir — expansión de colaboración][S22], 2024-06-05 | Comunicado conjunto en Business Wire |
| S23 | [Replit — Firecrown Media][S23], s/f | Caso del proveedor |
| S24 | [Cognition — Devin’s 2025 Performance Review][S24], 2025-11-14 | Autoevaluación del proveedor |
| S25 | [And AI — testimonios de clientes][S25], s/f | Agencia; confianza limitada |
| S26 | [Sierra — Outcome-based pricing][S26], 2024-12-10 | Modalidad comercial, no contrato individual |
| S27 | [METR — estudio de productividad early-2025][S27], julio 2025 | Ensayo acotado, 16 desarrolladores/246 tareas |
| S28 | [METR — actualización experimental][S28], 2026-02-24 | Explica límites de la estimación posterior |
| S29 | [Anthropic — Building effective agents][S29], 2024-12-19 | Recomendaciones técnicas primarias |
| S30 | [Palantir — Ontology permissions][S30], documentación viva | Permisos de recursos y datos |
| S31 | [Palantir — Log permissions][S31], documentación viva | Límites de seguridad de trazas |
| S32 | [And AI — AI automation for SMEs][S32], s/f | Contradicción con S25 sobre Bolsenbroek |
| S33 | [LiteLLM — AI Gateway][S33], s/f | Oferta y funcionalidades del proveedor |
| S34 | [LiteLLM — documentación de usuarios y budgets][S34], rama main consultada | Requisitos y límites de enforcement |
| S35 | [Anthropic — Claude for Small Business][S35], 2026-05-13 | Lanzamiento; evidencia de oferta, no de demanda pagada |

### Evidencia local

Inspección de código y documentos al 2026-09-15. Los tests presentes no fueron ejecutados. El cierre Location es un documento preexistente que reporta una inspección de instalación; este informe no repitió ni certificó esa inspección de runtime.

| ID | Fuente | Símbolo/alcance |
|---|---|---|
| L01 | [Executor README][L01] | Estado declarado, Gate C/D, proyecto no creado; ausencia de installer/executor comprobada |
| L02 | [Executor implementation spec][L02] | Contratos, runtime port, aislamiento, promoción, recovery y gates |
| L03 | [AITAP README][L03] y [RoutingEngine][L03b] | Routing real determinístico, registry fixture y pendientes |
| L04 | [Impact README][L04] y [Engine.Evaluate][L04b] | Evaluadores mecánicos, indeterminación y límites |
| L05 | [Orrery data.ts][L05] y [main.ts][L05b] | Objetos ficticios/importación del prototipo |
| L06 | [Authority decision.go][L06] | DecisionEvaluator.Evaluate: principal, scope, controles y revocación |
| L07 | [Vault][L07] | Authorize, OS keyring, RequestKey |
| L08 | [Gravity model][L08], [store][L08b], [frontera portable][L08c] | DOMAIN/GENE, Postures, versiones, análisis limitado |
| L09 | [Intent types][L09] y [IntentManager][L09b] | ING/DIS, turnos, persistencia y commit |
| L10 | [Mandate workflow][L10], [build workflow][L10b], [watcher][L10c] | Dependencias y transporte ProjectID |
| L11 | [Embeddings][L11] y [Chroma client][L11b] | Recuperación/vectorización local |
| L12 | [Location — cierre material v1.1][L12] | Research aprobado 2026-09-15; NOT_SUPPORTED end-to-end |
| L13 | [ResponseParser][L13], [StagingManager][L13b], [MergeManager][L13c] | Manejo de resultados y archivos, no certificación Executor |
| L14 | [Effect ledger][L14] | Ledger durable ING/DIS; MandateStateReader no conectado |
| L15 | [Gravity resolver][L15] y [governed creation][L15b] | Resolución y creación condicionadas |
| L16 | [Glosario Orbital/Constellation/Paladín][L16] | Definiciones, no demostración de ejecución |
| L17 | [PALADIN foundation][L17], 2026-08-26 | Producto y partición preliminares |
| L18 | [ASM Intent spec][L18] | Contrato de consumo con interfaces pendientes |
| L19 | [Vault specification][L19] | Diseño de Shield; integración no comprobada |
| L20 | [Responsibility boundaries][L20] | Ownership de semántica, supply, autoridad y ejecución |
| L21 | [OllamaTextProvider de Alfred][L21] y [cliente AITAP][L21b] | Generación local implementada; cliente AITAP incompleto |
| L22 | [Architecture findings][L22] | CAF-019/020 y reconciliación CAF-030; estados históricos no usados sin contraste |

[S01]: https://www.ifi.uzh.ch/dam/jcr%3A00000000-2f41-7b40-ffff-ffffdc0b3b5e/chikofsky90.pdf
[S02]: https://jobs.lever.co/palantir/dab396d4-2f14-4796-aac0-0d82883dccf0
[S03]: https://openai.com/careers/forward-deployed-engineer-(fde)-seattle-seattle/
[S04]: https://n8n.io/case-studies/tmnz/
[S05]: https://n8n.io/case-studies/oversee/
[S06]: https://retool.com/customers/harmonic
[S07]: https://www.workato.com/the-connector/bec-ringcentral-integration/
[S08]: https://sierra.ai/blog/meet-the-ai-agent-engineer
[S09]: https://handbook.gitlab.com/handbook/solutions-architects/processes/
[S10]: https://handbook.gitlab.com/handbook/solutions-architects/playbooks/selling-professional-services/
[S11]: https://www.thoughtworks.com/en-au/insights/articles/kickstart-legacy-modernization-initiative-generative-ai
[S12]: https://www.thoughtworks.com/clients/mainframe-modernization-ai/leading-manufacturing-company
[S13]: https://www.palantir.com/docs/foundry/ai-fde/overview
[S14]: https://www.palantir.com/docs/foundry/aip/bring-your-own-model
[S15]: https://www.palantir.com/docs/foundry/aip/self-host-models
[S16]: https://langchain-ai.github.io/langgraph/concepts/breakpoints/
[S17]: https://www.langchain.com/blog/building-langgraph
[S18]: https://a2a-protocol.org/dev/specification/
[S19]: https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization
[S20]: https://assets.temporal.io/durable-execution.pdf
[S21]: https://investors.palantir.com/files/2025%20FY%20PLTR%2010-K.pdf
[S22]: https://www.businesswire.com/news/home/20240605163436/en/Tampa-General-Hospital-Selects-Palantirs-AI-Software-to-Power-Connected-Care-Coordination-Extending-Long-Term-Partnership
[S23]: https://replit.com/customers/firecrown-media
[S24]: https://cognition.com/blog/devin-annual-performance-review-2025
[S25]: https://www.andai.nl/
[S26]: https://sierra.ai/uk/blog/outcome-based-pricing-for-ai-agents
[S27]: https://metr.org/Early_2025_AI_Experienced_OS_Devs_Study-paper.pdf
[S28]: https://metr.org/blog/2026-02-24-uplift-update/
[S29]: https://www.anthropic.com/engineering/building-effective-agents
[S30]: https://www.palantir.com/docs/foundry/object-permissioning/ontology-permissions
[S31]: https://www.palantir.com/docs/foundry/aip-observability/log-permissioning
[S32]: https://andai.nl/oplossingen/ai-automatisering/
[S33]: https://www.litellm.ai/
[S34]: https://github.com/BerriAI/litellm-docs/blob/main/docs/proxy/users.md
[S35]: https://www.anthropic.com/news/claude-for-small-business

[L01]: C:/repos/bloom-development-extension/docs/EXECUTOR/README.md
[L02]: C:/repos/bloom-development-extension/docs/EXECUTOR/EXECUTOR_IMPLEMENTATION_SPEC_v1_0.md
[L03]: C:/repos/bloom-development-extension/installer/aitap/README.md
[L03b]: C:/repos/bloom-development-extension/installer/aitap/src/aitap/routing/engine.py
[L04]: C:/repos/bloom-development-extension/installer/impact/README.md
[L04b]: C:/repos/bloom-development-extension/installer/impact/internal/evaluation/evaluate.go
[L05]: C:/repos/bloom-development-extension/installer/conductor/workspace/core/orrery/src/data.ts
[L05b]: C:/repos/bloom-development-extension/installer/conductor/workspace/core/orrery/src/main.ts
[L06]: C:/repos/bloom-development-extension/installer/nucleus/internal/authority/decision.go
[L07]: C:/repos/bloom-development-extension/installer/nucleus/internal/vault/vault.go
[L08]: C:/repos/bloom-development-extension/installer/nucleus/internal/gravity/model.go
[L08b]: C:/repos/bloom-development-extension/installer/nucleus/internal/gravity/store.go
[L08c]: C:/repos/bloom-development-extension/installer/nucleus/gravity/portable.go
[L09]: C:/repos/bloom-development-extension/brain/core/intent_types.py
[L09b]: C:/repos/bloom-development-extension/brain/core/intent_manager.py
[L10]: C:/repos/bloom-development-extension/installer/nucleus/internal/orchestration/temporal/workflows/mandate_execution_workflow.go
[L10b]: C:/repos/bloom-development-extension/installer/nucleus/internal/orchestration/temporal/workflows/mandate_build_workflow.go
[L10c]: C:/repos/bloom-development-extension/installer/nucleus/internal/orchestration/watchers/mandate_watcher.go
[L11]: C:/repos/bloom-development-extension/brain/core/bisp/embedding_generator.py
[L11b]: C:/repos/bloom-development-extension/brain/core/bisp/chroma_client.py
[L12]: C:/repos/bloom-development-extension/docs/ANALYSIS/ORRERY/LOCATION/ORRERY_LOCATION_MATERIAL_CLOSURE_v1_1.md
[L13]: C:/repos/bloom-development-extension/brain/core/intent/response_parser.py
[L13b]: C:/repos/bloom-development-extension/brain/core/intent/staging_manager.py
[L13c]: C:/repos/bloom-development-extension/brain/core/intent/merge_manager.py
[L14]: C:/repos/bloom-development-extension/brain/core/intent/effect_ledger.py
[L15]: C:/repos/bloom-development-extension/installer/nucleus/internal/gravity/resolver.go
[L15b]: C:/repos/bloom-development-extension/installer/nucleus/internal/gravity/governed_creation.go
[L16]: C:/repos/bloom-development-extension/docs/ANALYSIS/GRAVITY/ORBITAL/Glosario_Contexto_Cognituum_para_Cowork.md
[L17]: C:/repos/bloom-development-extension/docs/PALADIN/PALADIN_FOUNDATION_AND_PRELIMINARY_ROADMAP_v0_1.md
[L18]: C:/repos/bloom-development-extension/docs/BSIP/TYPES/ASM_Intent_Spec_v1_0.md
[L19]: C:/repos/bloom-development-extension/docs/VAULT/VAULT_SYSTEM_TECHNICAL_SPECIFICATION.md
[L20]: C:/repos/bloom-development-extension/docs/GOVERNANCE/ARCHITECTURE/COGNITUUM_RESPONSIBILITY_BOUNDARIES.md

[L21]: C:/repos/bloom-development-extension/installer/alfred/src/alfred/providers/ollama_text_provider.py
[L21b]: C:/repos/bloom-development-extension/installer/alfred/src/alfred/aitap/client.py
[L22]: C:/repos/bloom-development-extension/docs/GOVERNANCE/RESEARCH/COGNITUUM_ARCHITECTURE_FINDINGS_2026-08-17.md

## IF WE HAD TO BUILD FOR THIS MARKET TOMORROW

- **Qué ya tiene Cognituum:** código de autoridad y Vault; gestión parcial de Intents; persistencia/resolución de Postures; evaluadores limitados de Impact; embeddings y generación local en Alfred; routing determinístico separado de runtime/modelo. Son piezas comprobadas estáticamente, no una certificación del producto integrado.
- **Qué debe agregarse:** una vertical real de ejecución y entrega autorizada, integración concreta con sistemas del cliente, aceptación, operación, recuperación, handover y medición del costo total. Completar el mínimo de continuidad de evidencia necesario para ese caso.
- **Qué no construir todavía:** marketplace general, Constellation universal, reemplazo masivo de SaaS, catálogo propio de cientos de conectores, modelos fundacionales propios o una interfaz espacial completa como prerrequisito del primer piloto.
- **Qué validar con profesionales:** si pierden tiempo por discontinuidad de contexto/autoridad; qué conservan hoy; quién compra; cuánto soporte necesitan; si el beneficio supera el costo de operar Cognituum.
- **Primer uso desplegable posible:** un profesional y un dueño de proceso, un expediente de incidencia construido desde fuentes autorizadas, revisión humana y trazabilidad. Usar infraestructura existente; demostrar continuidad al cambiar de modelo/persona. Añadir una escritura controlada solo después de validar aislamiento y recuperación.

**Decisión que la evidencia permite hoy:** investigar y probar una entrada estrecha de implementación asistida con continuidad gobernada. **Decisión que todavía no permite:** afirmar encaje de mercado, superioridad protocolar o preparación productiva de Cognituum.

