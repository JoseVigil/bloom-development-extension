// ============================================================================
// BLOOM NUCLEUS: SYNAPSE ACTUATOR v2.3 (content.js)
// Filosofía: Músculo ciego. Ejecuta comandos primitivos sin pensar.
//
// CHANGELOG v2.3
// Agrega handlers explícitos para IONPUMP_PROTOCOL_MANIFEST v2.0:
//   DOM_FOCUS   — foco en elemento sin click ni typing (handler propio)
//   DOM_EXTRACT — alias explícito de DOM_READ (Brain/IonPump usa este nombre)
//
// CHANGELOG v2.2
// Agrega soporte para Ion SDK v2.0:
//   DOM_NAVIGATE  — navegación a URL con espera de load event
//   DOM_WATCH     — MutationObserver para signals de página (Ion page descriptors)
//   DOM_WATCH_URL — detecta cambios de URL en SPAs (pushState + popstate)
//   DOM_UNWATCH   — limpia todos los observers activos al salir de página
//
// Sin cambios en comandos existentes. Retrocompatible con v2.2.
// ============================================================================

console.log("⚡ [Synapse Actuator] Injected");

// ============================================================================
// SLAVE MODE (UI Lock) - CON TIMEOUT DE SEGURIDAD
// ============================================================================

const SLAVE_OVERLAY_ID = 'bloom-slave-overlay';
const SLAVE_MODE_TIMEOUT_MS = 30000;

let isSlaveMode = false;
let slaveModeTimer = null;
let lastCommandTimestamp = 0;

function enableSlaveMode(message = "🤖 BLOOM AI OPERATING") {
  if (isSlaveMode) {
    resetSlaveModeTimer();
    return;
  }

  console.log("[Actuator] Slave mode: ENABLED");

  document.body.style.pointerEvents = 'none';
  document.body.style.userSelect = 'none';

  const overlay = document.createElement('div');
  overlay.id = SLAVE_OVERLAY_ID;
  overlay.innerHTML = `
    <div style="
      position: fixed; top: 0; left: 0;
      width: 100vw; height: 100vh;
      background: rgba(0,0,0,0.15);
      backdrop-filter: grayscale(80%) blur(1.5px);
      z-index: 2147483647;
      display: flex; align-items: center; justify-content: center;
      font-family: 'SF Mono', monospace;
      pointer-events: none;
    ">
      <div style="
        background: rgba(0,0,0,0.95);
        padding: 24px 32px; border-radius: 12px;
        border: 2px solid #00ff88;
        box-shadow: 0 0 30px rgba(0,255,136,0.4);
        text-align: center;
      ">
        <div style="
          display: flex; align-items: center; gap: 12px;
          color: #00ff88; font-size: 18px; font-weight: bold;
          letter-spacing: 1px; margin-bottom: 12px;
        ">
          <div style="
            width: 12px; height: 12px;
            background: #00ff88; border-radius: 50%;
            animation: bloom-pulse 1.5s infinite;
          "></div>
          ${message}
        </div>
        <div style="font-size: 12px; color: rgba(255,255,255,0.6); letter-spacing: 0.5px;">
          Do not touch the keyboard or mouse...
        </div>
      </div>
    </div>
    <style>
      @keyframes bloom-pulse {
        0%, 100% { opacity: 1; transform: scale(1); }
        50%       { opacity: 0.3; transform: scale(0.85); }
      }
    </style>
  `;

  document.body.appendChild(overlay);
  isSlaveMode = true;
  lastCommandTimestamp = Date.now();
  resetSlaveModeTimer();

  chrome.runtime.sendMessage({ event: "slave_mode_changed", enabled: true });
}

function disableSlaveMode() {
  if (!isSlaveMode) return;

  console.log("[Actuator] Slave mode: DISABLED");

  document.body.style.pointerEvents = '';
  document.body.style.userSelect = '';

  const overlay = document.getElementById(SLAVE_OVERLAY_ID);
  if (overlay) overlay.remove();

  if (slaveModeTimer) {
    clearTimeout(slaveModeTimer);
    slaveModeTimer = null;
  }

  isSlaveMode = false;
  chrome.runtime.sendMessage({ event: "slave_mode_changed", enabled: false });
}

