// ============================================================================
// SYNAPSE THIN CLIENT - ROUTER PURO (PRODUCTION READY)
// ============================================================================

let nativePort = null;
let connectionState = 'DISCONNECTED';
let config = null;
let reconnectAttempts = 0;
let isInitialized = false; // ⭐ Guard contra múltiples inicializaciones

const MAX_RECONNECT = 10;
const BASE_DELAY = 2000;

// ============================================================================
// INIT
// ============================================================================

async function initialize() {
  // ⭐ CRITICAL: Prevenir múltiples inicializaciones
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
    try {
      importScripts('synapse.config.js');
      if (self.SYNAPSE_CONFIG) {
        config = self.SYNAPSE_CONFIG;
        console.log('[Synapse] ✓ Config via importScripts:', config); // ⭐ DEBUG
        console.log('[Synapse] Register value:', config.register); // ⭐ DEBUG
        return;
      }
    } catch (e) {}

    const resp = await fetch(chrome.runtime.getURL('synapse.config.js'));
    const text = await resp.text();
    
    const matchers = {
      profileId: /profileId:\s*['"]([^'"]+)['"]/,
      bridge_name: /bridge_name:\s*['"]([^'"]+)['"]/,
      launchId: /launchId:\s*['"]([^'"]+)['"]/,
      profile_alias: /profile_alias:\s*['"]([^'"]+)['"]/,
      extension_id: /extension_id:\s*['"]([^'"]+)['"]/,
      register: /register:\s*(true|false)/,
      email: /email:\s*['"]([^'"]+)['"]/
    };

    config = {};
    for (const [k, rx] of Object.entries(matchers)) {
      const m = text.match(rx);
      if (m) {
        config[k] = k === 'register' ? m[1] === 'true' : m[1];
      }
    }

    console.log('[Synapse] ✓ Config via fetch:', config); // ⭐ DEBUG
    console.log('[Synapse] Register value:', config.register); // ⭐ DEBUG
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

  // ⭐ Prevenir múltiples conexiones simultáneas
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

  console.log(`[Synapse] ⟳ Reconnect in ${delay}ms (attempt ${reconnectAttempts}/${MAX_RECONNECT})`);
  setTimeout(connectNative, delay);
}

// ============================================================================
// HOST MESSAGES
// ============================================================================

function handleHostMessage(msg) {
  const cmd = msg.command || msg.type;

  // ⭐ Log simplificado - solo comando
  console.log(`[Synapse] Host → ${cmd}`);

  if (cmd === 'SYSTEM_ACK') {
    handleSystemAck(msg);
    return;
  }

  // ⭐ Handler para system_ready (enviado por el host después de SYSTEM_ACK)
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
  
  const configToSave = {
    register: config.register || false,
    email: config.email || null,
    profileId: config.profileId,
    profile_alias: config.profile_alias
  };

  console.log('[Synapse] Saving to storage:', configToSave); // ⭐ DEBUG

  chrome.storage.local.set({
    synapseStatus: {
      command: 'system_ready',
      payload: {
        profile_id: config.profileId,
        profile_alias: config.profile_alias,
        launch_id: config.launchId,
        brain_version: payload.brain_version || payload.host_version,
        host_version: payload.host_version,
        identity_method: payload.identity_method,
        timestamp: Date.now()
      }
    },
    synapseConfig: configToSave
  }, () => {
    console.log('[Synapse] ✓ Storage saved'); // ⭐ DEBUG
    
    // Verificar que se guardó
    chrome.storage.local.get(['synapseConfig'], (result) => {
      console.log('[Synapse] Verification - stored config:', result.synapseConfig); // ⭐ DEBUG
    });
  });

  chrome.tabs.query({}, (tabs) => {
    sendToHost({
      event: "TABS_STATUS",
      tabs: tabs.map(t => ({ id: t.id, url: t.url, title: t.title }))
    });
  });
}

// ⭐ Handler para system_ready (mensaje separado del host)
function handleSystemReady(msg) {
  // Solo log en modo verbose - no es crítico
  const payload = msg.payload || {};
  
  if (payload.profile_id) {
    console.log('[Synapse] System ready:', payload.profile_id);
  }
  
  // Actualizar storage si no se hizo antes (failsafe)
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

// ⭐ Handler silencioso para HEARTBEAT
function handleHeartbeat(msg) {
  // Solo log si hay pending queue o stats relevantes
  const payload = msg.payload || {};
  const stats = payload.stats || {};
  
  if (stats.pending_queue && parseInt(stats.pending_queue) > 0) {
    console.log('[Synapse] ⚡ Heartbeat - Pending:', stats.pending_queue);
  }
  
  // Opcional: Responder con ACK si el host lo necesita
  // sendToHost({ type: 'HEARTBEAT_ACK', timestamp: Date.now() });
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
    return true; // ⭐ Mantener canal abierto
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

// ⭐ CRITICAL: Service worker puede recargar en cualquier momento
// El guard isInitialized previene múltiples conexiones
chrome.runtime.onSuspend?.addListener(() => {
  console.log('[Synapse] 💤 Service worker suspending');
  // Cleanup si es necesario
});

// ============================================================================
// DEBUGGING HELPERS (Solo para desarrollo)
// ============================================================================

if (typeof self !== 'undefined' && self.location?.href?.includes('debug=true')) {
  console.log('[Synapse] 🐛 Debug mode enabled');
  
  // Exponer funciones para testing manual
  self.SYNAPSE_DEBUG = {
    getState: () => ({
      initialized: isInitialized,
      connectionState,
      hasPort: nativePort !== null,
      config: config ? { ...config, bridge_name: '***' } : null
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