// ============================================================================
// SYNAPSE NUCLEUS v2.0 - Refactored & Hardened
// ============================================================================

// === Estado Global ===
let nativePort = null;
let heartbeatTimer = null;
let reconnectTimer = null;
let connectionState = 'INITIALIZING';
let SYNAPSE_CONFIG = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
const BASE_RECONNECT_DELAY = 2000;

// ============================================================================
// UTILIDADES
// ============================================================================

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Backoff exponencial con jitter para reconexiones
function getReconnectDelay() {
  const exponentialDelay = Math.min(
    BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttempts),
    60000 // Max 1 minuto
  );
  const jitter = Math.random() * 1000; // 0-1s de variación
  return exponentialDelay + jitter;
}

// Logging estructurado con niveles
function logToHost(level, message, context = {}) {
  const logEntry = {
    type: "LOG",
    level: level.toUpperCase(),
    message,
    context: {
      connectionState,
      hasPort: !!nativePort,
      timestamp: Date.now(),
      ...context
    }
  };

  // Solo enviar al host si hay conexión activa
  if (nativePort && connectionState === 'CONNECTED') {
    try {
      nativePort.postMessage(logEntry);
    } catch (e) {
      // Puerto murió entre el check y el postMessage - no hacer nada
      console.error('[Synapse] Port died during log:', e.message);
    }
  }

  // Siempre loguear a consola
  const emoji = {
    error: '🔴',
    warn: '🟡',
    success: '🟢',
    info: 'ℹ️',
    debug: '🔍'
  }[level] || '📋';
  
  console.log(`${emoji} [Synapse:${level.toUpperCase()}] ${message}`, context);
}

// ============================================================================
// CARGA DE CONFIGURACIÓN
// ============================================================================

async function loadConfig() {
  try {
    // Intento 1: importScripts (ideal para service workers)
    try {
      importScripts('synapse.config.js');
      SYNAPSE_CONFIG = self.SYNAPSE_CONFIG;

      if (!validateConfig(SYNAPSE_CONFIG)) {
        throw new Error('Config incompleta vía importScripts');
      }

      logToHost("success", "Config cargada vía importScripts", { config: SYNAPSE_CONFIG });
      return true;

    } catch (importError) {
      logToHost("debug", "importScripts falló, intentando fetch", { error: importError.message });

      // Intento 2: Fetch + regex parsing
      const configUrl = chrome.runtime.getURL('synapse.config.js');
      const response = await fetch(configUrl);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const configText = await response.text();

      // Parsing robusto con validación
      const matchers = {
        profileId: /profileId:\s*['"]([^'"]+)['"]/,
        bridge_name: /bridge_name:\s*['"]([^'"]+)['"]/,
        launchId: /launchId:\s*['"]([^'"]+)['"]/,
        profile_alias: /profile_alias:\s*['"]([^'"]+)['"]/,
        extension_id: /extension_id:\s*['"]([^'"]+)['"]/
      };

      const parsed = {};
      let failed = false;

      for (const [key, regex] of Object.entries(matchers)) {
        const match = configText.match(regex);
        if (match && match[1]) {
          parsed[key] = match[1];
        } else if (['profileId', 'bridge_name', 'launchId'].includes(key)) {
          // Campos obligatorios
          logToHost("error", `Campo obligatorio no encontrado: ${key}`);
          failed = true;
        }
      }

      if (failed) {
        throw new Error('Falta configuración obligatoria en archivo');
      }

      // Valores por defecto para opcionales
      SYNAPSE_CONFIG = {
        profileId: parsed.profileId,
        bridge_name: parsed.bridge_name,
        launchId: parsed.launchId,
        profile_alias: parsed.profile_alias || '',
        extension_id: parsed.extension_id || chrome.runtime.id
      };

      if (!validateConfig(SYNAPSE_CONFIG)) {
        throw new Error('Config parseada es inválida');
      }

      logToHost("success", "Config cargada vía regex", { config: SYNAPSE_CONFIG });
      return true;
    }

  } catch (error) {
    logToHost("error", "Fallo crítico en carga de config", { 
      error: error.message,
      stack: error.stack 
    });
    return false;
  }
}

