'use strict';

import './background-github-device-flow.js';
import './background-companion.js';

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
// DEBUG PANEL BRIDGE
// Reenvía eventos del harness al feed del debug panel (debug.html / Control Plane).
//
// Canal: POST http://localhost:48215/api/internal/system-event
// Envelope: { category, event, data, profile_id, timestamp }
//
// forwardToDebugPanel() es fire-and-forget: nunca bloquea el flujo principal.
// Si la API no está disponible o el panel no está abierto, falla silenciosamente.
//
// Categorías usadas desde background.js:
//   'synapse'  — eventos del protocolo Synapse (handshake, token, discovery)
//   'sentinel' — eventos de la extensión Chrome (loaded, actuator_ready)
//   'brain'    — respuestas desde el host nativo (IonPump, profile)
// ============================================================================

const DEBUG_API_URL = 'http://localhost:48215';

// ============================================================================
// HARNESS LOG BUFFER
// Buffer circular en memoria — mismo patrón que pending_queue en synapse_logger.h.
// Resuelve la condición de carrera: muchos eventos (HANDSHAKE_CONFIRMED,
// EXTENSION_LOADED, etc.) se emiten ANTES de que la tab del Harness exista
// y esté escuchando. Sin buffer, esos sendMessage() se pierden en el aire.
// Cuando el Harness abre y manda HARNESS_HELLO, le contestamos con todo
// lo acumulado hasta ese momento.
// ============================================================================
const HARNESS_LOG_MAX = 100;
const harnessLogBuffer = [];

function pushHarnessLog(entry) {
  harnessLogBuffer.push(entry);
  if (harnessLogBuffer.length > HARNESS_LOG_MAX) {
    harnessLogBuffer.shift();
  }
}

function forwardToDebugPanel(category, event, data = {}, profile_id = null) {
  // No await — fire and forget para no bloquear el event handler de Chrome.
  fetch(`${DEBUG_API_URL}/api/internal/system-event`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      category,
      event,
      data,
      profile_id: profile_id || config?.profileId || null,
      timestamp:  Date.now()
    })
  }).catch(() => {
    // Silencioso — el debug panel puede no estar abierto o la API puede estar
    // arrancando. No loguear para no contaminar la consola del service worker.
  });

  // Espejo hacia el Cortex Harness (tab dentro de la extensión).
  // Mismo dato, segundo destino. No reemplaza el POST de arriba — lo acompaña.
  const harnessMsg = {
    event: 'HARNESS_LOG',
    category,
    sourceEvent: event,
    data,
    profile_id: profile_id || config?.profileId || null,
    timestamp: Date.now()
  };

  // Guardar siempre en el buffer — sin importar si hay alguien escuchando ahora.
  // Esto es lo que permite que un Harness que abre tarde igual vea todo lo que pasó.
  pushHarnessLog(harnessMsg);

  // Intento de entrega en vivo. Si no hay tab escuchando, falla silencioso
  // (catch vacío) — no pasa nada, el buffer ya lo tiene guardado igual.
  chrome.runtime.sendMessage(harnessMsg).catch(() => {});
}

// ============================================================================
// NAVIGATION HEALTH TRACKING — páginas propias de la extensión
// (Discovery / Harness / Landing)
//
// Motivación (ver ERR_BLOCKED_BY_CLIENT del 2026-07-11): Chrome puede dejar
// una tab con status === 'complete' y url === la URL esperada AUNQUE la
// navegación haya terminado en la interstitial de "Chromium ha bloqueado
// esta página" — no siempre reescribe tab.url a chrome-error://. El chequeo
// viejo (status + prefijo chrome-error://) no detecta ese caso. Acá se
// trackea el resultado real de cada navegación vía webNavigation, y además
// se verifica que el DOM tenga contenido renderizado antes de dar por sana
// una tab existente.
// ============================================================================

const brokenNavTabs = new Set();
const EXTENSION_URL_PREFIX = chrome.runtime.getURL('');

chrome.webNavigation.onErrorOccurred.addListener((details) => {
  if (details.frameId !== 0) return; // solo frame principal
  brokenNavTabs.add(details.tabId);
  console.warn('[NavHealth] ⚠️ onErrorOccurred tab', details.tabId, details.error, details.url);
}, { url: [{ urlPrefix: EXTENSION_URL_PREFIX }] });

chrome.webNavigation.onCompleted.addListener((details) => {
  if (details.frameId !== 0) return;
  brokenNavTabs.delete(details.tabId); // navegación posterior OK — se levanta la marca
}, { url: [{ urlPrefix: EXTENSION_URL_PREFIX }] });

chrome.tabs.onRemoved.addListener((tabId) => {
  brokenNavTabs.delete(tabId);
});

// Verificación de contenido real, más allá de status/url — cubre el caso
// en que Chrome reporta la navegación como "completa" pero el DOM quedó
// vacío (interstitial de bloqueo, página en blanco, etc).
async function hasRenderedContent(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => !!document.body && document.body.innerText.trim().length > 0
    });
    return !!(results && results[0] && results[0].result);
  } catch (err) {
    console.warn('[NavHealth] ⚠️ No se pudo verificar contenido de tab', tabId, err.message);
    return false;
  }
}

