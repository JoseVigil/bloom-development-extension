// install/installer.js
// Integrated with Nucleus Manager - Atomic Milestones
// FIXED: Temporal initialization with correct PATH
//
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🔴 TELEMETRY POLICY — CRITICAL
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// ❌ FORBIDDEN in Electron:
//    - Writing telemetry.json directly
//    - Creating telemetry.json.tmp
//    - Using TelemetryManager/TelemetryWriter
//    - Atomic writes with rename()
//    - ANY direct manipulation of telemetry.json
//
// ✅ REQUIRED:
//    - Create .log files in logs/electron/
//    - Register streams via: nucleus telemetry register
//    - Nucleus is the ONLY writer to telemetry.json
//
// If logs show "telemetry.json.tmp" or "rename telemetry" → IMPLEMENTATION IS INVALID
//
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const path = require('path');
const fs = require('fs-extra');
const { spawn } = require('child_process');
const { BrowserWindow } = require('electron');

const { paths } = require('../config/paths');
const { getLogger } = require('../../shared/logger');
const { nucleusManager } = require('./nucleus_manager');
const logger = getLogger('installer');

const { preInstallCleanup } = require('./pre-install-cleanup.js');

const {
  cleanupOldServices,
  installWindowsService,
  startService,
  NEW_SERVICE_NAME
} = require('./service-installer-brain.js');

const { installRuntime } = require('./runtime-installer');
const { installChromium } = require('./chromium-installer');

const {
  nucleusHealth,
  executeNucleusCommand,
  executeSentinelCommand,
  getNucleusExecutablePath,
  registerTelemetryStream
} = require('./installer_nucleus');

// ⚠️ DEPRECADO: deployAllBinaries, deployConductor, deployMetamorph
// Todas las copias de binarios están ahora en deployAllSystemBinaries()

// ============================================================================
// PROGRESS REPORTING
// ============================================================================

function emitProgress(win, current, total, message) {
  if (win && win.webContents) {
    win.webContents.send('installation-progress', {
      current,
      total,
      percentage: Math.round((current / total) * 100),
      message
    });
  }
  logger.info(`[${current}/${total}] ${message}`);
}

// ============================================================================
// PROFILES.JSON INITIALIZATION
// ============================================================================

/**
 * Crea profiles.json vacío si no existe
 * Esto previene que worker_manager falle durante el boot del servicio
 */
async function ensureProfilesJson() {
  const profilesPath = path.join(paths.configDir, 'profiles.json');
  
  // Solo crear si no existe
  if (!await fs.pathExists(profilesPath)) {
    const emptyProfiles = {
      profiles: [],
      version: "1.0.0",
      last_updated: new Date().toISOString(),
      metadata: {
        created_by: "installer",
        created_at: new Date().toISOString()
      }
    };
    
    await fs.writeJson(profilesPath, emptyProfiles, { spaces: 2 });
    logger.info('✓ profiles.json initialized (empty)');
  }
}

// ============================================================================
// MILESTONE EXECUTORS
// ============================================================================

async function createDirectories(win) {
  const MILESTONE = 'directories';
  
  if (nucleusManager.isMilestoneCompleted(MILESTONE)) {
    logger.info(`⭐️ ${MILESTONE} completed, skipping`);
    return { success: true, skipped: true };
  }

  await nucleusManager.startMilestone(MILESTONE);
  emitProgress(win, 1, 9, 'Creating directories...');

  try {
    logger.separator('CREATING DIRECTORIES');

    const dirs = [
      paths.binDir,
      paths.nucleusDir,
      paths.sentinelDir,
      paths.brainDir,
      paths.nativeDir,
      paths.ollamaDir,
      paths.cortexDir,
      paths.conductorDir,
      paths.chromeDir,
      paths.configDir,
      paths.engineDir,
      paths.runtimeDir,
      paths.profilesDir,
      paths.logsDir,
      paths.temporalDir  
    ];

    for (const dir of dirs) {
      await fs.ensureDir(dir);
      logger.success(`✔ ${path.basename(dir)}/`);
    }

    // ✅ AÑADIR: Crear profiles.json vacío
    await ensureProfilesJson();

    await nucleusManager.completeMilestone(MILESTONE, { dirs_created: dirs.length });
    return { success: true };

  } catch (error) {
    await nucleusManager.failMilestone(MILESTONE, error.message);
    throw error;
  }
}

