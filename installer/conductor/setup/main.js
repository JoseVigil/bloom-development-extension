// main.js - REFACTORED: Nucleus Delegation
// Heartbeat: nucleus --json health
// Launch: nucleus --json synapse launch [profile_id] --mode discovery
// Repair: nucleus --json health --fix
// UTF-8 CONFIGURATION

if (process.platform === 'win32') {
  if (process.stdout && process.stdout._handle) {
    process.stdout._handle.setBlocking(true);
  }
  if (process.stderr && process.stderr._handle) {
    process.stderr._handle.setBlocking(true);
  }

  process.env.PYTHONIOENCODING = 'utf-8';
  process.env.PYTHONUTF8 = '1';
  process.env.PYTHONLEGACYWINDOWSSTDIO = '0';
  process.env.NODE_NO_WARNINGS = '1';

  try {
    const { execSync } = require('child_process');
    execSync('chcp 65001 > nul 2>&1', { stdio: 'ignore', windowsHide: true });
  } catch (e) {}
}

// ============================================================================
// CLI CONTRACT - Salida Temprana (antes de inicializar Electron)
// bloom-setup.exe --version | --info | --version-json | --binaries | --health
// ============================================================================
const path = require('path');
const fs = require('fs');
const os = require('os');

function getBloomBasePathCLI() {
  const homeDir = os.homedir();
  if (process.platform === 'win32') {
    return path.join(homeDir, 'AppData', 'Local', 'BloomNucleus');
  } else if (process.platform === 'darwin') {
    return path.join(homeDir, 'Library', 'BloomNucleus');
  } else {
    return path.join(homeDir, '.local', 'share', 'BloomNucleus');
  }
}

function loadBuildInfo() {
  const candidates = [
    path.join(__dirname, 'build_info.json'),
    path.join(process.cwd(), 'build_info.json'),
  ];
  if (process.resourcesPath) {
    candidates.push(path.join(process.resourcesPath, '..', 'build_info.json'));
  }
  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return JSON.parse(fs.readFileSync(c, 'utf8'));
    } catch { /* try next */ }
  }
  const pkg = (() => { try { return require('./package.json'); } catch { return {}; } })();
  return {
    name: pkg.name || 'bloom-nucleus-installer',
    product_name: pkg.productName || 'Bloom Nucleus Installer',
    version: pkg.version || '0.0.0',
    build: 0,
    full_version: `${pkg.version || '0.0.0'}+build.0`,
    channel: 'stable',
    built_at: 'unknown',
    git_commit: 'unknown',
    platform: process.platform,
    arch: process.arch,
    node_version: process.version,
    electron_version: 'unknown'
  };
}

// ============================================================================
// CLI CONTRACT
// ============================================================================
const CLI_FLAGS = ['--version', '--info', '--version-json', '--binaries', '--health'];
const IS_CLI_MODE = process.argv.some(a => CLI_FLAGS.includes(a));

function handleCLIOutput(onDone) {
  const args = process.argv;

  if (args.includes('--version')) {
    const info = loadBuildInfo();
    process.stdout.write([
      `name:            ${info.product_name}`,
      `version:         ${info.version}`,
      `build:           ${info.build}`,
      `full_version:    ${info.full_version}`,
      `channel:         ${info.channel}`,
    ].join('\n') + '\n');
    onDone(0);
    return;
  }

  if (args.includes('--info')) {
    const info = loadBuildInfo();
    const bloomBase = getBloomBasePathCLI();
    process.stdout.write([
      `name:              ${info.product_name}`,
      `version:           ${info.version}`,
      `build:             ${info.build}`,
      `full_version:      ${info.full_version}`,
      `channel:           ${info.channel}`,
      `built_at:          ${info.built_at}`,
      `git_commit:        ${info.git_commit}`,
      `platform:          ${process.platform}`,
      `arch:              ${process.arch}`,
      `executable_path:   ${process.execPath}`,
      `bloom_base:        ${bloomBase}`,
      `node_version:      ${process.version}`,
      `electron_version:  ${info.electron_version}`,
    ].join('\n') + '\n');
    onDone(0);
    return;
  }

  if (args.includes('--version-json')) {
    const info = loadBuildInfo();
    process.stdout.write(JSON.stringify({
      name: info.name,
      product_name: info.product_name,
      version: info.version,
      build: info.build,
      full_version: info.full_version,
      channel: info.channel,
      built_at: info.built_at,
      git_commit: info.git_commit,
      platform: process.platform,
      arch: process.arch,
    }, null, 2) + '\n');
    onDone(0);
    return;
  }

  if (args.includes('--binaries')) {
    const bloomBase = getBloomBasePathCLI();
    const binaries = {
      nucleus:   path.join(bloomBase, 'bin', 'nucleus',    'nucleus.exe'),
      sentinel:  path.join(bloomBase, 'bin', 'sentinel',   'sentinel.exe'),
      brain:     path.join(bloomBase, 'bin', 'brain',      'brain.exe'),
      host:      path.join(bloomBase, 'bin', 'host',      'bloom-host.exe'),
      ollama:    path.join(bloomBase, 'bin', 'ollama',     'ollama.exe'),
      workspaceExe: process.platform === 'darwin'
        ? path.join('/Applications', 'bloom-workspace.app', 'Contents', 'MacOS', 'bloom-workspace')
        : path.join(bloomBase, 'bin', 'workspace', 'bloom-workspace.exe'),
      chromium:  path.join(bloomBase, 'bin', 'chrome-win', 'chrome.exe')
    };
    const result = {};
    Object.entries(binaries).forEach(([key, filepath]) => {
      result[key] = { path: filepath, exists: fs.existsSync(filepath) };
    });
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    onDone(0);
    return;
  }

  if (args.includes('--health')) {
    const { spawn } = require('child_process');
    const bloomBase = getBloomBasePathCLI();
    const nucleusExe = path.join(bloomBase, 'bin', 'nucleus', 'nucleus.exe');

    if (!fs.existsSync(nucleusExe)) {
      process.stdout.write(JSON.stringify({ error: 'Nucleus executable not found', path: nucleusExe }) + '\n');
      onDone(1);
      return;
    }

    const child = spawn(nucleusExe, ['--json', 'health'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });

    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.on('close', (code) => {
      try {
        for (const line of out.split('\n')) {
          const t = line.trim();
          if (t.startsWith('{')) {
            process.stdout.write(t + '\n');
            onDone(code);
            return;
          }
        }
        process.stdout.write(JSON.stringify({ error: 'No JSON output from nucleus health' }) + '\n');
        onDone(1);
      } catch (err) {
        process.stdout.write(JSON.stringify({ error: err.message }) + '\n');
        onDone(1);
      }
    });
    return;
  }
}

