// ============================================================================
// BLOOM DISCOVERY PAGE - CONNECTION VALIDATOR (FIXED)
// ============================================================================

const CONFIG = {
  MAX_ATTEMPTS: 60,
  PING_INTERVAL_MS: 1000,
  CLOSE_DELAY_MS: 2000
};

class DiscoveryValidator {
  constructor() {
    this.extensionId = window.BLOOM_CONFIG?.extension_id;
    this.attemptCount = 0;
    this.isConnected = false;
    this.pingInterval = null;
    
    // DOM elements
    this.statusDot = document.getElementById('status-dot');
    this.statusMessage = document.getElementById('status-message');
    this.progressInfo = document.getElementById('progress-info');
    this.attemptCountEl = document.getElementById('attempt-count');
    this.autoCloseNotice = document.getElementById('auto-close-notice');
    this.errorContainer = document.getElementById('error-container');
    this.errorMessage = document.getElementById('error-message');
    this.errorDetails = document.getElementById('error-details');
  }
  
  start() {
    console.log('[Bloom Discovery] Starting validation...');
    console.log('[Bloom Discovery] Extension ID:', this.extensionId);
    
    if (!this.extensionId || this.extensionId === 'PLACEHOLDER') {
      this.showError('Extension ID no disponible', {
        error: 'MISSING_EXTENSION_ID',
        config: window.BLOOM_CONFIG
      });
      return;
    }
    
    this.updateStatus('searching');
    this.startPinging();
  }
  
  startPinging() {
    this.pingInterval = setInterval(() => {
      this.attemptCount++;
      this.updateAttemptCount();
      
      if (this.attemptCount > CONFIG.MAX_ATTEMPTS) {
        this.timeout();
        return;
      }
      
      this.sendPing();
      
    }, CONFIG.PING_INTERVAL_MS);
    
    // First ping immediately
    this.sendPing();
  }
  
  sendPing() {
    // ============================================================================
    // PROTECCIÓN TOTAL: chrome.runtime puede no existir durante varios segundos
    // ============================================================================
    
    // 1. Verificar que chrome existe
    if (typeof chrome === 'undefined') {
      console.log(`[Attempt ${this.attemptCount}] Waiting for chrome API...`);
      return;
    }
    
    // 2. Verificar que chrome.runtime existe
    if (!chrome.runtime) {
      console.log(`[Attempt ${this.attemptCount}] Waiting for chrome.runtime...`);
      return;
    }
    
    // 3. Verificar que chrome.runtime.sendMessage existe
    if (typeof chrome.runtime.sendMessage !== 'function') {
      console.log(`[Attempt ${this.attemptCount}] Waiting for chrome.runtime.sendMessage...`);
      return;
    }
    
    // 4. Verificar que chrome.runtime.id existe (indica que la extensión está viva)
    if (!chrome.runtime.id) {
      console.log(`[Attempt ${this.attemptCount}] Extension context not ready (no runtime.id)...`);
      return;
    }

    console.log(`[Attempt ${this.attemptCount}] Sending ping to extension...`);
    
    // ============================================================================
    // ENVÍO SEGURO CON TRIPLE PROTECCIÓN
    // ============================================================================
    
    try {
      chrome.runtime.sendMessage(
        this.extensionId,
        { 
          command: 'ping',
          source: 'discovery_page',
          timestamp: Date.now() 
        },
        (response) => {
          // PROTECCIÓN A: Verificar que runtime sigue existiendo
          if (!chrome.runtime) {
            console.warn('[Ping Response] Runtime desapareció durante el callback');
            return;
          }
          
          // PROTECCIÓN B: Manejar errores normales (extensión no lista)
          if (chrome.runtime.lastError) {
            const errorMsg = chrome.runtime.lastError.message;
            
            // Errores esperados (no son fatales, solo "todavía no")
            if (errorMsg.includes('Receiving end does not exist') ||
                errorMsg.includes('Extension context invalidated') ||
                errorMsg.includes('message port closed')) {
              console.log(`[Attempt ${this.attemptCount}] Extension not ready: ${errorMsg}`);
              return;
            }
            
            // Otros errores (pueden ser importantes)
            console.warn(`[Attempt ${this.attemptCount}] Unexpected error:`, errorMsg);
            return;
          }
          
          // PROTECCIÓN C: Validar respuesta
          if (!response) {
            console.log(`[Attempt ${this.attemptCount}] Empty response (extension loading...)`);
            return;
          }
          
          if (response.status === 'pong') {
            this.onConnectionSuccess(response);
          } else {
            console.log(`[Attempt ${this.attemptCount}] Unexpected response:`, response);
          }
        }
      );
    } catch (error) {
      // PROTECCIÓN D: Capturar excepciones de contexto invalidado
      console.log(`[Attempt ${this.attemptCount}] Exception during ping:`, error.message);
      
      // Si el error es "Extension context invalidated", la extensión se recargó
      if (error.message.includes('Extension context invalidated')) {
        console.log('[Discovery] Extension was reloaded, waiting for reconnection...');
      }
    }
  }
  
