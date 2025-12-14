// ============================================================================
// CONFIGURACIÓN Y ESTADO
// ============================================================================
const HOST_NAME = "com.bloom.nucleus.bridge"; // Asegúrate que coincida con tu manifest.json
const HEARTBEAT_INTERVAL = 20000; // 20 segundos
const BASE_RECONNECT_DELAY = 1000; // Iniciar rápido (1s)

let nativePort = null;
let heartbeatTimer = null;
let isConnected = false;
let retryCount = 0;
const controlledTabs = new Map(); 

// ============================================================================
// LÓGICA DE CONEXIÓN (CORE ENTERPRISE)
// ============================================================================

function connectToNativeHost() {
  if (nativePort) return;

  console.log(`🔌 [Bloom] Iniciando conexión con ${HOST_NAME}...`);
  
  try {
    nativePort = chrome.runtime.connectNative(HOST_NAME);
    
    // Listeners del Puerto
    nativePort.onMessage.addListener(handleHostMessage);
    
    nativePort.onDisconnect.addListener(() => {
      const err = chrome.runtime.lastError;
      console.warn("⚠️ [Bloom] Desconectado del Host.", err ? err.message : "Desconexión limpia");
      handleDisconnect();
    });

    // --- CRÍTICO PARA EL INSTALADOR ---
    // Enviar señal de vida inmediata. El Host reenviará esto a Electron.
    sendHandshake();

    // Iniciar ciclo de vida normal
    isConnected = true;
    retryCount = 0; // Resetear contador de reintentos
    startHeartbeat();

  } catch (error) {
    console.error("❌ [Bloom] Error fatal al conectar:", error);
    handleDisconnect();
  }
}

/**
 * Envía el paquete especial que el Installer busca para confirmar éxito.
 */
function sendHandshake() {
  if (!nativePort) return;

  const manifest = chrome.runtime.getManifest();
  
  const handshakeMsg = {
    type: "SYSTEM_HELLO",         // Identificador para el Installer
    status: "installed",
    id: chrome.runtime.id,
    version: manifest.version,
    timestamp: Date.now()
  };

  console.log("🚀 [Bloom] Enviando Handshake de Instalación:", handshakeMsg);
  nativePort.postMessage(handshakeMsg);
  
  // También enviamos el ping estándar para compatibilidad con versiones previas
  nativePort.postMessage({ command: "ping", source: "handshake" });
}

function handleDisconnect() {
  isConnected = false;
  nativePort = null;
  stopHeartbeat();
  
  chrome.storage.local.set({ hostStatus: "disconnected" });

  // Reintento exponencial limitado (1s, 2s, 4s, 5s...)
  const delay = Math.min(BASE_RECONNECT_DELAY * Math.pow(2, retryCount), 5000);
  retryCount++;

  console.log(`🔄 [Bloom] Reintentando conexión en ${delay}ms (Intento ${retryCount})...`);
  setTimeout(connectToNativeHost, delay);
}

// ============================================================================
// SISTEMA KEEP-ALIVE (HEARTBEAT)
// ============================================================================

function startHeartbeat() {
  stopHeartbeat();
  
  heartbeatTimer = setInterval(() => {
    if (isConnected && nativePort) {
      // Ping silencioso para mantener el canal stdio abierto
      try {
        nativePort.postMessage({ command: "ping", source: "heartbeat" });
      } catch(e) {
        handleDisconnect();
      }
    }
  }, HEARTBEAT_INTERVAL);
}

function stopHeartbeat() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = null;
}

function sendToHost(message) {
  if (nativePort) {
    try {
      nativePort.postMessage(message);
    } catch (e) {
      console.error("Error enviando mensaje:", e);
      handleDisconnect();
    }
  } else {
    // Intentar recuperar conexión si se intenta enviar algo
    connectToNativeHost();
  }
}

// ============================================================================
// MANEJO DE MENSAJES (ROUTER DE AUTOMATIZACIÓN)
// ============================================================================

async function handleHostMessage(message) {
  // 1. Interceptar PING/PONG (Sistema)
  if (message.command === "ping" || (message.ok && message.version)) {
    chrome.storage.local.set({ 
      hostStatus: "connected",
      hostVersion: message.version || "1.0.0",
      lastHeartbeat: Date.now()
    });
    return;
  }

  // 2. Procesar Comandos de Negocio
  const { id, command, payload } = message;
  
  try {
    let result;
    
    switch (command) {
      case "open_tab":
        result = await openTab(payload);
        break;
      case "navigate":
        result = await navigate(payload);
        break;
      case "exec_js":
        result = await execJs(payload);
        break;
      case "get_html":
        result = await getHtml(payload);
        break;
      case "click":
        result = await click(payload);
        break;
      case "type":
        result = await type(payload);
        break;
      case "upload_file":
        result = await uploadFile(payload);
        break;
      case "read_dom":
        result = await readDom(payload);
        break;
      case "observe_changes":
        result = await observeChanges(payload);
        break;
      case "claude.download_artifact":
        result = await downloadClaudeArtifact(payload);
        break;
      default:
        if (message.test || message.received) return;
        // No lanzamos error para evitar ruido en logs si el host envía metadatos extra
        console.warn(`[Bloom] Comando desconocido recibido: ${command}`);
        return; 
    }
    
    // Responder éxito
    if (id) {
      sendToHost({ id, status: "ok", result });
    }
    
  } catch (error) {
    console.error(`[Bloom] Error ejecutando ${command}:`, error);
    if (id) {
      sendToHost({ id, status: "error", result: { message: error.message } });
    }
  }
}

