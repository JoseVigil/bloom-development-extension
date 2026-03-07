// main_conductor.js — Bloom Conductor
// Integración Onboarding UI + Synapse Protocol v4.0

'use strict';

const path = require('path');
const fs   = require('fs');
const os   = require('os');
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { spawn, execFile } = require('child_process');
const { promisify } = require('util');
const { getLogger } = require('../shared/logger');
const log = getLogger('onboarding');

// ── CONSTANTS ──────────────────────────────────────────────────────────────
const BLOOM_BASE   = path.join(process.env.LOCALAPPDATA, 'BloomNucleus');
const NUCLEUS_EXE  = path.join(BLOOM_BASE, 'bin', 'nucleus', 'nucleus.exe');
const NUCLEUS_JSON = path.join(BLOOM_BASE, 'config', 'nucleus.json');

let mainWindow = null;

// ── NUCLEUS HELPER ─────────────────────────────────────────────────────────
// Parser robusto que extrae el primer bloque JSON del stdout,
// ignorando líneas de log previas.
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
        // Extraer primer bloque JSON del output
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
      preload: path.join(__dirname, 'preload_onboarding.js')
    },
    icon: path.join(__dirname, 'assets', 'bloom.ico'),
    title: 'Bloom — System Setup',
    show: false,
    frame: true
  });

  mainWindow.loadFile(path.join(__dirname, 'onboarding.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });
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
      preload: path.join(__dirname, 'preload_workspace.js')
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

// ── NUCLEUS IPC HANDLERS ───────────────────────────────────────────────────
// Handlers expuestos por preload_conductor.js al workspace (conductor.html).
// Siguen el mismo patrón inline que setupOnboardingHandlers().
function setupNucleusHandlers() {

  // ── nucleus:health ────────────────────────────────────────────────────
  // nucleus --json health
  // Normaliza la respuesta para conductor.html:
  //   health.status          → "healthy" | "degraded" | "unhealthy"
  //   health.all_services_ok → boolean
  //   health.services        → { [name]: string } para el service-grid
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

  // ── nucleus:list-profiles ─────────────────────────────────────────────
  // nucleus --json profile list
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

  // ── nucleus:launch-profile ────────────────────────────────────────────
  // nucleus --json synapse launch <profileId>
  ipcMain.handle('nucleus:launch-profile', async (event, profileId) => {
    if (!profileId || typeof profileId !== 'string') {
      return { success: false, error: 'profileId is required' };
    }
    try {
      const result = await execNucleus(
        ['--json', 'synapse', 'launch', profileId], 30000
      );
      return { success: result.success !== false, profileId, result };
    } catch (err) {
      return { success: false, profileId, error: err.message };
    }
  });

  // ── nucleus:create-profile ────────────────────────────────────────────
  // nucleus --json profile create --name <profileName>
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

  // ── nucleus:get-installation ──────────────────────────────────────────
  // Lee nucleus.json directamente — sin invocar el binario.
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
  // 1. Verificar instalación
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

  // 2. Registrar handlers IPC (siempre, antes de cualquier ventana)
  setupNucleusHandlers();

  // 3. Decisión: onboarding o workspace
  const onboardingDone = nucleusData?.onboarding?.completed === true;

  if (onboardingDone) {
    const url = nucleusData.onboarding.workspace_url || 'http://localhost:3000';
    createWorkspaceWindow(url);
  } else {
    log.info('[BOOT] Loading onboarding window');
    createOnboardingWindow();
    setupOnboardingHandlers();
  }
});

// ── APP LIFECYCLE ──────────────────────────────────────────────────────────
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    // Re-evaluate state on reactivate (macOS)
    if (fs.existsSync(NUCLEUS_JSON)) {
      const nucleusData = JSON.parse(fs.readFileSync(NUCLEUS_JSON, 'utf8'));
      const onboardingDone = nucleusData?.onboarding?.completed === true;
      if (onboardingDone) {
        createWorkspaceWindow(nucleusData.onboarding.workspace_url || 'http://localhost:3000');
      } else {
        createOnboardingWindow();
        setupOnboardingHandlers();
      }
    }
  }
});

