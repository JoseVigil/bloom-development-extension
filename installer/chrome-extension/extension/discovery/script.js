// ============================================================================
// SYNAPSE DISCOVERY - SCRIPT CON PROTOCOLO (FIXED)
// ============================================================================

class DiscoveryValidator {
  constructor() {
    // Protocolo (cargado desde window.PROTOCOL)
    this.protocol = window.PROTOCOL;
    
    // Validar que el protocolo existe
    if (!this.protocol) {
      console.error('[Discovery] PROTOCOL not loaded!');
      return;
    }
    
    // Config desde protocolo
    this.config = this.protocol.config;
    
    // Estado interno
    this.extensionId = self.SYNAPSE_CONFIG?.extension_id;
    this.attemptCount = 0;
    this.isConnected = false;
    this.pingInterval = null;
    this.discoveryCompleted = false;
    
    // Referencias DOM (para acciones que no están en protocolo)
    this.attemptCountEl = document.getElementById('attempt-count');
  }
  
  // ══════════════════════════════════════════════════════════════════════════
  // LIFECYCLE METHODS
  // ══════════════════════════════════════════════════════════════════════════
  
  start() {
    console.log('[Discovery] Starting');

    // Inicializar el protocolo
    this.protocol.init();
    
    // Fase: INITIALIZATION
    this.protocol.executePhase('initialization', {
      validator: this
    });
    
    // Validación crítica
    if (!this.extensionId) {
      this.transitionToError('Extension ID not available', {
        config: self.SYNAPSE_CONFIG,
        error: 'MISSING_EXTENSION_ID'
      });
      return;
    }
    
    // Setup listeners
    this.setupStorageListener();
    
    // Transición a búsqueda
    this.transitionToSearching();
  }
  
  transitionToSearching() {
    // Fase: SEARCHING
    this.protocol.executePhase('searching', {
      validator: this,
      attemptCount: this.attemptCount
    });
    
    this.startPinging();
  }
  
  transitionToSuccess(payload) {
    if (this.discoveryCompleted) return;
    if (this.isConnected) return; // ⭐ PROTECCIÓN ADICIONAL
    
    // ⭐ SETEAR FLAGS INMEDIATAMENTE ANTES DE PROCESAR
    this.discoveryCompleted = true;
    this.isConnected = true;
    
    // Fase: SUCCESS
    this.protocol.executePhase('success', {
      validator: this,
      payload: payload
    });
    
    // Acciones post-UI
    this.stopPinging();
    this.notifyHost(payload);
    
    // Auto-close si está habilitado
    if (this.protocol.config.autoCloseOnSuccess) {
      setTimeout(() => {
        this.cleanup();
        window.close();
      }, this.protocol.config.closeDelayMs);
    }
  }
  
  transitionToError(message, details = {}) {
    // Fase: ERROR
    this.protocol.executePhase('error', {
      validator: this,
      errorData: {
        message: message,
        details: details,
        timestamp: new Date().toISOString()
      }
    });
    
    this.stopPinging();
  }
  
  cleanup() {
    // Fase: CLEANUP
    this.protocol.executePhase('cleanup', {
      validator: this
    });
    
    this.stopPinging();
  }
  
  // ══════════════════════════════════════════════════════════════════════════
  // STORAGE LISTENER (Canal principal de comunicación)
  // ══════════════════════════════════════════════════════════════════════════
  
  setupStorageListener() {
    // Protección contra runtime errors
    if (!chrome?.storage?.onChanged) {
      console.error('[Discovery] Chrome storage API not available');
      return;
    }
    
    chrome.storage.onChanged.addListener((changes, area) => {
      try {
        if (area === 'local' && changes.synapseStatus) {
          const status = changes.synapseStatus.newValue;
          if (!status) return;
          
          if (this.config.debugMode) {
            console.log('[Discovery] Storage update:', status.command);
          }
          
          if (status.command === 'system_ready') {
            this.handleSystemReady(status.payload);
          }
        }
      } catch (error) {
        console.error('[Discovery] Error in storage listener:', error);
      }
    });
  }
  
  // ══════════════════════════════════════════════════════════════════════════
  // PING MECHANISM (Detección de handshake)
  // ══════════════════════════════════════════════════════════════════════════
  
  startPinging() {
    this.pingInterval = setInterval(() => {
      this.attemptCount++;
      this.updateAttemptCount();
      
      // Timeout check
      if (this.attemptCount > this.config.maxAttempts) {
        this.transitionToError(
          this.protocol.getMessage('timeout', { attempts: this.config.maxAttempts }),
          {
            attempts: this.attemptCount,
            maxAttempts: this.config.maxAttempts
          }
        );
        return;
      }
      
      this.sendPing();
      
    }, this.config.pingIntervalMs);
  }
  
