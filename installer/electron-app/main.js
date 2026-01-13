// main.js - REFACTORIZADO SEGÚN GUÍA UNIFICADA FINAL
// ============================================================================
// ARQUITECTURA HUB & SPOKE (MULTIPLEXOR)
// - Electron NUNCA lanza bloom-host.exe manualmente
// - Electron NUNCA intenta conexiones TCP/WebSocket directas
// - Heartbeat: ejecuta spawn('brain', ['health', 'native-ping', '--json'])
// - Todo pasa por brain CLI
// ============================================================================

// ============================================================================
// 🔥 UTF-8 CONFIGURATION - MUST BE FIRST
// ============================================================================
if (process.platform === 'win32') {
  // Force UTF-8 encoding for stdout/stderr
  if (process.stdout && process.stdout._handle) {
    process.stdout._handle.setBlocking(true);
  }
  if (process.stderr && process.stderr._handle) {
    process.stderr._handle.setBlocking(true);
  }
  
  // Force UTF-8 for all child processes
  process.env.PYTHONIOENCODING = 'utf-8';
  process.env.PYTHONUTF8 = '1';
  process.env.PYTHONLEGACYWINDOWSSTDIO = '0';
  process.env.NODE_NO_WARNINGS = '1';
  
  // Set console code page to UTF-8 (65001)
  try {
    const { execSync } = require('child_process');
    execSync('chcp 65001 > nul 2>&1', { stdio: 'ignore', windowsHide: true });
  } catch (e) {
    // Ignore errors - console might not support chcp
  }
}

const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const serviceDiagnostics = require('./install/diagnose/service-diagnostics');


// ============================================================================
// CONSTANTES & MODE DETECTION
// ============================================================================

const IS_DEV = process.argv.includes('--dev') || process.env.NODE_ENV === 'development';
const IS_LAUNCH_MODE = process.argv.includes('--mode=launch') || process.argv.includes('--launch');
const FORCE_ONBOARDING = process.argv.includes('--onboarding');

const APP_VERSION = app.getVersion();
const isWindows = process.platform === 'win32';
// ✅ ENABLE emojis on Windows since we're forcing UTF-8
const useEmojis = true;

// ============================================================================
// HEARTBEAT CONFIGURATION
// ============================================================================

const HEARTBEAT_CONFIG = {
  INTERVAL: 30000,        // 30 segundos entre checks} catch
  RETRY_DELAY: 5000,      // 5 segundos en caso de error
  TIMEOUT: 10000          // 10 segundos timeout por comando
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

function getBrainWorkingDirectory() {
  return path.dirname(getBrainExecutablePath());
}

const BLOOM_BASE = getBloomBasePath();
const BRAIN_EXE = getBrainExecutablePath();
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
    '💓': 'HEARTBEAT', '🏥': 'HEALTH', '🏓': 'PING'
  };
  return map[emoji] || 'LOG';
}

function log(...args) { safeLog('🌸', '[MAIN]', ...args); }
function error(...args) { console.error('❌', '[MAIN]', ...args); }

// ============================================================================
// STARTUP BANNER
// ============================================================================

console.log(`
╔═════════════════════════════════════════╗
║ 🌸 BLOOM NUCLEUS ${IS_LAUNCH_MODE ? 'LAUNCHER' : 'INSTALLER'}        ║
║ Mode: ${IS_LAUNCH_MODE ? 'LAUNCH' : 'INSTALL'}                        ║
║ Version: ${APP_VERSION.padEnd(28)} ║
║ Environment: ${IS_DEV ? 'DEVELOPMENT' : 'PRODUCTION'.padEnd(20)} ║
║ Packaged: ${(app.isPackaged ? 'YES' : 'NO').padEnd(26)} ║
║ Heartbeat: Brain CLI (health check)     ║
╚═════════════════════════════════════════╝
`);

if (IS_DEV) {
  safeLog('🔧', 'CLI Arguments:', process.argv.slice(2));
}

log('📋 Paths:');
log('  - REPO_ROOT:', REPO_ROOT);
log('  - BLOOM_BASE:', BLOOM_BASE);
log('  - BRAIN_EXE:', BRAIN_EXE);

// ============================================================================
// 🔥 JSON PARSING UTILITY
// ============================================================================

