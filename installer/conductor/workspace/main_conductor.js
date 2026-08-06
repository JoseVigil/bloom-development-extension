// main_conductor.js — Bloom Conductor
// Integración Onboarding UI + Synapse Protocol v4.0

'use strict';

const path = require('path');
const fs   = require('fs');
const os   = require('os');
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { spawn, execFile } = require('child_process');
const { promisify } = require('util');
// shared/ está en ../shared/ en dev y en resources/shared/ cuando está empaquetado
// extraFiles copia shared/ a resources/shared/ fuera del asar
const _sharedDir = require('electron').app.isPackaged
  ? path.join(process.resourcesPath, 'shared')
  : path.join(__dirname, '..', 'shared');
const { getLogger } = require(path.join(_sharedDir, 'logger'));
const { paths } = require(path.join(_sharedDir, 'global_paths'));
const { registerOnboardingHandlers } = require('./onboarding/ipc/onboarding-handlers');
const { registerHealthHandlers }   = require('./core/ipc/health-handlers');
const { registerProfilesHandlers } = require('./core/ipc/profiles-handlers');
// synapse-bridge.js vive en conductor/shared/ — un nivel arriba de workspace/
const { SynapseBridge, ONBOARDING_EVENTS } = require(path.join(__dirname, '..', 'shared', 'synapse-bridge'));
const { MilestoneRegistry } = require('./onboarding/milestone-registry');
const { MilestoneReactor }  = require('./onboarding/milestone-reactor');
const log     = getLogger('onboarding');
// Logger dedicado para el tráfico de Core (nucleus:health, nucleus:*-profile, etc).
// No reemplaza a `log` — onboarding sigue necesitando el suyo. Cada uno escribe
// a su propio stream/archivo (conductor_onboarding vs conductor_core).
const coreLog = getLogger('core');

// Bridge de onboarding — instanciado una vez cuando se lanza Discovery.
// Permite escuchar todos los mensajes de Brain durante el onboarding y
// reemitirlos al renderer via synapse:raw-event para el debug panel.
let _onboardingBridge = null;
let _reactor          = null;
let _registry          = null;

// ── CONSTANTS ──────────────────────────────────────────────────────────────
const BLOOM_BASE   = paths.bloomBase;
const NUCLEUS_EXE  = paths.nucleusExe;
const NUCLEUS_JSON = paths.configFile;

let mainWindow = null;

// ── NUCLEUS HELPER ─────────────────────────────────────────────────────────
// FIX (24/07/2026): execNucleus no aceptaba cwd — el binario nucleus
// siempre heredaba el cwd del proceso de Electron (en dev, la carpeta del
// propio repo de Conductor). La mayoría de los subcomandos no lo necesitan,
// pero `mandate genesis` sí: busca la carpeta `.bloom` subiendo desde su
// cwd para ubicar nucleus.json, y si el cwd no es el workspace real del
// usuario, nunca la encuentra ("no pude leer nucleus.json: no encontré
// carpeta .bloom subiendo desde <cwd equivocado>" — confirmado en
// conductor_onboarding_20260724.log).
// Se agrega un tercer parámetro opcional `spawnOpts` para que un caller
// puntual (ver onboarding:create-mandate en onboarding-handlers.js) pueda
// pinnear el cwd real. Los ~15 callers existentes de execNucleus(args,
// timeoutMs) no cambian: spawnOpts default {} preserva el comportamiento
// actual (cwd heredado del proceso).
function execNucleus(args, timeoutMs = 15000, spawnOpts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(NUCLEUS_EXE, args, { windowsHide: true, ...spawnOpts });
    let stdout = '', stderr = '';

    child.stdout.on('data', d => { stdout += d.toString(); });
    child.stderr.on('data', d => { stderr += d.toString(); });

    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`nucleus timeout after ${timeoutMs}ms: ${args.join(' ')}`));
    }, timeoutMs);

    child.on('close', code => {
      clearTimeout(timer);
      try {
        const match = stdout.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
        if (!match) {
          if (code !== 0) reject(new Error(`exit ${code}: ${stderr}`));
          else resolve({ success: true, raw: stdout });
          return;
        }
        const result = JSON.parse(match[0]);
        resolve(result);
      } catch (e) {
        reject(new Error(`JSON parse failed: ${e.message} | stdout: ${stdout}`));
      }
    });

    child.on('error', err => { clearTimeout(timer); reject(err); });
  });
}

