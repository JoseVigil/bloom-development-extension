// ============================================================================
// SYNAPSE LANDING FLOW
// Profile cockpit main script
// ============================================================================

class LandingFlow {
  constructor() {
    this.protocol = window.PROTOCOL;
    
    if (!this.protocol) {
      console.error('[Landing] 🚨 PROTOCOL not loaded!');
      return;
    }
    
    this.config = this.protocol.config;
    this.extensionId = null;
    this.profileData = null;
    this.checkInterval = null;
    this.isInitialized = false;
    this.requiresRegistration = false;
    this.heartbeatMode = false;
    this.serviceTarget = null;
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

    // Load profile data
    await this.loadProfileData();

    // Init protocol
    this.protocol.init();

    // Execute initialization phase
    this.protocol.executePhase('initialization');

    // Validate extension ID
    if (!this.extensionId) {
      this.transitionToError('Extension ID not available', {
        sources_checked: ['window.BLOOM_EXTENSION_ID', 'SYNAPSE_CONFIG', 'storage'],
        error: 'MISSING_EXTENSION_ID'
      });
      return;
    }

    // Start connection checks
    this.startConnectionChecks();

    // Transition to ready if we have profile data
    if (this.profileData) {
      this.transitionToReady();
    } else {
      this.protocol.executePhase('loading');
    }
  }

