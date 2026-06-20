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
 *
 * CAMBIOS (sesión 2026-06):
 *   - Integración con MilestoneRegistry y MilestoneReactor.
 *   - bridge.on('message') conecta el bridge al reactor para eventos ONBOARDING_MILESTONE.
 *   - registerSynapseHandlers acepta opts.registry y opts.reactor opcionales.
 *   - getBridgeForWindow sigue disponible para código del main process que
 *     necesite escuchar eventos directamente.
 *   - Synapse raw event log (Camino C): si opts.verbose es true, cada bridge
 *     reenvía TODOS los mensajes ('message') al renderer vía
 *     'synapse:raw-event', sin pasar por el MilestoneReactor ni por
 *     ningún filtro. Pensado exclusivamente para el panel de debug
 *     (debug.html / window.onboarding.onSynapseEvent).
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
 * @param {number}  [opts.nucleusTimeout=60000]      Timeout en ms para comandos nucleus
 * @param {import('../onboarding/milestone-registry').MilestoneRegistry} [opts.registry]
 *   Registry de hitos. Si se pasa, el bridge conecta los eventos ONBOARDING_MILESTONE al reactor.
 * @param {import('../onboarding/milestone-reactor').MilestoneReactor}   [opts.reactor]
 *   Reactor de hitos. Requiere que opts.registry también se pase.
 */
function registerSynapseHandlers(getWindow, opts = {}) {
  const {
    nucleusBinary  = 'nucleus',
    verbose        = false,
    nucleusTimeout = 60_000,
    registry       = null,
    reactor        = null,
  } = opts;

  // ── seed + launch ────────────────────────────────────────────────────────
  ipcMain.handle('synapse:seedAndLaunch', async (_event, { alias, options = {} }) => {
    const win = getWindow();
    if (!win) return { success: false, error: 'No hay ventana activa' };

    _destroyBridgeForWindow(win);
    const bridge = new SynapseBridge({ mainWindow: win, nucleusBinary, verbose, nucleusTimeout });
    _bridges.set(win.webContents.id, bridge);
    win.once('closed', () => _destroyBridgeForWindow(win));

    _connectMilestoneReactor(bridge, registry, reactor);

    if (verbose) {
      bridge.on('message', (enriched) => {
        const win = getWindow();
        if (win && !win.isDestroyed()) {
          win.webContents.send('synapse:raw-event', enriched);
        }
      });
    }

    try {
      const result = await bridge.seedAndLaunch(alias, options);
      return { success: true, ...result };
    } catch (err) {
      console.error('[workspace-synapse-handlers] seedAndLaunch:', err.message);
      return { success: false, error: err.message };
    }
  });

  // ── launch de perfil existente ───────────────────────────────────────────
  // Acepta launchId opcional para que el bridge pueda correlacionar eventos
  // con la sesión correcta (útil si el workspace recibe el launch_id del installer).
  ipcMain.handle('synapse:launch', async (_event, { profileIdOrAlias, launchId = null, options = {} }) => {
    const win = getWindow();
    if (!win) return { success: false, error: 'No hay ventana activa' };

    _destroyBridgeForWindow(win);
    const bridge = new SynapseBridge({ mainWindow: win, nucleusBinary, verbose, nucleusTimeout });
    _bridges.set(win.webContents.id, bridge);
    win.once('closed', () => _destroyBridgeForWindow(win));

    _connectMilestoneReactor(bridge, registry, reactor);

    if (verbose) {
      bridge.on('message', (enriched) => {
        const win = getWindow();
        if (win && !win.isDestroyed()) {
          win.webContents.send('synapse:raw-event', enriched);
        }
      });
    }

    try {
      const result = await bridge.launch(profileIdOrAlias, options);

      // Si el caller ya tiene el launch_id (ej: pasado desde el installer),
      // sobreescribir el que nucleus devolvió para asegurar coherencia.
      if (launchId && !result.launchId) {
        bridge._launchId = launchId;
      }

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

/**
 * Conecta el EventEmitter del bridge al MilestoneReactor.
 * Se llama una vez por bridge, justo después de crearlo.
 *
 * El bridge emite 'message' con cada mensaje de Brain ya clasificado.
 * Solo procesamos los de tipo 'ONBOARDING_MILESTONE' — el resto los ignora
 * el reactor y siguen su camino normal al renderer vía webContents.send().
 *
 * @param {import('../../shared/synapse-bridge').SynapseBridge} bridge
 * @param {import('../onboarding/milestone-registry').MilestoneRegistry|null} registry
 * @param {import('../onboarding/milestone-reactor').MilestoneReactor|null}   reactor
 */
function _connectMilestoneReactor(bridge, registry, reactor) {
  if (!registry || !reactor) return;

  bridge.on('message', (enriched) => {
    if (enriched.type !== 'ONBOARDING_MILESTONE') return;

    // El evento en el mensaje es el nombre del evento Cortex (ej: 'GITHUB_TOKEN_STORED').
    // El registry resuelve ese nombre al stepId del onboarding (ej: 'github_auth').
    const stepId = registry.resolveEvent(enriched.event);

    if (!stepId) {
      // Evento clasificado como ONBOARDING_MILESTONE pero sin mapeo en el registry.
      // Puede pasar si ONBOARDING_EVENTS se extendió pero el JSON no tiene cortex_events para él.
      console.warn(
        '[workspace-synapse-handlers] ONBOARDING_MILESTONE sin mapeo en registry:',
        enriched.event
      );
      return;
    }

    reactor.handleMilestone(stepId, enriched);
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
