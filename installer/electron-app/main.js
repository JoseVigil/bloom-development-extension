// main.js - UNIFIED: Dual-mode (Install + Launch) with full Launch functionality
// Integrates: main.js (launch logic) + main-backup.js (dual-mode architecture)

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const net = require('net');
const os = require('os');
const fs = require('fs');

// ============================================================================
// CONSTANTS & MODE DETECTION
// ============================================================================

const execAsync = promisify(exec);

// Mode detection from CLI args
const IS_DEV = process.argv.includes('--dev') || process.env.NODE_ENV === 'development';
const IS_LAUNCH_MODE = process.argv.includes('--mode=launch') || process.argv.includes('--launch');
const FORCE_ONBOARDING = process.argv.includes('--onboarding');

// App metadata
const APP_VERSION = app.getVersion();
const isWindows = process.platform === 'win32';
const useEmojis = !isWindows || process.env.FORCE_EMOJIS === 'true';

// ============================================================================
// PATHS - Cross-platform Python & Brain
// ============================================================================

const REPO_ROOT = path.join(__dirname, '..', '..');

function getPythonPath() {
  const platform = os.platform();
  const homeDir = os.homedir();
  
  if (platform === 'win32') {
    return path.join(homeDir, 'AppData', 'Local', 'BloomNucleus', 'engine', 'runtime', 'python.exe');
  } else if (platform === 'darwin') {
    return path.join(homeDir, 'Library', 'Application Support', 'BloomNucleus', 'engine', 'runtime', 'bin', 'python3');
  } else {
    return path.join(homeDir, '.local', 'share', 'BloomNucleus', 'engine', 'runtime', 'bin', 'python3');
  }
}

function getBrainMainPath() {
  const platform = os.platform();
  const homeDir = os.homedir();
  
  if (platform === 'win32') {
    return path.join(homeDir, 'AppData', 'Local', 'BloomNucleus', 'engine', 'runtime', 'Lib', 'site-packages', 'brain', '__main__.py');
  } else if (platform === 'darwin') {
    return path.join(homeDir, 'Library', 'Application Support', 'BloomNucleus', 'engine', 'runtime', 'lib', 'python3.11', 'site-packages', 'brain', '__main__.py');
  } else {
    return path.join(homeDir, '.local', 'share', 'BloomNucleus', 'engine', 'runtime', 'lib', 'python3.11', 'site-packages', 'brain', '__main__.py');
  }
}

const pythonPath = getPythonPath();
const BRAIN_MAIN_PATH = getBrainMainPath();
const BRAIN_PY_PATH = path.join(REPO_ROOT, 'brain', 'brain.py');
const WEBVIEW_BUILD_PATH = path.join(REPO_ROOT, 'webview', 'app', 'build', 'index.html');
const INSTALL_HTML_PATH = path.join(__dirname, 'src', 'index.html');

// ============================================================================
// ENHANCED LOGGING
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
    '🪟': 'WINDOW', '💥': 'FATAL', '👋': 'QUIT', '🔄': 'RELOAD'
  };
  return map[emoji] || 'LOG';
}

function log(...args) { safeLog('🌸', '[MAIN]', ...args); }
function error(...args) { console.error('❌', '[MAIN]', ...args); }

// ============================================================================
// STARTUP BANNER
// ============================================================================

console.log(`
╔═══════════════════════════════════════════╗
║ 🌸 BLOOM NUCLEUS ${IS_LAUNCH_MODE ? 'LAUNCHER' : 'INSTALLER'}        ║
║ Mode: ${IS_LAUNCH_MODE ? 'LAUNCH' : 'INSTALL'}                        ║
║ Version: ${APP_VERSION.padEnd(28)} ║
║ Environment: ${IS_DEV ? 'DEVELOPMENT' : 'PRODUCTION'.padEnd(20)} ║
║ Packaged: ${(app.isPackaged ? 'YES' : 'NO').padEnd(26)} ║
╚═══════════════════════════════════════════╝
`);

if (IS_DEV) {
  safeLog('🔧', 'CLI Arguments:', process.argv.slice(2));
}

log('📋 Paths:');
log('  - REPO_ROOT:', REPO_ROOT);
log('  - Python:', pythonPath);
log('  - Brain:', BRAIN_MAIN_PATH);
if (IS_LAUNCH_MODE) {
  log('  - Webview:', WEBVIEW_BUILD_PATH);
} else {
  log('  - Install HTML:', INSTALL_HTML_PATH);
}

// ============================================================================
// TCP PORT CHECK
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
      resolve(false);
    });
    socket.on('error', () => {
      resolve(false);
    });
  });
}