  onConnectionSuccess(response) {
    if (this.isConnected) return;
    
    console.log('[Bloom Discovery] ✅ Connection successful!', response);
    
    this.isConnected = true;
    clearInterval(this.pingInterval);
    
    this.updateStatus('connected');
    this.statusMessage.textContent = '✅ Extensión conectada';
    this.autoCloseNotice.style.display = 'block';
    
    this.notifyHost(response);
    this.listenForClose();
  }
  
  notifyHost(pingResponse) {
    // PROTECCIÓN: Verificar que runtime sigue existiendo
    if (!chrome.runtime || !chrome.runtime.sendMessage) {
      console.error('[Bloom Discovery] Cannot notify host: runtime not available');
      return;
    }
    
    try {
      chrome.runtime.sendMessage(
        this.extensionId,
        {
          command: 'discovery_complete',
          source: 'discovery_page',
          profile_id: window.BLOOM_CONFIG?.profile_id,
          profile_alias: window.BLOOM_CONFIG?.profile_alias,
          timestamp: Date.now(),
          ping_response: pingResponse
        },
        (response) => {
          if (chrome.runtime && chrome.runtime.lastError) {
            console.error('[Bloom Discovery] Error notifying host:', chrome.runtime.lastError);
            return;
          }
          console.log('[Bloom Discovery] Host notified:', response);
        }
      );
    } catch (error) {
      console.error('[Bloom Discovery] Exception notifying host:', error);
    }
  }
  
  listenForClose() {
    // PROTECCIÓN: Verificar que runtime existe antes de escuchar
    if (!chrome.runtime || !chrome.runtime.onMessage) {
      console.warn('[Bloom Discovery] Cannot listen for messages: runtime not available');
      return;
    }
    
    try {
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        console.log('[Bloom Discovery] Message received:', message);
        
        if (message.command === 'profile_closing' || message.action === 'profile_closing') {
          console.log('[Bloom Discovery] Profile closing, preparing shutdown...');
          sendResponse({ status: 'acknowledged' });
          this.cleanup();
        }
        
        return true;
      });
      
      console.log('[Bloom Discovery] Listening for profile close command...');
    } catch (error) {
      console.error('[Bloom Discovery] Error setting up message listener:', error);
    }
  }
  
  cleanup() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    
    console.log('[Bloom Discovery] Cleanup complete');
  }
  
  timeout() {
    console.error('[Bloom Discovery] Timeout reached after', CONFIG.MAX_ATTEMPTS, 'attempts');
    clearInterval(this.pingInterval);
    
    this.showError(
      `No se pudo conectar después de ${CONFIG.MAX_ATTEMPTS} intentos`,
      {
        extension_id: this.extensionId,
        attempts: this.attemptCount,
        chrome_available: typeof chrome !== 'undefined',
        runtime_available: typeof chrome?.runtime !== 'undefined',
        runtime_id_available: typeof chrome?.runtime?.id !== 'undefined',
        sendMessage_available: typeof chrome?.runtime?.sendMessage === 'function'
      }
    );
  }
  
  updateStatus(status) {
    this.statusDot.className = `status-dot ${status}`;
    
    const messages = {
      searching: '🔍 Buscando extensión...',
      connected: '✅ Extensión conectada'
    };
    
    this.statusMessage.textContent = messages[status] || '';
  }
  
  updateAttemptCount() {
    this.attemptCountEl.textContent = this.attemptCount;
  }
  
  showError(message, details) {
    clearInterval(this.pingInterval);
    
    this.statusDot.style.display = 'none';
    document.querySelector('.heartbeat-wrapper').style.display = 'none';
    this.statusMessage.style.display = 'none';
    this.progressInfo.style.display = 'none';
    
    this.errorContainer.style.display = 'block';
    this.errorMessage.textContent = message;
    
    if (details) {
      this.errorDetails.textContent = JSON.stringify(details, null, 2);
    }
  }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
  const validator = new DiscoveryValidator();
  validator.start();
});

window.addEventListener('beforeunload', (e) => {
  // Solo prevenir cierre si NO estamos conectados
  const validator = window.BLOOM_VALIDATOR;
  if (validator && !validator.isConnected) {
    e.preventDefault();
    e.returnValue = 'La validación aún no ha terminado';
  }
});

// Guardar instancia globalmente para el beforeunload
window.addEventListener('DOMContentLoaded', () => {
  window.BLOOM_VALIDATOR = new DiscoveryValidator();
  window.BLOOM_VALIDATOR.start();
});