// ============================================================================
// BLOOM NUCLEUS: SYNAPSE ACTUATOR v2.1 (content.js)
// Filosofía: Músculo ciego. Ejecuta comandos primitivos sin pensar.
// ============================================================================

console.log("⚡ [Synapse Actuator] Injected");

// ============================================================================
// SLAVE MODE (UI Lock) - CON TIMEOUT DE SEGURIDAD
// ============================================================================

const SLAVE_OVERLAY_ID = 'bloom-slave-overlay';
const SLAVE_MODE_TIMEOUT_MS = 30000; // 🔒 30 segundos de seguridad

let isSlaveMode = false;
let slaveModeTimer = null;
let lastCommandTimestamp = 0;

function enableSlaveMode(message = "🤖 BLOOM AI OPERATING") {
  if (isSlaveMode) {
    // Si ya está activo, solo resetear el timer
    resetSlaveModeTimer();
    return;
  }
  
  console.log("[Actuator] Slave mode: ENABLED");
  
  // Bloquear interacción
  document.body.style.pointerEvents = 'none';
  document.body.style.userSelect = 'none';
  
  // Overlay visual
  const overlay = document.createElement('div');
  overlay.id = SLAVE_OVERLAY_ID;
  overlay.innerHTML = `
    <div style="
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(0, 0, 0, 0.15);
      backdrop-filter: grayscale(80%) blur(1.5px);
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'SF Mono', monospace;
      pointer-events: none;
    ">
      <div style="
        background: rgba(0, 0, 0, 0.95);
        padding: 24px 32px;
        border-radius: 12px;
        border: 2px solid #00ff88;
        box-shadow: 0 0 30px rgba(0, 255, 136, 0.4);
        text-align: center;
      ">
        <div style="
          display: flex;
          align-items: center;
          gap: 12px;
          color: #00ff88;
          font-size: 18px;
          font-weight: bold;
          letter-spacing: 1px;
          margin-bottom: 12px;
        ">
          <div style="
            width: 12px;
            height: 12px;
            background: #00ff88;
            border-radius: 50%;
            animation: bloom-pulse 1.5s infinite;
          "></div>
          ${message}
        </div>
        <div style="
          font-size: 12px;
          color: rgba(255, 255, 255, 0.6);
          letter-spacing: 0.5px;
        ">
          Do not touch the keyboard or mouse...
        </div>
      </div>
    </div>
    
    <style>
      @keyframes bloom-pulse {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.3; transform: scale(0.85); }
      }
    </style>
  `;
  
  document.body.appendChild(overlay);
  isSlaveMode = true;
  lastCommandTimestamp = Date.now();
  
  // 🔒 Iniciar timer de seguridad
  resetSlaveModeTimer();
  
  // Notificar al router
  chrome.runtime.sendMessage({
    event: "slave_mode_changed",
    enabled: true
  });
}

function disableSlaveMode() {
  if (!isSlaveMode) return;
  
  console.log("[Actuator] Slave mode: DISABLED");
  
  // Restaurar interacción
  document.body.style.pointerEvents = '';
  document.body.style.userSelect = '';
  
  // Remover overlay
  const overlay = document.getElementById(SLAVE_OVERLAY_ID);
  if (overlay) overlay.remove();
  
  // Limpiar timer
  if (slaveModeTimer) {
    clearTimeout(slaveModeTimer);
    slaveModeTimer = null;
  }
  
  isSlaveMode = false;
  
  // Notificar al router
  chrome.runtime.sendMessage({
    event: "slave_mode_changed",
    enabled: false
  });
}

