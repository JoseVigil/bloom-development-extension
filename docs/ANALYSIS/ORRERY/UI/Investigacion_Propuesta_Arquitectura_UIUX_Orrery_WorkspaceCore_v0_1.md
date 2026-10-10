# Investigación y propuesta de arquitectura — Orrery en Workspace Core: UI/UX implementable (v0.1)

**Tipo:** [R] investigación + [D] propuesta de diseño. No implementa código ni modifica contratos.
**Fecha:** 2026-10-10.
**Estado:** borrador para revisión de José. No autoriza implementación; la §18 propone una lista de archivos que requiere aprobación separada conforme a `AGENTS.md`.
**Base física verificada:** repositorio `bloom-development-extension`, `main` en `78bbaad` (2026-10-06).
**Encargo:** `ENCARGO — ORRERY UI / UX RESEARCH` (definir cómo Orrery hace visible, navegable y operable el sistema existente, sin rediseñar Cognituum).

---

## 0. Resumen ejecutivo

1. **Orrery puede construirse ahora, pero sólo si separa tres cosas que el corpus mezcla:** el *Espacio* (motor territorial que muestra dónde está la persona), las *Lentes* (capas que dibujan trabajo, criterio, cambios y atención *sobre* ese territorio) y las *Superficies* convencionales de Workspace Core (inspector, composición de decisiones, trabajo en curso, atención). El invariante ratificado de septiembre —Orrery no contiene lógica de Mandates, Postulates ni evaluación de Gravity en su contrato de captura— se conserva intacto en el Espacio; el encargo actual (Orrery como lugar donde se ve, decide y observa) se cumple en Lentes y Superficies. Esta lectura requiere ratificación (D-1).
2. **Dos decisiones previas de Orrery chocan con el encargo y no deben resolverse en silencio:** el régimen espacial exclusivo a pantalla completa (sin paneles persistentes) y la regla "el árbol de escena es proyección 1:1 de una `LocationSnapshot` recibida". La primera impide regiones persistentes; la segunda confunde navegación con captura, distinción que la consolidación de Agenda del 23-09 ya fijó (Navigation State mutable ≠ LocationSnapshot verificable). Se proponen enmiendas acotadas (D-2, D-3).
3. **Lo que existe físicamente hoy para alimentar Orrery es poco pero real:** contexto confirmado `bloom.confirmed-context/v1` (Tenant/Organization/Project con evidencia de binding, implementado el 05-10 y todavía no consumido por la UI), lista y eventos de Mandates (`GET /api/v1/mandates` + WebSocket), el contrato firmado del primer vertical de Mandate (objetivo, dominio, acción `gen`, inputs congelados, presupuesto de inteligencia, fulfillment) y su artefacto `domain_definition.json`, y la lectura de suministro/contabilidad de AITAP. **No existen superficies de lectura** para Gravity, Postures, DOMAIN/GENE, Genes canónicos, Location ni señales de Monitor.
4. **Postulate no tiene entidad, persistencia ni endpoint en ningún componente.** Tiene al menos cuatro acepciones en el corpus; la vigente para este encargo es la del ADR ASM y el encargo: decisión operativa declarada por una persona, adoptada por un proceso soberano y capaz de fundar un Mandate. La frontera vigente (AGENDA FOLLOWUP, 17-09) dice que ASM termina en `AssemblyResult`; la formulación del `PostulateProposal` pertenece a un proceso soberano posterior. Workspace Core es el lugar natural de ese proceso, con la persona como autoridad.
5. **Gravity no se puede mostrar todavía con datos:** el contrato firmado de Genesis tiene `gravity: []` y `resolveActiveGravityActivity` está registrada pero no la usa ningún workflow. La lente de criterio debe diseñarse ya, con vocabulario humano por defecto, anclada sólo a NUCLEUS/ORGANIZATION/PROJECT/MANDATE/SESSION (nunca a DOMAIN/GENE), y mostrar "no disponible" con causa en lugar de simular.
6. **El primer Genesis produce un territorio escaso.** Después de un Genesis exitoso habrá Organization y Project vinculados, un Mandate con un único dominio confirmado y su definición (`purpose`, `boundaries`, `concepts`, `decisions`), evidencia de contabilidad y aprobaciones con digest. No habrá Genes canónicos, ni aristas DOMAIN_GENE, ni Postures. La primera apertura de Orrery debe hacer legible esa escasez como punto de partida, no esconderla.
7. **Para Bloomaut aparece un límite físico concreto:** el contrato del primer vertical exige exactamente un dominio y una acción `gen` por Mandate. Incorporar un proyecto real con varios dominios requiere decidir entre varios Mandates o una evolución del contrato (D-6). La experiencia de incorporación progresiva propuesta (§14) funciona con cualquiera de las dos.
8. **El vertical slice VS-1 (§18)** construye la pantalla principal con datos reales (contexto confirmado, Mandates, contrato, artefacto, contabilidad), la bandeja de atención, el inspector y el compositor de decisiones hasta el punto donde el backend todavía no tiene contrato, mostrando esos puntos como puertos declarados y no como simulación. Su prerrequisito técnico más chico: el paquete `orrery` hoy no pasa `tsc --noEmit` (`Position3` importado de un módulo que no lo exporta).
9. **Se registran 27 discrepancias** entre documentos, y entre documentos y código (§4), y 13 decisiones reservadas a José (§19). Ninguna se resolvió por inferencia.

---

## 1. Alcance, método y criterio de autoridad

### 1.1 Qué se hizo

- Lectura del corpus de los 16 ámbitos indicados (apéndice A), más los documentos de coordinación (`docs/CONTROL/AGENDA_MAESTRA.md`, `docs/CONTROL/AGENDA_FOLLOWUP.md`, `docs/MANDATE/MANDATE_PROGRAM_CANONICAL_SOURCE_v0_1.md`) y los documentos del Project BTIPS que no están en el repositorio (`Spec_Implementacion_Integracion_Core_Orrery_v1_0.md`, `Cierre_Implementacion_IntegracionFormal_Core_Orrery_v1_0.md`, documentos de AITAP y Onboarding).
- Contraste con código, schemas y tests: Workspace Core (Electron + SvelteKit), paquete `orrery`, Control Plane Fastify, Nucleus (Gravity, Gene, Authority, Mandate contract, workflows Temporal), Brain (`gen_domain`, intents), Impact, Monitor, contratos de Executor y AITAP. Apéndice B.
- Una única ejecución de verificación: `tsc --noEmit` sobre `orrery/src/adapters/fromSimulatedData.ts` (falla, §4 DIS-12). Ningún otro comando mutó estado.
- **No se leyó** el estado operativo (`/home/jose/repos/elias-repos/.bloom`, `~/.local/share/BloomNucleus`) por la regla vigente de no leerlo sin autorización puntual. Por eso el estado post-Genesis (§14.1) se infiere del código que lo produce, no de una instalación observada.

### 1.2 Criterio de autoridad aplicado

| Orden | Fuente | Uso |
|---|---|---|
| 1 | Código, schemas y tests en `main` | Define qué existe y cómo funciona. Ante divergencia comprobable, gana. |
| 2 | Decisiones expresas de José y documentos de control posteriores (Agenda, FOLLOWUP, Programa MANDATE) | Definen qué está decidido, bloqueado o congelado. |
| 3 | ADR, contratos y especificaciones aprobadas | Definen semántica vigente cuando el código no la contradice. |
| 4 | Investigaciones y propuestas | Evidencia orientativa. |
| 5 | Prototipos (`orrery/src/data.ts`, `main.ts`) | Evidencia de exploración de interacción. Nunca fuente de datos ni de ontología. |

Dentro de un mismo nivel, gana la fuente posterior. Cuando dos fuentes no se pueden ordenar, se registra la contradicción (§4) y el diseño queda neutral respecto de ella.

**Marcas usadas:** **[C]** verificado en código; **[D]** documentado o decidido; **[I]** inferencia o propuesta de este documento; **[F]** falta (no existe material).

---

## 2. Reconstrucción del estado real

### 2.1 Matriz de verdad por concepto

| Concepto | Fuente de verdad | Representación física | ¿Disponible hoy para la UI? | Evidencia |
|---|---|---|---|---|
| Tenant / Organization / Project | Authority (Backend) + Nucleus (`internal/authority`, `ProjectBinding`) | `ProjectClaim`/`ProjectBinding` con `tenantId`, `organizationId`, `projectId`, `revision`, `claimedAt`, `checkedAt`, `validUntil` | **Sí, vía contexto confirmado** (no consumido aún) | [C] `nucleus authority context-read` → `bloom.confirmed-context/v1`; IPC `core:confirmed-context-read`; `webview/app/src/lib/confirmedContext.ts` sin consumidores |
| Contexto confirmado | Nucleus | `identityAndMembership`, `projectBinding`, `localLocation`, `projectIdContinuity`, `cognitumCompatibility`, `intelligencePreference`, cada uno con estado | Sí | [C] `internal/governance/authority_command.go` (`context-read`), tests en `authority_command_test.go` |
| Lista de Projects del Nucleus | Control Plane / Brain | `Project { id, name, path, strategy?, description? }` | Sí, sin binding | [C] `ProjectsPanel.svelte`, `listNucleusProjects()` |
| Location / LocationSnapshot | Contrato v0.1 aprobado | JSON Schema en `Orrery_LocationSnapshot_v0.md` §E | **No** (`NOT_SUPPORTED` extremo a extremo) | [D] Closure v1.1 §1; [C] `fromLocationSnapshot()` lanza error |
| Navigation State | Cliente (sesión) | No existe como objeto; `regimeStore.lastVisitedAnchor` es lo más cercano | Parcial | [D] Agenda "Estado coordinado ORRERY" (23-09); [C] `regimeStore.ts` |
| DomainCandidate | Mandate (pre-firma) | `phases.validate.humanSync.candidateDomains[]` en `mandate_state.json`; Brain propone (N=1 hoy) | Sólo por CLI (`nucleus mandate build domains list`) | [C] `src/types/gen-state.types.ts`, `mandate_build_workflow.go` |
| Domain declarado por Mandate | Contrato firmado | `contract.domain {id, name}` | No hay endpoint de lectura | [C] `mandatecontract/contract.go` |
| Domain canónico | Fuente canónica Nucleus-level (v3.0) | Pendiente; transitorio `.cache/.semantic-index.json` | **No** (población productiva no demostrada) | [D] Gene v3.0 §8; Closure §2 |
| DOMAIN / GENE en GravityGraph | Proyección Gravity | `GravityNode` + `StructuralEdge` (`DOMAIN_GENE`, `DOMAIN_MANDATE`) | **No** (sin caller productivo) | [C] `reconcileStructuralProjection` no exportado, sin callers |
| Gene canónico | Store Nucleus G1 | `Identity`, `Revision`, `Contribution`, `CanonicalCommit`, `Head` bajo `.genes/projects/{projectId}` | **No** (sin caller fuera del paquete) | [C] `internal/gene/*`; FOLLOWUP "sin caller productivo" |
| Posture | GravityGraph (`gravityPostures[]` por nodo) | `GravityPosture` (`primitive`, `expression`, `appliesTo`, `origin`, `verifiable`, `promotedFrom`) | **No** (sin comando ni endpoint de lectura) | [C] `gravity/model.go`; ningún comando `nucleus gravity` en `nucleus_help.json` |
| Gravity efectiva (ResolveActive) | Nucleus | `ResolveResult { collected[], cache }` con `masa` | No; requiere `MandateID + SessionID + IntentType` | [C] `gravity/resolver.go`; Activity registrada, no invocada por ningún workflow |
| Masa | Nucleus | `ComputeMasa` (1–3: origen, verificable, promovida) | Derivable cuando haya lectura de Postures | [C] `gravity/masa.go` |
| Colisiones normativas | Nucleus (detectores) + Impact | `PRIORITY_CYCLE`, `THRESHOLD_UNSATISFIABLE`; Impact `coexistence`/`preservation`/`compliance` | No hay consumidor | [C] detectores en `internal/gravity`; [C] `installer/impact`; [D] FOLLOWUP "sin consumidores productivos" |
| Impact | App Go `impact/1` | `EvaluationRequest` → `Assessment` (`findings`, `coverage`, `indeterminacy`, `reevaluateWhen`) | Material, sin integración con Core | [C] `installer/impact/internal/contracts/contract.go` |
| Monitor | App Go | Esqueleto: sólo `monitor status` | **No** observa nada | [C] `installer/monitor/README.md` |
| Mandate (estado) | Nucleus (`mandate_state.json`) | `status`, `currentPhase`, `stateVersion`, `signature`, `phases` | Sí, resumen | [C] `GET /api/v1/mandates`; `mandateStore.hydrateFromList` |
| Mandate (contrato) | Nucleus `mandatecontract` | `Contract` v1/v2/v3 firmado con digest | **No** hay lectura de detalle | [C] `mandatecontract/contract.go`, `signature.go` |
| Actos humanos sobre Mandate | Nucleus + Authority | `domains confirm/reject`, `approve`, `activate` (consentimiento en Authority, atestación pegada en CLI) | Sólo CLI | [C] `mandate_authority_cmd.go`, `mandate_build_domains_cmd.go` |
| Ejecución / Action / Intent | Temporal + Nucleus + Brain | Una Action `run_intent` → Intent `gen` → `domain_definition.json` + digest + `fulfillmentStatus` | Indirectamente (estado) | [C] `mandate_execution_workflow.go`, `mandate_gen_activity.go`, `brain/core/intent/gen_domain.py` |
| Eventos de Mandate | Nucleus/Control Plane → WS | Ver §12.3: vocabulario cliente y servidor divergen | Sí, parcial | [C] `ws-events.ts`, `PublishMandateEventActivity`, `create-mandate.handler.ts` |
| Orbital / Constellation / capability seam | Diseño | `orbital_agentic_state.json`, `capability_seam` sólo en docs | **No** | [D] `BTIPS_Mandates_Agenticos_Spec_Unificada.md`; [F] código |
| Eventos de ejecución (Executor) | Contrato staging | `cognituum.execution/v1` con `sequence` y `paused/resumed/cancelled` | No (sin runtime) | [C] `installer/execution/contracts/v1/execution-event.schema.json` |
| Suministro y contabilidad de inteligencia | AITAP + Nucleus | `aitap local preflight`, `aitap accounting usage`, `authority supply-read`; evento `inference-accounting-event` v2 | Sí (`IntelligenceSupplyView` en `/home`) | [C] `core/ipc/intelligence-supply-handlers.js` |
| AssemblyRequest / AssemblyResult | ASM (contrato candidato) | Sin representación física | **No** (ASM no registrado en Brain) | [C] `brain/core/intent_types.py` sólo ING/DIS |
| Postulate / PostulateProposal | Sin dueño físico ratificado | Ninguna | **No** | [D] ADR ASM §12–§13; [F] código |
| Ledger | Cliente | `ledgerStore.ts` con `MOCK_FEED` | Placeholder | [C] `ledgerStore.ts` |
| Orrery (paquete) | Prototipo integrado | `mountOrreryScene`, `OrreryTree`, adaptadores | Montado en Core, datos simulados | [C] `+layout.svelte`, `regimeStore.ts` (siempre `fromSimulatedData()`) |

