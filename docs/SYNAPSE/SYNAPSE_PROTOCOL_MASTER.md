# SYNAPSE PROTOCOL MASTER
## Arquitectura, Estado y Hoja de Ruta
### Bloom BTIPS — Documento fundacional del ducto de comunicación Chrome ↔ Brain
### Versión: 1.0 — Construido a partir de análisis directo del codebase real

---

> **Para el implementador / LLM que recibe este documento:**
>
> Este documento es la fuente de verdad del protocolo Synapse y sus tres activos.
> Fue construido a partir del código real verificado — no de documentación aspiracional.
> Cada sección distingue explícitamente entre lo que está **implementado**, lo que está
> **contratado pero no verificado en ejecución real**, y lo que **falta construir**.
>
> Antes de modificar cualquier componente Synapse, leer este documento completo.
> La distinción entre "implementado" y "verificado" es intencional y crítica.

---

## 1. QUÉ ES SYNAPSE Y POR QUÉ EXISTE

Synapse es el **ducto de comunicación bidireccional** entre Brain (proceso Python en el host)
y Cortex (extensión Chrome). Es la única vía por la que Brain puede observar y controlar
lo que sucede en el browser.

El protocolo usa **Chrome Native Messaging**: Chrome invoca a `brain.exe` como proceso hijo
al conectar la extensión, y la comunicación ocurre por `stdin/stdout` con mensajes JSON
prefijados por 4 bytes de longitud en formato Little Endian. Este canal es el único que
Chrome permite para comunicación con procesos nativos del host — no hay alternativa.

### Los tres activos del protocolo

```
┌─────────────────────────────────────────────────────────────────────┐
│ SYNAPSE PROTOCOL                                                    │
│                                                                     │
│  Discovery  ←→  Onboarding (GitHub auth, API key, registro)        │
│  Landing    ←→  Dashboard del perfil (estado, cuentas, acciones)   │
│  Harness    ←→  Debug UI (simular mensajes, observar eventos)       │
│                                                                     │
│  Los tres comparten el mismo canal Native Messaging.                │
│  Los tres son páginas dentro de la extensión Cortex.                │
│  Los tres leen configuración de *.synapse.config.js en runtime.     │
│  Los tres se autodescribren con un PROTOCOL_MANIFEST en self.*      │
└─────────────────────────────────────────────────────────────────────┘
```

### Por qué el Harness existe y qué rol cumple en esta etapa

El protocolo Synapse tiene tres activos, mensajes bidireccionales, un handshake de
múltiples fases, y una capa IPC para automatización. Desarrollar y depurar este sistema
sin observabilidad es inviable.

**El Harness es la herramienta de observabilidad y simulación del protocolo.** Permite:
- Observar todos los mensajes en tiempo real sin modificar el código de producción
- Simular mensajes de cualquier protocolo sin que el flujo completo esté implementado
- Verificar que los contratos (manifests) reflejan la realidad del código
- Testear handlers individuales de forma aislada

El Harness no tiene conocimiento hardcodeado de ningún mensaje — lee los manifests
dinámicamente. Cuando se agrega un nuevo mensaje al protocolo, el Harness lo refleja
automáticamente sin modificar `harness/index.html`.

**El Harness es la herramienta principal para verificar que el ducto Synapse funciona
end-to-end antes de que los flujos de producción estén completos.**

---

## 2. ARQUITECTURA DEL STACK COMPLETO

### Capas del sistema

