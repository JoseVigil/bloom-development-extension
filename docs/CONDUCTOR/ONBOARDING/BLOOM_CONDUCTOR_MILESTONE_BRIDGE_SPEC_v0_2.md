# Bloom — Conductor Milestone Event Bridge
## Especificación de investigación · v0.1 · 20 de junio de 2026

> **Estado de este documento:** implementación en curso — Cambio 1/8 aplicado. Ver §8 para el estado actualizado de incógnitas y tabla de cambios.
>
> **Propósito:** diseñar el canal robusto entre Cortex (extensión de Chrome) y Conductor (Electron) para que Workspace reaccione a los hitos del onboarding en tiempo real, sin hardcodear eventos ni lógica de negocio en el frontend.
>
> **Lo que NO es este documento:** una lista de cambios de código. Es una investigación de arquitectura. La implementación viene después.

---

## 1. El problema concreto

El onboarding de Bloom tiene dos mundos que hoy no se hablan:

**Mundo Cortex** — la extensión de Chrome. Sabe cuándo el usuario guardó el token de GitHub, cuándo se confirmó la cuenta, cuándo avanzó a `vault_init`. Emite eventos como `GITHUB_TOKEN_STORED`, `GITHUB_ACCOUNT_CREATED`, `ACCOUNT_REGISTERED`.

**Mundo Conductor** — Electron/Workspace. Sabe cuándo `nucleus.json` cambia, puede lanzar ventanas, navegar steps. Hoy no escucha ningún evento de Cortex — solo hace polling de `nucleus.json` cada 3 segundos via `onboarding:poll-identity`.

**La consecuencia:** el usuario avanza en Chrome (confirma su token de GitHub), pero Conductor se entera 0-3 segundos después y solo si `pollIdentity()` devuelve el step completo. Si el poll falla, si Temporal tarda, si Brain no escribió todavía en `nucleus.json`, Conductor no lo sabe. Y lo más importante: **Conductor no reacciona inteligentemente a hitos — solo comprueba si un campo cambió en un archivo JSON**.

**Lo que queremos:** cuando el usuario alcanza un hito (GitHub conectado, vault creado, Google autenticado, AI provider configurado, proyecto creado), Conductor lo sepa en tiempo real y reaccione — actualizando la UI del onboarding de Electron, desbloqueando el siguiente paso, abriendo Landing en el momento correcto.

---

## 2. Lo que ya sabemos

### 2.1 La cadena de eventos existente

```
Usuario copia token en Chrome
  → Cortex detecta (clipboard listener en background.js)
  → discovery.js emite GITHUB_TOKEN_STORED
  → background.js recibe y llama sendToHost()
  → Host nativo (bloom-host) recibe el mensaje
  → Host → Brain (via gRPC o socket)
  → Brain → Temporal (EventBus)
  → Temporal persiste en nucleus.json (completed_steps[])
  → Conductor lee nucleus.json via pollIdentity() cada 3s
```

La cadena existe. El problema es que **es unidireccional y asincrónica** — Conductor espera a que el mundo vaya hasta Temporal y vuelva a un archivo JSON antes de enterarse.

### 2.2 Lo que tiene `onboarding-handlers.js` hoy

`pollIdentity()` lee `nucleus.json` y devuelve:
```javascript
{
  success: true,
  steps: {
    github_auth:       true/false,
    nucleus_create:    true/false,
    vault_init:        true/false,
    google_auth:       true/false,
    ai_provider_setup: true/false,
    project_create:    true/false
  },
  completedSteps: ['github_auth', ...]
}
```

Los step IDs están hardcodeados en `ONBOARDING_STEP_IDS` en `onboarding-handlers.js`:
```javascript
const ONBOARDING_STEP_IDS = [
  'github_auth', 'nucleus_create', 'vault_init',
  'google_auth', 'ai_provider_setup', 'project_create'
];
```

**Este es el hardcodeo que queremos eliminar.** Estos IDs deberían venir de una fuente de verdad dinámica.

### 2.3 Lo que tiene `onboarding.js` (renderer) hoy

