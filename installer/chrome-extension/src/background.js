// ============================================================================
// BLOOM NUCLEUS: SYNAPSE ROUTER v2.1
// Router puro con capacidades de gestión de Ventanas y Discovery.
// ============================================================================

const HEARTBEAT_INTERVAL = 15000;
const RECONNECT_BASE_DELAY = 2000;

let nativePort = null;
let heartbeatTimer = null;
let reconnectAttempts = 0;

// 1. Cargar la configuración generada por Python
try {
  // Python escribirá este archivo en la carpeta de la extensión del perfil
  importScripts('synapse.config.js');
} catch (e) {
  console.error("❌ [Synapse] No se encontró synapse.config.js. El bridge no funcionará.");
}

// 2. Obtener el nombre del host de forma segura
const HOST_NAME = self.SYNAPSE_CONFIG?.bridge_name;

if (!HOST_NAME) {
  console.error("❌ [Synapse] HOST_NAME no definido. Abortando conexión nativa.");
}

// ============================================================================
// 1. GESTIÓN DE CONEXIÓN
// ============================================================================

// Al principio del archivo
function connectWithRetry() {
  if (!HOST_NAME) {
    console.error("Esperando configuración...");
    setTimeout(connectWithRetry, 1000);
    return;
  }
  console.log("Intentando conexión nativa...");
  try {
    connectToNativeHost();
  } catch (e) {
    setTimeout(connectWithRetry, 2000);
  }
}

function connectToNativeHost() {
  // 1. Evitar conexiones duplicadas (Tu línea actual)
  if (nativePort) return;

  // 2. Validar que Python inyectó el nombre del bridge correctamente
  if (!HOST_NAME) {
    console.error("❌ [Synapse] Abortando: HOST_NAME no está definido en synapse.config.js");
    // Opcional: reintentar en 2 segundos por si el archivo tardó en cargar
    setTimeout(connectToNativeHost, 2000); 
    return;
  }

  console.log(`🔌 [Synapse] Connecting to ${HOST_NAME}...`);

  try {
    nativePort = chrome.runtime.connectNative(HOST_NAME);
    
    nativePort.onMessage.addListener(routeFromBrain);
    nativePort.onDisconnect.addListener(handleDisconnect);
    
    sendSystemHello();
    startHeartbeat();
    reconnectAttempts = 0;
    
    console.log("✅ [Synapse] Connected to profile-specific host");
  } catch (error) {
    console.error(`❌ [Synapse] Connection failed to ${HOST_NAME}:`, error);
    scheduleReconnect();
  }
}

function handleDisconnect() {
  const error = chrome.runtime.lastError;
  console.warn("⚠️ [Synapse] Disconnected:", error?.message || "Unknown");
  nativePort = null;
  stopHeartbeat();
  scheduleReconnect();
}

function scheduleReconnect() {
  const delay = Math.min(RECONNECT_BASE_DELAY * Math.pow(2, reconnectAttempts), 30000);
  reconnectAttempts++;
  setTimeout(connectToNativeHost, delay);
}

// ============================================================================
// 2. HEARTBEAT & HANDSHAKE
// ============================================================================

function startHeartbeat() {
  stopHeartbeat();
  heartbeatTimer = setInterval(() => {
    if (nativePort) nativePort.postMessage({ type: "HEARTBEAT", timestamp: Date.now() });
  }, HEARTBEAT_INTERVAL);
}

function stopHeartbeat() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = null;
}

function sendSystemHello() {
  if (!nativePort) return;
  const manifest = chrome.runtime.getManifest();
  nativePort.postMessage({
    type: "SYSTEM_HELLO",
    payload: {
      extension_id: chrome.runtime.id,
      version: manifest.version,
      capabilities: ["DOM_ACTUATE", "WINDOW_CONTROL", "DISCOVERY"]
    }
  });
}

// ============================================================================
// 3. ROUTING: BRAIN → TAB (Downstream)
// ============================================================================

async function routeFromBrain(message) {
  const { type, target, command, payload } = message;
  
  // Ignorar ACKs de sistema
  if (type === "HEARTBEAT_ACK" || type === "SYSTEM_ACK") return;

  console.log(`📥 [Brain → Tab] ${command || type}`, payload);

  try {
    let result;

    switch (command) {
      // --- COMANDOS NATIVOS DE VENTANA (Synapse v2.1) ---
      
      case "WINDOW_CLOSE":
        // Cierra la ventana actual (o todo el perfil si es la última)
        result = await handleWindowClose();
        break;

      case "WINDOW_NAVIGATE":
        result = await handleNavigate(payload);
        break;

      case "CLOSE_PROFILE":
        // Cierre agresivo de todo el perfil
        result = await closeProfile(payload);
        break;

      // --- COMANDOS DE DOM (Pasan al content.js) ---
      default:
        result = await routeToTab(target, { command, payload });
    }

    if (message.id) sendToBrain({ id: message.id, status: "ok", result });

  } catch (error) {
    console.error(`❌ Error en comando [${command}]:`, error);
    if (message.id) sendToBrain({ id: message.id, status: "error", error: error.message });
  }
}

