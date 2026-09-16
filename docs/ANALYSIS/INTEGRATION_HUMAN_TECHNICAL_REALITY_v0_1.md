# INTEGRATION_HUMAN_TECHNICAL_REALITY_v0_1

**Fecha de investigación:** 2026-09-15.  
**Estado:** investigación documental v0.1; no decisión de producto ni autorización de implementación.  
**Pregunta:** ¿qué hace difícil, estresante, costosa y riesgosa la integración para quien debe conseguir que sistemas organizacionales heterogéneos funcionen juntos? ¿Qué capacidades reducirían esa carga conservando su autoridad técnica?

## 1. Executive finding

**La hipótesis está respaldada para integraciones con estado, semántica de negocio y responsabilidad distribuida; no está demostrada como el dolor principal de todo Forward Engineering.** La dificultad no reside solamente en implementar una conexión: reside en establecer qué significa que el conjunto funcione, quién puede decidirlo y cómo demostrarlo mientras los sistemas cambian.

La investigación distingue cuatro cargas que requieren intervenciones diferentes:

- **Complejidad técnica:** fallos parciales, entrega repetida, versiones incompatibles.
- **Carga cognitiva:** reconstruir significado, antecedentes y efectos posibles.
- **Coordinación organizacional:** obtener acceso, conocimiento y decisiones de otros.
- **Responsabilidad/riesgo:** responder por consecuencias que exceden el sistema controlado por el ingeniero.

La investigación de Maguire sobre 62 incidentes en cuatro organizaciones muestra que coordinar también es trabajo cognitivo y que las herramientas pueden agregar carga. Es evidencia sobre operación e incidentes, no una medición poblacional de ingenieros de integración. [S01]

**La hipótesis competitiva amplia no se sostiene:** existen plataformas que ayudan al responsable, no solamente al transporte. Workato documenta operación y auditoría; MuleSoft, gobernanza; Backstage, propiedad y documentación; Palantir, semántica, acciones y permisos. [S11], [S12], [S13], [S14], [S15], [S16] El espacio posible es más estrecho: continuidad verificable de decisiones y responsabilidades entre herramientas y sistemas que una plataforma no controla completamente.

**Cognituum tiene primitivas pertinentes, pero no una capacidad integral de integración comprobada.** Gravity, autoridad, persistencia de Intents y evaluación limitada de Impact tienen implementación inspeccionable. La cadena Location–ASM, el contenido canónico Domain/Gene y la ejecución neutral de Executor presentan cortes materiales. [L01], [L02], [L03], [L04], [L05], [L06], [L07], [L08], [L09], [L10], [L11], [L12]

**Entrada prioritaria para validación comercial:** preparar y revisar un cambio de una integración existente conservando contratos, decisiones, responsables, evidencias y límites de recuperación. No es todavía una recomendación de construir un ejecutor autónomo.

### Método y límites

1. Se investigaron primero fuentes externas y se derivaron capacidades antes de inspeccionar Cognituum.
2. Se priorizaron relatos de implementación, postmortems, investigación sobre trabajo humano y documentación oficial.
3. **Hecho observado/documentado** acredita lo que cuenta o implementa la fuente; **inferencia** propone una explicación; **hipótesis comercial** requiere validación con compradores.
4. Documentación de proveedor acredita capacidades declaradas, no eficacia, adopción, facilidad ni retorno económico comprobados.
5. Los casos de incidentes sobrerrepresentan situaciones graves. Los casos publicados por proveedores también tienen selección editorial.
6. No se realizaron entrevistas nuevas, pruebas comparativas de productos, mediciones de frecuencia, auditoría de producción ni investigación de precios negociados.
7. Las fuentes se consultaron el 2026-09-15. Una fecha de consulta no sustituye una fecha de publicación.
8. La inspección local fue estática. No se ejecutaron servicios, modelos, migraciones ni tests. Existencia de tests no equivale a resultado aprobado.
9. No se inspeccionaron secretos ni se enviaron archivos del repositorio a búsquedas web.
10. La evidencia no permite estimar prevalencia, costo medio, tamaño de mercado ni disposición a pagar por Cognituum.

## 2. What “integration” actually encompasses

**Definición operativa derivada:** hacer que capacidades, información y decisiones de sistemas con distintos responsables produzcan un resultado organizacional acordado, con restricciones verificables y continuidad operacional.

Tiene seis superficies superpuestas:

1. **Intercambio:** llamadas, mensajes, eventos, archivos y acciones humanas.
2. **Significado:** identidad de entidades, estados, unidades, fechas y reglas.
3. **Autoridad:** identidad humana/técnica, permisos, propiedad y delegación.
4. **Ejecución:** infraestructura, entornos, cambios, despliegue y recuperación.
5. **Operación:** observación, conciliación, incidentes y mantenimiento.
6. **Memoria:** decisiones, contratos, procedencia y motivos que deben sobrevivir.

Esta definición es una síntesis analítica de patrones de integración, operaciones reales y migración de legado. No es una definición normativa atribuida a una sola fuente. [S02], [S03], [S04], [S05], [S06], [S07], [S08], [S09], [S10], [S17], [S18], [S19], [S20], [S21], [S22]

**Una API es una interfaz, SaaS una modalidad de provisión y ERP una función empresarial.** Un ERP SaaS puede integrarse por API, archivo, eventos y tareas manuales. Contarlos como cuatro sistemas diferentes confundiría el inventario.

Los ejes útiles para comparar dificultad son: control de ambos extremos; criticidad; reversibilidad; sincronía; volumen; sensibilidad; estabilidad contractual; observabilidad; diversidad semántica; número de propietarios y calidad del conocimiento disponible.

## 3. Integration taxonomy

La tabla distingue superficies y mecanismos. Los fallos son característicos, no inevitables; las extrapolaciones se identifican como inferencias de ingeniería. Cada sistema real debe clasificarse en varios ejes.

| Superficie | Trabajo distintivo y fallos característicos | Evidencia / control necesario |
|---|---|---|
| APIs, categoría general | Contrato de solicitud/respuesta; timeout con resultado desconocido, paginación incompleta, incompatibilidad | Identidad de operación y contrato versionado; [S07], [S08] |
| APIs internas | Cambios de bibliotecas o representaciones que alteran consumidores sin intención explícita | Inventario de consumidores y pruebas de compatibilidad; caso Slack [S07] |
| APIs externas | Límites, versiones, disponibilidad y políticas decididos por terceros | Registrar condiciones del proveedor y tratamiento de rechazo; [S08], [S23] |
| Sistemas a medida | Reglas locales que el esquema no expresa; dependencias de autores originales | Reconstrucción con código y expertos; inferencia apoyada en [S09], [S10] |
| Sistemas empaquetados | Configuraciones, extensiones y permisos propios de cada instalación | Distinguir producto estándar de configuración efectiva; [S17], [S18] |
| SaaS | Tenant, plan, cuentas de servicio, cambios del proveedor y alcance de exportación | Probar la configuración contratada, no un ejemplo genérico; [S11], [S12], [S13], [S23] |
| Software legado | Acoplamientos antiguos, expertos escasos, contratos y ventanas de cambio | Inventario de dependencias y estrategia gradual; [S09], [S10] |
| Bases de datos | Snapshot/CDC, locks, tipos, historial de esquema y lag | Posiciones de captura y esquema aplicable al evento; [S19] |
| Data warehouses | Replicación válida que produce métricas erróneas por granularidad o cambios de esquema | Linaje y pruebas de transformaciones; replicación automatizable [S20]; error semántico es inferencia |
| Archivos | Transferencia parcial, límites de tamaño, codificación, duplicación y lotes incompletos | Manifiesto, conteo y recepción verificable; fallo real de carga [S06] |
| Spreadsheets | Fórmulas, hojas, edición manual, tipos inferidos y significado dependiente de personas | Versionar entrada, explicitar fórmulas/reglas y conciliar; riesgo estudiado [S24]; no atribuir el incidente PHE a Excel con esta fuente |
| Documentos | Extracción incierta, tablas y unidades ambiguas, versiones contradictorias | Procedencia por campo y revisión según confianza/impacto; [S25] |
| Email | Sincronización incremental que expira; envío no equivale a recepción ni ejecución del trámite | Recuperación de sincronía y verificación del resultado de negocio; [S26]; segunda distinción es inferencia |
| Webhooks | Repeticiones y orden no garantizado; procesamiento posterior al acuse | Firma, deduplicación y reconciliación; [S21] |
| Queues | Reentrega, mensajes bloqueantes, consumidores atrasados y recuperación | Política de reintentos, mensajes fallidos y capacidad; [S05], [S22] |
| Sistemas de eventos | Evolución de contratos, replay y significado del orden por entidad | Compatibilidad, identidad y relación causal explícitas; [S19], [S22] |
| Autenticación | La identidad presentada no coincide con el usuario o servicio esperado | Federación y validación de identidad; [S27] |
| Autorización | Identidad válida sin permiso para la operación, el tenant o el recurso | Permisos efectivos y alcance de cada acción; [S13], [S16], [S28] |
| Proveedores de identidad | Alta/baja y grupos que no se sincronizan instantáneamente o no se mapean igual | Distinguir login de provisioning/deprovisioning; [S27] |
| Secretos | Expiración, rotación, custodia y propagación accidental | Referencias, revocación y credenciales temporales cuando disponibles; [S29] |
| Infraestructura | Creaciones parciales, recursos huérfanos, estado observado distinto al deseado | Identidad de operación y reconciliación; ejemplo EC2 [S08] |
| Servicios cloud | Cuotas, IAM, redes y dependencias administradas | Verificar permisos, límites y recuperación por servicio; [S08], [S29] |
| Local/on-premise | Conectividad restringida, versiones y disponibilidad de ventanas operativas | Conectividad híbrida y responsabilidades locales; [S09], [S18], [S27] |
| Repositorios de código | Una interfaz cambia en un repo y el consumidor permanece incompatible | Relacionar revisiones y consumidores; [S07], [S43]; coordinación multirrepo es inferencia |
| CI/CD | Orden de despliegue y migración incompatibles; pruebas que no representan producción | Promoción por etapas y evidencia de compatibilidad; [S02], [S43] |
| Observabilidad | Falta propagación de contexto o visibilidad en una frontera | Correlación sin filtrar información sensible; [S31] |
| ERP | Estados y reglas de negocio, datos maestros y flujos entre módulos | Pruebas del proceso y monitoreo de mensajes/mapeos; [S18] |
| CRM | Diferencias de identidad y sistema de registro; actualizaciones que se pisan | Decidir quién es maestro por entidad/atributo; [S17] |
| Pagos | Resultado ambiguo, doble efecto y desacuerdo con el procesador | Idempotencia y conciliación; [S05], [S32] |
| Plataformas de comunicación | Scopes, canales y políticas del proveedor cambian la cobertura real | Medir cobertura y límites; [S23] |
| Herramientas internas no documentadas | Automatización depende de comportamiento accidental o interfaz visual | Captura con experto y prueba de selectores; [S09], [S33] |
| Flujos manuales humanos | Excepciones, decisiones tácitas, demoras y handoffs sin aceptación | Responsable, criterio de finalización y cola de excepciones; [S01], [S10], [S34] |
| Modelos IA | Respuesta plausible sin corrección; contexto insuficiente y cambios de comportamiento | Evaluaciones por tarea y evidencia externa al relato del modelo; [S35], [S36] |
| Agentes IA | Lectura se convierte en acción; autoridad y efectos exceden la tarea | Fronteras de herramientas, intervención y estado durable; [S28], [S37], [S38] |
| Modelos locales | Dependencias de máquina, recursos y calidad por tarea | Evaluación local y control de salida de datos; capacidad no se infiere de “local” |
| Modelos de frontera | Calidad/costo/latencia y condiciones de exposición del contexto | Política explícita de datos y pruebas por modelo; [S35], [S36]; residencia no se presume |
| MCP | Descubrimiento/invocación de herramientas no determina legitimidad empresarial | Validar audiencia y separar credenciales/autoridad; [S28] |
| A2A y protocolos emergentes | Interoperabilidad de agentes no garantiza atomicidad de sus efectos | Contratos de tareas/artefactos más controles de aplicación; [S39] |

