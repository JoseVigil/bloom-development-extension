// install/installer.js
// Integrated with Nucleus Manager - Atomic Milestones
// FIXED: Temporal initialization with correct PATH

const path = require('path');
const fs = require('fs-extra');
const { spawn } = require('child_process');
const { BrowserWindow } = require('electron');

const { paths } = require('../config/paths');
const { getLogger } = require('../../shared/logger');
const { nucleusManager } = require('./nucleus_manager');
const logger = getLogger('installer');

const {
  cleanupOldServices,
  installWindowsService,
  startService
} = require('./service-installer');

const { installRuntime } = require('./runtime-installer');
const { installChromium } = require('./chromium-installer');

const {
  deployAllBinaries,
  deployConductor,
  nucleusHealth,
  executeNucleusCommand,
  executeSentinelCommand,
  getNucleusExecutablePath
} = require('./installer_nucleus');

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
      paths.temporalDir  // ✅ Asegurar que temporal dir exista
    ];

    for (const dir of dirs) {
      await fs.ensureDir(dir);
      logger.success(`✔ ${path.basename(dir)}/`);
    }

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
    // ✅ PARAR Y REMOVER EL SERVICIO ANTES DE INSTALAR RUNTIME
    const { cleanupOldServices, removeService, NEW_SERVICE_NAME } = require('./service-installer');
    
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

async function runBinariesDeploy(win) {
  const MILESTONE = 'binaries';
  
  if (nucleusManager.isMilestoneCompleted(MILESTONE)) {
    logger.info(`⭐️ ${MILESTONE} completed, skipping`);
    return { success: true, skipped: true };
  }

  emitProgress(win, 4, 9, 'Deploying binaries (Nucleus, Sentinel, Brain, Alfred)...');

  try {
    const result = await deployAllBinaries(win);
    return result;

  } catch (error) {
    throw error;
  }
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

async function installBrainService(win) {
  const MILESTONE = 'brain_service_install';
  
  if (nucleusManager.isMilestoneCompleted(MILESTONE)) {
    logger.info(`⭐️ ${MILESTONE} completed, skipping`);
    return { success: true, skipped: true };
  }

  await nucleusManager.startMilestone(MILESTONE);
  emitProgress(win, 6, 10, 'Installing Brain Service...');

  try {
    logger.separator('INSTALLING BRAIN SERVICE');

    await cleanupOldServices();
    await installWindowsService();
    await startService();

    await nucleusManager.completeMilestone(MILESTONE, { service_running: true });
    return { success: true };

  } catch (error) {
    await nucleusManager.failMilestone(MILESTONE, error.message);
    throw error;
  }
}

// ============================================================================
// TEMPORAL INITIALIZATION - FIXED WITH CORRECT PATH
// ============================================================================

async function initOrchestration(win) {
  const MILESTONE = 'orchestration_init';
  
  if (nucleusManager.isMilestoneCompleted(MILESTONE)) {
    logger.info(`⭐️ ${MILESTONE} completed, skipping`);
    return { success: true, skipped: true };
  }

  await nucleusManager.startMilestone(MILESTONE);
  emitProgress(win, 7, 10, 'Initializing Temporal...');

  try {
    logger.separator('INITIALIZING TEMPORAL SERVER');

    const temporalExe = paths.temporalExe || path.join(paths.binDir, 'temporal', 'temporal.exe');
    const temporalDir = path.dirname(temporalExe);

    // ✅ CRITICAL: Verificar que temporal.exe existe
    if (!fs.existsSync(temporalExe)) {
      throw new Error(`Temporal executable not found at: ${temporalExe}`);
    }

    logger.info(`✓ Temporal.exe found at: ${temporalExe}`);

    // ✅ CRITICAL: Añadir temporal directory al PATH
    const currentPath = process.env.PATH || '';
    const newPath = `${temporalDir};${currentPath}`;
    
    logger.info('Executing: nucleus --json temporal ensure');
    logger.debug(`Temporal dir added to PATH: ${temporalDir}`);

    // ✅ USAR 'temporal ensure' - comando no bloqueante para automatización
    const result = await executeNucleusCommand(['--json', 'temporal', 'ensure']);

    // ✅ Verificar resultado según contrato de temporal ensure
    if (!result.success) {
      throw new Error(`Temporal ensure returned success=false: ${JSON.stringify(result)}`);
    }

    if (result.state !== 'RUNNING') {
      throw new Error(`Temporal not running after ensure: state=${result.state}`);
    }

    // Log diferenciado según si se inició o ya estaba corriendo
    if (result.started === false && result.reason === 'already_running') {
      logger.success('✔ Temporal already running (no action needed)');
    } else {
      logger.success('✔ Temporal started successfully');
    }
    
    logger.info(`  UI URL: ${result.ui_url || 'http://localhost:8233'}`);
    logger.info(`  gRPC URL: ${result.grpc_url || 'localhost:7233'}`);
    logger.info(`  State: ${result.state}`);

    await nucleusManager.completeMilestone(MILESTONE, result);
    return { success: true, temporal: result };

  } catch (error) {
    logger.error('Temporal initialization failed:', error.message);
    await nucleusManager.failMilestone(MILESTONE, error.message);
    throw error;
  }
}

async function initOllama(win) {
  const MILESTONE = 'ollama_init';
  
  if (nucleusManager.isMilestoneCompleted(MILESTONE)) {
    logger.info(`⭐️ ${MILESTONE} completed, skipping`);
    return { success: true, skipped: true };
  }

  await nucleusManager.startMilestone(MILESTONE);
  emitProgress(win, 8, 10, 'Initializing Ollama...');

  try {
    logger.separator('INITIALIZING OLLAMA');

    // ✅ PRIMERO: Iniciar el worker en BACKGROUND
    logger.info('Starting Nucleus worker in background...');
    const nucleusExe = getNucleusExecutablePath();
    
    const workerProcess = spawn(nucleusExe, ['worker', 'start', '--task-queue', 'nucleus-task-queue'], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true
    });
    
    workerProcess.unref(); // Permitir que continúe sin bloquear
    logger.success('✔ Worker process spawned (PID: ' + workerProcess.pid + ')');
    
    // Esperar 5 segundos a que el worker esté completamente listo
    await new Promise(resolve => setTimeout(resolve, 15000));

    // ✅ SEGUNDO: Ejecutar workflow (ahora con timeout de 10s)
    logger.info('Executing start-ollama workflow...');
    await executeNucleusCommand(['--json', 'synapse', 'start-ollama']);
    logger.success('✔ Ollama workflow ejecutado');

    // Wait 5 seconds for Ollama to boot
    await new Promise(resolve => setTimeout(resolve, 15000));

    // Check health via Sentinel
    const health = await executeSentinelCommand(['--json', 'ollama', 'healthcheck']);
    
    logger.success('✔ Ollama initialized');

    await nucleusManager.completeMilestone(MILESTONE, health);
    return { success: true };

  } catch (error) {
    await nucleusManager.failMilestone(MILESTONE, error.message);
    throw error;
  }
}