El renderer hace polling cada 3 segundos y reacciona a `steps.github_auth === true` para avanzar la UI. Pero solo reacciona a GitHub — Google, Gemini y los demás no tienen reacciones en el renderer todavía. Eso significa que **la UI del onboarding de Electron ya tiene deuda técnica de hitos no conectados**.

### 2.4 Manifests del protocolo

El sistema tiene manifests autodescriptivos:
- `DISCOVERY_PROTOCOL_MANIFEST` en `discoveryProtocol.js` — describe steps, eventos observables, acciones.
- `LANDING_PROTOCOL_MANIFEST` en `landingProtocol.js` — describe `observable_events`.
- Existe mención de un `IONPUMP_PROTOCOL_MANIFEST` — no confirmado en código.

La pregunta sin responder: **¿hay un manifest canónico de hitos en el lado del sistema (Go/Temporal/Brain) que Conductor pueda consultar?**

---

## 3. Incógnitas a resolver antes de implementar

Estas son las preguntas que bloquean el diseño. Para cada una se indica dónde buscar la respuesta.

---

### ~~Incógnita 1~~ — ⚠️ PARCIALMENTE RESUELTA — ¿Dónde vive la fuente de verdad de los hitos?

**Respuesta:** es el **Escenario D** del spec original — no hay fuente dinámica en runtime. `nucleus onboarding steps` no existe como comando CLI. El archivo `onboarding_steps.json` existe en el repo bajo `bloom-development-extension/installer/native/config/onboarding/` pero no se deploya durante el setup, por lo que no está disponible en `~/.local/share/BloomNucleus/config/onboarding/` en producción.

**Decisión tomada:**
- **(a) Requerimiento de setup:** copiar `onboarding_steps.json` al BloomRoot durante la instalación — pendiente de implementar en el proceso de setup.
- **(b) MilestoneRegistry con fallback:** leer el archivo de disco si existe; caer a una constante hardcoded centralizada si no — seguro tanto en instalaciones correctas como en entornos de desarrollo sin deploy.
- **(c) Requerimiento futuro no bloqueante:** agregar `nucleus --json onboarding steps` al CLI para que consumidores futuros no accedan al disco directamente.

---

### Incógnita 2 — ¿Qué hace el host nativo cuando recibe `GITHUB_TOKEN_STORED`?

**La pregunta:** `background.js` llama `sendToHost()` con el evento. ¿Qué hace el host (bloom-host) con eso? ¿Escribe en `nucleus.json`? ¿Llama a Brain? ¿Emite algo por un socket que Conductor podría escuchar?

**Por qué importa:** si el host ya escribe en un archivo o socket al recibir el evento, Conductor puede `fs.watch()` ese archivo en lugar de hacer polling. Eso resuelve la latencia sin crear infraestructura nueva.

**Qué necesitamos para responder:**
- El código del host nativo (`bloom-host`, probablemente en Go o Rust)
- O la documentación del contrato de mensajes del host nativo

---

### ~~Incógnita 3~~ — ✅ RESUELTA — ¿Existe ya un mecanismo de push de eventos hacia Conductor?

**Respuesta:** sí. `SynapseBridge` hereda de `EventEmitter` y emite `bridge.on('message', enriched)` en cada mensaje de Brain via `_onBrainMessage()`. El canal push ya existía — lo que faltaba era clasificar los eventos de onboarding correctamente, que es exactamente lo que resuelve el Cambio 1 (patch de `_classifyMessage()`).

La **Opción C** del §4.4 es la correcta y ya es implementable. `workspace-synapse-handlers.js` se conecta con `bridge.on('message', ...)` y filtra por `type === 'ONBOARDING_MILESTONE'`.

---

### Incógnita 4 — ¿Qué metadata tienen los hitos?

**La pregunta:** asumiendo que encontramos la fuente de verdad de los hitos, ¿qué información tiene cada uno? Para que Conductor pueda reaccionar inteligentemente necesita saber:

- `id` — identificador del step (`github_auth`, `vault_init`, etc.)
- `label` — nombre legible para el usuario ("Conectar GitHub", "Crear vault")
- `bloqueante` — ¿el onboarding no puede continuar sin este step?
- `dependencias` — ¿qué steps deben completarse antes?
- `reaction` — ¿qué hace Conductor cuando este step completa? (opcional en el archivo, puede ser en código)
- `provider` — ¿a qué proveedor corresponde? (github, google, gemini, null)

Si los hitos no tienen esta metadata, habrá que agregarla — y eso define dónde vive el contrato.

---

### ~~Incógnita 5~~ — ✅ RESUELTA — ¿Cuál es el momento correcto para abrir Landing?

**Respuesta:** `nucleus synapse tab.create` no existe, pero existe `nucleus synapse onboarding <profile_id> --step <screen>`, que envía una señal de navegación al onboarding de un perfil en ejecución. El método `_openLandingTab()` del MilestoneReactor no debe abrir una tab — debe llamar:

```javascript
await this._nucleus(['synapse', 'onboarding', this._profileId, '--step', 'success']);
```

No hace falta construir ningún mecanismo de apertura de Chrome. El canal ya existe en el CLI.

---

## 4. Arquitectura propuesta (condicional a las incógnitas)

Antes de cerrar las incógnitas, podemos describir la arquitectura objetivo. La implementación concreta depende de las respuestas, pero el diseño es estable.

### 4.1 El principio rector

**Conductor no debe hardcodear ni hitos ni reacciones.** El sistema de hitos debe ser declarativo: una fuente de verdad describe qué hitos existen y qué metadata tienen, y Conductor los consume dinámicamente. Las reacciones son handlers mapeados por ID de hito — si aparece un hito nuevo en la fuente de verdad, solo hay que agregar su handler, no tocar la infraestructura.

### 4.2 Los tres componentes del bridge

```
┌─────────────────────────────────────────────────────────────┐
│  MILESTONE REGISTRY                                          │
│  Fuente de verdad de los hitos.                             │
│  Puede ser: archivo JSON, endpoint, output de CLI.          │
│  Lo lee Conductor al arrancar. Nunca hardcodeado en JS.     │
└─────────────────────────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────────────────────────┐
│  EVENT BRIDGE (Cortex → Conductor)                          │
│  Canal de comunicación en tiempo real.                      │
│  Opciones: fs.watch, socket, IPC via host nativo.           │
│  Recibe eventos de Cortex y los traduce a IPC de Electron.  │
└─────────────────────────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────────────────────────┐
│  MILESTONE REACTOR (onboarding.js renderer)                 │
│  Mapea hito → reacción en la UI.                            │
│  Dinámico: se construye desde el Milestone Registry.        │
│  Cada hito tiene un handler nombrado, no lógica inline.     │
└─────────────────────────────────────────────────────────────┘
```

### 4.3 El Milestone Registry (schema propuesto)

Independientemente de dónde viva, el registry debería tener este schema:

```json
{
  "version": "1.0",
  "steps": [
    {
      "id": "github_auth",
      "label": "GitHub Connected",
      "description": "Personal Access Token stored in Chrome vault",
      "provider": "github",
      "blocking": true,
      "requires": [],
      "cortex_events": ["GITHUB_TOKEN_STORED", "GITHUB_ACCOUNT_CREATED"],
      "nucleus_event": "ONBOARDING_STEP_COMPLETE",
      "conductor_reaction": "onGithubAuthComplete"
    },
    {
      "id": "vault_init",
      "label": "Vault Initialized",
      "description": "Chrome storage vault active for this profile",
      "provider": "github",
      "blocking": true,
      "requires": ["github_auth"],
      "cortex_events": ["VAULT_INITIALIZED"],
      "nucleus_event": "ONBOARDING_STEP_COMPLETE",
      "conductor_reaction": "onVaultInitComplete"
    },
    {
      "id": "google_auth",
      "label": "Google Connected",
      "description": "Google account authenticated",
      "provider": "google",
      "blocking": false,
      "requires": ["vault_init"],
      "cortex_events": ["ACCOUNT_REGISTERED"],
      "nucleus_event": "ONBOARDING_STEP_COMPLETE",
      "conductor_reaction": "onGoogleAuthComplete"
    },
    {
      "id": "ai_provider_setup",
      "label": "AI Provider Configured",
      "description": "API key stored in vault",
      "provider": null,
      "blocking": false,
      "requires": ["google_auth"],
      "cortex_events": ["API_KEY_DETECTED"],
      "nucleus_event": "ONBOARDING_STEP_COMPLETE",
      "conductor_reaction": "onAiProviderComplete"
    },
    {
      "id": "project_create",
      "label": "Project Created",
      "description": "Genesis mandate created",
      "provider": null,
      "blocking": true,
      "requires": ["ai_provider_setup"],
      "cortex_events": [],
      "nucleus_event": "ONBOARDING_STEP_COMPLETE",
      "conductor_reaction": "onProjectCreateComplete"
    },
    {
      "id": "success",
      "label": "Onboarding Complete",
      "description": "All required steps completed",
      "provider": null,
      "blocking": true,
      "requires": ["project_create"],
      "cortex_events": [],
      "nucleus_event": "ONBOARDING_COMPLETE",
      "conductor_reaction": "onOnboardingSuccess"
    }
  ]
}
```

