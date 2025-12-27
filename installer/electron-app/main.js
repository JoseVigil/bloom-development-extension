const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const crypto = require('crypto');
const { exec } = require('child_process');
const { execSync, spawn } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

// ============================================================================
// 1. CONFIGURACIÓN DE RUTAS (USER SCOPE / %LOCALAPPDATA%)
// ============================================================================

// Función para resolver recursos en Dev vs Prod
const getResourcePath = (resourceName) => {
  if (app.isPackaged) {
    const finalName = resourceName === 'core' ? 'brain' : resourceName;
    return path.join(process.resourcesPath, finalName);
  }
  const installerRoot = path.join(__dirname, '..'); 
  const repoRoot = path.join(__dirname, '..', '..');

  switch (resourceName) {
    case 'runtime': return path.join(installerRoot, 'resources', 'runtime');
    case 'brain':   return path.join(repoRoot, 'brain');
    case 'native':  return path.join(installerRoot, 'native', 'bin', 'win32'); // ✅ FIX
    case 'extension': return path.join(installerRoot, 'chrome-extension', 'src');
    case 'assets': return path.join(installerRoot, 'electron-app', 'assets');
    default: return path.join(installerRoot, 'resources', resourceName);
  }
};

const paths = {
  // BASE: %LOCALAPPDATA%\BloomNucleus
  get bloomBase() {
    return process.platform === 'win32' 
      ? path.join(process.env.LOCALAPPDATA, 'BloomNucleus')
      : path.join(app.getPath('home'), '.local', 'share', 'BloomNucleus');
  },
  
  // DESTINOS
  get engineDir() { return path.join(this.bloomBase, 'engine'); },
  get runtimeDir() { return path.join(this.engineDir, 'runtime'); },
  get brainDir()   { return path.join(this.runtimeDir, 'brain'); }, // ❌ YA NO SE USA
  get nativeDir()  { return path.join(this.bloomBase, 'native'); },
  get extensionDir() { return path.join(this.bloomBase, 'extension'); },
  get configDir()  { return path.join(this.bloomBase, 'config'); },
  get configFile() { return path.join(this.configDir, 'installer-config.json'); },

  // FUENTES
  runtimeSource: getResourcePath('runtime'),
  brainSource:   getResourcePath('brain'),
  nativeSource:  getResourcePath('native'),
  extensionSource: getResourcePath('extension'),

  // BINARIOS
  get pythonExe() {
    return path.join(this.runtimeDir, process.platform === 'win32' ? 'python.exe' : 'python3');
  },
  get hostBinary() {
    return path.join(this.nativeDir, process.platform === 'win32' ? 'bloom-host.exe' : 'bloom-host');
  },
  get manifestPath() {
    return path.join(this.nativeDir, 'com.bloom.nucleus.bridge.json');
  }
};

// ============================================================================
// 2. LÓGICA DE INSTALACIÓN (GOLDEN PATH)
// ============================================================================

ipcMain.handle('brain:install-extension', async () => {
  try {
    console.log(`=== INICIANDO DESPLIEGUE MODO DIOS (${process.platform}) ===`);
    await cleanupProcesses();
    await createDirectories();
    await installCore();
    await installNativeHost();
    await installExtension();
    const extensionId = await configureBridge();
    const profileId = await initializeBrainProfile();
    console.log('=== DESPLIEGUE FINALIZADO CON ÉXITO ===');
    return { success: true, extensionId, profileId };
  } catch (error) {
    console.error('❌ ERROR FATAL EN INSTALACIÓN:', error);
    return { success: false, error: error.message };
  }
});

// --- FUNCIONES AUXILIARES DE FASE 1 ---
async function createDirectories() {
  const dirs = [paths.bloomBase, paths.engineDir, paths.runtimeDir, paths.nativeDir, paths.extensionDir, paths.configDir];
  for (const d of dirs) await fs.ensureDir(d);
}

async function cleanupProcesses() {
  if (process.platform === 'win32') {
    try { 
      execSync('taskkill /F /IM bloom-host.exe /T', { stdio: 'ignore' }); 
    } catch (e) {}
  }
  
  // ✅ NUEVO: Limpiar brain del runtime si existe
  if (await fs.pathExists(paths.brainDir)) {
    console.log("🧹 Eliminando brain/ del runtime (ya no se usa)...");
    await fs.remove(paths.brainDir);
  }
  
  await fs.emptyDir(paths.extensionDir);
}

