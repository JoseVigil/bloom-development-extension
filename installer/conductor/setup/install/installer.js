// install/installer.js
// Integrated with Nucleus Manager - Atomic Milestones
// FIXED: Temporal initialization with correct PATH
//
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🔴 TELEMETRY POLICY — CRITICAL
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
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
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const path = require('path');
const fs = require('fs-extra');
const { spawn } = require('child_process');
const { BrowserWindow } = require('electron');

const { paths } = require('../config/paths');
const { getLogger } = require('../../shared/logger');
const { nucleusManager } = require('./nucleus_manager');
const logger = getLogger('installer');

const { preInstallCleanup } = require('./pre-install-cleanup.js');

// ── Brain service installer — condicional por plataforma ──────────────────────
const {
  cleanupOldServices,
  installWindowsService,
  startService,
  removeService,
  NEW_SERVICE_NAME
} = process.platform === 'darwin'
  ? require('./service-installer-brain-darwin.js')
  : require('./service-installer-brain.js');

const { installRuntime } = require('./runtime-installer');
const { installChromium } = require('./chromium-installer');

// ── Sensor installer — condicional por plataforma ─────────────────────────────
const { installSensor } = process.platform === 'darwin'
  ? require('./service-installer-sensor-darwin.js')
  : require('./service-installer-sensor');

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
// STUBS — funciones pendientes de implementar
// TODO: mover a sus archivos correspondientes cuando estén listos
// ============================================================================

async function installVSCodeExtension(win) {
  // TODO: instalar bloom-extension.vsix en VS Code via CLI
  // `code --install-extension <path>/bloom-extension.vsix`
  logger.warn('⚠️ installVSCodeExtension: not yet implemented, skipping');
  return { success: true, skipped: true };
}

async function runMetamorphAudit(win) {
  // TODO: invocar metamorph snapshot + verify-sync
  // metamorph audit --snapshot --verify
  logger.warn('⚠️ runMetamorphAudit: not yet implemented, skipping');
  return { success: true, skipped: true };
}

async function installBrainService(win) {
  // TODO: registrar Brain como LaunchAgent (darwin) o NSSM service (win32)
  // En darwin: usar service-installer-brain-darwin.js → installWindowsService()
  logger.warn('⚠️ installBrainService: not yet implemented, skipping');
  return { success: true, skipped: true };
}

async function seedMasterProfile(win) {
  // TODO: verificar si seedMasterProfile existe en installer_nucleus.js y hacer el require ahí
  // Si existe: const { seedMasterProfile } = require('./installer_nucleus');
  // Si no: implementar seed via executeNucleusCommand('profile seed --master')
  logger.warn('⚠️ seedMasterProfile: not yet implemented, skipping');
  return { success: true, skipped: true };
}

async function launchMasterProfile(win) {
  // TODO: arrancar el perfil master después de seed
  // Probablemente: nucleus profile launch <master_profile_id>
  logger.warn('⚠️ launchMasterProfile: not yet implemented, skipping');
  return { success: true, skipped: true };
}

