// ============================================================================
// SYNAPSE THIN CLIENT - ROUTER CON HANDSHAKE DE 3 FASES
// ============================================================================

let nativePort = null;
let connectionState = 'DISCONNECTED';
let handshakeState = 'NONE'; // NONE | EXTENSION_READY | HOST_READY | CONFIRMED
let config = null;
let reconnectAttempts = 0;
let isInitialized = false;

const MAX_RECONNECT = 10;
const BASE_DELAY = 2000;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function detectActiveMode() {
  const tabs = await chrome.tabs.query({});
  
  const hasDiscovery = tabs.some(t => 
    t.url?.includes(chrome.runtime.id) && t.url?.includes('discovery')
  );
  
  const hasLanding = tabs.some(t => 
    t.url?.includes(chrome.runtime.id) && t.url?.includes('landing')
  );
  
  if (hasDiscovery) return 'discovery';
  if (hasLanding) return 'landing';
  
  const { synapseMode } = await chrome.storage.local.get(['synapseMode']);
  return synapseMode || 'discovery';
}

function validateConfig(mode) {
  if (!config) {
    console.error('[Synapse] ✗ Config is null or undefined');
    return;
  }

  const requiredBase = ['profileId', 'bridge_name', 'launchId', 'profile_alias', 'extension_id'];
  
  let requiredDiscovery = ['register'];
  if (config.register === true) {
    requiredDiscovery.push('email');
  }
  
  const requiredLanding = ['total_launches', 'uptime', 'intents_done', 'last_synch'];

  const required = [
    ...requiredBase,
    ...(mode === 'discovery' ? requiredDiscovery : requiredLanding)
  ];

  const missing = required.filter(key => config[key] === undefined);

  if (missing.length > 0) {
    console.error(`[Synapse] ✗ Missing config keys (${mode} mode):`, missing);
    console.error('[Synapse] Current config:', config);
    console.error('[Synapse] Required keys:', required);
    
    if (missing.includes('email') && config.register === true) {
      console.error('[Synapse] ℹ️  Email is required because register=true');
    }
  } else {
    console.log(`[Synapse] ✓ All required config keys present (${mode} mode)`);
    console.log('[Synapse] Config summary:', {
      mode: config.mode,
      profileId: config.profileId,
      bridge_name: config.bridge_name,
      profile_alias: config.profile_alias,
      register: config.register,
      hasEmail: !!config.email,
      emailRequired: config.register === true
    });
  }
}

// ============================================================================
// INIT
// ============================================================================

async function initialize() {
  if (isInitialized) {
    console.log('[Synapse] Already initialized - skipping duplicate call');
    return;
  }
  
  console.log('[Synapse] Initializing...');
  isInitialized = true;
  
  await loadConfig();
  setupKeepalive();
  connectNative();
}

