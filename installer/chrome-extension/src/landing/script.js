// ============================================================================
// SYNAPSE LANDING - SCRIPT CON PROTOCOLO
// Maneja handshake, conexión con host y actualización de estado
// ============================================================================

class LandingFlow {
  constructor() {
    // Protocolo (cargado desde window.PROTOCOL)
    this.protocol = window.PROTOCOL;
    
    // Validar que el protocolo existe
    if (!this.protocol) {
      console.error('[Landing] 🚨 PROTOCOL not loaded!');
      return;
    }
    
    // Config desde protocolo
    this.config = this.protocol.config;
    
    // Estado interno
    this.extensionId = null;
    this.profileData = null;
    this.attemptCount = 0;
    this.checkInterval = null;
    this.isInitialized = false;
    this.isConnected = false;
  }

  // ═══════════════════════════════════════════════════════════════════
  // LIFECYCLE
  // ═══════════════════════════════════════════════════════════════════
  
  async start() {
    if (this.isInitialized) {
      console.warn('[Landing] Already initialized - skipping duplicate call');
      return;
    }

    console.log('[Landing] 🚀 Starting');
    this.isInitialized = true;

    // Cargar datos del perfil
    await this.loadProfileData();

    // Inicializar el protocolo
    this.protocol.init();

    // Fase: INITIALIZATION
    this.protocol.executePhase('initialization');

    // Validación crítica
    if (!this.extensionId) {
      this.transitionToError('Extension ID not available', {
        sources_checked: ['window.BLOOM_EXTENSION_ID', 'SYNAPSE_CONFIG', 'storage', 'data-loader'],
        error: 'MISSING_EXTENSION_ID'
      });
      return;
    }

    // Setup listeners
    this.setupStorageListener();

    // Iniciar chequeos de conexión
    this.startConnectionChecks();

    // Si tenemos datos, transicionar a loading
    if (this.profileData) {
      this.protocol.executePhase('loading');
    }
  }

  async loadProfileData() {
    console.log('[Landing] 📦 Loading profile data...');

    // Priority 1: Data-loader injected data (validar que no sea placeholder)
    if (window.BLOOM_PROFILE_DATA && typeof window.BLOOM_PROFILE_DATA === 'object') {
      this.profileData = window.BLOOM_PROFILE_DATA;
      console.log('[Landing] ✓ Profile data from data-loader injection');
    }
    
    if (window.BLOOM_EXTENSION_ID && !window.BLOOM_EXTENSION_ID.includes('{{')) {
      this.extensionId = window.BLOOM_EXTENSION_ID;
      console.log('[Landing] ✓ Extension ID from data-loader injection');
    }

    // Priority 2: Storage
    try {
      const result = await chrome.storage.local.get(['synapseConfig', 'profileData']);
      
      if (result.profileData && !this.profileData) {
        this.profileData = result.profileData;
        console.log('[Landing] ✓ Profile data from storage');
      }

      if (result.synapseConfig?.extension_id && !this.extensionId) {
        this.extensionId = result.synapseConfig.extension_id;
        console.log('[Landing] ✓ Extension ID from storage');
      }
    } catch (error) {
      console.warn('[Landing] Storage read failed:', error);
    }

    // Priority 3: Fallback to SYNAPSE_CONFIG
    if (!this.extensionId && self.SYNAPSE_CONFIG?.extension_id) {
      this.extensionId = self.SYNAPSE_CONFIG.extension_id;
      console.log('[Landing] ✓ Extension ID from SYNAPSE_CONFIG');
    }

    // Construir datos desde config si no están disponibles
    if (!this.profileData && self.SYNAPSE_CONFIG) {
      this.profileData = this.buildProfileFromConfig(self.SYNAPSE_CONFIG);
      console.log('[Landing] ✓ Profile data built from SYNAPSE_CONFIG');
    }
  }