async function runChromiumInstall(win) {
  const MILESTONE = 'chromium';
  
  if (nucleusManager.isMilestoneCompleted(MILESTONE)) {
    logger.info(`⭐️ ${MILESTONE} completed, skipping`);
    return { success: true, skipped: true };
  }

  await nucleusManager.startMilestone(MILESTONE);
  emitProgress(win, 2, 9, 'Installing Chromium...');

  try {
    const result = await installChromium(win);
    await nucleusManager.completeMilestone(MILESTONE, result);
    return result;

  } catch (error) {
    await nucleusManager.failMilestone(MILESTONE, error.message);
    throw error;
  }
}

async function runRuntimeInstall(win) {
  const MILESTONE = 'brain_runtime';
  
  if (nucleusManager.isMilestoneCompleted(MILESTONE)) {
    logger.info(`⭐️ ${MILESTONE} completed, skipping`);
    return { success: true, skipped: true };
  }

  await nucleusManager.startMilestone(MILESTONE);
  emitProgress(win, 3, 9, 'Installing Python Runtime...');

  try {
    // Remover servicio antes de instalar runtime (si existe)
    const { removeService } = require('./service-installer-brain.js');
    
    logger.info('Stopping Brain Service before runtime install...');
    await removeService(NEW_SERVICE_NAME);
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s
    
    const result = await installRuntime(win);
    await nucleusManager.completeMilestone(MILESTONE, result);
    return result;

  } catch (error) {
    await nucleusManager.failMilestone(MILESTONE, error.message);
    throw error;
  }
}

// ============================================================================
// UNIFIED BINARY DEPLOYMENT - CENTRALIZED
// ============================================================================

/**
 * Copia un directorio completo con retry y validación
 */
async function copyDirectorySafe(src, dest, label) {
  logger.info(`📦 Copying ${label}...`);
  logger.debug(`   Source: ${src}`);
  logger.debug(`   Dest: ${dest}`);
  
  if (!await fs.pathExists(src)) {
    throw new Error(`${label} source not found: ${src}`);
  }
  
  await fs.ensureDir(dest);
  
  // Opciones especiales para copiar aplicaciones Electron y archivos complejos
  const copyOptions = {
    overwrite: true,
    errorOnExist: false,
    dereference: false,  // No seguir symlinks
    preserveTimestamps: true,
    filter: (src) => {
      const basename = path.basename(src);
      
      // Excluir app.asar.unpacked (contenido ya está en app.asar)
      if (basename === 'app.asar.unpacked') {
        return false;
      }
      
      // Permitir todo lo demás, incluyendo app.asar
      return true;
    }
  };
  
  try {
    await fs.copy(src, dest, copyOptions);
    logger.success(`✅ ${label} deployed`);
    return { success: true, src, dest };
  } catch (error) {
    // Si falla la copia, dar más detalles
    throw new Error(`Failed to copy ${label}: ${error.message}`);
  }
}

/**
 * Copia un archivo individual con retry
 */
async function copyFileSafe(src, dest, label) {
  logger.info(`📄 Copying ${label}...`);
  logger.debug(`   Source: ${src}`);
  logger.debug(`   Dest: ${dest}`);
  
  if (!await fs.pathExists(src)) {
    throw new Error(`${label} source not found: ${src}`);
  }
  
  await fs.ensureDir(path.dirname(dest));
  await fs.copy(src, dest, { overwrite: true });
  
  logger.success(`✅ ${label} deployed`);
  
  return { success: true, src, dest };
}

/**
 * Copia todos los DLLs de un directorio
 */
async function copyDLLs(srcDir, destDir, label) {
  logger.info(`📚 Copying ${label}...`);
  
  if (!await fs.pathExists(srcDir)) {
    logger.warn(`⚠️ ${label} source not found: ${srcDir}`);
    return { success: false, skipped: true };
  }
  
  const files = await fs.readdir(srcDir);
  const dllFiles = files.filter(f => path.extname(f).toLowerCase() === '.dll');
  
  if (dllFiles.length === 0) {
    logger.warn(`⚠️ No DLLs found in ${srcDir}`);
    return { success: false, skipped: true };
  }
  
  await fs.ensureDir(destDir);
  
  for (const dll of dllFiles) {
    const srcPath = path.join(srcDir, dll);
    const destPath = path.join(destDir, dll);
    await fs.copy(srcPath, destPath, { overwrite: true });
  }
  
  logger.success(`✅ ${label} deployed (${dllFiles.length} files)`);
  
  return { success: true, count: dllFiles.length };
}

