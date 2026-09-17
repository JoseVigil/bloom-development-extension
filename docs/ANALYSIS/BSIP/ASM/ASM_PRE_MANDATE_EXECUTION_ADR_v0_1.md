# ASM_PRE_MANDATE_EXECUTION_ADR_v0_1

**Estado:** propuesta de extensión del protocolo y runtime.  
**Autoridad:** José Vigil.  
**Fecha:** 2026-09-16.  
**Alcance:** ejecución ASM pre-Mandate, recuperación, resultados y lineage hasta la adopción posterior.  
**Naturaleza:** los nombres de campos, agrupaciones y transiciones son candidatos; este ADR no aprueba schemas, APIs ni árboles de almacenamiento.

## 1. Decisión central

Se propone extender el protocolo común para que el contexto padre de un Intent sea **explícito, obligatorio y validado según su tipo**.

Para el lead case ratificado:

- ASM nace bajo un `AssemblyRequest`.
- Organization, Project, foco y declaración humana son obligatorios.
- Mientras sea pre-Mandate, `mandate_id` no aplica.
- La ausencia de Mandate no reduce las exigencias de identidad, autorización, provenance, persistencia o recuperación.
- Los Intents actualmente ligados a Mandate conservan sus precondiciones.
- La adopción posterior incorpora referencias inmutables a resultados aprobados; no cambia el padre, identidad ni ubicación del Intent ASM.

El cambio mínimo es introducir una **alternativa positiva de pertenencia a AssemblyRequest**, no volver opcional `mandate_id` de manera general.

## 2. Fuentes y clasificación de evidencia

Las referencias E1–E13 identifican archivo y símbolo o sección. Las afirmaciones materiales posteriores remiten a ellas.

