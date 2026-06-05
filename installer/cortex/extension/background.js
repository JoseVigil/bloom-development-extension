// ============================================================================
// SYNAPSE THIN CLIENT - ROUTER CON HANDSHAKE DE 3 FASES
// ============================================================================

let nativePort = null;
let connectionState = 'DISCONNECTED';
let handshakeState = 'NONE'; // NONE | EXTENSION_READY | HOST_READY | CONFIRMED
let config = null;
let reconnectAttempts = 0;
let isInitialized = false;

const MAX_RECONNECT = 10;
const BASE_DELAY = 2000;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function detectActiveMode() {
  const tabs = await chrome.tabs.query({});
  
  const hasDiscovery = tabs.some(t => 
    t.url?.includes(chrome.runtime.id) && t.url?.includes('discovery')
  );
  
  const hasLanding = tabs.some(t => 
    t.url?.includes(chrome.runtime.id) && t.url?.includes('landing')
  );
  
  if (hasDiscovery) return 'discovery';
  if (hasLanding) return 'landing';
  
  const { synapseMode } = await chrome.storage.local.get(['synapseMode']);
  return synapseMode || 'discovery';
}

function validateConfig(mode) {
  if (!config) {
    console.error('[Synapse] ✗ Config is null or undefined');
    return;
  }

  const requiredBase = ['profileId', 'bridge_name', 'launchId', 'profile_alias', 'extension_id'];
  
  let requiredDiscovery = ['register'];
  if (config.register === true) {
    // FIX (v3.1): Email no está disponible en el flujo de GitHub al momento
    // del boot — GithubAuthFlow todavía no tiene email del usuario.
    // Solo requerir email cuando el service NO es 'github'.
    // Para todos los demás providers (google, gemini) sigue siendo obligatorio.
    const isGithubFlow = config.service === 'github';
    if (!isGithubFlow) {
      requiredDiscovery.push('email');
    }
  }
  
  const requiredLanding = ['total_launches', 'uptime', 'intents_done', 'last_synch'];

  const required = [
    ...requiredBase,
    ...(mode === 'discovery' ? requiredDiscovery : requiredLanding)
  ];

  const missing = required.filter(key => config[key] === undefined);

  if (missing.length > 0) {
    console.error(`[Synapse] ✗ Missing config keys (${mode} mode):`, missing);
    console.error('[Synapse] Current config:', config);
    console.error('[Synapse] Required keys:', required);
    
    if (missing.includes('email') && config.register === true) {
      console.error('[Synapse] ℹ️  Email is required because register=true');
    }
  } else {
    console.log(`[Synapse] ✓ All required config keys present (${mode} mode)`);
    console.log('[Synapse] Config summary:', {
      mode: config.mode,
      profileId: config.profileId,
      bridge_name: config.bridge_name,
      profile_alias: config.profile_alias,
      register: config.register,
      hasEmail: !!config.email,
      emailRequired: config.register === true
    });
  }
}

// ============================================================================
// INIT
// ============================================================================

async function initialize() {
  if (isInitialized) {
    console.log('[Synapse] Already initialized - skipping duplicate call');
    return;
  }
  
  console.log('[Synapse] Initializing...');
  isInitialized = true;
  
  await loadConfig();

  // FIX: Verificar que profileId y launchId existen antes de conectar.
  // Si el config file usa snake_case (profile_id/launch_id) en vez de
  // camelCase (profileId/launchId), los regex matchers fallan silenciosamente
  // y estos campos quedan undefined. En JSON.stringify, undefined se omite,
  // por lo que el host recibe el mensaje sin esos campos y profile.empty()
  // devuelve true — el logger nunca se inicializa.
  if (!config) {
    console.error('[Synapse] ✗ Config failed to load — aborting connection');
    isInitialized = false;
    return;
  }

  if (!config.profileId || !config.launchId) {
    console.error('[Synapse] ✗ profileId or launchId missing from config — aborting connection');
    console.error('[Synapse] config.profileId:', config.profileId);
    console.error('[Synapse] config.launchId:', config.launchId);
    console.error('[Synapse] Full config dump:', JSON.stringify(config, null, 2));
    console.error('[Synapse] ℹ️  Verify that the config file uses "profileId" and "launchId" (camelCase)');
    isInitialized = false;
    return;
  }

  setupKeepalive();
  connectNative();
}

