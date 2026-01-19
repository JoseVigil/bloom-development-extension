// ============================================================================
// BLOOM NUCLEUS: SYNAPSE ROUTER v2.4 (Config-Aware Bootstrap)
// FIX QUIRÚRGICO: Validación robusta de config antes de conectar
// ============================================================================

let nativePort = null;
let heartbeatTimer = null;
let configCheckTimer = null;

// ============================================================================
// PROXY LOGGING → HOST
// ============================================================================

function logToHost(level, message) {
  if (nativePort) {
    nativePort.postMessage({
      type: "LOG",
      level,
      message,
      timestamp: Date.now()
    });
  }
}

// ============================================================================
// CONFIG LOADING WITH RETRY
// ============================================================================

async function ensureConfig(maxRetries = 40) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      importScripts('synapse.config.js');
      
      if (self.SYNAPSE_CONFIG?.profileId && self.SYNAPSE_CONFIG?.bridge_name) {
        console.log(`✅ [Synapse] Config loaded: profile=${self.SYNAPSE_CONFIG.profileId.substring(0, 8)}, bridge=${self.SYNAPSE_CONFIG.bridge_name}`);
        logToHost("info", `Config loaded on attempt ${attempt + 1}`);
        return true;
      }
    } catch (e) {
      // Config file doesn't exist yet
    }
    
    console.log(`⏳ [Synapse] Waiting for config (attempt ${attempt + 1}/${maxRetries})...`);
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.error("❌ [Synapse] Config timeout after 10 seconds");
  return false;
}

// ============================================================================
// INITIALIZATION & HANDSHAKE
// ============================================================================

async function initializeSynapse() {
  if (nativePort) {
    logToHost("debug", "Init skipped: port already exists");
    return;
  }

  // ========================================================================
  // FIX CRÍTICO: VALIDAR CONFIG ANTES DE CONECTAR
  // ========================================================================
  const configReady = await ensureConfig();
  
  if (!configReady) {
    console.error("❌ [Synapse] Cannot initialize without valid config");
    logToHost("error", "Config timeout - retrying in 5s");
    setTimeout(initializeSynapse, 5000);
    return;
  }

  // GUARDA 1: Verificar que SYNAPSE_CONFIG existe
  if (!self.SYNAPSE_CONFIG) {
    console.error("❌ [Synapse] SYNAPSE_CONFIG is undefined");
    logToHost("error", "SYNAPSE_CONFIG undefined - retrying in 5s");
    setTimeout(initializeSynapse, 5000);
    return;
  }

  // GUARDA 2: Verificar que profileId existe
  if (!self.SYNAPSE_CONFIG.profileId) {
    console.error("❌ [Synapse] Missing profileId in config");
    logToHost("error", "Missing profileId - retrying in 5s");
    setTimeout(initializeSynapse, 5000);
    return;
  }

  // GUARDA 3: Verificar que bridge_name existe
  if (!self.SYNAPSE_CONFIG.bridge_name) {
    console.error("❌ [Synapse] Missing bridge_name in config");
    logToHost("error", "Missing bridge_name - retrying in 5s");
    setTimeout(initializeSynapse, 5000);
    return;
  }

  // ========================================================================
  // CONEXIÓN SEGURA CON CONFIG VALIDADO
  // ========================================================================
  try {
    const { profileId, bridge_name } = self.SYNAPSE_CONFIG;
    
    console.log(`🔌 [Synapse] Connecting to bridge: ${bridge_name}`);
    
    nativePort = chrome.runtime.connectNative(bridge_name);
    
    console.log(`✅ [Synapse] Bridge connected: ${bridge_name}`);
    logToHost("info", `Bridge connected: ${bridge_name}`);

    // IDENTITY-FIRST: Profile ID en el primer paquete
    const helloPacket = {
      type: "SYSTEM_HELLO",
      payload: {
        profile_id: profileId,
        extension_id: chrome.runtime.id,
        version: chrome.runtime.getManifest().version,
        capabilities: ["DOM_ACTUATE", "WINDOW_CONTROL", "DATA_MINING"]
      }
    };

    nativePort.postMessage(helloPacket);
    
    console.log(`📤 [Synapse] SYSTEM_HELLO sent with profile_id: ${profileId.substring(0, 8)}...`);
    logToHost("info", `SYSTEM_HELLO sent with profile_id: ${profileId}`);

    nativePort.onMessage.addListener(handleHostMessage);
    nativePort.onDisconnect.addListener(handleHostDisconnect);

    startHeartbeat();

  } catch (e) {
    console.error("❌ [Synapse] Init failed:", e.message);
    logToHost("error", `Init failed: ${e.message}`);
    nativePort = null;
    setTimeout(initializeSynapse, 2000);
  }
}

// ============================================================================
// HOST → BROWSER
// ============================================================================

