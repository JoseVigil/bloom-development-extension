// ============================================================================
// SYNAPSE DISCOVERY + ONBOARDING - UNIFIED SCRIPT
// v1.2.0 — GitHub App / Device Flow (reemplaza el viejo flujo de PAT)
// Cambios v1.1.0 (base):
//   1. loadSynapseConfig: stepCurrent ahora string (no numero)
//   2. transitionToOnboarding: routeToStep() por step string
//   3. Nueva pantalla github-login via routeToStep("github_auth")
//   4. Nueva clase GithubAuthFlow: clipboard, recibo, guardado en vault_temp
//   5. Listener onboarding_navigate para resume remoto desde Nucleus
// Cambios v1.2.0 (esta sesión — ver HANDOFF-github-app-batcave-synapse.md):
//   6. Step renombrado github_auth → github_app_auth (alineado con
//      milestone-registry.js y DISCOVERY_PROTOCOL_MANIFEST)
//   7. GithubAuthFlow (PAT + clipboard) reemplazada por GithubAppAuthFlow
//      (Device Flow): pantallas github-app-start / github-app-device /
//      github-app-stored. El token real ya no pasa por esta capa — viaje
//      background.js → host por Native Messaging.
//   8. _populateVaultReceipt() ahora lee el username de github desde
//      bloom_profile_state.accounts en vez de bloom_vault_temp.github_user
// ============================================================================

// ============================================================================
// VAULT_HARDENED — flag temporal, borrar cuando el vault deje de ser un stub.
//
// El vault real (Go, host-side) todavía es un stub: recibe GITHUB_APP_TOKEN
// por Native Messaging pero no está confirmado que lo persista de forma
// segura del otro lado. Mientras eso sea así, la pantalla 'vault-created'
// (step vault_init) no puede prometerle al usuario una garantía de seguridad
// que el sistema todavía no cumple — mismo tipo de error que el texto viejo
// "encrypted in the Chrome shield" que reemplazamos.
//
// Poner en `true` SOLO cuando:
//   1. El fix de vault.go esté mergeado (persistencia real del token, no stub)
//   2. El handler de Nucleus que recibe GITHUB_APP_TOKEN esté verificado
//      end-to-end (Prompts 1 y 1B — ver HANDOFF)
//
// Hasta entonces, dejar en `false`. Con `false` se muestra la copy con
// advertencia explícita, pensada para el caso de que alguien fuera de tu
// control (tester externo, otro dev) llegue a esta pantalla antes de que el
// vault esté terminado. Con `true` se muestra la copy honesta-optimista,
// pensada para cuando la arquitectura real ya cumple lo que dice.
const VAULT_HARDENED = false;

const VAULT_RECEIPT_COPY = {
  // Versión honesta-optimista — vault.go terminado y verificado.
  hardened: {
    title:    'Key Sent to Bloom',
    subtitle: "Your GitHub token was forwarded directly to the Bloom host app. It isn't stored in Chrome.",
    delivery: 'Native Messaging',
    footer:   "Your token doesn't stay in the browser. Only this fingerprint remains here, for reference."
  },
  // Versión con advertencia explícita — vault.go todavía stub.
  unhardened: {
    title:    'Key Sent to Bloom',
    subtitle: "Your GitHub token was forwarded directly to the Bloom host app. It isn't stored in Chrome.",
    delivery: 'Native Messaging (in development)',
    footer:   "Currently in development — end-to-end key protection on the host is not yet finalized."
  }
};
// ============================================================================


// Reemplaza los badges "Step X of Y" hardcodeados en cada screen del HTML.
// Solo lista milestones VISIBLES para el usuario — los pasos host-driven sin
// UI propia (nucleus_create, project_create) no ocupan un lugar acá: no
// mueven el contador porque el usuario nunca los ve.
//
// Varias pantallas pueden pertenecer al mismo step (ej: github-app-start,
// github-app-device y github-app-stored son todas sub-estados de "github_app_auth").
// El badge muestra el MISMO "Paso N de TOTAL" para todas ellas — no fingimos
// granularidad fina que el usuario no puede verificar.
// ============================================================================
// NOTA (migración GitHub App): el step se renombró de 'github_auth' a
// 'github_app_auth' para quedar alineado 1:1 con milestone-registry.js
// (HANDOFF §5.2) y con DISCOVERY_PROTOCOL_MANIFEST.messages[0].parameters
// options en discoveryProtocol.js, que YA declaraba 'github_app_auth' como
// único valor válido — este archivo era el que había quedado desincronizado.
const STEP_SEQUENCE = [
  { id: 'github_app_auth',   label: 'GitHub' },
  { id: 'vault_init',        label: 'Vault' },
  { id: 'google_auth',       label: 'Google' },
  { id: 'ai_provider_setup', label: 'Gemini API' },
  { id: 'success',           label: 'Listo' }
];

