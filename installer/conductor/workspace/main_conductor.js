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
// synapse-bridge.js vive en conductor/shared/ — un nivel arriba de workspace/
const { SynapseBridge, ONBOARDING_EVENTS } = require(path.join(__dirname, '..', 'shared', 'synapse-bridge'));
const { MilestoneRegistry } = require('./onboarding/milestone-registry');
const { MilestoneReactor }  = require('./onboarding/milestone-reactor');
const log = getLogger('onboarding');

// Bridge de onboarding — instanciado una vez cuando se lanza Discovery.
// Permite escuchar todos los mensajes de Brain durante el onboarding y
// reemitirlos al renderer via synapse:raw-event para el debug panel.
let _onboardingBridge = null;

// ── CONSTANTS ──────────────────────────────────────────────────────────────
const BLOOM_BASE   = paths.bloomBase;
const NUCLEUS_EXE  = paths.nucleusExe;
const NUCLEUS_JSON = paths.configFile;

let mainWindow = null;

// ── NUCLEUS HELPER ─────────────────────────────────────────────────────────
function execNucleus(args, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const child = spawn(NUCLEUS_EXE, args, { windowsHide: true });
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
  mainWindow = new BrowserWindow({
    width: 920,
    height: 620,
    minWidth: 920,
    minHeight: 620,
    resizable: false,
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

  mainWindow.loadFile(path.join(__dirname, 'onboarding', 'onboarding.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => {
    if (_onboardingBridge) {
      _onboardingBridge.destroy();
      _onboardingBridge = null;
    }
    mainWindow = null;
  });
}

function createWorkspaceWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    resizable: true,
    center: true,
    backgroundColor: '#080A0E',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'core', 'preload_conductor.js')
    },
    icon: path.join(__dirname, 'assets', 'bloom.ico'),
    title: 'Bloom Workspace',
    show: false
  });

  mainWindow.loadURL(url);
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.maximize();
  });
  mainWindow.on('closed', () => { mainWindow = null; });
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
function initOnboardingBridge() {
  if (_onboardingBridge) return;

  // Leer el profileId para que connectToBrain pueda filtrar PROFILE_CONNECTED
  // correctamente. Sin esto el bridge no sabe cuál es nuestro perfil.
  let profileId = null;
  try {
    const data = JSON.parse(fs.readFileSync(NUCLEUS_JSON, 'utf8'));
    profileId = data.master_profile || null;
  } catch (e) {
    log.warn('[SYNAPSE] initOnboardingBridge: no se pudo leer nucleus.json —', e.message);
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
  const registry = new MilestoneRegistry({ bloomRoot, ONBOARDING_EVENTS });
  registry.loadSteps();

  const reactor = new MilestoneReactor({
    registry,
    getWindow:    () => mainWindow,
    execNucleus,
    NUCLEUS_JSON,
    verbose:      !app.isPackaged,
  });

  // Rehidratar desde disco para no re-ejecutar steps ya completados en
  // sesiones anteriores (ej: si Conductor se reinicia durante el onboarding).
  reactor.rehydrateFromDisk();

  // Conectar el bridge al reactor: solo procesamos mensajes ONBOARDING_MILESTONE.
  // El listener de raw-event (debug panel) sigue recibiendo TODO vía el segundo listener.
  _onboardingBridge.on('message', (enriched) => {
    if (enriched.type !== 'ONBOARDING_MILESTONE') return;

    const stepId = registry.resolveEvent(enriched.event);
    if (!stepId) {
      log.warn('[SYNAPSE] ONBOARDING_MILESTONE sin mapeo en registry:', enriched.event);
      return;
    }
    reactor.handleMilestone(stepId, enriched);
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

    log.info('[SYNAPSE] REGISTER_ACK con catch_up_needed=true — haciendo poll de seguridad');

    try {
      const result = await execNucleus(
        ['--json', 'synapse', 'status', profileId],
        15_000
      );

      if (result.state === 'ONLINE' || result.extension_loaded) {
        log.info('[SYNAPSE] Catch-up: perfil ya está ONLINE — simulando HANDSHAKE');
        _onboardingBridge.emit('message', {
          type:       'HANDSHAKE',
          _profileId: profileId,
          _launchId:  null,
          _ts:        Date.now(),
          _recovered: true,
        });
      } else {
        log.info('[SYNAPSE] Catch-up: perfil no está ONLINE aún — esperando push de Brain');
      }
    } catch (e) {
      log.warn('[SYNAPSE] Catch-up poll falló — continuando esperando push:', e.message);
      // No es fatal: si el perfil conecta después, el push llegará normalmente.
    }
  });

  // CRÍTICO: sin connectToBrain() el socket TCP nunca se abre y Brain
  // nunca manda nada — los listeners 'message' nunca disparan.
  _onboardingBridge.connectToBrain(profileId);

  log.info('[SYNAPSE] Onboarding bridge initialized — MilestoneRegistry + MilestoneReactor activos');
}

// ── NUCLEUS IPC HANDLERS ───────────────────────────────────────────────────
function setupNucleusHandlers() {

  ipcMain.handle('nucleus:health', async () => {
    try {
      const raw    = await execNucleus(['--json', 'health'], 15000);
      const allOk  = raw.success === true;
      const state  = (raw.state || '').toUpperCase();
      const status = allOk ? 'healthy' : state === 'DEGRADED' ? 'degraded' : 'unhealthy';

      const services = {};
      if (raw.components && typeof raw.components === 'object') {
        for (const [name, info] of Object.entries(raw.components)) {
          if (!info || typeof info !== 'object') continue;
          const parts = [info.state || (info.healthy ? 'OK' : 'ERROR')];
          if (info.port        !== undefined) parts.push(`port ${info.port}`);
          if (info.latency_ms  !== undefined) parts.push(`${info.latency_ms}ms`);
          if (info.pid         !== undefined) parts.push(`pid ${info.pid}`);
          if (info.profiles_count !== undefined) parts.push(`profiles: ${info.profiles_count}`);
          if (info.error)                     parts.push(`⚠ ${info.error}`);
          services[name] = parts.join(' · ');
        }
      }

      return {
        success: true,
        health: {
          status,
          all_services_ok:   allOk,
          state:             raw.state             || null,
          error:             raw.error             || null,
          timestamp:         raw.timestamp         || null,
          services,
          components:        raw.components        || null,
          brain_last_errors: raw.brain_last_errors || null
        }
      };
    } catch (err) {
      return {
        success: false,
        error:   err.message,
        health: {
          status:            'unhealthy',
          all_services_ok:   false,
          state:             'UNREACHABLE',
          error:             err.message,
          services:          { nucleus: `⚠ ${err.message}` },
          components:        null,
          brain_last_errors: null
        }
      };
    }
  });

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

  ipcMain.handle('nucleus:list-profiles', async () => {
    try {
      const result = await execNucleus(['--json', 'profile', 'list'], 10000);
      return {
        success:  result.success !== false,
        profiles: result.profiles || []
      };
    } catch (err) {
      return { success: false, profiles: [], error: err.message };
    }
  });

  ipcMain.handle('nucleus:launch-profile', async (event, profileId) => {
    if (!profileId || typeof profileId !== 'string') {
      return { success: false, error: 'profileId is required' };
    }
    try {
      const result = await execNucleus(
        ['--json', 'synapse', 'launch', profileId, '--mode', 'discovery'], 30000
      );
      return { success: result.success !== false, profileId, result };
    } catch (err) {
      return { success: false, profileId, error: err.message };
    }
  });

  ipcMain.handle('nucleus:create-profile', async (event, profileName) => {
    if (!profileName || typeof profileName !== 'string' || !profileName.trim()) {
      return { success: false, error: 'profileName is required' };
    }
    try {
      const result = await execNucleus(
        ['--json', 'profile', 'create', '--name', profileName.trim()], 15000
      );
      return {
        success: result.success !== false,
        profile: result.profile || null,
        result
      };
    } catch (err) {
      return { success: false, profile: null, error: err.message };
    }
  });

  ipcMain.handle('nucleus:get-installation', async () => {
    try {
      if (!fs.existsSync(NUCLEUS_JSON)) {
        return { success: false, error: 'nucleus.json not found' };
      }
      const data = JSON.parse(fs.readFileSync(NUCLEUS_JSON, 'utf8'));
      return {
        success:      true,
        installation: data.installation || null,
        onboarding:   data.onboarding   || null,
        raw:          data
      };
    } catch (err) {
      return { success: false, error: err.message };
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

  setupNucleusHandlers();

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
    const url = nucleusData.onboarding.workspace_url || 'http://localhost:3000';
    createWorkspaceWindow(url);
  } else {
    log.info('[BOOT] Loading onboarding window');
    createOnboardingWindow();
    // FIX: pasa getter () => mainWindow en lugar del valor mainWindow
    // para que los handlers siempre resuelvan la ventana actual
    registerOnboardingHandlers(execNucleus, NUCLEUS_JSON, () => mainWindow);
    // Inicializar el bridge de synapse para el onboarding.
    // El listener reemite cada mensaje de Brain al renderer via synapse:raw-event
    // para que el panel SYNAPSE RAW de debug.html lo muestre en tiempo real.
    // Se inicializa aquí — después de crear la ventana — para que mainWindow
    // esté disponible cuando el bridge intente hacer webContents.send().
    initOnboardingBridge();
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
        createWorkspaceWindow(nucleusData.onboarding.workspace_url || 'http://localhost:3000');
      } else {
        createOnboardingWindow();
        // FIX: pasa getter () => mainWindow en lugar del valor mainWindow
        registerOnboardingHandlers(execNucleus, NUCLEUS_JSON, () => mainWindow);
        initOnboardingBridge();
      }
    }
  }
});
