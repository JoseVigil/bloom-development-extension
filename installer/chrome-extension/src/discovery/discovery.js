// ============================================================================
// SYNAPSE DISCOVERY + ONBOARDING - UNIFIED SCRIPT
// ============================================================================

class DiscoveryFlow {
  constructor() {
    this.protocol = window.PROTOCOL;
    this.config = this.protocol.config;
    this.extensionId = self.SYNAPSE_CONFIG?.extension_id;
    
    this.requiresRegistration = false;
    this.userEmail = null;
    
    this.attemptCount = 0;
    this.isConnected = false;
    this.discoveryCompleted = false;
    this.pingInterval = null;
    
    // Handshake stages tracking
    this.currentStage = 'initializing';
    this.stages = [
      { name: 'initializing', label: 'Inicializando extensión', completed: false },
      { name: 'searching', label: 'Buscando host nativo', completed: false },
      { name: 'handshake', label: 'Estableciendo handshake', completed: false },
      { name: 'heartbeat', label: 'Verificando heartbeat', completed: false },
      { name: 'ready', label: 'Sistema listo', completed: false }
    ];
    
    this.stageIndex = 0;
    
    this.attemptCountEl = document.getElementById('attempt-count');
    
    // UI elements
    this.statusCircleEl = document.getElementById('status-circle');
    this.statusLineEl = document.getElementById('status-line');
    this.statusTextEl = document.getElementById('status-text');
    this.connectionRowEl = document.getElementById('connection-row');
    this.profileInfoEl = document.getElementById('profile-info');
    this.connectedTimeEl = document.getElementById('connected-time');
    this.countdownLabelEl = document.getElementById('countdown-label');
  }

  async start() {
    console.log('[Discovery] Starting');

    await this.loadSynapseConfig();

    console.log('[Discovery] Register mode:', this.requiresRegistration);

    // Display profile alias if available
    this.displayProfileAlias();

    this.protocol.init();
    
    // Stage 1: Initializing
    this.showStage(0);
    await this.delay(800);
    this.completeCurrentStage();
    
    this.protocol.executePhase('initialization', { validator: this });

    if (!this.extensionId) {
      this.transitionToError('Extension ID not available', {
        config: self.SYNAPSE_CONFIG,
        error: 'MISSING_EXTENSION_ID'
      });
      return;
    }

    // Stage 2: Searching
    this.showStage(1);
    await this.delay(600);
    
    this.setupStorageListener();
    this.startPinging();
  }

  displayProfileAlias() {
    const profileAlias = self.SYNAPSE_CONFIG?.profile_alias;
    
    if (profileAlias) {
      const profileNameDisplay = document.getElementById('profile-name-display');
      const profileAliasText = document.getElementById('profile-alias-text');
      
      if (profileAliasText) {
        profileAliasText.textContent = profileAlias;
      }
      if (profileNameDisplay) {
        profileNameDisplay.style.display = 'block';
      }
      
      console.log('[Discovery] Profile alias displayed:', profileAlias);
    }
  }

  async loadSynapseConfig() {
    try {
      const result = await chrome.storage.local.get('synapseConfig');
      const synapseConfig = result.synapseConfig;
      
      console.log('[Discovery] Storage read:', result);
      
      if (synapseConfig) {
        this.requiresRegistration = synapseConfig.register === true;
        this.userEmail = synapseConfig.email || null;
        
        console.log('[Discovery] Config loaded - register:', this.requiresRegistration);
        console.log('[Discovery] Config loaded - email:', this.userEmail);
      } else {
        this.requiresRegistration = self.SYNAPSE_CONFIG?.register === true;
        this.userEmail = self.SYNAPSE_CONFIG?.email || null;
        
        console.warn('[Discovery] Fallback to SYNAPSE_CONFIG');
      }
    } catch (error) {
      console.error('[Discovery] Error loading config:', error);
      this.requiresRegistration = self.SYNAPSE_CONFIG?.register === true;
      this.userEmail = self.SYNAPSE_CONFIG?.email || null;
    }
  }