function parseCLIJson(stdout) {
  try {
    // Estrategia 1: Buscar líneas que empiecen con { y terminen con }
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
    
    // Estrategia 2: Regex mejorado
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
    
    // Estrategia 3: Fallback con contador de llaves
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
// 🔥 HEARTBEAT IMPLEMENTATION (Brain CLI)
// ============================================================================

/**
 * Verifica el estado del host nativo ejecutando brain CLI
 * Comando: brain health native-ping --json
 * Retorna: { connected: boolean, port: number | null, error?: string }
 */
async function checkHostStatus() {
  return new Promise((resolve) => {
    const brainPath = getBrainExecutablePath();
    if (!fs.existsSync(brainPath)) return resolve({ connected: false, port: null, error: 'brain.exe not found' });
    
    const child = spawn(brainPath, ['--json', 'health', 'native-ping'], {
      cwd: getBrainWorkingDirectory(),
      env: { 
        ...process.env, 
        PYTHONIOENCODING: 'utf-8',
        PYTHONUTF8: '1',
        PYTHONLEGACYWINDOWSSTDIO: '0'
      },
      shell: true,
      windowsHide: true
    });
    
    // ✅ FORZAR ENCODING UTF-8 en los streams
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    
    let stdout = '';
    let stderr = ''; 

    child.stdout.on('data', (data) => { stdout += data; });
    child.stderr.on('data', (data) => { stderr += data; }); 
    
    child.on('close', (code) => {
      try {
        const json = parseCLIJson(stdout);
        
        if (json.data) {
          resolve(json.data);
        } else if (json.connected !== undefined) {
          resolve(json);
        } else {
          resolve({ connected: false, port: null, error: 'Invalid JSON structure' });
        }
      } catch (e) {
        if (stderr) {  // ← AHORA SÍ EXISTE
          console.error('[Heartbeat] stderr:', stderr);
        }
        resolve({ connected: false, port: null, error: `parse error: ${e.message}` });
      }
    });
    
    child.on('error', (err) => resolve({ connected: false, port: null, error: err.message }));
    setTimeout(() => { if (!child.killed) child.kill(); resolve({ connected: false, port: null, error: 'timeout' }); }, 10000);
  });
}



// ============================================================================
// MANTENER executeBrainCommand SOLO para comandos que NO sean launch
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
      shell: false,  // ✅ FIX: Sin shell para evitar cmd.exe intermedio
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    
    // ✅ FORZAR ENCODING UTF-8 en los streams
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

/**
 * Inicia el heartbeat periódico
 */
function startHeartbeat() {
  if (heartbeatTimer) {
    log('⚠️ Heartbeat already running');
    return;
  }
  
  log('💓 Starting heartbeat polling...');
  log(`   Interval: ${HEARTBEAT_CONFIG.INTERVAL}ms (${HEARTBEAT_CONFIG.INTERVAL / 1000}s)`);
  
  // Check inicial
  checkHostStatus().then((status) => {
    lastHeartbeatStatus = status;
    updateUIStatus(status);
  });
  
  // Polling periódico
  heartbeatTimer = setInterval(async () => {
    const status = await checkHostStatus();
    lastHeartbeatStatus = status;
    updateUIStatus(status);
  }, HEARTBEAT_CONFIG.INTERVAL);
}

/**
 * Detiene el heartbeat
 */
function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
    log('💓 Heartbeat stopped');
  }
}

/**
 * Actualiza la UI con el estado del heartbeat
 */
function updateUIStatus(status) {
  const mainWin = BrowserWindow.getAllWindows()[0];
  if (!mainWin || mainWin.isDestroyed()) return;
  
  if (status.connected) {
    safeLog('✅', `[Heartbeat] Status: ONLINE (port: ${status.port})`);
  } else {
    safeLog('⚠️', `[Heartbeat] Status: OFFLINE${status.error ? ` (${status.error})` : ''}`);
  }
  
  mainWin.webContents.send('server-status', status);
}

// ============================================================================
// IPC HANDLERS - SHARED
// ============================================================================

function registerSharedHandlers() {
  // System info
  ipcMain.handle('system:info', async () => {
    return {
      platform: os.platform(),
      arch: os.arch(),
      version: os.release(),
      appVersion: APP_VERSION,
      bloomBase: BLOOM_BASE,
      brainExe: BRAIN_EXE
    };
  });
  
  // App version
  ipcMain.handle('app:version', async () => {
    return APP_VERSION;
  });
  
  // Open external
  ipcMain.handle('shell:openExternal', async (event, url) => {
    await shell.openExternal(url);
    return { success: true };
  });
  
  // Open logs folder
  ipcMain.handle('shell:openLogsFolder', async () => {
    const logsDir = path.join(BLOOM_BASE, 'logs');
    if (fs.existsSync(logsDir)) {
      await shell.openPath(logsDir);
      return { success: true };
    } else {
      return { success: false, error: 'Logs directory not found' };
    }
  });
  
  // Path resolution
  ipcMain.handle('path:resolve', async (event, { type, args }) => {
    return path[type](...args);
  });
}

