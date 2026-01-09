// installer.js - SECUENCIA CORREGIDA
// ============================================================================
// ORDEN SAGRADO DE INSTALACIÓN:
// 1. Copiar extensión (para detectar manifest.json)
// 2. Calcular Extension ID (desde la key del manifest)
// 3. Copiar binarios (brain.exe, bloom-host.exe)
// 4. Crear JSON del host (con el Extension ID correcto)
// 5. Registrar en Windows Registry (apuntando al JSON)
// 6. Crear perfil y configuración final
// ============================================================================

const path = require('path');
const fs = require('fs-extra');
const { paths } = require('../config/paths');
const { isElevated, relaunchAsAdmin } = require('../core/admin-utils');
const { BrowserWindow, app } = require('electron');
const { execFile } = require('child_process'); 
const crypto = require('crypto');
const os = require('os');

// Importadores
const { 
  cleanupOldServices, 
  installWindowsService, 
  startService, 
  killAllBloomProcesses 
} = require('./service-installer');
const { 
  installRuntime, 
  initializeBrainProfile 
} = require('./runtime-installer');
const { SERVICE_NAME } = require('../config/constants');
const { installExtension, calculateExtensionIdFromManifest } = require('./extension-installer');
const { setupNativeHostBridge } = require('./native-host-manifest');

const APP_VERSION = app ? app.getVersion() : process.env.npm_package_version || '1.0.0';

// ============================================================================
// HELPER: Calcular Extension ID desde Base64 Key
// ============================================================================
// NOTA: Esta función está deprecada - usar calculateExtensionIdFromManifest()
// Se mantiene solo por compatibilidad con código legacy
function calculateExtensionId(base64Key) {
  try {
    const buffer = Buffer.from(base64Key, 'base64');
    const hash = crypto.createHash('sha256').update(buffer).digest('hex');
    const head = hash.slice(0, 32);
    return head.split('').map(char => {
      const code = parseInt(char, 16);
      return String.fromCharCode(97 + code);
    }).join('');
  } catch (e) {
    console.error("❌ Error calculando ID:", e);
    throw e;
  }
}

// ============================================================================
// HELPER: Emitir progreso
// ============================================================================
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

// ============================================================================
// Mapa de pasos
// ============================================================================
const INSTALLATION_STEPS = [
  { key: 'cleanup', percentage: 0, message: '🧹 Limpiando instalación anterior...' },
  { key: 'directories', percentage: 10, message: '📁 Creando estructura de directorios...' },
  
  // ⚙️ EL MOTOR: Sin esto el Brain Service no arranca (Offline)
  { key: 'brain-runtime', percentage: 25, message: '⚙️ Instalando motor Brain (Python Runtime)...' },
  
  { key: 'extension', percentage: 40, message: '🧩 Desplegando extensión Chrome...' },
  { key: 'extension-id', percentage: 50, message: '🔑 Calculando Extension ID...' },
  
  // 🔧 LOS BINARIOS: El Service (brain.exe) y el Host (bloom-host.exe)
  { key: 'binaries', percentage: 65, message: '🔧 Copiando binarios (Brain Service + Host)...' },
  
  { key: 'bridge', percentage: 80, message: '🔗 Configurando Native Messaging Bridge...' },
  { key: 'profile', percentage: 90, message: '👤 Creando perfil Master Worker...' },
  { key: 'complete', percentage: 100, message: '✅ ¡Instalación completada exitosamente!' }
];

// ============================================================================
// STEP FUNCTIONS
// ============================================================================

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
 * PASO 1: Copiar extensión (estructura plana)
 * Delega al módulo extension-installer
 */
async function deployExtension() {
  console.log('\n🧩 DEPLOYING CHROME EXTENSION');
  return await installExtension();
}

/**
 * PASO 2: Calcular Extension ID desde el manifest
 * Delega al módulo extension-installer
 */
async function extractExtensionId() {
  console.log('\n🔑 CALCULATING EXTENSION ID');
  
  // Usar la función centralizada
  const extensionId = await calculateExtensionIdFromManifest(paths.extensionDir);
  console.log('🔑 Calculated Extension ID:', extensionId);
  
  return extensionId;
}

/**
 * PASO 3: Copiar binarios (brain.exe, bloom-host.exe, python runtime)
 */
async function deployBinaries() {
  console.log('\n🔧 DEPLOYING BINARIES');
  
  // Esta función debe copiar:
  // - brain.exe → paths.brainExe
  // - bloom-host.exe → paths.hostBinary
  // - Python runtime (si aplica)
  
  // TODO: Implementar la lógica de copia según tu estructura
  // Por ahora, asumimos que installNativeHost() lo hace
  const { installNativeHost } = require('./native-host-installer');
  await installNativeHost();
  
  console.log('✅ Binaries deployed');
}

/**
 * PASO 4: Crear el manifest JSON del Native Host (CON Extension ID)
 * Delega al módulo native-host-manifest
 */
async function createHostManifest(extensionId) {
  console.log('\n📝 CREATING NATIVE HOST MANIFEST');
  const result = await setupNativeHostBridge(extensionId);
  
  if (!result.success) {
    throw new Error('Failed to setup Native Host Bridge');
  }
  
  console.log('✅ Native Host Bridge configured successfully');
  console.log(`   Extension ID: ${result.extensionId}`);
  console.log(`   Manifest: ${result.manifestPath}`);
  console.log(`   Registry Key: ${result.registryKey}`);
}

/**
 * PASO 6: Crear perfil maestro usando brain.exe
 */