// ============================================================================
// 4. ROUTING: TAB → BRAIN (Upstream & Discovery)
// ============================================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { command, source } = message;

  // A. DISCOVERY PAGE HANDLER (Synapse v2.1)
  // La página de discovery manda un ping simple para ver si la extensión vive.
  if (command === "ping" && source === "discovery_page") {
    console.log("📡 [Discovery] Ping received from page");
    sendResponse({ status: "pong", version: chrome.runtime.getManifest().version });
    return false; // Sync response
  }

  // B. DISCOVERY COMPLETE
  // La página de discovery avisa que terminó la validación
  if (command === "discovery_complete") {
    console.log("✅ [Discovery] Validation complete");
    sendToBrain({
      type: "DISCOVERY_COMPLETE", // Evento para el Brain
      payload: message
    });
    sendResponse({ received: true });
    return false;
  }

  // C. GENERIC FORWARDING (Tab -> Brain)
  const enrichedMessage = {
    ...message,
    source: { tab_id: sender.tab?.id, url: sender.tab?.url }
  };
  
  console.log(`📤 [Tab → Brain] ${message.event || message.command}`);
  sendToBrain(enrichedMessage);
  
  sendResponse({ received: true });
  return false;
});

// ============================================================================
// 5. IMPLEMENTACIÓN DE COMANDOS DE VENTANA
// ============================================================================

async function handleWindowClose() {
  const win = await chrome.windows.getCurrent();
  await chrome.windows.remove(win.id);
  return { closed: true, window_id: win.id };
}

async function closeProfile(payload = {}) {
  const { delay = 500 } = payload;
  
  // Notificar a tabs para cleanup
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    try {
      chrome.tabs.sendMessage(tab.id, { command: "PROFILE_CLOSING" });
    } catch (e) {}
  }

  // Pequeño delay para que los mensajes salgan
  await new Promise(r => setTimeout(r, delay));

  // Cerrar todas las ventanas = Matar proceso de Chrome
  const windows = await chrome.windows.getAll();
  for (const win of windows) {
    await chrome.windows.remove(win.id);
  }
  return { status: "profile_terminated" };
}

async function handleNavigate(payload) {
  const { tab_id, url } = payload;
  if (!tab_id && !payload.target) {
     // Si no hay ID, usar active tab
     const tabs = await chrome.tabs.query({active: true, currentWindow: true});
     if(tabs[0]) await chrome.tabs.update(tabs[0].id, { url });
  } else {
     await chrome.tabs.update(tab_id, { url });
  }
  return { navigated: true };
}

// ============================================================================
// 6. HELPERS (Con Blindaje)
// ============================================================================

async function routeToTab(target, message) {
  let tabId = target;
  
  if (target === "active" || !target) {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tabs.length) {
      console.warn("⚠️ [Router] No active tab found to route message:", message);
      // No lanzamos error, solo avisamos que no se pudo entregar
      return { status: "skipped", reason: "no_active_tab" };
    }
    tabId = tabs[0].id;
  }
  
  try {
    // Intentamos enviar el mensaje
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (error) {
    // Si el content script no está listo, Chrome lanza "Receiving end does not exist"
    if (error.message.includes("Receiving end does not exist")) {
      console.warn(`⚠️ [Router] Tab ${tabId} not ready yet (Content Script missing). Message queued/dropped.`);
      // Retornamos un estado "pending" en lugar de crashear
      return { status: "pending", reason: "content_script_not_ready" };
    }
    
    // Otros errores sí los re-lanzamos
    throw error;
  }
}

// ============================================================================
// 7. SEND TO BRAIN
// ============================================================================


function sendToBrain(message) {
  if (nativePort) {
    try {
      nativePort.postMessage(message);
    } catch (e) {
      console.error("❌ [Synapse] Error enviando al host nativo:", e);
    }
  } else {
    console.warn("⚠️ [Synapse] No hay conexión activa con el host nativo.");
  }
}

// Reemplazá tu connectToNativeHost() inicial por esto:
chrome.runtime.onInstalled.addListener(() => {
  connectWithRetry();
});

// Forzar despertar
connectWithRetry();