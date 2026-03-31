# Bloom Cortex — Documentación Técnica de Integración
## v1.0 — Verificado contra código fuente

> **Propósito:** Fuente de verdad de los contratos de Cortex con el resto del sistema Bloom. Cubre qué recibe, qué emite, cómo funciona internamente, y dónde están los puntos de falla. Quien trabaje en Cortex, en Sentinel, o en bloom-host puede leer este documento y saber exactamente cómo hablar con la extensión sin necesitar leer el código fuente.

---

## 1. Qué es Cortex en el sistema

Cortex es la Chrome Extension que actúa como interfaz de usuario dentro del navegador y como gateway de credenciales hacia el sistema Bloom. Tiene tres responsabilidades que nunca se mezclan:

**UI:** Renderiza la Discovery Page (`discovery/index.html`) — la SPA donde el usuario ve las pantallas de onboarding y registro de cuentas.

**Detección:** Monitorea el clipboard para detectar tokens y API keys de proveedores soportados. El token nunca sale de Chrome — solo el fingerprint viaja hacia el sistema.

**Gateway:** Recibe comandos del Host vía Native Messaging y los entrega a la Discovery Page. Recibe eventos de la Discovery Page y los reenvía al Host.

**Lo que Cortex nunca hace:** Cortex no tiene lógica organizacional, no persiste estado fuera de `chrome.storage`, no accede a `nucleus.json`, y no se comunica directamente con el Conductor. Es deliberadamente stateless respecto del sistema — su única fuente de verdad es `chrome.storage.local`.

---

## 2. Archivos y responsabilidades

| Archivo | Rol |
|---|---|
| `background.js` | Service Worker principal. Maneja Native Messaging, clipboard monitor, routing de mensajes entre Host y Discovery Page |
| `discovery/index.html` | SPA de onboarding. Contiene todas las pantallas del flujo |
| `discovery/discovery.js` | Lógica de la SPA. Clases `DiscoveryFlow`, `OnboardingFlow`, `GithubAuthFlow`, `MultiProviderOnboarding` |
| `discovery/discoveryProtocol.js` | Protocolo de handshake visual — animaciones de stages, window layout |
| `discovery.synapse.config.js` | Config file inyectado por Sentinel/Ignition antes de abrir Chrome. Leído por `background.js` al inicializar |
| `content.js` | Content script genérico inyectado en todas las páginas |
| `discovery/content-aistudio.js` | Content script específico para AI Studio — detecta keys de Gemini vía clipboard y MutationObserver |

---

## 3. El config file — contrato de entrada principal

**Ruta:** `{extension_dir}/discovery.synapse.config.js`

**Generado por:** Sentinel (Go — `ignition_identity.go`, función `prepareSessionFiles`)

**Cuándo se genera:** Antes de abrir Chrome, en cada launch. No se modifica en caliente — si Chrome ya está abierto, el navigate llega por Native Messaging.

**Formato requerido (post fix de string step):**

```javascript
self.SYNAPSE_CONFIG = {
  "profileId":     "8aafd714-9034-4f27-833a-8452259aef65",  // camelCase — REQUERIDO
  "bridge_name":   "com.bloom.synapse.8aafd714",
  "launchId":      "014_8aafd714_204816",                    // camelCase — REQUERIDO
  "profile_alias": "MasterWorker",
  "mode":          "discovery",
  "extension_id":  "hpblclepliicmihaplldignhjdggnkdh",
  "launch_flags": {
    "register":   true,
    "heartbeat":  false,
    "service":    "github",
    "step":       "github_auth",    // STRING — no entero. "" si no hay step activo
    "alias":      "MasterWorker",
    "role":       "Worker",
    "email":      "",
    "mode":       "discovery",
    "linked_accounts": []
  }
};
```

**Reglas críticas del config file:**

`profileId` y `launchId` deben ser **camelCase**. Si llegan como `profile_id` / `launch_id` (snake_case), `background.js` tiene un fallback que los normaliza con un warning, pero el formato correcto es camelCase. Si ambos campos están ausentes o son `undefined`, `background.js` aborta la inicialización y nunca conecta al Host.