### 2.2 El contenedor físico: Workspace Core

[C] Workspace Core es la ventana Electron de `installer/conductor/workspace/main_conductor.js` (`createWorkspaceWindow`) que carga `workspace_url` (por defecto `http://localhost:5173`): la app SvelteKit de `webview/app`. `core/core.html` es una página de salud y perfiles, no la UI principal. El preload `core/preload_core.js` expone cuatro puentes: `window.onboarding`, `window.nucleus`, `window.intelligenceSupply`, `window.confirmedContext`. La UI habla con el Control Plane Fastify (`http://localhost:48215/api/v1`) y abre un WebSocket (`ws://localhost:4124`) cuyos eventos `mandate:*` alimentan `mandateStore`.

Estructura actual de `+layout.svelte`:

```text
.btip-layout
├── {#if regime === 'espacial'} OrreryContainer  (fixed, inset 0, z 50) + botón "Volver"
└── {:else} .main-container
     ├── Sidebar (Home · Nucleus · Profiles · Wisdom · botón Orrery · Account · Settings)
     ├── main.content
     │    ├── TabBar (tabs de Mandates, "+", Alfred sin implementar)
     │    └── content-body → MandateTab | página de ruta
     └── aside.right-pane (colapsable) → LedgerPanel (placeholder) | slot
```

Decisiones vigentes de Core UI que esta propuesta respeta [D]: panel derecho con tres bloques (cambio de organización, información de sistema, Alfred colapsado); Wisdom como navegación propia; un `MandateTab` único orientado por estado (D-25); calma visual, modo oscuro como base y acentos escasos (`BTIPS Foundational UX/UI Design Doctrine`); indicador compacto ▌▌▌ para estado, actividad y atención en las tabs de Mandate.

### 2.3 El prototipo de Orrery, tal como está

[C] `installer/conductor/workspace/core/orrery` (PlayCanvas 2.22.1, Vite 7) quedó integrado el 20-09 (`126ebb7`): `mountOrreryScene(container, tree)` con `update()`/`destroy()`, diffing por id, separación dato/layout (`layout.ts`) y dato/presentación (`display.ts`), y un adaptador real `fromLocationSnapshot()` que lanza error por falta de productor. Sigue vivo el panel inferior de simulación (Play/Pausa, timeline de 30 s, marcador que recorre una ruta narrando Intents), aunque la propuesta de Gateway pidió retirarlo y quedó pendiente la confirmación (§4 DIS-13). La capa de interacción (cámara orbital, raycasting, labels HTML, inspector lateral, foco con interpolación) es reutilizable; los datos (`items`, `genes`, `Posture`, `Artifact`) son ficticios y no se promueven.

---

## 3. Decisiones vigentes sobre Orrery que esta propuesta no reabre

| # | Decisión | Fuente |
|---|---|---|
| V-1 | Orrery describe dónde está la persona; no interpreta para qué le sirve estar ahí. | `Orrery_LocationSnapshot_v0.md`; ratificado por José (Propuesta UI Contenedora v0.1 §0) |
| V-2 | La única estructura que cruza hacia el motor espacial como objeto primario es territorio; las capas consumidoras sólo indican dónde dibujar, nunca qué significa. | Propuesta UI Contenedora v0.1 §4.4 |
| V-3 | Constellation↔Orbital se navegan como una jerarquía continua con zoom semántico; Gravity es capa separada, activable, nunca un tercer grafo; Orrery es contenedor de vistas con principios comunes (breadcrumb persistente, foco no destructivo, confirmación inmediata). | `Orrery_Research_Resultados_v0_1.md` §3 |
| V-4 | Gravity en lenguaje humano por defecto; geometría literal sólo bajo demanda. | Ídem, pregunta 3 |
| V-5 | El gesto de entrada al espacio nunca lo dispara la actividad de un Mandate; se asocia a dónde está parada la persona. | Gateway UX v0.1 §2.4 |
| V-6 | Foco inicial determinístico; retorno explícito, nunca implícito. | UI Contenedora v0.1 §3.2–§3.3 |
| V-7 | `mandateStore` es la única fuente cliente del estado de un Mandate. | Investigación v0.1 §2.1, Spec Core-Orrery |
| V-8 | Domain y Gene están excluidos de Postures, spine, precedencia y Masa. | Gene v3.0 §7.5; contrato GravityGraph DOMAIN/GENE §1 |
| V-9 | Orrery consume proyecciones read-only; Gene se representa como entidad y las curvas/enlaces representan relaciones; un candidato semántico se distingue de una relación ratificada. | Gene v3.0 §7.8 |
| V-10 | Estados de resolución por referencia (`resolved`, `changed`, `stale`, `missing`, `unauthorized`, `ambiguous`, `unsupported`, `unverifiable`); nunca modifican la captura. | Closure v1.1 §8; LocationSnapshot §D |
| V-11 | Core no inventa autoridad ni estados; presenta estados verificados. | Programa MANDATE §8 Fase 6; Agenda Tema 12 "Core/UI" |
| V-12 | El borrador no confirmado de una decisión se pierde al cerrar; la persistencia debe ser deliberada. | `Paladin_Client_Object_Model_v0_1.md` §3 |
| V-13 | Seis respuestas distinguibles ante un conflicto con Gravity; reinterpretación y excepción nunca comparten estilo con una ejecución sin conflicto. | `Paladin_UX_Postura_Gravity_Masa_Spec_v0_1.md` §3 |
| V-14 | Postular criterio es un acto retroactivo y explícito sobre algo ya dicho, no un modo previo. | Ídem §1.3 |
| V-15 | Orrery prioriza orientación, estado, relaciones y zonas que requieren atención; fracasa si convierte cada ejecución en una cosa más que mirar. | `COGNITUUM_PALADIN_RESEARCH_SNAPSHOT.md` §14 |
| V-16 | Pregunta rectora de producto: ¿esto aumenta el trabajo que una persona puede delegar sin repetir, vigilar ni reconstruir sus decisiones? | Agenda, decisiones transversales; `PALADIN_COMMAND_RESPECT_POSITIONING_02.md` |

---

## 4. Registro de discrepancias y contradicciones

Cada entrada indica cómo la trata este diseño. Ninguna se resuelve por inferencia.

