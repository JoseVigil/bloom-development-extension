// ============================================================================
// SYNAPSE DISCOVERY + ONBOARDING - UNIFIED SCRIPT
// v1.1.0 — Paso 1 github_auth
// Cambios:
//   1. loadSynapseConfig: stepCurrent ahora string (no numero)
//   2. transitionToOnboarding: routeToStep() por step string
//   3. Nueva pantalla github-login via routeToStep("github_auth")
//   4. Nueva clase GithubAuthFlow: clipboard, recibo, guardado en vault_temp
//   5. Listener onboarding_navigate para resume remoto desde Nucleus
// ============================================================================

class DiscoveryFlow {
  constructor() {
    this.protocol = window.PROTOCOL;
    this.config = this.protocol.config;
    this.extensionId = self.SYNAPSE_CONFIG?.extension_id;
    
    this.requiresRegistration = false;
    this.heartbeatMode = false;
    this.serviceTarget = null;
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
        // launch_flags es el nodo canónico; raíz como fallback legacy
        const flags = synapseConfig.launch_flags || synapseConfig;

        this.requiresRegistration = flags.register === true;
        this.heartbeatMode        = flags.heartbeat === true;
        this.serviceTarget        = flags.service || null;
        this.stepCurrent          = flags.step ?? null;  // string desde Paso 1
        this.profileAlias         = flags.alias || null;
        this.profileRole          = flags.role || null;
        this.userEmail            = flags.email || synapseConfig.email || null;
        this.extensionOverride    = flags.extension || null;
        this.launchMode           = flags.mode || null;
        this.linkedAccounts       = flags.linked_accounts || [];

        console.log('[Discovery] Config loaded - register:', this.requiresRegistration);
        console.log('[Discovery] Config loaded - heartbeat:', this.heartbeatMode);
        console.log('[Discovery] Config loaded - service:', this.serviceTarget);
        console.log('[Discovery] Config loaded - step:', this.stepCurrent);
        console.log('[Discovery] Config loaded - email:', this.userEmail);
      } else {
        // Fallback a SYNAPSE_CONFIG
        const flags = self.SYNAPSE_CONFIG?.launch_flags || self.SYNAPSE_CONFIG;

        this.requiresRegistration = flags?.register === true;
        this.heartbeatMode        = flags?.heartbeat === true;
        this.serviceTarget        = flags?.service || null;
        this.stepCurrent          = flags?.step ?? null;  // string desde Paso 1
        this.profileAlias         = flags?.alias || null;
        this.profileRole          = flags?.role || null;
        this.userEmail            = flags?.email || self.SYNAPSE_CONFIG?.email || null;
        this.extensionOverride    = flags?.extension || null;
        this.launchMode           = flags?.mode || null;
        this.linkedAccounts       = flags?.linked_accounts || [];

        console.warn('[Discovery] Fallback to SYNAPSE_CONFIG');
      }
    } catch (error) {
      console.error('[Discovery] Error loading config:', error);
      const flags = self.SYNAPSE_CONFIG?.launch_flags || self.SYNAPSE_CONFIG;

      this.requiresRegistration = flags?.register === true;
      this.heartbeatMode        = flags?.heartbeat === true;
      this.serviceTarget        = flags?.service || null;
      this.stepCurrent          = flags?.step ?? null;  // string desde Paso 1
      this.profileAlias         = flags?.alias || null;
      this.profileRole          = flags?.role || null;
      this.userEmail            = flags?.email || self.SYNAPSE_CONFIG?.email || null;
      this.extensionOverride    = flags?.extension || null;
      this.launchMode           = flags?.mode || null;
      this.linkedAccounts       = flags?.linked_accounts || [];
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
    
    // Si es modo heartbeat, enviar evento y preparar cierre
    if (this.heartbeatMode && !this.requiresRegistration) {
      console.log('[Discovery] Heartbeat mode detected - sending HEARTBEAT_SUCCESS');
      this.sendHeartbeatSuccess();
      await this.delay(2000);
      window.close();
      return;
    }
    
    this.transitionToSuccess(payload);
  }

  sendHeartbeatSuccess() {
    try {
      chrome.runtime.sendMessage(
        {
          event: 'HEARTBEAT_SUCCESS',
          status: 'ok',
          timestamp: Date.now()
        },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error('[Discovery] Error sending heartbeat:', chrome.runtime.lastError);
            return;
          }
          console.log('[Discovery] HEARTBEAT_SUCCESS sent:', response);
        }
      );
    } catch (error) {
      console.error('[Discovery] Exception sending heartbeat:', error);
    }
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
    console.log('[Discovery] stepCurrent:', this.stepCurrent);
    console.log('[Discovery] serviceTarget:', this.serviceTarget);

    chrome.runtime.sendMessage({
      event: 'onboarding_started'
    });

    setTimeout(() => {
      // Paso 1: Si Ignition inyectó un step string, usarlo directamente.
      // Esto cubre tanto el inicio fresco como el resume tras cierre de Chrome.
      if (this.stepCurrent) {
        this.routeToStep(this.stepCurrent);
      } else {
        this.routeToServiceFlow(this.serviceTarget);
      }
    }, 2000);
  }

  routeToStep(step) {
    console.log('[Discovery] routeToStep() - step:', step);
    switch (step) {
      case 'github_auth':
        console.log('[Discovery] Routing to github_auth flow');
        this.showScreen('github-login');
        // Inicializar el flujo de GitHub auth
        if (!window.GITHUB_FLOW) {
          window.GITHUB_FLOW = new GithubAuthFlow(this);
          window.GITHUB_FLOW.init();
        }
        break;
      case 'google_auth':
        this.showScreen('google-login');
        break;
      default:
        console.log('[Discovery] Unknown step, falling back to serviceFlow:', step);
        this.routeToServiceFlow(this.serviceTarget);
    }
  }

  routeToServiceFlow(service) {
    console.log('[Discovery] routeToServiceFlow() - service:', service);

    switch (service) {
      case 'google':
        console.log('[Discovery] Routing to Google flow');
        this.showScreen('onboarding-welcome');
        break;

      case 'github':
        console.log('[Discovery] Routing to GitHub auth flow');
        this.showScreen('github-login');
        if (!window.GITHUB_FLOW) {
          window.GITHUB_FLOW = new GithubAuthFlow(this);
          window.GITHUB_FLOW.init();
        }
        break;

      // Próximos services se agregan aquí:
      // case 'openai':
      // case 'claude':
      // case 'xai':

      default:
        // Sin service definido → el usuario elige el provider
        console.log('[Discovery] No service specified, routing to provider-select');
        this.showScreen('provider-select');
        break;
    }
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

    // Paso 1: escuchar navegación remota desde Nucleus CLI via
    // brain TCP → bloom-host → background.js → discovery.js
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.command === 'onboarding_navigate' && msg.payload?.step) {
        console.log('[Onboarding] Remote navigate to step:', msg.payload.step);
        window.BLOOM_VALIDATOR?.routeToStep?.(msg.payload.step);
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
// GITHUB AUTH FLOW — Paso 1
// Maneja la pantalla github-login: instrucciones, clipboard monitor,
// recibo de confirmación y guardado en chrome.storage.local.bloom_vault_temp.
// El token real de GitHub NUNCA sale de chrome.storage ni de esta clase.
// ============================================================================

class GithubAuthFlow {
  constructor(discovery) {
    this.discovery = discovery;
    this._tokenSaved = false;
  }

  // ── SHA-256 primeros 8 chars del token (fingerprint) ──
  async sha256Prefix(text) {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hash = await crypto.subtle.digest('SHA-256', data);
    const hex = Array.from(new Uint8Array(hash))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    return hex.substring(0, 8);
  }

  // ── Detectar OS para mostrar info de cifrado ──
  osEncryptionLabel() {
    const platform = navigator.platform || navigator.userAgent;
    if (platform.toLowerCase().includes('win')) return 'DPAPI (Windows Data Protection API)';
    if (platform.toLowerCase().includes('mac')) return 'macOS Keychain';
    return 'OS-level encryption';
  }

  init() {
    console.log('[GithubAuthFlow] init()');

    // Botón "Abrir GitHub" → abre la URL de tokens con scopes preseleccionados
    const btnOpen = document.getElementById('btn-open-github-tokens');
    if (btnOpen) {
      btnOpen.addEventListener('click', () => {
        const url = 'https://github.com/settings/tokens/new'
          + '?scopes=repo,read:org'
          + '&description=Bloom+Conductor';
        chrome.tabs.create({ url });
        this._startClipboardMonitor();
        this._showWaitingState();
      });
    }

    // Botón de rechazo en pantalla de confirmación
    const btnReject = document.getElementById('btn-reject-github-token');
    if (btnReject) {
      btnReject.addEventListener('click', () => {
        this._tokenSaved = false;
        this.discovery.showScreen('github-login');
        this._startClipboardMonitor();
      });
    }

    // Botón de confirmación en pantalla de confirmación
    const btnConfirm = document.getElementById('btn-confirm-github-token');
    if (btnConfirm) {
      btnConfirm.addEventListener('click', async () => {
        const token = this._pendingToken;
        if (!token) return;
        await this._saveToken(token);
      });
    }

    // Escuchar el token detectado desde background.js
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.event === 'GITHUB_PAT_DETECTED' && msg.token && !this._tokenSaved) {
        this._handleTokenDetected(msg.token);
      }
    });
  }

  _startClipboardMonitor() {
    chrome.runtime.sendMessage({ action: 'startClipboardMonitoring' });
    console.log('[GithubAuthFlow] Clipboard monitoring started');
  }

  _showWaitingState() {
    const waitMsg = document.getElementById('github-waiting-message');
    if (waitMsg) waitMsg.style.display = 'block';
    const btnOpen = document.getElementById('btn-open-github-tokens');
    if (btnOpen) btnOpen.textContent = '↗ GitHub abierto — pegá el token';
  }

  async _handleTokenDetected(token) {
    console.log('[GithubAuthFlow] Token detected — showing confirmation receipt');
    this._pendingToken = token;

    const fingerprint = await this.sha256Prefix(token);
    const preview = token.substring(0, 8) + '****...';

    // Mostrar pantalla de recibo/confirmación
    this.discovery.showScreen('github-confirm');

    // Poblar los campos del recibo
    const elPreview   = document.getElementById('github-token-preview');
    const elStorage   = document.getElementById('github-storage-location');
    const elEncrypt   = document.getElementById('github-os-encryption');
    const elBloomSees = document.getElementById('github-bloom-sees');

    if (elPreview)   elPreview.textContent   = preview;
    if (elStorage)   elStorage.textContent   = 'Chrome Storage — solo este equipo';
    if (elEncrypt)   elEncrypt.textContent   = this.osEncryptionLabel();
    if (elBloomSees) elBloomSees.textContent = token.substring(0, 4) + '****';

    // Guardar fingerprint para referencia
    const elFingerprint = document.getElementById('github-token-fingerprint');
    if (elFingerprint) elFingerprint.textContent = fingerprint;
  }

  async _saveToken(token) {
    if (this._tokenSaved) return;
    this._tokenSaved = true;

    console.log('[GithubAuthFlow] Saving token to bloom_vault_temp');

    // Leer vault_temp existente (o crear vacío)
    let vault = {};
    try {
      const result = await chrome.storage.local.get('bloom_vault_temp');
      vault = result.bloom_vault_temp || {};
    } catch (_) {}

    // Guardar token en vault_temp
    vault.github_token = token;

    // Intentar obtener el username via GitHub API (best-effort, no bloquea)
    try {
      const resp = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });
      if (resp.ok) {
        const user = await resp.json();
        vault.github_user = user.login;
        console.log('[GithubAuthFlow] GitHub user resolved:', user.login);
      }
    } catch (e) {
      console.warn('[GithubAuthFlow] Could not resolve GitHub user (non-fatal):', e.message);
    }

    await chrome.storage.local.set({ bloom_vault_temp: vault });
    console.log('[GithubAuthFlow] bloom_vault_temp updated');

    // Calcular fingerprint para el evento — token real NUNCA sale en el mensaje
    const fingerprint = await this.sha256Prefix(token);

    // Emitir GITHUB_TOKEN_STORED a background.js → host → ServerManager
    chrome.runtime.sendMessage({
      event:             'GITHUB_TOKEN_STORED',
      token_fingerprint: fingerprint,
      profile_id:        self.SYNAPSE_CONFIG?.profileId,
      launch_id:         self.SYNAPSE_CONFIG?.launchId,
    });

    // Actualizar onboarding_state local
    await chrome.storage.local.set({
      onboarding_state: {
        active:       true,
        currentStep:  'github_auth_complete',
        githubUser:   vault.github_user || null,
        startedAt:    Date.now()
      }
    });

    // Mostrar pantalla de éxito
    this.discovery.showScreen('github-stored');

    // Poblar datos en la pantalla de éxito
    const elUser    = document.getElementById('github-stored-user');
    const elPreview = document.getElementById('github-stored-preview');
    if (elUser && vault.github_user) elUser.textContent = vault.github_user;
    if (elPreview) elPreview.textContent = token.substring(0, 4) + '****';

    console.log('[GithubAuthFlow] github_auth step complete. Fingerprint:', fingerprint);
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

