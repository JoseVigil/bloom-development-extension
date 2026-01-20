// ============================================================================
// BLOOM DISCOVERY PAGE - STORAGE BUS PATTERN
// ============================================================================

const CONFIG = {
  MAX_ATTEMPTS: 60,
  PING_INTERVAL_MS: 1000,
  CLOSE_DELAY_MS: 2000
};

class DiscoveryValidator {
  constructor() {
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
    this.setupStorageListener();
    this.checkInitialStatus();
    this.startPinging();
  }
  
  // ============================================================================
  // STORAGE BUS LISTENER - Canal principal de comunicación
  // ============================================================================
  
  setupStorageListener() {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'local' && changes.synapseStatus) {
        const status = changes.synapseStatus.newValue;
        
        console.log('[Discovery] Storage update received:', status);
        
        if (!status) return;
        
        // Procesar según el comando
        if (status.command === 'system_ready') {
          this.handleSystemReady(status.payload);
        } else if (status.command === 'connection_update') {
          this.handleConnectionUpdate(status.payload);
        }
      }
    });
    
    console.log('[Discovery] Storage listener registered');
  }
  
  // Leer estado inicial al cargar
  checkInitialStatus() {
    chrome.storage.local.get('synapseStatus', (result) => {
      if (chrome.runtime.lastError) {
        console.error('[Discovery] Error reading initial status:', chrome.runtime.lastError);
        return;
      }
      
      if (result.synapseStatus) {
        console.log('[Discovery] Initial status from storage:', result.synapseStatus);
        
        if (result.synapseStatus.command === 'system_ready') {
          this.handleSystemReady(result.synapseStatus.payload);
        } else if (result.synapseStatus.command === 'connection_update') {
          this.handleConnectionUpdate(result.synapseStatus.payload);
        }
      } else {
        console.log('[Discovery] No initial status in storage');
      }
    });
  }
  
  // ============================================================================
  // HANDLERS
  // ============================================================================
  
  handleSystemReady(payload) {
    if (this.isConnected) return;
    
    console.log('[Discovery] ✓ SYSTEM_READY received:', payload);
    
    this.isConnected = true;
    clearInterval(this.pingInterval);
    
    this.updateStatus('connected');
    this.statusMessage.textContent = '✅ Extensión conectada';
    this.autoCloseNotice.style.display = 'block';
    
    // Mostrar información del perfil
    if (payload.profile_id) {
      document.getElementById('profile-id').textContent = `Profile: ${payload.profile_id}`;
    }
    
    if (payload.profile_alias) {
      const aliasEl = document.getElementById('profile-alias');
      if (aliasEl) {
        aliasEl.textContent = `Alias: ${payload.profile_alias}`;
      }
    }
    
    document.getElementById('timestamp').textContent = `Conectado: ${new Date().toLocaleTimeString()}`;
    
    // Guardar en sessionStorage
    if (payload.profile_id) {
      sessionStorage.setItem('profileId', payload.profile_id);
    }
    if (payload.launch_id) {
      sessionStorage.setItem('launchId', payload.launch_id);
    }
    
    // Notificar al host
    this.notifyHost(payload);
  }
  
  handleConnectionUpdate(payload) {
    console.log('[Discovery] Connection update:', payload);
    
    const state = payload.connection_state;
    
    if (state === 'CONNECTED' && payload.handshake_confirmed) {
      // Si llegó handshake confirmado, tratarlo como system_ready
      this.handleSystemReady(payload);
      return;
    }
    
    // Actualizar UI según el estado
    const statusMessages = {
      'INITIALIZING': '🔄 Inicializando...',
      'CONNECTING': '🔄 Conectando al host...',
      'CONNECTED': '✓ Conectado',
      'DISCONNECTED': '✗ Desconectado',
      'CONFIG_ERROR': '⚠ Error de configuración'
    };
    
    if (statusMessages[state]) {
      this.statusMessage.textContent = statusMessages[state];
    }
    
    // Si se desconectó después de estar conectado, mostrar error
    if (state === 'DISCONNECTED' && this.isConnected) {
      this.showError('Conexión perdida', {
        reason: payload.reason || 'Unknown',
        last_state: state
      });
    }
  }
  
  // ============================================================================
  // LEGACY MESSAGE LISTENER (Fallback)
  // ============================================================================
  
  listenForMessages() {
    if (!chrome.runtime || !chrome.runtime.onMessage) {
      console.warn('[Discovery] Cannot listen for messages: runtime not available');
      return;
    }
    
    try {
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        console.log('[Discovery] Direct message received:', message);
        
        const { command, payload } = message;
        
        if (command === "system_ready") {
          this.handleSystemReady(payload || { status: 'pong' });
          sendResponse({ received: true });
          return true;
        }
        
        if (command === 'profile_closing' || message.action === 'profile_closing') {
          console.log('[Discovery] Profile closing, preparing shutdown...');
          sendResponse({ status: 'acknowledged' });
          this.cleanup();
          return true;
        }
        
        return false;
      });
      
      console.log('[Discovery] Message listener registered (fallback)');
    } catch (error) {
      console.error('[Discovery] Error setting up message listener:', error);
    }
  }
  
  // ============================================================================
  // PING MECHANISM (Fallback para verificar estado)
  // ============================================================================
  
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
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
      console.log(`[Attempt ${this.attemptCount}] Waiting for chrome API...`);
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
            console.warn('[Ping Response] Runtime disappeared during callback');
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
          
          // Si el ping confirma handshake, marcar como conectado
          if (response.handshake_confirmed === true || response.status === 'pong') {
            this.handleSystemReady(response);
          } else {
            console.log(`[Attempt ${this.attemptCount}] Not ready yet:`, response);
          }
        }
      );
    } catch (error) {
      console.log(`[Attempt ${this.attemptCount}] Exception during ping:`, error.message);
    }
  }
  
  // ============================================================================
  // HOST NOTIFICATION
  // ============================================================================
  
  notifyHost(pingResponse) {
    if (!chrome.runtime || !chrome.runtime.sendMessage) {
      console.error('[Discovery] Cannot notify host: runtime not available');
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
            console.error('[Discovery] Error notifying host:', chrome.runtime.lastError);
            return;
          }
          console.log('[Discovery] Host notified:', response);
        }
      );
    } catch (error) {
      console.error('[Discovery] Exception notifying host:', error);
    }
  }
  
  // ============================================================================
  // UTILITIES
  // ============================================================================
  
  cleanup() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    
    console.log('[Discovery] Cleanup complete');
  }
  
  timeout() {
    console.error('[Discovery] Timeout reached after', CONFIG.MAX_ATTEMPTS, 'attempts');
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