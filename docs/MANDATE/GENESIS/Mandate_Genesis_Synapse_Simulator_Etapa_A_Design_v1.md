# Mandate Genesis + Synapse Simulator — Informe de Etapa A

**Versión:** 1.0  
**Fecha:** 2026-08-18  
**Estado:** relevamiento y diseño completados; implementación pendiente de aprobación explícita.  
**Alcance:** primer corte vertical determinístico de Mandate Genesis usando `synapse-simulator` como contraparte cognitiva controlada.

## 1. Jerarquía de evidencia

Este informe distingue:

- **[C] Código:** comportamiento confirmado en archivos vigentes.
- **[D] Documentación:** decisión o descripción documental todavía no necesariamente implementada.
- **[P] Prueba:** comportamiento observado mediante una prueba ejecutada.
- **[I] Inferencia:** recomendación o conclusión de diseño derivada de la evidencia.

Para describir el presente prevalece el código. Este documento no declara implementado ningún comportamiento que sólo exista en documentación.

## 2. Conclusión ejecutiva

El vertical Genesis → BISP → contraparte cognitiva → respuesta durable → Temporal → Core todavía no existe de punta a punta.

Sí existen:

1. creación de `mandate_state.json` desde Core;
2. catch-up desde disco y escucha de eventos en Core;
3. un watcher capaz de iniciar un workflow Genesis con ID determinístico;
4. un workflow Temporal específico de Genesis;
5. una activity que crea e hidrata un intent `ing` real;
6. estructuras de Brain para `ing`, recepción, clasificación y consolidación;
7. schema y validador de Contrato D.

Los cortes internos comprobados son:

1. el worker persistente no inicia el `MandateWatcher`;
2. faltan activities registradas para Human Sync y firma;
3. Genesis sólo invoca `brain intent create` y `hydrate`;
4. no construye `index.json` y `payload.json` de fase ni ejecuta submit/response;
5. la propuesta de dominios es sintética;
6. la ejecución final es placeholder;
7. el submit/download actual de Brain es legacy e incompatible con `ing`;
8. el `synapse-simulator` actual es una UI de Cortex para Synapse/IonPump, no un fixture engine cognitivo headless;
9. D-18 sobre puerto y framing está confirmado y desaconseja reutilizar el socket legacy;
10. los eventos emitidos por Go no coinciden plenamente con el contrato consumido por Core.

AITAP, proveedores reales, credenciales, browser automation y `dis/` no son
bloqueantes para el primer corte. OpenCode es una capacidad first-party
instalada y administrada de Cognituum, pero este vertical no está obligado a
seleccionarla como runtime.

## 3. Matriz de verdad

