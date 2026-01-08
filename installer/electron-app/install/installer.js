const path = require('path');
const fs = require('fs-extra');
const { paths } = require('../config/paths');
const { isElevated, relaunchAsAdmin } = require('../core/admin-utils');
const { BrowserWindow, app } = require('electron');
const { execFile } = require('child_process'); 

// Importadores (SIN core-installer)
const { installNativeHost } = require('./native-host-installer');
const { installExtension, verifyExtension, configureBridge } = require('./extension-installer');
const { createLauncherShortcuts } = require('./launcher-creator');
const { cleanupOldServices, killAllBloomProcesses } = require('./service-installer');
const { SERVICE_NAME } = require('../config/constants');

const APP_VERSION = app ? app.getVersion() : process.env.npm_package_version || '1.0.0';

// Función helper para emitir progreso
function emitProgress(mainWindow, stepKey, detail = '') {
  const step = INSTALLATION_STEPS.find(s => s.key === stepKey);
  if (!step) return;

  const stepIndex = INSTALLATION_STEPS.indexOf(step);
  const totalSteps = INSTALLATION_STEPS.length;

  mainWindow?.webContents.send('installation-progress', {
    step: stepIndex + 1,
    total: totalSteps,
    percentage: step.percentage,
    message: step.message,
    detail: detail || ''
  });

  console.log(`[${step.percentage}%] ${step.message}${detail ? ' - ' + detail : ''}`);
}

// Mapa de pasos de instalación
const INSTALLATION_STEPS = [
  { key: 'cleanup', percentage: 0, message: '🧹 Limpiando instalación anterior...' },
  { key: 'directories', percentage: 10, message: '📁 Creando estructura de directorios...' },
  { key: 'core', percentage: 25, message: '🧠 Verificando motor Brain...' },
  { key: 'native', percentage: 50, message: '🔧 Configurando servicios y binarios...' },
  { key: 'extension', percentage: 65, message: '🧩 Desplegando extensión Chrome...' },
  { key: 'bridge', percentage: 75, message: '🔗 Registrando Native Messaging Bridge...' },
  { key: 'profile', percentage: 85, message: '👤 Creando perfil Master Worker...' },
  { key: 'launcher', percentage: 95, message: '🚀 Generando launcher y accesos directos...' },
  { key: 'complete', percentage: 100, message: '✅ ¡Instalación completada exitosamente!' }
];

async function createDirectories() {
  const dirs = [
    paths.bloomBase,
    paths.engineDir,
    paths.runtimeDir,
    paths.nativeDir,
    paths.extensionDir,
    paths.configDir,
    paths.binDir,
    paths.logsDir
  ];
  for (const d of dirs) await fs.ensureDir(d);
  console.log('✅ Directories created');
}

async function cleanupProcesses() {
  console.log('\n🧹 STARTING CLEANUP PROCESS');
  if (process.platform === 'win32') {
    const { removeService, OLD_SERVICE_NAME } = require('./service-installer');
    
    console.log(`🛑 Stopping services...`);
    await removeService(SERVICE_NAME);
    if (OLD_SERVICE_NAME) await removeService(OLD_SERVICE_NAME);
    
    console.log('🔍 Verifying no orphan processes remain...');
    await killAllBloomProcesses();
    await new Promise(r => setTimeout(r, 2000));
  }
  
  try {
    if (await fs.pathExists(paths.brainDir)) await fs.remove(paths.brainDir);
    if (await fs.pathExists(paths.extensionDir)) await fs.emptyDir(paths.extensionDir);
    console.log('✅ Non-native cleanup completed');
  } catch (cleanError) {
    console.warn('⚠️ Cleanup warning:', cleanError.message);
  }
}

async function cleanNativeDir() {
  console.log('\n🧹 CLEANING NATIVE DIRECTORY');
  try {
    if (await fs.pathExists(paths.nativeDir)) {
      await fs.emptyDir(paths.nativeDir);
    } else {
      await fs.ensureDir(paths.nativeDir);
    }
    console.log('✅ Native directory cleaned');
  } catch (e) {
    console.warn('⚠️ Could not clean native dir completely (locked files?)');
  }
}

/**
 * Ejecuta la instalación completa
 */