const { app, BrowserWindow, ipcMain, shell } = require('electron');
const { spawn } = require('child_process');
const { paths } = require('./config/paths');
const { SynapseBridge } = require('../shared/synapse-bridge');
const { getLogger }    = require('../shared/logger');

// Logger persistente del stream conductor_setup → logs/conductor/setup/conductor_setup_YYYYMMDD.log
// Es el mismo archivo que usa installer.js — todo el flujo setup queda en un único log cruzable.
const _logger = getLogger('installer');

// Bridge activo durante la fase post-instalación (conectToBrain → PROFILE_CONNECTED).
// Una sola instancia a la vez; se destruye al recibir HANDSHAKE o ERROR.
let _installBridge = null;

// ── CLI MODE gate ─────────────────────────────────────────────────────────────
if (IS_CLI_MODE) {
  app.disableHardwareAcceleration();
  app.whenReady().then(() => {
    handleCLIOutput((exitCode) => {
      app.exit(exitCode);
    });
  });
  app.on('window-all-closed', () => {});
}

// ── Todo lo que sigue solo corre en modo GUI ──────────────────────────────────
if (!IS_CLI_MODE) {

// ============================================================================
// CONSTANTS & MODE DETECTION
// ============================================================================
const IS_DEV = process.argv.includes('--dev') || process.env.NODE_ENV === 'development';
const IS_LAUNCH_MODE = process.argv.includes('--mode=launch') || process.argv.includes('--launch');
const FORCE_ONBOARDING = process.argv.includes('--onboarding');
const APP_VERSION = app.getVersion();
const isWindows = process.platform === 'win32';
const useEmojis = true;

// ============================================================================
// HEARTBEAT CONFIGURATION
// ============================================================================
const HEARTBEAT_CONFIG = {
  INTERVAL: 30000,
  RETRY_DELAY: 5000,
  TIMEOUT: 10000
};

let heartbeatTimer = null;
let lastHeartbeatStatus = { connected: false, port: null };

// ============================================================================
// PATHS
// ============================================================================
const REPO_ROOT = path.join(__dirname, '..', '..');

function getBloomBasePath() {
  const platform = os.platform();
  const homeDir = os.homedir();

  if (platform === 'win32') {
    return path.join(homeDir, 'AppData', 'Local', 'BloomNucleus');
  } else if (platform === 'darwin') {
    return path.join(homeDir, 'Library', 'BloomNucleus');
  } else {
    return path.join(homeDir, '.local', 'share', 'BloomNucleus');
  }
}

function getBrainExecutablePath() {
  const bloomBase = getBloomBasePath();
  if (isWindows) {
    return path.join(bloomBase, 'bin', 'brain', 'brain.exe');
  } else {
    return path.join(bloomBase, 'bin', 'brain', 'brain');
  }
}

function getBrainWorkingDirectory() {
  return path.dirname(getBrainExecutablePath());
}

function getNucleusExecutablePath() {
  const bloomBase = getBloomBasePath();
  if (isWindows) {
    return path.join(bloomBase, 'bin', 'nucleus', 'nucleus.exe');
  } else {
    return path.join(bloomBase, 'bin', 'nucleus', 'nucleus');
  }
}

function getNucleusWorkingDirectory() {
  return path.dirname(getNucleusExecutablePath());
}

const BLOOM_BASE = getBloomBasePath();
const BRAIN_EXE = getBrainExecutablePath();
const NUCLEUS_EXE = getNucleusExecutablePath();
const WEBVIEW_BUILD_PATH = path.join(REPO_ROOT, 'webview', 'app', 'build', 'index.html');
const INSTALL_HTML_PATH = path.join(__dirname, 'src', 'index.html');

// ============================================================================
// LOGGING
// ============================================================================
function safeLog(emoji, ...args) {
  const prefix = useEmojis ? emoji : `[${getEmojiName(emoji)}]`;
  console.log(prefix, ...args);
  // Persistir en conductor_setup_YYYYMMDD.log para cruzar con logs de Host y Brain
  const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
  const emojiName = getEmojiName(emoji);
  if (emojiName === 'ERROR') {
    _logger.error(msg);
  } else if (emojiName === 'WARN') {
    _logger.warn(msg);
  } else {
    _logger.info(msg);
  }
}

function getEmojiName(emoji) {
  const map = {
    '🌸': 'BLOOM', '🚀': 'LAUNCH', '✅': 'OK', '❌': 'ERROR',
    '🔧': 'DEV', '📋': 'INFO', '⚠️': 'WARN', '🔍': 'DEBUG',
    '🔗': 'URL', '📄': 'NAV', '📨': 'EVENT', '📦': 'PROD',
    '🪟': 'WINDOW', '💥': 'FATAL', '👋': 'QUIT', '🔄': 'RELOAD',
    '💓': 'HEARTBEAT', '🏥': 'HEALTH', '📍': 'PING', '🧠': 'NUCLEUS'
  };
  return map[emoji] || 'LOG';
}

function log(...args) { safeLog('🌸', '[MAIN]', ...args); }
function error(...args) { console.error('❌', '[MAIN]', ...args); }

// ============================================================================
// STARTUP BANNER
// ============================================================================
console.log(`
╔═══════════════════════════════════════╗
║ 🌸 BLOOM NUCLEUS ${IS_LAUNCH_MODE ? 'LAUNCHER' : 'INSTALLER'} ║
║ Mode: ${IS_LAUNCH_MODE ? 'LAUNCH' : 'INSTALL'} ║
║ Version: ${APP_VERSION.padEnd(28)} ║
║ Environment: ${IS_DEV ? 'DEVELOPMENT' : 'PRODUCTION'.padEnd(20)} ║
║ Heartbeat: Nucleus Health  ║
╚═══════════════════════════════════════╝
`);

if (IS_DEV) {
  safeLog('🔧', 'CLI Arguments:', process.argv.slice(2));
}

log('📋 Paths:');
log(' - BLOOM_BASE:', BLOOM_BASE);
log(' - NUCLEUS_EXE:', NUCLEUS_EXE);
log(' - BRAIN_EXE:', BRAIN_EXE);

// ============================================================================
// JSON PARSING UTILITY
// ============================================================================
function parseCLIJson(stdout) {
  try {
    const lines = stdout.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        try {
          return JSON.parse(trimmed);
        } catch {
          continue;
        }
      }
    }

    const potentialJsons = stdout.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g);
    if (potentialJsons) {
      for (const candidate of potentialJsons) {
        try {
          return JSON.parse(candidate);
        } catch {
          continue;
        }
      }
    }

    let depth = 0;
    let start = -1;

    for (let i = 0; i < stdout.length; i++) {
      if (stdout[i] === '{') {
        if (depth === 0) start = i;
        depth++;
      } else if (stdout[i] === '}') {
        depth--;
        if (depth === 0 && start !== -1) {
          try {
            return JSON.parse(stdout.substring(start, i + 1));
          } catch {
            start = -1;
          }
        }
      }
    }

    throw new Error('No valid JSON found in output');
  } catch (error) {
    throw new Error(`JSON parse failed: ${error.message}`);
  }
}