async function loadConfig() {
  try {
    const mode = await detectActiveMode();
    console.log('[Synapse] Active mode detected:', mode);

    const baseMatchers = {
      profileId: /"profileId"\s*:\s*"([^"]+)"/,
      bridge_name: /"bridge_name"\s*:\s*"([^"]+)"/,
      launchId: /"launchId"\s*:\s*"([^"]+)"/,
      profile_alias: /"profile_alias"\s*:\s*"([^"]+)"/,
      extension_id: /"extension_id"\s*:\s*"([^"]+)"/
    };

    const registerMatcher = {
      register: /"register"\s*:\s*(true|false)/
    };

    const emailMatcher = {
      email: /"email"\s*:\s*"([^"]+)"/
    };

    // step: paso de onboarding activo inyectado por Ignition (Gap 2)
    // FIX Bug 1 (v3.0): step es un string ("" o "github_auth"), no un entero.
    // La regex anterior (\d+) fallaba silenciosamente con cualquier valor string.
    const stepMatcher = {
      step: /"step"\s*:\s*"([^"]*)"/
    };

    // service: providers de registro activos inyectados por Ignition
    // FIX Bug 2 (v3.0): [^"]+ requería al menos un carácter — fallaba con service:"".
    // Cambiado a [^"]* para aceptar string vacío.
    const serviceMatcher = {
      service: /"service"\s*:\s*"([^"]*)"/
    };

    const landingMatchers = {
      total_launches: /"total_launches"\s*:\s*(\d+)/,
      uptime: /"uptime"\s*:\s*(\d+)/,
      intents_done: /"intents_done"\s*:\s*(\d+)/,
      last_synch: /"last_synch"\s*:\s*"([^"]+)"/
    };

    const configFile = mode === 'discovery' 
      ? 'discovery.synapse.config.js'
      : 'landing.synapse.config.js';

    console.log('[Synapse] Loading config file:', configFile);

    try {
      console.log('[Synapse] Attempting importScripts...');
      importScripts(configFile);
      
      if (self.SYNAPSE_CONFIG) {
        config = { ...self.SYNAPSE_CONFIG, mode };
        console.log(`[Synapse] ✓ Config loaded via importScripts (${mode} mode):`, config);

        // FIX: Normalizar claves snake_case a camelCase por si el config
        // file usa profile_id / launch_id en lugar de profileId / launchId.
        // Esto cubre el caso donde Ignition genera el config con snake_case.
        if (!config.profileId && config.profile_id) {
          console.warn('[Synapse] ⚠️  profileId not found — falling back to profile_id (snake_case)');
          config.profileId = config.profile_id;
        }
        if (!config.launchId && config.launch_id) {
          console.warn('[Synapse] ⚠️  launchId not found — falling back to launch_id (snake_case)');
          config.launchId = config.launch_id;
        }
        
        await chrome.storage.local.set({ synapseMode: mode });
        validateConfig(mode);

        // Enforce window dimensions for discovery mode
        if (mode === 'discovery') {
          enforceDiscoveryWindowSize();
        }

        return;
      } else {
        throw new Error('SYNAPSE_CONFIG not defined after importScripts');
      }
      
    } catch (importError) {
      console.warn('[Synapse] importScripts failed:', importError.message);
      console.log('[Synapse] Attempting fetch fallback...');
      
      try {
        const url = chrome.runtime.getURL(configFile);
        console.log('[Synapse] Fetching from URL:', url);
        
        const resp = await fetch(url);
        
        if (!resp.ok) {
          throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
        }
        
        const text = await resp.text();
        console.log('[Synapse] Config file content length:', text.length);
        console.log('[Synapse] First 200 chars:', text.substring(0, 200));
        
        config = { mode };
        
        const initialMatchers = {
          ...baseMatchers,
          ...(mode === 'discovery' ? registerMatcher : landingMatchers),
          ...stepMatcher,
          ...serviceMatcher
        };
        
        for (const [key, regex] of Object.entries(initialMatchers)) {
          const match = text.match(regex);
          
          if (match) {
            let value;
            if (key === 'register') {
              value = match[1] === 'true';
            } else if (['total_launches', 'uptime', 'intents_done'].includes(key)) {
              // FIX (v3.0): 'step' removido de esta lista — es string, no entero.
              value = parseInt(match[1], 10);
            } else {
              value = match[1];
            }
            
            config[key] = value;
            console.log(`[Synapse] ✓ Parsed ${key}:`, value);
          } else {
            console.warn(`[Synapse] ✗ Could not parse ${key} with regex:`, regex);
          }
        }

        // FIX: Si los matchers camelCase fallaron (el config usa snake_case),
        // intentar también con snake_case para profileId y launchId.
        if (!config.profileId) {
          const snakeMatch = text.match(/"profile_id"\s*:\s*"([^"]+)"/);
          if (snakeMatch) {
            config.profileId = snakeMatch[1];
            console.warn('[Synapse] ⚠️  profileId parsed from snake_case key "profile_id":', config.profileId);
          }
        }
        if (!config.launchId) {
          const snakeMatch = text.match(/"launch_id"\s*:\s*"([^"]+)"/);
          if (snakeMatch) {
            config.launchId = snakeMatch[1];
            console.warn('[Synapse] ⚠️  launchId parsed from snake_case key "launch_id":', config.launchId);
          }
        }
        
        if (mode === 'discovery' && config.register === true) {
          // FIX (v3.2): Misma excepción que validateConfig() — GitHub no tiene
          // email en este step (se resuelve después via api.github.com/user).
          const isGithubFlow = config.service === 'github';
          if (!isGithubFlow) {
            const emailMatch = text.match(emailMatcher.email);
            if (emailMatch) {
              config.email = emailMatch[1];
              console.log(`[Synapse] ✓ Parsed email:`, config.email);
            } else {
              console.warn(`[Synapse] ✗ Could not parse email (required when register=true, service: ${config.service})`);
            }
          } else {
            config.email = '';
            console.log(`[Synapse] ℹ️  Email skipped for github flow (clipboard-based auth)`);
          }
        }

        console.log(`[Synapse] ✓ Config loaded via fetch (${mode} mode):`, config);
        
      } catch (fetchError) {
        console.error('[Synapse] ✗ Fetch failed:', fetchError);
        throw fetchError;
      }
    }

    await chrome.storage.local.set({ synapseMode: mode });
    validateConfig(mode);

    // Enforce window dimensions for discovery mode
    if (mode === 'discovery') {
      await enforceDiscoveryWindowSize(); // FIX: await para evitar concurrencia con loadHarnessConfig
    }

    // ── HARNESS SIEMPRE ACTIVO ────────────────────────────────────────────
    // Intentar cargar harness.synapse.config.js independientemente del modo
    // y del flag --dev. Si el archivo no existe la extensión simplemente
    // omite el Harness sin romper nada. Si existe, el Harness queda operativo
    // en cualquier perfil, incluyendo producción.
    await loadHarnessConfig();

  } catch (e) {
    console.error('[Synapse] ✗ Config load failed:', e);
    console.error('[Synapse] Stack trace:', e.stack);
  }
}

// ============================================================================
// HARNESS CONFIG — siempre activo (no requiere --dev)
// ============================================================================

/**
 * loadHarnessConfig()
 *
 * Carga harness.synapse.config.js (formato: self.HARNESS_CONFIG = {...}).
 * Si el archivo no existe → Harness inactivo, sin romper nada.
 * Si existe → parsea config, abre harness/index.html en una tab background.
 *
 * NUNCA eval() ni new Function() — violan CSP de Chrome Extensions.
 * El archivo debe estar en web_accessible_resources del manifest.
 *
 * FIX v4: Control flow lineal sin returns intermedios en la rama de éxito.
 * Todo el flujo (fetch → parse → open tab) ocurre dentro de un único bloque
 * try/catch principal. Los returns solo existen en casos de error real.
 */