| Ref. | Fuente inspeccionada | Evidencia relevante |
|---|---|---|
| E1 | [ASM Location Research v0.2](C:/repos/bloom-development-extension/docs/ANALYSIS/BSIP/ASM/ASM_Location_Research_v0_2.md), §§2, 4, 5 y 8 | Contratos conceptuales de entrada, salidas, Gravity, Impact y aceptación del empaquetado. |
| E2 | [Spec ASM](C:/repos/bloom-development-extension/docs/BSIP/TYPES/ASM_Intent_Spec_v1_0.md), §§1–3 y 9; [Documento Único](C:/repos/bloom-development-extension/docs/BSIP/BLOOM_BISP_Documento_Unico_v2_0.md), G.0–G.10; [Spec ING](C:/repos/bloom-development-extension/docs/BSIP/TYPES/ING_Intent_Spec_v1_1.md), §§0–6 | ASM todavía tiene definiciones físicas pendientes; Parte G contiene el contrato conceptual vigente. ING documenta su pertenencia a Mandate. |
| E3 | [Registro de tipos](C:/repos/bloom-development-extension/brain/core/intent_types.py), `IntentType`, `IntentTypeSpec`, `INTENT_TYPE_REGISTRY` | Registro material ING/DIS; fases declarativas, turnos y condición de avance. ASM no está registrado. |
| E4 | [IntentManager](C:/repos/bloom-development-extension/brain/core/intent_manager.py), `create_intent`, `_intents_base`, `_validate_initial_files`, `freeze_to_mandate`, `submit_intent` | Restricción de tipos y Mandate, identidad derivada del nombre, almacenamiento común y caminos actuales de publicación/congelación. |
| E5 | [IntentStateManager](C:/repos/bloom-development-extension/brain/core/intent_state_manager.py), `create`, `load`, `_atomic_write_json`, `persist_turn_control`, `advance_after_committed_turn`, `advance_after_proposal` | Persistencia local, reapertura y avance de fases; no constituye por sí solo un coordinador durable distribuido. |
| E6 | [RecoveryManager](C:/repos/bloom-development-extension/brain/core/intent/recovery_manager.py), `recover_single`, `_recover_download`, `_recover_merge`; [EffectLedgerManager](C:/repos/bloom-development-extension/brain/core/intent/effect_ledger.py), `create`, `assert_identity`, `mark_effect_applied`, `mark_state_advanced`, `MandateStateReader` | Recuperación específica existente y patrón de ledger; parte del contrato del ledger depende de lectura de Mandate. |
| E7 | [Activities de Genesis](C:/repos/bloom-development-extension/installer/nucleus/internal/orchestration/activities/mandate_genesis_activities.go), `IngestReceptionActivity`, `runBrainIntentJSONWithRunner`, `validateBSIPTurnRef`, `AdvanceBSIPTurn`; [worker Temporal](C:/repos/bloom-development-extension/installer/nucleus/internal/orchestration/temporal/worker.go), registros de workflows y Activities | Precedente real Temporal → Activity → Brain y validación de correlación. No hay recorrido ASM registrado. |
| E8 | [MandateBuildWorkflow](C:/repos/bloom-development-extension/installer/nucleus/internal/orchestration/temporal/workflows/mandate_build_workflow.go), `MandateBuildWorkflow`; [MandateExecutionWorkflow](C:/repos/bloom-development-extension/installer/nucleus/internal/orchestration/temporal/workflows/mandate_execution_workflow.go), `MandateExecutionInput`, `MandateExecutionWorkflow` | Coordinación, espera humana y ejecución posteriores con contexto Mandate. La señal de validación de Genesis no demuestra una adopción autenticada de Postulate. |
| E9 | [Gravity resolver](C:/repos/bloom-development-extension/installer/nucleus/internal/gravity/resolver.go), `ResolveInput`, `ResolveResult`, `Store.ResolveActive` | Exige MandateID, SessionID e IntentType; valida Session hija de Mandate. |
| E10 | [Contrato Impact](C:/repos/bloom-development-extension/installer/impact/internal/contracts/contract.go), `EvaluationRequest`, `Assessment`; [evaluación](C:/repos/bloom-development-extension/installer/impact/internal/evaluation/evaluate.go), `Decode`, `Engine.Evaluate`, `prepare`; [adapter local](C:/repos/bloom-development-extension/installer/impact/adapters/local/local.go), `Evaluate`; [adapter HTTP](C:/repos/bloom-development-extension/installer/impact/adapters/server/handler.go), `Handler` | Contexto preparado, decoder estricto y assessment; no resolución de referencias ni adquisición. |
| E11 | [PlanCommand](C:/repos/bloom-development-extension/brain/commands/intent/plan.py), `PlanCommand.register`; [build-payload](C:/repos/bloom-development-extension/brain/commands/intent/build_payload.py), `BuildPayloadCommand`; [PayloadBuilder](C:/repos/bloom-development-extension/brain/core/context_planning/payload_builder.py), `build_from_plan`, `_extract_file`; E4, `submit_intent` | ASM no admitido por plan; diferencias entre payload construido y consumido; omisión posible de críticos. |
| E12 | [AITAP](C:/repos/bloom-development-extension/installer/aitap/README.md), “Estado” y “Decisiones ya tomadas”; [RoutingEngine](C:/repos/bloom-development-extension/installer/aitap/src/aitap/routing/engine.py), `decide` | Routing determinístico material; integración real con providers, Vault y Executor todavía pendiente según su documentación. |
| E13 | [Location Material Closure v1.1](C:/repos/bloom-development-extension/docs/ANALYSIS/ORRERY/LOCATION/ORRERY_LOCATION_MATERIAL_CLOSURE_v1_1.md), §§8, 13–16; [Orrery](C:/repos/bloom-development-extension/installer/conductor/workspace/core/orrery/src/main.ts), inicialización y controles de la vista | Contrato documental por referencia, incluido `unverifiable`; recorrido Location todavía no soportado end-to-end. Orrery inspeccionado es una superficie de demostración. |

**Antecedente conversacional:** “ASM — Ejecución y lifecycle material”. No se localizó un archivo de ese documento en la carpeta ASM inspeccionada; no se presenta como fuente documental materializada.