La fila de modelos locales contiene requisitos derivados, no un benchmark que establezca equivalencia con modelos de frontera.

## 4. Real integration workflow

### Casos que reconstruyen el trabajo

| Caso | Qué hizo realmente el responsable | Qué permite concluir / límite |
|---|---|---|
| Stripe, migración online, 2017 | Cambió progresivamente escrituras y lecturas, rellenó datos y comparó resultados antes de retirar el modelo anterior | “Funciona” requiere coexistencia y verificación; caso de gran escala, no costo típico [S02] |
| Atlassian, abril 2022 | Recuperó sitios y coordinó validación después de una confusión entre IDs de aplicaciones y sitios en una operación de borrado | Revisar el endpoint no validó el significado del objetivo. Restaurar exigió trabajo entre equipos [S03] |
| GitLab, enero 2017 | Investigó una interrupción de replicación, perdió datos y tuvo que recuperar con mecanismos de respaldo insuficientes | Un plan de recuperación debe comprobarse; es un incidente de operación, no prueba de prevalencia de integración [S04] |
| Shopify, experiencia en pagos, 2022 | Acumuló prácticas para límites, fallos y conciliación con sistemas de pago | El ingeniero hereda un dominio y aprende fallos que el conector no elimina [S05] |
| PHE, octubre 2020 | Reparó una transferencia de resultados limitada por tamaño de archivos y procesó el atraso | Había entrega a personas pero falló otra rama del proceso; la completitud es específica del destino [S06] |
| Palantir FDSE, 2020 | Trabajó con usuarios y mentores para comprender el dominio, configurar modelos y workflows, probar y mantener | Integración combina ingeniería, comprensión del cliente y transferencia de conocimiento; relato editorial de un empleador [S10] |
| Slack, evolución de API | Introdujo separación para evitar que cambios internos alteraran respuestas externas accidentalmente | El mantenimiento de la frontera es trabajo continuo [S07] |

### Un recorrido completo documentado: GitHub

Shlomi Noach describe una solicitud de cambio de esquema que empieza con experimentación local, pasa por revisión de pares y del equipo dueño de bases productivas, y luego exige identificar clusters afectados, instrucción de migración, mecanismo y momento de ejecución. Durante la migración se observa su impacto; después se limpia, se habilita el siguiente cambio y se comunica la finalización al desarrollador. El artículo reporta varias migraciones diarias, seguimiento mental de tareas y trabajo bloqueado por la coordinación. Es evidencia concreta de frecuencia y carga en ese equipo, no una estimación para todo el mercado. Su automatización es también contraevidencia: parte de ese trabajo se puede resolver con herramientas existentes. [S43]

### Recorrido reconstruido, no cronograma universal

1. **Aclarar el resultado.** Identificar el proceso y quién acepta el resultado. Una conexión técnicamente exitosa puede dejar una tarea empresarial inconclusa.
2. **Encontrar personas y materiales.** Dueño del sistema, operador, experto de negocio, administradores y proveedor. Contrastar documentación con configuración, código, ejemplos y experiencia.
3. **Obtener acceso limitado.** Identificar quién concede permisos, ambientes disponibles y referencias de credenciales; nunca tratar una credencial encontrada como autorización.
4. **Reconstruir significado.** Determinar identidades, reglas de transformación, autoridad de cada dato y excepciones. Documentar desacuerdos sin resolverlos por similitud de nombres.
5. **Planear coexistencia y recuperación.** Separar cambios reversibles de efectos externos que requieren conciliación o compensación.
6. **Implementar y probar por incrementos.** Verificar contratos y casos de negocio, incluyendo resultados ambiguos y fallos de un extremo.
7. **Acordar la puesta en marcha.** Preparar responsable de guardia, canales de comunicación, criterios de avance y límites de intervención.
8. **Observar efectos y conciliar.** Distinguir proceso ejecutado, solicitud aceptada y estado final confirmado.
9. **Transferir responsabilidad y evolucionar.** Mantener decisión, evidencia, owners y contratos; volver a evaluar cuando cambie cualquiera de ellos.

Los pasos son una síntesis de los casos, no una descripción literal de un solo proyecto. El acceso puede bloquear el descubrimiento; una prueba puede revelar un desacuerdo de negocio; un incidente puede obligar a reabrir el diseño. [S01], [S02], [S03], [S04], [S05], [S06], [S07], [S08], [S09], [S10], [S17], [S34]

### Lo que la documentación no puede sustituir

- Un diagrama describe intención; las trazas y la configuración muestran recorridos observados.
- Un owner nominal no identifica necesariamente al experto ni al autorizante.
- Un esquema define representación, no quién decide qué significa “cliente activo”.
- Un sandbox exitoso no demuestra paridad con producción.
- Un log confirma lo registrado, no todos los efectos posibles.

Estas distinciones son inferencias que orientan las entrevistas; no se afirma que todas ocurran en cada empresa.

## 5. Human pain map

| Carga | Manifestación concreta | Evidencia y confianza | Qué medir en campo |
|---|---|---|---|
| Incertidumbre / conocimiento incompleto | No saber qué dependencia o excepción falta | FDE y legado; cualitativa [S09], [S10] | Tiempo hasta tener alcance validado; incógnitas que cambian el plan |
| Context switching | Alternar repos, tickets, documentos, personas y paneles | Coordinación durante incidentes; [S01] | Cambios de contexto y tiempo de reconstrucción |
| Miedo a romper producción | Revisión intensiva, postergación o necesidad de respaldo experto | Riesgo demostrado; emoción individual inferida, no medida [S03], [S04] | Autorreporte separado de incidentes y tiempo de revisión |
| Responsabilidad sin control | Depender de un proveedor o dueño de otro extremo | Legado y pagos [S05], [S09] | Tiempo bloqueado y decisiones fuera de autoridad |
| Credenciales y seguridad | Determinar permisos, caducidad y exposición | Requisitos documentados [S27], [S28], [S29] | Espera por acceso, fallos por credencial y alcance excesivo |
| Integridad semántica | Elegir reglas de identidad, reconciliación y transformación | Patrones CRM y migraciones [S02], [S17] | Discrepancias de negocio y cambios tardíos de mapping |
| Debugging entre fronteras | Logs incompletos, IDs incompatibles, fallos parciales | Context propagation y operaciones [S08], [S31] | Tiempo hasta localizar y confirmar el efecto |
| Verificación manual | Comprobar excepciones o recuperación no automatizada | Postmortem y documentos [S03], [S25] | Horas y defectos detectados únicamente por personas |
| Dependencia del proveedor | Modificaciones o límites fuera del calendario local | Política Slack [S23] | Interrupciones/retrabajo atribuibles al tercero |
| Rediscovery | Volver a preguntar por qué se tomó una decisión | Continuidad de agentes y transferencia en FDE [S10], [S35] | Tiempo de relevo; decisiones contradictorias |
| Dificultad para delegar | El revisor debe reconstruir todo para confiar | Hipótesis derivada de autoridad, evidencia y continuidad | Tiempo neto ahorrado después de revisar |
| Política / ownership | Nadie quiere asumir excepciones o conflictos de prioridades | Evidencia directa insuficiente en esta muestra | Episodios concretos, responsables y demora; no etiquetar toda espera como “política” |
| Mantenimiento e incidentes | Carga que continúa después del go-live | Casos y capacidades operativas [S05], [S07], [S11] | Horas/mes por integración y llamadas fuera de horario |

### Una misma situación, cuatro cargas diferentes

| Situación | Complejidad técnica | Carga cognitiva | Coordinación organizacional | Responsabilidad/riesgo |
|---|---|---|---|---|
| Nuevo campo “cliente” | Cambio de schema | Comprender qué entidad significa | Acordar con ventas/operación | Evitar asociar registros incorrectos |
| Acceso a producción | Configurar identidad y red | Reconstruir permisos efectivos | Obtener decisión del owner | Limitar exposición y efectos |
| Timeout de escritura | Reintento y estado distribuido | Saber qué ocurrió realmente | Consultar al dueño del otro extremo | No duplicar la operación |
| Cambio de proveedor | Adaptación del contrato | Reaprender diferencias | Negociar calendario y aceptación | Preservar continuidad del proceso |
| Relevo a otro ingeniero/agente | Recuperar artefactos | Reconstruir razones y excepciones | Confirmar transferencia de ownership | Mantener decisiones y límites vigentes |

La matriz es una descomposición analítica de las situaciones anteriores. Evita usar “complejidad” como una única explicación.

**Separación causal:** reducir líneas de código puede reducir complejidad de implementación sin reducir espera por acceso. Agregar approvals puede delimitar responsabilidad y simultáneamente aumentar carga cognitiva. El resultado a optimizar es trabajo total y calidad de decisión, no cantidad de automatización.

## 6. Responsibility/risk map

Matriz propuesta a partir de los casos; los roles deben confirmarse en cada organización. La plataforma registra y verifica las decisiones; no asigna unilateralmente autoridad.

