# ASM — Actualización física propuesta del roadmap I3–I7

**Estado:** encargos de implementación propuestos; no autorizados para ejecución.  
**Base:** ADR `ASM_PRE_MANDATE_EXECUTION_ADR_v0_1` y fuentes E1–E13 allí identificadas.  
**Alcance:** convertir I3–I7 en unidades verificables sin congelar schemas ni implementar.

## 1. Dependencias y orden

- I3 puede diseñarse y verificarse con entradas controladas antes de disponer de Location real.
- I4 requiere las garantías de identidad, captura y relaciones de I1–I2 para acreditar integración real.
- I5 requiere el contrato pre-Mandate de Gravity y la conciliación explícita de Impact.
- I6 puede probar el empaquetado de manera aislada; su aceptación integral requiere routing, invocación y contabilidad verificables.
- I7 requiere salidas versionadas y el contrato autorizado de adopción.
- I8 permanece como milestone final de aptitud para `Location–ASM Boundary Contract v0.1`.

Las pruebas con fixtures acreditan componentes, no disponibilidad end-to-end.

## 2. I3 — Creación y recuperación ASM

### Objetivo

Crear un Intent durable bajo AssemblyRequest y recuperarlo sin Mandate, sin duplicar identidades y sin romper los Intents actuales.

### Invariantes

- Parent positivo y exacto.
- Mandate ausente para ASM pre-Mandate; obligatorio donde ya corresponde.
- Identidad independiente del nombre visible.
- Retry técnico conserva solicitud y ejecución.
- Un solo coordinador del lifecycle.
- Pausa, cancelación y supersesión no eliminan historia.
- Dos trabajadores no publican estados incompatibles.

### Encargos físicos candidatos

1. **Registro y admisión:** añadir ASM y política de parent en registro, CLI, Manager y StateManager.
2. **Recepción durable:** persistir solicitud, validación, correlación y autorización antes de adquisición.
3. **Coordinación:** incorporar recorrido ASM en Temporal y Activities que invoquen Brain con identidad de operación.
4. **Checkpoints:** persistir artefactos y comprobantes; verificar revisión esperada al publicar.
5. **Recuperación:** conciliar respuestas perdidas y escrituras incompletas.
6. **Control:** pausa en puntos seguros, cancelación cooperativa y supersesión explícita.
7. **Compatibilidad:** preservar lectores y comportamientos de ING/DIS.

### Subsistemas afectados

Registro y gestores Brain; CLI de creación/recuperación; persistencia común; ledger sólo donde su semántica sea reutilizable; coordinación Temporal y Activities. E3–E7.

### Dependencias

Ratificación de ownership, identidad, fases, almacenamiento y mecanismo de concurrencia.

### Riesgos

Relajar inadvertidamente ING/DIS; reutilizar UUID por nombre; perder un resultado tras timeout; avance doble; publicación tardía de una ejecución supersedida.

### Pruebas unitarias

- Matriz tipo/parent admitido y rechazado.
- Rechazo de representaciones de parent contradictorias.
- Mismo nombre en solicitudes diferentes no colisiona.
- Retry de creación devuelve el mismo Intent.
- Transición repetida no produce doble avance.
- Worker obsoleto no publica sobre revisión posterior.

### Pruebas de integración

Interrumpir después de cada frontera: recepción, persistencia de artefacto, respuesta de Activity y registro de transición. Reiniciar y verificar continuidad sin Mandate ni duplicados. Ejecutar en paralelo dos solicitudes de avance sobre la misma revisión.

### Resultado observable y aceptación

Una solicitud genera un Intent identificable; puede pausarse, reabrirse y continuar desde checkpoint. El historial explica cada intento. ING/DIS siguen rechazando su creación sin Mandate.

### Rollback o recuperación

Deshabilitar nuevas creaciones ASM sin borrar registros existentes. Conservar un camino compatible de lectura/recuperación; no convertir ASM a un tipo legado ni moverlo a Mandate.

### Decisiones reservadas

Fases, filenames, formato de parent, IDs, exclusión de escritor, revisión esperada y entradas públicas de control.

## 3. I4 — Adquisición acotada

### Objetivo

Adquirir evidencia verificable desde la captura y las relaciones explícitas, dentro de autorización y presupuesto.

### Invariantes

- Location permanece inmutable.
- Captura y observación posterior son datos diferentes.
- Project admite 0..N Repositories.
- Cada ProjectRepositoryLink tiene identidad, provenance y vigencia.
- Cada anchor de repositorio declara `repositoryId`.
- Project no implica un Repository.
- Git aporta evidencia material y temporal, no autoridad ontológica.
- Domain/Gene permanecen `unsupported` mientras no exista soporte real.

