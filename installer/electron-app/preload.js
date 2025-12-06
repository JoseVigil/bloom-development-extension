const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getSystemInfo: () => ipcRenderer.invoke('get-system-info'),
  preflightChecks: () => ipcRenderer.invoke('preflight-checks'),
  startInstallation: (config) => ipcRenderer.invoke('start-installation', config),
  installVCRedist: () => ipcRenderer.invoke('install-vc-redist'),
  installService: () => ipcRenderer.invoke('install-service'),
  checkServiceStatus: () => ipcRenderer.invoke('check-service-status'),
  detectChromeProfiles: () => ipcRenderer.invoke('detect-chrome-profiles'),
  validateExtensionId: (extensionId) => ipcRenderer.invoke('validate-extension-id', extensionId),
  finalizeSetup: (config) => ipcRenderer.invoke('finalize-setup', config),
  openChromeExtensions: () => ipcRenderer.invoke('open-chrome-extensions'),
  openFolder: (folderPath) => ipcRenderer.invoke('open-folder', folderPath),
  openLogsFolder: () => ipcRenderer.invoke('open-logs-folder'),
  onInstallationProgress: (callback) => {
    ipcRenderer.on('installation-progress', (event, data) => callback(data));
  }
});