const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // ==========================================
  // 1. CORE: INSTALACIÓN Y LANZAMIENTO
  // ==========================================
  
  // CAMBIO: Renombrado de 'install-service' a 'brain:install-extension'
  installService: () => ipcRenderer.invoke('brain:install-extension'),
  
  // CAMBIO: Renombrado de 'launch-god-mode' a 'brain:launch'
  launchGodMode: () => ipcRenderer.invoke('brain:launch'),

  // ==========================================
  // 2. DEPENDENCIAS Y SISTEMA
  // ==========================================
  
  // CAMBIO: Renombrado de 'get-system-info' a 'system:info'
  getSystemInfo: () => ipcRenderer.invoke('system:info'),
  
  preflightChecks: () => ipcRenderer.invoke('preflight-checks'),
  installVCRedist: () => ipcRenderer.invoke('install-vc-redist'),

  // ==========================================
  // 3. EXTENSIÓN Y ONBOARDING
  // ==========================================
  
  installExtension: () => ipcRenderer.invoke('install-extension'),
  checkExtensionHeartbeat: () => ipcRenderer.invoke('check-extension-heartbeat'),
  openBTIPConfig: () => ipcRenderer.invoke('open-btip-config'),
  checkOnboardingStatus: () => ipcRenderer.invoke('check-onboarding-status'),

  // ==========================================
  // 4. HELPERS DE SISTEMA
  // ==========================================
  
  openFolder: (path) => ipcRenderer.invoke('open-folder', path),
  openChromeExtensions: () => ipcRenderer.invoke('open-chrome-extensions'),
  openLogsFolder: () => ipcRenderer.invoke('open-logs-folder'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),

  // ==========================================
  // 5. EVENTOS (UI FEEDBACK)
  // ==========================================
  
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