async function loadConfig() {
  try {
    const mode = await detectActiveMode();
    console.log('[Synapse] Active mode detected:', mode);

    const baseMatchers = {
      profileId: /"profileId"\s*:\s*"([^"]+)"/,
      bridge_name: /"bridge_name"\s*:\s*"([^"]+)"/,
      launchId: /"launchId"\s*:\s*"([^"]+)"/,
      profile_alias: /"profile_alias"\s*:\s*"([^"]+)"/,
      extension_id: /"extension_id"\s*:\s*"([^"]+)"/
    };

    const registerMatcher = {
      register: /"register"\s*:\s*(true|false)/
    };

    const emailMatcher = {
      email: /"email"\s*:\s*"([^"]+)"/
    };

    const landingMatchers = {
      total_launches: /"total_launches"\s*:\s*(\d+)/,
      uptime: /"uptime"\s*:\s*(\d+)/,
      intents_done: /"intents_done"\s*:\s*(\d+)/,
      last_synch: /"last_synch"\s*:\s*"([^"]+)"/
    };

    const configFile = mode === 'discovery' 
      ? 'discovery.synapse.config.js'
      : 'landing.synapse.config.js';

    console.log('[Synapse] Loading config file:', configFile);

    try {
      console.log('[Synapse] Attempting importScripts...');
      importScripts(configFile);
      
      if (self.SYNAPSE_CONFIG) {
        config = { ...self.SYNAPSE_CONFIG, mode };
        console.log(`[Synapse] ✓ Config loaded via importScripts (${mode} mode):`, config);
        
        await chrome.storage.local.set({ synapseMode: mode });
        validateConfig(mode);
        return;
      } else {
        throw new Error('SYNAPSE_CONFIG not defined after importScripts');
      }
      
    } catch (importError) {
      console.warn('[Synapse] importScripts failed:', importError.message);
      console.log('[Synapse] Attempting fetch fallback...');
      
      try {
        const url = chrome.runtime.getURL(configFile);
        console.log('[Synapse] Fetching from URL:', url);
        
        const resp = await fetch(url);
        
        if (!resp.ok) {
          throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
        }
        
        const text = await resp.text();
        console.log('[Synapse] Config file content length:', text.length);
        console.log('[Synapse] First 200 chars:', text.substring(0, 200));
        
        config = { mode };
        
        const initialMatchers = {
          ...baseMatchers,
          ...(mode === 'discovery' ? registerMatcher : landingMatchers)
        };
        
        for (const [key, regex] of Object.entries(initialMatchers)) {
          const match = text.match(regex);
          
          if (match) {
            let value;
            if (key === 'register') {
              value = match[1] === 'true';
            } else if (['total_launches', 'uptime', 'intents_done'].includes(key)) {
              value = parseInt(match[1], 10);
            } else {
              value = match[1];
            }
            
            config[key] = value;
            console.log(`[Synapse] ✓ Parsed ${key}:`, value);
          } else {
            console.warn(`[Synapse] ✗ Could not parse ${key} with regex:`, regex);
          }
        }
        
        if (mode === 'discovery' && config.register === true) {
          const emailMatch = text.match(emailMatcher.email);
          if (emailMatch) {
            config.email = emailMatch[1];
            console.log(`[Synapse] ✓ Parsed email:`, config.email);
          } else {
            console.warn(`[Synapse] ✗ Could not parse email (required when register=true)`);
          }
        }

        console.log(`[Synapse] ✓ Config loaded via fetch (${mode} mode):`, config);
        
      } catch (fetchError) {
        console.error('[Synapse] ✗ Fetch failed:', fetchError);
        throw fetchError;
      }
    }

    await chrome.storage.local.set({ synapseMode: mode });
    validateConfig(mode);

  } catch (e) {
    console.error('[Synapse] ✗ Config load failed:', e);
    console.error('[Synapse] Stack trace:', e.stack);
  }
}

// ============================================================================
// NATIVE CONNECTION - CON HANDSHAKE DE 3 FASES
// ============================================================================

function connectNative() {
  if (!config?.bridge_name) {
    console.error('[Synapse] ✗ No bridge_name in config');
    return;
  }

  if (nativePort !== null) {
    console.warn('[Synapse] Native port already exists - skipping reconnect');
    return;
  }

  connectionState = 'CONNECTING';
  handshakeState = 'NONE';

  try {
    nativePort = chrome.runtime.connectNative(config.bridge_name);

    nativePort.onMessage.addListener(handleHostMessage);
    nativePort.onDisconnect.addListener(handleDisconnect);

    // 🔒 FASE 1: Extension → Host (extension_ready)
    console.log('[HANDSHAKE] FASE 1: Extension → Host (extension_ready)');
    
    nativePort.postMessage({
      command: "extension_ready",
      profile_id: config.profileId,
      launch_id: config.launchId,
      extension_id: config.extension_id || chrome.runtime.id,
      profile_alias: config.profile_alias,
      timestamp: Date.now()
    });

    handshakeState = 'EXTENSION_READY';
    connectionState = 'CONNECTED';
    reconnectAttempts = 0;

    console.log('[Synapse] ✓ Connected to native host - Waiting for host_ready...');
    
  } catch (e) {
    console.error('[Synapse] ✗ Native connection failed:', e);
    connectionState = 'DISCONNECTED';
    handshakeState = 'NONE';
    nativePort = null;
    scheduleReconnect();
  }
}

function handleDisconnect() {
  const error = chrome.runtime.lastError;
  console.warn('[Synapse] ⚠️ Native host disconnected:', error?.message || 'Unknown');

  connectionState = 'DISCONNECTED';
  handshakeState = 'NONE';
  nativePort = null;

  scheduleReconnect();
}

function scheduleReconnect() {
  if (reconnectAttempts >= MAX_RECONNECT) {
    console.error('[Synapse] ✗ Max reconnect attempts reached');
    return;
  }

  const delay = BASE_DELAY * Math.pow(1.5, reconnectAttempts);
  reconnectAttempts++;

  console.log(`[Synapse] ⏱️ Reconnecting in ${delay}ms (attempt ${reconnectAttempts}/${MAX_RECONNECT})`);

  setTimeout(() => {
    console.log('[Synapse] 🔄 Attempting reconnect...');
    connectNative();
  }, delay);
}

