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
    debugBadge: null
  },

  // ═══════════════════════════════════════════════════════════════════
  // INITIALIZATION
  // ═══════════════════════════════════════════════════════════════════
  init() {
    // Cachear referencias DOM
    this.elements.statusDot = document.getElementById('status-dot');
    this.elements.statusMessage = document.getElementById('status-message');
    this.elements.progressInfo = document.getElementById('progress-info');
    this.elements.attemptCount = document.getElementById('attempt-count');
    this.elements.profileId = document.getElementById('profile-id');
    this.elements.profileAlias = document.getElementById('profile-alias');
    this.elements.timestamp = document.getElementById('timestamp');
    this.elements.autoCloseNotice = document.getElementById('auto-close-notice');
    this.elements.errorContainer = document.getElementById('error-container');
    this.elements.errorMessage = document.getElementById('error-message');
    this.elements.errorDetails = document.getElementById('error-details');
    this.elements.debugBadge = document.getElementById('debug-badge');

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
      this.updateStatusDot('initializing');
      this.updateStatusMessage('🔄 Inicializando...');
      
      if (this.config.debugMode) {
        console.log('[Protocol] Initialization phase');
      }
    },

    searching(context) {
      this.updateStatusDot('searching');
      this.updateStatusMessage('🔍 Buscando extensión...');
      
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
      this.updateStatusMessage('✅ Extensión conectada');

      // Ocultar contador de intentos
      if (this.elements.progressInfo) {
        this.elements.progressInfo.classList.add('hidden');
      }

      // Mostrar información del profile
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
      this.updateStatusMessage('❌ Error de conexión');

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