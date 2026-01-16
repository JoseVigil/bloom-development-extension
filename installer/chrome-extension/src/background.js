// ============================================================================
// BLOOM NUCLEUS: SYNAPSE ROUTER v2.2 (Chromium Optimized)
// Router de comunicación entre Brain (Python) y el Navegador.
// ============================================================================

let nativePort = null;
try { importScripts('synapse.config.js'); } catch (e) {}
let isConnecting = false;
let configRetryCount = 0;

  // ============================================================================
  // 1. CARGA DE CONFIGURACIÓN Y CONEXIÓN
  // ============================================================================

  function loadSynapseConfig() {
    try {
      importScripts('synapse.config.js');
      console.log("⚙️ [Synapse] Configuración cargada.");
    } catch (e) {
      console.warn("⚠️ [Synapse] Esperando synapse.config.js...");
    }
  }

  async function initializeSynapse() {
    if (nativePort || !self.SYNAPSE_CONFIG) return;
    try {
      nativePort = chrome.runtime.connectNative(self.SYNAPSE_CONFIG.bridge_name);
      nativePort.onMessage.addListener(async (msg) => {
        // Reintento de envío a la web (evita el "receiving end does not exist")
        let delivered = false;
        for (let i = 0; i < 5 && !delivered; i++) {
          const tabs = await chrome.tabs.query({});
          const target = tabs.find(t => t.url && t.url.includes("discovery/index.html"));
          if (target) {
            try {
              await chrome.tabs.sendMessage(target.id, { command: "system_ready", payload: msg.payload || msg });
              delivered = true;
            } catch (e) { await new Promise(r => setTimeout(r, 500)); }
          }
        }
      });
      nativePort.onDisconnect.addListener(() => {
        nativePort = null;
        setTimeout(initializeSynapse, 2000);
      });
      nativePort.postMessage({ type: "SYSTEM_HELLO" });
    } catch (e) { setTimeout(initializeSynapse, 2000); }
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
  const { type, command, payload, id } = message;
  
  // 1. IGNORAR RUIDO TÉCNICO
  if (type === "HEARTBEAT_ACK") return;

  // 2. HANDSHAKE (Lo que pone el Discovery en VERDE)
  if (type === "SYSTEM_ACK" || command === "system_ready") {
    console.log("✅ [Synapse] Handshake exitoso recibido. Notificando a la web...");
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (tab.url && tab.url.includes("discovery/index.html")) {
        chrome.tabs.sendMessage(tab.id, { 
          command: "system_ready", 
          payload: payload 
        });
      }
    }
    return;
  }

  // 3. COMANDOS DE ACCIÓN (Lo que hace que el bot trabaje)
  console.log(`📥 [Brain → Tab] Ejecutando: ${command || type}`, payload);

  try {
    let result;
    switch (command) {
      case "WINDOW_NAVIGATE":
        // payload debe ser { url: "..." }
        result = await handleNavigate(payload);
        break;

      case "WINDOW_CLOSE":
        result = await handleWindowClose();
        break;

      case "CLOSE_PROFILE":
        result = await closeProfile();
        break;

      default:
        // Si no es un comando de ventana, va al DOM (Content Script)
        // message.target puede ser un tab_id o "active"
        result = await routeToTab(message.target, { command, payload, id });
    }

    // Responder al Brain (Python) que la tarea se hizo
    if (id) {
      sendToBrain({ id, status: "ok", result });
    }

  } catch (error) {
    console.error(`❌ [Synapse] Error en comando [${command}]:`, error);
    if (id) {
      sendToBrain({ id, status: "error", error: error.message });
    }
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

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "DISCOVERY_COMPLETE") {
    console.log("⏳ Esperando 500ms para asegurar túnel TCP...");
    setTimeout(() => {
      nativePort.postMessage(msg); // Ahora sí, al C++
      console.log("🚀 DISCOVERY_COMPLETE enviado al Host");
    }, 500);
  }
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