# Auditoría: `harness` → `synapse-simulator`

Generado con `ripgrep` sobre 7 documentos + 1 árbol de proyecto (`btips_tree.txt`).
Total de ocurrencias de la palabra: **585** en 6 de 7 archivos analizados
(`SYNAPSE_BRIDGE_ELECTRON_IMPLEMENTATION.md` no tiene ninguna).

---

## 1. Rutas físicas reales a renombrar (extraídas de `btips_tree.txt`)

Estas son archivos/carpetas que **existen en el repo** y deben renombrarse (no solo editar contenido):

| # | Ruta actual | Tipo | Ruta propuesta |
|---|---|---|---|
| 1 | `installer/cortex/extension/protocols/harness.schema.json` | archivo | `.../synapse-simulator.schema.json` |
| 2 | `installer/nucleus/internal/supervisor/onboarding_harness.go` | archivo Go | `onboarding_synapse_simulator.go` |
| 3 | `brain/core/profile/web/harness_generator.py` | archivo Python | `synapse_simulator_generator.py` |
| 4 | `brain/core/profile/web/templates/harness/` | **carpeta** | `templates/synapse-simulator/` |
| 5 | `.../templates/harness/harness.js` | archivo | `synapse-simulator/synapse-simulator.js` |
| 6 | `.../templates/harness/harnessProtocol.js` | archivo | `synapse-simulator/synapseSimulatorProtocol.js` |
| 7 | `docs/ALFRED/AGENTIC_HARNESS_OVERVIEW.md` | doc | `AGENTIC_SYNAPSE_SIMULATOR_OVERVIEW.md` |
| 8 | `docs/HARNESS/` | **carpeta** | `docs/SYNAPSE_SIMULATOR/` |
| 9 | `docs/HARNESS/ARCHITECTURE_HarnessProtocol.md` | doc | `ARCHITECTURE_SynapseSimulatorProtocol.md` |
| 10 | `docs/HARNESS/BACKUP/BLOOM_HARNESS_IONPUMP_INTEGRATION_MASTER.md` | doc | `BLOOM_SYNAPSE_SIMULATOR_IONPUMP_INTEGRATION_MASTER.md` |
| 11 | `docs/HARNESS/BACKUP/HARNESS_Manual_Onboarding_Debug.md` | doc | `SYNAPSE_SIMULATOR_Manual_Onboarding_Debug.md` |
| 12 | `docs/HARNESS/BACKUP/IMPL_PROMPT_BRAIN_IonPump_Harness_v2.md` | doc | `..._IonPump_SynapseSimulator_v2.md` |
| 13 | `docs/HARNESS/BACKUP/IMPL_PROMPT_CORTEX_SENTINEL_Harness_v2.md` | doc | `..._SENTINEL_SynapseSimulator_v2.md` |
| 14 | `docs/HARNESS/BACKUP/INVESTIGACION_Harness_Protocol_Autodiscovery.md` | doc | `INVESTIGACION_SynapseSimulator_Protocol_Autodiscovery.md` |
| 15 | `docs/HARNESS/HARNESS_Cortex_Manual_Uso_y_Debug_Synapse.md` | doc | `SYNAPSE_SIMULATOR_Cortex_Manual_Uso_y_Debug_Synapse.md` ⚠️ ver nota |
| 16 | `docs/HARNESS/HARNESS_SOURCE_OF_TRUTH_1_6.md` | doc | `SYNAPSE_SIMULATOR_SOURCE_OF_TRUTH_1_6.md` |
| 17 | `docs/HARNESS/HARNESS_Workspace_Manual.md` | doc | `SYNAPSE_SIMULATOR_Workspace_Manual.md` |
| 18 | `docs/IONPUMP/BLOOM_HARNESS_IONPUMP_SOT_v3.md` | doc | `BLOOM_SYNAPSE_SIMULATOR_IONPUMP_SOT_v3.md` |
| 19 | `docs/Onboarding_Harness.txt` | doc | `Onboarding_SynapseSimulator.txt` |
| 20 | `docs/PROMPTS/HARNESS-IONPUMP/` | **carpeta** | `SYNAPSE_SIMULATOR-IONPUMP/` |
| 21 | `docs/PROMPTS/HARNESS-IONPUMP/IMPL_PROMPT_BRAIN_IonPump_Harness.md` | doc | `..._IonPump_SynapseSimulator.md` |
| 22 | `docs/PROMPTS/HARNESS-IONPUMP/IMPL_PROMPT_CORTEX_SENTINEL_Harness.md` | doc | `..._SENTINEL_SynapseSimulator.md` |