  setupStorageListener() {
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

  startPinging() {
    this.pingInterval = setInterval(() => {
      this.attemptCount++;
      this.updateAttemptCount();
      
      if (this.attemptCount > this.config.maxAttempts) {
        this.transitionToError(
          this.protocol.getMessage('timeout', { attempts: this.config.maxAttempts }),
          { attempts: this.attemptCount, maxAttempts: this.config.maxAttempts }
        );
        return;
      }
      
      this.sendPing();
    }, this.config.pingIntervalMs);
  }

  sendPing() {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) {
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
          if (!chrome.runtime) return;
          if (chrome.runtime.lastError) return;
          if (!response) return;
          
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

  async handleSystemReady(payload) {
    if (this.discoveryCompleted || this.isConnected) {
      if (this.config.debugMode) {
        console.warn('[Discovery] Duplicate SYSTEM_READY ignored');
      }
      return;
    }
    
    if (this.config.debugMode) {
      console.log('[Discovery] ✓ SYSTEM_READY received:', payload);
    }
    
    // Complete searching stage
    this.completeCurrentStage();
    await this.delay(400);
    
    // Stage 3: Handshake
    this.showStage(2);
    await this.delay(800);
    this.completeCurrentStage();
    
    // Stage 4: Heartbeat
    this.showStage(3);
    await this.delay(700);
    this.completeCurrentStage();
    
    // Stage 5: Ready
    this.showStage(4);
    await this.delay(600);
    this.completeCurrentStage();
    
    this.transitionToSuccess(payload);
  }

  transitionToSuccess(payload) {
    if (this.discoveryCompleted) return;
    if (this.isConnected) return;
    
    this.discoveryCompleted = true;
    this.isConnected = true;
    
    // Transform circle to green with checkmark
    if (this.statusCircleEl) {
      this.statusCircleEl.classList.add('success');
    }
    
    // Show connection info
    if (this.connectionRowEl) {
      if (this.profileInfoEl && payload) {
        const profileId = payload.profile_id || self.SYNAPSE_CONFIG?.profileId || '-';
        this.profileInfoEl.textContent = `Profile: ${profileId.substring(0, 8)}...`;
      }
      
      if (this.connectedTimeEl) {
        this.connectedTimeEl.textContent = `Conectado: ${new Date().toLocaleTimeString()}`;
      }
      
      this.connectionRowEl.style.display = 'flex';
    }
    
    this.protocol.executePhase('success', {
      validator: this,
      payload: payload
    });
    
    this.stopPinging();
    this.notifyHost(payload);

    console.log('[Discovery] Success - requiresRegistration:', this.requiresRegistration);
    
    if (this.requiresRegistration) {
      console.log('[Discovery] Taking ONBOARDING path');
      this.transitionToOnboarding();
    } else {
      console.log('[Discovery] Taking AUTO-CLOSE path');
      this.autoCloseDiscovery();
    }
  }

  transitionToOnboarding() {
    console.log('[Discovery] transitionToOnboarding() called');
    
    chrome.runtime.sendMessage({
      event: 'onboarding_started'
    });

    setTimeout(() => {
      console.log('[Discovery] Showing onboarding-welcome screen');
      this.showScreen('onboarding-welcome');
    }, 2000);
  }

  autoCloseDiscovery() {
    console.log('[Discovery] Auto-closing with countdown (register=false)');
    
    // Show countdown label
    if (this.countdownLabelEl) {
      this.countdownLabelEl.classList.add('show');
    }
    
    this.startCountdown();
  }

  startCountdown() {
    let count = 5;
    
    // Get countdown element
    let countdownEl = document.getElementById('countdown-value');
    
    if (!countdownEl) {
      console.error('[Discovery] Countdown element not found');
      // Fallback: close after 5s without countdown
      setTimeout(() => {
        this.cleanup();
        window.close();
      }, 5000);
      return;
    }
    
    // Set initial value
    countdownEl.textContent = count;
    
    const countdownInterval = setInterval(() => {
      count--;
      countdownEl.textContent = count;
      
      console.log('[Discovery] Countdown:', count);
      
      if (count <= 0) {
        clearInterval(countdownInterval);
        console.log('[Discovery] Countdown complete, closing window');
        this.cleanup();
        window.close();
      }
    }, 1000);
  }

  transitionToError(message, details = {}) {
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
    this.protocol.executePhase('cleanup', { validator: this });
    this.stopPinging();
  }

  notifyHost(payload) {
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

  showScreen(screenName) {
    console.log('[Discovery] showScreen() called with:', screenName);
    
    document.querySelectorAll('.screen').forEach(s => {
      s.classList.remove('active');
    });
    
    const screen = document.getElementById(`screen-${screenName}`);
    console.log('[Discovery] Target screen element:', screen);
    
    if (screen) {
      screen.classList.add('active');
      console.log('[Discovery] Screen activated:', screenName);
    } else {
      console.error('[Discovery] Screen NOT FOUND:', `screen-${screenName}`);
    }
  }

  // ============================================================================
  // STAGE MANAGEMENT - SINGLE LINE
  // ============================================================================
  
  showStage(index) {
    if (index >= this.stages.length) return;
    
    this.stageIndex = index;
    const stage = this.stages[index];
    
    if (this.statusTextEl) {
      this.statusTextEl.textContent = stage.label;
    }
    
    if (this.statusLineEl) {
      this.statusLineEl.classList.remove('completed');
      this.statusLineEl.classList.add('active');
    }
    
    console.log('[Discovery] Stage:', stage.name, '-', stage.label);
  }
  
  completeCurrentStage() {
    if (this.stageIndex >= this.stages.length) return;
    
    const stage = this.stages[this.stageIndex];
    stage.completed = true;
    
    if (this.statusLineEl) {
      this.statusLineEl.classList.remove('active');
      this.statusLineEl.classList.add('completed');
    }
    
    console.log('[Discovery] Stage completed:', stage.name);
  }
  
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// ONBOARDING FLOW
// ============================================================================

class OnboardingFlow {
  constructor() {
    this.currentStep = 'welcome';
    this.googleEmail = null;
    this.apiKeyValidated = false;
    this.userEmail = null;
    
    this.setupListeners();
    this.loadUserEmail();
    this.setupButtons();
  }

  setupButtons() {
    const btnStart = document.getElementById('btn-start-onboarding');
    const btnGoogleLogin = document.getElementById('btn-google-login');
    const btnAIStudio = document.getElementById('btn-open-aistudio');

    if (btnStart) {
      btnStart.addEventListener('click', () => this.startOnboarding());
    }
    if (btnGoogleLogin) {
      btnGoogleLogin.addEventListener('click', () => this.openGoogleLogin());
    }
    if (btnAIStudio) {
      btnAIStudio.addEventListener('click', () => this.openAIStudio());
    }
  }

  async loadUserEmail() {
    try {
      const result = await chrome.storage.local.get('synapseConfig');
      const synapseConfig = result.synapseConfig;
      
      if (synapseConfig?.email) {
        this.userEmail = synapseConfig.email;
        console.log('[Onboarding] User email loaded:', this.userEmail);
      } else {
        this.userEmail = self.SYNAPSE_CONFIG?.email || null;
      }
    } catch (error) {
      console.error('[Onboarding] Error loading email:', error);
      this.userEmail = self.SYNAPSE_CONFIG?.email || null;
    }
  }

  setupListeners() {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.onboarding_state) {
        const state = changes.onboarding_state.newValue;
        this.syncWithState(state);
      }
    });
  }

  async checkResume() {
    const result = await chrome.storage.local.get('onboarding_state');
    const state = result.onboarding_state;

    if (!state || !state.active) return;

    if (state.googleEmail && !state.geminiKeyValidated) {
      this.googleEmail = state.googleEmail;
      this.showScreen('gemini-api');
    } else if (state.geminiKeyValidated) {
      this.showScreen('onboarding-success');
    }
  }

  syncWithState(state) {
    if (state.googleEmail && !this.googleEmail) {
      this.googleEmail = state.googleEmail;
      this.showScreen('gemini-api');
    }
    
    if (state.geminiKeyValidated && !this.apiKeyValidated) {
      this.handleApiKeyValidated();
    }
  }

  showScreen(screenName) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const screen = document.getElementById(`screen-${screenName}`);
    if (screen) {
      screen.classList.add('active');
      this.currentStep = screenName;
    }
  }