// screenName (el sufijo usado en id="screen-<screenName>") → stepId en STEP_SEQUENCE.
// 'secondary' = pantalla fuera del chain principal (ej: agregar otro provider
// después de terminar el onboarding) — no tiene número global, se lo deja como
// vino en el HTML (data-step-id="secondary" en index.html).
const SCREEN_STEP_MAP = {
  'github-app-start':    'github_app_auth',
  'github-app-device':   'github_app_auth',
  'github-app-stored':   'github_app_auth',
  'vault-created':       'vault_init',
  'google-auth-login':   'google_auth',
  'google-auth-confirm': 'google_auth',
  'api-waiting':         'ai_provider_setup',
  'api-success':         'ai_provider_setup',
  'onboarding-success':  'success'
};

/**
 * syncStepUI(screenName)
 * Busca los elementos #progress-fill--<screenName> y #step-indicator--<screenName>
 * en la pantalla activa y los completa con el número/porcentaje real, calculado
 * contra STEP_SEQUENCE. No hace nada si la pantalla no participa del chain
 * principal (no está en SCREEN_STEP_MAP) — evita reventar en pantallas legacy
 * o en la grilla de "agregar otro provider".
 */
function syncStepUI(screenName) {
  const stepId = SCREEN_STEP_MAP[screenName];
  if (!stepId) return;

  const index = STEP_SEQUENCE.findIndex(s => s.id === stepId);
  if (index === -1) return;

  const total = STEP_SEQUENCE.length;
  const humanStep = index + 1;
  const pct = Math.round((humanStep / total) * 100);

  const fillEl = document.getElementById(`progress-fill--${screenName}`);
  const badgeEl = document.getElementById(`step-indicator--${screenName}`);

  if (fillEl) fillEl.style.width = `${pct}%`;
  if (badgeEl) badgeEl.textContent = `Step ${humanStep} of ${total}`;

  console.log(`[StepUI] ${screenName} → step ${humanStep}/${total} (${stepId}, ${pct}%)`);
}

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

    // ── HANDSHAKE GATE ──────────────────────────────────────────────────────
    // El handshake animado (5 stages) solo tiene sentido la PRIMERA vez que el
    // usuario abre la registración — es lo que le muestra que el sistema está
    // vivo. En pasos posteriores (google_auth, ai_provider_setup, etc.) esta
    // misma página puede volver a cargar — ver openDiscoveryTab() en
    // background.js — y antes replayaba las 5 fases cada vez, generando el
    // "espamento" reportado. Se gatea por launch_id en storage porque es lo
    // único que sobrevive a un reload de la tab.
    const { synapse_handshake_seen } = await chrome.storage.local.get('synapse_handshake_seen');
    const currentLaunchId = self.SYNAPSE_CONFIG?.launchId || null;
    this.skipHandshakeAnimation = !!currentLaunchId && synapse_handshake_seen?.launch_id === currentLaunchId;

    if (this.skipHandshakeAnimation) {
      console.log('[Discovery] Handshake ya visto para este launch_id — modo silencioso');
    } else {
      // Stage 1: Initializing
      this.showStage(0);
      await this.delay(800);
      this.completeCurrentStage();
    }

    this.protocol.executePhase('initialization', { validator: this });

    if (!this.extensionId) {
      this.transitionToError('Extension ID not available', {
        config: self.SYNAPSE_CONFIG,
        error: 'MISSING_EXTENSION_ID'
      });
      return;
    }

    // Stage 2: Searching
    if (!this.skipHandshakeAnimation) {
      this.showStage(1);
      await this.delay(600);
    }

    this.setupStorageListener();

    // Leer el estado actual de storage antes de arrancar el ping loop.
    // Cubre el caso donde el handshake ya estaba confirmado cuando discovery
    // abre (background completó el handshake antes del DOMContentLoaded).
    // Sin este check, discovery queda esperando un cambio que nunca llega
    // porque storage no dispara onChanged si el valor no cambia.
    try {
      const stored = await chrome.storage.local.get('synapseStatus');
      if (stored?.synapseStatus?.command === 'system_ready') {
        console.log('[Discovery] synapseStatus already system_ready — resolving immediately');
        this.handleSystemReady(stored.synapseStatus.payload);
        return;
      }
    } catch (e) {
      console.warn('[Discovery] Initial storage read failed:', e);
    }

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

        console.log('[Discovery] synapseConfig not in storage yet - using SYNAPSE_CONFIG defaults');
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
    // Comando manual de QA/demo — corre la animación de handshake una vez,
    // sin afectar synapse_handshake_seen ni el estado real de conexión.
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.event === 'TEST_HANDSHAKE_ANIMATION') {
        this.replayHandshakeAnimationForTesting();
      }
    });

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

    if (!this.skipHandshakeAnimation) {
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

      // Handshake completo y visto por el usuario — persistir para que, si esta
      // tab se recarga más adelante en el mismo launch (ver openDiscoveryTab en
      // background.js), no se vuelva a animar. Ver comando TEST_HANDSHAKE_ANIMATION
      // para poder re-disparar la animación manualmente sin tocar este flag.
      const launchId = self.SYNAPSE_CONFIG?.launchId || null;
      if (launchId) {
        try {
          await chrome.storage.local.set({
            synapse_handshake_seen: { launch_id: launchId, timestamp: Date.now() }
          });
        } catch (e) {
          console.warn('[Discovery] No se pudo persistir synapse_handshake_seen:', e);
        }
      }
    }

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

    this._initProfileState();

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
      case 'github_app_auth':
        console.log('[Discovery] Routing to github_app_auth flow (Device Flow)');
        this.showScreen('github-app-start');
        // Inicializar el flujo de GitHub App auth (Device Flow)
        if (!window.GITHUB_FLOW) {
          window.GITHUB_FLOW = new GithubAppAuthFlow(this);
          window.GITHUB_FLOW.init();
        }
        break;
      case 'google_auth':
        console.log('[Discovery] Routing to google_auth flow (passive discovery)');
        this.showScreen('google-auth-login');
        if (!window.GOOGLE_FLOW) {
          window.GOOGLE_FLOW = new GoogleAuthFlow(this);
          window.GOOGLE_FLOW.init();
        }
        break;
      case 'nucleus_create':
        console.log('[Discovery] nucleus_create — paso gestionado por host, esperando siguiente step');
        // No hay UI propia; el host emite el siguiente step cuando termina
        break;
      case 'vault_init':
        console.log('[Discovery] vault_init — mostrando recibo de vault');
        this.showScreen('vault-created');
        this._populateVaultReceipt();
        break;
      case 'ai_provider_setup':
        // En este chain el proveedor ya está decidido (Gemini) — mostrar la
        // grilla de 4 opciones acá sería preguntarle al usuario algo que el
        // flujo ya resolvió. La grilla (screen-provider-select) queda para el
        // flujo secundario "Agregar otra key" post-éxito, donde el usuario sí
        // elige a propósito.
        console.log('[Discovery] Routing to ai_provider_setup flow — Gemini directo');
        if (window.ONBOARDING?.selectProvider) {
          window.ONBOARDING.selectProvider('gemini');
        } else {
          console.warn('[Discovery] window.ONBOARDING.selectProvider no disponible aún — fallback a grilla');
          this.showScreen('provider-select');
        }
        break;
      case 'project_create':
        console.log('[Discovery] project_create — paso gestionado por host, esperando siguiente step');
        break;
      case 'success':
        console.log('[Discovery] Onboarding completo → success');
        this._markOnboardingComplete();
        this.showScreen('onboarding-success');
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
        // Bloom intro screen → OnboardingFlow.startOnboarding() lleva a
        // google-auth-login, la misma pantalla pasiva que usa el chain
        // host-driven. Una sola implementación de Google auth, no dos.
        console.log('[Discovery] Routing to Google flow');
        this.showScreen('onboarding-welcome');
        break;

      case 'github':
        console.log('[Discovery] Routing to GitHub App auth flow (Device Flow)');
        this.showScreen('github-app-start');
        if (!window.GITHUB_FLOW) {
          window.GITHUB_FLOW = new GithubAppAuthFlow(this);
          window.GITHUB_FLOW.init();
        }
        break;

      // Próximos services se agregan aquí:
      // case 'openai':
      // case 'claude':
      // case 'xai':

      default:
        // Sin service definido → GitHub es el primer paso de registro
        console.log('[Discovery] No service specified, defaulting to github_app_auth');
        this.showScreen('github-app-start');
        if (!window.GITHUB_FLOW) {
          window.GITHUB_FLOW = new GithubAppAuthFlow(this);
          window.GITHUB_FLOW.init();
        }
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
      syncStepUI(screenName);
      console.log('[Discovery] Screen activated:', screenName);
    } else {
      console.error('[Discovery] Screen NOT FOUND:', `screen-${screenName}`);
    }
  }

  // ============================================================================
  // TEST HOOK — replay cosmético del handshake, para QA/demo
  // No toca synapse_handshake_seen ni el estado real de conexión: es puramente
  // visual, para poder mostrar/probar la animación sin afectar el gate de
  // producción (que solo debe correr una vez por launch_id).
  // ============================================================================
  async replayHandshakeAnimationForTesting() {
    console.log('[Discovery] TEST_HANDSHAKE_ANIMATION — replay cosmético iniciado');
    for (let i = 0; i < this.stages.length; i++) {
      this.stages[i].completed = false;
    }
    this.showStage(0);
    await this.delay(500);
    this.completeCurrentStage();
    this.showStage(1);
    await this.delay(500);
    this.completeCurrentStage();
    this.showStage(2);
    await this.delay(500);
    this.completeCurrentStage();
    this.showStage(3);
    await this.delay(500);
    this.completeCurrentStage();
    this.showStage(4);
    await this.delay(500);
    this.completeCurrentStage();
    console.log('[Discovery] TEST_HANDSHAKE_ANIMATION — replay completo');
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

  // ============================================================================
  // BLOOM PROFILE STATE — escritura de chrome.storage.local.bloom_profile_state
  // Landing solo lee este objeto; Discovery es el único que escribe.
  // ============================================================================

  _initProfileState() {
    const initial = {
      profile_id:          self.SYNAPSE_CONFIG?.profileId || null,
      onboarding_complete: false,
      last_updated:        Date.now(),
      accounts: [
        { provider: 'github', status: 'pending', username: null, email: null, created_at: null },
        { provider: 'google', status: 'pending', username: null, email: null, created_at: null },
        { provider: 'gemini', status: 'pending', username: null, email: null, created_at: null }
      ],
      vaults: []
    };
    chrome.storage.local.set({ bloom_profile_state: initial });
    console.log('[Discovery] bloom_profile_state inicializado');
  }

  // NOTA: convertidas a async/await (en vez de callback fire-and-forget) para
  // que _saveToken() pueda encadenarlas con `await` y evitar la race condition
  // donde dos get()/set() concurrentes sobre la misma clave se pisaban entre sí
  // (lost update: el segundo set() en completar sobreescribía con una copia
  // del estado leída ANTES de que el primero terminara de escribir).
  async _updateVaultState(fingerprint, provider = 'github') {
    const result = await chrome.storage.local.get('bloom_profile_state');
    const state = result.bloom_profile_state || { vaults: [] };
    if (!Array.isArray(state.vaults)) state.vaults = [];

    // FIX: antes esto siempre hacía push(), sin chequear si ya existía un
    // vault para este provider. Si _updateVaultState() se llama más de una
    // vez para el mismo provider (reconexión, reintento del harness, etc.)
    // terminaba duplicando la entrada en el array. Ahora se actualiza in-place
    // si ya existe.
    const entry = {
      provider,
      fingerprint,
      storage:    'chrome.storage.local',
      status:     'active',
      created_at: Date.now()
    };
    const idx = state.vaults.findIndex(v => v.provider === provider);
    if (idx >= 0) {
      state.vaults[idx] = entry;
    } else {
      state.vaults.push(entry);
    }

    state.last_updated = Date.now();
    await chrome.storage.local.set({ bloom_profile_state: state });
    console.log('[Discovery] bloom_profile_state — vault agregado/actualizado:', provider, fingerprint);
  }

  async _updateAccountState(provider, username) {
    const result = await chrome.storage.local.get('bloom_profile_state');
    const state = result.bloom_profile_state || { accounts: [] };
    if (!Array.isArray(state.accounts)) state.accounts = [];
    const account = state.accounts.find(a => a.provider === provider);
    if (account) {
      account.status     = 'connected';
      account.username   = username || null;
      account.created_at = Date.now();
    } else {
      state.accounts.push({
        provider:   provider,
        status:     'connected',
        username:   username || null,
        email:      null,
        created_at: Date.now()
      });
    }
    state.last_updated = Date.now();
    await chrome.storage.local.set({ bloom_profile_state: state });
    console.log('[Discovery] bloom_profile_state — cuenta actualizada:', provider, username || '(username no resuelto)');
  }

  _populateVaultReceipt() {
    chrome.storage.local.get(['bloom_profile_state', 'bloom_vault_temp'], (result) => {
      const state = result.bloom_profile_state || {};
      const vault = result.bloom_vault_temp || {};

      const latestVault = Array.isArray(state.vaults) && state.vaults.length > 0
        ? state.vaults[state.vaults.length - 1]
        : null;

      // FIX (migración GitHub App): GithubAppAuthFlow ya no escribe
      // bloom_vault_temp.github_user — el token real nunca toca esta capa,
      // viaja background.js → host por Native Messaging (ver HANDOFF §3).
      // El username ahora se lee de bloom_profile_state.accounts, poblado
      // por _updateAccountState('github', username) en GithubAppAuthFlow.
      // Se deja vault.github_user como fallback legacy por si queda un
      // perfil viejo con residuo del flujo PAT.
      const githubAccount = Array.isArray(state.accounts)
        ? state.accounts.find(a => a.provider === 'github')
        : null;

      const elUsername    = document.getElementById('vault-username');
      const elFingerprint = document.getElementById('vault-fingerprint');
      const elTitle       = document.getElementById('vault-created-title');
      const elSubtitle    = document.getElementById('vault-created-subtitle');
      const elDelivery    = document.getElementById('vault-delivery-method');
      const elFooter      = document.getElementById('vault-created-footer');

      if (elUsername) elUsername.textContent = githubAccount?.username || vault.github_user || '—';
      if (elFingerprint) elFingerprint.textContent = latestVault?.fingerprint || '—';

      // Copy swap según VAULT_HARDENED — ver comentario junto al flag arriba.
      const copy = VAULT_RECEIPT_COPY[VAULT_HARDENED ? 'hardened' : 'unhardened'];
      if (elTitle)    elTitle.textContent    = copy.title;
      if (elSubtitle) elSubtitle.textContent = copy.subtitle;
      if (elDelivery) elDelivery.textContent = copy.delivery;
      if (elFooter)   elFooter.textContent   = copy.footer;

      // Botón continuar → avanza al siguiente step (el host lo emitirá vía onboarding_navigate,
      // pero también habilitamos un avance manual para el caso de dev/fallback)
      const btnContinue = document.getElementById('btn-vault-continue');
      if (btnContinue && !btnContinue._bound) {
        btnContinue._bound = true;
        btnContinue.addEventListener('click', () => {
          console.log('[Discovery] vault-created continue → esperando siguiente step del host');
          // El host enviará onboarding_navigate con el step siguiente.
          // Si en dev querés avanzar sin host, descomentá la línea siguiente:
          // this.routeToStep('google_auth');
        });
      }
    });
  }

  _markOnboardingComplete() {
    chrome.storage.local.get('bloom_profile_state', (result) => {
      const state = result.bloom_profile_state || {};
      state.onboarding_complete = true;
      state.last_updated        = Date.now();
      chrome.storage.local.set({ bloom_profile_state: state });
      console.log('[Discovery] bloom_profile_state — onboarding_complete: true');
    });
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
    if (btnStart) {
      btnStart.addEventListener('click', () => this.startOnboarding());
    }
    // Los botones de la vieja pantalla google-login/gemini-api standalone
    // (btn-google-login, btn-open-aistudio) ya no existen en el HTML — la
    // pantalla real es google-auth-login/confirm, manejada por GoogleAuthFlow,
    // y api-waiting/api-success, manejada por MultiProviderOnboarding.
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

      // FIX: VAULT_INITIALIZED (harness/host) nunca escribía en
      // bloom_profile_state.vaults. _updateVaultState() solo se llamaba
      // desde GithubAuthFlow._saveToken(), atada al flujo real de
      // clipboard/paste del token en la pantalla github-login — un evento
      // de vault simulado o empujado por el host directamente (bypaseando
      // esa UI) nunca pasaba por ahí. Landing ya escucha VAULT_INITIALIZED
      // y recarga bloom_profile_state (ver landing.js setupMessageListener),
      // pero necesitaba que algo escribiera el vault primero. Este listener
      // cierra ese hueco.
      if (msg.event === 'VAULT_INITIALIZED') {
        console.log('[Onboarding] VAULT_INITIALIZED recibido — actualizando bloom_profile_state.vaults');
        const provider    = msg.provider || 'github';
        const fingerprint = msg.token_fingerprint || msg.vault_key || 'unknown';
        window.BLOOM_VALIDATOR?._updateVaultState?.(fingerprint, provider);
      }
    });
  }

  // NOTA: la vieja pareja checkResume()/syncWithState() esperaba que algo
  // escribiera onboarding_state.googleEmail / .geminiKeyValidated en storage,
  // pero nada en background.js ni en discovery.js escribía esos campos —
  // era código muerto que nunca se disparaba. El resume real ya lo cubre
  // DiscoveryFlow: lee stepCurrent de synapseConfig al cargar y rutea con
  // routeToStep(), que es lo mismo que usa la navegación en caliente desde
  // el host (onboarding_navigate). No hace falta un segundo mecanismo de
  // resume en paralelo — se eliminó para no tener dos fuentes de verdad.
  async checkResume() {
    console.log('[Onboarding] checkResume() — resume real delegado a DiscoveryFlow.stepCurrent');
  }

  showScreen(screenName) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const screen = document.getElementById(`screen-${screenName}`);
    if (screen) {
      screen.classList.add('active');
      syncStepUI(screenName);
      this.currentStep = screenName;
    }
  }

  // Entrada del flujo standalone (routeToServiceFlow('google'), sin step
  // dirigido por el host). Va directo a la MISMA pantalla pasiva de Google
  // que usa el chain host-driven — una sola implementación, dos entradas.
  startOnboarding() {
    console.log('[Onboarding] startOnboarding() called');

    chrome.runtime.sendMessage({
      event: 'onboarding_started'
    });

    this.showScreen('google-auth-login');
    if (!window.GOOGLE_FLOW) {
      window.GOOGLE_FLOW = new GoogleAuthFlow(window.BLOOM_VALIDATOR);
      window.GOOGLE_FLOW.init();
    }
  }
}


