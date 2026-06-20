// ============================================================================
// SYNAPSE DISCOVERY PROTOCOL
// Protocolo de UI y mensajes para la página de discovery
// ============================================================================

const PROTOCOL = {
  // ═══════════════════════════════════════════════════════════════════
  // CONFIGURATION
  // ═══════════════════════════════════════════════════════════════════
  config: {
    maxAttempts: 60,
    pingIntervalMs: 1000,
    closeDelayMs: 20000,
    autoCloseOnSuccess: true,
    debugMode: false
  },

  // ═══════════════════════════════════════════════════════════════════
  // UI ELEMENTS REFERENCES
  // ═══════════════════════════════════════════════════════════════════
  elements: {
    statusDot: null,
    statusMessage: null,
    progressInfo: null,
    attemptCount: null,
    profileId: null,
    profileAlias: null,
    timestamp: null,
    autoCloseNotice: null,
    errorContainer: null,
    errorMessage: null,
    errorDetails: null,
    debugBadge: null,
    connectionInfo: null,
    stageIndicator: null,
    stageList: null
  },

  // ═══════════════════════════════════════════════════════════════════
  // INITIALIZATION
  // ═══════════════════════════════════════════════════════════════════
  init() {
    // Cachear referencias DOM
    this.elements.statusDot = document.getElementById('discovery-dot');
    this.elements.statusMessage = document.getElementById('discovery-message');
    this.elements.progressInfo = document.getElementById('discovery-progress');
    this.elements.attemptCount = document.getElementById('attempt-count');
    this.elements.profileId = document.getElementById('profile-id');
    this.elements.profileAlias = document.getElementById('profile-alias');
    this.elements.timestamp = document.getElementById('timestamp');
    this.elements.autoCloseNotice = document.getElementById('discovery-auto-close');
    this.elements.errorContainer = document.getElementById('discovery-error');
    this.elements.errorMessage = document.getElementById('error-message');
    this.elements.errorDetails = document.getElementById('error-details');
    this.elements.debugBadge = document.getElementById('debug-badge');
    this.elements.connectionInfo = document.getElementById('connection-info');
    this.elements.stageIndicator = document.getElementById('stage-indicator');
    this.elements.stageList = document.getElementById('stage-list');

    // Mostrar badge de debug si está activo
    if (this.config.debugMode && this.elements.debugBadge) {
      this.elements.debugBadge.classList.add('active');
    }
  },

  // ═══════════════════════════════════════════════════════════════════
  // PHASE EXECUTION
  // ═══════════════════════════════════════════════════════════════════
  executePhase(phase, context = {}) {
    const handler = this.phases[phase];
    if (!handler) {
      console.error(`[Protocol] Unknown phase: ${phase}`);
      return;
    }

    if (this.config.debugMode) {
      console.log(`[Protocol] Phase: ${phase}`);
    }

    handler.call(this, context);
  },

  // ═══════════════════════════════════════════════════════════════════
  // PHASES DEFINITIONS
  // ═══════════════════════════════════════════════════════════════════
  phases: {
    initialization(context) {
      this.updateStatusDot('searching');
      
      if (this.config.debugMode) {
        console.log('[Protocol] Initialization phase');
      }
    },

    searching(context) {
      this.updateStatusDot('searching');
      
      if (this.elements.progressInfo) {
        this.elements.progressInfo.classList.remove('hidden');
      }

      if (this.config.debugMode) {
        console.log('[Protocol] Searching phase - Attempt:', context.attemptCount);
      }
    },

    success(context) {
      const { payload } = context;

      this.updateStatusDot('connected');

      // Ocultar contador de intentos
      if (this.elements.progressInfo) {
        this.elements.progressInfo.classList.add('hidden');
      }

      // Mostrar información del profile
      if (this.elements.connectionInfo) {
        this.elements.connectionInfo.style.display = 'block';
      }

      if (payload) {
        if (payload.profile_id && this.elements.profileId) {
          this.elements.profileId.textContent = `Profile: ${payload.profile_id}`;
        }
        if (payload.profile_alias && this.elements.profileAlias) {
          this.elements.profileAlias.textContent = `Alias: ${payload.profile_alias}`;
        }
      }

      // Actualizar timestamp
      if (this.elements.timestamp) {
        this.elements.timestamp.textContent = `Conectado: ${new Date().toLocaleTimeString()}`;
      }

      // Mostrar aviso de auto-close
      if (this.elements.autoCloseNotice) {
        this.elements.autoCloseNotice.classList.add('show');
      }

      if (this.config.debugMode) {
        console.log('[Protocol] Success phase - Payload:', payload);
      }
    },

    error(context) {
      const { errorData } = context;

      this.updateStatusDot('error');

      // Ocultar contador de intentos
      if (this.elements.progressInfo) {
        this.elements.progressInfo.classList.add('hidden');
      }

      // Mostrar container de error
      if (this.elements.errorContainer) {
        this.elements.errorContainer.classList.add('show');
      }

      // Mensaje de error
      if (this.elements.errorMessage && errorData.message) {
        this.elements.errorMessage.textContent = errorData.message;
      }

      // Detalles del error
      if (this.elements.errorDetails && errorData.details) {
        this.elements.errorDetails.textContent = JSON.stringify(errorData.details, null, 2);
      }

      if (this.config.debugMode) {
        console.error('[Protocol] Error phase:', errorData);
      }
    },

    cleanup(context) {
      if (this.config.debugMode) {
        console.log('[Protocol] Cleanup phase');
      }

      // Limpiar cualquier recurso si es necesario
    }
  },

  // ═══════════════════════════════════════════════════════════════════
  // UI UPDATE HELPERS
  // ═══════════════════════════════════════════════════════════════════
  updateStatusDot(status) {
    if (!this.elements.statusDot) return;

    // Remover todas las clases de estado
    this.elements.statusDot.className = 'status-dot';
    
    // Agregar la clase del nuevo estado
    if (status) {
      this.elements.statusDot.classList.add(status);
    }
  },

  updateStatusMessage(message) {
    if (!this.elements.statusMessage) return;
    this.elements.statusMessage.textContent = message;
  },

  // ═══════════════════════════════════════════════════════════════════
  // MESSAGES CATALOG
  // ═══════════════════════════════════════════════════════════════════
  messages: {
    es: {
      initializing: '🔄 Inicializando...',
      searching: '🔍 Buscando extensión...',
      connected: '✅ Extensión conectada',
      error: '❌ Error de conexión',
      timeout: 'Timeout después de {{attempts}} intentos',
      no_extension_id: 'Extension ID no disponible',
      auto_close: '✓ Conexión establecida exitosamente',
      profile_prefix: 'Profile:',
      alias_prefix: 'Alias:',
      connected_at: 'Conectado:',
      waiting: 'Estado: Esperando conexión'
    },
    en: {
      initializing: '🔄 Initializing...',
      searching: '🔍 Searching for extension...',
      connected: '✅ Extension connected',
      error: '❌ Connection error',
      timeout: 'Timeout after {{attempts}} attempts',
      no_extension_id: 'Extension ID not available',
      auto_close: '✓ Connection established successfully',
      profile_prefix: 'Profile:',
      alias_prefix: 'Alias:',
      connected_at: 'Connected:',
      waiting: 'Status: Waiting for connection'
    }
  },

  // ═══════════════════════════════════════════════════════════════════
  // MESSAGE GETTER
  // ═══════════════════════════════════════════════════════════════════
  getMessage(key, replacements = {}) {
    const lang = 'es'; // Por defecto español
    let msg = this.messages[lang][key] || key;

    // Reemplazar placeholders
    Object.keys(replacements).forEach(k => {
      msg = msg.replace(`{{${k}}}`, replacements[k]);
    });

    return msg;
  }
};