```
┌──────────────────────────────────────────────────────────────────────┐
│ LAYER 5 — IonPump Runtime                                           │
│   brain/core/ionpump/                                               │
│   Ejecuta flujos .ion → genera SynapseCommand objects               │
│   Se comunica con Brain-Host vía IPC (TCP localhost)                │
└──────────────────────────┬───────────────────────────────────────────┘
                           │ TCP 127.0.0.1:{port}
┌──────────────────────────▼───────────────────────────────────────────┐
│ LAYER 4 — IPC Layer                                                 │
│   brain/core/synapse/synapse_ipc_server.py  (en Brain-Host process) │
│   brain/core/ionpump/ionpump_ipc.py         (en proceso IonPump)    │
│   Canal: TCP localhost                                              │
│   Port file: BloomNucleus/run/ipc_{launch_id}.port                  │
└──────────────────────────┬───────────────────────────────────────────┘
                           │ protocol.send_message()
┌──────────────────────────▼───────────────────────────────────────────┐
│ LAYER 3 — SynapseManager                                            │
│   brain/core/synapse/synapse_manager.py                             │
│   Dispatcher: _action_map → handlers                                │
│   Inicia SynapseIPCServer en thread daemon al arrancar              │
│   _action_map incluye: SYSTEM_HELLO, HEARTBEAT, LOG_ENTRY,          │
│     DOM_FOCUS, DOM_TYPE, DOM_CLICK, DOM_WAIT, DOM_SCROLL,           │
│     DOM_EXTRACT, EVENT_EMIT, STATE_TRANSITION                       │
└──────────────────────────┬───────────────────────────────────────────┘
                           │ stdin/stdout (4-byte LE prefix + JSON)
┌──────────────────────────▼───────────────────────────────────────────┐
│ LAYER 2 — SynapseProtocol                                           │
│   brain/core/synapse/synapse_protocol.py                            │
│   Transporte puro: read_message() / send_message()                  │
│   JSON con prefijo 4 bytes Little Endian (Chrome Native Messaging)  │
└──────────────────────────┬───────────────────────────────────────────┘
                           │ Chrome Native Messaging
┌──────────────────────────▼───────────────────────────────────────────┐
│ LAYER 1 — Cortex Extension                                          │
│   background.js — Service Worker, gestiona Native Messaging port    │
│   content.js    — Ejecuta acciones DOM en páginas web               │
│   discovery/    — Onboarding UI                                     │
│   landing/      — Dashboard UI                                      │
│   harness/      — Debug UI (solo en dev builds)                     │
└──────────────────────────────────────────────────────────────────────┘
```

### Procesos involucrados y sus fronteras

```
Chrome (proceso)
  └── Cortex Extension (Service Worker)
        └── chrome.runtime.connectNative("bloom_host")
              └── [invoca via OS]
                    └── brain.exe — PROCESO A (Brain-Host)
                          ├── SynapseManager.run_host_loop()  [bloqueante]
                          └── SynapseIPCServer [thread daemon]
                                └── escucha TCP 127.0.0.1:{port}
                                └── escribe BloomNucleus/run/ipc_{launch_id}.port

brain.exe — PROCESO B (IntentExecutor / IonPump)
  └── IonPumpManager.execute_flow()
        └── IonPumpIPCClient
              └── lee BloomNucleus/run/ipc_{launch_id}.port
              └── conecta a PROCESO A via TCP localhost
```

**Principio crítico:** PROCESO A y PROCESO B son OS processes distintos.
No comparten memoria. El IPC layer es el único canal entre ellos.
`SynapseManager` no expone ningún método para envío proactivo desde fuera
del proceso — todo envío hacia Chrome desde IonPump pasa por el IPC socket.

---

## 3. LOS TRES ACTIVOS — ESTADO REAL Y VERIFICADO

### Leyenda de estado

| Símbolo | Significado |
|---|---|
| ✅ | Implementado y verificado en código |
| ⚠️ | Implementado en código, pendiente verificación en ejecución real |
| 🔲 | No implementado — trabajo futuro definido |
| ⛔ | Bloqueado por dependencia externa |

---

### 3.1 Discovery

**Propósito:** Onboarding del usuario. Guía el flujo desde la instalación hasta
tener GitHub auth, API key, y cuenta registrada en Nucleus.

**Archivos en templates (Brain):**
```
brain/core/profile/web/templates/discovery/
├── index.html
├── discovery.js
├── script.js
├── discoveryProtocol.js        ← PROTOCOL object + DISCOVERY_PROTOCOL_MANIFEST
├── ionpump_protocol.js         ← IONPUMP_PROTOCOL_MANIFEST (leído por Harness)
├── content-aistudio.js
├── onboarding.js
└── styles.css
```

**Archivos generados en runtime:**
```
profiles/<uuid>/extension/discovery/   ← copiado por discovery_generator.py en seed
profiles/<uuid>/extension/
└── discovery.synapse.config.js        ← generado por Sentinel en launch
```

