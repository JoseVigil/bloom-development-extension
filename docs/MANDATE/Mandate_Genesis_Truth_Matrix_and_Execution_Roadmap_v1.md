# Mandate Genesis — matriz de verdad y roadmap ejecutable

**Fecha del relevamiento:** 2026-08-16  
**Alcance:** investigación estática y contraste documental. No se modificó código ni `docs/CONTROL/AGENDA_MAESTRA.md`.

## Método y jerarquía de evidencia

Cada hallazgo está marcado como **[C] código**, **[D] documentación** o 
**[I] inferencia**. Para describir el presente prevalece el código; una
documentación posterior sólo prevalece cuando su afirmación sigue confirmada
por el código actual. Los árboles bajo `tree/` se usan únicamente para ubicar
fuentes: no sustituyen al filesystem.

La arquitectura objetivo del roadmap maestro v3.3 (Mandate genérico +
Actions + intents) sigue siendo una decisión útil, pero no está implementada:
el runtime conserva `MandateGenesisBuildWorkflow` específico. Por lo tanto,
este informe separa el **camino que existe** del **camino mínimo para un
Genesis funcional**, sin tratar el pivot como una realidad actual.

## Resumen ejecutivo

Hoy el cierre de Onboarding puede dejar un `pending_genesis_launch`; al montar,
Core lo consume y crea un `mandate_state.json` por HTTP. Core también hace
catch-up desde disco y escucha eventos en vivo. Esa parte sí llega a ser
observable.

El Genesis no llega a procesar normalmente porque el único `MandateWatcher`
se inicia desde `nucleus service start`, mientras el arranque de desarrollo
usa un proceso `nucleus worker start` persistente que no lo crea. Por eso el
estado `building/ingest/pending` no inicia el workflow. **[C]**
`installer/nucleus/internal/supervisor/service.go:2123`,
`installer/nucleus/internal/orchestration/temporal/worker.go:363-391`,
`installer/nucleus/internal/orchestration/watchers/mandate_watcher.go:238-316`.

Tres cortes adicionales permanecen aunque se arranque el watcher:

1. El worker no registra `PersistHumanSyncActivity` ni `SignMandateActivity`;
   el workflow falla al cruzar la confirmación humana. **[C]**
   `worker.go:370-384`, `mandate_genesis_build_workflow.go:202-220`.
2. La Fase 2 no usa Brain ni `ing.classification`: escribe una propuesta
   dry-run de un solo dominio, con cohesión 1.0. **[C]**
   `mandate_genesis_activities.go:138-142,206-239`.
3. La Fase 4 devuelve éxito vacío y no ejecuta scaffold real, no persiste
   genes y no lleva el mandate a completado. **[C]**
   `mandate_execution_workflow.go:40-50`.

`ing` y `dis` existen como motor de estado genérico de Brain, pero Genesis
sólo invoca de verdad `ing.create` + `ing.hydrate` (recepción). No invoca las
fases de clasificación/consolidación, ni crea/ejecuta `dis`. **[C]**
`mandate_genesis_activities.go:368-448`,
`brain/core/intent_manager.py:26-30,245-376`,
`brain/core/intent_state_manager.py:8-30`.

## Matriz de verdad

