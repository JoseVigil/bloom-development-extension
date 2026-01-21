// ============================================================================
// SYNAPSE THIN CLIENT - ROUTER PURO
// ============================================================================

let nativePort = null;
let connectionState = 'DISCONNECTED';
let config = null;
let reconnectAttempts = 0;

const MAX_RECONNECT = 10;
const BASE_DELAY = 2000;

// ============================================================================
// INIT
// ============================================================================

async function initialize() {
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
        console.log('[Synapse] Config via importScripts');
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
      extension_id: /extension_id:\s*['"]([^'"]+)['"]/
    };

    config = {};
    for (const [k, rx] of Object.entries(matchers)) {
      const m = text.match(rx);
      if (m) config[k] = m[1];
    }

    console.log('[Synapse] Config via fetch');
  } catch (e) {
    console.error('[Synapse] Config load failed:', e);
  }
}

// ============================================================================
// NATIVE CONNECTION
// ============================================================================

function connectNative() {
  if (!config?.bridge_name) {
    console.error('[Synapse] No bridge_name');
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

    console.log('[Synapse] Connected');
  } catch (e) {
    console.error('[Synapse] Connect failed:', e);
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
    console.error('[Synapse] Max reconnect attempts');
    return;
  }

  reconnectAttempts++;
  const delay = Math.min(BASE_DELAY * Math.pow(2, reconnectAttempts), 30000);

  console.log(`[Synapse] Reconnect in ${delay}ms (${reconnectAttempts})`);
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

  if (cmd === 'HEARTBEAT') {
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

  console.warn('[Synapse] Unknown command:', cmd);
}

function handleSystemAck(msg) {
  console.log('[Synapse] ✓ Handshake confirmed');

  chrome.storage.local.set({
    synapseStatus: {
      command: 'system_ready',
      payload: {
        profile_id: config.profileId,
        profile_alias: config.profile_alias,
        launch_id: config.launchId,
        brain_version: msg.brain_version || msg.payload?.brain_version,
        timestamp: Date.now()
      }
    }
  });

  chrome.tabs.query({}, (tabs) => {
    sendToHost({
      event: "TABS_STATUS",
      tabs: tabs.map(t => ({ id: t.id, url: t.url, title: t.title }))
    });
  });
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
    return;
  }

  if (event === 'DISCOVERY_COMPLETE' || command === 'discovery_complete') {
    sendToHost({
      event: "DISCOVERY_COMPLETE",
      payload: msg.payload || msg
    });
    sendResp({ received: true });
    return;
  }

  if (command === 'check_handshake_status') {
    sendResp({
      handshake_confirmed: connectionState === 'CONNECTED',
      status: 'pong',
      connection_state: connectionState
    });
    return;
  }

  return false;
});

// ============================================================================
// UTILS
// ============================================================================

function sendToHost(msg) {
  if (nativePort && connectionState === 'CONNECTED') {
    nativePort.postMessage(msg);
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
      console.log('[Synapse] Keepalive');
    }
  });
}

// ============================================================================
// STARTUP
// ============================================================================

chrome.runtime.onInstalled.addListener(() => {
  console.log('[Synapse] Installed');
  initialize();
});

chrome.runtime.onStartup.addListener(() => {
  console.log('[Synapse] Startup');
});

initialize();