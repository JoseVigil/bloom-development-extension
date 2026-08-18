# Synapse Simulator — Cognitive Counterpart Design v0.1

**Estado:** propuesta de Etapa A; implementación bloqueada por gate de aprobación.  
**Fecha:** 2026-08-18.  
**Alcance:** contraparte cognitiva determinística reusable; no integración con Mandate Genesis.

## 0. Convenciones de evidencia

- **[C] Código:** comportamiento visible en código vigente.
- **[D] Documento:** afirmación de documentación, no necesariamente ejecutada.
- **[P] Prueba:** comportamiento observado por una prueba ejecutada.
- **[I] Inferencia:** conclusión derivada de evidencia.
- **[R] Recomendación:** diseño propuesto; requiere aprobación.

El código prevalece. Las rutas y símbolos citados son parte del hallazgo.

## 1. Resumen ejecutivo y decisión propuesta

El `synapse-simulator` actual **no es un fixture engine cognitivo**. Es una página de desarrollo generada por Brain y alojada en Cortex que lee manifests de protocolos, emite mensajes `chrome.runtime`, observa tráfico Synapse/IonPump y conserva un buffer efímero de logs en el service worker. **[C]** `brain/core/profile/web/templates/synapse-simulator/`, `brain/core/profile/web/synapse_simulator_generator.py`, `installer/cortex/extension/background.js:43-91,1580-2195`.

La recomendación es crear un **engine headless, transport-neutral, como módulo reusable**, con un adapter de Brain in-process en el primer milestone y una frontera que permita agregar después un proceso standalone. **[R]** La UI actual queda como inspector/controlador opcional y conserva su semántica actual. No se coloca lógica cognitiva en `background.js`, Nucleus ni Temporal.

El primer milestone debe ser durable del lado consumidor y puede mantener al Simulator sin autoridad cognitiva. Para reproducir crash/restart y late delivery con fidelidad, se recomienda un ledger SQLite opcional desde el corte de persistencia; el engine puro sigue siendo determinístico y testeable sin sockets. **[R]**

## 2. Matriz de verdad del Simulator actual

| Capacidad | Estado | Evidencia y alcance |
|---|---|---|
| UI dev de Cortex | Existe y funciona por diseño | Assets HTML/JS copiados al directorio de la extensión por `generate_synapse_simulator_page()`. **[C]** |
| Lectura de protocolos | Existe | `synapseSimulatorProtocol.js` y schema `installer/cortex/extension/protocols/synapse-simulator.schema.json`. **[C]** |
| Emisión `chrome.runtime` | Existe | La UI envía comandos/eventos al listener de `background.js`. **[C]** |
| Observabilidad Synapse/IonPump | Existe parcialmente | `background.js` reenvía eventos y mantiene hasta 100 entradas; depende de service worker/tab. **[C]** |
| Replay | Sintético/efímero | `SYNAPSE_SIMULATOR_HELLO` devuelve `SYNAPSE_SIMULATOR_REPLAY`; no es replay durable de inferencias. **[C]** |
| Buffering | Parcial | Buffer en memoria del service worker; se pierde al reiniciar. **[C]** |
| Fixture engine cognitivo | No existe | No hay catálogo, matcher, request/response cognitivo ni ledger. **[C]** |
| Persistencia de inferencias | No existe | Los logs no son autoridad ni almacén durable. **[C]** |
| Runtime headless cognitivo | No existe | La UI requiere contexto de extensión/Chrome; IonPump es automatización web, no inferencia simulada. **[C]** |
| Health/capabilities cognitivos | No existe | Hay health de stack/landing, no de contratos o fixtures. **[C]** |
| Fault injection contractual | No existe | Los botones/eventos de simulación no modelan transporte, retries ni outcomes cognitivos. **[C]** |
| Aplicación de Contrato D | Validador aislado solamente | `fs_contracts.py` valida shape/scope; no está conectado al pipeline legacy y no aplica operaciones. **[C]** |
| Submit/download legacy | Existe, incompatible con D-18 | Envía proyección reducida y usa framing Little Endian; download escucha `5679`. **[C]** |

