'use strict';

/**
 * shared/preload-synapse.js
 *
 * Fragmento de preload que expone la API de Synapse al renderer
 * via contextBridge. Debe ser requerido (o copiado inline) desde
 * el preload.js de cada app:
 *
 *   // setup/preload.js
 *   require('../../shared/preload-synapse');
 *
 *   // workspace/preload_onboarding.js  o  preload_core.js
 *   require('../../shared/preload-synapse');
 *
 * Expone window.bloomSynapse con:
 *
 *   bloomSynapse.onEvent(cb)          → suscripción a eventos Synapse
 *   bloomSynapse.seedAndLaunch(...)   → invoke al main
 *   bloomSynapse.launch(...)          → invoke al main
 *
 * IMPORTANTE: contextBridge.exposeInMainWorld() solo puede llamarse
 * una vez por nombre en el mismo proceso. Si tu preload.js ya llama
 * a contextBridge para otras APIs, usá la forma de merge que se muestra
 * en la sección de integración del documento explicativo.
 */

const { contextBridge, ipcRenderer } = require('electron');
const { SYNAPSE_IPC_CHANNEL } = require('./synapse-bridge');

contextBridge.exposeInMainWorld('bloomSynapse', {

  /**
   * Escucha eventos del protocolo Synapse en tiempo real.
   *
   * @param   {(event: object) => void} callback
   * @returns {() => void}  función para cancelar la suscripción
   *
   * Ejemplo:
   *   const off = window.bloomSynapse.onEvent(e => console.log(e));
   *   // ... más tarde:
   *   off();
   */
  onEvent(callback) {
    const handler = (_ipcEvent, payload) => callback(payload);
    ipcRenderer.on(SYNAPSE_IPC_CHANNEL, handler);
    return () => ipcRenderer.removeListener(SYNAPSE_IPC_CHANNEL, handler);
  },

  /**
   * Seed + launch de un perfil nuevo.
   * El main process gestiona la secuencia completa; los eventos de
   * progreso llegan via onEvent() mientras el Promise está pendiente.
   *
   * @param   {string}  alias
   * @param   {object}  [options]
   * @param   {boolean} [options.master=false]
   * @param   {string}  [options.mode='discovery']
   * @returns {Promise<{ success: boolean, profileId?: string, launchId?: string, error?: string }>}
   */
  seedAndLaunch(alias, options = {}) {
    return ipcRenderer.invoke('synapse:seedAndLaunch', { alias, options });
  },

  /**
   * Launch de un perfil ya existente.
   *
   * @param   {string}  profileIdOrAlias
   * @param   {object}  [options]
   * @param   {string}  [options.mode='landing']
   * @returns {Promise<{ success: boolean, profileId?: string, launchId?: string, error?: string }>}
   */
  launch(profileIdOrAlias, options = {}) {
    return ipcRenderer.invoke('synapse:launch', { profileIdOrAlias, options });
  },
});
