// preload_onboarding.js — Bloom Conductor
// Integración Onboarding UI + Synapse Protocol v4.0

'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('onboarding', {
  // Paso 0: lanzar Chrome con Discovery page en modo registro
  launchDiscovery: (params) => ipcRenderer.invoke('onboarding:launch-discovery', params),

  // Conductor → Chrome: navegar a un step específico
  // Usa nucleus synapse onboarding --step <step>
  navigate: (params) => ipcRenderer.invoke('onboarding:navigate', params),

  // Polling: qué cuentas están confirmadas en el perfil
  pollIdentity: () => ipcRenderer.invoke('onboarding:poll-identity'),

  // Nucleus setup
  selectFolder: () => ipcRenderer.invoke('onboarding:select-folder'),
  listOrgs:     (params) => ipcRenderer.invoke('onboarding:list-orgs', params),
  initNucleus:  (params) => ipcRenderer.invoke('onboarding:init-nucleus', params),

  // Project
  listRepos:     (params) => ipcRenderer.invoke('onboarding:list-repos', params),
  createMandate: (params) => ipcRenderer.invoke('onboarding:create-mandate', params),

  // Finalizar
  complete: (params) => ipcRenderer.invoke('onboarding:complete', params),

  // Streaming terminal (nucleus init)
  onInitLine: (callback) => {
    ipcRenderer.removeAllListeners('onboarding:init-line');
    ipcRenderer.on('onboarding:init-line', (_, data) => callback(data));
  }
});