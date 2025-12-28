const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const crypto = require('crypto');
const { exec, execSync, spawn } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const HealthCheckManager = require('./src/healthCheck');

// ============================================================================
// 1. CONFIGURACIÓN DE RUTAS (USER SCOPE / %LOCALAPPDATA%)
// ============================================================================

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
    case 'native':  return path.join(installerRoot, 'native', 'bin', 'win32');
    case 'nssm':    return path.join(installerRoot, 'native', 'nssm', 'win64');
    case 'extension': return path.join(installerRoot, 'chrome-extension', 'src');
    case 'assets': return path.join(installerRoot, 'electron-app', 'assets');
    default: return path.join(installerRoot, 'resources', resourceName);
  }
};

const SERVICE_NAME = 'BloomNucleusHost';
const DEFAULT_PORT = 5678;

const paths = {
  get bloomBase() {
    return process.platform === 'win32' 
      ? path.join(process.env.LOCALAPPDATA, 'BloomNucleus')
      : path.join(app.getPath('home'), '.local', 'share', 'BloomNucleus');
  },
  
  get engineDir() { return path.join(this.bloomBase, 'engine'); },
  get runtimeDir() { return path.join(this.engineDir, 'runtime'); },
  get brainDir()   { return path.join(this.runtimeDir, 'brain'); },
  get nativeDir()  { return path.join(this.bloomBase, 'native'); },
  get extensionDir() { return path.join(this.bloomBase, 'extension'); },
  get configDir()  { return path.join(this.bloomBase, 'config'); },
  get configFile() { return path.join(this.configDir, 'installer-config.json'); },

  runtimeSource: getResourcePath('runtime'),
  brainSource:   getResourcePath('brain'),
  nativeSource:  getResourcePath('native'),
  extensionSource: getResourcePath('extension'),
  nssmSource:    getResourcePath('nssm'),

  get pythonExe() {
    return path.join(this.runtimeDir, process.platform === 'win32' ? 'python.exe' : 'python3');
  },
  get hostBinary() {
    return path.join(this.nativeDir, process.platform === 'win32' ? 'bloom-host.exe' : 'bloom-host');
  },
  get nssmExe() {
    return path.join(this.nativeDir, 'nssm.exe');
  },
  get manifestPath() {
    return path.join(this.nativeDir, 'com.bloom.nucleus.bridge.json');
  }
};

// ============================================================================
// 2. PRIVILEGIOS
// ============================================================================

