# Plan de migración: `harness` → `synapse-simulator`

Estado: **Fase 1 terminada. No iniciar Fase 2 sin confirmación explícita.**

## Inventario real

El relevamiento sin ignores encontró 2.617 coincidencias en 118 archivos.
Tras las exclusiones detalladas abajo, el alcance candidato es de **1.778
coincidencias en 83 archivos**, más **20 renames de archivos** y **3 de
directorios**. Los renames no están incluidos en el conteo de coincidencias.

Reglas obligatorias: `HARNESS_*` → `SYNAPSE_SIMULATOR_*`; `Harness` de
identificador → `SynapseSimulator`; `Harness` en prosa → `Synapse Simulator`;
`harness_*` → `synapse_simulator_*`; camelCase con `Harness` →
`SynapseSimulator`/`synapseSimulator`; kebab/path `harness` →
`synapse-simulator`. Esto incluye CSS y flags CLI.

## Renames de directorio

| Actual | Nuevo |
|---|---|
| `brain/core/profile/web/templates/harness/` | `brain/core/profile/web/templates/synapse-simulator/` |
| `docs/HARNESS/` | `docs/SYNAPSE_SIMULATOR/` |
| `docs/PROMPTS/HARNESS-IONPUMP/` | `docs/PROMPTS/SYNAPSE_SIMULATOR-IONPUMP/` |

## Renames de archivo

| Actual | Nuevo |
|---|---|
| `installer/cortex/extension/protocols/harness.schema.json` | `installer/cortex/extension/protocols/synapse-simulator.schema.json` |
| `installer/nucleus/internal/supervisor/onboarding_harness.go` | `installer/nucleus/internal/supervisor/onboarding_synapse_simulator.go` |
| `brain/core/profile/web/harness_generator.py` | `brain/core/profile/web/synapse_simulator_generator.py` |
| `brain/core/profile/web/templates/harness/harness.js` | `brain/core/profile/web/templates/synapse-simulator/synapse-simulator.js` |
| `brain/core/profile/web/templates/harness/harnessProtocol.js` | `brain/core/profile/web/templates/synapse-simulator/synapseSimulatorProtocol.js` |
| `docs/Onboarding_Harness.txt` | `docs/Onboarding_SynapseSimulator.txt` |
| `docs/HARNESS/ARCHITECTURE_HarnessProtocol.md` | `docs/SYNAPSE_SIMULATOR/ARCHITECTURE_SynapseSimulatorProtocol.md` |
| `docs/HARNESS/HARNESS_Cortex_Manual_Uso_y_Debug_Synapse.md` | `docs/SYNAPSE_SIMULATOR/SYNAPSE_SIMULATOR_Cortex_Manual_Uso_y_Debug_Synapse.md` |
| `docs/HARNESS/HARNESS_SOURCE_OF_TRUTH_1_6.md` | `docs/SYNAPSE_SIMULATOR/SYNAPSE_SIMULATOR_SOURCE_OF_TRUTH_1_6.md` |
| `docs/HARNESS/HARNESS_Workspace_Manual.md` | `docs/SYNAPSE_SIMULATOR/SYNAPSE_SIMULATOR_Workspace_Manual.md` |
| `docs/HARNESS/BACKUP/BLOOM_HARNESS_IONPUMP_INTEGRATION_MASTER.md` | `docs/SYNAPSE_SIMULATOR/BACKUP/BLOOM_SYNAPSE_SIMULATOR_IONPUMP_INTEGRATION_MASTER.md` |
| `docs/HARNESS/BACKUP/HARNESS_Manual_Onboarding_Debug.md` | `docs/SYNAPSE_SIMULATOR/BACKUP/SYNAPSE_SIMULATOR_Manual_Onboarding_Debug.md` |
| `docs/HARNESS/BACKUP/IMPL_PROMPT_BRAIN_IonPump_Harness_v2.md` | `docs/SYNAPSE_SIMULATOR/BACKUP/IMPL_PROMPT_BRAIN_IonPump_SynapseSimulator_v2.md` |
| `docs/HARNESS/BACKUP/IMPL_PROMPT_CORTEX_SENTINEL_Harness_v2.md` | `docs/SYNAPSE_SIMULATOR/BACKUP/IMPL_PROMPT_CORTEX_SENTINEL_SynapseSimulator_v2.md` |
| `docs/HARNESS/BACKUP/INVESTIGACION_Harness_Protocol_Autodiscovery.md` | `docs/SYNAPSE_SIMULATOR/BACKUP/INVESTIGACION_SynapseSimulator_Protocol_Autodiscovery.md` |
| `docs/IONPUMP/BLOOM_HARNESS_IONPUMP_SOT_v3.md` | `docs/IONPUMP/BLOOM_SYNAPSE_SIMULATOR_IONPUMP_SOT_v3.md` |
| `docs/PROMPTS/HARNESS-IONPUMP/IMPL_PROMPT_BRAIN_IonPump_Harness.md` | `docs/PROMPTS/SYNAPSE_SIMULATOR-IONPUMP/IMPL_PROMPT_BRAIN_IonPump_SynapseSimulator.md` |
| `docs/PROMPTS/HARNESS-IONPUMP/IMPL_PROMPT_CORTEX_SENTINEL_Harness.md` | `docs/PROMPTS/SYNAPSE_SIMULATOR-IONPUMP/IMPL_PROMPT_CORTEX_SENTINEL_SynapseSimulator.md` |
| `docs/PROMPTS/HARNESS-IONPUMP/IMPL_PROMPT_METAMORPH_IonRecipes.md` | `docs/PROMPTS/SYNAPSE_SIMULATOR-IONPUMP/IMPL_PROMPT_METAMORPH_IonRecipes.md` |
| `docs/HARNESS/BACKUP/IMPL_PROMPT_METAMORPH_IonRecipes.md` | `docs/SYNAPSE_SIMULATOR/BACKUP/IMPL_PROMPT_METAMORPH_IonRecipes.md` |

