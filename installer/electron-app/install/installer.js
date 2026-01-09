// installer.js - SECUENCIA CORREGIDA Y FUNCIONAL
// ============================================================================
// ORDEN SAGRADO DE INSTALACIÓN (CORREGIDO):
// 1. Limpieza (servicios + procesos)
// 2. Crear directorios
// 3. Copiar extensión (para detectar manifest.json)
// 4. Calcular Extension ID (desde la key del manifest)
// 5. Instalar runtime (Python engine)
// 6. Copiar binarios (brain.exe, bloom-host.exe)
// 7. Crear JSON del host (con el Extension ID correcto)
// 8. Registrar en Windows Registry (HKLM - global)
// 9. Instalar y arrancar servicio
// 10. Crear perfil y configuración final
// ============================================================================

const path = require('path');
const fs = require('fs-extra');
const { paths } = require('../config/paths');
const { isElevated, relaunchAsAdmin } = require('../core/admin-utils');
const { BrowserWindow, app } = require('electron');
const { execFile, execSync } = require('child_process'); 
const crypto = require('crypto');

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

const APP_VERSION = app ? app.getVersion() : process.env.npm_package_version || '1.0.0';

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
  { key: 'extension', percentage: 25, message: '🧩 Desplegando extensión Chrome...' },
  { key: 'extension-id', percentage: 35, message: '🔑 Calculando Extension ID...' },
  { key: 'brain-runtime', percentage: 45, message: '⚙️ Instalando motor Brain (Python Runtime)...' },
  { key: 'binaries', percentage: 60, message: '🔧 Copiando binarios (Brain Service + Host)...' },
  { key: 'bridge', percentage: 75, message: '🔗 Configurando Native Messaging Bridge...' },
  { key: 'service', percentage: 85, message: '🚀 Instalando y arrancando servicio...' },
  { key: 'profile', percentage: 95, message: '👤 Creando perfil Master Worker...' },
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

async function cleanNativeDir() {
  console.log('\n🧹 CLEANING NATIVE DIRECTORY (preservando extensión)');
  try {
    if (await fs.pathExists(paths.nativeDir)) {
      // Solo limpiar archivos específicos, NO la carpeta completa
      const files = await fs.readdir(paths.nativeDir);
      for (const file of files) {
        const ext = path.extname(file).toLowerCase();
        if (['.exe', '.json', '.dll', '.log'].includes(ext)) {
          await fs.remove(path.join(paths.nativeDir, file));
        }
      }
    } else {
      await fs.ensureDir(paths.nativeDir);
    }
    console.log('✅ Native directory cleaned (extensión preservada)');
  } catch (e) {
    console.warn('⚠️ Could not clean native dir completely:', e.message);
  }
}

/**
 * PASO 1: Copiar extensión (estructura plana)
 */
async function deployExtension() {
  console.log('\n🧩 DEPLOYING CHROME EXTENSION');
  return await installExtension();
}

/**
 * PASO 2: Calcular Extension ID desde el manifest
 */
async function extractExtensionId() {
  console.log('\n🔑 CALCULATING EXTENSION ID');
  const extensionId = await calculateExtensionIdFromManifest(paths.extensionDir);
  console.log('🔑 Calculated Extension ID:', extensionId);
  return extensionId;
}

/**
 * PASO 3: Copiar binarios (brain.exe, bloom-host.exe)
 */
async function deployBinaries() {
  console.log('\n🔧 DEPLOYING BINARIES');
  const { installNativeHost } = require('./native-host-installer');
  await installNativeHost();
  console.log('✅ Binaries deployed');
}

/**
 * PASO 4: Crear el manifest JSON del Native Host + Registry HKLM
 */