function resetSlaveModeTimer() {
  if (slaveModeTimer) clearTimeout(slaveModeTimer);

  slaveModeTimer = setTimeout(() => {
    console.warn("[Actuator] ⚠️ TIMEOUT DE SEGURIDAD - Auto-liberando slave mode");
    const timeSinceLastCommand = Date.now() - lastCommandTimestamp;
    chrome.runtime.sendMessage({
      event: "slave_mode_timeout",
      time_since_last_command: timeSinceLastCommand,
      timestamp: Date.now()
    });
    disableSlaveMode();
  }, SLAVE_MODE_TIMEOUT_MS);

  console.log(`[Actuator] Timer reseteado (${SLAVE_MODE_TIMEOUT_MS}ms)`);
}

// ============================================================================
// COMANDOS EXISTENTES (sin cambios desde v2.1)
// ============================================================================

function executeClick(selector, options = {}) {
  const { multiple = false, waitVisible = true } = options;
  const elements = multiple
    ? document.querySelectorAll(selector)
    : [document.querySelector(selector)];

  if (!elements.length || !elements[0]) throw new Error(`Element not found: ${selector}`);

  let clickCount = 0;
  elements.forEach(el => {
    if (waitVisible && el.offsetParent === null) {
      console.warn(`[Actuator] Element not visible:`, el);
      return;
    }
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    el.click();
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
    clickCount++;
  });

  return { clicked: clickCount, selector };
}

function executeType(selector, text, options = {}) {
  const { clear = true, triggerEvents = true } = options;
  const el = document.querySelector(selector);
  if (!el) throw new Error(`Input not found: ${selector}`);

  el.focus();
  if (clear) el.value = '';
  el.value = text;

  if (triggerEvents) {
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  return { typed: text.length, selector };
}

function executeRead(selector, options = {}) {
  const { attribute = null, multiple = false } = options;
  const elements = multiple
    ? Array.from(document.querySelectorAll(selector))
    : [document.querySelector(selector)];

  if (!elements.length || !elements[0]) throw new Error(`Element not found: ${selector}`);

  const results = elements.map(el => {
    if (attribute) return el.getAttribute(attribute);
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return el.value;
    return el.innerText || el.textContent;
  });

  return multiple ? results : results[0];
}

function executeUpload(selector, files) {
  const input = document.querySelector(selector);
  if (!input) throw new Error(`File input not found: ${selector}`);
  if (input.tagName !== 'INPUT' || input.type !== 'file')
    throw new Error(`Element is not a file input: ${selector}`);

  const dataTransfer = new DataTransfer();
  files.forEach(f => {
    const blob = new Blob([f.content], { type: f.mime_type || 'text/plain' });
    dataTransfer.items.add(new File([blob], f.name, { type: f.mime_type }));
  });

  input.files = dataTransfer.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return { uploaded: files.length };
}

function executeScroll(target, options = {}) {
  const { behavior = 'smooth' } = options;
  let scrollOptions = { behavior };

  if (target === 'bottom')         scrollOptions.top = document.body.scrollHeight;
  else if (target === 'top')       scrollOptions.top = 0;
  else if (typeof target === 'number') scrollOptions.top = target;
  else if (typeof target === 'string') {
    const el = document.querySelector(target);
    if (!el) throw new Error(`Scroll target not found: ${target}`);
    el.scrollIntoView({ behavior });
    return { scrolled_to: target };
  }

  window.scrollTo(scrollOptions);
  return { scrolled_to: scrollOptions.top };
}

async function executeWait(selector, options = {}) {
  const { timeout = 10000, checkInterval = 500 } = options;
  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    const check = setInterval(() => {
      if (document.querySelector(selector)) {
        clearInterval(check);
        resolve({ found: true, selector });
      }
      if (Date.now() - startTime > timeout) {
        clearInterval(check);
        reject(new Error(`Timeout waiting for: ${selector}`));
      }
    }, checkInterval);
  });
}

function executeSnapshot(options = {}) {
  const { includeStyles = false, selector = 'body' } = options;
  const target = document.querySelector(selector);
  if (!target) throw new Error(`Snapshot target not found: ${selector}`);

  const snapshot = {
    url: window.location.href,
    title: document.title,
    html: target.innerHTML,
    text: target.innerText,
    timestamp: new Date().toISOString()
  };

  if (includeStyles) snapshot.computed_styles = window.getComputedStyle(target).cssText;
  return snapshot;
}

// ============================================================================
// NUEVOS COMANDOS — Ion SDK v2.0
// ============================================================================

// Registro de observers activos — keyed por signal name.
// DOM_UNWATCH los desconecta todos de una vez.
const activeWatchers = {};