// ============================================================================
// IPC HANDLERS - LAUNCH MODE
// ============================================================================

function registerLaunchHandlers() {
  // Health check (heartbeat)
  ipcMain.handle('health:check', async () => {
    return await checkHostStatus();
  });
  
  // Get current heartbeat status
  ipcMain.handle('health:status', async () => {
    return lastHeartbeatStatus;
  });
  
  // Onboarding status
  ipcMain.handle('onboarding:status', async () => {
    try {
      const result = await executeBrainCommand(['profile', 'status', '--json']);
      return result.data || { completed: false };
    } catch (error) {
      return { completed: false, error: error.message };
    }
  });
  
  // List profiles
  ipcMain.handle('profile:list', async () => {
    try {
      const result = await executeBrainCommand(['profile', 'list', '--json']);
      return result.data || { profiles: [] };
    } catch (error) {
      return { profiles: [], error: error.message };
    }
  });
  
  // Launch profile
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
  
  // Tail logs
  ipcMain.handle('logs:tail', async (event, { lines = 100 }) => {
    try {
      const result = await executeBrainCommand(['logs', 'tail', '--lines', lines.toString(), '--json']);
      return result.data || { logs: [] };
    } catch (error) {
      return { logs: [], error: error.message };
    }
  });
  
  // Environment info
  ipcMain.handle('environment:get', async () => {
    return {
      bloomBase: BLOOM_BASE,
      brainExe: BRAIN_EXE,
      platform: os.platform(),
      devMode: IS_DEV
    };
  });
  
  // Check all services
  ipcMain.handle('services:check-all', async () => {
    const status = await checkHostStatus();
    return {
      brain: status.connected ? 'RUNNING' : 'STOPPED',
      port: status.port,
      connected: status.connected
    };
  });
}

// ============================================================================
// IPC HANDLERS - INSTALL MODE
// ============================================================================

