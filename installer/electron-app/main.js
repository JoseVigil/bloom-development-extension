const { app } = require('electron');
const { APP_VERSION, IS_DEV, IS_LAUNCH_MODE } = require('./config/constants');
const { createMainWindow } = require('./core/window-manager');
const { setupInstallHandlers } = require('./ipc/install-handlers');
const { setupLaunchHandlers } = require('./ipc/launch-handlers');
const { setupSharedHandlers } = require('./ipc/shared-handlers');
const { runInstallMode } = require('./install/installer');
const { runLaunchMode } = require('./launch/launcher');
const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');

const execAsync = promisify(exec);

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
    '🔗': 'URL',
    '📄': 'NAV',
    '📨': 'EVENT'
  };
  return map[emoji] || 'LOG';
}

// ============================================================================
// ONBOARDING STATUS CHECK
// ============================================================================
async function checkOnboardingStatus() {
  try {
    safeLog('🔍', 'Checking onboarding status...');
    
    // Call brain CLI to check onboarding status
    const brainPath = path.join(__dirname, 'brain', 'brain.py');
    const { stdout } = await execAsync(`python "${brainPath}" onboarding status --json`);
    
    const status = JSON.parse(stdout);
    safeLog('📋', 'Onboarding status:', status);
    
    return status.completed || false;
  } catch (error) {
    safeLog('⚠️', 'Error checking onboarding status:', error.message);
    // If we can't check, assume onboarding is needed
    return false;
  }
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

if (IS_DEV) {
  safeLog('🔧', 'CLI Arguments:', process.argv.slice(2));
}

// ============================================================================
// GLOBAL STATE
// ============================================================================
let mainWindow = null;
let needsOnboarding = false;

// ============================================================================
// APP LIFECYCLE
// ============================================================================
app.whenReady().then(async () => {
  safeLog('🚀', 'App ready, initializing...');

  // ============================================================================
  // CRITICAL: Check onboarding status BEFORE creating window
  // ============================================================================
  const forceOnboarding = process.argv.includes('--onboarding');
  
  if (IS_LAUNCH_MODE) {
    needsOnboarding = forceOnboarding || !(await checkOnboardingStatus());
    
    if (needsOnboarding) {
      safeLog('📨', 'Onboarding required - will load onboarding flow');
    } else {
      safeLog('✅', 'Onboarding completed - loading dashboard');
    }
  }

  // Create main window
  mainWindow = createMainWindow(IS_LAUNCH_MODE);

  // Setup IPC handlers - BOTH MODES ALWAYS
  setupSharedHandlers();
  setupInstallHandlers();
  setupLaunchHandlers();

  // ============================================================================
  // URL TRACKING & LOGGING (DEVELOPMENT)
  // ============================================================================
  if (IS_DEV) {
    mainWindow.webContents.once('did-finish-load', () => {
      const currentURL = mainWindow.webContents.getURL();
      safeLog('🔗', 'Initial URL loaded:', currentURL);
    });

    mainWindow.webContents.on('did-navigate', (event, url) => {
      safeLog('📄', 'Page navigated to:', url);
    });

    mainWindow.webContents.on('did-navigate-in-page', (event, url, isMainFrame) => {
      if (isMainFrame) {
        safeLog('📄', 'In-page navigation:', url);
      }
    });

    mainWindow.webContents.on('did-finish-load', () => {
      const url = mainWindow.webContents.getURL();
      safeLog('✅', 'Page fully loaded:', url);
    });

    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
      safeLog('❌', 'Failed to load:', validatedURL, `(${errorDescription})`);
    });

    mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
      const levels = ['LOG', 'WARN', 'ERROR'];
      const emoji = ['📋', '⚠️', '❌'][level];
      safeLog(emoji, `[RENDERER:${levels[level]}]`, message, `(${sourceId}:${line})`);
    });

    mainWindow.webContents.on('devtools-opened', () => {
      safeLog('🔧', 'DevTools opened');
    });
  }

  // ============================================================================
  // MODE-SPECIFIC INITIALIZATION
  // ============================================================================
  if (IS_LAUNCH_MODE) {
    safeLog('🚀', 'Running in LAUNCH mode...');
    
    mainWindow.webContents.once('did-finish-load', () => {
      // CRITICAL: Send onboarding state to renderer
      mainWindow.webContents.send('app:initialized', {
        needsOnboarding,
        mode: 'launch'
      });
      
      if (needsOnboarding) {
        safeLog('📨', 'Sending show-onboarding event to renderer...');
        mainWindow.webContents.send('show-onboarding');
      } else {
        // Only run launch mode (health checks) if onboarding is complete
        safeLog('✅', 'Starting dashboard with health monitoring...');
        runLaunchMode(mainWindow);
      }
    });
  } else {
    safeLog('📦', 'Running in INSTALL mode...');
    // Install mode doesn't need onboarding check
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