async function loadHarnessConfig() {
  console.log('[Harness] >>>>>> loadHarnessConfig v4 EJECUTANDO <<<<<<');

  const harnessFile = 'harness.synapse.config.js';
  let harnessConfig = null;

  // ── Intento 1: importScripts (falla en MV3 post-install, se ignora) ───────
  try {
    importScripts(harnessFile);
    if (self.HARNESS_CONFIG) {
      console.log('[Harness] ✓ Loaded via importScripts');
      const hc = self.HARNESS_CONFIG;
      harnessConfig = {
        profileId:    hc.profileId,
        launchId:     hc.launchId,
        profileAlias: hc.profileAlias,
        generatedAt:  hc.generatedAt
      };
    }
  } catch (importErr) {
    console.log('[Harness] importScripts failed (esperado en MV3), usando fetch:', importErr.message);
  }

  // ── Intento 2: fetch + regex ───────────────────────────────────────────────
  if (!harnessConfig) {
    console.log('[Harness] Intentando fetch fallback...');
    let text = null;

    try {
      const url = chrome.runtime.getURL(harnessFile);
      console.log('[Harness] Fetching:', url);
      const resp = await fetch(url);
      console.log('[Harness] Fetch response status:', resp.status, resp.ok ? 'OK' : 'NOT OK');

      if (!resp.ok) {
        console.log('[Harness] Archivo no encontrado (HTTP ' + resp.status + ') — Harness inactivo');
        return;
      }

      text = await resp.text();
      console.log('[Harness] Contenido recibido, length:', text.length);
      console.log('[Harness] Primeros 150 chars:', text.substring(0, 150));

    } catch (fetchErr) {
      console.error('[Harness] ✗ Fetch error:', fetchErr.message);
      return;
    }

    // Parsear con regex — igual que loadConfig()
    harnessConfig = {};
    const matchers = {
      profileId:    /["']?profileId["']?\s*:\s*["']([^"']+)["']/,
      launchId:     /["']?launchId["']?\s*:\s*["']([^"']+)["']/,
      profileAlias: /["']?profileAlias["']?\s*:\s*["']([^"']+)["']/,
      generatedAt:  /["']?generatedAt["']?\s*:\s*["']([^"']+)["']/
    };
    for (const [key, regex] of Object.entries(matchers)) {
      const match = text.match(regex);
      if (match) {
        harnessConfig[key] = match[1];
        console.log('[Harness] ✓ Parsed', key + ':', match[1]);
      } else {
        console.warn('[Harness] ✗ No match para:', key);
      }
    }

    if (!harnessConfig.profileId) {
      console.error('[Harness] ✗ profileId no parseado — Harness inactivo. Contenido del archivo:', text);
      return;
    }

    console.log('[Harness] ✓ Config parseado correctamente:', JSON.stringify(harnessConfig));
  }

  // ── Guardar en config global ──────────────────────────────────────────────
  config.harness = harnessConfig;
  console.log('[Harness] ✓ config.harness seteado. Procediendo a abrir tab...');

  // ── Abrir harness/index.html ── DENTRO del mismo bloque de éxito ──────────
  // FIX v4: openHarnessTab() se llama inline aquí, no como función separada,
  // para garantizar que no haya corte de control flow entre el parse y la apertura.
  try {
    const harnessUrl = chrome.runtime.getURL('harness/index.html');
    console.log('[Harness] URL a abrir:', harnessUrl);

    const allTabs = await chrome.tabs.query({});
    console.log('[Harness] Total tabs en el browser:', allTabs.length);

    const existingTab = allTabs.find(t => t.url && t.url.startsWith(harnessUrl));

    if (existingTab) {
      console.log('[Harness] Tab existente encontrada (id:', existingTab.id + ') — trayendo al frente');
      await chrome.tabs.update(existingTab.id, { active: true });
      console.log('[Harness] ✓ Tab traída al frente');
    } else {
      console.log('[Harness] No existe tab de harness — creando nueva...');
      const newTab = await chrome.tabs.create({ url: harnessUrl, active: false });
      console.log('[Harness] ✓ Tab creada exitosamente — id:', newTab.id, '| url:', harnessUrl);
    }
  } catch (tabErr) {
    console.error('[Harness] ✗ Error abriendo tab:', tabErr.message);
    console.error('[Harness] Stack:', tabErr.stack);
  }

  console.log('[Harness] >>>>>> loadHarnessConfig v4 COMPLETADO <<<<<<');
}

/**
 * openHarnessTab()
 * Versión standalone — para llamadas externas (ej: desde mensajes IPC).
 */
async function openHarnessTab() {
  try {
    const harnessUrl = chrome.runtime.getURL('harness/index.html');
    console.log('[Harness] openHarnessTab() — URL:', harnessUrl);

    const allTabs = await chrome.tabs.query({});
    const existingTab = allTabs.find(t => t.url && t.url.startsWith(harnessUrl));

    if (existingTab) {
      await chrome.tabs.update(existingTab.id, { active: true });
      console.log('[Harness] ✓ Tab existente traída al frente (id:', existingTab.id + ')');
    } else {
      const newTab = await chrome.tabs.create({ url: harnessUrl, active: false });
      console.log('[Harness] ✓ Tab creada (id:', newTab.id + ')');
    }
  } catch (tabErr) {
    console.error('[Harness] ✗ openHarnessTab error:', tabErr.message, tabErr.stack);
  }
}



/**
 * applyWindowLayout(layout)
 *
 * Applies a window layout descriptor to the current Chromium window.
 * This is the single point of truth for window sizing/positioning in the
 * extension. All callers funnel through here.
 *
 * IMPORTANT: `left` and `top` must be pre-resolved by the caller.
 * background.js runs as a service worker — `screen` / `window.screen`
 * are not available here. Coordinate resolution happens in
 * discoveryProtocol.getWindowLayout(), which runs in page context.
 *
 * @param {object} layout — { width, height, left, top, state }
 */
async function applyWindowLayout(layout = {}) {
  const {
    width  = 600,
    height = 800,
    left,
    top,
    state  = 'normal'
  } = layout;

  try {
    const win = await chrome.windows.getCurrent({ populate: false });

    if (!win || win.type !== 'normal') {
      console.warn('[Synapse] applyWindowLayout: not a normal window, skipping');
      return;
    }

    const updateProps = { width, height, state };

    // Only set position if the caller resolved coordinates.
    // Without screen access, we can't compute a fallback here.
    if (typeof left === 'number') updateProps.left = left;
    if (typeof top  === 'number') updateProps.top  = top;

    await chrome.windows.update(win.id, updateProps);

    console.log(`[Synapse] ✓ Window layout applied: ${width}×${height}`, updateProps);

  } catch (e) {
    console.error('[Synapse] ✗ applyWindowLayout failed:', e);
  }
}

/**
 * enforceDiscoveryWindowSize()
 *
 * Fallback called from loadConfig when mode === 'discovery'.
 * Only sets dimensions — no position, since screen is unavailable in a
 * service worker. The protocol's requestWindowLayout() will follow
 * shortly with fully-resolved coordinates from page context.
 */
async function enforceDiscoveryWindowSize() {
  await applyWindowLayout({ width: 600, height: 800, state: 'normal' });
}

// ============================================================================
// NATIVE CONNECTION - CON HANDSHAKE DE 3 FASES
// ============================================================================

function connectNative() {
  if (!config?.bridge_name) {
    console.error('[Synapse] ✗ No bridge_name in config');
    return;
  }

  if (nativePort !== null) {
    console.warn('[Synapse] Native port already exists - skipping reconnect');
    return;
  }

  connectionState = 'CONNECTING';
  handshakeState = 'NONE';

  try {
    nativePort = chrome.runtime.connectNative(config.bridge_name);

    nativePort.onMessage.addListener(handleHostMessage);
    nativePort.onDisconnect.addListener(handleDisconnect);

    // � FASE 1: Extension → Host (extension_ready)
    // FIX: Construir el mensaje explícitamente y loguearlo antes de enviarlo.
    // Si profile_id o launch_id son undefined, JSON.stringify los omite
    // silenciosamente y el host recibe un objeto sin esos campos —
    // profile.empty() devuelve true y el logger nunca se inicializa.
    const extensionReadyMsg = {
      command:       "extension_ready",
      profile_id:    config.profileId,
      launch_id:     config.launchId,
      extension_id:  config.extension_id || chrome.runtime.id,
      profile_alias: config.profile_alias,
      timestamp:     Date.now()
    };

    console.log('[HANDSHAKE] FASE 1: Extension → Host (extension_ready)');
    console.log('[HANDSHAKE] Payload:', JSON.stringify(extensionReadyMsg));

    nativePort.postMessage(extensionReadyMsg);

    handshakeState = 'EXTENSION_READY';
    connectionState = 'CONNECTED';
    reconnectAttempts = 0;

    console.log('[Synapse] ✓ Connected to native host - Waiting for host_ready...');
    
  } catch (e) {
    console.error('[Synapse] ✗ Native connection failed:', e);
    connectionState = 'DISCONNECTED';
    handshakeState = 'NONE';
    nativePort = null;
    scheduleReconnect();
  }
}

function handleDisconnect() {
  const error = chrome.runtime.lastError;
  console.warn('[Synapse] ⚠️ Native host disconnected:', error?.message || 'Unknown');

  connectionState = 'DISCONNECTED';
  handshakeState = 'NONE';
  nativePort = null;

  scheduleReconnect();
}

function scheduleReconnect() {
  if (reconnectAttempts >= MAX_RECONNECT) {
    console.error('[Synapse] ✗ Max reconnect attempts reached');
    return;
  }

  const delay = BASE_DELAY * Math.pow(1.5, reconnectAttempts);
  reconnectAttempts++;

  console.log(`[Synapse] ⏱️ Reconnecting in ${delay}ms (attempt ${reconnectAttempts}/${MAX_RECONNECT})`);

  setTimeout(() => {
    console.log('[Synapse] � Attempting reconnect...');
    connectNative();
  }, delay);
}

// ============================================================================
// HOST MESSAGE HANDLING - CON HANDSHAKE DE 3 FASES
// ============================================================================

function handleHostMessage(msg) {
  const label = msg.event || msg.command || msg.type || '(unknown)';
  console.log(`[Host → Synapse] [${new Date().toISOString()}] ${label}`, msg);

  // � FASE 2: Host → Extension (host_ready)
  if (msg.command === 'host_ready' || msg.event === 'host_ready') {

    console.log('[HANDSHAKE] FASE 2: Host → Extension (host_ready) ✓');
    handshakeState = 'HOST_READY';
    
    // � FASE 3: Extension → Host (handshake_confirm)
    console.log('[HANDSHAKE] FASE 3: Extension → Host (handshake_confirm)');
    
    nativePort.postMessage({
      command:      "handshake_confirm",
      profile_id:   config.profileId,
      launch_id:    config.launchId,
      extension_id: config.extension_id || chrome.runtime.id,
      timestamp:    Date.now()
    });
    
    handshakeState = 'CONFIRMED';
    console.log('[HANDSHAKE] ✓✓✓ HANDSHAKE COMPLETADO - Canal seguro establecido');

    // If the host_ready payload includes a window layout override, apply it now.
    // This is the Cortex API path — the native host can control window
    // dimensions/position at launch time without changing the extension code.
    if (msg.window) {
      console.log('[HANDSHAKE] Applying window layout from host payload:', msg.window);
      applyWindowLayout(msg.window);
    }
    
    // Notificar a discovery/landing que el handshake está completo
    chrome.runtime.sendMessage({
      event: 'HANDSHAKE_CONFIRMED',
      timestamp: Date.now()
    }).catch(() => {
      // Silently fail if no listeners
    });
    
    return;
  }

  // Bloquear mensajes antes de confirmar handshake
  if (handshakeState !== 'CONFIRMED' && handshakeState !== 'HOST_READY') {
    console.warn('[Synapse] ⚠️ Message blocked - Handshake not confirmed');
    return;
  }

  // API Key responses
  if (msg.event === 'API_KEY_REGISTERED' || 
      msg.event === 'API_KEY_REGISTRATION_FAILED') {
    handleAPIKeyResponse(msg);
    return;
  }

  // Landing responses — forward a la landing page
  // .catch(() => {}) es intencional: la landing puede no estar abierta cuando llega la respuesta.
  if (['PROFILE_LOADED', 'HEALTH_CHECK_RESULT',
       'NUCLEUS_SYNC_RESULT', 'INTENT_LIST_RESULT'].includes(msg.event)) {
    console.log('[Synapse] Landing response → forwarding to landing page:', msg.event);
    chrome.runtime.sendMessage(msg).catch(() => {});
    return;
  }

  // ─────────────────────────────────────────────────────────────────────
  // Categoría 3: IonPump events — forward al Harness y landing
  //
  // Brain emite estos eventos cuando IonPump completa un flujo, recarga
  // recipes o responde a un inspect. El Harness los escucha en su Feed.
  // ─────────────────────────────────────────────────────────────────────
  const IONPUMP_EVENTS = [
    'ION_FLOW_STARTED',
    'ION_FLOW_COMPLETED',
    'ION_FLOW_ERROR',
    'ION_RELOAD_DONE',
    'ION_RELOAD_FAILED',
    'ION_INSPECT_RESULT'
  ];

  if (IONPUMP_EVENTS.includes(msg.event)) {
    console.log('[IonPump] ←', msg.event, msg.site || '');
    chrome.runtime.sendMessage(msg).catch(() => {});
    return;
  }

  // ─────────────────────────────────────────────────────────────────────
  // Categoría 4: IonPump DOM commands — forward a content.js en la tab
  //
  // IonPump genera estos comandos para operar el DOM de una tab concreta.
  // background los recibe via Native Messaging y los despacha al
  // content script correcto con chrome.tabs.sendMessage (NO runtime).
  // El ACK de content.js se reenvía de vuelta al host para que IonPump
  // pueda continuar el flujo.
  // ─────────────────────────────────────────────────────────────────────
  const DOM_COMMANDS = [
    'DOM_CLICK', 'DOM_TYPE', 'DOM_WAIT',
    'DOM_FOCUS', 'DOM_SCROLL', 'DOM_EXTRACT',
    'DOM_NAVIGATE',   // navega a una URL
    'DOM_WATCH',      // registra MutationObserver para signals
    'DOM_WATCH_URL',  // intercepta pushState/popstate
    'DOM_UNWATCH'     // desconecta observers al salir de página
  ];

  if (DOM_COMMANDS.includes(msg.command)) {
    const tabId = msg.tab_id;

    if (!tabId) {
      console.warn('[IonPump] ⚠️ DOM command sin tab_id:', msg.command);
      return;
    }

    console.log('[IonPump] DOM →', msg.command, 'tab:', tabId);

    chrome.tabs.sendMessage(tabId, msg, (response) => {
      // Forwarda el ACK de content.js de vuelta al host para que IonPump lo reciba.
      // Best-effort: si content.js no responde, no bloquear.
      if (response) {
        sendToHost({
          event:     'DOM_COMMAND_ACK',
          command:   msg.command,
          tab_id:    tabId,
          response:  response,
          timestamp: Date.now()
        });
      }
    });

    return;
  }

  // ─────────────────────────────────────────────────────────────────────
  // ACCOUNT_REGISTERED — confirmación de cuenta registrada desde Sentinel
  //
  // Flujo: discovery.js → ACCOUNT_REGISTERED → background.js (aquí)
  //        → sendToHost → bloom-host → Sentinel → Nucleus
  //        → nucleus synapse status devuelve identity con la cuenta activa
  //
  // El mensaje que llega desde discovery.js tiene la forma:
  // {
  //   event: 'ACCOUNT_REGISTERED',
  //   profile_id: string,   // REQUERIDO para correlación en Nucleus
  //   launch_id:  string,   // REQUERIDO para correlación en Nucleus
  //   service:    string,   // 'google' | 'gemini' | 'github'
  //   email:      string,   // dirección de la cuenta registrada
  //   timestamp:  number
  // }
  //
  // NOTA: Si profile_id o launch_id están ausentes, Nucleus no puede
  // correlacionar el registro. Se loguea un warning pero se forwardea
  // igual para no bloquear el flujo — Nucleus debe tolerar este caso.
  // ─────────────────────────────────────────────────────────────────────
  if (msg.event === 'ACCOUNT_REGISTERED') {
    if (!msg.profile_id || !msg.launch_id) {
      console.warn('[Synapse] ⚠️ ACCOUNT_REGISTERED recibido sin profile_id/launch_id — forwarding de todas formas');
    }

    console.log('[Synapse] ✓ ACCOUNT_REGISTERED → forwarding to native host:', msg.service, msg.email || '');

    sendToHost({
      event:      'ACCOUNT_REGISTERED',
      profile_id: msg.profile_id  || config?.profileId,
      launch_id:  msg.launch_id   || config?.launchId,
      service:    msg.service,
      email:      msg.email       || '',
      timestamp:  msg.timestamp   || Date.now()
    });

    return;
  }

  // Navigation command
  if (msg.type === 'NAVIGATE' && msg.payload?.url) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.update(tabs[0].id, { url: msg.payload.url });
      }
    });
    return;
  }

  // Message routing
  if (msg.target) {
    forwardToContent(msg);
    return;
  }

  // Onboarding navigate — señal remota desde nucleus CLI
  // Ruta: Brain TCP → bloom-host → Native Messaging → background.js → discovery.js
  // Usar `return` para prevenir reenvío al Brain (loop prevention).
  if (msg.command === 'onboarding_navigate') {
    // FIX: La URL real de la tab es discovery/index.html, no discovery.html.
    // getURL('discovery.html') resuelve a una ruta que no existe — la query
    // devolvía array vacío en todos los casos y el navigate se perdía silenciosamente.
    chrome.tabs.query({ url: chrome.runtime.getURL('discovery/index.html') }, (tabs) => {
      if (!tabs || tabs.length === 0) {
        console.warn('[BG] onboarding_navigate: no discovery tab found');
        return;
      }
      // Enviar solo a la primera tab de discovery activa
      chrome.tabs.sendMessage(tabs[0].id, {
        command: 'onboarding_navigate',
        payload: msg.payload || msg
      });
    });
    return; // ← CRÍTICO: previene reenvío al Brain
  }

  // Generic commands
  if (msg.command) {
    executeCommand(msg);
    return;
  }

  // Broadcast to all tabs
  if (msg.event) {
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, msg).catch(() => {});
      });
    });
  }
}