  buildProfileFromConfig(config) {
    return {
      alias: config.profile_alias || 'Worker',
      role: 'Worker',
      stats: {
        totalLaunches: config.total_launches || 0,
        uptime: config.uptime || 0,
        intentsCompleted: config.intents_done || 0,
        lastSync: config.last_synch || null
      },
      accounts: [],
      system: {
        id: config.profileId || '-',
        created: null,
        lastLaunch: new Date().toISOString()
      }
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  // STORAGE LISTENER (Canal principal de comunicación)
  // ═══════════════════════════════════════════════════════════════════
  
  setupStorageListener() {
    // Protección contra runtime errors
    if (!chrome?.storage?.onChanged) {
      console.error('[Landing] Chrome storage API not available');
      return;
    }
    
    chrome.storage.onChanged.addListener((changes, area) => {
      try {
        if (area === 'local' && changes.synapseStatus) {
          const status = changes.synapseStatus.newValue;
          if (!status) return;
          
          if (this.config.debugMode) {
            console.log('[Landing] Storage update:', status.command);
          }
          
          // Responder a comandos del host
          if (status.command === 'system_ready') {
            this.handleSystemReady(status.payload);
          }
          
          if (status.command === 'profile_update') {
            this.handleProfileUpdate(status.payload);
          }
        }
        
        // Actualizar profileData si cambia
        if (area === 'local' && changes.profileData) {
          const newData = changes.profileData.newValue;
          if (newData) {
            this.profileData = newData;
            if (this.isConnected) {
              this.protocol.renderDashboard(this.profileData);
            }
          }
        }
      } catch (error) {
        console.error('[Landing] Error in storage listener:', error);
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  // TRANSITIONS
  // ═══════════════════════════════════════════════════════════════════
  
  transitionToReady() {
    if (!this.profileData) {
      console.error('[Landing] Cannot transition to ready: no profile data');
      return;
    }

    if (this.isConnected) {
      if (this.config.debugMode) {
        console.warn('[Landing] Already connected, skipping duplicate transition');
      }
      return;
    }

    console.log('[Landing] ✅ Transitioning to ready');
    this.isConnected = true;
    
    // Fase: READY
    this.protocol.executePhase('ready', { profile: this.profileData });
    
    // Notificar al host
    this.notifyHostReady();
  }

  transitionToError(message, details = {}) {
    console.error('[Landing] ❌ Error:', message, details);
    
    // Fase: ERROR
    this.protocol.executePhase('error', {
      errorData: {
        message: message,
        details: details,
        timestamp: new Date().toISOString()
      }
    });

    this.stopConnectionChecks();
  }

  // ═══════════════════════════════════════════════════════════════════
  // CONNECTION CHECKS (Heartbeat)
  // ═══════════════════════════════════════════════════════════════════
  
  startConnectionChecks() {
    console.log('[Landing] 🔄 Starting connection checks');
    
    // Primer chequeo inmediato
    this.checkConnections();
    
    // Chequeos periódicos
    this.checkInterval = setInterval(() => {
      this.attemptCount++;
      
      // Timeout check
      if (this.attemptCount > this.config.maxAttempts && !this.isConnected) {
        this.transitionToError(
          'Connection timeout',
          {
            attempts: this.attemptCount,
            maxAttempts: this.config.maxAttempts
          }
        );
        return;
      }
      
      this.checkConnections();
    }, this.config.checkIntervalMs);
  }

  stopConnectionChecks() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      console.log('[Landing] Connection checks stopped');
    }
  }

  async checkConnections() {
    if (!this.extensionId || this.extensionId.includes('{{')) {
      console.warn('[Landing] Extension ID not available, skipping connection check');
      return;
    }

    // Protección contra runtime errors
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) {
      if (this.config.debugMode) {
        console.log(`[Attempt ${this.attemptCount}] Chrome runtime not ready`);
      }
      this.protocol.updateStatusDots('checking');
      return;
    }

    try {
      // Check extension connection
      chrome.runtime.sendMessage(
        this.extensionId,
        { 
          action: 'ping',
          source: 'landing_page',
          timestamp: Date.now()
        },
        (response) => {
          // Protección post-callback
          if (!chrome.runtime) return;
          
          if (chrome.runtime.lastError) {
            const errorMsg = chrome.runtime.lastError.message;
            
            // Errores esperados
            const expectedErrors = [
              'Receiving end does not exist',
              'Extension context invalidated',
              'message port closed'
            ];
            
            const isExpected = expectedErrors.some(err => errorMsg.includes(err));
            
            if (!isExpected && this.config.debugMode) {
              console.warn(`[Attempt ${this.attemptCount}] Extension error:`, errorMsg);
            }
            
            this.protocol.updateConnectionDot('status-dot-extension', 'error');
            this.protocol.updateConnectionDot('dashboard-status-extension', 'error');
            return;
          }
          
          // Extension conectada
          if (response && (response.status === 'pong' || response.success)) {
            this.protocol.updateConnectionDot('status-dot-extension', 'connected');
            this.protocol.updateConnectionDot('dashboard-status-extension', 'connected');
            
            // Si acabamos de conectar, transicionar a ready
            if (!this.isConnected && this.profileData) {
              this.transitionToReady();
            }
          } else {
            this.protocol.updateConnectionDot('status-dot-extension', 'checking');
            this.protocol.updateConnectionDot('dashboard-status-extension', 'checking');
          }
        }
      );

      // Check host connection
      chrome.runtime.sendMessage(
        this.extensionId,
        { 
          action: 'checkHost',
          source: 'landing_page',
          timestamp: Date.now()
        },
        (response) => {
          // Protección post-callback
          if (!chrome.runtime) return;
          
          if (chrome.runtime.lastError) {
            this.protocol.updateConnectionDot('status-dot-host', 'error');
            this.protocol.updateConnectionDot('dashboard-status-host', 'error');
            return;
          }
          
          // Host conectado
          if (response && response.hostConnected) {
            this.protocol.updateConnectionDot('status-dot-host', 'connected');
            this.protocol.updateConnectionDot('dashboard-status-host', 'connected');
          } else {
            this.protocol.updateConnectionDot('status-dot-host', 'checking');
            this.protocol.updateConnectionDot('dashboard-status-host', 'checking');
          }
        }
      );
    } catch (error) {
      if (this.config.debugMode) {
        console.error('[Landing] Connection check exception:', error);
      }
      this.protocol.updateStatusDots('error');
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // HANDLERS
  // ═══════════════════════════════════════════════════════════════════
  
  handleSystemReady(payload) {
    if (this.isConnected) {
      if (this.config.debugMode) {
        console.warn('[Landing] Duplicate SYSTEM_READY ignored');
      }
      return;
    }
    
    if (this.config.debugMode) {
      console.log('[Landing] ✓ SYSTEM_READY received:', payload);
    }
    
    // Actualizar datos si vienen en el payload
    if (payload && payload.profileData) {
      this.profileData = payload.profileData;
    }
    
    this.transitionToReady();
  }

  handleProfileUpdate(payload) {
    if (!payload || !payload.profileData) return;
    
    if (this.config.debugMode) {
      console.log('[Landing] Profile update received:', payload);
    }
    
    this.profileData = payload.profileData;
    
    // Re-renderizar si estamos en dashboard
    if (this.isConnected) {
      this.protocol.renderDashboard(this.profileData);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // HOST NOTIFICATION
  // ═══════════════════════════════════════════════════════════════════
  
  notifyHostReady() {
    if (!chrome?.runtime?.sendMessage) {
      console.error('[Landing] Cannot notify host: runtime not available');
      return;
    }
    
    try {
      chrome.runtime.sendMessage(
        {
          event: 'LANDING_READY',
          command: 'landing_ready',
          source: 'landing_page',
          payload: {
            profile_id: self.SYNAPSE_CONFIG?.profileId,
            profile_alias: self.SYNAPSE_CONFIG?.profile_alias,
            launch_id: self.SYNAPSE_CONFIG?.launchId,
            timestamp: Date.now()
          }
        },
        (response) => {
          if (chrome.runtime && chrome.runtime.lastError) {
            console.error('[Landing] Error notifying host:', chrome.runtime.lastError);
            return;
          }
          
          if (this.config.debugMode) {
            console.log('[Landing] Host notified:', response);
          }
        }
      );
    } catch (error) {
      console.error('[Landing] Exception notifying host:', error);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // CLEANUP
  // ═══════════════════════════════════════════════════════════════════
  
  cleanup() {
    console.log('[Landing] 🧹 Cleanup');
    
    // Fase: CLEANUP
    this.protocol.executePhase('cleanup', {
      flow: this
    });
    
    this.stopConnectionChecks();
    this.isInitialized = false;
    this.isConnected = false;
  }
}

// ============================================================================
// GLOBAL COMMAND EXECUTOR
// ============================================================================

window.executeCommand = function(command) {
  console.log('[Landing] 💬 Executing command:', command);

  const extensionId = window.BLOOM_EXTENSION_ID || self.SYNAPSE_CONFIG?.extension_id;

  if (!extensionId || extensionId.includes('{{')) {
    console.error('[Landing] Extension ID not available for command execution');
    alert('Error: Extension ID not available');
    return;
  }

  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
    chrome.runtime.sendMessage(
      extensionId,
      {
        action: 'executeBrainCommand',
        command: command,
        source: 'landing_page',
        timestamp: Date.now()
      },
      (response) => {
        if (chrome.runtime && chrome.runtime.lastError) {
          console.error('[Landing] Command error:', chrome.runtime.lastError);
          alert('Command failed: ' + chrome.runtime.lastError.message);
          return;
        }

        console.log('[Landing] Command response:', response);
        
        if (response && response.success) {
          alert('✅ Command executed successfully!');
        } else {
          alert('❌ Command failed: ' + (response?.error || 'Unknown error'));
        }
      }
    );
  } else {
    console.warn('[Landing] Chrome runtime not available');
    alert('[MOCK] Would execute: ' + command);
  }
};

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
  // Validar que el protocolo está cargado
  if (!window.PROTOCOL) {
    console.error('[Landing] 🚨 PROTOCOL not found! Make sure landingProtocol.js is loaded first.');
    
    // Mostrar error en UI
    const errorScreen = document.getElementById('screen-error');
    if (errorScreen) {
      errorScreen.classList.add('active');
      const errorMessage = document.getElementById('error-message');
      if (errorMessage) {
        errorMessage.textContent = 'Protocol not loaded. Check console for details.';
      }
    }
    return;
  }

  // Crear instancia global
  window.LANDING_FLOW = new LandingFlow();
  
  try {
    await window.LANDING_FLOW.start();
    console.log('[Landing] ✨ Initialized');
  } catch (error) {
    console.error('[Landing] Initialization failed:', error);
    
    if (window.LANDING_FLOW) {
      window.LANDING_FLOW.transitionToError('Initialization failed', {
        error: error.message,
        stack: error.stack
      });
    }
  }
});

// Cleanup on unload
window.addEventListener('beforeunload', () => {
  if (window.LANDING_FLOW) {
    window.LANDING_FLOW.cleanup();
  }
});

console.log('[Landing] 🎯 Script loaded at:', new Date().toISOString());
console.log('[Landing] Instance ID:', Math.random().toString(36).substr(2, 9));