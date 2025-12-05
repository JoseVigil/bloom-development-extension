const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const os = require('os');

let mainWindow;

// Platform detection
const platform = process.platform;
const isDevMode = process.argv.includes('--dev');

// Paths configuration
const paths = {
  home: app.getPath('home'),
  appData: app.getPath('appData'),
  localAppData: platform === 'win32' ? process.env.LOCALAPPDATA : app.getPath('appData'),
  // Installation paths
  hostInstallDir: platform === 'win32' 
    ? 'C:\\Program Files\\BloomNucleus\\native'
    : path.join('/usr', 'local', 'bin', 'bloom-nucleus'),
  configDir: platform === 'win32'
    ? path.join(process.env.LOCALAPPDATA, 'BloomNucleus')
    : path.join(app.getPath('home'), '.config', 'BloomNucleus'),
  // Chrome paths
  chromeUserData: platform === 'win32'
    ? path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'User Data')
    : platform === 'darwin'
    ? path.join(app.getPath('home'), 'Library', 'Application Support', 'Google', 'Chrome')
    : path.join(app.getPath('home'), '.config', 'google-chrome'),
  // Extension source
  extensionSource: path.join(__dirname, '..', 'chrome-extension')
};

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    resizable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'assets', 'icon.png')
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  
  if (isDevMode) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// ============================================================================
// INSTALLATION HANDLERS
// ============================================================================

ipcMain.handle('get-system-info', async () => {
  return {
    platform,
    isDevMode,
    paths: {
      hostInstallDir: paths.hostInstallDir,
      extensionSource: paths.extensionSource,
      configDir: paths.configDir
    },
    vsCodeInstalled: await checkVSCodeInstalled()
  };
});