| Tramo | Estado real | Evidencia principal |
|---|---|---|
| Onboarding → Core | Implementado: deja y consume `pending_genesis_launch` | `webview/app/src/lib/bootstrap/genesisLaunch.ts` **[C]** |
| Creación inicial | Implementada: escribe `mandate_state.json` con `building/ingest/pending` | `src/api/handlers/create-mandate.handler.ts` **[C]** |
| Catch-up de Core | Implementado mediante `GET /mandates` | `src/api/handlers/list-mandates.handler.ts` **[C]** |
| Observación en vivo | Existe, con desalineaciones de eventos | `src/types/ws-events.ts`, `mandateStore.ts` **[C]** |
| Watcher → workflow | Implementado, pero no vive en `worker start` | `mandate_watcher.go`, `worker.go` **[C]** |
| Idempotencia del watcher | Parcial: fingerprint en memoria + Workflow ID estable | `mandate_watcher.go` **[C]** |
| Registro de activities | Parcial: faltan persistencia de Human Sync y firma | `worker.go` **[C]** |
| Crear/hidratar `ing` | Implementado y conectado a Genesis | `mandate_genesis_activities.go` **[C]** |
| BISP de fase para `ing` | Definido por spec e infraestructura, no invocado por Genesis | spec de `ing`, `intent_manager.py` **[C][D]** |
| Submit actual | Existe como camino legacy; reduce el payload | `intent_manager.py::submit_intent` **[C]** |
| Identidad de inferencia | Inexistente; se reutiliza `intent_id` como `command_id` | `intent_manager.py` **[C]** |
| ACK vs. respuesta final | Submit sólo recibe un ACK inmediato; no procesa respuesta cognitiva | `intent_manager.py` **[C]** |
| Download | Comando con import inválido; manager real vive en otra ruta | `download.py`, `brain/core/download_manager.py` **[C]** |
| Download para `ing` | No existe: sólo busca `dev/doc` y stages legacy | `download_manager.py` **[C]** |
| Parse legacy | Existe para `bloom_protocol`; no es contrato cognitivo de `ing` | `response_parser.py` **[C]** |
| Contrato D | Implementado y separado del pipeline legacy | `fs_contracts.py`, schema v0.1 **[C]** |
| Clasificación Genesis | Sintética: un dominio y cohesión `1.0` | `mandate_genesis_activities.go` **[C]** |
| Human Sync | Workflow espera señal; CLI existente no está cableada al padre | workflow y command de domains **[C]** |
| Firma | Activity existe, pero no está registrada en el worker | `mandate_genesis_sign_activity.go`, `worker.go` **[C]** |
| Ejecución final | Placeholder: éxito con lista vacía | `mandate_execution_workflow.go` **[C]** |
| Estado final durable | No se persiste `completed` | workflow actual **[C]** |
| `dis` | Existe como intent, no está conectado y no bloquea este milestone | código y specs **[C][D]** |
| Simulator cognitivo | No existe | schema y UI actuales **[C]** |

## 4. Flujo presente

```text
Onboarding deja pending_genesis_launch
  → Core ejecuta POST /mandates
  → mandate_state.json = building / ingest / pending
  → Core lo muestra por evento o catch-up
  └─ CORTE: MandateWatcher no vive en worker start

Si el watcher está activo:
  → MandateGenesisBuildWorkflow
  → brain intent create --type ing
  → brain intent hydrate
  → evento mandate:phase:ingest
  → ScaffoldDomainActivity dry_run
  → domain_proposal sintética de un dominio
  → Temporal espera Human Sync
  └─ CORTE: activities de persistencia/firma no registradas

Si se superan esos cortes:
  → firma mandate.json
  → MandateExecutionWorkflow devuelve éxito vacío
  └─ CORTE: no crea Domains/Genes ni persiste completion
```

No existe dentro de este recorrido:

```text
build BISP
→ submit
→ fixture cognitivo
→ persist response
→ validate
→ incorporate
→ durable result para Temporal
```

## 5. Auditoría del Synapse Simulator actual

### 5.1 Responsabilidad comprobada

El componente vigente es una UI dev dentro de la extensión Cortex que:

- descubre schemas de Discovery, Landing e IonPump;
- genera formularios para mensajes declarados;
- despacha por `chrome.runtime.sendMessage`;
- observa eventos conservados en un buffer del service worker;
- puede inyectar eventos de onboarding y comandos DOM.

### 5.2 Interfaces actuales

- Entrada: interacción humana en una página `chrome-extension://.../synapse-simulator/index.html`.
- Dispatch: `chrome.runtime.sendMessage`.
- Salida: ACK del handler y feed `SYNAPSE_SIMULATOR_LOG`.
- Nucleus/Sentinel configuran, lanzan, supervisan o registran observabilidad; no ejecutan fixtures cognitivos.

### 5.3 Capacidades ausentes

El componente no:

- acepta tráfico cognitivo externo;
- recibe `index.json` o `payload.json`;
- conoce `request_id`, stage o turn cognitivo;
- selecciona fixtures versionados;
- persiste request/response;
- ejecuta headless;
- modela delay, timeout, disconnect, duplicate, truncation o correlation mismatch como escenarios declarativos.

La UI de Cortex, Chrome y native host no deben convertirse en dependencias obligatorias del workflow.