  async loadProfileData() {
    console.log('[Landing] 📦 Loading profile data...');

    // Priority 1: Injected data from host (validate it's not a placeholder)
    if (window.BLOOM_PROFILE_DATA && typeof window.BLOOM_PROFILE_DATA === 'object') {
      this.profileData = window.BLOOM_PROFILE_DATA;
    }
    
    if (window.BLOOM_EXTENSION_ID && !window.BLOOM_EXTENSION_ID.includes('{{')) {
      this.extensionId = window.BLOOM_EXTENSION_ID;
      console.log('[Landing] ✓ Extension ID from window injection');
    }

    // Priority 2: Storage
    try {
      const result = await chrome.storage.local.get(['synapseConfig', 'profileData', 'bloom_profile_state']);
      
      if (result.profileData && !this.profileData) {
        this.profileData = result.profileData;
        console.log('[Landing] ✓ Data loaded from storage');
      }

      if (result.synapseConfig?.extension_id && !this.extensionId) {
        this.extensionId = result.synapseConfig.extension_id;
        console.log('[Landing] ✓ Extension ID from storage');
      }

      // launch_flags es el nodo canónico; raíz como fallback legacy
      if (result.synapseConfig) {
        const flags = result.synapseConfig.launch_flags || result.synapseConfig;
        this.requiresRegistration = flags.register === true;
        this.heartbeatMode        = flags.heartbeat === true;
        this.serviceTarget        = flags.service || null;
        this.stepCurrent          = flags.step ?? 0;
        this.profileAlias         = flags.alias || null;
        this.profileRole          = flags.role || null;
        this.userEmail            = flags.email || result.synapseConfig.email || null;
        this.extensionOverride    = flags.extension || null;
        this.launchMode           = flags.mode || null;
        this.linkedAccounts       = flags.linked_accounts || [];
        console.log('[Landing] ✓ Flags loaded - register:', this.requiresRegistration, '| heartbeat:', this.heartbeatMode, '| service:', this.serviceTarget, '| step:', this.stepCurrent);
      }

      // bloom_profile_state — escrito por discovery.js durante el onboarding.
      // Landing solo lee. Si existe, tiene prioridad sobre profileData legacy.
      if (result.bloom_profile_state) {
        this.bloomProfileState = result.bloom_profile_state;
        console.log('[Landing] ✓ bloom_profile_state loaded');
      }
    } catch (error) {
      console.warn('[Landing] Storage read failed:', error);
    }

    // Priority 3: Fallback to SYNAPSE_CONFIG
    if (!this.extensionId && self.SYNAPSE_CONFIG?.extension_id) {
      this.extensionId = self.SYNAPSE_CONFIG.extension_id;
      console.log('[Landing] ✓ Extension ID from SYNAPSE_CONFIG');
    }

    // Build profile data from config if not available
    if (!this.profileData && self.SYNAPSE_CONFIG) {
      this.profileData = this.buildProfileFromConfig(self.SYNAPSE_CONFIG);
      console.log('[Landing] ✓ Data built from SYNAPSE_CONFIG');
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
  // TRANSITIONS
  // ═══════════════════════════════════════════════════════════════════
  transitionToReady() {
    if (!this.profileData) {
      console.error('[Landing] Cannot transition to ready: no profile data');
      return;
    }

    console.log('[Landing] ✅ Transitioning to ready');

    // Si tenemos bloom_profile_state, enriquecemos el perfil con accounts y vaults reales
    if (this.bloomProfileState) {
      this.profileData = this.mergeProfileState(this.profileData, this.bloomProfileState);
    }

    this.protocol.executePhase('ready', { profile: this.profileData });

    // Emitir LANDING_READY al host
    try {
      chrome.runtime.sendMessage({
        event:      'LANDING_READY',
        profile_id: self.SYNAPSE_CONFIG?.profileId || this.bloomProfileState?.profile_id || null,
        timestamp:  Date.now()
      });
      console.log('[Landing] LANDING_READY emitido');
    } catch (e) {
      console.warn('[Landing] LANDING_READY emit failed (non-fatal):', e.message);
    }

    // Escuchar eventos del host para actualizar el panel en tiempo real
    this.setupMessageListener();
  }

  mergeProfileState(profileData, bloomState) {
    return {
      ...profileData,
      accounts: (bloomState.accounts || []).map(a => ({
        provider: a.provider,
        username: a.username || null,
        email:    a.email    || null,
        status:   a.status   || 'pending'
      })),
      vaults: bloomState.vaults || [],
      onboarding_complete: bloomState.onboarding_complete || false
    };
  }

  setupMessageListener() {
    chrome.runtime.onMessage.addListener((msg) => {
      if (!msg?.event) return;
      console.log('[Landing] Mensaje recibido:', msg.event);

      switch (msg.event) {
        case 'GITHUB_TOKEN_STORED':
        case 'GITHUB_ACCOUNT_CREATED':
        case 'ACCOUNT_REGISTERED':
          // Recargar bloom_profile_state y re-renderizar el panel
          chrome.storage.local.get('bloom_profile_state', (result) => {
            console.log('[Landing] Actualizando dashboard por evento:', msg.event);
            if (result.bloom_profile_state) {
              this.bloomProfileState = result.bloom_profile_state;
              this.profileData = this.mergeProfileState(this.profileData, this.bloomProfileState);
              this.protocol.executePhase('ready', { profile: this.profileData });
            }
          });
          break;

        case 'PROFILE_LOADED':
          if (msg.profile) {
            this.profileData = this.mergeProfileState(msg.profile, this.bloomProfileState || {});
            this.protocol.executePhase('ready', { profile: this.profileData });
          }
          break;
      }
    });
  }

  transitionToError(message, details = {}) {
    console.error('[Landing] ❌ Error:', message, details);
    
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
  // CONNECTION CHECKS
  // ═══════════════════════════════════════════════════════════════════
  startConnectionChecks() {
    console.log('[Landing] 🔄 Starting connection checks');
    
    this.checkConnections();
    this.checkInterval = setInterval(() => {
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

    try {
      // Check extension
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
        chrome.runtime.sendMessage(
          this.extensionId,
          { action: 'ping' },
          (response) => {
            const status = chrome.runtime.lastError ? 'error' : 'connected';
            this.protocol.updateConnectionDot('status-dot-extension', status);
            this.protocol.updateConnectionDot('dashboard-status-extension', status);
          }
        );

        // Check host
        chrome.runtime.sendMessage(
          this.extensionId,
          { action: 'checkHost' },
          (response) => {
            const status = (chrome.runtime.lastError || !response?.hostConnected) ? 'error' : 'connected';
            this.protocol.updateConnectionDot('status-dot-host', status);
            this.protocol.updateConnectionDot('dashboard-status-host', status);
          }
        );
      } else {
        this.protocol.updateConnectionDot('status-dot-extension', 'error');
        this.protocol.updateConnectionDot('status-dot-host', 'error');
        this.protocol.updateConnectionDot('dashboard-status-extension', 'error');
        this.protocol.updateConnectionDot('dashboard-status-host', 'error');
      }
    } catch (error) {
      console.error('[Landing] Connection check failed:', error);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // CLEANUP
  // ═══════════════════════════════════════════════════════════════════
  cleanup() {
    console.log('[Landing] 🧹 Cleanup');
    this.stopConnectionChecks();
  }
}

// ============================================================================
// GLOBAL COMMAND EXECUTOR
// ============================================================================

window.executeCommand = function(command) {
  console.log('[Landing] 💬 Executing command:', command);

  const extensionId = window.BLOOM_EXTENSION_ID || self.SYNAPSE_CONFIG?.extension_id;

  if (!extensionId) {
    alert('Error: Extension ID not available');
    return;
  }

  if (typeof chrome !== 'undefined' && chrome.runtime) {
    chrome.runtime.sendMessage(
      extensionId,
      {
        action: 'executeBrainCommand',
        command: command
      },
      (response) => {
        console.log('[Landing] Command response:', response);
        
        if (chrome.runtime.lastError) {
          alert('Command failed: ' + chrome.runtime.lastError.message);
          return;
        }

        if (response?.success) {
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
  if (!window.PROTOCOL) {
    console.error('[Landing] 🚨 PROTOCOL not found! Make sure landingProtocol.js is loaded first.');
    return;
  }

  // Create global instance
  window.LANDING_FLOW = new LandingFlow();
  await window.LANDING_FLOW.start();

  console.log('[Landing] ✨ Initialized');
});

// Cleanup on unload
window.addEventListener('beforeunload', () => {
  if (window.LANDING_FLOW) {
    window.LANDING_FLOW.cleanup();
  }
});

console.log('[Landing] 🎯 Script loaded at:', new Date().toISOString());