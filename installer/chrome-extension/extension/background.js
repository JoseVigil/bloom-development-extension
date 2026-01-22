// ============================================================================
// SYNAPSE THIN CLIENT - ROUTER PURO (PRODUCTION READY)
// ============================================================================

let nativePort = null;
let connectionState = 'DISCONNECTED';
let config = null;
let reconnectAttempts = 0;
let isInitialized = false;

const MAX_RECONNECT = 10;
const BASE_DELAY = 2000;

// ============================================================================
// HELPER FUNCTIONS - DEFINIDAS PRIMERO
// ============================================================================

async function detectActiveMode() {
  // Opción 1: Verificar tabs activos
  const tabs = await chrome.tabs.query({});
  
  const hasDiscovery = tabs.some(t => 
    t.url?.includes(chrome.runtime.id) && t.url?.includes('discovery')
  );
  
  const hasLanding = tabs.some(t => 
    t.url?.includes(chrome.runtime.id) && t.url?.includes('landing')
  );
  
  if (hasDiscovery) return 'discovery';
  if (hasLanding) return 'landing';
  
  // Opción 2: Verificar storage (último modo usado)
  const { synapseMode } = await chrome.storage.local.get(['synapseMode']);
  
  // Opción 3: Default
  return synapseMode || 'discovery';
}

function validateConfig(mode) {
  const requiredBase = ['profileId', 'bridge_name', 'launchId', 'profile_alias', 'extension_id'];
  const requiredDiscovery = ['register', 'email'];
  const requiredLanding = ['total_launches', 'uptime', 'intents_done', 'last_synch'];

  const required = [
    ...requiredBase,
    ...(mode === 'discovery' ? requiredDiscovery : requiredLanding)
  ];

  const missing = required.filter(key => config[key] === undefined);

  if (missing.length > 0) {
    console.error(`[Synapse] ✗ Missing config keys (${mode} mode):`, missing);
  } else {
    console.log(`[Synapse] ✓ All required config keys present (${mode} mode)`);
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
  setupKeepalive();
  connectNative();
}

async function loadConfig() {
  try {
    // ⭐ PASO 1: Determinar qué modo está activo
    const mode = await detectActiveMode();
    console.log('[Synapse] Active mode detected:', mode);

    // ⭐ PASO 2: Definir matchers según el modo
    const baseMatchers = {
      profileId: /profileId:\s*['"]([^'"]+)['"]/,
      bridge_name: /bridge_name:\s*['"]([^'"]+)['"]/,
      launchId: /launchId:\s*['"]([^'"]+)['"]/,
      profile_alias: /profile_alias:\s*['"]([^'"]+)['"]/,
      extension_id: /extension_id:\s*['"]([^'"]+)['"]/
    };

    const discoveryMatchers = {
      register: /register:\s*(true|false)/,
      email: /email:\s*['"]([^'"]+)['"]/
    };

    const landingMatchers = {
      total_launches: /total_launches:\s*(\d+)/,
      uptime: /uptime:\s*(\d+)/,
      intents_done: /intents_done:\s*(\d+)/,
      last_synch: /last_synch:\s*['"]([^'"]+)['"]/
    };

    const matchers = {
      ...baseMatchers,
      ...(mode === 'discovery' ? discoveryMatchers : landingMatchers)
    };

    // ⭐ PASO 3: Cargar config desde RAÍZ (no subcarpetas)
    const configFile = mode === 'discovery' 
      ? 'discovery.synapse.config.js'
      : 'landing.synapse.config.js';

    // Intento 1: importScripts desde raíz
    try {
      importScripts(configFile);
      
      if (self.SYNAPSE_CONFIG) {
        config = { ...self.SYNAPSE_CONFIG, mode };
        console.log(`[Synapse] ✓ Config loaded via importScripts (${mode} mode):`, config);
      } else {
        throw new Error('SYNAPSE_CONFIG not defined');
      }
      
    } catch (importError) {
      console.log('[Synapse] importScripts failed, using fetch...');
      
      // Intento 2: fetch desde raíz
      const resp = await fetch(chrome.runtime.getURL(configFile));
      const text = await resp.text();
      
      config = { mode };
      
      for (const [key, regex] of Object.entries(matchers)) {
        const match = text.match(regex);
        if (match) {
          if (key === 'register') {
            config[key] = match[1] === 'true';
          } else if (['total_launches', 'uptime', 'intents_done'].includes(key)) {
            config[key] = parseInt(match[1], 10);
          } else {
            config[key] = match[1];
          }
        }
      }

      console.log(`[Synapse] ✓ Config loaded via fetch (${mode} mode):`, config);
    }

    // ⭐ PASO 4: Guardar modo activo en storage
    await chrome.storage.local.set({ synapseMode: mode });

    // ⭐ PASO 5: Validar configuración
    validateConfig(mode);

  } catch (e) {
    console.error('[Synapse] ✗ Config load failed:', e);
  }
}

// ============================================================================
// NATIVE CONNECTION
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

  try {
    nativePort = chrome.runtime.connectNative(config.bridge_name);

    nativePort.onMessage.addListener(handleHostMessage);
    nativePort.onDisconnect.addListener(handleDisconnect);

    nativePort.postMessage({
      type: "SYSTEM_HELLO",
      payload: {
        profile_id: config.profileId,
        launch_id: config.launchId,
        extension_id: config.extension_id,
        profile_alias: config.profile_alias
      }
    });

    connectionState = 'CONNECTED';
    reconnectAttempts = 0;

    console.log('[Synapse] ✓ Connected to native host');
  } catch (e) {
    console.error('[Synapse] ✗ Connect failed:', e);
    nativePort = null;
    scheduleReconnect();
  }
}