async function isExtensionTabHealthy(tab) {
  if (!tab || !tab.url) return false;
  if (tab.status !== 'complete') return false;
  if (tab.url.startsWith('chrome-error://')) return false;
  if (brokenNavTabs.has(tab.id)) return false;
  return hasRenderedContent(tab.id);
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function detectActiveMode() {
  // Fuente primaria: config files generados por Sentinel antes de lanzar Chrome.
  // Existen aunque la tab haya fallado con ERR_BLOCKED_BY_CLIENT al arrancar.
  try {
    const r = await fetch(chrome.runtime.getURL('discovery.synapse.config.js'));
    if (r.ok) return 'discovery';
  } catch (_) {}

  try {
    const r = await fetch(chrome.runtime.getURL('landing.synapse.config.js'));
    if (r.ok) return 'landing';
  } catch (_) {}

  // Fuente secundaria: tabs abiertas (boot sin ERR_BLOCKED, reinicios).
  const tabs = await chrome.tabs.query({});

  const hasDiscovery = tabs.some(t =>
    t.url?.includes(chrome.runtime.id) && t.url?.includes('discovery')
  );
  const hasLanding = tabs.some(t =>
    t.url?.includes(chrome.runtime.id) && t.url?.includes('landing')
  );

  if (hasDiscovery) return 'discovery';
  if (hasLanding)   return 'landing';

  // Fallback: último modo conocido.
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
    // FIX (v3.1): Email no está disponible en el flujo de GitHub al momento
    // del boot — GithubAuthFlow todavía no tiene email del usuario.
    // Solo requerir email cuando el service NO es 'github'.
    // Para todos los demás providers (google, gemini) sigue siendo obligatorio.
    const isGithubFlow = config.service === 'github';
    if (!isGithubFlow) {
      requiredDiscovery.push('email');
    }
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

  // Cargar schemas de protocolo y registrar handlers
  await loadProtocolSchemas();

  // FIX: Verificar que profileId y launchId existen antes de conectar.
  if (!config) {
    console.error('[Synapse] ✗ Config failed to load — aborting connection');
    isInitialized = false;
    return;
  }

  if (!config.profileId || !config.launchId) {
    console.error('[Synapse] ✗ profileId or launchId missing from config — aborting connection');
    console.error('[Synapse] config.profileId:', config.profileId);
    console.error('[Synapse] config.launchId:', config.launchId);
    console.error('[Synapse] Full config dump:', JSON.stringify(config, null, 2));
    console.error('[Synapse] ℹ️  Verify that the config file uses "profileId" and "launchId" (camelCase)');
    isInitialized = false;
    return;
  }

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

    // step: paso de onboarding activo inyectado por Ignition (Gap 2)
    const stepMatcher = {
      step: /"step"\s*:\s*"([^"]*)"/
    };

    // service: providers de registro activos inyectados por Ignition
    const serviceMatcher = {
      service: /"service"\s*:\s*"([^"]*)"/
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
        ...(mode === 'discovery' ? registerMatcher : landingMatchers),
        ...stepMatcher,
        ...serviceMatcher
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

      if (!config.profileId) {
        const snakeMatch = text.match(/"profile_id"\s*:\s*"([^"]+)"/);
        if (snakeMatch) {
          config.profileId = snakeMatch[1];
          console.warn('[Synapse] ⚠️  profileId parsed from snake_case key "profile_id":', config.profileId);
        }
      }
      if (!config.launchId) {
        const snakeMatch = text.match(/"launch_id"\s*:\s*"([^"]+)"/);
        if (snakeMatch) {
          config.launchId = snakeMatch[1];
          console.warn('[Synapse] ⚠️  launchId parsed from snake_case key "launch_id":', config.launchId);
        }
      }
      
      if (mode === 'discovery' && config.register === true) {
        const isGithubFlow = config.service === 'github';
        if (!isGithubFlow) {
          const emailMatch = text.match(emailMatcher.email);
          if (emailMatch) {
            config.email = emailMatch[1];
            console.log(`[Synapse] ✓ Parsed email:`, config.email);
          } else {
            console.warn(`[Synapse] ✗ Could not parse email (required when register=true, service: ${config.service})`);
          }
        } else {
          config.email = '';
          console.log(`[Synapse] ℹ️  Email skipped for github flow (clipboard-based auth)`);
        }
      }

      console.log(`[Synapse] ✓ Config loaded via fetch (${mode} mode):`, config);
      
    } catch (fetchError) {
      console.error('[Synapse] ✗ Fetch failed:', fetchError);
      throw fetchError;
    }

    await chrome.storage.local.set({ synapseMode: mode });
    validateConfig(mode);

    if (mode === 'discovery') {
      await enforceDiscoveryWindowSize();
    }

    await loadHarnessConfig();

  } catch (e) {
    console.error('[Synapse] ✗ Config load failed:', e);
    console.error('[Synapse] Stack trace:', e.stack);
  }
}

// ============================================================================
// HARNESS CONFIG — siempre activo (no requiere --dev)
// ============================================================================

