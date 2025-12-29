const fs = require('fs-extra');
const { paths } = require('../config/paths');
const { isElevated, relaunchAsAdmin } = require('../core/admin-utils');
const { installCore, initializeBrainProfile } = require('./core-installer');
const { installNativeHost } = require('./native-host-installer');
const { installExtension, configureBridge } = require('./extension-installer');
const { createLauncherShortcuts } = require('./launcher-creator');
const { BrowserWindow } = require('electron');

// LÍNEA 25: AGREGAR función helper
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

// LÍNEA 50: AGREGAR map de pasos
const INSTALLATION_STEPS = [
  { key: 'cleanup', percentage: 0, message: '🧹 Limpiando instalación anterior...' },
  { key: 'directories', percentage: 10, message: '📁 Creando estructura de directorios...' },
  { key: 'core', percentage: 25, message: '🧠 Instalando motor Brain + Python runtime...' },
  { key: 'native', percentage: 50, message: '🔧 Configurando Native Host como servicio...' },
  { key: 'extension', percentage: 65, message: '🧩 Desplegando extensión Chrome...' },
  { key: 'bridge', percentage: 75, message: '🔗 Registrando Native Messaging Bridge...' },
  { key: 'profile', percentage: 85, message: '👤 Creando perfil Master Worker...' },
  { key: 'launcher', percentage: 95, message: '🚀 Generando launcher y accesos directos...' },
  { key: 'complete', percentage: 100, message: '✅ ¡Instalación completada exitosamente!' }
];

/**
 * Crea la estructura de directorios necesaria
 */
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
  
  for (const d of dirs) {
    await fs.ensureDir(d);
  }
  
  console.log('✅ Directories created');
}

/**
 * Limpia procesos y archivos anteriores
 */
async function cleanupProcesses() {
  console.log('\n🧹 STARTING CLEANUP PROCESS');
  
  if (process.platform === 'win32') {
    const { removeService, killAllBloomProcesses } = require('./service-installer');
    const { SERVICE_NAME } = require('../config/constants');
    
    // PASO 1: Remover servicio (esto ya mata procesos internamente)
    console.log(`🛑 Stopping and removing service: ${SERVICE_NAME}`);
    await removeService(SERVICE_NAME);
    
    // PASO 2: Asegurar que no queden procesos huérfanos (doble verificación)
    console.log('🔍 Verifying no orphan processes remain...');
    await killAllBloomProcesses();
    
    // PASO 3: Esperar generosamente para file handles
    console.log('⏳ Waiting for file handles to be released...');
    await new Promise(r => setTimeout(r, 5000));
  }

  // PASO 4: Limpiar otros archivos (no native/)
  try {
    // Limpiar brain/ anterior del runtime
    if (await fs.pathExists(paths.brainDir)) {
      console.log("🧹 Removing old brain/ from runtime...");
      await fs.remove(paths.brainDir);
    }

    // Limpiar extensión anterior
    if (await fs.pathExists(paths.extensionDir)) {
      console.log("🧹 Cleaning extension directory...");
      await fs.emptyDir(paths.extensionDir);
    }
    
    console.log('✅ Non-native cleanup completed');
  } catch (cleanError) {
    console.warn('⚠️ Some files could not be cleaned:', cleanError.message);
    console.warn('💡 Continuing anyway...');
  }
}

/**
 * Limpia el directorio native/ (solo elimina, no copia)
 */