**DISCOVERY_PROTOCOL_MANIFEST — 8 mensajes implementados:**

| id | type | Descripción |
|---|---|---|
| `onboarding_navigate` | command | Navegar a un step del onboarding (`welcome`, `github_auth`, `github_confirm`, `api_key`, `complete`) |
| `github_pat_detected` | event | Simular detección de PAT en clipboard |
| `github_token_stored` | event | Simular confirmación de token GitHub |
| `api_key_registered` | event | Simular registro exitoso de API key |
| `account_registered` | event | Simular registro de cuenta completado |
| `discovery_complete` | event | Simular finalización del onboarding |
| `handshake_confirmed` | event | Simular confirmación del handshake de 3 fases |
| `host_ready` | event | Simular señal de bloom-host listo |

**observable_events:** `HOST_READY`, `HANDSHAKE_CONFIRMED`, `API_KEY_REGISTERED`,
`ACCOUNT_REGISTERED`, `DISCOVERY_COMPLETE`

**Estado de Discovery:**

| Componente | Estado |
|---|---|
| Assets estáticos copiados por `discovery_generator.py` | ✅ |
| `ionpump_protocol.js` incluido en `files_to_copy` | ✅ |
| `DISCOVERY_PROTOCOL_MANIFEST` al final de `discoveryProtocol.js` | ✅ |
| `discovery.synapse.config.js` generado por Sentinel en launch | ✅ |
| PROTOCOL object (fases, UI, mensajes i18n) | ✅ |
| Handshake 3 fases end-to-end en sesión real | ⚠️ Contrato definido, sin verificar |
| Handlers en `background.js` para mensajes del manifest | ⚠️ No confirmado |

**El handshake — contrato definido, no verificado:**
```
1. Chrome Extension → Brain: { event: "HOST_READY", profile_id, launch_id }
2. Brain → Chrome:           { type: "SYSTEM_ACK", status: "connected" }
3. Chrome Extension → Brain: { event: "HANDSHAKE_CONFIRMED", profile_id, launch_id }
```

---

### 3.2 Landing

**Propósito:** Dashboard del perfil activo. Estado de sesión, cuentas vinculadas,
stats de uso, y acciones rápidas post-onboarding.

**Archivos en templates (Brain):**
```
brain/core/profile/web/templates/landing/
├── index.html
├── landing.js
├── landingProtocol.js          ← PROTOCOL object + LANDING_PROTOCOL_MANIFEST
└── styles.css
```

**Archivos generados en runtime:**
```
profiles/<uuid>/extension/landing/    ← copiado por landing_generator.py en seed
profiles/<uuid>/extension/
└── landing.synapse.config.js         ← generado por Sentinel en launch
```

**LANDING_PROTOCOL_MANIFEST — 6 mensajes implementados:**

| id | type | Descripción |
|---|---|---|
| `profile_load` | command | Solicitar recarga de datos del perfil |
| `health_check` | command | Health check con scope `extension`, `host`, o `full-stack` |
| `nucleus_sync` | command | Trigger de sync con Nucleus |
| `intent_list` | command | Lista de intents activos del perfil |
| `session_status` | event | Simular update de estado (`active`, `idle`, `disconnected`, `error`) |
| `stats_update` | event | Simular update de stats (totalLaunches, uptime, intentsCompleted) |

**observable_events:** `SESSION_STATUS`, `STATS_UPDATE`, `PROFILE_LOADED`,
`HEALTH_CHECK_RESULT`

**Estado de Landing:**

| Componente | Estado |
|---|---|
| Assets estáticos copiados por `landing_generator.py` | ✅ |
| `LANDING_PROTOCOL_MANIFEST` con guard `typeof self !== 'undefined'` | ✅ |
| `landing.synapse.config.js` generado por Sentinel en launch | ✅ |
| PROTOCOL object con renderDashboard, stats, accounts, actions | ✅ |
| Handlers en `background.js` para comandos del manifest | ⚠️ No confirmado |
| Brain responde a `profile_load` con datos reales | ⚠️ No confirmado |
| Evento `PROFILE_LOADED` emitido con estructura correcta | ⚠️ No confirmado |