### 2.1 Instalación, seed y launch

Brain copia los assets estáticos del Simulator al directorio de la extensión. **[C]** `synapse_simulator_generator.py`. Nucleus ofrece `synapse seed`/`launch` y su Supervisor registra telemetría y valida el workspace/config asociado al Simulator. **[C]** `installer/nucleus/internal/orchestration/commands/synapse.go`, `installer/nucleus/internal/supervisor/onboarding_synapse_simulator.go`. Chrome carga Cortex, `background.js` conecta el native host y abre la pestaña del Simulator cuando corresponde. **[C]**

Sentinel contiene un monitor de handshake documentado/en código, pero gran parte describe una arquitectura WebSocket histórica que no prueba el runtime cognitivo solicitado. **[C+D]** `installer/sentinel/internal/eventbus/synapse_handshake.go`.

### 2.2 Flujo actual

```text
Brain seed/generator ──copia assets──> Cortex extension
Nucleus/Supervisor ──seed/launch/config/telemetría──> Chrome profile
Chrome/Cortex background.js <──native messaging──> bloom-host/Brain host
         ^       |
         |       +── eventos Synapse/IonPump + buffer efímero
         |
Synapse Simulator UI ── chrome.runtime messages
```

No hay en este flujo una unidad durable `request → pending → cognitive response`. **[I]**

## 3. Discrepancia D-18: puerto, proceso, framing y ACK

1. `brain/core/server/server_manager.py:60-73,201-232,1198` es el listener real por defecto en `127.0.0.1:5678`; usa header de 4 bytes **Big Endian** y límite de 1 MiB. **[C]**
2. Los clientes Go vigentes de Nucleus usan `binary.BigEndian` contra ese puerto. **[C]** `installer/nucleus/internal/orchestration/activities/sentinel_activities.go`, `brain_poller.go`.
3. `IntentManager.submit_intent()` llama a `127.0.0.1:5678` describiéndolo como `bloom-host`, pero empaqueta y desempaqueta con **Little Endian**. Además reduce `payload.json` a `content/context_files/parameters/profile`; no transmite BISP/index/payload completos. **[C]** `brain/core/intent_manager.py:2000-2191`.
4. `SynapseProtocol` usa framing nativo de Chrome, dependiente de endian nativo mediante `struct.pack('I')`/`unpack('i')`; no define el protocolo TCP de `5678`. **[C]** `brain/core/synapse/synapse_protocol.py:31-66`.
5. `DownloadManager` escucha por separado en `5679`, Little Endian, y persiste el protocolo Bloom legacy en `.response/`; no consulta un resultado creado por submit. **[C]** `brain/core/download_manager.py`.
6. Los mensajes `*_ACK`, `SYSTEM_ACK` y el retorno inmediato de submit prueban recepción/procesamiento de comando, no finalización cognitiva durable. **[C+I]**

**Conclusión:** no reutilizar el transporte legacy para la contraparte. Definir primero interfaz y envelopes transport-neutral; cualquier adapter TCP futuro deberá demostrar framing, correlación, límites y semántica ACK/pending/final con pruebas de contrato. **[R]**

## 4. Alternativas de ubicación

| Alternativa | Ventajas | Riesgos/dependencias | Headless/fallos | Veredicto |
|---|---|---|---|---|
| UI Cortex | Reusa inspector | Chrome/tab obligatorios; mezcla UI/runtime | No; fallos pobres | Rechazar como engine |
| `background.js` | Acceso a mensajes actuales | Service worker efímero; Chrome; archivo ya crítico | No; reinicios ambiguos | Rechazar |
| Módulo dentro de Brain | Simple, rápido, dueño del BISP cerca | Acoplamiento si API importa modelos de Brain | Sí; sólo fallos in-process | Viable como adapter |
| Engine headless neutral + adapter Brain | Reusable, testeable, migrable | Nuevo paquete/contratos | Sí; proceso opcional para fidelidad | **Recomendada** |
| Proceso standalone | Aísla crashes/restarts/transporte | Lifecycle, puerto y ledger adicionales | Máxima fidelidad | Segundo adapter/corte |
| Nucleus/Temporal | Durable ya disponible | Viola ownership y exclusiones; sobredimensiona | Sí, pero semántica incorrecta | Rechazar |

