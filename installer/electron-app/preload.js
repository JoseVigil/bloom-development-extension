const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('bloomAPI', {
  getSystemInfo: () => ipcRenderer.invoke('get-system-info'),
  
  startInstallation: (config) => ipcRenderer.invoke('start-installation', config),
  
  onInstallationProgress: (callback) => {
    ipcRenderer.on('installation-progress', (event, data) => callback(data));
  },
  
  openChromeExtensions: () => ipcRenderer.invoke('open-chrome-extensions'),
  
  openVSCode: () => ipcRenderer.invoke('open-vscode')
});