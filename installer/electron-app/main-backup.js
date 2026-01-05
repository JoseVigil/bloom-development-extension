const { app } = require('electron');
const { APP_VERSION, IS_DEV, IS_LAUNCH_MODE } = require('./config/constants');
const { createMainWindow } = require('./core/window-manager');
const { isElevated, relaunchAsAdmin } = require('./core/admin-utils');
const { setupInstallHandlers } = require('./ipc/install-handlers');
const { setupLaunchHandlers } = require('./ipc/launch-handlers');
const { setupSharedHandlers } = require('./ipc/shared-handlers');
const { runInstallMode } = require('./install/installer');
const { runLaunchMode } = require('./launch/launcher');

// ============================================================================
// ENHANCED LOGGING FOR DEVELOPMENT
// ============================================================================
const isWindows = process.platform === 'win32';
const useEmojis = !isWindows || process.env.FORCE_EMOJIS === 'true';

function safeLog(emoji, ...args) {
  const prefix = useEmojis ? emoji : `[${getEmojiName(emoji)}]`;
  console.log(prefix, ...args);
}

function getEmojiName(emoji) {
  const map = {
    '🌸': 'BLOOM',
    '🚀': 'LAUNCH',
    '✅': 'OK',
    '❌': 'ERROR',
    '🔧': 'DEV',
    '📋': 'INFO',
    '⚠️': 'WARN',
    '🔍': 'DEBUG',
    '📍': 'URL',
    '🔄': 'NAV',
    '📨': 'EVENT'
  };
  return map[emoji] || 'LOG';
}

// ============================================================================
// STARTUP BANNER
// ============================================================================
console.log(`
╔═══════════════════════════════════════════╗
║ 🌸 BLOOM NUCLEUS ${IS_LAUNCH_MODE ? 'LAUNCHER' : 'INSTALLER'} ║
║ Mode: ${IS_LAUNCH_MODE ? 'LAUNCH' : 'INSTALL'} ║
║ Version: ${APP_VERSION} ║
║ Environment: ${IS_DEV ? 'DEVELOPMENT' : 'PRODUCTION'} ║
║ Packaged: ${app.isPackaged ? 'YES' : 'NO'} ║
╚═══════════════════════════════════════════╝
`);

// Mostrar argumentos de línea de comando en desarrollo
if (IS_DEV) {
  safeLog('🔧', 'CLI Arguments:', process.argv.slice(2));
}

// ============================================================================
// GLOBAL STATE
// ============================================================================
let mainWindow = null;

// ============================================================================
// APP LIFECYCLE
// ============================================================================
app.whenReady().then(async () => {
  safeLog('🚀', 'App ready, initializing...');

  // Crear ventana principal
  mainWindow = createMainWindow(IS_LAUNCH_MODE);

  // ✅ CRÍTICO: Configurar handlers IPC - AMBOS MODOS SIEMPRE
  setupSharedHandlers();
  setupInstallHandlers();
  setupLaunchHandlers(); // ⬅️ FIX CRÍTICO: Siempre registrado

  // ============================================================================
  // URL TRACKING & LOGGING (DESARROLLO)
  // ============================================================================
  if (IS_DEV) {
    // Log URL inicial
    mainWindow.webContents.once('did-finish-load', () => {
      const currentURL = mainWindow.webContents.getURL();
      safeLog('📍', 'Initial URL loaded:', currentURL);
    });

    // Track todas las navegaciones
    mainWindow.webContents.on('did-navigate', (event, url) => {
      safeLog('🔄', 'Page navigated to:', url);
    });

    mainWindow.webContents.on('did-navigate-in-page', (event, url, isMainFrame) => {
      if (isMainFrame) {
        safeLog('🔄', 'In-page navigation:', url);
      }
    });

    // Log cuando la página termina de cargar
    mainWindow.webContents.on('did-finish-load', () => {
      const url = mainWindow.webContents.getURL();
      safeLog('✅', 'Page fully loaded:', url);
    });

    // Capturar errores de carga
    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
      safeLog('❌', 'Failed to load:', validatedURL, `(${errorDescription})`);
    });

    // Capturar logs del renderer (console.log desde el HTML/JS)
    mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
      const levels = ['LOG', 'WARN', 'ERROR'];
      const emoji = ['📋', '⚠️', '❌'][level];
      safeLog(emoji, `[RENDERER:${levels[level]}]`, message, `(${sourceId}:${line})`);
    });

    // Log cuando se abre DevTools
    mainWindow.webContents.on('devtools-opened', () => {
      safeLog('🔧', 'DevTools opened');
    });
  }

  // ============================================================================
  // MODE-SPECIFIC INITIALIZATION
  // ============================================================================
  if (IS_LAUNCH_MODE) {
    safeLog('🚀', 'Running in LAUNCH mode...');
    
    // Modo Launch: ejecutar dashboard
    mainWindow.webContents.once('did-finish-load', () => {
      runLaunchMode(mainWindow);
      
      // Si hay flag --onboarding en los args
      if (process.argv.includes('--onboarding')) {
        safeLog('📨', 'Sending onboarding event to renderer...');
        mainWindow.webContents.send('show-onboarding');
      }
    });
  } else {
    safeLog('📦', 'Running in INSTALL mode...');
  }

  app.on('activate', () => {
    if (require('electron').BrowserWindow.getAllWindows().length === 0) {
      safeLog('🔄', 'Reactivating window...');
      mainWindow = createMainWindow(IS_LAUNCH_MODE);
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    safeLog('👋', 'All windows closed, quitting...');
    app.quit();
  }
});

app.on('before-quit', () => {
  safeLog('👋', 'Application closing...');
});

// ============================================================================
// ERROR HANDLING
// ============================================================================
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