async function installCore() {
  console.log("📦 Instalando Motor IA (solo Python runtime)...");
  if (!fs.existsSync(paths.runtimeSource)) {
    throw new Error("Runtime Source no encontrado. Ejecuta 'npm run prepare:runtime'");
  }
  
  // ✅ Solo copiar Python runtime, NO brain
  await fs.copy(paths.runtimeSource, paths.runtimeDir, { 
    overwrite: true,
    filter: (src) => {
      // Excluir brain si estuviera en el runtime source
      return !src.includes('brain');
    }
  });
  
  console.log("   ✅ Python runtime instalado");
  console.log("   ℹ️  Brain se ejecutará desde el plugin directamente");
}

async function installNativeHost() {
  console.log("📦 Instalando Host Nativo...");
  if (!fs.existsSync(paths.nativeSource)) {
    throw new Error("Native Source no encontrado en: " + paths.nativeSource);
  }
  
  // Verificar que bloom-host.exe existe
  const hostExe = path.join(paths.nativeSource, 'bloom-host.exe');
  if (!fs.existsSync(hostExe)) {
    throw new Error(`bloom-host.exe no encontrado en: ${paths.nativeSource}`);
  }
  
  await fs.copy(paths.nativeSource, paths.nativeDir, { overwrite: true });
  console.log("   ✅ Archivos copiados");
  
  // ✅ Iniciar el host
  await startNativeHost();
}

async function startNativeHost() {
  console.log("🚀 Iniciando Native Host...");
  
  const hostExe = paths.hostBinary;
  
  if (!fs.existsSync(hostExe)) {
    throw new Error(`Host binary no encontrado: ${hostExe}`);
  }
  
  // Spawn detached para que sobreviva al instalador
  const hostProcess = spawn(hostExe, [], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  });
  
  hostProcess.unref();
  
  console.log(`   ✅ Host iniciado (PID: ${hostProcess.pid})`);
  
  // Guardar PID para cleanup futuro
  const config = fs.existsSync(paths.configFile) ? await fs.readJson(paths.configFile) : {};
  config.hostPid = hostProcess.pid;
  await fs.writeJson(paths.configFile, config, { spaces: 2 });
}

async function installExtension() {
  console.log("📦 Desplegando Extensión (Unpacked)...");
  if (!fs.existsSync(paths.extensionSource)) {
    throw new Error("Extension Source no encontrada");
  }
  await fs.copy(paths.extensionSource, paths.extensionDir, { overwrite: true });
}

// --- FUNCIONES AUXILIARES DE FASE 2 (EL PUENTE) ---

async function configureBridge() {
  console.log("🔗 Configurando Puente Nativo...");

  const extManifestPath = path.join(paths.extensionDir, 'manifest.json');
  if (!fs.existsSync(extManifestPath)) {
    throw new Error("Manifest de extensión no encontrado en destino");
  }
  
  const extManifest = await fs.readJson(extManifestPath);
  if (!extManifest.key) {
    throw new Error("La extensión no tiene una 'key' fija en manifest.json");
  }
  
  const extensionId = calculateExtensionId(extManifest.key);
  console.log(`   🆔 ID Calculado: ${extensionId}`);

  const hostManifest = {
    name: "com.bloom.nucleus.bridge",
    description: "Bloom Nucleus Host",
    path: paths.hostBinary,
    type: "stdio",
    allowed_origins: [ `chrome-extension://${extensionId}/` ]
  };
  await fs.writeJson(paths.manifestPath, hostManifest, { spaces: 2 });

  if (process.platform === 'win32') {
    const regKey = 'HKCU\\SOFTWARE\\Google\\Chrome\\NativeMessagingHosts\\com.bloom.nucleus.bridge';
    const jsonPath = paths.manifestPath.replace(/\\/g, '\\\\');
    const cmd = `reg add "${regKey}" /ve /d "${jsonPath}" /f`;
    await execPromise(cmd);
    console.log("   ✅ Host registrado en HKCU");
  }

  return extensionId;
}

function calculateExtensionId(base64Key) {
  const buffer = Buffer.from(base64Key, 'base64');
  const hash = crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 32);
  
  return hash.split('').map(char => {
    const code = parseInt(char, 16);
    return String.fromCharCode(97 + code);
  }).join('');
}

// --- FUNCIONES AUXILIARES DE FASE 3 (BRAIN INIT) ---

