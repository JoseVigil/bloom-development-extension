// ============================================================================
// SYNAPSE NUCLEUS v2.0 - Config Loading Fix
// ============================================================================

let nativePort = null;
let heartbeatTimer = null;
let connectionState = 'INITIALIZING';
let SYNAPSE_CONFIG = null;  // ✅ Variable global

// ============================================================================
// CONFIG LOADING (MANIFEST V3 COMPATIBLE - NO EVAL)
// ============================================================================

async function loadConfig() {
  try {
    // Opción 1: Usar importScripts (funciona en Service Workers)
    try {
      importScripts('synapse.config.js');
      SYNAPSE_CONFIG = self.SYNAPSE_CONFIG;
      
      if (!SYNAPSE_CONFIG?.profileId || !SYNAPSE_CONFIG?.bridge_name || !SYNAPSE_CONFIG?.launchId) {
        throw new Error(`Config incomplete: ${JSON.stringify(SYNAPSE_CONFIG)}`);
      }
      
      console.log('[Config] Loaded via importScripts:', SYNAPSE_CONFIG);
      logToHost("info", `Config loaded: ${SYNAPSE_CONFIG.profileId}`);
      return true;
      
    } catch (importError) {
      console.log('[Config] importScripts failed, trying fetch+parse:', importError.message);
      
      // Opción 2: Parsear manualmente (fallback)
      const configUrl = chrome.runtime.getURL('synapse.config.js');
      const response = await fetch(configUrl);
      const configText = await response.text();
      
      // Extraer valores con regex (sin eval)
      const profileIdMatch = configText.match(/profileId:\s*['"]([^'"]+)['"]/);
      const bridgeMatch = configText.match(/bridge_name:\s*['"]([^'"]+)['"]/);
      const launchIdMatch = configText.match(/launchId:\s*['"]([^'"]+)['"]/);
      const aliasMatch = configText.match(/profile_alias:\s*['"]([^'"]+)['"]/);
      const extIdMatch = configText.match(/extension_id:\s*['"]([^'"]+)['"]/);
      
      if (!profileIdMatch || !bridgeMatch || !launchIdMatch) {
        throw new Error('Could not parse config file');
      }
      
      SYNAPSE_CONFIG = {
        profileId: profileIdMatch[1],
        bridge_name: bridgeMatch[1],
        launchId: launchIdMatch[1],
        profile_alias: aliasMatch ? aliasMatch[1] : '',
        extension_id: extIdMatch ? extIdMatch[1] : chrome.runtime.id
      };
      
      console.log('[Config] Loaded via regex parse:', SYNAPSE_CONFIG);
      logToHost("info", `Config loaded: ${SYNAPSE_CONFIG.profileId}`);
      return true;
    }
    
  } catch (error) {
    console.error('[Config] Load error:', error);
    logToHost("error", `Config load failed: ${error.message}`);
    return false;
  }
}

// ============================================================================
// LOGGING
// ============================================================================

function logToHost(level, message) {
  if (nativePort) {
    try {
      nativePort.postMessage({ 
        type: "LOG", 
        level, 
        message, 
        timestamp: Date.now() 
      });
    } catch (e) {
      console.error('[Synapse] Log failed:', e);
    }
  }
  console.log(`[Synapse:${level.toUpperCase()}] ${message}`);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ============================================================================
// NATIVE BRIDGE INITIALIZATION
// ============================================================================

async function initializeSynapse() {
  if (nativePort) {
    logToHost("warn", "Bridge already active, skipping init");
    return;
  }

  // ✅ Cargar config primero
  const configLoaded = await loadConfig();
  if (!configLoaded) {
    logToHost("error", "Config missing");
    setTimeout(initializeSynapse, 5000);
    return;
  }

  try {
    const { profileId, bridge_name, launchId } = SYNAPSE_CONFIG;

    logToHost("info", `Connecting to native bridge: ${bridge_name}`);
    nativePort = chrome.runtime.connectNative(bridge_name);
    
    nativePort.postMessage({
      type: "SYSTEM_HELLO",
      payload: {
        profile_id: profileId,
        launch_id: launchId,
        extension_id: chrome.runtime.id,
        version: chrome.runtime.getManifest().version,
        timestamp: Date.now()
      }
    });

    nativePort.onMessage.addListener(handleHostMessage);
    nativePort.onDisconnect.addListener(handleHostDisconnect);
    
    connectionState = 'CONNECTED';
    startHeartbeat();
    
    logToHost("success", `✓ Bridge established - Profile: ${profileId}`);

  } catch (e) {
    logToHost("error", `Bridge connection failed: ${e.message}`);
    nativePort = null;
    connectionState = 'DISCONNECTED';
    setTimeout(initializeSynapse, 2000);
  }
}

// ============================================================================
// HOST MESSAGE HANDLING
// ============================================================================

async function handleHostMessage(msg) {
  if (!msg) return;
  
  const { type, command, payload, id } = msg;
  
  logToHost("debug", `◄ Received: ${type || command}`);

  if (type === "SYSTEM_ACK" || command === "system_ready") {
    connectionState = 'CONNECTED';
    logToHost("success", "✓ SYSTEM_ACK received - Notifying Discovery UI");
    await notifyDiscoveryPage(payload || { status: "connected" });
    return;
  }

  try {
    switch (command) {
      case "WINDOW_NAVIGATE":
        await handleNavigate(payload);
        break;
      case "TAB_EXECUTE":
        await handleExecuteScript(payload);
        break;
      case "SYSTEM_STATUS":
        sendHostResponse(id, { status: connectionState });
        break;
      default:
        logToHost("warn", `Unknown command: ${command}`);
    }
  } catch (err) {
    logToHost("error", `Command execution failed: ${err.message}`);
    sendHostResponse(id, { error: err.message });
  }
}

// ============================================================================
// DISCOVERY PAGE NOTIFICATION
// ============================================================================

async function notifyDiscoveryPage(payload, attempt = 1, maxAttempts = 15) {
  try {
    const tabs = await chrome.tabs.query({});
    const discoveryTab = tabs.find(t => t.url?.includes("discovery/index.html"));

    if (!discoveryTab) {
      if (attempt < maxAttempts) {
        logToHost("debug", `Discovery page not found, retry ${attempt}/${maxAttempts}`);
        setTimeout(() => notifyDiscoveryPage(payload, attempt + 1, maxAttempts), 1000);
      } else {
        logToHost("warn", "Discovery page not found after max retries");
      }
      return;
    }

    await chrome.tabs.sendMessage(discoveryTab.id, {
      command: "system_ready",
      payload: {
        ...payload,
        profile_id: SYNAPSE_CONFIG?.profileId,
        connection_state: connectionState,
        timestamp: Date.now()
      }
    });

    logToHost("success", `✓ Discovery UI notified (tab ${discoveryTab.id})`);

  } catch (e) {
    logToHost("error", `Failed to notify Discovery: ${e.message}`);
    if (attempt < maxAttempts) {
      setTimeout(() => notifyDiscoveryPage(payload, attempt + 1, maxAttempts), 1000);
    }
  }
}

// ============================================================================
// COMMAND HANDLERS
// ============================================================================

async function handleNavigate(payload) {
  const { url, tab_id } = payload;
  if (tab_id) {
    await chrome.tabs.update(tab_id, { url });
  } else {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]) await chrome.tabs.update(tabs[0].id, { url });
  }
  logToHost("info", `Navigated to: ${url}`);
}