| Responsabilidad | Quién debería decidir / quién ejecuta | Evidencia exigible | Riesgo residual |
|---|---|---|---|
| Significado y fuente de verdad | Dueño del proceso/dato con ingeniero | Mapping aprobado, ejemplos y excepciones | Consenso incorrecto o incompleto |
| Acceso y exposición | Dueño del sistema y seguridad; administrador habilita | Identidad, recurso, propósito, alcance y caducidad | Permiso técnico más amplio que el trabajo autorizado |
| Diseño técnico | Ingeniero responsable con owners afectados | Alternativas, contratos, dependencias y criterios | Dependencias no descubiertas |
| Integridad del cambio | Ingeniero y propietario del dato | Baseline, validaciones y conciliación | Corrupción silenciosa o resultados ambiguos |
| Despliegue | Responsable de operación/cambio | Revisión, versión, ventana y aceptación | Cambio simultáneo de otro equipo |
| Recuperación | Dueños de ambos extremos; ingeniero coordina | Restauración probada o compensación definida | Efectos que no pueden deshacerse |
| Operación | Owner de la integración y equipos de extremos | SLO del proceso, alertas, runbook y escalamiento | Huecos de observabilidad y fatiga |
| Evolución | Owner del contrato y consumidores | Aviso, impacto, compatibilidad y retiro | Consumidor desconocido |
| Delegación a IA | Autoridad humana competente; agente ejecuta alcance dado | Permiso vinculado a acción y estado, registro de efectos | Acción tardía o uso de contexto no confiable |
| Transferencia | Responsable saliente y receptor | Aceptación del handoff y conocimiento recuperable | Documentación desactualizada |

Derivación: [S01], [S08], [S09], [S17], [S28], [S31], [S34].

**Rollback no es una propiedad universal.** Revertir un commit no retira un mensaje enviado, no deshace un pago y no revierte automáticamente datos ya consumidos por otro sistema. La compensación es una operación de negocio que puede ser incompleta. El plan debe separar restauración técnica, compensación y conciliación. [S08], [S32], [S40]

## 7. Technical failure modes

| Mecanismo | Por qué la conexión puede parecer sana | Prueba que aporta evidencia |
|---|---|---|
| Mismatch semántico | Tipos válidos, significado equivocado | Ejemplos de negocio y casos límite aprobados |
| Timeout después de efecto | No llegó respuesta aunque sí hubo escritura | Consulta por identidad de operación; estado desconocido explícito |
| Reintento inseguro | La recuperación duplica un efecto | Repetir solicitud e inspeccionar estado final |
| Desorden/replay | Todos los eventos llegaron, pero aplicados incorrectamente | Eventos repetidos y fuera de orden por entidad |
| Escritura parcial | Un extremo confirma y otro falla | Cortar entre pasos y probar conciliación/compensación |
| Drift de esquema/configuración | El job sigue corriendo con otra interpretación | Comparar contrato, configuración y salidas esperadas |
| Truncamiento/omisión | Finaliza un lote incompleto | Conteos por etapa, identidades y cobertura |
| Credential/permission drift | La conexión existe pero pierde operaciones | Pruebas de permisos efectivos y expiración |
| Entorno no representativo | Test pasa con volumen, roles o datos distintos | Registrar diferencias relevantes y validar progresivamente |
| Observabilidad fragmentada | Cada componente reporta éxito local | Correlación más verificación empresarial extremo a extremo |
| Recuperación no ensayada | Hay backups/configuración de retry | Restauración aislada y validación del resultado |
| Concurrencia | Dos ejecuciones parten de la misma versión | Rechazo de precondición obsoleta y detección de conflicto |
| IA con contexto incompleto | Produce explicación y código plausibles | Cobertura de contexto y verificación independiente |
| Intervención tardía | Se cancela el agente después del efecto externo | Estado de cada intento y reconciliación posterior |

La tabla es una guía de evaluación, no una medición de tasas. Las familias técnicas se apoyan en [S08], [S19], [S21], [S22], [S23], [S28], [S31], [S37], [S38], [S39], [S40]. Las pruebas concretas son propuestas derivadas.

## 8. Existing tool landscape

“Qué queda al ingeniero” señala trabajo que la capacidad documentada no elimina; no afirma que el proveedor carezca de toda función adicional.

| Categoría / ejemplos examinados | Qué automatiza o representa | Qué requiere todavía criterio/contexto |
|---|---|---|
| iPaaS: Workato | Conexiones, recipes, entornos, operación y auditoría | Definir proceso, transformación, owners y aceptación [S11] |
| API management: MuleSoft | Reglas, policies, visibilidad y gobernanza de APIs/agentes/MCP | Definir reglas correctas y sus fronteras empresariales [S12], [S13] |
| Suite empresarial: SAP Integration Suite / Cloud ALM | Flujos, mensajes, mapeos y monitoreo híbrido | Configuración efectiva, semántica SAP/no SAP y responsables [S18] |
| ETL/ELT: Fivetran | Captura/replicación y manejo de cambios de esquema | Qué replicar, interpretar y validar en destino [S20] |
| CDC: Debezium | Eventos de cambios e historial de esquema | Configuración, retención, consumidores y semántica de replay [S19] |
| ESB / frameworks: Apache Camel | Rutas, transformación y patrones de mensajería | Diseño del flujo, pruebas y operación [S22] |
| Workflow automation / RPA: n8n, Power Automate | Ejecución de flujos, herramientas con revisión y UI automation | Excepciones, selectores y límites del permiso [S33], [S38] |
| Integración/operación corporativa: ServiceNow | Integration Hub y relación con descubrimiento/CMDB/service maps | Cobertura real y mantenimiento de datos organizacionales [S14] |
| Datos + operaciones + agentes: Palantir Foundry/AIP | Ontología, Actions, permisos y trazabilidad; escenarios | Modelar correctamente la organización y gestionar sus límites [S15], [S16] |
| Ejecución durable: Temporal | Estado e historial de workflows; recuperación | Idempotencia de actividades y compensaciones de negocio [S40] |
| Agentes: LangGraph/LangSmith | Checkpoints, interrupciones, reanudación e inspección | Política, persistencia productiva y efectos antes de reanudar [S37] |
| MCP/tool integration | Contratos de herramientas y mecanismos de autorización | Confianza, contexto, semántica y decisión empresarial [S28] |
| Interoperabilidad de agentes: A2A | Descubrimiento, tareas, artefactos y comunicación | Autoridad compartida y consistencia de efectos [S39] |
| Coding agents / harnesses: Claude Agent SDK y trabajo de Anthropic | Generación, herramientas y continuidad entre sesiones | Verificación, contexto organizacional y evaluación del beneficio [S35], [S36], [S41] |
| Internal developer platforms: Backstage | Catálogo de software, owners y documentación | Curación y actualización de metadata por equipos [S30] |
| Servicios profesionales: Rocketlane | Proyectos de implementación y handoffs con clientes | Evidencia técnica de lo ejecutado y corrección del sistema [S34], [S42] |
| Secret management: HashiCorp Vault | Custodia y credenciales dinámicas/revocables | Legitimidad del acceso y ciclo completo de cada operación [S29] |
| Observabilidad: OpenTelemetry | Correlación entre procesos y servicios | Instrumentación, cobertura y significado del resultado [S31] |

### Competencia que invalida una tesis fácil

Palantir es el contraejemplo más importante a “nadie integra conocimiento organizacional, acciones gobernadas y agentes”: su documentación reúne esas áreas. ServiceNow, SAP y MuleSoft también obligan a competir contra sistemas amplios, no contra conectores aislados. [S12], [S13], [S14], [S15], [S16], [S17], [S18]

Además, el rival práctico puede ser **la combinación instalada** de catálogo + tickets + documentación + CI/CD + vault + observabilidad + plataforma de integración. Cognituum debe demostrar una mejora neta frente a esa combinación, incluyendo costo de mantener otra representación.

No se hizo una evaluación exhaustiva de todas las ediciones, productos o proveedores del mercado. “No demostrado por esta búsqueda” no significa “nadie lo hace”.

## 9. What has become commodity

Commodity significa que existe oferta madura reutilizable; no que sea gratuito, trivial ni idéntico entre proveedores.

- Transporte HTTP, clientes y conectores para productos habituales.
- Routing y patrones de mensajería.
- Replicación y parte de la adaptación de esquemas.
- Custodia de secretos e integración con proveedores de identidad.
- Entornos, logs y ejecución programada/durable.
- Catálogos y metadata de ownership.
- Checkpoints y pausas para revisión en frameworks de agentes.

Evidencia de oferta: [S11], [S12], [S13], [S14], [S19], [S20], [S22], [S27], [S29], [S30], [S37], [S40].

**No se comoditiza automáticamente:** saber qué campo representa una obligación empresarial, qué evidencia permite un cambio concreto ni quién puede aceptar su riesgo. Un catálogo disponible también necesita productores y mantenimiento de metadata.

## 10. What remains unsolved

“Unsolved” se divide en tres estados para evitar afirmar un vacío universal:

| Problema residual | Estado de la evidencia | Consecuencia de producto |
|---|---|---|
| Acordar significado entre áreas | Necesita conocimiento situado; hay herramientas de modelado | Ayudar a explicitar y probar, no decidir por el dueño del dato |
| Descubrir toda dependencia oculta | Cobertura completa no demostrable en entornos abiertos | Informar cobertura y límites; evitar promesa de mapa total |
| Autoridad entre organizaciones | Plataformas cubren ámbitos propios; composición depende del caso | Vincular autorizaciones a acciones concretas y respetar revocación |
| Evidencia del efecto de negocio | Logs/diffs no bastan para todas las superficies | Verificadores específicos y resultado desconocido cuando corresponda |
| Recuperación de efectos externos | No hay rollback genérico de todo efecto | Compensación y conciliación por dominio |
| Continuidad entre herramientas/personas/modelos | Soluciones parciales y competencia fuerte | Medir reuso y reconstrucción, no tamaño de la memoria |
| Vigencia del conocimiento | Catálogos, contratos y contexto envejecen | Invalidación, owner y revalidación |
| Reducción neta de carga | No probada por la existencia de una función | Medir tiempo incluyendo revisión y mantenimiento |
| Disposición a pagar por una capa adicional | Desconocida | Entrevistas con presupuesto y pilotos pagados |

Síntesis e inferencias de [S01], [S08], [S09], [S10], [S15], [S16], [S17], [S30], [S35], [S36]. No se ha demostrado que la combinación propuesta constituya una categoría nueva.

## 11. Integration lifecycle

### Corrección del lifecycle inicial

El proceso empieza con **resultado, responsabilidad y alcance**, antes de explorar ampliamente. Authority/access atraviesa todo el ciclo: expira y cambia. Validación también es continua. Tras desplegar hay una fase explícita de **aceptación y transferencia operacional**. La sustitución termina con conciliación, retiro de accesos y conservación de conocimiento.

Recorrido de referencia:

**Encuadre → descubrimiento ↔ acceso → comprensión/modelado ↔ mapping → diseño de operación y recuperación → implementación → validación → despliegue → aceptación/handoff → observación ↔ intervención → mantenimiento/evolución → sustitución/retiro.**

No representa una cascada obligatoria. Es una síntesis de prácticas documentadas en [S02], [S09], [S10], [S17], [S18], [S19], [S20], [S21], [S22], [S30], [S34], [S37], [S40].