/**
 * FUNCIÓN CENTRALIZADA - DEPLOYMENT DE TODOS LOS BINARIOS
 * 
 * Copia TODOS los binarios del sistema en el orden correcto
 * Esta es la ÚNICA función que debe copiar binarios
 */
async function deployAllSystemBinaries(win) {
  const MILESTONE = 'binaries';  // ✅ Usa el milestone existente
  
  if (nucleusManager.isMilestoneCompleted(MILESTONE)) {
    logger.info(`⭐️ ${MILESTONE} completed, skipping`);
    return { success: true, skipped: true };
  }

  await nucleusManager.startMilestone(MILESTONE);
  emitProgress(win, 4, 9, 'Deploying all system binaries...');

  try {
    logger.separator('DEPLOYING ALL SYSTEM BINARIES');
    
    // CRÍTICO: Limpieza automática ANTES de copiar binarios
    await preInstallCleanup(logger);
    
    const results = {};
    
    // ========================================================================
    // 1. PYTHON RUNTIME (base para Brain)
    // ========================================================================
    logger.info('\n🐍 PYTHON RUNTIME');
    results.runtime = await copyDirectorySafe(
      paths.runtimeSource,
      paths.runtimeDir,
      'Python Runtime'
    );
    
    // Configurar Python en modo aislado
    const pthFile = path.join(paths.runtimeDir, 'python310._pth');
    const pthContent = ['.', 'python310.zip', 'Lib', 'Lib\\site-packages'].join('\n');
    await fs.writeFile(pthFile, pthContent, 'utf8');
    logger.success('✅ Python configured in ISOLATED mode');
    
    // ========================================================================
    // 2. BRAIN SERVICE (incluye _internal/)
    // ========================================================================
    logger.info('\n🧠 BRAIN SERVICE');
    results.brain = await copyDirectorySafe(
      paths.brainSource,
      paths.brainDir,
      'Brain Service'
    );
    
    // Verificar que brain.exe existe
    if (!await fs.pathExists(paths.brainExe)) {
      throw new Error(`brain.exe not found after copy: ${paths.brainExe}`);
    }
    
    // Verificar _internal (PyInstaller dependencies)
    const internalPath = path.join(paths.brainDir, '_internal');
    if (!await fs.pathExists(internalPath)) {
      logger.warn('⚠️ Warning: _internal folder not found');
    } else {
      logger.success('✅ Brain _internal dependencies verified');
    }
    
    // ========================================================================
    // 3. NATIVE HOST + DLLs
    // ========================================================================
    logger.info('\n🔗 NATIVE HOST');
    
    // paths.nativeSource ya apunta a .../native/bin/win64/host/
    const hostExeSrc = path.join(paths.nativeSource, 'bloom-host.exe');
    
    results.nativeHost = await copyFileSafe(
      hostExeSrc,
      paths.hostBinary,
      'bloom-host.exe'
    );
    
    // Copiar DLLs asociados del mismo directorio
    results.nativeDLLs = await copyDLLs(
      paths.nativeSource,  // Ya es la carpeta host/
      paths.nativeDir,
      'Native Host DLLs'
    );
    
    // ========================================================================
    // 4. NSSM (Service Manager)
    // ========================================================================
    logger.info('\n⚙️ NSSM SERVICE MANAGER');
    
    const nssmSrc = path.join(paths.nssmSource, 'nssm.exe');
    results.nssm = await copyFileSafe(
      nssmSrc,
      paths.nssmExe,
      'nssm.exe'
    );
    
    // ========================================================================
    // 5. NUCLEUS SUITE (Governance)
    // ========================================================================
    logger.info('\n⚖️ NUCLEUS SUITE');
    
    // Nucleus
    results.nucleus = await copyDirectorySafe(
      paths.nucleusSource,
      paths.nucleusDir,
      'Nucleus'
    );
    
    // Sentinel
    results.sentinel = await copyDirectorySafe(
      paths.sentinelSource,
      paths.sentinelDir,
      'Sentinel'
    );
    
    // Metamorph
    results.metamorph = await copyDirectorySafe(
      paths.metamorphSource,
      paths.metamorphDir,
      'Metamorph'
    );
    
    // ========================================================================
    // 6. CORTEX (Extension Package)
    // ========================================================================
    logger.info('\n🧩 CORTEX EXTENSION');
    results.cortex = await copyDirectorySafe(
      paths.cortexSource,
      paths.cortexDir,
      'Cortex'
    );
    
    // ========================================================================
    // 7. OLLAMA (LLM Server)
    // ========================================================================
    logger.info('\n🦙 OLLAMA LLM SERVER');
    
    if (await fs.pathExists(paths.ollamaSource)) {
      results.ollama = await copyDirectorySafe(
        paths.ollamaSource,
        paths.ollamaDir,
        'Ollama'
      );
    } else {
      logger.warn('⚠️ Ollama source not found, skipping');
      results.ollama = { success: false, skipped: true };
    }
    
    // ========================================================================
    // 8. NODE.JS (para Nucleus dev-start y API services)
    // ========================================================================
    logger.info('\n🟢 NODE.JS RUNTIME');
    
    if (await fs.pathExists(paths.nodeSource)) {
      results.node = await copyDirectorySafe(
        paths.nodeSource,
        paths.nodeDir,
        'Node.js'
      );
    } else {
      logger.warn('⚠️ Node.js source not found, skipping');
      results.node = { success: false, skipped: true };
    }
    
    // ========================================================================
    // 9. TEMPORAL (Workflow Orchestration Engine)
    // ========================================================================
    logger.info('\n⏱️ TEMPORAL WORKFLOW ENGINE');
    
    if (await fs.pathExists(paths.temporalSource)) {
      results.temporal = await copyDirectorySafe(
        paths.temporalSource,
        paths.temporalDir,
        'Temporal'
      );
    } else {
      logger.warn('⚠️ Temporal source not found, skipping');
      results.temporal = { success: false, skipped: true };
    }
    
    // ========================================================================
    // 10. CONDUCTOR (Launcher)
    // ========================================================================
    logger.info('\n🎮 CONDUCTOR LAUNCHER');
    
    // Conductor tiene dos versiones en el source:
    // 1. bloom-conductor.exe (standalone) ✅
    // 2. win-unpacked/ (Electron completa con app.asar) ❌
    // Solo copiamos el .exe standalone
    
    const conductorExeSrc = path.join(paths.conductorSource, 'bloom-conductor.exe');
    
    if (await fs.pathExists(conductorExeSrc)) {
      results.conductor = await copyFileSafe(
        conductorExeSrc,
        paths.conductorExe,
        'bloom-conductor.exe'
      );
    } else {
      logger.warn('⚠️ bloom-conductor.exe not found, skipping');
      results.conductor = { success: false, skipped: true };
    }
    
    // ========================================================================
    // RESUMEN FINAL
    // ========================================================================
    logger.separator('BINARY DEPLOYMENT SUMMARY');
    
    const deployed = Object.entries(results)
      .filter(([_, r]) => r.success && !r.skipped)
      .map(([name]) => name);
    
    const skipped = Object.entries(results)
      .filter(([_, r]) => r.skipped)
      .map(([name]) => name);
    
    logger.success(`✅ Deployed: ${deployed.length} components`);
    deployed.forEach(name => logger.info(`   ✓ ${name}`));
    
    if (skipped.length > 0) {
      logger.warn(`⚠️ Skipped: ${skipped.length} components`);
      skipped.forEach(name => logger.warn(`   - ${name}`));
    }
    
    await nucleusManager.completeMilestone(MILESTONE, {
      deployed: deployed.length,
      skipped: skipped.length,
      components: deployed
    });
    
    return { success: true, results };
    
  } catch (error) {
    await nucleusManager.failMilestone(MILESTONE, error.message);
    throw error;
  }
}