// ============================================================================
// MULTI-PROVIDER JAVASCRIPT
// ============================================================================

// Provider configuration
const PROVIDER_CONFIG = {
  gemini: {
    name: 'Gemini',
    displayName: 'Gemini (Google)',
    consoleUrl: 'https://aistudio.google.com/app/apikey',
    keyFormat: 'AIzaSy...',
    instructions: [
      'Haz clic en "Create API Key"',
      'Selecciona tu proyecto de Google Cloud',
      'Copia la key generada (comienza con AIzaSy)'
    ]
  },
  claude: {
    name: 'Claude',
    displayName: 'Claude (Anthropic)',
    consoleUrl: 'https://console.anthropic.com/settings/keys',
    keyFormat: 'sk-ant-api03-...',
    instructions: [
      'Haz clic en "+ Create Key"',
      'Asigna un nombre (ej: "Bloom")',
      'Copia la key generada (comienza con sk-ant-)'
    ]
  },
  openai: {
    name: 'ChatGPT',
    displayName: 'ChatGPT (OpenAI)',
    consoleUrl: 'https://platform.openai.com/api-keys',
    keyFormat: 'sk-...',
    instructions: [
      'Haz clic en "+ Create new secret key"',
      'Asigna un nombre descriptivo',
      'Copia la key (comienza con sk-)'
    ]
  },
  xai: {
    name: 'Grok',
    displayName: 'Grok (xAI)',
    consoleUrl: 'https://console.x.ai/keys',
    keyFormat: 'xai-...',
    instructions: [
      'Haz clic en "New API Key"',
      'Asigna permisos necesarios',
      'Copia la key generada (comienza con xai-)'
    ]
  }
};