// ============================================================================
// GITHUB APP AUTH FLOW — Device Flow (reemplaza el viejo flujo de PAT)
// Maneja las pantallas github-app-start / github-app-device / github-app-stored.
//
// Contrato de mensajes (ver DISCOVERY_PROTOCOL_MANIFEST en discoveryProtocol.js
// y HANDOFF §3/§5.3):
//   discovery.js → background.js : { action: 'startGithubDeviceFlow' }
//   background.js → discovery.js : { event: 'GITHUB_DEVICE_CODE', user_code, verification_uri, expires_in }
//   background.js → discovery.js : { event: 'GITHUB_APP_AUTHORIZED', username, token_fingerprint, scopes, ... }
//   background.js → discovery.js : { event: 'GITHUB_DEVICE_FLOW_ERROR', reason }
//
// El token real NUNCA llega a esta clase ni a discovery.js: background.js lo
// recibe de GitHub, lo manda por Native Messaging directo al host (Brain/
// Nucleus) y solo notifica acá con username + fingerprint + scopes. Por eso
// esta clase no toca chrome.storage.local.bloom_vault_temp — a diferencia del
// viejo GithubAuthFlow (PAT), acá no hay ningún secreto que guardar local.
// El step 'vault_init' (pantalla vault-created) sigue existiendo aparte y se
// puebla vía VAULT_INITIALIZED — ver OnboardingFlow.setupListeners().
// ============================================================================

