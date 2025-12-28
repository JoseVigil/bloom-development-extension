// ============================================================================
// BLOOM LAUNCHER - RENDERER PROCESS (Launch Mode)
// ============================================================================

class BloomLauncherUI {
  constructor() {
    this.currentView = 'dashboard';
    this.profiles = [];
    this.healthStatus = null;
    this.logBuffer = [];
    this.wsConnection = null;
    
    this.init();
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  async init() {
    console.log('🚀 Initializing Bloom Launcher UI...');
    
    this.setupEventListeners();
    this.setupIPCListeners();
    await this.loadInitialData();
    this.connectWebSocket();
    
    // Auto-refresh every 30 seconds
    setInterval(() => this.refreshCurrentView(), 30000);
  }

  setupEventListeners() {
    // Navigation buttons
    document.querySelectorAll('.nav-button').forEach(btn => {
      btn.addEventListener('click', () => {
        const view = btn.dataset.view;
        this.switchView(view);
      });
    });

    // Refresh button
    document.getElementById('refresh-btn')?.addEventListener('click', () => {
      this.refreshCurrentView();
    });

    // Clear logs button
    document.getElementById('clear-logs')?.addEventListener('click', () => {
      this.clearLogs('dashboard-logs');
    });

    // Export logs button
    document.getElementById('export-logs')?.addEventListener('click', () => {
      this.exportLogs();
    });
  }

  setupIPCListeners() {
    // Health status updates
    window.api.on('health:status', (status) => {
      this.updateHealthStatus(status);
    });

    // Onboarding status updates
    window.api.on('onboarding:status', (status) => {
      if (!status.completed) {
        this.showOnboardingPrompt();
      }
    });

    // Profiles list updates
    window.api.on('profiles:list', (profiles) => {
      this.profiles = profiles;
      if (this.currentView === 'profiles') {
        this.renderProfiles();
      }
    });

    // Dashboard errors
    window.api.on('dashboard:error', (error) => {
      this.showError(error);
    });

    // Generic errors
    window.api.on('error', (error) => {
      console.error('Error from main process:', error);
      this.showError(error);
    });
  }

  // ============================================================================
  // DATA LOADING
  // ============================================================================

  async loadInitialData() {
    try {
      const appInfo = await window.api.getAppInfo();
      console.log('📱 App Info:', appInfo);

      const health = await window.api.healthCheck();
      this.updateHealthStatus(health);

      const profiles = await window.api.listProfiles();
      this.profiles = profiles;

      await this.loadLogs();

      console.log('✅ Initial data loaded successfully');
    } catch (error) {
      console.error('❌ Error loading initial data:', error);
      this.showError({
        type: 'init',
        message: 'Error loading initial data',
        error: error.message
      });
    }
  }

  async refreshCurrentView() {
    console.log(`🔄 Refreshing ${this.currentView} view...`);
    
    switch (this.currentView) {
      case 'dashboard':
        await this.refreshDashboard();
        break;
      case 'profiles':
        await this.refreshProfiles();
        break;
      case 'activity':
        await this.loadLogs(100);
        break;
    }
  }

  async refreshDashboard() {
    const health = await window.api.healthCheck();
    this.updateHealthStatus(health);
    await this.loadLogs(50);
  }

  async refreshProfiles() {
    const profiles = await window.api.listProfiles();
    this.profiles = profiles;
    this.renderProfiles();
  }

  // ============================================================================
  // VIEW MANAGEMENT
  // ============================================================================

  switchView(viewName) {
    // Update navigation
    document.querySelectorAll('.nav-button').forEach(btn => {
      btn.classList.remove('active');
      if (btn.dataset.view === viewName) {
        btn.classList.add('active');
      }
    });

    // Update content
    document.querySelectorAll('.view').forEach(view => {
      view.classList.remove('active');
    });
    document.getElementById(`${viewName}-view`)?.classList.add('active');

    // Update header title
    const titles = {
      dashboard: 'Dashboard',
      profiles: 'Profiles',
      activity: 'System Activity'
    };
    document.getElementById('view-title').textContent = titles[viewName] || viewName;

    this.currentView = viewName;
    this.loadViewData(viewName);
  }

  async loadViewData(viewName) {
    switch (viewName) {
      case 'dashboard':
        await this.refreshDashboard();
        break;
      case 'profiles':
        this.renderProfiles();
        break;
      case 'activity':
        await this.loadLogs(100);
        break;
    }
  }

  // ============================================================================
  // HEALTH STATUS
  // ============================================================================

  updateHealthStatus(health) {
    this.healthStatus = health;
    
    const statusDot = document.getElementById('status-dot');
    const statusText = document.getElementById('status-text');
    const systemHealth = document.getElementById('system-health');

    if (health.status === 'ok') {
      statusDot.style.background = 'var(--success)';
      statusText.textContent = 'System OK';
      if (systemHealth) {
        systemHealth.textContent = '✓';
        systemHealth.style.color = 'var(--success)';
      }
    } else {
      statusDot.style.background = 'var(--error)';
      statusText.textContent = 'Errors detected';
      if (systemHealth) {
        systemHealth.textContent = '✗';
        systemHealth.style.color = 'var(--error)';
      }
      
      this.showError({
        type: 'health',
        message: 'System health issues detected',
        details: health
      });
    }
  }

  // ============================================================================
  // PROFILES RENDERING
  // ============================================================================

  renderProfiles() {
    const container = document.getElementById('profiles-container');
    
    if (!this.profiles || this.profiles.length === 0) {
      container.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 60px; color: var(--text-secondary);">
          <p style="font-size: 18px; margin-bottom: 12px;">No profiles configured</p>
          <p style="font-size: 14px;">Profiles will be created automatically during onboarding</p>
        </div>
      `;
      return;
    }

    const profilesHTML = this.profiles.map(profile => `
      <div class="profile-card" data-profile-id="${profile.id}">
        <div class="profile-header">
          <div class="profile-info">
            <h3>${profile.name || profile.id}</h3>
            <span class="profile-type">${profile.type || 'worker'}</span>
          </div>
        </div>
        <div class="profile-actions">
          <button class="btn btn-small btn-primary" onclick="launcherUI.launchProfile('${profile.id}')">
            🚀 Launch
          </button>
          <button class="btn btn-small btn-secondary" onclick="launcherUI.launchProfileWithUrl('${profile.id}')">
            🌐 Open URL
          </button>
        </div>
      </div>
    `).join('');

    container.innerHTML = profilesHTML;
    document.getElementById('active-profiles').textContent = this.profiles.length;
  }

  async launchProfile(profileId) {
    try {
      console.log(`🚀 Launching profile: ${profileId}`);
      const result = await window.api.launchProfile(profileId, null);
      
      if (result.success) {
        this.addLogEntry(`Profile ${profileId} launched successfully (PID: ${result.pid})`);
      } else {
        this.showError({
          type: 'profile',
          message: `Error launching profile ${profileId}`,
          error: result.error
        });
      }
    } catch (error) {
      console.error('Error launching profile:', error);
      this.showError({
        type: 'profile',
        message: 'Error launching profile',
        error: error.message
      });
    }
  }

  async launchProfileWithUrl(profileId) {
    const url = prompt('Enter URL to open:', 'http://localhost:48215/');
    if (url) {
      try {
        const result = await window.api.launchProfile(profileId, url);
        if (result.success) {
          this.addLogEntry(`Profile ${profileId} launched with URL: ${url}`);
        }
      } catch (error) {
        this.showError({
          type: 'profile',
          message: 'Error launching profile with URL',
          error: error.message
        });
      }
    }
  }

  // ============================================================================
  // LOGS & ACTIVITY
  // ============================================================================

  async loadLogs(lines = 50) {
    try {
      const result = await window.api.tailLogs(lines);
      
      if (result.success) {
        const logsContainer = this.currentView === 'activity' 
          ? document.getElementById('full-logs')
          : document.getElementById('dashboard-logs');
        
        if (logsContainer) {
          this.renderLogs(result.logs, logsContainer);
        }
        
        document.getElementById('recent-events').textContent = result.logs.length;
      }
    } catch (error) {
      console.error('Error loading logs:', error);
    }
  }

  renderLogs(logs, container) {
    if (!logs || logs.length === 0) {
      container.innerHTML = '<div style="color: var(--text-secondary); text-align: center; padding: 40px;">No logs available</div>';
      return;
    }

    const logsHTML = logs
      .filter(log => log.trim())
      .map(log => {
        const match = log.match(/\[(.*?)\]\s*(\w+):\s*(.*)/);
        if (match) {
          const [, timestamp, level, message] = match;
          const levelClass = level.toLowerCase();
          return `
            <div class="log-entry log-${levelClass}">
              <span class="log-timestamp">[${timestamp}]</span>
              <span class="log-level">${level}:</span>
              <span class="log-message">${this.escapeHtml(message)}</span>
            </div>
          `;
        }
        return `<div class="log-entry">${this.escapeHtml(log)}</div>`;
      })
      .join('');

    container.innerHTML = logsHTML;
    container.scrollTop = container.scrollHeight;
  }

  addLogEntry(message) {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] INFO: ${message}`;
    
    this.logBuffer.push(logEntry);
    if (this.logBuffer.length > 100) {
      this.logBuffer.shift();
    }

    const container = document.getElementById('dashboard-logs');
    if (container && this.currentView === 'dashboard') {
      this.renderLogs([...this.logBuffer], container);
    }
  }

  clearLogs(containerId) {
    const container = document.getElementById(containerId);
    if (container) {
      container.innerHTML = '<div style="color: var(--text-secondary); text-align: center; padding: 40px;">Logs cleared</div>';
    }
    this.logBuffer = [];
  }

  async exportLogs() {
    try {
      const result = await window.api.tailLogs(1000);
      if (result.success) {
        const blob = new Blob([result.logs.join('\n')], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `bloom-logs-${new Date().toISOString()}.txt`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Error exporting logs:', error);
    }
  }

  // ============================================================================
  // WEBSOCKET CONNECTION
  // ============================================================================

  connectWebSocket() {
    try {
      this.wsConnection = new WebSocket('ws://localhost:4124');
      
      this.wsConnection.onopen = () => {
        console.log('🔌 WebSocket connected to activity feed');
        this.addLogEntry('Connected to real-time activity feed');
      };

      this.wsConnection.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleWebSocketMessage(data);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      this.wsConnection.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

      this.wsConnection.onclose = () => {
        console.log('WebSocket disconnected, reconnecting in 5s...');
        this.addLogEntry('Activity feed disconnected, reconnecting...');
        setTimeout(() => this.connectWebSocket(), 5000);
      };
    } catch (error) {
      console.error('Error connecting to WebSocket:', error);
    }
  }

  handleWebSocketMessage(data) {
    if (data.type === 'nucleus:created' || data.type === 'nucleus:updated') {
      this.addLogEntry(`Nucleus event: ${data.type} - ${data.message || ''}`);
    } else if (data.type === 'profile:launched') {
      this.addLogEntry(`Profile launched: ${data.profileId}`);
    } else {
      this.addLogEntry(`Event: ${data.type}`);
    }

    if (this.currentView === 'dashboard') {
      this.refreshDashboard();
    }
  }

  // ============================================================================
  // ERROR HANDLING
  // ============================================================================

  showError(error) {
    const container = document.getElementById('error-container');
    if (!container) return;

    const errorHTML = `
      <div class="error-banner">
        <span class="error-icon">⚠️</span>
        <div class="error-content">
          <h4>${error.message || 'Unknown error'}</h4>
          ${error.error ? `<p>${this.escapeHtml(error.error)}</p>` : ''}
        </div>
      </div>
    `;

    container.innerHTML = errorHTML;

    setTimeout(() => {
      container.innerHTML = '';
    }, 10000);
  }

  showOnboardingPrompt() {
    const container = document.getElementById('error-container');
    if (!container) return;

    const promptHTML = `
      <div class="error-banner" style="border-color: var(--warning); background: rgba(245, 158, 11, 0.1);">
        <span class="error-icon" style="color: var(--warning);">ℹ️</span>
        <div class="error-content">
          <h4>Onboarding Incomplete</h4>
          <p>Initial setup process not completed. It will open automatically.</p>
        </div>
      </div>
    `;

    container.innerHTML = promptHTML;
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// ============================================================================
// INITIALIZE
// ============================================================================

let launcherUI;

document.addEventListener('DOMContentLoaded', () => {
  console.log('📄 DOM Content Loaded - Initializing Bloom Launcher...');
  launcherUI = new BloomLauncherUI();
  window.launcherUI = launcherUI;
});

window.addEventListener('beforeunload', () => {
  if (launcherUI && launcherUI.wsConnection) {
    launcherUI.wsConnection.close();
  }
});