function validateConfig(config) {
  return config 
    && typeof config.profileId === 'string' 
    && config.profileId.length > 0
    && typeof config.bridge_name === 'string'
    && config.bridge_name.length > 0
    && typeof config.launchId === 'string'
    && config.launchId.length > 0;
}

// ============================================================================
// GESTIÓN DE ESTADO VÍA STORAGE
// ============================================================================

async function updateConnectionStatus(newState, extraPayload = {}) {
  const oldState = connectionState;
  connectionState = newState;

  try {
    const statusData = {
      command: 'connection_update',
      payload: {
        profile_id: SYNAPSE_CONFIG?.profileId,
        launch_id: SYNAPSE_CONFIG?.launchId,
        connection_state: connectionState,
        previous_state: oldState,
        reconnect_attempts: reconnectAttempts,
        timestamp: Date.now(),
        ...extraPayload
      }
    };

    await chrome.storage.local.set({ synapseStatus: statusData });
    
    logToHost("debug", `Estado actualizado: ${oldState} → ${connectionState}`, extraPayload);

  } catch (e) {
    logToHost("error", "Fallo al actualizar storage", { error: e.message });
  }
}

// ============================================================================
// INICIALIZACIÓN DEL PUENTE NATIVO
// ============================================================================

async function initializeSynapse() {
  // Prevenir inicializaciones múltiples simultáneas
  if (nativePort && connectionState === 'CONNECTED') {
    logToHost("debug", "Puente ya conectado, saltando init");
    return;
  }

  // Limpiar reconexión pendiente
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  // Cargar config si no está disponible
  if (!SYNAPSE_CONFIG) {
    const configLoaded = await loadConfig();
    if (!configLoaded) {
      logToHost("error", "Config no disponible, reintentando en 5s");
      await updateConnectionStatus('CONFIG_ERROR');
      reconnectTimer = setTimeout(initializeSynapse, 5000);
      return;
    }
  }

  try {
    const { profileId, bridge_name, launchId } = SYNAPSE_CONFIG;

    logToHost("info", `Conectando al host nativo: ${bridge_name}`, { 
      profileId, 
      launchId 
    });
    
    await updateConnectionStatus('CONNECTING');

    // Establecer conexión
    nativePort = chrome.runtime.connectNative(bridge_name);

    // Enviar handshake inicial
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

    // Registrar listeners
    nativePort.onMessage.addListener(handleHostMessage);
    nativePort.onDisconnect.addListener(handleHostDisconnect);

    await updateConnectionStatus('CONNECTED');
    reconnectAttempts = 0; // Reset contador en conexión exitosa
    
    startHeartbeat();
    
    logToHost("success", `Puente establecido exitosamente`, { 
      profileId,
      bridge_name 
    });

  } catch (e) {
    logToHost("error", "Fallo en conexión al puente", { 
      error: e.message,
      stack: e.stack,
      attempt: reconnectAttempts 
    });
    
    nativePort = null;
    await updateConnectionStatus('DISCONNECTED', { 
      error: e.message,
      will_retry: reconnectAttempts < MAX_RECONNECT_ATTEMPTS 
    });

    // Reconexión con backoff exponencial
    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      reconnectAttempts++;
      const delay = getReconnectDelay();
      
      logToHost("info", `Reintentando conexión en ${Math.round(delay/1000)}s`, {
        attempt: reconnectAttempts,
        maxAttempts: MAX_RECONNECT_ATTEMPTS
      });
      
      reconnectTimer = setTimeout(initializeSynapse, delay);
    } else {
      logToHost("error", "Máximo de reintentos alcanzado, deteniendo reconexiones");
      await updateConnectionStatus('FAILED', { 
        reason: 'Max reconnect attempts exceeded' 
      });
    }
  }
}