function registerInstallHandlers() {
  // Install service
  ipcMain.handle('install:start', async (event, options = {}) => {
    try {
      log('🚀 Starting installation...');
      
      // Importar el instalador
      const { runFullInstallation } = require('./install/installer');
      
      // Ejecutar instalación
      const result = await runFullInstallation(BrowserWindow.getAllWindows()[0]);
      
      if (result.success) {
        log('✅ Installation completed successfully');
        
        // ✅ IMPORTANTE: Iniciar heartbeat DESPUÉS de la instalación
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
  
  // ============================================================================
  // REEMPLAZAR ipcMain.handle('brain:launch') - Línea ~340
  // ============================================================================

  ipcMain.handle('brain:launch', async (event, profileIdOrObject) => {
    try {
      // Normalizar input
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
      
      log(`🚀 [MAIN] Launching profile: ${profileId}`);
      
      if (!profileId || profileId === 'undefined' || profileId === 'null') {
        const errorMsg = `Profile ID is missing or invalid. Received: ${JSON.stringify(profileIdOrObject)}`;
        error(`❌ ${errorMsg}`);
        return { 
          success: false, 
          error: errorMsg,
          received: profileIdOrObject 
        };
      }
      
      // ============================================================================
      // USAR BRAIN.EXE (Respeta la arquitectura)
      // ============================================================================
      
      log(`🔹 Executing: brain --json profile launch ${profileId} --discovery`);
      
      const result = await executeBrainCommand(['--json', 'profile', 'launch', profileId, '--discovery']);
      
      log("✅ Profile launched successfully:", result);
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
  
  // Extension heartbeat check
  ipcMain.handle('extension:heartbeat', async () => {
    try {
      // Verificar el estado usando brain CLI
      const status = await checkHostStatus();
      
      return {
        success: true,
        chromeConnected: status.connected,
        port: status.port
      };
      
    } catch (error) {
      return {
        success: false,
        chromeConnected: false,
        error: error.message
      };
    }
  });
  
  // Preflight checks
  ipcMain.handle('preflight-checks', async () => {
    const checks = {
      brainExists: fs.existsSync(BRAIN_EXE),
      bloomBaseExists: fs.existsSync(BLOOM_BASE),
      platform: os.platform(),
      adminRights: false // TODO: Implementar verificación real si es necesario
    };
    
    return checks;
  });
  
  // Check requirements
  ipcMain.handle('install:check-requirements', async () => {
    return {
      platform: os.platform(),
      arch: os.arch(),
      hasSpace: true, // TODO: Verificar espacio en disco
      canWrite: true  // TODO: Verificar permisos de escritura
    };
  });
  
  // Cleanup installation
  ipcMain.handle('install:cleanup', async () => {
    try {
      const { cleanupOldServices } = require('./install/service-installer');
      await cleanupOldServices();
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
}
// ============================================================================
// 🆕 IPC HANDLERS - REPAIR TOOLS
// Agregar esta función DESPUÉS de registerInstallHandlers()
// ============================================================================
function registerRepairHandlers() {
  log('🔧 Registering repair & diagnostic handlers...');
 
  // Lazy import (solo cargar cuando se necesite)
  let repairTools = null;
 
  const getRepairTools = () => {
    if (!repairTools) {
      repairTools = require('./install/repair-tools');
      log('📦 Repair tools module loaded');
    }
    return repairTools;
  };
 
  /**
   * Handler: Reparar Bridge
   * Actualiza Extension ID en bridge.json y Registry
   */
  ipcMain.handle('repair-bridge', async (event) => {
    log('🔧 [IPC] repair-bridge called');
   
    try {
      const { repairBridgeConnection } = getRepairTools();
      const result = await repairBridgeConnection();
     
      if (result.success) {
        log('✅ [IPC] Bridge repaired:', result.extensionId);
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
 
  /**
   * Handler: Validar Instalación
   * Verifica que todos los componentes estén OK
   */
  ipcMain.handle('validate-installation', async (event) => {
    log('🔍 [IPC] validate-installation called');
   
    try {
      const { validateInstallation } = getRepairTools();
      const result = await validateInstallation();
     
      if (result.success) {
        log('✅ [IPC] Installation is valid');
      } else {
        const failedChecks = Object.entries(result.checks || {})
          .filter(([k, v]) => !v)
          .map(([k]) => k);
       
        log('⚠️ [IPC] Installation incomplete. Failed:', failedChecks.join(', '));
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
 
  /**
   * Handler: Ejecutar Diagnósticos
   * Recopila información completa del sistema
   */
  ipcMain.handle('run-diagnostics', async (event) => {
    log('🔬 [IPC] run-diagnostics called');
   
    try {
      const { runDiagnostics } = getRepairTools();
      const diagnostics = await runDiagnostics();
     
      log('📊 [IPC] Diagnostics completed');
     
      // Mostrar resumen en consola
      if (diagnostics.validation) {
        const allPassed = diagnostics.validation.success;
        log(` Validation: ${allPassed ? '✅ PASS' : '❌ FAIL'}`);
      }
     
      return diagnostics;
     
    } catch (err) {
      error('❌ [IPC] run-diagnostics error:', err.message);
      return {
        timestamp: new Date().toISOString(),
        error: err.message
      };
    }
  });
 
  log('✅ Repair handlers registered');
}
// ============================================================================
// WINDOW CREATION
// ============================================================================

async function isDevServerRunning() {
  // TODO: Implementar verificación real
  return false;
}

async function checkOnboardingStatus() {
  try {
    if (!fs.existsSync(BRAIN_EXE)) {
      return false;
    }
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

  // ============================================================================
  // ENHANCED LOGGING (Development)
  // ============================================================================
  
  if (IS_DEV) {
    win.webContents.on('did-navigate', (event, url) => {
      safeLog('📄', 'Page navigated to:', url);
    });

    win.webContents.on('did-finish-load', () => {
      const url = win.webContents.getURL();
      safeLog('✅', 'Page fully loaded:', url);
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
    // INSTALL MODE
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
  // LOAD URL
  // ============================================================================
  
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
  
  // Register ALL IPC handlers
  registerSharedHandlers();
  registerLaunchHandlers();
  registerInstallHandlers();
  registerRepairHandlers(); // 🆕 AGREGAR ESTA LÍNEA
  
  // Create window
  mainWindow = await createWindow();

  // ✅ SOLO iniciar heartbeat en LAUNCH MODE
  // En INSTALL MODE se inicia DESPUÉS de la instalación
  if (IS_LAUNCH_MODE) {
    log('💓 Starting heartbeat (Launch Mode)');
    startHeartbeat();
  } else {
    log('ℹ️ Heartbeat will start after installation completes');
  }

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      log('🔄 Reactivating window...');
      mainWindow = await createWindow();
    }
  });
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