  sendPing() {
    // Protección robusta contra runtime errors
    if (typeof chrome === 'undefined') {
      if (this.config.debugMode) {
        console.log(`[Attempt ${this.attemptCount}] Chrome not available`);
      }
      return;
    }
    
    if (!chrome.runtime) {
      if (this.config.debugMode) {
        console.log(`[Attempt ${this.attemptCount}] Runtime not available`);
      }
      return;
    }
    
    if (!chrome.runtime.id) {
      if (this.config.debugMode) {
        console.log(`[Attempt ${this.attemptCount}] Extension context not ready`);
      }
      return;
    }
    
    try {
      chrome.runtime.sendMessage(
        { 
          command: 'check_handshake_status',
          source: 'discovery_page',
          timestamp: Date.now()
        },
        (response) => {
          // Protección post-callback
          if (!chrome.runtime) {
            return;
          }
          
          // Manejo de errores esperados
          if (chrome.runtime.lastError) {
            const errorMsg = chrome.runtime.lastError.message;
            
            // Errores esperados (extension no lista)
            const expectedErrors = [
              'Receiving end does not exist',
              'Extension context invalidated',
              'message port closed'
            ];
            
            const isExpected = expectedErrors.some(err => errorMsg.includes(err));
            
            if (!isExpected && this.config.debugMode) {
              console.warn(`[Attempt ${this.attemptCount}] Unexpected error:`, errorMsg);
            }
            
            return;
          }
          
          // Respuesta vacía
          if (!response) {
            if (this.config.debugMode) {
              console.log(`[Attempt ${this.attemptCount}] Empty response`);
            }
            return;
          }
          
          // Handshake confirmado
          if (response.handshake_confirmed === true || response.status === 'pong') {
            this.handleSystemReady(response);
          }
        }
      );
    } catch (error) {
      if (this.config.debugMode) {
        console.log(`[Attempt ${this.attemptCount}] Exception:`, error.message);
      }
    }
  }
  
  stopPinging() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }
  
  updateAttemptCount() {
    if (this.attemptCountEl) {
      this.attemptCountEl.textContent = this.attemptCount;
    }
  }
  
  // ══════════════════════════════════════════════════════════════════════════
  // HANDLERS
  // ══════════════════════════════════════════════════════════════════════════
  
  handleSystemReady(payload) {
    // ⭐ PROTECCIÓN TRIPLE CONTRA DUPLICADOS
    if (this.discoveryCompleted) {
      if (this.config.debugMode) {
        console.warn('[Discovery] Duplicate SYSTEM_READY ignored (discoveryCompleted)');
      }
      return;
    }
    
    if (this.isConnected) {
      if (this.config.debugMode) {
        console.warn('[Discovery] Duplicate SYSTEM_READY ignored (isConnected)');
      }
      return;
    }
    
    if (this.config.debugMode) {
      console.log('[Discovery] ✓ SYSTEM_READY received:', payload);
    }
    
    this.transitionToSuccess(payload);
  }
  
  // ══════════════════════════════════════════════════════════════════════════
  // HOST NOTIFICATION
  // ══════════════════════════════════════════════════════════════════════════
  
  notifyHost(payload) {
    // Protección contra runtime errors
    if (!chrome?.runtime?.sendMessage) {
      console.error('[Discovery] Cannot notify host: runtime not available');
      return;
    }
    
    try {
      chrome.runtime.sendMessage(
        {
          event: 'DISCOVERY_COMPLETE',
          command: 'discovery_complete',
          source: 'discovery_page',
          payload: {
            profile_id: self.SYNAPSE_CONFIG?.profileId,
            profile_alias: self.SYNAPSE_CONFIG?.profile_alias,
            launch_id: self.SYNAPSE_CONFIG?.launchId,
            timestamp: Date.now(),
            ping_response: payload
          }
        },
        (response) => {
          if (chrome.runtime && chrome.runtime.lastError) {
            console.error('[Discovery] Error notifying host:', chrome.runtime.lastError);
            return;
          }
          
          if (this.config.debugMode) {
            console.log('[Discovery] Host notified:', response);
          }
        }
      );
    } catch (error) {
      console.error('[Discovery] Exception notifying host:', error);
    }
  }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
  // Validar que el protocolo está cargado
  if (!window.PROTOCOL) {
    console.error('[Discovery] PROTOCOL not found! Make sure discoveryProtocol.js is loaded first.');
    return;
  }

  // IMPORTANTE: Liberar lock UNA SOLA VEZ antes de iniciar
  try {
    if (chrome?.storage?.local) {
      await chrome.storage.local.remove('discovery_open_lock');
      console.log('[Discovery] Lock released');
    }
  } catch (e) {
    console.warn('[Discovery] Lock release failed:', e);
  }
  
  // Crear instancia global
  window.BLOOM_VALIDATOR = new DiscoveryValidator();
  window.BLOOM_VALIDATOR.start();
  
  // Debug info
  if (window.PROTOCOL.config.debugMode) {
    console.log('[Discovery] Initialized with protocol:', window.PROTOCOL.config);
  }
});

console.log('[Discovery] 🚀 Script loaded at:', new Date().toISOString());
console.log('[Discovery] Instance ID:', Math.random().toString(36).substr(2, 9));