// ============================================================================
// MANEJO DE MENSAJES DEL HOST
// ============================================================================

async function handleHostMessage(msg) {
  if (!msg || typeof msg !== 'object') {
    logToHost("warn", "Mensaje inválido recibido del host", { msg });
    return;
  }

  // Normalizar type vs command (soportar ambos)
  const messageType = msg.type || msg.command;
  const payload = msg.payload || {};
  const messageId = msg.id;

  logToHost("debug", `◄ Mensaje del host: ${messageType}`, { 
    hasPayload: !!msg.payload,
    hasId: !!messageId 
  });

  try {
    switch (messageType) {
      // === Handshake completado ===
      case "SYSTEM_ACK":
      case "system_ready":
        await handleSystemReady(payload);
        break;

      // === Heartbeat del host ===
      case "HEARTBEAT":
        await handleHeartbeat(messageId);
        break;

      // === Comandos de automatización ===
      case "WINDOW_NAVIGATE":
        await handleNavigate(payload, messageId);
        break;

      case "TAB_EXECUTE":
        await handleExecuteScript(payload, messageId);
        break;

      case "SYSTEM_STATUS":
        sendHostResponse(messageId, { 
          status: connectionState,
          config: SYNAPSE_CONFIG,
          uptime: Date.now()
        });
        break;

      // === Comandos desconocidos ===
      default:
        logToHost("warn", `Comando no reconocido: ${messageType}`, { msg });
        sendHostResponse(messageId, { 
          error: "Unknown command",
          received: messageType 
        });
    }

  } catch (err) {
    logToHost("error", `Error ejecutando comando: ${messageType}`, {
      error: err.message,
      stack: err.stack
    });
    sendHostResponse(messageId, { 
      error: err.message,
      type: "execution_error" 
    });
  }
}

// === Handlers de Comandos Específicos ===

async function handleSystemReady(payload) {
  await updateConnectionStatus('CONNECTED', {
    handshake_confirmed: true,
    ...payload
  });

  // Notificar a discovery page vía storage + mensajería directa
  await notifyDiscoveryPage({ 
    status: "connected",
    ...payload 
  });

  logToHost("success", "Handshake confirmado con el host");
}

async function handleHeartbeat(messageId) {
  // Responder inmediatamente al heartbeat
  if (nativePort) {
    nativePort.postMessage({
      type: "HEARTBEAT_ACK",
      id: messageId,
      timestamp: Date.now()
    });
    logToHost("debug", "Heartbeat ACK enviado");
  }
}

async function handleNavigate(payload, messageId) {
  const { url, tab_id } = payload;

  if (!url) {
    throw new Error("URL faltante en comando WINDOW_NAVIGATE");
  }

  try {
    if (tab_id) {
      await chrome.tabs.update(tab_id, { url });
    } else {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]) {
        await chrome.tabs.update(tabs[0].id, { url });
      } else {
        throw new Error("No hay pestaña activa para navegar");
      }
    }

    logToHost("info", `Navegación exitosa a: ${url}`, { tab_id });
    sendHostResponse(messageId, { success: true, url });

  } catch (err) {
    throw new Error(`Navegación falló: ${err.message}`);
  }
}

async function handleExecuteScript(payload, messageId) {
  const { code, tab_id } = payload;

  if (!code) {
    throw new Error("Código faltante en comando TAB_EXECUTE");
  }

  try {
    let targetTabId = tab_id;

    if (!targetTabId) {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tabs[0]) {
        throw new Error("No hay pestaña activa para ejecutar script");
      }
      targetTabId = tabs[0].id;
    }

    await chrome.scripting.executeScript({
      target: { tabId: targetTabId },
      func: new Function(code)
    });

    logToHost("info", "Script ejecutado exitosamente", { tab_id: targetTabId });
    sendHostResponse(messageId, { success: true });

  } catch (err) {
    throw new Error(`Ejecución de script falló: ${err.message}`);
  }
}