// ============================================================================
// HOST MESSAGE HANDLING - CON HANDSHAKE DE 3 FASES
// ============================================================================

function handleHostMessage(msg) {
  console.log('[Synapse] ← Host message received:', msg);

  // 🔒 FASE 2: Host → Extension (host_ready)
  if (msg.command === 'host_ready' || msg.event === 'host_ready') {

    console.log('[HANDSHAKE] FASE 2: Host → Extension (host_ready) ✓');
    handshakeState = 'HOST_READY';
    
    // 🔒 FASE 3: Extension → Host (handshake_confirm)
    console.log('[HANDSHAKE] FASE 3: Extension → Host (handshake_confirm)');
    
    nativePort.postMessage({
      command: "handshake_confirm",
      profile_id: config.profileId,
      launch_id: config.launchId,
      extension_id: config.extension_id || chrome.runtime.id,
      timestamp: Date.now()
    });
    
    handshakeState = 'CONFIRMED';
    console.log('[HANDSHAKE] ✓✓✓ HANDSHAKE COMPLETADO - Canal seguro establecido');
    
    // Notificar a discovery/landing que el handshake está completo
    chrome.runtime.sendMessage({
      event: 'HANDSHAKE_CONFIRMED',
      timestamp: Date.now()
    }).catch(() => {
      // Silently fail if no listeners
    });
    
    return;
  }

  // Bloquear mensajes antes de confirmar handshake
  if (handshakeState !== 'CONFIRMED' && handshakeState !== 'HOST_READY') {
    console.warn('[Synapse] ⚠️ Message blocked - Handshake not confirmed');
    return;
  }

  // API Key responses
  if (msg.event === 'API_KEY_REGISTERED' || 
      msg.event === 'API_KEY_REGISTRATION_FAILED') {
    handleAPIKeyResponse(msg);
    return;
  }

  // Navigation command
  if (msg.type === 'NAVIGATE' && msg.payload?.url) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.update(tabs[0].id, { url: msg.payload.url });
      }
    });
    return;
  }

  // Message routing
  if (msg.target) {
    forwardToContent(msg);
    return;
  }

  // Generic commands
  if (msg.command) {
    executeCommand(msg);
    return;
  }

  // Broadcast to all tabs
  if (msg.event) {
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, msg).catch(() => {});
      });
    });
  }
}

// ============================================================================
// COMMAND EXECUTION
// ============================================================================

function executeCommand(msg) {
  const { command, payload, id: msgId } = msg;

  switch (command) {
    case 'tab.create':
      executeTabCreate(payload, msgId);
      break;

    case 'tab.close':
      executeTabClose(payload.tab_id, msgId);
      break;

    case 'tab.navigate':
      executeTabNavigate(payload.tab_id, payload, msgId);
      break;

    case 'tab.query':
      executeTabQuery(payload, msgId);
      break;

    case 'window.close':
      executeWindowClose(msgId);
      break;

    default:
      console.warn('[Synapse] ⚠ Unknown command:', command);
      respondToHost(msgId, { success: false, error: 'Unknown command' });
  }
}

function executeTabCreate(payload, msgId) {
  chrome.tabs.create(
    { url: payload.url, active: payload.active !== false },
    (tab) => {
      respondToHost(msgId, {
        success: !chrome.runtime.lastError,
        tab_id: tab?.id,
        error: chrome.runtime.lastError?.message
      });
    }
  );
}

function executeTabClose(tabId, msgId) {
  chrome.tabs.remove(tabId, () => {
    respondToHost(msgId, {
      success: !chrome.runtime.lastError,
      error: chrome.runtime.lastError?.message
    });
  });
}

function executeTabNavigate(tabId, payload, msgId) {
  chrome.tabs.update(tabId, { url: payload.url }, () => {
    respondToHost(msgId, {
      success: !chrome.runtime.lastError,
      error: chrome.runtime.lastError?.message
    });
  });
}

function executeTabQuery(payload, msgId) {
  const query = payload.url_pattern ? { url: payload.url_pattern } : {};

  chrome.tabs.query(query, (tabs) => {
    respondToHost(msgId, {
      success: true,
      tabs: tabs.map(t => ({
        id: t.id,
        url: t.url,
        title: t.title,
        active: t.active
      }))
    });
  });
}