---

### 3.3 Harness

**Propósito:** Herramienta de debug. Observador pasivo + simulador activo del protocolo.
Existe únicamente en dev builds — no afecta producción.

**Archivos en templates (Brain):**
```
brain/core/profile/web/templates/harness/
└── index.html                  ← UI completa autocontenida (HTML + CSS + JS inline)
```

**Archivos generados en runtime:**
```
profiles/<uuid>/extension/harness/   ← SOLO si el perfil fue creado con --dev
└── index.html

profiles/<uuid>/extension/
└── harness.synapse.config.js         ← generado por Sentinel en launch
                                         SOLO si harness/index.html existe
```

**Activación:** el perfil debe haber sido creado con `sentinel seed <alias> <master> --dev`.
La presencia de `harness/index.html` es la señal que usa `writeHarnessConfig()` para
decidir si generar el config en launch.

**Estado del Harness:**

| Componente | Estado |
|---|---|
| `harness_generator.py` — patrón v3.0, solo assets estáticos | ✅ |
| `harness/index.html` — ProtocolReader, Feed, Simulate, Config, Protocols | ✅ |
| `harness.synapse.config.js` generado por Sentinel en launch | ✅ |
| Flag `--dev` en `sentinel seed` | ✅ |
| `dev_mode` propagado en `create_profile` → `_generate_profile_pages` | ✅ |
| `manifest.json` con `harness/*` en `web_accessible_resources` | ✅ |
| Test end-to-end: seed --dev → estructura correcta | ⚠️ Pendiente — Test 1 |
| Test end-to-end: launch → port file + harness config creados | ⚠️ Pendiente — Test 2 |
| Harness carga los tres manifests en Panel Protocols | ⚠️ Pendiente — Test 4 |

---

## 4. CÓMO FUNCIONA EL HARNESS — REFERENCIA TÉCNICA

### 4.1 Autodescubrimiento de manifests (ProtocolReader)

Al cargar, `ProtocolReader.loadAll()` escanea `self.*` buscando objetos con
la forma `{ version, protocol, messages: [] }`. No hay lista hardcodeada.

**Manifests disponibles y sus ubicaciones:**

| Nombre en `self.*` | Archivo fuente | Destino en extensión |
|---|---|---|
| `self.DISCOVERY_PROTOCOL_MANIFEST` | `templates/discovery/discoveryProtocol.js` | `extension/discovery/discoveryProtocol.js` |
| `self.LANDING_PROTOCOL_MANIFEST` | `templates/landing/landingProtocol.js` | `extension/landing/landingProtocol.js` |
| `self.IONPUMP_PROTOCOL_MANIFEST` | `templates/discovery/ionpump_protocol.js` | `extension/discovery/ionpump_protocol.js` |

**Para agregar un nuevo protocolo:** crear el manifest en el template correspondiente,
agregar el archivo a `web_accessible_resources`, y asegurarse de que se copia en seed.
No se modifica `harness/index.html`.

### 4.2 Los cuatro paneles

**Feed — observador pasivo:**
Registra todos los mensajes de `chrome.runtime.onMessage` en tiempo real.
El listener es adicional al de `background.js` — no interfiere con el routing.

```javascript
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  addToFeed('received', msg, sender);
  sendResponse({ harness_ack: true });
  return true;
});
```

**Simulate — simulador activo:**
Genera botones dinámicamente desde los manifests. Al ejecutar, resuelve variables
y despacha al canal correcto:
- Canal `"runtime"` → `chrome.runtime.sendMessage(payload)`
- Canal `"tabs"` → `chrome.tabs.sendMessage(tabId, payload)`

**Config — identidad de sesión:**
Muestra `profileId` y `launchId` de `HARNESS_CONFIG` y `SYNAPSE_CONFIG`.
Permite override manual. Contiene selector de tab activo para mensajes `channel: "tabs"`.

**Protocols — inspección de manifests:**
Visualiza los manifests cargados. Verificación de que el autodescubrimiento funcionó.

### 4.3 Resolución de variables