### Inputs, decisions, human responsibility, automatable work

| Etapa | Inputs | Decisiones | Responsabilidad humana | Trabajo automatizable |
|---|---|---|---|---|
| 1. Encuadre | Pedido, proceso, restricciones | Resultado, límites, criticidad y quién acepta | Sponsor, dueño de proceso e ingeniero acuerdan | Consolidar materiales y preguntas pendientes |
| 2. Descubrimiento | Inventarios, repos, docs, entrevistas | Fuentes confiables y cobertura necesaria | Confirmar owners y dependencias conocidas | Extraer metadata y relaciones observables |
| 3. Acceso | Sistemas identificados y propósito | Roles, recursos, duración y ambientes | Dueños/seguridad conceden; ingeniero limita uso | Solicitudes, comprobaciones y referencias |
| 4. Comprensión/modelado | Esquemas, muestras, configuración y expertos | Entidades, estados, IDs y fuente de verdad | Dueños de datos resuelven significado | Perfilar, comparar y señalar contradicciones |
| 5. Mapping | Modelo y casos de negocio | Transformaciones, defaults y excepciones | Aprobar equivalencias y pérdida aceptable | Proponer mappings y generar casos |
| 6. Diseño | Contratos y requisitos operativos | Sincronía, consistencia, errores, recuperación | Ingeniero diseña; owners aceptan límites | Simulación acotada y revisión de patrones |
| 7. Implementación | Diseño aprobado y ambientes | Componentes, adaptadores y configuración | Mantener alcance y trazabilidad | Generar código/configuración y ejecutar checks |
| 8. Validación | Versión candidata, fixtures y invariantes | Suficiencia, defectos y riesgos residuales | Validadores y negocio aceptan evidencia | Pruebas de contratos, fallos y conciliación |
| 9. Despliegue | Artefactos verificados y permiso vigente | Orden, lote, ventana y límites de avance | Operador controla puesta en marcha | Gates, canary, snapshots y registro |
| 10. Aceptación/handoff | Resultados reales, manuales y alertas | Aceptación y ownership estable | Receptor acepta servicio y excepciones | Reunir evidencia y registrar pendientes |
| 11. Observación | Eventos, métricas y resultados | Umbrales y necesidad de revisión | Owner mantiene criterio y atención | Alertas, conciliación y detección de drift |
| 12. Intervención | Incidente, estado parcial y evidencia | Pausar, reparar, compensar o escalar | Responsables coordinan y autorizan | Recopilar hechos y ejecutar pasos acotados |
| 13. Mantenimiento/evolución | Cambios de APIs, permisos y necesidades | Compatibilidad y decisiones a reabrir | Owners coordinan modificación | Comparar versiones y volver a probar |
| 14. Sustitución/retiro | Nuevo recorrido, consumidores y retención | Corte final y qué conservar/eliminar | Dueños aceptan cierre y responsabilidades | Detectar uso remanente, conciliar y archivar |

### Required evidence, risks, failure modes, knowledge that must survive

| Etapa | Evidencia requerida | Riesgo | Modo de fallo | Conocimiento que debe sobrevivir |
|---|---|---|---|---|
| 1 | Criterio de aceptación y responsables | Resolver el problema equivocado | Conexión exitosa sin valor operativo | Motivo, límites y definición de éxito |
| 2 | Fuentes fechadas, owners y cobertura | Dependencia invisible | Mapa presentado como completo | Procedencia y dudas pendientes |
| 3 | Permiso efectivo por recurso/acción | Exposición o bloqueo | Credencial válida usada fuera de propósito | Quién autorizó, alcance y caducidad |
| 4 | Ejemplos validados y modelo | Significado equivocado | Mismo nombre, entidad diferente | Definiciones y razones |
| 5 | Mapping revisado con excepciones | Corrupción silenciosa | Default oculta un dato inválido | Equivalencias, pérdidas y casos límite |
| 6 | Diseño de fallos y recuperación | Estado parcial irreversible | Retry duplica efecto | Garantías, límites y compensaciones |
| 7 | Diff/config y versión de entradas | Cambio fuera de alcance | Componente correcto, configuración incorrecta | Implementación vinculada al diseño |
| 8 | Resultados, cobertura y limitaciones | Falsa confianza | Sólo happy path o entorno irreal | Fixtures, invariantes y defectos aceptados |
| 9 | Estado previo, permiso y resultados por lote | Daño durante transición | Consumidor usa contrato incompatible | Orden, participantes y puntos de corte |
| 10 | Aceptación explícita y runbook usable | Servicio huérfano | Nadie atiende una excepción | Owner, compromisos y contactos |
| 11 | Señales con cobertura y frescura | Desviación silenciosa | Jobs verdes con negocio incorrecto | Baselines, umbrales y significado |
| 12 | Cronología y estado por efecto | Reparación agrava incidente | Acción basada en observación obsoleta | Hipótesis, decisiones y resultados |
| 13 | Delta y revisión de consumidores | Regresión tardía | Una parte cambia sin avisar | Motivo del cambio y compatibilidad |
| 14 | Conciliación final y retiro confirmado | Pérdida o dependencia residual | Se apaga un sistema aún usado | Linaje, acceso a historia y reglas de retiro |

Estas tablas son requisitos derivados, no claims de que una herramienta ya los cumpla. La evidencia mínima debe ser proporcional a la criticidad: una importación descartable no necesita el mismo proceso que un flujo de cobro.

## 12. AI-native integration implications

### Descubrimiento seguro

Un agente puede inventariar fuentes autorizadas y proponer relaciones, pero cada conclusión debe distinguir observación, inferencia y desconocimiento. Incluso la lectura puede exponer datos o cargar un sistema. El alcance debe incluir recursos, volumen y destinos permitidos.

**Contexto mínimo derivado:** resultado humano; identidad y versiones de sistemas; contratos; definiciones; owners; límites de acceso; decisiones vigentes; acciones prohibidas; estado de la ejecución; pruebas y criterios de intervención.

MCP reduce fricción de herramienta, pero su guía de seguridad trata explícitamente problemas como confused deputy y token passthrough. No convierte texto encontrado en autoridad. [S28]

### Autoridad y credenciales

La aprobación debe identificar una acción y sus condiciones. Si cambian objeto, versión o permiso, debe revisarse su vigencia. Los secretos pertenecen al mecanismo de ejecución autorizado; no deben usarse como memoria conversacional. Custodia y credenciales temporales ya son capacidades de mercado. [S29]

### Continuidad entre sesiones/modelos

Se necesita conservar decisiones y sus fuentes, no solamente transcripciones. Un nuevo agente debe poder distinguir “vigente”, “supersedido”, “propuesto” y “sin verificar”. Anthropic ya documenta artefactos de continuidad y harnesses que persisten sesiones; por eso memoria y cambio de sesión no constituyen diferenciación por sí solos. [S35], [S41]

### Múltiples agentes y repositorios

Más ejecutores aumentan el problema de concurrencia: revisión obsoleta, escrituras incompatibles, permisos heredados indebidamente y evidencia fragmentada. Git controla parte del código, no la transacción que involucra una base, un SaaS y un email.

Requisitos derivados: identidad de trabajo e intento; precondiciones; coordinación por recurso; registro de resultados tardíos; verificación por sistema; reconciliación del conjunto. **Dos modelos coincidiendo no equivalen a dos verificaciones independientes.**

### Intervención

Pausar antes de ejecutar, cancelar trabajo futuro y reparar efectos consumados son capacidades diferentes. LangGraph ofrece interrupciones y persistencia, y advierte que efectos previos a una interrupción deben ser idempotentes. [S37] La interfaz humana necesita mostrar exactamente qué ocurrió y qué sigue incierto.

### Local y frontera

Los modelos locales pueden procesar material que una organización decide mantener dentro de su entorno; eso no demuestra ausencia de telemetría, aislamiento ni calidad suficiente. Modelos de frontera pueden ayudar con análisis o generación sobre contexto permitido. La selección debe usar evaluaciones por tarea y una política verificable de datos, no la suposición de que “más potente” autoriza mayor exposición.

No se investigó ni comprobó una configuración productiva de residencia de datos para Cognituum en esta misión.

### Evidencia de ejecución necesaria

Como requisito analítico, cada acción importante debería permitir reconstruir:

- intención y decisión aplicable;
- actor humano/agente, modelo/runtime y versiones;
- permiso y precondiciones usados;
- entradas referenciadas sin secretos;
- acción intentada e identificador de intento;
- recibo del proveedor o del sistema;
- observación posterior y cobertura;
- resultado confirmado, fallido, parcial o desconocido;
- revisión/intervención y relación con otros efectos.

Es una propuesta de contenido probatorio, no un nuevo schema aprobado.

### Qué está abierto

Determinar beneficio neto, portabilidad de contexto útil, verificación de efectos heterogéneos y coordinación de autoridad sigue dependiendo del caso. A2A ofrece interoperabilidad de comunicación; no demuestra por sí mismo consistencia transaccional o transferencia legítima de autoridad. [S39]

METR encontró ralentización en su experimento de 2025, pero su actualización de 2026 explica sesgos que impiden extrapolar ese resultado a herramientas actuales. No corresponde afirmar ni “la IA siempre acelera” ni “la IA siempre retrasa”. [S36]

## 13. Capability model

Clasificaciones: **ESSENTIAL** para responsabilidad operacional; **HIGH VALUE** para reducir carga; **COMMODITY** cuando hay oferta reutilizable; **EMERGING** si su aplicación integral aún necesita validación; **UNPROVEN** si falta evidencia de utilidad. La categoría principal no impide que una capacidad esencial use componentes commodity.

