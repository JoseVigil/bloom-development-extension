// ============================================================================
// BLOOM DISCOVERY PAGE - CONNECTION VALIDATOR
// ============================================================================

const CONFIG = {
  MAX_ATTEMPTS: 60,
  PING_INTERVAL_MS: 1000,
  CLOSE_DELAY_MS: 2000
};

class DiscoveryValidator {
  constructor() {
    // ✅ FIX: Lee SYNAPSE_CONFIG directamente desde el scope global
    this.extensionId = self.SYNAPSE_CONFIG?.extension_id;
    this.attemptCount = 0;
    this.isConnected = false;
    this.pingInterval = null;
    
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
    console.log('[Bloom Discovery] Full Config:', self.SYNAPSE_CONFIG);
    
    if (!this.extensionId || this.extensionId === 'PLACEHOLDER') {
      this.showError('Extension ID no disponible', {
        error: 'MISSING_EXTENSION_ID',
        config: self.SYNAPSE_CONFIG
      });
      return;
    }
    
    this.updateStatus('searching');
    this.listenForMessages();
    this.startPinging();
  }
  
  listenForMessages() {
    if (!chrome.runtime || !chrome.runtime.onMessage) {
      console.warn('[Bloom Discovery] Cannot listen for messages: runtime not available');
      return;
    }
    
    try {
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        console.log('[Bloom Discovery] Message received:', message);
        
        const { command, payload } = message;
        
        if (command === "system_ready") {
          console.log('[Bloom Discovery] ✓ SYSTEM_READY received from Service Worker');
          
          if (!this.isConnected) {
            this.onConnectionSuccess(payload || { status: 'pong' });
          }
          
          sendResponse({ received: true });
          return true;
        }
        
        if (command === 'profile_closing' || message.action === 'profile_closing') {
          console.log('[Bloom Discovery] Profile closing, preparing shutdown...');
          sendResponse({ status: 'acknowledged' });
          this.cleanup();
          return true;
        }
        
        return false;
      });
      
      console.log('[Bloom Discovery] Message listener registered');
    } catch (error) {
      console.error('[Bloom Discovery] Error setting up message listener:', error);
    }
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
    
    this.sendPing();
  }
  
  sendPing() {
    if (typeof chrome === 'undefined') {
      console.log(`[Attempt ${this.attemptCount}] Waiting for chrome API...`);
      return;
    }
    
    if (!chrome.runtime) {
      console.log(`[Attempt ${this.attemptCount}] Waiting for chrome.runtime...`);
      return;
    }
    
    if (typeof chrome.runtime.sendMessage !== 'function') {
      console.log(`[Attempt ${this.attemptCount}] Waiting for chrome.runtime.sendMessage...`);
      return;
    }
    
    if (!chrome.runtime.id) {
      console.log(`[Attempt ${this.attemptCount}] Extension context not ready...`);
      return;
    }

    console.log(`[Attempt ${this.attemptCount}] Sending ping to extension...`);
    
    try {
      chrome.runtime.sendMessage(
        { 
          command: 'check_handshake_status',
          source: 'discovery_page',
          timestamp: Date.now() 
        },
        (response) => {
          if (!chrome.runtime) {
            console.warn('[Ping Response] Runtime desapareció durante el callback');
            return;
          }
          
          if (chrome.runtime.lastError) {
            const errorMsg = chrome.runtime.lastError.message;
            
            if (errorMsg.includes('Receiving end does not exist') ||
                errorMsg.includes('Extension context invalidated') ||
                errorMsg.includes('message port closed')) {
              console.log(`[Attempt ${this.attemptCount}] Extension not ready: ${errorMsg}`);
              return;
            }
            
            console.warn(`[Attempt ${this.attemptCount}] Unexpected error:`, errorMsg);
            return;
          }
          
          if (!response) {
            console.log(`[Attempt ${this.attemptCount}] Empty response`);
            return;
          }
          
          if (response.handshake_confirmed === true || response.status === 'pong') {
            this.onConnectionSuccess(response);
          } else {
            console.log(`[Attempt ${this.attemptCount}] Not ready yet:`, response);
          }
        }
      );
    } catch (error) {
      console.log(`[Attempt ${this.attemptCount}] Exception during ping:`, error.message);
      
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
    
    if (response.profile_id) {
      document.getElementById('profile-id').textContent = `Profile: ${response.profile_id}`;
    }
    document.getElementById('timestamp').textContent = `Conectado: ${new Date().toLocaleTimeString()}`;
    
    this.notifyHost(response);
  }
  
  notifyHost(pingResponse) {
    if (!chrome.runtime || !chrome.runtime.sendMessage) {
      console.error('[Bloom Discovery] Cannot notify host: runtime not available');
      return;
    }
    
    try {
      chrome.runtime.sendMessage(
        {
          type: 'DISCOVERY_COMPLETE',
          command: 'discovery_complete',
          source: 'discovery_page',
          payload: {
            profile_id: self.SYNAPSE_CONFIG?.profileId,
            profile_alias: self.SYNAPSE_CONFIG?.profile_alias,
            launch_id: self.SYNAPSE_CONFIG?.launchId,
            timestamp: Date.now(),
            ping_response: pingResponse
          }
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
        runtime_available: typeof chrome?.runtime !== 'undefined'
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
  window.BLOOM_VALIDATOR = new DiscoveryValidator();
  window.BLOOM_VALIDATOR.start();
});

window.addEventListener('beforeunload', (e) => {
  const validator = window.BLOOM_VALIDATOR;
  if (validator && !validator.isConnected) {
    e.preventDefault();
    e.returnValue = 'La validación aún no ha terminado';
  }
});

console.log('[Bloom Discovery] Script loaded');