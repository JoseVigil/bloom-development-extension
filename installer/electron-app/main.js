const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const { exec, spawn } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const os = require('os');
const net = require('net');

let mainWindow;

const platform = process.platform;
const isDevMode = process.argv.includes('--dev');

const paths = {
  home: app.getPath('home'),
  appData: app.getPath('appData'),
  localAppData: platform === 'win32' ? process.env.LOCALAPPDATA : app.getPath('appData'),
  hostInstallDir: platform === 'win32' 
    ? 'C:\\Program Files\\BloomNucleus\\native'
    : platform === 'darwin'
    ? '/Library/Application Support/BloomNucleus/native'
    : '/opt/bloom-nucleus/native',
  configDir: platform === 'win32'
    ? path.join(process.env.LOCALAPPDATA, 'BloomNucleus')
    : platform === 'darwin'
    ? path.join(app.getPath('home'), '.config', 'BloomNucleus')
    : path.join(app.getPath('home'), '.config', 'BloomNucleus'),
  chromeUserData: platform === 'win32'
    ? path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'User Data')
    : platform === 'darwin'
    ? path.join(app.getPath('home'), 'Library', 'Application Support', 'Google', 'Chrome')
    : path.join(app.getPath('home'), '.config', 'google-chrome'),
  extensionSource: path.join(__dirname, '..', 'chrome-extension')
};

const SERVICE_NAME = 'BloomNucleusHost';
const DEFAULT_PORT = 5678;
const PORT_RANGE_MAX = 5698;

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

ipcMain.handle('preflight-checks', async () => {
  const vcRedistInstalled = await checkVCRedistInstalled();
  
  const results = {
    hasAdmin: await checkAdminPrivileges(),
    previousInstall: await checkPreviousInstallation(),
    portAvailable: await checkPortAvailable(DEFAULT_PORT),
    diskSpace: await checkDiskSpace(),
    vcRedistInstalled: vcRedistInstalled
  };
  
  console.log('Preflight checks:', results);
  return results;
});