class GithubAppAuthFlow {
  constructor(discovery) {
    this.discovery = discovery;
    this._authorized = false;
    this._countdownInterval = null;
  }

  init() {
    console.log('[GithubAppAuthFlow] init()');

    // Botón "Conectar GitHub" en github-app-start → pide un device code nuevo.
    const btnStart = document.getElementById('btn-start-github-device-flow');
    if (btnStart && !btnStart._bound) {
      btnStart._bound = true;
      btnStart.addEventListener('click', () => this._requestDeviceCode());
    }

    // Botón "Cancelar" en github-app-device — vuelve al start sin dejar el
    // alarm de polling corriendo en background.js.
    const btnCancel = document.getElementById('btn-cancel-github-device');
    if (btnCancel && !btnCancel._bound) {
      btnCancel._bound = true;
      btnCancel.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'cancelGithubDeviceFlow' });
        this._resetToStart();
      });
    }

    // Botón "Copiar código" en github-app-device.
    const btnCopy = document.getElementById('btn-copy-github-code');
    if (btnCopy && !btnCopy._bound) {
      btnCopy._bound = true;
      btnCopy.addEventListener('click', () => this._copyCode(btnCopy));
    }

    // Reintentar desde github-app-start después de un error.
    const btnRetry = document.getElementById('btn-retry-github-device-flow');
    if (btnRetry && !btnRetry._bound) {
      btnRetry._bound = true;
      btnRetry.addEventListener('click', () => this._requestDeviceCode());
    }

    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.event === 'GITHUB_DEVICE_CODE') {
        this._handleDeviceCode(msg);
      }
      if (msg.event === 'GITHUB_APP_AUTHORIZED' && !this._authorized) {
        this._handleAuthorized(msg);
      }
      if (msg.event === 'GITHUB_DEVICE_FLOW_ERROR') {
        this._handleError(msg);
      }
    });
  }

  _requestDeviceCode() {
    console.log('[GithubAppAuthFlow] Requesting device code');
    this._authorized = false;
    this._setStatus('Requesting code from GitHub…');

    const btnStart = document.getElementById('btn-start-github-device-flow');
    if (btnStart) btnStart.disabled = true;

    // El POST a /login/device/code vive en background.js (service worker con
    // host_permissions), nunca acá — una página normal no puede pegarle a
    // github.com por CORS. Ver HANDOFF §3.
    chrome.runtime.sendMessage({ action: 'startGithubDeviceFlow' });
  }

  _resetToStart() {
    clearInterval(this._countdownInterval);
    this._authorized = false;
    this.discovery.showScreen('github-app-start');
    const btnStart = document.getElementById('btn-start-github-device-flow');
    if (btnStart) btnStart.disabled = false;
    this._setStatus('');
  }

  _setStatus(text) {
    const elStatus = document.getElementById('github-app-request-status');
    if (elStatus) elStatus.textContent = text;
  }

  async _copyCode(btnCopy) {
    const code = document.getElementById('github-device-user-code')?.textContent;
    if (!code || code === '—') return;
    try {
      await navigator.clipboard.writeText(code.replace(/\s/g, ''));
      const original = btnCopy.textContent;
      btnCopy.textContent = 'Copied!';
      setTimeout(() => { btnCopy.textContent = original; }, 1500);
    } catch (e) {
      console.warn('[GithubAppAuthFlow] Clipboard write failed (non-fatal):', e.message);
    }
  }

  _handleDeviceCode({ user_code, verification_uri, expires_in }) {
    console.log('[GithubAppAuthFlow] GITHUB_DEVICE_CODE received:', user_code);

    this.discovery.showScreen('github-app-device');

    const elCode = document.getElementById('github-device-user-code');
    const elLink = document.getElementById('github-device-verification-link');
    if (elCode) elCode.textContent = user_code || '—';
    if (elLink) {
      elLink.href = verification_uri || 'https://github.com/login/device';
      elLink.textContent = verification_uri || 'https://github.com/login/device';
    }

    // Abrimos la pestaña de verificación automáticamente — el usuario solo
    // tiene que pegar/tipear el código que ya tiene copiado.
    if (verification_uri) {
      chrome.tabs.create({ url: verification_uri });
    }

    this._startExpiryCountdown(expires_in || 900);
  }

  _startExpiryCountdown(seconds) {
    clearInterval(this._countdownInterval);
    let remaining = seconds;
    const elCountdown = document.getElementById('github-device-expiry');

    const tick = () => {
      if (elCountdown) {
        const m = Math.floor(Math.max(remaining, 0) / 60);
        const s = String(Math.max(remaining, 0) % 60).padStart(2, '0');
        elCountdown.textContent = `${m}:${s}`;
      }
      if (remaining <= 0) {
        clearInterval(this._countdownInterval);
        // No forzamos un error local: background.js es la fuente de verdad
        // del expires_in real (recibido de GitHub) y va a mandar
        // GITHUB_DEVICE_FLOW_ERROR con reason:'expired_token' por su cuenta.
        // Este contador es solo feedback visual para el usuario.
        return;
      }
      remaining--;
    };
    tick();
    this._countdownInterval = setInterval(tick, 1000);
  }

  async _handleAuthorized(msg) {
    if (this._authorized) return;
    this._authorized = true;
    clearInterval(this._countdownInterval);

    console.log('[GithubAppAuthFlow] GITHUB_APP_AUTHORIZED — user:', msg.username);

    // Actualiza el estado user-facing (bloom_profile_state.accounts). No se
    // llama a _updateVaultState() acá — ese es el step 'vault_init', separado,
    // y se puebla cuando llega VAULT_INITIALIZED desde el host (ver
    // OnboardingFlow.setupListeners). Mezclar los dos sería reproducir el
    // bug de "step AND vs OR" que la propuesta de milestone-registry (HANDOFF
    // §5.2) explícitamente evita.
    await this.discovery._updateAccountState('github', msg.username || null);

    this.discovery.showScreen('github-app-stored');

    const elUser   = document.getElementById('github-app-stored-user');
    const elScopes = document.getElementById('github-app-stored-scopes');
    if (elUser)   elUser.textContent   = msg.username || '—';
    if (elScopes) elScopes.textContent = msg.scopes    || '—';

    // NOTA: a diferencia del viejo flujo PAT, acá NO emitimos ACCOUNT_REGISTERED.
    // GITHUB_APP_AUTHORIZED ya ES el evento de milestone — background.js lo
    // reenvía al host tal cual (sin traducirlo), y milestone-registry.js
    // reacciona directo a 'GITHUB_APP_AUTHORIZED' en el step github_app_auth
    // (HANDOFF §5.2). Emitir ACCOUNT_REGISTERED acá también sería duplicar
    // el milestone con dos eventos para el mismo hecho.
    console.log('[GithubAppAuthFlow] github_app_auth step complete.');
  }

  _handleError({ reason }) {
    console.warn('[GithubAppAuthFlow] GITHUB_DEVICE_FLOW_ERROR:', reason);
    clearInterval(this._countdownInterval);
    this._authorized = false;

    this.discovery.showScreen('github-app-start');

    const messages = {
      access_denied: 'Authorization was denied on GitHub. Try again.',
      expired_token: 'The code expired. Request a new one.',
      denied:        'GitHub rejected the request. Try again.'
    };
    this._setStatus(messages[reason] || 'Something went wrong. Try again.');

    const btnStart = document.getElementById('btn-start-github-device-flow');
    if (btnStart) btnStart.disabled = false;
  }
}

