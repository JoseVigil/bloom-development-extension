const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const crypto = require('crypto');
const { exec } = require('child_process');
const { execSync } = require('child_process');
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
    case 'native':  return path.join(installerRoot, 'native');
    case 'extension': return path.join(installerRoot, 'chrome-extension', 'src'); // ✅ CORRECTO
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
  get brainDir()   { return path.join(this.runtimeDir, 'brain'); }, // Brain dentro de Runtime
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

ipcMain.handle('brain:install-extension', async () => {  // ← CAMBIO
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
    try { require('child_process').execSync('taskkill /F /IM bloom-host.exe /T', { stdio: 'ignore' }); } catch (e) {}
  }
  // Limpieza simple de carpetas para asegurar versión fresca
  await fs.emptyDir(paths.extensionDir); 
  // Nota: No borramos engineDir para no perder tiempo si ya existe, fs.copy con overwrite basta
}

async function installCore() {
  console.log("📦 Instalando Motor IA...");
  if (!fs.existsSync(paths.runtimeSource)) throw new Error("Runtime Source no encontrado. Ejecuta 'npm run prepare:brain'");
  
  await fs.copy(paths.runtimeSource, paths.runtimeDir, { overwrite: true });
  await fs.copy(paths.brainSource, paths.brainDir, { 
    overwrite: true, 
    filter: (src) => !src.includes('__pycache__') && !src.includes('.git')
  });
  
  // Inyección de Bootloader en __main__.py (Para que encuentre libs)
  const mainPy = path.join(paths.brainDir, '__main__.py');
  if (fs.existsSync(mainPy)) {
    let content = fs.readFileSync(mainPy, 'utf8');
    if (!content.includes("[Bloom Installer]")) {
      const bootloader = `import sys\nimport os\nlibs_dir = os.path.join(os.path.dirname(__file__), 'libs')\nif libs_dir not in sys.path:\n    sys.path.insert(0, libs_dir)\n# [Bloom Installer] Bootloader End\n\n`;
      fs.writeFileSync(mainPy, bootloader + content);
    }
  }
}

async function installNativeHost() {
  console.log("📦 Instalando Host Nativo...");
  if (!fs.existsSync(paths.nativeSource)) throw new Error("Native Source no encontrado");
  await fs.copy(paths.nativeSource, paths.nativeDir, { overwrite: true });
}

async function installExtension() {
  console.log("📦 Desplegando Extensión (Unpacked)...");
  if (!fs.existsSync(paths.extensionSource)) throw new Error("Extension Source no encontrada");
  await fs.copy(paths.extensionSource, paths.extensionDir, { overwrite: true });
}

// --- FUNCIONES AUXILIARES DE FASE 2 (EL PUENTE) ---

async function configureBridge() {
  console.log("🔗 Configurando Puente Nativo...");

  // 1. Calcular ID desde el manifest.json de la extensión instalada
  const extManifestPath = path.join(paths.extensionDir, 'manifest.json');
  if (!fs.existsSync(extManifestPath)) throw new Error("Manifest de extensión no encontrado en destino");
  
  const extManifest = await fs.readJson(extManifestPath);
  if (!extManifest.key) throw new Error("La extensión no tiene una 'key' fija en manifest.json. Modo Dios requiere key.");
  
  const extensionId = calculateExtensionId(extManifest.key);
  console.log(`   🆔 ID Calculado: ${extensionId}`);

  // 2. Generar Manifiesto del Host
  const hostManifest = {
    name: "com.bloom.nucleus.bridge",
    description: "Bloom Nucleus Host",
    path: paths.hostBinary,
    type: "stdio",
    allowed_origins: [ `chrome-extension://${extensionId}/` ]
  };
  await fs.writeJson(paths.manifestPath, hostManifest, { spaces: 2 });

  // 3. Registrar en Windows (HKCU)
  if (process.platform === 'win32') {
    const regKey = 'HKCU\\SOFTWARE\\Google\\Chrome\\NativeMessagingHosts\\com.bloom.nucleus.bridge';
    const jsonPath = paths.manifestPath.replace(/\\/g, '\\\\'); // Escapar para registro
    // Usamos reg.exe que no pide admin para HKCU
    const cmd = `reg add "${regKey}" /ve /d "${jsonPath}" /f`;
    await execPromise(cmd);
    console.log("   ✅ Host registrado en HKCU");
  }

  return extensionId;
}