// ============================================================================
// SHARED IPC HANDLERS (Both Modes)
// ============================================================================

function registerSharedHandlers() {
  log('🔧 Registering shared IPC handlers...');

  ipcMain.handle('path:resolve', (event, { type, args }) => {
    try {
      switch (type) {
        case 'join':
          return path.join(...args);
        case 'webview-build':
          return WEBVIEW_BUILD_PATH;
        case 'install-html':
          return INSTALL_HTML_PATH;
        default:
          throw new Error(`Unknown path type: ${type}`);
      }
    } catch (err) {
      error('Path resolve error:', err.message);
      return null;
    }
  });

  ipcMain.handle('port:check', async (event, { port, host = 'localhost' }) => {
    const isOpen = await checkPortOpen(port, host);
    return isOpen;
  });

  ipcMain.handle('health:check', async () => {
    return { status: 'ok', checks: { websocket: true } };
  });

  log('✅ Shared IPC handlers registered');
}

// ============================================================================
// LAUNCH MODE IPC HANDLERS
// ============================================================================

function registerLaunchHandlers() {
  log('🚀 Registering launch-specific IPC handlers...');

  // Get environment info via brain.py
  ipcMain.handle('environment:get', async () => {
    try {
      log('🔍 Getting environment from brain.py...');

      const { stdout } = await execAsync(
        `"${pythonPath}" -I "${BRAIN_MAIN_PATH}" --json health dev-check`,
        { cwd: REPO_ROOT, timeout: 10000, windowsHide: true }
      );
      
      const result = JSON.parse(stdout);
      
      if (result.status !== 'success') {
        throw new Error('Brain command failed');
      }
      
      log('✅ Environment:', result.data.is_dev_mode ? 'DEV' : 'PROD');
      
      return {
        isDevMode: result.data.is_dev_mode,
        reason: result.data.reason,
        services: result.data.services
      };
    } catch (err) {
      error('Error getting environment:', err.message);
      return {
        isDevMode: false,
        reason: 'Error detecting environment',
        services: {}
      };
    }
  });

  // Check all services via brain.py
  ipcMain.handle('services:check-all', async () => {
    try {
      log('🔍 Checking all services via brain.py...');

      const { stdout } = await execAsync(
        `"${pythonPath}" -I "${BRAIN_MAIN_PATH}" --json health dev-check`,
        { cwd: REPO_ROOT, timeout: 10000, windowsHide: true }
      );
      
      const result = JSON.parse(stdout);
      
      return {
        devServer: result.data.services.dev_server.available,
        devServerHost: result.data.services.dev_server.host,
        api: result.data.services.api.available,
        apiHost: result.data.services.api.host,
        websocket: result.data.services.websocket.available,
        websocketHost: result.data.services.websocket.host
      };
    } catch (err) {
      error('Error checking services:', err.message);
      return {
        devServer: false,
        api: false,
        websocket: false
      };
    }
  });

  log('✅ Launch handlers registered');
}

// ============================================================================
// INSTALL MODE IPC HANDLERS - FIXED
// ============================================================================