| Tipo | Comportamiento |
|---|---|
| `"string"` | Input de texto libre |
| `"enum"` | Dropdown generado desde `options[]` |
| `"auto"` | Inyectado desde `source` (ej: `"HARNESS_CONFIG.profileId"`) |

### 4.4 IONPUMP_PROTOCOL_MANIFEST — 10 mensajes disponibles

| id | Comando | Descripción |
|---|---|---|
| `dom_click` | `DOM_CLICK` | Click en selector CSS en un tab |
| `dom_type` | `DOM_TYPE` | Focus + typing en un campo |
| `dom_wait` | `DOM_WAIT` | Esperar que un selector aparezca |
| `dom_focus` | `DOM_FOCUS` | Focus en un elemento |
| `dom_scroll` | `DOM_SCROLL` | Scroll hacia un elemento (`smooth`, `instant`, `auto`) |
| `dom_extract` | `DOM_EXTRACT` | Extraer `textContent`, `value`, `href`, `data-id`, `innerText` |
| `event_emit` | `EVENT_EMIT` | Emitir evento nombrado en contexto de tab |
| `ion_execute_flow` | `ION_EXECUTE_FLOW` | Trigger de flujo IonPump completo |
| `ion_reload` | `ION_RELOAD` | Hot-reload de recipes para un site o `--all` |
| `ion_inspect` | `ION_INSPECT` | Estado del registry de IonPump |

**observable_events:** `ION_FLOW_STARTED`, `ION_FLOW_COMPLETED`, `ION_FLOW_ERROR`,
`ION_RELOAD_DONE`, `ION_RELOAD_FAILED`

---

## 5. FLUJO COMPLETO DE DESPLIEGUE

### 5.1 Seed

```
sentinel seed <alias> <master> [--dev]
  │
  └── HandleSeed(alias, master, devMode)
        ├── Extrae .blx → bin/extension/ (temporal)
        └── brain profile create <alias> [--master] [--dev]
              └── ProfileCreator.create_profile(dev_mode=devMode)
                    ├── _copy_extension_to_profile()
                    └── _generate_profile_pages(dev_mode=devMode)
                          ├── generate_discovery_page()
                          │     → extension/discovery/ (incluye ionpump_protocol.js)
                          ├── generate_profile_landing()
                          │     → extension/landing/
                          └── generate_harness_page(dev_mode=devMode)
                                dev_mode=True  → extension/harness/index.html
                                dev_mode=False → no-op
```

**Resultado en disco después del seed con --dev:**
```
profiles/<uuid>/extension/
├── [archivos base del .blx]
├── discovery/
│   ├── discoveryProtocol.js    ← DISCOVERY_PROTOCOL_MANIFEST
│   ├── ionpump_protocol.js     ← IONPUMP_PROTOCOL_MANIFEST
│   └── [resto de assets]
├── landing/
│   ├── landingProtocol.js      ← LANDING_PROTOCOL_MANIFEST
│   └── [resto de assets]
└── harness/
    └── index.html              ← SOLO con --dev
```

### 5.2 Launch

```
sentinel launch <profile_id>
  └── ignition_identity.go::prepareSessionFiles()
        ├── writeDiscoveryConfig() → extension/discovery.synapse.config.js
        ├── writeLandingConfig()   → extension/landing.synapse.config.js
        └── writeHarnessConfig()   → extension/harness.synapse.config.js
              (solo si extension/harness/index.html existe)
```

**Resultado en disco después del launch (perfil --dev):**
```
profiles/<uuid>/extension/
├── discovery.synapse.config.js     ← self.SYNAPSE_CONFIG
├── landing.synapse.config.js       ← self.SYNAPSE_CONFIG
└── harness.synapse.config.js       ← self.HARNESS_CONFIG

BloomNucleus/run/
└── ipc_{launch_id}.port            ← puerto TCP del SynapseIPCServer
                                       creado al arrancar, eliminado al cerrar
```

### 5.3 Configs en runtime

