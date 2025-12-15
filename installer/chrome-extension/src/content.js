// ============================================================================
// BLOOM NUCLEUS BRIDGE - CONTENT SCRIPT
// El brazo ejecutor dentro del DOM real.
// ============================================================================

// MutationObserver for DOM changes
let observer = null;
let observedElements = new Map();

// Listen for messages from background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { action } = message;

  // Procesamiento ASÍNCRONO para permitir esperas en la UI (Submit)
  (async () => {
    try {
      let result;

      switch (action) {
        case "click":
          result = handleClick(message.selector);
          break;
        case "type":
          result = handleType(message.selector, message.text);
          break;
        case "upload_file":
          result = handleUploadFile(message.selector, message.filePath);
          break;
        case "read_dom":
          result = handleReadDom(message.selector);
          break;
        case "observe_changes":
          result = handleObserveChanges(message.selector, message.enabled);
          break;
        
        // --- NUEVO COMANDO CRÍTICO (BRIDGE NATIVO) ---
        case "ai.submit":
          result = await handleAiSubmit(message.payload);
          break;
          
        default:
          throw new Error(`Unknown action: ${action}`);
      }

      sendResponse({ success: true, result });
    } catch (error) {
      console.error("[Bloom Content] Error:", error);
      sendResponse({ success: false, error: error.message });
    }
  })();

  return true; // Indica a Chrome que la respuesta será asíncrona
});

// ============================================================================
// AI SUBMIT DRIVER (CLAUDE / GENERIC) - ROBUST VERSION
// ============================================================================

async function handleAiSubmit(payload) {
  const text = payload.text || payload;
  console.log("[Bloom Driver] Buscando chat box...", text.length);

  // --- ESTRATEGIA DE SELECTORES (Resiliencia) ---
  const editorSelectors = [
    'div[contenteditable="true"]',           // Estándar ProseMirror/RichText
    'div[role="textbox"]',                   // Estándar Accesibilidad
    'fieldset [contenteditable="true"]',     // Variación Claude reciente
    '.ProseMirror',                          // Clase interna de la librería
    '[data-testid="chat-input"]'             // Selector de testing (si existe)
  ];

  let editor = null;
  for (const selector of editorSelectors) {
    editor = document.querySelector(selector);
    if (editor) {
      console.log(`[Bloom Driver] Editor encontrado usando: ${selector}`);
      break;
    }
  }

  if (!editor) {
    // Debug: Imprimir el body para ver qué está pasando si falla todo
    console.error("DOM Dump:", document.body.innerHTML.substring(0, 500));
    throw new Error("INPUT_NOT_FOUND: No se pudo localizar el área de texto con ningún selector conocido.");
  }

  // 2. Enfocar
  editor.focus();
  await new Promise(r => setTimeout(r, 100)); // Espera un poco más

  // 3. Inyección de Texto (Simulación de Paste)
  try {
    const data = new DataTransfer();
    data.setData('text/plain', text);
    
    const pasteEvent = new ClipboardEvent('paste', {
      bubbles: true,
      cancelable: true,
      clipboardData: data
    });
    
    editor.dispatchEvent(pasteEvent);
    console.log("[Bloom Driver] Paste event disparado.");
  } catch (e) {
    console.warn("[Bloom Driver] Falló paste event, usando fallback.", e);
    // Fallback sucio pero efectivo
    document.execCommand('insertText', false, text);
  }

  // Esperar a que la UI procese el texto
  await new Promise(r => setTimeout(r, 800));

  // 4. Click en Submit
  // Buscamos el botón de enviar con más inteligencia
  const buttonSelectors = [
    'button[aria-label="Send Message"]',
    'button[aria-label="Send message"]', // A veces cambia mayúsculas
    'button[type="submit"]',
    'div[aria-label="Send Message"]'     // A veces es un div clickeable
  ];

  let sendButton = null;
  for (const selector of buttonSelectors) {
    sendButton = document.querySelector(selector);
    if (sendButton) break;
  }

  if (!sendButton) {
    // Intento desesperado: buscar icono de flecha
    const svgs = Array.from(document.querySelectorAll('svg'));
    // El icono de enviar suele estar al final o tener ciertas clases
    // Esto es arriesgado, mejor lanzar error si no se encuentra el aria-label
    throw new Error("SUBMIT_BTN_NOT_FOUND: No encuentro botón de envío.");
  }

  if (sendButton.disabled) {
    throw new Error("SUBMIT_BTN_DISABLED: El botón sigue deshabilitado tras pegar.");
  }

  sendButton.click();
  console.log("[Bloom Driver] Click en enviar ejecutado.");

  return { 
    status: "submitted", 
    timestamp: Date.now(),
    ui_feedback: "click_executed"
  };
}

// ============================================================================
// FUNCIONES ESTÁNDAR (Legacy / Helper)
// ============================================================================

function handleClick(selector) {
  const element = document.querySelector(selector);
  if (!element) throw new Error(`Element not found: ${selector}`);
  element.click();
  return { clicked: true };
}

function handleType(selector, text) {
  const element = document.querySelector(selector);
  if (!element) throw new Error(`Element not found: ${selector}`);
  element.value = text;
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
  return { typed: true, length: text.length };
}

function handleUploadFile(selector, filePath) {
  return { ready: true, note: "Native host coordination required" };
}

function handleReadDom(selector) {
  const element = document.querySelector(selector);
  if (!element) throw new Error(`Element not found: ${selector}`);
  return {
    tagName: element.tagName,
    id: element.id,
    className: element.className,
    textContent: element.textContent,
    innerHTML: element.innerHTML,
    attributes: Array.from(element.attributes).reduce((acc, attr) => {
      acc[attr.name] = attr.value;
      return acc;
    }, {}),
    boundingRect: element.getBoundingClientRect().toJSON()
  };
}

function handleObserveChanges(selector, enabled) {
  if (enabled) {
    const element = selector ? document.querySelector(selector) : document.body;
    if (!element) throw new Error(`Element not found: ${selector}`);
    
    if (!observer) {
      observer = new MutationObserver((mutations) => {
        const changes = mutations.map(m => ({
          type: m.type,
          target: { tagName: m.target.tagName, id: m.target.id },
          addedNodes: m.addedNodes.length
        }));
        chrome.runtime.sendMessage({ event: "dom_change", changes });
      });
    }
    observer.observe(element, { childList: true, attributes: true, subtree: true });
    observedElements.set(selector || "body", element);
    return { observing: true };
  } else {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    observedElements.clear();
    return { observing: false };
  }
}

// ============================================================================
// CICLO DE VIDA
// ============================================================================

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", notifyPageReady);
} else {
  notifyPageReady();
}

function notifyPageReady() {
  chrome.runtime.sendMessage({
    event: "content_ready",
    url: window.location.href
  });
}