No hace falta proceso separado para el primer corte. El mismo contrato debe ejecutarse in-process; pruebas que necesiten disconnect real, framing o muerte de proceso usarán el adapter standalone. **[R]**

## 5. Arquitectura propuesta y ownership

```text
Consumer/Brain (dueño de intent y avance lógico)
  ├─ persiste inference/request/response
  ├─ valida BISP y respuesta solicitada
  └─ Counterpart interface
       ├─ SimulatorCounterpart adapter
       │    └─ headless fixture engine ── fixture catalog + optional ledger
       ├─ AitapCounterpart (futuro)
       ├─ DirectApiCounterpart (futuro)
       └─ BrowserCounterpart (futuro)

Cortex Synapse Simulator UI (opcional)
  └─ lista/inspecciona/replaya mediante API de administración; nunca requerida
```

| Artefacto/decisión | Owner |
|---|---|
| BISP, intent, request durable y avance lógico | Brain/consumidor |
| Contrato neutral de contraparte | módulo compartido, aprobado por consumidores |
| Matching y ejecución de fixtures | engine Simulator |
| Ledger diagnóstico/replay del Simulator | engine, no autoridad cognitiva |
| Mandate/Genesis/Domain/Gene/Temporal | consumidor correspondiente, nunca Simulator |
| Validación y aplicación Contrato D | orquestador consumidor; Simulator sólo produce fixtures separados |
| UI/observabilidad Cortex | Cortex, opcional |

## 6. Request envelope `counterpart.request/1.0`

```json
{
  "contract_version": "counterpart.request/1.0",
  "request_id": "uuid-physical-attempt",
  "logical_inference_id": "stable-logical-id",
  "attempt": 1,
  "supersedes_request_id": null,
  "correlation_id": "uuid",
  "intent": {"intent_id":"uuid","intent_type":"ing","mandate_id":null},
  "turn": {"stage":"classification","turn":1,"target":"logical-target"},
  "requested_response": {"contract":"cognitive.response/1.0","mode":"cognitive"},
  "bisp": {"index":{},"payload":{},"index_sha256":"...","payload_sha256":"..."},
  "context_manifest": [{"logical_path":"docs/a.md","sha256":"...","size_bytes":123,"content_ref":"consumer://..."}],
  "simulation": {"fixture_id":"happy-path","fixture_version":"1.0.0","parameters":{}},
  "timestamps": {"created_at":"RFC3339"},
  "audit": {"producer":"brain","producer_version":"...","trace_id":"..."}
}
```

Reglas: `request_id` identifica un intento físico; `logical_inference_id` agrupa retries; `intent_id` no sustituye ninguno. `simulation` está fuera del BISP. `index` y `payload` son los objetos reales, no una proyección. `context_manifest` usa contenido inline sólo bajo un límite acordado o referencias verificables resueltas por el consumidor. **[R]**

Canonicalización para hash: JSON RFC 8785/JCS, UTF-8, sin BOM; hashes `sha256` hex minúscula. Límite inicial recomendado: envelope 8 MiB, archivo inline 1 MiB, 2.000 entradas de manifest, profundidad JSON 64; configurable con hard cap. Campos desconocidos se aceptan sólo dentro de `extensions`; en el core son error para major 1. Minor versions agregan campos opcionales; major incompatible falla antes del ACK aceptado. **[R]**

## 7. Response envelope `counterpart.response/1.0`

```json
{
  "contract_version":"counterpart.response/1.0",
  "fixture":{"id":"happy-path","version":"1.0.0","catalog_version":"1.0.0"},
  "request_id":"uuid","logical_inference_id":"stable-id","correlation_id":"uuid",
  "intent_id":"uuid","stage":"classification","turn":1,
  "outcome":"completed",
  "completion":{"terminal":true,"status":"complete","retryable":false,"recoverable":false},
  "cognitive_content":{"format":"json","value":{}},
  "human_intervention":null,"error":null,
  "timestamps":{"accepted_at":"RFC3339","completed_at":"RFC3339"},
  "response_sha256":"..."
}
```