```javascript
// Disponible en todas las páginas de la extensión (Service Worker context):
self.SYNAPSE_CONFIG   ← de *.synapse.config.js (Sentinel, en launch)
self.HARNESS_CONFIG   ← de harness.synapse.config.js (Sentinel, solo en dev)

// Disponible tras autodescubrimiento del ProtocolReader:
self.DISCOVERY_PROTOCOL_MANIFEST
self.LANDING_PROTOCOL_MANIFEST
self.IONPUMP_PROTOCOL_MANIFEST
```

---

## 6. PLAN DE VERIFICACIÓN — TEST END-TO-END

Los tests se ejecutan en orden. Cada uno valida el prerequisito del siguiente.

### Test 1 — Seed con --dev
```bash
sentinel seed dev_test_01 true --dev
```
Verificar:
```
profiles/<uuid>/extension/discovery/ionpump_protocol.js  ← si falta: template no está
profiles/<uuid>/extension/harness/index.html             ← si falta: dev_mode no llegó
```
Si falla: revisar logs de Brain para `harness_generator` y `dev_mode`.

### Test 2 — IPC port file
```bash
sentinel launch <profile_id_del_test_1>
```
Verificar:
```
BloomNucleus/run/ipc_{launch_id}.port   ← debe existir con un entero (1024-65535)
profiles/<uuid>/extension/harness.synapse.config.js   ← debe existir
```
Si el port file no existe: `SynapseManager` no recibe `launch_id` y `run_dir`.
Identificar dónde se instancia `SynapseManager` en el entry point de Brain como Host.

### Test 3 — IonPump registry
```bash
# Prerequisito: copiar recipe manualmente
cp -r ionsites/github.com %LOCALAPPDATA%/BloomNucleus/bin/cortex/ionsites/

brain ionpump inspect
```
Salida esperada:
```
IonPump Registry
────────────────────────────────────────────────────────────
✓ github.com     v1.0.0    3 flows    not loaded
────────────────────────────────────────────────────────────
Total: 1 sites
```
Si muestra 0 sites: `IonLoader` no apunta al path correcto de `ionsites/`.

### Test 4 — Harness carga los tres manifests
Prerequisito: Tests 1 y 2 pasados.
Abrir `chrome-extension://<extension_id>/harness/index.html` → Panel Protocols.
Verificar que aparecen:
- `discovery` — v1.0.0 — 8 mensajes
- `landing` — v1.0.0 — 6 mensajes
- `ionpump` — v1.0.0 — 10 mensajes

Si falta alguno: verificar `web_accessible_resources` en `manifest.json` y que
el archivo existe físicamente en el directorio de la extensión.

### Test 5 — Handshake end-to-end
Prerequisito: Test 4 pasado.
1. Abrir Harness → Panel Feed
2. Lanzar sesión con `sentinel launch <profile_id>`
3. Observar en Feed que llega `SYSTEM_ACK` de Brain
4. Panel Simulate → Discovery → `host_ready` → ejecutar
5. Verificar que el evento fluye y Brain responde correctamente

Logs a revisar: `brain.core.synapse.manager`

---

## 7. GAPS CONOCIDOS Y TRABAJO PENDIENTE

### Gap principal: handlers en background.js

`background.js` debe tener handlers para cada mensaje que los manifests declaran.
Sin estos handlers, el Harness simula mensajes pero no hay código que los procese.
Este es el gap más grande del sistema actualmente.

**Mensajes que necesitan handler en `background.js`:**

Discovery:
- `onboarding_navigate` → lógica de navegación entre steps del onboarding
- `GITHUB_PAT_DETECTED` → trigger de flujo GitHub en Brain
- `GITHUB_TOKEN_STORED` → confirmar y almacenar token
- `API_KEY_REGISTERED` → confirmar registro de API key
- `ACCOUNT_REGISTERED` → confirmar registro de cuenta
- `DISCOVERY_COMPLETE` → transición a estado post-onboarding

Landing:
- `profile_load` → solicitar datos a Brain, responder con `PROFILE_LOADED`
- `health_check` → ejecutar health check, responder con `HEALTH_CHECK_RESULT`
- `nucleus_sync` → trigger de sync con Nucleus
- `intent_list` → solicitar lista de intents activos

IonPump:
- `ION_EXECUTE_FLOW` → forwarding hacia Brain-Host vía IPC
- `ION_RELOAD` → trigger de hot-reload en IonPump
- `ION_INSPECT` → solicitar estado del registry