// ============================================================================
// COMMAND EXECUTION
// ============================================================================

function executeCommand(msg) {
  const { command, payload, id: msgId } = msg;

  switch (command) {
    case 'tab.create':
      executeTabCreate(payload, msgId);
      break;

    case 'tab.close':
      executeTabClose(payload.tab_id, msgId);
      break;

    case 'tab.navigate':
      executeTabNavigate(payload.tab_id, payload, msgId);
      break;

    case 'tab.query':
      executeTabQuery(payload, msgId);
      break;

    case 'window.close':
      executeWindowClose(msgId);
      break;

    case 'keepalive':
      // Silently acknowledge host keepalive
      break;

    default:
      console.warn('[Synapse] ⚠ Unknown command:', command);
      respondToHost(msgId, { success: false, error: 'Unknown command' });
  }
}

function executeTabCreate(payload, msgId) {
  chrome.tabs.create(
    { url: payload.url, active: payload.active !== false },
    (tab) => {
      respondToHost(msgId, {
        success: !chrome.runtime.lastError,
        tab_id: tab?.id,
        error: chrome.runtime.lastError?.message
      });
    }
  );
}

function executeTabClose(tabId, msgId) {
  chrome.tabs.remove(tabId, () => {
    respondToHost(msgId, {
      success: !chrome.runtime.lastError,
      error: chrome.runtime.lastError?.message
    });
  });
}