| Tramo | Esperado | Estado real | Evidencia | Prueba necesaria |
|---|---|---|---|---|
| Cierre Onboarding → Core | Onboarding deja a Core la orden de lanzar Genesis | Implementado. Se persiste `pending_genesis_launch`; Core lo consume. **[C]** | `installer/conductor/workspace/onboarding/ipc/onboarding-handlers.js:727-802`; `webview/app/src/lib/bootstrap/genesisLaunch.ts:72-105` | QA manual: completar onboarding, abrir Core y confirmar consumo único del flag. |
| Creación/persistencia inicial | Crear mandato Genesis y su estado | Implementado por `POST /mandates`: escribe `mandate_state.json` con `building/ingest`. **[C]** | `src/api/handlers/create-mandate.handler.ts:101-156` | Test de integración HTTP y comparación de ruta con `cfg.MandatesRoot()`. |
| Dos vías de creación | Una ruta canónica sin divergencias | Parcial. Persiste la CLI Go y la vía HTTP Node; Core usa HTTP, pero ambas siguen presentes. **[C]** | `genesisLaunch.ts:88-103`; `create-mandate.handler.ts:20-156`; `installer/nucleus/internal/orchestration/commands/mandate.go` | Test de paridad de artefactos, colisiones y reintentos. |
| Core/catch-up | Mostrar estado existente y cambios posteriores | Implementado, con cobertura parcial de eventos. `GET /mandates` escanea disco, layout hace hydrate y abre WS. **[C]** | `src/api/handlers/list-mandates.handler.ts:49-138`; `webview/app/src/routes/+layout.svelte:51-95` | E2E: abrir Core tras crear antes del WS; simular todos los eventos. |
| Watcher → workflow | Cada estado inicial inicia una vez el workflow | Roto en `dev-start`: el único constructor de watcher está en `service start`; el worker persistente no lo registra. **[C]** | `service.go:2123`; `worker.go:363-391`; `mandate_watcher.go:271-316` | Arranque real `dev-start`, creación HTTP y consulta de ejecución Temporal. |
| Worker y activities | Worker registra todas las activities que llama el workflow | Parcial/roto. Registra ingest, scaffold y publish; faltan persist-human-sync y sign. **[C]** | `worker.go:370-384`; `mandate_genesis_build_workflow.go:111-220` | Test de worker que ejecute hasta la señal y luego confirme dominios. |
| Fase 1 / `ing` | Ingerir material y preparar pipeline BISP | Parcial. Crea/hidrata `ing` con documentos bajo el mandate; no ejecuta clasificación/consolidación. **[C]** | `mandate_genesis_activities.go:368-448` | Fixture con docs; verificar `.ing_state.json`, rawbase y transición de fase. |
| Fase 2 / Domains | Clasificar material y proponer N dominios reales | Mock/dry-run. No llama a Brain; escribe un dominio con datos sintéticos. **[C]** | `mandate_genesis_activities.go:138-142,206-239`; `mandate_genesis_build_workflow.go:132-157` | Fixture multiarchivo con propuestas, cohesión y asignación reproducibles. |
| Human sync | Listar, editar, confirmar o rechazar propuesta y señalizar workflow | Parcial. CLI existe pero **no está wired** como subcomando: el archivo declara que falta `cmd.AddCommand`. `reject` es informativo. **[C]** | `mandate_genesis_domains_cmd.go:46-56,98-109,143-287`; ausencia de `createDomainsSubcommand` fuera de ese archivo | Help real y prueba `nucleus mandate genesis domains confirm`. Endpoint/UI equivalente pendiente. |
| Firma | Persistir `mandate.json` firmado tras confirmación | Código de activity existe, pero inaccesible por la falta de registro anterior. **[C]** | `mandate_genesis_sign_activity.go:168-260`; `worker.go:370-384` | Confirmar y verificar mandate.json, firma y `operational.actions`. |
| Fase 4 / Domains y Genes | Materializar dominios/genes y actualizar estado final | Inexistente como ejecución real. Child workflow es placeholder que devuelve éxito vacío. **[C]** | `mandate_execution_workflow.go:40-50`; `mandate_genesis_build_workflow.go:251-281` | E2E: verificar Domain/Gene, dependencias, reintento e idempotencia. |
| Estados Mandate ↔ Intent | Transiciones atómicas y recuperables | Inexistente. El workflow no actualiza `currentPhase`/`phases`; `ing` tiene estado independiente. **[C][I]** | `mandate_genesis_build_workflow.go:101-281`; `intent_state_manager.py:8-30` | Fallar cada frontera y verificar reconciliación/retry. |
| `dis` | Reconciliación global posterior, no parte obligatoria de Genesis | Implementado como tipo de intent de Brain, sin trigger desde Genesis ni Go. No bloquea el primer Genesis. **[C][D]** | `brain/core/intent_types.py:160-171`; `brain/core/intent_manager.py:26-30`; roadmap v3.3:408-426 | Test independiente de `dis`; definir política de disparo posterior. |
| Eventos al Core | Contrato coherente de fase y finalización | Parcial/contradictorio. Go emite `mandate:phase:ingest`, `mandate:genesis:rejected`, `mandate:genesis:all_complete`; no están en `WsEventMap` ni se aplican en `mandateStore`. **[C]** | `mandate_genesis_build_workflow.go:120-129,169-171,276-281`; `src/types/ws-events.ts:258-273`; `mandateStore.ts:141-208` | Contract test Go→internal endpoint→WS→store. |
| Finalización | Estado persistido `completed` y transición operativa | Rota/inexistente. Sólo se publica `all_complete`; no hay escritura final y la UI tampoco mapea ese evento. **[C]** | `mandate_genesis_build_workflow.go:276-281`; `mandate_execution_workflow.go:46-50`; `mandateStore.ts:202-208` | E2E que inspeccione estado, artefactos y UI tras última action. |
| BISP/Contrato D/recuperación | Payload, respuesta validada y recuperación determinista | Disponible en Brain como infraestructura general, pero no conectado al flujo Genesis actual. **[C][D]** | `brain/core/intent/response_parser.py`; `brain/core/intent/recovery_manager.py`; `brain/core/intent/schema/bsip_response_contrato_d_v0_1.json`; `mandate_genesis_activities.go:412-448` | Prueba de una clasificación real con respuesta válida, truncada y recuperada. |
| CLI/help machine-readable | Comandos disponibles y ayuda JSON reflejan el flujo | Parcial. Brain expone comandos de intents; la superficie de dominios no está alcanzable por falta de wiring. La ayuda de Nucleus debe regenerarse/validarse después de corregirlo. **[C]** | `brain/commands/intent/create.py`; `mandate_genesis_domains_cmd.go:46-56` | `brain --json ...`, `nucleus --json-help` y prueba de subcomandos. |