**Nota:** `conductor_reaction` es el nombre de un handler en el código de Conductor. Si en el futuro aparece un hito nuevo, se agrega al registry y se escribe el handler — la infraestructura no cambia.

### 4.4 El Event Bridge (opciones en orden de preferencia)

**Opción A — fs.watch sobre un archivo de eventos (si el host escribe en disco):**
```javascript
// onboarding-handlers.js o nuevo archivo: milestone-bridge.js
const EVENTS_FILE = path.join(BLOOM_BASE, 'runtime', 'cortex_events.jsonl');

fs.watch(EVENTS_FILE, () => {
  const lines = fs.readFileSync(EVENTS_FILE, 'utf8').trim().split('\n');
  const lastEvent = JSON.parse(lines[lines.length - 1]);
  handleCortexEvent(lastEvent);
});
```
Ventaja: sin infraestructura nueva, el host ya escribe en disco.
Desventaja: requiere que el host escriba en un archivo conocido.

**Opción B — Socket local (si el host expone un socket):**
```javascript
const net = require('net');
const client = net.createConnection(
  path.join(BLOOM_BASE, 'runtime', 'bloom.sock')
);
client.on('data', (data) => {
  const event = JSON.parse(data.toString());
  handleCortexEvent(event);
});
```
Ventaja: push real, sin latencia.
Desventaja: requiere que el host/Brain exponga un socket.

**Opción C — SynapseBridge ✅ CONFIRMADA — canal correcto:**
```javascript
// workspace-synapse-handlers.js — implementación real
// SynapseBridge hereda de EventEmitter y emite 'message' en cada mensaje de Brain
bridge.on('message', (enriched) => {
  if (enriched.type === 'ONBOARDING_MILESTONE') {
    const stepId = milestoneRegistry.resolveEvent(enriched.event);
    if (stepId) milestoneReactor.handleMilestone(stepId);
  }
});
```
El bridge ya tenía esta capacidad. El Cambio 1 (patch) habilita que los eventos de onboarding lleguen con `type: 'ONBOARDING_MILESTONE'` en lugar de caer al fallback `SYNAPSE_EVENT`.

**Opción D — Polling mejorado con fs.watch sobre nucleus.json:**
```javascript
// Reemplazar setInterval de 3s por fs.watch — reacción inmediata al cambio
fs.watch(NUCLEUS_JSON, async () => {
  const data = JSON.parse(fs.readFileSync(NUCLEUS_JSON, 'utf8'));
  const newSteps = data.onboarding?.completed_steps || [];
  checkForNewMilestones(newSteps);
});
```
Ventaja: no requiere nada nuevo del sistema, implementable hoy.
Desventaja: sigue siendo reactivo al archivo JSON, no a Cortex directamente. La latencia depende de Brain.

### 4.5 El Milestone Reactor

Independientemente del canal (Opción A-D), el reactor es el mismo:

```javascript
// milestone-reactor.js (nuevo archivo, reemplaza la lógica inline de onboarding.js)

class MilestoneReactor {
  constructor(registry, getWindow) {
    this.registry    = registry;   // Milestone Registry cargado dinámicamente
    this.getWindow   = getWindow;
    this.completed   = new Set();
    this.handlers    = this._buildHandlers();
  }

  _buildHandlers() {
    // Mapeo dinámico: id → función handler
    return {
      github_auth:       () => this._onGithubAuthComplete(),
      vault_init:        () => this._onVaultInitComplete(),
      google_auth:       () => this._onGoogleAuthComplete(),
      ai_provider_setup: () => this._onAiProviderComplete(),
      project_create:    () => this._onProjectCreateComplete(),
      success:           () => this._onOnboardingSuccess(),
    };
  }

  handleMilestone(stepId) {
    if (this.completed.has(stepId)) return; // idempotente
    this.completed.add(stepId);

    const step = this.registry.steps.find(s => s.id === stepId);
    if (!step) {
      console.warn('[MilestoneReactor] Unknown step:', stepId);
      return;
    }

    console.log(`[MilestoneReactor] Milestone reached: ${step.label}`);

    // Notificar al renderer de Electron
    const win = this.getWindow();
    if (win) {
      win.webContents.send('milestone:reached', { stepId, step });
    }

    // Ejecutar el handler específico del hito
    const handler = this.handlers[stepId];
    if (handler) handler();
  }

  // ── HANDLERS POR HITO ──────────────────────────────────────────────────

  _onGithubAuthComplete() {
    // UI: marcar GitHub como confirmado en screen-identity
    // Habilitar el botón "Continue" hacia vault
    const win = this.getWindow();
    if (win) win.webContents.send('onboarding:step-ui-update', {
      stepId: 'github_auth',
      action: 'mark_confirmed',
      label:  'Token detectado'
    });
  }

  _onVaultInitComplete() {
    // UI: mostrar confirmation del vault en Conductor
    // (La pantalla vault-created la maneja Discovery en Chrome,
    //  pero Conductor puede mostrar su propio indicador en el stepper)
    const win = this.getWindow();
    if (win) win.webContents.send('onboarding:step-ui-update', {
      stepId: 'vault_init',
      action: 'mark_established',
      node:   'vault'
    });
  }

  _onGoogleAuthComplete() {
    const win = this.getWindow();
    if (win) win.webContents.send('onboarding:step-ui-update', {
      stepId: 'google_auth',
      action: 'mark_confirmed'
    });
  }

  _onAiProviderComplete() {
    const win = this.getWindow();
    if (win) win.webContents.send('onboarding:step-ui-update', {
      stepId: 'ai_provider_setup',
      action: 'mark_confirmed'
    });
  }

  _onProjectCreateComplete() {
    // No hace nada extra — onboarding.js ya maneja la navegación a screen 6
  }

  async _onOnboardingSuccess() {
    // ESTE es el hito que abre Landing.
    // Solo se ejecuta cuando todos los steps bloqueantes están completos.
    const requiredSteps = this.registry.steps
      .filter(s => s.blocking)
      .map(s => s.id);

    const allDone = requiredSteps.every(id => this.completed.has(id));
    if (!allDone) {
      console.warn('[MilestoneReactor] success recibido pero faltan steps bloqueantes');
      return;
    }

    // Abrir Landing como tab de Chrome en el perfil
    // (Implementación depende de Incógnita 5 — ¿existe nucleus synapse tab.create?)
    await this._openLandingTab();
  }

  async _openLandingTab() {
    // nucleus synapse onboarding --step success envía la señal de navegación
    // al perfil en ejecución. No hace falta abrir una tab manualmente.
    await this._nucleus(['synapse', 'onboarding', this._profileId, '--step', 'success']);
    console.log('[MilestoneReactor] Señal de navegación a success enviada via nucleus synapse onboarding');
  }
}
```

**Nota clave sobre el renderer (`onboarding.js`):** el renderer escucha `milestone:reached` via `preload_onboarding.js` y reacciona en la UI de Electron. El renderer ya no tiene lógica de "si github_auth === true, hacer X" hardcodeada — eso pasa al reactor en el main process.