| ID | Capacidad derivada | Dolor/responsabilidad demostrada | Clase | Criterio observable de utilidad |
|---|---|---|---|---|
| C01 | Inventario situado con owners, versiones y cobertura | Descubrimiento y coordinación [S09], [S10], [S30] | ESSENTIAL | Cada dependencia usada tiene fuente o desconocimiento explícito |
| C02 | Contrato semántico y mapping revisable | Fuente de verdad y exactitud [S17], [S32] | ESSENTIAL | Ejemplos de negocio verificados y desacuerdos visibles |
| C03 | Alcance y autoridad por operación | Identidad no equivale a permiso [S13], [S16], [S28] | ESSENTIAL | Ningún efecto fuera de recurso/acción/condiciones concedidos |
| C04 | Custodia y entrega limitada de credenciales | Exposición, rotación y revocación [S29] | COMMODITY | Secreto no aparece en contexto/logs y revocación funciona |
| C05 | Validación representativa y criterios de aceptación | Confiabilidad del cambio [S02], [S25], [S43] | ESSENTIAL | Pruebas incluyen fallos y resultado empresarial |
| C06 | Ejecución acotada, incremental e intervenible | Efectos y recuperación [S08], [S37], [S40] | ESSENTIAL | Se puede limitar avance y reconstruir estado parcial |
| C07 | Evidencia de efectos y conciliación | Resultado ambiguo/inconsistente [S08], [S32] | ESSENTIAL | Recibo y estado observado distinguidos |
| C08 | Recuperación/compensación por dominio | Efectos no reversibles [S04], [S40] | ESSENTIAL | Recuperación ensayada o límite explícito aceptado |
| C09 | Decisiones persistentes con vigencia y procedencia | Rediscovery y relevo [S10], [S35] | HIGH VALUE | Otro ingeniero retoma sin reconstrucción extensa |
| C10 | Observación del proceso y drift | Mantenimiento y debugging [S19], [S23], [S31] | ESSENTIAL | Detecta incumplimiento de resultado, no sólo caída |
| C11 | Handoff y coordinación entre owners | Responsabilidad distribuida [S01], [S34] | HIGH VALUE | Responsable receptor acepta y conoce excepciones |
| C12 | Transporte y conectores reemplazables | Intercambio repetitivo [S20], [S22] | COMMODITY | Usa implementación existente con contrato comprobado |
| C13 | Contexto y ejecución portables entre modelos | Continuidad y restricciones [S35], [S39], [S41] | EMERGING | Cambia ejecutor sin perder significado ni ampliar permiso |
| C14 | Cobertura y desconocimiento explícitos | Confianza excesiva [S25], [S36] | HIGH VALUE | Conclusión identifica evidencia faltante que la limita |
| C15 | Descubrimiento total y mapping autónomo universal | Promesa sin respaldo suficiente | UNPROVEN | No hay evidencia para declararlo capacidad alcanzada |

No se deriva la necesidad de un producto nuevo para cada fila. Algunas deben resolverse integrando herramientas que el cliente ya tiene.

## 14. Cognituum capability mapping

### Regla de clasificación y alcance

- **SUPPORTED:** implementación inspeccionada para el alcance indicado; no certifica producción.
- **PARTIALLY SUPPORTED:** primitivas implementadas sin recorrido integral demostrado.
- **ARCHITECTURALLY POSSIBLE:** contrato/intención pertinente, implementación necesaria.
- **MISSING:** falta un tramo material identificado en el recorrido inspeccionado.
- **UNKNOWN:** no existe evidencia suficiente para concluir soporte o ausencia.

Snapshot: HEAD observado **0c69940f36cd20c175e2e7faa3dc564b1bec8c80**, más archivos del working tree. La auditoría Location del 15 de septiembre era un archivo no seguido por Git y se trató como evidencia documental, no código. Había una eliminación preexistente en docs/ANAYSIS/BACKEND/ROLES. No se modificó estado funcional ni Git. Git informó acceso denegado a brain/.pytest_cache; no afectó el código citado.

### Cada capacidad externa contra evidencia local

| Capacidad | Estado integral | Evidencia y límite |
|---|---|---|
| C01 Inventario situado | PARTIALLY SUPPORTED | Referencias Domain/Gene y nodos Gravity existen; Location documenta falta de productor canónico conectado. No acredita inventario de ERP/SaaS/personas [L01], [L02] |
| C02 Semántica/mapping | ARCHITECTURALLY POSSIBLE | ASM propone reunir contexto; no es motor implementado de mappings ni conciliación [L03] |
| C03 Autoridad | PARTIALLY SUPPORTED | DecisionEvaluator verifica principal, scope, rol, expiración y controles; puente a efectos arbitrarios de integración no demostrado [L04], [L08] |
| C04 Credenciales | PARTIALLY SUPPORTED | Wrapper de OS keyring implementado; autorización visible en Vault centrada en RoleMaster y scopes. No prueba leases por operación ni custodia integral de todos los sistemas [L05] |
| C05 Validación | PARTIALLY SUPPORTED | Impact tiene evaluadores deterministas limitados; no descubre hechos ni prueba integraciones externas [L06] |
| C06 Ejecución/intervención | ARCHITECTURALLY POSSIBLE | Executor especifica aislamiento, fences, pause/cancel y promoción. Target source ausente; staging con contratos, sin runtime neutral implementado [L08] |
| C07 Evidencia/conciliación | PARTIALLY SUPPORTED | Resultados de Actions y effect ledger durables; no verificadores de efectos ERP/CRM/email ni conciliación integral [L07], [L09] |
| C08 Recuperación | MISSING | No se identificó recorrido de compensación/restauración multisistema de integraciones. Estado durable y recuperación de software no lo sustituyen [L07], [L08], [L09] |
| C09 Decisiones persistentes | PARTIALLY SUPPORTED | Intents, estados y Postures persistidos; vigencia de decisiones sobre contratos externos no demostrada [L02], [L07], [L09] |
| C10 Observación/drift | PARTIALLY SUPPORTED | Telemetría y estados locales; Impact no observa. Monitor del proceso empresarial no verificado [L06], [L09] |
| C11 Coordinación/handoff | ARCHITECTURALLY POSSIBLE | Mandates y concepto Constellation pertinentes; aceptación entre owners externos no demostrada [L09], [L12] |
| C12 Conectores | UNKNOWN | La muestra no verifica catálogo operativo de conectores organizacionales; no se infiere ausencia global [L01], [L02], [L03], [L04], [L05], [L06], [L07], [L08], [L09], [L10], [L11], [L12] |
| C13 Portabilidad IA | PARTIALLY SUPPORTED | Routing distingue runtime y backend/model con filtro de privacidad; Brain usa Ollama para embeddings. No prueba sustitución de ejecución con efectos equivalentes [L10], [L11] |
| C14 Cobertura/desconocimiento | PARTIALLY SUPPORTED | Impact expresa indeterminación y cobertura; ASM/Location lo requieren conceptualmente, sin flujo conectado [L01], [L03], [L06] |
| C15 Autonomía universal | UNKNOWN | Ninguna demostración material; no debe convertirse en compromiso de producto |

### Primitivas solicitadas, una por una

| Primitiva | Estado observado | Alcance real |
|---|---|---|
| Genesis | PARTIALLY SUPPORTED | Activities y llamadas Brain presentes; scaffoldDryRun reconoce ausencia de clustering real y scaffoldReal no acredita un dominio productivo completo [L09] |
| Domains / Genes | PARTIALLY SUPPORTED | DomainRef, GeneRef y proyección no prueban contenido canónico recuperable [L01], [L02] |
| Location | MISSING | Cierre documentado NOT_SUPPORTED extremo a extremo; contrato candidato [L01] |
| ASM | ARCHITECTURALLY POSSIBLE | Research v0.2 y spec; productor/consumidor físico no demostrado [L03] |
| Intents | SUPPORTED, alcance local | IntentManager tiene creación, hidratación, turnos y finalización; no certifica integración externa [L07] |
| Postulates | ARCHITECTURALLY POSSIBLE | Propuesta y separación de adopción en ASM; no se verificó recorrido de adopción/sello [L03] |
| Mandates | PARTIALLY SUPPORTED | Workflow y persistencia implementados; alcance distinto de ejecución universal [L09] |
| Orbital | ARCHITECTURALLY POSSIBLE | Fundamentos de coordinación; no se demostró runtime integral de integración [L12] |
| Constellation | ARCHITECTURALLY POSSIBLE | Coordinación entre Mandates definida en glosario, no probada operacionalmente [L12] |
| Nucleus | PARTIALLY SUPPORTED | Autoridad y persistencia concretas; no implica cobertura de todo efecto externo [L04], [L09] |
| Gravity / Postures | SUPPORTED, alcance local | Modelo, store versionado, ResolveActive e interpretación implementados [L02] |
| Monitor | UNKNOWN | Supervisión de procesos encontrada no acredita el componente de observación empresarial solicitado; Impact lo excluye [L06] |
| Impact | SUPPORTED, alcance limitado | Coexistence, preservation y compliance sobre criterios/observaciones suministrados; no predicción universal ni permiso [L06] |
| Evidence | PARTIALLY SUPPORTED | Resultados persistidos, ledger y contratos; comprobación externa independiente pendiente [L07], [L08], [L09] |
| Vault Shield | UNKNOWN | Descripción de UI en BTIPS; no se verificó implementación vinculada a cada acceso. Separado del keyring [L05], [L13] |
| Roles / authority | SUPPORTED como evaluador | Evaluación implementada; enforcement integral PARTIALLY SUPPORTED [L04] |
| Organizational boundaries | PARTIALLY SUPPORTED | Binding organizacional y scopes existen; coherencia completa de identidades no demostrada [L01], [L04] |
| Brain / semantic knowledge | PARTIALLY SUPPORTED | Consultas Chroma y embeddings Ollama; similitud no certifica hechos ni vigencia [L11] |
| Decision persistence | PARTIALLY SUPPORTED | Estado/criterio persistidos; continuidad semántica externa no probada [L02], [L07] |
| Multi-model execution | PARTIALLY SUPPORTED | Decisión de routing material; ejecución interoperable sigue pendiente [L08], [L10] |
| Local/frontier AI | PARTIALLY SUPPORTED | Embeddings locales y política de selección; no prueba residencia ni equivalencia de capacidades [L10], [L11] |
| Pause/resume/abort | ARCHITECTURALLY POSSIBLE | Estado objetivo de Executor; no se probó intervención real por este puerto [L08] |
| Execution-provider replaceability | ARCHITECTURALLY POSSIBLE integralmente | Norma y routing distinguen ejecutor/modelo; adapters neutrales pendientes [L08], [L10] |
| Orrery | PARTIALLY SUPPORTED como prototipo | data.ts contiene objetos ficticios y recorrido simulado; no consola operativa demostrada [L01] |

Dos límites de implementación son especialmente relevantes: PayloadBuilder agrega archivos cuando la extracción devuelve contenido, pero esa estructura por sí sola no implementa el bloqueo por faltante crítico requerido por ASM; EffectLedger declara una interfaz MandateStateReader deliberadamente no conectada. [L03], [L07]

## 15. Missing Cognituum capabilities

Son brechas contra C01–C15, no un backlog autorizado:

1. **Fuente material de contexto situado:** identidad coherente y productores/resolvers de Location, Domain y Gene.
2. **Contrato semántico de integración:** mapeos, dueños de atributos, excepciones y casos de aceptación vinculados a versiones.
3. **Enforcement de extremo a extremo:** autorización vigente conectada a ejecución y efectos externos; un evaluador no basta.
4. **Ejecución neutral implementada:** límites, intervención y evidencia de Executor conforme a sus gates existentes.
5. **Verificación por superficie:** comprobar estado real en cada sistema, distinguiendo aceptación de finalización.
6. **Recuperación del conjunto:** compensaciones, resultados desconocidos, replay y conciliación.
7. **Observación empresarial y vigencia:** señales adquiridas, baseline, drift y revalidación.
8. **Handoff operacional:** owner receptor, excepciones y criterios que sobreviven al proyecto.
9. **Evaluación del beneficio:** evidencia de menor carga neta y mejor calidad de decisiones.