async function handleHostMessage(msg) {
  if (!msg) return;

  const { type, command, payload, id } = msg;

  if (type === "HEARTBEAT_ACK") return;

  // Handshake exitoso
  if (type === "SYSTEM_ACK" || command === "system_ready") {
    console.log("✅ [Synapse] Handshake confirmed by host");
    logToHost("success", "Handshake confirmed. Notifying Discovery...");
    
    const tabs = await chrome.tabs.query({});
    const target = tabs.find(t => t.url?.includes("discovery/index.html"));
    
    if (target) {
      try {
        await chrome.tabs.sendMessage(target.id, {
          command: "system_ready",
          payload: payload || {}
        });
        console.log("✅ [Synapse] Discovery page notified");
        logToHost("success", "Discovery notified");
      } catch (e) {
        console.warn("⚠️ [Synapse] Discovery notification failed:", e.message);
        logToHost("warn", `Discovery notification failed: ${e.message}`);
      }
    }
    return;
  }

  // Comando ejecutable
  console.log(`🔥 [Brain → Tab] Executing: ${command || type}`);
  logToHost("info", `Executing: ${command || type}`);

  try {
    let result;

    switch (command) {
      case "WINDOW_NAVIGATE":
        result = await handleNavigate(payload);
        break;
      case "WINDOW_CLOSE":
        result = await handleWindowClose();
        break;
      case "CLOSE_PROFILE":
        result = await closeProfile();
        break;
      default:
        result = await routeToTab(msg.target, { command, payload, id });
    }

    if (id) sendToBrain({ id, status: "ok", result });

  } catch (error) {
    console.error(`❌ [Synapse] Command [${command}] failed:`, error);
    logToHost("error", `Command [${command}] failed: ${error.message}`);
    if (id) sendToBrain({ id, status: "error", error: error.message });
  }
}

function handleHostDisconnect() {
  const error = chrome.runtime.lastError;
  console.warn("⚠️ [Synapse] Tunnel closed:", error?.message || "Unknown");
  logToHost("warn", `Tunnel closed: ${error?.message || "Unknown"}`);
  
  nativePort = null;
  stopHeartbeat();
  setTimeout(initializeSynapse, 2000);
}

// ============================================================================
// HEARTBEAT
// ============================================================================

function startHeartbeat() {
  stopHeartbeat();
  heartbeatTimer = setInterval(() => {
    if (nativePort) {
      nativePort.postMessage({ type: "HEARTBEAT", timestamp: Date.now() });
    }
  }, 15000);
}

function stopHeartbeat() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = null;
}

// ============================================================================
// BROWSER → HOST (Unified Listener)
// ============================================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { command, source, type } = message;

  // Discovery ping
  if (command === "ping" && source === "discovery_page") {
    sendResponse({ 
      status: "pong", 
      version: chrome.runtime.getManifest().version,
      hasConfig: !!self.SYNAPSE_CONFIG?.profileId
    });
    return false;
  }

  // Discovery complete (delayed send)
  if (command === "discovery_complete" || type === "DISCOVERY_COMPLETE") {
    console.log("⏳ [Discovery] Validation complete. Waiting 500ms for TCP stability...");
    logToHost("info", "Discovery validation complete. Waiting 500ms for TCP stability...");
    setTimeout(() => {
      sendToBrain(message);
      console.log("🚀 [Discovery] DISCOVERY_COMPLETE forwarded to host");
      logToHost("info", "DISCOVERY_COMPLETE forwarded to host");
    }, 500);
    sendResponse({ received: true });
    return false;
  }

  // Generic forwarding
  const enriched = {
    ...message,
    source: { tab_id: sender.tab?.id, url: sender.tab?.url }
  };

  sendToBrain(enriched);
  sendResponse({ received: true });
  return false;
});

// ============================================================================
// COMMAND HANDLERS
// ============================================================================

async function handleWindowClose() {
  const win = await chrome.windows.getCurrent();
  await chrome.windows.remove(win.id);
  return { closed: true };
}

async function handleNavigate(payload) {
  const { url } = payload;
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs[0]) {
    await chrome.tabs.update(tabs[0].id, { url });
    return { navigated: true };
  }
  return { navigated: false, reason: "no_active_tab" };
}

async function closeProfile() {
  const windows = await chrome.windows.getAll();
  for (const win of windows) {
    await chrome.windows.remove(win.id);
  }
  return { status: "terminating" };
}

async function routeToTab(target, message) {
  let tabId = target;
  if (target === "active" || !target) {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs.length) return { status: "skipped", reason: "no_active_tab" };
    tabId = tabs[0].id;
  }

  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (error) {
    if (error.message.includes("Receiving end does not exist")) {
      return { status: "pending", reason: "content_script_not_ready" };
    }
    throw error;
  }
}

function sendToBrain(message) {
  if (nativePort) {
    try {
      nativePort.postMessage(message);
    } catch (e) {
      console.error("❌ [Synapse] Send to host failed:", e);
      logToHost("error", `Send to host failed: ${e.message}`);
    }
  }
}

// ============================================================================
// BOOT SEQUENCE
// ============================================================================

console.log("🚀 [Synapse] Service Worker starting...");

initializeSynapse();

chrome.runtime.onInstalled.addListener(() => {
  console.log("🔄 [Synapse] Extension installed/updated");
  initializeSynapse();
});

chrome.runtime.onStartup.addListener(() => {
  console.log("🔄 [Synapse] Browser startup");
  initializeSynapse();
});