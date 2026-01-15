// ============================================================================
// BLOOM NUCLEUS: SYNAPSE ROUTER v2.2 (Chromium Optimized)
// Router de comunicación entre Brain (Python) y el Navegador.
// ============================================================================

let nativePort = null;
let isConnecting = false;
let configRetryCount = 0;

/**
 * 1. CARGA DE CONFIGURACIÓN DINÁMICA
 * Intenta cargar el archivo generado por el Profile Manager.
 */
function loadSynapseConfig() {
  try {
    importScripts('synapse.config.js');
    console.log("⚙️ [Synapse] Configuración cargada desde synapse.config.js");
  } catch (e) {
    console.warn("⚠️ [Synapse] Esperando a que Python genere synapse.config.js...");
  }
}

/**
 * 2. MÁQUINA DE ESTADOS DE CONEXIÓN
 * Asegura que solo exista un puente nativo activo y que la config esté lista.
 */
async function initializeSynapse() {
  if (nativePort || isConnecting) return;
  
  // Paso A: Verificar si la configuración ya cargó
  if (!self.SYNAPSE_CONFIG || !self.SYNAPSE_CONFIG.bridge_name) {
    configRetryCount++;
    loadSynapseConfig();
    // Reintento exponencial (máximo cada 2 segundos)
    const delay = Math.min(100 * configRetryCount, 2000);
    setTimeout(initializeSynapse, delay);
    return;
  }

  const HOST_NAME = self.SYNAPSE_CONFIG.bridge_name;
  isConnecting = true;

  console.log(`🔌 [Synapse] Conectando al bridge: ${HOST_NAME}...`);

  try {
    nativePort = chrome.runtime.connectNative(HOST_NAME);
    
    // Listeners del túnel nativo
    nativePort.onMessage.addListener(routeFromBrain);
    nativePort.onDisconnect.addListener(handleHostDisconnect);
    
    // Handshake inicial
    sendSystemHello();
    startHeartbeat();
    
    isConnecting = false;
    console.log("✅ [Synapse] Túnel nativo establecido.");
  } catch (error) {
    console.error(`❌ [Synapse] Error al conectar con ${HOST_NAME}:`, error);
    isConnecting = false;
    setTimeout(initializeSynapse, 3000);
  }
}

function handleHostDisconnect() {
  const error = chrome.runtime.lastError;
  console.warn("⚠️ [Synapse] Túnel cerrado:", error?.message || "Sin errores");
  nativePort = null;
  isConnecting = false;
  stopHeartbeat();
  // Reintento de reconexión
  setTimeout(initializeSynapse, 2000);
}

// ============================================================================
// 3. HEARTBEAT & SISTEMA
// ============================================================================

let heartbeatTimer = null;

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

function sendSystemHello() {
  if (!nativePort) return;
  const manifest = chrome.runtime.getManifest();
  nativePort.postMessage({
    type: "SYSTEM_HELLO",
    payload: {
      extension_id: chrome.runtime.id,
      version: manifest.version,
      capabilities: ["DOM_ACTUATE", "WINDOW_CONTROL", "DATA_MINING"]
    }
  });
}

// ============================================================================
// 4. ROUTING: BRAIN → TAB (Downstream)
// ============================================================================

async function routeFromBrain(message) {
  if (!message) return;
  const { type, target, command, payload, id } = message;
  
  // Ignorar ACKs de sistema
  if (type === "HEARTBEAT_ACK" || type === "SYSTEM_ACK") return;

  console.log(`📥 [Brain → Tab] ${command || type}`, payload);

  try {
    let result;
    switch (command) {
      case "WINDOW_CLOSE":
        result = await handleWindowClose();
        break;
      case "WINDOW_NAVIGATE":
        result = await handleNavigate(payload);
        break;
      case "CLOSE_PROFILE":
        result = await closeProfile(payload);
        break;
      default:
        // Por defecto, enviar a la pestaña activa (Content Script)
        result = await routeToTab(target, { command, payload, id });
    }

    if (id) sendToBrain({ id, status: "ok", result });

  } catch (error) {
    console.error(`❌ [Synapse] Error procesando comando [${command}]:`, error);
    if (id) sendToBrain({ id, status: "error", error: error.message });
  }
}

// ============================================================================
// 5. ROUTING: TAB → BRAIN (Upstream & Discovery)
// ============================================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { command, source } = message;

  // Manejo de la página de Discovery
  if (command === "ping" && source === "discovery_page") {
    sendResponse({ status: "pong", version: chrome.runtime.getManifest().version });
    return false;
  }

  if (command === "discovery_complete") {
    console.log("✅ [Discovery] Validación completada por el usuario.");
    sendToBrain({ type: "DISCOVERY_COMPLETE", payload: message });
    sendResponse({ received: true });
    return false;
  }

  // Forwarding genérico de Content Scripts hacia Python
  const enrichedMessage = {
    ...message,
    source: { tab_id: sender.tab?.id, url: sender.tab?.url }
  };
  
  sendToBrain(enrichedMessage);
  sendResponse({ received: true });
  return false;
});

// ============================================================================
// 6. IMPLEMENTACIÓN DE COMANDOS
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

async function closeProfile(payload = {}) {
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
      console.error("❌ [Synapse] Error de envío al Host:", e);
    }
  }
}

// ============================================================================
// 7. INICIO DE SECUENCIA
// ============================================================================

// Carga inicial
loadSynapseConfig();

// Iniciar bridge
initializeSynapse();

// Asegurar reconexión en eventos de ciclo de vida
chrome.runtime.onInstalled.addListener(initializeSynapse);
chrome.runtime.onStartup.addListener(initializeSynapse);