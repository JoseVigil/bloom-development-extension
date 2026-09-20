# synapse-runner

Suite de testing E2E UI-driven para el onboarding de Bloom, y sistema de
diagnóstico/detección temprana de fallas para todo el pipeline
Electron/Conductor + Chromium/Discovery + Side Panel/Companion + CLI `brain`.

Implementa el dossier
[`docs/SYNAPSE/SYNAPSE-RUNNER/Synapse_Runner_E2E_Architecture_Dossier.md`](../docs/SYNAPSE/SYNAPSE-RUNNER/Synapse_Runner_E2E_Architecture_Dossier.md),
que es la fuente de verdad de esta suite. Este README documenta qué de ese
dossier quedó resuelto durante la implementación, y qué queda
deliberadamente abierto.

**Independiente del código de producción que audita** — vive en la raíz del
repo (`synapse-runner/`), no dentro de `installer/` ni de ninguna otra
carpeta existente.

---

## Por qué existe

Objetivo (Sección 1 del dossier): validar si el onboarding puede
automatizarse **exclusivamente desde las capas de UI** (sin inyectar eventos
sintéticos por protocolo), usando la captura de eventos/IPCs como capa de
observabilidad — y, además, como **sistema de diagnóstico y detección
temprana de fallas** en todo el pipeline (Sección 6).

La arquitectura de observabilidad (`src/diagnostics/`) no es un agregado
posterior: es lo primero que se construyó, y todo paso de la suite corre
envuelto en ella (`SynapseRunner.runStep()`), tenga o no aserciones de
negocio.

---

## Arquitectura

```
src/
  config/          bloom-paths.ts (resolución de paths BloomNucleus, ver
                   más abajo), env.ts, selectors.ts
  diagnostics/      Capas 1-4 + Correlator + Reporter (Sección 6 del dossier)
  preflight/        extension-parity-check.ts (resuelve el punto 7),
                     environment-check.ts (falla rápido si el entorno no
                     está levantado)
  surfaces/         Las 4 superficies de la Sección 4:
                       electron-conductor.ts   — _electron.launch()
                       discovery-chromium.ts   — chromium.connectOverCDP()
                       companion-panel.ts      — Target CDP del Side Panel
                       submit-cli.ts           — CLI `brain` (contingencia)
  runner/           SynapseRunner — orquestador, envuelve cada paso en una
                     StepDiagnosticSession
tests/
  fixtures/         fixture de Playwright que engancha SynapseRunner
  e2e/              onboarding-flow.spec.ts — Matriz de Flujo (Sección 3),
                     pasos 01-11
scripts/
  preflight-check.ts   `npm run preflight` — chequeos de entorno standalone
```

### Sistema de diagnóstico (Sección 6)

4 listeners independientes, uno por capa, todos publicando al mismo
`DiagnosticBus`:

| Capa | Fuente | Archivo |
|---|---|---|
| 1 — Companion | Port directo (`chrome.runtime.connect({name:'companion-link'})`) — `background-companion.js` no publica al bridge centralizado | `layer1-companion-port.ts` |
| 2 — Inyección DOM en Gemini | Reinterpreta eventos de Capa 1 + watchdog propio (`RUNNER_WATCHDOG_MS`) | `layer2-dom-watchdog.ts` |
| 3 — Debug Panel/EventBus | WebSocket `ws://localhost:4124` directo, sin scraping del HTML | `layer3-eventbus-ws.ts` |
| 4 — CLI de contingencia | `spawn('brain', ['intent','submit',...])`, clasifica stderr | `layer4-cli-contingency.ts` |

`correlator.ts` arma, por cada paso (`SynapseRunner.runStep()`), un
**bundle de diagnóstico único** cruzando las 4 capas por `commandId` /
`mandateId` / `intent_id` — nunca reporta "step failed" genérico; siempre
apunta a la capa específica, con el trazo crudo adjunto. `reporter.ts`
persiste cada bundle a `diagnostics-output/` a medida que se produce (no al
final), para no perder visibilidad si el propio proceso de Playwright
crashea a mitad de corrida.

---

## Setup

```bash
cd synapse-runner
npm install
npx playwright install chromium   # si no está ya instalado
cp .env.example .env              # ajustar puertos/paths si hace falta
npm run preflight                 # chequeos de entorno standalone
npm test                          # preflight + suite completa
```