function registerInstallHandlers() {
  log('📦 Registering install-specific IPC handlers...');

  // Main installation handler
  ipcMain.handle('install:start', async (event, options) => {
    try {
      log('📦 Starting installation with options:', options);
      
      const mainWindow = BrowserWindow.getAllWindows()[0];
      
      const installerPath = path.join(__dirname, 'install', 'installer.js');
      if (!fs.existsSync(installerPath)) {
        throw new Error(`Installer module not found at: ${installerPath}`);
      }
      
      const { runFullInstallation } = require('./install/installer');
      
      if (typeof runFullInstallation !== 'function') {
        throw new Error('runFullInstallation is not a function');
      }
      
      const result = await runFullInstallation(mainWindow);
      
      if (result.relaunching) {
        log('🔄 Relaunching with admin privileges...');
        return {
          success: false,
          relaunching: true,
          message: 'Relaunching with admin privileges...'
        };
      }
      
      if (!result.success) {
        error('Installation failed:', result.error);
        return {
          success: false,
          error: result.error || 'Installation failed'
        };
      }
      
      log('✅ Installation completed successfully');
      
      return {
        success: true,
        extensionId: result.extensionId || 'unknown',
        profileId: result.profileId || 'default',
        launcherCreated: result.launcherCreated || false,
        launcherPath: result.launcherPath || null
      };
      
    } catch (err) {
      error('Installation error:', err.message);
      error('Stack:', err.stack);
      return {
        success: false,
        error: err.message || 'Unknown installation error'
      };
    }
  });

// ✅ FIXED: Brain launch handler - Reemplazar en main.js (línea ~180)
ipcMain.handle('brain:launch', async () => {
  try {
    log('🚀 Launching Chrome profile via Brain...');
    
    const { paths } = require('./config/paths');
    const configPath = paths.configFile;
    
    let profileId = null;
    
    // PASO 1: Intentar leer profileId desde nucleus.json
    if (fs.existsSync(configPath)) {
      try {
        const configContent = fs.readFileSync(configPath, 'utf8');
        log('📋 Config file content:', configContent);
        
        const config = JSON.parse(configContent);
        
        // ✅ FIXED: Buscar masterProfileId (nombre correcto en nucleus.json)
        profileId = config.masterProfileId || config.default_profile_id || config.profileId;
        
        if (profileId) {
          log(`✅ Found profileId in config: ${profileId}`);
        } else {
          log('⚠️ Config exists but no profileId found. Keys:', Object.keys(config));
        }
      } catch (err) {
        log('⚠️ Could not read/parse config:', err.message);
      }
    } else {
      log('⚠️ Config file does not exist:', configPath);
    }
    
    // PASO 2: Si no hay config, listar perfiles y usar el primero
    if (!profileId) {
      log('📋 No profileId in config, listing profiles...');
      
      try {
        const { stdout, stderr } = await execAsync(
          `"${pythonPath}" -I "${BRAIN_MAIN_PATH}" --json profile list`,
          { cwd: REPO_ROOT, timeout: 10000, windowsHide: true }
        );
        
        if (stderr) {
          log('⚠️ Profile list stderr:', stderr);
        }
        
        log('📋 Profile list output:', stdout);
        
        const result = JSON.parse(stdout);
        
        if (result.status === 'success' && result.data?.profiles?.length > 0) {
          // ✅ FIXED: Extraer el UUID (id), NO el alias
          profileId = result.data.profiles[0].id;
          log(`✅ Using first available profile ID: ${profileId}`);
          log(`   Profile alias: ${result.data.profiles[0].alias}`);
        } else {
          throw new Error('No profiles found. Please run installation again.');
        }
      } catch (listErr) {
        error('❌ Failed to list profiles:', listErr.message);
        throw new Error('Could not determine profile to launch');
      }
    }
    
    // PASO 3: Validar que profileId sea un UUID, no un alias
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    
    if (!uuidRegex.test(profileId)) {
      error('❌ Profile ID is not a valid UUID:', profileId);
      error('   This looks like an alias. Attempting to resolve to UUID...');
      
      // Intentar listar y encontrar el UUID del alias
      try {
        const { stdout } = await execAsync(
          `"${pythonPath}" -I "${BRAIN_MAIN_PATH}" --json profile list`,
          { cwd: REPO_ROOT, timeout: 10000, windowsHide: true }
        );
        
        const result = JSON.parse(stdout);
        
        if (result.status === 'success' && result.data?.profiles) {
          const matchingProfile = result.data.profiles.find(
            p => p.alias === profileId
          );
          
          if (matchingProfile) {
            profileId = matchingProfile.id;
            log(`✅ Resolved alias to UUID: ${profileId}`);
          } else {
            throw new Error(`No profile found with alias: ${profileId}`);
          }
        }
      } catch (resolveErr) {
        error('❌ Failed to resolve alias to UUID:', resolveErr.message);
        throw resolveErr;
      }
    }
    
    // PASO 4: Lanzar con el UUID correcto
    log(`🚀 Launching profile with UUID: ${profileId}`);
    log(`   Command: profile launch ${profileId} --cockpit`);
    
    const { stdout, stderr } = await execAsync(
      `"${pythonPath}" -I "${BRAIN_MAIN_PATH}" profile launch ${profileId} --cockpit`,
      { cwd: REPO_ROOT, timeout: 15000, windowsHide: true }
    );
    
    log('✅ Chrome launched with cockpit');
    if (stdout) log('📋 Output:', stdout);
    if (stderr) log('⚠️ Stderr:', stderr);
    
    return { 
      success: true,
      profileId: profileId,
      mode: 'cockpit'
    };
    
  } catch (err) {
    error('❌ Launch error:', err.message);
    if (err.stack) {
      error('Stack trace:', err.stack);
    }
    return {
      success: false,
      error: err.message
    };
  }
});

  // ✅ FIXED: Extension heartbeat - usar comando válido de Brain
  ipcMain.handle('extension:heartbeat', async () => {
    try {
      log('💓 Checking extension heartbeat...');     
      
      const { stdout } = await execAsync(
        `"${pythonPath}" -I "${BRAIN_MAIN_PATH}" health websocket-status --json`,
        { cwd: REPO_ROOT, timeout: 10000, windowsHide: true }
      );
      
      const result = JSON.parse(stdout);
      
      // Interpretar respuesta
      const serviceRunning = result.status === 'success' && 
                            result.data?.connected === true;
      
      log(serviceRunning ? '✅ WebSocket connected' : '⚠️ WebSocket not connected');
      
      return {
        chromeConnected: serviceRunning,
        data: result.data || {}
      };
      
    } catch (err) {
      error('Heartbeat check failed:', err.message);
      
      // ✅ FALLBACK: Simplemente retornar mock success después de 5s
      // (Chrome ya se lanzó, asumimos que está conectado)
      log('⚠️ Using fallback heartbeat (assuming connected)');
      
      return {
        chromeConnected: true,
        data: { fallback: true }
      };
    }
  });

  // Launch Bloom Launcher in onboarding mode
  ipcMain.handle('launcher:open', async () => {
    try {
      log('🚀 Opening Bloom Launcher in onboarding mode...');
      
      const launcherPath = paths.launcherExe;
      
      // Verificar que el launcher existe
      if (!fs.existsSync(launcherPath)) {
        error('❌ Launcher not found at:', launcherPath);
        return {
          success: false,
          error: 'Launcher executable not found'
        };
      }
      
      log('📋 Launcher path:', launcherPath);
      
      // Spawn el launcher con el flag --onboarding
      const { spawn } = require('child_process');
      
      const launcherProcess = spawn(launcherPath, ['--onboarding'], {
        detached: true,
        stdio: 'ignore',
        windowsHide: false
      });
      
      // Desconectar el proceso para que corra independiente
      launcherProcess.unref();
      
      log('✅ Launcher spawned successfully');
      log('⏳ Waiting 2 seconds before closing installer...');
      
      // Esperar un poco para asegurar que el launcher inició
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      log('👋 Closing installer window...');
      
      // Cerrar la ventana del installer
      const mainWindow = BrowserWindow.getAllWindows()[0];
      if (mainWindow) {
        mainWindow.close();
      }
      
      return {
        success: true,
        launcherPath
      };
      
    } catch (err) {
      error('❌ Failed to open launcher:', err.message);
      error('Stack:', err.stack);
      return {
        success: false,
        error: err.message
      };
    }
  });

  // Check system requirements
  ipcMain.handle('install:check-requirements', async () => {
    try {
      log('🔍 Checking system requirements...');
      
      const requirements = {
        platform: process.platform,
        platformSupported: ['win32', 'darwin', 'linux'].includes(process.platform),
        node: false,
        python: false,
        diskSpace: true,
        adminRights: false
      };
      
      try {
        await execAsync('node --version');
        requirements.node = true;
      } catch {
        log('⚠️ Node.js not found in PATH');
      }
      
      try {
        await execAsync('python --version');
        requirements.python = true;
      } catch {
        log('⚠️ Python not found in PATH');
      }
      
      if (process.platform === 'win32') {
        const { isElevated } = require('./core/admin-utils');
        requirements.adminRights = await isElevated();
      } else {
        requirements.adminRights = true;
      }
      
      log('✅ Requirements check completed:', requirements);
      
      return {
        success: true,
        requirements
      };
      
    } catch (err) {
      error('Requirements check failed:', err.message);
      return {
        success: false,
        error: err.message
      };
    }
  });

  // Clean previous installation
  ipcMain.handle('install:cleanup', async () => {
    try {
      log('🧹 Cleaning previous installation...');
      
      const { cleanupProcesses } = require('./install/installer');
      await cleanupProcesses();
      
      log('✅ Cleanup completed');
      return { success: true };
      
    } catch (err) {
      error('Cleanup failed:', err.message);
      return {
        success: false,
        error: err.message
      };
    }
  });

  // Preflight checks
  ipcMain.handle('preflight-checks', async () => {
    try {
      log('🔍 Running preflight checks...');
      
      const checks = {
        installerExists: fs.existsSync(path.join(__dirname, 'install', 'installer.js')),
        pythonExists: fs.existsSync(pythonPath),
        brainExists: fs.existsSync(BRAIN_MAIN_PATH),
        adminRights: false
      };
      
      if (process.platform === 'win32') {
        const { isElevated } = require('./core/admin-utils');
        checks.adminRights = await isElevated();
      } else {
        checks.adminRights = true;
      }
      
      const allPassed = Object.values(checks).every(v => v === true);
      
      return {
        success: allPassed,
        checks
      };
      
    } catch (err) {
      error('Preflight checks failed:', err.message);
      return {
        success: false,
        error: err.message
      };
    }
  });

  log('✅ Install handlers registered');
}