**Restricciones arquitectónicas ratificadas por Origin Research:** Source Authority Profile V1 y addendum Project→Repository 0..N. Sus rutas canónicas siguen sin estar confirmadas. Se utilizan las obligaciones suministradas por José, sin atribuirles evidencia documental inspeccionada.

**Fuente vigente:** v0.2 sustituye las formulaciones anteriores ratificadas. El spec ASM conserva referencias al research v0.1 ausente; esa divergencia requiere conciliación documental, no reconstrucción de una fuente inexistente.

## 3. Matriz de invariantes actuales dependientes de Mandate

| Invariante o dependencia material | Tratamiento propuesto para ASM | Compatibilidad que debe conservarse |
|---|---|---|
| `create_intent` admite dev/doc/ing/dis y exige `mandate_id` para ING/DIS. E4. | Incorporar ASM con parent AssemblyRequest validado. | ING/DIS siguen rechazando Mandate ausente. |
| `IntentStateManager.create` recibe y persiste `mandate_id` en el envelope común. E5. | Validar el parent en la capa común, incluyendo llamadas directas al StateManager. | No depender exclusivamente de la validación del CLI o Manager. |
| El registro describe fases y turnos, pero no política de parent. E3. | Añadir conceptualmente la política de pertenencia admitida por tipo. | Preservar las fases y serializaciones existentes. |
| `create_intent` deriva UUID3 del nombre. E4. | La identidad ASM debe asignarse una vez y persistirse; el nombre no basta para distinguir solicitudes independientes. | No cambiar retroactivamente IDs de Intents existentes. |
| `_intents_base` ya almacena Intents fuera del directorio individual de Mandate. E4. | Aprovechar esa separación para permanencia pre-Mandate. | No introducir traslados durante la adopción. |
| `MandateStateReader` y ledger actual tienen dependencias de Mandate. E6. | Reutilizar patrones de identidad y confirmación, no inventar una lectura de Mandate para ASM. | Mantener el ledger de efectos existente y sus comprobaciones. |
| `validateBSIPTurnRef` limita tipos a ING/DIS. E7. | Extender correlación ASM mediante un encargo explícito. | Agregar un valor al enum no habilita automáticamente todas las Activities. |
| Gravity exige Mandate y Session hija. E9. | Nueva capacidad explícita de resolución pre-Mandate, propiedad de Gravity. | El camino vigente conserva sus controles estructurales. |
| `freeze_to_mandate` toma snapshot con `mandate_id`. E4. | No utilizarlo como adopción de PostulateProposal. | No modificar su semántica existente para simular compatibilidad. |
| Genesis espera decisiones sobre dominios y luego firma Mandate. E8. | Diseñar un handoff específico desde Postulate adoptado. | No interpretar su señal como aprobación de una revisión ASM. |

## 4. Modelo candidato de parent context

Representación conceptual:

```text
IntentExecution
  identidad de Intent y ejecución
  tipo de Intent
  Organization y Project
  parent_context
    clase de parent
    referencia inmutable
  etapa de lifecycle
  condición operativa
  provenance
  timestamps
```

Las alternativas iniciales son `assembly_request` y `mandate`. No se habilitan combinaciones arbitrarias.

### Validaciones positivas

| Caso | Validaciones |
|---|---|
| ASM + AssemblyRequest | Solicitud existente y verificable; revisión exacta; coherencia Organization/Project/Location; declaración humana; atribución; límites y autorización suficientes. Mandate no aplica. |
| ING/DIS + Mandate | Preservar las precondiciones actuales de esos tipos. Esta extensión no agrega la exigencia nueva de un Mandate ya firmado donde el código actual no la exige. |
| ASM sin parent, ambos parents o parent desconocido | Rechazo trazable antes de adquisición. |
| Tipo ligado a Mandate + AssemblyRequest | Rechazo; no hereda automáticamente la capacidad pre-Mandate. |
| Cambio de parent de un Intent existente | Rechazo. La adopción se expresa mediante referencias posteriores. |

La compatibilidad de lectura puede interpretar el `mandate_id` de un registro antiguo como su parent Mandate, sin reescribirlo. Si conviven una representación nueva y un campo legado, cualquier contradicción debe rechazarse.

