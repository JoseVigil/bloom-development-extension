// ============================================================================
// SYNAPSE LANDING PROTOCOL
// Protocol for profile cockpit UI and messaging
// ============================================================================

// 🔧 FIX: todo el archivo va envuelto en un IIFE. Antes, `const PROTOCOL` se
// declaraba en el scope global de un script clásico (no módulo); si el mismo
// <script src="landingProtocol.js"> se ejecuta más de una vez en el mismo
// documento (harness re-inyectando el script, recarga dinámica, etc.), la
// segunda ejecución choca contra la declaración global anterior y tira
// "Uncaught SyntaxError: Identifier 'PROTOCOL' has already been declared".
// Con el IIFE, `const PROTOCOL` queda en un scope local nuevo cada vez que el
// script corre, y el guard de abajo evita rehacer todo el trabajo si ya está
// cargado.
// 🔧 FIX (v2): el IIFE se mantiene para aislar el scope de `const PROTOCOL` y
// evitar el SyntaxError de redeclaración cuando varios *Protocol.js (harness,
// discovery, landing) se cargan en el mismo documento (harness/index.html).
// PERO el guard de "si window.PROTOCOL ya existe, no hacer nada" que había acá
// antes era el bug real: discoveryProtocol.js carga ANTES que landingProtocol.js
// en la secuencia de boot del harness (ver harness.js boot sequence), así que
// window.PROTOCOL ya estaba tomado por el protocolo de Discovery cuando le
// tocaba el turno a Landing — y el guard impedía que el PROTOCOL de Landing se
// instalara nunca. Cada protocolo tiene que poder pisar window.PROTOCOL con el
// suyo; por eso ahora se reasigna siempre, sin gate.
(function () {
  const PROTOCOL = {
  // ═══════════════════════════════════════════════════════════════════
  // CONFIGURATION
  // ═══════════════════════════════════════════════════════════════════
  config: {
    checkIntervalMs: 5000,
    maxAttempts: 10,
    debugMode: false
  },

  // ═══════════════════════════════════════════════════════════════════
  // UI ELEMENTS REFERENCES
  // ═══════════════════════════════════════════════════════════════════
  elements: {
    // Loading screen
    loadingScreen: null,
    loadingMessage: null,
    statusDotExtension: null,
    statusDotHost: null,
    
    // Dashboard screen
    dashboardScreen: null,
    dashboardStatusExtension: null,
    dashboardStatusHost: null,
    profileAvatar: null,
    profileAlias: null,
    profileRole: null,
    statsGrid: null,
    accountsList: null,
    systemInfo: null,
    
    // Error screen
    errorScreen: null,
    errorMessage: null,
    errorDetails: null
  },

  // ═══════════════════════════════════════════════════════════════════
  // INITIALIZATION
  // ═══════════════════════════════════════════════════════════════════
  init() {
    // Cache DOM references
    this.elements.loadingScreen = document.getElementById('screen-loading');
    this.elements.loadingMessage = document.getElementById('loading-message');
    this.elements.statusDotExtension = document.getElementById('status-dot-extension');
    this.elements.statusDotHost = document.getElementById('status-dot-host');
    
    this.elements.dashboardScreen = document.getElementById('screen-dashboard');
    this.elements.dashboardStatusExtension = document.getElementById('dashboard-status-extension');
    this.elements.dashboardStatusHost = document.getElementById('dashboard-status-host');
    this.elements.profileAvatar = document.getElementById('profile-avatar');
    this.elements.profileAlias = document.getElementById('profile-alias');
    this.elements.profileRole = document.getElementById('profile-role');
    this.elements.statsGrid = document.getElementById('stats-grid');
    this.elements.accountsList = document.getElementById('accounts-list');
    this.elements.systemInfo = document.getElementById('system-info');
    
    this.elements.errorScreen = document.getElementById('screen-error');
    this.elements.errorMessage = document.getElementById('error-message');
    this.elements.errorDetails = document.getElementById('error-details');

    if (this.config.debugMode) {
      console.log('[Protocol] 🎯 Landing Protocol initialized');
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
      console.log(`[Protocol] 📍 Phase: ${phase}`);
    }

    handler.call(this, context);
  },

  // ═══════════════════════════════════════════════════════════════════
  // PHASES DEFINITIONS
  // ═══════════════════════════════════════════════════════════════════
  phases: {
    initialization(context) {
      this.showScreen('loading');
      this.updateLoadingMessage('Initializing…');
      this.updateStatusDots('checking');
      
      if (this.config.debugMode) {
        console.log('[Protocol] Initialization phase');
      }
    },

    loading(context) {
      this.showScreen('loading');
      this.updateLoadingMessage('Loading profile data…');
      this.updateStatusDots('checking');
      
      if (this.config.debugMode) {
        console.log('[Protocol] Loading phase');
      }
    },

    ready(context) {
      const { profile } = context;
      
      this.showScreen('dashboard');
      this.updateStatusDots('connected');
      
      if (profile) {
        this.renderDashboard(profile);
      }
      
      if (this.config.debugMode) {
        console.log('[Protocol] Ready phase - Profile:', profile);
      }
    },

    error(context) {
      const { errorData } = context;
      
      this.showScreen('error');
      
      if (this.elements.errorMessage && errorData.message) {
        this.elements.errorMessage.textContent = errorData.message;
      }
      
      if (this.elements.errorDetails && errorData.details) {
        this.elements.errorDetails.textContent = JSON.stringify(errorData.details, null, 2);
      }
      
      if (this.config.debugMode) {
        console.error('[Protocol] Error phase:', errorData);
      }
    },

    updating(context) {
      // Future phase for refreshing stats/data
      if (this.config.debugMode) {
        console.log('[Protocol] Updating phase');
      }
    }
  },

  // ═══════════════════════════════════════════════════════════════════
  // UI UPDATE HELPERS
  // ═══════════════════════════════════════════════════════════════════
  showScreen(screenName) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const screen = document.getElementById(`screen-${screenName}`);
    if (screen) {
      screen.classList.add('active');
    }
  },

  updateLoadingMessage(message) {
    if (this.elements.loadingMessage) {
      this.elements.loadingMessage.textContent = message;
    }
  },

  updateStatusDots(status) {
    const dots = [
      this.elements.statusDotExtension,
      this.elements.statusDotHost,
      this.elements.dashboardStatusExtension,
      this.elements.dashboardStatusHost
    ];
    
    dots.forEach(dot => {
      if (dot) {
        dot.className = `status-dot ${status}`;
      }
    });
  },

  updateConnectionDot(dotId, status) {
    const dot = document.getElementById(dotId);
    if (dot) {
      dot.className = `status-dot ${status}`;
    }
  },

  // ═══════════════════════════════════════════════════════════════════
  // DASHBOARD RENDERING
  // ═══════════════════════════════════════════════════════════════════
  renderDashboard(profile) {
    // 🔧 FIX: el <title> quedaba literalmente como "Bloom - {{PROFILE_ALIAS}} Cockpit"
    // porque nada reemplazaba ese placeholder en runtime.
    document.title = `Bloom - ${profile.alias || 'Worker'} Cockpit`;

    // Profile identity
    if (this.elements.profileAvatar) {
      this.elements.profileAvatar.textContent = (profile.alias || 'B')[0].toUpperCase();
    }
    if (this.elements.profileAlias) {
      this.elements.profileAlias.textContent = profile.alias || 'Profile';
    }
    if (this.elements.profileRole) {
      this.elements.profileRole.textContent = profile.role || 'Worker';
    }

    // Stats
    this.renderStats(profile.stats);

    // Linked accounts
    this.renderAccounts(profile.accounts);

    // Vaults
    this.renderVaults(profile.vaults);

    // System info
    this.renderSystemInfo(profile.system);
  },

  renderStats(stats) {
    if (!this.elements.statsGrid || !stats) return;

    // 🎨 Doctrina: el modelo Mandate→Intent es la jerarquía central del sistema
    // y Landing es el "ancla de continuidad" — así que las métricas que se
    // muestran en primer plano son las que hablan de continuidad (Intents
    // completados, última sincronización). Total Launches / Uptime son
    // telemetría de sistema, no señales cognitivas: se muestran igual, pero
    // con menor jerarquía, junto a system-info (ver renderSystemInfo).
    const statsConfig = [
      { label: 'Intents Completed', value: stats.intentsCompleted || 0 },
      { label: 'Last Sync', value: this.formatLastSync(stats.lastSync) }
    ];

    this.elements.statsGrid.innerHTML = statsConfig.map(stat => `
      <div class="stat-card">
        <div class="stat-header">
          <span>${stat.label}</span>
        </div>
        <div class="stat-value">${stat.value}</div>
      </div>
    `).join('');

    // Telemetría secundaria — se guarda para que renderSystemInfo la incluya.
    this._secondaryStats = {
      totalLaunches: stats.totalLaunches || 0,
      uptime: this.formatUptime(stats.uptime || 0)
    };
  },

  renderAccounts(accounts) {
    if (!this.elements.accountsList) return;

    if (!accounts || accounts.length === 0) {
      this.elements.accountsList.innerHTML = '<p class="empty-state">No accounts linked yet</p>';
      return;
    }

    // 🎨 FIX UX: antes solo el punto de estado (account-status) reflejaba
    // connected vs pending — el resto del row (avatar, nombre, email) se
    // veía igual de "vivo" para las 3 cuentas sin importar el estado real,
    // así que era imposible distinguir a simple vista qué está habilitado.
    // Ahora el item completo se atenúa (is-disabled) cuando no está conectado.
    this.elements.accountsList.innerHTML = accounts.map(account => {
      const isConnected = account.status === 'connected' || account.status === 'active';
      const itemClass = isConnected ? 'account-item' : 'account-item is-disabled';
      const secondaryText = account.email || account.username || (isConnected ? '-' : 'Not linked');

      return `
        <div class="${itemClass}">
          <div class="account-avatar">${(account.provider || 'A')[0].toUpperCase()}</div>
          <div class="account-info">
            <div class="account-provider">${account.provider || 'Unknown'}</div>
            <div class="account-email">${secondaryText}</div>
          </div>
          <div class="account-status ${account.status || 'unknown'}"></div>
        </div>
      `;
    }).join('');
  },

  renderVaults(vaults) {
    const container = document.getElementById('vaults-list');
    if (!container) return;

    // NOTA: Google se removió de esta lista a propósito. El auth de Google
    // no persiste ninguna key en el vault (es solo OAuth de cuenta) — mostrarlo
    // acá como "pending" para siempre era engañoso, ya que nunca iba a pasar
    // a "active". Los únicos providers que efectivamente guardan una key en
    // el vault son GitHub (PAT) y Gemini (API key).
    const ALL_VAULTS = [
      { provider: 'github', label: 'GitHub' },
      { provider: 'gemini', label: 'Gemini' }
    ];

    container.innerHTML = ALL_VAULTS.map(def => {
      const vault = (vaults || []).find(v => v.provider === def.provider);
      const status      = vault ? 'active'   : 'pending';
      const statusLabel = vault ? '● activo' : '○ pendiente';
      const fingerprint = vault ? vault.fingerprint : 'Not created';
      // Mismo criterio que renderAccounts: atenuar el item completo, no
      // solo el punto de estado, cuando el vault todavía no existe.
      const itemClass   = vault ? 'account-item' : 'account-item is-disabled';
      return `
        <div class="${itemClass}">
          <div class="account-avatar">${def.label[0]}</div>
          <div class="account-info">
            <div class="account-provider">${def.label}</div>
            <div class="account-email" style="font-family: var(--font-mono, monospace); font-size: 11px;">${fingerprint}</div>
          </div>
          <div class="account-status ${status}" title="${statusLabel}"></div>
        </div>
      `;
    }).join('');
  },

  renderSystemInfo(system) {
    if (!this.elements.systemInfo || !system) return;

    const secondary = this._secondaryStats || {};

    this.elements.systemInfo.innerHTML = `
      <div>Profile ID: <span>${system.id || '-'}</span></div>
      <div>Created: <span>${this.formatDate(system.created)}</span></div>
      <div>Last Launch: <span>${this.formatDateTime(system.lastLaunch)}</span></div>
      <div>Total Launches: <span>${secondary.totalLaunches ?? 0}</span></div>
      <div>Uptime: <span>${secondary.uptime ?? '0s'}</span></div>
    `;
  },

  // ═══════════════════════════════════════════════════════════════════
  // FORMATTERS
  // ═══════════════════════════════════════════════════════════════════
  formatUptime(seconds) {
    if (!seconds) return '0s';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  },

  formatLastSync(timestamp) {
    if (!timestamp) return 'Never';
    try {
      return new Date(timestamp).toLocaleTimeString();
    } catch {
      return 'Invalid date';
    }
  },

  formatDate(timestamp) {
    if (!timestamp) return '-';
    try {
      return new Date(timestamp).toLocaleDateString();
    } catch {
      return 'Invalid date';
    }
  },

  formatDateTime(timestamp) {
    if (!timestamp) return '-';
    try {
      return new Date(timestamp).toLocaleString();
    } catch {
      return 'Invalid date';
    }
  },

  // ═══════════════════════════════════════════════════════════════════
  // MESSAGES CATALOG
  // ═══════════════════════════════════════════════════════════════════
  messages: {
    en: {
      initializing: '🔄 Initializing...',
      loading: '⏳ Loading profile data...',
      connected: '✅ Connected',
      error: '❌ Connection error',
      checking: '🔍 Checking connection...',
      no_profile_data: 'Profile data not available'
    },
    es: {
      initializing: '🔄 Inicializando...',
      loading: '⏳ Cargando datos del perfil...',
      connected: '✅ Conectado',
      error: '❌ Error de conexión',
      checking: '🔍 Verificando conexión...',
      no_profile_data: 'Datos del perfil no disponibles'
    }
  },

  getMessage(key, lang = 'en') {
    return this.messages[lang]?.[key] || key;
  },

  // ═══════════════════════════════════════════════════════════════════
  // COMPANION — Condición de disponibilidad (Companion Guide v1.2 §10.2)
  // ═══════════════════════════════════════════════════════════════════
  /**
   * isCompanionAvailable(profileData)
   *
   * Condición DOBLE, ambas deben cumplirse (§2.4 de la guía, AUTHORITY_BOUNDARY §3.1/§3.2):
   *
   *   1. linked_accounts trae 'google' Y 'gemini', ambas con status
   *      que indique conexión confirmada (no basta con que el flujo haya
   *      arrancado). Para 'gemini' esto significa que el vault ya confirmó
   *      la escritura de la key (ver AUTHORITY_BOUNDARY §3.1 punto 5) —
   *      esta función NO valida eso por sí misma, solo lee el status que
   *      ya viene resuelto en profileData.accounts. Si _updateVaultState()
   *      en discovery.js no marca status:'active' hasta que el vault nativo
   *      confirma, esta función hereda esa garantía gratis. Si el contrato
   *      real del vault termina exponiendo otro nombre de status, hay que
   *      ajustar STATUS_CONNECTED acá, no reinventar la lógica.
   *
   *   2. El ducto Synapse llegó a handshake_confirm (background.js,
   *      handshakeState === 'CONFIRMED'). Se consulta vía sendMessage
   *      porque handshakeState vive en el service worker, no en esta page.
   *      Reutiliza el mismo action:'checkHost' que ya expone background.js
   *      (línea ~1454 de background.js), en vez de inventar un mensaje nuevo.
   *
   * No hace falta ningún dato de context.js ni del contrato del vault nativo
   * para esto — ambos bloqueantes del handoff quedan fuera del alcance de
   * esta función.
   */
  // FIX (Meta 2, auditoría de Companion): 'google' y 'gemini' NO viven en el
  // mismo array. discovery.js escribe 'google' en profileData.accounts (vía
  // _updateAccountState) pero 'gemini' en profileData.vaults (vía
  // _updateVaultState, porque es un secreto/key, no una cuenta) — ver
  // mergeProfileState() en landing.js, que las mantiene separadas a
  // propósito. La versión anterior de esta función buscaba 'gemini' en
  // accounts, así que siempre daba `false` en silencio. Separar los
  // providers por el array real donde efectivamente aparecen.
  COMPANION_REQUIRED_ACCOUNT_PROVIDERS: ['google'],
  COMPANION_REQUIRED_VAULT_PROVIDERS: ['gemini'],
  COMPANION_STATUS_CONNECTED: ['active', 'connected'], // valores aceptados como "conectado"; ajustar si el vault expone otro string

  hasRequiredAccountsForCompanion(profileData) {
    const accounts = profileData?.accounts || [];
    const vaults = profileData?.vaults || [];

    const accountsOk = this.COMPANION_REQUIRED_ACCOUNT_PROVIDERS.every(provider => {
      const acc = accounts.find(a => a.provider === provider);
      return !!acc && this.COMPANION_STATUS_CONNECTED.includes(acc.status);
    });

    const vaultsOk = this.COMPANION_REQUIRED_VAULT_PROVIDERS.every(provider => {
      const vault = vaults.find(v => v.provider === provider);
      return !!vault && this.COMPANION_STATUS_CONNECTED.includes(vault.status);
    });

    return accountsOk && vaultsOk;
  },

  checkHandshakeConfirmed() {
    // Envuelve chrome.runtime.sendMessage en una Promise; no asumimos que
    // background.js esté disponible (misma cautela que el resto del archivo
    // usa para chrome.storage).
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ action: 'checkHost' }, (resp) => {
          if (chrome.runtime.lastError) {
            console.warn('[PROTOCOL] checkHandshakeConfirmed — sendMessage error:', chrome.runtime.lastError.message);
            resolve(false);
            return;
          }
          resolve(resp?.handshake_confirmed === true);
        });
      } catch (e) {
        console.warn('[PROTOCOL] checkHandshakeConfirmed — excepción:', e.message);
        resolve(false);
      }
    });
  },

  async isCompanionAvailable(profileData) {
    const accountsOk = this.hasRequiredAccountsForCompanion(profileData);
    if (!accountsOk) {
      console.log('[PROTOCOL] Companion no disponible — faltan cuentas requeridas (google + gemini) en linked_accounts');
      return false;
    }

    const handshakeOk = await this.checkHandshakeConfirmed();
    if (!handshakeOk) {
      console.log('[PROTOCOL] Companion no disponible — handshake Synapse aún no llegó a CONFIRMED');
      return false;
    }

    return true;
  }
};

