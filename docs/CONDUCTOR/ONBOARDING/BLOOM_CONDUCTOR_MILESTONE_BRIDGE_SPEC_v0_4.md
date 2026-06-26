# Bloom — Conductor Milestone Event Bridge
## Especificación de investigación · v0.4 · 25 de junio de 2026

> **Estado de este documento:** pre-implementación. No codear hasta cerrar las incógnitas de la §3.

> **Enmienda · 25 de junio de 2026 — Cambio de orden en el flujo de onboarding de Conductor**
>
> El onboarding del Conductor fue reestructurado para invertir el orden de los dos primeros pasos. Anteriormente el flujo comenzaba con la autenticación de GitHub (`github_auth`) y luego creaba el workspace local (`nucleus_create`). El nuevo orden es el inverso: el usuario configura primero su espacio de trabajo local antes de cualquier autenticación externa. El step 1 (`nucleus_create`) ahora tiene `requires: []` y captura dos valores — la ruta base del workspace y el slug de organización — que se pasan al binario mediante `nucleus create --org {slug} --path {basePath}/{slug}` (o `--temporary` si el campo org queda vacío, delegando la resolución del slug al binario). El step 2 (`github_auth`) pasa a requerir `nucleus_path` como prerequisito. El comando `nucleus init` no se ejecuta en este step — es un comando separado que corre después del GitHub auth en el step 2, una vez que el sistema dispone del `github_id`. El stepper visual fue reducido de 5 nodos a 4: Workspace → Identity → Providers → Project.
>
> Esta enmienda actualiza §2.2 (orden de `ONBOARDING_STEP_IDS`), §4.3 (schema del Milestone Registry — entrada nueva para `nucleus_create`, cadena de `requires` corregida), y §4.5 (`_buildHandlers()` del MilestoneReactor — handler nuevo para `nucleus_create`). El `nucleus.json` de referencia para estado de partida limpio es: `{ "completed": false, "started": false, "current_step": "nucleus_create", "completed_steps": [] }`.
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
    nucleus_create:    true/false,   // step 1 — workspace local
    github_auth:       true/false,   // step 2 — requiere nucleus_create
    vault_init:        true/false,
    google_auth:       true/false,
    ai_provider_setup: true/false,
    project_create:    true/false
  },
  completedSteps: ['nucleus_create', ...]
}
```

Los step IDs están hardcodeados en `ONBOARDING_STEP_IDS` en `onboarding-handlers.js`:
```javascript
const ONBOARDING_STEP_IDS = [
  'nucleus_create', 'github_auth', 'vault_init',
  'google_auth', 'ai_provider_setup', 'project_create'
];
```

**Este es el hardcodeo que queremos eliminar.** Estos IDs deberían venir de una fuente de verdad dinámica.

> **Nota (enmienda 25-jun-2026):** `nucleus_create` es ahora el step 1. `github_auth` requiere que `nucleus_create` esté completo. Conductor ya va a ver `completed_steps: ["nucleus_create"]` en el estado inicial del onboarding — cualquier lógica de polling de respaldo (Opción D en §4.4) debe contemplar que ese step siempre estará marcado en `nucleus.json` antes de que el usuario llegue a `github_auth`.

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

### Incógnita 1 — ¿Dónde vive la fuente de verdad de los hitos?

**La pregunta:** `ONBOARDING_STEP_IDS` está hardcodeado en `onboarding-handlers.js`. ¿Existe en algún lugar del sistema un archivo o endpoint que declare los hitos canónicos con metadata (nombre legible, descripción, dependencias, si es bloqueante)?

**Escenario A — Archivo en disco:**
Los hitos están en `~/.local/share/BloomNucleus/config/onboarding/onboarding_steps.json` o similar. Conductor podría leerlo al arrancar y construir el sistema de reacciones dinámicamente.

**Escenario B — Endpoint del control plane:**
El control plane (Go) expone `GET /api/internal/onboarding/steps` que devuelve los hitos con metadata. Conductor consulta este endpoint al iniciar el onboarding.

**Escenario C — Definidos en el binario de Nucleus:**
`nucleus --json onboarding steps` devuelve los steps disponibles. Conductor los obtiene ejecutando el binario.

**Escenario D — No existe fuente dinámica:**
Los hitos solo están en `ONBOARDING_STEP_IDS`. En ese caso, la solución no es eliminar el hardcodeo todavía — es centralizarlo en un solo lugar y agregar metadata.

**Qué necesitamos para responder:**
- El archivo `onboarding_steps.json` si existe en disco
- Las rutas de `internal.routes.ts` (o equivalente en Go) para ver si hay endpoints de onboarding
- El output de `nucleus --json onboarding steps` o `nucleus --json onboarding --help`
- Cualquier archivo `.ion` o `bootstrap-ions.json` del directorio `ionpump/`

---

### Incógnita 2 — ¿Qué hace el host nativo cuando recibe `GITHUB_TOKEN_STORED`?

**La pregunta:** `background.js` llama `sendToHost()` con el evento. ¿Qué hace el host (bloom-host) con eso? ¿Escribe en `nucleus.json`? ¿Llama a Brain? ¿Emite algo por un socket que Conductor podría escuchar?

**Por qué importa:** si el host ya escribe en un archivo o socket al recibir el evento, Conductor puede `fs.watch()` ese archivo en lugar de hacer polling. Eso resuelve la latencia sin crear infraestructura nueva.

**Qué necesitamos para responder:**
- El código del host nativo (`bloom-host`, probablemente en Go o Rust)
- O la documentación del contrato de mensajes del host nativo

---

### Incógnita 3 — ¿Existe ya un mecanismo de push de eventos hacia Conductor?

**La pregunta:** ¿Brain o Temporal tienen algún mecanismo para notificar a Conductor cuando un hito completa, sin esperar a que Conductor haga polling?

**Escenario posible:** el `SynapseBridge` en `workspace-synapse-handlers.js` podría ya estar recibiendo eventos de Nucleus via algún canal. `SynapseBridge` tiene métodos `seedAndLaunch` y `launch` — ¿tiene también algún listener de eventos?

**Qué necesitamos para responder:**
- El código de `shared/synapse-bridge.js` — mencionado en `workspace-synapse-handlers.js` pero no adjuntado
- Si `SynapseBridge` tiene métodos de suscripción a eventos (`on()`, `subscribe()`, etc.)

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

### Incógnita 5 — ¿Cuál es el momento correcto para abrir Landing?

**La pregunta:** el spec §4 dice que Landing se abre cuando el step `success` se emite. Pero `success` no está en `ONBOARDING_STEP_IDS` de `onboarding-handlers.js` — solo los 6 steps de onboarding están ahí. ¿Cómo sabe Conductor que el onboarding completó?

**Hoy:** `onboarding:complete` en `onboarding-handlers.js` escribe `completed: true` en `nucleus.json` y carga `workspaceUrl` en la ventana de Electron. Eso funciona para el caso nominal — pero Landing como tab de Chrome no se abre en ese momento. ¿Quién la abre?

**Lo que dijimos en §4 del spec:** "Conductor ejecuta `nucleus synapse tab.create landing/index.html`". ¿Existe ese comando en el CLI de Nucleus? ¿O es algo que hay que implementar?

**Qué necesitamos para responder:**
- `nucleus --json synapse --help` para ver los subcomandos disponibles
- O el código del comando `synapse` en el binario de Nucleus

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
      "id": "nucleus_create",
      "label": "Workspace Configured",
      "description": "Local workspace path and org slug captured. nucleus create executed.",
      "provider": null,
      "blocking": true,
      "requires": [],
      "cortex_events": [],
      "nucleus_event": "ONBOARDING_STEP_COMPLETE",
      "conductor_reaction": "onNucleusCreateComplete"
    },
    {
      "id": "github_auth",
      "label": "GitHub Connected",
      "description": "Personal Access Token stored in Chrome vault",
      "provider": "github",
      "blocking": true,
      "requires": ["nucleus_create"],
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

> **Cambio vs v0.3 (enmienda 25-jun-2026):** Se agrega la entrada `nucleus_create` como step 1 con `requires: []`. `github_auth` pasa a `requires: ["nucleus_create"]`. El stepper visual tiene 4 nodos (Workspace → Identity → Providers → Project), no 5 — el handler `onNucleusCreateComplete` debe reflejar esto al actualizar el stepper de Conductor.

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

**Opción C — SynapseBridge (si ya tiene suscripción a eventos):**
```javascript
// Si SynapseBridge tiene un método on()
const bridge = getBridgeForWindow(mainWindow);
bridge.on('ONBOARDING_STEP_COMPLETE', (event) => {
  handleCortexEvent(event);
});
```
Ventaja: reutiliza infraestructura existente.
Desventaja: no sabemos si `SynapseBridge` tiene esta capacidad.

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
      nucleus_create:    () => this._onNucleusCreateComplete(),
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

  _onNucleusCreateComplete() {
    // UI: marcar Workspace como configurado en el stepper de Conductor (nodo 1/4)
    // Habilitar el botón "Continue" hacia github_auth
    const win = this.getWindow();
    if (win) win.webContents.send('onboarding:step-ui-update', {
      stepId: 'nucleus_create',
      action: 'mark_confirmed',
      node:   'workspace',
      label:  'Workspace listo'
    });
  }

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
    // TODO: implementar cuando se resuelva Incógnita 5
    console.log('[MilestoneReactor] Abriendo Landing — pendiente de nucleus synapse tab.create');
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

Para la próxima sesión de análisis, necesitamos responder estas preguntas en orden:

**Bloque 1 — Fuente de verdad de hitos (Incógnita 1)**
- [ ] ¿Existe `onboarding_steps.json` en `~/.local/share/BloomNucleus/config/onboarding/`?
- [ ] ¿Tiene metadata más allá del ID? (label, blocking, requires, cortex_events)
- [ ] ¿`nucleus --json onboarding steps` devuelve algo?
- [ ] ¿Hay un endpoint en el control plane para obtener los steps?

**Bloque 2 — El host nativo (Incógnita 2)**
- [ ] ¿Qué hace `bloom-host` cuando recibe `GITHUB_TOKEN_STORED`?
- [ ] ¿Escribe en algún archivo o socket además de llamar a Brain?
- [ ] ¿Existe un archivo de runtime events en `~/.local/share/BloomNucleus/runtime/`?

**Bloque 3 — SynapseBridge (Incógnita 3)**
- [ ] ¿`shared/synapse-bridge.js` tiene métodos de suscripción a eventos (`on()`, `subscribe()`, etc.)?
- [ ] ¿Qué eventos emite `SynapseBridge` hacia `mainWindow` hoy?

**Bloque 4 — Apertura de Landing (Incógnita 5)**
- [ ] ¿`nucleus --json synapse --help` lista un subcomando `tab.create` o `tab create`?
- [ ] Si no existe, ¿cuál es el mecanismo para abrir una tab en el Chrome del perfil desde el sistema?

**Bloque 5 — Metadata de hitos (Incógnita 4)**
- [ ] Si los hitos no tienen metadata en la fuente de verdad, ¿dónde es el mejor lugar para definirla?
  - Opción A: extender `onboarding_steps.json` con campos nuevos
  - Opción B: archivo nuevo `milestone_metadata.json` en `config/`
  - Opción C: constante en código del conductor, centralizada y documentada

---

## 6. Archivos a adjuntar en la próxima sesión

Para responder las incógnitas y pasar a implementación:

| Archivo / Output | Responde | Prioridad |
|---|---|---|
| `shared/synapse-bridge.js` | Incógnita 3 — si existe canal de push de eventos | Alta |
| `onboarding_steps.json` (si existe) | Incógnita 1 — fuente de verdad de hitos | Alta |
| Código del host nativo (`bloom-host`) o su README | Incógnita 2 — qué pasa con los eventos después del host | Alta |
| Output de `nucleus --json synapse --help` | Incógnita 5 — si existe tab.create | Media |
| Output de `nucleus --json onboarding --help` | Incógnita 1 — si hay subcomando steps | Media |
| `internal.routes.ts` o equivalente Go | Incógnita 1 — endpoints del control plane | Media |
| Cualquier archivo `.ion` o `bootstrap-ions.json` | Incógnita 1 — manifests del ionpump | Baja |

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

*Documento de investigación — 20 de junio de 2026.*
*Versión 0.4 — pre-implementación. No codear hasta cerrar §3.*
*Enmienda 25-jun-2026: cambio de orden nucleus_create → github_auth. Ver §2.2, §4.3, §4.5.*
*Próxima acción: adjuntar los archivos de §6 y responder el checklist de §5.*