async function cleanNativeDir() {
  console.log('\n🧹 CLEANING NATIVE DIRECTORY');
  
  if (!await fs.pathExists(paths.nativeDir)) {
    console.log('ℹ️ Native directory does not exist, creating...');
    await fs.ensureDir(paths.nativeDir);
    return;
  }
  
  // PASO 1: Verificar que bloom-host.exe no esté corriendo
  if (process.platform === 'win32') {
    console.log('🔍 Verifying bloom-host.exe is not running...');
    try {
      const result = require('child_process').execSync(
        'tasklist /FI "IMAGENAME eq bloom-host.exe"', 
        { encoding: 'utf8' }
      );
      
      if (result.includes('bloom-host.exe')) {
        console.warn('⚠️ bloom-host.exe is still running! Attempting to kill...');
        const { killAllBloomProcesses } = require('./service-installer');
        await killAllBloomProcesses();
        await new Promise(r => setTimeout(r, 5000));
      } else {
        console.log('✅ No bloom-host.exe processes found');
      }
    } catch (e) {
      console.log('✅ No bloom-host.exe processes found');
    }
  }
  
  // PASO 2: Intentar eliminar todo el directorio native/
  try {
    console.log('🗑️ Removing old native directory...');
    await fs.remove(paths.nativeDir);
    console.log('✅ Old native directory removed');
  } catch (removeError) {
    console.warn('⚠️ Could not remove native directory:', removeError.message);
    
    // Si falla, intentar eliminar archivos individuales
    console.log('💡 Attempting to remove individual files...');
    try {
      const files = await fs.readdir(paths.nativeDir);
      let filesRemoved = 0;
      let filesFailed = 0;
      
      for (const file of files) {
        const filePath = require('path').join(paths.nativeDir, file);
        try {
          await fs.remove(filePath);
          filesRemoved++;
        } catch (fileError) {
          filesFailed++;
          console.warn(`  ⚠️ Could not remove ${file}:`, fileError.message);
        }
      }
      
      console.log(`  📊 Removed: ${filesRemoved}, Failed: ${filesFailed}`);
      
      if (filesFailed > 0) {
        console.warn(`⚠️ ${filesFailed} files could not be removed`);
        console.warn('💡 These files may still be locked by the system');
      }
    } catch (readError) {
      console.warn('⚠️ Could not read native directory:', readError.message);
    }
  }
  
  // PASO 3: Recrear directorio vacío
  await fs.ensureDir(paths.nativeDir);
  console.log('✅ Native directory ready');
  
  // PASO 4: Esperar generosamente para asegurar file handles liberados
  console.log('⏳ Waiting for file system to stabilize...');
  await new Promise(r => setTimeout(r, 4000));
}

/**
 * Ejecuta la instalación completa
 */
async function runFullInstallation(mainWindow = null) {
  // Verificar privilegios de administrador en Windows
  if (process.platform === 'win32' && !(await isElevated())) {
    console.log('⚠️ Admin privileges required for service installation.');
    console.log('🔄 Requesting elevation...');
    relaunchAsAdmin();
    return {
      success: false,
      relaunching: true,
      message: 'Relaunching with admin privileges...'
    };
  }

  console.log(`\n=== STARTING GOD MODE DEPLOYMENT (${process.platform}) ===\n`);

  try {
    // PASO 1: Limpieza agresiva de procesos (mata el servicio/proceso)
    emitProgress(mainWindow, 'cleanup', 'Deteniendo servicios anteriores');
    await cleanupProcesses();
    
    // PASO 2: Limpiar directorio native/ mientras los procesos están muertos
    emitProgress(mainWindow, 'cleanup', 'Limpiando directorio native');
    await cleanNativeDir();
    
    // PASO 3: Crear directorios base
    emitProgress(mainWindow, 'directories', 'Creando en %LOCALAPPDATA%');
    await createDirectories();
    
    // PASO 4: Instalar core
    emitProgress(mainWindow, 'core', 'Copiando 127 archivos...');
    await installCore();
    
    // PASO 5: Instalar Native Host (copia archivos y crea servicio)
    emitProgress(mainWindow, 'native', 'Configurando servicio');
    await installNativeHost();
    
    // PASO 8: Resto de instalación
    emitProgress(mainWindow, 'extension', 'Desplegando extensión');
    await installExtension();
    emitProgress(mainWindow, 'bridge', 'Registrando bridge');
    const extensionId = await configureBridge();
    emitProgress(mainWindow, 'profile', 'Creando perfil');
    const profileId = await initializeBrainProfile();
    
    emitProgress(mainWindow, 'launcher', 'Generando launcher');
    const launcherResult = await createLauncherShortcuts();

    emitProgress(mainWindow, 'complete');

    console.log('\n=== DEPLOYMENT COMPLETED SUCCESSFULLY ===\n');

    return {
      success: true,
      extensionId,
      profileId,
      launcherCreated: launcherResult.success,
      launcherPath: launcherResult.launcherPath
    };
  } catch (error) {
    console.error('\n❌ FATAL ERROR IN INSTALLATION:', error);
    console.error('Stack trace:', error.stack);
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  runFullInstallation,
  createDirectories,
  cleanupProcesses,
  cleanNativeDir
};