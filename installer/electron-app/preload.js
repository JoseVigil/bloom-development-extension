const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Métodos de información del sistema
  getSystemInfo: () => ipcRenderer.invoke('get-system-info'),
  
  // Métodos de instalación
  preflightChecks: () => ipcRenderer.invoke('preflight-checks'),
  startInstallation: (config) => ipcRenderer.invoke('start-installation', config),
  installVCRedist: () => ipcRenderer.invoke('install-vc-redist'),
  installService: () => ipcRenderer.invoke('install-service'),
  checkServiceStatus: () => ipcRenderer.invoke('check-service-status'),
  finalizeSetup: (config) => ipcRenderer.invoke('finalize-setup', config),
  
  // Métodos de Chrome y extensiones
  detectChromeProfiles: () => ipcRenderer.invoke('detect-chrome-profiles'),
  validateExtensionId: (extensionId) => ipcRenderer.invoke('validate-extension-id', extensionId),
  openChromeExtensions: () => ipcRenderer.invoke('open-chrome-extensions'),
  
  // Métodos de configuración y archivos
  openBTIPConfig: () => ipcRenderer.invoke('open-btip-config'),
  openFolder: (folderPath) => ipcRenderer.invoke('open-folder', folderPath),
  showItemInFolder: (filePath) => ipcRenderer.invoke('show-item-in-folder', filePath),
  openLogsFolder: () => ipcRenderer.invoke('open-logs-folder'),
  
  // Métodos de estado
  checkOnboardingStatus: () => ipcRenderer.invoke('check-onboarding-status'),
  
  // Listeners de eventos
  onInstallationProgress: (callback) => {
    ipcRenderer.on('installation-progress', (event, data) => callback(data));
  },
  
  onServerStatus: (callback) => {
    ipcRenderer.on('server-status', (event, data) => callback(data));
  },
   getChromeProfiles: () => ipcRenderer.invoke('get-chrome-profiles'),
  installExtension: () => ipcRenderer.invoke('install-extension'),
  checkExtensionHeartbeat: () => ipcRenderer.invoke('check-extension-heartbeat'),
  launchChromeProfile: (args) => ipcRenderer.invoke('launch-chrome-profile', args),
  
  startDrag: (filePath) => ipcRenderer.send('ondragstart', filePath),
  updateExtensionId: (newId) => ipcRenderer.invoke('update-extension-id', newId),
});