Outcomes: `completed`, `continue_turn`, `needs_clarification`, `partial`, `truncated`, `temporary_error`, `timeout_observed`, `disconnected`, `contract_error`, `fixture_not_found`, `invalid_request`, `correlation_mismatch`. `completed`, errores contractuales y fixture inexistente son terminales para ese request; `continue_turn` termina el request pero requiere nuevo trabajo lógico decidido por el consumidor; `temporary_error` y desconexión pre-final son retryable; clarification requiere intervención; partial/truncated sólo son recuperables si el contenido preservado es parseable y su boundary está declarado. **[R]**

### 7.1 Estados de entrega

- `submit()` retorna `accepted` (ACK de recepción) o rechazo contractual; nunca finge resultado final.
- `get(request_id)` retorna `pending`, `final` o `unknown`.
- La respuesta cognitiva final es el envelope anterior y se persiste separadamente.
- El timeout del consumidor es una observación local; si ningún response fue entregado, no se fabrica contenido cognitivo de error.

## 8. Separación formal de Contrato D

Son tres artefactos distintos: (1) inference request, (2) cognitive response, (3) `BSIP-Response` de Contrato D. **[R]** `brain/core/intent/fs_contracts.py` contiene un schema/validador aislado v0.1 con `create/edit/patch/delete`, scope autorizado por el caller y checksums. **[C]** `response_parser.py` y `DownloadManager` pertenecen al protocolo legacy de archivos completos y no consumen ese validador. **[C]**

El modo `requested_response.mode = "contract_d"` sólo se permite en una suite `contract-d/`; su `cognitive_content.value` contiene el candidato crudo. Brain ejecuta `validate-contract`; el Simulator nunca valida autoridad, decide scope, aplica operaciones ni toca filesystem. **[R]**

## 9. Fixture schema y catálogo

Cada fixture declarará: `fixture_schema_version`, `id`, SemVer `version`, descripción/tags, request/response versions soportadas, `match` (predicados parciales), `assertions`, `response`, `timing`, `faults`, `expected_consumer_result`, compatibilidad/deprecación y hash del fixture. No se permite código, plantillas con evaluación ni paths fuera del catálogo. **[R]**

Selección determinística: fixture explícito exacto gana; de lo contrario filtrar compatibles, ordenar por `priority` descendente y luego `(id, version)`; empate de prioridad+especificidad es `ambiguous_fixture`, nunca selección arbitraria. El catálogo se carga completo, valida y queda inmutable por corrida. **[R]**

Catálogo cognitivo mínimo: happy path; otro turn; clarificación; shape inválido; timeout; disconnect; duplicado idéntico; duplicado conflictivo; truncamiento; partial recuperable; correlation incorrecta; fixture desconocido; BISP incompleto; versión incompatible; respuesta tardía; replay completado. Suite separada Contrato D: operaciones válidas, scope violation, checksum drift y shape inválido. **[R]**

## 10. Fault model

Los fallos viven en `faults`, no en `response`. Tipos: delay determinístico; consumer timeout; disconnect antes/después de ACK; disconnect durante response con byte offset; truncamiento por bytes; JSON/shape inválido; duplicado inmediato/tardío; reorder por sequence barrier; fixture crash; simulator restart; ACK drop/repeat. Seeds y tiempos son explícitos; no se usa azar ambiental. **[R]**

In-process simula fielmente delay lógico, invalid shape, duplicados, orden y excepciones. Disconnect por bytes, pérdida real de ACK, framing corrupto, muerte/restart de proceso y late packets requieren adapter standalone/transporte real para evidencia fiel. **[R]**

## 11. Idempotencia, persistencia y recuperación