## 6. D-18: transporte legacy

La discrepancia está confirmada por código:

- `brain/core/server/server_manager.py` escucha por defecto en `127.0.0.1:5678` y usa header de cuatro bytes Big Endian;
- los clientes vigentes del servidor Brain usan ese framing Big Endian;
- `brain/core/intent_manager.py::submit_intent()` también apunta por defecto a `5678`, pero usa Little Endian y describe el destino como `bloom-host.exe`;
- `bloom-host` también declara `5678`.

Conclusión: no reutilizar este socket como frontera cognitiva nueva. Debe definirse primero una interfaz transport-neutral. El ACK de transporte y la respuesta cognitiva final deben ser contratos diferentes.

## 7. Alternativas de ubicación

| Alternativa | Ventajas | Riesgos | Recomendación |
|---|---|---|---|
| UI Cortex | Reutiliza panel y schemas | Obliga Chrome/UI; no es headless | Rechazada como runtime |
| `background.js` | Ya tiene routing | Obliga extensión/native host; hereda D-18 | Rechazada para milestone 1 |
| Nucleus/Temporal | Cerca del workflow | Mezcla orquestación con fixtures cognitivos | Rechazada |
| Módulo directo en Brain | Acceso fácil al intent | Puede mezclar negocio con simulación | Sólo detrás de interfaz |
| Engine headless + adapter Brain | Reusable, determinístico, reemplazable | Agrega contratos y store | **Recomendada** |
| Proceso standalone inicial | Fallos de proceso más fieles | Lifecycle y transporte prematuros | Milestone posterior |

Recomendación: un fixture engine headless y transport-neutral consumido mediante `SimulatorCounterpart`, detrás de una interfaz propiedad de Brain. El primer corte puede ser in-process. La UI actual queda como superficie opcional de control/inspección.

## 8. Flujo propuesto

```text
MandateWatcher inicia exactamente un workflow
  → activity solicita ejecutar una fase cognitiva
  → Brain crea/hidrata ing
  → Brain construye index.json + payload.json reales
  → Brain persiste inference_request
  → ExternalCognitiveCounterpart.submit(request)
  → SimulatorCounterpart selecciona fixture versionado
  → Brain recibe y persiste raw cognitive_response
  → Brain valida shape, IDs, correlación y contenido
  → Brain incorpora el resultado al intent
  → la activity recupera/devuelve un resultado durable
  → Temporal decide avanzar, abrir otro turn o esperar Human Sync
  → se persiste la proyección de Mandate
  → Core observa por WS o catch-up
```

La activity no debe confiar en un resultado sólo en memoria. Ante retry debe consultar primero el resultado persistido en Brain.

## 9. Contrato 1 — Submit request

Nombre propuesto: `cognitive_submit_request`, versión `1.0`.

Campos mínimos:

```json
{
  "contract_version": "1.0",
  "request_id": "uuid por intento físico",
  "logical_inference_id": "uuid estable para el trabajo lógico",
  "attempt": 1,
  "supersedes_request_id": null,
  "correlation_id": "estable dentro de una fase/turno",
  "intent_id": "uuid del intent",
  "mandate_id": "uuid del mandate",
  "intent_type": "ing",
  "stage": "classification",
  "turn": 1,
  "target": "simulator",
  "requested_response_contract": {
    "kind": "cognitive",
    "version": "1.0"
  },
  "bisp": {
    "index": {},
    "payload": {},
    "index_sha256": "...",
    "payload_sha256": "..."
  },
  "context_manifest": [],
  "simulation": {
    "scenario_id": "ing.classification.happy_path",
    "scenario_version": "1.0"
  },
  "created_at": "...",
  "metadata": {}
}
```

Reglas:

- Brain crea las identidades.
- `request_id` identifica el intento físico.
- `logical_inference_id` identifica el mismo trabajo lógico entre retries.
- `correlation_id` identifica la conversación/fase/turno.
- El BISP no se reduce a un payload exclusivo de testing.
- `simulation` configura el fixture, pero no forma parte del contenido cognitivo.
- El contrato no depende de socket, HTTP, in-process, AITAP o browser.