### 4.6 Cómo eliminar el hardcodeo del renderer

Hoy `onboarding.js` tiene esto:
```javascript
if (pollResult.steps?.github_auth && !activeAccounts.has('github')) {
  // reacción hardcodeada...
}
```

Con el reactor, el renderer reemplaza todo el `setInterval` por:
```javascript
// En preload_onboarding.js — agregar:
onMilestone: (callback) => {
  ipcRenderer.removeAllListeners('milestone:reached');
  ipcRenderer.on('milestone:reached', (_, data) => callback(data));
},
onStepUpdate: (callback) => {
  ipcRenderer.removeAllListeners('onboarding:step-ui-update');
  ipcRenderer.on('onboarding:step-ui-update', (_, data) => callback(data));
},

// En onboarding.js — reemplazar el setInterval:
window.onboarding.onStepUpdate(({ stepId, action, node, label }) => {
  switch (action) {
    case 'mark_confirmed':
      // Actualizar el ícono del provider correspondiente
      const el = document.getElementById(`acc-${getProviderFromStep(stepId)}`);
      if (el) el.classList.add('active');
      break;
    case 'mark_established':
      if (node) setStepperEstablished(node);
      break;
  }
  checkIfCanContinue();
});
```

---

## 5. Preguntas de investigación — checklist

**Bloque 1 — Fuente de verdad de hitos (Incógnita 1)**
- [x] ¿Existe `onboarding_steps.json` en `~/.local/share/BloomNucleus/config/onboarding/`? → **No en runtime. Existe en el repo bajo `installer/native/config/onboarding/`. Requerimiento de setup pendiente.**
- [ ] ¿Tiene metadata más allá del ID? (label, blocking, requires, cortex_events) → **Pendiente de revisar el schema del archivo en el repo**
- [x] ¿`nucleus --json onboarding steps` devuelve algo? → **No. El comando no existe.**
- [x] ¿Hay un endpoint en el control plane para obtener los steps? → **No confirmado. No bloqueante dado el approach de archivo en disco.**

**Bloque 2 — El host nativo (Incógnita 2)**
- [ ] ¿Qué hace `bloom-host` cuando recibe `GITHUB_TOKEN_STORED`?
- [ ] ¿Escribe en algún archivo o socket además de llamar a Brain?
- [ ] ¿Existe un archivo de runtime events en `~/.local/share/BloomNucleus/runtime/`?

**Bloque 3 — SynapseBridge (Incógnita 3)**
- [x] ¿`shared/synapse-bridge.js` tiene métodos de suscripción a eventos (`on()`, `subscribe()`, etc.)? → **Sí. Hereda de EventEmitter. Emite `bridge.on('message', enriched)` en cada mensaje de Brain.**
- [x] ¿Qué eventos emite `SynapseBridge` hacia `mainWindow` hoy? → **Todos los tipos, incluyendo ahora `ONBOARDING_MILESTONE` tras el Cambio 1.**

**Bloque 4 — Apertura de Landing (Incógnita 5)**
- [x] ¿`nucleus --json synapse --help` lista un subcomando `tab.create`? → **No existe `tab.create`. Existe `nucleus synapse onboarding <profile_id> --step <screen>` que reemplaza esa necesidad.**

**Bloque 5 — Metadata de hitos (Incógnita 4)**
- [ ] ¿El `onboarding_steps.json` del repo tiene los campos necesarios? (label, blocking, requires, cortex_events) → **Pendiente de revisar.**

---

## 6. Archivos adjuntados y pendientes

