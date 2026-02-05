const { contextBridge, ipcRenderer } = require('electron');

// Expose secure API to renderer process
contextBridge.exposeInMainWorld('nucleus', {
  // Health monitoring
  health: () => ipcRenderer.invoke('nucleus:health'),
  
  // Profile management
  listProfiles: () => ipcRenderer.invoke('nucleus:list-profiles'),
  launchProfile: (profileId) => ipcRenderer.invoke('nucleus:launch-profile', profileId),
  createProfile: (profileName) => ipcRenderer.invoke('nucleus:create-profile', profileName),
  
  // Installation info
  getInstallation: () => ipcRenderer.invoke('nucleus:get-installation')
});