// ============================================================================
// NUCLEUS COMMAND EXECUTION
// ============================================================================
async function executeNucleusCommand(args) {
  return new Promise((resolve, reject) => {
    const nucleusPath = getNucleusExecutablePath();

    if (!fs.existsSync(nucleusPath)) {
      return reject(new Error(`Nucleus not found: ${nucleusPath}`));
    }

    const child = spawn(nucleusPath, args, {
      cwd: getNucleusWorkingDirectory(),
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
        PYTHONUTF8: '1',
        PYTHONLEGACYWINDOWSSTDIO: '0'
      },
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => { stdout += data; });
    child.stderr.on('data', (data) => { stderr += data; });

    child.on('close', (code) => {
      try {
        const result = parseCLIJson(stdout);
        resolve(result);
      } catch (e) {
        if (stderr) console.error('[Nucleus CLI] stderr:', stderr);
        reject(new Error(`Failed to parse JSON: ${e.message}`));
      }
    });

    child.on('error', (err) => reject(err));

    setTimeout(() => {
      if (!child.killed) {
        child.kill();
        reject(new Error('Nucleus command timeout'));
      }
    }, 30000);
  });
}

// ============================================================================
// HEARTBEAT IMPLEMENTATION (Nucleus)
// ============================================================================
async function checkHostStatus() {
  try {
    const result = await executeNucleusCommand(['--json', 'health']);

    // Considerar "connected" si el state es saludable O si los componentes
    // críticos (nucleus propio + al menos un worker) están OK.
    // No exigir que TODOS los servicios estén perfectos.
    const nucleusOk = result.state === 'HEALTHY' || result.state === 'OPERATIONAL' || result.success === true;
    const hasProfiles = (result.components?.worker_manager?.profiles_count || 0) > 0;

    return {
      connected: nucleusOk || hasProfiles,
      port: result.components?.brain_service?.port || null,
      services: result.components || {},
      profiles_registered: result.components?.worker_manager?.profiles_count || 0,
      state: result.state || 'UNKNOWN',
      error: (!nucleusOk && !hasProfiles) ? (result.error || result.state) : null
    };
  } catch (error) {
    return { connected: false, port: null, services: {}, profiles_registered: 0, error: error.message };
  }
}

function startHeartbeat() {
  if (heartbeatTimer) {
    log('⚠️ Heartbeat already running');
    return;
  }

  log('💓 Starting heartbeat polling via Nucleus...');
  log(` Interval: ${HEARTBEAT_CONFIG.INTERVAL}ms (${HEARTBEAT_CONFIG.INTERVAL / 1000}s)`);

  checkHostStatus().then((status) => {
    lastHeartbeatStatus = status;
    updateUIStatus(status);
  });

  heartbeatTimer = setInterval(async () => {
    const status = await checkHostStatus();
    lastHeartbeatStatus = status;
    updateUIStatus(status);
  }, HEARTBEAT_CONFIG.INTERVAL);
}

function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
    log('💓 Heartbeat stopped');
  }
}