### Encargos físicos candidatos

1. Consumir captura y resolución por referencia.
2. Verificar Organization–Project–foco y relaciones necesarias.
3. Adquirir por identidad de Repository y anchor, evitando colisiones entre rutas iguales.
4. Registrar evidencia, revisión, permisos, costo y estado por referencia.
5. Aplicar límites antes de cada adquisición o expansión.
6. Bloquear dependencias críticas sin impedir diagnóstico independiente autorizado.

### Subsistemas afectados

Adquisición Brain, proveedor de Location y resolución de relaciones. El contrato se apoya en E1 y E13 y en restricciones ratificadas de Origin Research. Los archivos canónicos de Source Authority Profile y del addendum siguen pendientes.

### Dependencias

I3; garantías I1–I2 de captura e identidad; interfaces y archivos definitivos de Location.

### Riesgos

Confundir cwd con Repository, tratar una ruta absoluta como autorización, mezclar captura con resolución actual o convertir indisponibilidad en ausencia.

### Pruebas unitarias

- Project sin Repositories y con varios.
- Mismo path en dos repositorios.
- Anchor sin `repositoryId`.
- Vínculo vencido.
- Fuente inaccesible → `unverifiable` cuando no hay evidencia más concluyente.
- Domain/Gene no soportados.
- Presupuesto agotado.
- Cambio de foco sin nueva captura.

### Pruebas de integración

Capturar, persistir, modificar una fuente y resolver nuevamente: la captura original debe conservarse y la observación posterior registrar el cambio. Revocar autorización antes de reanudar y verificar que no hay nueva lectura.

### Resultado observable y aceptación

Cada contenido adquirido se explica por fuente, relación, revisión, momento, permiso y consumo. Ninguna adquisición requiere inferencias implícitas de repositorio.

### Rollback o recuperación

Detener nuevas adquisiciones; conservar evidencia existente bajo sus permisos. Reanudar sólo después de revalidar las condiciones necesarias.

### Decisiones reservadas

Interfaces físicas de Location, políticas de vigencia, presupuestos y soporte inicial concreto de anchors. Las obligaciones ratificadas no se reabren.

## 4. I5 — Gravity e Impact

### Objetivo

Obtener resolución normativa pre-Mandate y evaluación de contexto preparado, preservando cobertura, evidencia y revisiones.

### Invariantes

- Ningún Mandate ficticio.
- ASM no recalcula Gravity.
- Impact no resuelve ni adquiere.
- Ningún campo informal en `impact/1`.
- Evaluación parcial no significa ausencia de restricciones o impacto.

### Encargos físicos candidatos

1. **Gravity:** entregar resolución por Organization, Project, scope, momento y referencias.
2. **ASM:** persistir consulta, resolución, cobertura y dependencias.
3. **Impact:** realizar el spike adapter/envelope/versión descrito en el ADR.
4. **Integración:** materializar sólo la alternativa ratificada.
5. **Reevaluación:** invalidar reutilización cuando cambien inputs relevantes, manteniendo evaluaciones históricas.

### Subsistemas afectados

Frontera pública del resolvedor Gravity, Activities de integración, preparación ASM y contratos/adapters Impact. E9–E10.

### Dependencias

I3–I4; entrega de Gravity; decisión posterior al spike Impact.

### Riesgos

Usar cache como prueba de vigencia, confundir referencias con provenance verificada, omitir metadatos en una conversión o inventar métricas para un evaluador.

### Pruebas unitarias

- Scope o momento no resoluble.
- Resolución vacía con cobertura insuficiente.
- Cambio de Posture o evidencia.
- Campo desconocido rechazado por el decoder actual.
- Datos ASM sin traducción válida a un evaluador.
- Metadatos externos que no corresponden al request evaluado.

### Pruebas de integración

Resolver antes de Mandate, evaluar y persistir ambos resultados. Cambiar una dependencia relevante y demostrar nueva resolución/evaluación o bloqueo explícito.

### Resultado observable y aceptación

Toda conclusión normativa y de impacto apunta a inputs exactos y límites conocidos. El recorrido no crea nodos Mandate/Session ficticios.

### Rollback o recuperación

Deshabilitar nuevas evaluaciones mediante la integración incorporada; conservar resultados anteriores con versión y límites. No reinterpretarlos con otra versión de contrato.

### Decisiones reservadas