`step` debe ser un **string enum** — nunca un entero. Los valores válidos son exactamente los IDs de `onboarding_steps.json`: `"github_auth"`, `"nucleus_create"`, `"vault_init"`, `"google_auth"`, `"ai_provider_setup"`, `"project_create"`. Un string vacío `""` significa que no hay step activo — la Discovery Page rutea según `service`. El entero `0` es **falsy en JavaScript** y hace que `transitionToOnboarding()` ignore el step completamente.

`launch_flags` es el nodo canónico que lee `discovery.js`. Los campos en la raíz del config son legacy o para uso de `background.js` directamente.

---

## 4. Inicialización del Service Worker

`background.js` se inicializa en tres eventos: `onInstalled`, `onStartup`, y al top-level del script (cold-start activation). El guard `isInitialized` previene ejecución duplicada.

**Secuencia de inicialización:**

```
initialize()
  → loadConfig()
      → detectActiveMode()        // busca tabs con 'discovery' o 'landing' en la URL
      → importScripts(config.js)  // path primario
      → fetch(config.js)          // fallback si importScripts falla
      → validateConfig(mode)      // loguea campos faltantes
  → setupKeepalive()              // alarm cada 1 minuto → HEARTBEAT al Host
  → connectNative()               // handshake de 3 fases con bloom-host
```

**Detección de modo:** `background.js` no recibe el modo como parámetro — lo infiere buscando tabs abiertas con la URL de la extensión. Si hay una tab con `'discovery'` en el path, el modo es `discovery`. Si no, fallback a `chrome.storage.local.synapseMode`. Este mecanismo garantiza que al reiniciar Chrome con una tab de Discovery abierta, el Service Worker retoma el modo correcto automáticamente.

---

## 5. El handshake de 3 fases con bloom-host

Antes de que cualquier mensaje de negocio viaje al Host, el canal pasa por un handshake. Mensajes enviados antes de que `handshakeState === 'CONFIRMED'` son bloqueados silenciosamente.

```
Fase 1 — Extension → Host:
  { command: "extension_ready", profile_id, launch_id, extension_id, profile_alias, timestamp }

Fase 2 — Host → Extension:
  { command: "host_ready" }  (o event: "host_ready")
  Opcional: { window: { width, height, left, top } } para controlar el tamaño de ventana

Fase 3 — Extension → Host:
  { command: "handshake_confirm", profile_id, launch_id, extension_id, timestamp }
```

Solo después de Fase 3 el canal está activo (`handshakeState = 'CONFIRMED'`). El Host puede incluir un objeto `window` en el payload de `host_ready` para que `background.js` aplique dimensiones de ventana inmediatamente — esto es el API path para que bloom-host controle la ventana sin cambiar código de la extensión.

**Reconexión:** Si el Host se desconecta, `background.js` reintenta con backoff exponencial: `delay = 2000ms * 1.5^reconnectAttempts`, máximo 10 intentos.

---

## 6. Routing de mensajes — diagrama completo

```
bloom-host (Native Messaging)
    │
    ↓ handleHostMessage()
    │
    ├── host_ready              → Completa handshake (Fase 2+3)
    ├── API_KEY_REGISTERED      → handleAPIKeyResponse() → notifica Discovery Page
    ├── API_KEY_REGISTRATION_FAILED → handleAPIKeyResponse()
    ├── ACCOUNT_REGISTERED      → sendToHost() [forward de vuelta — confirmación]
    ├── onboarding_navigate     → chrome.tabs.sendMessage(discoveryTab, payload)
    ├── NAVIGATE                → chrome.tabs.update(url)
    ├── tab.create/close/navigate/query → executeCommand()
    └── window.close            → executeWindowClose()

Discovery Page / discovery.js
    │
    ↓ chrome.runtime.onMessage
    │
    ├── DISCOVERY_COMPLETE      → sendToHost()
    ├── ACCOUNT_REGISTERED      → sendToHost() [con profile_id, launch_id, service, email]
    ├── GITHUB_TOKEN_STORED     → sendToHost() [SOLO fingerprint — token nunca sale]
    ├── HEARTBEAT_SUCCESS       → sendToHost()
    ├── onboarding_started      → (solo log interno)
    ├── startClipboardMonitoring → startClipboardMonitoring()
    ├── stopClipboardMonitoring → stopClipboardMonitoring()
    ├── check_handshake_status  → responde { handshake_confirmed, status: 'pong' }
    └── window_layout_request   → applyWindowLayout(layout)

content-aistudio.js (AI Studio page)
    │
    ↓ chrome.runtime.sendMessage
    └── api_key_captured        → [manejado internamente — no documentado en onMessage]
```