function updateUIStatus(status) {
  const mainWin = BrowserWindow.getAllWindows()[0];
  if (!mainWin || mainWin.isDestroyed()) return;

  if (status.connected) {
    safeLog('✅', `[Heartbeat] Status: ONLINE (port: ${status.port}, profiles: ${status.profiles_registered})`);
  } else {
    safeLog('⚠️', `[Heartbeat] Status: OFFLINE${status.error ? ` (${status.error})` : ''}`);
  }

  mainWin.webContents.send('server-status', status);
}


// ============================================================================
// SYNAPSE POLL — DEPRECADO: reemplazado por SynapseBridge.connectToBrain()
//
// Esta función usaba polling CLI (nucleus --json synapse status) para detectar
// PROFILE_CONNECTED. El bridge TCP push-based en install:start la reemplaza:
// - Más rápido: recibe el evento en ~0ms vs el próximo ciclo de 3s
// - Sin race condition: Brain emite el evento al momento del handshake
// - Sin carga de subprocesos: una conexión TCP vs N invocaciones de nucleus
//
// Se conserva como fallback de emergencia. Para habilitarlo reemplazar
// _installBridge.connectToBrain() en install:start por esta función.
// ============================================================================
async function _pollSynapseUntilConnected(win, profileId) {
  const MAX_ATTEMPTS = 40;  // 40 × 3s = 120s máximo
  const INTERVAL_MS  = 3000;
  let attempts = 0;

  log(`💓 [Synapse Poll] Iniciando polling para perfil: ${profileId}`);

  // Mostrar estados intermedios mientras esperamos el primer poll
  const stages = [
    { state: 'LAUNCHING',  delay: 0    },
    { state: 'SEARCHING',  delay: 2000 },
    { state: 'HANDSHAKE',  delay: 4000 },
    { state: 'HEARTBEAT',  delay: 6000 },
  ];

  for (const stage of stages) {
    setTimeout(() => {
      if (!win || win.isDestroyed()) return;
      win.webContents.send('heartbeat:launch-done', {
        profile_id: profileId,
        state: stage.state,
        extension_loaded: false
      });
    }, stage.delay);
  }

  // Esperar que las animaciones empiecen antes de hacer el primer poll
  await new Promise(r => setTimeout(r, 8000));

  const poll = setInterval(async () => {
    if (!win || win.isDestroyed()) { clearInterval(poll); return; }

    attempts++;
    try {
      const result = await executeNucleusCommand([
        '--json', 'synapse', 'status', profileId
      ]);

      // DESPUÉS:
      const status = result.status || {};
      const state = status.state || 'UNKNOWN';
      const sentinelRunning = status.sentinel_running || false;
      log(`💓 [Synapse Poll ${attempts}/${MAX_ATTEMPTS}] state=${state} sentinel_running=${sentinelRunning}`);

      if (!win.isDestroyed()) {
        win.webContents.send('heartbeat:launch-done', {
          profile_id: profileId,
          state,
          extension_loaded: sentinelRunning
        });
      }

      if (state === 'RUNNING' && sentinelRunning === true) {
        clearInterval(poll);
        log(`✅ [Synapse Poll] Perfil conectado: ${profileId}`);

        if (!win.isDestroyed()) {
          win.webContents.send('heartbeat:validated', {
            profile_id: profileId,
            state,
            extension_loaded: true
          });
        }

        // Ahora sí arrancar el heartbeat de infraestructura
        setTimeout(() => startHeartbeat(), 2000);
        return;
      }

    } catch (err) {
      log(`⚠️ [Synapse Poll ${attempts}] Error: ${err.message}`);
    }

    if (attempts >= MAX_ATTEMPTS) {
      clearInterval(poll);
      error(`❌ [Synapse Poll] Timeout esperando conexión del perfil ${profileId}`);
      if (!win.isDestroyed()) {
        win.webContents.send('installation-error', {
          error: `Timeout: el perfil ${profileId} no se conectó en ${MAX_ATTEMPTS * INTERVAL_MS / 1000}s`
        });
      }
    }
  }, INTERVAL_MS);
}

// ============================================================================
// BRAIN COMMAND EXECUTION (Para launch mode - profile commands)
// ============================================================================
async function executeBrainCommand(args) {
  return new Promise((resolve, reject) => {
    const brainPath = getBrainExecutablePath();

    if (!fs.existsSync(brainPath)) {
      return reject(new Error(`Brain not found: ${brainPath}`));
    }

    const child = spawn(brainPath, args, {
      cwd: getBrainWorkingDirectory(),
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
        PYTHONUTF8: '1',
        PYTHONLEGACYWINDOWSSTDIO: '0'
      },
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (data) => { stdout += data; });
    child.stderr.on('data', (data) => { stderr += data; });

    child.on('close', (code) => {
      try {
        const result = parseCLIJson(stdout);
        resolve(result);
      } catch (e) {
        if (stderr) console.error('[Brain CLI] stderr:', stderr);
        reject(new Error(`Failed to parse JSON: ${e.message}`));
      }
    });

    child.on('error', (err) => reject(err));

    setTimeout(() => {
      if (!child.killed) {
        child.kill();
        reject(new Error('Command timeout'));
      }
    }, 30000);
  });
}

// ============================================================================
// IPC HANDLERS - SHARED
// ============================================================================
function registerSharedHandlers() {
  ipcMain.handle('system:info', async () => {
    return {
      platform: os.platform(),
      arch: os.arch(),
      version: os.release(),
      appVersion: APP_VERSION,
      bloomBase: BLOOM_BASE,
      brainExe: BRAIN_EXE,
      nucleusExe: NUCLEUS_EXE
    };
  });

  ipcMain.handle('app:version', async () => {
    return APP_VERSION;
  });

  ipcMain.handle('shell:openExternal', async (event, url) => {
    await shell.openExternal(url);
    return { success: true };
  });

  ipcMain.handle('shell:openLogsFolder', async () => {
    const logsDir = path.join(BLOOM_BASE, 'logs');
    if (fs.existsSync(logsDir)) {
      await shell.openPath(logsDir);
      return { success: true };
    } else {
      return { success: false, error: 'Logs directory not found' };
    }
  });

  ipcMain.handle('path:resolve', async (event, { type, args }) => {
    return path[type](...args);
  });
}