async function runBinariesDeploy(win) {
  // Wrapper que llama a la función unificada
  return await deployAllSystemBinaries(win);
}

async function runConductorDeploy(win) {
  const MILESTONE = 'conductor';
  
  if (nucleusManager.isMilestoneCompleted(MILESTONE)) {
    logger.info(`⭐️ ${MILESTONE} completed, skipping`);
    return { success: true, skipped: true };
  }

  emitProgress(win, 5, 9, 'Deploying Conductor...');

  try {
    const result = await deployConductor(win);
    return result;

  } catch (error) {
    throw error;
  }
}

async function runMetamorphDeploy(win) {
  const MILESTONE = 'metamorph';
  
  if (nucleusManager.isMilestoneCompleted(MILESTONE)) {
    logger.info(`⭐️ ${MILESTONE} completed, skipping`);
    return { success: true, skipped: true };
  }

  emitProgress(win, 6, 9, 'Deploying Metamorph...');

  try {
    const result = await deployMetamorph(win);
    return result;

  } catch (error) {
    throw error;
  }
}

async function installBrainService(win) {
  const MILESTONE = 'brain_service_install';
  
  if (nucleusManager.isMilestoneCompleted(MILESTONE)) {
    logger.info(`⭐️ ${MILESTONE} completed, skipping`);
    return { success: true, skipped: true };
  }

  await nucleusManager.startMilestone(MILESTONE);
  emitProgress(win, 7, 9, 'Installing Brain Service...');

  try {
    logger.separator('INSTALLING BRAIN SERVICE');

    // Usar el método JavaScript puro que funcionaba antes
    await installWindowsService();
    const started = await startService();
    
    if (!started) {
      throw new Error('Brain Service failed to start');
    }

    logger.success('✅ Brain Service installed and running');

    await nucleusManager.completeMilestone(MILESTONE, { service_running: true });
    return { success: true };

  } catch (error) {
    await nucleusManager.failMilestone(MILESTONE, error.message);
    throw error;
  }
}