- Mismo `request_id` + mismo hash: devolver ACK/resultado previamente registrado, sin reejecutar efectos.
- Mismo `request_id` + hash distinto: `idempotency_conflict`, terminal.
- Nuevo `request_id` del mismo `logical_inference_id`: `attempt` incrementa y `supersedes_request_id` es obligatorio.
- El consumidor aplica CAS/unique constraint sobre avance lógico; duplicados idénticos no avanzan dos veces; conflictivos se ponen en cuarentena.
- Late response se conserva y clasifica; no revierte automáticamente el timeout ni gana sobre un intento posterior.
- Crash tras accept/produce/deliver se recupera desde estados `accepted/produced/delivered`; delivery es at-least-once, efecto lógico exactly-once en consumidor.
- Replay manual crea un delivery auditado del resultado existente; no una nueva inferencia.
- Retención propuesta: fixtures indefinidos/versionados; ledger 30 días o 10.000 requests, configurable, con tombstones de idempotencia por un período mayor.

Primer corte: engine puro stateless + persistencia obligatoria del consumidor. Corte de persistencia/restart: SQLite local del Simulator con WAL, migraciones versionadas y payloads por hash. **[R]**

## 12. Interfaz reemplazable

```text
submit(request) -> Accepted(request_id, status_uri) | Rejected(error)
get(request_id) -> Unknown | Pending | Final(response)
cancel(request_id) -> Cancelled | TooLate | Unknown
health() -> status
capabilities() -> contract versions, limits, modes, fixture catalog hash
```

El adapter in-process puede devolver `Final` inmediatamente como optimización, pero debe persistir/mostrar la misma transición `accepted → final`. Ningún tipo público menciona Genesis, Temporal, Chrome, AITAP, proveedor o fixture internals. Los adapters AITAP/API/browser preservan IDs, ACK/pending/final, outcomes e idempotencia; sólo cambia el transporte y la obtención del contenido. **[R]**

## 13. Headless, UI, observabilidad y seguridad

CLI/API propuesta: `brain counterpart simulator serve`, `fixtures list/validate`, `submit`, `get`, `replay`, `health`, todos con salida humana y `--json-help`/JSON coherente con la norma del ecosistema. **[R]** La UI existente puede consultar estas APIs, pero no forma parte del path de ejecución.

Logs JSON incluyen trace/request/logical IDs, fixture id/version, transición, latencia y fault aplicado; nunca vuelcan BISP completo por defecto. Métricas: accepted/final/error, latencia, pending, replay, idempotency conflicts, fixture misses y ledger recovery. Redacción por claves y clasificación; hashes permiten diagnóstico sin contenido. **[R]**

Guardrails: catálogo bajo raíz fija; paths normalizados sin traversal/symlinks externos; tamaños/profundidad/delay limitados; JSON sin NaN/Infinity/duplicated keys; hashes verificados; fixtures data-only; sin imports, shell, eval, browser ni filesystem operations; aislamiento por request; revisión y SemVer obligatorios. **[R]**

## 14. Plan exacto de implementación (no ejecutado)

Ubicación propuesta, sujeta a aprobación:

1. `brain/core/counterpart/contracts/` — modelos y schemas request/response.
2. `brain/core/counterpart/interface.py` — protocolo neutral.
3. `brain/core/counterpart/simulator/engine.py`, `matcher.py`, `faults.py`, `ledger.py`.
4. `brain/core/counterpart/adapters/simulator.py` — adapter de Brain.
5. `brain/commands/counterpart/` — CLI headless conforme a la norma.
6. `brain/fixtures/counterpart/cognitive/` y `contract-d/` — catálogos versionados.
7. `brain/tests/counterpart/` — unit, contract, property y restart tests.
8. `installer/cortex/extension/` — sólo en un corte opcional posterior para inspector; no modificar inicialmente.
9. `docs/SYNAPSE_SIMULATOR/` — contratos, fixture authoring y operación.

No se modificará Mandate Genesis, Temporal, AITAP, `dis/`, native host ni Agenda Maestra. **[R]**

## 15. Plan de pruebas y evidencia requerida