## Identificadores y referencias por archivo

| Archivo/grupo | Inventario |
|---|---|
| `brain/commands/profile/profiles.py`; `profile_create.py`; `profile_launcher.py`; `web/companion_generator.py`; `web/discovery_generator.py` | `harness`, `Harness`, `generate_harness_page`, import `brain.core.profile.web.harness_generator`, `/harness/index.html`, `discovery/landing/harness`, `harnessProtocol.js` |
| `brain/core/profile/web/harness_generator.py` | `generate_harness_page`, `harness_dir`, `templates/harness/`, `extensionDir/harness/`, `harness.js`, `harnessProtocol.js`, `harness.synapse.config.js`, `Harness` |
| `brain/core/profile/web/templates/{discovery,harness,landing}/**` | `HARNESS_CONFIG`, `HARNESS_CONFIG_READY`, `HARNESS_GET_WATCHED_GOOGLE_TAB`, `HARNESS_HELLO`, `HARNESS_LOG`, `HARNESS_PROTOCOL_MANIFEST`, `HARNESS_REPLAY`, `_harnessLogLevel`, `_sendHarnessHello`, `harnessConfig`, `msg.harness`, `harness_open_landing`, `harness_simulate_handshake`, `harness_to_background`, `harness-root`, paths y prosa/UI |
| `brain/build_deploy/brain.spec` | import y paths de `harness_generator`, `templates.harness`, `harness.js`, `harnessProtocol.js` |
| `installer/conductor/workspace/**` (11 archivos) | `HARNESS_WS_STATE`, `_harness`, `initHarnessMessageBridge`, `Harness`, `harness`, `harness-live-dot`, `panel-harness`, `tab-harness`, `Harness-debug`, `Cortex/harness`, `--enable-harness-onboarding` |
| `installer/cortex/extension/background.js` | `_skipHarnessLog`, `HARNESS_CONFIG`, `HARNESS_GET_WATCHED_GOOGLE_TAB`, `HARNESS_HELLO`, `HARNESS_LOG`, `HARNESS_LOG_MAX`, `HARNESS_OPEN_LANDING`, `HARNESS_REPLAY`, `HARNESS_SIMULATE_HANDSHAKE`, `HARNESS_SOURCE_OF_TRUTH`, `harness_to_background`, `harnessConfig`, `harnessFile`, `harnessLogBuffer`, `harnessMsg`, `harnessUrl`, `loadHarnessConfig`, `openHarnessTab`, `pushHarnessLog`, `.harness`, `config.harness`, paths/schema |
| `background-companion.js`; `content.js`; `manifest.json`; `protocols/{discovery,harness,landing}.schema.json` | `HARNESS_PROTOCOL_MANIFEST`, `HARNESS_CONFIG`, `HARNESS_GET_WATCHED_GOOGLE_TAB`, `HARNESS_OPEN_LANDING`, `harness_get_watched_google_tab`, `harness_simulate_handshake`, `harness_to_background`, todos los paths `harness/` y prosa `Harness` |
| `installer/nucleus/internal/supervisor/{dev_start,health,logs,onboarding_harness,service}.go` | `enableHarnessOnboarding`, `bootHarness*`, `checkHarness`, `registerHarnessTelemetry`, `writeHarnessConfig`, `harnessResult`, `HarnessMode*`, `HarnessResult`, `resolveHarnessMode`, `governance/harness`, `harness.log`, `harness/index.html` |
| `installer/sentinel/**`; `installer/bootstrap/server-bootstrap.js`; `src/api/routes/internal.routes.ts`; `webview/**/DebugSidebar.svelte` | `harnessData`, `harnessPage`, `writeHarnessConfig`, `self.HARNESS_CONFIG`, `governance/harness`, `harness/background.js`, `Harness` |

