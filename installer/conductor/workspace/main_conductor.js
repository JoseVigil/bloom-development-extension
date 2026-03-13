// main_conductor.js — Bloom Conductor
// Integración Onboarding UI + Synapse Protocol v4.0

'use strict';

const path = require('path');
const fs   = require('fs');
const os   = require('os');
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { spawn, execFile } = require('child_process');
const { promisify } = require('util');
// shared/ está en ../shared/ en dev y en ./shared/ dentro del asar empaquetado
const _sharedDir = require('path').join(
  require('electron').app.isPackaged ? __dirname : path.join(__dirname, '..'),
  'shared'
);
const { getLogger } = require(path.join(_sharedDir, 'logger'));
const { paths } = require(path.join(_sharedDir, 'global_paths'));
const { registerOnboardingHandlers } = require('./onboarding/ipc/onboarding-handlers');
const log = getLogger('onboarding');

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
        ['--json', 'synapse', 'launch', profileId], 30000
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

  if (onboardingDone) {
    const url = nucleusData.onboarding.workspace_url || 'http://localhost:3000';
    createWorkspaceWindow(url);
  } else {
    log.info('[BOOT] Loading onboarding window');
    createOnboardingWindow();
    // FIX: pasa getter () => mainWindow en lugar del valor mainWindow
    // para que los handlers siempre resuelvan la ventana actual
    registerOnboardingHandlers(execNucleus, NUCLEUS_JSON, () => mainWindow);
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
      }
    }
  }
});