// main.js - FIXED: Event flow + Direct URL loading + TCP port check

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const net = require('net');

const execAsync = promisify(exec);

// ============================================================================
// CONSTANTES Y RUTAS
// ============================================================================

const REPO_ROOT = path.join(__dirname, '..', '..');
const BRAIN_PY_PATH = path.join(REPO_ROOT, 'brain', 'brain.py');
const WEBVIEW_BUILD_PATH = path.join(REPO_ROOT, 'webview', 'app', 'build', 'index.html');

const IS_DEV = process.argv.includes('--dev') || process.env.NODE_ENV === 'development';
const IS_LAUNCH_MODE = process.argv.includes('--mode=launch');
const FORCE_ONBOARDING = process.argv.includes('--onboarding');

// ============================================================================
// LOGGING
// ============================================================================
function log(...args) {
  console.log('🌸 [MAIN]', ...args);
}
function error(...args) {
  console.error('❌ [MAIN]', ...args);
}

log('📋 Args:', process.argv);
log('📋 IS_DEV:', IS_DEV, '| IS_LAUNCH_MODE:', IS_LAUNCH_MODE, '| FORCE_ONBOARDING:', FORCE_ONBOARDING);

// ============================================================================
// TCP PORT CHECK (ROBUST)
// ============================================================================
function checkPortOpen(port, host = 'localhost', timeout = 2000) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host }, () => {
      socket.destroy();
      log(`✅ Port ${port} OPEN on ${host}`);
      resolve(true);
    });

    socket.setTimeout(timeout);
    socket.on('timeout', () => {
      socket.destroy();
      log(`⏱️ Port ${port} timeout`);
      resolve(false);
    });
    socket.on('error', () => {
      resolve(false);
    });
  });
}

// ============================================================================
// IPC HANDLERS - REGISTER FIRST (BEFORE WINDOW CREATION)
// ============================================================================
function registerIPCHandlers() {
  log('🔧 Registering IPC handlers...');

  ipcMain.handle('path:resolve', (event, { type, args }) => {
    try {
      switch (type) {
        case 'join':
          return path.join(...args);
        case 'webview-build':
          return WEBVIEW_BUILD_PATH;
        default:
          throw new Error(`Unknown path type: ${type}`);
      }
    } catch (err) {
      error('Path resolve error:', err.message);
      return null;
    }
  });

  ipcMain.handle('port:check', async (event, { port, host = 'localhost' }) => {
    log(`🔍 Checking port ${port}...`);
    const isOpen = await checkPortOpen(port, host);
    log(`Port ${port}: ${isOpen ? '✅ OPEN' : '❌ CLOSED'}`);
    return isOpen;
  });

  ipcMain.handle('health:check', async () => {
    return { status: 'ok', checks: { websocket: true } };
  });

  log('✅ IPC handlers registered');
}

// ============================================================================
// ONBOARDING CHECK
// ============================================================================
async function checkOnboardingStatus() {
  if (!require('fs').existsSync(BRAIN_PY_PATH)) {
    error('brain.py not found:', BRAIN_PY_PATH);
    return false;
  }

  try {
    const { stdout } = await execAsync(
      `python "${BRAIN_PY_PATH}" health onboarding-status --json`,
      { cwd: REPO_ROOT, timeout: 15000, windowsHide: true }
    );

    const result = JSON.parse(stdout);
    const ready = result.status === 'success' && result.data?.ready === true;
    log('🔍 Onboarding status:', ready ? '✅ Complete' : '❌ Incomplete');
    return ready;
  } catch (err) {
    error('Onboarding check failed:', err.message);
    return false;
  }
}

// ============================================================================
// DEV SERVER CHECK
// ============================================================================
async function isDevServerRunning() {
  const isRunning = await checkPortOpen(5173, 'localhost', 1000);
  log('Dev server (5173):', isRunning ? '✅ Running' : '❌ Not running');
  return isRunning;
}

// ============================================================================
// CREATE WINDOW - LOAD URL DIRECTLY (NO IFRAME)
// ============================================================================
async function createWindow() {
  log('🪟 Creating window...');

  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true, // Re-enable for security (file:// works now)
      sandbox: false
    }
  });

  win.once('ready-to-show', () => {
    log('👁️ Window ready to show');
    win.show();
  });

  // Open DevTools in dev mode
  if (IS_DEV) {
    win.webContents.openDevTools();
  }

  // ==========================================================================
  // CRITICAL: DETERMINE URL BASED ON MODE
  // ==========================================================================
  
  let targetUrl;
  let needsOnboarding = false;

  // Check if dev server is running
  const devServerAvailable = IS_DEV && await isDevServerRunning();

  if (FORCE_ONBOARDING || (IS_LAUNCH_MODE && !(await checkOnboardingStatus()))) {
    needsOnboarding = true;
    
    if (devServerAvailable) {
      targetUrl = 'http://localhost:5173/onboarding';
      log('🔧 DEV MODE: Loading onboarding from Vite dev server');
    } else {
      targetUrl = 'file://' + WEBVIEW_BUILD_PATH.replace(/\\/g, '/') + '#/onboarding';
      log('📦 PROD MODE: Loading onboarding from build');
    }
  } else {
    // Normal launch mode (dashboard)
    if (devServerAvailable) {
      targetUrl = 'http://localhost:5173/';
      log('🔧 DEV MODE: Loading home from Vite dev server');
    } else {
      targetUrl = 'file://' + WEBVIEW_BUILD_PATH.replace(/\\/g, '/');
      log('📦 PROD MODE: Loading home from build');
    }
  }

  // ==========================================================================
  // LOAD URL
  // ==========================================================================
  
  log('🚀 Loading URL:', targetUrl);
  
  try {
    await win.loadURL(targetUrl);
    log('✅ URL loaded successfully');
  } catch (err) {
    error('💥 Failed to load URL:', err.message);
    
    // Fallback: try to load error page or retry
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

  // ==========================================================================
  // SEND INITIALIZATION EVENT AFTER PAGE LOADS
  // ==========================================================================
  
  win.webContents.once('did-finish-load', () => {
    log('📄 Page did-finish-load');
    
    // Give renderer time to setup listeners
    setTimeout(() => {
      log('📤 Sending app:initialized event');
      win.webContents.send('app:initialized', {
        needsOnboarding,
        mode: IS_LAUNCH_MODE ? 'launch' : 'install',
        devMode: devServerAvailable,
        url: targetUrl
      });
    }, 100);
  });

  return win;
}

// ============================================================================
// APP READY
// ============================================================================
app.whenReady().then(async () => {
  log('🚀 App ready, initializing...');
  
  // CRITICAL: Register handlers BEFORE creating window
  registerIPCHandlers();
  
  await createWindow();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    log('👋 Quitting app');
    app.quit();
  }
});