| Archivo / Output | Responde | Estado |
|---|---|---|
| `shared/synapse-bridge.js` | Incógnita 3 — canal de push de eventos | ✅ Adjuntado — resuelta |
| `nucleus_help.txt` | Incógnita 5 — subcomandos synapse disponibles | ✅ Adjuntado — resuelta |
| `onboarding_steps.json` (del repo) | Incógnita 1 y 4 — schema de hitos y metadata | ⏳ Pendiente de revisar |
| `workspace-synapse-handlers.js` | Estructura actual del handler — necesario para Cambio 2 | ⏳ Pendiente |
| `onboarding.js` (renderer) | Lógica de polling actual — necesario para Cambio 7 | ⏳ Pendiente |
| `preload_onboarding.js` | Canales IPC ya expuestos — necesario para Cambio 6 | ⏳ Pendiente |
| Setup installer (script de copia a BloomRoot) | Dónde agregar el deploy de `onboarding_steps.json` | ⏳ Pendiente |

---

## 7. Decisiones tomadas que no dependen de las incógnitas

Estas decisiones están tomadas independientemente de cómo se resuelvan las incógnitas:

1. **No hardcodear hitos en el renderer.** El renderer (`onboarding.js`) no debe tener `if (steps.github_auth)` — eso pasa al main process.

2. **El Milestone Reactor vive en el main process.** No en el renderer. Tiene acceso a `getWindow()` y puede leer archivos, hacer IPC, y orquestar sin restricciones de sandbox.

3. **El canal es push, no polling.** El setInterval de 3 segundos se elimina o se convierte en respaldo. La fuente primaria de eventos es push (fs.watch, socket, o SynapseBridge).

4. **Las reacciones son handlers nombrados, no lógica inline.** `onGithubAuthComplete()` es una función con nombre, no código anónimo dentro de un if.

5. **El Milestone Registry se carga al arrancar el onboarding, no se hardcodea.** Si la fuente de verdad cambia (nuevo step, step removido), Conductor se adapta sin cambios de código.

6. **Landing se abre desde el Milestone Reactor, no desde el renderer.** Es una operación del sistema (abrir una tab de Chrome), no una acción de UI. El renderer solo muestra la animación de éxito.

---

---

## 8. Estado de implementación — tabla de cambios actualizada

*Agregado post análisis de `synapse-bridge.js` y `nucleus_help.txt` — 20 de junio de 2026.*

| # | Archivo / Componente | Tipo | Estado | Descripción |
|---|---|---|---|---|
| 1 | `shared/synapse-bridge.js` | Modificación | ✅ **Aplicado** | `ONBOARDING_EVENTS` Set + case `ONBOARDING_MILESTONE` + export |
| 2 | Setup — proceso de instalación | Requerimiento | ⏳ Pendiente | Copiar `onboarding_steps.json` a `BloomRoot/config/onboarding/` durante el setup |
| 3 | `milestone-registry.js` | Archivo nuevo | ⏳ Pendiente | Lee `onboarding_steps.json` del disco; fallback a constante si no existe |
| 4 | `milestone-reactor.js` | Archivo nuevo | ⏳ Pendiente | Handlers por hito; usa `nucleus synapse onboarding --step success` en lugar de abrir tab |
| 5 | `workspace-synapse-handlers.js` | Modificación | ⏳ Pendiente | Handler para `ONBOARDING_MILESTONE` → MilestoneReactor |
| 6 | `preload_onboarding.js` | Modificación | ⏳ Pendiente | Exponer `onMilestone` y `onStepUpdate` al renderer |
| 7 | `onboarding.js` (renderer) | Modificación | ⏳ Pendiente | Reemplazar setInterval por listeners de milestone |
| 8 | nucleus CLI | Requerimiento futuro | 🔵 No bloqueante | Agregar `nucleus --json onboarding steps` para acceso sin lectura directa de disco |

**Dependencias de implementación:**
```
Cambio 1 (bridge)            ✅ APLICADO
    ↓
Cambio 2 (setup deploy)      ← habilita el registry en runtime
Cambio 3 (registry)          ← base de datos de hitos
    ↓
Cambio 4 (reactor)           ← consume registry, emite IPC al renderer
    ↓
Cambio 5 (synapse-handlers)  ← conecta bridge → reactor
    ↓
Cambios 6+7 (renderer)       ← consume IPC del reactor, elimina polling
```

*Documento de investigación — 20 de junio de 2026.*
*Versión 0.2 — implementación en curso. Cambio 1/8 aplicado.*