// ============================================================================
// GOOGLE AUTH FLOW — Discovery de Registro/Login en Google
// PASIVO: la extensión no interactúa con el DOM de accounts.google.com, no
// hace clics, no lee campos. Solo observa a qué host TERMINA llegando la
// pestaña que el propio usuario abrió (chrome.tabs.onUpdated en background.js,
// scoped al tabId), excluyendo pantallas intermedias del propio login
// (/speedbump, /oauth2, /ServiceLogin, /signin/). El usuario hace todo a mano.
//
// Maneja las pantallas google-auth-login (instrucción + apertura) y
// google-auth-confirm (recibo de lo detectado, mismo patrón que GithubAuthFlow).
// ============================================================================

class GoogleAuthFlow {
  constructor(discovery) {
    this.discovery = discovery;
    this._loginConfirmed = false;
    this._watchedTabId = null;
  }

  init() {
    console.log('[GoogleAuthFlow] init()');

    const btnOpen = document.getElementById('btn-open-google-login');
    if (btnOpen) {
      btnOpen.addEventListener('click', () => this._openGoogleLogin());
    }

    const btnConfirm = document.getElementById('btn-confirm-google-login');
    if (btnConfirm) {
      btnConfirm.addEventListener('click', () => this._confirmLogin());
    }

    const btnReject = document.getElementById('btn-reject-google-login');
    if (btnReject) {
      btnReject.addEventListener('click', () => {
        this._loginConfirmed = false;
        this.discovery.showScreen('google-auth-login');
        this._openGoogleLogin();
      });
    }

    // Evento pasivo emitido por background.js cuando la tab observada llega
    // a un host terminal (myaccount.google.com, mail.google.com), excluyendo
    // las pantallas intermedias del propio flujo de login de Google.
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.event === 'GOOGLE_LOGIN_DETECTED' && msg.tabId === this._watchedTabId) {
        this._handleLoginDetected(msg);
      }
    });
  }

  async _openGoogleLogin() {
    const email = self.SYNAPSE_CONFIG?.email || null;
    const loginUrl = email
      ? `https://accounts.google.com/ServiceLogin?Email=${encodeURIComponent(email)}&continue=https://myaccount.google.com/`
      : 'https://accounts.google.com/ServiceLogin?continue=https://myaccount.google.com/';

    const tab = await chrome.tabs.create({ url: loginUrl });
    this._watchedTabId = tab.id;

    // AWAITING_HUMAN_AUTH — le pide a background.js que arme un watcher
    // pasivo (chrome.tabs.onUpdated) scoped a este tabId. background.js NO
    // lee nada de la página; solo compara el hostname/path contra la lista
    // de hosts terminales vs. intermedios.
    chrome.runtime.sendMessage({
      event: 'AWAITING_HUMAN_AUTH',
      service: 'google',
      tabId: tab.id,
      profile_id: self.SYNAPSE_CONFIG?.profileId,
      launch_id: self.SYNAPSE_CONFIG?.launchId,
      timestamp: Date.now()
    });

    this._showWaitingState();
  }

  _showWaitingState() {
    const waitMsg = document.getElementById('google-waiting-message');
    if (waitMsg) waitMsg.style.display = 'block';
    const btnOpen = document.getElementById('btn-open-google-login');
    if (btnOpen) btnOpen.textContent = '↗ Google abierto — completá el login';
  }

  _handleLoginDetected(msg) {
    console.log('[GoogleAuthFlow] GOOGLE_LOGIN_DETECTED — mostrando recibo:', msg.detected_host);

    this.discovery.showScreen('google-auth-confirm');

    const elHost = document.getElementById('google-detected-host');
    if (elHost) elHost.textContent = msg.detected_host || '—';
  }

  async _confirmLogin() {
    if (this._loginConfirmed) return;
    this._loginConfirmed = true;

    console.log('[GoogleAuthFlow] Login confirmado por el usuario');

    await this.discovery._updateAccountState('google', self.SYNAPSE_CONFIG?.email || null);

    // ACCOUNT_REGISTERED — mismo evento de milestone que usa GitHub, con
    // service:'google'. No inventamos un evento nuevo por proveedor: el
    // milestone es genérico, lo que cambia es el campo `service`.
    chrome.runtime.sendMessage({
      event:      'ACCOUNT_REGISTERED',
      service:    'google',
      username:   self.SYNAPSE_CONFIG?.email || '',
      profile_id: self.SYNAPSE_CONFIG?.profileId,
      launch_id:  self.SYNAPSE_CONFIG?.launchId,
      timestamp:  Date.now()
    });

    console.log('[GoogleAuthFlow] ACCOUNT_REGISTERED emitido — service: google');

    // Si este flujo corre DENTRO del chain host-driven (stepCurrent seteado),
    // no avanzamos nosotros — el host manda el siguiente step vía
    // onboarding_navigate cuando le llegue el ACCOUNT_REGISTERED de arriba.
    // Si corre standalone (entrada legacy routeToServiceFlow('google'), sin
    // stepCurrent), avanzamos nosotros mismos a Gemini.
    if (!this.discovery.stepCurrent) {
      console.log('[GoogleAuthFlow] Flujo standalone — avanzando a Gemini directamente');
      if (window.ONBOARDING?.selectProvider) {
        window.ONBOARDING.selectProvider('gemini');
      }
    }
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

    // Transition to waiting screen
    // (el flujo de captura de la key ya no pasa por clipboard — retirado en
    // la limpieza de seguridad que sacó el permiso clipboardRead, ver NOTA
    // DE SEGURIDAD en background.js. La key se captura por otra vía y llega
    // acá como evento API_KEY_REGISTERED — ver setupAPIKeyListeners()).
    this.showScreen('api-waiting');
  }

  async handleAPIKeyRegistered(message) {
    const { provider, profile_name, key_fingerprint, timestamp } = message;
    const config = PROVIDER_CONFIG[provider];

    if (!config) {
      console.error('[MultiProviderOnboarding] API_KEY_REGISTERED con provider desconocido:', provider);
      return;
    }

    // Dedup: por si el mismo evento llega más de una vez (reintento del
    // origen que lo emite, o una simulación repetida del Harness).
    const dedupeKey = `${provider}:${key_fingerprint}:${timestamp}`;
    this._processedAPIKeyEvents = this._processedAPIKeyEvents || new Set();
    if (this._processedAPIKeyEvents.has(dedupeKey)) {
      console.log('[MultiProviderOnboarding] API_KEY_REGISTERED duplicado — ignorado:', dedupeKey);
      return;
    }
    this._processedAPIKeyEvents.add(dedupeKey);

    // Persistencia — igual que hace GithubAppAuthFlow con VAULT_INITIALIZED:
    // la key es un secreto, va a bloom_profile_state.vaults (no a .accounts).
    // Sin esto linked_accounts/vaults nunca refleja la key agregada
    // (prerrequisito duro para Companion, §2.1 del Companion Implementation
    // Guide).
    await window.BLOOM_VALIDATOR?._updateVaultState?.(key_fingerprint, provider);

    // Update success screen
    document.getElementById('success-provider-name').textContent = config.displayName;
    document.getElementById('success-provider-display').textContent = config.displayName;
    document.getElementById('success-profile-name').textContent = profile_name || '—';

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