Contrato externo Gravity, política temporal y alternativa física Impact. Su diseño interno no pertenece a este encargo ASM.

## 5. I6 — BISP e IA

### Objetivo

Conectar plan, payload efectivo, inferencia y procesamiento ASM con routing y contabilidad trazables.

### Invariantes

- Todo crítico está efectivamente incluido o bloquea antes de inferencia.
- El envío se vincula al plan y evidencia exactos.
- No existe fallback silencioso de ASM a dev.
- Routing explícito; secretos fuera de los artefactos.
- AITAP mantiene Gateway, referencia Vault y contabilidad; no asume el lifecycle.
- Retry incierto no genera reenvío automático sin conciliación.

### Encargos físicos candidatos

1. Admitir ASM en planificación y resolver sus inputs sin asumir briefing legado.
2. Conciliar la forma producida por PayloadBuilder con la consumida por submit.
3. Incorporar comprobación crítica después de transformaciones y antes del despacho.
4. Persistir identidad, digest y estado de la inferencia.
5. Definir validación de respuesta ASM separada de operaciones de modificación de archivos.
6. Integrar routing, referencia de credencial e invocación mediante los responsables existentes.
7. Registrar consumo real o incertidumbre explícita por operación e intento, sin duplicar asientos por callbacks repetidos.

### Subsistemas afectados

PlanCommand, BuildPayloadCommand, PayloadBuilder, submit, procesamiento de respuesta, AITAP y su integración con Vault/ejecutor. E4, E11–E12.

### Dependencias

I3; evidencia I4; evaluaciones requeridas de I5; política de runtime/provider/model y capacidad real de invocación.

### Riesgos

Payload aparentemente correcto que no se transmite; truncamiento posterior al control; cobro duplicado; pérdida de respuesta; clasificación errónea de respuesta ASM como instrucciones de filesystem.

### Pruebas unitarias

Los seis casos críticos del ADR, más:

- Cambio del envío después de la comprobación.
- Dos repositorios con un archivo del mismo nombre.
- Respuesta malformada o de otra ejecución.
- Routing no autorizado.
- Credencial ausente sin filtración del secreto.
- Evento contable repetido.

### Pruebas de integración

Inspeccionar el contenido que recibe el transporte de inferencia, no sólo `.payload.json`. Cortar la conexión tras el despacho y conciliar. Correlacionar decisión de routing, invocación, respuesta y contabilidad.

### Resultado observable y aceptación

Se demuestra qué recibió el modelo y por qué satisface cada crítico. No se declara contabilidad end-to-end mediante estimaciones locales o fixtures.

### Rollback o recuperación

Detener nuevos despachos; mantener respuesta y contabilidad pendientes de conciliación. No reenviar mediante el camino legado como fallback silencioso.

### Decisiones reservadas

Representación común de envío, respuesta ASM, política de IA, límites y tratamiento de operaciones inciertas.

## 6. I7 — Resultados y revisión

### Objetivo

Publicar salidas inmutables y permitir una decisión autorizada sobre una revisión exacta, con adopción posterior y lineage preservado.

### Invariantes

- AssemblyResult y PostulateProposal separados.
- Readiness no equivale a aprobación.
- Edición produce otra revisión.
- La propuesta aprobada identifica su resultado.
- ASM no adopta ni sella.
- Mandate referencia; no absorbe ni reparenta.
- Historial fallido o supersedido permanece auditable.

### Encargos físicos candidatos

1. Persistir y validar resultados/propuestas versionados.
2. Aplicar autorización de lectura al contenido y sus evidencias.
3. Presentar en Orrery revisión, fundamento, limitaciones y estado durable.
4. Registrar la decisión humana contra el objeto exacto.
5. Materializar adopción idempotente en el componente ratificado.
6. Entregar al lifecycle posterior un Postulate y lineage verificables.
7. Asegurar que sólo el fundamento aprobado entra en el contenido operativo del Mandate.

### Subsistemas afectados

Procesamiento y persistencia ASM; coordinación; gobernanza Nucleus; vista Orrery; frontera Postulate→Mandate. No se ha localizado una implementación canónica de Postulate que permita enumerar sus archivos existentes.

### Dependencias

I3–I6; ratificación de ownership de adopción y contrato Postulate/Mandate.

### Riesgos

Aprobar otra revisión, acceder a evidencia sin permiso, adoptar dos veces por retry, incorporar historial completo como fundamento o modificar un Intent después de adoptarlo.

### Pruebas unitarias