## 10. Contrato 2 — Respuesta cognitiva

Nombre propuesto: `cognitive_response`, versión `1.0`.

```json
{
  "contract_version": "1.0",
  "fixture": {
    "id": "ing.classification.happy_path",
    "version": "1.0"
  },
  "request_id": "...",
  "logical_inference_id": "...",
  "correlation_id": "...",
  "intent_id": "...",
  "mandate_id": "...",
  "stage": "classification",
  "turn": 1,
  "outcome": "completed",
  "completion": {
    "status": "complete",
    "recoverable": false,
    "truncated": false
  },
  "content": {
    "message": "...",
    "artifacts": {}
  },
  "human_intervention": null,
  "error": null,
  "produced_at": "...",
  "response_sha256": "..."
}
```

Outcomes mínimos:

- `completed`;
- `continue`;
- `human_required`;
- `partial`;
- `retryable_error`;
- `contract_error`.

Brain debe persistir el raw antes de procesarlo. Una respuesta inválida o con correlación incorrecta nunca puede aplicarse al estado del intent.

## 11. Contrato 3 — Contrato D

Contrato D permanece separado de la respuesta cognitiva.

- Sólo se solicita para operaciones de filesystem.
- Se valida mediante `validate-contract` y `fs_contracts.py`.
- No participa del happy path cognitivo de Genesis.
- El Simulator puede ofrecer fixtures de Contrato D en una suite separada.
- El Simulator no aplica operaciones ni decide scope.
- Este milestone no aplica filesystem.

## 12. Ownership

| Responsabilidad | Dueño |
|---|---|
| Crear `request_id` | Brain |
| Crear/conservar `logical_inference_id` | Brain |
| Crear/conservar `correlation_id` | Brain |
| Declarar requisitos del target | Brain |
| Seleccionar runtime abstracto y provider/model por separado | AITAP bajo policy aprobada |
| Autorizar dispatch/transición | Temporal |
| Seleccionar fixture | Adapter del Simulator |
| Persistir request | Brain, antes del submit |
| Persistir raw response | Brain, antes de notificar a Temporal |
| Validar envelope y correlación | Brain |
| Validar contenido del intent | Brain |
| Actualizar estado canónico del intent | Brain |
| Decidir si hace falta otro turn | Brain |
| Decidir la próxima fase de Genesis | Temporal |
| Estado canónico de orquestación | Historial de Temporal |
| Proyección observable del Mandate | `mandate_state.json` |
| Proyección hacia Core | Eventos posteriores a persistencia + catch-up |

El Simulator nunca decide fases, crea Domains/Genes, completa Mandates ni escribe estado canónico.

## 13. Idempotencia y recuperación

Reglas propuestas:

- Retry exacto: conserva `logical_inference_id`.
- Mismo `request_id` y mismo hash: replay del resultado persistido.
- Mismo `request_id` y contenido distinto: error `identity_conflict`.
- Nuevo intento físico: nuevo `request_id` con `supersedes_request_id` explícito.
- Duplicado idéntico: registrar y no avanzar dos veces.
- Duplicado conflictivo: cuarentena y error de consistencia.
- Respuesta tardía: persistir como `late`; aplicar sólo si no existe un resultado aceptado y el trabajo sigue abierto.
- Crash después de persistir response: el retry continúa desde disco.
- Crash después de informar a Temporal: el replay recupera el mismo resultado y no abre otro turn.
- Reinicio de Brain: reconstrucción desde request/response/state.
- Reinicio del Simulator: Brain conserva el request y puede repetirlo.
- Fixture inexistente: error contractual explícito, no timeout artificial.
- BISP incompleto: rechazo antes de invocar la contraparte.
- Correlation ID incorrecto: cuarentena.
- Partial recuperable: persistir evidencia y abrir continuación explícita.
- Eventos para Core sólo después del commit durable.
- Escrituras críticas mediante temporal + rename atómico.