async function isElevated() {
  if (process.platform !== 'win32') return true;
  try {
    execSync('net session', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function relaunchAsAdmin() {
  const exe = process.execPath;
  const args = process.argv.slice(1).join(' ');

  spawn('powershell', [
    '-Command',
    `Start-Process "${exe}" -ArgumentList "${args}" -Verb RunAs`
  ], {
    detached: true,
    stdio: 'ignore'
  });

  app.quit();
}

// ============================================================================
// 3. LÓGICA DE INSTALACIÓN
// ============================================================================

ipcMain.handle('brain:install-extension', async () => {
  try {
    if (process.platform === 'win32' && !(await isElevated())) {
      console.log('⚠️ Se requieren privilegios de administrador para instalar el servicio.');
      console.log('🔄 Solicitando elevación...');
      relaunchAsAdmin();
      return { success: false, relaunching: true, message: 'Relanzando con privilegios de administrador...' };
    }

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

async function createDirectories() {
  const dirs = [paths.bloomBase, paths.engineDir, paths.runtimeDir, paths.nativeDir, paths.extensionDir, paths.configDir];
  for (const d of dirs) await fs.ensureDir(d);
}

async function cleanupProcesses() {
  if (process.platform === 'win32') {
    await removeService(SERVICE_NAME);
    
    try { 
      execSync('taskkill /F /IM bloom-host.exe /T', { stdio: 'ignore' }); 
    } catch (e) {}
  }
  
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
  
  await fs.copy(paths.runtimeSource, paths.runtimeDir, { 
    overwrite: true,
    filter: (src) => {
      return !src.includes('brain');
    }
  });
  
  console.log("   ✅ Python runtime instalado");
  console.log("   ℹ️  Brain se ejecutará desde el plugin directamente");
}

function serviceExists(name) {
  try {
    execSync(`sc query ${name}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

async function removeService(name) {
  if (!serviceExists(name)) {
    console.log(`   ℹ️  Servicio ${name} no existe, omitiendo limpieza`);
    return;
  }

  console.log(`   🧹 Removiendo servicio existente: ${name}`);
  
  const nssm = paths.nssmExe;
  
  // Estrategia 1: NSSM si existe
  if (fs.existsSync(nssm)) {
    try {
      console.log(`   🛑 Deteniendo con NSSM...`);
      execSync(`"${nssm}" stop ${name}`, { stdio: 'ignore', timeout: 10000 });
      await new Promise(r => setTimeout(r, 3000));
      
      console.log(`   🗑️  Removiendo con NSSM...`);
      execSync(`"${nssm}" remove ${name} confirm`, { stdio: 'ignore', timeout: 10000 });
      
      // Verificar eliminación
      for (let i = 0; i < 10; i++) {
        if (!serviceExists(name)) {
          console.log(`   ✅ Servicio eliminado con NSSM`);
          return;
        }
        await new Promise(r => setTimeout(r, 1000));
      }
      console.warn(`   ⚠️  NSSM no eliminó el servicio completamente`);
    } catch (nssmError) {
      console.warn(`   ⚠️  NSSM falló:`, nssmError.message);
    }
  }

  // Estrategia 2: Matar procesos relacionados primero
  try {
    console.log(`   💀 Terminando procesos bloom-host.exe...`);
    execSync('taskkill /F /IM bloom-host.exe /T', { stdio: 'ignore', timeout: 5000 });
    await new Promise(r => setTimeout(r, 2000));
  } catch {}

  // Estrategia 3: PowerShell con privilegios elevados
  try {
    console.log(`   🛑 Deteniendo con PowerShell...`);
    execSync(`powershell -Command "Stop-Service -Name '${name}' -Force -ErrorAction SilentlyContinue"`, { 
      stdio: 'ignore',
      timeout: 10000 
    });
    await new Promise(r => setTimeout(r, 3000));
  } catch {}

  // Estrategia 4: sc stop
  try {
    console.log(`   🛑 Deteniendo con sc...`);
    execSync(`sc stop ${name}`, { stdio: 'ignore', timeout: 5000 });
    await new Promise(r => setTimeout(r, 2000));
  } catch {}

  // Verificar que esté detenido
  console.log(`   ⏳ Esperando detención completa...`);
  let stopped = false;
  for (let i = 0; i < 20; i++) {
    try {
      const out = execSync(`sc query ${name}`, { timeout: 3000 }).toString();
      if (out.includes('STOPPED') || !out.includes('RUNNING')) {
        console.log(`   ✅ Servicio detenido`);
        stopped = true;
        break;
      }
    } catch {}
    await new Promise(r => setTimeout(r, 1000));
  }

  if (!stopped) {
    console.warn(`   ⚠️  El servicio no responde, forzando eliminación...`);
  }

  // Estrategia 5: Eliminar con sc delete
  try {
    console.log(`   🗑️  Eliminando servicio con sc delete...`);
    execSync(`sc delete ${name}`, { stdio: 'pipe', timeout: 5000 });
    await new Promise(r => setTimeout(r, 3000));
  } catch (delErr) {
    console.warn(`   ⚠️  sc delete falló:`, delErr.message);
  }

  // Verificar eliminación final
  console.log(`   ⏳ Esperando eliminación completa...`);
  for (let i = 0; i < 20; i++) {
    if (!serviceExists(name)) {
      console.log(`   ✅ Servicio eliminado completamente`);
      return;
    }
    await new Promise(r => setTimeout(r, 1000));
  }

  // Si llegamos aquí, el servicio sigue existiendo
  console.warn(`   ⚠️  El servicio aún existe después de todos los intentos`);
  console.warn(`   💡 Intentando continuar de todas formas...`);
}

async function installWindowsService() {
  const binary = paths.hostBinary;
  const nssm = paths.nssmExe;

  if (!fs.existsSync(binary)) {
    throw new Error(`Host binary no encontrado: ${binary}`);
  }

  console.log("🔧 Configurando servicio de Windows con NSSM...");

  await removeService(SERVICE_NAME);

  if (!fs.existsSync(nssm)) {
    console.warn("   ⚠️  NSSM no encontrado, intentando con sc directo...");
    await installWindowsServiceDirect();
    return;
  }

  // Si el servicio aún existe después de removeService, no intentar crear uno nuevo
  if (serviceExists(SERVICE_NAME)) {
    console.warn("   ⚠️  El servicio aún existe y no se pudo eliminar");
    console.warn("   💡 Intentando reconfigurar el servicio existente...");
    
    try {
      // Intentar reconfigurar en lugar de crear
      execSync(`"${nssm}" set ${SERVICE_NAME} Application "${binary}"`, { stdio: 'ignore' });
      execSync(`"${nssm}" set ${SERVICE_NAME} AppParameters "--server --port=${DEFAULT_PORT}"`, { stdio: 'ignore' });
      execSync(`"${nssm}" set ${SERVICE_NAME} AppDirectory "${paths.nativeDir}"`, { stdio: 'ignore' });
      
      console.log(`   🚀 Iniciando servicio reconfigurado: ${SERVICE_NAME}`);
      execSync(`"${nssm}" start ${SERVICE_NAME}`, { stdio: 'pipe' });
      console.log("   ✅ Servicio reconfigurado e iniciado");
      return;
    } catch (reconfigError) {
      console.error("   ❌ No se pudo reconfigurar el servicio existente");
      throw new Error(`El servicio ${SERVICE_NAME} existe y no se puede modificar. Ejecuta manualmente: sc delete ${SERVICE_NAME}`);
    }
  }

  console.log(`   ➕ Instalando servicio con NSSM: ${SERVICE_NAME}`);
  
  try {
    execSync(
      `"${nssm}" install ${SERVICE_NAME} "${binary}" --server --port=${DEFAULT_PORT}`,
      { stdio: 'pipe' }
    );
  } catch (installError) {
    console.error("   ❌ Error instalando servicio:", installError.message);
    throw new Error(`No se pudo instalar el servicio: ${installError.message}`);
  }

  try {
    execSync(`"${nssm}" set ${SERVICE_NAME} Description "Bloom Nucleus Native Messaging Host"`, { stdio: 'ignore' });
    execSync(`"${nssm}" set ${SERVICE_NAME} Start SERVICE_AUTO_START`, { stdio: 'ignore' });
    execSync(`"${nssm}" set ${SERVICE_NAME} AppDirectory "${paths.nativeDir}"`, { stdio: 'ignore' });
    execSync(`"${nssm}" set ${SERVICE_NAME} AppExit Default Restart`, { stdio: 'ignore' });
  } catch {}

  console.log(`   🚀 Iniciando servicio: ${SERVICE_NAME}`);
  try {
    execSync(`"${nssm}" start ${SERVICE_NAME}`, { stdio: 'pipe' });
    console.log("   ✅ Servicio de Windows instalado e iniciado con NSSM");
  } catch (startError) {
    console.warn("   ⚠️  Servicio instalado pero no pudo iniciarse");
    console.warn("   📋 Error:", startError.message);
    
    try {
      execSync(`sc start ${SERVICE_NAME}`, { stdio: 'inherit' });
      console.log("   ✅ Servicio iniciado con sc");
    } catch {
      console.warn("   ⚠️  El servicio se iniciará automáticamente en el próximo reinicio");
    }
  }
}

async function installWindowsServiceDirect() {
  const binary = paths.hostBinary;

  console.log("🔧 Configurando servicio de Windows (modo directo)...");

  const binPath = `"${binary}" --server --port=${DEFAULT_PORT}`;

  console.log(`   ➕ Creando servicio: ${SERVICE_NAME}`);
  execSync(
    `sc create ${SERVICE_NAME} binPath= "${binPath}" start= auto DisplayName= "Bloom Nucleus Host"`,
    { stdio: 'inherit' }
  );

  console.log(`   🔧 Configurando recuperación automática`);
  execSync(
    `sc failure ${SERVICE_NAME} reset= 86400 actions= restart/60000`,
    { stdio: 'inherit' }
  );

  console.log(`   🚀 Iniciando servicio: ${SERVICE_NAME}`);
  try {
    execSync(`sc start ${SERVICE_NAME}`, { stdio: 'pipe' });
    console.log("   ✅ Servicio iniciado");
  } catch (startError) {
    console.warn("   ⚠️  Error 1053: El binario no responde como servicio Windows");
    console.warn("   💡 Solución: El servicio requiere NSSM o ser compilado como servicio");
    console.warn("   ℹ️  El servicio se iniciará automáticamente en el próximo reinicio");
  }
}

async function installNativeHost() {
  console.log("📦 Instalando Host Nativo...");
  if (!fs.existsSync(paths.nativeSource)) {
    throw new Error("Native Source no encontrado en: " + paths.nativeSource);
  }
  
  const hostExe = path.join(paths.nativeSource, 'bloom-host.exe');
  if (!fs.existsSync(hostExe)) {
    throw new Error(`bloom-host.exe no encontrado en: ${paths.nativeSource}`);
  }
  
  await fs.copy(paths.nativeSource, paths.nativeDir, { overwrite: true });
  console.log("   ✅ Archivos copiados");
  
  if (fs.existsSync(paths.nssmSource)) {
    const nssmExe = path.join(paths.nssmSource, 'nssm.exe');
    if (fs.existsSync(nssmExe)) {
      await fs.copy(nssmExe, paths.nssmExe, { overwrite: true });
      console.log("   ✅ NSSM copiado");
    }
  }
  
  if (process.platform === 'win32') {
    await installWindowsService();
  } else {
    await startNativeHost();
  }
}

async function startNativeHost() {
  console.log("🚀 Iniciando Native Host...");
  
  const hostExe = paths.hostBinary;
  
  if (!fs.existsSync(hostExe)) {
    throw new Error(`Host binary no encontrado: ${hostExe}`);
  }
  
  const hostProcess = spawn(hostExe, [], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  });
  
  hostProcess.unref();
  
  console.log(`   ✅ Host iniciado (PID: ${hostProcess.pid})`);
  
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

async function initializeBrainProfile() {
  console.log("🧠 Inicializando Perfil Maestro...");
  
  const python = paths.pythonExe;
  const brainPath = paths.brainSource;
  
  const pthFile = path.join(paths.runtimeDir, 'python310._pth');
  const pthContent = [
    '.',
    'python310.zip',
    path.dirname(brainPath),
    path.join(brainPath, 'libs'),
    'import site'
  ].join('\n');
  
  await fs.writeFile(pthFile, pthContent, 'utf8');
  console.log("   ✅ python310._pth:", pthContent.split('\n').join(', '));
  
  const command = `"${python}" -m brain --json profile create "Master Worker"`;

  try {
    const { stdout } = await execPromise(command, { 
      timeout: 15000,
      cwd: paths.runtimeDir
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
// 4. LANZAMIENTO
// ============================================================================

ipcMain.handle('brain:launch', async () => {
  try {
    const config = await fs.readJson(paths.configFile);
    const profileId = config.masterProfileId;
    if (!profileId) throw new Error("No hay perfil maestro");
    
    const cmd = `"${paths.pythonExe}" -m brain --json profile launch "${profileId}" --url "https://chatgpt.com"`;
    
    console.log("🚀 EJECUTANDO:", cmd);
    
    const output = execSync(cmd, { 
      cwd: paths.runtimeDir,
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
// 5. HEARTBEAT
// ============================================================================

ipcMain.handle('extension:heartbeat', async () => {
  try {
    const net = require('net');
    
    return new Promise((resolve) => {
      const client = new net.Socket();
      
      client.setTimeout(2000);
      
      client.connect(DEFAULT_PORT, '127.0.0.1', () => {
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
// 6. HANDLERS DE SISTEMA
// ============================================================================

ipcMain.handle('system:info', async () => {  
  return {
    platform: process.platform,
    isDevMode: !app.isPackaged,
    isPackaged: app.isPackaged,
    paths: {
      hostInstallDir: paths.nativeDir,
      configDir: paths.configDir,
      brainDir: paths.brainSource,
      extensionDir: paths.extensionDir
    }
  };
});

ipcMain.handle('preflight-checks', async () => {
  return {
    hasAdmin: await isElevated(),
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
// 7. BOILERPLATE ELECTRON
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

