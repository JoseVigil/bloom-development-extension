// preload_onboarding.js — Bloom Conductor
// Integración Onboarding UI + Synapse Protocol v4.0
//
// CAMBIOS (sesión 2026-06):
//   - onMilestone: listener para 'milestone:reached' emitido por MilestoneReactor
//   - onStepUpdate: listener para 'onboarding:step-ui-update' para actualizaciones granulares de UI
//   Ambos canales usan removeAllListeners antes de registrar el callback nuevo,
//   consistente con el patrón ya establecido en onInitLine.

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
  },

  // Completar un step manualmente (fallback cuando Brain no escribe completed_steps)
  markStepComplete: (params) => ipcRenderer.invoke('onboarding:mark-step-complete', params),

  // Logger bridge — renderer → main → archivo de log
  log: (level, message) => ipcRenderer.invoke('onboarding:log', { level, message }),

  // System health — ejecuta nucleus --json health en el main process
  // y devuelve el JSON parseado. El debug panel lo usa para el sidebar.
  health: () => ipcRenderer.invoke('onboarding:health'),

  // ── Push del MilestoneReactor (Cambio 6) ──────────────────────────────
  //
  // onMilestone — emitido por MilestoneReactor cuando un hito se completa.
  // Payload: { stepId: string, _ts: number, ...extra }
  // stepId puede ser cualquier ID de onboarding_steps.json, o el especial
  // '__onboarding_complete__' cuando todos los steps bloqueantes terminaron.
  //
  // Uso en onboarding.js:
  //   window.onboarding.onMilestone(({ stepId, ...data }) => {
  //     handleMilestoneReached(stepId, data);
  //   });
  //
  onMilestone: (callback) => {
    ipcRenderer.removeAllListeners('milestone:reached');
    ipcRenderer.on('milestone:reached', (_, data) => callback(data));
  },

  // onStepUpdate — emitido por MilestoneReactor para actualizaciones granulares de UI.
  // Payload: { stepId: string, phase: string, _ts: number }
  // phase puede ser 'ESTABLISHED', 'IN_PROGRESS', 'ERROR', etc.
  // Permite que el renderer actualice el stepper sin esperar al milestone completo.
  //
  // Uso en onboarding.js:
  //   window.onboarding.onStepUpdate(({ stepId, phase }) => {
  //     if (phase === 'ESTABLISHED') setStepperEstablished(STEP_TO_NODE[stepId]);
  //   });
  //
  onStepUpdate: (callback) => {
    ipcRenderer.removeAllListeners('onboarding:step-ui-update');
    ipcRenderer.on('onboarding:step-ui-update', (_, data) => callback(data));
  },

  // onSynapseEvent — feed raw de mensajes Synapse, sin filtrar ni clasificar.
  // Solo se emite cuando el bridge corre en modo verbose (ver
  // workspace-synapse-handlers.js). Pensado para el panel de debug.
  // Payload: el mensaje 'enriched' tal cual lo emite SynapseBridge.
  onSynapseEvent: (callback) => {
    ipcRenderer.removeAllListeners('synapse:raw-event');
    ipcRenderer.on('synapse:raw-event', (_, data) => callback(data));
  },
});