| ID | Discrepancia | Fuentes en tensión | Evidencia física | Tratamiento aquí |
|---|---|---|---|---|
| DIS-01 | **Alcance de Orrery.** El invariante de septiembre excluye Mandates, Postulates y Gravity del contrato de Orrery; el encargo pide que Orrery sea donde se decide y se observa el trabajo. | UI Contenedora v0.1 §0; LocationFirst v0.2; Encargo 2026-10 | — | Se separa Espacio (invariante intacto) de Lentes y Superficies (encargo). D-1. |
| DIS-02 | **Régimen exclusivo.** v0.2 fija el régimen espacial al 100% del viewport sin layout compartido; el encargo pide regiones persistentes (inspector, comandos, actividad, alertas). | UI Contenedora v0.2 §1; Encargo §A | [C] `+layout.svelte` renderiza un régimen u otro | Se propone enmienda acotada (§7.3). D-2. |
| DIS-03 | **Árbol 1:1 con LocationSnapshot.** v0.2 dice que la escena es proyección 1:1 de una snapshot recibida; la Agenda (23-09, posterior) distingue Navigation State mutable de LocationSnapshot capturada. Navegar requiere territorio antes de capturar. | UI Contenedora v0.2 §2.2; Agenda "Estado coordinado ORRERY" | [C] `OrreryTree` espeja la snapshot y se alimenta con datos simulados | El espacio renderiza un modelo de territorio para navegación; la `LocationSnapshot` se produce en la captura (§9.2). D-3. |
| DIS-04 | **Postulate tiene cuatro acepciones.** (a) "qué quedó establecido" antes de Posture (STRATEGY 08-09); (b) objeto adoptado desde un `PostulateProposal` que funda un Mandate (BISP v2.0, ADR ASM 16-09); (c) verbo "postular una Postura" = promover un enunciado a criterio Gravity (Paladin UX 28-08); (d) "Postulates de ejemplo" dentro de una Posture (prototipo). | Ver columna | [F] ninguna entidad | Se adopta (b) por ser la del encargo y el ADR; (c) se presenta como acto distinto ("proponer criterio"); (d) no se usa. D-4. |
| DIS-05 | **Quién formula el `PostulateProposal`.** BISP v2.0 y el ADR ASM dicen que ASM puede formularlo; AGENDA FOLLOWUP (17/18-09, posterior) fija que ASM termina en `AssemblyResult` y que la formulación pertenece a un proceso soberano posterior. | BISP v2.0 Parte G; ADR §12; FOLLOWUP §4 | [F] ASM no registrado | Rige FOLLOWUP. El compositor de Core es el proceso soberano; ASM, cuando exista, alimenta la evaluación. D-5. |
| DIS-06 | **ASM dentro o fuera de Orrery.** El ADR dice "Orrery inicia solicitudes y presenta estado y decisiones"; Integración v0.3 dice que Assembly ocurre fuera de Orrery. | ADR §6; Integración UI v0.3 §5 | — | Compatibles si "Orrery" es la experiencia (inicia y presenta) y no el motor (no ensambla). Se resuelve con D-1. |
| DIS-07 | **Estado de Mandate Genesis.** El Tablero Gravity v0.50 (20-09) declara "aceptación E2E real lograda" y Tema 1 cerrado; el Programa MANDATE y la Agenda (28-09) dicen "aceptación E2E bloqueada"; el commit `6d27b71` (28-09) redefine el vertical y deja pendiente la corrida de aceptación con reinicios. | Tablero v0.50 §Z.25; Programa §1, §6.2; commit `6d27b71` | [C] workflow con actos `approve`/`activate` y contrato v1–v3 | Rige lo posterior: aceptación E2E pendiente. Orrery diseña contra el vertical de contrato firmado. |
| DIS-08 | **Vocabulario de eventos.** El cliente espera `mandate:build:domains_proposed`, `mandate:build:signed`, `mandate:action:all_complete`; nadie los publica. El servidor publica `mandate:phase:ingest`, `mandate:build:rejected`, `mandate:build:all_complete`, que el cliente trata como desconocidos y resuelve pidiendo reconciliación. | `ws-events.ts`; `mandateStore.ts` | [C] `PublishMandateEventActivity` en `mandate_build_workflow.go`; `create-mandate.handler.ts` publica `build:initiated` y `draft:created` | La UI se apoya en estado reconciliado (`stateVersion`), no en nombres de evento. Adaptador explícito (§12.3). |
| DIS-09 | **Fases de Mandate.** `MandateTab` muestra `ingest/cluster/validate/scaffold`; el workflow físico usa `ingest → cluster → validate → signed → completed` con actos `approve`/`activate` entre `validate` y la ejecución. | `MandateTab.svelte` | [C] `BuildPhaseOrder` | Se diseña con las fases físicas, aisladas por adaptador (§12.2). |
| DIS-10 | **GenesisTab separado vs `MandateTab` único.** El manifiesto Core UI v0.4 (F-05) exige dos componentes; la consolidación posterior (D-25) unificó. | `Bloom_Conductor_Workspace_Core_UI_01.md` F-05 | [C] `MandateTab.svelte` único | Rige el código. |
| DIS-11 | **Entrada B siempre degradada.** La Spec Core-Orrery dice que el cliente no tiene binding de Project; desde el 05-10 existe `bloom.confirmed-context/v1` con `projectBinding` completo, pero no está conectado ni a `ProjectsPanel` ni a `regimeStore`. | Spec Core-Orrery §1.6 | [C] `confirmedContext.ts` sin consumidores | El gap de binding está resuelto en el backend; falta consumirlo (VS-1). |
| DIS-12 | **El paquete `orrery` no compila.** `fromSimulatedData.ts` importa `Position3` desde `locationTree.ts`, que no lo exporta. El cierre de implementación advirtió que no se compiló. | Cierre Implementación Integración Formal §5 | [C] `tsc`: `TS2305: Module '"../locationTree"' has no exported member 'Position3'` | Corrección incluida como prerrequisito de VS-1. |
| DIS-13 | **Panel de simulación vivo.** Gateway v0.1 §4.2 propuso retirarlo; quedó como pregunta abierta (§8 q2) y el código lo conserva. | Gateway UX v0.1 | [C] `main.ts` (`route`, `marker`, `timeline`) | VS-1 propone retirarlo. D-7. |
| DIS-14 | **Ledger.** La propuesta Ledger lo define como capa consumidora append-only; el componente usa datos de ejemplo y se llama "Event Bus Feed". | Propuesta LedgerPanel v0.1 | [C] `ledgerStore.ts` `MOCK_FEED` | Se reemplaza por la región Actividad alimentada por eventos reales (§7). |
| DIS-15 | **Tenant en Location.** El cierre v1.1 excluye `tenant_ref`; LocationSnapshot v0.1 (posterior) lo incluye como scope obligatorio. | Closure §2; LocationSnapshot §A.1 | [C] `ProjectBinding.tenantId` | Rige LocationSnapshot v0.1. |
| DIS-16 | **Identidad de Gene en Gravity.** `GeneRef {mandateId, genePath}` apunta bajo `.mandates/{id}/.genes/`; Gene v3.0 dice que el Gene no vive bajo el Mandate y G1 guarda en `.genes/projects/{projectId}`. | Contrato GravityGraph §2.2; Gene v3.0 | [C] `gravity/model.go`, `gene/store.go` | La UI identifica Genes por `(projectId, geneId, revision)`; `GeneRef` es compatibilidad transitoria. |
| DIS-17 | **"Gene" como scaffold de dominio.** `ws-events.ts` dice que al completar una acción "el gene existe en disco"; Gene v3.0 define Gene como identidad funcional con revisiones ratificadas. | `ws-events.ts`; Gene v3.0 | [C] Ejecución actual produce `domain_definition.json`, no Genes | La UI nunca llama Gene a un artefacto de ejecución. |
| DIS-18 | **Posture en el espacio del prototipo.** El prototipo dibuja Postures como esferas con campo de masa junto a Domains; el research fija lenguaje humano por defecto y la doctrina Gravity excluye Domain/Gene. | `data.ts`; Research Resultados §3 | — | La lente de criterio se ancla a niveles de spine (§13). |
| DIS-19 | **Core llama a AITAP directo.** El handler de suministro ejecuta `aitap` desde el proceso main de Electron; la propuesta de ownership de AITAP dice "UI → (IPC o Control Plane) → Nucleus → AITAP". | Propuesta Contratos LocalFirst v0.2 §4 | [C] `intelligence-supply-handlers.js` | Se registra. Los nuevos contratos de Orrery pasan sólo por Nucleus/Control Plane. |
| DIS-20 | **Creación automática del Genesis al entrar a Core.** El Programa MANDATE congela "conectar onboarding con autoejecución"; `genesisLaunch.ts` crea el Mandate al bootear. | Programa §9 | [C] `runPendingGenesisLaunch()` | Compatible: crear no es ejecutar; aprobación y activación siguen requiriendo consentimiento. Se registra para verificación. |
| DIS-21 | **Gate de evidencia.** La Agenda condiciona derivar la UI/UX de Workspace Core al contraste físico con datos genuinos de Onboarding + Genesis; el encargo pide avanzar en paralelo. | Agenda "Estado coordinado ORRERY" | — | Se diseña contra semántica estable; los contratos quedan marcados para contraste posterior (§5, §18.7). |
| DIS-22 | **Monitor.** FOLLOWUP (18-09) dice que no existe aplicación; hoy existe un esqueleto que sólo responde `status`. | FOLLOWUP §5 | [C] `installer/monitor` | Sin señales reales; contrato de señal propuesto (§17.6). |
| DIS-23 | **Pausa en `running`.** El manifiesto Core UI (F-06) ofrece "Pausar workflow"; no existe comando ni señal de pausa para Mandates. `gen_state` declara `building_paused`. | Core UI v0.4 F-06 | [C] sin `pause/resume` en `nucleus_help.json` | No se ofrece la acción; se muestra como no disponible con causa. |
| DIS-24 | **Gravity en la ejecución.** La arquitectura dice que Gravity gobierna cada turno; el contrato firmado de Genesis se construye con `gravity` vacío y ningún workflow invoca `resolveActiveGravityActivity`. | Programa §6.3 ("integraciones parciales") | [C] `buildConfirmedContract`, `worker.go` | La lente de criterio muestra "sin criterio vinculado a este Mandate" como hecho, no como ausencia de reglas. |
| DIS-25 | **Fuentes no localizadas.** (a) investigación que separó "Orrery Postures" de "Orrery Postulates"; (b) investigación de "working snapshot" y assets/Genes de Assembler; (c) tarea ORRERY consolidada `01a0a6d5-…` (vive en una conversación); (d) `ASM_Location_Research_v0_1.md` citado por el spec ASM; (e) "ASM — Ejecución y lifecycle material". | Encargo; Agenda; spec ASM | — | No se reconstruyen. La distinción Postures/Postulates se diseña desde fuentes vigentes (§13.4) y queda sujeta a contraste con (a). |
| DIS-26 | **Wiring del store de Gene.** Gene v3.0 y G1 están ratificados; FOLLOWUP lo marca "en verificación, sin caller productivo, sin primer Gene real". | Gene v3.0; FOLLOWUP | [C] sin importadores de `internal/gene` | Genes aparecen en la UI sólo cuando exista lectura (BR-05). |
| DIS-27 | **Postulación de Postura sin contrato.** La UX de Paladin diseña el gesto y el selector de alcance; no existe endpoint ni DTO para registrar una Postura de sesión ni para firmar en PROJECT. | Paladin UX §1; Client Object Model §5 | [F] | El camino "proponer criterio" queda diseñado y deshabilitado con causa. |

---

## 5. Semántica estable y detalles físicos variables

La UI se apoya en la columna izquierda. La derecha queda detrás de adaptadores (§17.4) y puede cambiar sin tocar componentes.

| Semántica estable (base del diseño) | Detalle físico variable (aislado) |
|---|---|
| Jerarquía soberana Tenant → Organization → Project; Project → Repository 0..N | Nombres de campo de `confirmed-context`, endpoint, IPC vs Control Plane |
| Domain y Gene son identidades independientes, Domain↔Gene N:M ratificado | `.cache/.semantic-index.json`, layout de `.gravity/`, `GeneRef`, store G1 |
| Gene tiene revisión vigente y revisiones capturadas; nada se edita, se contribuye | Schemas de `Revision`, `Contribution`, `Head` |
| Una relación propuesta (candidato semántico) no es una relación ratificada | Umbral de cohesión, algoritmo de clustering |
| Mandate = objetivo + plan autorizado + límites + criterios de cumplimiento + evidencia; se ejecuta desde el contrato firmado (M-1) | `contractVersion` 1/2/3, campos de `Intelligence`, nombres de evaluador |
| Mandate → Action → Intent | `run_intent`, `gen`, `domain_definition.json` |
| Actos humanos distintos: confirmar dominios, aprobar contrato exacto, activar | Canal de consentimiento (URL de Authority + atestación), señales Temporal |
| Gravity: Postures situadas por nivel de spine, aplicabilidad por tipo de Intent, Masa explica peso y no decide | `GravityPosture`, `ResolveInput`, gramática `gravity-expr/0.1` |
| Colisión = incompatibilidad situada; tres estados: no colisión, confirmada, indecidible | Taxonomía de detectores, `impact/1` |
| Postulate = decisión adoptada que funda trabajo; propuesta ≠ adopción | Entidad, persistencia y dueño de adopción (pendientes) |
| Location = captura verificable de dónde decidió actuar una persona; resolución por referencia con ocho estados | JSON Schema v0.1, store, resolver |
| Monitor observa; Impact evalúa; ninguno autoriza ni gobierna | Contratos de eventos, cursores, replay |
| Toda lectura de UI declara procedencia y disponibilidad | Formato de `availability` por fuente |

---

## 6. Modelo mental de Orrery (entregable 1)

### 6.1 La frase

> **Un territorio que permanece, un criterio que lo alcanza, trabajo que lo recorre y decisiones que lo cambian.**

La primera mitad ya estaba en el prototipo ("El mundo permanece. El criterio lo alcanza. El trabajo lo recorre."). La cuarta parte, *decisiones que lo cambian*, es lo que agrega este encargo y lo que conecta Orrery con Command Respect: la persona no mira un sistema, lo gobierna.

### 6.2 Tres capas

```text
┌──────────────────────────────────────────────────────────────────────┐
│ SUPERFICIES (UI convencional de Workspace Core)                      │
│ contexto · inspector · componer decisión · trabajo · atención ·      │
│ actividad · comandos                                                 │
├──────────────────────────────────────────────────────────────────────┤
│ LENTES (consumidoras; dibujan sobre el territorio, aportan el        │
│ significado desde afuera)                                            │
│ Trabajo (Mandates) · Criterio (Gravity) · Cambio · Atención ·         │
│ Conocimiento (definiciones, Genes)                                   │
├──────────────────────────────────────────────────────────────────────┤
│ ESPACIO (motor territorial; sólo dónde)                              │
│ Tenant › Organization › Project › Domain › Gene + relaciones          │
│ selección · foco · anchors · captura de Location                      │
└──────────────────────────────────────────────────────────────────────┘
```

| Capa | Responde | Recibe | Nunca hace |
|---|---|---|---|
| Espacio | ¿Dónde estoy? ¿Qué existe y cómo se relaciona? | Modelo de territorio (§17.2) | Interpretar propósito, calcular Gravity, narrar progreso |
| Lentes | ¿Qué ocurre, qué gobierna, qué cambió, qué me necesita, aquí? | Ids de territorio + clase de glifo + estado | Crear nodos de territorio ni reordenarlo |
| Superficies | ¿Qué significa y qué puedo hacer? | Read models y comandos (§17) | Mantener copias mutables de algo autoritativo |

### 6.3 El ciclo SEE → UNDERSTAND → DECIDE → EXECUTE → OBSERVE

| Momento | Pregunta de la persona | Dónde ocurre | Fuente | Estado físico hoy |
|---|---|---|---|---|
| SEE | ¿Dónde estoy y qué existe? | Espacio + barra de contexto | Contexto confirmado, territorio | Parcial: soberanía sí; Domain/Gene no |
| UNDERSTAND | ¿Qué significa, qué gobierna, qué está pasando? | Inspector + lentes | Contrato, definición de dominio, Gravity, estado de Mandate | Parcial: Mandate sí; Gravity no |
| DECIDE | ¿Qué quiero que pase? ¿Choca con algo? ¿Lo adopto? | Compositor de decisión + atención | PostulateProposal, evaluación, actos humanos | Actos de Mandate sí (CLI); Postulate no |
| EXECUTE | ¿Se convirtió en trabajo autorizado? | Trabajo (Mandate) + Authority | Contrato firmado, aprobación, activación | Sí, para el vertical `gen` |
| OBSERVE | ¿Qué cambió por ese trabajo? | Lente Cambio + inspector + actividad | Resultado de ejecución, artefacto, contabilidad | Parcial: artefacto y digest sí; cambios de Gene/Gravity no |

### 6.4 Qué no es Orrery

No es un explorador pasivo de grafos, ni un monitor técnico, ni un dashboard de tokens, ni un segundo store. Cada vista debe poder responder la pregunta V-16. Si una vista sólo muestra más cosas, no pertenece al camino principal.

---

## 7. Arquitectura de información de Workspace Core (entregable 2)

### 7.1 Regiones persistentes

| Región | Función | Contenido | Componente existente que evoluciona |
|---|---|---|---|
| R1 · Riel de navegación | Cambiar de lugar dentro del producto | Orrery (inicio), Trabajo, Wisdom, Nucleus, Profiles; Account y Settings abajo | `Sidebar.svelte` |
| R2 · Barra de contexto y location | Decir siempre dónde estoy y con qué evidencia | Breadcrumb soberano (Tenant › Organization › Project › Domain › Gene), estado del binding, chip "Criterio" (cantidad aplicable al foco), chip de inteligencia disponible | Nuevo, sobre `bloom.confirmed-context/v1` |
| R3 · Escenario | Lugar principal de trabajo | Espacio Orrery (por defecto en un Project) o página convencional (Home, Wisdom, Nucleus) | `OrreryContainer.svelte`, rutas |
| R4 · Inspector | Explicar lo seleccionado y ofrecer acciones | Ficha por tipo de entidad en cuatro niveles (§15) | Nuevo; reemplaza el inspector HTML del prototipo |
| R5 · Dock de decisión | Formular y evaluar una decisión desde el contexto | Compositor "Declarar" (§11) | Nuevo |
| R6 · Atención | Lo que necesita a la persona ahora | Decisiones pendientes, errores reanudables, binding vencido, conflictos | Nuevo; alimenta el ▌▌▌ de las tabs |
| R7 · Actividad | Qué pasó, en orden | Eventos reales de Mandate y del sistema, con procedencia | `LedgerPanel.svelte` (deja el mock) |
| R8 · Comandos | Hacer cualquier cosa sin buscarla | Paleta de comandos (navegar, fijar anchor, declarar, abrir Mandate) | Nuevo |
| R9 · Tabs de trabajo | Mandates abiertos como universos de trabajo | Tabs con ▌▌▌ | `TabBar.svelte`, `MandateTab.svelte` |

El panel derecho ya decidido (organización, información de sistema, Alfred) se conserva como contenido de R4 cuando no hay selección: el inspector vacío muestra la organización activa y la salud del sistema, y Alfred queda abajo, colapsado.

### 7.2 Mapa de navegación

```text
Orrery (Project activo) ── Espacio + lentes + inspector + dock
   ├── Trabajo ─────────── lista de Mandates por atención → tab de Mandate
   ├── Wisdom ──────────── (sin cambios de esta propuesta)
   ├── Nucleus ─────────── organizaciones y Projects (entrada B)
   └── Profiles · Account · Settings
```

[I] Propuesta: cuando hay un Project confirmado, Orrery es la pantalla de inicio de Workspace Core. Sin Project confirmado, Home sigue siendo la pantalla de inicio y ofrece completar el contexto.

### 7.3 Relación con los dos regímenes (enmienda propuesta, D-2)

Hoy el régimen espacial reemplaza toda la UI. Para cumplir el encargo sin perder lo que la decisión de septiembre protegía (que Orrery no acumule lógica de Mandates por conveniencia de layout), se propone:

1. **El canvas del espacio sigue ocupando el 100% del escenario.** Nada se encaja en una grilla que lo achique.
2. **Las superficies R2, R4, R5, R6 flotan sobre el canvas** como paneles acoplados, colapsables y descartables. No son layout compartido: el canvas no se redimensiona al abrirlas.
3. **La frontera semántica pasa a estar protegida por el contrato de datos (V-2) y por la arquitectura de lentes**, no por la exclusión de layout. El motor nunca recibe objetos de Mandate ni de Gravity.
4. **Modo foco:** un gesto oculta todas las superficies y deja sólo el HUD de orientación (breadcrumb, retorno, foco) — exactamente el régimen de v0.2 — para quien quiera territorio puro.
5. El régimen Panel (páginas convencionales) se mantiene para todo lo que no es territorio.

Alternativa conservadora, si D-2 se rechaza: mantener la exclusividad y abrir inspector y dock como overlays modales con cierre explícito (v0.1 §2.2). Funciona, pero la persona pierde el contexto espacial cada vez que decide, que es justamente el momento donde más lo necesita.

---

## 8. Composición de la pantalla principal (entregable 3)

### 8.1 Estado por defecto: Project abierto

```text
┌─┬───────────────────────────────────────────────────────────────────────────┐
│R│ R2  ‹tenant› › ‹organización› › ‹proyecto›  ● vinculado · verif. 12:03    │
│1│     Criterio: 0 aplicable · Inteligencia: local disponible   ⌘K           │
│ ├───────────────────────────────────────────────────────────────┬───────────┤
│◎│                                                               │ R6        │
│ │                                                               │ Atención  │
│▤│                  R3  ESPACIO                                  │ ▌▌▌ 1     │
│ │                                                               │ Confirmar │
│✦│            ( Project )                                        │ dominio   │
│ │               │                                               │ "Identi-  │
│⚙│        ┌──────┴───────┐                                       │ dad"      │
│ │   [Dominio A]     [Dominio B]·····(propuesto)                 │           │
│ │       ◆ Mandate ▌▌▌                                           ├───────────┤
│ │                                                               │ R4        │
│ │                                                               │ Inspector │
│ │  lentes: [Trabajo ●] [Criterio ○] [Cambio ○] [Conocimiento ○] │ (ficha)   │
│ ├───────────────────────────────────────────────────────────────┴───────────┤
│ │ R5  Declarar desde: ‹proyecto› › Dominio A  ▸ "Qué querés que pase acá…"  │
│ └───────────────────────────────────────────────────────────────────────────┤
└─────────────────────────────────────────────────────────────────────────────┘
```

Reglas de composición [I]:
- La atención (R6) va arriba a la derecha y es corta: tres ítems como máximo visibles, el resto agrupado. Nunca reemplaza al territorio como foco visual.
- El inspector (R4) aparece al seleccionar y se colapsa a una pestaña lateral cuando no hay selección.
- El dock (R5) está siempre presente como una línea; se expande al escribir. Su etiqueta dice desde dónde se declara (los anchors), no qué hacer.
- Las lentes se activan con interruptores visibles en el borde del escenario. Por defecto sólo Trabajo y Atención están activas.
- Paleta calm-first [D]: fondo oscuro, contraste moderado, acentos sólo para estado. Un color se reserva para "requiere atención" y no se usa para nada más.

### 8.2 Estados de la pantalla

| Estado | Qué cambia |
|---|---|
| Sin Project confirmado | El escenario muestra la organización con el estado del binding y una acción: "Completar contexto". No se simula territorio. |
| Selección | Inspector abierto sobre la entidad; el foco de cámara vuela a ella (interpolación del prototipo). |
| Componiendo | El dock se expande hasta 40% de alto; el territorio queda visible arriba con los anchors resaltados. |
| Decisión pendiente | El ítem de atención abre el inspector del Mandate en la sección "Necesita tu decisión". |
| Modo foco | Sólo canvas + HUD (breadcrumb, retorno, foco). |
| Ancho reducido (< 1100 px) | Inspector y atención se apilan en un único panel con pestañas; el dock se vuelve un botón. |

---

## 9. Sistema de navegación y location (entregable 4)

### 9.1 Tres conceptos independientes

La consolidación de Agenda fija que Context, Focus y Anchors son independientes [D]. Se traducen así:

| Concepto | Qué es | Dónde vive | Persistencia |
|---|---|---|---|
| **Contexto** | Organization + Project activos (scope soberano) | `confirmed-context` (Nucleus) | Autoritativo, revalidado |
| **Foco** | Lo que la persona mira ahora (cámara + inspector) | Navigation State (cliente) | Sesión |
| **Anchors** | Lo que la persona señaló explícitamente como "desde acá decido" | Navigation State (cliente) | Sesión; entra a una `LocationSnapshot` sólo al capturar |

**Seleccionar no es anclar.** Un clic enfoca. Fijar un anchor es un gesto explícito ("Declarar desde acá", o el atajo de fijar). Esto preserva `origin: user_anchor` como selección deliberada [D LocationSnapshot §C.5].

### 9.2 Navegación vs captura (D-3)

- El espacio renderiza el **modelo de territorio de navegación** (§17.2): mutable, de sesión, recompuesto desde lecturas autoritativas. Cumple el espíritu de v0.2: un solo árbol, sin jerarquía paralela, sin reordenar la forma; la presentación se resuelve con layout.
- Una **`LocationSnapshot`** se produce cuando la persona ancla y declara (§11, paso P1). Contiene sólo referencias admisibles por v0.1: Project (authority) y nodos Gravity existentes. Lo que no es admisible (Domain declarado por un Mandate, candidato, artefacto) aparece en el compositor con estado `unsupported` y su causa, en lugar de forzarlo al schema.
- Mientras no exista productor de Location (A1–A3), el compositor muestra la captura como **borrador local** con la etiqueta "captura no persistida". No se fabrica `location_id`.

### 9.3 Breadcrumb y escala

```text
‹tenant› › ‹organization› › ‹project› › Identidad (Domain) › ‹gene›        (ejemplo)
```

- Cada segmento es navegable y muestra su estado de resolución con un punto (verificado, cambiado, no verificable…).
- El zoom semántico tiene cuatro niveles: Organization (Projects como regiones), Project (Domains como territorios), Domain (Genes como entidades), Gene (activos constitutivos como lista en el inspector, no en el espacio). El nivel lo da el foco, no un selector aparte [D V-3].
- Repository: Project → Repository es 0..N ratificado [D], pero no hay lectura física en la UI. Se reserva como agrupación dentro del Project cuando exista; no se inventa.

### 9.4 Entradas al espacio

| Entrada | Origen | Foco inicial | Estado |
|---|---|---|---|
| A | Riel (Orrery) | Último foco de la sesión; si no hay, el Project del contexto confirmado; si no hay, la Organization | Existe; hoy usa datos simulados |
| B | `ProjectsPanel` "Ver en Orrery" | Ese Project, si el contexto confirmado lo vincula; si no, A y se dice por qué | Existe; siempre degrada (DIS-11) |
| C [I] | Ítem de atención | La entidad que requiere decisión (p. ej. el dominio a confirmar) | Nueva |
| D [I] | Tab de Mandate "Ver en territorio" | El dominio del contrato del Mandate | Nueva |

C y D respetan V-5: no son disparos automáticos por actividad; son gestos explícitos desde algo que la persona ya estaba mirando.

### 9.5 Historia y retorno

Atrás/adelante recorre focos (no capturas). El retorno al régimen Panel restaura el panel de origen (Gateway v0.1 §5.2). Volver a abrir el espacio restaura el último foco de la sesión; el foco no se persiste entre sesiones hasta que exista la reapertura de Location (A4).

---

## 10. Selección e inspección (entregable 5)

### 10.1 Ficha por tipo de entidad

| Entidad | L0 · qué es | L1 · operación | L2 · inspección | Acciones | Fuente hoy |
|---|---|---|---|---|---|
| Organization | Nombre, rol de la persona | Projects, estado de autoridad | `organizationId`, versión de autoridad, digest de estado | Cambiar de organización (panel derecho) | `confirmed-context` [C] |
| Project | Nombre y propósito conocido | Dominios, Mandates activos, atención | `projectId`, binding (`revision`, `checkedAt`, `validUntil`), continuidad de id, ubicación local | Declarar desde acá; abrir en Nucleus | `confirmed-context` + lista de Projects [C] |
| DomainCandidate | "Propuesto por Cognituum" + nombre | Cohesión, archivos de evidencia, Mandate que lo propone | `domainId`, fase, quién confirma | Confirmar / rechazar (acto, §12.4) | `mandate_state.json` [C], sin lectura (BR-01) |
| Domain (declarado por Mandate) | Nombre + propósito (de la definición) | Límites, conceptos, decisiones propuestas | Contrato que lo declaró, digest del artefacto | Declarar desde acá; ver Mandate | Contrato + `domain_definition.json` [C], sin lectura (BR-01) |
| Domain (canónico) | Ídem, con procedencia canónica | Genes relacionados | Revisión, relaciones ratificadas | Ídem | [F] (BR-04) |
| Gene | Función declarada | Activos constitutivos, Domains | Revisión vigente vs capturada, Contributions, procedencia | Declarar desde acá | [F] (BR-05) |
| Mandate | Objetivo en una línea + ▌▌▌ | Fase, decisión pendiente, dominio, resultado | Contrato (versión, digest), inputs congelados, inteligencia y presupuesto, fulfillment, aprobaciones | Abrir tab; ver en territorio; actos pendientes | Lista [C]; detalle [F] (BR-01) |
| Action / Intent | "Generar definición del dominio" | Estado, intento, resultado | `actionId`, `idempotencyKey`, digest del artefacto, consumo | — | [C] parcial |
| Artefacto (`domain_definition.json`) | "Definición del dominio" | Propósito, límites, conceptos, decisiones | Digest, fuentes con hash | Usar como contexto de una declaración | [C] sin lectura (BR-01) |
| Posture | La regla en lenguaje humano | Nivel de origen, a qué tipo de trabajo aplica, Masa con desglose | Expresión, primitiva, `postureId`, promoción | Ir al punto de cambio (§13.5) | [F] (BR-03) |
| Colisión | "Estas dos cosas no pueden cumplirse a la vez" | Sujetos, contexto compartido, estado (confirmada / indecidible) | Prueba: predicados comparados o autoridad que confirmó | Decidir: excepción, elevación, cambio de criterio | [F] (BR-07) |
| Decisión (PostulateProposal) | El texto declarado | Anchors, evaluación, readiness | Revisión, fundamentos, limitaciones | Editar, evaluar, adoptar, descartar | Cliente [I]; adopción [F] |