function sendHostResponse(messageId, data) {
  if (!messageId) return; // No hay ID = no espera respuesta

  if (nativePort && connectionState === 'CONNECTED') {
    try {
      nativePort.postMessage({
        type: "RESPONSE",
        id: messageId,
        payload: data,
        timestamp: Date.now()
      });
    } catch (e) {
      logToHost("error", "Fallo al enviar respuesta al host", { 
        error: e.message,
        messageId 
      });
    }
  }
}

// ============================================================================
// NOTIFICACIÓN A DISCOVERY PAGE
// ============================================================================

async function notifyDiscoveryPage(payload) {
  const statusData = {
    command: 'system_ready',
    payload: {
      ...payload,
      profile_id: SYNAPSE_CONFIG?.profileId,
      launch_id: SYNAPSE_CONFIG?.launchId,
      profile_alias: SYNAPSE_CONFIG?.profile_alias,
      connection_state: connectionState,
      handshake_confirmed: true,
      timestamp: Date.now()
    }
  };

  try {
    // Método 1: Storage Bus (primario)
    await chrome.storage.local.set({ synapseStatus: statusData });
    logToHost("debug", "Discovery notificada vía storage");

    // Método 2: Mensajería directa (fallback)
    // Buscar pestaña de discovery abierta
    const discoveryUrl = chrome.runtime.getURL('discovery/index.html');
    const tabs = await chrome.tabs.query({ url: discoveryUrl });

    if (tabs.length > 0) {
      // Enviar mensaje directo a cada pestaña de discovery
      const promises = tabs.map(tab => 
        chrome.tabs.sendMessage(tab.id, statusData)
          .catch(err => {
            // Tab puede estar cerrada o no tener listener
            logToHost("debug", `No se pudo enviar mensaje a tab ${tab.id}`, { 
              error: err.message 
            });
          })
      );
      
      await Promise.allSettled(promises);
      logToHost("debug", `Discovery notificada vía tabs.sendMessage (${tabs.length} tabs)`);
    }

  } catch (e) {
    logToHost("error", "Fallo en notificación a discovery", { error: e.message });
  }
}

// ============================================================================
// GESTIÓN DE DESCONEXIÓN
// ============================================================================

async function handleHostDisconnect() {
  const error = chrome.runtime.lastError;
  const reason = error?.message || 'Razón desconocida';

  // CRÍTICO: Limpiar puerto ANTES de loguear
  const wasConnected = connectionState === 'CONNECTED';
  nativePort = null;
  stopHeartbeat();

  await updateConnectionStatus('DISCONNECTED', { 
    reason,
    was_connected: wasConnected 
  });

  logToHost("warn", `Puente desconectado: ${reason}`, { 
    wasConnected,
    willReconnect: reconnectAttempts < MAX_RECONNECT_ATTEMPTS 
  });

  // Reconectar con backoff
  if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
    reconnectAttempts++;
    const delay = getReconnectDelay();
    
    logToHost("info", `Reconectando en ${Math.round(delay/1000)}s`, {
      attempt: reconnectAttempts
    });
    
    reconnectTimer = setTimeout(initializeSynapse, delay);
  } else {
    logToHost("error", "Máximo de reintentos de reconexión alcanzado");
  }
}

// ============================================================================
// HEARTBEAT
// ============================================================================

function startHeartbeat() {
  stopHeartbeat();
  
  heartbeatTimer = setInterval(() => {
    if (nativePort && connectionState === 'CONNECTED') {
      try {
        nativePort.postMessage({
          type: "HEARTBEAT",
          timestamp: Date.now()
        });
        logToHost("debug", "► Heartbeat enviado");
      } catch (e) {
        logToHost("warn", "Heartbeat falló, puerto probablemente muerto", { 
          error: e.message 
        });
        // El onDisconnect debería dispararse y manejar la reconexión
      }
    }
  }, 15000); // Cada 15s

  logToHost("debug", "Heartbeat iniciado (15s)");
}