ipcMain.handle('start-installation', async (event, config) => {
  try {
    const steps = [
      { name: 'Creando directorios', fn: createDirectories },
      { name: 'Instalando Native Host', fn: installHost },
      { name: 'Creando manifest (sin Extension ID)', fn: () => generateNativeManifest(null) },
      { name: 'Registrando Native Host', fn: registerNativeHost },
      { name: 'Guardando configuración inicial', fn: () => saveConfig({ extensionId: null, profiles: [] }) }
    ];

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      mainWindow.webContents.send('installation-progress', {
        step: i + 1,
        total: steps.length,
        message: step.name
      });

      await step.fn();
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    return { success: true };
  } catch (error) {
    console.error('Installation error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('detect-chrome-profiles', async () => {
  try {
    const profiles = await detectChromeProfiles();
    return { success: true, profiles };
  } catch (error) {
    return { success: false, error: error.message, profiles: [] };
  }
});

ipcMain.handle('validate-extension-id', async (event, extensionId) => {
  // Validar formato: 32 caracteres, solo letras minúsculas
  const isValid = /^[a-z]{32}$/.test(extensionId);
  return { valid: isValid };
});

ipcMain.handle('finalize-setup', async (event, { extensionId, profiles }) => {
  try {
    // Actualizar manifest con Extension ID
    await generateNativeManifest(extensionId);
    
    // Guardar configuración completa
    await saveConfig({ extensionId, profiles });
    
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('open-chrome-extensions', async () => {
  await shell.openExternal('chrome://extensions/');
});

ipcMain.handle('open-folder', async (event, folderPath) => {
  await shell.openPath(folderPath);
});

// ============================================================================
// INSTALLATION FUNCTIONS
// ============================================================================

async function createDirectories() {
  try {
    await fs.ensureDir(paths.hostInstallDir);
    await fs.ensureDir(paths.configDir);
  } catch (error) {
    if (error.code === 'EPERM' || error.code === 'EACCES') {
      throw new Error('Se requieren permisos de administrador. Por favor, ejecuta el instalador como administrador.');
    }
    throw error;
  }
}

async function installHost() {
  const hostBinary = platform === 'win32' ? 'bloom-host.exe' : 'bloom-host';
  const sourcePath = path.join(__dirname, '..', 'native', 'bin', platform, hostBinary);
  const destPath = path.join(paths.hostInstallDir, hostBinary);

  if (!await fs.pathExists(sourcePath)) {
    throw new Error(`Native host binary not found: ${sourcePath}`);
  }

  await fs.copy(sourcePath, destPath);
  
  if (platform !== 'win32') {
    await fs.chmod(destPath, '755');
  }
}

async function generateNativeManifest(extensionId) {
  const hostBinary = platform === 'win32' ? 'bloom-host.exe' : 'bloom-host';
  const hostPath = path.join(paths.hostInstallDir, hostBinary);
  const manifestPath = path.join(paths.hostInstallDir, 'com.bloom.nucleus.bridge.json');
  
  const manifest = {
    name: 'com.bloom.nucleus.bridge',
    description: 'Bloom Bridge Host',
    path: hostPath.replace(/\\/g, '\\\\'), // Escape backslashes for Windows
    type: 'stdio',
    allowed_origins: extensionId 
      ? [`chrome-extension://${extensionId}/`]
      : []
  };

  await fs.writeJson(manifestPath, manifest, { spaces: 2 });
  
  return manifestPath;
}

async function registerNativeHost() {
  const manifestPath = path.join(paths.hostInstallDir, 'com.bloom.nucleus.bridge.json');
  
  if (platform === 'win32') {
    await registerWindowsNativeHost(manifestPath);
  } else if (platform === 'darwin') {
    await registerMacNativeHost(manifestPath);
  } else {
    await registerLinuxNativeHost(manifestPath);
  }
}

async function registerWindowsNativeHost(manifestPath) {
  const regKey = 'HKCU\\SOFTWARE\\Google\\Chrome\\NativeMessagingHosts\\com.bloom.nucleus.bridge';
  const escapedPath = manifestPath.replace(/\\/g, '\\\\');
  
  try {
    // Usar PowerShell para mayor confiabilidad
    const psCommand = `New-Item -Path "Registry::${regKey}" -Force | New-ItemProperty -Name "(Default)" -Value "${escapedPath}" -Force`;
    await execPromise(`powershell -Command "${psCommand}"`, { shell: 'powershell.exe' });
  } catch (error) {
    // Fallback a reg.exe
    const command = `reg add "${regKey}" /ve /d "${escapedPath}" /f`;
    await execPromise(command);
  }
}

async function registerMacNativeHost(manifestPath) {
  const nativeMessagingDir = path.join(
    paths.home,
    'Library',
    'Application Support',
    'Google',
    'Chrome',
    'NativeMessagingHosts'
  );
  
  await fs.ensureDir(nativeMessagingDir);
  const destPath = path.join(nativeMessagingDir, 'com.bloom.nucleus.bridge.json');
  await fs.copy(manifestPath, destPath);
}

async function registerLinuxNativeHost(manifestPath) {
  const nativeMessagingDir = path.join(
    paths.home,
    '.config',
    'google-chrome',
    'NativeMessagingHosts'
  );
  
  await fs.ensureDir(nativeMessagingDir);
  const destPath = path.join(nativeMessagingDir, 'com.bloom.nucleus.bridge.json');
  await fs.copy(manifestPath, destPath);
}

async function detectChromeProfiles() {
  const profiles = [];
  
  try {
    if (!await fs.pathExists(paths.chromeUserData)) {
      return profiles;
    }
    
    const items = await fs.readdir(paths.chromeUserData);
    
    for (const item of items) {
      const itemPath = path.join(paths.chromeUserData, item);
      const stat = await fs.stat(itemPath);
      
      if (stat.isDirectory()) {
        // Buscar "Default" o "Profile X"
        if (item === 'Default' || item.startsWith('Profile ')) {
          // Verificar que tenga Preferences
          const prefsPath = path.join(itemPath, 'Preferences');
          if (await fs.pathExists(prefsPath)) {
            let profileName = item;
            
            // Intentar leer el nombre del perfil
            try {
              const prefs = await fs.readJson(prefsPath);
              if (prefs.profile && prefs.profile.name) {
                profileName = `${item} (${prefs.profile.name})`;
              }
            } catch (e) {
              // Ignorar error de lectura
            }
            
            profiles.push({
              id: item,
              name: profileName,
              path: itemPath
            });
          }
        }
      }
    }
  } catch (error) {
    console.error('Error detecting Chrome profiles:', error);
  }
  
  return profiles;
}

async function saveConfig(config) {
  const configPath = path.join(paths.configDir, 'config.json');
  
  const fullConfig = {
    version: '1.0.0',
    installedAt: new Date().toISOString(),
    platform,
    devMode: true,
    hostPath: path.join(paths.hostInstallDir, platform === 'win32' ? 'bloom-host.exe' : 'bloom-host'),
    extensionId: config.extensionId || null,
    profiles: config.profiles || [],
    extensionSource: paths.extensionSource
  };

  await fs.writeJson(configPath, fullConfig, { spaces: 2 });
}

async function checkVSCodeInstalled() {
  try {
    await execPromise('code --version');
    return true;
  } catch {
    return false;
  }
}