---

## 7. El flujo github_auth — protocolo completo desde Cortex

### 7.1 Recepción del navigate

Cuando el Conductor llama `nucleus synapse onboarding <profileId> --step github_auth`, la señal viaja:

```
Conductor → nucleus → Brain TCP → bloom-host → Native Messaging → background.js
```

`handleHostMessage()` detecta `msg.command === 'onboarding_navigate'` y hace:

```javascript
chrome.tabs.query({ url: chrome.runtime.getURL('discovery.html') }, (tabs) => {
  chrome.tabs.sendMessage(tabs[0].id, {
    command: 'onboarding_navigate',
    payload: msg.payload || msg  // payload.step = "github_auth"
  });
});
```

**Punto de falla conocido:** La query busca tabs con URL `discovery.html`. Si la tab tiene otra URL (ej: `discovery/index.html`), la query devuelve array vacío y el navigate se pierde silenciosamente. El log dice `[BG] onboarding_navigate: no discovery tab found`.

### 7.2 Routing en discovery.js

`OnboardingFlow.setupListeners()` escucha el mensaje:

```javascript
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.command === 'onboarding_navigate' && msg.payload?.step) {
    window.BLOOM_VALIDATOR?.routeToStep?.(msg.payload.step);
  }
});
```

`routeToStep('github_auth')` en `DiscoveryFlow`:

```javascript
switch (step) {
  case 'github_auth':
    this.showScreen('github-login');
    if (!window.GITHUB_FLOW) {
      window.GITHUB_FLOW = new GithubAuthFlow(this);
      window.GITHUB_FLOW.init();
    }
    break;
  case 'google_auth':
    this.showScreen('google-login');
    break;
  default:
    this.routeToServiceFlow(this.serviceTarget);  // fallback
}
```

El fallback del `default` rutea a `provider-select` si `serviceTarget` es null — pantalla incorrecta, sin error visible.

### 7.3 La pantalla github-login — qué muestra y qué espera

La pantalla tiene un botón "Abrir GitHub" que abre:
```
https://github.com/settings/tokens/new?scopes=repo,read:org&description=Bloom+Conductor
```

Esta URL lleva al usuario directamente al formulario de token clásico con los scopes `repo` y `read:org` pre-seleccionados. El usuario todavía puede cambiar el tipo de token — si elige Fine-grained, el patrón `ghp_` no matchea y la detección falla silenciosamente.

### 7.4 El clipboard monitor — activación y detección

**El monitor NO arranca automáticamente al entrar a `github-login`.** Solo arranca cuando el usuario hace clic en "Abrir GitHub":

```javascript
btnOpen.addEventListener('click', () => {
  chrome.tabs.create({ url });
  this._startClipboardMonitor();  // aquí y solo aquí
  this._showWaitingState();
});
```

`_startClipboardMonitor()` envía `{ action: 'startClipboardMonitoring' }` a `background.js`, que ejecuta `startClipboardMonitoring()`.

**El monitor en background.js:**
- `setInterval` de 1 segundo
- Lee `navigator.clipboard.readText()`
- Compara con el último valor leído (evita procesar sin cambios)
- Testa contra `API_KEY_PATTERNS.github.regex`: `/^ghp_[A-Za-z0-9_]{36,}$/`
- Si matchea → emite `GITHUB_PAT_DETECTED` a `discovery.js` y detiene el monitor

**Separación de flujos para GitHub vs otros providers:**

```javascript
if (detected.provider === 'github') {
  // GitHub: el token va a discovery.js para guardado seguro en chrome.storage
  // El token NUNCA viaja al host
  chrome.runtime.sendMessage({ event: 'GITHUB_PAT_DETECTED', token: detected.key });
  stopClipboardMonitoring();
  return;
}

// Otros providers: van directamente al host (flujo original)
sendToHost({ event: 'API_KEY_DETECTED', provider, key, timestamp });
```

Esta bifurcación es deliberada y crítica para la seguridad. El token de GitHub nunca sale del navegador — solo el fingerprint.

