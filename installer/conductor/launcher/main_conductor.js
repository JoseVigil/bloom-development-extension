const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const { promisify } = require('util');

// ✅ Importar logger compartido
const { getLogger } = require('../shared/logger');
const logger = getLogger('conductor');

const execAsync = promisify(exec);

let mainWindow = null;

// Paths to installed binaries
const BLOOM_BASE = path.join(process.env.LOCALAPPDATA, 'BloomNucleus');
const NUCLEUS_EXE = path.join(BLOOM_BASE, 'bin', 'nucleus', 'nucleus.exe');
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
    title: 'Bloom Nucleus Launcher',
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

// Check if installation is complete before allowing launch
async function checkInstallation() {
  logger.separator('INSTALLATION CHECK');
  
  try {
    if (!fs.existsSync(NUCLEUS_JSON)) {
      logger.error('nucleus.json not found');
      return { 
        success: false, 
        error: 'nucleus.json not found. Please run the installer first.' 
      };
    }

    const nucleusData = JSON.parse(fs.readFileSync(NUCLEUS_JSON, 'utf8'));
    
    if (!nucleusData.installation || !nucleusData.installation.completed) {
      logger.warn('Installation not completed');
      return { 
        success: false, 
        error: 'Installation not completed. Please run the installer.' 
      };
    }

    if (!fs.existsSync(NUCLEUS_EXE)) {
      logger.error('Nucleus binary not found');
      return { 
        success: false, 
        error: 'Nucleus binary not found. Installation may be corrupted.' 
      };
    }

    logger.success('Installation verified');
    logger.info(`Master Profile: ${nucleusData.master_profile || 'N/A'}`);
    
    return { success: true, nucleusData };
  } catch (error) {
    logger.error('Installation check failed:', error.message);
    return { 
      success: false, 
      error: `Failed to verify installation: ${error.message}` 
    };
  }
}

// Health check via nucleus CLI
ipcMain.handle('nucleus:health', async () => {
  logger.info('Health check requested');
  
  try {
    const { stdout } = await execAsync(`"${NUCLEUS_EXE}" --json health`);
    const result = JSON.parse(stdout);
    
    logger.success('Health check passed');
    logger.debug('Health result:', result);
    
    return { success: true, health: result };
  } catch (error) {
    logger.error('Health check failed:', error.message);
    return { 
      success: false, 
      error: error.message,
      health: { status: 'unhealthy', error: error.message }
    };
  }
});

// List profiles
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

// Launch profile
ipcMain.handle('nucleus:launch-profile', async (event, profileId) => {
  logger.separator('LAUNCHING PROFILE');
  logger.info(`Profile ID: ${profileId}`);
  
  try {
    const { stdout } = await execAsync(`"${NUCLEUS_EXE}" --json launch ${profileId}`);
    const result = JSON.parse(stdout);
    
    logger.success('Profile launched successfully');
    logger.debug('Launch result:', result);
    
    return { success: true, result };
  } catch (error) {
    logger.error('Failed to launch profile:', error.message);
    return { success: false, error: error.message };
  }
});

// Create new profile
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

// Get installation info
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
  
  // Gate: Check installation before creating window
  const installCheck = await checkInstallation();
  
  if (!installCheck.success) {
    logger.error('Installation check failed, showing error dialog');
    
    // Show error dialog and exit
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
  
  if (mainWindow === null) {
    createWindow();
  }
});

// Log on app quit
app.on('will-quit', () => {
  logger.separator('CONDUCTOR SHUTDOWN');
  logger.info('Application shutting down');
});