- Aprobación de revisión distinta de la presentada.
- Edición con evaluaciones desactualizadas.
- Decisión no autorizada.
- Decisión repetida.
- Intent supersedido con respuesta tardía.
- Referencia de resultado inválida.
- Historial accesible sólo según permisos.

### Pruebas de integración

Completar ASM, revisar, aprobar y adoptar; interrumpir después de registrar la decisión y antes de terminar la adopción. Recuperar sin duplicar Postulate. Crear Mandate mediante el contrato posterior y verificar referencias e inmutabilidad de ASM.

### Resultado observable y aceptación

Se puede recorrer Mandate → Postulate → decisión → propuesta exacta → resultado → ejecución → AssemblyRequest → Location. El contenido operativo apunta únicamente a la revisión aprobada.

### Rollback o recuperación

Detener nuevas adopciones. Una decisión o adopción ya realizada no se borra como rollback técnico; exige recuperación o acto posterior de gobernanza según contrato.

### Decisiones reservadas

Entidad y persistencia de Postulate, autorización, sellado, cierre de revisión y creación posterior de Mandate. I7 no puede declararse cerrado usando Genesis o `freeze_to_mandate` sin demostrar compatibilidad semántica.

## 7. Matriz end-to-end

| Caso | Incrementos | Evidencia de aceptación |
|---|---|---|
| ASM sin Mandate | I3 | Intent durable bajo AssemblyRequest; cero Mandates creados. |
| ING/DIS sin Mandate | I3 | Rechazo conservado. |
| Retry de creación y Activity | I3 | Mismas identidades, sin doble avance. |
| Caída tras persistir antes de responder | I3 | Reutilización del comprobante durable. |
| Dos workers concurrentes | I3 | Una publicación aceptada por revisión. |
| Pausa durante adquisición | I3–I4 | Pausa efectiva en punto seguro y continuidad verificable. |
| Nueva declaración/foco | I3–I4 | Nueva revisión/captura; anterior preservada. |
| Project con 0 y con varios Repositories | I4 | Sin inferencia implícita; anchors correctamente atribuidos. |
| Vínculo vencido o autorización revocada | I4 | Bloqueo de acceso dependiente. |
| Fuente no verificable y Domain/Gene no soportados | I4 | Estados diferenciados y límites visibles. |
| Gravity sin Mandate | I5 | Resolución normativa por frontera aprobada. |
| Impact con metadatos adicionales informales | I5 | Rechazo, sin relajar decoder. |
| Evaluación con inputs cambiados | I5–I7 | Nueva evaluación o bloqueo de reutilización. |
| Crítico ausente, recortado o sólo referenciado | I6 | Cero invocaciones y bloqueo trazable. |
| Deduplicación y críticos completos | I6 | Correspondencia suficiente en envío efectivo. |
| Inferencia incierta | I6 | Conciliación y costos/intentos auditables. |
| Edición y aprobación de revisión antigua por error | I7 | Rechazo de mismatch; ninguna adopción accidental. |
| Retry de adopción | I7 | Un acto y Postulate coherentes, sin duplicación. |
| Mandate posterior | I7 | Referencias al fundamento aprobado; ASM intacto. |

## 8. I8 — Milestone final: Location–ASM Boundary Contract v0.1

La aptitud requiere comprobar el intercambio real y recuperable, además de los componentes aislados.

| Garantía disponible para ASM | Incremento que la aporta o verifica |
|---|---|
| Organization, Project, foco y captura inmutable | I1, entregado por Location; validación de consumo en I4. |
| Estado de captura separado de resolución posterior | I1–I2; comprobación en I4. |
| Links 0..N con identidad, provenance y vigencia | I2; consumo explícito en I4. |
| Anchors con repositoryId concreto y relaciones verificables | I2–I4. |
| Declaración humana exclusivamente en AssemblyRequest | I3 y validación I4. |
| Ejecución y checkpoints recuperables | I3. |
| Evidencia y degradación trazables | I4. |
| Resolución normativa y evaluación compatibles | I5. |
| Correspondencia crítica en envío efectivo | I6. |
| Resultados y lineage para revisión/adopción | I7. |

Domain/Gene pueden continuar `unsupported`. Una relación necesaria pero no verificable debe seguir degradada y bloquear su dependencia; el milestone no autoriza completar garantías por inferencia.

**Condición documental pendiente:** incorporar y contrastar las rutas canónicas de Source Authority Profile V1 y Project→Repository 0..N antes del cierre definitivo. Hasta entonces, sus obligaciones se mantienen ratificadas, pero la correspondencia material con esos documentos permanece provisional.

## 9. Lista de archivos propuesta antes de implementar

