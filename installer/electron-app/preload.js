const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bloomAPI', {
  getSystemInfo: () => ipcRenderer.invoke('get-system-info'),
  
  startInstallation: (config) => ipcRenderer.invoke('start-installation', config),
  
  onInstallationProgress: (callback) => {
    ipcRenderer.on('installation-progress', (event, data) => callback(data));
  },
  
  detectChromeProfiles: () => ipcRenderer.invoke('detect-chrome-profiles'),
  
  validateExtensionId: (extensionId) => ipcRenderer.invoke('validate-extension-id', extensionId),
  
  finalizeSetup: (data) => ipcRenderer.invoke('finalize-setup', data),
  
  openChromeExtensions: () => ipcRenderer.invoke('open-chrome-extensions'),
  
  openFolder: (folderPath) => ipcRenderer.invoke('open-folder', folderPath)
});