const SENSOR_EXE_NAME = process.platform === 'darwin' ? 'bloom-sensor' : 'bloom-sensor.exe';
const SETUP_EXE_NAME  = process.platform === 'darwin' ? 'bloom-setup'  : 'bloom-setup.exe';

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
  emitProgress(win, 1, 11, 'Creating system directories...');

  try {
    logger.separator('CREATING DIRECTORIES');

    const dirs = [
      paths.binDir,
      paths.nucleusDir,
      paths.sentinelDir,
      paths.brainDir,
      paths.hostDir,
      paths.ollamaDir,
      paths.cortexDir,
      paths.conductorDir,
      paths.chromeDir,
      paths.configDir,
      paths.engineDir,
      paths.runtimeDir,
      paths.profilesDir,
      paths.logsDir,
      paths.temporalDir,
      paths.vscodeDir,          // bin/vscode — bloom-extension.vsix
      paths.bootstrapDir,       // bin/bootstrap — bootstrap files
      paths.bootstrapStaticDir, // bin/bootstrap/static — static assets (logo.svg, etc.)
      path.join(paths.logsDir, 'conductor'),        // logs/conductor
      path.join(paths.logsDir, 'conductor', 'setup'), // logs/conductor/setup
      path.join(paths.logsDir, 'install'),           // logs/install
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
  emitProgress(win, 2, 11, 'Installing Chromium browser...');

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
  emitProgress(win, 3, 11, 'Configuring Python runtime...');

  try {
    // Remover servicio antes de instalar runtime (si existe)
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
  emitProgress(win, 4, 11, 'Deploying system binaries...');

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
    
    // Configurar Python — sólo en Windows necesita el .pth de modo aislado
    if (process.platform === 'win32') {
      const pthFile = path.join(paths.runtimeDir, 'python310._pth');
      const pthContent = ['.', 'python310.zip', 'Lib', 'Lib\\site-packages'].join('\n');
      await fs.writeFile(pthFile, pthContent, 'utf8');
      logger.success('✅ Python configured in ISOLATED mode');
    }
    
    // ========================================================================
    // 2. BRAIN SERVICE (incluye _internal/)
    // ========================================================================
    logger.info('\n🧠 BRAIN SERVICE');
    results.brain = await copyDirectorySafe(
      paths.brainSource,
      paths.brainDir,
      'Brain Service'
    );
    
    // Verificar que el binario de brain existe (sin extensión en macOS)
    if (!await fs.pathExists(paths.brainExe)) {
      throw new Error(`brain binary not found after copy: ${paths.brainExe}`);
    }

    // En macOS asegurar permisos de ejecución (PyInstaller a veces los pierde)
    if (process.platform === 'darwin') {
      await fs.chmod(paths.brainExe, 0o755);
      
      // Agregar Brain al PATH del sistema vía /etc/paths.d/
      const pathsFile = '/etc/paths.d/bloom-nucleus';
      try {
        await fs.ensureDir('/etc/paths.d');
        await fs.writeFile(pathsFile, paths.brainDir + '\n', 'utf8');
        logger.success('✅ Brain added to system PATH');
      } catch (err) {
        logger.warn(`⚠️ Could not write to ${pathsFile}: ${err.message}`);
      }
    }
    
    // Verificar _internal (PyInstaller dependencies)
    const internalPath = path.join(paths.brainDir, '_internal');
    if (!await fs.pathExists(internalPath)) {
      logger.warn('⚠️ Warning: _internal folder not found');
    } else {
      logger.success('✅ Brain _internal dependencies verified');
    }
    
    // ========================================================================
    // 3. NATIVE HOST + DLLs (solo Windows)
    // ========================================================================
    if (process.platform === 'win32') {
      logger.info('\n🔗 NATIVE HOST');
      
      const hostExeSrc = path.join(paths.hostSource, 'bloom-host.exe');
      
      results.nativeHost = await copyFileSafe(
        hostExeSrc,
        paths.hostBinary,
        'bloom-host.exe'
      );
      
      results.hostDLLs = await copyDLLs(
        paths.hostSource,
        paths.hostDir,
        'Host DLLs'
      );
    }
    
    // ========================================================================
    // 4. NSSM (solo Windows)
    // ========================================================================
    if (process.platform === 'win32') {
      logger.info('\n⚙️ NSSM SERVICE MANAGER');
      
      const nssmSrc = path.join(paths.nssmSource, 'nssm.exe');
      results.nssm = await copyFileSafe(
        nssmSrc,
        paths.nssmExe,
        'nssm.exe'
      );
    }
    
    // ========================================================================
    // 5. NUCLEUS SUITE (Governance)
    // ========================================================================
    logger.info('\n⚖️ NUCLEUS SUITE');
    
    results.nucleus = await copyDirectorySafe(
      paths.nucleusSource,
      paths.nucleusDir,
      'Nucleus'
    );
    
    results.sentinel = await copyDirectorySafe(
      paths.sentinelSource,
      paths.sentinelDir,
      'Sentinel'
    );
    
    results.metamorph = await copyDirectorySafe(
      paths.metamorphSource,
      paths.metamorphDir,
      'Metamorph'
    );

    // En macOS asegurar permisos en todos los binarios Go
    if (process.platform === 'darwin') {
      for (const bin of [paths.nucleusExe, paths.sentinelExe, paths.metamorphExe]) {
        if (await fs.pathExists(bin)) await fs.chmod(bin, 0o755);
      }
    }
    
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
    
    const nodeExeName  = process.platform === 'win32' ? 'node.exe' : 'node';
    const nodeExeSrc   = path.join(paths.nodeSource, nodeExeName);
    const nodeExeDest  = path.join(paths.nodeDir, nodeExeName);

    if (await fs.pathExists(nodeExeSrc)) {
      results.node = await copyFileSafe(nodeExeSrc, nodeExeDest, nodeExeName);
      if (process.platform === 'darwin') await fs.chmod(nodeExeDest, 0o755);
    } else {
      logger.warn('⚠️ node binary source not found, skipping');
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
    // 10. CONDUCTOR (Workspace)
    // ========================================================================
    logger.info('\n🎮 CONDUCTOR WORKSPACE');
    if (process.platform === 'darwin') {
      // En darwin: copiar el .app completo a /Applications/
      const appSrc = paths.conductorSource; // .../mac_x64/conductor/mac/ o mac-arm64/
      const appName = 'Bloom Nucleus Workspace.app';
      const appSrcPath = path.join(appSrc, appName);
      const appDest = path.join('/Applications', appName);
      if (await fs.pathExists(appSrcPath)) {
        logger.info(`📦 Installing ${appName} to /Applications/...`);
        logger.debug(`   Source: ${appSrcPath}`);
        logger.debug(`   Dest: ${appDest}`);
        // Remover versión anterior si existe
        if (await fs.pathExists(appDest)) {
          await fs.remove(appDest);
          logger.info('  Removed previous version');
        }
        await fs.copy(appSrcPath, appDest, { overwrite: true, dereference: false });
        await fs.chmod(path.join(appDest, 'Contents', 'MacOS', 'Bloom Nucleus Workspace'), 0o755);
        logger.success(`✅ Bloom Nucleus Workspace.app installed to /Applications/`);
        results.conductor = { success: true, dest: appDest };
      } else {
        logger.warn(`⚠️ Conductor .app not found at: ${appSrcPath}`);
        results.conductor = { success: false, skipped: true };
      }
    } else {
      // Windows — comportamiento original intacto
      const conductorExeName = 'bloom-conductor.exe';
      const conductorExeSrc  = path.join(paths.conductorSource, conductorExeName);
      if (await fs.pathExists(conductorExeSrc)) {
        results.conductor = await copyFileSafe(
          conductorExeSrc,
          paths.conductorExe,
          conductorExeName
        );
      } else {
        logger.warn('⚠️ bloom-conductor binary not found, skipping');
        results.conductor = { success: false, skipped: true };
      }
    }

    // ========================================================================
    // 11. BLOOM SENSOR (Session Agent)
    // ========================================================================
    logger.info('\n🌉 BLOOM SENSOR (SESSION AGENT)');

    const sensorExeSrc = path.join(paths.sensorSource, SENSOR_EXE_NAME);

    if (await fs.pathExists(sensorExeSrc)) {
      results.sensor = await copyFileSafe(
        sensorExeSrc,
        paths.sensorExe,
        SENSOR_EXE_NAME
      );
      if (process.platform === 'darwin') await fs.chmod(paths.sensorExe, 0o755);
    } else {
      logger.warn('⚠️ bloom-sensor binary not found, skipping');
      results.sensor = { success: false, skipped: true };
    }

    // ========================================================================
    // 12. SETUP (Installer / Self-update binary)
    // ========================================================================
    logger.info('\n🔧 SETUP INSTALLER');

    const setupExeSrc = path.join(paths.setupSource, SETUP_EXE_NAME);

    if (await fs.pathExists(setupExeSrc)) {
      results.setup = await copyFileSafe(
        setupExeSrc,
        paths.setupExe,
        SETUP_EXE_NAME
      );
      if (process.platform === 'darwin') await fs.chmod(paths.setupExe, 0o755);
    } else {
      logger.warn(`⚠️ ${SETUP_EXE_NAME} not found, skipping`);
      results.setup = { success: false, skipped: true };
    }

    // ========================================================================
    // 13. PYTHON HOOKS
    // ========================================================================
    logger.info('\n🪝 PYTHON HOOKS');

    if (await fs.pathExists(paths.hooksSource)) {
      if (await fs.pathExists(paths.hooksDir)) {
        await fs.remove(paths.hooksDir);
        logger.info('  Cleaned existing hooks directory');
      }
      await fs.ensureDir(paths.hooksDir);

      const entries = await fs.readdir(paths.hooksSource, { withFileTypes: true });
      const hookFolders = entries.filter(e => e.isDirectory());

      if (hookFolders.length === 0) {
        logger.warn('⚠️ No hook folders found in source, skipping');
        results.hooks = { success: false, skipped: true };
      } else {
        for (const folder of hookFolders) {
          const folderSrc  = path.join(paths.hooksSource, folder.name);
          const folderDest = path.join(paths.hooksDir, folder.name);
          await fs.copy(folderSrc, folderDest, { overwrite: true });
          logger.info(`  ✓ ${folder.name}`);
        }
        logger.success(`✅ Hooks deployed (${hookFolders.length} hooks)`);
        results.hooks = { success: true };
      }
    } else {
      logger.warn('⚠️ Hooks source not found, skipping');
      results.hooks = { success: false, skipped: true };
    }
    
    // ========================================================================
    // 14. VSCODE PLUGIN (bloom-extension.vsix → bin/vscode)
    // ========================================================================
    logger.info('\n🧩 VSCODE PLUGIN');

    const vsixSrc  = path.join(paths.vscodeSource, 'bloom-extension.vsix');
    const vsixDest = path.join(paths.vscodeDir,    'bloom-extension.vsix');

    if (await fs.pathExists(vsixSrc)) {
      results.vscode = await copyFileSafe(vsixSrc, vsixDest, 'bloom-extension.vsix');
    } else {
      logger.warn('⚠️ bloom-extension.vsix not found, skipping');
      results.vscode = { success: false, skipped: true };
    }

    await nucleusManager.completeMilestone(MILESTONE, results);
    return { success: true, results };

  } catch (error) {
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
  emitProgress(win, 7, 11, 'Installing Nucleus Service...');

  try {
    logger.separator('INSTALLING NUCLEUS SERVICE (CRITICAL 24/7)');

    // ── Nucleus installer — condicional por plataforma ─────────────────────
    const { 
      installNucleusService: installNucleus,
      startNucleusService
    } = process.platform === 'darwin'
      ? require('./service-installer-nucleus-darwin.js')
      : require('./service-installer-nucleus');

    logger.info('Installing service...');
    await installNucleus();
    
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
  emitProgress(win, 9, 11, 'Certifying system components...');

  try {
    logger.separator('CERTIFICATION - NUCLEUS HEALTH CHECK');
    logger.info('Waiting for Nucleus Service to complete component initialization...');
    logger.info('Service is booting: Temporal, Brain');
    
    const bootWaitTime = 15;
    for (let i = 1; i <= bootWaitTime; i++) {
      if (i % 5 === 0) {
        logger.info(`  Waiting... ${i}/${bootWaitTime}s`);
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    logger.info('Running health check...');
    const healthResult = await nucleusHealth();

    if (!healthResult || !healthResult.components) {
      throw new Error('Invalid health result structure');
    }

    logger.info(`Health check returned: ${healthResult.state || 'UNKNOWN'}`);
    
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
// SESSION SENSOR INSTALLER
// ============================================================================

async function installSessionSensor(win) {
  const MILESTONE = 'sensor_install';

  if (nucleusManager.isMilestoneCompleted(MILESTONE)) {
    logger.info(`⭐️ ${MILESTONE} completed, skipping`);
    return { success: true, skipped: true };
  }

  await nucleusManager.startMilestone(MILESTONE);
  emitProgress(win, 8, 11, 'Installing Session Agent...');

  try {
    const started = await installSensor();

    if (!started) {
      logger.warn('⚠️ bloom-sensor did not confirm RUNNING — may start on next user login');
    }

    await nucleusManager.completeMilestone(MILESTONE, { sensor_running: started });
    return { success: true };

  } catch (error) {
    logger.warn(`⚠️ Session sensor install warning: ${error.message}`);
    await nucleusManager.failMilestone(MILESTONE, error.message);
    return { success: false, non_critical: true };
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

    await createDirectories(win);           // 1/11
    await runChromiumInstall(win);          // 2/11
    await runRuntimeInstall(win);           // 3/11
    await deployAllSystemBinaries(win);      // 4/11 - Incluye bootstrap y vsix deploy
    await installVSCodeExtension(win);      // 4.5/11 - Instala/actualiza extensión en VS Code (non-critical)
    await runMetamorphAudit(win);           // 5/11 - Snapshot + verify-sync
    await installBrainService(win);         // 6/11
    // NOTA: Nucleus Service DEBE arrancar ANTES de seed
    // porque seed necesita Temporal workflows
    await installNucleusService(win);       // 7/11 - Arranca Temporal
    await installSessionSensor(win);        // 8/11 — non-critical, cannot abort
    await runCertification(win);            // 9/11 - Verifica Temporal ready
    await seedMasterProfile(win);           // 10/11 - Usa Temporal
    await launchMasterProfile(win);         // 11/11 - Heartbeat final

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