### Materialización documental

Se propone crear exclusivamente:

[C:/repos/bloom-development-extension/docs/ANALYSIS/BSIP/ASM/ASM_PRE_MANDATE_EXECUTION_ADR_v0_1.md](C:/repos/bloom-development-extension/docs/ANALYSIS/BSIP/ASM/ASM_PRE_MANDATE_EXECUTION_ADR_v0_1.md)

El nombre fue solicitado; la ubicación se propone siguiendo la carpeta ASM existente. El roadmap puede incorporarse como anexo al mismo documento para evitar inventar otro filename. No se escribió.

### Archivos existentes identificados como candidatos de intervención

Esta lista identifica superficies concretas; no autoriza cambiarlas todas.

| Incremento | Archivos |
|---|---|
| I3 | [intent_types.py](C:/repos/bloom-development-extension/brain/core/intent_types.py), [intent_manager.py](C:/repos/bloom-development-extension/brain/core/intent_manager.py), [intent_state_manager.py](C:/repos/bloom-development-extension/brain/core/intent_state_manager.py), [create.py](C:/repos/bloom-development-extension/brain/commands/intent/create.py), [recover.py](C:/repos/bloom-development-extension/brain/commands/intent/recover.py), [recovery_manager.py](C:/repos/bloom-development-extension/brain/core/intent/recovery_manager.py), [worker.go](C:/repos/bloom-development-extension/installer/nucleus/internal/orchestration/temporal/worker.go). |
| I3, si se ratifica reutilización del ledger | [effect_ledger.py](C:/repos/bloom-development-extension/brain/core/intent/effect_ledger.py), [mandate_genesis_activities.go](C:/repos/bloom-development-extension/installer/nucleus/internal/orchestration/activities/mandate_genesis_activities.go). No se propone alojar allí por defecto todo ASM. |
| I5 | [resolver.go](C:/repos/bloom-development-extension/installer/nucleus/internal/gravity/resolver.go). En Impact, la selección entre [contract.go](C:/repos/bloom-development-extension/installer/impact/internal/contracts/contract.go), [evaluate.go](C:/repos/bloom-development-extension/installer/impact/internal/evaluation/evaluate.go), [local.go](C:/repos/bloom-development-extension/installer/impact/adapters/local/local.go) y [handler.go](C:/repos/bloom-development-extension/installer/impact/adapters/server/handler.go) depende del spike; no se propone modificarlos todos. |
| I6 | [plan.py](C:/repos/bloom-development-extension/brain/commands/intent/plan.py), [build_payload.py](C:/repos/bloom-development-extension/brain/commands/intent/build_payload.py), [payload_builder.py](C:/repos/bloom-development-extension/brain/core/context_planning/payload_builder.py), [intent_manager.py](C:/repos/bloom-development-extension/brain/core/intent_manager.py). |
| I7, presentación mínima | [main.ts](C:/repos/bloom-development-extension/installer/conductor/workspace/core/orrery/src/main.ts). |
| Conciliación documental posterior | [ASM_Intent_Spec_v1_0.md](C:/repos/bloom-development-extension/docs/BSIP/TYPES/ASM_Intent_Spec_v1_0.md), [Documento Único BISP](C:/repos/bloom-development-extension/docs/BSIP/BLOOM_BISP_Documento_Unico_v2_0.md). |

### Archivos nuevos todavía no determinables

Workflow/Activities ASM, persistencia de AssemblyRequest, adquisiciones, respuesta ASM, adopción Postulate y pruebas nuevas requieren nombres y ubicación ratificados. Los archivos de Location y de integración AITAP dependen además de sus entregas canónicas.

Por ello, esta lista **no se presenta como manifiesto completo listo para implementación**. Antes de ejecutar cada incremento deberá cerrarse su lista exacta de archivos, incluyendo tests y cualquier archivo nuevo. Nombrarlos ahora como si estuvieran decididos congelaría precisamente las elecciones que el encargo mantiene abiertas.

## 10. Cierre

Puede diseñarse ahora la pertenencia pre-Mandate, identidad, correlación, recuperación, condición crítica del payload y lineage de adopción.

Permanecen pendientes de ratificación las decisiones físicas del ADR y de verificación documental las dependencias específicas de Location no entregadas. El roadmap permite avanzar por incrementos verificables sin crear Mandates provisionales ni atribuir al runtime capacidades que todavía no tiene.

---

Documento relacionado: [ADR de ejecución pre-Mandate](ASM_PRE_MANDATE_EXECUTION_ADR_v0_1.md).