function executeTabNavigate(tabId, payload, msgId) {
  chrome.tabs.update(tabId, { url: payload.url }, () => {
    respondToHost(msgId, {
      success: !chrome.runtime.lastError,
      error: chrome.runtime.lastError?.message
    });
  });
}

function executeTabQuery(payload, msgId) {
  const query = payload.url_pattern ? { url: payload.url_pattern } : {};

  chrome.tabs.query(query, (tabs) => {
    respondToHost(msgId, {
      success: true,
      tabs: tabs.map(t => ({
        id: t.id,
        url: t.url,
        title: t.title,
        active: t.active
      }))
    });
  });
}

function executeWindowClose(msgId) {
  chrome.windows.getCurrent((w) => {
    chrome.windows.remove(w.id);
  });
}

async function forwardToContent(msg) {
  const { target, id } = msg;

  let tabId;
  if (target === 'active') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      respondToHost(id, { success: false, error: 'No active tab' });
      return;
    }
    tabId = tab.id;
  } else {
    tabId = target;
  }

  chrome.tabs.sendMessage(tabId, msg, (resp) => {
    respondToHost(id, resp || {
      success: !chrome.runtime.lastError,
      error: chrome.runtime.lastError?.message
    });
  });
}

// ============================================================================
// CONTENT MESSAGES
// ============================================================================