// ============================================================================
// EXPORT
// ============================================================================

if (typeof window !== 'undefined') {
    window.PROTOCOL = PROTOCOL;
    console.log('[PROTOCOL] ⚙️ Landing Protocol loaded at:', new Date().toISOString());
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = PROTOCOL;
  }
  // ============================================================================
  // LANDING PROTOCOL MANIFEST
  // Autodescriptive contract for the Harness ProtocolReader.
  // Append-only — does NOT modify the PROTOCOL object above.
  // ============================================================================

  if (typeof self !== 'undefined') {
    self.LANDING_PROTOCOL_MANIFEST = {
    version: "1.0.0",
    protocol: "landing",
    description: "Profile cockpit — session state, stats, linked accounts, quick actions",

    messages: [
      {
        id: "profile_load",
        type: "command",
        direction: "harness_to_background",
        channel: "runtime",
        description: "Request a full profile data reload",
        payload_template: {
          command: "profile_load",
          profile_id: "$PROFILE_ID"
        },
        parameters: [
          {
            name: "profile_id",
            type: "auto",
            variable: "$PROFILE_ID",
            source: "HARNESS_CONFIG.profileId"
          }
        ]
      },
      {
        id: "health_check",
        type: "command",
        direction: "harness_to_background",
        channel: "runtime",
        description: "Trigger a full-stack health check",
        payload_template: {
          command: "health_check",
          scope: "$SCOPE"
        },
        parameters: [
          {
            name: "scope",
            type: "enum",
            variable: "$SCOPE",
            options: ["extension", "host", "full-stack"]
          }
        ]
      },
      {
        id: "nucleus_sync",
        type: "command",
        direction: "harness_to_background",
        channel: "runtime",
        description: "Trigger a nucleus project sync",
        payload_template: {
          command: "nucleus_sync",
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
        id: "intent_list",
        type: "command",
        direction: "harness_to_background",
        channel: "runtime",
        description: "Request the list of active intents for this profile",
        payload_template: {
          command: "intent_list",
          profile_id: "$PROFILE_ID"
        },
        parameters: [
          {
            name: "profile_id",
            type: "auto",
            variable: "$PROFILE_ID",
            source: "HARNESS_CONFIG.profileId"
          }
        ]
      },
      {
        id: "session_status",
        type: "event",
        direction: "harness_to_background",
        channel: "runtime",
        description: "Simulate a session status update from the host",
        payload_template: {
          event: "SESSION_STATUS",
          status: "$STATUS",
          profile_id: "$PROFILE_ID",
          launch_id: "$LAUNCH_ID"
        },
        parameters: [
          {
            name: "status",
            type: "enum",
            variable: "$STATUS",
            options: ["active", "idle", "disconnected", "error"]
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
        id: "stats_update",
        type: "event",
        direction: "harness_to_background",
        channel: "runtime",
        description: "Simulate a stats update payload (launches, uptime, intents)",
        payload_template: {
          event: "STATS_UPDATE",
          profile_id: "$PROFILE_ID",
          stats: {
            totalLaunches: "$TOTAL_LAUNCHES",
            uptime: "$UPTIME",
            intentsCompleted: "$INTENTS_COMPLETED"
          }
        },
        parameters: [
          {
            name: "profile_id",
            type: "auto",
            variable: "$PROFILE_ID",
            source: "HARNESS_CONFIG.profileId"
          },
          {
            name: "total_launches",
            type: "string",
            variable: "$TOTAL_LAUNCHES",
            default: "42"
          },
          {
            name: "uptime",
            type: "string",
            variable: "$UPTIME",
            default: "3600"
          },
          {
            name: "intents_completed",
            type: "string",
            variable: "$INTENTS_COMPLETED",
            default: "7"
          }
        ]
      }
    ],

    observable_events: [
      "SESSION_STATUS",
      "STATS_UPDATE",
      "PROFILE_LOADED",
      "HEALTH_CHECK_RESULT",
      "GITHUB_TOKEN_STORED",
      "GITHUB_ACCOUNT_CREATED",
      "ACCOUNT_REGISTERED",
      "VAULT_INITIALIZED"
    ]
    };
  }
})();