## 5. Identidad, revisiones, retries y lineage

| Entidad | Identidad estable | Cuándo cambia |
|---|---|---|
| AssemblyRequest | Identifica la solicitud humana y su historial. Cada versión consumida es inmutable. | Una declaración modificada genera una nueva revisión; otra solicitud independiente, una identidad nueva. Esta elección física queda propuesta. |
| Location | Referencia una captura concreta mediante identidad, versión o digest. | Un cambio de foco requiere nueva captura; una resolución posterior no modifica la anterior. |
| Intent ASM | Identifica un trabajo bajo una revisión exacta de AssemblyRequest. | Una sustitución explícita del trabajo puede crear otro Intent, relacionado con el anterior. |
| Ejecución | Identifica un recorrido lógico del Intent. | Una reevaluación deliberada puede iniciar otra ejecución. Un reinicio técnico no debe hacerlo silenciosamente. |
| Intento técnico | Identifica un intento de operación dentro de una ejecución. | Cada retry se registra como intento diferenciado. |
| AssemblyResult | Identidad de salida y revisión inmutable. | Nueva inferencia, evidencia relevante o procesamiento que altere el resultado genera otra revisión. |
| PostulateProposal | Identidad de propuesta y revisión inmutable, vinculada a un resultado exacto. | Edición humana o reformulación produce una revisión nueva. |
| Decisión humana | Identifica el acto autorizado, su actor, momento y objeto exacto. | Una nueva decisión es otro acto; no sobrescribe el anterior. |
| Postulate | Identidad del objeto adoptado, separado de la propuesta. | Su política posterior de revisión permanece fuera de este ADR. |
| Mandate | Identidad posterior, con referencias al fundamento adoptado. | No cambia la identidad ni el parent del lineage pre-Mandate. |

### Reglas de continuidad

1. Retry técnico conserva solicitud, Intent, ejecución lógica e inputs de la operación.
2. Una nueva declaración humana no sustituye el contenido de una ejecución activa: crea una revisión y puede supersederla explícitamente.
3. Supersesión bloquea nuevas publicaciones operativas desde la ejecución anterior; una respuesta tardía permanece auditable.
4. Ninguna inferencia sobrescribe una salida previa.
5. La decisión humana referencia propuesta y resultado exactos, con prueba de integridad.
6. El Mandate conserva el lineage completo como provenance, pero el fundamento operativo apunta exclusivamente a lo aprobado.
7. Un fallo o cancelación no borra el trabajo ni lo convierte en fundamento adoptado.

La relación entre IDs lógicos y WorkflowID/RunID debe persistirse. No se propone usar un RunID de Temporal como identidad de AssemblyRequest ni del Intent.

## 6. Propiedad del lifecycle

### Propuesta

**Temporal coordina el lifecycle de ejecución ASM. Brain conserva los artefactos y checkpoints internos. Nucleus registra la decisión autorizada y materializa la adopción, si José ratifica esa propiedad. Orrery inicia solicitudes y presenta estado y decisiones.**

El precedente Temporal → Activity → Brain existe en `IngestReceptionActivity`; no demuestra que ASM ya esté soportado. E7.

La espera humana de Genesis tampoco demuestra el contrato requerido: `MandateBuildWorkflow` procesa aprobación de dominios y el camino inspeccionado persiste `ConfirmedBy` vacío. E8.

### Una única autoridad por dato

| Dato | Propietario propuesto |
|---|---|
| Orden de etapas, pausa efectiva, cancelación, retry y cierre de ejecución | Temporal. |
| Contenido de evidencia, planes, payloads, respuestas y salidas | Brain, mediante persistencia durable y referencias verificables. |
| Progreso local de una operación o turno | Brain; no autoriza por sí solo el siguiente paso del lifecycle. |
| Decisión humana y adopción | Nucleus, con autorización validada. |
| Estado mostrado | Proyección de datos durables; Orrery no lo establece. |

Para ASM, los comandos que avanzan fases deben estar sujetos a la coordinación acordada. Permitir que un CLI avance libremente y que Temporal mantenga otro estado produciría dos autoridades.

