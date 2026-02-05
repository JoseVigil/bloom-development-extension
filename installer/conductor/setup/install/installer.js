// install/installer.js
// Integrated with Nucleus Manager - Atomic Milestones

const path = require('path');
const fs = require('fs-extra');
const { BrowserWindow } = require('electron');

const { paths } = require('../config/paths');
const { getLogger } = require('../src/logger');
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
  executeSentinelCommand
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
    logger.info(`⏭️ ${MILESTONE} completed, skipping`);
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
      paths.logsDir
    ];

    for (const dir of dirs) {
      await fs.ensureDir(dir);
      logger.success(`✓ ${path.basename(dir)}/`);
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
    logger.info(`⏭️ ${MILESTONE} completed, skipping`);
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
    logger.info(`⏭️ ${MILESTONE} completed, skipping`);
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
    logger.info(`⏭️ ${MILESTONE} completed, skipping`);
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
    logger.info(`⏭️ ${MILESTONE} completed, skipping`);
    return { success: true, skipped: true };
  }

  await nucleusManager.startMilestone(MILESTONE);
  emitProgress(win, 6, 9, 'Installing Brain Service...');

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

async function initOllama(win) {
  const MILESTONE = 'ollama_init';
  
  if (nucleusManager.isMilestoneCompleted(MILESTONE)) {
    logger.info(`⭐️ ${MILESTONE} completed, skipping`);
    return { success: true, skipped: true };
  }

  await nucleusManager.startMilestone(MILESTONE);
  emitProgress(win, 7, 9, 'Initializing Ollama...');

  try {
    logger.separator('INITIALIZING OLLAMA');

    // Start Ollama
    await executeSentinelCommand(['--json', 'ollama', 'start']);
    logger.success('✓ Ollama start command sent');

    // Wait 5 seconds for Ollama to boot
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Check health
    const health = await executeSentinelCommand(['--json', 'ollama', 'healthcheck']);
    
    logger.success('✓ Ollama initialized');

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
    logger.info(`⏭️ ${MILESTONE} completed, skipping`);
    return { success: true, skipped: true };
  }

  await nucleusManager.startMilestone(MILESTONE);
  emitProgress(win, 8, 9, 'Seeding Master Profile...');

  try {
    logger.separator('SEEDING MASTER PROFILE');

    const result = await executeSentinelCommand(['--json', 'seed', 'MasterWorker', 'true']);

    const profileId = result.data?.uuid || result.profile_id;

    if (!profileId) {
      throw new Error('Seed failed: no profile_id returned');
    }

    logger.success(`✓ Master profile: ${result.profile_id}`);

    await nucleusManager.setMasterProfile(result.profile_id);
    await nucleusManager.completeMilestone(MILESTONE, result);

    return { success: true, profile_id: result.profile_id };

  } catch (error) {
    await nucleusManager.failMilestone(MILESTONE, error.message);
    throw error;
  }
}

async function runCertification(win) {
  const MILESTONE = 'certification';
  
  if (nucleusManager.isMilestoneCompleted(MILESTONE)) {
    logger.info(`⏭️ ${MILESTONE} completed, skipping`);
    return { success: true, skipped: true };
  }

  await nucleusManager.startMilestone(MILESTONE);
  emitProgress(win, 9, 9, 'Running certification...');

  try {
    logger.separator('CERTIFICATION - NUCLEUS HEALTH CHECK');

    const healthResult = await nucleusHealth();

    if (healthResult.status !== 'healthy' || !healthResult.all_services_ok) {
      throw new Error(`Certification failed: ${JSON.stringify(healthResult)}`);
    }

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