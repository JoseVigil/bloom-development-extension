// preload.js - FIXED: Compatible con renderer.js existente
const { contextBridge, ipcRenderer } = require('electron');

// ============================================================================
// UNIFIED API EXPOSURE - WORKS FOR BOTH MODES
// ============================================================================

const API = {
  // ==========================================
  // PATH UTILITIES
  // ==========================================
  
  getPath: (type, ...args) => ipcRenderer.invoke('path:resolve', { type, args }),
  
  // ==========================================
  // PORT CHECKING (TCP robust detection)
  // ==========================================
  
  checkPort: (port, host = 'localhost') => 
    ipcRenderer.invoke('port:check', { port, host }),
  
  // ==========================================
  // INSTALL MODE HANDLERS (Existing)
  // ==========================================
  
  installService: () => ipcRenderer.invoke('install:start'),
  launchGodMode: (profileId) => ipcRenderer.invoke('brain:launch', profileId),
  checkExtensionHeartbeat: () => ipcRenderer.invoke('extension:heartbeat'),
  preflightChecks: () => ipcRenderer.invoke('preflight-checks'),
  
  // NEW: Métodos adicionales para install mode
  startInstallation: (options = {}) => ipcRenderer.invoke('install:start', options),
  checkRequirements: () => ipcRenderer.invoke('install:check-requirements'),
  cleanupInstallation: () => ipcRenderer.invoke('install:cleanup'),

  // ==========================================
  // LAUNCH MODE HANDLERS (Existing)
  // ==========================================
  
  healthCheck: () => ipcRenderer.invoke('health:check'),
  getOnboardingStatus: () => ipcRenderer.invoke('onboarding:status'),
  listProfiles: () => ipcRenderer.invoke('profile:list'),
  launchProfile: (profileId, url) => ipcRenderer.invoke('profile:launch', { profileId, url }),
  tailLogs: (lines) => ipcRenderer.invoke('logs:tail', { lines }),
  
  // NEW: Métodos adicionales para launch mode
  getEnvironment: () => ipcRenderer.invoke('environment:get'),
  checkAllServices: () => ipcRenderer.invoke('services:check-all'),

  // ==========================================
  // SHARED HANDLERS
  // ==========================================
  
  getSystemInfo: () => ipcRenderer.invoke('system:info'),
  getAppVersion: () => ipcRenderer.invoke('app:version'),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  openLogsFolder: () => ipcRenderer.invoke('shell:openLogsFolder'),
  launchBloomLauncher: (withOnboarding = false) => 
    ipcRenderer.invoke('launcher:open', { onboarding: withOnboarding }),

  // ==========================================
  // EVENT HANDLERS
  // ==========================================
  
  on: (channel, callback) => {
    const validChannels = [
      // Install mode events
      'installation-progress',
      'installation-error',
      'installation-complete',
      
      // Launch mode events
      'server-status',
      'health:status',
      'onboarding:status',
      'profiles:list',
      'dashboard:error',
      'services:status',
      
      // Shared events
      'error',
      'app:initialized',
      'show-onboarding',
      'show-dashboard'
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
};

// ============================================================================
// EXPOSE API WITH MULTIPLE NAMES (for compatibility)
// ============================================================================

// Nombre nuevo (para código futuro)
contextBridge.exposeInMainWorld('electronAPI', API);

// Nombre legacy (para renderer.js existente)
contextBridge.exposeInMainWorld('api', API);

// ============================================================================
// DEVELOPMENT TOOLS
// ============================================================================

if (process.env.NODE_ENV === 'development') {
  contextBridge.exposeInMainWorld('devTools', {
    log: (...args) => console.log('[Renderer]', ...args),
    error: (...args) => console.error('[Renderer]', ...args),
    warn: (...args) => console.warn('[Renderer]', ...args),
    info: (...args) => console.info('[Renderer]', ...args),
  });
}

// ============================================================================
// LOGGING
// ============================================================================

console.log('🌸 [PRELOAD] Preload script loaded');
console.log('📋 [PRELOAD] API exposed as: window.api & window.electronAPI');
if (process.env.NODE_ENV === 'development') {
  console.log('🔧 [PRELOAD] DevTools exposed');
}