const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

let mainWindow;

// Platform detection
const platform = process.platform; // 'win32', 'darwin', 'linux'
const isDevMode = process.argv.includes('--dev');

// Paths configuration
const paths = {
  home: app.getPath('home'),
  appData: app.getPath('appData'),
  bloomDir: path.join(app.getPath('appData'), 'Bloom'),
  nativeHostDir: path.join(app.getPath('appData'), 'Bloom', 'native-host'),
  chromeExtDir: path.join(app.getPath('appData'), 'Bloom', 'chrome-extension'),
  vsCodeExtDir: platform === 'win32' 
    ? path.join(app.getPath('home'), '.vscode', 'extensions')
    : path.join(app.getPath('home'), '.vscode', 'extensions')
};

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
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

// Installation handlers
ipcMain.handle('get-system-info', async () => {
  return {
    platform,
    isDevMode,
    paths,
    vsCodeInstalled: await checkVSCodeInstalled()
  };
});

ipcMain.handle('start-installation', async (event, config) => {
  try {
    const steps = [
      { name: 'Creating directories', fn: createDirectories },
      { name: 'Installing Native Host', fn: installNativeHost },
      { name: 'Registering Native Host', fn: registerNativeHost },
      { name: 'Installing VSCode Plugin', fn: () => installVSCodePlugin(config.devMode) },
      { name: 'Setting up Chrome Extension', fn: setupChromeExtension },
      { name: 'Finalizing installation', fn: finalizeInstallation }
    ];

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      mainWindow.webContents.send('installation-progress', {
        step: i + 1,
        total: steps.length,
        message: step.name
      });

      await step.fn();
      await new Promise(resolve => setTimeout(resolve, 500)); // Brief pause for UX
    }

    return { success: true };
  } catch (error) {
    console.error('Installation error:', error);
    return { success: false, error: error.message };
  }
});

// Installation functions
async function createDirectories() {
  await fs.ensureDir(paths.bloomDir);
  await fs.ensureDir(paths.nativeHostDir);
  await fs.ensureDir(paths.chromeExtDir);
}

async function installNativeHost() {
  const nativeHostSource = path.join(__dirname, '..', 'native', 'bin', platform);
  const nativeHostBinary = platform === 'win32' ? 'bloom-host.exe' : 'bloom-host';
  const sourcePath = path.join(nativeHostSource, nativeHostBinary);
  const destPath = path.join(paths.nativeHostDir, nativeHostBinary);

  if (!await fs.pathExists(sourcePath)) {
    throw new Error(`Native host binary not found: ${sourcePath}`);
  }

  await fs.copy(sourcePath, destPath);
  
  if (platform !== 'win32') {
    await fs.chmod(destPath, '755');
  }
}

async function registerNativeHost() {
  const hostId = 'com.bloom.nucleus.host';
  const manifestPath = path.join(paths.nativeHostDir, 'manifest.json');
  const nativeHostBinary = platform === 'win32' ? 'bloom-host.exe' : 'bloom-host';
  
  const manifest = {
    name: hostId,
    description: 'Bloom Nucleus Native Messaging Host',
    path: path.join(paths.nativeHostDir, nativeHostBinary),
    type: 'stdio',
    allowed_origins: [
      'chrome-extension://CHROME_EXTENSION_ID/'
    ]
  };

  await fs.writeJson(manifestPath, manifest, { spaces: 2 });

  if (platform === 'win32') {
    await registerWindowsNativeHost(hostId, manifestPath);
  } else if (platform === 'darwin') {
    await registerMacNativeHost(hostId, manifestPath);
  } else {
    await registerLinuxNativeHost(hostId, manifestPath);
  }
}

async function registerWindowsNativeHost(hostId, manifestPath) {
  const regKey = `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${hostId}`;
  const command = `reg add "${regKey}" /ve /d "${manifestPath.replace(/\\/g, '\\\\')}" /f`;
  
  try {
    await execPromise(command);
  } catch (error) {
    throw new Error(`Failed to register native host in Windows registry: ${error.message}`);
  }
}

async function registerMacNativeHost(hostId, manifestPath) {
  const nativeMessagingDir = path.join(
    paths.home,
    'Library',
    'Application Support',
    'Google',
    'Chrome',
    'NativeMessagingHosts'
  );
  
  await fs.ensureDir(nativeMessagingDir);
  const destPath = path.join(nativeMessagingDir, `${hostId}.json`);
  await fs.copy(manifestPath, destPath);
}

async function registerLinuxNativeHost(hostId, manifestPath) {
  const nativeMessagingDir = path.join(
    paths.home,
    '.config',
    'google-chrome',
    'NativeMessagingHosts'
  );
  
  await fs.ensureDir(nativeMessagingDir);
  const destPath = path.join(nativeMessagingDir, `${hostId}.json`);
  await fs.copy(manifestPath, destPath);
}

async function checkVSCodeInstalled() {
  try {
    await execPromise('code --version');
    return true;
  } catch {
    return false;
  }
}

async function installVSCodePlugin(devMode) {
  const vsixPath = path.join(__dirname, '..', 'vscode-plugin', 'bloom-nucleus.vsix');
  const pluginSourcePath = path.join(__dirname, '..', 'vscode-plugin');

  if (!await checkVSCodeInstalled()) {
    throw new Error('VSCode is not installed or not in PATH');
  }

  if (devMode) {
    // Dev mode: symlink the source folder
    const extensionName = 'bloom-nucleus-dev';
    const targetPath = path.join(paths.vsCodeExtDir, extensionName);
    
    if (await fs.pathExists(targetPath)) {
      await fs.remove(targetPath);
    }
    
    await fs.ensureSymlink(pluginSourcePath, targetPath, 'dir');
  } else {
    // Production: install .vsix
    if (!await fs.pathExists(vsixPath)) {
      throw new Error(`VSIX file not found: ${vsixPath}`);
    }
    
    await execPromise(`code --install-extension "${vsixPath}"`);
  }
}

async function setupChromeExtension() {
  const extensionSource = path.join(__dirname, '..', 'chrome-extension');
  
  if (!await fs.pathExists(extensionSource)) {
    throw new Error('Chrome extension source not found');
  }

  await fs.copy(extensionSource, paths.chromeExtDir);
}

async function finalizeInstallation() {
  const configPath = path.join(paths.bloomDir, 'config.json');
  
  const config = {
    version: '1.0.0',
    installedAt: new Date().toISOString(),
    platform,
    devMode: isDevMode,
    paths: {
      nativeHost: paths.nativeHostDir,
      chromeExtension: paths.chromeExtDir
    }
  };

  await fs.writeJson(configPath, config, { spaces: 2 });
}

ipcMain.handle('open-chrome-extensions', async () => {
  const { shell } = require('electron');
  await shell.openExternal('chrome://extensions/');
});

ipcMain.handle('open-vscode', async () => {
  try {
    await execPromise('code');
  } catch (error) {
    throw new Error('Failed to open VSCode');
  }
});