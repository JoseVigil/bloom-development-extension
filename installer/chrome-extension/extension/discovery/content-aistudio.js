// ============================================================================
// CONTENT SCRIPT: AI STUDIO KEY CAPTURE
// content-aistudio.js
// ============================================================================

(function() {
  'use strict';

  if (window.location.hostname !== 'aistudio.google.com') return;
  if (!window.location.pathname.includes('/app/apikey')) return;

  console.log('[AI Studio] Key capture script loaded');

  let keyExtracted = false;

  // ============================================================================
  // CLIPBOARD DETECTION
  // ============================================================================

  document.addEventListener('copy', async (e) => {
    if (keyExtracted) return;

    setTimeout(async () => {
      try {
        const text = await navigator.clipboard.readText();
        
        if (isValidGeminiKey(text)) {
          keyExtracted = true;
          captureKey(text);
        }
      } catch (error) {
        console.log('[AI Studio] Clipboard read blocked, using fallback');
      }
    }, 100);
  });

  // ============================================================================
  // MUTATION OBSERVER (Detección de nueva key)
  // ============================================================================

  const observer = new MutationObserver((mutations) => {
    if (keyExtracted) return;

    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;

        // Buscar elementos que contengan API keys
        const elements = [
          node,
          ...node.querySelectorAll('*')
        ];

        for (const el of elements) {
          const text = el.textContent || '';
          
          if (isValidGeminiKey(text.trim())) {
            keyExtracted = true;
            captureKey(text.trim());
            return;
          }

          // Buscar en inputs
          if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
            const value = el.value || '';
            if (isValidGeminiKey(value.trim())) {
              keyExtracted = true;
              captureKey(value.trim());
              return;
            }
          }
        }
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });

  // ============================================================================
  // KEY VALIDATION
  // ============================================================================

  function isValidGeminiKey(text) {
    if (!text || typeof text !== 'string') return false;
    
    text = text.trim();
    
    // Formato: AIza + 35-39 caracteres alfanuméricos
    const regex = /^AIza[A-Za-z0-9_-]{31,35}$/;
    return regex.test(text);
  }

  // ============================================================================
  // KEY CAPTURE
  // ============================================================================

  function captureKey(key) {
    console.log('[AI Studio] API key captured');

    chrome.runtime.sendMessage({
      event: 'api_key_captured',
      key: key,
      source: 'aistudio',
      timestamp: Date.now()
    });

    // Detener observer
    observer.disconnect();
  }

  // ============================================================================
  // CLEANUP
  // ============================================================================

  window.addEventListener('beforeunload', () => {
    observer.disconnect();
  });

})();