### 7.5 Confirmación del token — pantalla github-confirm

`GithubAuthFlow._handleTokenDetected(token)`:
1. Calcula fingerprint: SHA-256 del token, primeros 8 chars hex
2. Construye preview: `token.substring(0, 8) + '****...'`
3. Llama `this.discovery.showScreen('github-confirm')`
4. Puebla los campos del recibo (preview, storage location, OS encryption label, fingerprint)
5. Guarda `this._pendingToken = token` — el token permanece en memoria hasta confirmar o rechazar

**Botones en github-confirm:**
- **Confirmar** → `_saveToken(token)`
- **Rechazar** → vuelve a `github-login` y reinicia el clipboard monitor

### 7.6 Guardado del token — `_saveToken(token)`

```
1. Lee chrome.storage.local.bloom_vault_temp (o crea {})
2. Escribe vault.github_token = token
3. Fetch best-effort a https://api.github.com/user con Authorization: token
   → Si OK: vault.github_user = user.login
   → Si falla: continúa sin username (no bloquea)
4. chrome.storage.local.set({ bloom_vault_temp: vault })
5. Calcula fingerprint SHA-256 (8 chars hex)
6. chrome.runtime.sendMessage({
     event: 'GITHUB_TOKEN_STORED',
     token_fingerprint: fingerprint,
     profile_id: SYNAPSE_CONFIG.profileId,
     launch_id: SYNAPSE_CONFIG.launchId
   })
7. chrome.storage.local.set({
     onboarding_state: {
       active: true,
       currentStep: 'github_auth_complete',
       githubUser: vault.github_user || null,
       startedAt: Date.now()
     }
   })
8. showScreen('github-stored')
```

### 7.7 GITHUB_TOKEN_STORED — el evento que sube al sistema

`background.js` recibe `GITHUB_TOKEN_STORED` y valida que `token_fingerprint` exista. Si falta, lo ignora. Si existe, reenvía al Host:

```javascript
sendToHost({
  type:              'GITHUB_TOKEN_STORED',
  profile_id:        msg.profile_id || config?.profileId,
  launch_id:         msg.launch_id  || config?.launchId,
  token_fingerprint: msg.token_fingerprint   // nunca el token real
});
```

Desde aquí, la cadena continúa fuera de Cortex:

```
bloom-host → Brain ServerManager → EventBus → Temporal Worker
→ ProfileLifecycle workflow: completed_steps: ["github_auth"]
→ nucleus.json actualizado
→ Poll del Conductor detecta el cambio → Screen 1 avanza
```

**Verificación de seguridad:** Buscar `ghp_` en todos los logs debe devolver 0 resultados. El token real nunca aparece en ningún mensaje de Native Messaging ni en ningún log del sistema.

---

## 8. Resume y cold-start — cómo Cortex retoma el step

### Cold-start (Chrome cerrado y reabierto)

Cuando Sentinel regenera el config file con el step actual y bloom-host reabre Chrome:

1. Service Worker se activa → `initialize()` → `loadConfig()`
2. Lee `discovery.synapse.config.js` — `launch_flags.step = "github_auth"` (string)
3. `background.js` lo expone en `config.step`
4. `DiscoveryFlow.loadSynapseConfig()` lee `flags.step` → `this.stepCurrent = "github_auth"`
5. `transitionToOnboarding()` detecta `this.stepCurrent` truthy → `routeToStep("github_auth")`
6. Chrome muestra `github-login` directamente

**Condición crítica:** El step debe ser un string no vacío y truthy. El valor `0` (entero) es falsy — `if (this.stepCurrent)` evalúa a `false` y el resume falla silenciosamente, mostrando la pantalla por defecto del `serviceTarget`.

### Hot resume (Chrome ya abierto)

Cuando el Conductor llama `nucleus synapse onboarding <profileId> --step github_auth` con Chrome abierto, `background.js` recibe el `onboarding_navigate` via Native Messaging y lo entrega a la Discovery Page. No se necesita reiniciar Chrome ni regenerar el config file.

---

## 9. Contratos de eventos — tabla completa

### Eventos que Cortex emite hacia bloom-host (via sendToHost)