1. Validación JSON Schema y canonical hashes, incluyendo límites/malicia.
2. Determinismo y ambigüedad del matcher.
3. Los 16 fixtures cognitivos y 4 de Contrato D.
4. Matriz ACK/pending/final y todos los outcomes.
5. Idempotencia, conflicto, duplicados y late response.
6. Property tests: mismo catálogo/request produce mismo resultado.
7. Reinicio en cada punto del ledger y recuperación sin doble avance.
8. Adapter contract suite compartida por in-process y standalone.
9. Prueba manual desde un BISP real de Brain, sin Genesis.
10. UI opcional: ausencia de Chrome no afecta ninguna prueba headless.

Pruebas legacy relevantes deben permanecer verdes: validador de Contrato D, intent response parsing y Synapse/ServerManager. No se afirmará compatibilidad TCP hasta tener una prueba que demuestre endian y semántica en ambos extremos. **[R]**

## 16. Compatibilidad y migración

El activo actual conserva nombre, assets, mensajes y observabilidad. La nueva capacidad se añade detrás de una API separada; no se reinterpretan `SYNAPSE_SIMULATOR_HELLO/LOG/REPLAY`. **[R]** Una integración UI posterior será sólo inspector.

Migración: `SimulatorCounterpart` establece la suite contractual; `DirectApiCounterpart` transporta los mismos envelopes a una API; `AitapCounterpart` deja AITAP como gateway crudo y Brain parsea; `BrowserCounterpart` automatiza proveedor pero conserva IDs/outcomes. El consumidor no cambia su máquina de estados. **[R]**

## 17. Riesgos y discrepancias registradas

- El nombre existente induce a confundir UI/protocol debugger con engine cognitivo. **[C+I]**
- D-18 hace peligroso reutilizar `5678`: listener Brain Big Endian vs submit legacy Little Endian y falsa atribución a `bloom-host`. **[C]**
- BISP vigente mantiene decisiones abiertas sobre contrato Synapse para Genesis; este diseño recibe necesidades del consumidor, no las convierte unilateralmente en reglas globales. **[D+R]** `BLOOM_BISP_Fuente_de_Verdad_v1_0.md:A.2.5-A.2.6,A.9`.
- Contrato D v0.1 es validador aislado y su formato/recovery sigue evolucionando; debe versionarse separadamente. **[C+D]**
- Un engine puramente in-process no demuestra fallos físicos; la suite debe distinguir simulación lógica de evidencia de transporte. **[I]**
- El worktree contiene cambios ajenos en `background.js`, ServerManager, Genesis y Agenda; este Work no los modifica. **[C]**

## 18. Decisiones que requieren aprobación (gate)

1. Aprobar engine neutral + adapter Brain in-process como primer milestone.
2. Aprobar namespace/rutas `brain/core/counterpart/` y `brain/fixtures/counterpart/`.
3. Aprobar request/response v1.0, IDs, outcomes y límites iniciales.
4. Aprobar stateless inicial + ledger SQLite en el corte de persistencia.
5. Aprobar que el servicio standalone sea adapter de pruebas/futuro, no requisito inicial.
6. Aprobar que la UI actual permanezca intacta hasta el corte opcional de integración.
7. Aprobar suites cognitiva y Contrato D completamente separadas.
8. Decidir retención final y si `partial` v1 permite contenido recuperable o sólo diagnóstico.

**GATE:** no crear schemas ejecutables, código, fixtures ni adapters hasta recibir aprobación explícita de estas decisiones. Este documento cierra únicamente la Etapa A.

## 19. Verificación de esta Etapa A

- `git diff --check` sobre este documento: sin errores. **[P]**
- No se modificó código ni `docs/CONTROL/AGENDA_MAESTRA.md`; esa Agenda ya tenía cambios ajenos al comenzar el Work. **[P]**
- Se intentó ejecutar `brain/tests/intent/test_validate_contract.py`; el entorno no expone Python en `PATH` y el runtime Python disponible no incluye `pytest`. Por lo tanto, no se atribuye una corrida verde inexistente. **[P]** Esto no bloquea el diseño, pero la suite deberá ejecutarse al comenzar la futura Etapa B.
- No fueron necesarios AITAP, OpenCode, browser, credenciales, Temporal ni `dis/`. **[P]**