## 14. Blockers internos comprobados

1. Watcher ausente del worker persistente.
2. Activities de Human Sync/firma sin registrar.
3. Ausencia de frontera cognitiva reemplazable.
4. Ausencia de builder BISP ejecutado para fases `ing` desde Genesis.
5. Submit legacy incompatible.
6. Download legacy roto e incompatible con `ing`.
7. Ausencia de procesador de respuesta cognitiva para `ing`.
8. Ausencia de ledger de requests e identidad por inferencia.
9. Clasificación sintética.
10. Eventos Go/Core desalineados.
11. Publicación real de eventos incompleta.
12. Child workflow y finalización placeholder.
13. Escrituras de estado no unificadas ni atómicas.

## 15. Plan de implementación propuesto

### Brain

Crear, con nombres finales sujetos a aprobación:

- `brain/core/cognitive_counterpart/contracts.py`;
- `brain/core/cognitive_counterpart/interface.py`;
- `brain/core/cognitive_counterpart/execution_store.py`;
- `brain/core/cognitive_counterpart/simulator.py`;
- `brain/core/cognitive_counterpart/response_processor.py`;
- schemas versionados de request/response;
- catálogo de fixtures;
- `brain/commands/intent/execute_turn.py`;
- pruebas bajo `brain/tests/cognitive_counterpart/`.

Modificar:

- `brain/core/intent_manager.py`;
- piezas de builder/estado de `ing` estrictamente necesarias;
- `brain/cli/command_loader.py`.

No extender `submit_intent()` como parche. Mantenerlo como legacy hasta una migración explícita.

### Nucleus y Temporal

Modificar:

- `worker.go`;
- `mandate_watcher.go`;
- `mandate_genesis_activities.go`;
- `mandate_genesis_build_workflow.go`;
- registro de activities y pruebas Temporal.

Crear una activity cognitiva dedicada detrás de la frontera de Brain.

### Core

Modificar:

- `src/types/ws-events.ts`;
- `webview/app/src/lib/stores/mandateStore.ts`;
- catch-up/API sólo si hacen falta campos adicionales;
- pruebas de contrato Go → server → store.

### Simulator UI

No convertirla en runtime obligatorio. Después de validar el engine headless puede agregarse una superficie opcional para listar fixtures, ejecutar scenarios, inspeccionar request/response y replay.

## 16. Migración posterior

La interfaz debe admitir adapters equivalentes:

```text
SimulatorCounterpart
AitapCounterpart
DirectApiCounterpart
BrowserCounterpart
```

Genesis sólo debe consumir un `CognitiveExecutionResult`. No debe conocer provider, socket, navegador, fixture ni detalles de transporte.

AITAP transportará respuesta cruda. Brain seguirá siendo dueño de persistirla, validarla e incorporarla.

## 17. Plan de pruebas

1. Schemas request/response y separación de Contrato D.
2. Store atómico, replay, duplicates y conflictos de identidad.
3. Selección determinística de fixtures.
4. Intent `ing` manual: create → hydrate → build → execute → persist → process.
5. Otro turn, Human Sync, partial, invalid shape, timeout y correlation mismatch.
6. Activity Temporal con retry y recuperación desde Brain.
7. Watcher idempotente dentro del worker persistente.
8. Eventos Core y catch-up.
9. E2E con servicios recién iniciados.
10. Reinicios en fronteras críticas.
11. Suite separada de Contrato D.
12. Materialización Domains/Genes como milestone posterior si el child workflow sigue siendo placeholder.

## 18. Pruebas ejecutadas durante Etapa A