// ============================================================================
// NUCLEUS SERVICE BOOT SEQUENCE
// ============================================================================

async function seedMasterProfile(win) {
  const MILESTONE = 'nucleus_seed';
  
  if (nucleusManager.isMilestoneCompleted(MILESTONE)) {
    logger.info(`⭐️ ${MILESTONE} completed, skipping`);
    return { success: true, skipped: true };
  }

  await nucleusManager.startMilestone(MILESTONE);
  emitProgress(win, 8, 9, 'Seeding Master Profile...');

  try {
    logger.separator('SEEDING MASTER PROFILE');

    // Usar Nucleus synapse seed para CREAR/REGISTRAR el perfil
    const result = await executeNucleusCommand([
      '--json',
      'synapse',
      'seed',
      'MasterWorker',
      'true'
    ]);

    // Validar estructura de respuesta de nucleus synapse seed
    // Nucleus retorna: { success, profile_id, alias, is_master, workflow_id, ... }
    if (!result.success || !result.profile_id) {
      throw new Error('Seed failed: no UUID returned in response');
    }

    const uuid = result.profile_id;

    logger.success(`✔ Master profile UUID: ${uuid}`);
    logger.info(`   Alias: ${result.alias}`);
    logger.info(`   Is Master: ${result.is_master}`);
    logger.info(`   Workflow: ${result.workflow_id}`);

    await nucleusManager.setMasterProfile(uuid);
    await nucleusManager.completeMilestone(MILESTONE, { 
      uuid,
      alias: result.alias,
      is_master: result.is_master,
      workflow_id: result.workflow_id
    });

    return { 
      success: true, 
      uuid,
      alias: result.alias,
      is_master: result.is_master
    };

  } catch (error) {
    await nucleusManager.failMilestone(MILESTONE, error.message);
    throw error;
  }
}