// ── BOOT SERVICES ──────────────────────────────────────────────────────────
// Llama a `nucleus dev-start` y espera a que todos los servicios estén listos.
// - onboardingDone=false → flags mínimos: skip-control-plane + skip-vault
// - onboardingDone=true  → boot completo
//
// CRÍTICO (Ubuntu/X11): hereda process.env completo para que DISPLAY,
// DBUS_SESSION_BUS_ADDRESS y XDG_RUNTIME_DIR lleguen a Brain y a Chrome.
// Sin esto, nucleus spawnado desde Electron (ej: .desktop / autostart)
// arranca sin entorno gráfico y falla silenciosamente.
//
// Los logs de progreso de dev-start van a stderr (no contaminan stdout JSON).
// stdout recibe únicamente el JSON final que parseamos aquí.
function bootServices(onboardingDone) {
  return new Promise((resolve) => {
    const args = [
      '--json', 'dev-start',
      '--enable-harness-onboarding',   // siempre: bypasea Master role check
    ];

    if (!onboardingDone) {
      args.push('--skip-control-plane'); // no hay proyecto todavía
      args.push('--skip-vault');         // vault requiere proyecto inicializado
    }

    log.info('[BOOT] Spawning nucleus dev-start:', args.join(' '));

    const child = spawn(NUCLEUS_EXE, args, {
      env: { ...process.env }, // heredar DISPLAY, DBUS, XDG, HOME, PATH
      windowsHide: true,
      detached: false,         // Conductor es el proceso padre — si muere, mueren los hijos
    });

    let stdout = '';

    child.stdout.on('data', d => { stdout += d.toString(); });

    // Los logs de progreso de nucleus van a stderr — forwardearlos al logger
    // de Conductor para que aparezcan en los devtools/log file del proceso main.
    child.stderr.on('data', d => {
      const lines = d.toString().split('\n').filter(l => l.trim());
      for (const line of lines) log.info('[BOOT nucleus]', line);
    });

    // Timeout generoso: Temporal puede tardar en arrancar desde cero.
    // 120s cubre el caso peor (Temporal cold start + Brain + Control Plane).
    const timer = setTimeout(() => {
      child.kill();
      log.error('[BOOT] dev-start timeout after 120s');
      resolve({ success: false, error: 'dev-start timeout after 120s' });
    }, 120_000);

    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        log.error(`[BOOT] dev-start exited with code ${code}`);
        resolve({ success: false, error: `dev-start exit code ${code}` });
        return;
      }
      try {
        // dev-start con --json escribe un único objeto JSON a stdout
        const match = stdout.match(/(\{[\s\S]*\})/);
        if (!match) {
          log.warn('[BOOT] dev-start exited 0 but no JSON in stdout — assuming success');
          resolve({ success: true });
          return;
        }
        const result = JSON.parse(match[0]);
        if (result.success === false) {
          log.error('[BOOT] dev-start reported failure:', result.error, '| stage:', result.failed_stage);
          resolve({ success: false, error: result.error, stage: result.failed_stage });
          return;
        }
        log.info(`[BOOT] Services ready. Boot time: ${result.boot_time_seconds}s`);
        resolve({ success: true, result });
      } catch (e) {
        log.error('[BOOT] Failed to parse dev-start JSON:', e.message, '| stdout:', stdout);
        // Si el JSON falla pero el proceso salió 0, asumir éxito para no bloquear el UI.
        resolve({ success: true, parseError: e.message });
      }
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      log.error('[BOOT] Failed to spawn nucleus dev-start:', err.message);
      resolve({ success: false, error: err.message });
    });
  });
}

// ── WINDOW FACTORIES ───────────────────────────────────────────────────────
function createOnboardingWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 760,
    minHeight: 520,
    resizable: true,
    center: true,
    alwaysOnTop: false,
    backgroundColor: '#080A0E',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'onboarding', 'preload_onboarding.js')
    },
    icon: path.join(__dirname, 'assets', 'bloom.ico'),
    title: 'Bloom — System Setup',
    show: false,
    frame: true
  });
  mainWindow = win;

  win.loadFile(path.join(__dirname, 'onboarding', 'onboarding.html'));
  win.once('ready-to-show', () => {
    win.maximize();
    win.show();
  });
  win.on('closed', () => {
    if (_onboardingBridge) {
      _onboardingBridge.destroy();
      _onboardingBridge = null;
    }
    if (mainWindow === win) mainWindow = null;
  });
}

