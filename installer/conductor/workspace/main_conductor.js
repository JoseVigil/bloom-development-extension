// main_conductor.js — Bloom Nucleus Conductor

// ============================================================================
// UTF-8 OUTPUT (Windows)
// ============================================================================
if (process.platform === 'win32') {
  if (process.stdout && process.stdout._handle) process.stdout._handle.setBlocking(true);
  if (process.stderr && process.stderr._handle) process.stderr._handle.setBlocking(true);
  try {
    const { execSync } = require('child_process');
    execSync('chcp 65001 > nul 2>&1', { stdio: 'ignore', windowsHide: true });
  } catch {}
}

const path = require('path');
const fs   = require('fs');
const os   = require('os');

// ============================================================================
// CLI CONTRACT
//
// PROBLEMA EN ELECTRON EMPAQUETADO:
//   - process.exit() antes de require('electron') funciona en dev pero en
//     producción Electron ya arrancó su proceso principal internamente.
//   - Llamar process.exit() sin pasar por app.quit() deja procesos huérfanos
//     y no flusha stdout en Windows.
//
// SOLUCIÓN: Detectar CLI flags, entrar en app.whenReady(), escribir output,
//   llamar app.exit(0). Electron no crea ventanas porque nunca llamamos
//   createWindow(). El proceso termina limpiamente sin instancia visible.
// ============================================================================

const CLI_FLAGS = ['--version', '--info', '--version-json'];
const IS_CLI_MODE = process.argv.some(a => CLI_FLAGS.includes(a));

function getBloomBasePathCLI() {
  const homeDir = os.homedir();
  if (process.platform === 'win32')
    return path.join(homeDir, 'AppData', 'Local', 'BloomNucleus');
  if (process.platform === 'darwin')
    return path.join(homeDir, 'Library', 'Application Support', 'BloomNucleus');
  return path.join(homeDir, '.local', 'share', 'BloomNucleus');
}

function loadBuildInfo() {
  const candidates = [
    // Dentro del asar (funciona porque está en asarUnpack)
    path.join(__dirname, 'build_info.json'),
    // En app.asar.unpacked
    process.resourcesPath ? path.join(process.resourcesPath, 'app.asar.unpacked', 'build_info.json') : null,
    // Junto al exe como resource
    process.resourcesPath ? path.join(process.resourcesPath, 'build_info.json') : null,
    // Dev: CWD
    path.join(process.cwd(), 'build_info.json'),
  ].filter(Boolean);

  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return JSON.parse(fs.readFileSync(c, 'utf8'));
    } catch { /* try next */ }
  }

  // Fallback seguro
  const pkg = (() => { try { return require('./package.json'); } catch { return {}; } })();
  return {
    name: pkg.name || 'bloom-conductor',
    product_name: pkg.productName || 'Bloom Nucleus Workspace',
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

function handleCLIOutput() {
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
    return true;
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
    return true;
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
    return true;
  }

  return false;
}

// ============================================================================
// ELECTRON INITIALIZATION
// ============================================================================
const { app, BrowserWindow, ipcMain } = require('electron');
const { exec } = require('child_process');
const { promisify } = require('util');

// ── CLI MODE: salir limpiamente sin crear ventana ─────────────────────────────
if (IS_CLI_MODE) {
  app.disableHardwareAcceleration();

  app.whenReady().then(() => {
    handleCLIOutput();
    app.exit(0);
  });

  // Evitar comportamiento por defecto de window-all-closed
  app.on('window-all-closed', () => {});

} else {
  // ── MODO NORMAL: GUI ────────────────────────────────────────────────────────
  startGUI();
}

