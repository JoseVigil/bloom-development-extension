const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // ==========================================
  // 1. INSTALACIÓN COMPLETA (GOLDEN PATH)
  // ==========================================
  
  installService: () => ipcRenderer.invoke('brain:install-extension'),
  launchGodMode: () => ipcRenderer.invoke('brain:launch'),

  // ==========================================
  // 2. SISTEMA E INFO
  // ==========================================
  
  getSystemInfo: () => ipcRenderer.invoke('system:info'),
  preflightChecks: () => ipcRenderer.invoke('preflight-checks'),

  // ==========================================
  // 3. HEARTBEAT Y VALIDACIÓN
  // ==========================================
  
  checkExtensionHeartbeat: () => ipcRenderer.invoke('extension:heartbeat'),

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