  startOnboarding() {
    console.log('[Onboarding] startOnboarding() called');
    
    chrome.runtime.sendMessage({
      event: 'onboarding_started'
    });
    
    this.showScreen('google-login');
  }

  openGoogleLogin() {
    const email = this.userEmail || '';
    
    const loginUrl = email 
        ? `https://accounts.google.com/ServiceLogin?Email=${encodeURIComponent(email)}&continue=https://myaccount.google.com/`
        : 'https://accounts.google.com/ServiceLogin?continue=https://myaccount.google.com/';

    chrome.tabs.create({ url: loginUrl });
    this.showScreen('google-waiting');

    chrome.storage.local.set({
        onboarding_state: {
        active: true,
        currentStep: 'google_login_waiting',
        startedAt: Date.now()
        }
    });
  }

  openAIStudio() {
    chrome.tabs.create({ 
      url: 'https://aistudio.google.com/app/apikey' 
    });
    
    this.showScreen('gemini-waiting');

    chrome.storage.local.get('onboarding_state', (result) => {
      const state = result.onboarding_state || {};
      chrome.storage.local.set({
        onboarding_state: {
          ...state,
          currentStep: 'gemini_api_waiting'
        }
      });
    });
  }

  handleApiKeyValidated() {
    this.apiKeyValidated = true;
    
    const emailEl = document.getElementById('final-email');
    if (emailEl) {
      emailEl.textContent = this.googleEmail || '-';
    }
    
    this.showScreen('onboarding-success');

    setTimeout(() => {
      chrome.runtime.sendMessage({
        event: 'onboarding_complete',
        payload: {
          email: this.googleEmail,
          api_key_validated: true
        }
      });

      setTimeout(() => {
        window.close();
      }, 3000);
    }, 2000);
  }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
  if (!window.PROTOCOL) {
    console.error('[Discovery] PROTOCOL not found!');
    return;
  }

  try {
    if (chrome?.storage?.local) {
      await chrome.storage.local.remove('discovery_open_lock');
      console.log('[Discovery] Lock released');
    }
  } catch (e) {
    console.warn('[Discovery] Lock release failed:', e);
  }
  
  window.BLOOM_VALIDATOR = new DiscoveryFlow();
  window.ONBOARDING = new OnboardingFlow();
  
  await window.BLOOM_VALIDATOR.start();
  await window.ONBOARDING.checkResume();
  
  console.log('[Discovery] Initialized');
});

console.log('[Discovery] 🚀 Script loaded:', new Date().toISOString());