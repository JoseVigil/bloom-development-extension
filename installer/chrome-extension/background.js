// ============================================================================
// CONFIGURACIÓN Y ESTADO
// ============================================================================
const HOST_NAME = "com.bloom.nucleus.host";
const HEARTBEAT_INTERVAL = 20000; // 20 segundos
const RECONNECT_DELAY = 5000;     // 5 segundos

let nativePort = null;
let heartbeatTimer = null;
let isConnected = false;
const controlledTabs = new Map(); // Mantiene estado de pestañas controladas

// ============================================================================
// LÓGICA DE CONEXIÓN (CORE)
// ============================================================================

function connectToNativeHost() {
  if (nativePort) return;

  console.log(`🔌 Iniciando conexión con ${HOST_NAME}...`);
  
  try {
    nativePort = chrome.runtime.connectNative(HOST_NAME);
    
    // Listeners del Puerto
    nativePort.onMessage.addListener(handleHostMessage);
    
    nativePort.onDisconnect.addListener(() => {
      const err = chrome.runtime.lastError;
      console.warn("⚠️ Desconectado del Host Nativo.", err ? err.message : "");
      handleDisconnect();
    });

    // Iniciar ciclo de vida
    isConnected = true;
    startHeartbeat();
    
    // Handshake inicial
    sendToHost({ command: "ping", source: "handshake" });

  } catch (error) {
    console.error("❌ Error fatal al conectar:", error);
    handleDisconnect();
  }
}

function handleDisconnect() {
  isConnected = false;
  nativePort = null;
  stopHeartbeat();
  
  // Notificar a componentes UI si es necesario
  chrome.storage.local.set({ hostStatus: "disconnected" });

  console.log(`🔄 Reintentando conexión en ${RECONNECT_DELAY/1000}s...`);
  setTimeout(connectToNativeHost, RECONNECT_DELAY);
}

// ============================================================================
// SISTEMA KEEP-ALIVE (HEARTBEAT)
// ============================================================================

function startHeartbeat() {
  stopHeartbeat();
  // console.log("💓 Heartbeat iniciado");
  
  heartbeatTimer = setInterval(() => {
    if (isConnected && nativePort) {
      // Enviamos ping silencioso para mantener vivo el canal
      sendToHost({ command: "ping", source: "heartbeat" });
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
    // Si intentamos enviar y no hay puerto, intentar reconectar
    connectToNativeHost();
  }
}

// ============================================================================
// MANEJO DE MENSAJES (ROUTER)
// ============================================================================

async function handleHostMessage(message) {
  // 1. Interceptar PING/PONG (Sistema)
  if (message.command === "ping" || (message.ok && message.version)) {
    chrome.storage.local.set({ 
      hostStatus: "connected",
      hostVersion: message.version || "1.0.0",
      lastHeartbeat: Date.now()
    });
    
    if (message.source === "handshake") {
      console.log(`✅ Host Conectado: v${message.version}`);
    }
    return; // No procesar más
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
        // Si es un mensaje de eco o respuesta genérica
        if (message.test || message.received) return;
        throw new Error(`Comando desconocido: ${command}`);
    }
    
    // Responder éxito
    if (id) {
      sendToHost({ id, status: "ok", result });
    }
    
  } catch (error) {
    console.error(`Error ejecutando ${command}:`, error);
    if (id) {
      sendToHost({ id, status: "error", result: { message: error.message } });
    }
  }
}

// ============================================================================
// IMPLEMENTACIÓN DE COMANDOS
// ============================================================================

async function openTab(payload) {
  const { url } = payload;
  const tab = await chrome.tabs.create({ url, active: false });
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
  // Requiere content script escuchando
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
      // Lógica de extracción de Artifacts (Claude)
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
// EVENTOS DEL NAVEGADOR
// ============================================================================

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
  return true; // Async response support
});

// ============================================================================
// INICIO
// ============================================================================
connectToNativeHost();
chrome.runtime.onStartup.addListener(connectToNativeHost);