function executeWindowClose(msgId) {
  chrome.windows.getCurrent((w) => {
    chrome.windows.remove(w.id);
  });
}

async function forwardToContent(msg) {
  const { target, id } = msg;

  let tabId;
  if (target === 'active') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      respondToHost(id, { success: false, error: 'No active tab' });
      return;
    }
    tabId = tab.id;
  } else {
    tabId = target;
  }

  chrome.tabs.sendMessage(tabId, msg, (resp) => {
    respondToHost(id, resp || {
      success: !chrome.runtime.lastError,
      error: chrome.runtime.lastError?.message
    });
  });
}

// ============================================================================
// CONTENT MESSAGES
// ============================================================================

chrome.runtime.onMessage.addListener((msg, sender, sendResp) => {
  const { event, command } = msg;

  // Handler para comandos ejecutados desde landing
  if (msg.action === 'executeBrainCommand') {
    console.log('[Synapse] Brain command received:', msg.command);
    
    sendToHost({
      type: 'BRAIN_COMMAND',
      command: msg.command,
      source: 'landing_cockpit',
      timestamp: Date.now()
    });
    
    sendResp({ 
      success: true, 
      message: 'Command sent to host' 
    });
    
    return true;
  }

  // Handler para ping desde landing
  if (msg.action === 'ping') {
    sendResp({ 
      status: 'pong',
      connection_state: connectionState,
      handshake_state: handshakeState
    });
    return true;
  }

  // Handler para check host desde landing
  if (msg.action === 'checkHost') {
    sendResp({ 
      hostConnected: connectionState === 'CONNECTED',
      connection_state: connectionState,
      handshake_state: handshakeState,
      handshake_confirmed: handshakeState === 'CONFIRMED'
    });
    return true;
  }

  // Handler para cambio de modo
  if (event === 'SET_MODE') {
    console.log('[Synapse] Mode switch requested:', msg.mode);
    
    chrome.storage.local.set({ synapseMode: msg.mode }, async () => {
      isInitialized = false;
      await loadConfig();
      
      sendResp({ success: true, mode: msg.mode });
    });
    
    return true;
  }

  // Actuator ready
  if (event === 'actuator_ready') {
    sendToHost({
      event: "ACTUATOR_READY",
      tab_id: sender.tab?.id,
      url: msg.url
    });
    sendResp({ received: true });
    return true;
  }

  // Slave mode notifications
  if (event === 'slave_mode_changed') {
    console.log('[Synapse] Slave mode changed:', msg.enabled);
    sendToHost({
      event: "SLAVE_MODE_CHANGED",
      enabled: msg.enabled,
      tab_id: sender.tab?.id,
      timestamp: Date.now()
    });
    sendResp({ received: true });
    return true;
  }

  // Slave mode timeout
  if (event === 'slave_mode_timeout') {
    console.warn('[Synapse] ⚠️ Slave mode timeout on tab:', sender.tab?.id);
    sendToHost({
      event: "SLAVE_MODE_TIMEOUT",
      tab_id: sender.tab?.id,
      selector: msg.selector,
      timestamp: Date.now()
    });
    sendResp({ received: true });
    return true;
  }

  // Discovery complete
  if (event === 'DISCOVERY_COMPLETE' || command === 'discovery_complete') {
    console.log('[Synapse] ✓ Discovery complete');
    sendToHost({
      event: "DISCOVERY_COMPLETE",
      payload: msg.payload || msg
    });
    sendResp({ received: true });
    return true;
  }

  // Heartbeat success
  if (event === 'HEARTBEAT_SUCCESS') {
    console.log('[Synapse] ✓ Heartbeat validation successful');
    sendToHost({
      event: "HEARTBEAT_SUCCESS",
      status: msg.status,
      timestamp: msg.timestamp
    });
    sendResp({ received: true });
    return true;
  }

  // Check handshake status
  if (command === 'check_handshake_status') {
    const response = {
      handshake_confirmed: handshakeState === 'CONFIRMED',
      handshake_state: handshakeState,
      status: 'pong',
      connection_state: connectionState
    };
    sendResp(response);
    return true;
  }

  // Manual clipboard check
  if (msg.action === 'checkClipboard') {
    navigator.clipboard.readText().then(text => {
      const detected = detectAPIKeyProvider(text);
      sendResp({ detected: detected });
    }).catch(error => {
      sendResp({ error: error.message });
    });
    return true;
  }

  // Manual start/stop monitoring
  if (msg.action === 'startClipboardMonitoring') {
    startClipboardMonitoring();
    sendResp({ monitoring: true });
    return true;
  }

  if (msg.action === 'stopClipboardMonitoring') {
    stopClipboardMonitoring();
    sendResp({ monitoring: false });
    return true;
  }

  return false;
});