Brechas 1 y 4 tienen ausencia material documentada. Las restantes combinan falta de recorrido demostrado y necesidades externas; no se afirma que cada función esté ausente en toda rama o instalación. [L01], [L02], [L03], [L04], [L05], [L06], [L07], [L08], [L09], [L10], [L11], [L12], [L13]

## 16. Potential protocol-level advantages

### Hipótesis precisa

Podría tener valor que la intención, el criterio vigente, la autoridad y la evidencia permanezcan relacionables cuando cambian personas, herramientas o modelos. **Una colección de nombres no demuestra esa propiedad.**

| Posible ventaja | Qué tendría que conservar | Solapamiento existente | Prueba que falta |
|---|---|---|---|
| Decisión independiente del ejecutor | Significado, versión, autor y justificación | Documentación/ADRs, harnesses, catálogos | Otro runtime retoma sin reinterpretación ni pérdida |
| Autoridad verificable durante el cambio | Scope, revocación y condiciones | IAM, plataformas gobernadas | Cambiar permisos durante una ejecución impide efectos no autorizados |
| Evidencia que enlaza decisión y efecto | Entrada, permiso, intento, recibo y observación | Tracing, logs, lineage y Actions | Reconstrucción entre varias herramientas con huecos visibles |
| Criterio que sobrevive al tiempo | Vigente/supersedido y causa de revalidación | Policy engines y gobernanza | Cambio de contrato invalida conclusiones dependientes |
| Trabajo con contexto local/restringido | Política de exposición y artefactos transferibles | Despliegues locales e infraestructura de IA | Beneficio y cumplimiento medidos en un caso real |

Competencia: [S12], [S13], [S14], [S15], [S16], [S28], [S29], [S30], [S31], [S35], [S37], [S39], [S40], [S41]. Fundamento local, todavía parcial: [L02], [L03], [L04], [L05], [L06], [L07], [L08], [L09], [L10], [L11], [L12].

**La oportunidad estructural no está validada como exclusividad.** La prueba relevante es si Cognituum reduce el esfuerzo de composición y la incertidumbre por encima de una combinación razonable de herramientas existentes. Si necesita replicar todo el catálogo y todos los flujos para hacerlo, podría aumentar la carga.

No se propone otro protocolo ni se modifica BTIPS en este informe.

## 17. Evidence against our hypothesis

| Contraevidencia / explicación alternativa | Qué debilita |
|---|---|
| Plataformas amplias ya incluyen semántica, ownership, auditoría e intervención | “Sólo se ocupan de conectar” es una generalización falsa [S11], [S12], [S13], [S14], [S15], [S16], [S17], [S18] |
| Patrones maduros resuelven problemas repetidos | No toda integración necesita una plataforma nueva [S08], [S22], [S40] |
| Conectores y replicación administrada reducen trabajo sustancial | El valor puede estar en comprar/configurar bien lo existente [S20] |
| Integración simple, estable, reversible y con un owner | Hipótesis de dolor elevado no aplica necesariamente; segmento de contraste propuesto |
| El cuello puede ser autorización, contrato comercial o desacuerdo de negocio | Generar más código no reduce ese bloqueo [S09], [S17] |
| Una plataforma agrega curación, aprendizaje y aprobaciones | Puede empeorar el problema humano que promete resolver [S01], [S30] |
| Casos graves no establecen frecuencia | No se puede concluir “principal dolor” a partir de postmortems |
| Beneficio de IA depende de tarea, experiencia y época | No debe prometerse ahorro neto sin medición [S36] |
| Conservar decisiones equivocadas puede amplificar errores | La persistencia necesita revisión y supersesión, no sólo memoria |
| Readiness local incompleta | Una arquitectura alineada no valida una oferta actual [L01], [L03], [L08] |
| No hay comprador entrevistado ni piloto pagado | Dolor técnico no equivale a demanda de Cognituum |

**Resultado del test:** hipótesis de dolor condicionado, plausible y respaldada; centralidad general, frecuencia comercial, voluntad de pago y diferenciación exclusiva, no demostradas.

## 18. Questions for practitioner interviews

### Muestra propuesta

Entrevistar por separado ingenieros de integración, solutions/implementation engineers, FDEs, owners de operación/datos y compradores. Incluir equipos que usan plataformas maduras, equipos con soluciones propias y casos simples que no sufren el problema. Propuesta exploratoria: 12–18 entrevistas; no constituye muestra estadísticamente representativa.

### Preguntas ancladas en el último caso real

1. Mostrame la última solicitud de integración. ¿Qué resultado tenía que producir y quién lo aceptó?
2. ¿Qué sabías al empezar y qué descubriste demasiado tarde?
3. ¿Qué persona resultó indispensable aunque no figuraba como owner?
4. ¿Qué documento o esquema fue incorrecto? ¿Cómo se detectó?
5. ¿Cuánto tiempo fue trabajo activo y cuánto espera? Reconstruyamos tickets/fechas.
6. ¿Quién autorizó qué recursos? ¿Qué acceso sobró o faltó?
7. ¿Qué conceptos no significaban lo mismo entre sistemas?
8. ¿Quién decidió las transformaciones y excepciones? ¿Dónde quedó la decisión?
9. ¿Qué dato podía dañarse y quién respondía por eso?
10. ¿Cómo probaste sin afectar producción? ¿Qué diferencia del entorno te sorprendió?
11. ¿Qué podía revertirse y qué exigía compensación?
12. ¿Qué evidencia te permitió aprobar el cambio?
13. ¿Qué se rompió después y quién lo detectó?
14. ¿Cómo se transfiere a otra persona? Hagamos que encuentre la decisión sin ayuda.
15. ¿Qué herramienta resolvió bien el problema? ¿Qué trabajo siguió haciéndose fuera?
16. Si usaste IA, ¿cuánto tiempo ahorró después de revisar y corregir?
17. ¿Qué no le delegarías y qué evidencia necesitarías para hacerlo?
18. ¿Qué cambia cuando dos agentes trabajan sobre distintos repos/sistemas?
19. ¿Qué material no puede salir del entorno? ¿Quién define esa regla?
20. ¿Qué fue estresante personalmente? Separar sensación, riesgo y complejidad.
21. ¿Hubo un desacuerdo de prioridades o autoridad? ¿Cómo se resolvió?
22. ¿Quién pagaría para reducir este trabajo y desde qué presupuesto?
23. ¿Qué gasto o actividad reemplazaría? ¿Qué adquisición se rechazó y por qué?
24. ¿Aceptarían una prueba pagada sobre un cambio próximo, con baseline medible?
25. Contame una integración fácil: ¿qué condiciones hicieron innecesaria más tooling?

### Medidas y criterios de descarte

Registrar tiempo de discovery, espera por acceso, mapping, revisión, despliegue y mantenimiento; rework; discrepancias; recuperación; tiempo de relevo; carga subjetiva. Comparar casos semejantes e incluir el costo de mantener el conocimiento.

No tratar interés verbal, cantidad de conectores ni horas estimadas como voluntad de pago. Solicitar un caso, un owner, un presupuesto y una aceptación concreta de piloto. Descartar la tesis de herramienta si el retraso principal es contractual/político sin acción técnica o si el stack actual ya cubre el recorrido con poco esfuerzo.

## 19. Sources with links and dates

**Consulta de todas las fuentes externas:** 2026-09-15.  
**s/f:** fecha de publicación no verificada; documentación viva. Los enlaces son fuentes primarias salvo donde se identifica explícitamente investigación académica. No se usaron comentarios anónimos como prueba de hechos técnicos.

### Investigación humana, relatos e incidentes