// ── ONBOARDING HANDLERS ────────────────────────────────────────────────────
function setupOnboardingHandlers() {

  // ── HANDLER: Lanzar Discovery en modo registro ──────────────────────────
  // Paso 0 del flujo: Chrome abre en welcome automáticamente.
  // Flags:
  //   --mode discovery          → Discovery page
  //   --override-register true  → Flujo B (registro de cuentas)
  //   --override-email          → Pre-rellena el login de Google
  //   --override-heartbeat false → Sin heartbeat durante registro
  //   --save                    → Persiste overrides en profiles.json
  ipcMain.handle('onboarding:launch-discovery', async (event, { email }) => {
    log.info('[IPC] onboarding:launch-discovery — email:', email || '(none)');
    try {
      const nucleusData = JSON.parse(fs.readFileSync(NUCLEUS_JSON, 'utf8'));
      const profileId = nucleusData.master_profile;
      if (!profileId) throw new Error('master_profile not found');

      // Spec v2.0 §8: nucleus synapse launch <profile_id> --mode discovery
      const args = [
        '--json', 'synapse', 'launch', profileId,
        '--mode', 'discovery',
        '--override-register', 'true',
        '--override-heartbeat', 'false'
      ];
      if (email) args.push('--override-email', email);

      const result = await execNucleus(args, 30000);
      log.success('[IPC] onboarding:launch-discovery — ok');
      return { success: result.success !== false, profileId, result };
    } catch (err) {
      log.error('[IPC] onboarding:launch-discovery — FAILED:', err.message);
      return { success: false, error: err.message };
    }
  });

  // ── HANDLER: Enviar step de onboarding a Chrome ─────────────────────────
  // Usa nucleus synapse onboarding — el nuevo subcomando del spec v2.0.
  // Temporal garantiza que la señal llega aunque Brain esté ocupado.
  // El comando retorna inmediatamente tras enviar la señal (no espera Chrome).
  //
  // Steps válidos (strings, no ints):
  //   welcome, google_login, google_login_waiting, gemini_api,
  //   gemini_api_waiting, provider_select, api_waiting, api_success, success
  ipcMain.handle('onboarding:navigate', async (event, { step, email, service }) => {
    log.info('[IPC] onboarding:navigate — step:', step);
    try {
      const nucleusData = JSON.parse(fs.readFileSync(NUCLEUS_JSON, 'utf8'));
      const profileId = nucleusData.master_profile;

      // Spec v2.0 §4.5: nucleus synapse onboarding <profile_id> --step <step>
      // Este subcomando está pendiente de implementación en Go.
      // Cuando esté disponible, descomentar el bloque execNucleus y eliminar el log de aviso.
      //
      // const args = ['--json', 'synapse', 'onboarding', profileId, '--step', step];
      // if (email)   args.push('--email',   email);
      // if (service) args.push('--service', service);
      // const result = await execNucleus(args, 10000);
      // const success = result.signal_sent === true || result.success !== false;

      log.warn('[IPC] onboarding:navigate — nucleus synapse onboarding not yet implemented, persisting step locally only');
      const success = true; // optimistic until subcommand is available

      // Persistir step actual en nucleus.json (escritor: Conductor — spec v2.0 §7)
      nucleusData.onboarding = nucleusData.onboarding || {};
      nucleusData.onboarding.started      = true;
      nucleusData.onboarding.current_step = step;
      nucleusData.onboarding.updated_at   = new Date().toISOString();
      if (!nucleusData.onboarding.started_at) {
        nucleusData.onboarding.started_at = new Date().toISOString();
      }
      fs.writeFileSync(NUCLEUS_JSON, JSON.stringify(nucleusData, null, 2));

      log.success('[IPC] onboarding:navigate — ok (step persisted)');
      return { success };
    } catch (err) {
      log.error('[IPC] onboarding:navigate — FAILED:', err.message);
      return { success: false, error: err.message };
    }
  });

  // ── HANDLER: Polling de identidad ───────────────────────────────────────
  // Llama nucleus synapse status y extrae el campo identity.
  // Retorna qué providers tienen status: "active".
  //
  // Estructura esperada de nucleus synapse status:
  // {
  //   "success": true,
  //   "state": "RUNNING",
  //   "identity": {
  //     "google": { "email": "...", "status": "active" },
  //     "gemini": { "email": "...", "status": "active" }
  //   }
  // }
  ipcMain.handle('onboarding:poll-identity', async () => {
    log.info('[IPC] onboarding:poll-identity');
    try {
      const nucleusData = JSON.parse(fs.readFileSync(NUCLEUS_JSON, 'utf8'));
      const profileId = nucleusData.master_profile;

      // Intento 1: synapse status con campo identity
      try {
        const result = await execNucleus(
          ['--json', 'synapse', 'status', profileId], 8000
        );
        const raw = result.identity || {};
        if (Object.keys(raw).length > 0) {
          const accounts = {
            google: raw.google?.status === 'active',
            gemini: raw.gemini?.status === 'active',
            github: raw.github?.status === 'active'
          };
          log.success('[IPC] onboarding:poll-identity — ok:', JSON.stringify(accounts));
          return { success: true, accounts };
        }
      } catch (_) {}

      // Fallback: leer accounts desde nucleus.json
      const accounts = nucleusData.onboarding?.accounts || [];
      const resolved = {
        google: accounts.some(a => a.provider === 'google' && a.status === 'active'),
        gemini: accounts.some(a => a.provider === 'gemini' && a.status === 'active'),
        github: accounts.some(a => a.provider === 'github' && a.status === 'active')
      };
      log.success('[IPC] onboarding:poll-identity — ok (fallback):', JSON.stringify(resolved));
      return { success: true, accounts: resolved };
    } catch (err) {
      log.error('[IPC] onboarding:poll-identity — FAILED:', err.message);
      return { success: false, accounts: { google: false, gemini: false, github: false } };
    }
  });

  // ── HANDLER: Folder picker nativo ───────────────────────────────────────
  ipcMain.handle('onboarding:select-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Select Nucleus location',
      buttonLabel: 'Select'
    });
    if (result.canceled || !result.filePaths.length) {
      log.warn('[IPC] onboarding:select-folder — canceled');
      return { success: false, canceled: true };
    }
    return { success: true, path: result.filePaths[0] };
  });

  // ── HANDLER: Listar orgs de GitHub ──────────────────────────────────────
  ipcMain.handle('onboarding:list-orgs', async () => {
    try {
      const result = await execNucleus(['--json', 'github', 'list-orgs']);
      return { success: true, orgs: result.orgs || [] };
    } catch (err) {
      log.error('[IPC] onboarding:list-orgs — FAILED:', err.message);
      return { success: false, orgs: [], error: err.message };
    }
  });

  // ── HANDLER: Inicializar Nucleus con streaming de output ────────────────
  ipcMain.handle('onboarding:init-nucleus', async (event, { org, path: nucleusPath }) => {
    log.info('[IPC] onboarding:init-nucleus — org:', org, '| path:', nucleusPath);
    return new Promise((resolve) => {
      const child = spawn(
        NUCLEUS_EXE,
        ['init', '--org', org, '--path', nucleusPath],
        { windowsHide: true }
      );

      let allOutput = '';

      child.stdout.on('data', d => {
        const line = d.toString().trim();
        if (!line) return;
        allOutput += line + '\n';
        event.sender.send('onboarding:init-line', { line, isError: false });
      });

      child.stderr.on('data', d => {
        const line = d.toString().trim();
        if (!line) return;
        event.sender.send('onboarding:init-line', { line, isError: true });
      });

      child.on('close', code => {
        if (code === 0) {
          log.success('[IPC] onboarding:init-nucleus — ok');
          resolve({ success: true, output: allOutput });
        } else {
          log.error('[IPC] onboarding:init-nucleus — FAILED: exit code', code);
          resolve({ success: false, error: `Exit code ${code}`, output: allOutput });
        }
      });

      child.on('error', err => {
        log.error('[IPC] onboarding:init-nucleus — FAILED:', err.message);
        resolve({ success: false, error: err.message });
      });
    });
  });

  // ── HANDLER: Listar repos de una org ────────────────────────────────────
  ipcMain.handle('onboarding:list-repos', async (event, { org }) => {
    try {
      const result = await execNucleus(
        ['--json', 'github', 'list-repos', '--org', org]
      );
      return { success: true, repos: result.repos || [] };
    } catch (err) {
      log.error('[IPC] onboarding:list-repos — FAILED:', err.message);
      return { success: false, repos: [], error: err.message };
    }
  });

  // ── HANDLER: Crear Genesis Mandate ──────────────────────────────────────
  ipcMain.handle('onboarding:create-mandate', async (event, { project, projectPath }) => {
    try {
      const result = await execNucleus([
        '--json', 'mandate', 'create',
        '--project', project,
        '--path', projectPath
      ]);
      return { success: result.success !== false, result };
    } catch (err) {
      log.error('[IPC] onboarding:create-mandate — FAILED:', err.message);
      return { success: false, error: err.message };
    }
  });

  // ── HANDLER: Completar onboarding + handoff al workspace ────────────────
  ipcMain.handle('onboarding:complete', async (event, { workspaceUrl }) => {
    log.info('[IPC] onboarding:complete — workspaceUrl:', workspaceUrl || 'http://localhost:3000');
    try {
      const nucleusData = JSON.parse(fs.readFileSync(NUCLEUS_JSON, 'utf8'));
      nucleusData.onboarding = {
        ...nucleusData.onboarding,
        completed:     true,
        completed_at:  new Date().toISOString(),
        workspace_url: workspaceUrl || 'http://localhost:3000',
        current_step:  'success'
      };
      fs.writeFileSync(NUCLEUS_JSON, JSON.stringify(nucleusData, null, 2));

      if (mainWindow) {
        mainWindow.setResizable(true);
        mainWindow.setSize(1280, 800, true);
        mainWindow.center();
        await new Promise(r => setTimeout(r, 400));
        mainWindow.loadURL(nucleusData.onboarding.workspace_url);
        setTimeout(() => mainWindow?.maximize(), 600);
      }

      log.success('[IPC] onboarding:complete — ok');
      return { success: true };
    } catch (err) {
      log.error('[IPC] onboarding:complete — FAILED:', err.message);
      return { success: false, error: err.message };
    }
  });

  // ── HANDLER: Bridge de logging desde el renderer ────────────────────────
  ipcMain.handle('onboarding:log', async (event, { level, message }) => {
    const msg = `[RENDERER] ${message}`;
    if      (level === 'error') log.error(msg);
    else if (level === 'warn')  log.warn(msg);
    else                        log.info(msg);
    return { success: true };
  });
}