/**
 * Calcula el ID de Chrome basado en la Key pública (Algoritmo SHA256 -> a-p mapping)
 */
function calculateExtensionId(base64Key) {
  const buffer = Buffer.from(base64Key, 'base64');
  const hash = crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 32);
  
  // Mapeo de caracteres: 0-9 -> a-j, a-f -> k-p
  return hash.split('').map(char => {
    const code = parseInt(char, 16);
    return String.fromCharCode(97 + code); // 97 = 'a'
  }).join('');
}

// --- FUNCIONES AUXILIARES DE FASE 3 (BRAIN INIT) ---

async function initializeBrainProfile() {
  console.log("🧠 Inicializando Perfil Maestro...");
  
  const python = paths.pythonExe;
  
  // CORRECCIÓN: El flag --json va ANTES del subcomando profile
  const command = `"${python}" -I -m brain --json profile create "Master Worker"`;

  try {
    const { stdout } = await execPromise(command, { timeout: 15000 });
    
    console.log("   → Respuesta cruda de Brain:", stdout.trim()); // Debug útil

    // Parseamos la salida JSON
    let result;
    try {
        result = JSON.parse(stdout);
    } catch (e) {
        throw new Error(`La salida no es JSON válido: ${stdout.substring(0, 100)}...`);
    }

    // Buscamos el ID (puede venir directo o en un array)
    let profileId = result.data?.id || result.id;  // ← FIX AQUÍ

    if (!profileId && Array.isArray(result)) {
        profileId = result[0]?.id;
    }

    if (!profileId) {
        console.error("Estructura recibida:", JSON.stringify(result, null, 2));
        throw new Error("No se pudo obtener el Profile ID de brain");
    }
    console.log(`   👤 Perfil Listo: ${profileId}`);
    
    // Guardamos el ID en config
    await fs.ensureDir(paths.configDir);
    const config = fs.existsSync(paths.configFile) ? await fs.readJson(paths.configFile) : {};
    config.masterProfileId = profileId;
    await fs.writeJson(paths.configFile, config, { spaces: 2 });

    return profileId;
  } catch (error) {
    console.error("Error creando perfil:", error);
    // IMPORTANTE: Si falla la creación del perfil, lanzamos el error para que la UI lo sepa
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
    
    const cmd = `"${paths.pythonExe}" -I -m brain --json profile launch "${profileId}" --url "https://chatgpt.com"`;
    console.log("🚀 EJECUTANDO:", cmd);
    console.log("📂 CWD:", paths.runtimeDir);
    
    // BLOQUEAR HASTA QUE TERMINE
    const output = execSync(cmd, { 
      cwd: paths.runtimeDir,
      encoding: 'utf8',
      timeout: 10000
    });
    
    console.log("✅ OUTPUT:", output);
    return { success: true, output };
    
  } catch (error) {
    console.error("❌ ERROR COMPLETO:", error.message);
    return { success: false, error: error.message };
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
      brainDir: paths.brainDir,
      extensionDir: paths.extensionDir
    }
  };
});

ipcMain.handle('preflight-checks', async () => {
  return {
    hasAdmin: true, // En user scope no necesitamos admin
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

ipcMain.handle('extension:heartbeat', async () => {
  try {
    // Verificar si el host está corriendo (puerto 5678 por defecto)
    const http = require('http');
    
    return new Promise((resolve) => {
      const req = http.get('http://localhost:5678/health', (res) => {
        resolve({ chromeConnected: res.statusCode === 200 });
      });
      
      req.on('error', () => {
        resolve({ chromeConnected: false });
      });
      
      req.setTimeout(1000, () => {
        req.destroy();
        resolve({ chromeConnected: false });
      });
    });
    
  } catch (error) {
    return { chromeConnected: false, error: error.message };
  }
});

// Helper: Verificar VC++ Redistributables (Windows)
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
// 4. BOILERPLATE ELECTRON
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
  mainWindow.webContents.openDevTools(); // Debug
}
app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });