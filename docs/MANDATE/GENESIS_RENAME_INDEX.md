# Índice de Renombre — Génesis → Nomenclatura Genérica (Fase 2)

**Fecha:** 2026-09-07
**Contexto:** este documento indexa el renombre ejecutado en Fase 2 (ver `docs/MANDATE/GENESIS_COUPLING_AUDIT.md` para la auditoría de Fase 1 que lo justificó). Sirve como puente entre los documentos históricos de este repositorio — que citan nombres de símbolos, eventos y archivos como existían **antes** de este renombre — y el estado real del código **hoy**.

**No reescribe historia.** Los documentos fechados/versionados que documentan auditorías, decisiones o handoffs puntuales (ver §3) se dejaron intactos a propósito: describen lo que era cierto en su fecha. Este índice es la traducción entre "lo que esos documentos dicen" y "cómo se llama ahora".

## 1. Mapeo de símbolos (Go)

| Antes | Ahora |
|---|---|
| `mandate_genesis_build_workflow.go` (archivo) | `mandate_build_workflow.go` |
| `mandate_genesis_build_workflow_test.go` (archivo) | `mandate_build_workflow_test.go` |
| `MandateGenesisBuildWorkflow` (función/workflow) | `MandateBuildWorkflow` |
| `GenesisBuildInput` (struct) | `MandateBuildInput` |
| `GenesisValidateSignal` (struct de señal) | `MandateValidateSignal` |
| `GenesisPhaseOrder` | `BuildPhaseOrder` |
| `GenesisPhasesWithStatusSubobject` | `BuildPhasesWithStatusSubobject` |
| `GenesisTemporalClient` (interfaz, watcher) | `MandateBuildTemporalClient` |
| `StartMandateGenesisBuildWorkflow` | `StartMandateBuildWorkflow` |
| `startGenesisWorkflow` (método privado, watcher) | `startBuildWorkflow` |
| `genesisBuildInput(...)` (helper, watcher) | `mandateBuildInput(...)` |
| `classifyGenesisDuplicate` + `genesisDuplicateActive/Historical/Unclassified` | `classifyBuildDuplicate` + `buildDuplicateActive/Historical/Unclassified` |
| Workflow ID `"mandate_genesis_%s"` / `"mandate_genesis_{id}"` | `"mandate_build_%s"` / `"mandate_build_{id}"` |

## 2. Mapeo de símbolos y eventos (TypeScript / runtime)

| Antes | Ahora |
|---|---|
| `mandate:genesis:validate` (señal Temporal) | `mandate:build:validate` |
| `mandate:genesis:rejected` | `mandate:build:rejected` |
| `mandate:genesis:error` | `mandate:build:error` |
| `mandate:genesis:signed` | `mandate:build:signed` |
| `mandate:genesis:all_complete` | `mandate:build:all_complete` |
| `mandate:genesis:initiated` | `mandate:build:initiated` |
| `mandate:genesis:ingest_progress` / `ingest_complete` / `domains_proposed` | `mandate:build:ingest_progress` / `ingest_complete` / `domains_proposed` |
| `MandateGenesis*Payload` (6 interfaces en `ws-events.ts`) | `MandateBuild*Payload` |
| `src/workflows/genesis-build-workflow.types.ts` (archivo, código huérfano) | `mandate-build-workflow.types.ts` |
| `GENESIS_BUILD_WORKFLOW_TYPE`, `genesisBuildWorkflowId`, `startGenesisBuildWorkflow` | `MANDATE_BUILD_WORKFLOW_TYPE`, `mandateBuildWorkflowId`, `startMandateBuildWorkflow` |

## 3. Qué se preservó (no es parte de este renombre)

- El valor de `MandateType`: `"genesis"` sigue existiendo como uno de los tres valores (`"genesis" | "domain_expansion" | "standard"`). No es un símbolo técnico acoplado — es el nombre de negocio de ese tipo de Mandate.
- `BaseGenesisID` / `baseGenesisId`: decisión de diseño confirmada (D-7) — un `domain_expansion` solo puede anclarse a un Mandate `genesis`, nunca a otro `domain_expansion`. No es naming genérico pendiente.
- El subcomando CLI `nucleus mandate genesis` (y `mandate genesis domains confirm/list/reject`).
- `GenesisCreateBody` / `isGenesisCreate` (validación del schema HTTP).
- Archivos que siguen llamándose `*genesis*` porque su contenido es específico del tipo de Mandate `genesis` (no de la infraestructura de build compartida): `mandate_genesis_activities.go`, `mandate_genesis_sign_activity.go`, `mandate_genesis_domains_cmd.go`, `genesisLaunch.ts`.
- Todo el trabajo original de investigación/decisión que documentan los archivos de la lista de abajo.

## 4. Documentos actualizados en esta pasada

Se actualizaron las referencias hardcodeadas a los símbolos de la tabla 1-2 en los siguientes documentos vivos (specs, arquitectura, agenda, contexto de sesión activa):

- `docs/MANDATE/BLOOM_Mandate_Genesis_Backend_Design_v0_1_0.md`
- `docs/MANDATE/BLOOM_Mandate_Genesis_Roadmap_Maestro_v3_3.md`
- `docs/MANDATE/Mandate_Genesis_Completion_Plan_v1.md`
- `docs/MANDATE/Mandate_Genesis_Truth_Matrix_and_Execution_Roadmap_v1.md`
- `docs/MANDATE/GENESIS/Mandate_Genesis_Synapse_Simulator_Etapa_A_Design_v1.md`
- `docs/MANDATE/bloom-mandate-arquitectura-genesis-conductor.md`
- `docs/ANAYSIS/GRAVITY/SESSION/Gravity_SESSION_MandateGenesis_Handoff_Investigacion_v0_1.md`
- `docs/ANAYSIS/GRAVITY/SESSION/Investigacion_Gravity_SessionNode_MandateGenesis_v0_1.md`
- `docs/GOVERNANCE/RESEARCH/AITAP_ROUTING_MANDATE_GENESIS_CLIS_2026-08-20.md`
- `docs/SESSIONS/2026-08-21_Cowork_Cierre_Mandate_Genesis.md`
- `docs/ANAYSIS/GRAVITY/API/NUCLEUS_API_Contracts_Auditoria_vs_Truth_v0_1.md`
- `docs/ANAYSIS/GRAVITY/GRAFO/Orbital_Gravity_Persistencia_Grafo_Implementation_Spec_v0_1.md`
- `docs/BSIP/BLOOM_BISP_Documento_Unico_v2_0.md`
- `docs/CONDUCTOR/WORKSPACE/Bloom_Conductor_Core_UI_Contexto_para_Codex.md`
- `docs/CONTROL/AGENDA_MAESTRA.md`
- `docs/GOVERNANCE/SWITCH-ORG/ORGANIZATION_SWITCH_ARCHITECTURE.md`
- `docs/GOVERNANCE/SWITCH-ORG/ORGANIZATION_SWITCH_IMPLEMENTATION_STATUS.md`

Se dejaron **sin tocar**, a propósito, por ser registros forenses fechados de auditoría/investigación/handoff (documentan qué decía el código en su fecha, no el estado actual):

- `docs/MANDATE/GENESIS_COUPLING_AUDIT.md` (la auditoría de Fase 1 que originó este renombre)
- `docs/MANDATE/Mandate_Event_Mechanism_Auditoria_v1.md`
- `docs/MANDATE/Core_Mandate_No_Aparece_Auditoria_v1.md`
- `docs/MANDATE/BLOOM_Estado_Consolidado_Takeaway_v1.md`
- `docs/GOVERNANCE/RESEARCH/COGNITUUM_ARCHITECTURE_FINDINGS_2026-08-17.md`
- `docs/EXECUTOR/EXECUTOR_GENESIS_DEV_INTEGRATION_HANDOFF_2026-08-21.md`

Tres documentos con "Mandate" + "Genesis" en el nombre no citaban ningún símbolo técnico hardcodeado (solo usan "Genesis" como concepto de negocio) y no requirieron cambios: `docs/AITAP/AITAP_MANDATE_GENESIS_COMPOSITION_CHANNEL_DECISION_2026-08-21.md`, `docs/CONDUCTOR/ONBOARDING/Fase-A-Relevamiento-Mandate-Genesis-v1.md`, `docs/CONDUCTOR/WORKSPACE/BLOOM_CORE_GENESIS_MANDATE_PRELUDIO_v0_1.md`.

## 5. Referencias

- Auditoría de Fase 1: `docs/MANDATE/GENESIS_COUPLING_AUDIT.md`
- Ejecución de Fase 2 (código): commit pendiente en el working tree del repositorio al momento de escribir este índice.