async function initializeBrainProfile() {
  console.log("🧠 Inicializando Perfil Maestro...");
  
  const python = paths.pythonExe;
  const brainPath = paths.brainSource;
  
  // ✅ Configurar python310._pth con RUTAS ABSOLUTAS
  const pthFile = path.join(paths.runtimeDir, 'python310._pth');
  const pthContent = [
    '.',
    'python310.zip',
    path.dirname(brainPath),           // Parent de brain/ (para -m brain)
    path.join(brainPath, 'libs'),      // brain/libs (dependencias)
    'import site'
  ].join('\n');
  
  await fs.writeFile(pthFile, pthContent, 'utf8');
  console.log("   ✅ python310._pth:", pthContent.split('\n').join(', '));
  
  // ✅ Ejecutar con CWD en runtime (donde está python.exe)
  const command = `"${python}" -m brain --json profile create "Master Worker"`;

  try {
    const { stdout } = await execPromise(command, { 
      timeout: 15000,
      cwd: paths.runtimeDir  // ✅ CWD = donde está python.exe
    });
    
    console.log("   → Respuesta:", stdout.trim());
    
    let result = JSON.parse(stdout);
    let profileId = result.data?.id || result.id;

    if (!profileId && Array.isArray(result)) {
      profileId = result[0]?.id;
    }

    if (!profileId) throw new Error("No se pudo obtener el Profile ID");
    
    console.log(`   👤 Perfil Listo: ${profileId}`);
    
    await fs.ensureDir(paths.configDir);
    const config = fs.existsSync(paths.configFile) ? await fs.readJson(paths.configFile) : {};
    config.masterProfileId = profileId;
    await fs.writeJson(paths.configFile, config, { spaces: 2 });

    return profileId;
  } catch (error) {
    console.error("Error creando perfil:", error);
    throw new Error(`Fallo al crear perfil: ${error.message}`);
  }
}

// ============================================================================
// 3. LANZAMIENTO (IGNITION)
// ============================================================================

ipcMain.handle('brain:launch', async () => {
  try {
    const config = await fs.readJson(paths.configFile);
    const profileId = config.masterProfileId;
    if (!profileId) throw new Error("No hay perfil maestro");
    
    const cmd = `"${paths.pythonExe}" -m brain --json profile launch "${profileId}" --url "https://chatgpt.com"`;
    
    console.log("🚀 EJECUTANDO:", cmd);
    
    const output = execSync(cmd, { 
      cwd: paths.runtimeDir,  // ✅ CWD = runtime
      encoding: 'utf8',
      timeout: 10000
    });
    
    console.log("✅ OUTPUT:", output);
    return { success: true, output };
    
  } catch (error) {
    console.error("❌ ERROR:", error.message);
    return { success: false, error: error.message };
  }
});

// ============================================================================
// 4. HEARTBEAT CORREGIDO
// ============================================================================

ipcMain.handle('extension:heartbeat', async () => {
  try {
    const net = require('net');
    
    return new Promise((resolve) => {
      const client = new net.Socket();
      
      client.setTimeout(2000);
      
      client.connect(5678, '127.0.0.1', () => {
        client.destroy();
        resolve({ chromeConnected: true });
      });
      
      client.on('error', () => {
        resolve({ chromeConnected: false });
      });
      
      client.on('timeout', () => {
        client.destroy();
        resolve({ chromeConnected: false });
      });
    });
  } catch (error) {
    return { chromeConnected: false, error: error.message };
  }
});

// ============================================================================
// 5. HANDLERS DE SISTEMA E INFO
// ============================================================================

ipcMain.handle('system:info', async () => {  
  return {
    platform: process.platform,
    isDevMode: !app.isPackaged,
    isPackaged: app.isPackaged,
    paths: {
      hostInstallDir: paths.nativeDir,
      configDir: paths.configDir,
      brainDir: paths.brainSource, // ✅ Apunta al plugin
      extensionDir: paths.extensionDir
    }
  };
});

ipcMain.handle('preflight-checks', async () => {
  return {
    hasAdmin: true,
    diskSpace: true,
    vcRedistInstalled: await checkVCRedistInstalled()
  };
});

ipcMain.handle('open-logs-folder', async () => {
  const logsDir = path.join(paths.configDir, 'logs');
  await fs.ensureDir(logsDir);
  await shell.openPath(logsDir);
});

ipcMain.handle('open-folder', async (event, folderPath) => {
  await shell.openPath(folderPath);
});

ipcMain.handle('open-chrome-extensions', async () => {
  await shell.openExternal('chrome://extensions/');
});

ipcMain.handle('open-external', async (event, url) => {
  await shell.openExternal(url);
});

async function checkVCRedistInstalled() {
  if (process.platform !== 'win32') return true;
  
  try {
    const systemRoot = process.env.SystemRoot || 'C:\\Windows';
    const system32 = path.join(systemRoot, 'System32');
    const requiredDlls = ['vcruntime140.dll', 'msvcp140.dll'];
    
    for (const dll of requiredDlls) {
      const exists = await fs.pathExists(path.join(system32, dll));
      if (!exists) return false;
    }
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// 6. BOILERPLATE ELECTRON
// ============================================================================
let mainWindow;
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900, 
    height: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'assets', 'bloom.ico')
  });
  
  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
  mainWindow.webContents.openDevTools();
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { 
  if (process.platform !== 'darwin') app.quit(); 
});