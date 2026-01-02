// src/launch/preload_launch.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // App info
  getAppInfo: () => ipcRenderer.invoke('app:info'),
  
  // Health checks
  healthCheck: () => ipcRenderer.invoke('health:check'),
  
  // Onboarding
  checkOnboarding: () => ipcRenderer.invoke('onboarding:status'),
  
  // Profiles
  listProfiles: () => ipcRenderer.invoke('profiles:list'),
  launchProfile: (profileId, url) => ipcRenderer.invoke('profiles:launch', profileId, url),
  
  // Logs
  tailLogs: (lines) => ipcRenderer.invoke('logs:tail', lines),
  openLogsFolder: () => ipcRenderer.invoke('logs:open'),
  
  // Shell
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  
  // Event listeners
  on: (channel, callback) => {
    const subscription = (event, ...args) => callback(...args);
    ipcRenderer.on(channel, subscription);
    return () => ipcRenderer.removeListener(channel, subscription);
  },
  
  once: (channel, callback) => {
    ipcRenderer.once(channel, (event, ...args) => callback(...args));
  },
  
  removeListener: (channel, callback) => {
    ipcRenderer.removeListener(channel, callback);
  }
});

console.log('✅ Preload script loaded for launch window');