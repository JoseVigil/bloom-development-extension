// preload.js - CORREGIDO: Sin require('path') ni otros módulos Node
const { contextBridge, ipcRenderer } = require('electron');

// ============================================================================
// UNIFIED API EXPOSURE - WORKS FOR BOTH MODES
// ============================================================================

contextBridge.exposeInMainWorld('electronAPI', {
  // ==========================================
  // PATH UTILITIES (VIA IPC - NO DIRECT REQUIRE)
  // ==========================================
  
  // Solicita al main process que calcule rutas de forma segura
  getPath: (type, ...args) => ipcRenderer.invoke('path:resolve', { type, args }),
  
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
  tailLogs: (lines) => ipcRenderer.invoke('logs:tail', { lines }),

  // ==========================================
  // SHARED HANDLERS
  // ==========================================
  
  getSystemInfo: () => ipcRenderer.invoke('system:info'),
  getAppVersion: () => ipcRenderer.invoke('app:version'),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),

  // ==========================================
  // EVENT HANDLERS
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
      'error',
      'app:initialized',
      'show-onboarding',
      'show-dashboard',
      'services:status'
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
  },
});

// Development tools exposure
if (process.env.NODE_ENV === 'development') {
  contextBridge.exposeInMainWorld('devTools', {
    log: (...args) => console.log('[Renderer]', ...args),
    error: (...args) => console.error('[Renderer]', ...args),
    warn: (...args) => console.warn('[Renderer]', ...args),
    getDirname: () => __dirname,
    pathJoin: (...args) => path.join(...args)
  });
}