// main.js - REFACTORED: Sentinel Delegation
// Heartbeat: sentinel health --json
// Launch: sentinel launch [profile_id]
// Repair: sentinel repair bridge
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

const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');

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
    return path.join(homeDir, 'Library', 'Application Support', 'BloomNucleus');
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

function getSentinelExecutablePath() {
  const bloomBase = getBloomBasePath();
  if (isWindows) {
    return path.join(bloomBase, 'bin', 'sentinel', 'sentinel.exe');
  } else {
    return path.join(bloomBase, 'bin', 'sentinel', 'sentinel');
  }
}

function getBrainWorkingDirectory() {
  return path.dirname(getBrainExecutablePath());
}

function getSentinelWorkingDirectory() {
  return path.dirname(getSentinelExecutablePath());
}

const BLOOM_BASE = getBloomBasePath();
const BRAIN_EXE = getBrainExecutablePath();
const SENTINEL_EXE = getSentinelExecutablePath();
const WEBVIEW_BUILD_PATH = path.join(REPO_ROOT, 'webview', 'app', 'build', 'index.html');
const INSTALL_HTML_PATH = path.join(__dirname, 'src', 'index.html');

// ============================================================================
// LOGGING
// ============================================================================
function safeLog(emoji, ...args) {
  const prefix = useEmojis ? emoji : `[${getEmojiName(emoji)}]`;
  console.log(prefix, ...args);
}

