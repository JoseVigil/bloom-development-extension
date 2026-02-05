const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

let mainWindow = null;

// Paths to installed binaries
const BLOOM_BASE = path.join(process.env.LOCALAPPDATA, 'BloomNucleus');
const NUCLEUS_EXE = path.join(BLOOM_BASE, 'bin', 'nucleus', 'nucleus.exe');
const NUCLEUS_JSON = path.join(BLOOM_BASE, 'config', 'nucleus.json');

function createWindow() {
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
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Check if installation is complete before allowing launch
async function checkInstallation() {
  try {
    if (!fs.existsSync(NUCLEUS_JSON)) {
      return { 
        success: false, 
        error: 'nucleus.json not found. Please run the installer first.' 
      };
    }

    const nucleusData = JSON.parse(fs.readFileSync(NUCLEUS_JSON, 'utf8'));
    
    if (!nucleusData.installation || !nucleusData.installation.completed) {
      return { 
        success: false, 
        error: 'Installation not completed. Please run the installer.' 
      };
    }

    if (!fs.existsSync(NUCLEUS_EXE)) {
      return { 
        success: false, 
        error: 'Nucleus binary not found. Installation may be corrupted.' 
      };
    }

    return { success: true, nucleusData };
  } catch (error) {
    return { 
      success: false, 
      error: `Failed to verify installation: ${error.message}` 
    };
  }
}

// Health check via nucleus CLI
ipcMain.handle('nucleus:health', async () => {
  try {
    const { stdout } = await execAsync(`"${NUCLEUS_EXE}" --json health`);
    const result = JSON.parse(stdout);
    return { success: true, health: result };
  } catch (error) {
    return { 
      success: false, 
      error: error.message,
      health: { status: 'unhealthy', error: error.message }
    };
  }
});

// List profiles
ipcMain.handle('nucleus:list-profiles', async () => {
  try {
    const { stdout } = await execAsync(`"${NUCLEUS_EXE}" --json profile list`);
    const result = JSON.parse(stdout);
    return { success: true, profiles: result.profiles || [] };
  } catch (error) {
    return { success: false, error: error.message, profiles: [] };
  }
});

// Launch profile
ipcMain.handle('nucleus:launch-profile', async (event, profileId) => {
  try {
    const { stdout } = await execAsync(`"${NUCLEUS_EXE}" --json launch ${profileId}`);
    const result = JSON.parse(stdout);
    return { success: true, result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Create new profile
ipcMain.handle('nucleus:create-profile', async (event, profileName) => {
  try {
    const { stdout } = await execAsync(`"${NUCLEUS_EXE}" --json profile create "${profileName}"`);
    const result = JSON.parse(stdout);
    return { success: true, profile: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Get installation info
ipcMain.handle('nucleus:get-installation', async () => {
  try {
    if (!fs.existsSync(NUCLEUS_JSON)) {
      return { success: false, error: 'nucleus.json not found' };
    }
    
    const data = JSON.parse(fs.readFileSync(NUCLEUS_JSON, 'utf8'));
    return { success: true, installation: data };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

app.whenReady().then(async () => {
  // Gate: Check installation before creating window
  const installCheck = await checkInstallation();
  
  if (!installCheck.success) {
    // Show error dialog and exit
    const { dialog } = require('electron');
    await dialog.showMessageBox({
      type: 'error',
      title: 'Installation Required',
      message: installCheck.error,
      detail: 'Please run bloom-setup.exe to install Bloom Nucleus first.'
    });
    app.quit();
    return;
  }

  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