// ============================================================================
// EXPORT
// ============================================================================

// Para uso sin módulos ES6 (compatible con extension)
if (typeof window !== 'undefined') {
  window.PROTOCOL = PROTOCOL;
  console.log('[PROTOCOL] ⚙️  Protocol loaded at:', new Date().toISOString());
  console.log('[PROTOCOL] Instance ID:', Math.random().toString(36).substr(2, 9));
}

// Para uso con módulos ES6
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PROTOCOL;
}
// ============================================================================
// DISCOVERY PROTOCOL MANIFEST
// Autodescriptive contract for the Harness ProtocolReader.
// Append-only — does NOT modify the PROTOCOL object above.
// ============================================================================

if (typeof self !== 'undefined') {
  self.DISCOVERY_PROTOCOL_MANIFEST = {
    version: "1.0.0",
    protocol: "discovery",
    description: "Onboarding flow — extension handshake, GitHub auth, API key detection, account registration",

    messages: [
      {
        id: "onboarding_navigate",
        type: "command",
        direction: "harness_to_background",
        channel: "runtime",
        description: "Navigate Discovery to a specific onboarding step. NOTA (Jun 19 2026): vault_init y project_create todavía no tienen screen implementada en discovery/index.html — routeToStep() los acepta sin romper, pero no hay UI que mostrar. Ver IMPL_PROMPT_Discovery_VaultInit_ProjectCreate.md.",
        payload_template: {
          command: "onboarding_navigate",
          payload: { step: "$STEP" }
        },
        parameters: [
          {
            name: "step",
            type: "enum",
            variable: "$STEP",
            // Alineado 1:1 con SCREEN_IDS de onboarding.js (VSCode), salvo 'entry' y 'launch'
            // que no son steps que Discovery rutee (son screens propias del stepper VSCode).
            options: ["github_auth", "vault_init", "google_auth", "ai_provider_setup", "project_create"]
          }
        ]
      },
      {
        id: "github_pat_detected",
        type: "event",
        direction: "harness_to_background",
        channel: "runtime",
        description: "Simulate clipboard monitor detecting a GitHub PAT",
        payload_template: {
          event: "GITHUB_PAT_DETECTED",
          token: "$TOKEN"
        },
        parameters: [
          {
            name: "token",
            type: "string",
            variable: "$TOKEN",
            default: "ghp_simulatedToken123456789"
          }
        ]
      },
      {
        id: "github_token_stored",
        type: "event",
        direction: "harness_to_background",
        channel: "runtime",
        description: "Simulate user confirming GitHub token storage",
        payload_template: {
          event: "GITHUB_TOKEN_STORED",
          token_fingerprint: "$FINGERPRINT",
          profile_id: "$PROFILE_ID",
          launch_id: "$LAUNCH_ID"
        },
        parameters: [
          {
            name: "token_fingerprint",
            type: "string",
            variable: "$FINGERPRINT",
            default: "ghp_...abc123"
          },
          {
            name: "profile_id",
            type: "auto",
            variable: "$PROFILE_ID",
            source: "HARNESS_CONFIG.profileId"
          },
          {
            name: "launch_id",
            type: "auto",
            variable: "$LAUNCH_ID",
            source: "SYNAPSE_CONFIG.launchId"
          }
        ]
      },
      {
        id: "api_key_registered",
        type: "event",
        direction: "harness_to_background",
        channel: "runtime",
        description: "Simulate successful API key registration",
        payload_template: {
          event: "API_KEY_REGISTERED",
          key_fingerprint: "$KEY_FINGERPRINT",
          profile_id: "$PROFILE_ID",
          launch_id: "$LAUNCH_ID"
        },
        parameters: [
          {
            name: "key_fingerprint",
            type: "string",
            variable: "$KEY_FINGERPRINT",
            default: "sk-...xyz789"
          },
          {
            name: "profile_id",
            type: "auto",
            variable: "$PROFILE_ID",
            source: "HARNESS_CONFIG.profileId"
          },
          {
            name: "launch_id",
            type: "auto",
            variable: "$LAUNCH_ID",
            source: "SYNAPSE_CONFIG.launchId"
          }
        ]
      },
      {
        id: "account_registered",
        type: "event",
        direction: "harness_to_background",
        channel: "runtime",
        description: "Simulate account registration completion",
        payload_template: {
          event: "ACCOUNT_REGISTERED",
          profile_id: "$PROFILE_ID",
          launch_id: "$LAUNCH_ID"
        },
        parameters: [
          {
            name: "profile_id",
            type: "auto",
            variable: "$PROFILE_ID",
            source: "HARNESS_CONFIG.profileId"
          },
          {
            name: "launch_id",
            type: "auto",
            variable: "$LAUNCH_ID",
            source: "SYNAPSE_CONFIG.launchId"
          }
        ]
      },
      {
        id: "discovery_complete",
        type: "event",
        direction: "harness_to_background",
        channel: "runtime",
        description: "Simulate full discovery/onboarding flow completion",
        payload_template: {
          event: "DISCOVERY_COMPLETE",
          profile_id: "$PROFILE_ID",
          launch_id: "$LAUNCH_ID"
        },
        parameters: [
          {
            name: "profile_id",
            type: "auto",
            variable: "$PROFILE_ID",
            source: "HARNESS_CONFIG.profileId"
          },
          {
            name: "launch_id",
            type: "auto",
            variable: "$LAUNCH_ID",
            source: "SYNAPSE_CONFIG.launchId"
          }
        ]
      },
      {
        id: "handshake_confirmed",
        type: "event",
        direction: "harness_to_background",
        channel: "runtime",
        description: "Simulate extension handshake confirmation",
        payload_template: {
          event: "HANDSHAKE_CONFIRMED",
          profile_id: "$PROFILE_ID",
          launch_id: "$LAUNCH_ID"
        },
        parameters: [
          {
            name: "profile_id",
            type: "auto",
            variable: "$PROFILE_ID",
            source: "HARNESS_CONFIG.profileId"
          },
          {
            name: "launch_id",
            type: "auto",
            variable: "$LAUNCH_ID",
            source: "SYNAPSE_CONFIG.launchId"
          }
        ]
      },
      {
        id: "host_ready",
        type: "event",
        direction: "harness_to_background",
        channel: "runtime",
        description: "Simulate bloom-host signaling it is ready to receive commands",
        payload_template: {
          event: "HOST_READY",
          profile_id: "$PROFILE_ID",
          launch_id: "$LAUNCH_ID"
        },
        parameters: [
          {
            name: "profile_id",
            type: "auto",
            variable: "$PROFILE_ID",
            source: "HARNESS_CONFIG.profileId"
          },
          {
            name: "launch_id",
            type: "auto",
            variable: "$LAUNCH_ID",
            source: "SYNAPSE_CONFIG.launchId"
          }
        ]
      }
    ],

    observable_events: [
      "HOST_READY",
      "HANDSHAKE_CONFIRMED",
      "API_KEY_REGISTERED",
      "ACCOUNT_REGISTERED",
      "DISCOVERY_COMPLETE"
    ]
  };
}