chrome.runtime.onMessage.addListener((msg, sender, sendResp) => {
  const { event, command } = msg;

  // ─────────────────────────────────────────────────────────────────────
  // LANDING COMMAND HANDLERS — Contrato explícito Landing ↔ Brain
  // Estos handlers deben ir ANTES del fallback genérico executeBrainCommand.
  // ─────────────────────────────────────────────────────────────────────

  // Landing: profile_load — carga el perfil completo al abrir el dashboard
  if (command === 'profile_load') {
    console.log('[Synapse] Landing → PROFILE_LOAD');
    sendToHost({
      command:    'PROFILE_LOAD',
      profile_id: msg.profile_id || config?.profileId,
      launch_id:  msg.launch_id  || config?.launchId,
      timestamp:  Date.now()
    });
    sendResp({ received: true });
    return true;
  }

  // Landing: health_check — estado de salud del sistema
  if (command === 'health_check') {
    console.log('[Synapse] Landing → HEALTH_CHECK (scope:', msg.scope || 'full-stack', ')');
    sendToHost({
      command:    'HEALTH_CHECK',
      scope:      msg.scope || 'full-stack',
      profile_id: config?.profileId,
      launch_id:  config?.launchId,
      timestamp:  Date.now()
    });
    sendResp({ received: true });
    return true;
  }

  // Landing: nucleus_sync — fuerza sincronización con Nucleus
  if (command === 'nucleus_sync') {
    console.log('[Synapse] Landing → NUCLEUS_SYNC');
    sendToHost({
      command:    'NUCLEUS_SYNC',
      profile_id: config?.profileId,
      launch_id:  config?.launchId,
      timestamp:  Date.now()
    });
    sendResp({ received: true });
    return true;
  }

  // Landing: intent_list — lista de intents activos del perfil
  if (command === 'intent_list') {
    console.log('[Synapse] Landing → INTENT_LIST');
    sendToHost({
      command:    'INTENT_LIST',
      profile_id: config?.profileId,
      launch_id:  config?.launchId,
      timestamp:  Date.now()
    });
    sendResp({ received: true });
    return true;
  }

  // Handler genérico para landing — fallback para comandos no reconocidos
  if (msg.action === 'executeBrainCommand') {
    console.log('[Synapse] Brain command received (fallback):', msg.command);
    
    sendToHost({
      type: 'BRAIN_COMMAND',
      command: msg.command,
      source: 'landing_cockpit',
      timestamp: Date.now()
    });
    
    sendResp({ 
      success: true, 
      message: 'Command sent to host' 
    });
    
    return true;
  }

  // Handler para ping desde landing
  if (msg.action === 'ping') {
    sendResp({ 
      status: 'pong',
      connection_state: connectionState,
      handshake_state: handshakeState
    });
    return true;
  }

  // Handler para check host desde landing
  if (msg.action === 'checkHost') {
    sendResp({ 
      hostConnected: connectionState === 'CONNECTED',
      connection_state: connectionState,
      handshake_state: handshakeState,
      handshake_confirmed: handshakeState === 'CONFIRMED'
    });
    return true;
  }

  // Handler para cambio de modo
  if (event === 'SET_MODE') {
    console.log('[Synapse] Mode switch requested:', msg.mode);
    
    chrome.storage.local.set({ synapseMode: msg.mode }, async () => {
      isInitialized = false;
      await loadConfig();
      
      sendResp({ success: true, mode: msg.mode });
    });
    
    return true;
  }

  // Actuator ready
  if (event === 'actuator_ready') {
    sendToHost({
      event: "ACTUATOR_READY",
      tab_id: sender.tab?.id,
      url: msg.url
    });
    sendResp({ received: true });
    return true;
  }

  // Slave mode notifications
  if (event === 'slave_mode_changed') {
    console.log('[Synapse] Slave mode changed:', msg.enabled);
    sendToHost({
      event: "SLAVE_MODE_CHANGED",
      enabled: msg.enabled,
      tab_id: sender.tab?.id,
      timestamp: Date.now()
    });
    sendResp({ received: true });
    return true;
  }

  // Slave mode timeout
  if (event === 'slave_mode_timeout') {
    console.warn('[Synapse] ⚠️ Slave mode timeout on tab:', sender.tab?.id);
    sendToHost({
      event: "SLAVE_MODE_TIMEOUT",
      tab_id: sender.tab?.id,
      selector: msg.selector,
      timestamp: Date.now()
    });
    sendResp({ received: true });
    return true;
  }

  // Discovery complete
  if (event === 'DISCOVERY_COMPLETE' || command === 'discovery_complete') {
    console.log('[Synapse] ✓ Discovery complete');
    sendToHost({
      event: "DISCOVERY_COMPLETE",
      payload: msg.payload || msg
    });
    sendResp({ received: true });
    return true;
  }

  // ─────────────────────────────────────────────────────────────────────
  // ACCOUNT_REGISTERED — originado en discovery.js tras completar el
  // registro de una cuenta (Google, Gemini, GitHub, etc.)
  //
  // Este handler recibe el evento desde la discovery page y lo reenvía
  // al native host vía sendToHost. El bloque espejo en handleHostMessage
  // (arriba) procesa la confirmación de vuelta desde Sentinel.
  //
  // Contrato del payload esperado:
  // {
  //   event:      'ACCOUNT_REGISTERED',
  //   profile_id: string,   // UUID del perfil — del SYNAPSE_CONFIG inyectado por Ignition
  //   launch_id:  string,   // ID del launch activo — del SYNAPSE_CONFIG
  //   service:    string,   // 'google' | 'gemini' | 'github'
  //   email:      string,   // cuenta registrada
  //   timestamp:  number
  // }
  // ─────────────────────────────────────────────────────────────────────
  if (event === 'ACCOUNT_REGISTERED') {
    if (!msg.profile_id || !msg.launch_id) {
      console.warn('[Synapse] ⚠️ ACCOUNT_REGISTERED enviado sin profile_id/launch_id');
    }

    console.log('[Synapse] ✓ ACCOUNT_REGISTERED recibido desde discovery.js — service:', msg.service);

    sendToHost({
      event:      'ACCOUNT_REGISTERED',
      profile_id: msg.profile_id  || config?.profileId,
      launch_id:  msg.launch_id   || config?.launchId,
      service:    msg.service,
      email:      msg.email       || '',
      timestamp:  msg.timestamp   || Date.now()
    });

    sendResp({ received: true });
    return true;
  }

  // ── GITHUB_PAT_DETECTED ────────────────────────────────────────────────────
  // Recibido desde el Harness (simulación) o desde discovery.js cuando el
  // clipboard monitor detecta un GitHub Personal Access Token (formato ghp_...).
  if (event === 'GITHUB_PAT_DETECTED') {
    console.log('[Synapse] 📥 GITHUB_PAT_DETECTED recibido');

    // Validar que el token existe y tiene el prefijo correcto
    if (!msg.token || !msg.token.startsWith('ghp_')) {
      console.warn('[Synapse] ⚠️  GITHUB_PAT_DETECTED — token inválido o ausente:', msg.token);
    }

    // Forwardear a Brain vía Native Messaging
    sendToHost({
      event:      'GITHUB_PAT_DETECTED',
      token:      msg.token,
      profile_id: msg.profile_id  || config?.profileId,
      launch_id:  msg.launch_id   || config?.launchId,
      timestamp:  msg.timestamp   || Date.now()
    });

    console.log('[Synapse] ✓ GITHUB_PAT_DETECTED → forwarding to native host');
    sendResp({ received: true });
    return true;
  }

  // ── GITHUB_TOKEN_STORED ────────────────────────────────────────────────────
  // Emitido por discovery.js cuando el usuario confirma el token GitHub en la
  // UI de onboarding y Brain lo almacena en Nucleus.
  if (event === 'GITHUB_TOKEN_STORED') {
    console.log('[Synapse] 📥 GITHUB_TOKEN_STORED recibido');

    // Forwardear a Brain — Brain registra el token en Nucleus
    sendToHost({
      event:             'GITHUB_TOKEN_STORED',
      token_fingerprint: msg.token_fingerprint,
      profile_id:        msg.profile_id  || config?.profileId,
      launch_id:         msg.launch_id   || config?.launchId,
      timestamp:         msg.timestamp   || Date.now()
    });

    console.log('[Synapse] ✓ GITHUB_TOKEN_STORED → forwarding to native host');
    sendResp({ received: true });
    return true;
  }

  // Heartbeat success
  if (event === 'HEARTBEAT_SUCCESS') {
    console.log('[Synapse] ✓ Heartbeat validation successful');
    sendToHost({
      event: "HEARTBEAT_SUCCESS",
      status: msg.status,
      timestamp: msg.timestamp
    });
    sendResp({ received: true });
    return true;
  }

  // Window layout request — from discoveryProtocol.requestWindowLayout()
  if (command === 'window_layout_request' && msg.layout) {
    console.log('[Synapse] Window layout request received:', msg.layout);
    applyWindowLayout(msg.layout).then(() => {
      sendResp({ received: true, layout: msg.layout });
    });
    return true;
  }

  // Check handshake status
  if (command === 'check_handshake_status') {
    const response = {
      handshake_confirmed: handshakeState === 'CONFIRMED',
      handshake_state: handshakeState,
      status: 'pong',
      connection_state: connectionState
    };
    sendResp(response);
    return true;
  }

  // Manual clipboard check
  if (msg.action === 'checkClipboard') {
    navigator.clipboard.readText().then(text => {
      const detected = detectAPIKeyProvider(text);
      sendResp({ detected: detected });
    }).catch(error => {
      sendResp({ error: error.message });
    });
    return true;
  }

  // Manual start/stop monitoring
  if (msg.action === 'startClipboardMonitoring') {
    startClipboardMonitoring();
    sendResp({ monitoring: true });
    return true;
  }

  if (msg.action === 'stopClipboardMonitoring') {
    stopClipboardMonitoring();
    sendResp({ monitoring: false });
    return true;
  }

  // ─────────────────────────────────────────────────────────────────────
  // IONPUMP COMMAND HANDLERS — Harness → background → Brain/IonPump
  //
  // Estos handlers reciben comandos IonPump simulados desde el Harness
  // y los forwadean al host nativo para que SynapseManager los enrute
  // al proceso IonPump via TCP IPC.
  //
  // Categoría 1: Flow execution
  // ─────────────────────────────────────────────────────────────────────

  if (command === 'ION_EXECUTE_FLOW') {
    console.log('[IonPump] ▶ ION_EXECUTE_FLOW:', msg.site, '/', msg.flow);

    sendToHost({
      command:   'ION_EXECUTE_FLOW',
      site:      msg.site,
      flow:      msg.flow,
      tab_id:    msg.tab_id,
      launch_id: msg.launch_id || config?.launchId,
      context:   msg.context   || {}
    });

    sendResp({ received: true });
    return true;
  }

  // Categoría 2: Admin commands (debug/dev)

  if (command === 'ION_RELOAD') {
    console.log('[IonPump] 🔄 ION_RELOAD:', msg.site);

    sendToHost({
      command:   'ION_RELOAD',
      site:      msg.site,
      launch_id: config?.launchId,
      timestamp: Date.now()
    });

    sendResp({ received: true });
    return true;
  }

  if (command === 'ION_INSPECT') {
    console.log('[IonPump] 🔍 ION_INSPECT');

    sendToHost({
      command:   'ION_INSPECT',
      launch_id: msg.launch_id || config?.launchId,
      timestamp: Date.now()
    });

    sendResp({ received: true });
    return true;
  }

  return false;
});