| Evento | Cuándo | Campos requeridos | Campos opcionales |
|---|---|---|---|
| `extension_ready` | Fase 1 del handshake | `profile_id`, `launch_id`, `extension_id`, `profile_alias`, `timestamp` | — |
| `handshake_confirm` | Fase 3 del handshake | `profile_id`, `launch_id`, `extension_id`, `timestamp` | — |
| `DISCOVERY_COMPLETE` | Discovery Page conectada al Host | `payload.profile_id`, `payload.launch_id`, `payload.timestamp` | `payload.profile_alias`, `payload.ping_response` |
| `ACCOUNT_REGISTERED` | Cuenta registrada (Google, GitHub) | `profile_id`, `launch_id`, `service`, `timestamp` | `email` |
| `GITHUB_TOKEN_STORED` | Token GitHub guardado en vault_temp | `type='GITHUB_TOKEN_STORED'`, `profile_id`, `launch_id`, `token_fingerprint` | — |
| `HEARTBEAT` | Cada 1 minuto (keepalive alarm) | `event='HEARTBEAT'`, `profile_id`, `launch_id`, `timestamp`, `status='alive'` | — |
| `HEARTBEAT_SUCCESS` | Heartbeat de discovery page | `event`, `status`, `timestamp` | — |
| `API_KEY_DETECTED` | API key de provider no-GitHub detectada | `event`, `provider`, `key`, `timestamp` | — |

### Eventos que Cortex recibe desde bloom-host

| Evento/Comando | Efecto en Cortex |
|---|---|
| `host_ready` | Completa handshake (Fase 2). Opcional: `window` object para dimensiones |
| `onboarding_navigate` | Rutea Discovery Page al step indicado en `payload.step` (string) |
| `API_KEY_REGISTERED` | Notifica Discovery Page que la key fue registrada exitosamente |
| `API_KEY_REGISTRATION_FAILED` | Notifica Discovery Page del fallo |
| `ACCOUNT_REGISTERED` | Forward de confirmación — Cortex lo reenvía al Host (loop intencional de confirmación) |
| `tab.create` | Crea una nueva tab con la URL indicada |
| `tab.navigate` | Navega una tab existente a una URL |
| `tab.close` | Cierra una tab por ID |
| `tab.query` | Busca tabs por URL pattern |
| `window.close` | Cierra la ventana actual |
| `keepalive` | Acknowledgeado silenciosamente |

---

## 10. chrome.storage — qué escribe Cortex y qué nunca sale

### bloom_vault_temp (solo lectura para el sistema — Cortex es el único escritor)

```javascript
{
  github_token: "ghp_...",     // token real — NUNCA sale de chrome.storage
  github_user:  "username"     // resuelto via GitHub API (best-effort)
}
```

**Regla absoluta:** `bloom_vault_temp` es inaccesible para el Conductor, Sentinel, Brain, o cualquier componente fuera de Chrome. El Conductor sabe que el step fue completado únicamente porque `nucleus.json` lo dice — nunca porque leyó el vault.

### onboarding_state

```javascript
{
  active:      true,
  currentStep: 'github_auth_complete',   // o 'api_waiting', 'gemini_api_waiting'
  githubUser:  'username',               // null si el fetch falló
  startedAt:   1234567890
}
```

`background.js` escucha cambios en `onboarding_state` para activar/detener el clipboard monitor automáticamente cuando `currentStep` incluye `'api_waiting'` o `'gemini_api_waiting'`.

### synapseConfig y synapseStatus

`synapseConfig` persiste el config leído del archivo para uso de `discovery.js`. `synapseStatus` es el canal por el que `background.js` notifica a la Discovery Page que el handshake completó (`command: 'system_ready'`).

---

## 11. Patrones de detección de API keys

Todos los patrones viven en `API_KEY_PATTERNS` en `background.js`. Para agregar un nuevo provider, agregar una entrada ahí — no hay que tocar ningún otro archivo.

| Provider | Patrón regex | Prefijo esperado | Flujo post-detección |
|---|---|---|---|
| `github` | `/^ghp_[A-Za-z0-9_]{36,}$/` | `ghp_` | → `GITHUB_PAT_DETECTED` a discovery.js (token nunca al host) |
| `gemini` | `/^AIzaSy[A-Za-z0-9_-]{33}$/` | `AIzaSy` | → `API_KEY_DETECTED` al host directamente |
| `claude` | `/^sk-ant-api\d{2}-[A-Za-z0-9_-]{95,}$/` | `sk-ant-api` | → `API_KEY_DETECTED` al host directamente |
| `openai` | `/^sk-[A-Za-z0-9]{48}$/` | `sk-` | → `API_KEY_DETECTED` al host directamente |
| `xai` | `/^xai-[A-Za-z0-9_-]{32,}$/` | `xai-` | → `API_KEY_DETECTED` al host directamente |