- La suite Python de Contrato D no pudo ejecutarse porque el runtime disponible no incluía `pytest`. **[P]**
- El primer intento de pruebas Go falló por falta de acceso al cache global. **[P]**
- El segundo intento usó un cache aislado, pero no produjo resultado dentro del tiempo razonable y fue interrumpido. El cache temporal fue eliminado. **[P]**
- No se ejecutó un E2E porque falta la frontera cognitiva y el mandato de Etapa A prohibía implementar antes de la aprobación. **[C][P]**

Estas limitaciones de prueba no se presentan como fallos funcionales adicionales; los blockers enumerados provienen de lectura directa del código.

## 19. Decisiones recomendadas para aprobación

1. Reparar verticalmente el workflow Genesis actual sin esperar al motor genérico.
2. Encapsular la solución detrás de interfaces reutilizables.
3. Engine de fixtures headless e in-process para el primer milestone.
4. Proceso standalone sólo cuando se necesite fidelidad de fallos de proceso/transporte.
5. Brain dueño de request, response, correlación y estado cognitivo.
6. Temporal dueño de la siguiente fase.
7. Identidad dual: `logical_inference_id` + `request_id`.
8. No reutilizar el socket legacy `5678`.
9. UI Cortex opcional, no dependencia del runtime.
10. Respuesta cognitiva separada de Contrato D.
11. `dis`, `doc`, AITAP y materialización final fuera del primer vertical.
    OpenCode existe como runtime first-party del sistema, pero no es una
    dependencia obligatoria de este Intent ni queda seleccionado por omisión.

### 19.1 Entrada de diseño pendiente: alcance semántico del Genesis completo

**Estado:** razonamiento registrado para discusión; no aprobado para implementación.

La afirmación de que `dis` no es bloqueante continúa siendo válida para el primer vertical técnico `ing → consolidation/Human Sync`. No debe generalizarse al cierre semántico de un Mandate Genesis completo.

Si Genesis garantiza que un proyecto queda comprendido y documentado, la necesidad propuesta del consumidor es:

- `ing` como obligación semántica para clasificar y consolidar Domains, Genes y asignación de archivos;
- `dis` como obligación semántica para analizar en profundidad responsabilidades, arquitectura, dependencias, riesgos y elementos unresolved;
- `doc` como obligación semántica para materializar el conocimiento validado de `ing` y `dis` en documentación canónica durable;
- evaluación de cambios siempre obligatoria al finalizar el conocimiento del proyecto;
- creación y ejecución de `dev` únicamente cuando exista una modificación real, un alcance definido y autorización explícita;
- persistencia durable de `no_change_required` cuando la evaluación no determine cambios, sin crear un Intent `dev` vacío.

La secuencia candidata para el Genesis completo queda registrada así:

```text
ing consolidado
  → plan determinístico de discovery
  → uno o varios dis
  → doc integrador de Genesis
  → evaluación de cambios
  → dev autorizado, sólo si corresponde
  → cierre del Mandate
```

Decisiones todavía pendientes:

1. contrato durable del plan determinístico que selecciona y ordena los `dis`;
2. cardinalidad, dependencias y criterio de cierre de múltiples Intents `dis`;
3. contrato de entrada y aceptación del `doc` integrador;
4. ubicación y schema del resultado `no_change_required`;
5. autoridad que aprueba la creación de `dev` y cómo se registra dicha autorización;
6. condiciones exactas de cierre del Mandate después de `doc` y de la evaluación de cambios;
7. impacto de esta secuencia sobre los workflows Temporal posteriores al primer vertical.

Esta entrada no amplía la Etapa B aprobable actualmente, no modifica el contrato del primer intercambio cognitivo en `ing/classification` y no autoriza implementación.

### 19.2 Investigación pendiente: routing de inteligencia versus adaptación de CLI

**Estado:** hipótesis de coordinación registrada; ownership no aprobado y sin implementación autorizada.

Para el piloto EXC-007/008 y para una eventual evolución de Genesis deben resolverse por separado dos decisiones:

1. **Routing/autorización:** selección separada de runtime y de Intelligence
   Provider/Model según policy, disponibilidad, credenciales y contabilidad.
   OpenCode participa sólo en la dimensión runtime como `first_party_runtime`;
   nunca reemplaza la identidad del backend/model efectivo.