| ID | Fuente | Fecha verificada | Uso / límite |
|---|---|---|---|
| S01 | [Maguire, The Secret Lives of SREs, USENIX](https://www.usenix.org/conference/srecon20americas/presentation/maguire) | 2020-12-07 | Resumen de investigación de coordinación; no se afirma haber visto el video |
| S02 | [Stripe, Online migrations at scale](https://stripe.com/blog/online-migrations) | 2017-02-02 | Implementación y verificación incremental |
| S03 | [Atlassian, April 2022 post-incident review](https://www.atlassian.com/blog/how-we-build/post-incident-review-april-2022-outage) | 2022-04-29; incidente desde 2022-04-05 | Semántica, recuperación y coordinación |
| S04 | [GitLab, database outage postmortem](https://about.gitlab.com/blog/postmortem-of-database-outage-of-january-31/) | 2017-02-10; incidente 2017-01-31 | Fallo de operación y recuperación |
| S05 | [Shopify, 10 Tips for Building Resilient Payment Systems](https://shopify.engineering/building-resilient-payment-systems) | 2022-07-28 | Experiencia de ingeniería de pagos |
| S06 | [PHE, delayed reporting statement](https://www.gov.uk/government/news/phe-statement-on-delayed-reporting-of-covid-19-cases) | 2020-10-04; actualizado 2020-10-05 | Límite de archivos y efectos sobre diferentes destinos |
| S07 | [Slack Engineering, Evolving the Slack API](https://slack.engineering/evolving-the-slack-api/) | 2018-01-25; actualizado 2020-06-24 | Cambios internos y compatibilidad externa |
| S08 | [AWS, Making retries safe with idempotent APIs](https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/) | Anuncio de publicación 2021-01-15 | Operaciones ambiguas e idempotencia |
| S09 | [GOV.UK, Managing legacy technology](https://www.gov.uk/guidance/managing-legacy-technology) | s/f | Dependencias, proveedores y conocimiento |
| S10 | [Palantir, A Day in the Life of a FDSE](https://blog.palantir.com/a-day-in-the-life-of-a-palantir-forward-deployed-software-engineer-45ef2de257b1) | 2020-11-02 | Testimonio de Brian; selección editorial del empleador |

### Plataformas, contratos y patrones

| ID | Fuente | Fecha | Alcance |
|---|---|---|---|
| S11 | [Workato, Lifecycle and operations](https://docs.workato.com/en/recipes/managing-recipes) | s/f | Entornos, operación y auditoría |
| S12 | [MuleSoft, API Governance](https://docs.mulesoft.com/api-governance/) | s/f | Gobernanza y enforcement documentados |
| S13 | [MuleSoft, Access Management](https://docs.mulesoft.com/access-management/) | s/f | Roles, grupos, identidades y permisos |
| S14 | [ServiceNow, Integration Hub](https://www.servicenow.com/docs/r/integrate-applications/integration-hub/integrationhub.html) y [Service Mapping](https://blogs.servicenow.com/content/dam/servicenow-assets/public/en-us/doc-type/resource-center/data-sheet/ds-service-mapping.pdf) | s/f | Integración y mapas; dos documentos del proveedor |
| S15 | [Palantir, Platform overview](https://www.palantir.com/docs/foundry/platform-overview) | s/f | Ontología, Actions, AIP y escenarios |
| S16 | [Palantir, Functions permissions](https://www.palantir.com/docs/foundry/functions/permissions) | s/f | Permisos de repositorios/funciones |
| S17 | [Salesforce, Integration Patterns](https://developer.salesforce.com/docs/atlas.en-us.integration_patterns_and_practices.meta/integ_pat_tempate.htm) | s/f | Contenido indexado oficial; página dinámica no extraíble y PDF alternativo falló. Sólo sustenta data master/patrones visibles |
| S18 | [SAP, Cloud Integration monitoring](https://support.sap.com/en/alm/sap-cloud-alm/operations/expert-portal/integration-monitoring/calm-cpi.html) y [End-to-end integration monitoring](https://help.sap.com/docs/sap-btp-guidance-framework/integration-architecture-guide/end-to-end-integration-monitoring) | s/f | Mensajes, mappings y topologías híbridas |
| S19 | [Debezium, SQL Server connector](https://debezium.io/documentation/reference/stable/connectors/sqlserver.html) | s/f | CDC e historial de esquemas |
| S20 | [Fivetran, Database connectors](https://fivetran.com/docs/connectors/databases) | s/f | Replicación/cambios de esquema |
| S21 | [Stripe, Webhooks](https://docs.stripe.com/webhooks) | s/f | Entrega, orden y duplicados |
| S22 | [Apache Camel, User manual](https://camel.apache.org/manual/index.html) y [When to use Camel](https://camel.apache.org/when-to-use/) | s/f | Framework y patrones de integración |
| S23 | [Slack, Rate limits](https://docs.slack.dev/apis/web-api/rate-limits/) | s/f; describe cambio de 2025-05-29 | Restricciones según tipo de aplicación; no extrapolar a todas |
| S24 | [Spreadsheet Risk — A New Direction for HMRC?](https://arxiv.org/abs/0711.4613) | Presentado en EuSpRIG 2006; arXiv 2007-11-28 | Riesgo de spreadsheets; abstract consultado, evidencia histórica |
| S25 | [Microsoft, Document Intelligence accuracy/confidence](https://learn.microsoft.com/en-us/azure/ai-services/document-intelligence/concept/accuracy-confidence?view=doc-intel-4.0.0) | actualizado 2026-04-08 | Confianza de extracción y evaluación |
| S26 | [Google, Synchronize clients with Gmail](https://developers.google.com/workspace/gmail/api/guides/sync) | s/f | Expiración del historial y full sync |
| S27 | [Microsoft Entra, App provisioning](https://learn.microsoft.com/en-us/entra/identity/app-provisioning/user-provisioning) | actualizado 2026-04-01 | Identidades, roles y baja; SCIM/híbrido |
| S28 | [MCP, Security best practices — draft](https://modelcontextprotocol.io/docs/draft/tutorials/security/security_best_practices) y [Authorization 2025-06-18](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization) | draft consultado; versión fechada 2025-06-18 | Se distinguen draft y versión; no se afirma versión estable vigente |
| S29 | [HashiCorp Vault, Static and dynamic secrets](https://developer.hashicorp.com/vault/tutorials/get-started/understand-static-dynamic-secrets) | s/f | Custodia, TTL y revocación |
| S30 | [Backstage, Software catalog](https://backstage.io/docs/features/software-catalog/) | s/f | Ownership y metadata mantenida por equipos |
| S31 | [OpenTelemetry, Context propagation](https://opentelemetry.io/docs/concepts/context-propagation/) | actualizado 2026-08-10 | Correlación y límites de datos propagados |
| S32 | [Shopify, GraphQL APIs using idempotency](https://shopify.engineering/building-resilient-graphql-apis-using-idempotency) | 2019-08-27 | Idempotencia y reconciliación |
| S33 | [Microsoft, Automate using UI elements](https://learn.microsoft.com/en-us/power-automate/desktop-flows/ui-elements) | actualizado 2026-05-14 | Selectores y límites |
| S34 | [Rocketlane, How Rocketlane does onboarding](https://blog.rocketlane.com/blogs/how-rocketlane-does-onboarding-people-process-tools) | 2022-05-04 | Relato propio de handoff/implementación |
| S35 | [Anthropic, Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) | 2025-11-26 | Continuidad; demo contextual, no prueba universal |
| S36 | [METR, productividad 2025](https://arxiv.org/abs/2507.09089) y [actualización del experimento](https://metr.org/blog/2026-02-24-uplift-update/) | 2025-07; 2026-02-24 | Resultados y límites temporales/metodológicos |
| S37 | [LangGraph, Interrupts](https://docs.langchain.com/oss/python/langgraph/interrupts) | s/f | Persistencia, reanudación y side effects |
| S38 | [n8n, Human-in-the-loop tools](https://docs.n8n.io/build/integrate-ai/ai-examples/human-in-the-loop-for-tools) | s/f | Aprobación de herramientas |
| S39 | [A2A, Specification](https://a2a-protocol.org/latest/specification/) y [release announcements](https://a2a-protocol.org/latest/blog/) | v1.0 anunciada 2026-03-12 | Interoperabilidad; versión latest es mutable |
| S40 | [Temporal, Workflow execution](https://docs.temporal.io/workflow-execution) y [Saga pattern guide](https://pages.temporal.io/rs/250-WIU-007/images/tech-guide-saga-pattern-made-easy.pdf) | s/f | Durabilidad y compensación |
| S41 | [Anthropic, Scaling Managed Agents](https://www.anthropic.com/engineering/managed-agents) | 2026-04-08 | Sesión, harness y sandbox separados |
| S42 | [Rocketlane, Onboarding and implementation software](https://www.rocketlane.com/onboarding-implementation-software) | s/f | Oferta; porcentajes comerciales no usados como evidencia |

| S43 | [GitHub, Automating MySQL schema migrations](https://github.blog/enterprise-software/automation/automating-mysql-schema-migrations-with-github-actions-and-more/) | 2020-02-14; actualizado 2021-08-12 | Caso de automatización de migraciones |

### Evidencia local

Todas las rutas se inspeccionaron el 2026-09-15. Las fechas dentro de nombres son fechas documentales, no fechas de despliegue. Los estados se fundan en símbolos y límites indicados, no solamente en títulos.

| ID | Fuente local y símbolos |
|---|---|
| L01 | [Location, cierre material](C:/repos/bloom-development-extension/docs/ANALYSIS/ORRERY/LOCATION/ORRERY_LOCATION_MATERIAL_CLOSURE_v1_1.md), §§1–3; [Orrery data.ts](C:/repos/bloom-development-extension/installer/conductor/workspace/core/orrery/src/data.ts), items/genes ficticios |
| L02 | [Gravity model](C:/repos/bloom-development-extension/installer/nucleus/internal/gravity/model.go), GravityNode/DomainRef/GeneRef; [store](C:/repos/bloom-development-extension/installer/nucleus/internal/gravity/store.go), CompareAndSwap; [resolver](C:/repos/bloom-development-extension/installer/nucleus/internal/gravity/resolver.go), ResolveActive |
| L03 | [ASM research v0.2](C:/repos/bloom-development-extension/docs/ANALYSIS/BSIP/ASM/ASM_Location_Research_v0_2.md); [ASM spec](C:/repos/bloom-development-extension/docs/BSIP/TYPES/ASM_Intent_Spec_v1_0.md); [PayloadBuilder](C:/repos/bloom-development-extension/brain/core/context_planning/payload_builder.py), build_from_plan |
| L04 | [Authority decision](C:/repos/bloom-development-extension/installer/nucleus/internal/authority/decision.go), DecisionEvaluator.Evaluate; [governed creation decision](C:/repos/bloom-development-extension/installer/nucleus/internal/governance/decision/decision.go), AuthorizeGravityNodeCreation |
| L05 | [Nucleus vault](C:/repos/bloom-development-extension/installer/nucleus/internal/vault/vault.go), Authorize/osKeyringT; [BTIPS](C:/repos/bloom-development-extension/docs/BTIPS_Bloom_Technical_Intent_Package_v7_3.md), descripción Vault Shield |
| L06 | [Impact README](C:/repos/bloom-development-extension/installer/impact/README.md); [Evaluate](C:/repos/bloom-development-extension/installer/impact/internal/evaluation/evaluate.go), Default/Evaluate/prepare |
| L07 | [IntentManager](C:/repos/bloom-development-extension/brain/core/intent_manager.py); [effect ledger](C:/repos/bloom-development-extension/brain/core/intent/effect_ledger.py), EffectLedgerManager/MandateStateReader |
| L08 | [Executor README](C:/repos/bloom-development-extension/docs/EXECUTOR/README.md); [architecture](C:/repos/bloom-development-extension/docs/EXECUTOR/EXECUTOR_ARCHITECTURE_v1_0.md); [implementation spec](C:/repos/bloom-development-extension/docs/EXECUTOR/EXECUTOR_IMPLEMENTATION_SPEC_v1_0.md), §§8–12; [staging README](C:/repos/bloom-development-extension/installer/execution/README.md). installer/executor no existía en la inspección |
| L09 | [Genesis activities](C:/repos/bloom-development-extension/installer/nucleus/internal/orchestration/activities/mandate_genesis_activities.go), ScaffoldDomainActivity/scaffoldDryRun/scaffoldReal/IngestReceptionActivity; [MandateExecutionWorkflow](C:/repos/bloom-development-extension/installer/nucleus/internal/orchestration/temporal/workflows/mandate_execution_workflow.go); [PersistExecutionResultActivity](C:/repos/bloom-development-extension/installer/nucleus/internal/orchestration/activities/mandate_execution_activities.go) |
| L10 | [AITAP RoutingEngine](C:/repos/bloom-development-extension/installer/aitap/src/aitap/routing/engine.py), decide/_select_intelligence; [guardrails](C:/repos/bloom-development-extension/installer/aitap/AGENTS.md) |
| L11 | [OllamaManager](C:/repos/bloom-development-extension/brain/core/bisp/ollama_manager.py), generate_embedding; [semantic query](C:/repos/bloom-development-extension/brain/commands/bisp/semantic_query.py), BISPSemanticQueryCommand |
| L12 | [Orbital fundamentos](C:/repos/bloom-development-extension/docs/ANALYSIS/GRAVITY/MODELS/Orbital___Fundamentos_de_Coordinacion_Gravity_e_Interaccion_Gobernada.md); [glosario](C:/repos/bloom-development-extension/docs/ANALYSIS/GRAVITY/ORBITAL/Glosario_Contexto_Cognituum_para_Cowork.md), Orbital/Constellation |
| L13 | [BTIPS](C:/repos/bloom-development-extension/docs/BTIPS_Bloom_Technical_Intent_Package_v7_3.md); [responsibility boundaries](C:/repos/bloom-development-extension/docs/GOVERNANCE/ARCHITECTURE/COGNITUUM_RESPONSIBILITY_BOUNDARIES.md). Marco normativo, no evidencia de implementación |

[S01]: https://www.usenix.org/conference/srecon20americas/presentation/maguire
[S02]: https://stripe.com/blog/online-migrations
[S03]: https://www.atlassian.com/blog/how-we-build/post-incident-review-april-2022-outage
[S04]: https://about.gitlab.com/blog/postmortem-of-database-outage-of-january-31/
[S05]: https://shopify.engineering/building-resilient-payment-systems
[S06]: https://www.gov.uk/government/news/phe-statement-on-delayed-reporting-of-covid-19-cases
[S07]: https://slack.engineering/evolving-the-slack-api/
[S08]: https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/
[S09]: https://www.gov.uk/guidance/managing-legacy-technology
[S10]: https://blog.palantir.com/a-day-in-the-life-of-a-palantir-forward-deployed-software-engineer-45ef2de257b1
[S11]: https://docs.workato.com/en/recipes/managing-recipes
[S12]: https://docs.mulesoft.com/api-governance/
[S13]: https://docs.mulesoft.com/access-management/
[S14]: https://www.servicenow.com/docs/r/integrate-applications/integration-hub/integrationhub.html
[S15]: https://www.palantir.com/docs/foundry/platform-overview
[S16]: https://www.palantir.com/docs/foundry/functions/permissions
[S17]: https://developer.salesforce.com/docs/atlas.en-us.integration_patterns_and_practices.meta/integ_pat_tempate.htm
[S18]: https://support.sap.com/en/alm/sap-cloud-alm/operations/expert-portal/integration-monitoring/calm-cpi.html
[S19]: https://debezium.io/documentation/reference/stable/connectors/sqlserver.html
[S20]: https://fivetran.com/docs/connectors/databases
[S21]: https://docs.stripe.com/webhooks
[S22]: https://camel.apache.org/manual/index.html
[S23]: https://docs.slack.dev/apis/web-api/rate-limits/
[S24]: https://arxiv.org/abs/0711.4613
[S25]: https://learn.microsoft.com/en-us/azure/ai-services/document-intelligence/concept/accuracy-confidence?view=doc-intel-4.0.0
[S26]: https://developers.google.com/workspace/gmail/api/guides/sync
[S27]: https://learn.microsoft.com/en-us/entra/identity/app-provisioning/user-provisioning
[S28]: https://modelcontextprotocol.io/docs/draft/tutorials/security/security_best_practices
[S29]: https://developer.hashicorp.com/vault/tutorials/get-started/understand-static-dynamic-secrets
[S30]: https://backstage.io/docs/features/software-catalog/
[S31]: https://opentelemetry.io/docs/concepts/context-propagation/
[S32]: https://shopify.engineering/building-resilient-graphql-apis-using-idempotency
[S33]: https://learn.microsoft.com/en-us/power-automate/desktop-flows/ui-elements
[S34]: https://blog.rocketlane.com/blogs/how-rocketlane-does-onboarding-people-process-tools
[S35]: https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents
[S36]: https://arxiv.org/abs/2507.09089
[S37]: https://docs.langchain.com/oss/python/langgraph/interrupts
[S38]: https://docs.n8n.io/build/integrate-ai/ai-examples/human-in-the-loop-for-tools
[S39]: https://a2a-protocol.org/latest/specification/
[S40]: https://docs.temporal.io/workflow-execution
[S41]: https://www.anthropic.com/engineering/managed-agents
[S42]: https://www.rocketlane.com/onboarding-implementation-software
[S43]: https://github.blog/enterprise-software/automation/automating-mysql-schema-migrations-with-github-actions-and-more/
[L01]: C:/repos/bloom-development-extension/docs/ANALYSIS/ORRERY/LOCATION/ORRERY_LOCATION_MATERIAL_CLOSURE_v1_1.md
[L02]: C:/repos/bloom-development-extension/installer/nucleus/internal/gravity/model.go
[L03]: C:/repos/bloom-development-extension/docs/ANALYSIS/BSIP/ASM/ASM_Location_Research_v0_2.md
[L04]: C:/repos/bloom-development-extension/installer/nucleus/internal/authority/decision.go
[L05]: C:/repos/bloom-development-extension/installer/nucleus/internal/vault/vault.go
[L06]: C:/repos/bloom-development-extension/installer/impact/README.md
[L07]: C:/repos/bloom-development-extension/brain/core/intent_manager.py
[L08]: C:/repos/bloom-development-extension/docs/EXECUTOR/README.md
[L09]: C:/repos/bloom-development-extension/installer/nucleus/internal/orchestration/activities/mandate_genesis_activities.go
[L10]: C:/repos/bloom-development-extension/installer/aitap/src/aitap/routing/engine.py
[L11]: C:/repos/bloom-development-extension/brain/core/bisp/ollama_manager.py
[L12]: C:/repos/bloom-development-extension/docs/ANALYSIS/GRAVITY/MODELS/Orbital___Fundamentos_de_Coordinacion_Gravity_e_Interaccion_Gobernada.md
[L13]: C:/repos/bloom-development-extension/docs/BTIPS_Bloom_Technical_Intent_Package_v7_3.md

## THE FIRST INTEGRATION PROBLEM COGNITUUM SHOULD SOLVE

**Recomendación de investigación:** empezar por la carga de preparar, revisar y retomar un cambio de una integración existente. Antes de construir, comprobar que ese trabajo tiene recurrencia, comprador y ahorro neto.

La función **PAIN × FREQUENCY × RESPONSIBILITY × WILLINGNESS TO PAY × CURRENT READINESS** sirve aquí como disciplina de evaluación, no como fórmula numérica: no hay escalas calibradas ni datos suficientes para multiplicar scores. Un factor desconocido permanece desconocido.

| Candidato | Pain | Frequency | Responsibility | Willingness to pay | Current readiness |
|---|---|---|---|---|---|
| 1. Preparar/revisar un cambio de integración | Respaldado cualitativamente por descubrimiento, compatibilidad y coordinación | Plausible por cambios/relevo; sin tasa medida | Alta cuando cambia un contrato compartido | Desconocida; potencial comprador: responsable de ingeniería/implementación | Parcial; Intents/Gravity/Impact ayudan, Location/ASM no conectados |
| 2. Verificar una sincronización y resolver discrepancias | Fuerte en flujos con estado | Recurrente por operación, pero sin frecuencia comercial cuantificada | Alta si afecta registros empresariales | Desconocida; potencial comprador: dueño de operaciones/datos | Baja; faltan adquisición y conciliación específicas |
| 3. Delegar una modificación acotada a IA con evidencia | Plausible; ahorro neto no demostrado | Depende de adopción y tareas elegibles | Alta por capacidad de escritura | Desconocida; potencial comprador: plataforma/ingeniería | Baja para efectos reales; Executor pendiente |

### Candidato 1 — Preparación y revisión de cambios en una integración existente

**Disparador:** cambia un endpoint, un esquema, un campo de negocio o la persona que mantiene la integración.

**Trabajo del ingeniero:** reconstruir quién consume qué, por qué se eligió el mapping, qué necesita permiso, qué pruebas cubren el cambio y qué hacer si falla.

**Resultado que habría que validar:** una revisión recuperable que vincule alcance, versiones, decisiones, responsables, pruebas, límites y evidencia. El ingeniero conserva la decisión técnica.

**Alcance de prueba propuesto:** una integración existente entre dos sistemas, con código/documentos accesibles y un cambio real próximo. No intentar mapear toda la empresa. Puede investigarse manualmente con materiales del cliente sin esperar la implementación completa de Location/ASM.

**Comparador:** el proceso actual con tickets, docs, catálogo, CI y revisores.

**Medidas:** tiempo total hasta revisión aceptada; tiempo de otro ingeniero para retomar; omisiones; correcciones; costo de mantener la información.

**Señal comercial necesaria:** owner que aporte el caso y presupuesto para una prueba pagada. **Descarte:** no hay recurrencia, el retraso es principalmente ajeno al trabajo técnico o el expediente agrega más mantenimiento que ahorro.

La prioridad deriva de su menor necesidad de ejecución productiva y de dolores documentados, no de afirmar que Cognituum ya pueda entregarlo como producto. [S07], [S09], [S10], [S30], [L01], [L02], [L03], [L06], [L07], [L08]

### Candidato 2 — Conciliación de una sincronización empresarial concreta

**Disparador:** los jobs están verdes pero los sistemas discrepan.

**Resultado:** identificar qué registros difieren, por qué y quién puede resolverlos; conservar prueba de la corrección. Elegir un flujo acotado —por ejemplo CRM hacia un destino interno— sólo después de encontrar un comprador con ese problema.

**Condición previa:** accesos de lectura, definición de identidad/fuente de verdad y ejemplos etiquetados por negocio. Correcciones automáticas no están presupuestas.

**Medidas:** discrepancias detectadas, falsos positivos, tiempo de diagnóstico y horas de conciliación.

**Descarte:** una herramienta existente resuelve el caso con configuración razonable, los errores son demasiado infrecuentes o no hay dueño del criterio.

Tiene dolor tangible, pero menor readiness actual: Impact puede evaluar observaciones preparadas; no las obtiene ni implementa por sí solo conciliación. [S17], [S20], [S32], [L06]

### Candidato 3 — Cambio delegado a IA con alcance y evidencia verificables

**Disparador:** un equipo quiere que un agente modifique una integración sin transferirle autoridad general.

**Resultado:** propuesta, permiso, ejecución acotada y verificación reconstruibles, incluyendo efectos parciales y acción humana.

**Condición previa:** Executor conforme, autoridad enlazada, sistema de pruebas y un caso reversible. La primera validación conceptual puede usar un entorno aislado; no implica autorizar runtimes ni repos reales fuera de sus gates.

**Medidas:** tiempo neto, revisión humana, violaciones de alcance, resultados desconocidos y capacidad de recuperación.

**Descarte:** el agente actual con controles existentes ya resuelve la tarea o la revisión anula el ahorro.

Es una dirección posterior: hoy requiere más capacidades no implementadas y compite directamente con harnesses y plataformas de agentes. [S35], [S36], [S37], [S38], [S39], [S40], [S41], [L08], [L09], [L10]

### Decisión que la evidencia permite hoy

**Autoriza a investigar comercialmente el candidato 1; no demuestra todavía que deba construirse una plataforma.** Mantener el candidato 2 como alternativa si las entrevistas revelan un costo recurrente más claro. No priorizar el candidato 3 por afinidad arquitectónica.

La primera prueba de valor es que un ingeniero pueda explicar, aprobar y retomar un cambio real con menos reconstrucción y sin perder control. Si esa mejora no aparece frente al proceso existente, la combinación conceptual no basta.