## Flujo actual, de punta a punta

```text
Onboarding complete
  → escribe pending_genesis_launch [C]
  → Core consume flag y POST /api/v1/mandates [C]
  → mandate_state.json = building / ingest / pending [C]
  → Core recibe evento inicial o catch-up y lo muestra [C]
  └─ CORTE 1: en dev-start no vive MandateWatcher [C]

Si se iniciara el watcher manualmente:
  → Temporal ejecuta ingest: brain intent create + hydrate [C]
  → Fase cluster dry-run crea 1 propuesta sintética [C]
  → espera signal humana [C]
  └─ CORTE 2: CLI domains no queda registrado; no hay UI/HTTP de confirmación [C]

Si se señalizara de todas formas:
  └─ CORTE 3: PersistHumanSyncActivity y SignMandateActivity no están registradas [C]

Si se registraran:
  → firma mandate.json [C]
  → child execution devuelve éxito vacío [C]
  └─ CORTE 4: no Domains/Genes, no estado final, contrato de eventos desalineado [C]
```

## Flujo objetivo validado (mínimo)

No se debe hacer que `dis` bloquee la primera Genesis. El mínimo respaldado por
los contratos existentes es:

1. Core crea un estado único e idempotente, que el watcher toma y arranca.
2. Una action de ingest crea el intent `ing`, lo hidrata y ejecuta sus fases
   de clasificación y consolidación con artefactos BISP/Contrato D validados.
3. La propuesta de Domains se persiste en `mandate_state.json`, se expone al
   humano y se confirma/rechaza por una única vía que además señaliza Temporal.
4. La confirmación persiste un mandate firmado y genera actions consistentes.
5. La ejecución materializa los Domains/Genes confirmados, respeta
   dependencias e idempotencia y actualiza el estado a `completed`.
6. Cada cambio persistido publica un evento que pertenece al contrato TS y que
   el catch-up puede reconstruir. `dis` queda como tarea global a demanda o
   por política posterior, tal como indican las specs y el roadmap. **[D]**
   `ING_Intent_Spec_v1_1.md`, `DIS_Intent_Spec_v1_0.md`, roadmap v3.3:408-426.

La decisión aún abierta es si alcanzar ese mínimo extendiendo temporalmente
el workflow Genesis existente o reemplazarlo primero por el motor genérico
Mandate→Actions→Intents del pivot v3.3. No hay código del segundo motor para
elegirlo como dependencia inmediata.

## Dependencias