function resetSlaveModeTimer() {
  // Limpiar timer existente
  if (slaveModeTimer) {
    clearTimeout(slaveModeTimer);
  }
  
  // Crear nuevo timer
  slaveModeTimer = setTimeout(() => {
    console.warn("[Actuator] ⚠️ TIMEOUT DE SEGURIDAD - Auto-liberando slave mode");
    
    const timeSinceLastCommand = Date.now() - lastCommandTimestamp;
    console.log(`[Actuator] Tiempo desde último comando: ${timeSinceLastCommand}ms`);
    
    // Notificar al background sobre el timeout
    chrome.runtime.sendMessage({
      event: "slave_mode_timeout",
      time_since_last_command: timeSinceLastCommand,
      timestamp: Date.now()
    });
    
    // Liberar UI
    disableSlaveMode();
    
  }, SLAVE_MODE_TIMEOUT_MS);
  
  console.log(`[Actuator] Timer de seguridad reseteado (${SLAVE_MODE_TIMEOUT_MS}ms)`);
}

// ============================================================================
// COMANDOS PRIMITIVOS (Motor Cortex)
// ============================================================================

/**
 * DOM_CLICK: Clickear un elemento
 */
function executeClick(selector, options = {}) {
  const { multiple = false, waitVisible = true } = options;
  
  const elements = multiple 
    ? document.querySelectorAll(selector)
    : [document.querySelector(selector)];
  
  if (!elements.length || !elements[0]) {
    throw new Error(`Element not found: ${selector}`);
  }
  
  let clickCount = 0;
  
  elements.forEach(el => {
    if (waitVisible && el.offsetParent === null) {
      console.warn(`[Actuator] Element not visible:`, el);
      return;
    }
    
    // Simular click humano completo
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    el.click();
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
    
    clickCount++;
  });
  
  return { clicked: clickCount, selector };
}

/**
 * DOM_TYPE: Escribir texto en un input
 */
function executeType(selector, text, options = {}) {
  const { clear = true, triggerEvents = true } = options;
  
  const el = document.querySelector(selector);
  if (!el) throw new Error(`Input not found: ${selector}`);
  
  el.focus();
  
  if (clear) {
    el.value = '';
  }
  
  // Insertar texto
  el.value = text;
  
  // Disparar eventos para frameworks (React/Vue/Angular)
  if (triggerEvents) {
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  
  return { typed: text.length, selector };
}

/**
 * DOM_READ: Extraer contenido del DOM
 */
function executeRead(selector, options = {}) {
  const { attribute = null, multiple = false } = options;
  
  const elements = multiple
    ? Array.from(document.querySelectorAll(selector))
    : [document.querySelector(selector)];
  
  if (!elements.length || !elements[0]) {
    throw new Error(`Element not found: ${selector}`);
  }
  
  const results = elements.map(el => {
    if (attribute) {
      return el.getAttribute(attribute);
    }
    
    // Si es input/textarea, devolver value
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      return el.value;
    }
    
    // Sino, devolver texto visible
    return el.innerText || el.textContent;
  });
  
  return multiple ? results : results[0];
}

/**
 * DOM_UPLOAD: Subir archivos a un input
 */
function executeUpload(selector, files) {
  const input = document.querySelector(selector);
  if (!input) throw new Error(`File input not found: ${selector}`);
  
  if (input.tagName !== 'INPUT' || input.type !== 'file') {
    throw new Error(`Element is not a file input: ${selector}`);
  }
  
  // Crear DataTransfer con los archivos
  const dataTransfer = new DataTransfer();
  
  files.forEach(f => {
    const blob = new Blob([f.content], { type: f.mime_type || 'text/plain' });
    const file = new File([blob], f.name, { type: f.mime_type });
    dataTransfer.items.add(file);
  });
  
  input.files = dataTransfer.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  
  return { uploaded: files.length };
}

/**
 * DOM_SCROLL: Scrollear la página
 */
function executeScroll(target, options = {}) {
  const { behavior = 'smooth' } = options;
  
  let scrollOptions = { behavior };
  
  if (target === 'bottom') {
    scrollOptions.top = document.body.scrollHeight;
  } else if (target === 'top') {
    scrollOptions.top = 0;
  } else if (typeof target === 'number') {
    scrollOptions.top = target;
  } else if (typeof target === 'string') {
    // Selector de elemento
    const el = document.querySelector(target);
    if (!el) throw new Error(`Scroll target not found: ${target}`);
    el.scrollIntoView({ behavior });
    return { scrolled_to: target };
  }
  
  window.scrollTo(scrollOptions);
  return { scrolled_to: scrollOptions.top };
}