### Gap: respuestas de Brain con datos reales

Brain debe responder con datos reales cuando la extensión los solicita:
- Responder a `profile_load` con estructura `PROFILE_LOADED` completa
- Responder a `health_check` con `HEALTH_CHECK_RESULT`
- Emitir `SESSION_STATUS` cuando cambia el estado de sesión
- Emitir `STATS_UPDATE` periódicamente o en respuesta a solicitudes

### Gap: IntentExecutor (DEFERRED)

La integración IonPump ↔ IntentExecutor está deferred hasta confirmar qué archivo
despacha la ejecución de intents en `brain/core/intent/`.
Ver `IONPUMP_IMPLEMENTATION_PROMPT_v2.md` sección Phase 3.

### Bloqueado: Metamorph reconcile

El download y swap automático de recipes `.ion` está bloqueado hasta que el servidor
Bartcave esté desplegado. Mientras tanto: copia manual a
`BloomNucleus/bin/cortex/ionsites/`.

---

## 8. REGLAS DE EXTENSIÓN — CÓMO AGREGAR AL PROTOCOLO

### Agregar un mensaje a un protocolo existente

1. Agregar el objeto de mensaje al manifest en el template de Brain
2. Agregar el handler en `background.js`
3. Si Brain debe responder: agregar handler en `SynapseManager._action_map`
4. El Harness refleja el nuevo mensaje automáticamente — no tocar `harness/index.html`

### Agregar un protocolo completamente nuevo

1. Crear `templates/<nombre>/<nombre>Protocol.js` con PROTOCOL object y manifest en `self.*`
2. Crear `<nombre>_generator.py` siguiendo el patrón de `discovery_generator.py` v3.0
3. Agregar la llamada en `_generate_profile_pages()` en `profile_create.py`
4. Agregar archivos del nuevo protocolo a `web_accessible_resources` en `manifest.json`
5. El Harness detecta el nuevo manifest automáticamente

### Convención de naming de manifests

```javascript
// Guard obligatorio en todos los manifests:
if (typeof self !== 'undefined') {
  self.NOMBRE_PROTOCOL_MANIFEST = {
    version: "1.0.0",
    protocol: "nombre",          // lowercase
    description: "...",
    messages: [ ... ],
    observable_events: [ ... ]
  };
}
```

---

## 9. REFERENCIA RÁPIDA — ARCHIVOS CLAVE

| Archivo | Responsabilidad | Modificar cuando... |
|---|---|---|
| `synapse_manager.py` | Dispatcher, inicia IPC server | Se agrega comando en Brain |
| `synapse_protocol.py` | Transporte binario | Nunca — es infraestructura |
| `synapse_ipc_server.py` | TCP server en Brain-Host | Cambios en contrato IPC |
| `ionpump_ipc.py` | TCP client en proceso IonPump | Cambios en contrato IPC |
| `discoveryProtocol.js` | PROTOCOL UI + DISCOVERY_PROTOCOL_MANIFEST | Se agrega mensaje Discovery |
| `landingProtocol.js` | PROTOCOL UI + LANDING_PROTOCOL_MANIFEST | Se agrega mensaje Landing |
| `ionpump_protocol.js` | IONPUMP_PROTOCOL_MANIFEST | Se agrega comando DOM o evento IonPump |
| `harness/index.html` | Debug UI completa | Solo si cambia arquitectura del Harness |
| `harness_generator.py` | Copia assets Harness en seed | Si se agregan más assets |
| `discovery_generator.py` | Copia assets Discovery en seed | Si se agregan archivos a `templates/discovery/` |
| `profile_create.py` | Orquesta creación del perfil | Si se agrega un nuevo activo |
| `seed.go` | Flags de seed, llama a Brain | Si cambia la interfaz CLI del seed |
| `ignition_identity.go` | Escribe configs en launch | Si se agrega un nuevo `*.synapse.config.js` |

---

*Versión 1.0 — Construido a partir del código real verificado.*
*Actualizar cuando: se completen los Tests 1-5, cambien los manifests,*
*o se implementen los handlers pendientes en background.js.*