ipcMain.handle('start-installation', async (event, config) => {
  try {
    const steps = [
      { name: 'Creando directorios', fn: createDirectories },
      { name: 'Respaldando instalación previa', fn: backupPreviousInstallation },
      { name: 'Instalando Native Host', fn: installHost },
      { name: 'Copiando DLLs dependientes', fn: copyDependencies },
      { name: 'Creando configuración inicial', fn: createInitialConfig }
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

ipcMain.handle('install-service', async () => {
  try {
    console.log('=== SERVICE INSTALLATION STARTED ===');
    
    const availablePort = await findAvailablePort(DEFAULT_PORT, PORT_RANGE_MAX);
    console.log(`Port ${availablePort} is available`);
    
    if (platform === 'win32') {
      await installWindowsService(availablePort);
    } else if (platform === 'darwin') {
      await installMacOSService(availablePort);
    } else {
      await installLinuxService(availablePort);
    }
    
    await saveServerState({ port: availablePort });
    console.log(`Server state saved (port: ${availablePort})`);
    
    console.log('Starting health check...');
    const healthy = await healthCheckService(availablePort, 30000);
    
    if (!healthy) {
      console.error('Health check failed');
    }
    
    console.log('=== SERVICE INSTALLATION FINISHED ===');
    
    return { 
      success: healthy, 
      port: availablePort,
      error: healthy ? null : 'Service timeout. Check logs.'
    };
  } catch (error) {
    console.error('SERVICE ERROR:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('install-vc-redist', async () => {
  try {
    if (platform !== 'win32') {
      return { success: true, skipped: true };
    }
    
    const tempDir = path.join(paths.configDir, 'temp');
    await fs.ensureDir(tempDir);
    
    const installerPath = path.join(tempDir, 'vc_redist.x64.exe');
    const vcRedistUrl = 'https://aka.ms/vs/17/release/vc_redist.x64.exe';
    
    mainWindow.webContents.send('installation-progress', {
      step: 0,
      total: 2,
      message: 'Descargando VC++ Redistributables...'
    });
    
    const https = require('https');
    const file = fs.createWriteStream(installerPath);
    
    await new Promise((resolve, reject) => {
      https.get(vcRedistUrl, (response) => {
        if (response.statusCode === 302 || response.statusCode === 301) {
          https.get(response.headers.location, (redirectResponse) => {
            redirectResponse.pipe(file);
            file.on('finish', () => {
              file.close();
              resolve();
            });
          }).on('error', reject);
        } else {
          response.pipe(file);
          file.on('finish', () => {
            file.close();
            resolve();
          });
        }
      }).on('error', (err) => {
        fs.unlink(installerPath, () => {});
        reject(err);
      });
    });
    
    mainWindow.webContents.send('installation-progress', {
      step: 1,
      total: 2,
      message: 'Instalando VC++ Redistributables...'
    });
    
    try {
      await execPromise(`"${installerPath}" /install /quiet /norestart`, {
        timeout: 120000
      });
    } catch (execError) {
      if (execError.code !== 3010 && execError.code !== 0) {
        throw execError;
      }
    }
    
    await fs.remove(installerPath);
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const installed = await checkVCRedistInstalled();
    
    return { success: true, installed: installed };
  } catch (error) {
    console.error('VC++ error:', error);
    return { success: false, error: error.message };
  }
});

async function checkVCRedistInstalled() {
  if (platform !== 'win32') return true;
  
  try {
    const systemRoot = process.env.SystemRoot || 'C:\\Windows';
    const system32 = path.join(systemRoot, 'System32');
    const sysWow64 = path.join(systemRoot, 'SysWOW64');
    
    const requiredDlls = [
      'vcruntime140.dll',
      'vcruntime140_1.dll',
      'msvcp140.dll',
      'msvcp140_1.dll',
      'msvcp140_2.dll'
    ];
    
    const missingDlls = [];
    
    for (const dll of requiredDlls) {
      const dll64 = path.join(system32, dll);
      const dll32 = path.join(sysWow64, dll);
      
      const exists64 = await fs.pathExists(dll64);
      const exists32 = await fs.pathExists(dll32);
      
      if (!exists64 && !exists32) {
        missingDlls.push(dll);
      }
    }
    
    if (missingDlls.length > 0) {
      console.log('Missing DLLs:', missingDlls.join(', '));
      return false;
    }
    
    console.log('All VC++ DLLs found');
    return true;
  } catch (error) {
    console.error('Error checking VC++:', error);
    return false;
  }
}

ipcMain.handle('check-service-status', async () => {
  try {
    const state = await readServerState();
    const port = state?.port || DEFAULT_PORT;
    const isRunning = !(await checkPortAvailable(port));
    
    return { running: isRunning, port: port };
  } catch (error) {
    return { running: false, port: DEFAULT_PORT };
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
  const isValid = /^[a-z]{32}$/.test(extensionId);
  return { valid: isValid };
});

ipcMain.handle('finalize-setup', async (event, { extensionId, profiles }) => {
  try {
    await generateNativeManifest(extensionId);
    await registerNativeHost();
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

ipcMain.handle('open-logs-folder', async () => {
  const logsDir = path.join(paths.configDir, 'logs');
  await fs.ensureDir(logsDir);
  await shell.openPath(logsDir);
});

ipcMain.handle('open-btip-config', async () => {
  await shell.openExternal('http://localhost:8777/home');
});

async function checkAdminPrivileges() {
  if (platform === 'win32') {
    try {
      await execPromise('net session');
      return true;
    } catch {
      return false;
    }
  }
  return process.getuid && process.getuid() === 0;
}

async function checkPreviousInstallation() {
  const hostBinary = platform === 'win32' ? 'bloom-host.exe' : 'bloom-host';
  const binaryPath = path.join(paths.hostInstallDir, hostBinary);
  return await fs.pathExists(binaryPath);
}

async function checkPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    
    server.once('error', (err) => {
      resolve(err.code !== 'EADDRINUSE');
    });
    
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    
    server.listen(port, '127.0.0.1');
  });
}

async function checkDiskSpace() {
  try {
    await fs.ensureDir(paths.hostInstallDir);
    return true;
  } catch {
    return false;
  }
}

async function findAvailablePort(startPort, endPort) {
  for (let port = startPort; port <= endPort; port++) {
    const available = await checkPortAvailable(port);
    if (available) {
      return port;
    }
  }
  throw new Error(`No ports available ${startPort}-${endPort}`);
}

async function createDirectories() {
  try {
    await fs.ensureDir(paths.hostInstallDir);
    await fs.ensureDir(path.join(paths.configDir, 'config'));
    await fs.ensureDir(path.join(paths.configDir, 'state'));
    await fs.ensureDir(path.join(paths.configDir, 'logs'));
    await fs.ensureDir(path.join(paths.configDir, 'backups'));
  } catch (error) {
    if (error.code === 'EPERM' || error.code === 'EACCES') {
      throw new Error('Requiere permisos de administrador');
    }
    throw error;
  }
}

async function backupPreviousInstallation() {
  const hostBinary = platform === 'win32' ? 'bloom-host.exe' : 'bloom-host';
  const sourcePath = path.join(paths.hostInstallDir, hostBinary);
  
  if (await fs.pathExists(sourcePath)) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(paths.configDir, 'backups', `${hostBinary}_${timestamp}.bak`);
    await fs.copy(sourcePath, backupPath, { overwrite: true });
  }
}

async function installHost() {
  const hostBinary = platform === 'win32' ? 'bloom-host.exe' : 'bloom-host';
  const sourcePath = path.join(__dirname, '..', 'native', 'bin', platform, hostBinary);
  const destPath = path.join(paths.hostInstallDir, hostBinary);

  if (!await fs.pathExists(sourcePath)) {
    throw new Error(`Binary not found: ${sourcePath}`);
  }

  await fs.copy(sourcePath, destPath, { overwrite: true });
  
  if (platform !== 'win32') {
    await fs.chmod(destPath, '755');
  }
}

async function copyDependencies() {
  if (platform !== 'win32') return;

  const requiredDlls = [
    'libgcc_s_seh-1.dll',
    'libstdc++-6.dll',
    'libwinpthread-1.dll'
  ];

  const sourceDllDir = path.join(__dirname, '..', 'native', 'bin', platform);
  
  for (const dll of requiredDlls) {
    const sourcePath = path.join(sourceDllDir, dll);
    const destPath = path.join(paths.hostInstallDir, dll);
    
    if (await fs.pathExists(sourcePath)) {
      await fs.copy(sourcePath, destPath, { overwrite: true });
    }
  }
}

async function createInitialConfig() {
  const serverConfigPath = path.join(paths.configDir, 'config', 'server.json');
  
  const serverConfig = {
    preferredPort: DEFAULT_PORT,
    autoStart: true,
    logLevel: 'info'
  };
  
  await fs.writeJson(serverConfigPath, serverConfig, { spaces: 2 });
}

// CONTINUAR main.js - Agregar al final de la Parte 1

async function installWindowsService(port) {
  const hostBinary = 'bloom-host.exe';
  const binaryPath = path.join(paths.hostInstallDir, hostBinary);
  
  console.log('=== Windows Service Installation ===');
  
  try {
    await fs.access(binaryPath);
  } catch (error) {
    throw new Error(`Binary not found: ${binaryPath}`);
  }
  
  const vcInstalled = await checkVCRedistInstalled();
  if (!vcInstalled) {
    throw new Error('VC++ Redistributables required');
  }
  
  try {
    await execPromise(`sc query ${SERVICE_NAME}`);
    await execPromise(`sc stop ${SERVICE_NAME}`).catch(() => {});
    await new Promise(resolve => setTimeout(resolve, 2000));
    await execPromise(`sc delete ${SERVICE_NAME}`);
    await new Promise(resolve => setTimeout(resolve, 2000));
  } catch {
    console.log('No existing service');
  }
  
  const serviceBinPath = `\\"${binaryPath}\\" --server --port=${port}`;
  
  const createCmd = `sc create ${SERVICE_NAME} binPath= "${serviceBinPath}" DisplayName= "Bloom Nucleus Host" start= auto`;
  await execPromise(createCmd);
  
  await execPromise(`sc description ${SERVICE_NAME} "Bloom Nucleus background service"`);
  await execPromise(`sc failure ${SERVICE_NAME} reset= 86400 actions= restart/60000`);
  
  const batchScript = `@echo off
cd /d "${paths.hostInstallDir}"
set PATH=${paths.hostInstallDir};%PATH%
"${binaryPath}" --server --port=${port}
`;

  const batchPath = path.join(paths.configDir, 'start-server.bat');
  await fs.writeFile(batchPath, batchScript);

  const vbsScript = `Set WshShell = CreateObject("WScript.Shell")
WshShell.Run """${batchPath}""", 0, False
Set WshShell = Nothing`;

  const vbsPath = path.join(paths.configDir, 'start-server.vbs');
  await fs.writeFile(vbsPath, vbsScript);

  try {
    await execPromise(`sc start ${SERVICE_NAME}`, { timeout: 15000 });
  } catch (scError) {
    spawn('wscript.exe', [vbsPath], {
      cwd: paths.hostInstallDir,
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    });
  }

  await new Promise(resolve => setTimeout(resolve, 5000));
}

async function installMacOSService(port) {
  const hostBinary = 'bloom-host';
  const binaryPath = path.join(paths.hostInstallDir, hostBinary);
  const plistPath = '/Library/LaunchDaemons/com.bloom.nucleus.host.plist';
  
  const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.bloom.nucleus.host</string>
    <key>ProgramArguments</key>
    <array>
        <string>${binaryPath}</string>
        <string>--server</string>
        <string>--port=${port}</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${path.join(paths.configDir, 'logs', 'server.log')}</string>
    <key>StandardErrorPath</key>
    <string>${path.join(paths.configDir, 'logs', 'server-error.log')}</string>
</dict>
</plist>`;

  await execPromise(`sudo launchctl stop com.bloom.nucleus.host`).catch(() => {});
  await execPromise(`sudo launchctl unload ${plistPath}`).catch(() => {});
  
  await fs.writeFile(plistPath, plistContent, { mode: 0o644 });
  
  await execPromise(`sudo launchctl load ${plistPath}`);
  await execPromise(`sudo launchctl start com.bloom.nucleus.host`);
  
  await new Promise(resolve => setTimeout(resolve, 5000));
}

async function installLinuxService(port) {
  const hostBinary = 'bloom-host';
  const binaryPath = path.join(paths.hostInstallDir, hostBinary);
  const servicePath = '/etc/systemd/system/bloom-nucleus-host.service';
  
  const serviceContent = `[Unit]
Description=Bloom Nucleus Host Server
After=network.target

[Service]
Type=simple
ExecStart=${binaryPath} --server --port=${port}
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
`;

  await execPromise(`sudo systemctl stop bloom-nucleus-host`).catch(() => {});
  
  await fs.writeFile(servicePath, serviceContent, { mode: 0o644 });
  
  await execPromise('sudo systemctl daemon-reload');
  await execPromise('sudo systemctl enable bloom-nucleus-host');
  await execPromise('sudo systemctl start bloom-nucleus-host');
  
  await new Promise(resolve => setTimeout(resolve, 5000));
}

async function healthCheckService(port, timeout = 30000) {
  const startTime = Date.now();
  const interval = 500;
  
  while (Date.now() - startTime < timeout) {
    const available = await checkPortAvailable(port);
    
    if (!available) {
      return true;
    }
    
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  
  return false;
}

async function generateNativeManifest(extensionId) {
  const hostBinary = platform === 'win32' ? 'bloom-host.exe' : 'bloom-host';
  const hostPath = path.join(paths.hostInstallDir, hostBinary);
  const manifestPath = path.join(paths.hostInstallDir, 'com.bloom.nucleus.bridge.json');
  
  const manifest = {
    name: 'com.bloom.nucleus.bridge',
    description: 'Bloom Bridge Host',
    path: hostPath.replace(/\\/g, '\\\\'),
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
    const psCommand = `New-Item -Path "Registry::${regKey}" -Force | New-ItemProperty -Name "(Default)" -Value "${escapedPath}" -Force`;
    await execPromise(`powershell -Command "${psCommand}"`, { shell: 'powershell.exe' });
  } catch (error) {
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
        if (item === 'Default' || item.startsWith('Profile ')) {
          const prefsPath = path.join(itemPath, 'Preferences');
          if (await fs.pathExists(prefsPath)) {
            let profileName = item;
            
            try {
              const prefs = await fs.readJson(prefsPath);
              if (prefs.profile && prefs.profile.name) {
                profileName = `${item} (${prefs.profile.name})`;
              }
            } catch (e) {
              // Ignore
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
    console.error('Error detecting profiles:', error);
  }
  
  return profiles;
}

async function saveServerState(state) {
  const statePath = path.join(paths.configDir, 'state', 'server.json');
  await fs.writeJson(statePath, state, { spaces: 2 });
}

async function readServerState() {
  const statePath = path.join(paths.configDir, 'state', 'server.json');
  try {
    return await fs.readJson(statePath);
  } catch {
    return null;
  }
}

async function saveConfig(config) {
  const configPath = path.join(paths.configDir, 'config', 'config.json');
  
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