⚠️ Nota #15: el nombre lleva "...Uso_y_Debug_Synapse" — el "Synapse" ahí ya se refiere al protocolo Synapse (no confundir con la nueva convención "synapse-simulator"). Revisar si el título completo debería ser `SYNAPSE_SIMULATOR_Cortex_Manual_Uso_y_Debug.md` sin duplicar "Synapse".

## 2. Identificadores de código (constantes, funciones, variables)

| Identificador | Contexto | Propuesto |
|---|---|---|
| `HARNESS_CONFIG` | constante de protocolo | `SYNAPSE_SIMULATOR_CONFIG` |
| `HARNESS_CONFIG_READY` | mensaje de evento | `SYNAPSE_SIMULATOR_CONFIG_READY` |
| `HARNESS_HELLO` | mensaje handshake | `SYNAPSE_SIMULATOR_HELLO` |
| `HARNESS_LOG` | mensaje de log | `SYNAPSE_SIMULATOR_LOG` |
| `HARNESS_PROTOCOL_MANIFEST` | constante de manifiesto | `SYNAPSE_SIMULATOR_PROTOCOL_MANIFEST` |
| `HARNESS_REPLAY` | mensaje | `SYNAPSE_SIMULATOR_REPLAY` |
| `generate_harness_page` | función Python | `generate_synapse_simulator_page` |
| `copyHarnessPage` | función JS | `copySynapseSimulatorPage` |
| `openHarnessTab` | función JS | `openSynapseSimulatorTab` |
| `pushHarnessLog` | función JS | `pushSynapseSimulatorLog` |
| `writeHarnessConfig` | función JS | `writeSynapseSimulatorConfig` |
| `loadHarnessConfig` | función JS | `loadSynapseSimulatorConfig` |
| `harnessLogBuffer` | variable | `synapseSimulatorLogBuffer` |
| `harnessMsg` | variable | `synapseSimulatorMsg` |
| `harnessPage` | variable | `synapseSimulatorPage` |
| `harness_ack` | variable/mensaje | `synapse_simulator_ack` |
| `harness_dir` | variable Python | `synapse_simulator_dir` |
| `harness_open_landing` | variable/evento | `synapse_simulator_open_landing` |
| `harness_simulate_handshake` | función/evento | `synapse_simulator_simulate_handshake` ⚠️ revisar redundancia "simulator...simulate" |
| `harness_to_background` | variable/canal | `synapse_simulator_to_background` |

## 3. Nombre propio del componente (prosa / diagramas)

| Uso | Propuesto |
|---|---|
| "Harness" (nombre del activo Cortex, ej. "Discovery/Landing/Harness") | "Synapse Simulator" |
| "Harness" en diagramas Mermaid / ASCII | "Synapse Simulator" |
| "el Harness" (artículo + nombre en prosa castellana) | "el Synapse Simulator" |
| "Harnesses" (plural, si aparece) | "Synapse Simulators" |

## 4. Ambigüedades — RESUELTAS

**`extension/harness/`** → confirmado: carpeta de **build/output generado**, no versionada. **Se excluye del rename.** Claude Code debe tratarla como artefacto de build (se regenera sola al buildear con el código fuente ya renombrado) y no tocarla manualmente.

**Duplicados `HARNESS_SOURCE_OF_TRUTH*.md`** → confirmado: **solo `HARNESS_SOURCE_OF_TRUTH_1_6.md` es la versión vigente.** El resto (`HARNESS_SOURCE_OF_TRUTH.md`, `_1_2.md`, `_FIX.md`) son backups históricos.
**Decisión operativa:** no se renombran ni se tocan — quedan **fuera de scope** de esta auditoría. Quedan listados para que el usuario decida por separado si los archiva o elimina.

## 5. Archivos con múltiples versiones — fuera de scope (no tocar)

- `HARNESS_SOURCE_OF_TRUTH.md` — backup, no tocar
- `HARNESS_SOURCE_OF_TRUTH_1_2.md` — backup, no tocar
- `HARNESS_SOURCE_OF_TRUTH_1_6.md` — **vigente, SÍ se renombra** → `SYNAPSE_SIMULATOR_SOURCE_OF_TRUTH_1_6.md`
- `HARNESS_SOURCE_OF_TRUTH_FIX.md` — backup, no tocar

Los pares `IMPL_PROMPT_..._Harness.md` / `_v2.md` no fueron confirmados como backup/vigente — **quedan pendientes de tu confirmación**. Por precaución, Claude Code los va a renombrar a **ambos** en la Fase 3 (son prompts de implementación, no "source of truth", así que el riesgo de tener una versión vieja mal nombrada es menor que dejarla con `harness` suelto). Avisame si preferís excluir alguno.