Los Intents existentes conservan su comportamiento. La integración ASM necesita una modalidad explícita, no una reinterpretación retroactiva de todo Brain.

### Tabla de transiciones

| Transición | Propietario | Entrada | Salida durable | Retry | Autoridad humana |
|---|---|---|---|---|---|
| Recibir → validar | Temporal coordina; Brain persiste | Solicitud e identidad del solicitante | Recepción correlacionada y referencia exacta | Misma clave devuelve la misma recepción | Autoría e inicio autorizados |
| Validar → adquirir | Brain valida; Temporal habilita | Solicitud, captura y autorización | Informe y permiso acotado de adquisición | Revalidar vigencia antes de nuevos accesos | Interviene ante cambios de límites o faltantes |
| Adquirir → resolver Gravity | Brain | Referencias y presupuesto | Evidencia, estados y consumo | Reusar sólo evidencia compatible | No amplía límites por su cuenta |
| Gravity → Impact | Gravity resuelve; Brain prepara | Scope, momento, referencias | Resolución normativa y sus límites | Reusar sólo bajo condiciones declaradas | Sin adopción implícita |
| Impact → plan | Impact evalúa; Brain incorpora | Entrada reconciliada | Request exacto, assessment y correlación | Misma entrada y evaluador identificados | Sin autoridad operativa nueva |
| Plan → payload | Brain | Evidencia y plan versionados | Payload efectivo y comprobación crítica | Reproducible desde inputs fijados | Cambio de alcance exige revisión |
| Payload → inferencia | Temporal coordina; ejecutor invoca | Comprobación válida, routing y autorización | Registro de despacho y respuesta o incertidumbre | Conciliar antes de reenviar | No asumir permiso para duplicar costos |
| Respuesta → resultado | Brain | Respuesta correlacionada | AssemblyResult y eventual propuesta | Publicación idempotente | ASM no adopta |
| Resultado → cierre ASM | Temporal | Referencias durables verificadas | Cierre y handoff de revisión | No duplica salidas | No requiere simular aprobación |
| Propuesta → decisión | Nucleus candidato | Revisión exacta presentada | Acto autorizado | Deducción por identidad del acto | Obligatoria |
| Decisión → Postulate | Nucleus candidato | Aprobación válida y vigente | Postulate con referencia adoptada | Misma decisión no duplica adopción | La decisión habilita el acto |
| Postulate → Mandate | Lifecycle posterior de gobernanza | Postulate adoptado | Mandate con lineage inmutable | Contrato posterior específico | Según autoridad posterior |

## 7. Persistencia y recuperación

### Base material

`_intents_base` ya separa el almacenamiento de Intents del directorio individual del Mandate. `IntentStateManager` ofrece escritura por reemplazo atómico y reapertura. Es una base aprovechable, pero no aporta una transacción entre Brain y Temporal ni protección suficiente contra dos escritores concurrentes. E4–E5.

Se propone conservar el almacenamiento común de Intents. **No se fija todavía un nuevo árbol de archivos.**

### Antes de adquirir

Debe quedar durable:

- AssemblyRequest y revisión consumida.
- Location inmutable.
- Declaración humana original.
- Organization y Project.
- Restricciones y límites.
- Referencias explícitas de Repository y vínculos pertinentes.
- Provenance de recepción.
- Resultado de validación y evidencia de autorización, con alcance y momento.
- Identidad del Intent, ejecución y operación.
- Estado de recepción/validación.

Una entrada inválida puede conservar diagnóstico bajo la política de acceso correspondiente; eso no habilita adquisición.

### Checkpoints posteriores

