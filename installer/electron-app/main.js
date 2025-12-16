const { app, BrowserWindow, ipcMain, shell, nativeImage } = require('electron'); 
const path = require('path');
const fs = require('fs-extra');
const { exec, spawn } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const net = require('net');
const os = require('os');
const { CURRENT_STRATEGY, INSTALL_STRATEGY } = require('./installers/config');
const ChromeManualInstaller = require('./installers/ChromeManualExtensionInstaller');
const ChromeEnterpriseInstaller = require('./installers/ChromeEnterpriseExtensionInstaller');


// Importamos los helpers de integración (Asegúrate de que installHelpers.js exista en la misma carpeta)
const installHelpers = require('./installHelpers');

let mainWindow;
let isExtensionInstalling = false;

const platform = process.platform;
const isDevMode = process.argv.includes('--dev') || !app.isPackaged;

const getResourcePath = (relativePath) => {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, relativePath);
  }
  // En dev, 'native' está en ../native y 'core' en ../../core
  if (relativePath.startsWith('core')) {
    return path.join(__dirname, '..', '..', relativePath);
  }
  return path.join(__dirname, '..', relativePath);
};

const paths = {
  home: app.getPath('home'),
  appData: app.getPath('appData'),
  localAppData: platform === 'win32' ? process.env.LOCALAPPDATA : app.getPath('appData'),
  hostInstallDir: platform === 'win32' 
    ? 'C:\\Program Files\\BloomNucleus\\native'
    : platform === 'darwin'
    ? '/Library/Application Support/BloomNucleus/native'
    : '/opt/bloom-nucleus/native',
  coreInstallDir: platform === 'win32'
    ? 'C:\\Program Files\\BloomNucleus\\core'
    : platform === 'darwin'
    ? '/Library/Application Support/BloomNucleus/core'
    : '/opt/bloom-nucleus/core',
  configDir: platform === 'win32'
    ? path.join(process.env.LOCALAPPDATA, 'BloomNucleus')
    : path.join(app.getPath('home'), '.config', 'BloomNucleus'),
  chromeUserData: platform === 'win32'
    ? path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'User Data')
    : platform === 'darwin'
    ? path.join(app.getPath('home'), 'Library', 'Application Support', 'Google', 'Chrome')
    : path.join(app.getPath('home'), '.config', 'google-chrome'),
    
  // --- CAMBIO AQUÍ: Definimos la carpeta contenedora del CRX ---
  crxDir: app.isPackaged
    ? path.join(process.resourcesPath, 'crx')                 // Producción
    : path.join(__dirname, '..', 'chrome-extension', 'crx')   // Desarrollo
};

// --- AGREGAR ESTO JUSTO DEBAJO DE }; ---
paths.extensionCrx = path.join(paths.crxDir, 'extension.crx');
paths.extensionId = path.join(paths.crxDir, 'id.json');

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

  mainWindow.loadFile(path.join(__dirname, '/src/index.html'));
  
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
// IPC HANDLERS
// ============================================================================

