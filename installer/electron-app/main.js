// main.js - Versión corregida con handler IPC registrado ANTES de crear ventana

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const net = require('net');

const execAsync = promisify(exec);

// ============================================================================
// CONSTANTES Y RUTAS CRÍTICAS (CORREGIDAS PARA TU REPO)
// ============================================================================

const REPO_ROOT = path.join(__dirname, '..', '..'); // → C:/repos/bloom-videos/bloom-development-extension
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

console.log('🔍 Process arguments:', process.argv);
console.log('🔍 IS_DEV:', IS_DEV);
console.log('🔍 IS_LAUNCH_MODE:', IS_LAUNCH_MODE);

// ============================================================================
// IPC HANDLERS - REGISTRAR TODOS ANTES DE CREAR VENTANA
// ============================================================================
function registerIPCHandlers() {
  // Handler para resolver rutas de forma segura
  ipcMain.handle('path:resolve', (event, { type, args }) => {
    try {
      switch (type) {
        case 'join':
          return path.join(...args);
        case 'dirname':
          return path.dirname(args[0]);
        case 'basename':
          return path.basename(args[0]);
        case 'webview-build':
          return WEBVIEW_BUILD_PATH; // Ruta pre-calculada para webview build
        default:
          throw new Error(`Tipo de ruta desconocido: ${type}`);
      }
    } catch (err) {
      error('Error resolviendo ruta:', err.message);
      return null;
    }
  });
  
  // Agrega otros handlers si tenías (shared, install, launch)
  // Por ejemplo:
  ipcMain.handle('health:check', async () => {
    // Lógica de health check aquí
    return { status: 'ok', checks: { websocket: true } }; // Placeholder
  });
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
      `python "${BRAIN_PY_PATH}" health onboarding-check --json`,
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
      webSecurity: false,  // Necesario para cargar file:// locales en iframe
      sandbox: false  // Desactiva sandbox para permitir preload completo (usa solo en dev si es necesario)
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
  
  // CRÍTICO: Registrar handlers ANTES de crear ventana
  registerIPCHandlers();
  
  await createWindow();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});