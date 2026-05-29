'use strict';

/**
 * setup/ipc/setup-synapse-handlers.js
 *
 * Handlers ipcMain para el protocolo Synapse en la app de instalación.
 * Registrar desde setup/main.js después de que la ventana esté creada:
 *
 *   const { registerSynapseHandlers } = require('./ipc/setup-synapse-handlers');
 *   registerSynapseHandlers(() => mainWindow, { verbose: !app.isPackaged });
 *
 * Setup tiene una sola ventana activa a la vez, por lo que mantenemos
 * una única instancia de bridge (no un Map).
 *
 * COORDINACIÓN CON install:start
 * ──────────────────────────────
 * El handler install:start en main.js lanza el perfil via installService() y
 * luego conecta al Brain ServerManager sin relanzar nucleus.
 * En lugar de crear su propio bridge en main.js (lo que generaría dos instancias
 * simultáneas del bridge apuntando al mismo puerto TCP), usa la función exportada:
 *
 *   const { connectBrainForInstalledProfile } = require('./ipc/setup-synapse-handlers');
 *   connectBrainForInstalledProfile(win, profileId, launchId, { verbose: IS_DEV });
 *
 * Esto reutiliza el singleton _bridge de este módulo — solo hay una conexión TCP
 * activa a Brain en cualquier momento durante el flujo de setup.
 */

const { ipcMain, app } = require('electron');
const { SynapseBridge } = require('../../shared/synapse-bridge');

// Singleton: una sola instancia activa a la vez en todo el flujo de setup.
let _bridge = null;

// Opciones guardadas al registrar — usadas por connectBrainForInstalledProfile
// para construir el bridge con los mismos parámetros (nucleusBinary, verbose).
let _registeredOpts = {};

/**
 * @param {() => Electron.BrowserWindow | null} getWindow
 *   Función que retorna la ventana principal activa. Se recibe como función
 *   (no como referencia directa) para manejar el caso de que la ventana
 *   se recree durante el flujo de instalación.
 *
 * @param {object}  [opts]
 * @param {string}  [opts.nucleusBinary='nucleus']   Path o nombre del binario nucleus
 * @param {boolean} [opts.verbose=false]
 * @param {number}  [opts.nucleusTimeout=60000]      Timeout en ms para comandos nucleus
 */
function registerSynapseHandlers(getWindow, opts = {}) {
  const { nucleusBinary = 'nucleus', verbose = false, nucleusTimeout = 60_000 } = opts;
  _registeredOpts = { nucleusBinary, verbose, nucleusTimeout };

  // ── seed + launch ────────────────────────────────────────────────────────
  ipcMain.handle('synapse:seedAndLaunch', async (_event, { alias, options = {} }) => {
    const win = getWindow();
    if (!win) return { success: false, error: 'No hay ventana activa' };

    _destroyBridge();
    _bridge = new SynapseBridge({ mainWindow: win, nucleusBinary, verbose, nucleusTimeout });

    try {
      const result = await _bridge.seedAndLaunch(alias, options);
      return { success: true, ...result };
    } catch (err) {
      console.error('[setup-synapse-handlers] seedAndLaunch:', err.message);
      return { success: false, error: err.message };
    }
  });

  // ── launch de perfil existente ───────────────────────────────────────────
  ipcMain.handle('synapse:launch', async (_event, { profileIdOrAlias, options = {} }) => {
    const win = getWindow();
    if (!win) return { success: false, error: 'No hay ventana activa' };

    _destroyBridge();
    _bridge = new SynapseBridge({ mainWindow: win, nucleusBinary, verbose, nucleusTimeout });

    try {
      const result = await _bridge.launch(profileIdOrAlias, options);
      return { success: true, ...result };
    } catch (err) {
      console.error('[setup-synapse-handlers] launch:', err.message);
      return { success: false, error: err.message };
    }
  });

  // ── cleanup al salir ─────────────────────────────────────────────────────
  app.on('before-quit', _destroyBridge);
}

/**
 * Conecta al Brain ServerManager para un perfil ya lanzado por install:start.
 *
 * Llamar desde el handler install:start en main.js DESPUÉS de que installService()
 * resuelva exitosamente, en lugar de crear un SynapseBridge separado:
 *
 *   const { connectBrainForInstalledProfile } = require('./ipc/setup-synapse-handlers');
 *   const bridge = connectBrainForInstalledProfile(win, profileId, result.launch_id, { verbose: IS_DEV });
 *
 * RACE CONDITION — catch-up:
 *   Si PROFILE_CONNECTED ya ocurrió antes de conectar, el bridge emitirá
 *   REGISTER_ACK con catch_up_needed: true. El caller debe escuchar ese flag
 *   y disparar un poll CLI como fallback:
 *
 *     bridge.on('synapse:event', (payload) => {
 *       if (payload.type === 'STATUS' && payload.catch_up_needed) {
 *         // PROFILE_CONNECTED puede haber pasado ya — verificar con nucleus:status
 *         executeNucleusCommand(['--json', 'synapse', 'status', profileId])
 *           .then(r => { if (r.state === 'RUNNING') handleHandshake(); })
 *           .catch(() => {});
 *       }
 *     });
 *
 * Por qué aquí y no en main.js:
 *   - Mantiene el singleton _bridge de este módulo como única fuente de verdad.
 *   - Si el renderer llama window.bloomSynapse.launch() concurrentemente,
 *     _destroyBridge() limpiará este bridge antes de crear el nuevo.
 *   - El cleanup via app.on('before-quit') cubre ambos flujos.
 *
 * @param {Electron.BrowserWindow} win
 * @param {string}  profileId   ID del perfil ya lanzado
 * @param {string}  [launchId]  launch_id retornado por installService()
 * @param {object}  [opts]      Opciones override (nucleusBinary, verbose, nucleusTimeout)
 * @returns {SynapseBridge}     Instancia activa para escuchar eventos en main process
 */
function connectBrainForInstalledProfile(win, profileId, launchId = null, opts = {}) {
  const nucleusBinary  = opts.nucleusBinary  ?? _registeredOpts.nucleusBinary  ?? 'nucleus';
  const verbose        = opts.verbose        ?? _registeredOpts.verbose        ?? false;
  const nucleusTimeout = opts.nucleusTimeout ?? _registeredOpts.nucleusTimeout ?? 60_000;

  _destroyBridge();
  _bridge = new SynapseBridge({ mainWindow: win, nucleusBinary, verbose, nucleusTimeout });
  _bridge.connectToBrain(profileId, launchId);

  if (verbose) {
    console.log(
      `[setup-synapse-handlers] connectBrainForInstalledProfile → profileId=${profileId} launchId=${launchId}`
    );
  }

  return _bridge;
}

function _destroyBridge() {
  if (_bridge) {
    _bridge.destroy();
    _bridge = null;
  }
}

/**
 * Expone el bridge activo al main process por si algún módulo de setup
 * necesita escuchar eventos directamente (sin pasar por el renderer).
 */
function getActiveBridge() {
  return _bridge;
}

module.exports = { registerSynapseHandlers, connectBrainForInstalledProfile, getActiveBridge };
