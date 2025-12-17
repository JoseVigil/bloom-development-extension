// ============================================================================
// BLOOM NUCLEUS BRIDGE - CONTENT SCRIPT
// ============================================================================

let observer = null;
let observedElements = new Map();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { action } = message;

  (async () => {
    try {
      let result;
      switch (action) {
        case "click": result = handleClick(message.selector); break;
        case "type": result = handleType(message.selector, message.text); break;
        case "upload_file": result = handleUploadFile(message.selector, message.filePath); break;
        case "read_dom": result = handleReadDom(message.selector); break;
        case "observe_changes": result = handleObserveChanges(message.selector, message.enabled); break;
        
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
  return true;
});

// ============================================================================
// AI SUBMIT DRIVER (CLAUDE / GENERIC)
// ============================================================================

async function handleAiSubmit(payload) {
  const { text, context_files } = payload;
  console.log("[Bloom Driver] Iniciando submit...", { text_len: text?.length, files: context_files?.length });

  // 1. Encontrar Editor
  const editorSelectors = [
    'div[contenteditable="true"]',
    'div[role="textbox"]',
    'fieldset [contenteditable="true"]',
    '.ProseMirror'
  ];

  let editor = null;
  for (const selector of editorSelectors) {
    editor = document.querySelector(selector);
    if (editor) break;
  }

  if (!editor) throw new Error("INPUT_NOT_FOUND: No se pudo localizar el chat.");

  editor.focus();
  await new Promise(r => setTimeout(r, 200));

  // 2. Manejo de Archivos (Drag & Drop Simulado)
  if (context_files && context_files.length > 0) {
    const dataTransfer = new DataTransfer();
    
    for (const f of context_files) {
      // Determinar tipo MIME básico para evitar errores de corrupción
      let mimeType = 'text/plain';
      if (f.name.endsWith('.json')) mimeType = 'application/json';
      if (f.name.endsWith('.js')) mimeType = 'text/javascript';
      if (f.name.endsWith('.py')) mimeType = 'text/x-python';
      
      const file = new File([f.content], f.name, { type: mimeType });
      dataTransfer.items.add(file);
    }

    const dropEvent = new DragEvent('drop', {
      bubbles: true,
      cancelable: true,
      view: window,
      dataTransfer: dataTransfer
    });
    
    editor.dispatchEvent(dropEvent);
    console.log("[Bloom Driver] Archivos soltados (Drop event).");
    
    // Espera necesaria para que React procese los archivos
    await new Promise(r => setTimeout(r, 1500));
  }

  // 3. Inyección de Texto
  if (text) {
    // Intentar execCommand primero (más nativo para el cursor)
    const success = document.execCommand('insertText', false, text);
    if (!success) {
      // Fallback a evento Paste
      const data = new DataTransfer();
      data.setData('text/plain', text);
      const pasteEvent = new ClipboardEvent('paste', {
        bubbles: true, cancelable: true, clipboardData: data
      });
      editor.dispatchEvent(pasteEvent);
    }
    // Evento de entrada para asegurar que el framework detecte el cambio
    editor.dispatchEvent(new Event('input', { bubbles: true }));
  }

  await new Promise(r => setTimeout(r, 800));

  // 4. Click en Submit
  const buttonSelectors = [
    'button[aria-label="Send Message"]',
    'button[aria-label="Send message"]',
    'button[data-testid="send-button"]'
  ];

  let sendButton = null;
  for (const selector of buttonSelectors) {
    sendButton = document.querySelector(selector);
    if (sendButton) break;
  }
  
  // Fallback: buscar botón con SVG si no tiene label
  if (!sendButton) sendButton = document.querySelector('button:has(svg)');

  if (!sendButton) throw new Error("SUBMIT_BTN_NOT_FOUND");
  if (sendButton.disabled) throw new Error("SUBMIT_BTN_DISABLED: Botón bloqueado.");

  sendButton.click();
  console.log("[Bloom Driver] Enviado.");

  return { status: "submitted", timestamp: Date.now() };
}

// --- Funciones Legacy (Mantenidas) ---
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
  return { typed: true };
}
function handleUploadFile(selector, filePath) { return { ready: true }; }
function handleReadDom(selector) {
  const element = document.querySelector(selector);
  if (!element) throw new Error(`Element not found: ${selector}`);
  return { tagName: element.tagName, innerHTML: element.innerHTML };
}
function handleObserveChanges(selector, enabled) { return { observing: enabled }; }
if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", notifyPageReady); }
else { notifyPageReady(); }
function notifyPageReady() { chrome.runtime.sendMessage({ event: "content_ready", url: window.location.href }); }

// --- BLOOM VISUAL INDICATOR ---
const ribbon = document.createElement('div');
Object.assign(ribbon.style, {
  position: 'fixed',
  top: '0',
  left: '0',
  width: '100%',
  height: '5px',
  backgroundColor: '#00ff88', // Verde Bloom
  zIndex: '999999',
  boxShadow: '0 0 10px #00ff88'
});
document.body.appendChild(ribbon);