async function seedMasterProfile(win) {
  const MILESTONE = 'nucleus_seed';
  
  if (nucleusManager.isMilestoneCompleted(MILESTONE)) {
    logger.info(`⭐️ ${MILESTONE} completed, skipping`);
    return { success: true, skipped: true };
  }

  await nucleusManager.startMilestone(MILESTONE);
  emitProgress(win, 9, 10, 'Seeding Master Profile...');

  try {
    logger.separator('SEEDING MASTER PROFILE');

    // Usar Nucleus synapse launch con workflow de Temporal
    const result = await executeNucleusCommand([
      '--json',
      'synapse',
      'launch',
      '--register',
      '--role', 'master',
      '--save'
    ]);

    const profileId = result.profile_id || result.data?.uuid;

    if (!profileId) {
      throw new Error('Seed failed: no profile_id returned');
    }

    logger.success(`✔ Master profile: ${profileId}`);

    await nucleusManager.setMasterProfile(profileId);
    await nucleusManager.completeMilestone(MILESTONE, result);

    return { success: true, profile_id: profileId };

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
  emitProgress(win, 10, 10, 'Running certification...');

  try {
    logger.separator('CERTIFICATION - NUCLEUS HEALTH CHECK');

    const healthResult = await nucleusHealth();

    logger.success('✅ SYSTEM CERTIFIED');

    await nucleusManager.completeMilestone(MILESTONE, healthResult);
    return { success: true };

  } catch (error) {
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

    await createDirectories(win);
    await runChromiumInstall(win);
    await runRuntimeInstall(win);
    await runBinariesDeploy(win);
    await runConductorDeploy(win);
    await installBrainService(win);
    await initOrchestration(win);
    await initOllama(win);
    await seedMasterProfile(win);
    await runCertification(win);

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