function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
    logToHost("debug", "Heartbeat detenido");
  }
}

// ============================================================================
// LISTENER DE MENSAJES DE LA EXTENSIÓN
// ============================================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Validación básica
  if (!message || typeof message !== 'object') {
    sendResponse({ error: "Invalid message format" });
    return true;
  }

  const { command, source, type } = message;
  const messageType = command || type; // Normalizar

  logToHost("debug", `◄ Mensaje interno: ${messageType}`, { 
    from: source || 'unknown',
    sender: sender.tab?.id 
  });

  // === Status Check ===
  if (messageType === "ping" || messageType === "check_handshake_status") {
    const isReady = nativePort !== null && connectionState === 'CONNECTED';

    sendResponse({
      status: isReady ? "pong" : "waiting",
      connection_state: connectionState,
      handshake_confirmed: isReady,
      profile_id: SYNAPSE_CONFIG?.profileId,
      launch_id: SYNAPSE_CONFIG?.launchId,
      reconnect_attempts: reconnectAttempts,
      timestamp: Date.now()
    });

    return true;
  }

  // === Discovery Complete ===
  if (messageType === "discovery_complete" || messageType === "DISCOVERY_COMPLETE") {
    logToHost("info", "Fase de discovery completada", { source });

    if (nativePort && connectionState === 'CONNECTED') {
      // Pequeño delay para asegurar que el host esté listo
      setTimeout(() => {
        try {
          nativePort.postMessage({
            type: "DISCOVERY_COMPLETE",
            payload: message.payload || {},
            timestamp: Date.now()
          });
          logToHost("debug", "DISCOVERY_COMPLETE enviado al host");
        } catch (e) {
          logToHost("error", "Fallo al enviar DISCOVERY_COMPLETE", { 
            error: e.message 
          });
        }
      }, 500);
    } else {
      logToHost("warn", "DISCOVERY_COMPLETE recibido pero puente no conectado");
    }

    sendResponse({ received: true, bridge_ready: !!nativePort });
    return true;
  }

  // === Heartbeat desde el Host ===
  if (messageType === "HEARTBEAT") {
    logToHost("debug", `◄ Heartbeat del host recibido`, {
      sequence: message.sequence || 'n/a',
      pending_queue: message.stats?.pending_queue || 0,
      host_uptime: message.stats?.uptime_ms || 0
    });

    // Responder inmediatamente para confirmar vida
    if (nativePort) {
      try {
        nativePort.postMessage({
          type: "HEARTBEAT_ACK",
          sequence: message.sequence,  // Echo de sequence para correlación
          received_at: Date.now(),
          extension_state: connectionState,
          profile_id: SYNAPSE_CONFIG?.profileId,
          timestamp: Date.now()
        });
        
        logToHost("debug", "► HEARTBEAT_ACK enviado al host");
        
      } catch (e) {
        logToHost("error", "Fallo al enviar HEARTBEAT_ACK", { error: e.message });
        // No propagar el error - el onDisconnect se encargará si el puerto murió
      }
    }

    sendResponse({ received: true, status: "alive" });
    return true;
  }

  // === Forward Genérico al Host ===
  if (nativePort && connectionState === 'CONNECTED') {
    try {
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
      
      logToHost("debug", "Mensaje forwardeado al host", { 
        type: messageType 
      });

    } catch (e) {
      logToHost("error", "Fallo al forwardear mensaje", { 
        error: e.message,
        type: messageType 
      });
      sendResponse({ error: "Forward failed", details: e.message });
    }
  } else {
    logToHost("warn", "Mensaje rechazado: puente no conectado", { 
      type: messageType 
    });
    sendResponse({ 
      error: "Bridge not connected",
      connection_state: connectionState 
    });
  }

  return true; // Mantener canal abierto para sendResponse asíncrono
});

// ============================================================================
// GESTIÓN DE DISCOVERY TAB (ANTI-DUPLICADOS)
// ============================================================================