async function initializeMasterProfile() {
  console.log('\n👤 CREATING MASTER PROFILE');
  
  return new Promise((resolve, reject) => {
    const brainExe = paths.brainExe;
    
    if (!fs.existsSync(brainExe)) {
      return reject(new Error(`Brain executable not found at: ${brainExe}`));
    }

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
        if (!output) {
          return reject(new Error(`Failed to create profile: ${errOutput || error.message}`));
        }
      }

      try {
        const jsonStart = output.indexOf('{');
        if (jsonStart === -1) {
          throw new Error(`Output does not contain JSON: ${output}`);
        }
        
        const jsonStr = output.substring(jsonStart, output.lastIndexOf('}') + 1);
        const response = JSON.parse(jsonStr);
        
        const profileId = response.data?.id || response.id || response.data?.uuid;
        
        if (!profileId) {
          throw new Error('Profile ID missing in JSON response');
        }
        
        console.log(`✅ Master Profile Created: ${profileId}`);
        resolve(profileId);
        
      } catch (parseError) {
        console.error("Parse Error. Raw Output:", output);
        if (output.includes('MasterWorker') || output.includes('already exists')) {
          console.log("⚠️ Fallback: Usando alias como ID ante error de parseo.");
          return resolve("MasterWorker");
        }
        reject(new Error(`Failed to parse brain output: ${parseError.message}`));
      }
    });
  });
}

// ============================================================================
// INSTALACIÓN COMPLETA (SECUENCIA CORREGIDA)
// ============================================================================
async function runFullInstallation(mainWindow = null) {
  if (process.platform === 'win32' && !(await isElevated())) {
    console.log('⚠️ Admin privileges required.');
    relaunchAsAdmin();
    return { success: false, relaunching: true, message: 'Relaunching as Admin...' };
  }

  console.log(`\n=== STARTING BRAIN DEPLOYMENT (${process.platform}) ===\n`);

  try {
    // ========================================================================
    // PASO 0: LIMPIEZA AGRESIVA
    // ========================================================================
    emitProgress(mainWindow, 'cleanup', 'Deteniendo servicios y matando procesos');
    await cleanupOldServices(); // Usa tu lógica de limpieza atómica
    await cleanNativeDir();
    
    // ========================================================================
    // PASO 1: CREAR DIRECTORIOS
    // ========================================================================
    emitProgress(mainWindow, 'directories', 'Preparando carpetas en AppData');
    await createDirectories();

    // ========================================================================
    // PASO 2: INSTALAR RUNTIME (EL MOTOR) 🚀 <-- RECUPERADO
    // ========================================================================
    emitProgress(mainWindow, 'brain-runtime', 'Instalando motor Brain (Python Engine)');
    await installRuntime(); // Copia el engine/runtime y configura el .pth
    
    // ========================================================================
    // PASO 3: DESPLEGAR EXTENSIÓN E ID
    // ========================================================================
    emitProgress(mainWindow, 'extension', 'Desplegando extensión Chrome');
    await deployExtension();
    
    emitProgress(mainWindow, 'extension-id', 'Calculando ID de identidad');
    const extensionId = await extractExtensionId();
    console.log(`🔑 Extension ID: ${extensionId}`);
    
    // ========================================================================
    // PASO 4: BINARIOS Y SERVICIO (EL CEREBRO)
    // ========================================================================
    emitProgress(mainWindow, 'binaries', 'Instalando Brain Service y Host');
    await deployBinaries(); // Copia brain.exe y bloom-host.exe
    
    // Instalamos y arrancamos el servicio de Windows (Multiplexor)
    // Ahora sí funcionará porque el PASO 2 ya instaló el motor de Python
    await installWindowsService();
    const started = await startService();
    if (!started) throw new Error("No se pudo iniciar el multiplexor (Brain Service)");
    
    // ========================================================================
    // PASO 5: NATIVE MESSAGING BRIDGE
    // ========================================================================
    emitProgress(mainWindow, 'bridge', 'Registrando Native Messaging en Windows');
    await createHostManifest(extensionId); // Crea el JSON con la barra final y registra en HKLM/HKCU
    
    // ========================================================================
    // PASO 6: CREAR PERFIL MAESTRO
    // ========================================================================
    emitProgress(mainWindow, 'profile', 'Configurando perfil Master Worker');
    // Esto ejecuta "brain profile create" usando el servicio que ya está arriba
    const profileId = await initializeBrainProfile();
    console.log('✅ Master Profile ID:', profileId);
    
    // ========================================================================
    // PASO 7: GUARDAR CONFIGURACIÓN FINAL
    // ========================================================================
    console.log('💾 Saving final config...');
    const configPath = paths.configFile;
    const finalConfig = {
      extensionId: extensionId,
      profileId: profileId,
      masterProfileId: profileId,
      extensionPath: paths.extensionDir,
      brainPath: paths.brainExe,
      pythonPath: paths.pythonExe,
      pythonMode: 'isolated',
      version: APP_VERSION,
      installed_at: new Date().toISOString()
    };
    await fs.writeJson(configPath, finalConfig, { spaces: 2 });

    // ========================================================================
    // FINALIZACIÓN
    // ========================================================================
    emitProgress(mainWindow, 'complete', 'Instalación terminada exitosamente');
    
    const { createLauncherShortcuts } = require('./launcher-creator');
    const launcherResult = await createLauncherShortcuts();

    console.log('\n=== DEPLOYMENT COMPLETED SUCCESSFULLY ===\n');

    return {
      success: true,
      extensionId: extensionId,
      profileId: profileId,
      launcherCreated: launcherResult.success,
      version: APP_VERSION
    };

  } catch (error) {
    console.error('\n❌ FATAL ERROR IN INSTALLATION:', error);
    // Intentar limpiar si algo falló para no dejar servicios zombies
    await cleanupOldServices().catch(() => {});
    return { success: false, error: error.message };
  }
}

module.exports = {
  runFullInstallation,
  createDirectories,
  cleanupProcesses,
  cleanNativeDir
};