| Artefacto | Vinculación mínima |
|---|---|
| Evidencia adquirida | Fuente, identidad, revisión/digest, momento, autorización y resultado de resolución. |
| Gravity | Consulta exacta, momento normativo, Postures, evidencia y cobertura. |
| Impact | Contexto preparado, representación transmitida, evaluación y metadatos externos reconciliados. |
| Context plan | Revisión de inputs y obligaciones críticas concretas. |
| Payload efectivo | Contenido realmente preparado para el transporte y revisión del plan. |
| Comprobación crítica | Correspondencia de cada obligación con contenido efectivo o bloqueo. |
| Inferencia | Identidad de operación, routing, digest del envío y estado de respuesta. |
| Respuesta | Contenido original, correlación y validación del procesamiento. |
| AssemblyResult | Inputs, evidencia, cobertura, contradicciones, limitaciones y readiness. |
| PostulateProposal | Resultado exacto y fundamento de la formulación. |
| Decisión humana | Actor autorizado, objeto exacto, integridad y resolución del acto. |

### Protocolo candidato de recuperación

1. Temporal solicita una operación con identidad estable y revisión esperada.
2. Brain reconoce la repetición o ejecuta la operación.
3. Brain persiste artefacto y comprobante antes de responder.
4. Temporal registra el resultado y habilita la siguiente transición.
5. Si se pierde la respuesta, se consulta el comprobante; no se repite ciegamente el efecto.
6. Si hay dos trabajadores, una comprobación de revisión y exclusión de escritor impide publicaciones incompatibles.
7. Una salida persistida sin transición confirmada se concilia al recuperar.
8. Una referencia confirmada cuyo contenido no puede verificarse bloquea el avance.

El ledger existente aporta un patrón útil, pero su `MandateStateReader` no puede reutilizarse para fingir un Mandate ASM. E6.

El mecanismo concreto de exclusión, comprobación de revisión y recuperación de registros incompletos queda reservado a I3.

## 8. Etapas, condiciones y readiness

Se propone separar cuatro dimensiones:

- **Fase de negocio:** agrupación estable que se declarará en el registro.
- **Etapa de ejecución:** avance coordinado por Temporal.
- **Checkpoint:** operación y artefacto interno de Brain.
- **Readiness:** suficiencia justificada del resultado.

No se propone crear una fase persistida por cada operación.

| Término candidato | Representación mínima propuesta | Correspondencia material |
|---|---|---|
| `received` | Recepción durable | `create` aporta primitivas, pero no AssemblyRequest. |
| `validating` | Etapa con informe de validación | Sin validación ASM implementada. |
| `acquiring` | Etapa con checkpoints por adquisición | Sin adquisición ASM implementada. |
| `resolving_gravity` | Operación externa correlacionada | Resolver existe, ligado a Mandate. |
| `evaluating_impact` | Operación externa correlacionada | Núcleo existe; conciliación ASM pendiente. |
| `planning_context` | Checkpoint del ensamblado | Plan actual no admite ASM. |
| `building_payload` | Checkpoint más condición crítica | Builder existe; condición insuficiente. |
| `producing_result` | Procesamiento y publicación de revisión | Sin procesador de resultado ASM demostrado. |
| `awaiting_human` | Estado del proceso de revisión posterior | Se propone no mantener abierta la ejecución cognitiva ASM sólo por la espera humana. |
| `completed` | Cierre de ejecución con salidas durables | No significa propuesta aprobada ni readiness suficiente. |

Las fases definitivas y su correspondencia con turnos requieren ratificación. `IntentStateManager` avanza linealmente y no debe forzarse a representar una reevaluación mediante retrocesos improvisados. E3–E5.

### Condiciones laterales

| Condición | Conducta propuesta |
|---|---|
| `blocked` | Conserva checkpoint y causa; no inicia acciones dependientes. |
| `paused` | Sólo efectiva tras alcanzar un punto seguro. La solicitud de pausa y su efectividad se distinguen. |
| `cancelled` | Impide nuevos trabajos; registra efectos ya iniciados y resultados tardíos. |
| `failed` | Cierra una ejecución fallida con diagnóstico; permite una recuperación o ejecución posterior explícita. |
| `retrying` | Condición del intento técnico; conserva el parent y los inputs. |
| `superseded` | Conserva historial; impide adoptar accidentalmente sus salidas como si fueran las vigentes. |

La pausa no revoca una inferencia ya enviada. En ese caso se registra el despacho y se concilia su resultado antes de decidir otro envío.