### 10.2 Reglas del inspector

1. **Procedencia siempre visible** en L0 con un sello corto: *verificado*, *declarado por un Mandate*, *propuesto*, *proyección*, *no verificable*. Nunca se muestra una entidad sin su origen.
2. **Acciones deshabilitadas con causa**: si una acción existe en el modelo pero no tiene contrato físico, aparece deshabilitada con una línea que dice qué falta. No se ocultan, para que la persona entienda el sistema sin pedir explicaciones.
3. **Las propuestas del modelo nunca parecen decisiones humanas.** Las `decisions` de `domain_definition.json` se rotulan "decisiones propuestas por el modelo"; sólo una adopción humana las convierte en algo que gobierna.
4. **Revalidación al abrir**: la autoridad de la persona (qué niveles puede firmar, qué actos puede ejecutar) se consulta cada vez que se abre una ficha con acciones, no se cachea por sesión [D V-12, Client Object Model §4].

---

## 11. Flujo de creación de Postulate (entregable 6)

### 11.1 Recorrido

```text
P0 Situar ─► P1 Anclar ─► P2 Declarar ─► P3 Formular ─► P4 Evaluar ─► P5 Decidir ─► P6 Convertir en Mandate ─► P7 Autorizar ─► P8 Observar
(dónde)     (desde acá)   (lenguaje     (propuesta     (criterio,    (adoptar,     (contrato         (Authority:   (qué cambió)
                           natural)      estructurada)  choques,      modificar,    propuesto)        aprobar,
                                                        consecuencias) descartar)                      activar)
```

| Paso | Qué ve y hace la persona | Objeto | Dueño | Estado físico | En VS-1 |
|---|---|---|---|---|---|
| P0 Situar | Navega y selecciona en el espacio | Navigation State | Cliente | Existe parcialmente | Sí |
| P1 Anclar | "Declarar desde acá" fija uno o más anchors; el dock muestra "desde: …" | Anchors → captura de Location | Cliente → Location (A1) | Location `NOT_SUPPORTED` | Sí, captura como borrador local con estados por referencia |
| P2 Declarar | Escribe qué quiere que pase, en su idioma | Declaración humana | Persona (cliente-only hasta P5) | — | Sí |
| P3 Formular | Ve su declaración convertida en una propuesta legible: objetivo, alcance (anchors), restricciones conocidas, preguntas abiertas | `PostulateProposal` (borrador, revisión local) | Proceso soberano en Core [I, D-5]; asistencia de inteligencia opcional vía AITAP | [F] | Estructura sí; asistencia no |
| P4 Evaluar | Ve qué criterio aplica, qué choca y qué consecuencias se pudieron evaluar; readiness: *preparada*, *preparada con límites*, *bloqueada* | Evaluación (Gravity, colisiones, Impact; luego `AssemblyResult`) | Gravity, Impact, ASM | Impact material sin consumidor; Gravity sin lectura; ASM no existe | Sí, con cada evaluador mostrando "no disponible: causa" |
| P5 Decidir | Adopta, modifica (nueva revisión) o descarta. Adoptar exige confirmar la revisión exacta que está viendo | Acto de adopción → Postulate | Nucleus (propuesto en ADR ASM) | [F] | Deshabilitado con causa |
| P6 Convertir | Ve el contrato que se propondría: objetivo, dominio/alcance, acción, inputs congelados, criterio vinculado, cumplimiento, presupuesto | Mandate (contrato candidato) | Nucleus | Sólo para el vertical `gen` desde dominios confirmados | Vista previa de solo lectura; sin envío |
| P7 Autorizar | Aprueba el contrato exacto y luego lo activa, cada acto con consentimiento en Authority | Actos `approve` / `activate` | Nucleus + Authority | Existe por CLI | Hand-off visible (§12.4) |
| P8 Observar | Sigue el trabajo y ve qué cambió | Ejecución, artefacto, cambios | Temporal, Nucleus | Parcial | Sí, para Mandates existentes |

### 11.2 Dos salidas de una misma declaración

La pregunta clave del paso P3 es qué clase de cosa declaró la persona. El compositor ofrece dos salidas explícitas, nunca inferidas en silencio:

| Si la persona dice… | Es | Camino | Vista que lo muestra |
|---|---|---|---|
| "Esto tiene que pasar acá" | Una **decisión operativa** (Postulate) | P3 → P8; puede fundar un Mandate | Lente Trabajo (ejecución física) |
| "Así deben hacerse las cosas acá" | **Criterio** (propuesta de Posture) | Gesto de Paladin UX §1 (retroactivo, alcance elegido entre niveles firmables) → Gravity | Lente Criterio (vista lógica) |

Esta separación es la forma concreta de preservar la distinción entre la vista lógica de Postures y la ejecución física de Postulates/Mandates (§13.4). El camino de criterio queda diseñado y deshabilitado hasta que exista un contrato de registro de Postures (DIS-27).

### 11.3 Reglas del compositor

1. **Desde dónde, siempre visible.** El encabezado del dock lista los anchors con su estado de resolución. Cambiar un anchor durante la redacción produce una captura nueva; nunca se mezclan dos selecciones [D LocationSnapshot §F.3].
2. **No inventar objetivo desde el foco** [D ASM spec regla 2]. Si la persona no escribió qué quiere, el compositor no propone uno; ofrece preguntas.
3. **Lo que no se pudo evaluar se dice.** Una evaluación vacía nunca equivale a "sin conflictos" [D Colisiones §4.2 regla 2; Impact `coverage`].
4. **La revisión aprobada es la revisión vista.** Si la propuesta cambió después de evaluarse, el botón de adopción exige reevaluar [D ADR ASM §12].
5. **El borrador se pierde al cerrar** salvo que José decida un "guardar borrador" explícito [D V-12].
6. **La inteligencia asiste, no decide.** Si se usa un modelo para formular (P3), su aporte se marca como sugerido y la persona lo acepta frase por frase. El modelo elegido respeta la preferencia de inteligencia del contexto confirmado.

---

## 12. Mandate y runtime (entregable 7)

### 12.1 Dónde se ve el trabajo

| Lugar | Qué muestra | Qué no muestra |
|---|---|---|
| Espacio (lente Trabajo) | Un marcador por Mandate sobre el territorio que su contrato declara (dominio) o, si no lo declara, sobre el Project. El marcador lleva el indicador ▌▌▌: **estado** (barra 1), **actividad** (barra 2, anima sólo si hay ejecución en curso), **atención** (barra 3, encendida si necesita a la persona) | Pasos, Intents, narración de progreso [D v0.3 §2.3] |
| Tabs (R9) | El mismo ▌▌▌ y el objetivo corto | — |
| Tab de Mandate | Ciclo de vida con las fases físicas, actos humanos, contrato, resultado y evidencia | Logs técnicos en L0/L1 |
| Atención (R6) | Sólo los Mandates que necesitan decisión o están detenidos con error reanudable | Mandates que avanzan sin problema |
| Actividad (R7) | Eventos en orden, con procedencia | Interpretación |

Esto ratifica con una extensión la hipótesis v0.3 §2.3 (Mandate como marcador de objetivo, sin narrar su progreso en el espacio) — D-11.

### 12.2 Ciclo de vida que se muestra

Fases físicas del vertical actual [C `BuildPhaseOrder`, `MandateBuildWorkflow`]:

```text
Ingesta ─► Propuesta de dominios ─► Confirmación (humano) ─► Aprobación del contrato (humano + Authority)
        ─► Activación (humano + Authority) ─► Ejecución (Action gen) ─► Cumplimiento verificado ─► Completado
```

| Etapa mostrada | Fuente física | Requiere a la persona | Texto L0 propuesto |
|---|---|---|---|
| Ingesta | `currentPhase = ingest` | No | "Leyendo el proyecto" |
| Propuesta de dominios | `cluster` → candidatos | No | "Proponiendo cómo se organiza" |
| Confirmación | `validate`, señal `mandate:build:validate` pendiente | **Sí** | "Necesita que confirmes el dominio" |
| Aprobación | contrato persistido, señal `mandate:build:approve` pendiente | **Sí** | "Necesita que apruebes el plan exacto" |
| Activación | señal `mandate:build:activate` pendiente | **Sí** | "Listo para empezar cuando lo actives" |
| Ejecución | `MandateExecutionWorkflow` / Action | No | "Trabajando: generando la definición del dominio" |
| Cumplimiento | `fulfillmentStatus = fulfilled` + digest | No | "Cumplido: el resultado tiene la forma pactada" |
| Completado / Rechazado / Error | `mandate:build:all_complete`, `mandate:build:rejected`, error | Según caso | "Terminado" / "Rechazado por vos" / "Se detuvo: …" |

[F] La distinción entre "esperando aprobación" y "esperando activación" no está expuesta en `GET /api/v1/mandates`; se necesita el detalle (BR-01) o eventos explícitos.

### 12.3 Adaptador de eventos

| Evento físico | Publicado por | Hoy en el cliente | Propuesta |
|---|---|---|---|
| `mandate:build:initiated` | Control Plane | Maneja | Igual |
| `mandate:draft:created` | Control Plane | Maneja | Igual |
| `mandate:phase:ingest` | Workflow | Desconocido → reconcilia | Mapear a Ingesta |
| `mandate:action:started/completed/failed` | Activity de scaffold | Maneja | Igual; verificar que el vertical `gen` los emita |
| `mandate:build:rejected` | Workflow | Desconocido → reconcilia | Mapear a Rechazado |
| `mandate:build:all_complete` | Workflow | Desconocido → reconcilia | Mapear a Completado |
| `mandate:build:domains_proposed`, `mandate:build:signed` | Nadie | Maneja (nunca llegan) | Retirar del mapa o pedir su emisión |

Regla: **el estado mostrado sale del último snapshot reconciliado con `stateVersion`**, los eventos sólo disparan reconciliación. Así un cambio de nombre en el servidor no rompe la UI (ya es el comportamiento de `mandateStore` ante eventos desconocidos [C]).

### 12.4 Intervención humana

| Acto | Existe | Cómo se ofrece en VS-1 | Cómo se ofrece después |
|---|---|---|---|
| Confirmar / rechazar dominio | CLI `nucleus mandate build domains confirm|reject` [C] | Ítem de atención con el comando exacto para copiar | IPC → Nucleus (BR-02) con confirmación en Core |
| Aprobar contrato exacto | CLI `nucleus mandate approve` + consentimiento en Authority [C] | Ítem con digest del contrato y el comando | IPC que abre la URL de Authority y recibe la atestación (BR-02) |
| Activar | CLI `nucleus mandate activate` + consentimiento [C] | Ídem | Ídem |
| Pausar / reanudar / cancelar | **No existe** [C] | No se muestra como acción; L2 indica "no disponible" | Cuando exista (contratos de Executor ya prevén `paused/resumed/cancelled`) |
| Reintentar tras error reanudable | Mencionado en `ws-events.ts`; sin comando `resume` [C] | Mensaje con causa; sin acción | BR-02 |

Core nunca firma: muestra el objeto exacto, abre el lugar donde la autoridad consiente y verifica el resultado [D V-11].

### 12.5 Concurrencia, Monitor e Impact

- **Varios Mandates:** varios marcadores en el territorio; la lista de Trabajo se ordena por atención, luego por actividad. Si dos Mandates declaran el mismo dominio, el marcador se apila con un contador; una colisión territorial confirmada se muestra como colisión (§13.3), no como superposición visual.
- **Constellation:** no existe físicamente [F]; no hay vista de coordinación entre Mandates en VS-1. La lente Trabajo queda preparada para dibujar dependencias cuando existan (`dependsOn` ya está en `DomainCandidate`, sin productor).
- **Monitor:** sin señales. La región Atención se diseña sobre un contrato de señal con secuencia y cursor (§17.6) para que, cuando Monitor publique situaciones evaluables, entren sin cambiar la UI.
- **Impact:** sus `Assessment` se muestran en el paso P4 y en fichas de colisión con tres partes legibles: qué se preguntó (`questionText`), qué se encontró (`findings`), qué no se pudo determinar (`indeterminacy`, `coverage`). Nunca como "permiso".