// ============================================================================
// UTILS
// ============================================================================

function sendToHost(msg) {
  if (nativePort && connectionState === 'CONNECTED') {
    // Validar handshake antes de enviar mensajes críticos
    if (handshakeState !== 'CONFIRMED' && handshakeState !== 'HOST_READY') {
      console.warn('[Synapse] ⚠️ Message blocked - Handshake not confirmed:', msg.event || msg.type);
      return;
    }

    const label = msg.event || msg.command || msg.type || '(unknown)';
    console.log(`[Synapse → Host] [${new Date().toISOString()}] ${label}`, msg);
    nativePort.postMessage(msg);
  } else {
    console.warn('[Synapse] ⚠ Cannot send - not connected:', msg.event || msg.type);
  }
}

function respondToHost(msgId, payload) {
  if (!msgId) return;
  sendToHost({
    type: "RESPONSE",
    id: msgId,
    payload
  });
}

function setupKeepalive() {
  // Alarm cada 1 minuto para mantener el service worker vivo
  chrome.alarms.create('keepalive', { periodInMinutes: 1 });

  chrome.alarms.onAlarm.addListener((a) => {
    if (a.name !== 'keepalive') return;

    console.log(`[Synapse] [${new Date().toISOString()}] Keepalive tick - Handshake: ${handshakeState} | Connection: ${connectionState}`);

    // Enviar heartbeat real al host solo si el canal está establecido.
    // El host (bloom-host / Sentinel) forwardea esto como SignalHeartbeat al workflow de Temporal.
    // Sin esto, el ProfileLifecycleWorkflow degrada a DEGRADED a los 2 minutos por heartbeat timeout.
    if (handshakeState === 'CONFIRMED' && connectionState === 'CONNECTED') {
      sendToHost({
        event: 'HEARTBEAT',
        profile_id: config?.profileId,
        launch_id: config?.launchId,
        timestamp: Date.now(),
        status: 'alive'
      });
      console.log(`[Synapse] [${new Date().toISOString()}] Heartbeat sent — profile: ${config?.profileId}`);
    } else {
      console.warn('[Synapse] ⚠️ Heartbeat skipped - channel not ready (handshake:', handshakeState, ')');
    }
  });
}

// ============================================================================
// STARTUP
// ============================================================================

chrome.runtime.onInstalled.addListener(() => {
  console.log('[Synapse] � Extension installed/updated');
  initialize();
});

chrome.runtime.onStartup.addListener(() => {
  console.log('[Synapse] � Browser startup');
  initialize();
});

// FIX: Cold-start activation.
//
// onInstalled and onStartup only fire on first install or browser restart.
// When Chrome launches a profile that already has the extension installed,
// the Service Worker is activated in the background without firing either
// event. In that case initialize() was never called, nativePort stayed null,
// and the host waited forever for extension_ready on stdin → STDIN_EOF.
//
// Calling initialize() at the top level of the script guarantees it runs
// on every Service Worker activation, including cold-start activations
// triggered by Native Messaging. The isInitialized guard inside initialize()
// prevents duplicate execution when onInstalled or onStartup also fires.
initialize();

chrome.runtime.onSuspend?.addListener(() => {
  console.log('[Synapse] � Service worker suspending');
});

// ============================================================================
// DEBUGGING HELPERS
// ============================================================================