| Clase | Ítems |
|---|---|
| Duras para un E2E real | watcher persistente; registro de activities; transiciones de estado; clasificación real; confirmación alcanzable; ejecución real; finalización persistida. |
| Blandas | vista detallada de progreso, renames desde UI, identidad HTTP para `confirmedBy`, normalización de las dos rutas de creación. |
| Paralelizables | contrato de eventos/UI y catch-up; implementación de clasificación/Genes; diseño del motor genérico; pruebas de BISP/Contrato D. |
| Deuda no bloqueante | consolidar `FALLBACK_STEPS` de onboarding; reorganizar IPC; disparador/política de `dis`; migración completa al motor genérico. |
| Dependencias aparentes refutadas | `dis` no es una fase obligatoria de Genesis; AITAP no ejecuta ni interpreta BISP; Execution/OpenCode no es dependencia demostrada de este flujo. |

## Contradicciones y fuente que prevalece

| Tema | Contradicción | Prevalece |
|---|---|---|
| Fase 1-2 “integradas” | Roadmap v3.3 §9 dice que `ing` cubre recepción, clasificación y consolidación; el código sólo hace create/hydrate y un dry-run independiente. | Código: integración parcial. |
| Human Sync por CLI | El plan de finalización trata `domains confirm` como resuelto; el archivo declara que su subcomando aún debe agregarse al padre. | Código: no expuesto hasta que se agregue el wiring. |
| Finalización | El workflow publica `mandate:genesis:all_complete`; eso no equivale a completion persistido, y el child devuelve éxito vacío. | Código: no finaliza. |
| Eventos | `ws-events.ts` modela `ingest_complete`, `domains_proposed`, `signed` y `action:all_complete`; Go emite nombres distintos. | Código: contratos desalineados; debe definirse un SSOT y tests. |
| Motor unificado | v3.3 establece el pivot como objetivo; el código mantiene workflow y activities Genesis específicas. | Código para estado actual; v3.3 para dirección arquitectónica futura. |
| `dis` | El roadmap y spec lo colocan posterior/global; no hay trigger de código. | Ambos coinciden: no bloquea Genesis y falta orquestación posterior. |

## Roadmap de ejecución revisado

### Etapa 0 — fijar contrato y pruebas de borde

- **Objetivo:** elegir SSOT de `mandate_state.json`, nombres de eventos y
  semántica de `completed` antes de ampliar el flujo.
- **Archivos:** schemas/estado Go, `src/types/ws-events.ts`, `mandateStore.ts`,
  contratos BISP/Contrato D.
- **Precondición:** ninguna.
- **Aceptación:** tabla de transición única; tests de contrato Go→Core→UI;
  definición de qué artefacto prueba un Domain/Gene materializado.
- **Riesgo:** parchear nombres de eventos sin resolver persistencia.
- **Entorno:** tests unitarios TS/Go, sin servicios externos.

### Etapa 1 — hacer arrancable el tramo existente

- **Objetivo:** que un estado Genesis creado por Core inicie exactamente un
  workflow en el proceso persistente de `dev-start`/servicio.
- **Archivos:** `worker.go`, `mandate_watcher.go`, resolver de mandates root;
  actividades registradas.
- **Precondición:** Etapa 0 para los eventos mínimos.
- **Aceptación:** creación HTTP → workflow visible → ingest ejecutado; repetir
  el evento no crea una segunda ejecución; apagar el worker detiene watcher.
- **Pruebas:** integración Temporal local y test de idempotencia de watcher.
- **Riesgo:** ciclos de import y doble watcher bajo `service start`.
- **Entorno:** Nucleus + Temporal local + Brain disponible.

### Etapa 2 — completar `ing` y la propuesta real

- **Objetivo:** reemplazar dry-run sintético por clasificación/consolidación
  de `ing` que produzca propuestas persistidas y trazables.
- **Archivos:** activities Genesis o nuevo executor genérico, Brain intent
  manager/state manager, schemas de propuesta y pruebas.
- **Precondición:** Etapa 1.
- **Aceptación:** fixture multiarchivo produce N propuestas no sintéticas,
  artefactos BISP y estado de fase coherente; fallo/recuperación no corrompe.
- **Pruebas:** respuesta válida, respuesta truncada y Ollama no disponible.
- **Riesgo:** duplicar el futuro motor genérico; encapsular la invocación de
  Brain detrás de una interface reutilizable.
