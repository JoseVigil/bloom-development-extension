# Dossier de Traspaso — Suite `synapse-runner` (E2E UI-Driven Onboarding & Diagnostic Harness)

> **Estado:** Fase de investigación cerrada. Este documento es la consigna directa para la nueva sesión de Claude que va a diseñar e implementar el PoC de Playwright de `synapse-runner`.

---

## 1. Nueva Consigna / Requerimiento Concreto

**Objetivo:** Validar la hipótesis de automatización del onboarding **exclusivamente desde las capas de UI** (Electron Desktop / Conductor + Chromium / Discovery + Side Panel / Companion) sin inyectar eventos sintéticos directamente por protocolo (`POST /api/internal/system-event`). El objetivo es descubrir si el flujo puede automatizarse de punta a punta como un usuario real, usando la captura de eventos/IPCs únicamente como capa de **observabilidad y aserciones** — y, adicionalmente, como **sistema de diagnóstico y detección temprana de fallas** en todo el pipeline (ver Sección 6).

**Nombre del proyecto/suite: `synapse-runner`.** Todo el código, scripts, y artefactos que se generen a partir de este dossier (el harness de Playwright, los listeners de diagnóstico, el punto de inserción del Submit Simulator) deben quedar organizados bajo ese nombre.

**Tu tarea en esta sesión es:**

1. Analizar la lista de archivos de respaldo (Sección 2) para completar el detalle fino de la Matriz de Interacción (Sección 3) donde queden marcados vacíos (🔶).
2. Diseñar la arquitectura de un **PoC en Playwright** que controle simultáneamente **cuatro superficies** (no dos): ver Sección 4.
3. Identificar las **fronteras externas reales** (GitHub OAuth, Google OAuth, y la tab de Gemini como motor del Companion) y proponer cómo automatizarlas desde la UI sin saltearse el circuito de eventos del cliente.
4. Implementar la **Estrategia de Observabilidad y Diagnóstico de Errores** (Sección 6) como parte estructural del Runner, no como un añadido posterior.
5. Tratar el **Submit Simulator** (Sección 2C) como módulo pendiente de diseño — el Runner debe usar la contingencia CLI documentada, dejando el punto de inserción abierto para cuando el módulo UI-driven exista.

---

## 2. Archivos de Respaldo y Código Relevante

### 2A. Capa Electron / Conductor (UI Desktop y Flujo Orchestrator)

| Archivo | Rol |
|---|---|
| `main_conductor.js` | Ciclo de vida principal de Electron, creación de ventanas, listeners IPC, orquestación del onboarding. |
| `preload_onboarding.js` | Bridge IPC expuesto al renderer (`window.onboarding` / `window.electronAPI`). |
| `renderer/steps/step-identity.js` | Lógica de UI de Electron que reacciona a milestones de identidad y navegación. |
| `onboarding-handlers.js` / `workspace-synapse-handlers.js` | Manejadores de eventos Synapse/Brain del lado de Conductor. |

### 2B. Capa Chromium / Discovery (Extensión y Protocolo de Cliente)

| Archivo | Rol |
|---|---|
| `discoveryProtocol.js` | Definición formal de eventos y manifest del protocolo entre Discovery, Sentinel y Brain. |
| `synapse-simulator.js` | Lógica interna del cliente de simulación y puente con el background script. |
| `onboarding_steps.json` | Definición de pasos y secuencia del wizard de onboarding. |
| `milestone-registry.js` / `milestone-reactor.js` | Mapeo y reacción ante eventos que completan pasos/milestones. |
| `background.js` | **Confirmado (auditado):** router principal Synapse/Discovery/onboarding. Native messaging host (TCP 5678 vía `bloom-host.exe`), handshake de 3 fases (`NONE → EXTENSION_READY → HOST_READY → CONFIRMED`), gestión de tabs Discovery/Landing/SynapseSimulator, bridge al debug panel (`forwardToDebugPanel()` → `http://localhost:48215/api/internal/system-event`, WebSocket `ws://localhost:4124`). Hace `import './background-companion.js'` — **no** contiene lógica del Companion. |

### 2C. Synapse Intent Submission (CLI Layer — Python)

**Estado del Submit Simulator UI-driven: `[PENDING / FEATURE EN DISEÑO]`**

El Submit Simulator —la capa que permitiría disparar y observar el submit de un intent de forma UI-driven, fiel al resto de la arquitectura del PoC— **no existe todavía**. Lo que hay hoy es la implementación operativa real del pipeline por CLI, que se documenta como **contingencia temporal**, no como solución definitiva.