if (typeof self !== 'undefined' && self.location?.href?.includes('debug=true')) {
  console.log('[Synapse] � Debug mode enabled');
  
  self.SYNAPSE_DEBUG = {
    getState: () => ({
      initialized: isInitialized,
      connectionState,
      handshakeState,
      hasPort: nativePort !== null,
      config: config ? { ...config, bridge_name: '***' } : null,
      mode: config?.mode
    }),
    forceReconnect: () => {
      if (nativePort) {
        nativePort.disconnect();
      }
      isInitialized = false;
      initialize();
    }
  };
}

// ============================================================================
// CLIPBOARD API KEY DETECTOR
// ============================================================================

/**
 * API Key pattern matchers for all supported providers
 */
const API_KEY_PATTERNS = {
  gemini: {
    regex: /^AIzaSy[A-Za-z0-9_-]{33}$/,
    name: 'Gemini',
    console_url: 'https://aistudio.google.com/app/apikey'
  },
  claude: {
    regex: /^sk-ant-api\d{2}-[A-Za-z0-9_-]{95,}$/,
    name: 'Claude',
    console_url: 'https://console.anthropic.com/settings/keys'
  },
  openai: {
    regex: /^sk-[A-Za-z0-9]{48}$/,
    name: 'ChatGPT',
    console_url: 'https://platform.openai.com/api-keys'
  },
  xai: {
    regex: /^xai-[A-Za-z0-9_-]{32,}$/,
    name: 'Grok',
    console_url: 'https://console.x.ai/keys'
  },
  // FIX (v3.1): GitHub Personal Access Tokens — formato ghp_ + 36 chars mínimo.
  // Sin esta entrada el clipboard monitor nunca detectaba tokens GitHub
  // aunque el monitor estuviera corriendo; el regex de los otros providers
  // no matcheaba ghp_ y detectAPIKeyProvider() siempre devolvía null.
  github: {
    regex: /^ghp_[A-Za-z0-9]{36,}$/,
    name: 'GitHub',
    console_url: 'https://github.com/settings/tokens'
  }
};

/**
 * Detect which provider an API key belongs to
 */
function detectAPIKeyProvider(text) {
  if (!text || typeof text !== 'string') {
    return null;
  }

  // Clean whitespace
  const cleaned = text.trim();

  // Test against each provider
  for (const [provider, config] of Object.entries(API_KEY_PATTERNS)) {
    if (config.regex.test(cleaned)) {
      return {
        provider: provider,
        name: config.name,
        key: cleaned,
        matched: true
      };
    }
  }

  return null;
}

/**
 * State management for clipboard monitoring
 */
let clipboardMonitor = {
  isMonitoring: false,
  intervalId: null,
  lastClipboard: '',
  detectedKeys: new Set()
};

/**
 * Start monitoring clipboard for API keys
 */
function startClipboardMonitoring() {
  if (clipboardMonitor.isMonitoring) {
    console.log('[Clipboard] Already monitoring');
    return;
  }

  console.log('[Clipboard] Starting monitoring...');
  clipboardMonitor.isMonitoring = true;

  // Poll clipboard every 1 second
  clipboardMonitor.intervalId = setInterval(async () => {
    try {
      // Read clipboard (requires clipboardRead permission in manifest)
      const text = await navigator.clipboard.readText();

      // Skip if clipboard hasn't changed
      if (text === clipboardMonitor.lastClipboard) {
        return;
      }

      clipboardMonitor.lastClipboard = text;

      // Detect provider
      const detected = detectAPIKeyProvider(text);

      if (detected) {
        // Avoid duplicate detections
        const keyHash = detected.key.substring(0, 20); // First 20 chars as hash
        if (clipboardMonitor.detectedKeys.has(keyHash)) {
          console.log('[Clipboard] Key already detected, skipping');
          return;
        }

        clipboardMonitor.detectedKeys.add(keyHash);
        console.log('[Clipboard] ✓ API Key detected:', detected.name);

        // FIX (v3.1): GitHub PATs usan un evento dedicado (GITHUB_PAT_DETECTED)
        // que el handler de background.js en línea ~1078 forwardea al host con
        // el campo 'token' (no 'key'). Los demás providers siguen usando
        // API_KEY_DETECTED con el campo 'key'.
        if (detected.provider === 'github') {
          sendToHost({
            event:      'GITHUB_PAT_DETECTED',
            token:      detected.key,
            profile_id: config?.profileId,
            launch_id:  config?.launchId,
            timestamp:  Date.now()
          });

          // Notificar también a discovery.js para que actualice su UI
          chrome.runtime.sendMessage({
            event:  'GITHUB_PAT_DETECTED',
            token:  detected.key,
            timestamp: Date.now()
          }).catch(() => {});
        } else {
          // Send to host via Native Messaging
          sendToHost({
            event:     'API_KEY_DETECTED',
            provider:  detected.provider,
            key:       detected.key,
            timestamp: Date.now()
          });
        }

        // Show notification to user
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon128.png',
          title: `${detected.name} API Key Detected`,
          message: 'Registering key in Bloom Vault...',
          priority: 2
        });
      }
    } catch (error) {
      // Silently fail (clipboard API can throw if no permission)
      if (error.message.includes('clipboard-read')) {
        console.error('[Clipboard] Missing clipboard-read permission');
        stopClipboardMonitoring();
      }
    }
  }, 1000); // Poll every second
}

/**
 * Stop monitoring clipboard
 */
function stopClipboardMonitoring() {
  if (!clipboardMonitor.isMonitoring) {
    return;
  }

  console.log('[Clipboard] Stopping monitoring');
  clearInterval(clipboardMonitor.intervalId);
  clipboardMonitor.isMonitoring = false;
  clipboardMonitor.intervalId = null;
}

/**
 * Handle API key registration response from host
 */
function handleAPIKeyResponse(message) {
  const { event, provider, profile_name, error, status } = message;

  if (event === 'API_KEY_REGISTERED' && status === 'success') {
    console.log('[Clipboard] ✓ Key registered:', provider, profile_name);

    // Show success notification
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'API Key Registered',
      message: `${provider.toUpperCase()} key saved as "${profile_name}"`,
      priority: 2
    });

    // Notify discovery page if open
    chrome.runtime.sendMessage({
      event: 'API_KEY_REGISTERED',
      provider: provider,
      profile_name: profile_name
    });
  } 
  else if (event === 'API_KEY_REGISTRATION_FAILED') {
    console.error('[Clipboard] ✗ Registration failed:', error);

    // Show error notification
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'API Key Registration Failed',
      message: `${provider.toUpperCase()}: ${error}`,
      priority: 2
    });
  }
}

/**
 * Listen for onboarding state changes to start/stop monitoring
 */
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.onboarding_state) {
    const state = changes.onboarding_state.newValue;

    // Start monitoring when user is waiting for API key
    if (state?.currentStep?.includes('api_waiting') || 
        state?.currentStep?.includes('gemini_api_waiting')) {
      startClipboardMonitoring();
    }
    // Stop monitoring when onboarding is complete
    else if (state?.completed === true) {
      stopClipboardMonitoring();
    }
  }
});