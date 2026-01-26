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
      const result = await chrome.storage.local.get(['synapseConfig', 'profileData']);
      
      if (result.profileData && !this.profileData) {
        this.profileData = result.profileData;
        console.log('[Landing] ✓ Data loaded from storage');
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
    this.protocol.executePhase('ready', { profile: this.profileData });
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