## 9. Frontera Gravity pre-Mandate

### Encargo mínimo a Gravity

**Entrada requerida:**

- Organization y Project verificables.
- Tipo de Intent ASM.
- Scope pertinente al trabajo.
- Momento normativo solicitado, separado del momento de consulta.
- Referencias verificables y correlación con solicitud/ejecución.

**Salida esperada:**

- Postures aplicables identificadas y versionadas.
- Resolución normativa producida por Gravity.
- Evidencia que respalda aplicabilidad y relaciones utilizadas.
- Cobertura y referencias no resueltas.
- Momento evaluado y momento de observación.
- Condiciones que requieren nueva resolución.
- Error o indeterminación explícitos cuando no pueda responder.

Una lista vacía de Postures no demuestra ausencia de restricciones si la cobertura no es suficiente.

`ResolveActive` actualmente depende de Mandate y Session; su campo `Turn` sirve al cache y no representa por sí solo una consulta histórica. E9.

ASM consume el resultado. No lee la jerarquía para reconstruir autoridad ni calcula Gravity. El diseño interno del nuevo recorrido pertenece al trabajo de Gravity.

## 10. Frontera Impact

ASM prepara contexto, Postures resueltas, evidencia, cobertura, provenance y revisiones.

El contrato `impact/1` contiene contexto y referencias, pero no acredita una verificación externa estructurada de provenance. `Decode` rechaza campos desconocidos y los evaluadores incorporados también limitan el uso de `Payload` y `Parameters`. Esos campos no constituyen un canal informal para agregar los metadatos ASM. E10.

### Alternativas pendientes

| Alternativa | Qué debe demostrar |
|---|---|
| Adapter explícito | Traducción sin pérdida semántica, metadatos preservados y errores de conversión visibles. |
| Envelope exterior | Unión verificable entre metadatos ASM, request `impact/1` y assessment; sin atribuir al núcleo validaciones que no realiza. |
| Nueva versión | Necesidad real de que los nuevos datos formen parte del contrato de evaluación; compatibilidad y negociación explícitas. |

### Spike mínimo propuesto

Contrastar un caso completo y uno degradado con las tres alternativas:

1. Identificar qué datos afectan el cálculo y cuáles documentan provenance.
2. Preparar una traducción al contrato vigente.
3. Detectar pérdidas, incluida evidencia que no corresponda a los evaluadores disponibles.
4. Verificar unión e integridad entre metadatos y `InputDigest`.
5. Alterar una revisión externa y comprobar que no se reutiliza indebidamente la evaluación.
6. Confirmar que el decoder sigue rechazando campos informales.
7. Presentar costo, límites y compatibilidad de cada opción.

El spike debe producir una recomendación para José; no seleccionar silenciosamente la alternativa.

## 11. BISP, payload e inferencia

Las incompatibilidades materiales son concretas:

- `PlanCommand.register` admite dev/doc/seed, no ASM.
- `PayloadBuilder.build_from_plan` produce `files`.
- `submit_intent` consume `content` y `context_files`, busca una ubicación de briefing fija y lee `type` con fallback a dev.
- `_extract_file` puede devolver ausencia y el builder continuar sin ese crítico.
- AITAP materializa routing determinístico; la cadena real ASM de invocación, Vault y contabilidad no está demostrada. E4, E11–E12.

### Invariante de envío

**Cada elemento crítico debe corresponderse con contenido suficiente en el envío efectivo al modelo. De lo contrario, se bloquea antes de inferencia.**

La comprobación debe cubrir transformaciones, recortes y serialización final. Un contador de archivos, una referencia nominal o un payload intermedio no bastan.

| Caso de aceptación | Resultado requerido |
|---|---|
| Archivo crítico inexistente | Bloqueo con referencia, causa y dependencia. Cero invocaciones. |
| Recorte crítico | Bloqueo si elimina contenido requerido. Un fragmento sólo es suficiente si el plan identificaba expresamente esa unidad. |
| Referencia sin contenido | Bloqueo cuando la inferencia requiere contenido. |
| Deduplicación válida | Un contenido puede satisfacer varias obligaciones si se demuestra equivalencia y se preservan sus referencias. |
| Todos los críticos incluidos | Comprobación vinculada a plan y envío exactos; puede habilitar inferencia. |
| Resultado anterior incierto | Consultar y conciliar antes de reenviar; si no puede determinarse, conservar incertidumbre y aplicar una política explícita. |