// ============================================================================
// UTILS
// ============================================================================

function sendToHost(msg) {
  if (nativePort && connectionState === 'CONNECTED') {
    // 🔒 Validar handshake antes de enviar mensajes críticos
    if (handshakeState !== 'CONFIRMED' && handshakeState !== 'HOST_READY') {
      console.warn('[Synapse] ⚠️ Message blocked - Handshake not confirmed:', msg.event || msg.type);
      return;
    }
    
    nativePort.postMessage(msg);
  } else {
    console.warn('[Synapse] ⚠ Cannot send - not connected:', msg.event || msg.type);
  }
}

function respondToHost(msgId, payload) {
  if (!msgId) return;
  sendToHost({
    type: "RESPONSE",
    id: msgId,
    payload
  });
}

function setupKeepalive() {
  // Alarm cada 1 minuto para mantener el service worker vivo
  chrome.alarms.create('keepalive', { periodInMinutes: 1 });

  chrome.alarms.onAlarm.addListener((a) => {
    if (a.name !== 'keepalive') return;

    console.log('[Synapse] 💓 Keepalive tick - Handshake:', handshakeState, '| Connection:', connectionState);

    // Enviar heartbeat real al host solo si el canal está establecido.
    // El host (bloom-host / Sentinel) forwardea esto como SignalHeartbeat al workflow de Temporal.
    // Sin esto, el ProfileLifecycleWorkflow degrada a DEGRADED a los 2 minutos por heartbeat timeout.
    if (handshakeState === 'CONFIRMED' && connectionState === 'CONNECTED') {
      sendToHost({
        event: 'HEARTBEAT',
        profile_id: config?.profileId,
        launch_id: config?.launchId,
        timestamp: Date.now(),
        status: 'alive'
      });
      console.log('[Synapse] 💓 Heartbeat sent to host for profile:', config?.profileId);
    } else {
      console.warn('[Synapse] ⚠️ Heartbeat skipped - channel not ready (handshake:', handshakeState, ')');
    }
  });
}

// ============================================================================
// STARTUP
// ============================================================================

chrome.runtime.onInstalled.addListener(() => {
  console.log('[Synapse] 🔧 Extension installed/updated');
  initialize();
});

chrome.runtime.onStartup.addListener(() => {
  console.log('[Synapse] 🚀 Browser startup');
  initialize();
});

chrome.runtime.onSuspend?.addListener(() => {
  console.log('[Synapse] 💤 Service worker suspending');
});

// ============================================================================
// DEBUGGING HELPERS
// ============================================================================

if (typeof self !== 'undefined' && self.location?.href?.includes('debug=true')) {
  console.log('[Synapse] 🐛 Debug mode enabled');
  
  self.SYNAPSE_DEBUG = {
    getState: () => ({
      initialized: isInitialized,
      connectionState,
      handshakeState,
      hasPort: nativePort !== null,
      config: config ? { ...config, bridge_name: '***' } : null,
      mode: config?.mode
    }),
    forceReconnect: () => {
      if (nativePort) {
        nativePort.disconnect();
      }
      isInitialized = false;
      initialize();
    }
  };
}

// ============================================================================
// CLIPBOARD API KEY DETECTOR
// ============================================================================

/**
 * API Key pattern matchers for all supported providers
 */
const API_KEY_PATTERNS = {
  gemini: {
    regex: /^AIzaSy[A-Za-z0-9_-]{33}$/,
    name: 'Gemini',
    console_url: 'https://aistudio.google.com/app/apikey'
  },
  claude: {
    regex: /^sk-ant-api\d{2}-[A-Za-z0-9_-]{95,}$/,
    name: 'Claude',
    console_url: 'https://console.anthropic.com/settings/keys'
  },
  openai: {
    regex: /^sk-[A-Za-z0-9]{48}$/,
    name: 'ChatGPT',
    console_url: 'https://platform.openai.com/api-keys'
  },
  xai: {
    regex: /^xai-[A-Za-z0-9_-]{32,}$/,
    name: 'Grok',
    console_url: 'https://console.x.ai/keys'
  }
};