| Archivo | Rol | Estado |
|---|---|---|
| `brain/commands/intent/submit.py` | Comando `brain intent submit`. Capa delgada: valida args, delega en `IntentManager`. Confirmado sin equivalente en UI. | ✅ Operativo — uso como contingencia |
| `brain/core/intent_manager.py` | Orquesta `submit_intent()`. | 🔶 No auditado |
| `brain/core/synapse/synapse_manager.py` | `socket.create_connection(("127.0.0.1", 5678))`, publica al EventBus TCP de Brain (ej. `ACCOUNT_REGISTERED`). | ✅ Confirmado por grep |
| `brain/core/synapse/synapse_protocol.py`, `synapse_ipc_server.py` | Protocolo/transporte del bridge. | 🔶 Referenciados, no auditados |
| `brain/commands/synapse/synapse_host_cli.py` | Levanta el Listener Loop (`brain synapse host`) — debe estar corriendo para que `submit` llegue a destino. | ✅ Confirmado |
| `brain/commands/intent/build_payload.py` + `core/context_planning/payload_builder.py` | Arma el payload que `submit` envía (paso previo del pipeline). | 🔶 No auditado |
| `brain/commands/intent/download.py` | Recibe la respuesta posterior al submit, puerto distinto al 5678. | 🔶 No auditado |
| **Submit Simulator (UI-driven)** | Módulo que debe orquestar la construcción/serialización de TONs/payloads + la interacción DOM que hoy hace `submit.py` por CLI. | 🚧 **PENDING / FEATURE EN DISEÑO** |

**Requerimientos arquitectónicos del Submit Simulator (a especificar en sesión de diseño futura, no a implementar ahora):**

1. **Gestión de TONs y Payloads** — construcción, serialización y orquestación de TONs (Transaction Object Notation)/payloads complejos que hoy encapsula `IntentManager.submit_intent()`. Definir si el Simulator reutiliza `payload_builder.py` o reimplementa el contrato de forma independiente.
2. **Automatización y Gestión del DOM** — a diferencia del submit actual (puro TCP, sin DOM), el Simulator UI-driven requiere un motor de automatización comparable a `injectAndObserve()` del Companion (`MutationObserver` esperando estados intermedios, no timeouts fijos) para orquestar el dispatch desde una superficie de UI.

**Estrategia del Runner mientras el módulo no exista:** invocar el CLI real como paso de contingencia, etiquetado explícitamente como **fuera de banda / no representativo del objetivo UI-driven** en el reporte del Runner (ver fila 06 de la matriz).

### 2D. Companion — Extensión (Side Panel + Engine Channel)

| Archivo | Rol |
|---|---|
| `companionProtocol.js` | Manifiesto v2.0.0. Tres canales: `commands` (Side Panel→background, confiable), `reports` (background→Side Panel, confiable), `engineChannel` (background↔tab de Gemini, marcado `trust: 'untrusted-dom'`). |
| `index.html` / `styles.css` | Markup y estilos del Side Panel (Bloom UI): toolbar de estado del motor, header de Mandate, área de respuesta refinada, expander de log técnico. |
| `companion.js` | Lógica del Side Panel: Port `'companion-link'` con reconexión y backoff, sincronización inicial (`GET_ENGINE_STATUS`), relay de comandos externos vía `COMPANION_RELAY_COMMAND`. |
| **`background-companion.js`** | **Orquestador real del Companion.** Detalle completo abajo. |

**Mecánica confirmada de `background-companion.js`:**