function createWorkspaceWindow(url) {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    resizable: true,
    center: true,
    backgroundColor: '#080A0E',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'core', 'preload_core.js')
    },
    icon: path.join(__dirname, 'assets', 'bloom.ico'),
    title: 'Bloom Workspace',
    show: false
  });
  mainWindow = win;

  win.loadURL(url);
  win.once('ready-to-show', () => {
    win.show();
    win.maximize();
  });
  win.on('closed', () => { if (mainWindow === win) mainWindow = null; });
}

// ── SYNAPSE BRIDGE — ONBOARDING ────────────────────────────────────────────
// Instancia el SynapseBridge para el onboarding y abre la conexión TCP con
// Brain ServerManager (puerto 5678). Cada mensaje que Brain emite vía broadcast
// llega a _onBrainMessage(), que dispara bridge.emit('message', enriched).
// El listener reemite ese payload al renderer como 'synapse:raw-event' para
// que el panel SYNAPSE RAW de debug.html lo muestre en tiempo real.
//
// Requiere que el profileId exista en nucleus.json (master_profile).
// Idempotente: si el bridge ya existe, no lo recrea.
// FIX (Problema 2.5, Escenario A — CORE_LOGGING_FIX_PLAN.md): antes, el
// bridge y el MilestoneReactor SIEMPRE se instanciaban con `log`
// (getLogger('onboarding')), sin importar si la app arrancaba con
// onboarding.completed=true. Eso hacía que milestones no-bloqueantes
// (ai_provider_setup, google_auth) que llegan días después de terminado el
// onboarding se loguearan igual en conductor_onboarding_*.log. Ahora el
// logger es un parámetro — cada call-site de abajo pasa `coreLog` o `log`
// según el branch (onboardingDone / !onboardingDone) en el que se encuentra.
function initOnboardingBridge(logger = log) {
  if (_onboardingBridge) return;

  // Leer el profileId para que connectToBrain pueda filtrar PROFILE_CONNECTED
  // correctamente. Sin esto el bridge no sabe cuál es nuestro perfil.
  let profileId = null;
  try {
    const data = JSON.parse(fs.readFileSync(NUCLEUS_JSON, 'utf8'));
    profileId = data.master_profile || null;
  } catch (e) {
    logger.warn('[SYNAPSE] initOnboardingBridge: no se pudo leer nucleus.json —', e.message);
  }

  _onboardingBridge = new SynapseBridge({
    mainWindow:     mainWindow,
    nucleusBinary:  NUCLEUS_EXE,
    verbose:        !app.isPackaged,
    nucleusTimeout: 60_000,
  });

  // ── MilestoneRegistry + MilestoneReactor ──────────────────────────────────
  // El registry carga los steps desde disco (o cae al fallback hardcoded) y
  // extiende ONBOARDING_EVENTS con cualquier cortex_event nuevo del JSON.
  // El reactor escucha el EventEmitter del bridge y reacciona a cada hito:
  //   - persiste el step en nucleus.json
  //   - emite milestone:reached al renderer
  //   - en ACCOUNT_REGISTERED: abre Landing vía `nucleus synapse launch --mode landing`
  //   - cuando todos los steps bloqueantes completan: llama _onOnboardingSuccess()
  const bloomRoot = path.join(NUCLEUS_EXE, '..', '..'); // BloomNucleus root relativo al binario
  _registry = new MilestoneRegistry({ bloomRoot, ONBOARDING_EVENTS });
  _registry.loadSteps();

  _reactor = new MilestoneReactor({
    registry: _registry,
    getWindow:    () => mainWindow,
    execNucleus,
    NUCLEUS_JSON,
    verbose:      !app.isPackaged,
    // FIX (auditoría 19/07/2026): sin esto, MilestoneReactor defaultea a
    // logger=console y sus _log() nunca llegan a conductor_onboarding_*.log
    // — el propio "Bug 4" documentado en milestone-reactor.js, reintroducido
    // acá porque el call site nunca pasó el logger inyectado. Sin este fix,
    // no hay forma de confirmar por log si handleMilestone() corrió o no
    // para ningún step (ver auditoría de conductor_onboarding_20260719.log).
    //
    // FIX (Problema 2.5, Escenario A — CORE_LOGGING_FIX_PLAN.md): antes esto
    // era siempre `log` (getLogger('onboarding')), fijo, sin importar en qué
    // branch se llamó a initOnboardingBridge(). Ahora usa el logger que el
    // caller decidió (coreLog si onboarding.completed ya era true al boot,
    // log si no). NOTA — Escenario B (swap en caliente del logger cuando
    // onOnboardingSuccess dispara a mitad de la misma sesión, sin reiniciar
    // el proceso) queda deliberadamente sin resolver acá: es una decisión de
    // producto pendiente de confirmación explícita (ver sección 2.5.3 del
    // plan), no algo que este fix deba asumir.
    logger:       logger,
  });

  // Rehidratar desde disco para no re-ejecutar steps ya completados en
  // sesiones anteriores (ej: si Conductor se reinicia durante el onboarding).
  _reactor.rehydrateFromDisk();

  // Conectar el bridge al reactor: solo procesamos mensajes ONBOARDING_MILESTONE.
  // El listener de raw-event (debug panel) sigue recibiendo TODO vía el segundo listener.
  _onboardingBridge.on('message', (enriched) => {
    if (enriched.type !== 'ONBOARDING_MILESTONE') return;

    // FIX (auditoría Synapse v3, §2 — bug crítico google_auth/ACCOUNT_REGISTERED):
    // resolveEvent ahora necesita el payload como segundo argumento para
    // discriminar eventos genéricos por "service" (ej: ACCOUNT_REGISTERED
    // compartido por github_auth y google_auth). Sin esto, siempre resolvía
    // al primer step registrado para ese evento — ver milestone-registry.js.
    const stepId = _registry.resolveEvent(enriched.event, enriched.data ?? enriched);
    if (!stepId) {
      logger.warn('[SYNAPSE] ONBOARDING_MILESTONE sin mapeo en registry:', enriched.event);
      return;
    }
    _reactor.handleMilestone(stepId, enriched);
  });

  // Raw event forwarding para el panel de debug (synapse:raw-event).
  // Se registra después del reactor para no interferir con el flujo principal.
  if (!app.isPackaged) {
    _onboardingBridge.on('message', (enriched) => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      mainWindow.webContents.send('synapse:raw-event', enriched);
    });
  }

  // ── CATCH-UP POLL ────────────────────────────────────────────────────────
  // Si PROFILE_CONNECTED ya ocurrió antes de que el bridge conectase, Brain
  // no lo re-emite. El REGISTER_ACK llega con catch_up_needed: true como señal
  // de que debemos consultar el estado actual del perfil via CLI en lugar de
  // quedarnos esperando un push que nunca va a llegar.
  _onboardingBridge.on('message', async (enriched) => {
    if (enriched.type !== 'STATUS' || !enriched.catch_up_needed) return;

    logger.info('[SYNAPSE] REGISTER_ACK con catch_up_needed=true — haciendo poll de seguridad');

    try {
      const result = await execNucleus(
        ['--json', 'synapse', 'status', profileId],
        15_000
      );

      if (result.state === 'ONLINE' || result.extension_loaded) {
        logger.info('[SYNAPSE] Catch-up: perfil ya está ONLINE — simulando HANDSHAKE');
        _onboardingBridge.emit('message', {
          type:       'HANDSHAKE',
          _profileId: profileId,
          _launchId:  null,
          _ts:        Date.now(),
          _recovered: true,
        });
      } else {
        logger.info('[SYNAPSE] Catch-up: perfil no está ONLINE aún — esperando push de Brain');
      }
    } catch (e) {
      logger.warn('[SYNAPSE] Catch-up poll falló — continuando esperando push:', e.message);
      // No es fatal: si el perfil conecta después, el push llegará normalmente.
    }
  });

  // CRÍTICO: sin connectToBrain() el socket TCP nunca se abre y Brain
  // nunca manda nada — los listeners 'message' nunca disparan.
  _onboardingBridge.connectToBrain(profileId);

  logger.info('[SYNAPSE] Onboarding bridge initialized — MilestoneRegistry + MilestoneReactor activos');
}