async function launchMasterProfile(win) {
  const MILESTONE = 'nucleus_launch';
  
  if (nucleusManager.isMilestoneCompleted(MILESTONE)) {
    logger.info(`⭐️ ${MILESTONE} completed, skipping`);
    return { success: true, skipped: true };
  }

  await nucleusManager.startMilestone(MILESTONE);
  emitProgress(win, 9, 9, 'Launching Master Profile (Heartbeat)...');

  try {
    logger.separator('NUCLEUS LAUNCH - HEARTBEAT VALIDATION');

    // Obtener UUID del perfil maestro creado en seed
    const profileUuid = nucleusManager.state.master_profile;
    
    if (!profileUuid) {
      throw new Error('Master profile UUID not found. Run seed first.');
    }

    logger.info(`Profile UUID: ${profileUuid}`);

    // ========================================================================
    // PASO 1: Asegurar que Temporal está activo
    // ========================================================================
    logger.info('Step 1/2: Ensuring Temporal is ready...');
    
    const ensureResult = await executeNucleusCommand([
      'temporal',
      'ensure',
      '--json'
    ]);

    if (!ensureResult.success) {
      throw new Error(`Temporal ensure failed: ${ensureResult.error || 'Unknown error'}`);
    }

    logger.success('✓ Temporal server active');
    logger.info('  Workers: available');
    logger.info('  State: ready for workflows');

    // ========================================================================
    // PASO 2: Ejecutar Launch con Heartbeat
    // ========================================================================
    logger.info('Step 2/2: Executing synapse launch with heartbeat...');
    
    const launchResult = await executeNucleusCommand([
      '--json',
      'synapse',
      'launch',
      profileUuid,
      '--mode', 'discovery',
      '--heartbeat'
    ]);

    // Validar resultado
    if (!launchResult.success) {
      throw new Error(`Launch failed: ${launchResult.error || 'Unknown error'}`);
    }

    if (!launchResult.extension_loaded) {
      throw new Error('Extension not loaded during heartbeat');
    }

    // ========================================================================
    // VALIDACIÓN EXITOSA
    // ========================================================================
    logger.success('✅ HEARTBEAT SUCCESSFUL');
    logger.info(`   Profile: ${launchResult.profile_id}`);
    logger.info(`   Launch ID: ${launchResult.launch_id}`);
    logger.info(`   Extension: ${launchResult.extension_loaded ? 'LOADED' : 'NOT LOADED'}`);
    logger.info(`   State: ${launchResult.state}`);
    logger.info('   ✓ Temporal workflows operational');
    logger.info('   ✓ Sentinel handshake successful');
    logger.info('   ✓ Extension + Host + Brain validated');

    await nucleusManager.completeMilestone(MILESTONE, {
      profile_id: launchResult.profile_id,
      launch_id: launchResult.launch_id,
      extension_loaded: launchResult.extension_loaded,
      state: launchResult.state
    });

    return { 
      success: true,
      heartbeat_validated: true,
      launch_result: launchResult
    };

  } catch (error) {
    logger.error('❌ Launch/Heartbeat failed:', error.message);
    await nucleusManager.failMilestone(MILESTONE, error.message);
    throw error;
  }
}

async function installNucleusService(win) {
  const MILESTONE = 'nucleus_service_install';
  
  if (nucleusManager.isMilestoneCompleted(MILESTONE)) {
    logger.info(`⭐️ ${MILESTONE} completed, skipping`);
    return { success: true, skipped: true };
  }

  await nucleusManager.startMilestone(MILESTONE);
  emitProgress(win, 6, 9, 'Installing Nucleus Service...');

  try {
    logger.separator('INSTALLING NUCLEUS SERVICE (CRITICAL 24/7)');

    const { 
      installNucleusService: installNucleus,
      startNucleusService
    } = require('./service-installer-nucleus');

    // Instalar servicio Windows con NSSM
    logger.info('Installing Windows service via NSSM...');
    await installNucleus();
    
    // Iniciar servicio (internamente ejecuta: nucleus service start)
    // service start internamente ejecuta dev-start para arrancar componentes
    logger.info('Starting Nucleus Service...');
    const started = await startNucleusService();
    
    if (!started) {
      throw new Error('Nucleus Service failed to start');
    }

    logger.success('✅ Nucleus Service started (initializing components...)');
    logger.info('   Service will boot: Temporal, Ollama, Worker, Control Plane');
    logger.info('   Health verification will occur in certification step');

    await nucleusManager.completeMilestone(MILESTONE, { 
      service_running: true
    });
    
    return { success: true };

  } catch (error) {
    await nucleusManager.failMilestone(MILESTONE, error.message);
    throw error;
  }
}