/**
 * DOM_WAIT: Esperar a que aparezca un elemento
 */
async function executeWait(selector, options = {}) {
  const { timeout = 10000, checkInterval = 500 } = options;
  
  const startTime = Date.now();
  
  return new Promise((resolve, reject) => {
    const check = setInterval(() => {
      const el = document.querySelector(selector);
      
      if (el) {
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

/**
 * DOM_SNAPSHOT: Capturar estado completo de la página
 */
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
  
  if (includeStyles) {
    snapshot.computed_styles = window.getComputedStyle(target).cssText;
  }
  
  return snapshot;
}

// ============================================================================
// MESSAGE ROUTER (Comandos del Brain)
// ============================================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { command, payload } = message;
  
  console.log(`🎯 [Actuator] Received: ${command}`, payload);
  
  (async () => {
    try {
      let result;
      
      // 🔒 Resetear timer en CADA comando cuando slave mode está activo
      if (isSlaveMode) {
        lastCommandTimestamp = Date.now();
        resetSlaveModeTimer();
        console.log(`[Actuator] Timer reseteado por comando: ${command}`);
      }
      
      switch (command) {
        // ────────────────────────────────────────────
        // COMANDOS DE CONTROL
        // ────────────────────────────────────────────
        
        case "LOCK_UI":
          enableSlaveMode(payload?.message);
          result = { locked: true };
          break;
          
        case "UNLOCK_UI":
          disableSlaveMode();
          result = { unlocked: true };
          break;
        
        // ────────────────────────────────────────────
        // COMANDOS DE ACTUACIÓN DOM
        // ────────────────────────────────────────────
        
        case "DOM_CLICK":
          result = executeClick(payload.selector, payload.options);
          break;
          
        case "DOM_TYPE":
          result = executeType(payload.selector, payload.text, payload.options);
          break;
          
        case "DOM_READ":
          result = executeRead(payload.selector, payload.options);
          break;
          
        case "DOM_UPLOAD":
          result = executeUpload(payload.selector, payload.files);
          break;
          
        case "DOM_SCROLL":
          result = executeScroll(payload.target, payload.options);
          break;
          
        case "DOM_WAIT":
          result = await executeWait(payload.selector, payload.options);
          break;
          
        case "DOM_SNAPSHOT":
          result = executeSnapshot(payload.options);
          break;
        
        // ────────────────────────────────────────────
        // COMANDO DESCONOCIDO
        // ────────────────────────────────────────────
        
        default:
          throw new Error(`Unknown command: ${command}`);
      }
      
      sendResponse({ success: true, result });
      
    } catch (error) {
      console.error(`❌ [Actuator] Error executing [${command}]:`, error);
      sendResponse({ success: false, error: error.message });
    }
  })();
  
  return true; // Async response
});

// ============================================================================
// INDICADOR VISUAL (Ribbon)
// ============================================================================

const ribbon = document.createElement('div');
Object.assign(ribbon.style, {
  position: 'fixed',
  top: '0',
  left: '0',
  width: '100%',
  height: '4px',
  background: 'linear-gradient(90deg, #00ff88, #00d4ff)',
  zIndex: '2147483646',
  boxShadow: '0 0 8px rgba(0, 255, 136, 0.6)',
  pointerEvents: 'none'
});
document.body.appendChild(ribbon);

// ============================================================================
// INICIALIZACIÓN
// ============================================================================

// Notificar al router que estamos listos
chrome.runtime.sendMessage({
  event: "actuator_ready",
  url: window.location.href,
  timestamp: Date.now()
});

console.log("✅ [Synapse Actuator] Ready");
console.log(`🔒 [Synapse Actuator] Slave mode timeout: ${SLAVE_MODE_TIMEOUT_MS}ms`);