No se promete ejecución exactamente una vez frente a un proveedor que no permita deduplicar o consultar operaciones inciertas.

La respuesta del modelo debe validarse como salida ASM. No debe interpretarse como operaciones de modificación de archivos por reutilizar sin adaptación un procesador de otro dominio.

## 12. Adopción y cierre ASM

Se propone que ASM termine cuando publique durablemente su AssemblyResult y, si corresponde, PostulateProposal. La revisión humana tiene continuidad propia y referencia esas salidas.

### Acto candidato de adopción

Nucleus debería registrar:

- Decisión autorizada y actor.
- Propuesta exacta revisada.
- AssemblyResult exacto que la fundamenta.
- Integridad de ambos.
- AssemblyRequest, Location e Intent de origen.
- Evaluaciones y limitaciones consideradas.
- Resultado de las comprobaciones de vigencia aplicables.

El artefacto representativo de la adopción es el **Postulate adoptado**, relacionado con el acto humano y la propuesta. Un booleano dentro de la salida ASM no lo sustituye.

### Edición humana

La edición genera otra revisión atribuida al humano. Si cambia alcance, objetivo, hechos, restricciones o contenido utilizado por Gravity/Impact, las evaluaciones afectadas requieren revisión. Las anteriores permanecen como evidencia histórica.

Una modificación editorial sólo puede conservar evaluaciones si existe una comprobación justificable de que no cambia sus inputs relevantes.

La aprobación debe comprobar la revisión esperada. Si el usuario vio una revisión y existe otra, no se cambia automáticamente el objeto aprobado.

### Handoff posterior

El Postulate conserva el fundamento adoptado. El Mandate posterior conserva referencias inmutables al Postulate, solicitud, Intent y revisiones aprobadas. Las ejecuciones fallidas o supersedidas pueden integrar provenance, nunca el contenido operativo por simple pertenencia al historial.

En las búsquedas realizadas en Brain, Nucleus y Orrery no se localizó una implementación de entidad, almacenamiento y adopción de Postulate; las coincidencias de Orrery eran contenido de demostración. Esto delimita la evidencia inspeccionada, no demuestra una ausencia universal.

`freeze_to_mandate` y Genesis no satisfacen esta frontera por su sola existencia. E4 y E8.

## 13. Decisiones reservadas a José

No requieren nueva ratificación las decisiones pre-Mandate incluidas en el encargo. Sí requieren ratificación:

1. Temporal como coordinador canónico de ejecución ASM.
2. Brain como propietario de artefactos y checkpoints subordinados a esa coordinación.
3. Nucleus como registrador de decisión y propietario de adopción de Postulate.
4. Cierre ASM al publicar salidas y separación de la espera humana.
5. Política de identidad y revisiones de AssemblyRequest, ejecución y salidas.
6. Fases persistidas y correspondencia con turnos.
7. Almacenamiento, concurrencia y conciliación Brain–Temporal.
8. Contrato externo pre-Mandate que deberá entregar Gravity.
9. Alternativa de integración Impact, después del spike.
10. Política de routing, presupuesto y tratamiento de inferencias inciertas.
11. Persistencia y reglas del Postulate adoptado y su handoff a Mandate.
12. Archivos nuevos y lista final de cambios para cada implementación.

**Conclusión:** el encaje conceptual es consistente con la permanencia pre-Mandate. Su soporte material exige cambios explícitos en creación, coordinación, recuperación, Gravity, BISP y adopción; no se obtiene habilitando `mandate_id = null`.

---

Documento relacionado: [Roadmap físico I3–I7 y milestone I8](ASM_PRE_MANDATE_EXECUTION_ROADMAP_I3_I7_v0_1.md).