async function runFullInstallation(mainWindow = null) {
  if (process.platform === 'win32' && !(await isElevated())) {
    console.log('⚠️ Admin privileges required.');
    relaunchAsAdmin();
    return { success: false, relaunching: true, message: 'Relaunching as Admin...' };
  }

  console.log(`\n=== STARTING GOD MODE DEPLOYMENT (${process.platform}) ===\n`);

  try {
    // PASO 1: Limpieza
    emitProgress(mainWindow, 'cleanup', 'Deteniendo servicios anteriores');
    await cleanupProcesses();
    emitProgress(mainWindow, 'cleanup', 'Limpiando directorios');
    await cleanNativeDir();
    
    // PASO 2: Directorios
    emitProgress(mainWindow, 'directories', 'Creando en %LOCALAPPDATA%');
    await createDirectories();
    
    // PASO 3: Core (Dummy Step)
    // Ya no instalamos Python/Core aquí, se hace junto con el Host en el siguiente paso.
    emitProgress(mainWindow, 'core', 'Preparando despliegue de binarios...');
    console.log('ℹ️ Core installation handled by binary deployment');
    
    // PASO 4: Instalar Binarios (Host + Brain) y Servicio
    emitProgress(mainWindow, 'native', 'Desplegando Brain Service y Host...');
    await installNativeHost();
    
    // PASO 5: Extensión
    emitProgress(mainWindow, 'extension', 'Desplegando extensión');
    const extResult = await installExtension();
    if (extResult && extResult.success === false) throw new Error(extResult.error);
    
    try { await verifyExtension(); } catch (e) { console.warn('⚠️ Verify warning:', e.message); }
    
    // PASO 6: Bridge
    emitProgress(mainWindow, 'bridge', 'Registrando bridge');
    let extensionId = await configureBridge();
    console.log(`✅ Extension ID captured: ${extensionId}`);
    
    // PASO 7: Config Inicial
    console.log('📝 Saving initial config...');
    const configPath = paths.configFile;
    const initialConfig = {
      extensionId: extensionId,
      extensionPath: paths.extensionDir,
      brainPath: paths.brainExe,
      pythonPath: paths.pythonExe,
      pythonMode: 'compiled',
      version: APP_VERSION,
      installed_at: new Date().toISOString()
    };
    await fs.writeJson(configPath, initialConfig, { spaces: 2 });
    
    // PASO 8: Crear Perfil
    emitProgress(mainWindow, 'profile', 'Creando perfil Master Worker...');
    let profileId = await initializeMasterProfile();
    console.log('✅ Profile created:', profileId);
    
    // PASO 9: Launcher
    emitProgress(mainWindow, 'launcher', 'Generando launcher');
    const launcherResult = await createLauncherShortcuts();
    
    // PASO 10: Config Final
    emitProgress(mainWindow, 'complete', 'Finalizando');
    let finalConfig = await fs.readJson(paths.configFile);
    finalConfig.masterProfileId = profileId;
    finalConfig.profileId = profileId;
    await fs.writeJson(paths.configFile, finalConfig, { spaces: 2 });

    emitProgress(mainWindow, 'complete');
    console.log('\n=== DEPLOYMENT COMPLETED SUCCESSFULLY ===\n');

    // CORRECCIÓN: Devolvemos claves redundantes para asegurar compatibilidad con la UI
    return {
      success: true,
      extensionId: extensionId,
      profileId: profileId,
      id: profileId,        
      uuid: profileId,      
      launcherCreated: launcherResult.success,
      version: APP_VERSION
    };

  } catch (error) {
    console.error('\n❌ FATAL ERROR IN INSTALLATION:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Crea el perfil inicial usando el ejecutable compilado (brain.exe)
 * Corregido: Flag global --json movido ANTES de la categoría
 */
async function initializeMasterProfile() {
  return new Promise((resolve, reject) => {
    const brainExe = paths.brainExe;
    
    if (!fs.existsSync(brainExe)) {
      return reject(new Error(`Brain executable not found at: ${brainExe}`));
    }

    // El flag GLOBAL --json debe ir antes de 'profile'
    const args = ['--json', 'profile', 'create', 'MasterWorker'];
    
    console.log(`Executing: "${brainExe}" ${args.join(' ')}`);

    execFile(brainExe, args, {
      cwd: path.dirname(brainExe),
      windowsHide: true,
      env: { 
        ...process.env, 
        BLOOM_EXTENSION_PATH: paths.extensionDir,
        PYTHONIOENCODING: 'utf-8'
      } 
    }, (error, stdout, stderr) => {
      
      const output = stdout.trim();
      const errOutput = stderr.trim();

      if (error) {
        console.error('Brain CLI Error Output:', errOutput);
        // Si hay error pero tenemos un stdout que parece JSON, intentamos seguir
        if (!output) {
          return reject(new Error(`Failed to create profile: ${errOutput || error.message}`));
        }
      }

      try {
        // Buscamos el JSON en la salida (a veces Typer imprime banners antes del JSON)
        const jsonStart = output.indexOf('{');
        if (jsonStart === -1) {
          throw new Error(`Output does not contain JSON: ${output}`);
        }
        
        const jsonStr = output.substring(jsonStart, output.lastIndexOf('}') + 1);
        const response = JSON.parse(jsonStr);
        
        // Extraemos el ID según la estructura de tu respuesta --json
        const profileId = response.data?.id || response.id || response.data?.uuid;
        
        if (!profileId) {
          throw new Error('Profile ID missing in JSON response');
        }
        
        console.log(`✅ Master Profile Created: ${profileId}`);
        resolve(profileId);
        
      } catch (parseError) {
        console.error("Parse Error. Raw Output:", output);
        // Fallback: Si falló el JSON pero el comando dice que existe o fue exitoso
        if (output.includes('MasterWorker') || output.includes('already exists')) {
          console.log("⚠️ Fallback: Usando alias como ID ante error de parseo.");
          return resolve("MasterWorker");
        }
        reject(new Error(`Failed to parse brain output: ${parseError.message}`));
      }
    });
  });
}

module.exports = {
  runFullInstallation,
  createDirectories,
  cleanupProcesses,
  cleanNativeDir
};