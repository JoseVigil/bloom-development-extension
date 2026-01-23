// ============================================================================
// SYNAPSE LANDING PROTOCOL
// Protocol for profile cockpit UI and messaging
// ============================================================================

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
    actionsGrid: null,
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
    this.elements.actionsGrid = document.getElementById('actions-grid');
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
      this.updateLoadingMessage('🔄 Initializing...');
      this.updateStatusDots('checking');
      
      if (this.config.debugMode) {
        console.log('[Protocol] Initialization phase');
      }
    },

    loading(context) {
      this.showScreen('loading');
      this.updateLoadingMessage('⏳ Loading profile data...');
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

    // Quick actions
    this.renderActions();

    // System info
    this.renderSystemInfo(profile.system);
  },

  renderStats(stats) {
    if (!this.elements.statsGrid || !stats) return;

    const statsConfig = [
      { icon: '📊', label: 'Total Launches', value: stats.totalLaunches || 0 },
      { icon: '⏱️', label: 'Uptime', value: this.formatUptime(stats.uptime || 0) },
      { icon: '✅', label: 'Intents Done', value: stats.intentsCompleted || 0 },
      { icon: '⚡', label: 'Last Sync', value: this.formatLastSync(stats.lastSync) }
    ];

    this.elements.statsGrid.innerHTML = statsConfig.map(stat => `
      <div class="stat-card">
        <div class="stat-header">
          <span>${stat.icon}</span>
          <span>${stat.label}</span>
        </div>
        <div class="stat-value">${stat.value}</div>
      </div>
    `).join('');
  },

  renderAccounts(accounts) {
    if (!this.elements.accountsList) return;

    if (!accounts || accounts.length === 0) {
      this.elements.accountsList.innerHTML = '<p class="empty-state">No accounts linked yet</p>';
      return;
    }

    this.elements.accountsList.innerHTML = accounts.map(account => `
      <div class="account-item">
        <div class="account-avatar">${(account.provider || 'A')[0].toUpperCase()}</div>
        <div class="account-info">
          <div class="account-provider">${account.provider || 'Unknown'}</div>
          <div class="account-email">${account.email || account.username || '-'}</div>
        </div>
        <div class="account-status ${account.status || 'unknown'}"></div>
      </div>
    `).join('');
  },

  renderActions() {
    if (!this.elements.actionsGrid) return;

    const actions = [
      { icon: '🛡️', title: 'Sync Nucleus', subtitle: 'Update projects', command: 'nucleus sync' },
      { icon: '📋', title: 'View Intents', subtitle: 'Active tasks', command: 'intent list' },
      { icon: '✅', title: 'Health Check', subtitle: 'System status', command: 'health full-stack' },
      { icon: '👤', title: 'All Profiles', subtitle: 'Manage workers', command: 'profile list' }
    ];

    this.elements.actionsGrid.innerHTML = actions.map(action => `
      <button class="action-btn" data-command="${action.command}">
        <div class="icon">${action.icon}</div>
        <div class="title">${action.title}</div>
        <div class="subtitle">${action.subtitle}</div>
      </button>
    `).join('');

    // Attach event listeners
    this.elements.actionsGrid.querySelectorAll('.action-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const command = btn.getAttribute('data-command');
        if (command && window.executeCommand) {
          window.executeCommand(command);
        }
      });
    });
  },

  renderSystemInfo(system) {
    if (!this.elements.systemInfo || !system) return;

    this.elements.systemInfo.innerHTML = `
      <div>Profile ID: <span>${system.id || '-'}</span></div>
      <div>Created: <span>${this.formatDate(system.created)}</span></div>
      <div>Last Launch: <span>${this.formatDateTime(system.lastLaunch)}</span></div>
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