// ── NUCLEUS IPC HANDLERS ───────────────────────────────────────────────────
// FIX (Problema 1 — CORE_LOGGING_FIX_PLAN.md): este bloque tenía una segunda
// implementación duplicada de nucleus:health, nucleus:list-profiles,
// nucleus:launch-profile, nucleus:create-profile y nucleus:get-installation.
// Esa versión inline nunca tenía logging y coexistía con los módulos más
// prolijos core/ipc/health-handlers.js y core/ipc/profiles-handlers.js, que
// estaban escritos y exportados pero jamás importados/invocados en ningún
// archivo del repo. Se retiran los 5 handlers inline de acá — la única
// implementación viva ahora es la modular, registrada en app.whenReady()
// vía registerHealthHandlers(execNucleus, coreLog) / registerProfilesHandlers
// (execNucleus, NUCLEUS_JSON, coreLog). onboarding:health se queda: pertenece
// al dominio de onboarding, no de Core, y no es parte de este fix.
function setupNucleusHandlers() {

  // ── ONBOARDING HEALTH (ipc_health_handler.js integrado) ─────────────────
  // Usa execNucleus (ruta absoluta via NUCLEUS_EXE) en lugar de execFileAsync('nucleus')
  // para garantizar compatibilidad con builds empaquetados donde nucleus no está en PATH.
  // Devuelve una estructura normalizada para que renderHealth() no rompa.
  ipcMain.handle('onboarding:health', async () => {
    try {
      const raw = await execNucleus(['--json', 'health'], 5000);
      return {
        success:    raw.success !== false,
        state:      raw.state      || 'UNKNOWN',
        components: raw.components || {},
        error:      raw.error      || null,
      };
    } catch (err) {
      return {
        success:    false,
        state:      'UNKNOWN',
        components: {},
        error:      err.message,
      };
    }
  });

}