- **Entorno:** Brain + sus dependencias de vectorización/modelo.

### Etapa 3 — Human Sync real

- **Objetivo:** una sola vía de leer/editar/confirmar/rechazar propuestas que
  persista y señalice de forma atómica o recuperable.
- **Archivos:** wiring `mandate.go`, command de domains, ruta HTTP/UI y estado.
- **Precondición:** Etapa 2.
- **Aceptación:** help muestra el comando; confirmación llega al workflow;
  rechazo persiste estado; `confirmedBy` tiene fuente definida.
- **Pruebas:** CLI y UI, señal perdida, confirmación repetida y rename.
- **Riesgo:** dos escritores de `mandate_state.json` sin versión/locking.
- **Entorno:** Nucleus, Temporal, Core.

### Etapa 4 — firmar, materializar y completar

- **Objetivo:** ejecutar actions reales, crear Domains/Genes, actualizar
  estado final y publicarlo a Core.
- **Archivos:** `mandate_execution_workflow.go`, activities, firma, estado,
  contratos de eventos y stores.
- **Precondición:** Etapas 0-3.
- **Aceptación:** E2E deja `mandate.json`, Domains/Genes, estado `completed`,
  progreso coherente tras recarga y sin duplicados al reintentar.
- **Pruebas:** dependencias entre actions, falla parcial, retry e idempotencia.
- **Riesgo:** declarar éxito por evento antes de persistir resultados.
- **Entorno:** stack completo local.

### Etapa 5 — migración al motor genérico y `dis`

- **Objetivo:** decidir y construir Mandate→Actions→Intents; definir política
  global posterior para `dis`.
- **Precondición:** Genesis vertical funcional o una decisión explícita de
  reemplazar el camino actual antes de Etapa 2.
- **Aceptación:** Genesis y domain expansion usan el mismo motor; `dis` no
  compite con escrituras activas de `ing` y deja auditoría/reconciliación.
- **Riesgo:** convertir esta mejora arquitectónica en bloqueo del MVP Genesis.

## Decisiones que requieren al usuario

1. **Estrategia de motor.** Alternativas: (a) reparar verticalmente el
   workflow Genesis actual hasta el E2E; (b) implementar primero el motor
   genérico del pivot v3.3. Recomendación: **(a) con una interface de executor
   reusable**, porque (b) no existe aún y bloquearía todo el primer Genesis.
   Bloquea el diseño de Etapas 2 y 4.
2. **Vía canónica de Human Sync.** Alternativas: CLI primero, HTTP/UI primero,
   o contrato común con ambas superficies. Recomendación: **contrato común y
   HTTP/UI como experiencia principal, CLI como recovery**. Bloquea Etapa 3.
3. **Propiedad de estados.** Alternativas: Temporal es autoritativo y proyecta
   a archivos; archivo es autoritativo y Temporal refleja; o una capa de
   transición única. Recomendación: **una capa única de transición versionada
   con archivo como proyección observable**, porque hoy hay varios escritores.
   Bloquea Etapas 0 y 4.

## Devolución limpia a Agenda

- **Estado consolidado:** Core crea, recupera y muestra Genesis; el backend no
  lo procesa de punta a punta. El primer corte es el watcher ausente de
  `dev-start`; los siguientes son activities sin registrar, clasificación mock,
  confirmación no expuesta y ejecución/finalización placeholder.
- **Siguiente paso:** aprobar Etapa 0 y elegir la estrategia de motor; luego
  implementar Etapa 1 con una prueba de integración Temporal.
- **Dependencias:** Temporal/Nucleus/Brain locales para E2E; `dis`, AITAP y
  Execution Layer no son bloqueantes para el Genesis inicial.
- **Decisiones cerradas por evidencia:** `dis` es posterior/global;
  `ing.create`/`hydrate` sí está invocado; Core tiene catch-up y WS; no existe
  completion persistido.
- **Decisiones abiertas:** motor actual vs. genérico, contrato de Human Sync y
  autoridad de estado/transiciones.
- **Fuentes de verdad actualizadas:** este informe; los archivos de workflow,
  activities, watcher, worker, Core API/store y Brain citados arriba. El
  roadmap v3.3 queda como orientación objetivo, no como foto operativa.
