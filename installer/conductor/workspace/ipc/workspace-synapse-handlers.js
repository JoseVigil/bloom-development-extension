'use strict';

/**
 * workspace/ipc/workspace-synapse-handlers.js
 *
 * Handlers ipcMain para el protocolo Synapse en el Conductor (workspace).
 * Registrar desde workspace/main_conductor.js:
 *
 *   const { registerSynapseHandlers } = require('./ipc/workspace-synapse-handlers');
 *   registerSynapseHandlers(() => mainWindow, { verbose: !app.isPackaged });
 *
 * A diferencia de setup, el workspace puede tener múltiples ventanas activas
 * simultáneamente (core + onboarding). Por eso se mantiene un Map de bridges
 * indexado por webContentsId en lugar de una instancia única.
 *
 * El workspace generalmente lanza perfiles ya existentes (launch, no seed),
 * pero seedAndLaunch está disponible por completitud.
 */

const { ipcMain, app } = require('electron');
const { SynapseBridge } = require('../../shared/synapse-bridge');

// Un bridge por ventana activa, identificado por webContents.id
const _bridges = new Map();

/**
 * @param {() => Electron.BrowserWindow | null} getWindow
 * @param {object}  [opts]
 * @param {string}  [opts.nucleusBinary='nucleus']
 * @param {boolean} [opts.verbose=false]
 */
function registerSynapseHandlers(getWindow, opts = {}) {
  const { nucleusBinary = 'nucleus', verbose = false } = opts;

  // ── seed + launch ────────────────────────────────────────────────────────
  ipcMain.handle('synapse:seedAndLaunch', async (_event, { alias, options = {} }) => {
    const win = getWindow();
    if (!win) return { success: false, error: 'No hay ventana activa' };

    _destroyBridgeForWindow(win);
    const bridge = new SynapseBridge({ mainWindow: win, nucleusBinary, verbose });
    _bridges.set(win.webContents.id, bridge);
    win.once('closed', () => _destroyBridgeForWindow(win));

    try {
      const result = await bridge.seedAndLaunch(alias, options);
      return { success: true, ...result };
    } catch (err) {
      console.error('[workspace-synapse-handlers] seedAndLaunch:', err.message);
      return { success: false, error: err.message };
    }
  });

  // ── launch de perfil existente ───────────────────────────────────────────
  ipcMain.handle('synapse:launch', async (_event, { profileIdOrAlias, options = {} }) => {
    const win = getWindow();
    if (!win) return { success: false, error: 'No hay ventana activa' };

    _destroyBridgeForWindow(win);
    const bridge = new SynapseBridge({ mainWindow: win, nucleusBinary, verbose });
    _bridges.set(win.webContents.id, bridge);
    win.once('closed', () => _destroyBridgeForWindow(win));

    try {
      const result = await bridge.launch(profileIdOrAlias, options);
      return { success: true, ...result };
    } catch (err) {
      console.error('[workspace-synapse-handlers] launch:', err.message);
      return { success: false, error: err.message };
    }
  });

  // ── cleanup al salir ─────────────────────────────────────────────────────
  app.on('before-quit', () => {
    for (const bridge of _bridges.values()) bridge.destroy();
    _bridges.clear();
  });
}

function _destroyBridgeForWindow(win) {
  const id = win?.webContents?.id;
  if (id && _bridges.has(id)) {
    _bridges.get(id).destroy();
    _bridges.delete(id);
  }
}

/**
 * Expone el bridge activo de una ventana al main process por si algún
 * módulo del workspace necesita escuchar eventos directamente.
 */
function getBridgeForWindow(win) {
  return _bridges.get(win?.webContents?.id) || null;
}

module.exports = { registerSynapseHandlers, getBridgeForWindow };
