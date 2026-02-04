// install/installer.js - INTEGRATION POINT
// Orquestador principal que delega a installer_nucleus.js

const { nucleusManager } = require('../core/nucleus_manager');
const { getLogger } = require('../src/logger');
const {
  deployAllBinaries,
  deployConductor,
  nucleusHealth,
  executeSentinelCommand
} = require('./installer_nucleus');

const {
  cleanupOldServices,
  installWindowsService,
  startService
} = require('./service-installer');

const { installRuntime } = require('./runtime-installer');
const { installChromium } = require('./chromium-installer');

const logger = getLogger('installer');

// ============================================================================
// MILESTONE EXECUTORS
// ============================================================================

async function createDirectories(win) {
  const MILESTONE = 'directories';
  
  if (nucleusManager.isMilestoneCompleted(MILESTONE)) {
    logger.info(`⏭️ Milestone ${MILESTONE} ya completado`);
    return { success: true, skipped: true };
  }

  await nucleusManager.startMilestone(MILESTONE);

  const { paths } = require('../config/paths');
  const fs = require('fs-extra');

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
      logger.success(`✓ ${dir}`);
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
    logger.info(`⏭️ Milestone ${MILESTONE} ya completado`);
    return { success: true, skipped: true };
  }

  await nucleusManager.startMilestone(MILESTONE);

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
    logger.info(`⏭️ Milestone ${MILESTONE} ya completado`);
    return { success: true, skipped: true };
  }

  await nucleusManager.startMilestone(MILESTONE);

  try {
    const result = await installRuntime(win);
    await nucleusManager.completeMilestone(MILESTONE, result);
    return result;

  } catch (error) {
    await nucleusManager.failMilestone(MILESTONE, error.message);
    throw error;
  }
}

async function installBrainService(win) {
  const MILESTONE = 'brain_service';
  
  if (nucleusManager.isMilestoneCompleted(MILESTONE)) {
    logger.info(`⏭️ Milestone ${MILESTONE} ya completado`);
    return { success: true, skipped: true };
  }

  await nucleusManager.startMilestone(MILESTONE);

  try {
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
    logger.info(`⏭️ Milestone ${MILESTONE} ya completado`);
    return { success: true, skipped: true };
  }

  await nucleusManager.startMilestone(MILESTONE);

  try {
    logger.separator('INITIALIZING OLLAMA');

    // Start Ollama via Sentinel
    const startResult = await executeSentinelCommand(['--json', 'ollama', 'start']);
    logger.success('✓ Ollama started');

    // Health check
    const healthResult = await executeSentinelCommand(['--json', 'ollama', 'healthcheck']);
    
    if (healthResult.status !== 'healthy') {
      throw new Error(`Ollama health check failed: ${healthResult.status}`);
    }

    logger.success('✓ Ollama healthy');

    await nucleusManager.completeMilestone(MILESTONE, healthResult);

    return { success: true };

  } catch (error) {
    await nucleusManager.failMilestone(MILESTONE, error.message);
    throw error;
  }
}

async function seedMasterProfile(win) {
  const MILESTONE = 'nucleus_seed';
  
  if (nucleusManager.isMilestoneCompleted(MILESTONE)) {
    logger.info(`⏭️ Milestone ${MILESTONE} ya completado`);
    return { success: true, skipped: true };
  }

  await nucleusManager.startMilestone(MILESTONE);

  try {
    logger.separator('SEEDING MASTER PROFILE');

    const result = await executeSentinelCommand(['--json', 'seed', 'MasterWorker', 'true']);

    if (!result.profile_id) {
      throw new Error('Seed failed: no profile_id returned');
    }

    logger.success(`✓ Master profile created: ${result.profile_id}`);

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
    logger.info(`⏭️ Milestone ${MILESTONE} ya completado`);
    return { success: true, skipped: true };
  }

  await nucleusManager.startMilestone(MILESTONE);

  try {
    logger.separator('CERTIFICATION - NUCLEUS HEALTH CHECK');

    const healthResult = await nucleusHealth();

    if (healthResult.status !== 'healthy' || !healthResult.all_services_ok) {
      throw new Error(`Certification failed: ${JSON.stringify(healthResult)}`);
    }

    logger.success('✅ SYSTEM CERTIFIED - All services healthy');

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
    // Initialize nucleus manager
    await nucleusManager.initialize();

    const summary = nucleusManager.getInstallationSummary();
    logger.info('Installation summary:', summary);

    // Execute milestones in order
    await createDirectories(win);
    await runChromiumInstall(win);
    await runRuntimeInstall(win);
    await deployAllBinaries(win);
    await deployConductor(win);
    await installBrainService(win);
    await initOllama(win);
    await seedMasterProfile(win);
    await runCertification(win);

    // Mark installation complete
    await nucleusManager.markInstallationComplete();

    logger.success('🎉 INSTALLATION COMPLETE');

    return { success: true };

  } catch (error) {
    logger.error('Installation failed:', error.message);
    throw error;
  }
}

module.exports = {
  installService
};