// ============================================================================
// IMPLEMENTACIÓN DE COMANDOS (Mantenidos igual)
// ============================================================================

async function openTab(payload) {
  const { url } = payload;
  const tab = await chrome.tabs.create({ url, active: false }); // Background open
  controlledTabs.set(tab.id, { url, created: Date.now() });
  return { tabId: tab.id };
}

async function navigate(payload) {
  const { tabId, url } = payload;
  await chrome.tabs.update(tabId, { url });
  return { tabId };
}

async function execJs(payload) {
  const { tabId, code } = payload;
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: new Function(code),
  });
  return { result: results[0]?.result };
}

async function getHtml(payload) {
  const { tabId } = payload;
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => document.documentElement.outerHTML,
  });
  return { html: results[0]?.result };
}

async function click(payload) {
  const { tabId, selector } = payload;
  return await chrome.tabs.sendMessage(tabId, { action: "click", selector });
}

async function type(payload) {
  const { tabId, selector, text } = payload;
  return await chrome.tabs.sendMessage(tabId, { action: "type", selector, text });
}

async function uploadFile(payload) {
  const { tabId, selector, filePath } = payload;
  return await chrome.tabs.sendMessage(tabId, { action: "upload_file", selector, filePath });
}

async function readDom(payload) {
  const { tabId, selector } = payload;
  return await chrome.tabs.sendMessage(tabId, { action: "read_dom", selector });
}

async function observeChanges(payload) {
  const { tabId, selector, enabled } = payload;
  return await chrome.tabs.sendMessage(tabId, { action: "observe_changes", selector, enabled });
}

async function downloadClaudeArtifact(payload) {
  const { tabId } = payload;
  
  const result = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const artifact = document.querySelector('[data-testid="artifact-root"]');
      if (!artifact) return { error: "No artifact found" };

      const codeBlock = artifact.querySelector('pre code');
      const reactRoot = artifact.querySelector('[data-testid="react-artifact"]');
      const htmlFrame = artifact.querySelector('iframe');
      
      let content = '';
      let type = '';
      let language = '';
      
      if (codeBlock) {
        content = codeBlock.textContent;
        type = 'code';
        const langClass = codeBlock.className.match(/language-(\w+)/);
        language = langClass ? langClass[1] : 'text';
      } else if (reactRoot) {
        const scriptTag = document.querySelector('script[type="application/json"]');
        if (scriptTag) {
          content = scriptTag.textContent;
          type = 'react';
        }
      } else if (htmlFrame) {
        content = htmlFrame.srcdoc || '';
        type = 'html';
      }
      
      const titleEl = document.querySelector('[data-testid="artifact-title"]') || 
                      artifact.closest('.artifact-container')?.querySelector('.font-semibold');
      const title = titleEl?.textContent || 'artifact';
      
      return { content, type, language, title, timestamp: Date.now() };
    }
  });
  
  return result[0]?.result;
}

// ============================================================================
// EVENTOS DEL NAVEGADOR Y CICLO DE VIDA
// ============================================================================

// 1. Evento de Primera Instalación (CRÍTICO PARA INSTALLER)
// Este evento se dispara cuando Chrome aplica la política de registro y carga la extensión
chrome.runtime.onInstalled.addListener((details) => {
    console.log(`🎉 [Bloom] Extensión instalada/actualizada. Razón: ${details.reason}`);
    // Forzar conexión inmediata
    connectToNativeHost();
});

// 2. Evento de Inicio de Navegador
chrome.runtime.onStartup.addListener(() => {
    console.log("🚀 [Bloom] Navegador iniciado.");
    connectToNativeHost();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (controlledTabs.has(tabId) && changeInfo.status === "complete") {
    sendToHost({
      id: crypto.randomUUID(),
      event: "page_loaded",
      payload: { tabId, url: tab.url }
    });
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (controlledTabs.has(tabId)) {
    controlledTabs.delete(tabId);
    sendToHost({
      id: crypto.randomUUID(),
      event: "tab_closed",
      payload: { tabId }
    });
  }
});

// Mensajes desde Content Scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.event === "dom_change") {
    sendToHost({
      id: crypto.randomUUID(),
      event: "dom_change",
      payload: {
        tabId: sender.tab.id,
        changes: message.changes
      }
    });
  }
  return true;
});

// ============================================================================
// INICIO INMEDIATO
// ============================================================================
// Intentar conectar apenas se carga el script (Backup por si los eventos fallan)
connectToNativeHost();