async function loadHarnessConfig() {
  console.log('[Harness] loadHarnessConfig ejecutando…');

  const harnessFile = 'harness.synapse.config.js';
  let harnessConfig = null;
  let text = null;

  try {
    const url = chrome.runtime.getURL(harnessFile);
    console.log('[Harness] Fetching:', url);
    const resp = await fetch(url);
    console.log('[Harness] Fetch response status:', resp.status, resp.ok ? 'OK' : 'NOT OK');

    if (!resp.ok) {
      console.log('[Harness] Archivo no encontrado (HTTP ' + resp.status + ') — Harness inactivo');
      return;
    }

    text = await resp.text();
    console.log('[Harness] Contenido recibido, length:', text.length);
    console.log('[Harness] Primeros 150 chars:', text.substring(0, 150));

  } catch (fetchErr) {
    console.error('[Harness] ✗ Fetch error:', fetchErr.message);
    return;
  }

  harnessConfig = {};
  const matchers = {
    profileId:    /["']?profileId["']?\s*:\s*["']([^"']+)["']/,
    launchId:     /["']?launchId["']?\s*:\s*["']([^"']+)["']/,
    profileAlias: /["']?profileAlias["']?\s*:\s*["']([^"']+)["']/,
    generatedAt:  /["']?generatedAt["']?\s*:\s*["']([^"']+)["']/
  };
  for (const [key, regex] of Object.entries(matchers)) {
    const match = text.match(regex);
    if (match) {
      harnessConfig[key] = match[1];
      console.log('[Harness] ✓ Parsed', key + ':', match[1]);
    } else {
      console.warn('[Harness] ✗ No match para:', key);
    }
  }

  if (!harnessConfig.profileId) {
    console.error('[Harness] ✗ profileId no parseado — Harness inactivo. Contenido del archivo:', text);
    return;
  }

  console.log('[Harness] ✓ Config parseado correctamente:', JSON.stringify(harnessConfig));

  config.harness = harnessConfig;
  console.log('[Harness] ✓ config.harness seteado.');
  console.log('[Harness] loadHarnessConfig completado — apertura de tab pendiente de host_ready.');
}

async function openHarnessTab() {
  try {
    const harnessUrl = chrome.runtime.getURL('harness/index.html');
    console.log('[Harness] openHarnessTab() — URL:', harnessUrl);

    const allTabs = await chrome.tabs.query({});
    const existingTab = allTabs.find(t => t.url && t.url.startsWith(harnessUrl));

    if (existingTab) {
      await chrome.tabs.update(existingTab.id, { active: true });
      console.log('[Harness] ✓ Tab existente traída al frente (id:', existingTab.id + ')');
    } else {
      const newTab = await chrome.tabs.create({ url: harnessUrl, active: false });
      console.log('[Harness] ✓ Tab creada (id:', newTab.id + ')');
    }
  } catch (tabErr) {
    console.error('[Harness] ✗ openHarnessTab error:', tabErr.message, tabErr.stack);
  }
}

// ── NUEVO: abrir discovery tab desde el SW, igual que harness ─────────────
async function openDiscoveryTab() {
  try {
    const discoveryUrl = chrome.runtime.getURL('discovery/index.html');
    console.log('[Discovery] openDiscoveryTab() — URL:', discoveryUrl);

    const allTabs = await chrome.tabs.query({});
    const existingTab = allTabs.find(t => t.url && t.url.startsWith(discoveryUrl));

    if (existingTab) {
      // FIX (handshake spam): antes esto siempre reescribía `url`, lo cual
      // fuerza un reload completo de la tab (DOMContentLoaded de nuevo →
      // discovery.js vuelve a correr los 5 stages del handshake animado).
      // openDiscoveryTab() se llama en CADA host_ready — y el service worker
      // de MV3 se suspende por inactividad durante la espera humana del
      // onboarding (crear token, loguearse, copiar key), así que al
      // despertar puede reconectar y volver a llamar acá. Si la tab ya está
      // sana, alcanza con traerla al frente — no hace falta recargarla.
      // El reload real (reescribir `url`) se reserva para tabs rotas.
      //
      // FIX 2026-07-11 (ERR_BLOCKED_BY_CLIENT no detectado): el chequeo
      // viejo (status === 'complete' + prefijo chrome-error://) daba falsos
      // positivos — Chrome puede terminar la navegación con status
      // 'complete' y tab.url === discoveryUrl aunque haya mostrado la
      // interstitial de "Chromium ha bloqueado esta página". isExtensionTabHealthy()
      // además chequea errores reales de webNavigation para esa tab y que el
      // DOM tenga contenido renderizado, no solo el estado superficial.
      const isHealthy = await isExtensionTabHealthy(existingTab);

      if (isHealthy) {
        await chrome.tabs.update(existingTab.id, { active: true });
        console.log('[Discovery] ✓ Tab existente sana — solo foco, sin reload (id:', existingTab.id + ')');
      } else {
        await chrome.tabs.update(existingTab.id, { url: discoveryUrl, active: true });
        brokenNavTabs.delete(existingTab.id);
        console.log('[Discovery] ✓ Tab existente rota/vacía — recargada (id:', existingTab.id + ')');
      }
    } else {
      const newTab = await chrome.tabs.create({ url: discoveryUrl, active: true });
      console.log('[Discovery] ✓ Tab creada (id:', newTab.id + ')');
    }
  } catch (tabErr) {
    console.error('[Discovery] ✗ openDiscoveryTab error:', tabErr.message, tabErr.stack);
  }
}

async function openLandingTab() {
  try {
    const landingUrl = chrome.runtime.getURL('landing/index.html');
    console.log('[Landing] openLandingTab() — URL:', landingUrl);
    const allTabs = await chrome.tabs.query({});
    const existingTab = allTabs.find(t => t.url && t.url.startsWith(landingUrl));
    if (existingTab) {
      await chrome.tabs.update(existingTab.id, { active: true });
      console.log('[Landing] ✓ Tab existente traída al frente (id:', existingTab.id + ')');
    } else {
      const newTab = await chrome.tabs.create({ url: landingUrl, active: true });
      console.log('[Landing] ✓ Tab creada (id:', newTab.id + ')');
    }
  } catch (tabErr) {
    console.error('[Landing] ✗ openLandingTab error:', tabErr.message, tabErr.stack);
  }
}

async function applyWindowLayout(layout = {}) {
  const {
    width  = 600,
    height = 800,
    left,
    top,
    state  = 'normal'
  } = layout;

  try {
    const win = await chrome.windows.getCurrent({ populate: false });

    if (!win || win.type !== 'normal') {
      console.warn('[Synapse] applyWindowLayout: not a normal window, skipping');
      return;
    }

    const updateProps = { width, height, state };

    if (typeof left === 'number') updateProps.left = left;
    if (typeof top  === 'number') updateProps.top  = top;

    await chrome.windows.update(win.id, updateProps);

    console.log(`[Synapse] ✓ Window layout applied: ${width}×${height}`, updateProps);

  } catch (e) {
    console.error('[Synapse] ✗ applyWindowLayout failed:', e);
  }
}

async function enforceDiscoveryWindowSize() {
  await applyWindowLayout({ width: 600, height: 800, state: 'normal' });
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

    const extensionReadyMsg = {
      command:       "extension_ready",
      profile_id:    config.profileId,
      launch_id:     config.launchId,
      extension_id:  config.extension_id || chrome.runtime.id,
      profile_alias: config.profile_alias,
      timestamp:     Date.now()
    };

    console.log('[HANDSHAKE] FASE 1: Extension → Host (extension_ready)');
    console.log('[HANDSHAKE] Payload:', JSON.stringify(extensionReadyMsg));

    nativePort.postMessage(extensionReadyMsg);

    // ── Harness: reportar FASE 1 del handshake ───────────────────────────────
    // Este evento se emite antes de que openHarnessTab() corra, así que va
    // directo al buffer. El replay de HARNESS_HELLO lo entregará al Harness
    // cuando la tab abra.
    forwardToDebugPanel('synapse', '→HOST:extension_ready', {
      _dir:          'out',
      _phase:        'handshake_1',
      profile_id:    config.profileId,
      launch_id:     config.launchId,
      extension_id:  config.extension_id || chrome.runtime.id
    });
    // ─────────────────────────────────────────────────────────────────────────

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

  // Notificar al debug panel que el canal nativo se desconectó
  forwardToDebugPanel('synapse', 'NATIVE_DISCONNECTED', {
    reason: error?.message || 'Unknown'
  });

  connectionState = 'DISCONNECTED';
  handshakeState = 'NONE';
  nativePort = null;

  // Limpiar estado persistido: si discovery abre después de una desconexión,
  // no debe leer un synapseStatus stale y creer que el sistema está listo.
  chrome.storage.local.remove('synapseStatus');

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
  const label = msg.event || msg.command || msg.type || '(unknown)';
  console.log(`[Host → Synapse] [${new Date().toISOString()}] ${label}`, msg);

  // ── Harness: reportar cada mensaje entrante del host ─────────────────────
  // Excluir keepalive (ruido). Sanitizar tokens si los hubiera.
  const _skipHarnessLog = label === 'keepalive';
  if (!_skipHarnessLog) {
    const _safeMsg = { ...msg };
    if (_safeMsg.token) _safeMsg.token = _safeMsg.token.substring(0, 10) + '…';
    if (_safeMsg.key)   _safeMsg.key   = _safeMsg.key.substring(0, 10) + '…';
    forwardToDebugPanel(
      'synapse',
      `HOST→:${label}`,
      { _dir: 'in', payload: _safeMsg }
    );
  }
  // ─────────────────────────────────────────────────────────────────────────

  // FASE 2: Host → Extension (host_ready)
  if (msg.command === 'host_ready' || msg.event === 'host_ready') {

    console.log('[HANDSHAKE] FASE 2: Host → Extension (host_ready) ✓');
    handshakeState = 'HOST_READY';
    
    // FASE 3: Extension → Host (handshake_confirm)
    console.log('[HANDSHAKE] FASE 3: Extension → Host (handshake_confirm)');
    
    nativePort.postMessage({
      command:      "handshake_confirm",
      profile_id:   config.profileId,
      launch_id:    config.launchId,
      extension_id: config.extension_id || chrome.runtime.id,
      timestamp:    Date.now()
    });
    
    handshakeState = 'CONFIRMED';
    console.log('[HANDSHAKE] ✓✓✓ HANDSHAKE COMPLETADO - Canal seguro establecido');

    // Persistir estado en storage para que discovery pueda resolverlo aunque el
    // SW haya sido suspendido y reiniciado entre el handshake y la apertura de la tab.
    // discovery.js lo lee en dos lugares: lectura inicial (chrome.storage.local.get)
    // y listener onChanged. Ambos consumen synapseStatus.command === 'system_ready'.
    chrome.storage.local.set({
      synapseStatus: {
        command: 'system_ready',
        payload: {
          handshake_confirmed: true,
          profile_id: config.profileId,
          launch_id:  config.launchId,
          timestamp:  Date.now()
        }
      }
    });

    // Notificar al debug panel que el handshake está completo
    forwardToDebugPanel('synapse', 'HANDSHAKE_CONFIRMED', {
      extension_id: config.extension_id || chrome.runtime.id,
      profile_alias: config.profile_alias
    }, config.profileId);

    if (msg.window) {
      console.log('[HANDSHAKE] Applying window layout from host payload:', msg.window);
      applyWindowLayout(msg.window);
    }

    if (config?.harness) {
      console.log('[Harness] host_ready → abriendo harness tab (SW activo)');
      openHarnessTab();
    } else {
      console.warn('[Harness] host_ready → config.harness no disponible, tab no abierta');
    }

    // Abrir/recargar discovery tab ahora que el SW está listo y el host conectado.
    // Esto resuelve ERR_BLOCKED_BY_CLIENT en ungoogled-chromium: Chrome abre la tab
    // antes del boot del SW como arg CLI; cuando llegamos aquí la extensión ya está
    // completamente inicializada y la tab puede cargar correctamente.
    if (config?.mode === 'discovery') {
      console.log('[Discovery] host_ready → abriendo/recargando discovery tab (SW activo)');
      openDiscoveryTab();
    }

    if (config?.mode === 'landing') {
      console.log('[Landing] host_ready → abriendo/recargando landing tab (SW activo)');
      openLandingTab();
    }

    chrome.runtime.sendMessage({
      event: 'HANDSHAKE_CONFIRMED',
      timestamp: Date.now()
    }).catch(() => {});
    
    return;
  }

  // Bloquear mensajes antes de confirmar handshake
  if (handshakeState !== 'CONFIRMED' && handshakeState !== 'HOST_READY') {
    console.warn('[Synapse] ⚠️ Message blocked - Handshake not confirmed');
    return;
  }

  // NOTA DE SEGURIDAD: se eliminó acá el routing a handleAPIKeyResponse()
  // porque ese handler solo existía para el monitor de portapapeles
  // (ver CLEANUP_NOTES.md). Si en el futuro se necesita un flujo de
  // registro de API keys, debe ser iniciado explícitamente por el usuario
  // (ej. pegar la key en un campo del formulario de Discovery), nunca por
  // detección pasiva de clipboard.

  // Landing responses — forward a la landing page
  if (['PROFILE_LOADED', 'HEALTH_CHECK_RESULT',
       'NUCLEUS_SYNC_RESULT', 'INTENT_LIST_RESULT'].includes(msg.event)) {
    console.log('[Synapse] Landing response → forwarding to landing page:', msg.event);
    chrome.runtime.sendMessage(msg).catch(() => {});
    return;
  }

  // ─────────────────────────────────────────────────────────────────────
  // IonPump events — forward al Harness y al debug panel
  // ─────────────────────────────────────────────────────────────────────
  const IONPUMP_EVENTS = [
    'ION_FLOW_STARTED',
    'ION_FLOW_COMPLETED',
    'ION_FLOW_ERROR',
    'ION_RELOAD_DONE',
    'ION_RELOAD_FAILED',
    'ION_INSPECT_RESULT'
  ];

  if (IONPUMP_EVENTS.includes(msg.event)) {
    console.log('[IonPump] ←', msg.event, msg.site || '');
    chrome.runtime.sendMessage(msg).catch(() => {});

    // Nivel semántico para el debug panel
    const level = msg.event.endsWith('_ERROR') || msg.event.endsWith('_FAILED') ? 'error' : 'info';
    forwardToDebugPanel('brain', msg.event, {
      site:      msg.site      || null,
      flow:      msg.flow      || null,
      launch_id: msg.launch_id || null,
      error:     msg.error     || null,
      _level:    level
    }, msg.profile_id || config?.profileId);

    return;
  }

  // ─────────────────────────────────────────────────────────────────────
  // IonPump DOM commands — forward a content.js en la tab
  // ─────────────────────────────────────────────────────────────────────
  const DOM_COMMANDS = [
    'DOM_CLICK', 'DOM_TYPE', 'DOM_WAIT',
    'DOM_FOCUS', 'DOM_SCROLL', 'DOM_EXTRACT',
    'DOM_NAVIGATE',
    'DOM_WATCH',
    'DOM_WATCH_URL',
    'DOM_UNWATCH'
  ];

  if (DOM_COMMANDS.includes(msg.command)) {
    const tabId = msg.tab_id;

    if (!tabId) {
      console.warn('[IonPump] ⚠️ DOM command sin tab_id:', msg.command);
      return;
    }

    console.log('[IonPump] DOM →', msg.command, 'tab:', tabId);

    chrome.tabs.sendMessage(tabId, msg, (response) => {
      if (response) {
        sendToHost({
          event:     'DOM_COMMAND_ACK',
          command:   msg.command,
          tab_id:    tabId,
          response:  response,
          timestamp: Date.now()
        });
      }
    });

    return;
  }

  // NOTA: se eliminó acá un handler duplicado/muerto para msg.event === 'ACCOUNT_REGISTERED'.
  // Vivía en handleHostMessage (canal HOST → extension) y hacía sendToHost(ACCOUNT_REGISTERED)
  // — si el host alguna vez devolvía este evento en vez de su _ACK, la extensión se lo reenviaba
  // de vuelta al host en loop. Nunca se disparaba en el flujo real, pero era código muerto
  // peligroso. El único handler legítimo de ACCOUNT_REGISTERED es el registrado vía
  // registerHandler() en registerOnboardingHandlers() (canal EXTENSION-interno,
  // discovery.js → background.js), más abajo en este archivo.

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

  // Onboarding navigate
  if (msg.command === 'onboarding_navigate') {
    chrome.tabs.query({ url: chrome.runtime.getURL('discovery/index.html') }, (tabs) => {
      if (!tabs || tabs.length === 0) {
        console.warn('[BG] onboarding_navigate: no discovery tab found');
        return;
      }
      chrome.tabs.sendMessage(tabs[0].id, {
        command: 'onboarding_navigate',
        payload: msg.payload || msg
      });
    });
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

    case 'keepalive':
      // Silently acknowledge host keepalive
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

// ---------------------------------------------------------------------------
// Schema-aware handler registry
// ---------------------------------------------------------------------------
const REGISTERED_HANDLERS = {};

/**
 * registerHandler(eventName, schema, handlerFn)
 *
 * Registra un handler para un evento específico. Antes de invocar handlerFn,
 * aplica los defaults declarados en el schema para cualquier campo ausente
 * en el mensaje entrante.
 *
 * @param {string}   eventName  - Nombre del evento (ej: "ACCOUNT_REGISTERED")
 * @param {object}   schema     - Objeto con { parameters: [ { name, default? } ] }
 *                                Típicamente: discoverySchema.messages.find(m => m.id === ...)
 * @param {Function} handlerFn  - function(msg, sender, sendResponse) => bool|void
 *                                Mismo contrato que chrome.runtime.onMessage listener.
 *                                Debe retornar `true` si la respuesta es async.
 */
function registerHandler(eventName, schema, handlerFn) {
  REGISTERED_HANDLERS[eventName] = { schema, handlerFn };
}

/**
 * applySchemaDefaults(msg, schema)
 *
 * Retorna una copia shallow de msg con los defaults del schema aplicados
 * para los campos que estén ausentes (undefined o null).
 * No muta el mensaje original.
 */
function applySchemaDefaults(msg, schema) {
  if (!schema || !Array.isArray(schema.parameters)) return msg;

  const patched = Object.assign({}, msg);
  for (const param of schema.parameters) {
    if (param.default !== undefined && patched[param.name] == null) {
      patched[param.name] = param.default;
    }
  }
  return patched;
}

// ============================================================================
// SCHEMA LOADER — Harness Protocol Single Source of Truth
// Carga los JSON schemas desde el bundle de la extensión y registra los
// handlers que los consumen. Esto reemplaza la dependencia de los manifests
// JS para los eventos migrados.
// ============================================================================

let discoverySchema = null;

async function loadProtocolSchemas() {
  try {
    const r = await fetch(chrome.runtime.getURL('protocols/discovery.schema.json'));
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    discoverySchema = await r.json();
    console.log('[Synapse] ✓ discovery.schema.json cargado');
    registerOnboardingHandlers();
  } catch (err) {
    console.error('[Synapse] ✗ Error cargando discovery.schema.json:', err);
  }
}

/**
 * updateAccountInProfileState(service, username, timestamp)
 *
 * Actualiza chrome.storage.local.bloom_profile_state marcando la cuenta
 * `service` como conectada. Mismo shape que discovery.js#_updateAccountState.
 *
 * 🔧 FIX: discovery.js solo escribe bloom_profile_state cuando el flujo de
 * confirmación de token corre DENTRO de su propia UI (popup de onboarding).
 * Pero ACCOUNT_REGISTERED también puede llegar acá directamente desde una
 * fuente externa (native host confirmando por su cuenta, o el harness de
 * testing) sin que discovery.js haya corrido ese código. En ese caso, antes
 * de este fix, nadie escribía bloom_profile_state y Landing quedaba con el
 * checklist inicial en "pending" para siempre. Este handler ahora escribe
 * el storage él mismo, sea cual sea el origen del evento.
 */
async function updateAccountInProfileState(service, username, timestamp) {
  if (!service) return;
  try {
    const result = await chrome.storage.local.get('bloom_profile_state');
    const state = result.bloom_profile_state || { accounts: [] };
    if (!Array.isArray(state.accounts)) state.accounts = [];

    const account = state.accounts.find(a => a.provider === service);
    if (account) {
      account.status     = 'connected';
      account.username   = username || account.username || null;
      account.created_at = timestamp || Date.now();
    } else {
      state.accounts.push({
        provider:   service,
        status:     'connected',
        username:   username || null,
        email:      null,
        created_at: timestamp || Date.now()
      });
    }
    state.last_updated = Date.now();

    await chrome.storage.local.set({ bloom_profile_state: state });
    console.log('[Synapse] bloom_profile_state — cuenta actualizada desde background.js:', service, username || '(sin username)');
  } catch (err) {
    console.error('[Synapse] Error actualizando bloom_profile_state en ACCOUNT_REGISTERED:', err);
  }
}

function registerOnboardingHandlers() {
  const accountRegisteredSchema = discoverySchema?.messages?.find(
    m => m.id === 'account_registered'
  );

  registerHandler('ACCOUNT_REGISTERED', accountRegisteredSchema, (msg, sender, sendResp) => {
    if (!msg.profile_id || !msg.launch_id) {
      console.warn('[Synapse] ⚠️ ACCOUNT_REGISTERED enviado sin profile_id/launch_id');
    }

    console.log('[Synapse] ✓ ACCOUNT_REGISTERED recibido desde discovery.js — service:', msg.service);

    // 🔧 FIX: escribir bloom_profile_state acá, independientemente de si el
    // origen fue discovery.js (UI local) o una fuente externa (native host,
    // harness). Ver comentario de updateAccountInProfileState() arriba.
    updateAccountInProfileState(msg.service, msg.username, msg.timestamp);

    forwardToDebugPanel('synapse', 'ACCOUNT_REGISTERED', {
      _dir:              'in',
      service:           msg.service           || null,
      username:          msg.username          || null,
      token_fingerprint: msg.token_fingerprint || null,
      profile_id:        msg.profile_id        || config?.profileId,
      launch_id:         msg.launch_id         || config?.launchId,
    });

    // 1. Forwarding del milestone al host → MilestoneReactor → Landing
    sendToHost({
      event:             'ACCOUNT_REGISTERED',
      service:           msg.service,
      username:          msg.username          || '',
      token_fingerprint: msg.token_fingerprint || '',
      profile_id:        msg.profile_id        || config?.profileId,
      launch_id:         msg.launch_id         || config?.launchId,
      timestamp:         msg.timestamp         || Date.now(),
    });

    sendResp({ received: true });

    // 🔧 FIX: _internal:true evita que este mismo broadcast, al llegar de vuelta al propio
    // chrome.runtime.onMessage.addListener (línea ~1105), vuelva a matchear REGISTERED_HANDLERS
    // y re-ejecute este handler (que volvería a llamar sendToHost + volvería a broadcastear:
    // auto-loop sin corte, sin guard). El dispatcher ahora salta REGISTERED_HANDLERS cuando ve
    // _internal:true, pero el mensaje sigue llegando a otros listeners de la extensión
    // (popup, content scripts) que sí lo necesiten.
    chrome.runtime.sendMessage({
      event: 'ACCOUNT_REGISTERED',
      _internal: true,
      service: msg.service,
      username: msg.username || '',
      token_fingerprint: msg.token_fingerprint || '',
      profile_id: msg.profile_id || config?.profileId,
      launch_id: msg.launch_id || config?.launchId,
    }).catch(() => {});

    return true;
  });

  // ── GITHUB_APP_AUTHORIZED ──────────────────────────────────────────────
  // Reemplaza el guard `if (msg.service === 'github')` que vivía dentro del
  // handler de ACCOUNT_REGISTERED. GitHub ya no emite ACCOUNT_REGISTERED —
  // el evento real tras el Device Flow de la GitHub App es
  // GITHUB_APP_AUTHORIZED (ver background-github-device-flow.js). Sin este
  // handler, VAULT_INITIALIZED nunca se disparaba y el onboarding quedaba
  // colgado en el step vault_init.
  registerHandler('GITHUB_APP_AUTHORIZED', null, (msg, sender, sendResp) => {
    reactToGithubAppAuthorized(msg);
    sendResp({ received: true });
    return true;
  });
}

// ── reactToGithubAppAuthorized ─────────────────────────────────────────────
// Extraído del registerHandler de arriba para poder invocarse por llamada
// directa desde background-github-device-flow.js, que corre en el MISMO
// frame que este dispatcher (se importa dentro de este mismo service
// worker). chrome.runtime.sendMessage nunca entrega al frame que originó
// el mensaje (comportamiento documentado de Chrome: "fired in every frame
// of your extension except for the sender's frame"), así que el
// registerHandler de arriba NUNCA se dispara para el GITHUB_APP_AUTHORIZED
// real que emite el device flow — solo se dispararía si algún día llegara
// desde un frame distinto. Se deja registrado por las dudas, pero la
// llamada real tiene que ser directa. Ver handleAuthorized() en
// background-github-device-flow.js.
function reactToGithubAppAuthorized(msg) {
  console.log('[Synapse] ✓ GITHUB_APP_AUTHORIZED recibido — user:', msg.username);

  updateAccountInProfileState('github', msg.username, msg.timestamp);

  const vaultKey = msg.token_fingerprint || 'sk_bloom_github_app';

  sendToHost({
    event:      'VAULT_INITIALIZED',
    vault_key:  vaultKey,
    scopes:     msg.scopes,
    profile_id: msg.profile_id || config?.profileId,
    launch_id:  msg.launch_id  || config?.launchId,
    timestamp:  Date.now()
  });

  chrome.runtime.sendMessage({
    event:             'VAULT_INITIALIZED',
    vault_key:         vaultKey,
    token_fingerprint: msg.token_fingerprint,
    profile_id:        msg.profile_id || config?.profileId,
    launch_id:         msg.launch_id  || config?.launchId,
  }).catch(() => {});

  console.log('[Synapse] ✓ VAULT_INITIALIZED → forwarding to native host (desde GITHUB_APP_AUTHORIZED)');
}

// ============================================================================
// GOOGLE LOGIN WATCHER — detección pasiva de fin de login
// No lee el DOM de Google, no hace clics, no automatiza nada. Solo compara
// la URL de la pestaña observada contra dos listas: hosts terminales
// (login real completo) y paths intermedios (todavía dentro del propio
// flujo de login de Google, no cuenta como "llegó").
// Se registra scoped a UN tabId puntual — la pestaña que el propio usuario
// abrió desde el botón "Open Google" — y se autodesregistra apenas dispara
// o cuando la tab se cierra, para no dejar listeners húérfanos acumulándose
// en sesiones largas.
// ============================================================================

const GOOGLE_TERMINAL_HOSTS = ['myaccount.google.com', 'mail.google.com'];
const GOOGLE_INTERMEDIATE_PATTERNS = ['/speedbump', '/oauth2', '/ServiceLogin', '/signin/', '/o/oauth2'];

const googleLoginWatchers = new Map(); // tabId -> { onUpdated, onRemoved, timeoutId }

function isGoogleIntermediateUrl(urlStr) {
  try {
    const u = new URL(urlStr);
    return GOOGLE_INTERMEDIATE_PATTERNS.some(p => u.pathname.includes(p));
  } catch (_) {
    return false;
  }
}

function isGoogleTerminalUrl(urlStr) {
  try {
    const u = new URL(urlStr);
    return GOOGLE_TERMINAL_HOSTS.includes(u.hostname) && !isGoogleIntermediateUrl(urlStr);
  } catch (_) {
    return false;
  }
}

function stopWatchingGoogleTab(tabId) {
  const watcher = googleLoginWatchers.get(tabId);
  if (!watcher) return;
  chrome.tabs.onUpdated.removeListener(watcher.onUpdated);
  chrome.tabs.onRemoved.removeListener(watcher.onRemoved);
  clearTimeout(watcher.timeoutId);
  googleLoginWatchers.delete(tabId);
}

function watchGoogleLoginTab(tabId) {
  // Si ya había un watcher para esta tab (doble click en "Open Google"),
  // reemplazarlo en vez de acumular listeners duplicados.
  stopWatchingGoogleTab(tabId);

  console.log('[GoogleWatcher] Observando pasivamente tab', tabId);

  const onUpdated = (updatedTabId, changeInfo) => {
    if (updatedTabId !== tabId || !changeInfo.url) return;

    if (isGoogleTerminalUrl(changeInfo.url)) {
      const hostname = new URL(changeInfo.url).hostname;
      console.log('[GoogleWatcher] ✓ Host terminal detectado:', hostname);

      chrome.runtime.sendMessage({
        event: 'GOOGLE_LOGIN_DETECTED',
        tabId,
        detected_host: hostname,
        profile_id: config?.profileId,
        launch_id: config?.launchId,
        timestamp: Date.now()
      }).catch(() => {});

      forwardToDebugPanel('sentinel', 'GOOGLE_LOGIN_DETECTED', { detected_host: hostname, tabId }, config?.profileId);

      stopWatchingGoogleTab(tabId);
    }
  };

  const onRemoved = (removedTabId) => {
    if (removedTabId !== tabId) return;
    console.log('[GoogleWatcher] Tab cerrada antes de detectar login — watcher liberado');
    stopWatchingGoogleTab(tabId);
  };

  // Timeout de cortesía: si el usuario abandona el login, no dejar el
  // listener vivo para siempre.
  const timeoutId = setTimeout(() => {
    console.log('[GoogleWatcher] Timeout sin detección — watcher liberado (tab', tabId + ')');
    stopWatchingGoogleTab(tabId);
  }, 10 * 60 * 1000); // 10 minutos

  chrome.tabs.onUpdated.addListener(onUpdated);
  chrome.tabs.onRemoved.addListener(onRemoved);
  googleLoginWatchers.set(tabId, { onUpdated, onRemoved, timeoutId });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResp) => {
  const { event, command } = msg;

  // --- Registered handler dispatch (Harness Protocol SSoT) ---
  // Chequear primero; si el evento está registrado, despachar y retornar.
  // Los handlers registrados reciben el mensaje con defaults de schema aplicados.
  // 🔧 FIX: mensajes marcados _internal:true son auto-broadcasts de un registered handler
  // hacia el resto de la extensión (popup, content scripts) — NO deben re-entrar al dispatch
  // de REGISTERED_HANDLERS, o el handler se re-ejecuta a sí mismo en loop (ver
  // registerOnboardingHandlers → ACCOUNT_REGISTERED).
  const _registeredEvent = msg.event || msg.command;
  if (_registeredEvent && !msg._internal && REGISTERED_HANDLERS[_registeredEvent]) {
    const { schema, handlerFn } = REGISTERED_HANDLERS[_registeredEvent];
    const patchedMsg = applySchemaDefaults(msg, schema);
    const _asyncResult = handlerFn(patchedMsg, sender, sendResp);
    // Preservar el contrato `return true` para canales async
    if (_asyncResult === true) return true;
    return;
  }
  // --- Fin registered handler dispatch ---
  // (el if-chain existente continúa sin modificaciones a partir de aquí)

  // ── HARNESS: simular handshake completo sin native host ─────────────────
  if (event === 'HARNESS_SIMULATE_HANDSHAKE') {
    handshakeState = 'CONFIRMED';
    connectionState = 'CONNECTED';
    chrome.storage.local.set({
      synapseStatus: {
        command: 'system_ready',
        payload: {
          handshake_confirmed: true,
          profile_id: msg.profile_id || config?.profileId,
          launch_id:  msg.launch_id  || config?.launchId,
          timestamp:  Date.now()
        }
      }
    });
    console.log('[Harness] ✓ HARNESS_SIMULATE_HANDSHAKE — handshakeState forzado a CONFIRMED');
    forwardToDebugPanel('synapse', 'HANDSHAKE_CONFIRMED', { _simulated: true }, config?.profileId);
    chrome.runtime.sendMessage({ event: 'HANDSHAKE_CONFIRMED', timestamp: Date.now() }).catch(() => {});
    sendResp({ received: true, handshakeState });
    return true;
  }
  // ── HARNESS: abrir landing tab directamente ──────────────────────────────
  if (event === 'HARNESS_OPEN_LANDING') {
    openLandingTab();
    sendResp({ received: true });
    return true;
  }

  // ── AWAITING_HUMAN_AUTH ───────────────────────────────────────────────────
  // discovery.js pide observar pasivamente una tab que EL USUARIO ya abrió y
  // está operando a mano (login de Google). No hay automatización de login
  // acá — solo se mira a qué hostname termina llegando esa tab puntual.
  if (event === 'AWAITING_HUMAN_AUTH' && msg.service === 'google' && msg.tabId) {
    watchGoogleLoginTab(msg.tabId);
    sendResp({ received: true });
    return true;
  }

  // ── TEST_HANDSHAKE_ANIMATION ──────────────────────────────────────────────
  // Comando manual de QA/demo. La animación en sí la corre discovery.js
  // (replayHandshakeAnimationForTesting) — acá solo la reenviamos a la tab.
  if (event === 'TEST_HANDSHAKE_ANIMATION') {
    chrome.tabs.query({ url: chrome.runtime.getURL('discovery/index.html') }, (tabs) => {
      tabs.forEach(t => chrome.tabs.sendMessage(t.id, { event: 'TEST_HANDSHAKE_ANIMATION' }).catch(() => {}));
    });
    sendResp({ received: true });
    return true;
  }

  // Harness: handshake de buffer — la tab del Harness recién abierta pide
  // "decime todo lo que me perdí" y le contestamos con harnessLogBuffer.
  // Resuelve la condición de carrera donde HANDSHAKE_CONFIRMED, EXTENSION_LOADED,
  // etc. se emiten antes de que openHarnessTab() haya terminado de cargar la página.
  if (event === 'HARNESS_HELLO') {
    sendResp({ event: 'HARNESS_REPLAY', entries: harnessLogBuffer.slice() });
    return true;
  }

  // Landing: profile_load
  if (command === 'profile_load') {
    console.log('[Synapse] Landing → PROFILE_LOAD');
    sendToHost({
      command:    'PROFILE_LOAD',
      profile_id: msg.profile_id || config?.profileId,
      launch_id:  msg.launch_id  || config?.launchId,
      timestamp:  Date.now()
    });
    sendResp({ received: true });
    return true;
  }

  // Landing: health_check
  if (command === 'health_check') {
    console.log('[Synapse] Landing → HEALTH_CHECK (scope:', msg.scope || 'full-stack', ')');
    sendToHost({
      command:    'HEALTH_CHECK',
      scope:      msg.scope || 'full-stack',
      profile_id: config?.profileId,
      launch_id:  config?.launchId,
      timestamp:  Date.now()
    });
    sendResp({ received: true });
    return true;
  }

  // Landing: nucleus_sync
  if (command === 'nucleus_sync') {
    console.log('[Synapse] Landing → NUCLEUS_SYNC');
    sendToHost({
      command:    'NUCLEUS_SYNC',
      profile_id: config?.profileId,
      launch_id:  config?.launchId,
      timestamp:  Date.now()
    });
    sendResp({ received: true });
    return true;
  }

  // Landing: intent_list
  if (command === 'intent_list') {
    console.log('[Synapse] Landing → INTENT_LIST');
    sendToHost({
      command:    'INTENT_LIST',
      profile_id: config?.profileId,
      launch_id:  config?.launchId,
      timestamp:  Date.now()
    });
    sendResp({ received: true });
    return true;
  }

  // Handler genérico para landing — fallback
  if (msg.action === 'executeBrainCommand') {
    console.log('[Synapse] Brain command received (fallback):', msg.command);
    
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

  if (msg.action === 'ping') {
    sendResp({ 
      status: 'pong',
      connection_state: connectionState,
      handshake_state: handshakeState
    });
    return true;
  }

  if (msg.action === 'checkHost') {
    sendResp({ 
      hostConnected: connectionState === 'CONNECTED',
      connection_state: connectionState,
      handshake_state: handshakeState,
      handshake_confirmed: handshakeState === 'CONFIRMED'
    });
    return true;
  }

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
    // Notificar al debug panel que Sentinel está activo en una tab
    forwardToDebugPanel('sentinel', 'EXTENSION_LOADED', {
      tab_id: sender.tab?.id,
      url:    msg.url
    }, config?.profileId);
    sendResp({ received: true });
    return true;
  }

  // Slave mode
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
    forwardToDebugPanel('synapse', 'DISCOVERY_COMPLETE', {
      steps_done: msg.payload?.steps_done || msg.steps_done || null
    }, config?.profileId);
    sendResp({ received: true });
    return true;
  }

  // ── GITHUB_PAT_DETECTED ────────────────────────────────────────────────────
  // ELIMINADO A PROPÓSITO. Este handler reenviaba un token completo al host
  // nativo con solo con validar que empezara con "ghp_" — cualquier mensaje
  // interno con ese shape hubiera sido reenviado sin verificar de dónde salió
  // el token ni pedir confirmación del usuario. Su única fuente real era el
  // monitor de portapapeles (ver CLEANUP_NOTES.md), que también se eliminó.
  // El único camino soportado para tokens de GitHub ahora es el Device Flow
  // en background-github-device-flow.js, que ya emite GITHUB_APP_AUTHORIZED
  // con el token viajando solo dentro del service worker hacia el host.

  // ── GITHUB_TOKEN_STORED ────────────────────────────────────────────────────
  // CORREGIDO (ver HARNESS_SOURCE_OF_TRUTH): el handler de ACCOUNT_REGISTERED NO emite
  // este evento internamente — eso nunca estuvo implementado, era deuda documental.
  // discovery.js tampoco lo emite en el flujo de GithubAuthFlow._saveToken() (solo emite
  // ACCOUNT_REGISTERED). Este handler solo se dispara si algún OTRO caller (Harness/simulación,
  // o un content script fuera de este repo) manda chrome.runtime.sendMessage con este evento.
  // Si en producción nunca ves este log, es señal de que nadie lo está emitiendo realmente.
  if (event === 'GITHUB_TOKEN_STORED') {
    console.log('[Synapse] 📥 GITHUB_TOKEN_STORED recibido');

    sendToHost({
      event:             'GITHUB_TOKEN_STORED',
      token_fingerprint: msg.token_fingerprint,
      profile_id:        msg.profile_id  || config?.profileId,
      launch_id:         msg.launch_id   || config?.launchId,
      timestamp:         msg.timestamp   || Date.now()
    });

    chrome.runtime.sendMessage({
      event: 'GITHUB_TOKEN_STORED',
      token_fingerprint: msg.token_fingerprint,
      profile_id: msg.profile_id || config?.profileId,
      launch_id: msg.launch_id || config?.launchId,
    }).catch(() => {});

    console.log('[Synapse] ✓ GITHUB_TOKEN_STORED → forwarding to native host');

    // ── VAULT_INITIALIZED ──────────────────────────────────────────────────
    // MOVIDO (HANDOFF-fix-vault-onboarding, sección 3): este bloque emitía
    // VAULT_INITIALIZED colgado de GITHUB_TOKEN_STORED, un evento que nadie
    // dispara en producción — por eso el vault nunca se confirmaba. La
    // emisión real ahora vive en el handler de ACCOUNT_REGISTERED (arriba,
    // línea ~1104), guardada por service === 'github'. Este bloque queda
    // muerto a propósito; no se elimina el handler GITHUB_TOKEN_STORED en sí
    // porque el Harness/simulación puede seguir emitiéndolo para testing.

    sendResp({ received: true });
    return true;
  }

  // ── GITHUB_ACCOUNT_CREATED ─────────────────────────────────────────────────
  if (event === 'GITHUB_ACCOUNT_CREATED') {
    console.log('[Synapse] 📥 GITHUB_ACCOUNT_CREATED recibido — username:', msg.username);

    // 🔧 FIX: mismo problema que ACCOUNT_REGISTERED — este handler nunca
    // escribía bloom_profile_state. Ver updateAccountInProfileState() arriba.
    updateAccountInProfileState('github', msg.username, msg.timestamp);

    sendToHost({
      event:      'GITHUB_ACCOUNT_CREATED',
      username:   msg.username,
      profile_id: msg.profile_id || config?.profileId,
      launch_id:  msg.launch_id  || config?.launchId,
      timestamp:  Date.now()
    });

    forwardToDebugPanel('synapse', 'GITHUB_ACCOUNT_CREATED', {
      username: msg.username
    }, msg.profile_id || config?.profileId);

    // 🔧 FIX: a diferencia de GITHUB_TOKEN_STORED y ACCOUNT_REGISTERED, este
    // handler nunca reenviaba el evento hacia el resto de la extensión —
    // solo lo mandaba al native host. Landing (setupMessageListener) escucha
    // explícitamente 'GITHUB_ACCOUNT_CREATED' para refrescar accounts-list en
    // caliente; sin este broadcast, ese listener nunca se disparaba.
    chrome.runtime.sendMessage({
      event: 'GITHUB_ACCOUNT_CREATED',
      username: msg.username,
      profile_id: msg.profile_id || config?.profileId,
      launch_id: msg.launch_id || config?.launchId,
    }).catch(() => {});

    console.log('[Synapse] ✓ GITHUB_ACCOUNT_CREATED → forwarding to native host');
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

  // Window layout request
  if (command === 'window_layout_request' && msg.layout) {
    console.log('[Synapse] Window layout request received:', msg.layout);
    applyWindowLayout(msg.layout).then(() => {
      sendResp({ received: true, layout: msg.layout });
    });
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

  // NOTA DE SEGURIDAD: se eliminaron acá los handlers 'checkClipboard',
  // 'startClipboardMonitoring' y 'stopClipboardMonitoring'. Ver
  // CLEANUP_NOTES.md — el permiso 'clipboardRead' ya no existe en el
  // manifest, así que estos handlers habrían fallado en runtime igual,
  // pero se eliminan del código para que no quede la superficie disponible
  // si alguna vez se reintroduce el permiso por error.

  // ─────────────────────────────────────────────────────────────────────
  // IONPUMP COMMAND HANDLERS — Harness → background → Brain/IonPump
  // ─────────────────────────────────────────────────────────────────────

  if (command === 'ION_EXECUTE_FLOW') {
    console.log('[IonPump] ▶ ION_EXECUTE_FLOW:', msg.site, '/', msg.flow);

    sendToHost({
      command:   'ION_EXECUTE_FLOW',
      site:      msg.site,
      flow:      msg.flow,
      tab_id:    msg.tab_id,
      launch_id: msg.launch_id || config?.launchId,
      context:   msg.context   || {}
    });

    // Registrar en el debug panel que se disparó un flow
    forwardToDebugPanel('brain', 'ION_FLOW_STARTED', {
      site:      msg.site,
      flow:      msg.flow,
      tab_id:    msg.tab_id,
      launch_id: msg.launch_id || config?.launchId
    }, config?.profileId);

    sendResp({ received: true });
    return true;
  }

  if (command === 'ION_RELOAD') {
    console.log('[IonPump] 🔄 ION_RELOAD:', msg.site);

    sendToHost({
      command:   'ION_RELOAD',
      site:      msg.site,
      launch_id: config?.launchId,
      timestamp: Date.now()
    });

    sendResp({ received: true });
    return true;
  }

  if (command === 'ION_INSPECT') {
    console.log('[IonPump] 🔍 ION_INSPECT');

    sendToHost({
      command:   'ION_INSPECT',
      launch_id: msg.launch_id || config?.launchId,
      timestamp: Date.now()
    });

    sendResp({ received: true });
    return true;
  }

  return false;
});

// ============================================================================
// UTILS
// ============================================================================

export { sendToHost, config, reactToGithubAppAuthorized };

function sendToHost(msg) {
  if (nativePort && connectionState === 'CONNECTED') {
    if (handshakeState !== 'CONFIRMED' && handshakeState !== 'HOST_READY') {
      console.warn('[Synapse] ⚠️ Message blocked - Handshake not confirmed:', msg.event || msg.type);
      return;
    }

    const label = msg.event || msg.command || msg.type || '(unknown)';
    console.log(`[Synapse → Host] [${new Date().toISOString()}] ${label}`, msg);

    // ── Harness: reportar cada mensaje saliente al host ───────────────────────
    // Excluir HEARTBEAT (ruido de keepalive) y tokens completos (seguridad).
    // El Harness ve el label, la dirección, y el payload sanitizado.
    const _skipHarnessLog = label === 'HEARTBEAT' || label === 'keepalive';
    if (!_skipHarnessLog) {
      const _safePayload = { ...msg };
      if (_safePayload.token) _safePayload.token = _safePayload.token.substring(0, 10) + '…';
      if (_safePayload.key)   _safePayload.key   = _safePayload.key.substring(0, 10) + '…';
      forwardToDebugPanel(
        'synapse',
        `→HOST:${label}`,
        { _dir: 'out', payload: _safePayload }
      );
    }
    // ─────────────────────────────────────────────────────────────────────────

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
  chrome.alarms.create('keepalive', { periodInMinutes: 1 });

  chrome.alarms.onAlarm.addListener((a) => {
    if (a.name !== 'keepalive') return;

    console.log(`[Synapse] [${new Date().toISOString()}] Keepalive tick - Handshake: ${handshakeState} | Connection: ${connectionState}`);

    if (handshakeState === 'CONFIRMED' && connectionState === 'CONNECTED') {
      sendToHost({
        event: 'HEARTBEAT',
        profile_id: config?.profileId,
        launch_id: config?.launchId,
        timestamp: Date.now(),
        status: 'alive'
      });
      console.log(`[Synapse] [${new Date().toISOString()}] Heartbeat sent — profile: ${config?.profileId}`);
    } else {
      console.warn('[Synapse] ⚠️ Heartbeat skipped - channel not ready (handshake:', handshakeState, ')');
    }
  });
}

// ============================================================================
// [ELIMINADO] CLIPBOARD API KEY DETECTOR
//
// Este bloque monitoreaba el portapapeles del sistema cada 1s, detectaba
// API keys de Gemini/Claude/OpenAI/xAI/GitHub por regex, y reenviaba el
// secreto COMPLETO a un host nativo y a un endpoint HTTP local — antes de
// avisarle al usuario. Ese patrón (vigilancia pasiva + exfiltración
// silenciosa de credenciales de terceros) es indistinguible del de un
// infostealer, independientemente del destino final ("Bloom Vault").
//
// Se eliminó por completo, no se reemplaza. Si en el futuro Bloom necesita
// guardar una API key en el Vault, el flujo correcto es: el usuario la pega
// explícitamente en un campo de un formulario de Bloom (acción humana
// consciente, con contexto de qué se está guardando y para qué), nunca por
// detección pasiva de clipboard o DOM. Ver CLEANUP_NOTES.md.
// ============================================================================

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

initialize();

chrome.runtime.onSuspend?.addListener(() => {
  console.log('[Synapse] 💤 Service worker suspending');
});