Requisitos para que la suite corra de punta a punta:
- BloomNucleus corrió al menos una vez en esta máquina en modo desarrollo
  (para que exista `<base_dir>/config/profiles.json` con un perfil maestro
  — ver "Resolución del punto 7" más abajo).
- `brain synapse host` corriendo (Capa 4 / paso 06-contingencia depende del
  socket TCP `127.0.0.1:5678`).
- El debug panel / EventBus levantado en `ws://localhost:4124` (Capa 3).
- Chromium de Nucleus/Sentinel levantado con `--remote-debugging-port`
  accesible (ver `SYNAPSE_RUNNER_CDP_ENDPOINT`, placeholder actual:
  `http://localhost:9222` — **no confirmado**, ver Puntos abiertos).

---

## Resolución del punto bloqueante (Sección 7, punto 7)

> *"Confirmar si `brain/core/profile/web/templates/{companion,discovery,synapse-simulator}/`
> y `installer/cortex/extension/` se sincronizan por un paso de build
> automático o manual."*

**Resuelto por lectura de código** (no por build script tradicional — no
hay ninguno; `build-all.py`/`package.json` no contienen lógica de sync de
templates). Dos mecanismos DISTINTOS, con dos "fuentes de verdad" DISTINTAS:

1. **`templates/{discovery,companion,synapse-simulator,landing}/` →
   siempre en sync, automáticamente, con el runtime.** No es un build:
   es una copia Python **verbatim** (`shutil.copy2`, sin transformación)
   que corre en `brain/core/profile/profile_create.py::_generate_profile_pages()`
   **cada vez que se crea un perfil**, invocando a
   `brain/core/profile/web/{companion,discovery,synapse_simulator,landing}_generator.py`.
   Confirmado leyendo esos 4 generadores — todos copian la misma lista
   fija de archivos estáticos, sin modificarlos.

2. **`installer/cortex/extension/{background.js, background-companion.js,
   manifest.json, content.js, protocols/*.json}` → llegan al perfil por un
   camino DISTINTO y potencialmente desactualizado.** `build-all.py::build_cortex()`
   empaqueta ese directorio en un `.blx` (`installer/native/bin/cortex/`)
   para distribución. En una instalación de desarrollo, el `bin/extension`
   base vive en `<BloomNucleus base_dir>/bin/extension` (resuelto por
   `brain/shared/paths.py::Paths`, replicado en `src/config/bloom-paths.ts`),
   y `profile_create.py::_copy_extension_to_profile()` lo clona
   (`shutil.copytree`) al perfil maestro. **Este segundo camino puede estar
   desincronizado del repo actual** si el BloomNucleus instalado en la
   máquina no fue reconstruido/reinstalado desde el último cambio en
   `installer/cortex/extension/`.

**Consecuencia práctica para Playwright:** el directorio que Chrome carga
de verdad es `<base_dir>/profiles/<profile_id>/extension/` — la parte
discovery/companion/synapse-simulator SIEMPRE refleja `templates/` del repo
actual; la parte `background*.js`/`manifest.json` puede no reflejarlo.
`src/preflight/extension-parity-check.ts` compara ambas copias por hash
**antes de correr la suite** (`npm run preflight`) y avisa con un mensaje
claro si divergen, en vez de asumir sincronía.

Nota adicional descubierta durante esta resolución: el codebase tiene **al
menos 2 convenciones distintas para "base_dir"** conviviendo —
`Paths._resolve_base_directory()` (usada por `profile_create.py`, la que
importa acá) resuelve a `~/.local/share/BloomNucleus` en Linux dev (o
`$XDG_DATA_HOME/BloomNucleus`), mientras que `ExtensionManager._get_default_base_path()`
(en `brain/core/extension/manager.py`, aparentemente no usada por el flujo
de creación de perfiles) resuelve a `~/.bloom`. `bloom-paths.ts` replica
específicamente la primera (la que realmente usa `profile_create.py`).

---

## Puntos abiertos — NO bloqueantes (Sección 7 del dossier)

Los siguientes puntos de la Sección 7 **no bloquean el arranque** del
harness y se dejan explícitamente sin resolver acá, tal como pide la
consigna, en vez de asumirlos:

1. **Auditar `intent_manager.py`, `synapse_protocol.py`, `synapse_ipc_server.py` línea por línea.**
   No auditado. El Runner usa `submit.py` como caja negra vía CLI (Capa 4)
   — no depende de los internals de estos módulos.

2. **Valor exacto de `ENGINE_RESPONSE_TIMEOUT_MS`.** No extraído de
   `background-companion.js` en esta sesión. `layer2-dom-watchdog.ts` usa
   un fallback configurable (`ENGINE_RESPONSE_TIMEOUT_MS_FALLBACK`, 45s por
   defecto) — **ajustar en `.env` apenas se confirme el valor real**, o el
   watchdog puede dar falsos positivos de `silent_hang`.

3. **Selectores de `injectAndObserve()` sin verificar contra un browser
   real** (`div.ql-editor[contenteditable]`, botones por `aria-label`,
   `[data-message-author="model"]`). Fuera del control directo de
   synapse-runner (viven en `background-companion.js`, no en este
   proyecto) — pero es el punto más frágil de toda la arquitectura, y es
   exactamente el tipo de falla que la Capa 2 (`input_not_found`) está
   diseñada para detectar y diagnosticar con precisión en la primera
   corrida real, en vez de fallar con un timeout genérico.

4. **¿`synapse-simulator.html` expone una categoría de error explícita
   distinta de `sentinel`/`brain`/`synapse`?** No confirmado.
   `layer3-eventbus-ws.ts` NO filtra por categoría — reenvía cualquier
   categoría recibida al DiagnosticBus, así que si existe una categoría de
   error separada, ya va a aparecer en los bundles sin necesitar cambios de
   código.

5. **Discrepancia de documentación: `ENGINE_RESPONSE_ERROR` se emite en
   código pero no está en `knownReasons` de `companionProtocol.js` v2.0.0.**
   No es una corrección que le corresponda a este proyecto (es un fix de
   documentación en el repo principal). `layer2-dom-watchdog.ts` ya tolera
   este valor explícitamente (ver comentario `classifyFailureReason()`).

6. **Diseño formal del Submit Simulator UI-driven (Sección 2C).**
   Explícitamente fuera de alcance de este PoC — el dossier lo marca como
   iniciativa propia futura. `src/surfaces/submit-cli.ts` es el único punto
   de inserción: cuando el módulo UI-driven exista, reemplaza
   `runSubmitTestimony()` sin tocar el resto del Runner (el diagnostic bus
   ya espera el shape `cli_submit_result`).

## Otras cosas sin verificar contra un browser/proceso real (no vienen de la Sección 7, surgieron al implementar)

Estos NO estaban en la lista de puntos abiertos del dossier, pero aparecieron
al escribir el harness real y se documentan acá por la misma razón — para
no asumirlos silenciosamente:

- **Puerto de `--remote-debugging-port` de Chromium** (`discovery-chromium.ts`):
  placeholder `http://localhost:9222` vía `SYNAPSE_RUNNER_CDP_ENDPOINT`. El
  puerto real que usa Sentinel para levantar Chromium no fue confirmado.
- **API real del bridge IPC de Conductor** (`window.onboarding` vs
  `window.electronAPI`, y la forma de suscripción a milestones —
  `electron-conductor.ts::installMilestoneBuffer()` prueba `onMilestone()`
  y `on('milestone:reached', ...)`, pero no fue confirmado contra
  `preload_onboarding.js` línea por línea.
- **Tipo de CDP Target que reporta esta build de Chrome para un Side
  Panel de extensión** (`companion-panel.ts`) — el código intenta el
  camino simple (`context.pages()`) y cae a enumeración CDP cruda
  (`Target.getTargets`), pero deja un error explícito en vez de adivinar
  si hace falta `Target.attachToTarget` manual.
- **Selectores de Discovery** (`src/config/selectors.ts`) — placeholders
  `__TODO_VERIFY__` que hacen fallar el test con un mensaje claro apenas se
  intentan usar, en vez de fallar silenciosamente contra un selector
  inventado.

**Procedimiento sugerido para la primera corrida real:** ejecutar
`npm run preflight` primero (valida entorno + parity de la extensión), después
`npm run test:headed` para ver el flujo y corregir en vivo los ítems de
arriba — cada uno fue diseñado para fallar con un mensaje que dice
exactamente qué archivo tocar.
