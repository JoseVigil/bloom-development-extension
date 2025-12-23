// ============================================================================
// BLOOM NUCLEUS BRIDGE - BACKGROUND
// ============================================================================
const HOST_NAME = "com.bloom.nucleus.bridge";
const HEARTBEAT_INTERVAL = 20000;
const BASE_RECONNECT_DELAY = 1000;

// Configuración de Chunking
const CHUNKING_CONFIG = {
  MAX_CHUNK_SIZE: 900 * 1024,  // 900KB
  CHUNK_SEND_DELAY_MS: 50,     // Pausa entre chunks
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 1000
};

let nativePort = null;
let heartbeatTimer = null;
let isConnected = false;
let retryCount = 0;
const controlledTabs = new Map();

// --- CONEXIÓN ---
function connectToNativeHost() {
  if (nativePort) return;
  console.log(`🔌 [Bloom] Conectando a ${HOST_NAME}...`);
  try {
    nativePort = chrome.runtime.connectNative(HOST_NAME);
    nativePort.onMessage.addListener(handleHostMessage);
    nativePort.onDisconnect.addListener(handleDisconnect);
    sendHandshake();
    isConnected = true;
    retryCount = 0;
    startHeartbeat();
  } catch (error) {
    console.error("❌ [Bloom] Error de conexión:", error);
    handleDisconnect();
  }
}

function sendHandshake() {
  if (!nativePort) return;
  const manifest = chrome.runtime.getManifest();
  nativePort.postMessage({
    type: "SYSTEM_HELLO",
    status: "installed",
    id: chrome.runtime.id,
    version: manifest.version,
    timestamp: Date.now()
  });
  nativePort.postMessage({ command: "ping", source: "handshake" });
}

function handleDisconnect() {
  isConnected = false;
  nativePort = null;
  stopHeartbeat();
  chrome.storage.local.set({ hostStatus: "disconnected" });
  const delay = Math.min(BASE_RECONNECT_DELAY * Math.pow(2, retryCount), 5000);
  retryCount++;
  setTimeout(connectToNativeHost, delay);
}

// --- HEARTBEAT ---
function startHeartbeat() {
  stopHeartbeat();
  heartbeatTimer = setInterval(() => {
    if (isConnected && nativePort) {
      try { nativePort.postMessage({ command: "ping", source: "heartbeat" }); }
      catch(e) { handleDisconnect(); }
    }
  }, HEARTBEAT_INTERVAL);
}

function stopHeartbeat() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = null;
}

function sendToHost(message) {
  if (nativePort) {
    try { nativePort.postMessage(message); }
    catch (e) { handleDisconnect(); }
  } else { connectToNativeHost(); }
}

// ============================================================================
// CHUNKED MESSAGE SENDER (Lógica para mensajes > 900KB)
// ============================================================================

async function sendLargeMessage(message, messageId = null) {
  if (!messageId) messageId = generateUUID();
  
  const messageStr = JSON.stringify(message);
  const messageBytes = new TextEncoder().encode(messageStr);
  const totalSize = messageBytes.length;
  
  console.log(`📦 [Bloom Chunking] Message size: ${totalSize} bytes`);
  
  if (totalSize <= CHUNKING_CONFIG.MAX_CHUNK_SIZE) {
    console.log(`✅ [Bloom Chunking] Sending directly (no chunking)`);
    sendToHost(message);
    return { chunked: false, message_id: messageId };
  }
  
  console.log(`🔪 [Bloom Chunking] Splitting into chunks...`);
  const checksum = await calculateSHA256(messageBytes);
  const chunks = splitIntoChunks(messageBytes, CHUNKING_CONFIG.MAX_CHUNK_SIZE);
  const totalChunks = chunks.length;
  
  console.log(`📦 [Bloom Chunking] Total chunks: ${totalChunks}`);
  
  try {
    // 1. Send Header
    await sendChunkWithRetry({
      bloom_chunk: {
        type: "header",
        message_id: messageId,
        total_chunks: totalChunks,
        total_size_bytes: totalSize,
        compression: "none",
        checksum: checksum
      }
    });

    // 2. Send Data Chunks
    for (let i = 0; i < chunks.length; i++) {
      await sendChunkWithRetry({
        bloom_chunk: {
          type: "data",
          message_id: messageId,
          chunk_index: i + 1,
          data: arrayBufferToBase64(chunks[i])
        }
      });
      
      const progress = Math.round(((i + 1) / totalChunks) * 100);
      console.log(`📤 [Bloom Chunking] Chunk ${i + 1}/${totalChunks} (${progress}%)`);
      if (i < chunks.length - 1) await sleep(CHUNKING_CONFIG.CHUNK_SEND_DELAY_MS);
    }
    
    // 3. Send Footer
    await sendChunkWithRetry({
      bloom_chunk: {
        type: "footer",
        message_id: messageId,
        checksum_verify: checksum
      }
    });
    
    console.log(`✅ [Bloom Chunking] Complete message sent successfully`);
    return { chunked: true, message_id: messageId, total_chunks: totalChunks };
    
  } catch (error) {
    console.error(`❌ [Bloom Chunking] Failed to send message:`, error);
    handleChunkingError(error, message);
    throw error;
  }
}