async function ensureSingleDiscoveryTab() {
  const discoveryUrl = chrome.runtime.getURL('discovery/index.html');

  try {
    // Buscar tabs existentes de discovery
    const existingTabs = await chrome.tabs.query({ url: discoveryUrl });

    if (existingTabs.length === 0) {
      // No existe, crear una nueva
      await chrome.tabs.create({
        url: discoveryUrl,
        active: true
      });
      logToHost("info", "Discovery tab creada");
    } else if (existingTabs.length === 1) {
      // Ya existe una, enfocarla
      await chrome.tabs.update(existingTabs[0].id, { active: true });
      await chrome.windows.update(existingTabs[0].windowId, { focused: true });
      logToHost("info", "Discovery tab existente enfocada");
    } else {
      // Múltiples tabs (limpieza de duplicados)
      logToHost("warn", `${existingTabs.length} discovery tabs encontradas, limpiando duplicados`);
      
      // Mantener la primera, cerrar el resto
      const [keepTab, ...duplicates] = existingTabs;
      
      await chrome.tabs.update(keepTab.id, { active: true });
      await chrome.windows.update(keepTab.windowId, { focused: true });
      
      for (const tab of duplicates) {
        await chrome.tabs.remove(tab.id).catch(e => {
          logToHost("debug", `No se pudo cerrar tab duplicada ${tab.id}`, { 
            error: e.message 
          });
        });
      }
      
      logToHost("info", `Duplicados limpiados, ${duplicates.length} tabs cerradas`);
    }

  } catch (e) {
    logToHost("error", "Fallo al gestionar discovery tab", { error: e.message });
  }
}

// ============================================================================
// SECUENCIA DE ARRANQUE
// ============================================================================

// Inicialización inmediata al cargar service worker
(async () => {
  logToHost("info", "🚀 Service worker iniciado");
  await initializeSynapse();
})();

// === Event: Instalación/Actualización ===
chrome.runtime.onInstalled.addListener(async (details) => {
  logToHost("info", `Extension ${details.reason}`, { 
    version: chrome.runtime.getManifest().version,
    previousVersion: details.previousVersion 
  });

  // Abrir discovery SOLO en install/update (no en chrome_update, browser_update, etc)
  if (details.reason === 'install' || details.reason === 'update') {
    await ensureSingleDiscoveryTab();
  }

  // NO llamar initializeSynapse aquí - ya se hizo en el scope global
  // Evita doble inicialización en startup
});

// === Event: Inicio del Navegador ===
chrome.runtime.onStartup.addListener(async () => {
  logToHost("info", "🌐 Navegador iniciado");
  
  // Asegurar tab única de discovery
  await ensureSingleDiscoveryTab();
  
  // NO inicializar de nuevo - el service worker ya lo hizo
  // Si se necesita reconectar, handleHostDisconnect lo manejará
});

// ============================================================================
// KEEPALIVE PARA MV3
// ============================================================================

if (chrome.alarms) {
  chrome.alarms.create('keepalive', { periodInMinutes: 1 });
  
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'keepalive') {
      logToHost("debug", "⏰ Service worker keepalive ping", {
        connectionState,
        hasPort: !!nativePort,
        reconnectAttempts
      });

      // Verificar salud de conexión
      if (connectionState === 'CONNECTED' && !nativePort) {
        logToHost("warn", "Estado inconsistente detectado, forzando reconexión");
        handleHostDisconnect();
      }
    }
  });
}

// ============================================================================
// LIMPIEZA AL SUSPENDER (MV3 Service Worker Lifecycle)
// ============================================================================

self.addEventListener('beforeunload', () => {
  logToHost("info", "Service worker suspendiendo, limpiando recursos");
  
  stopHeartbeat();
  
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
  }

  // NO cerrar nativePort - Chrome lo maneja automáticamente
  // Cerrarlo manualmente puede causar problemas de reconexión
});