// ============================================================================
// GUI MODE
// ============================================================================
function startGUI() {
  const { getLogger } = require('../shared/logger');
  const logger = getLogger('conductor');

  const execAsync = promisify(exec);

  let mainWindow = null;

  const BLOOM_BASE   = path.join(process.env.LOCALAPPDATA, 'BloomNucleus');
  const NUCLEUS_EXE  = path.join(BLOOM_BASE, 'bin', 'nucleus', 'nucleus.exe');
  const NUCLEUS_JSON = path.join(BLOOM_BASE, 'config', 'nucleus.json');

  function createWindow() {
    logger.info('Creating Conductor window...');

    mainWindow = new BrowserWindow({
      width: 1000,
      height: 700,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload_conductor.js')
      },
      icon: path.join(__dirname, 'assets', 'bloom.ico'),
      title: 'Bloom Nucleus Workspace',
      backgroundColor: '#0f0f1e',
      show: false
    });

    mainWindow.loadFile(path.join(__dirname, 'src', 'conductor.html'));

    mainWindow.once('ready-to-show', () => {
      logger.success('Conductor window ready');
      mainWindow.show();
    });

    mainWindow.on('closed', () => {
      logger.info('Conductor window closed');
      mainWindow = null;
    });
  }

  async function checkInstallation() {
    logger.separator('INSTALLATION CHECK');
    try {
      if (!fs.existsSync(NUCLEUS_JSON)) {
        logger.error('nucleus.json not found');
        return { success: false, error: 'nucleus.json not found. Please run the installer first.' };
      }
      const nucleusData = JSON.parse(fs.readFileSync(NUCLEUS_JSON, 'utf8'));
      if (!nucleusData.installation || !nucleusData.installation.completed) {
        logger.warn('Installation not completed');
        return { success: false, error: 'Installation not completed. Please run the installer.' };
      }
      if (!fs.existsSync(NUCLEUS_EXE)) {
        logger.error('Nucleus binary not found');
        return { success: false, error: 'Nucleus binary not found. Installation may be corrupted.' };
      }
      logger.success('Installation verified');
      logger.info(`Master Profile: ${nucleusData.master_profile || 'N/A'}`);
      return { success: true, nucleusData };
    } catch (error) {
      logger.error('Installation check failed:', error.message);
      return { success: false, error: `Failed to verify installation: ${error.message}` };
    }
  }

  ipcMain.handle('nucleus:health', async () => {
    logger.info('Health check requested');
    try {
      const { stdout } = await execAsync(`"${NUCLEUS_EXE}" --json health`);
      const result = JSON.parse(stdout);
      logger.success('Health check passed');
      return { success: true, health: result };
    } catch (error) {
      logger.error('Health check failed:', error.message);
      return { success: false, error: error.message, health: { status: 'unhealthy', error: error.message } };
    }
  });

  ipcMain.handle('nucleus:list-profiles', async () => {
    logger.info('Listing profiles...');
    try {
      const { stdout } = await execAsync(`"${NUCLEUS_EXE}" --json profile list`);
      const result = JSON.parse(stdout);
      logger.success(`Found ${result.profiles?.length || 0} profiles`);
      return { success: true, profiles: result.profiles || [] };
    } catch (error) {
      logger.error('Failed to list profiles:', error.message);
      return { success: false, error: error.message, profiles: [] };
    }
  });

  ipcMain.handle('nucleus:launch-profile', async (event, profileId) => {
    logger.separator('LAUNCHING PROFILE');
    logger.info(`Profile ID: ${profileId}`);
    try {
      const { stdout } = await execAsync(`"${NUCLEUS_EXE}" --json launch ${profileId}`);
      const result = JSON.parse(stdout);
      logger.success('Profile launched successfully');
      return { success: true, result };
    } catch (error) {
      logger.error('Failed to launch profile:', error.message);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('nucleus:create-profile', async (event, profileName) => {
    logger.info(`Creating profile: ${profileName}`);
    try {
      const { stdout } = await execAsync(`"${NUCLEUS_EXE}" --json profile create "${profileName}"`);
      const result = JSON.parse(stdout);
      logger.success(`Profile created: ${result.profile_id || result.id}`);
      return { success: true, profile: result };
    } catch (error) {
      logger.error('Failed to create profile:', error.message);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('nucleus:get-installation', async () => {
    logger.info('Getting installation info...');
    try {
      if (!fs.existsSync(NUCLEUS_JSON)) {
        logger.warn('nucleus.json not found');
        return { success: false, error: 'nucleus.json not found' };
      }
      const data = JSON.parse(fs.readFileSync(NUCLEUS_JSON, 'utf8'));
      logger.success('Installation info retrieved');
      return { success: true, installation: data };
    } catch (error) {
      logger.error('Failed to get installation info:', error.message);
      return { success: false, error: error.message };
    }
  });

  app.whenReady().then(async () => {
    logger.separator('CONDUCTOR STARTING');
    logger.info('Bloom Nucleus Conductor');
    logger.info(`Base path: ${BLOOM_BASE}`);

    const installCheck = await checkInstallation();

    if (!installCheck.success) {
      logger.error('Installation check failed, showing error dialog');
      const { dialog } = require('electron');
      await dialog.showMessageBox({
        type: 'error',
        title: 'Installation Required',
        message: installCheck.error,
        detail: 'Please run bloom-setup.exe to install Bloom Nucleus first.'
      });
      logger.info('Quitting due to failed installation check');
      app.quit();
      return;
    }

    createWindow();
  });

  app.on('window-all-closed', () => {
    logger.info('All windows closed');
    if (process.platform !== 'darwin') {
      logger.info('Quitting application');
      app.quit();
    }
  });

  app.on('activate', () => {
    logger.info('Application activated');
    if (mainWindow === null) createWindow();
  });

  app.on('will-quit', () => {
    logger.separator('CONDUCTOR SHUTDOWN');
    logger.info('Application shutting down');
  });
}