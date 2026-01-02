// main.js - Versión corregida 100% para tu estructura de carpetas

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const net = require('net');

const execAsync = promisify(exec);

// ============================================================================
// CONSTANTES Y RUTAS CRÍTICAS (CORREGIDAS PARA TU REPO)
// ============================================================================

const REPO_ROOT = path.join(__dirname, '..', '..', '..'); // → C:/repos/bloom-videos/bloom-development-extension
const BRAIN_PY_PATH = path.join(REPO_ROOT, 'brain', 'brain.py');
const LAUNCH_HTML_PATH = path.join(__dirname, 'src', 'launch', 'index_launch.html');
const WEBVIEW_BUILD_PATH = path.join(REPO_ROOT, 'webview', 'app', 'build', 'index.html');

const IS_DEV = process.argv.includes('--dev') || process.env.NODE_ENV === 'development';
const IS_LAUNCH_MODE = process.argv.includes('--mode=launch');

// ============================================================================
// LOGGING SIMPLE
// ============================================================================
function log(...args) {
  console.log('🌸', ...args);
}
function error(...args) {
  console.error('❌', ...args);
}

// ============================================================================
// ONBOARDING CHECK - RUTA CORRECTA A BRAIN.PY
// ============================================================================
async function checkOnboardingStatus() {
  if (!require('fs').existsSync(BRAIN_PY_PATH)) {
    error('brain.py no encontrado en:', BRAIN_PY_PATH);
    return false;
  }

  try {
    const { stdout } = await execAsync(
      `"${process.execPath.includes('python') ? 'python' : 'python'}" "${BRAIN_PY_PATH}" health onboarding-check --json`,
      {
        cwd: REPO_ROOT,
        timeout: 15000,
        windowsHide: true
      }
    );

    const result = JSON.parse(stdout);
    return result.status === 'success' && result.data?.ready === true;
  } catch (err) {
    error('Onboarding check falló:', err.message);
    return false;
  }
}

// ============================================================================
// DEV SERVER CHECK
// ============================================================================
async function isDevServerRunning() {
  return new Promise((resolve) => {
    const socket = net.createConnection(5173, 'localhost', () => {
      socket.destroy();
      resolve(true);
    });
    socket.setTimeout(2000);
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('error', () => resolve(false));
  });
}

// ============================================================================
// CREAR VENTANA
// ============================================================================
async function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false  // Necesario para cargar file:// locales en iframe
    }
  });

  win.once('ready-to-show', () => win.show());

  // ==========================================================================
  // DECIDIR QUÉ CARGAR
  // ==========================================================================
  let loadUrl;

  if (IS_DEV && await isDevServerRunning()) {
    loadUrl = 'http://localhost:5173';
    log('🔧 Modo DEV: Cargando desde http://localhost:5173');
  } else {
    const fullPath = 'file://' + LAUNCH_HTML_PATH.replace(/\\/g, '/');
    loadUrl = fullPath;
    log('📄 Modo PROD: Cargando', fullPath);
  }

  try {
    await win.loadURL(loadUrl);
    log('✅ Página cargada:', loadUrl);
  } catch (err) {
    error('💥 Falló al cargar URL:', loadUrl, err.message);
  }

  // ==========================================================================
  // ONBOARDING LOGIC
  // ==========================================================================
  win.webContents.once('did-finish-load', async () => {
    const needsOnboarding = IS_LAUNCH_MODE && !(await checkOnboardingStatus());

    win.webContents.send('app:initialized', {
      needsOnboarding,
      mode: IS_LAUNCH_MODE ? 'launch' : 'install'
    });

    if (needsOnboarding) {
      log('📨 Enviando evento: show-onboarding');
      win.webContents.send('show-onboarding');
    }
  });

  return win;
}

// ============================================================================
// APP READY
// ============================================================================
app.whenReady().then(async () => {
  log('App ready, inicializando...');
  await createWindow();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) await createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});