---

## 13. Gravity, Postures y colisiones (entregable 8)

### 13.1 Lente Criterio

- **Por defecto apagada en el espacio**; siempre presente como chip en R2: "Criterio: N aplicable aquí" [D V-3, V-4].
- **Lenguaje humano primero.** Cada Posture se muestra como una frase ("Toda transformación conserva evidencia de su origen"), su nivel de origen ("de la organización") y su Masa como ícono de 1–3 marcas con desglose (origen, verificable, promovida) [D Paladin UX §4].
- **Anclaje correcto.** Las Postures viven en NUCLEUS, ORGANIZATION, PROJECT, MANDATE y SESSION. Al encender la lente, el nodo donde se declaró la Posture muestra un halo que cubre su subárbol (herencia por spine). **Nunca se ancla un halo a un Domain o un Gene** [D V-8]. La aplicabilidad no es territorial sino por tipo de trabajo (`appliesTo`), y así se dice: "aplica a: generación de dominios".
- **Lo literal, bajo demanda.** "Ver como grafo" abre una vista separada con la expresión y la geometría; se descarta al cerrar [D Client Object Model].
- **Hoy:** sin lectura de Postures (BR-03). La lente muestra "El criterio vigente todavía no es legible desde Workspace Core". Para Mandates del vertical actual, la ficha dice "Este Mandate se firmó sin criterio vinculado" (DIS-24), que es un hecho del contrato.

### 13.2 Alcance y aplicabilidad

En la ficha de cualquier nodo de spine: "Criterio que alcanza este lugar" en tres grupos — declarado aquí, heredado de arriba, aplicable al trabajo seleccionado. El tercer grupo es el resultado de una resolución para un tipo de trabajo; cuando la resolución requiera Mandate + Session (como `ResolveActive` hoy), la UI lo dice y no simula una resolución sin ellos.

### 13.3 Colisiones

Tres familias, tres lugares [D Colisiones §3]:

| Familia | Sujetos | Momento | Dónde se muestra |
|---|---|---|---|
| Territorial | Mandates activos sobre el mismo territorio | Al proponer trabajo | Lente Trabajo: los dos marcadores unidos por una marca de colisión; ficha en inspector |
| Jerárquica | Posture inferior vs heredada | Antes de firmar criterio | Compositor de criterio (no se puede proponer sin resolverla) |
| Horizontal | Postures independientes aplicables al mismo caso | Al resolver | Lente Criterio: halos superpuestos con marca |

Tres estados, nunca dos [D Colisiones §4.2]:

| Estado | Señal | Texto L0 |
|---|---|---|
| No colisión | ninguna | — |
| Confirmada | marca sólida, color de atención | "Estas dos no pueden cumplirse a la vez" |
| Indecidible | marca punteada | "Pueden chocar; el sistema no puede decidirlo" |

Las seis respuestas de Gravity ante un conflicto (rechazado, señalado, reinterpretado, elevación, excepción, propuesta de cambio) conservan la tabla de señales de Paladin UX §3.2 cuando lleguen a Core [D V-13].

### 13.4 Vista lógica de criterio y ejecución física de trabajo

| | Vista lógica (Postures) | Ejecución física (Postulates → Mandates) |
|---|---|---|
| Pregunta | ¿Qué gobierna aquí? | ¿Qué se está haciendo aquí y bajo qué decisión? |
| Objetos | Postures, Masa, herencia, colisiones normativas | Postulates adoptados, Mandates, Actions, Intents, resultados |
| Lente | Criterio | Trabajo |
| Geometría | Halos sobre nodos de spine | Marcadores sobre territorio (dominios) |
| Cuándo choca con lo otro | Un Postulate o un Mandate contradice una Posture (evaluación P4; respuestas de Gravity en ejecución) | |
| Cómo se cambia | Proponer criterio (camino Paladin UX) | Declarar decisión (§11) |

Nunca se dibujan en la misma capa. Cuando ambas lentes están encendidas, se ven superpuestas, pero cada glifo pertenece a una sola.

### 13.5 "Ir al punto de cambio" en lugar de editar

Gravity no se edita desde la escena [D encargo]. Cada Posture y cada colisión ofrece **Ir al punto de cambio**: lleva el foco al nodo donde la Posture fue declarada, muestra quién puede cambiarla (autoridad revalidada) y abre el camino de propuesta de criterio con la Posture precargada como "modificar". Si la persona no tiene autoridad en ese nivel, la acción explica a qué nivel debe elevarse.

---

## 14. Post-Genesis e incorporación de Bloomaut (entregable 9)

### 14.1 Qué existe físicamente después de un Genesis exitoso

Inferido del código que lo produce; no observado en una instalación (§1.1).

| Elemento | Existe | Fuente |
|---|---|---|
| Identidad, Tenant, Organization y Project con binding canónico | Sí | Onboarding `backend_identity_check` → Authority; `confirmed-context` |
| Nodos Gravity NUCLEUS / ORGANIZATION / PROJECT / MANDATE / SESSION | Esperables por los recorridos gobernados; sin lectura para verificarlo desde Core | `governed_creation.go`, `EnsureGravityMandateNodeActivity`, `CreateGravitySessionActivity` |
| Mandate Genesis con `mandate_state.json`, contrato firmado (v1–v3), aprobación y activación con digest | Sí | `mandate_authority_cmd.go`, `mandatecontract` |
| Un dominio confirmado (`{id, name}`) | Sí, uno | Contrato: "exactly one bound gen Action" |
| `domain_definition.json` (`purpose`, `boundaries`, `concepts`, `decisions`, `sources`) con digest y cumplimiento | Sí | `gen_domain.py`, `MandateGenActivity` |
| Inputs congelados con hash y tamaño | Sí | `domains confirm` (`frozenFiles`) |
| Recepción ING (intent `ing` creado vía Brain) | Sí; la vectorización asociada no se verificó en esta lectura | `IngestReceptionActivity` |
| Evento de contabilidad de la inferencia | Sí | AITAP `inference-accounting-event` v2 |
| Domain canónico, Genes, DOMAIN_GENE, DOMAIN_MANDATE | **No** | Sin productor conectado |
| Postures vinculadas | **No** (`gravity: []`) | `buildConfirmedContract` |
| Location capturada | **No** | `NOT_SUPPORTED` |

### 14.2 Primera apertura (Cognituum recién genesisado)

Objetivo: que la persona entienda en un minuto qué sabe Cognituum de su proyecto, qué hizo y qué puede hacer ahora.

1. **Orientación mínima, una sola vez** [D Gateway §4]: cómo moverse y qué significan los tres tipos de sello (verificado, declarado, propuesto). No enseña arquitectura.
2. **Llegada con foco** en el Project del contexto confirmado (entrada A). El territorio muestra: Project → el dominio confirmado → el marcador del Mandate Genesis en estado Completado.
3. **Tarjeta "Lo que Cognituum sabe de este proyecto"** en el inspector del Project:
   - "Tu proyecto está vinculado a ‹organización› (verificado hoy)".
   - "Se definió 1 dominio: *Identidad*. Propósito: …" (de la definición).
   - "Se usaron N archivos como fuente" (inputs congelados).
   - "El trabajo se hizo con *modelo X* (local) y costó *0 USD / N tokens*" (contabilidad).
   - "Todavía no hay criterio vinculado ni funciones (Genes) reconocidas."
4. **Vacíos como invitaciones**, nunca como pantallas vacías: "¿Querés declarar cómo deben hacerse las cosas acá?" (criterio, deshabilitado con causa en VS-1), "¿Querés que Cognituum lea otro dominio?" (nuevo Mandate), "Declarar algo desde *Identidad*" (compositor).
5. **Atención vacía** dice "Nada necesita tu decisión". Esa frase es parte del valor: la persona no tiene que vigilar.

### 14.3 Incorporación de un proyecto real (Bloomaut)

La incorporación debe sentirse como **reconocimiento de lo que el equipo ya tiene**, no como migración [D Snapshot de entrevistas §18: importar y reconocer workflows existentes es el problema de primer contacto].

| Etapa | Qué produce el sistema | Cómo aparece en Orrery | Estado físico |
|---|---|---|---|
| S0 Vincular | Project registrado/importado con binding | Project aparece con sello "vinculado"; si el binding no está, el territorio no se dibuja y R2 dice por qué | Existe (onboarding `project_select`, import) |
| S1 Leer | Ingesta de archivos (ING) | El Project muestra una huella de lectura (archivos leídos / total) en la lente Conocimiento; nada se dibuja como territorio todavía | Existe (eventos de progreso parciales) |
| S2 Proponer | Clustering → `DomainCandidate` con cohesión | Territorios **punteados** con sello "propuesto"; la cohesión como una palabra (alta/media/baja) en L0 y número en L2 | Existe, N=1 por Mandate |
| S3 Confirmar | Persona confirma / rechaza / renombra | El candidato confirmado se vuelve **sólido**; el rechazado desaparece del territorio y queda en Actividad | Existe (CLI); renombrar en la señal está prohibido hoy |
| S4 Definir | `gen` produce la definición del dominio | El dominio gana ficha con propósito, límites, conceptos y decisiones propuestas | Existe |
| S5 Reconocer funciones | Contributions → Revisions de Genes | Genes como entidades dentro del dominio; candidatos semánticos vs relaciones ratificadas con trazos distintos | [F] G2 |
| S6 Proyectar estructura | DOMAIN/GENE/aristas en GravityGraph | Relaciones Domain↔Gene ratificadas | [F] C1–C3 |
| S7 Reconocer criterio existente | Reglas que el equipo ya escribió (`AGENTS.md`, `CLAUDE.md`, specs) → propuestas de criterio | Lente Criterio con propuestas para que la persona las adopte | [F] sin contrato; requiere decisión |

**Límite físico (D-6):** el contrato del primer vertical admite un dominio y una acción por Mandate. Bloomaut tendrá varios dominios. Dos caminos, ambos compatibles con esta experiencia:
- **Un Mandate por dominio.** Funciona hoy; la lente Trabajo muestra varios marcadores Genesis; la persona repite S2–S4 por dominio.
- **Contrato multi-dominio.** `dependsOn` y `topologicalLayers` ya existen en el código como preparación, pero el contrato actual los rechaza.

### 14.4 Guion de validación con una persona de Bloomaut

Mide el criterio de éxito del encargo sin explicar arquitectura:

1. "¿Dónde estás?" → debe nombrar organización y proyecto desde R2.
2. "¿Qué sabe el sistema de tu proyecto?" → debe encontrar dominios y su definición.
3. "¿Hay algo que necesite tu decisión?" → debe ir a Atención.
4. "¿Qué está pasando ahora?" → debe leer el estado del Mandate sin abrir logs.
5. "Decidí algo sobre *este* lugar" → debe anclar y declarar, y leer qué se pudo evaluar.
6. "¿Qué cambió después?" → debe encontrar el resultado y su procedencia.

Registrar en voz alta (think-aloud), tiempo por tarea y cada vez que pregunte qué significa una palabra: esas palabras alimentan el vocabulario L0 (§15.2).

---

## 15. Progressive disclosure

### 15.1 Cuatro niveles [D Research brief §2.3]

| Nivel | Para | Muestra | Ejemplo en un Mandate |
|---|---|---|---|
| L0 Experiencia | Cualquier persona del equipo | Frases, estados, atención | "Necesita que apruebes el plan exacto" |
| L1 Operación | Quien opera el proyecto | Objetos y acciones | Objetivo, dominio, fase, botón de aprobar |
| L2 Inspección | Ingeniería | Evidencia, ids, versiones, digests, estados de resolución | `contractVersion 3`, digest, inputs con hash, presupuesto |
| L3 Arquitectura | Quien construye Cognituum | JSON crudo, grafo literal | `mandate.json` firmado, nodo Gravity |

Reglas: se baja de nivel dentro de la misma ficha (expandir), nunca cambiando de pantalla; el nivel no es una preferencia de perfil sino una profundidad por objeto; L0 nunca muestra un id.

### 15.2 Vocabulario de presentación (propuesta, D-9)

Los términos canónicos aparecen desde L1. En L0 se usan formas humanas, siempre acompañadas del término canónico al pasar el cursor.

| Canónico | L0 propuesto |
|---|---|
| Gravity | Criterio vigente |
| Posture | Regla o criterio |
| Masa | Peso (con desglose) |
| Postulate | Decisión |
| PostulateProposal | Decisión propuesta |
| Mandate | Trabajo encargado |
| Action / Intent | Paso de trabajo |
| Domain | Dominio |
| Gene | Función |
| DomainCandidate | Dominio propuesto |
| Impact | Consecuencias |
| Fulfillment | Cumplimiento |
| Location | Desde dónde decidiste |