function getEmojiName(emoji) {
  const map = {
    '🌸': 'BLOOM', '🚀': 'LAUNCH', '✅': 'OK', '❌': 'ERROR',
    '🔧': 'DEV', '📋': 'INFO', '⚠️': 'WARN', '🔍': 'DEBUG',
    '🔗': 'URL', '📄': 'NAV', '📨': 'EVENT', '📦': 'PROD',
    '🪟': 'WINDOW', '💥': 'FATAL', '👋': 'QUIT', '🔄': 'RELOAD',
    '💓': 'HEARTBEAT', '🏥': 'HEALTH', '📍': 'PING', '🤖': 'SENTINEL'
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
║ Heartbeat: Sentinel Health ║
╚═══════════════════════════════════════╝
`);

if (IS_DEV) {
  safeLog('🔧', 'CLI Arguments:', process.argv.slice(2));
}

log('📋 Paths:');
log(' - BLOOM_BASE:', BLOOM_BASE);
log(' - SENTINEL_EXE:', SENTINEL_EXE);
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
// SENTINEL COMMAND EXECUTION
// ============================================================================
async function executeSentinelCommand(args) {
  return new Promise((resolve, reject) => {
    const sentinelPath = getSentinelExecutablePath();

    if (!fs.existsSync(sentinelPath)) {
      return reject(new Error(`Sentinel not found: ${sentinelPath}`));
    }

    const child = spawn(sentinelPath, args, {
      cwd: getSentinelWorkingDirectory(),
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
        if (stderr) console.error('[Sentinel CLI] stderr:', stderr);
        reject(new Error(`Failed to parse JSON: ${e.message}`));
      }
    });

    child.on('error', (err) => reject(err));

    setTimeout(() => {
      if (!child.killed) {
        child.kill();
        reject(new Error('Sentinel command timeout'));
      }
    }, 30000);
  });
}

// ============================================================================
// HEARTBEAT IMPLEMENTATION (Sentinel)
// ============================================================================
async function checkHostStatus() {
  try {
    const result = await executeSentinelCommand(['--json', 'health']);

    return {
      connected: result.connected || false,
      port: result.port || null,
      services: result.services || {},
      profiles_registered: result.profiles_registered || 0,
      error: result.error
    };
  } catch (error) {
    return {
      connected: false,
      port: null,
      services: {},
      profiles_registered: 0,
      error: error.message
    };
  }
}

function startHeartbeat() {
  if (heartbeatTimer) {
    log('⚠️ Heartbeat already running');
    return;
  }

  log('💓 Starting heartbeat polling via Sentinel...');
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
// BRAIN COMMAND EXECUTION (Keep for backwards compatibility)
// ============================================================================
async function executeBrainCommand(args) {
  return new Promise((resolve, reject) => {
    const brainPath = getBrainExecutablePath();
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
      sentinelExe: SENTINEL_EXE
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
// IPC HANDLERS - SENTINEL
// ============================================================================
function registerSentinelHandlers() {
  log('🤖 Registering Sentinel handlers...');

  ipcMain.handle('sentinel:health', async () => {
    try {
      return await executeSentinelCommand(['--json', 'health']);
    } catch (error) {
      return { connected: false, error: error.message };
    }
  });

  ipcMain.handle('sentinel:validate', async () => {
    try {
      return await executeSentinelCommand(['--json', 'health', '--validate']);
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('sentinel:repair-bridge', async () => {
    try {
      return await executeSentinelCommand(['--json', 'repair', 'bridge']);
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('sentinel:launch', async (event, profileId) => {
    try {
      if (!profileId) {
        return { success: false, error: 'Profile ID is required' };
      }
      return await executeSentinelCommand(['--json', 'launch', profileId]);
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('sentinel:dev-start', async () => {
    try {
      return await executeSentinelCommand(['dev-start', '--json']);
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  log('✅ Sentinel handlers registered');
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
      sentinelExe: SENTINEL_EXE,
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
  ipcMain.handle('install:start', async (event, options = {}) => {
    try {
      log('🚀 Starting installation...');

      const { runFullInstallation } = require('./install/installer');
      const result = await runFullInstallation(BrowserWindow.getAllWindows()[0]);

      if (result.success) {
        log('✅ Installation completed successfully');

        setTimeout(() => {
          log('💓 Starting heartbeat after installation');
          startHeartbeat();
        }, 2000);
      }

      return result;
    } catch (error) {
      console.error('❌ Installation failed:', error.message);
      return {
        success: false,
        error: error.message,
        stack: error.stack
      };
    }
  });

  ipcMain.handle('brain:launch', async (event, profileIdOrObject) => {
    try {
      let profileId;

      if (typeof profileIdOrObject === 'string') {
        profileId = profileIdOrObject;
      } else if (typeof profileIdOrObject === 'object' && profileIdOrObject !== null) {
        profileId = profileIdOrObject.profileId
                 || profileIdOrObject.id
                 || profileIdOrObject.uuid
                 || profileIdOrObject.data?.id
                 || profileIdOrObject.data?.profileId;
      }

      log(`🚀 [MAIN] Launching profile via Sentinel: ${profileId}`);

      if (!profileId || profileId === 'undefined' || profileId === 'null') {
        const errorMsg = `Profile ID is missing or invalid. Received: ${JSON.stringify(profileIdOrObject)}`;
        error(`❌ ${errorMsg}`);
        return {
          success: false,
          error: errorMsg,
          received: profileIdOrObject
        };
      }

      const result = await executeSentinelCommand(['launch', profileId, '--json']);

      log("✅ Profile launched via Sentinel:", result);
      return result;
    } catch (err) {
      error("❌ Launch error:", err.message);
      return {
        success: false,
        error: err.message,
        stack: err.stack
      };
    }
  });

  ipcMain.handle('extension:heartbeat', async () => {
    try {
      const status = await checkHostStatus();

      return {
        success: true,
        chromeConnected: status.connected,
        port: status.port,
        profiles: status.profiles_registered
      };
    } catch (error) {
      return {
        success: false,
        chromeConnected: false,
        error: error.message
      };
    }
  });

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

  ipcMain.handle('check-brain-service-status', async () => {
    const status = await checkHostStatus();
    return {
      running: status.connected,
      registeredProfiles: status.profiles_registered || 0,
      activeClients: 0,
      services: status.services
    };
  });

  ipcMain.handle('preflight-checks', async () => {
    const checks = {
      brainExists: fs.existsSync(BRAIN_EXE),
      sentinelExists: fs.existsSync(SENTINEL_EXE),
      bloomBaseExists: fs.existsSync(BLOOM_BASE),
      platform: os.platform(),
      adminRights: false
    };

    return checks;
  });

  ipcMain.handle('repair-bridge', async (event) => {
    log('🔧 [IPC] repair-bridge called (delegating to Sentinel)');

    try {
      const result = await executeSentinelCommand(['repair', 'bridge', '--json']);

      if (result.success) {
        log('✅ [IPC] Bridge repaired via Sentinel:', result.data?.extension_id);
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
    log('🔍 [IPC] validate-installation called (delegating to Sentinel)');

    try {
      const result = await executeSentinelCommand(['health', '--validate', '--json']);

      if (result.success) {
        log('✅ [IPC] Installation validated via Sentinel');
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
  return false; // ← implement real check if needed (fetch + timeout)
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
    width: IS_LAUNCH_MODE ? 1400 : 1000,
    height: IS_LAUNCH_MODE ? 900 : 700,
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

  // Check admin SOLO en modo INSTALL
  if (!IS_LAUNCH_MODE && process.platform === 'win32') {
    const { isElevated, relaunchAsAdmin } = require('./core/admin-utils');
    if (!(await isElevated())) {
      log('⚠️ Admin privileges required - relaunching...');
      relaunchAsAdmin();
      return; // Salir sin crear ventana
    }
    log('✅ Running with admin privileges');
  }

  registerSharedHandlers();
  registerSentinelHandlers();

  if (IS_LAUNCH_MODE) {
    registerLaunchHandlers();
  } else {
    registerInstallHandlers();
  }

  mainWindow = await createWindow();

  if (IS_LAUNCH_MODE) {
    log('💓 Starting heartbeat (Launch Mode)');
    startHeartbeat();
  } else {
    log('ℹ️ Heartbeat will start after installation completes');
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