- **Activación condicional del panel:** `AI_SIDE_PANEL_DOMAINS = ['chatgpt.com', 'claude.ai', 'gemini.google.com']`. `updateSidePanelForTab()` usa `chrome.sidePanel.setOptions({tabId, enabled})` por tab — el panel solo está disponible cuando la tab activa matchea uno de esos dominios.
- **Máquina de estados:** `EngineStatus`: `SLEEPING → WAKING → READY → BUSY → (READY | DISCONNECTED)`.
- **Cola de comandos:** `enqueueCommand()` despierta el motor si está dormido (`wakeEngine()`, crea/reusa tab en `https://gemini.google.com/app`) o dispara `dispatchNextCommand()` si ya está `READY`. Si está `WAKING`/`BUSY`, el comando espera en cola.
- **Inyección real:** `injectAndObserve()`, ejecutada vía `chrome.scripting.executeScript({world:'ISOLATED', func: injectAndObserve})` dentro del DOM de `gemini.google.com`. **Los selectores están marcados `⚠️ verificar` en el propio código fuente** (`div.ql-editor[contenteditable]`, botones por `aria-label`, `[data-message-author="model"]`, etc.) — no confirmados contra el DOM vivo. Es el punto más frágil de toda la arquitectura.
- **Detección de fin de respuesta:** `MutationObserver` que espera simultáneamente (a) desaparición del indicador de carga/`aria-busy`, y (b) aparición de botones de feedback (Copy/Dislike) que Gemini solo renderiza cuando terminó de escribir. Timeout de cortesía (`ENGINE_RESPONSE_TIMEOUT_MS`, valor exacto 🔶 pendiente de extraer) como red de seguridad del lado del background.
- **Silo de observabilidad:** `background-companion.js` **no** publica al bridge `:48215`/`:4124` que usa `synapse-simulator.html`. Sus reports (`ENGINE_STATUS_CHANGED`, `REPORT_RESULT`, `REPORT_ERROR`) solo llegan por `broadcast()` a los Ports conectados (`companionPorts`). Esto obliga al Runner a abrir su propio Port (ver Sección 6, Capa 1).
- **Discrepancia de documentación detectada:** el código emite `reason: 'ENGINE_RESPONSE_ERROR'` en casos de bloqueo/error de Gemini, pero ese valor **no está** en el `knownReasons` documentado de `companionProtocol.js` v2.0.0 (que solo lista `INPUT_NOT_FOUND`). Queda como corrección pendiente para una sesión de documentación aparte — el Runner debe tolerar este valor igual.

---

## 3. Matriz de Flujo