## Documentación, árboles y trazabilidad incluidos

Se migran todas las ocurrencias del componente en `docs/**`, excepto el
documento de Agentic Harness excluido abajo. Incluye específicamente:

- `docs/{BTIPS,CONDUCTOR,CONTROL_PLANE,CORTEX,GOVERNANCE,HARNESS,IONPUMP,LANDING,MANDATE,PROMPTS,SYNAPSE}/**`
- `docs/BTIP_resumen_ecosistema_1.0.md`, `docs/BTIPS_Bloom_Technical_Intent_Package_v6_0.md`, `docs/COGNITTUUM_MANIFEST_v0_1.md`
- `installer/conductor/setup/tree/library_tree.txt` y `tree/{brain_tree,btips_tree,cortex_tree,docs_tree,nucleus_tree}.txt`

Los dos archivos físicos `BTIPS_Bloom_Technical_Intent_Package_v6_0.md`
(`docs/` y `docs/BTIPS/`) se cambian juntos, para no desalinearlos.

El desglose íntegro con ruta, línea y contenido de cada una de las 1.778
coincidencias está en `HARNESS_MATCHES_RAW.txt`. Fue generado mediante
`rg -n -i` sobre los 83 archivos exactos de este alcance.

`tasks/TASKS.txt` también contiene coincidencias, pero ya estaba modificado
en el worktree durante el inventario. Se deja fuera de la ejecución automática
hasta que confirmes si querés incorporar allí la migración sin pisar ese cambio.

## Exclusiones

- `agentic-harness/` y `installer/alfred/` completos: decisión confirmada,
  concepto distinto.
- `docs/ALFRED/AGENTIC_HARNESS_OVERVIEW.md`, `AGENTS.md` e
  `installer/aitap/AGENTS.md`: documentan el *agentic harness* excluido.
- `docs/AITAP/AITAP_Decision_Arquitectonica_Gateway_vs_Ejecucion.md`: su uso
  es el sentido genérico de *execution harness*, no el componente Cortex/Workspace.
- `tasks/local/harness-to-synapse-simulator/`: evidencia e instrucciones de
  control; se preserva para trazabilidad.
- `nohup.out`, `dist/**`, `**/build/**`, `**/node_modules/**` e
  `installer/native/bin/**/_internal/**`: logs, bundles o output regenerable.
- Backups `HARNESS_SOURCE_OF_TRUTH.md`, `_1_2.md`, `_FIX.md`, si aparecieran;
  no existen actualmente. No se reescribe historial Git.

## Hallazgos adicionales y casos resueltos

- El cross-check añadió el subsistema Conductor y `HARNESS_WS_STATE`.
- Nuevos tokens: `HARNESS_LOG_MAX`, `HARNESS_OPEN_LANDING`,
  `HARNESS_SIMULATE_HANDSHAKE`, `harnessFile`, `harnessUrl`, `bootHarness`,
  `harnessResult`, `harnessData` y `harnessPage`.
- `HARNESS_SOURCE_OF_TRUTH` en `background.js` se migra como UPPER_SNAKE_CASE,
  sin crear backups faltantes.
- `harnessDir` aparece sólo como variable Go local en el snippet del prompt
  Cortex/Sentinel (líneas 382–387); es un identificador genuino y se migrará
  a `synapseSimulatorDir`, no al Python `synapse_simulator_dir`.
- `HARNESS_PROTOCOL` no aparece como identificador autónomo: es únicamente el
  prefijo de `HARNESS_PROTOCOL_MANIFEST`. Por lo tanto sólo se migrará el
  identificador real completo a `SYNAPSE_SIMULATOR_PROTOCOL_MANIFEST`.
- `harness_simulate_handshake` → `synapse_simulator_simulate_handshake`.
- `workspace-synapse-handlers.js` conserva su nombre: el `synapse` existente
  nombra el protocolo, no el componente.
- **Decisión confirmada por Jose (2026-08-15):** el `Synapse` final de
  `HARNESS_Cortex_Manual_Uso_y_Debug_Synapse.md` refiere al protocolo y se
  conserva en el destino `SYNAPSE_SIMULATOR_Cortex_Manual_Uso_y_Debug_Synapse.md`.
- Los dos `IMPL_PROMPT_METAMORPH_IonRecipes.md` son duplicados exactos:
  SHA-256 `287B740551F70F293BF6F3AEE14D6512926194BAA906F6D5620FC04C4EF6F3DB`.
  Se renombran juntos, preservando las dos ubicaciones existentes.

## Checkpoint

No se modificó ni renombró ningún archivo del producto. Con tu aprobación,
la Fase 2 creará la rama requerida, editará primero contenido con diffs
resumidos y sólo después hará los `git mv`.