async function sendChunkWithRetry(chunk, retries = CHUNKING_CONFIG.MAX_RETRIES) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      sendToHost(chunk);
      return;
    } catch (error) {
      if (attempt === retries) throw error;
      await sleep(CHUNKING_CONFIG.RETRY_DELAY_MS * attempt);
    }
  }
}

// --- ROUTER DE MENSAJES (Manejo Centralizado) ---
async function handleHostMessage(message) {
  if (message.command === "ping" || (message.ok && message.version)) return;

  const { id, command, payload } = message;
  console.log(`📨 [Bloom] Comando recibido: ${command}`, payload);

  try {
    let result;

    if (command === "claude.submit") {
      result = await dispatchToActiveTab("ai.submit", payload);
    } else if (command === "open_tab") {
      result = await openTab(payload);
    } else if (command === "navigate") {
      result = await navigate(payload);
    } else if (command === "download_response") {
      result = await handleDownloadResponse(payload);
    } else if (command === "download_response_large") {
      result = await handleDownloadResponseLarge(payload);
    } else {
      if (payload && payload.tabId) {
         result = await chrome.tabs.sendMessage(payload.tabId, { action: command, ...payload });
      } else {
         console.warn("Comando sin handler específico o tabId:", command);
         return;
      }
    }

    if (id) sendToHost({ id, status: "ok", result });

  } catch (error) {
    console.error(`❌ Error en ${command}:`, error);
    if (id) sendToHost({ id, status: "error", result: { message: error.message } });
  }
}

// --- DOWNLOAD HANDLERS ---
async function handleDownloadResponse(payload) {
  console.log(`📥 [Bloom Download] Receiving response from content.js...`);
  const response = payload.response || payload;
  const intentId = response.bloom_protocol?.intent_id;
  
  if (!intentId) throw new Error("Missing intent_id in response");
  
  const profileInfo = await chrome.storage.local.get(['currentProfile']);
  response.metadata = response.metadata || {};
  response.metadata.profile_used = profileInfo.currentProfile?.display_name || "Unknown";
  response.metadata.profile_directory = profileInfo.currentProfile?.directory_name || "Unknown";
  
  const responseStr = JSON.stringify(response);
  const sizeBytes = responseStr.length;
  
  if (payload.chunked || sizeBytes > CHUNKING_CONFIG.MAX_CHUNK_SIZE) {
    await sendLargeMessage(response);
  } else {
    sendToHost({ command: "brain_download_response", payload: response });
  }
  
  return { success: true, intent_id: intentId, chunked: sizeBytes > CHUNKING_CONFIG.MAX_CHUNK_SIZE };
}

async function handleDownloadResponseLarge(payload) {
  console.log(`📥 [Bloom Download] Receiving LARGE response...`);
  const response = payload.payload || payload.response;
  await sendLargeMessage(response);
  return { success: true, chunked: true };
}

// --- COMUNICACIÓN CON CONTENT SCRIPTS ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { action, event, intent_id, payload } = message;
  
  // Handlers de Eventos
  if (event === 'slave_mode_enabled') {
    chrome.storage.local.set({ slaveMode: true, activeIntentId: intent_id });
    sendResponse({ received: true });
  } 
  else if (event === 'manual_intervention') {
    chrome.storage.local.set({ slaveMode: false });
    sendToHost({ command: "manual_intervention", payload: { intent_id, timestamp: message.timestamp } });
    sendResponse({ received: true });
  }
  else if (event === 'interrupted') {
    sendToHost({ command: "intent_interrupted", payload: { intent_id, reason: message.reason, timestamp: message.timestamp } });
    sendResponse({ received: true });
  }
  else if (action === 'download_response' || action === 'download_response_large') {
    (async () => {
      try {
        const result = action === 'download_response' 
          ? await handleDownloadResponse(payload) 
          : await handleDownloadResponseLarge(payload);
        sendResponse({ success: true, result });
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
    })();
    return true; 
  }
  return false;
});

// --- HELPERS ---
async function dispatchToActiveTab(action, payload) {
  const tabs = await chrome.tabs.query({active: true, currentWindow: true});
  if (!tabs.length) throw new Error("No hay pestaña activa");
  return await chrome.tabs.sendMessage(tabs[0].id, { action, payload });
}

async function openTab({ url }) {
  const tab = await chrome.tabs.create({ url, active: false });
  return { tabId: tab.id };
}

async function navigate({ tabId, url }) {
  await chrome.tabs.update(tabId, { url });
  return { tabId };
}

function splitIntoChunks(uint8Array, chunkSize) {
  const chunks = [];
  for (let i = 0; i < uint8Array.length; i += chunkSize) {
    chunks.push(uint8Array.slice(i, i + chunkSize));
  }
  return chunks;
}

function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

async function calculateSHA256(uint8Array) {
  const hashBuffer = await crypto.subtle.digest('SHA-256', uint8Array);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function generateUUID() {
  return self.crypto.randomUUID();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function handleChunkingError(error, message) {
  if (error.message.includes('Failed after')) {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icon128.png',
      title: 'Bloom Error',
      message: 'Error al enviar datos grandes al Host.'
    });
  }
  chrome.storage.local.set({ pendingResponse: { message, timestamp: Date.now(), error: error.message } });
}

// Inicialización
chrome.runtime.onInstalled.addListener(connectToNativeHost);
chrome.runtime.onStartup.addListener(connectToNativeHost);
connectToNativeHost();