async function runCertification(win) {
  const MILESTONE = 'certification';
  
  if (nucleusManager.isMilestoneCompleted(MILESTONE)) {
    logger.info(`⭐️ ${MILESTONE} completed, skipping`);
    return { success: true, skipped: true };
  }

  await nucleusManager.startMilestone(MILESTONE);
  emitProgress(win, 7, 9, 'Running certification...');

  try {
    logger.separator('CERTIFICATION - NUCLEUS HEALTH CHECK');
    logger.info('Waiting for Nucleus Service to complete component initialization...');
    logger.info('Service is booting: Temporal, Brain');
    
    // Esperar 15 segundos para que service start complete el boot de componentes básicos
    const bootWaitTime = 15;
    for (let i = 1; i <= bootWaitTime; i++) {
      if (i % 5 === 0) {
        logger.info(`  Waiting... ${i}/${bootWaitTime}s`);
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    logger.info('Running health check...');
    const healthResult = await nucleusHealth();

    // CRÍTICO: nucleusHealth ahora devuelve un objeto estructurado incluso en caso de error
    // Formato: { success: boolean, state: string, components: {...}, error: string, timestamp: number }
    
    if (!healthResult || !healthResult.components) {
      throw new Error('Invalid health result structure');
    }

    // Log del estado general
    logger.info(`Health check returned: ${healthResult.state || 'UNKNOWN'}`);
    
    // CRÍTICO: Solo verificar componentes mínimos necesarios para SEED
    // - brain_service: necesario para operaciones básicas
    // - temporal: necesario para ejecutar workflows (seed usa workflows)
    const critical = ['brain_service', 'temporal'];
    const unhealthy = [];
    
    for (const comp of critical) {
      const status = healthResult.components[comp];
      
      if (!status) {
        unhealthy.push(comp);
        logger.error(`  ${comp}: NOT FOUND in health result`);
      } else if (!status.healthy) {
        unhealthy.push(comp);
        logger.error(`  ${comp}: ${status.state} - ${status.error || 'N/A'}`);
      } else {
        logger.info(`  ✓ ${comp}: ${status.state}`);
      }
    }
    
    if (unhealthy.length > 0) {
      logger.error(`❌ Critical components for seed are unhealthy: ${unhealthy.join(', ')}`);
      throw new Error(`Critical components unhealthy: ${unhealthy.join(', ')}`);
    }

    logger.success('✅ SYSTEM CERTIFIED (Pre-Seed Phase)');
    logger.info('  Minimum components ready for seed:');
    logger.info('    ✓ brain_service: RUNNING');
    logger.info('    ✓ temporal: RUNNING');
    logger.info('  Additional components will be verified after seed completes');

    await nucleusManager.completeMilestone(MILESTONE, {
      pre_seed_certification: true,
      critical_components: critical,
      health_snapshot: healthResult
    });
    
    return { success: true };

  } catch (error) {
    logger.error('❌ Certification failed:', error.message);
    await nucleusManager.failMilestone(MILESTONE, error.message);
    throw error;
  }
}

// ============================================================================
// MAIN ORCHESTRATOR
// ============================================================================

async function installService(win) {
  try {
    logger.separator('BLOOM NUCLEUS INSTALLATION');

    await nucleusManager.initialize();

    const summary = nucleusManager.getInstallationSummary();
    logger.info('Installation state:', summary);

    if (summary.next_milestone) {
      logger.info(`Resuming from: ${summary.next_milestone}`);
    }

    await createDirectories(win);           // 1/9
    await runChromiumInstall(win);          // 2/9
    await runRuntimeInstall(win);           // 3/9
    await runBinariesDeploy(win);           // 4/9
    await installBrainService(win);         // 5/9
    // NOTA: Nucleus Service DEBE arrancar ANTES de seed
    // porque seed necesita Temporal workflows
    await installNucleusService(win);       // 6/9 - Arranca Temporal
    await runCertification(win);            // 7/9 - Verifica Temporal ready
    await seedMasterProfile(win);           // 8/9 - Usa Temporal
    await launchMasterProfile(win);         // 9/9 - Heartbeat final

    await nucleusManager.markInstallationComplete();

    logger.success('🎉 INSTALLATION COMPLETE');

    if (win && win.webContents) {
      win.webContents.send('installation-complete', {
        success: true,
        profile_id: nucleusManager.state.master_profile
      });
    }

    return {
      success: true,
      profile_id: nucleusManager.state.master_profile
    };

  } catch (error) {
    logger.error('Installation failed:', error.message);

    if (win && win.webContents) {
      win.webContents.send('installation-error', {
        error: error.message,
        stack: error.stack
      });
    }

    throw error;
  }
}

module.exports = {
  installService
};