async function handleExecuteScript(payload) {
  const { code, tab_id } = payload;
  const target = tab_id || (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;
  if (target) {
    await chrome.scripting.executeScript({ target: { tabId: target }, func: new Function(code) });
    logToHost("info", "Script executed");
  }
}

function sendHostResponse(id, data) {
  if (nativePort && id) {
    nativePort.postMessage({ type: "RESPONSE", id, payload: data });
  }
}

// ============================================================================
// CONNECTION MANAGEMENT
// ============================================================================

function handleHostDisconnect() {
  const error = chrome.runtime.lastError;
  logToHost("warn", `Bridge disconnected: ${error?.message || 'Unknown reason'}`);
  
  nativePort = null;
  connectionState = 'DISCONNECTED';
  stopHeartbeat();
  
  setTimeout(initializeSynapse, 2000);
}

function startHeartbeat() {
  stopHeartbeat();
  heartbeatTimer = setInterval(() => {
    if (nativePort) {
      nativePort.postMessage({ 
        type: "HEARTBEAT", 
        timestamp: Date.now() 
      });
    }
  }, 15000);
}

function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

// ============================================================================
// EXTENSION MESSAGE LISTENER
// ============================================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { command, source, type } = message;

  if (command === "ping" || command === "check_handshake_status") {
    const isReady = nativePort !== null && connectionState === 'CONNECTED';
    
    logToHost("debug", `Status check from ${source}: ${isReady ? 'READY' : 'NOT READY'}`);
    
    sendResponse({
      status: isReady ? "pong" : "waiting",
      connection_state: connectionState,
      handshake_confirmed: isReady,
      profile_id: SYNAPSE_CONFIG?.profileId,
      timestamp: Date.now()
    });
    
    return true;
  }

  if (command === "discovery_complete" || type === "DISCOVERY_COMPLETE") {
    logToHost("info", "Discovery phase completed");
    if (nativePort) {
      setTimeout(() => {
        nativePort.postMessage({
          type: "DISCOVERY_COMPLETE",
          payload: message.payload || {},
          timestamp: Date.now()
        });
      }, 500);
    }
    sendResponse({ received: true });
    return true;
  }

  if (nativePort) {
    const enriched = {
      ...message,
      source: {
        tab_id: sender.tab?.id,
        url: sender.tab?.url,
        frame_id: sender.frameId
      },
      timestamp: Date.now()
    };
    
    nativePort.postMessage(enriched);
    sendResponse({ received: true });
  } else {
    sendResponse({ error: "Bridge not connected" });
  }

  return true;
});

// ============================================================================
// BOOT SEQUENCE
// ============================================================================

initializeSynapse();

chrome.runtime.onInstalled.addListener(async (details) => {
  logToHost("info", `Extension ${details.reason}`);
  
  if (details.reason === 'install' || details.reason === 'update') {
    await chrome.tabs.create({
      url: chrome.runtime.getURL('discovery/index.html'),
      active: true
    });
  }
  
  initializeSynapse();
});

chrome.runtime.onStartup.addListener(() => {
  logToHost("info", "Browser started");
  initializeSynapse();
});

if (chrome.alarms) {
  chrome.alarms.create('keepalive', { periodInMinutes: 1 });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'keepalive') {
      logToHost("debug", "Service worker keepalive");
    }
  });
}