// ============================================================================
// IPC HANDLERS - NUCLEUS
// ============================================================================
function registerNucleusHandlers() {
  log('🧠 Registering Nucleus handlers...');

  ipcMain.handle('nucleus:health', async () => {
    try {
      return await executeNucleusCommand(['--json', 'health']);
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('nucleus:validate', async () => {
    try {
      return await executeNucleusCommand(['--json', 'health', '--validate']);
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('nucleus:repair', async () => {
    try {
      return await executeNucleusCommand(['--json', 'health', '--fix']);
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('nucleus:launch', async (event, profileId) => {
    try {
      if (!profileId) return { success: false, error: 'Profile ID required' };
      return await executeNucleusCommand(['--json', 'synapse', 'launch', profileId]);
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('nucleus:dev-start', async () => {
    try {
      return await executeNucleusCommand(['--json', 'dev-start']);
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('nucleus:status', async (event, profileId) => {
    try {
      return await executeNucleusCommand(['--json', 'synapse', 'status', profileId]);
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  log('✅ Nucleus handlers registered');
}

// ============================================================================
// IPC HANDLERS - LAUNCH MODE
// ============================================================================
function registerLaunchHandlers() {
  ipcMain.handle('health:check', async () => {
    return await checkHostStatus();
  });

  ipcMain.handle('health:status', async () => {
    return lastHeartbeatStatus;
  });

  ipcMain.handle('onboarding:status', async () => {
    try {
      const result = await executeBrainCommand(['profile', 'status', '--json']);
      return result.data || { completed: false };
    } catch (error) {
      return { completed: false, error: error.message };
    }
  });

  ipcMain.handle('profile:list', async () => {
    try {
      const result = await executeBrainCommand(['profile', 'list', '--json']);
      return result.data || { profiles: [] };
    } catch (error) {
      return { profiles: [], error: error.message };
    }
  });

  ipcMain.handle('profile:launch', async (event, { profileId, url }) => {
    try {
      const args = ['profile', 'launch', profileId];
      if (url) args.push('--url', url);
      args.push('--json');

      const result = await executeBrainCommand(args);
      return result;
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('logs:tail', async (event, { lines = 100 }) => {
    try {
      const result = await executeBrainCommand(['logs', 'tail', '--lines', lines.toString(), '--json']);
      return result.data || { logs: [] };
    } catch (error) {
      return { logs: [], error: error.message };
    }
  });

  ipcMain.handle('environment:get', async () => {
    return {
      bloomBase: BLOOM_BASE,
      brainExe: BRAIN_EXE,
      nucleusExe: NUCLEUS_EXE,
      platform: os.platform(),
      devMode: IS_DEV
    };
  });

  ipcMain.handle('services:check-all', async () => {
    const status = await checkHostStatus();
    return {
      brain: status.connected ? 'RUNNING' : 'STOPPED',
      port: status.port,
      connected: status.connected,
      services: status.services
    };
  });
}

// ============================================================================
// IPC HANDLERS - INSTALL MODE
// ============================================================================
function registerInstallHandlers() {

  // ── Punto de entrada único del instalador ────────────────────────────────
  ipcMain.handle('install:start', async (event, options = {}) => {
    try {
      const { installService } = require('./install/installer');
      const win = BrowserWindow.getAllWindows()[0];

      // ── Preparar bridge ANTES de installService ──────────────────────────────
      // El bridge debe estar registrado como Sentinel en Brain ANTES de que
      // nucleus lance Chrome. Si se crea después (como antes), PROFILE_CONNECTED
      // ya fue emitido y el bridge nunca lo recibe.
      if (_installBridge) { _installBridge.destroy(); _installBridge = null; }

      _installBridge = new SynapseBridge({
        mainWindow:    win,
        nucleusBinary: NUCLEUS_EXE,
        verbose:       IS_DEV,
      });

      let _handshakeTimeout = null;
      let _handshakeResolved = false;

      const _resolveHandshake = (source, extra = {}) => {
        if (_handshakeResolved) {
          _logger.warn(`[Bridge] _resolveHandshake llamado dos veces — ignorando segunda resolución (source=${source})`);
          return;
        }
        _handshakeResolved = true;
        _logger.info(`[Bridge] heartbeat:validated → source=${source}`);
        log(`✅ [Synapse Bridge] Handshake resuelto via ${source}`);
        if (_handshakeTimeout) { clearTimeout(_handshakeTimeout); _handshakeTimeout = null; }
        if (!win || win.isDestroyed()) return;
        win.webContents.send('heartbeat:validated', {
          profile_id:       _currentProfileId,
          state:            'RUNNING',
          extension_loaded: true,
          ...extra,
        });
        if (_installBridge) { _installBridge.destroy(); _installBridge = null; }
        setTimeout(() => startHeartbeat(), 2000);
      };

      // _currentProfileId se setea en onBeforeLaunch (antes del launch)
      let _currentProfileId = null;

      _installBridge.on('synapse:event', (payload) => {
        if (!win || win.isDestroyed()) {
          if (_handshakeTimeout) { clearTimeout(_handshakeTimeout); _handshakeTimeout = null; }
          if (_installBridge) { _installBridge.destroy(); _installBridge = null; }
          return;
        }

        // ── Log de TODOS los eventos del bridge → trazable en conductor_setup.log ──
        // Cruzar con: logs/host/<profile_id>/host_YYYYMMDD.log (HANDSHAKE_FASE3)
        //             DevTools de Cortex (background.js HANDSHAKE_COMPLETADO)
        _logger.debug(`[Bridge←Brain] type=${payload.type} phase=${payload.phase || '-'} raw_type=${payload._rawType || payload.type || '?'} ts=${payload._ts || Date.now()}`);

        switch (payload.type) {

          // Fases internas del bridge → mantener animación del heartbeat-screen
          case 'STATUS':
            _logger.info(`[Bridge] STATUS phase=${payload.phase || 'CONNECTING'} → heartbeat:launch-done`);
            win.webContents.send('heartbeat:launch-done', {
              profile_id:       _currentProfileId,
              state:            payload.phase || 'CONNECTING',
              extension_loaded: false,
            });

            if (payload.catch_up_needed) {
              _logger.info(`[Bridge] REGISTER_ACK con catch_up_needed=true — iniciando poll catch-up (profileId=${_currentProfileId})`);
              log(`🔍 [Synapse Bridge] REGISTER_ACK — poll catch-up iniciado`);

              const CATCH_UP_INTERVAL_MS = 500;
              const CATCH_UP_MAX_RETRIES = 20;
              let _catchUpAttempt = 0;

              const _doCatchUpPoll = () => {
                if (_handshakeResolved || !_installBridge || !win || win.isDestroyed()) return;
                _catchUpAttempt++;
                executeNucleusCommand(['--json', 'synapse', 'status', _currentProfileId])
                  .then(statusResult => {
                    const state = statusResult.status?.state ?? statusResult.state ?? 'UNKNOWN';
                    _logger.info(
                      `[Bridge] Catch-up poll #${_catchUpAttempt}/${CATCH_UP_MAX_RETRIES}` +
                      ` — state=${state}` +
                      ` raw=${JSON.stringify(statusResult).slice(0, 120)}`
                    );
                    if (_handshakeResolved) return;
                    if (state === 'ONLINE') {
                      _resolveHandshake('catch-up-poll', {
                        _recovered:        true,
                        _catch_up_attempt: _catchUpAttempt,
                      });
                    } else if (_catchUpAttempt < CATCH_UP_MAX_RETRIES) {
                      _logger.info(`[Bridge] Catch-up #${_catchUpAttempt}: state=${state} — reintentando en ${CATCH_UP_INTERVAL_MS}ms`);
                      setTimeout(_doCatchUpPoll, CATCH_UP_INTERVAL_MS);
                    } else {
                      _logger.info(`[Bridge] Catch-up agotado (${CATCH_UP_MAX_RETRIES} intentos, last state=${state}) — esperando PROFILE_CONNECTED push`);
                      log(`🔍 [Synapse Bridge] Catch-up agotado — solo push puede resolver ahora`);
                    }
                  })
                  .catch(err => {
                    _logger.warn(`[Bridge] Catch-up poll #${_catchUpAttempt} error: ${err.message}`);
                    if (!_handshakeResolved && _catchUpAttempt < CATCH_UP_MAX_RETRIES) {
                      setTimeout(_doCatchUpPoll, CATCH_UP_INTERVAL_MS);
                    }
                  });
              };
              setTimeout(_doCatchUpPoll, 300);
            }
            break;

          // HANDSHAKE: PROFILE_CONNECTED del perfil activo → handshake real completo.
          // Brain lo emite cuando Cortex hace REGISTER_HOST y ProfileStateManager
          // setea el perfil como ONLINE. Es la señal canónica; catch-up es el fallback.
          case 'HANDSHAKE':
            _logger.info(`[Bridge] ✅ PROFILE_CONNECTED recibido → handshake completo (profileId=${_currentProfileId})`);
            _resolveHandshake('profile-connected-push');
            break;

          // ERROR de conexión TCP
          case 'ERROR':
            _logger.error(`[Bridge] Error TCP: ${payload.message}`);
            error(`❌ [Synapse Bridge] Error TCP: ${payload.message}`);
            break;

          // Otros eventos (HEARTBEAT, INTENT, ION, etc.) → ignorar en setup
          default:
            _logger.debug(`[Bridge] Evento ignorado en setup: type=${payload.type}`);
            break;
        }
      });

      // ── Callback que installer.js invoca después de seed, ANTES de launch ────
      // En este momento el profileId ya existe pero Chrome aún no arrancó.
      // Conectamos el bridge acá para que esté registrado como Sentinel antes
      // de que Cortex haga REGISTER_HOST y Brain emita PROFILE_CONNECTED.
      const onBeforeLaunch = (profileId) => {
        _currentProfileId = profileId;

        if (win && !win.isDestroyed()) {
          win.webContents.send('heartbeat:starting', { profile_id: profileId });
        }

        // Armar el timeout de 120s desde el momento del launch (no desde ahora)
        _handshakeTimeout = setTimeout(() => {
          if (!_installBridge) return;
          error(`❌ [Synapse Bridge] Timeout 120s — PROFILE_CONNECTED nunca llegó (${profileId})`);
          if (_installBridge) { _installBridge.destroy(); _installBridge = null; }
          if (win && !win.isDestroyed()) {
            win.webContents.send('installation-error', {
              error: `Timeout: el perfil no completó el handshake en 120 segundos.\nVerificá que la extensión Cortex esté instalada en Chrome.`,
            });
          }
        }, 120_000);

        log(`🔗 [Synapse Bridge] Conectando a Brain antes del launch — profileId: ${profileId}`);
        _logger.info(`[Bridge] connectToBrain → profileId=${profileId} launchId=null (pre-launch)`);
        _installBridge.connectToBrain(profileId, null);
      };

      // ── Lanzar instalación con el hook pre-launch ────────────────────────────
      const result = await installService(win, { onBeforeLaunch });

      return result;
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // ── Synapse status poll (usado por renderer como fallback y por el polling interno) ──
  ipcMain.handle('synapse:status-poll', async (event, profileId) => {
    try {
      const result = await executeNucleusCommand([
        '--json', 'synapse', 'status', profileId
      ]);
      // result esperado: { success, state, extension_loaded, chrome_pid, ... }
      return {
        success: result.success || false,
        state: result.state || 'UNKNOWN',
        extensionLoaded: result.extension_loaded || false,
        chromePid: result.chrome_pid || null,
        error: result.error || null
      };
    } catch (err) {
      return { success: false, state: 'ERROR', extensionLoaded: false, error: err.message };
    }
  });

  // ── Heartbeat / estado del sistema ──────────────────────────────────────
  ipcMain.handle('extension:heartbeat', async () => {
    try {
      const status = await checkHostStatus();
      return {
        success: true,
        chromeConnected: status.connected,
        port: status.port,
        profiles: status.profiles_registered,
        services: status.services
      };
    } catch (error) {
      return {
        success: false,
        chromeConnected: false,
        error: error.message
      };
    }
  });

  ipcMain.handle('check-brain-service-status', async () => {
    const status = await checkHostStatus();
    return {
      running: status.connected,
      registeredProfiles: status.profiles_registered || 0,
      activeClients: 0,
      services: status.services
    };
  });

  // ── Abrir conductor (workspace) post-instalación ─────────────────────────
  // El perfil ya fue lanzado por el installer en el paso 11/11.
  // Este handler solo abre la UI del conductor, no relanza el perfil.
  ipcMain.handle('launcher:open', async (event, options = {}) => {
    try {
      let workspaceExe = paths.workspaceExe;

      if (fs.existsSync(paths.configFile)) {
        const nucleusData = JSON.parse(fs.readFileSync(paths.configFile, 'utf8'));
        if (nucleusData?.system_map?.workspace_exe) {
          workspaceExe = nucleusData.system_map.workspace_exe;
        }
      }

      if (!fs.existsSync(workspaceExe)) {
        error(`❌ bloom-workspace not found: ${workspaceExe}`);
        return { success: false, error: `bloom-workspace not found: ${workspaceExe}` };
      }

      log(`🚀 [launcher:open] Spawning workspace: ${workspaceExe}`);

      const child = spawn(workspaceExe, [], {
        detached: true,
        stdio: 'ignore',
        windowsHide: false
      });
      child.unref();

      setTimeout(() => {
        log('👋 Closing installer after conductor spawn');
        app.quit();
      }, 1500);

      return { success: true };
    } catch (err) {
      error('❌ launcher:open failed:', err.message);
      return { success: false, error: err.message };
    }
  });

  // ── Checks y utilidades ──────────────────────────────────────────────────
  ipcMain.handle('install:check-requirements', async () => {
    return {
      platform: os.platform(),
      arch: os.arch(),
      hasSpace: true,
      canWrite: true
    };
  });

  ipcMain.handle('install:cleanup', async () => {
    try {
      const { cleanupOldServices } = require('./install/service-installer');
      await cleanupOldServices();
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('preflight-checks', async () => {
    const nucleusExe = path.join(BLOOM_BASE, 'bin', 'nucleus', 'nucleus.exe');

    return {
      nucleusExists: fs.existsSync(nucleusExe),
      brainExists: fs.existsSync(BRAIN_EXE),
      bloomBaseExists: fs.existsSync(BLOOM_BASE),
      platform: os.platform(),
      adminRights: false
    };
  });

  ipcMain.handle('repair-bridge', async (event) => {
    log('🔧 [IPC] repair-bridge called (delegating to Nucleus)');

    try {
      const result = await executeNucleusCommand(['--json', 'health', '--fix']);

      if (result.success) {
        log('✅ [IPC] Bridge repaired via Nucleus');
      } else {
        error('❌ [IPC] Bridge repair failed:', result.error);
      }

      return result;
    } catch (err) {
      error('❌ [IPC] repair-bridge error:', err.message);
      return {
        success: false,
        error: err.message,
        stack: err.stack
      };
    }
  });

  ipcMain.handle('validate-installation', async (event) => {
    log('🔍 [IPC] validate-installation called (delegating to Nucleus)');

    try {
      const result = await executeNucleusCommand(['--json', 'health', '--validate']);

      if (result.success) {
        log('✅ [IPC] Installation validated via Nucleus');
      } else {
        log('⚠️ [IPC] Installation incomplete');
      }

      return result;
    } catch (err) {
      error('❌ [IPC] validate-installation error:', err.message);
      return {
        success: false,
        error: err.message,
        checks: {}
      };
    }
  });
}

// ============================================================================
// WINDOW CREATION
// ============================================================================
async function isDevServerRunning() {
  return false;
}

async function checkOnboardingStatus() {
  try {
    if (!fs.existsSync(BRAIN_EXE)) return false;
    const result = await executeBrainCommand(['profile', 'status', '--json']);
    return result.data?.completed || false;
  } catch {
    return false;
  }
}

async function createWindow() {
  const win = new BrowserWindow({
    title: IS_LAUNCH_MODE ? 'Bloom Nucleus' : 'Bloom Nucleus Installer',
    width: IS_LAUNCH_MODE ? 1400 : 520,
    height: IS_LAUNCH_MODE ? 900 : 700,
    resizable: IS_LAUNCH_MODE ? true : false,
    alwaysOnTop: IS_LAUNCH_MODE ? false : true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      sandbox: false
    }
  });

  win.once('ready-to-show', () => {
    log('👁️ Window ready to show');
    win.show();
    if (!IS_LAUNCH_MODE) {
      win.setAlwaysOnTop(true, 'floating');
    }
  });

  if (IS_DEV) {
    win.webContents.openDevTools();
  }

  let targetUrl;
  let needsOnboarding = false;

  if (IS_LAUNCH_MODE) {
    const devServerAvailable = IS_DEV && (await isDevServerRunning());

    if (FORCE_ONBOARDING || !(await checkOnboardingStatus())) {
      needsOnboarding = true;

      if (devServerAvailable) {
        targetUrl = 'http://localhost:5173/onboarding';
        log('🔧 DEV MODE: Loading onboarding from Vite dev server');
      } else {
        targetUrl = 'file://' + WEBVIEW_BUILD_PATH.replace(/\\/g, '/') + '#/onboarding';
        log('📦 PROD MODE: Loading onboarding from build');
      }
    } else {
      if (devServerAvailable) {
        targetUrl = 'http://localhost:5173/';
        log('🔧 DEV MODE: Loading home from Vite dev server');
      } else {
        targetUrl = 'file://' + WEBVIEW_BUILD_PATH.replace(/\\/g, '/');
        log('📦 PROD MODE: Loading home from build');
      }
    }

    win.webContents.once('did-finish-load', () => {
      log('📄 Launch page loaded, sending initialization event...');

      setTimeout(() => {
        log('📨 Sending app:initialized event');
        win.webContents.send('app:initialized', {
          needsOnboarding,
          mode: 'launch',
          devMode: devServerAvailable,
          url: targetUrl
        });
      }, 100);
    });
  } else {
    if (!fs.existsSync(INSTALL_HTML_PATH)) {
      error('Install HTML not found:', INSTALL_HTML_PATH);
      targetUrl = 'data:text/html,' + encodeURIComponent(`
        <html>
          <body style="font-family: system-ui; padding: 40px; background: #0f0f0f; color: white;">
            <h1>⚠️ Installation Error</h1>
            <p>Install HTML not found at:</p>
            <code>${INSTALL_HTML_PATH}</code>
          </body>
        </html>
      `);
    } else {
      targetUrl = 'file://' + INSTALL_HTML_PATH.replace(/\\/g, '/');
      log('📦 INSTALL MODE: Loading installer UI from:', targetUrl);
    }

    win.webContents.once('did-finish-load', () => {
      log('📄 Install page loaded, initializing installer...');

      setTimeout(() => {
        log('📨 Sending app:initialized event');
        win.webContents.send('app:initialized', {
          mode: 'install',
          devMode: IS_DEV
        });
      }, 100);
    });
  }

  log('🚀 Loading URL:', targetUrl);

  try {
    await win.loadURL(targetUrl);
    log('✅ URL loaded successfully');
  } catch (err) {
    error('💥 Failed to load URL:', err.message);

    const errorHtml = `
      <html>
        <body style="font-family: system-ui; padding: 40px; background: #0f0f0f; color: white;">
          <h1>⚠️ Load Error</h1>
          <p>Failed to load: ${targetUrl}</p>
          <p>Error: ${err.message}</p>
          <button onclick="location.reload()">Retry</button>
        </body>
      </html>
    `;
    win.loadURL('data:text/html,' + encodeURIComponent(errorHtml));
  }

  return win;
}

// ============================================================================
// APP LIFECYCLE
// ============================================================================
let mainWindow = null;

app.whenReady().then(async () => {
  log('🚀 App ready, initializing...');

  if (!IS_LAUNCH_MODE && process.platform === 'win32') {
    const { isElevated, relaunchAsAdmin } = require('./core/admin-utils');
    if (!(await isElevated())) {
      log('⚠️ Admin privileges required - relaunching...');
      relaunchAsAdmin();
      return;
    }
    log('✅ Running with admin privileges');
  }

  registerSharedHandlers();
  registerNucleusHandlers();

  if (IS_LAUNCH_MODE) {
    registerLaunchHandlers();
  } else {
    registerInstallHandlers();
  }

  mainWindow = await createWindow();

  // ── Synapse Bridge handlers ──────────────────────────────────────────────
  // Expone synapse:seedAndLaunch y synapse:launch vía window.bloomSynapse.
  // En install mode permite que el renderer (o código futuro) dispare un
  // launch directamente desde la UI sin pasar por install:start.
  // El install:start crea su propio bridge con connectToBrain() — no hay conflicto.
  if (!IS_LAUNCH_MODE) {
    const { registerSynapseHandlers } = require('./ipc/setup-synapse-handlers');
    registerSynapseHandlers(() => mainWindow, {
      nucleusBinary: NUCLEUS_EXE,
      verbose:       IS_DEV,
    });
    log('🔗 Synapse handlers registered (setup mode)');
  }

  if (IS_LAUNCH_MODE) {
    log('💓 Starting heartbeat (Launch Mode)');
    startHeartbeat();
  } else {
    log('ℹ️ Heartbeat will start after installation completes (via Synapse Bridge)');
  }
});

app.on('activate', async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    log('🔄 Reactivating window...');
    mainWindow = await createWindow();

    if (IS_LAUNCH_MODE) {
      startHeartbeat();
    }
  }
});

app.on('window-all-closed', () => {
  stopHeartbeat();
  if (process.platform !== 'darwin') {
    log('👋 All windows closed, quitting...');
    app.quit();
  }
});

app.on('before-quit', () => {
  log('👋 Application closing...');
  stopHeartbeat();
  if (_installBridge) { _installBridge.destroy(); _installBridge = null; }
});

process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('error', {
      type: 'fatal',
      message: error.message,
      stack: error.stack
    });
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
});

} // end if (!IS_CLI_MODE)