---

## 16. Frontera entre UI convencional y espacio (entregable 10)

| Va al espacio (3D) | Va a UI convencional |
|---|---|
| Jerarquía soberana y territorios (Organization, Project, Domain, Gene) | Todo texto largo: definiciones, contratos, expresiones |
| Relaciones estructurales ratificadas y candidatas (con trazo distinto) | Formularios y actos (declarar, confirmar, aprobar) |
| Dónde está el trabajo (marcadores ▌▌▌) | Ciclo de vida, timeline, evidencia |
| Alcance del criterio (halos sobre nodos de spine) | Lista de Postures, desglose de Masa |
| Colisiones situadas (marca entre sujetos) | Prueba de colisión, Assessment de Impact |
| Cambio reciente (pulso breve sobre el nodo afectado) | Detalle del cambio, digests, antes/después |
| Atención (baliza sobre el lugar que necesita decisión) | Bandeja de atención |
| — | Contabilidad, suministro de inteligencia, logs, configuración |

Prueba de pertenencia al espacio: **si la posición relativa no comunica nada, no va al espacio.** Por eso no van al espacio la contabilidad, los Intents ni la línea de tiempo [D V-15].

---

## 17. Contratos de datos que Orrery necesita (entregable 11)

### 17.1 Principios

1. **Cada lectura declara procedencia y disponibilidad.** Ninguna respuesta vacía es ambigua.
2. **Read models estables en la UI, adaptadores por fuente.** La UI importa sólo los tipos de §17.2–§17.6.
3. **Escritura sólo por Nucleus** (directo por IPC o vía Control Plane). Core nunca escribe estado autoritativo ni llama a AITAP para escribir.
4. **Revalidación por apertura** para todo lo que habilita acciones.
5. **Ningún adaptador fabrica identidad**: si la fuente no da id canónico, el nodo no se dibuja como canónico.

### 17.2 Modelo de territorio (navegación)

```ts
type Provenance =
  | 'verified'            // autoridad comprobada (binding, nodo canónico)
  | 'declared_by_mandate' // presente en un contrato firmado, no canónico
  | 'proposed'            // candidato (DomainCandidate, candidato semántico)
  | 'projection'          // proyección reconstruible (GravityGraph)
  | 'simulated';          // sólo prototipo; nunca en producción

type Resolution =
  | 'resolved' | 'changed' | 'stale' | 'missing'
  | 'unauthorized' | 'ambiguous' | 'unsupported' | 'unverifiable';

interface TerritoryRef { source: 'authority' | 'gravity' | 'mandate' | 'gene'; type: TerritoryType; id: string; version?: string }
type TerritoryType = 'TENANT' | 'ORGANIZATION' | 'PROJECT' | 'REPOSITORY' | 'DOMAIN' | 'GENE';

interface TerritoryNode {
  ref: TerritoryRef;
  parent?: TerritoryRef;            // jerarquía soberana; Domain/Gene no se reconstruyen por ParentID
  display: { name: string; summary?: string };
  provenance: Provenance;
  resolution: Resolution;
  evidence?: Record<string, unknown>; // L2
  capturable: boolean;               // admisible como anchor de LocationSnapshot v0.1
}

interface TerritoryRelation {
  kind: 'DOMAIN_GENE' | 'DOMAIN_MANDATE' | 'semantic_candidate';
  from: TerritoryRef; to: TerritoryRef;
  provenance: Provenance;            // ratificada vs candidata, trazos distintos
}

interface TerritoryReadModel {
  scope: { tenant?: TerritoryRef; organization?: TerritoryRef; project?: TerritoryRef; evaluatedAt: string };
  nodes: TerritoryNode[];
  relations: TerritoryRelation[];
  availability: SourceAvailability[];
}

interface SourceAvailability { source: string; status: 'available' | 'unavailable' | 'not_evaluable'; reason?: string; observedAt: string }
```

Notas: `REPOSITORY` queda reservado (Project→Repository 0..N) y sin productor. `OrreryTree` (espejo de LocationSnapshot) se conserva como el tipo de **captura**; el espacio pasa a renderizar `TerritoryReadModel` (D-3).

### 17.3 Read models de lentes y superficies

```ts
interface WorkItem {                  // lente Trabajo + tab + atención
  mandateId: string; type: 'genesis' | 'domain_expansion' | 'standard';
  objective?: string;
  territory?: TerritoryRef;            // dominio del contrato, o Project
  stage: 'reading' | 'proposing' | 'awaiting_confirmation' | 'awaiting_approval'
       | 'awaiting_activation' | 'executing' | 'fulfilled' | 'completed'
       | 'rejected' | 'failed' | 'draft' | 'unknown';
  indicator: { state: string; active: boolean; needsAttention: boolean };
  stateVersion?: number; updatedAt?: string;
}

interface MandateDetail extends WorkItem {
  contract?: { version: number; digest: string; domain: {id: string; name: string};
               action: {actionId: string; intentType: string; artifactRef: string};
               inputs: {ref: string; sha256: string; size: number}[];
               gravity: {nodeId: string; revision: string; sha256: string}[];
               fulfillment: {evaluator: string; version: string};
               intelligence?: {provider: string; model: string; privacy?: string; maxUsd: string; maxTotalTokens: number} };
  candidates?: {domainId: string; name: string; cohesion: number}[];
  pendingAct?: {kind: 'confirm_domain' | 'approve' | 'activate'; digest?: string};
  result?: {artifactRef: string; artifactSha256: string; fulfillment: string};
  consumption?: {tokens?: number; usd?: string; model?: string};
}

interface DomainDefinitionView { domain: TerritoryRef; purpose: string; inScope: string[]; outOfScope: string[];
  concepts: string[]; proposedDecisions: unknown[]; sources: {ref: string; sha256: string}[]; producedBy: string }

interface CriterionView {             // lente Criterio
  at: TerritoryRef;                    // sólo NUCLEUS/ORGANIZATION/PROJECT/MANDATE/SESSION
  declaredHere: PostureView[]; inherited: PostureView[];
  applicableTo?: { intentType: string; postures: PostureView[]; requires?: string };
}
interface PostureView { id: string; text: string; origin: string; appliesTo: string[];
  mass: { value: 1|2|3; origin: boolean; verifiable: boolean; promoted: boolean }; primitive?: string }

interface CollisionView { family: 'territorial' | 'hierarchical' | 'horizontal';
  state: 'confirmed' | 'undecidable'; subjects: string[]; sharedContext: string; proof?: string }

interface AssessmentView { question: string; findings: string[]; undetermined: string[]; coverageComplete: boolean; reevaluateWhen: string[] }

interface DecisionDraft {             // cliente-only hasta adopción
  revision: number; anchors: TerritoryRef[]; capture: 'local_draft' | {locationId: string};
  statement: string; objective?: string; constraints: string[]; openQuestions: string[];
  kind: 'operational_decision' | 'criterion_proposal';
  evaluation: { gravity?: CriterionView; collisions?: CollisionView[]; impact?: AssessmentView;
                readiness: 'ready' | 'ready_with_limits' | 'blocked'; unavailable: SourceAvailability[] };
}

interface AttentionItem { id: string; kind: 'decision' | 'error' | 'binding' | 'collision' | 'supply';
  subject: TerritoryRef | {mandateId: string}; text: string; since: string; action?: string }
```

### 17.4 Adaptadores y fuentes

| Read model | Adaptador | Fuente | Estado |
|---|---|---|---|
| `TerritoryReadModel.scope` | `fromConfirmedContext` | IPC `core:confirmed-context-read` | Fuente existe; adaptador nuevo |
| Domains declarados y candidatos | `fromMandateDetail` | BR-01 | Falta endpoint |
| Domains/Genes canónicos | `fromGeneHead`, `fromStructuralProjection` | BR-04, BR-05 | Falta |
| `WorkItem` | `fromMandateSummary` (sobre `mandateStore`) | `GET /api/v1/mandates` + WS | Existe; mapear etapas |
| `MandateDetail` | `fromMandateDetail` | BR-01 | Falta |
| `DomainDefinitionView` | `fromExecutionResult` | BR-01 | Falta |
| `CriterionView` | `fromGravityRead` | BR-03 | Falta |
| `CollisionView` / `AssessmentView` | `fromDetectors`, `fromImpact` | BR-07 | Falta |
| `AttentionItem` | derivado en cliente | `WorkItem`, contexto, suministro, señales | Parcial |
| Consumo | `fromSupplyReading` | IPC `core:intelligence-supply-read` | Existe |
| `OrreryTree` (captura) | `fromLocationSnapshot` | A1–A3 | Falta (stub actual) |

### 17.5 Solicitudes al backend (no autorizadas por este documento)

| ID | Superficie | Dueño | Tipo | Prioridad para Orrery |
|---|---|---|---|---|
| BR-01 | Detalle de Mandate: estado, candidatos, acto pendiente, contrato (resumen + digest), resultado y definición de dominio | Nucleus / Control Plane (lectura) | Read-only | Alta (VS-1 lo necesita para el 60% de la experiencia) |
| BR-02 | Actos de Mandate desde Core: confirmar/rechazar dominio, iniciar aprobación/activación con hand-off a Authority y recepción de atestación | Nucleus | Comando | Media (VS-2) |
| BR-03 | Criterio legible por nodo de spine y resolución para un tipo de trabajo, en lenguaje de Posture + Masa | Nucleus Gravity | Read-only | Media |
| BR-04 | Domains canónicos y relaciones Domain↔Gene/Mandate por Project | Dueño de Domain/Gene (C1) | Read-only | Depende de C1 |
| BR-05 | Genes: head, revisión vigente, activos, Contributions | Nucleus Gene (G2) | Read-only | Depende de G2 |
| BR-06 | Captura, persistencia y resolución de Location | Location (A1–A3) | Comando + lectura | Media |
| BR-07 | Colisiones y Assessments para un contexto (detectores + Impact) | Nucleus / Impact | Read-only | Baja hasta BR-03 |
| BR-08 | Flujo de señales con secuencia, cursor y replay | Monitor | Stream | Baja |
| BR-09 | Registro de PostulateProposal y adopción de Postulate | Por decidir (ADR ASM §13.3, §13.11) | Comando | Bloqueada por D-4/D-5 |
| BR-10 | Registro de propuesta de Posture (sesión) y firma por nivel | Nucleus Gravity | Comando | Bloqueada (DIS-27) |

### 17.6 Contrato de señal (para Atención y Actividad)

```ts
interface Signal {
  sequence: number;           // monotónico por fuente; permite detectar huecos
  source: 'mandate' | 'monitor' | 'impact' | 'authority' | 'supply';
  kind: string;               // abierto y versionado
  subject: TerritoryRef | { mandateId: string };
  severity: 'info' | 'attention' | 'blocking';
  summary: string;            // L0
  evidenceRefs: string[];     // L2
  at: string;
}
```

Se alinea con el esquema de eventos de Executor (`sequence`, `evidence_refs`) y con el requisito de Monitor de eventos recuperables con cursor [D FOLLOWUP Monitor]. Un hueco de secuencia dispara reconciliación, igual que hoy con Mandates.

---

## 18. Primer vertical slice: VS-1 (entregable 12)

### 18.1 Nombre y promesa

**VS-1 — "Ver un proyecto genesisado, entender qué pasó y saber qué decidir."** Pequeño, con datos reales, y con la forma definitiva de la pantalla principal: lo que se agregue después entra en regiones y contratos que ya existen.

### 18.2 Incluye

1. Barra de contexto (R2) desde `bloom.confirmed-context/v1`, con estado del binding y disponibilidad de inteligencia.
2. Espacio renderizando `TerritoryReadModel`: Tenant › Organization › Project (verificados) + dominios declarados por Mandates y candidatos (con BR-01) con sus sellos.
3. Lente Trabajo: marcadores ▌▌▌ desde `mandateStore`, etapas físicas (§12.2) con el adaptador de eventos (§12.3).
4. Inspector (R4) para Project, Mandate, Domain declarado, Domain propuesto y artefacto (definición del dominio), en L0–L2.
5. Atención (R6) derivada: actos pendientes con el comando exacto, errores, binding no vigente, suministro no disponible.
6. Actividad (R7) con eventos reales (reemplaza `MOCK_FEED`).
7. Compositor "Declarar" (R5): anchors, declaración, propuesta estructurada local, evaluación con cada evaluador en "no disponible: causa", readiness, vista previa de contrato de solo lectura cuando el anchor es un dominio confirmado. Adopción y envío deshabilitados con causa.
8. Correcciones previas: `Position3` (DIS-12), retiro del panel de simulación (D-7), entradas A y B usando contexto confirmado (DIS-11).
9. Composición de regiones según el resultado de D-2.

### 18.3 Excluye