// ── BOOT ───────────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  if (!fs.existsSync(NUCLEUS_JSON)) {
    await dialog.showMessageBox({
      type: 'error',
      title: 'Installation Required',
      message: 'nucleus.json not found. Please run bloom-setup.exe first.'
    });
    app.quit(); return;
  }

  const nucleusData = JSON.parse(fs.readFileSync(NUCLEUS_JSON, 'utf8'));
  log.info('[BOOT] nucleus.json found');
  log.info('[BOOT] onboarding completed:', nucleusData?.onboarding?.completed === true);

  if (!nucleusData.installation?.completed) {
    await dialog.showMessageBox({
      type: 'error',
      title: 'Installation Incomplete',
      message: 'Installation not completed. Please run bloom-setup.exe.'
    });
    app.quit(); return;
  }

  // onboarding:health se queda acá (dominio de onboarding, fuera de alcance
  // de este fix). El tráfico de Core (health/profiles) va por los módulos
  // dedicados de abajo, con su propio logger inyectado.
  setupNucleusHandlers();
  registerHealthHandlers(execNucleus, coreLog);
  registerProfilesHandlers(execNucleus, NUCLEUS_JSON, coreLog);

  const onboardingDone = nucleusData?.onboarding?.completed === true;

  // ── ARRANQUE AUTOMÁTICO DE SERVICIOS ────────────────────────────────────
  // Llama a nucleus dev-start antes de mostrar cualquier ventana.
  // Si los servicios ya están corriendo (ej: segunda apertura), dev-start
  // los detecta via TCP dial y retorna success sin re-spawnearlos.
  // Un fallo de boot no bloquea el UI: mostramos la ventana con un warning
  // para no dejar al usuario con una pantalla en negro sin explicación.
  log.info('[BOOT] Starting services via nucleus dev-start...');
  const bootResult = await bootServices(onboardingDone);

  if (!bootResult.success) {
    log.error('[BOOT] Service boot failed:', bootResult.error);
    const { response } = await dialog.showMessageBox({
      type: 'warning',
      title: 'Services Failed to Start',
      message: 'Some Bloom services could not start automatically.',
      detail: `Error: ${bootResult.error}${bootResult.stage ? `\nStage: ${bootResult.stage}` : ''}\n\nYou can continue and try to start services manually, or quit and check the logs.`,
      buttons: ['Continue Anyway', 'Quit'],
      defaultId: 0,
      cancelId: 1,
    });
    if (response === 1) {
      app.quit(); return;
    }
    log.warn('[BOOT] User chose to continue despite boot failure');
  }

  // ── ABRIR VENTANA ────────────────────────────────────────────────────────
  if (onboardingDone) {
    // FIX (auditoría 19/07/2026): antes de este fix, este branch NUNCA
    // llamaba a initOnboardingBridge() — _onboardingBridge/_registry/_reactor
    // quedaban null durante toda la sesión. Steps no-blocking que se
    // completan DESPUÉS de project_create (ej. ai_provider_setup, que el
    // usuario puede configurar desde el workspace en cualquier momento)
    // emiten milestones que nunca llegan a ningún listener: no hay socket
    // TCP a Brain abierto en este proceso. El síntoma es "stepper de
    // workspace no reacciona a API_KEY_REGISTERED" tras cerrar y reabrir
    // la app con onboarding.completed=true — dentro de la misma sesión que
    // completa el onboarding no se nota, porque ahí el bridge sigue vivo
    // (onboarding:complete solo hace win.loadURL() sobre la misma ventana).
    // registerOnboardingHandlers también se registra acá: harness:inject-milestone
    // y onboarding:mark-step-complete deben seguir funcionando post-onboarding
    // (ej. reintentar un step no-blocking) y dependen de () => _reactor / () => _registry.
    const url = nucleusData.onboarding.workspace_url || 'http://localhost:5173';
    createWorkspaceWindow(url);
    registerOnboardingHandlers(execNucleus, NUCLEUS_JSON, () => mainWindow, () => _reactor, () => _registry, createWorkspaceWindow);
    // FIX (Problema 2.5, Escenario A): onboarding.completed ya es true al
    // boot — cualquier milestone no-bloqueante que llegue de acá en adelante
    // (ai_provider_setup, google_auth) es tráfico de Core, no de onboarding.
    log.info('[HANDOFF] Onboarding completado — logging de esta sesión continúa en conductor_core');
    coreLog.info('[HANDOFF] Sesión post-onboarding — asumiendo logging de milestones no bloqueantes');
    initOnboardingBridge(coreLog);
  } else {
    log.info('[BOOT] Loading onboarding window');
    createOnboardingWindow();
    // FIX: pasa getter () => mainWindow en lugar del valor mainWindow
    // para que los handlers siempre resuelvan la ventana actual
    registerOnboardingHandlers(execNucleus, NUCLEUS_JSON, () => mainWindow, () => _reactor, () => _registry, createWorkspaceWindow);
    // Inicializar el bridge de synapse para el onboarding.
    // El listener reemite cada mensaje de Brain al renderer via synapse:raw-event
    // para que el panel SYNAPSE RAW de debug.html lo muestre en tiempo real.
    // Se inicializa aquí — después de crear la ventana — para que mainWindow
    // esté disponible cuando el bridge intente hacer webContents.send().
    initOnboardingBridge(log);
  }
});

