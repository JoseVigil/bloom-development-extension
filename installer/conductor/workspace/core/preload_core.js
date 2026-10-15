// preload_core.js — Bloom Conductor
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

  // D-23 — Core lee el pending sin borrarlo y lo confirma sólo después del
  // POST exitoso. El acknowledge correlacionado elimina el flag durable.
  readPendingGenesisLaunch: () => ipcRenderer.invoke('onboarding:read-pending-genesis-launch'),
  ackPendingGenesisLaunch: (params) => ipcRenderer.invoke('onboarding:ack-pending-genesis-launch', params),

  // Durable Genesis continuity owned by Nucleus.
  recoverGenesis: (params) => ipcRenderer.invoke('core:genesis-recover', params),
  ackGenesisRecovery: (params) => ipcRenderer.invoke('core:genesis-ack-recovery', params),
  genesisProjectStatus: (params) => ipcRenderer.invoke('core:genesis-project-status', params),

  // Marcar step como completado (confirmación externa o fallback manual)
  markStepComplete: (params) => ipcRenderer.invoke('onboarding:mark-step-complete', params),

  // Finalizar
  complete: (params) => ipcRenderer.invoke('onboarding:complete', params),

  // Streaming terminal (nucleus init)
  onInitLine: (callback) => {
    ipcRenderer.removeAllListeners('onboarding:init-line');
    ipcRenderer.on('onboarding:init-line', (_, data) => callback(data));
  },

  // Logger bridge — renderer → main → archivo de log
  log: (level, message) => ipcRenderer.invoke('onboarding:log', { level, message })
});

// ── window.nucleus ───────────────────────────────────────────────────────
// Expone los handlers 'nucleus:*' registrados en setupNucleusHandlers()
// (main_conductor.js). Antes de este fix no existía ningún bridge para
// estos canales del lado preload — los ipcMain.handle('nucleus:...')
// estaban registrados pero inalcanzables desde el renderer de Core/Workspace.
contextBridge.exposeInMainWorld('nucleus', {
  // Estado de salud de todos los componentes (usado por el sidebar del debug panel)
  health: () => ipcRenderer.invoke('nucleus:health'),

  // Listar perfiles de Chrome disponibles
  listProfiles: () => ipcRenderer.invoke('nucleus:list-profiles'),

  // Lanzar un perfil. mode es opcional ('landing' | 'discovery'); sin mode
  // cae en el default del binario (discovery).
  launchProfile: (profileId, mode) => ipcRenderer.invoke('nucleus:launch-profile', profileId, mode),

  // Crear un nuevo perfil
  createProfile: (profileName) => ipcRenderer.invoke('nucleus:create-profile', profileName),

  // Leer installation/onboarding desde nucleus.json
  getInstallation: () => ipcRenderer.invoke('nucleus:get-installation')
});

contextBridge.exposeInMainWorld('intelligenceSupply', {
  read: () => ipcRenderer.invoke('core:intelligence-supply-read')
});

contextBridge.exposeInMainWorld('confirmedContext', {
  read: () => ipcRenderer.invoke('core:confirmed-context-read')
});
