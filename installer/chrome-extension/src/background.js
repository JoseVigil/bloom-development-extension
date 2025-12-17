// ============================================================================
// BLOOM NUCLEUS BRIDGE - BACKGROUND
// ============================================================================
const HOST_NAME = "com.bloom.nucleus.bridge";
const HEARTBEAT_INTERVAL = 20000;
const BASE_RECONNECT_DELAY = 1000;

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

// --- ROUTER DE MENSAJES (Manejo Centralizado) ---
async function handleHostMessage(message) {
  if (message.command === "ping" || (message.ok && message.version)) return;

  const { id, command, payload } = message;
  console.log(`📨 [Bloom] Comando recibido: ${command}`, payload);

  try {
    let result;

    // LÓGICA DE RUTEO
    if (command === "claude.submit") {
      // Caso especial: Enviar a la pestaña activa
      result = await dispatchToActiveTab("ai.submit", payload);
    } else if (command === "open_tab") {
      result = await openTab(payload);
    } else if (command === "navigate") {
      result = await navigate(payload);
    } else {
      // Comandos genéricos dirigidos por tabId (click, type, etc.)
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

// --- HELPERS ---
async function dispatchToActiveTab(action, payload) {
  const tabs = await chrome.tabs.query({active: true, currentWindow: true});
  if (!tabs.length) throw new Error("No hay pestaña activa");
  // Enviamos al Content Script
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

// Inicialización
chrome.runtime.onInstalled.addListener(connectToNativeHost);
chrome.runtime.onStartup.addListener(connectToNativeHost);
connectToNativeHost();