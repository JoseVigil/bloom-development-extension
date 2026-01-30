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
    requiredDiscovery.push('email');
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
        
        await chrome.storage.local.set({ synapseMode: mode });
        validateConfig(mode);
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
          ...(mode === 'discovery' ? registerMatcher : landingMatchers)
        };
        
        for (const [key, regex] of Object.entries(initialMatchers)) {
          const match = text.match(regex);
          
          if (match) {
            let value;
            if (key === 'register') {
              value = match[1] === 'true';
            } else if (['total_launches', 'uptime', 'intents_done'].includes(key)) {
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
        
        if (mode === 'discovery' && config.register === true) {
          const emailMatch = text.match(emailMatcher.email);
          if (emailMatch) {
            config.email = emailMatch[1];
            console.log(`[Synapse] ✓ Parsed email:`, config.email);
          } else {
            console.warn(`[Synapse] ✗ Could not parse email (required when register=true)`);
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

  } catch (e) {
    console.error('[Synapse] ✗ Config load failed:', e);
    console.error('[Synapse] Stack trace:', e.stack);
  }
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

    // 🔒 FASE 1: Extension → Host (extension_ready)
    console.log('[HANDSHAKE] FASE 1: Extension → Host (extension_ready)');
    
    nativePort.postMessage({
      command: "extension_ready",
      profile_id: config.profileId,
      launch_id: config.launchId,
      extension_id: config.extension_id || chrome.runtime.id,
      profile_alias: config.profile_alias,
      timestamp: Date.now()
    });

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
  
  console.warn('[Synapse] ⚠ Native host disconnected:', error?.message || 'No error');
  console.log('[Synapse] Connection state was:', connectionState);
  console.log('[Synapse] Handshake state was:', handshakeState);
  
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

  reconnectAttempts++;
  const delay = BASE_DELAY * Math.min(reconnectAttempts, 5);

  console.log(`[Synapse] Reconnecting in ${delay}ms (attempt ${reconnectAttempts}/${MAX_RECONNECT})`);

  setTimeout(() => {
    if (connectionState === 'DISCONNECTED') {
      connectNative();
    }
  }, delay);
}

// ============================================================================
// HOST MESSAGE HANDLER
// ============================================================================

function handleHostMessage(msg) {
  const { type, command, id, payload, target } = msg;

  console.log(`[Synapse] ⬅ Host message:`, { type, command, id, target });

  // 🔒 FASE 2: Host → Extension (host_ready)
  if (command === 'host_ready') {
    console.log('[HANDSHAKE] FASE 2: Host → Extension (host_ready)');
    console.log('[HANDSHAKE] Host capabilities:', msg.capabilities);
    console.log('[HANDSHAKE] Host version:', msg.version);
    console.log('[HANDSHAKE] Max message size:', msg.max_message_size);
    
    handshakeState = 'HOST_READY';
    
    // La Fase 3 la maneja el Host automáticamente (envía PROFILE_CONNECTED al Brain)
    // Nosotros solo actualizamos estado local
    
    setTimeout(() => {
      if (handshakeState === 'HOST_READY') {
        console.log('[HANDSHAKE] FASE 3: Asumiendo handshake confirmado');
        handshakeState = 'CONFIRMED';
        
        console.log('[HANDSHAKE] ✓ COMPLETO - Sistema listo para comandos');
        
        // Notificar a UI si está activa
        chrome.storage.local.set({
          handshakeState: 'CONFIRMED',
          handshakeTimestamp: Date.now()
        });
      }
    }, 500);
    
    return;
  }

  // Heartbeat
  if (type === 'HEARTBEAT') {
    handleHeartbeat(msg);
    return;
  }

  // System ready
  if (type === 'SYSTEM_READY') {
    console.log('[Synapse] 🟢 System ready');
    handleSystemReady(msg);
    return;
  }

  // 🔒 VALIDACIÓN: Solo procesar comandos si handshake confirmado
  if (handshakeState !== 'CONFIRMED' && handshakeState !== 'HOST_READY') {
    console.warn('[Synapse] ⚠️ Mensaje ignorado - Handshake no confirmado:', handshakeState);
    console.warn('[Synapse] Mensaje:', { type, command, id });
    return;
  }

  // Commands routing
  if (type === 'COMMAND') {
    switch (command) {
      case 'TAB_CLOSE':
        executeTabClose(target, id);
        break;
      case 'TAB_OPEN':
        executeTabOpen(payload, id);
        break;
      case 'TAB_NAVIGATE':
        executeTabNavigate(target, payload, id);
        break;
      case 'TAB_QUERY':
        executeTabQuery(payload, id);
        break;
      case 'WINDOW_CLOSE':
        executeWindowClose(id);
        break;
      default:
        console.warn('[Synapse] ⚠ Unknown command:', command);
    }
    return;
  }

  // DOM commands (forward to content script)
  const domCommands = [
    'LOCK_UI', 'UNLOCK_UI',
    'DOM_CLICK', 'DOM_TYPE', 'DOM_READ', 
    'DOM_UPLOAD', 'DOM_SCROLL', 'DOM_WAIT', 'DOM_SNAPSHOT'
  ];

  if (domCommands.includes(command)) {
    forwardToContent(msg);
    return;
  }

  console.log('[Synapse] Unhandled message:', msg);
}

function handleSystemReady(msg) {
  console.log('[Synapse] System ready notification:', msg.payload);
  
  chrome.storage.local.get(['synapseStatus'], (result) => {
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
  
  if (stats.handshake_state !== undefined) {
    console.log('[Synapse] ⚡ Heartbeat - Handshake state:', stats.handshake_state);
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

  // Handler para comandos ejecutados desde landing
  if (msg.action === 'executeBrainCommand') {
    console.log('[Synapse] Brain command received:', msg.command);
    
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

  return false;
});

// ============================================================================
// UTILS
// ============================================================================

function sendToHost(msg) {
  if (nativePort && connectionState === 'CONNECTED') {
    // 🔒 Validar handshake antes de enviar mensajes críticos
    if (handshakeState !== 'CONFIRMED' && handshakeState !== 'HOST_READY') {
      console.warn('[Synapse] ⚠️ Message blocked - Handshake not confirmed:', msg.event || msg.type);
      return;
    }
    
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
      console.log('[Synapse] 💓 Keepalive - Handshake:', handshakeState);
    }
  });
}

// ============================================================================
// STARTUP
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
// DEBUGGING HELPERS
// ============================================================================

if (typeof self !== 'undefined' && self.location?.href?.includes('debug=true')) {
  console.log('[Synapse] 🐛 Debug mode enabled');
  
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