| Paso | Actor / Superficie | Acción Humana Simulada | Evento Generado | Receptor / Mecanismo de espera | Estado |
|---|---|---|---|---|---|
| 01. Launch | Electron UI | Clic en "Launch Discovery" | `onboarding:launch-discovery` | Brain/Nucleus — spawnea Chromium + perfil | ✅ |
| 02. Device Code | Discovery | Clic en "Auth GitHub" | `GITHUB_DEVICE_CODE` | Brain/SynapseBridge — código en pantalla | ✅ |
| 03. OAuth GitHub | Chromium (frontera externa #1) | Clic en "Authorize App" | `GITHUB_APP_AUTHORIZED` | Brain → Reactor → `milestone:reached` en Electron | ✅ |
| 04. Identity | Discovery | Clic en "Detect Google" (frontera externa #2) | `ACCOUNT_REGISTERED` | Brain → Nucleus, actualiza `nucleus.json` | ✅ |
| 05. Completion | Electron UI | Transición a `success` | `_onOnboardingSuccess` | Electron Main — cierra wizard / redirige | ✅ |
| 06. Submit Intent (objetivo final) | **Submit Simulator (UI-driven)** | Interacción DOM aún sin definir | TON/payload serializado → dispatch | 🔶 A definir cuando exista el módulo | 🚧 **PENDING / FEATURE EN DISEÑO** |
| 06-contingencia. Submit Intent (temporal) | Proceso CLI (`brain intent submit`) | `spawn()` desde el harness | Publicación TCP a Brain vía `synapse_manager.py` | stdout/stderr/exit code del proceso + observar `synapse-simulator.html` (categoría `synapse`) | ✅ Operativo — uso transitorio, no representativo del objetivo UI-driven |
| 07. Companion activation | Chromium — tab activa | Navegar a dominio en `AI_SIDE_PANEL_DOMAINS` | `chrome.sidePanel.setOptions(enabled:true)` | Confirmar panel habilitado antes de targetear su CDP Target | ✅ |
| 08. Companion command | Side Panel (Companion) | Clic en acción que emite `COMMAND_RUN_*` | `COMMAND_ACK` (inmediato) → cola | Esperar `COMMAND_ACK` por el Port, no asumir ejecución | ✅ |
| 09. Engine wake | background-companion.js | — | `ENGINE_STATUS_CHANGED: WAKING→READY` | Broadcast por Port propio del Runner | ✅ |
| 10. Engine inject | Tab Gemini (frontera externa #3) | Inyección DOM (`injectAndObserve`) | `ENGINE_RESPONSE_CAPTURED` / `ENGINE_INJECTION_FAILED` | Sin observabilidad centralizada — Port propio del Runner (Sección 6, Capa 1+2) | ⚠️ Selectores no verificados |
| 11. Companion display | Side Panel | Reflejar `REPORT_RESULT`/`REPORT_ERROR` | DOM: `#refined-response[data-state]` | Aserción directa sobre el DOM del panel | ✅ |

---

## 4. Arquitectura del PoC (`synapse-runner`) — Cuatro Superficies (no dos)

1. **`_electron.launch()`** — ventana Conductor.
2. **`chromium.connectOverCDP()`** — tab Discovery.
3. **Target del Side Panel (Companion)** dentro de la misma conexión CDP. Chrome expone los Side Panels como su propio `Target` en el protocolo CDP, distinto de las tabs normales — hay que enumerarlo (`browser.targets()` / `Target.getTargets`) filtrando por la URL del panel (`chrome-extension://<id>/index.html`), no asumir que aparece anidado en el DOM de Discovery.
4. **Proceso CLI como testigo, no como UI** (`brain intent submit`, contingencia de la Sección 2C) — debe quedar etiquetado en el reporte del runner como paso fuera de banda, para no contaminar la métrica de cobertura "100% UI-driven" que es el objetivo del experimento.

**Fronteras externas reales identificadas (3, no 2):**
- OAuth GitHub (paso 03)
- OAuth/Detección Google (paso 04)
- **Tab de Gemini** (`gemini.google.com`, paso 10) — DOM real de un tercero, marcado explícitamente `trust: 'untrusted-dom'` en el propio protocolo. Selectores sin verificar; hay que confirmarlos contra el DOM vivo antes de considerar el PoC funcional.

---

## 5. Rol del Companion — Resumen de Comportamiento Esperado

- El Companion recibe estado de Brain/Synapse indirectamente: no está conectado al EventBus principal (`:48215`), sino que su propio motor (Gemini) opera en un circuito aislado, gobernado por `background-companion.js`.
- Flujo bidireccional: Side Panel emite `COMMAND_RUN_*`/`COMMAND_REOPEN_ENGINE` → background encola/despacha → Gemini procesa → background captura y filtra (`filterNoise()`) → Side Panel muestra "Respuesta refinada".
- Playwright debe poder hacer **aserción triple** por paso relevante:
  - **Electron:** milestone global.
  - **Discovery/Chromium:** flujo web.
  - **Companion:** instrucción/resultado reflejado en `#refined-response` y el log del expander técnico (`#technical-log-list`).

---

## 6. Estrategia de Observabilidad y Diagnóstico de Errores (`synapse-runner`)

### Principio de diseño

El pipeline tiene **4 sistemas de eventos independientes y no correlacionados entre sí**: Companion (Port), DOM de Gemini (mensajes inyectados), debug panel `:48215`/`:4124` (WebSocket del EventBus principal), y el proceso CLI (stdout/stderr/exit code). `synapse-runner` necesita un **listener activo por capa**, y el diagnóstico final se arma **correlacionando las 4** por un identificador común (`commandId`/`mandateId` en Companion, ventana temporal + `profile_id` en el EventBus, `intent_id` en el CLI) — no reportando cada capa por separado.

### Capa 1 — Companion (`REPORT_ERROR` vía Port directo)

Como `background-companion.js` no publica al bridge centralizado, el Runner abre su propia conexión al Port en paralelo a la del Side Panel real:

```js
const port = chrome.runtime.connect({ name: 'companion-link' });
port.onMessage.addListener((msg) => {
  if (msg.event === 'REPORT_ERROR') {
    diagnosticBus.emit('companion_failure', {
      layer: 'companion', commandId: msg.commandId, mandateId: msg.mandateId,
      reason: msg.reason, capturedAt: Date.now(),
    });
  }
  if (msg.event === 'ENGINE_STATUS_CHANGED' && msg.status === 'DISCONNECTED') {
    diagnosticBus.emit('companion_disconnected', { capturedAt: Date.now() });
  }
});
```

**Riesgo a documentar:** dos Ports conectados simultáneamente (Side Panel real + Runner) reciben el mismo `broadcast()`. El Runner debe filtrar por el `commandId`/`mandateId` que él mismo generó, no asumir que todo lo que llega es suyo.

### Capa 2 — Inyección DOM en Gemini (`ENGINE_INJECTION_FAILED` + timeout)

Tres modos de falla a distinguir, no tratar como un solo "falló":

| Modo | Señal | Causa probable |
|---|---|---|
| Selector de input roto | `ENGINE_INJECTION_FAILED`, `reason: INPUT_NOT_FOUND` | Gemini cambió el DOM del editor |
| Bloqueo/error de Gemini | `ENGINE_INJECTION_FAILED`, `reason: ENGINE_RESPONSE_ERROR` | Rate limit, contenido bloqueado, error de red |
| Cuelgue silencioso | Nada llega — vence `ENGINE_RESPONSE_TIMEOUT_MS` sin evento | El `MutationObserver` nunca detectó loading-gone ni feedback-ready |

El Runner mantiene un **watchdog propio**, más largo que el timeout interno, para detectar si el propio mecanismo de timeout de cortesía del background dejó de dispararse:

```js
const RUNNER_WATCHDOG_MS = ENGINE_RESPONSE_TIMEOUT_MS + 5000; // 🔶 confirmar valor exacto de ENGINE_RESPONSE_TIMEOUT_MS
```

Si el watchdog vence sin recibir ni `REPORT_RESULT` ni `REPORT_ERROR`, eso es en sí mismo un hallazgo: el mecanismo de timeout interno falló, no solo el paso de negocio.

### Capa 3 — Debug Panel / EventBus (`synapse-simulator.html`, categorías `sentinel`/`brain`/`synapse`)

Única capa con bridge centralizado ya construido. El Runner se suscribe directamente por WebSocket, sin scraping del HTML del panel:

```js
const ws = new WebSocket('ws://localhost:4124');
ws.onmessage = (event) => {
  const { category, event: eventName, data, profile_id } = JSON.parse(event.data);
  if (['sentinel', 'brain', 'synapse'].includes(category)) {
    diagnosticBus.emit('eventbus_trace', { category, eventName, data, profile_id, capturedAt: Date.now() });
  }
};
```

Detecta fallas del pipeline de onboarding original (Secciones 1–5), separado de las Capas 1 y 2 que son específicas del Companion. 🔶 Pendiente: confirmar si existe una categoría de error explícita distinta de las tres nombradas.

### Capa 4 — Proceso CLI de contingencia (`brain intent submit`)

```js
const { spawn } = require('child_process');
const proc = spawn('brain', ['intent', 'submit', '--intent-id', intentId, '--json'], { stdio: 'pipe' });
let stdout = '', stderr = '';
proc.stdout.on('data', (d) => stdout += d);
proc.stderr.on('data', (d) => stderr += d);
proc.on('close', (exitCode) => {
  diagnosticBus.emit('cli_submit_result', {
    layer: 'cli_contingency', exitCode, stderr: stderr.trim(), stdout: stdout.trim(),
    failed: exitCode !== 0, capturedAt: Date.now(),
  });
});
```

Parsear `stderr`/salida JSON (`--json`) para clasificar la falla según los `except` reales de `submit.py`: `ValueError`/`FileNotFoundError` → problema de serialización de TON; `ConnectionError`/`TimeoutError` → problema del socket TCP `127.0.0.1:5678` (posiblemente `brain synapse host` no está corriendo).

### Correlación cruzada — bundle de diagnóstico por paso

```json
{
  "step": "06-contingencia_submit_intent",
  "started_at": "...",
  "companion_layer": { "status": "no_events_received" },
  "dom_injection_layer": { "status": "not_applicable" },
  "eventbus_layer": { "status": "ACCOUNT_REGISTERED_seen", "category": "synapse" },
  "cli_layer": { "exit_code": 1, "stderr": "ConnectionError: ...", "classified_as": "tcp_bridge_unreachable" },
  "diagnosis": "El CLI falló por socket cerrado — verificar que 'brain synapse host' esté corriendo antes de este paso."
}
```

El reporte de cada paso fallido debe indicar **en qué capa específica** falló, con el trazo crudo de esa capa adjunto — no un genérico "step failed".

---

## 7. Puntos Abiertos (🔶) para la Nueva Sesión

1. Auditar `brain/core/intent_manager.py`, `synapse_protocol.py`, `synapse_ipc_server.py` línea por línea.
2. Extraer el valor exacto de `ENGINE_RESPONSE_TIMEOUT_MS` en `background-companion.js`.
3. Verificar contra un browser real los selectores de `injectAndObserve()` (`div.ql-editor[contenteditable]`, botones por `aria-label`, `[data-message-author="model"]`) — actualmente sin confirmar.
4. Confirmar si `synapse-simulator.html` expone una categoría de error explícita distinta de `sentinel`/`brain`/`synapse`.
5. Corregir la discrepancia de documentación: `ENGINE_RESPONSE_ERROR` se emite en código pero no está en `knownReasons` de `companionProtocol.js` v2.0.0.
6. Diseñar formalmente el Submit Simulator UI-driven (Sección 2C) como su propia iniciativa, una vez cerrado este PoC.
