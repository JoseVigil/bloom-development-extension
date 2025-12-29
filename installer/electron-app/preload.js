const { contextBridge, ipcRenderer } = require('electron');

// ============================================================================
// UNIFIED API EXPOSURE - WORKS FOR BOTH MODES
// ============================================================================

contextBridge.exposeInMainWorld('api', {
  // ==========================================
  // INSTALL MODE HANDLERS
  // ==========================================
  
  installService: () => ipcRenderer.invoke('brain:install-extension'),
  launchGodMode: () => ipcRenderer.invoke('brain:launch'),
  checkExtensionHeartbeat: () => ipcRenderer.invoke('extension:heartbeat'),
  preflightChecks: () => ipcRenderer.invoke('preflight-checks'),

  // ==========================================
  // LAUNCH MODE HANDLERS
  // ==========================================
  
  healthCheck: () => ipcRenderer.invoke('health:check'),
  getOnboardingStatus: () => ipcRenderer.invoke('onboarding:status'),
  listProfiles: () => ipcRenderer.invoke('profile:list'),
  launchProfile: (profileId, url) => ipcRenderer.invoke('profile:launch', { profileId, url }),
  createProfile: (name, type) => ipcRenderer.invoke('profile:create', { name, type }),
  tailLogs: (lines) => ipcRenderer.invoke('logs:tail', { lines }),

  // ==========================================
  // SHARED HANDLERS
  // ==========================================
  
  getSystemInfo: () => ipcRenderer.invoke('system:info'),
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
  openFolder: (path) => ipcRenderer.invoke('open-folder', path),
  openChromeExtensions: () => ipcRenderer.invoke('open-chrome-extensions'),
  openLogsFolder: () => ipcRenderer.invoke('open-logs-folder'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  openUrl: (url) => ipcRenderer.invoke('open-url', url),

  // ✅ CRÍTICO: Handler para abrir Bloom Launcher
  launchBloomLauncher: (onboarding = false) => 
    ipcRenderer.invoke('launcher:open', { onboarding }),

  // ==========================================
  // EVENT LISTENERS
  // ==========================================
  
  on: (channel, callback) => {
    const validChannels = [
      'installation-progress',
      'installation-error',
      'server-status',
      'health:status',
      'onboarding:status',
      'profiles:list',
      'dashboard:error',
      'error'
    ];
    
    if (validChannels.includes(channel)) {
      ipcRenderer.removeAllListeners(channel);
      ipcRenderer.on(channel, (event, ...args) => callback(...args));
    } else {
      console.warn(`Channel ${channel} is not whitelisted`);
    }
  },

  removeListener: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  },

  // Legacy compatibility
  onInstallationProgress: (callback) => {
    ipcRenderer.on('installation-progress', (event, data) => callback(data));
  },

  onInstallationError: (callback) => {
    ipcRenderer.on('installation-error', (event, error) => callback(error));
  },

  onServerStatus: (callback) => {
    ipcRenderer.on('server-status', (event, data) => callback(data));
  }
});

// Development tools exposure
if (process.env.NODE_ENV === 'development') {
  contextBridge.exposeInMainWorld('devTools', {
    log: (...args) => console.log('[Renderer]', ...args),
    error: (...args) => console.error('[Renderer]', ...args),
    warn: (...args) => console.warn('[Renderer]', ...args)
  });
}