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
 * CAMBIOS (sesión 2026-07-18 — diagnóstico GOOGLE_LOGIN_DETECTED):
 *   - _connectMilestoneReactor: agregados console.log/warn de diagnóstico
 *     (early-return silencioso si falta registry/reactor, arrival de cada
 *     ONBOARDING_MILESTONE, y resultado de resolveEvent()). Ver comentarios
 *     inline. Complementa el fix en synapse-bridge.js (ONBOARDING_EVENTS
 *     no tenía GOOGLE_LOGIN_DETECTED).
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
  // DIAGNÓSTICO (2026-07-18 — investigación GOOGLE_LOGIN_DETECTED):
  // Este early-return era 100% silencioso — si registerSynapseHandlers()
  // se llamó sin opts.registry u opts.reactor (ej: falta pasarlos desde
  // main_conductor.js), NINGÚN evento llega jamás al reactor, sin importar
  // si está bien clasificado en synapse-bridge.js. Antes esto no dejaba
  // rastro. Ahora al menos queda un log al conectar el bridge para poder
  // descartar (o confirmar) esta causa de un vistazo.
  if (!registry || !reactor) {
    console.warn(
      '[workspace-synapse-handlers] _connectMilestoneReactor: registry o reactor no ' +
      `provistos (registry=${!!registry}, reactor=${!!reactor}) — el bridge NO está ` +
      'conectado al MilestoneReactor, ningún ONBOARDING_MILESTONE va a procesarse.'
    );
    return;
  }

  console.log('[workspace-synapse-handlers] _connectMilestoneReactor: registry + reactor conectados ✓');

  bridge.on('message', (enriched) => {
    // DIAGNÓSTICO: log de TODO mensaje clasificado como ONBOARDING_MILESTONE
    // que llega a este listener, con su evento original. Antes de esto no
    // había ningún rastro local de que el mensaje hubiera llegado hasta acá
    // (el único log visible era el feed de debug del Harness, que no pasa
    // por este código — ver CAMBIOS v4.1 en synapse-bridge.js). Con esto,
    // grep 'GOOGLE_LOGIN_DETECTED' en la consola del main process debería
    // mostrar esta línea si la clasificación (fix del Set) funcionó.
    if (enriched.type === 'ONBOARDING_MILESTONE') {
      console.log(
        `[workspace-synapse-handlers] ONBOARDING_MILESTONE recibido — event=${enriched.event}` +
        (enriched.originalEvent ? ` originalEvent=${enriched.originalEvent}` : '')
      );
    }

    if (enriched.type !== 'ONBOARDING_MILESTONE') return;

    // El evento en el mensaje es el nombre del evento Cortex (ej: 'GITHUB_TOKEN_STORED').
    // El registry resuelve ese nombre al stepId del onboarding (ej: 'github_auth').
    // FIX (auditoría Synapse v3, §2 — bug crítico google_auth/ACCOUNT_REGISTERED):
    // se pasa el payload como segundo argumento para que resolveEvent pueda
    // discriminar eventos genéricos por "service" (ver milestone-registry.js).
    // Sin esto, ACCOUNT_REGISTERED con service:'google' resolvía igual a
    // 'github_auth' porque era el primer step registrado para ese evento.
    const stepId = registry.resolveEvent(enriched.event, enriched.data ?? enriched);

    // DIAGNÓSTICO: resultado de resolveEvent(), sea cual sea. Este es el
    // segundo punto ciego posible después del fix del Set — si el registry
    // no tiene mapeo para GOOGLE_LOGIN_DETECTED, stepId va a dar null y el
    // warn de abajo (que ya existía) lo va a mostrar, pero ahora con este
    // log previo queda claro que SÍ llegó hasta acá bien clasificado.
    console.log(
      `[workspace-synapse-handlers] resolveEvent(${enriched.event}) → stepId=${stepId ?? 'null'}`
    );

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