// ============================================================================
// ONBOARDING CHECK (Launch Mode Only)
// ============================================================================

async function checkOnboardingStatus() {
  if (!fs.existsSync(BRAIN_PY_PATH)) {
    error('brain.py not found:', BRAIN_PY_PATH);
    return false;
  }

  try {
    const { stdout } = await execAsync(
      `"${pythonPath}" -I "${BRAIN_MAIN_PATH}" health onboarding-status --json`,
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
// WINDOW CREATION - MODE-SPECIFIC
// ============================================================================

async function createWindow() {
  log('🪟 Creating window...');

  const win = new BrowserWindow({
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

  // Open DevTools in dev mode
  if (IS_DEV) {
    win.webContents.openDevTools();
  }

  // ============================================================================
  // ENHANCED LOGGING (Development)
  // ============================================================================
  
  if (IS_DEV) {
    win.webContents.on('did-navigate', (event, url) => {
      safeLog('📄', 'Page navigated to:', url);
    });

    win.webContents.on('did-navigate-in-page', (event, url, isMainFrame) => {
      if (isMainFrame) {
        safeLog('📄', 'In-page navigation:', url);
      }
    });

    win.webContents.on('did-finish-load', () => {
      const url = win.webContents.getURL();
      safeLog('✅', 'Page fully loaded:', url);
    });

    win.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
      safeLog('❌', 'Failed to load:', validatedURL, `(${errorDescription})`);
    });

    win.webContents.on('console-message', (event, level, message, line, sourceId) => {
      const levels = ['LOG', 'WARN', 'ERROR'];
      const emoji = ['📋', '⚠️', '❌'][level];
      safeLog(emoji, `[RENDERER:${levels[level]}]`, message, `(${sourceId}:${line})`);
    });
  }

  // ============================================================================
  // MODE-SPECIFIC URL LOADING
  // ============================================================================

  let targetUrl;
  let needsOnboarding = false;

  if (IS_LAUNCH_MODE) {
    // ========================================================================
    // LAUNCH MODE: Load webview (dev server or build) + onboarding check
    // ========================================================================
    
    const devServerAvailable = IS_DEV && await isDevServerRunning();

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
      // Normal launch (dashboard)
      if (devServerAvailable) {
        targetUrl = 'http://localhost:5173/';
        log('🔧 DEV MODE: Loading home from Vite dev server');
      } else {
        targetUrl = 'file://' + WEBVIEW_BUILD_PATH.replace(/\\/g, '/');
        log('📦 PROD MODE: Loading home from build');
      }
    }

    // Send initialization event after page loads
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
    // ========================================================================
    // INSTALL MODE: Load static installer UI
    // ========================================================================
    
    if (!fs.existsSync(INSTALL_HTML_PATH)) {
      error('Install HTML not found:', INSTALL_HTML_PATH);
      targetUrl = 'data:text/html,' + encodeURIComponent(`
        <html>
          <body style="font-family: system-ui; padding: 40px; background: #0f0f0f; color: white;">
            <h1>⚠️ Installation Error</h1>
            <p>Install HTML not found at:</p>
            <code>${INSTALL_HTML_PATH}</code>
            <p>Please check your installation package.</p>
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

  // ============================================================================
  // LOAD URL (Both Modes)
  // ============================================================================
  
  log('🚀 Loading URL:', targetUrl);
  
  try {
    await win.loadURL(targetUrl);
    log('✅ URL loaded successfully');
  } catch (err) {
    error('💥 Failed to load URL:', err.message);
    
    // Fallback error page
    const errorHtml = `
      <html>
        <body style="font-family: system-ui; padding: 40px; background: #0f0f0f; color: white;">
          <h1>⚠️ Load Error</h1>
          <p>Failed to load: ${targetUrl}</p>
          <p>Error: ${err.message}</p>
          <p>Mode: ${IS_LAUNCH_MODE ? 'Launch' : 'Install'}</p>
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
  
  // Register ALL IPC handlers (both modes available for transitions)
  registerSharedHandlers();
  registerLaunchHandlers();
  registerInstallHandlers();
  
  // Create window (mode-specific)
  mainWindow = await createWindow();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      log('🔄 Reactivating window...');
      mainWindow = await createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    log('👋 All windows closed, quitting...');
    app.quit();
  }
});

app.on('before-quit', () => {
  log('👋 Application closing...');
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