function handleDisconnect() {
  const err = chrome.runtime.lastError;
  console.warn('[Synapse] Disconnected:', err?.message || 'Unknown');

  connectionState = 'DISCONNECTED';
  nativePort = null;

  scheduleReconnect();
}

function scheduleReconnect() {
  if (reconnectAttempts >= MAX_RECONNECT) {
    console.error('[Synapse] ✗ Max reconnect attempts reached');
    return;
  }

  reconnectAttempts++;
  const delay = Math.min(BASE_DELAY * Math.pow(2, reconnectAttempts), 30000);

  console.log(`[Synapse] ⏳ Reconnect in ${delay}ms (attempt ${reconnectAttempts}/${MAX_RECONNECT})`);
  setTimeout(connectNative, delay);
}

// ============================================================================
// HOST MESSAGES
// ============================================================================

function handleHostMessage(msg) {
  const cmd = msg.command || msg.type;

  console.log(`[Synapse] Host → ${cmd}`);

  if (cmd === 'SYSTEM_ACK') {
    handleSystemAck(msg);
    return;
  }

  if (cmd === 'system_ready') {
    handleSystemReady(msg);
    return;
  }

  if (cmd === 'HEARTBEAT') {
    handleHeartbeat(msg);
    return;
  }

  if (cmd === 'TAB_CLOSE') {
    executeTabClose(msg.target, msg.id);
    return;
  }

  if (cmd === 'TAB_OPEN') {
    executeTabOpen(msg.payload, msg.id);
    return;
  }

  if (cmd === 'TAB_NAVIGATE') {
    executeTabNavigate(msg.target, msg.payload, msg.id);
    return;
  }

  if (cmd === 'TAB_QUERY') {
    executeTabQuery(msg.payload, msg.id);
    return;
  }

  if (cmd === 'WINDOW_CLOSE') {
    executeWindowClose(msg.id);
    return;
  }

  if (cmd.startsWith('DOM_') || cmd === 'LOCK_UI' || cmd === 'UNLOCK_UI') {
    forwardToContent(msg);
    return;
  }

  console.warn('[Synapse] ⚠ Unknown command:', cmd);
}

function handleSystemAck(msg) {
  console.log('[Synapse] ✓ Handshake confirmed');

  const payload = msg.payload || {};
  
  // ⭐ Construir datos según el modo
  const configToSave = {
    profileId: config.profileId,
    profile_alias: config.profile_alias,
    mode: config.mode
  };

  // ⭐ Agregar campos específicos del modo
  if (config.mode === 'discovery') {
    configToSave.register = config.register || false;
    configToSave.email = config.email || null;
  } else if (config.mode === 'landing') {
    configToSave.total_launches = config.total_launches || 0;
    configToSave.uptime = config.uptime || 0;
    configToSave.intents_done = config.intents_done || 0;
    configToSave.last_synch = config.last_synch || null;
  }

  console.log('[Synapse] Saving to storage:', configToSave);

  chrome.storage.local.set({
    synapseStatus: {
      command: 'system_ready',
      payload: {
        profile_id: config.profileId,
        profile_alias: config.profile_alias,
        launch_id: config.launchId,
        mode: config.mode,
        brain_version: payload.brain_version || payload.host_version,
        host_version: payload.host_version,
        identity_method: payload.identity_method,
        timestamp: Date.now()
      }
    },
    synapseConfig: configToSave
  }, () => {
    console.log('[Synapse] ✓ Storage saved');
    
    chrome.storage.local.get(['synapseConfig'], (result) => {
      console.log('[Synapse] Verification - stored config:', result.synapseConfig);
    });
  });

  chrome.tabs.query({}, (tabs) => {
    sendToHost({
      event: "TABS_STATUS",
      tabs: tabs.map(t => ({ id: t.id, url: t.url, title: t.title }))
    });
  });
}

