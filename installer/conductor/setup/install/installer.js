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
} = require('./service-installer');

const { installRuntime } = require('./runtime-installer');
const { installChromium } = require('./chromium-installer');

const {
  deployAllBinaries,
  deployConductor,
  nucleusHealth,
  executeNucleusCommand,
  executeSentinelCommand,
  getNucleusExecutablePath,
  registerTelemetryStream
} = require('./installer_nucleus');

const { deployMetamorph } = require('./installer_metamorph');

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
  emitProgress(win, 1, 10, 'Creating directories...');

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
  emitProgress(win, 2, 10, 'Installing Chromium...');

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
  emitProgress(win, 3, 10, 'Installing Python Runtime...');

  try {
    // Remover servicio antes de instalar runtime (si existe)
    const { removeService } = require('./service-installer');
    
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

  emitProgress(win, 4, 10, 'Deploying binaries (Nucleus, Sentinel, Brain, Alfred)...');

  try {
    // CRÍTICO: Limpieza automática ANTES de copiar binarios
    // Esto previene errores EPERM con archivos bloqueados (nssm.exe, etc)
    await preInstallCleanup(logger);
    
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

  emitProgress(win, 5, 10, 'Deploying Conductor...');

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

  emitProgress(win, 6, 10, 'Deploying Metamorph...');

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
  emitProgress(win, 7, 10, 'Installing Brain Service...');

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
  emitProgress(win, 8, 10, 'Seeding Master Profile...');

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

async function installNucleusService(win) {
  const MILESTONE = 'nucleus_service_install';
  
  if (nucleusManager.isMilestoneCompleted(MILESTONE)) {
    logger.info(`⭐️ ${MILESTONE} completed, skipping`);
    return { success: true, skipped: true };
  }

  await nucleusManager.startMilestone(MILESTONE);
  emitProgress(win, 9, 10, 'Installing Nucleus Service...');

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
  emitProgress(win, 10, 10, 'Running certification...');

  try {
    logger.separator('CERTIFICATION - NUCLEUS HEALTH CHECK');
    logger.info('Waiting for Nucleus Service to complete component initialization...');
    logger.info('Service is booting: Temporal, Ollama, Worker, Control Plane');
    
    // Esperar 30 segundos para que service start complete el boot de componentes
    const bootWaitTime = 30;
    for (let i = 1; i <= bootWaitTime; i++) {
      if (i % 5 === 0) {
        logger.info(`  Waiting... ${i}/${bootWaitTime}s`);
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    logger.info('Running health check...');
    const healthResult = await nucleusHealth();

    // Nuevo formato: { success: boolean, state: string, components: {...} }
    if (!healthResult.success) {
      logger.warn('⚠️ Health check failed:');
      logger.warn(`  State: ${healthResult.state}`);
      logger.warn(`  Error: ${healthResult.error}`);
      
      // Log componentes unhealthy
      const components = healthResult.components || {};
      for (const [name, status] of Object.entries(components)) {
        if (!status.healthy) {
          logger.warn(`  ${name}: ${status.state} - ${status.error || 'N/A'}`);
        }
      }
      
      throw new Error(`Certification failed: ${healthResult.error}`);
    }

    // Verificar componentes críticos
    const critical = ['brain_service', 'temporal', 'worker_manager'];
    const unhealthy = critical.filter(c => !healthResult.components?.[c]?.healthy);
    
    if (unhealthy.length > 0) {
      throw new Error(`Critical components unhealthy: ${unhealthy.join(', ')}`);
    }

    logger.success('✅ SYSTEM CERTIFIED');
    logger.info('  Healthy components:');
    for (const [name, status] of Object.entries(healthResult.components || {})) {
      if (status.healthy) {
        logger.info(`    ✓ ${name}: ${status.state}`);
      }
    }

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
    await runMetamorphDeploy(win);
    await installBrainService(win);
    await seedMasterProfile(win);
    await installNucleusService(win);
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