async function createHostManifestInHKLM(extensionId) {
  console.log('\n📄 CREATING NATIVE HOST MANIFEST (HKLM)');
  
  // 1. Crear el JSON con el ID correcto
  const manifestContent = {
    name: "com.bloom.nucleus.bridge",
    description: "Bloom Nucleus Native Messaging Host",
    path: paths.hostBinary.replace(/\//g, '\\'),
    type: "stdio",
    allowed_origins: [
      `chrome-extension://${extensionId}/`
    ]
  };
  
  const manifestPath = path.join(paths.nativeDir, 'com.bloom.nucleus.bridge.json');
  
  // 2. Guardar JSON
  await fs.writeJson(manifestPath, manifestContent, { spaces: 2 });
  console.log('✅ Manifest JSON creado:', manifestPath);
  
  // 3. Registrar en HKLM (global para todos los usuarios)
  const { spawnSync } = require('child_process');
  const hostName = 'com.bloom.nucleus.bridge';
  const registryKey = `HKLM\\SOFTWARE\\Google\\Chrome\\NativeMessagingHosts\\${hostName}`;
  const manifestPathWindows = manifestPath.replace(/\//g, '\\');
  
  console.log('\n📝 REGISTRANDO EN HKLM (Global)');
  console.log(`   Clave: ${registryKey}`);
  console.log(`   Manifest: ${manifestPathWindows}`);
  console.log(`   Extension ID: ${extensionId}`);
  
  try {
    // Usar spawnSync para evitar problemas de escaping
    const result = spawnSync('reg', [
      'add', registryKey,
      '/ve', '/t', 'REG_SZ',
      '/d', manifestPathWindows,
      '/f'
    ], { 
      stdio: 'inherit', 
      windowsHide: true 
    });
    
    if (result.error) throw result.error;
    
    // Verificar que se escribió
    const verifyResult = spawnSync('reg', [
      'query', registryKey, '/ve'
    ], { 
      encoding: 'utf8',
      windowsHide: true 
    });
    
    const output = verifyResult.stdout || '';
    
    if (output.includes(manifestPathWindows)) {
      console.log('✅ Registry HKLM actualizada y verificada');
    } else {
      throw new Error('Verificación falló: Manifest no encontrado en HKLM');
    }
    
  } catch (error) {
    console.error('❌ Error escribiendo en Registry HKLM:', error.message);
    
    // Fallback: intentar con HKCU
    console.log('\n⚠️ Fallback: Intentando HKCU del usuario actual...');
    const hkcuKey = `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${hostName}`;
    
    try {
      const fallbackResult = spawnSync('reg', [
        'add', hkcuKey,
        '/ve', '/t', 'REG_SZ',
        '/d', manifestPathWindows,
        '/f'
      ], { 
        stdio: 'inherit', 
        windowsHide: true 
      });
      
      if (fallbackResult.error) throw fallbackResult.error;
      console.log('✅ Registry HKCU actualizada (fallback)');
    } catch (fallbackError) {
      throw new Error(`No se pudo escribir en Registry: ${fallbackError.message}`);
    }
  }
  
  return {
    success: true,
    extensionId,
    manifestPath: manifestPathWindows,
    registryKey
  };
}

/**
 * PASO 5: Crear perfil maestro usando brain.exe
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
        // 🚨 AJUSTE CRÍTICO: Aseguramos que el CLI use la misma ruta que el runtime-installer
        LOCALAPPDATA: process.env.LOCALAPPDATA, 
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
        // Mantenemos tu robusto fallback por si el perfil ya existe
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

  console.log(`\n=== STARTING BRAIN DEPLOYMENT (Secuencia Corregida) ===\n`);

  try {
    // ========================================================================
    // PASO 0: LIMPIEZA AGRESIVA (CORREGIDO)
    // ========================================================================
    emitProgress(mainWindow, 'cleanup', 'Deteniendo servicios y matando procesos');
    await cleanupOldServices();  // ✅ Función correcta
    await killAllBloomProcesses();  // ✅ Matar procesos huérfanos
    await cleanNativeDir();  // ✅ Limpiar native/ sin tocar extension/
    
    // ========================================================================
    // PASO 1: CREAR DIRECTORIOS
    // ========================================================================
    emitProgress(mainWindow, 'directories', 'Preparando carpetas en AppData');
    await createDirectories();

    // ========================================================================
    // PASO 2: DESPLEGAR EXTENSIÓN E ID (PRIMERO)
    // ========================================================================
    emitProgress(mainWindow, 'extension', 'Desplegando extensión Chrome');
    await deployExtension();
    
    emitProgress(mainWindow, 'extension-id', 'Calculando ID de identidad');
    const extensionId = await extractExtensionId();
    console.log(`🔑 Extension ID: ${extensionId}`);
    
    // ========================================================================
    // PASO 3: INSTALAR RUNTIME (EL MOTOR) 🚀
    // ========================================================================
    emitProgress(mainWindow, 'brain-runtime', 'Instalando motor Brain (Python Engine)');
    await installRuntime();
    
    // ========================================================================
    // PASO 4: BINARIOS (brain.exe + bloom-host.exe)
    // ========================================================================
    emitProgress(mainWindow, 'binaries', 'Instalando Brain Service y Host');
    await deployBinaries();
    
    // ========================================================================
    // PASO 5: NATIVE MESSAGING BRIDGE (CON Extension ID correcto)
    // ========================================================================
    emitProgress(mainWindow, 'bridge', 'Registrando Native Messaging en HKLM');
    await createHostManifestInHKLM(extensionId);
    
    // ========================================================================
    // PASO 6: SERVICIO (DESPUÉS del bridge)
    // ========================================================================
    emitProgress(mainWindow, 'service', 'Instalando y arrancando multiplexor');
    await installWindowsService();
    const started = await startService();
    if (!started) throw new Error("No se pudo iniciar el multiplexor (Brain Service)");
    
    // ========================================================================
    // PASO 7: CREAR PERFIL MAESTRO
    // ========================================================================
    emitProgress(mainWindow, 'profile', 'Configurando perfil Master Worker');
    const profileId = await initializeBrainProfile();
    console.log('✅ Master Profile ID:', profileId);
    
    // ========================================================================
    // PASO 8: GUARDAR CONFIGURACIÓN FINAL
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
    // Intentar limpiar si algo falló
    await cleanupOldServices().catch(() => {});
    return { success: false, error: error.message };
  }
}

module.exports = {
  runFullInstallation,
  createDirectories,
  cleanNativeDir
};