function handleSystemReady(msg) {
  const payload = msg.payload || {};
  
  if (payload.profile_id) {
    console.log('[Synapse] System ready:', payload.profile_id);
  }
  
  chrome.storage.local.get('synapseStatus', (result) => {
    if (!result.synapseStatus) {
      chrome.storage.local.set({
        synapseStatus: {
          command: 'system_ready',
          payload: {
            profile_id: config.profileId,
            profile_alias: config.profile_alias,
            launch_id: config.launchId,
            timestamp: Date.now()
          }
        }
      });
    }
  });
}

function handleHeartbeat(msg) {
  const payload = msg.payload || {};
  const stats = payload.stats || {};
  
  if (stats.pending_queue && parseInt(stats.pending_queue) > 0) {
    console.log('[Synapse] ⚡ Heartbeat - Pending:', stats.pending_queue);
  }
}

// ============================================================================
// COMMAND EXECUTORS
// ============================================================================

function executeTabClose(tabId, msgId) {
  chrome.tabs.remove(tabId, () => {
    respondToHost(msgId, {
      success: !chrome.runtime.lastError,
      error: chrome.runtime.lastError?.message
    });
  });
}

function executeTabOpen(payload, msgId) {
  chrome.tabs.create(payload, (tab) => {
    respondToHost(msgId, {
      success: !chrome.runtime.lastError,
      tab_id: tab?.id,
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

  // ⭐ Handler para cambio de modo
  if (event === 'SET_MODE') {
    console.log('[Synapse] Mode switch requested:', msg.mode);
    
    chrome.storage.local.set({ synapseMode: msg.mode }, async () => {
      isInitialized = false;
      await loadConfig();
      
      sendResp({ success: true, mode: msg.mode });
    });
    
    return true;
  }

  if (event === 'actuator_ready') {
    sendToHost({
      event: "ACTUATOR_READY",
      tab_id: sender.tab?.id,
      url: msg.url
    });
    sendResp({ received: true });
    return true;
  }

  if (event === 'DISCOVERY_COMPLETE' || command === 'discovery_complete') {
    console.log('[Synapse] ✓ Discovery complete');
    sendToHost({
      event: "DISCOVERY_COMPLETE",
      payload: msg.payload || msg
    });
    sendResp({ received: true });
    return true;
  }

  if (command === 'check_handshake_status') {
    const response = {
      handshake_confirmed: connectionState === 'CONNECTED',
      status: 'pong',
      connection_state: connectionState
    };
    sendResp(response);
    return true;
  }

  return false;
});

// ============================================================================
// UTILS
// ============================================================================

function sendToHost(msg) {
  if (nativePort && connectionState === 'CONNECTED') {
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
  chrome.alarms.create('keepalive', { periodInMinutes: 1 });
  chrome.alarms.onAlarm.addListener((a) => {
    if (a.name === 'keepalive') {
      console.log('[Synapse] 💓 Keepalive');
    }
  });
}

// ============================================================================
// STARTUP - PRODUCTION SAFE
// ============================================================================

chrome.runtime.onInstalled.addListener(() => {
  console.log('[Synapse] 🔧 Extension installed/updated');
  initialize();
});

chrome.runtime.onStartup.addListener(() => {
  console.log('[Synapse] 🚀 Browser startup');
  initialize();
});

chrome.runtime.onSuspend?.addListener(() => {
  console.log('[Synapse] 💤 Service worker suspending');
});

// ============================================================================
// DEBUGGING HELPERS (Solo para desarrollo)
// ============================================================================

if (typeof self !== 'undefined' && self.location?.href?.includes('debug=true')) {
  console.log('[Synapse] 🐛 Debug mode enabled');
  
  self.SYNAPSE_DEBUG = {
    getState: () => ({
      initialized: isInitialized,
      connectionState,
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