class MultiProviderOnboarding extends OnboardingFlow {
  constructor() {
    super();
    this.selectedProvider = null;
    this.setupProviderSelection();
    this.setupAPIKeyListeners();
  }

  setupProviderSelection() {
    // Provider cards click handlers
    document.querySelectorAll('.provider-card').forEach(card => {
      card.addEventListener('click', () => {
        const provider = card.dataset.provider;
        this.selectProvider(provider);
      });
    });

    // Skip button
    const btnSkip = document.getElementById('btn-skip-provider');
    if (btnSkip) {
      btnSkip.addEventListener('click', () => {
        // Skip to completion
        this.showScreen('onboarding-success');
      });
    }

    // Back button
    const btnBack = document.getElementById('btn-back-to-providers');
    if (btnBack) {
      btnBack.addEventListener('click', () => {
        this.showScreen('provider-select');
      });
    }
  }

  setupAPIKeyListeners() {
    // Listen for API_KEY_REGISTERED from background.js
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.event === 'API_KEY_REGISTERED') {
        this.handleAPIKeyRegistered(msg);
      }
    });
  }

  selectProvider(provider) {
    this.selectedProvider = provider;
    const config = PROVIDER_CONFIG[provider];

    // Update UI
    document.getElementById('provider-name-display').textContent = config.displayName;
    document.getElementById('instructions-title').textContent = `Instrucciones para ${config.name}:`;
    
    const instructionsList = document.getElementById('instructions-list');
    instructionsList.innerHTML = config.instructions
      .map(step => `<li>${step}</li>`)
      .join('');

    document.getElementById('key-format-example').textContent = config.keyFormat;

    // Setup console button
    const btnConsole = document.getElementById('btn-open-console');
    btnConsole.onclick = () => {
      chrome.tabs.create({ url: config.consoleUrl });
    };

    // Start clipboard monitoring
    chrome.runtime.sendMessage({ action: 'startClipboardMonitoring' });

    // Transition to waiting screen
    this.showScreen('api-waiting');
  }

  handleAPIKeyRegistered(message) {
    const { provider, profile_name } = message;
    const config = PROVIDER_CONFIG[provider];

    // Stop clipboard monitoring
    chrome.runtime.sendMessage({ action: 'stopClipboardMonitoring' });

    // Update success screen
    document.getElementById('success-provider-name').textContent = config.displayName;
    document.getElementById('success-provider-display').textContent = config.displayName;
    document.getElementById('success-profile-name').textContent = profile_name;

    // Setup action buttons
    document.getElementById('btn-add-another-key').onclick = () => {
      this.showScreen('provider-select');
    };

    document.getElementById('btn-finish-setup').onclick = () => {
      window.close();
    };

    // Show success
    this.showScreen('api-success');
  }
}

// Update initialization to use MultiProviderOnboarding
if (typeof document !== 'undefined') {
  const originalDOMContentLoaded = document.addEventListener;
  document.addEventListener = function(event, handler, ...args) {
    if (event === 'DOMContentLoaded') {
      const wrappedHandler = async function(e) {
        await handler(e);
        // Replace OnboardingFlow with MultiProviderOnboarding after initialization
        if (window.ONBOARDING instanceof OnboardingFlow && !(window.ONBOARDING instanceof MultiProviderOnboarding)) {
          window.ONBOARDING = new MultiProviderOnboarding();
        }
      };
      return originalDOMContentLoaded.call(this, event, wrappedHandler, ...args);
    }
    return originalDOMContentLoaded.call(this, event, handler, ...args);
  };
}