**El patrón de GitHub está implementado** — fue agregado en v1.1.0 junto con el flujo `github_auth`. No es necesario modificar `background.js` para que el clipboard monitor detecte tokens `ghp_`.

---

## 12. Puntos de falla conocidos

| Falla | Síntoma visible | Causa | Dónde buscar en logs |
|---|---|---|---|
| `step` llega como entero `0` | Chrome muestra `provider-select` en lugar de `github-login` | Sentinel generó `"step": 0` en lugar de `"step": "github_auth"` | `[Synapse] Config loaded` — ver valor de `step` |
| Tab URL no matchea `discovery.html` | `onboarding_navigate` se pierde | La query busca `discovery.html` pero la URL real es `discovery/index.html` | `[BG] onboarding_navigate: no discovery tab found` |
| `profileId` o `launchId` ausentes | Cortex no conecta al Host, handshake nunca ocurre | Config file en snake_case sin fallback aplicado | `[Synapse] ✗ profileId or launchId missing` |
| Usuario no usa botón "Abrir GitHub" | Token copiado, clipboard monitor no detecta nada | Monitor solo arranca con el clic en el botón | Ausencia de `[Clipboard] Starting monitoring` |
| Token Fine-grained (`github_pat_`) | Monitor corre, no detecta nada, silencio total | Patrón `ghp_` no matchea `github_pat_` | `[Clipboard]` sin línea de detección |
| `GITHUB_TOKEN_STORED` sin fingerprint | Evento ignorado, cadena se rompe | `discovery.js` no calculó el fingerprint correctamente | `[Synapse] ⚠️ GITHUB_TOKEN_STORED sin fingerprint` |
| bloom-host no activo | Token guardado en vault_temp, cadena se rompe en Native Messaging | `connectionState !== 'CONNECTED'` | `[Synapse] ⚠ Cannot send - not connected` |
| Handshake no confirmado al enviar | Mensaje bloqueado silenciosamente | `sendToHost` bloquea si `handshakeState !== 'CONFIRMED'` | `[Synapse] ⚠️ Message blocked - Handshake not confirmed` |

---

## 13. Checklist de debugging — github_auth

Abrir Chrome DevTools → Extensions → Service Worker de Bloom Nucleus Bridge → Console.

**Verificar inicialización:**
```
✓ [Synapse] ✓ Config loaded via importScripts (discovery mode)
✓ [Synapse] ✓ All required config keys present
✓ [HANDSHAKE] ✓✓✓ HANDSHAKE COMPLETADO
```

**Verificar navigate:**
```
✓ [Onboarding] Remote navigate to step: github_auth
✓ [Discovery] routeToStep() - step: github_auth
✓ [Discovery] Routing to github_auth flow
✓ [Discovery] Screen activated: github-login
```

**Verificar detección del token:**
```
✓ [Clipboard] Starting monitoring...
✓ [Clipboard] ✓ API Key detected: GitHub
✓ [GithubAuthFlow] Token detected — showing confirmation receipt
```

**Verificar guardado y emisión:**
```
✓ [GithubAuthFlow] Saving token to bloom_vault_temp
✓ [GithubAuthFlow] GitHub user resolved: <username>
✓ [GithubAuthFlow] github_auth step complete. Fingerprint: <8chars>
✓ [Synapse] ✓ GITHUB_TOKEN_STORED — forwarding fingerprint to host
```

**Verificación de seguridad — ninguno de estos debe aparecer:**
```
✗ ghp_  ← si aparece en cualquier log, es un bug crítico de seguridad
```

---

*Documento generado a partir del análisis del código fuente de Cortex: `background.js` v1.1.0, `discovery.js` v1.1.0, `manifest.json` v2.0.0. Actualizar cuando cambien los contratos de eventos, los patrones de API keys, o el formato del config file.*