2. **Adaptación/ejecución:** la integración first-party de OpenCode capitaliza
   su servicio/API/sesiones/stream/diff/cancelación detrás de Execution Layer.
   **EXECUTOR** posee adapters externos de Codex CLI y Claude Code CLI.

Frontera candidata para investigar:

```text
Mandate Genesis / Brain
  declara necesidad cognitiva y capacidades requeridas
    → AITAP autoriza/selecciona un grifo, si su contrato aprobado lo permite
      → Executor invoca OpenCode first-party o un runtime externo mediante su adapter
        → Brain persiste y valida el resultado contra el BISP
          → Temporal coordina el avance durable
```

Guardrails que permanecen firmes:

- AITAP no gobierna Intents, turns, checkpoints ni transiciones de fase;
- AITAP no ejecuta código, no administra procesos CLI, no toca filesystem y no parsea el resultado canónico;
- Brain conserva BISP, identidad única del Intent, estado `pending`, historial, persistencia y validación;
- Temporal conserva coordinación durable y autorización de transiciones;
- los detalles y comandos específicos de Codex, Claude u otra CLI no ingresan en Genesis;
- los identificadores privados de sesión de una CLI pueden ser Evidence, pero nunca fuente canónica de continuidad;
- EXC-007/008 debe poder recuperarse exclusivamente desde BISP, checkpoint y artefactos durables administrados por Brain;
- el futuro experimento con Synapse continúa fuera de la autorización vigente.

Contradicciones y ambigüedades que deben resolverse antes de adoptar la hipótesis:

1. El contrato vigente de AITAP sí le permite elegir modelo/proveedor dentro del suministro de inteligencia, pero no le concede selección ni lifecycle de un **executor CLI**. Usar “executor” para ambos conceptos mezcla routing de inteligencia con ejecución técnica.
2. OpenCode nunca se presenta como provider/model: es el runtime first-party.
   Codex CLI y Claude Code CLI son runtimes externos. En todos los casos AITAP
   conserva provider/backend y modelo efectivos como dimensión independiente.
3. Synapse Simulator es una contraparte determinística reemplazable y no está definido actualmente como provider de AITAP. Su inclusión en una política común de routing requiere una decisión contractual adicional.
4. Executor transforma la selección abstracta autorizada por AITAP en la
   instalación/adapter concreto, sin convertirse en orquestador. Brain/Temporal
   solicitan la ejecución mediante su puerto neutral.
5. El punto de corte exacto de EXC-007 sigue sin estar definido por el texto normativo vigente; esta investigación de routing no elimina ese blocker ni autoriza elegir un corte por conveniencia.

Hasta cerrar estas decisiones, el piloto no debe asumir que AITAP posee esta capacidad ni incorporar selección de provider o comandos CLI dentro de Genesis.

## 20. Gate y estado final de Etapa A

La Etapa A está completa como relevamiento y diseño.

La implementación no está aprobada por la existencia de este documento. Debe existir una aprobación explícita posterior y coordinarse con el Work separado:

**SYNAPSE SIMULATOR — CONTRACT, FIXTURES AND FAILURE MODES**

Ese Work definirá la contraparte reusable. Mandate Genesis conservará la responsabilidad de consumirla mediante la frontera acordada.

**Criterio de aceptación alcanzado:** no.  
**AITAP necesario:** no.  
**OpenCode:** capacidad first-party instalada/administrada; no es runtime
obligatorio para este primer vertical.
**`dis/` necesario para el primer vertical técnico:** no.  
**`dis/` y `doc/` necesarios para la semántica del Genesis completo:** propuesta registrada; decisión pendiente.  
**Siguiente paso:** recibir y aprobar el contrato del Work de Synapse Simulator; después aprobar la Etapa B de integración Genesis.

No actualizar `docs/CONTROL/AGENDA_MAESTRA.md` desde este Work.
