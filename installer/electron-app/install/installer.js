const path = require('path');
const fs = require('fs-extra');
const { paths } = require('../config/paths');
const { isElevated, relaunchAsAdmin } = require('../core/admin-utils');
const { installCore, initializeBrainProfile } = require('./core-installer');
const { installNativeHost } = require('./native-host-installer');
const { installExtension, verifyExtension, configureBridge } = require('./extension-installer');
const { createLauncherShortcuts } = require('./launcher-creator');
const { BrowserWindow, app } = require('electron');

// ✅ FIX: Define APP_VERSION at the top of the file
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
    
    console.log(`🛑 Stopping and removing service: ${SERVICE_NAME}`);
    await removeService(SERVICE_NAME);
    
    console.log('🔍 Verifying no orphan processes remain...');
    await killAllBloomProcesses();
    
    console.log('⏳ Waiting for file handles to be released...');
    await new Promise(r => setTimeout(r, 5000));
  }

  try {
    if (await fs.pathExists(paths.brainDir)) {
      console.log("🧹 Removing old brain/ from runtime...");
      await fs.remove(paths.brainDir);
    }

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
 * Limpia el directorio native/
 */
async function cleanNativeDir() {
  console.log('\n🧹 CLEANING NATIVE DIRECTORY');
  
  if (!await fs.pathExists(paths.nativeDir)) {
    console.log('ℹ️ Native directory does not exist, creating...');
    await fs.ensureDir(paths.nativeDir);
    return;
  }
  
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
  
  try {
    console.log('🗑️ Removing old native directory...');
    await fs.remove(paths.nativeDir);
    console.log('✅ Old native directory removed');
  } catch (removeError) {
    console.warn('⚠️ Could not remove native directory:', removeError.message);
    
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
  
  await fs.ensureDir(paths.nativeDir);
  console.log('✅ Native directory ready');
  
  console.log('⏳ Waiting for file system to stabilize...');
  await new Promise(r => setTimeout(r, 4000));
}

/**
 * Ejecuta la instalación completa
 */
async function runFullInstallation(mainWindow = null) {
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
    // PASO 1: Limpieza
    emitProgress(mainWindow, 'cleanup', 'Deteniendo servicios anteriores');
    await cleanupProcesses();
    
    emitProgress(mainWindow, 'cleanup', 'Limpiando directorio native');
    await cleanNativeDir();
    
    // PASO 2: Crear directorios
    emitProgress(mainWindow, 'directories', 'Creando en %LOCALAPPDATA%');
    await createDirectories();
    
    // PASO 3: Instalar core
    emitProgress(mainWindow, 'core', 'Copiando 127 archivos...');
    await installCore();
    
    // PASO 4: Instalar Native Host
    emitProgress(mainWindow, 'native', 'Configurando servicio');
    await installNativeHost();
    
    // PASO 5: Instalar extensión
    emitProgress(mainWindow, 'extension', 'Desplegando extensión via Brain');
    const extResult = await installExtension();
    
    if (extResult && extResult.success === false) {
      throw new Error(extResult.error || 'Extension installation failed');
    }
    
    console.log('✅ Extension installation completed');
    
    // Verificar extensión
    try {
      const verifyResult = await verifyExtension();
      if (verifyResult && verifyResult.success === false) {
        console.warn('⚠️ Extension verification failed, but continuing...');
      }
    } catch (verifyError) {
      console.warn('⚠️ Could not verify extension:', verifyError.message);
    }
    
    // PASO 6: Configurar bridge y capturar Extension ID
    emitProgress(mainWindow, 'bridge', 'Registrando bridge');
    
    let extensionId = null;
    
    try {
      // ✅ configureBridge() retorna string directamente
      extensionId = await configureBridge();
      
      if (extensionId) {
        console.log(`✅ Extension ID captured: ${extensionId}`);
      } else {
        console.warn('⚠️ configureBridge() returned null or undefined');
      }
    } catch (bridgeError) {
      console.error('❌ Could not configure bridge:', bridgeError.message);
      throw bridgeError; // Stop installation if bridge fails
    }
    
    // ✅ PASO 7: GUARDAR CONFIG #1 (ANTES del perfil) - CRÍTICO
    console.log('📝 Saving initial config with extensionId...');
    
    const configPath = paths.configFile;
    await fs.ensureDir(path.dirname(configPath));
    
    const initialConfig = {
      extensionId: extensionId,
      extensionPath: paths.extensionDir,
      brainPath: paths.brainDir,
      pythonPath: paths.pythonExe,
      pythonMode: 'isolated',
      version: APP_VERSION,
      installed_at: new Date().toISOString()
    };
    
    await fs.writeJson(configPath, initialConfig, { spaces: 2 });
    console.log('✅ Initial config saved');
    console.log('   extensionId:', extensionId);
    console.log('   config path:', configPath);
    
    // PASO 8: Crear perfil (ahora nucleus.json YA TIENE extensionId)
    emitProgress(mainWindow, 'profile', 'Creando perfil');
    
    let profileId = null;
    try {
      profileId = await initializeBrainProfile();
      console.log('✅ Profile created:', profileId);
    } catch (profileError) {
      console.error('❌ Could not initialize profile:', profileError.message);
      throw profileError; // Stop if profile creation fails
    }
    
    // PASO 9: Crear launcher
    emitProgress(mainWindow, 'launcher', 'Generando launcher');
    const launcherResult = await createLauncherShortcuts();
    
    // ✅ PASO 10: ACTUALIZAR CONFIG #2 (agregar profileId)
    emitProgress(mainWindow, 'complete', 'Guardando configuración final');
    
    let finalConfig = await fs.readJson(configPath); // Leer el config existente
    
    // Agregar profileId
    finalConfig.masterProfileId = profileId;
    finalConfig.default_profile_id = profileId;
    finalConfig.profileId = profileId;
    
    await fs.writeJson(configPath, finalConfig, { spaces: 2 });
    console.log('✅ Final config saved');
    console.log('   profileId:', profileId);
    console.log('   extensionId still present:', finalConfig.extensionId);

    emitProgress(mainWindow, 'complete');

    console.log('\n=== DEPLOYMENT COMPLETED SUCCESSFULLY ===\n');
    console.log('📊 Summary:');
    console.log('   Extension ID:', extensionId);
    console.log('   Profile ID:', profileId);
    console.log('   Version:', APP_VERSION);

    return {
      success: true,
      extensionId,
      profileId,
      launcherCreated: launcherResult.success,
      launcherPath: launcherResult.launcherPath,
      version: APP_VERSION
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