/**
 * Detect which provider an API key belongs to
 */
function detectAPIKeyProvider(text) {
  if (!text || typeof text !== 'string') {
    return null;
  }

  // Clean whitespace
  const cleaned = text.trim();

  // Test against each provider
  for (const [provider, config] of Object.entries(API_KEY_PATTERNS)) {
    if (config.regex.test(cleaned)) {
      return {
        provider: provider,
        name: config.name,
        key: cleaned,
        matched: true
      };
    }
  }

  return null;
}

/**
 * State management for clipboard monitoring
 */
let clipboardMonitor = {
  isMonitoring: false,
  intervalId: null,
  lastClipboard: '',
  detectedKeys: new Set()
};

/**
 * Start monitoring clipboard for API keys
 */
function startClipboardMonitoring() {
  if (clipboardMonitor.isMonitoring) {
    console.log('[Clipboard] Already monitoring');
    return;
  }

  console.log('[Clipboard] Starting monitoring...');
  clipboardMonitor.isMonitoring = true;

  // Poll clipboard every 1 second
  clipboardMonitor.intervalId = setInterval(async () => {
    try {
      // Read clipboard (requires clipboardRead permission in manifest)
      const text = await navigator.clipboard.readText();

      // Skip if clipboard hasn't changed
      if (text === clipboardMonitor.lastClipboard) {
        return;
      }

      clipboardMonitor.lastClipboard = text;

      // Detect provider
      const detected = detectAPIKeyProvider(text);

      if (detected) {
        // Avoid duplicate detections
        const keyHash = detected.key.substring(0, 20); // First 20 chars as hash
        if (clipboardMonitor.detectedKeys.has(keyHash)) {
          console.log('[Clipboard] Key already detected, skipping');
          return;
        }

        clipboardMonitor.detectedKeys.add(keyHash);
        console.log('[Clipboard] ✓ API Key detected:', detected.name);

        // Send to host via Native Messaging
        sendToHost({
          event: 'API_KEY_DETECTED',
          provider: detected.provider,
          key: detected.key,
          timestamp: Date.now()
        });

        // Show notification to user
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon128.png',
          title: `${detected.name} API Key Detected`,
          message: 'Registering key in Bloom Vault...',
          priority: 2
        });
      }
    } catch (error) {
      // Silently fail (clipboard API can throw if no permission)
      if (error.message.includes('clipboard-read')) {
        console.error('[Clipboard] Missing clipboard-read permission');
        stopClipboardMonitoring();
      }
    }
  }, 1000); // Poll every second
}

/**
 * Stop monitoring clipboard
 */
function stopClipboardMonitoring() {
  if (!clipboardMonitor.isMonitoring) {
    return;
  }

  console.log('[Clipboard] Stopping monitoring');
  clearInterval(clipboardMonitor.intervalId);
  clipboardMonitor.isMonitoring = false;
  clipboardMonitor.intervalId = null;
}

/**
 * Handle API key registration response from host
 */
function handleAPIKeyResponse(message) {
  const { event, provider, profile_name, error, status } = message;

  if (event === 'API_KEY_REGISTERED' && status === 'success') {
    console.log('[Clipboard] ✓ Key registered:', provider, profile_name);

    // Show success notification
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'API Key Registered',
      message: `${provider.toUpperCase()} key saved as "${profile_name}"`,
      priority: 2
    });

    // Notify discovery page if open
    chrome.runtime.sendMessage({
      event: 'API_KEY_REGISTERED',
      provider: provider,
      profile_name: profile_name
    });
  } 
  else if (event === 'API_KEY_REGISTRATION_FAILED') {
    console.error('[Clipboard] ✗ Registration failed:', error);

    // Show error notification
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'API Key Registration Failed',
      message: `${provider.toUpperCase()}: ${error}`,
      priority: 2
    });
  }
}

/**
 * Listen for onboarding state changes to start/stop monitoring
 */
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.onboarding_state) {
    const state = changes.onboarding_state.newValue;

    // Start monitoring when user is waiting for API key
    if (state?.currentStep?.includes('api_waiting') || 
        state?.currentStep?.includes('gemini_api_waiting')) {
      startClipboardMonitoring();
    }
    // Stop monitoring when onboarding is complete
    else if (state?.completed === true) {
      stopClipboardMonitoring();
    }
  }
});