ipcMain.handle('get-system-info', async () => {
  return {
    platform,
    isDevMode,
    isPackaged: app.isPackaged,
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
      { name: 'Deteniendo servicios previos', fn: stopRunningServices },
      { name: 'Creando directorios', fn: createDirectories },
      { name: 'Respaldando instalación previa', fn: backupPreviousInstallation },
      { name: 'Instalando Native Host', fn: installHost },
      { name: 'Instalando Bloom Core (Python)', fn: installCore },
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

// INTEGRACIÓN ONBOARDING
ipcMain.handle('open-btip-config', async () => {
  try {
    mainWindow.webContents.send('server-status', { 
      status: 'checking', 
      message: 'Verificando servidor VSCode (puerto 4123)...' 
    });
    
    console.log('🔍 Esperando webview server...');
    const webviewStatus = await installHelpers.waitForWebviewServer(30000);
    
    if (!webviewStatus.ready) {
      console.warn('⚠️ Webview server no respondió');
      mainWindow.webContents.send('server-status', { 
        status: 'warning', 
        message: 'Servidor VSCode no detectado. Asegúrate de tener la extensión corriendo (F5 en VSCode).' 
      });
    } else {
      console.log('✅ Webview server detectado');
    }
    
    const url = `http://localhost:${installHelpers.WEBVIEW_SERVER_PORT}`;
    console.log('🌐 Abriendo configuración:', url);
    
    await shell.openExternal(url);
    
    return { success: true, url, webviewReady: webviewStatus.ready };
    
  } catch (error) {
    console.error('❌ Error abriendo BTIP config:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('check-onboarding-status', async () => {
  const state = await installHelpers.getOnboardingState(paths.configDir);
  return { success: true, state };
});

ipcMain.handle('get-chrome-profiles', async () => {
  const installer = new ChromeExtensionInstaller(paths);
  try {
    // Aquí es donde se llamaba al método que faltaba
    const profiles = await installer.getProfiles();
    const isRunning = await installer.isChromeRunning();
    
    console.log(`Perfiles detectados: ${profiles.length}`);
    return { success: true, profiles, isChromeRunning: isRunning };
  } catch (error) {
    console.error("Error al obtener perfiles:", error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('install-extension', async () => {
  try {
    const installer = getExtensionInstaller();
    const result = await installer.install();
    
    console.log(`✅ Extensión preparada (${result.method})`);
    
    return result;
    
  } catch (error) {
    console.error('❌ Error en instalación de extensión:', error);
    return { success: false, error: error.message };
  }
});  

ipcMain.handle('check-extension-heartbeat', async () => {
  const state = await readServerState();
  const port = state?.port || DEFAULT_PORT;
  return await checkHostStatus(port);
});



// ============================================================================
// CHROME LAUNCHER (CORREGIDO PARA INSTALACIÓN ENTERPRISE)
// ============================================================================

// Agrega esto en main.js
ipcMain.handle('launch-chrome-profile', async (event, { profileId, extensionPath }) => {
  try {
    // 1. Encontrar ejecutable
    const chromePath = await findChromeExecutable();
    if (!chromePath) throw new Error("No se encontró el ejecutable de Chrome");

    const targetProfile = profileId || "Default";
    console.log(`[Launcher] 🔄 Reiniciando Chrome. Perfil: ${targetProfile}`);

    // 2. Cerrar instancias previas de ese perfil (Solo Windows)
    if (process.platform === 'win32') {
        const scriptContent = `
            $p = "${targetProfile}"
            Get-WmiObject Win32_Process -Filter "name = 'chrome.exe'" | Where-Object { 
                $_.CommandLine -like "*--profile-directory=*$p*" 
            } | Stop-Process -Force -ErrorAction SilentlyContinue
        `;
        const tempScript = path.join(os.tmpdir(), `kill_chrome_${Date.now()}.ps1`);
        
        try {
            await fs.writeFile(tempScript, scriptContent);
            await execPromise(`powershell -ExecutionPolicy Bypass -File "${tempScript}"`, { timeout: 5000 });
            await fs.unlink(tempScript).catch(()=>/./);
        } catch (e) {
            console.log("No se pudo cerrar Chrome limpiamente:", e.message);
        }
        await new Promise(r => setTimeout(r, 1500)); // Esperar cierre
    }

    // 3. Preparar argumentos
    const args = [
      `--profile-directory=${targetProfile}`,
      // Importante: En Enterprise/Registry a veces ayuda forzar la relectura
      '--restore-last-session' 
    ];

    // 4. Lanzar
    const child = spawn(chromePath, args, { 
      detached: true, 
      stdio: 'ignore' 
    });
    child.unref();

    return { success: true };

  } catch (error) {
    console.error('Error lanzando Chrome:', error);
    return { success: false, error: error.message };
  }
});

// --- EN main.js ---

// 1. Agrega esto junto a los otros handlers
ipcMain.handle('update-extension-id', async (event, newId) => {
  try {
    // Validación básica de seguridad (solo letras minúsculas, 32 caracteres)
    if (!/^[a-z]{32}$/.test(newId)) {
      throw new Error("El ID debe tener 32 letras minúsculas (a-z).");
    }

    console.log(`[Manifest] Actualizando Allowed Origin con ID: ${newId}`);
    
    // Usamos el instalador manual para regenerar el manifiesto con el nuevo ID
    const installer = new ChromeManualInstaller(paths);
    await installer.generateNativeManifest(newId);
    
    // (Opcional) Re-registrar el host si fuera necesario, pero usualmente solo cambiar el JSON basta.
    // await installer.registerNativeHost(); 

    return { success: true };
  } catch (error) {
    console.error('Error actualizando ID:', error);
    return { success: false, error: error.message };
  }
});

// 2. Manejador para el Drag & Drop nativo
// --- EN main.js ---

// --- CORRECCIÓN EN main.js ---

// --- EN main.js (Reemplaza el bloque anterior de ondragstart) ---

ipcMain.on('ondragstart', (event, filePath) => {
  // 1. Validar que llegue algo
  if (!filePath || typeof filePath !== 'string') return;
  
  // 2. Resolver ruta absoluta
  const absolutePath = path.resolve(filePath);
  
  // 3. Log para saber que entramos
  console.log('[Drag] Iniciando arrastre SIN ICONO para:', absolutePath);

  // 4. Ejecutar arrastre con icono vacío (esto no falla nunca)
  try {
      event.sender.startDrag({
        file: absolutePath,
        icon: nativeImage.createEmpty() // <--- Usamos imagen vacía para probar
      });
  } catch (err) {
      console.error("[Drag] Error fatal:", err);
  }
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Detiene servicios anteriores agresivamente para liberar archivos
 */
async function stopRunningServices() {
  console.log('Stopping existing services aggressively...');
  try {
    if (platform === 'win32') {
      // 1. Deshabilitar auto-inicio
      await execPromise(`sc config BloomNucleusHost start= disabled`).catch(() => {});
      // 2. Detener servicio
      await execPromise(`sc stop BloomNucleusHost`).catch(() => {});
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // 3. Forzar muerte de proceso
      await execPromise(`taskkill /F /IM bloom-host.exe`).catch(() => {});
      
      // 4. Esperar liberación de handle
      await new Promise(resolve => setTimeout(resolve, 2000));
    } else {
      await execPromise(`pkill -9 bloom-host`).catch(() => {});
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  } catch (error) {
    console.log('Service stop warning (ignoring):', error.message);
  }
}

/**
 * Copia archivos forzando desbloqueo (unlink/rename)
 */
async function forceCopyFile(source, dest) {
  if (!await fs.pathExists(source)) {
    throw new Error(`Source not found: ${source}`);
  }

  // Si el destino existe, intentamos quitarlo
  if (await fs.pathExists(dest)) {
    let deleted = false;
    let attempts = 0;
    
    while (!deleted && attempts < 5) {
      try {
        await fs.unlink(dest);
        deleted = true;
      } catch (err) {
        if (err.code === 'EPERM' || err.code === 'EBUSY') {
          console.log(`File locked (${path.basename(dest)}), retrying... (${attempts + 1}/5)`);
          await new Promise(r => setTimeout(r, 1000));
          if (platform === 'win32') {
             await execPromise(`taskkill /F /IM bloom-host.exe`).catch(() => {});
          }
          attempts++;
        } else {
          throw err; 
        }
      }
    }

    // Plan B: Renombrar
    if (!deleted) {
      console.log(`Could not delete locked file ${path.basename(dest)}, renaming to .old`);
      const trashPath = dest + '.old.' + Date.now();
      try {
        if (await fs.pathExists(trashPath)) await fs.unlink(trashPath);
        await fs.rename(dest, trashPath);
      } catch (renameError) {
        console.error('Rename failed:', renameError.message);
      }
    }
  }

  // Copia final
  await fs.copy(source, dest, { overwrite: true });
}

async function installHost() {
  const hostBinary = platform === 'win32' ? 'bloom-host.exe' : 'bloom-host';
  const sourcePath = getResourcePath(path.join('native', 'bin', platform, hostBinary));
  const destPath = path.join(paths.hostInstallDir, hostBinary);

  console.log(`Installing Host Binary: ${hostBinary}`);
  await forceCopyFile(sourcePath, destPath);
  
  if (platform !== 'win32') {
    await fs.chmod(destPath, '755');
  }
}

async function installCore() {
  const sourcePath = getResourcePath('core');
  const destPath = paths.coreInstallDir;

  console.log(`Copying core from ${sourcePath} to ${destPath}`);

  if (!await fs.pathExists(sourcePath)) {
    throw new Error(`Core modules not found at: ${sourcePath}. Did you run 'npm run package'?`);
  }

  await fs.ensureDir(destPath);
  
  // Usamos fs.copy normal para directorios, filtrando __pycache__
  await fs.copy(sourcePath, destPath, { 
    overwrite: true,
    filter: (src) => !src.includes('__pycache__')
  });
}

async function copyDependencies() {
  if (platform !== 'win32') return;

  const requiredDlls = [
    'libgcc_s_seh-1.dll',
    'libstdc++-6.dll',
    'libwinpthread-1.dll'
  ];

  const sourceDllDir = getResourcePath(path.join('native', 'bin', platform));
  console.log('Copying dependencies (DLLs)...');
  
  for (const dll of requiredDlls) {
    const sourcePath = path.join(sourceDllDir, dll);
    const destPath = path.join(paths.hostInstallDir, dll);
    
    if (await fs.pathExists(sourcePath)) {
      await forceCopyFile(sourcePath, destPath);
    }
  }
}

async function createDirectories() {
  try {
    await fs.ensureDir(paths.hostInstallDir);
    await fs.ensureDir(paths.coreInstallDir);
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
    // Try copy instead of rename to avoid locking issues with backup
    try {
      await fs.copy(sourcePath, backupPath);
    } catch(e) {
      console.warn('Backup failed, skipping:', e.message);
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

// ... Resto de funciones (Windows Service, Checks, etc.) se mantienen ...
// Aseguramos que checkAdminPrivileges etc estén presentes

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
    server.once('error', (err) => resolve(err.code !== 'EADDRINUSE'));
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
    if (await checkPortAvailable(port)) return port;
  }
  throw new Error(`No ports available ${startPort}-${endPort}`);
}

async function checkVCRedistInstalled() {
  if (platform !== 'win32') return true;
  try {
    const systemRoot = process.env.SystemRoot || 'C:\\Windows';
    const system32 = path.join(systemRoot, 'System32');
    const sysWow64 = path.join(systemRoot, 'SysWOW64');
    const requiredDlls = ['vcruntime140.dll', 'msvcp140.dll'];
    
    for (const dll of requiredDlls) {
      const exists64 = await fs.pathExists(path.join(system32, dll));
      const exists32 = await fs.pathExists(path.join(sysWow64, dll));
      if (!exists64 && !exists32) return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function installWindowsService(port) {
  const hostBinary = 'bloom-host.exe';
  const binaryPath = path.join(paths.hostInstallDir, hostBinary);
  
  console.log('=== Windows Service Installation ===');
  
  if (!await fs.pathExists(binaryPath)) {
    throw new Error(`Binary not found: ${binaryPath}`);
  }
  
  try {
    await execPromise(`sc query ${SERVICE_NAME}`);
    // Asegurar que está stopped antes de reconfigurar
    await execPromise(`sc stop ${SERVICE_NAME}`).catch(() => {});
    await execPromise(`sc delete ${SERVICE_NAME}`);
    await new Promise(resolve => setTimeout(resolve, 2000));
  } catch {
    console.log('No existing service');
  }
  
  // Resetear config a auto-start
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
  while (Date.now() - startTime < timeout) {
    if (!(await checkPortAvailable(port))) return true;
    await new Promise(resolve => setTimeout(resolve, 500));
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
    allowed_origins: extensionId ? [`chrome-extension://${extensionId}/`] : []
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
  const nativeMessagingDir = path.join(paths.home, 'Library', 'Application Support', 'Google', 'Chrome', 'NativeMessagingHosts');
  await fs.ensureDir(nativeMessagingDir);
  const destPath = path.join(nativeMessagingDir, 'com.bloom.nucleus.bridge.json');
  await fs.copy(manifestPath, destPath);
}

async function registerLinuxNativeHost(manifestPath) {
  const nativeMessagingDir = path.join(paths.home, '.config', 'google-chrome', 'NativeMessagingHosts');
  await fs.ensureDir(nativeMessagingDir);
  const destPath = path.join(nativeMessagingDir, 'com.bloom.nucleus.bridge.json');
  await fs.copy(manifestPath, destPath);
}

async function detectChromeProfiles() {
  const profiles = [];
  try {
    if (!await fs.pathExists(paths.chromeUserData)) return profiles;
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
              if (prefs.profile && prefs.profile.name) profileName = `${item} (${prefs.profile.name})`;
            } catch (e) {}
            profiles.push({ id: item, name: profileName, path: itemPath });
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
  try { return await fs.readJson(statePath); } catch { return null; }
}

async function saveConfig(config) {
  const configPath = path.join(paths.configDir, 'config', 'config.json');
  const fullConfig = {
    version: '1.0.0',
    installedAt: new Date().toISOString(),
    platform,
    devMode: true,
    hostPath: path.join(paths.hostInstallDir, platform === 'win32' ? 'bloom-host.exe' : 'bloom-host'),
    corePath: paths.coreInstallDir,
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

function checkHostStatus(port) {
  return new Promise((resolve) => {
    const client = new net.Socket();
    const timeout = setTimeout(() => {
      client.destroy();
      resolve({ hostRunning: false, chromeConnected: false, error: 'timeout' });
    }, 1000);
    
    client.connect(port, '127.0.0.1', () => {
      const request = JSON.stringify({ jsonrpc: "2.0", method: "get_status", id: 1 }) + '\n';
      client.write(request);
    });
    
    client.on('data', (data) => {
      clearTimeout(timeout);
      try {
        const response = JSON.parse(data.toString());
        const isChromeConnected = response.result && response.result.chrome_connected === true;
        client.destroy();
        resolve({ hostRunning: true, chromeConnected: isChromeConnected });
      } catch (e) {
        client.destroy();
        resolve({ hostRunning: true, chromeConnected: false });
      }
    });
    
    client.on('error', (err) => {
      clearTimeout(timeout);
      client.destroy();
      resolve({ hostRunning: false, chromeConnected: false, error: err.message });
    });
  });
}

function getExtensionInstaller() {
  if (CURRENT_STRATEGY === INSTALL_STRATEGY.MANUAL) {
    return new ChromeManualInstaller(paths);
  } else {
    return new ChromeEnterpriseInstaller(paths);
  }
}

// Función auxiliar para encontrar Chrome
async function findChromeExecutable() {
  if (process.platform === 'win32') {
    const commonPaths = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      path.join(process.env.LOCALAPPDATA, 'Google\\Chrome\\Application\\chrome.exe')
    ];
    for (const p of commonPaths) {
      if (await fs.pathExists(p)) return p;
    }
  } else if (process.platform === 'darwin') {
    return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  } else {
    return 'google-chrome';
  }
  return null;
}

