// ============================================================================
// BLOOM NUCLEUS: SYNAPSE ROUTER v2.0 (background.js)
// Filosofía: Router puro. No piensa, solo trafica.
// ============================================================================

const HOST_NAME = "com.bloom.nucleus.bridge";
const HEARTBEAT_INTERVAL = 15000;
const RECONNECT_BASE_DELAY = 2000;

let nativePort = null;
let heartbeatTimer = null;
let reconnectAttempts = 0;

// ============================================================================
// 1. GESTIÓN DE CONEXIÓN (Persistencia Resiliente)
// ============================================================================

function connectToNativeHost() {
  if (nativePort) return;
  
  console.log(`🔌 [Synapse Router] Connecting to ${HOST_NAME}...`);
  
  try {
    nativePort = chrome.runtime.connectNative(HOST_NAME);
    
    nativePort.onMessage.addListener(routeFromBrain);
    nativePort.onDisconnect.addListener(handleDisconnect);
    
    sendSystemHello();
    startHeartbeat();
    reconnectAttempts = 0;
    
    console.log("✅ [Synapse Router] Connected");
    
  } catch (error) {
    console.error("❌ [Synapse Router] Connection failed:", error);
    scheduleReconnect();
  }
}

function handleDisconnect() {
  const error = chrome.runtime.lastError;
  console.warn("⚠️ [Synapse Router] Disconnected:", error?.message || "Unknown");
  
  nativePort = null;
  stopHeartbeat();
  scheduleReconnect();
}

function scheduleReconnect() {
  const delay = Math.min(
    RECONNECT_BASE_DELAY * Math.pow(2, reconnectAttempts),
    30000 // Max 30s
  );
  
  reconnectAttempts++;
  console.log(`🔄 [Synapse Router] Reconnecting in ${delay}ms (attempt ${reconnectAttempts})...`);
  
  setTimeout(connectToNativeHost, delay);
}

// ============================================================================
// 2. HEARTBEAT (Keep-Alive)
// ============================================================================

function startHeartbeat() {
  stopHeartbeat();
  heartbeatTimer = setInterval(() => {
    if (nativePort) {
      try {
        nativePort.postMessage({ 
          type: "HEARTBEAT",
          timestamp: Date.now() 
        });
      } catch (e) {
        handleDisconnect();
      }
    }
  }, HEARTBEAT_INTERVAL);
}

function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

// ============================================================================
// 3. HANDSHAKE (Identificación del Worker)
// ============================================================================

function sendSystemHello() {
  if (!nativePort) return;
  
  const manifest = chrome.runtime.getManifest();
  
  nativePort.postMessage({
    type: "SYSTEM_HELLO",
    payload: {
      extension_id: chrome.runtime.id,
      version: manifest.version,
      profile_info: null, // TODO: Obtener de chrome.storage
      capabilities: ["DOM_ACTUATE", "FILE_UPLOAD", "CHUNKED_TRANSFER"],
      timestamp: new Date().toISOString()
    }
  });
  
  console.log("👋 [Synapse Router] Handshake sent");
}

// ============================================================================
// 4. ROUTING: BRAIN → TAB (Comandos Downstream)
// ============================================================================

async function routeFromBrain(message) {
  const { type, target, command, payload } = message;
  
  // Filtrar mensajes de sistema (no son comandos)
  if (type === "HEARTBEAT_ACK" || type === "SYSTEM_READY") {
    return;
  }
  
  console.log(`📥 [Brain → Tab] ${command || type}`, payload);
  
  try {
    let result;
    
    switch (command) {
      // ──────────────────────────────────────────────────
      // COMANDOS NATIVOS DEL ROUTER (No van al content.js)
      // ──────────────────────────────────────────────────
      
      case "WINDOW_CLOSE":
        result = await handleWindowClose();
        break;
        
      case "WINDOW_OPEN_TAB":
        result = await handleOpenTab(payload);
        break;
        
      case "WINDOW_NAVIGATE":
        result = await handleNavigate(payload);
        break;
      
      // ──────────────────────────────────────────────────
      // COMANDOS QUE VAN AL ACTUADOR (content.js)
      // ──────────────────────────────────────────────────
      
      default:
        // Rutear al tab especificado o al activo
        result = await routeToTab(target, { command, payload });
    }
    
    // Responder al Brain si el mensaje tiene ID (para tracking)
    if (message.id) {
      sendToBrain({ 
        id: message.id, 
        status: "ok", 
        result 
      });
    }
    
  } catch (error) {
    console.error(`❌ [Synapse Router] Error executing [${command}]:`, error);
    
    if (message.id) {
      sendToBrain({ 
        id: message.id, 
        status: "error", 
        error: error.message 
      });
    }
  }
}

// ============================================================================
// 5. ROUTING: TAB → BRAIN (Eventos Upstream)
// ============================================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { event, action, payload } = message;
  
  // Enriquecer con metadata del tab
  const enrichedMessage = {
    ...message,
    source: {
      tab_id: sender.tab?.id,
      url: sender.tab?.url,
      timestamp: Date.now()
    }
  };
  
  console.log(`📤 [Tab → Brain] ${event || action}`, payload);
  
  sendToBrain(enrichedMessage);
  
  sendResponse({ received: true });
  return false; // No async
});

// ============================================================================
// 6. COMANDOS INTERNOS DEL ROUTER
// ============================================================================

async function handleWindowClose() {
  const currentWindow = await chrome.windows.getCurrent();
  await chrome.windows.remove(currentWindow.id);
  return { closed: true, window_id: currentWindow.id };
}

async function handleOpenTab(payload) {
  const { url, active = false } = payload;
  const tab = await chrome.tabs.create({ url, active });
  return { tab_id: tab.id, url: tab.url };
}

async function handleNavigate(payload) {
  const { tab_id, url } = payload;
  
  if (!tab_id) {
    throw new Error("tab_id required for navigation");
  }
  
  await chrome.tabs.update(tab_id, { url });
  return { navigated: true, tab_id, url };
}

// ============================================================================
// 7. HELPERS DE RUTEO
// ============================================================================

async function routeToTab(target, message) {
  let tabId;
  
  if (target === "active" || !target) {
    // Obtener tab activo
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs.length) throw new Error("No active tab found");
    tabId = tabs[0].id;
  } else if (typeof target === "number") {
    tabId = target;
  } else {
    throw new Error(`Invalid target: ${target}`);
  }
  
  return await chrome.tabs.sendMessage(tabId, message);
}

function sendToBrain(message) {
  if (nativePort) {
    try {
      nativePort.postMessage(message);
    } catch (e) {
      console.error("❌ [Synapse Router] Failed to send to Brain:", e);
      handleDisconnect();
    }
  } else {
    console.warn("⚠️ [Synapse Router] Cannot send: not connected");
  }
}

// ============================================================================
// 8. INICIALIZACIÓN
// ============================================================================

chrome.runtime.onInstalled.addListener(() => {
  console.log("🚀 [Synapse Router] Extension installed");
  connectToNativeHost();
});

chrome.runtime.onStartup.addListener(() => {
  console.log("🚀 [Synapse Router] Browser started");
  connectToNativeHost();
});

// Conectar inmediatamente
connectToNativeHost();