// Interceptores de URL registrados — necesario para poder limpiarlos en DOM_UNWATCH.
let urlWatcherCleanup = null;

/**
 * DOM_NAVIGATE
 * Navega a una URL. Espera el evento 'load' antes de resolver.
 * IonPump corre DOM_WAIT del page descriptor inmediatamente después.
 *
 * payload: { url: string }
 */
async function executeNavigate(url) {
  return new Promise((resolve) => {
    // Esperamos el próximo load event — puede ser de la nueva página.
    window.addEventListener('load', function onLoad() {
      window.removeEventListener('load', onLoad);
      resolve({ navigated: true, url: window.location.href });
    }, { once: true });

    window.location.href = url;
  });
}

/**
 * DOM_WATCH
 * Registra un MutationObserver pasivo sobre document.body.
 * Cuando el selector aparece en el DOM, emite un SIGNAL hacia background.js.
 * Si once: true, se desconecta automáticamente tras disparar.
 *
 * payload: {
 *   selector: string,
 *   signal:   string,   — nombre del signal (ej: "token_generated")
 *   once:     boolean,
 *   priority: "normal" | "high"
 * }
 */
function executeWatch({ selector, signal, once = true, priority = 'normal' }) {
  // Si ya hay un watcher para este signal, desconectarlo primero.
  if (activeWatchers[signal]) {
    activeWatchers[signal].disconnect();
    delete activeWatchers[signal];
  }

  // Chequeo inicial — el elemento puede ya estar en el DOM.
  if (document.querySelector(selector)) {
    chrome.runtime.sendMessage({
      event: "SIGNAL",
      name: signal,
      priority,
      timestamp: Date.now()
    });
    // Si once, no registramos observer.
    if (once) return { watching: signal, fired_immediately: true };
  }

  const observer = new MutationObserver(() => {
    if (document.querySelector(selector)) {
      chrome.runtime.sendMessage({
        event: "SIGNAL",
        name: signal,
        priority,
        timestamp: Date.now()
      });
      if (once) {
        observer.disconnect();
        delete activeWatchers[signal];
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
  activeWatchers[signal] = observer;

  console.log(`[Actuator] DOM_WATCH registered: signal=${signal} selector=${selector}`);
  return { watching: signal };
}

/**
 * DOM_WATCH_URL
 * Intercepta pushState y el evento popstate para detectar navegaciones SPA
 * sin recarga de página completa.
 * Cuando la URL matchea uno de los patrones del page descriptor, emite PAGE_CHANGED.
 *
 * payload: {
 *   transitions: { [url_pattern: string]: page_name: string }
 *   — ej: { "*/settings/tokens*": "tokens_page", "*/login*": "login_page" }
 * }
 */
function executeWatchUrl({ transitions }) {
  // Limpiar watcher anterior si existe.
  if (urlWatcherCleanup) {
    urlWatcherCleanup();
    urlWatcherCleanup = null;
  }

  function matchesPattern(url, pattern) {
    // Convierte el glob simple (* como wildcard) en RegExp.
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    return new RegExp(escaped).test(url);
  }

  function checkUrl() {
    const currentUrl = window.location.href;
    for (const [pattern, pageName] of Object.entries(transitions)) {
      if (matchesPattern(currentUrl, pattern)) {
        chrome.runtime.sendMessage({
          event: "PAGE_CHANGED",
          new_page: pageName,
          url: currentUrl,
          timestamp: Date.now()
        });
        break;
      }
    }
  }

  // Interceptar pushState — History API (SPAs como GitHub).
  const origPushState = history.pushState;
  history.pushState = function (...args) {
    origPushState.apply(this, args);
    checkUrl();
  };

  const origReplaceState = history.replaceState;
  history.replaceState = function (...args) {
    origReplaceState.apply(this, args);
    checkUrl();
  };

  // Interceptar navegación con botones adelante/atrás del browser.
  window.addEventListener('popstate', checkUrl);

  // Guardar cleanup para DOM_UNWATCH.
  urlWatcherCleanup = () => {
    history.pushState = origPushState;
    history.replaceState = origReplaceState;
    window.removeEventListener('popstate', checkUrl);
    console.log('[Actuator] DOM_WATCH_URL cleaned up');
  };

  console.log(`[Actuator] DOM_WATCH_URL registered for ${Object.keys(transitions).length} patterns`);
  return { watching_url: true, patterns: Object.keys(transitions).length };
}

/**
 * DOM_UNWATCH
 * Desconecta todos los MutationObservers activos y limpia el URL watcher.
 * IonPump lo llama cuando el IonStateMachine finaliza o cambia de página.
 *
 * Sin payload.
 */
function executeUnwatch() {
  let disconnected = 0;

  for (const [signal, observer] of Object.entries(activeWatchers)) {
    observer.disconnect();
    delete activeWatchers[signal];
    disconnected++;
  }

  if (urlWatcherCleanup) {
    urlWatcherCleanup();
    urlWatcherCleanup = null;
  }

  console.log(`[Actuator] DOM_UNWATCH: ${disconnected} observers cleared`);
  return { unwatched: disconnected };
}

// ============================================================================
// MESSAGE ROUTER
// ============================================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { command, payload } = message;

  console.log(`🎯 [Actuator] Received: ${command}`, payload);

  (async () => {
    try {
      let result;

      if (isSlaveMode) {
        lastCommandTimestamp = Date.now();
        resetSlaveModeTimer();
        console.log(`[Actuator] Timer reseteado por comando: ${command}`);
      }

      switch (command) {

        // ── Control ────────────────────────────────────────────────────────
        case "LOCK_UI":
          enableSlaveMode(payload?.message);
          result = { locked: true };
          break;

        case "UNLOCK_UI":
          disableSlaveMode();
          result = { unlocked: true };
          break;

        // ── DOM existentes ─────────────────────────────────────────────────
        case "DOM_CLICK":
          result = executeClick(payload.selector, payload.options);
          break;

        case "DOM_TYPE":
          result = executeType(payload.selector, payload.text, payload.options);
          break;

        case "DOM_READ":
          result = executeRead(payload.selector, payload.options);
          break;

        // DOM_EXTRACT — alias de DOM_READ para compatibilidad con IONPUMP_PROTOCOL_MANIFEST v2.0
        // Brain/IonPump envía DOM_EXTRACT; content.js lo resuelve igual que DOM_READ.
        case "DOM_EXTRACT":
          result = executeRead(payload.selector, payload.options);
          break;

        case "DOM_UPLOAD":
          result = executeUpload(payload.selector, payload.files);
          break;

        case "DOM_SCROLL":
          result = executeScroll(payload.target, payload.options);
          break;

        // DOM_FOCUS — foco en un elemento sin click ni typing
        case "DOM_FOCUS": {
          const focusEl = document.querySelector(payload.selector);
          if (!focusEl) throw new Error(`Element not found: ${payload.selector}`);
          focusEl.focus();
          result = { focused: true, selector: payload.selector };
          break;
        }

        case "DOM_WAIT":
          result = await executeWait(payload.selector, payload.options);
          break;

        case "DOM_SNAPSHOT":
          result = executeSnapshot(payload.options);
          break;

        // ── Ion SDK v2.0 ───────────────────────────────────────────────────
        case "DOM_NAVIGATE":
          result = await executeNavigate(payload.url);
          break;

        case "DOM_WATCH":
          result = executeWatch(payload);
          break;

        case "DOM_WATCH_URL":
          result = executeWatchUrl(payload);
          break;

        case "DOM_UNWATCH":
          result = executeUnwatch();
          break;

        // ── Desconocido ────────────────────────────────────────────────────
        default:
          throw new Error(`Unknown command: ${command}`);
      }

      sendResponse({ success: true, result });

    } catch (error) {
      console.error(`❌ [Actuator] Error executing [${command}]:`, error);
      sendResponse({ success: false, error: error.message });
    }
  })();

  return true; // async response
});

// ============================================================================
// RIBBON VISUAL
// ============================================================================

const ribbon = document.createElement('div');
Object.assign(ribbon.style, {
  position: 'fixed',
  top: '0', left: '0',
  width: '100%', height: '4px',
  background: 'linear-gradient(90deg, #00ff88, #00d4ff)',
  zIndex: '2147483646',
  boxShadow: '0 0 8px rgba(0,255,136,0.6)',
  pointerEvents: 'none'
});
document.body.appendChild(ribbon);

// ============================================================================
// INICIALIZACIÓN
// ============================================================================

chrome.runtime.sendMessage({
  event: "actuator_ready",
  url: window.location.href,
  timestamp: Date.now()
});

console.log("✅ [Synapse Actuator] Ready — v2.3 (DOM_FOCUS + DOM_EXTRACT + Ion SDK support)");
console.log(`🔒 [Synapse Actuator] Slave mode timeout: ${SLAVE_MODE_TIMEOUT_MS}ms`);