// ── APP LIFECYCLE ──────────────────────────────────────────────────────────
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    if (fs.existsSync(NUCLEUS_JSON)) {
      const nucleusData = JSON.parse(fs.readFileSync(NUCLEUS_JSON, 'utf8'));
      const onboardingDone = nucleusData?.onboarding?.completed === true;
      if (onboardingDone) {
        // FIX (auditoría 19/07/2026): mismo gap que en app.whenReady() — ver
        // comentario ahí. Sin esto, reactivar la app en macOS (dock icon) con
        // onboarding ya completo tampoco levantaba el bridge.
        createWorkspaceWindow(nucleusData.onboarding.workspace_url || 'http://localhost:5173');
        registerOnboardingHandlers(execNucleus, NUCLEUS_JSON, () => mainWindow, () => _reactor, () => _registry, createWorkspaceWindow);
        log.info('[HANDOFF] Onboarding completado — logging de esta sesión continúa en conductor_core');
        coreLog.info('[HANDOFF] Sesión post-onboarding — asumiendo logging de milestones no bloqueantes');
        initOnboardingBridge(coreLog);
      } else {
        createOnboardingWindow();
        // FIX: pasa getter () => mainWindow en lugar del valor mainWindow
        registerOnboardingHandlers(execNucleus, NUCLEUS_JSON, () => mainWindow, () => _reactor, () => _registry, createWorkspaceWindow);
        initOnboardingBridge(log);
      }
    }
  }
});