Persistencia de Location; lente Criterio con datos; Genes; colisiones con datos; Constellation; pausa/reanudación; señales de Monitor; ASM; actos de Mandate desde la UI (se ofrecen como comando para copiar).

### 18.4 Dependencias

- BR-01 (lectura de detalle de Mandate). Sin BR-01, VS-1 funciona en modo reducido: territorio soberano + marcadores de Mandate sobre el Project + atención por estado; sin dominios ni definición.
- Decisiones D-1, D-2, D-3 y D-7.

### 18.5 Criterios de aceptación

1. Con un Project genesisado, R2 muestra Organization, Project y binding con hora de verificación; si el binding no está vigente, el espacio no dibuja territorio y dice por qué.
2. El espacio no contiene ningún objeto de `data.ts`; `simulated` es `false` en todo nodo de producción.
3. Cada nodo muestra procedencia; un dominio candidato y uno confirmado son distinguibles sin leer texto.
4. Un Mandate esperando confirmación, aprobación o activación aparece en Atención con el acto, el digest cuando corresponda y el comando exacto.
5. Los eventos `mandate:phase:ingest`, `mandate:build:rejected` y `mandate:build:all_complete` cambian la etapa mostrada sin pasar por "desconocido".
6. El compositor nunca muestra "sin conflictos" cuando un evaluador no está disponible.
7. Cerrar la app descarta borradores de decisión.
8. `tsc --noEmit` del paquete `orrery` y el chequeo de tipos de `webview/app` pasan.
9. Prueba con una persona ajena a Cognituum (§14.4): completa las tareas 1–4 sin explicación previa.

### 18.6 Archivos candidatos (para aprobación posterior; no escritos)

| Archivo | Cambio |
|---|---|
| `installer/conductor/workspace/core/orrery/src/adapters/fromSimulatedData.ts` | Importar `Position3` desde `../layout` |
| `installer/conductor/workspace/core/orrery/src/main.ts` | Retirar panel de simulación; renderizar `TerritoryReadModel`; glifos de lente por anotación |
| `installer/conductor/workspace/core/orrery/src/territory.ts` (nuevo) | Tipos de §17.2 |
| `webview/app/src/lib/orrery/readModels.ts` (nuevo) | Tipos de §17.3 |
| `webview/app/src/lib/orrery/adapters/*.ts` (nuevos) | `fromConfirmedContext`, `fromMandateSummary`, `fromMandateDetail`, `fromSupplyReading` |
| `webview/app/src/lib/stores/regimeStore.ts` | Foco inicial desde contexto confirmado; anchors separados de foco |
| `webview/app/src/lib/stores/mandateStore.ts` | Mapear eventos físicos (§12.3) |
| `webview/app/src/lib/stores/ledgerStore.ts` | Eventos reales en lugar de `MOCK_FEED` |
| `webview/app/src/lib/components/OrreryContainer.svelte` | Regiones flotantes (según D-2) |
| `webview/app/src/lib/components/{ContextBar,Inspector,AttentionTray,DecisionDock}.svelte` (nuevos) | R2, R4, R6, R5 |
| `webview/app/src/routes/+layout.svelte` | Composición según D-2 |
| BR-01: `src/api/routes/mandates.routes.ts` + handler nuevo | `GET /mandates/:id` (sólo lectura) |

Los nombres son propuestas y quedan sujetos a decisión de José.

### 18.7 Después de VS-1

| Slice | Agrega | Requiere |
|---|---|---|
| VS-2 | Actos de Mandate desde Core con hand-off a Authority | BR-02 |
| VS-3 | Lente Criterio con datos; "Ir al punto de cambio" | BR-03 |
| VS-4 | Captura y reapertura de Location; evaluación con ASM | BR-06, ASM I3–I7 |
| VS-5 | Genes y relaciones; incorporación completa de Bloomaut | BR-04, BR-05, D-6 |
| VS-6 | Adopción de Postulate → Mandate | BR-09, D-4, D-5 |
| — | Contraste físico con datos genuinos de Genesis y Bloomaut (gate de Agenda, DIS-21) | Corrida E2E aceptada |

---

## 19. Decisiones reservadas a José

| ID | Pregunta | Opción recomendada |
|---|---|---|
| D-1 | ¿"Orrery" es la experiencia de Workspace Core (Espacio + Lentes + Superficies) y el invariante Location-first rige sólo al Espacio? | Sí |
| D-2 | ¿Se enmienda la exclusividad del régimen espacial para permitir superficies flotantes sobre el canvas al 100%, con modo foco? | Sí (alternativa: overlays modales) |
| D-3 | ¿El espacio renderiza un modelo de territorio de navegación y la `LocationSnapshot` se produce al capturar, reemplazando la regla 1:1 de v0.2 §2.2? | Sí |
| D-4 | ¿Postulate = decisión operativa adoptada que puede fundar un Mandate; "postular una Postura" se nombra en la UI como "proponer criterio"? | Sí |
| D-5 | ¿La formulación del `PostulateProposal` ocurre en Core como proceso soberano (con ASM como evaluador cuando exista), según FOLLOWUP? | Sí |
| D-6 | Para Bloomaut: ¿un Mandate por dominio con el contrato actual, o evolución a contrato multi-dominio? | Un Mandate por dominio para la primera incorporación |
| D-7 | ¿Se retira el panel de simulación del prototipo? | Sí |
| D-8 | ¿Se autoriza preparar BR-01 (lectura de detalle de Mandate) como primer pedido al backend? | Sí |
| D-9 | ¿Se adopta el vocabulario L0 de §15.2? | Revisar término por término |
| D-10 | ¿Se agregan las entradas C (atención) y D (tab de Mandate)? | Sí |
| D-11 | ¿Mandate en el espacio = marcador con ▌▌▌, sin narrar pasos? | Sí |
| D-12 | ¿Orrery reemplaza a Home como pantalla inicial cuando hay Project confirmado? | Sí |
| D-13 | ¿Se habilita "guardar borrador" de decisiones o se mantiene la pérdida al cerrar? | Mantener la pérdida en VS-1 |

---

## 20. Próximos pasos

1. José revisa §4 y responde D-1, D-2, D-3 y D-7 (condicionan la estructura de VS-1).
2. Con esas respuestas, se presenta la lista exacta de archivos de VS-1 (§18.6) para autorización.
3. En paralelo, encargo de diseño de BR-01 al dueño de Nucleus/Control Plane.
4. Cuando la corrida E2E de Genesis quede aceptada, contraste físico de §14.1 contra la instalación real (requiere autorización puntual para leer archivos y campos concretos del estado operativo).

---

## Apéndice A — Corpus leído

**Orrery:** `docs/ANALYSIS/ORRERY/LOCATION/{ORRERY_LOCATION_MATERIAL_CLOSURE_v1_1, Orrery_LocationSnapshot_v0}.md`; `docs/ANALYSIS/ORRERY/UI/*` (8 documentos); Project: `Spec_Implementacion_Integracion_Core_Orrery_v1_0.md`, `Cierre_Implementacion_IntegracionFormal_Core_Orrery_v1_0.md`; `docs/ANALYSIS/GRAVITY/ORBITAL/{Orrery_Research_Brief_Interfaz_Principal_v0_1, Orrery_Research_Resultados_v0_1, Glosario_Contexto_Cognituum_para_Cowork}.md`.
**Workspace Core:** `docs/CONDUCTOR/WORKSPACE/{Bloom_Conductor_Workspace_Core_UI_01, Bloom_Conductor_Core_UI_Contexto_para_Codex}.md`; `docs/DESIGN/# BTIPS Foundational UX-UI Design Doctrine Prompt v0.1.md`.
**Nucleus / Gravity / Genes:** `docs/NUCLEUS/*` (índices); `docs/ANALYSIS/GRAVITY/API/NUCLEUS_API_Contracts_Consolidado_v0_1.md`; `docs/ANALYSIS/GRAVITY/MODELS/Paladin_Client_Object_Model_v0_1.md`; `docs/ANALYSIS/GRAVITY/PALADIN/Paladin_UX_Postura_Gravity_Masa_Spec_v0_1.md`; `docs/ANALYSIS/GRAVITY/COLISIONES/Orbital_Gravity_Deteccion_Tipificacion_Colisiones_Mandates_Posturas_Spec_v0_1.md`; `docs/ANALYSIS/GRAVITY/GRAFO/GravityGraph_DOMAIN_GENE_Contrato_Propuesto_v0_1.md`; `docs/GENES/{COGNITUUM_GENE_CONCEPT_v3_0, GENE_DOCUMENT_LIFECYCLE_REQUIREMENTS_v0_1}.md`; `docs/ORBITAL/GRAVITY/Tablero_Seguimiento_Consolidado_v0_2.md` (v0.50).
**Mandate / Genesis:** `docs/MANDATE/MANDATE_PROGRAM_CANONICAL_SOURCE_v0_1.md`; `docs/MANDATE/BLOOM_Mandate_Genesis_Roadmap_Maestro_v3_3.md` (índice); `docs/GENESIS/BLOOM_Genesis_Intent_Gen_Design_v1_0.md` (índice); `docs/AGENTIC/BTIPS_Mandates_Agenticos_Spec_Unificada.md` (índice).
**ASM / BSIP:** `docs/BSIP/TYPES/ASM_Intent_Spec_v1_0.md`; `docs/ANALYSIS/BSIP/ASM/{ASM_PRE_MANDATE_EXECUTION_ADR_v0_1, ASM_PRE_MANDATE_EXECUTION_ROADMAP_I3_I7_v0_1}.md`; `docs/BSIP/BLOOM_BISP_Documento_Unico_v2_0.md` Parte G.
**Monitor / Impact:** `installer/monitor/README.md`; `installer/impact/README.md`.
**AITAP / Onboarding:** documentos del Project (`AITAP/LLM_LOCAL/*`, `AITAP/CLI/*`, `ANALYSIS/CONDUCTOR/ONBOARDING/Cierre_Implementacion_DisenoP_RetornoGenesis_v1_0.md`).
**Paladin / producto:** `docs/CALL_TO_ACTION/PALADIN_COMMAND_RESPECT_POSITIONING_02.md`; `docs/INTERVIEWS/COGNITUUM_PALADIN_RESEARCH_SNAPSHOT.md`; `docs/STRATEGY/COGNITUUM_RESEARCH_RESULT_STRATEGY_1.md` §6–§9; `docs/ANALYSIS/INTEGRATION_HUMAN_TECHNICAL_REALITY_v0_1.md` (matriz de primitivas).
**Control:** `docs/CONTROL/AGENDA_MAESTRA.md`; `docs/CONTROL/AGENDA_FOLLOWUP.md`; `AGENTS.md`.

## Apéndice B — Evidencia física consultada

| Área | Archivos |
|---|---|
| Workspace Core | `installer/conductor/workspace/main_conductor.js` (`createWorkspaceWindow`); `core/preload_core.js`; `core/ipc/{confirmed-context-handlers,intelligence-supply-handlers}.js`; `onboarding/ipc/onboarding-handlers.js` (`pending_genesis_launch`); `installer/native/config/onboarding/onboarding_steps.json` |
| Webview | `webview/app/src/routes/+layout.svelte`; `lib/api.ts`; `lib/confirmedContext.ts`; `lib/bootstrap/genesisLaunch.ts`; `lib/stores/{mandateStore,regimeStore,ledgerStore}.ts`; `lib/components/{Sidebar,ProjectsPanel,MandateTab,LedgerPanel,OrreryContainer}.svelte` |
| Orrery | `installer/conductor/workspace/core/orrery/src/{main,data,locationTree,display,layout}.ts`, `adapters/*` |
| Control Plane | `src/api/routes/mandates.routes.ts`; `src/api/handlers/create-mandate.handler.ts`; `src/types/{ws-events,gen-state.types}.ts` |
| Nucleus | `internal/gravity/{model,resolver,masa,structural_projection,store}.go`; `internal/gene/{model,store,materializer}.go`; `internal/governance/authority_command.go`; `internal/orchestration/mandatecontract/contract.go`; `internal/orchestration/commands/{mandate_authority_cmd,mandate_build_domains_cmd}.go`; `internal/orchestration/temporal/workflows/{mandate_build_workflow,mandate_execution_workflow}.go`; `internal/orchestration/temporal/worker.go`; `installer/help/nucleus_help.json` |
| Brain | `brain/core/intent/gen_domain.py`; `brain/core/intent_types.py` |
| Impact / Monitor / Executor / AITAP | `installer/impact/internal/contracts/contract.go`; `installer/monitor/README.md`; `installer/execution/contracts/v1/*.schema.json`; `installer/aitap/contracts/v2/inference-accounting-event.schema.json` |
| Historia | commits `126ebb7` (integración Orrery), `6d27b71` (primer vertical local de Mandate), `6710ed8` (onboarding simulado completo), `78bbaad` (HEAD) |
