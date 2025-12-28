const { app } = require('electron');
const { APP_VERSION, IS_DEV, IS_LAUNCH_MODE } = require('./config/constants');
const { createMainWindow } = require('./core/window-manager');
const { isElevated, relaunchAsAdmin } = require('./core/admin-utils');
const { setupInstallHandlers } = require('./ipc/install-handlers');
const { setupLaunchHandlers } = require('./ipc/launch-handlers');
const { setupSharedHandlers } = require('./ipc/shared-handlers');
const { runInstallMode } = require('./install/installer');
const { runLaunchMode } = require('./launch/launcher');

console.log(`
╔═══════════════════════════════════════════╗
║ 🌸 BLOOM NUCLEUS ${IS_LAUNCH_MODE ? 'LAUNCHER' : 'INSTALLER'} ║
║ Mode: ${IS_LAUNCH_MODE ? 'LAUNCH' : 'INSTALL'} ║
║ Version: ${APP_VERSION} ║
╚═══════════════════════════════════════════╝
`);

// ============================================================================
// GLOBAL STATE
// ============================================================================
let mainWindow = null;

// ============================================================================
// APP LIFECYCLE
// ============================================================================
app.whenReady().then(async () => {
  // Crear ventana principal
  mainWindow = createMainWindow(IS_LAUNCH_MODE);

  // Configurar handlers IPC compartidos
  setupSharedHandlers();

  if (IS_LAUNCH_MODE) {
    // Modo Launch: configurar handlers y ejecutar dashboard
    setupLaunchHandlers();
    
    mainWindow.webContents.once('did-finish-load', () => {
      runLaunchMode(mainWindow);
    });
  } else {
    // Modo Install: configurar handlers
    setupInstallHandlers();
  }

  app.on('activate', () => {
    if (require('electron').BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow(IS_LAUNCH_MODE);
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  console.log('👋 Application closing...');
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